/** Workflow runner — composition root: pre-flight, work items, runWorkflowActor(). */
import { createActor } from 'xstate';
import { readFileSync, existsSync } from 'node:fs';
import { warn, info } from './output.js';
import { getDriver } from './agents/drivers/factory.js';
import { checkCapabilityConflicts } from './agents/capability-check.js';
import type { ResolvedWorkflow } from './workflow-parser.js';
import { parse } from 'yaml';
import { readWorkflowState, writeWorkflowState } from './workflow-state.js';
import type { EngineConfig, RunMachineContext, EngineResult, EngineError, WorkItem, DriverHealth } from './workflow-types.js';
import { runMachine } from './workflow-machines.js';

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
  let state = readWorkflowState(projectDir);
  if (state.phase === 'completed') {
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
  };
  const finalContext = await new Promise<RunMachineContext>((resolve) => {
    const actor = createActor(runMachine, { input: runInput });
    actor.subscribe({ complete: () => resolve(actor.getSnapshot().context) });
    actor.start();
  });
  state = finalContext.workflowState;
  const { errors, tasksCompleted, storiesProcessed } = finalContext;
  if (state.phase !== 'interrupted' && errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
    state = { ...state, phase: 'completed' };
    writeWorkflowState(state, projectDir);
  }
  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
  return {
    success: errors.length === 0 && !loopTerminated && state.phase !== 'interrupted',
    tasksCompleted,
    storiesProcessed: storiesProcessed.size,
    errors,
    durationMs: Date.now() - startMs,
  };
}
