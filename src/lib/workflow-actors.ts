/* XState v5 dispatch and null-task actors. No circular import dependencies. */
import { fromPromise } from 'xstate';
import { join } from 'node:path';
import { warn } from './output.js';
import { DispatchError, type DispatchErrorCode } from './agent-dispatch.js';
import { getDriver } from './agents/drivers/factory.js';
import { resolveModel } from './agents/model-resolver.js';
import type { OutputContract, DispatchOpts } from './agents/types.js';
import type { ResultEvent, ToolStartEvent } from './agents/stream-parser.js';
import { buildPromptWithContractContext, writeOutputContract } from './agents/output-contract.js';
import { createIsolatedWorkspace } from './source-isolation.js';
import { generateTraceId, formatTracePrompt, recordTraceId } from './trace-id.js';
import { resolveSessionId, recordSessionId, type SessionLookupKey } from './session-manager.js';
import { getNullTask, listNullTasks, type TaskContext, type NullTaskResult } from './null-task-registry.js';
import { readStateWithBody, writeState } from './state.js';
import { formatCoverageContextMessage } from './evaluator.js';
import { writeWorkflowState, type WorkflowState, type TaskCheckpoint } from './workflow-state.js';
import { WorkflowError } from './workflow-types.js';
import type { DispatchInput, DispatchOutput, NullTaskInput } from './workflow-types.js';
import { TASK_PROMPTS, FILE_WRITE_TOOL_NAMES } from './workflow-constants.js';
import { getPendingAcceptanceCriteria } from './workflow-contracts.js';
import { parseTestOutput } from './cross-worktree-validator.js';

// ─── Coverage Deduplication ──────────────────────────────────────────
export function buildCoverageDeduplicationContext(contract: OutputContract | null, projectDir: string): string | null {
  if (!contract?.testResults) return null;
  const { coverage } = contract.testResults;
  if (coverage === null || coverage === undefined) return null;
  try {
    const { state } = readStateWithBody(projectDir);
    if (!state.session_flags.coverage_met) return null;
    return formatCoverageContextMessage(coverage, state.coverage.target ?? 90);
  } catch { return null; } // IGNORE: state unreadable — best-effort
}

function normalizeTestResults(output: string, taskName: string) {
  if (taskName !== 'implement') return null;
  const results = parseTestOutput(output);
  if (!results) return null;
  return results.passed === 0 && results.failed === 0 && results.coverage === null ? null : results;
}

// ─── Null Task Core ──────────────────────────────────────────────────
export async function nullTaskCore(input: NullTaskInput): Promise<DispatchOutput> {
  const { task: _task, taskName, storyKey, config, workflowState, previousContract, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const handler = getNullTask(taskName);
  if (!handler) {
    const registered = listNullTasks();
    throw new WorkflowError(
      `No null task handler registered for "${taskName}". Registered: ${registered.join(', ') || '(none)'}`,
      'NULL_TASK_NOT_FOUND',
      taskName,
      storyKey,
    );
  }
  const startMs = Date.now();
  const workflowStartMs = workflowState.started ? new Date(workflowState.started).getTime() : startMs;
  const ctx: TaskContext = { storyKey, taskName, cost: accumulatedCostUsd, durationMs: startMs - workflowStartMs, outputContract: previousContract, projectDir };
  let result: NullTaskResult;
  try { result = await handler(ctx); } catch (err: unknown) {
    throw new WorkflowError(
      `Null task handler "${taskName}" threw: ${err instanceof Error ? err.message : String(err)}`,
      'NULL_TASK_HANDLER_ERROR',
      taskName,
      storyKey,
    );
  }
  if (!result.success) {
    throw new WorkflowError(
      `Null task handler "${taskName}" returned success=false${result.output ? `: ${result.output}` : ''}`,
      'NULL_TASK_FAILED',
      taskName,
      storyKey,
    );
  }
  const checkpoint: TaskCheckpoint = { task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString() };
  const updatedState: WorkflowState = { ...workflowState, tasks_completed: [...workflowState.tasks_completed, checkpoint] };
  const durationMs = Date.now() - startMs;
  let contract: OutputContract | null = null;
  try {
    contract = {
      version: 1, taskName, storyId: storyKey, driver: 'engine', model: 'null',
      timestamp: new Date().toISOString(), cost_usd: 0, duration_ms: durationMs,
      changedFiles: [], testResults: null, output: result.output ?? '', acceptanceCriteria: [],
    };
    writeOutputContract(contract, join(projectDir, '.codeharness', 'contracts'));
  } catch (err: unknown) {
    warn(`workflow-actors: failed to write output contract for ${taskName}/${storyKey}: ${err instanceof Error ? err.message : String(err)}`);
    contract = null;
  }
  writeWorkflowState(updatedState, projectDir);
  return { output: result.output ?? '', cost: 0, changedFiles: [], sessionId: '', contract, updatedState };
}

// ─── Verify Flag Propagation ─────────────────────────────────────────
function propagateVerifyFlags(taskName: string, contract: OutputContract | null, projectDir: string): void {
  if (taskName !== 'implement' || !contract?.testResults) return;
  const { passed, failed, coverage } = contract.testResults;
  if (passed === 0 && failed === 0) return; // no tests ran — skip flag update
  try {
    const { state, body } = readStateWithBody(projectDir);
    if (failed === 0) state.session_flags.tests_passed = true;
    if (coverage !== null && coverage !== undefined && coverage >= state.coverage.target) {
      state.session_flags.coverage_met = true;
    }
    writeState(state, projectDir, body);
  } catch (err: unknown) {
    warn(`workflow-actors: flag propagation failed for ${taskName}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Core Dispatch Function ──────────────────────────────────────────
export async function dispatchTaskCore(input: DispatchInput): Promise<DispatchOutput> {
  const { task, taskName, storyKey, definition, config, workflowState, previousContract, onStreamEvent, storyFiles, customPrompt } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const traceId = generateTraceId(config.runId, workflowState.iteration, taskName);
  const tracePrompt = formatTracePrompt(traceId);
  const sessionKey: SessionLookupKey = { taskName, storyKey };
  const sessionId = resolveSessionId(task.session, sessionKey, workflowState);
  const driverName = task.driver ?? 'claude-code';
  const driver = getDriver(driverName);
  const model = resolveModel(task, { model: definition.model }, driver);

  let cwd: string;
  let workspace: Awaited<ReturnType<typeof createIsolatedWorkspace>> | null = null;
  if (task.source_access === false) {
    try {
      workspace = await createIsolatedWorkspace({ runId: config.runId, storyFiles: storyFiles ?? [] });
      cwd = workspace?.toDispatchOptions()?.cwd ?? projectDir;
    } catch { cwd = projectDir; } // IGNORE: workspace creation failed — fall back to projectDir
  } else {
    cwd = projectDir;
  }

  const basePrompt = customPrompt ?? (TASK_PROMPTS[taskName]?.(storyKey) ?? `Execute task "${taskName}" for story ${storyKey}`);
  let prompt = buildPromptWithContractContext(basePrompt, previousContract);
  const coverageDedup = buildCoverageDeduplicationContext(previousContract, projectDir);
  if (coverageDedup) prompt = `${prompt}\n\n${coverageDedup}`;

  // Per-task timeout: task config → default 30 minutes
  const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;
  const timeoutMs = task.timeout_minutes
    ? task.timeout_minutes * 60 * 1000
    : DEFAULT_TASK_TIMEOUT_MS;

  const dispatchOpts: DispatchOpts = {
    prompt, model, cwd, sourceAccess: task.source_access !== false,
    timeout: timeoutMs,
    ...(config.abortSignal ? { abortSignal: config.abortSignal } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(tracePrompt ? { appendSystemPrompt: tracePrompt } : {}),
    ...((task.plugins ?? definition.plugins) ? { plugins: task.plugins ?? definition.plugins } : {}),
  };

  const emit = config.onEvent;
  if (emit) emit({ type: 'dispatch-start', taskName, storyKey, driverName, model });

  let output = '';
  let resultSessionId = '';
  let cost = 0;
  let errorEvent: { error: string; errorCategory?: string } | null = null;
  const changedFiles: string[] = [];
  let activeToolName: string | null = null;
  let activeToolInput = '';
  const startMs = Date.now();

  try {
    for await (const event of driver.dispatch(dispatchOpts)) {
      if (onStreamEvent) onStreamEvent(event, driverName);
      if (emit) emit({ type: 'stream-event', taskName, storyKey, driverName, streamEvent: event });
      if (event.type === 'text') output += event.text;
      if (event.type === 'tool-start') { const ts = event as ToolStartEvent; activeToolName = ts.name; activeToolInput = ''; }
      if (event.type === 'tool-input') activeToolInput += event.partial;
      if (event.type === 'tool-complete') {
        if (activeToolName && FILE_WRITE_TOOL_NAMES.has(activeToolName)) {
          try {
            const parsed = JSON.parse(activeToolInput) as Record<string, unknown>;
            const filePath = (parsed.file_path ?? parsed.path ?? parsed.filePath) as string | undefined;
            if (filePath && typeof filePath === 'string') changedFiles.push(filePath);
          } catch { /* IGNORE: tool input not valid JSON */ }
        }
        activeToolName = null; activeToolInput = '';
      }
      if (event.type === 'result') {
        const r = event as ResultEvent;
        resultSessionId = r.sessionId; cost = r.cost;
        if (r.error) errorEvent = { error: r.error, errorCategory: r.errorCategory };
      }
    }
  } finally {
    if (workspace) await workspace.cleanup();
  }

  const elapsedMs = Date.now() - startMs;
  if (emit) emit({ type: 'dispatch-end', taskName, storyKey, driverName, elapsedMs, costUsd: cost });

  if (errorEvent) {
    const categoryToCode: Record<string, string> = {
      RATE_LIMIT: 'RATE_LIMIT', NETWORK: 'NETWORK', SDK_INIT: 'SDK_INIT',
      AUTH: 'UNKNOWN', TIMEOUT: 'UNKNOWN', UNKNOWN: 'UNKNOWN',
    };
    const code = categoryToCode[errorEvent.errorCategory ?? 'UNKNOWN'] ?? 'UNKNOWN';
    throw new DispatchError(errorEvent.error, code as DispatchErrorCode, definition.name, errorEvent);
  }

  let updatedState = workflowState;
  if (resultSessionId) {
    updatedState = recordSessionId(sessionKey, resultSessionId, updatedState);
  } else {
    const checkpoint: TaskCheckpoint = { task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString() };
    updatedState = { ...updatedState, tasks_completed: [...updatedState.tasks_completed, checkpoint] };
  }
  updatedState = recordTraceId(traceId, updatedState);

  const durationMs = Date.now() - startMs;
  let contract: OutputContract | null = null;
  try {
    contract = {
      version: 1, taskName, storyId: storyKey, driver: driverName, model,
      timestamp: new Date().toISOString(), cost_usd: cost > 0 ? cost : null, duration_ms: durationMs,
      changedFiles: [...new Set(changedFiles)], testResults: normalizeTestResults(output, taskName), output, acceptanceCriteria: getPendingAcceptanceCriteria(taskName, storyKey, projectDir, storyFiles),
    };
    writeOutputContract(contract, join(projectDir, '.codeharness', 'contracts'));
  } catch (err: unknown) {
    warn(`workflow-actors: failed to write output contract for ${taskName}/${storyKey}: ${err instanceof Error ? err.message : String(err)}`);
    contract = null;
  }

  writeWorkflowState(updatedState, projectDir);
  propagateVerifyFlags(taskName, contract, projectDir);
  return { output, cost, changedFiles, sessionId: resultSessionId, contract, updatedState };
}

// ─── XState Actors ───────────────────────────────────────────────────
export const dispatchActor = fromPromise(async ({ input }: { input: DispatchInput }): Promise<DispatchOutput> => dispatchTaskCore(input));
export const nullTaskActor = fromPromise(async ({ input }: { input: NullTaskInput }): Promise<DispatchOutput> => nullTaskCore(input));
export const nullTaskDispatchActor = nullTaskActor;
