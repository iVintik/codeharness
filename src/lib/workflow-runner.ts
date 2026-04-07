/** Workflow runner — composition root: pre-flight, work items, runWorkflowActor(). */
import { createActor } from 'xstate';
import { readFileSync, existsSync } from 'node:fs';
import { warn, info } from './output.js';
import { getDriver } from './agents/drivers/factory.js';
import { checkCapabilityConflicts } from './agents/capability-check.js';
import type { ResolvedWorkflow } from './workflow-parser.js';
import { parse } from 'yaml';
import { readWorkflowState, writeWorkflowState } from './workflow-state.js';
import { saveSnapshot, loadSnapshot, clearSnapshot, clearCheckpointLog, computeConfigHash, loadCheckpointLog, clearAllPersistence, cleanStaleTmpFiles } from './workflow-persistence.js';
import type { EngineConfig, RunMachineContext, EngineResult, EngineError, WorkItem, DriverHealth } from './workflow-types.js';
import { runMachine, type RunOutput } from './workflow-run-machine.js';
import { snapshotToPosition, visualize } from './workflow-visualizer.js';

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
    clearAllPersistence(projectDir);
    return { success: true, tasksCompleted: 0, storiesProcessed: 0, errors: [], durationMs: 0 };
  }
  if (state.phase === 'error' || state.phase === 'failed') {
    const errorCount = state.tasks_completed.filter(t => t.error).length;
    if (!config.onEvent) info(`Resuming from ${state.phase} state — ${errorCount} previous error(s)`);
  }
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
  const savedSnapshot = loadSnapshot(projectDir);
  let resumeSnapshot: unknown = null;
  const completedTasks = new Set<string>();
  if (savedSnapshot !== null) {
    if (savedSnapshot.configHash === configHash) {
      info('workflow-runner: Resuming from snapshot — config hash matches');
      resumeSnapshot = savedSnapshot.snapshot;
    } else {
      warn(`workflow-runner: Snapshot config changed (saved: ${savedSnapshot.configHash.slice(0, 8)}, current: ${configHash.slice(0, 8)}) — starting fresh`);
      try { clearSnapshot(projectDir); }
      catch { // IGNORE: best-effort cleanup — stale snapshot removal is non-critical
      }
      const checkpointEntries = loadCheckpointLog(projectDir);
      for (const entry of checkpointEntries) {
        completedTasks.add(`${entry.storyKey}::${entry.taskName}`);
      }
      if (completedTasks.size > 0) {
        info(`workflow-runner: Loaded ${completedTasks.size} checkpoint(s) — will skip completed tasks`);
      }
    }
  } else {
    // No snapshot — check for orphaned checkpoint log (snapshot cleared but checkpoint clear failed).
    // These entries are stale and would cause incorrect skips if used on a future config-mismatch resume.
    const orphanedEntries = loadCheckpointLog(projectDir);
    if (orphanedEntries.length > 0) {
      warn('workflow-runner: Clearing orphaned checkpoint log — no snapshot present');
      clearCheckpointLog(projectDir);
    }
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
      complete: () => resolve(actor.getSnapshot().output!),
    });
    actor.start();
  });
  state = finalOutput.workflowState;
  const { errors, tasksCompleted, storiesProcessed } = finalOutput;
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
