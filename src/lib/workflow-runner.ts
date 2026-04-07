/** Workflow runner — composition root: pre-flight, work items, runWorkflowActor(). */
import { createActor } from 'xstate';
import { readFileSync, existsSync } from 'node:fs';
import { warn, info } from './output.js';
import { getDriver } from './agents/drivers/factory.js';
import { checkCapabilityConflicts } from './agents/capability-check.js';
import type { ResolvedWorkflow } from './workflow-parser.js';
import { parse } from 'yaml';
import { readWorkflowState, writeWorkflowState } from './workflow-state.js';
import { saveSnapshot, loadSnapshot, snapshotFileExists, clearSnapshot, computeConfigHash, loadCheckpointLog, clearCheckpointLog, clearAllPersistence, cleanStaleTmpFiles } from './workflow-persistence.js';
import type { EngineConfig, RunMachineContext, EngineResult, EngineError, WorkItem, DriverHealth, GateConfig } from './workflow-types.js';
import { isTaskCompleted } from './workflow-compiler.js';
import { dispatchTaskCore, nullTaskCore } from './workflow-actors.js';
import { runMachine, type RunOutput } from './workflow-run-machine.js';
import { snapshotToPosition, visualize } from './workflow-visualizer.js';

/** Valid XState v5 actor status values present in persisted snapshots. */
const XSTATE_SNAPSHOT_STATUSES = new Set(['active', 'done', 'error', 'stopped']);

/**
 * Type-guard: accepts only well-formed XState v5 persisted snapshots.
 *
 * A real XState v5 persisted snapshot (from `actor.getPersistedSnapshot()`)
 * always has all three of: `status` (a known XState status string), `value`
 * (a non-null state value), and `context` (an object).  Requiring all three
 * rejects partial objects like `{ value: 'x' }` or `{ context: {} }` that
 * would cause createActor to throw or produce undefined behaviour.
 */
function isRestorableXStateSnapshot(snapshot: unknown): snapshot is Record<string, unknown> {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const candidate = snapshot as Record<string, unknown>;

  return (
    Object.hasOwn(candidate, 'status') &&
    typeof candidate.status === 'string' &&
    XSTATE_SNAPSHOT_STATUSES.has(candidate.status) &&
    Object.hasOwn(candidate, 'value') &&
    candidate.value !== null &&
    candidate.value !== undefined &&
    Object.hasOwn(candidate, 'context') &&
    candidate.context !== null &&
    typeof candidate.context === 'object'
  );
}

export function loadWorkItems(sprintStatusPath: string, issuesPath?: string): WorkItem[] {
  const items: WorkItem[] = [];
  if (existsSync(sprintStatusPath)) {
    let raw: string;
    try { raw = readFileSync(sprintStatusPath, 'utf-8'); }
    catch { // IGNORE: file read failure, warn and return empty list
      warn(`workflow-machine: could not read sprint-status.yaml at ${sprintStatusPath}`); return items;
    }
    let parsed: unknown;
    try { parsed = parse(raw); }
    catch { // IGNORE: YAML parse failure, warn and return empty list
      warn(`workflow-machine: invalid YAML in sprint-status.yaml at ${sprintStatusPath}`); return items;
    }
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const devStatus = data.development_status as Record<string, unknown> | undefined;
      if (devStatus && typeof devStatus === 'object') {
        for (const [key, status] of Object.entries(devStatus)) {
          if (key.startsWith('epic-')) continue;
          if (key.endsWith('-retrospective')) continue;
          if (status === 'backlog' || status === 'ready-for-dev' || status === 'in-progress')
            items.push({ key, source: 'sprint' });
        }
      }
    }
  }
  if (issuesPath && existsSync(issuesPath)) {
    let raw: string;
    try { raw = readFileSync(issuesPath, 'utf-8'); }
    catch { // IGNORE: file read failure, warn and return items collected so far
      warn(`workflow-machine: could not read issues.yaml at ${issuesPath}`); return items;
    }
    let parsed: unknown;
    try { parsed = parse(raw); }
    catch { // IGNORE: YAML parse failure, warn and return items collected so far
      warn(`workflow-machine: invalid YAML in issues.yaml at ${issuesPath}`); return items;
    }
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const issuesList = data.issues as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(issuesList)) {
        for (const issue of issuesList) {
          if (issue && typeof issue === 'object') {
            const status = issue.status as string | undefined;
            if (status === 'backlog' || status === 'ready-for-dev' || status === 'in-progress')
              items.push({ key: issue.id as string, title: issue.title as string | undefined, source: 'issues' });
          }
        }
      }
    }
  }
  return items;
}
export async function checkDriverHealth(workflow: ResolvedWorkflow, timeoutMs?: number): Promise<void> {
  const driverNames = new Set<string>(
    Object.values(workflow.tasks).filter(t => t.agent !== null).map(t => t.driver ?? 'claude-code'),
  );
  const drivers = new Map<string, ReturnType<typeof getDriver>>();
  for (const name of driverNames) drivers.set(name, getDriver(name));
  interface HealthResult { name: string; health: DriverHealth }
  const responded = new Set<string>();
  const healthChecks = Promise.all([...drivers.entries()].map(async ([name, driver]): Promise<HealthResult> => {
    const health = await driver.healthCheck();
    responded.add(name);
    return { name, health };
  }));
  const effectiveTimeout = timeoutMs ?? 5000;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), effectiveTimeout); });
  const result = await Promise.race([healthChecks, timeoutPromise]);
  if (result === 'timeout') {
    const pending = [...driverNames].filter((n) => !responded.has(n));
    throw new Error(`Driver health check timed out after ${effectiveTimeout}ms. Drivers: ${(pending.length > 0 ? pending : [...driverNames]).join(', ')}`);
  }
  clearTimeout(timer!);
  const failures = result.filter((r) => !r.health.available);
  if (failures.length > 0) throw new Error(`Driver health check failed: ${failures.map((f) => `${f.name}: ${f.health.error ?? 'unavailable'}`).join('; ')}`);
}
export async function runWorkflowActor(config: EngineConfig): Promise<EngineResult> {
  const startMs = Date.now();
  const projectDir = config.projectDir ?? process.cwd();
  cleanStaleTmpFiles(projectDir);
  let state = readWorkflowState(projectDir);
  if (state.phase === 'completed') {
    // Previous run completed — clear any stale persistence and no-op.
    clearAllPersistence(projectDir);
    return { success: true, tasksCompleted: 0, storiesProcessed: 0, errors: [], durationMs: 0 };
  }
  // Capture phase BEFORE overwriting — used later to emit resume-context log only
  // when we actually resume from a snapshot (not when we start fresh). Emitting
  // "Resuming from failed state" before the snapshot check can produce contradictory
  // messages when a config change or corrupt file forces a fresh start instead.
  const priorPhase = state.phase;
  state = { ...state, phase: 'executing', started: state.started || new Date().toISOString(), workflow_name: config.workflow.storyFlow.filter((s) => typeof s === 'string').join(' -> ') };
  writeWorkflowState(state, projectDir);
  try { await checkDriverHealth(config.workflow); } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    state = { ...state, phase: 'failed' };
    const errors: EngineError[] = [{ taskName: '__health_check__', storyKey: '__health_check__', code: 'HEALTH_CHECK', message }];
    writeWorkflowState(state, projectDir);
    return { success: false, tasksCompleted: 0, storiesProcessed: 0, errors, durationMs: Date.now() - startMs };
  }
  for (const cw of checkCapabilityConflicts(config.workflow)) warn(cw.message);
  const workItems = loadWorkItems(config.sprintStatusPath, config.issuesPath);
  const storyFlowTasks = new Set<string>();
  for (const step of config.workflow.storyFlow) {
    if (typeof step === 'string') storyFlowTasks.add(step);
    if (typeof step === 'object' && 'loop' in step)
      for (const lt of (step as { loop: string[] }).loop) storyFlowTasks.add(lt);
  }
  const epicGroups = new Map<string, WorkItem[]>();
  for (const item of workItems) {
    const epicId = item.key.match(/^(\d+)-/)?.[1] ?? 'unknown';
    if (!epicGroups.has(epicId)) epicGroups.set(epicId, []);
    epicGroups.get(epicId)!.push(item);
  }
  const configHash = computeConfigHash(config);
  // Check file existence BEFORE loadSnapshot so we can distinguish a missing
  // snapshot (no file — normal first run or post-success; YAML crash-recovery
  // still applies) from a corrupt one (file present but unreadable/invalid —
  // must reset tasks_completed and start fresh per AC #4).
  const hadSnapshotFile = snapshotFileExists(projectDir);
  const savedSnapshot = loadSnapshot(projectDir);
  let resumeSnapshot: unknown = null;
  const completedTasks = new Set<string>();
  if (savedSnapshot !== null) {
    if (savedSnapshot.configHash === configHash) {
      if (isRestorableXStateSnapshot(savedSnapshot.snapshot)) {
        info('workflow-runner: Resuming from snapshot — config hash matches');
        resumeSnapshot = savedSnapshot.snapshot;
      } else {
        warn('workflow-runner: Snapshot payload is invalid for restore — falling back to checkpoint log');
        try { clearSnapshot(projectDir); }
        catch { // IGNORE: best-effort cleanup — stale snapshot removal is non-critical
        }
        // Config hash matched so checkpoint entries are still valid — load them as
        // the durable fallback (AD3 safety net) rather than discarding them.
        const checkpoints = loadCheckpointLog(projectDir);
        if (checkpoints.length > 0) {
          info(`workflow-runner: Loaded ${checkpoints.length} checkpoint(s) for semantic skip-based resume (invalid snapshot payload)`);
          for (const entry of checkpoints) {
            completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
          }
        }
        // Synthesize tasks_completed from checkpoint log so the gate skip guard
        // (hasSuccessfulGateCompletionRecord in workflow-story-machine.ts) can fire.
        // Clearing to [] here would break the AND condition on gate checkpoint skip.
        const synthesized1 = checkpoints.map(e => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
        state = { ...state, tasks_completed: synthesized1, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
        writeWorkflowState(state, projectDir);
      }
    } else {
      // Config changed — XState snapshot is stale but the checkpoint log is config-agnostic.
      // Load checkpoints for semantic skip-based resume (story 26-3 AC2/3/5/8/11).
      const checkpoints = loadCheckpointLog(projectDir);
      warn(`workflow-runner: Snapshot config changed (saved: ${savedSnapshot.configHash.slice(0, 8)}, current: ${configHash.slice(0, 8)}) — using checkpoint log for resume`);
      try { clearSnapshot(projectDir); }
      catch { // IGNORE: best-effort cleanup — stale snapshot removal is non-critical
      }
      if (checkpoints.length > 0) {
        info(`workflow-runner: Loaded ${checkpoints.length} checkpoint(s) for semantic skip-based resume`);
        for (const entry of checkpoints) {
          completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
        }
      }
      // Synthesize tasks_completed from checkpoint log so the gate skip guard
      // (hasSuccessfulGateCompletionRecord in workflow-story-machine.ts) can fire.
      // Clearing to [] here would break the AND condition on gate checkpoint skip.
      const synthesized2 = checkpoints.map(e => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
      state = { ...state, tasks_completed: synthesized2, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
      writeWorkflowState(state, projectDir);
    }
  } else if (hadSnapshotFile) {
    // Snapshot file existed but loadSnapshot() returned null → corrupt or
    // unreadable file. Load checkpoint log as the durable fallback (AD3 safety
    // net). The checkpoint log is config-agnostic so its entries remain valid
    // even though we cannot read the snapshot's configHash.
    const orphanedEntries = loadCheckpointLog(projectDir);
    if (orphanedEntries.length > 0) {
      info(`workflow-runner: Loaded ${orphanedEntries.length} checkpoint(s) for semantic skip-based resume (corrupt snapshot)`);
      for (const entry of orphanedEntries) {
        completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
      }
    }
    const synthesized3 = orphanedEntries.map(e => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
    state = { ...state, tasks_completed: synthesized3, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
    writeWorkflowState(state, projectDir);
  } else {
    // No snapshot file — any leftover checkpoint log is orphaned stale state from a
    // prior run whose success cleanup only partially completed. Clear it so the next
    // run starts fresh instead of semantically skipping tasks from stale entries.
    const checkpoints = loadCheckpointLog(projectDir);
    if (checkpoints.length > 0) {
      warn(`workflow-runner: Clearing orphaned checkpoint log with ${checkpoints.length} checkpoint(s) because no snapshot file exists`);
      clearCheckpointLog(projectDir);
    }
  }
  // Emit resume-context log only when we actually have a valid snapshot to resume
  // from. Logging "Resuming from failed state" before the snapshot check produced
  // contradictory output when config change or corruption forced a fresh start.
  if (resumeSnapshot !== null && (priorPhase === 'error' || priorPhase === 'failed')) {
    const errorCount = state.tasks_completed.filter(t => t.error).length;
    if (!config.onEvent) info(`Resuming from ${priorPhase} state — ${errorCount} previous error(s)`);
  }
  const runInput: RunMachineContext = {
    config, storyFlowTasks,
    epicEntries: [...epicGroups.entries()],
    currentEpicIndex: 0,
    workflowState: state,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
    completedTasks,
  };
  const finalOutput = await new Promise<RunOutput>((resolve) => {
    let lastStateValue: unknown = null;
     
    const actorOptions: any = { input: runInput };
    if (resumeSnapshot !== null) actorOptions.snapshot = resumeSnapshot;
    actorOptions.inspect = (inspectionEvent: { type: string; snapshot?: unknown }) => {
        try {
          if (inspectionEvent.type !== '@xstate.snapshot') return;
          const snap = inspectionEvent.snapshot as Record<string, unknown> | undefined;
          const value = snap?.value;
          if (value === lastStateValue) return; // debounce: skip context-only changes
          lastStateValue = value;
          const position = snapshotToPosition(snap, config.workflow);
          const vizString = visualize(position);
          config.onEvent?.({ type: 'workflow-viz', taskName: '', storyKey: '', vizString, position });
        } catch { /* IGNORE: inspect callback must never crash the workflow runner */ }
    };
    const actor = createActor(runMachine, actorOptions);
    actor.subscribe({
      next: () => {
        // Save XState snapshot after every state transition (task completions,
        // interrupt, halt). Atomic write ensures no corrupt file on crash.
        try { saveSnapshot(actor.getPersistedSnapshot(), configHash, projectDir); }
        catch { // IGNORE: snapshot save is best-effort — a failed save must never crash the workflow runner
        }
      },
      complete: () => {
        try { saveSnapshot(actor.getPersistedSnapshot(), configHash, projectDir); }
        catch { // IGNORE: terminal snapshot save is best-effort — completion must still resolve
        }
        resolve(actor.getSnapshot().output!);
      },
    });
    actor.start();
  });
  state = finalOutput.workflowState;
  // On snapshot-resume the XState actor restores its context from the snapshot,
  // which was captured BEFORE any sprint-level work ran.  Sprint tasks write their
  // completions to disk via dispatchTaskCore/nullTaskCore as they finish, so we
  // recover those entries here to avoid replaying already-done sprint work after
  // an interrupt that occurred during the sprint loop.
  //
  // NOTE: We recover ALL disk tasks that are not already in the XState context —
  // not just __sprint__-keyed ones.  Sprint gate loop blocks execute tasks against
  // individual story work items and record them under those story keys (e.g.
  // "26-1-xstate-snapshot-persistence"), so a story_key === '__sprint__' filter
  // would silently miss those completions and replay the gate iterations on resume.
  if (resumeSnapshot !== null) {
    const diskState = readWorkflowState(projectDir);
    const existingKeys = new Set(
      state.tasks_completed.map((t) => `${t.story_key}::${t.task_name}`),
    );
    const sprintCompletions = diskState.tasks_completed.filter(
      (t) => !existingKeys.has(`${t.story_key}::${t.task_name}`),
    );
    if (sprintCompletions.length > 0) {
      info(`workflow-runner: Restored ${sprintCompletions.length} post-machine completion(s) from disk (resume after sprint-level interrupt)`);
      state = { ...state, tasks_completed: [...state.tasks_completed, ...sprintCompletions] };
    }
  }
  let { errors, tasksCompleted } = finalOutput;
  const { storiesProcessed } = finalOutput;

  // --- Sprint-level steps (run ONCE after all epics complete) ---
  if (config.workflow.sprintFlow.length > 0 && !finalOutput.halted && state.phase !== 'interrupted') {
    for (const step of config.workflow.sprintFlow) {
      if (config.abortSignal?.aborted) break;
      if (typeof step === 'string') {
        // Plain task (deploy, retro, etc.)
        const task = config.workflow.tasks[step];
        if (!task) { warn(`workflow-runner: sprint task "${step}" not found, skipping`); continue; }
        if (isTaskCompleted(state, step, '__sprint__')) continue;
        const definition = task.agent ? config.agents[task.agent] : undefined;
        if (task.agent && !definition) { warn(`workflow-runner: agent "${task.agent}" not found for sprint task "${step}", skipping`); continue; }
        try {
          const dr = task.agent === null
            ? await nullTaskCore({ task, taskName: step, storyKey: '__sprint__', config, workflowState: state, previousContract: finalOutput.lastContract, accumulatedCostUsd: finalOutput.accumulatedCostUsd })
            : await dispatchTaskCore({ task, taskName: step, storyKey: '__sprint__', definition: definition!, config, workflowState: state, previousContract: finalOutput.lastContract, accumulatedCostUsd: finalOutput.accumulatedCostUsd });
          state = dr.updatedState;
          tasksCompleted++;
        } catch (err: unknown) { // IGNORE: sprint task failure — record and continue
          const msg = err instanceof Error ? err.message : String(err);
          errors = [...errors, { taskName: step, storyKey: '__sprint__', code: 'SPRINT_TASK_ERROR', message: msg }];
          warn(`workflow-runner: sprint task "${step}" failed: ${msg}`);
        }
      } else if (typeof step === 'object' && step !== null && 'gate' in step) {
        // Gate at sprint level — use the gate machine
        const gateConfig = step as GateConfig;
        info(`workflow-runner: running sprint gate "${gateConfig.gate}"`);
        // Reset loop state for fresh gate
        state = { ...state, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } };
        const { executeLoopBlock } = await import('./workflow-machines.js');
        const loopBlock = { loop: [...gateConfig.check, ...gateConfig.fix] };
        const allItems = [...storiesProcessed].map(k => ({ key: k, source: 'sprint' as const }));
        const loopResult = await executeLoopBlock(loopBlock, state, { ...config, maxIterations: gateConfig.max_retries }, allItems, finalOutput.lastContract, storyFlowTasks);
        state = loopResult.state;
        errors = [...errors, ...loopResult.errors];
        tasksCompleted += loopResult.tasksCompleted;
      }
    }
  }

  if (state.phase !== 'interrupted' && errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
    state = { ...state, phase: 'completed' };
  } else if (state.phase === 'executing') {
    // Machine halted or errored without updating the phase — mark as failed so
    // the next run does not incorrectly treat the workflow as still executing.
    state = { ...state, phase: 'failed' };
  }
  // Always persist the terminal state (interrupted, failed, completed, …)
  // so the on-disk phase is never left as 'executing' after the run ends.
  writeWorkflowState(state, projectDir);
  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
  const success = errors.length === 0 && !loopTerminated && state.phase !== 'interrupted';
  // Clear all persistence on clean success — preserve on halt/error/interrupt for resume.
  if (success) {
    const cleared = clearAllPersistence(projectDir);
    info(`workflow-runner: Persistence cleared — snapshot: ${cleared.snapshotCleared ? 'yes' : 'no'}, checkpoints: ${cleared.checkpointCleared ? 'yes' : 'no'}`);
  } else {
    info('workflow-runner: Persistence preserved for resume — snapshot and checkpoint log kept on disk');
  }
  return {
    success,
    tasksCompleted,
    storiesProcessed: storiesProcessed.size,
    errors,
    durationMs: Date.now() - startMs,
  };
}
