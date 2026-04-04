import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { warn, info } from './output.js';
import { DispatchError } from './agent-dispatch.js';
import type { DispatchErrorCode } from './agent-dispatch.js';
// Note: dispatchAgent is no longer imported — dispatch goes through the driver factory
import { getDriver } from './agents/drivers/factory.js';
import { checkCapabilityConflicts } from './agents/capability-check.js';
import { resolveModel } from './agents/model-resolver.js';
import type { DispatchOpts, DriverHealth, OutputContract } from './agents/types.js';
import type { ResultEvent, ToolStartEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedWorkflow, ResolvedTask, FlowStep, LoopBlock } from './workflow-parser.js';
import {
  readWorkflowState,
  writeWorkflowState,
} from './workflow-state.js';
import { buildPromptWithContractContext, writeOutputContract } from './agents/output-contract.js';
import type { WorkflowState, TaskCheckpoint } from './workflow-state.js';
import { createIsolatedWorkspace } from './source-isolation.js';
import { generateTraceId, formatTracePrompt, recordTraceId } from './trace-id.js';
import { resolveSessionId, recordSessionId } from './session-manager.js';
import type { SessionLookupKey } from './session-manager.js';
import { parseVerdict, VerdictParseError } from './verdict-parser.js';
import type { EvaluatorVerdict } from './verdict-parser.js';
import { evaluateProgress } from './circuit-breaker.js';
import { getNullTask, listNullTasks } from './null-task-registry.js';
import type { TaskContext, NullTaskResult } from './null-task-registry.js';
import { readStateWithBody, writeState } from './state.js';
import { formatCoverageContextMessage } from './evaluator.js';

// Re-export EvaluatorVerdict for downstream consumers that import from workflow-engine
export type { EvaluatorVerdict } from './verdict-parser.js';
export { parseVerdict } from './verdict-parser.js';

// --- Interfaces ---

/**
 * Configuration for the workflow engine.
 */
/** Event emitted by the engine during execution for TUI/logging. */
export interface EngineEvent {
  type: 'dispatch-start' | 'dispatch-end' | 'dispatch-error' | 'stream-event' | 'task-skip';
  taskName: string;
  storyKey: string;
  driverName?: string;
  model?: string;
  /** StreamEvent from the driver (only for type: 'stream-event'). */
  streamEvent?: StreamEvent;
  /** Error details (only for type: 'dispatch-error'). */
  error?: { code: string; message: string };
  /** Elapsed time in ms (only for type: 'dispatch-end'). */
  elapsedMs?: number;
  /** Cost in USD (only for type: 'dispatch-end'). */
  costUsd?: number;
}

export interface EngineConfig {
  /** The resolved workflow with tasks and flow steps. */
  workflow: ResolvedWorkflow;
  /** Pre-compiled agent definitions keyed by agent name. */
  agents: Record<string, SubagentDefinition>;
  /** Path to sprint-status.yaml for work item discovery. */
  sprintStatusPath: string;
  /** Optional path to issues.yaml for additional work items. */
  issuesPath?: string;
  /** Unique identifier for this engine run. */
  runId: string;
  /** Project root directory. Defaults to process.cwd(). */
  projectDir?: string;
  /** Maximum loop iterations before termination. Defaults to 5. */
  maxIterations?: number;
  /** Optional callback for engine events (TUI, logging). */
  onEvent?: (event: EngineEvent) => void;
  /** Optional abort signal for graceful shutdown. */
  abortSignal?: AbortSignal;
}

/**
 * Result returned by executeWorkflow().
 */
export interface EngineResult {
  /** Whether the workflow completed without errors. */
  success: boolean;
  /** Number of task dispatches completed. */
  tasksCompleted: number;
  /** Number of work items (stories/issues) processed. */
  storiesProcessed: number;
  /** Errors encountered during execution. */
  errors: EngineError[];
  /** Wall-clock duration of the entire workflow in milliseconds. */
  durationMs: number;
}

/**
 * Structured error recorded during workflow execution.
 */
export interface EngineError {
  taskName: string;
  storyKey: string;
  code: string;
  message: string;
}

/**
 * A work item (story or issue) ready for execution.
 */
export interface WorkItem {
  key: string;
  title?: string;
  source: 'sprint' | 'issues';
}

// --- Constants ---

/** Sentinel story key for per-run tasks. */
export const PER_RUN_SENTINEL = '__run__';

/** DispatchError codes that should halt execution immediately. */
const HALT_ERROR_CODES = new Set(['RATE_LIMIT', 'NETWORK', 'SDK_INIT']);

/** Default maximum loop iterations before termination. */
const DEFAULT_MAX_ITERATIONS = 5;

// --- Coverage Deduplication (Story 16-5) ---

/**
 * Build a coverage context string for injection into the verify task prompt.
 *
 * Returns a formatted coverage context line if:
 * 1. `coverage_met` is `true` in harness state
 * 2. The previous output contract has non-null `testResults.coverage`
 *
 * Returns null if coverage deduplication should not apply (coverage not met,
 * no contract data, or state unreadable).
 */
export function buildCoverageDeduplicationContext(
  contract: OutputContract | null,
  projectDir: string,
): string | null {
  // Guard: no contract or no test results
  if (!contract?.testResults) return null;

  const { coverage } = contract.testResults;
  if (coverage === null || coverage === undefined) return null;

  // Check harness state for coverage_met flag
  try {
    const { state } = readStateWithBody(projectDir);
    if (!state.session_flags.coverage_met) return null;

    const target = state.coverage.target ?? 90;
    return formatCoverageContextMessage(coverage, target);
  } catch {
    // IGNORE: state unreadable — no deduplication
    return null;
  }
}

// --- Verify Flag Propagation (Story 16-4) ---

/**
 * Propagate test/coverage flags from the implement task's output contract
 * to the harness state file. Only runs for tasks named 'implement' whose
 * output contract contains a non-null `testResults`.
 *
 * This sets `session_flags.tests_passed` and `session_flags.coverage_met`
 * before the verify task runs, so verify's precondition check passes
 * without re-running coverage.
 */
function propagateVerifyFlags(
  taskName: string,
  contract: OutputContract | null,
  projectDir: string,
): void {
  // Guard: only run for implement tasks
  if (taskName !== 'implement') return;

  // Guard: skip if no contract or no test results
  if (!contract?.testResults) return;

  const { failed, coverage } = contract.testResults;

  try {
    const { state, body } = readStateWithBody(projectDir);

    // Set tests_passed if all tests passed
    if (failed === 0) {
      state.session_flags.tests_passed = true;
    }

    // Set coverage_met if coverage meets the target
    // null coverage is not >= any target (null >= N is false in JS)
    if (coverage !== null && coverage !== undefined && coverage >= state.coverage.target) {
      state.session_flags.coverage_met = true;
    }

    writeState(state, projectDir, body);
  } catch (err: unknown) {
    // IGNORE: if state file doesn't exist or can't be written,
    // flag propagation is best-effort — the verify step will
    // still work via the coverage evaluator path.
    const msg = err instanceof Error ? err.message : String(err);
    warn(`workflow-engine: flag propagation failed for ${taskName}: ${msg}`);
  }
}

// --- Crash Recovery: Task Completion Check ---

/**
 * Check whether a (taskName, storyKey) combination is already recorded
 * in the workflow state's tasks_completed array.
 *
 * Both fields must match for the task to be considered completed.
 * Used by the resume logic to skip already-completed dispatches.
 */
export function isTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
): boolean {
  return state.tasks_completed.some(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  );
}

/**
 * Check whether a (taskName, storyKey) combination has been completed
 * enough times to cover the current iteration in a loop block.
 *
 * Loop tasks execute the same (taskName, storyKey) pair each iteration,
 * recording a new checkpoint each time. To determine if a task is done
 * for the current iteration, we count how many matching checkpoints exist
 * and compare to the current iteration number.
 */
export function isLoopTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
  iteration: number,
): boolean {
  const count = state.tasks_completed.filter(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  ).length;
  return count >= iteration;
}

// --- Work Item Loading ---

/**
 * Load work items from sprint-status.yaml and optionally issues.yaml.
 *
 * Stories are extracted from the `development_status` section of sprint-status.yaml.
 * Issues are extracted from the `issues` array of issues.yaml.
 *
 * Only items with status `backlog` or `ready-for-dev` are included.
 * Epic keys (`epic-*`) and retrospective keys (`*-retrospective`) are excluded.
 *
 * If issues.yaml does not exist, returns only stories (no error).
 */
export function loadWorkItems(sprintStatusPath: string, issuesPath?: string): WorkItem[] {
  const items: WorkItem[] = [];

  // --- Load stories from sprint-status.yaml ---
  if (existsSync(sprintStatusPath)) {
    let raw: string;
    try {
      raw = readFileSync(sprintStatusPath, 'utf-8');
    } catch { // IGNORE: unreadable file — warn and return empty
      warn(`workflow-engine: could not read sprint-status.yaml at ${sprintStatusPath}`);
      return items;
    }

    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch { // IGNORE: malformed YAML — warn and return empty
      warn(`workflow-engine: invalid YAML in sprint-status.yaml at ${sprintStatusPath}`);
      return items;
    }

    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const devStatus = data.development_status as Record<string, unknown> | undefined;

      if (devStatus && typeof devStatus === 'object') {
        for (const [key, status] of Object.entries(devStatus)) {
          // Skip epic keys and retrospective keys
          if (key.startsWith('epic-')) continue;
          if (key.endsWith('-retrospective')) continue;

          // Only include backlog or ready-for-dev
          if (status === 'backlog' || status === 'ready-for-dev') {
            items.push({ key, source: 'sprint' });
          }
        }
      }
    }
  }

  // --- Load issues from issues.yaml ---
  if (issuesPath && existsSync(issuesPath)) {
    let raw: string;
    try {
      raw = readFileSync(issuesPath, 'utf-8');
    } catch { // IGNORE: unreadable issues file — warn and return what we have
      warn(`workflow-engine: could not read issues.yaml at ${issuesPath}`);
      return items;
    }

    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch { // IGNORE: malformed issues YAML — warn and return what we have
      warn(`workflow-engine: invalid YAML in issues.yaml at ${issuesPath}`);
      return items;
    }

    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      const issuesList = data.issues as Array<Record<string, unknown>> | undefined;

      if (Array.isArray(issuesList)) {
        for (const issue of issuesList) {
          if (issue && typeof issue === 'object') {
            const status = issue.status as string | undefined;
            if (status === 'backlog' || status === 'ready-for-dev') {
              items.push({
                key: issue.id as string,
                title: issue.title as string | undefined,
                source: 'issues',
              });
            }
          }
        }
      }
    }
  }

  return items;
}

// --- Single Task Dispatch ---

/**
 * Dispatch a single task for a specific work item (or per-run sentinel).
 *
 * Handles: trace ID generation, session resolution, source isolation,
 * agent dispatch, state checkpointing, and cleanup.
 *
 * Returns the updated workflow state after recording the dispatch.
 */
export async function dispatchTask(
  task: ResolvedTask,
  taskName: string,
  storyKey: string,
  definition: SubagentDefinition,
  state: WorkflowState,
  config: EngineConfig,
  customPrompt?: string,
  previousOutputContract?: OutputContract,
): Promise<WorkflowState> {
  const { updatedState, contract } = await dispatchTaskWithResult(
    task, taskName, storyKey, definition, state, config, customPrompt, previousOutputContract,
  );
  const projectDir = config.projectDir ?? process.cwd();
  propagateVerifyFlags(taskName, contract, projectDir);
  return updatedState;
}

/** Tool names that indicate file write/edit operations across different drivers. */
const FILE_WRITE_TOOL_NAMES = new Set([
  'Write', 'Edit', 'write_to_file', 'edit_file',
  'write', 'edit', 'WriteFile', 'EditFile',
]);

// --- Flow Step Type Guard ---

function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step;
}

// --- Null Task Execution ---

/**
 * Execute a null task (agent: null) directly in the engine.
 *
 * Looks up the handler via the null task registry, builds a TaskContext,
 * calls the handler, writes a TaskCheckpoint, and returns the same shape
 * as dispatchTaskWithResult so callers don't need branching.
 *
 * @throws EngineError with code NULL_TASK_NOT_FOUND if no handler is registered.
 */
async function executeNullTask(
  task: ResolvedTask,
  taskName: string,
  storyKey: string,
  state: WorkflowState,
  config: EngineConfig,
  previousOutputContract?: OutputContract,
  accumulatedCostUsd?: number,
): Promise<{ updatedState: WorkflowState; output: string; contract: OutputContract | null }> {
  const projectDir = config.projectDir ?? process.cwd();

  // 1. Look up handler
  const handler = getNullTask(taskName);
  if (!handler) {
    const registered = listNullTasks();
    const registeredList = registered.length > 0 ? registered.join(', ') : '(none)';
    const error: EngineError = {
      taskName,
      storyKey,
      code: 'NULL_TASK_NOT_FOUND',
      message: `No null task handler registered for "${taskName}". Registered handlers: ${registeredList}`,
    };
    throw error;
  }

  // 2. Build TaskContext
  const startMs = Date.now();
  const workflowStartMs = state.started ? new Date(state.started).getTime() : startMs;
  const ctx: TaskContext = {
    storyKey,
    taskName,
    cost: accumulatedCostUsd ?? 0,
    durationMs: startMs - workflowStartMs,
    outputContract: previousOutputContract ?? null,
    projectDir,
  };

  // 3. Call handler (wrap in try/catch for structured error reporting)
  let result: NullTaskResult;
  try {
    result = await handler(ctx);
  } catch (handlerErr: unknown) {
    const error: EngineError = {
      taskName,
      storyKey,
      code: 'NULL_TASK_HANDLER_ERROR',
      message: `Null task handler "${taskName}" threw: ${handlerErr instanceof Error ? handlerErr.message : String(handlerErr)}`,
    };
    throw error;
  }
  const durationMs = Date.now() - startMs;

  // 4. Check handler result — if success is false, throw an EngineError
  if (!result.success) {
    const error: EngineError = {
      taskName,
      storyKey,
      code: 'NULL_TASK_FAILED',
      message: `Null task handler "${taskName}" returned success=false${result.output ? `: ${result.output}` : ''}`,
    };
    throw error;
  }

  // 5. Write TaskCheckpoint
  const checkpoint: TaskCheckpoint = {
    task_name: taskName,
    story_key: storyKey,
    completed_at: new Date().toISOString(),
  };
  let updatedState: WorkflowState = {
    ...state,
    tasks_completed: [...state.tasks_completed, checkpoint],
  };

  // 6. Build OutputContract (driver: "engine", model: "null", cost_usd: 0)
  const contract: OutputContract = {
    version: 1,
    taskName,
    storyId: storyKey,
    driver: 'engine',
    model: 'null',
    timestamp: new Date().toISOString(),
    cost_usd: 0,
    duration_ms: durationMs,
    changedFiles: [],
    testResults: null,
    output: result.output ?? '',
    acceptanceCriteria: [],
  };

  // 7. Write state to disk
  writeWorkflowState(updatedState, projectDir);

  return { updatedState, output: result.output ?? '', contract };
}

// --- Core Dispatch (shared by dispatchTask and loop block execution) ---

/**
 * Dispatch a task and return both the updated state and the raw dispatch output.
 * This is the single implementation of task dispatch logic. Both `dispatchTask()`
 * and loop block execution delegate here.
 */
async function dispatchTaskWithResult(
  task: ResolvedTask,
  taskName: string,
  storyKey: string,
  definition: SubagentDefinition,
  state: WorkflowState,
  config: EngineConfig,
  customPrompt?: string,
  previousOutputContract?: OutputContract,
): Promise<{ updatedState: WorkflowState; output: string; contract: OutputContract | null }> {
  const projectDir = config.projectDir ?? process.cwd();

  // 1. Generate trace ID
  const traceId = generateTraceId(config.runId, state.iteration, taskName);

  // 2. Format trace prompt — injected into driver via DispatchOpts.appendSystemPrompt
  const tracePrompt = formatTracePrompt(traceId);

  // 3. Resolve session ID
  const sessionKey: SessionLookupKey = { taskName, storyKey };
  const sessionId = resolveSessionId(task.session, sessionKey, state);

  // 4. Resolve driver
  const driverName = task.driver ?? 'claude-code';
  const driver = getDriver(driverName);

  // 5. Resolve model via cascade: task → agent → driver
  const agentAsModelSource = { model: definition.model };
  const model = resolveModel(task, agentAsModelSource, driver);

  // 6. Determine cwd based on source_access
  let cwd: string;
  let workspace: Awaited<ReturnType<typeof createIsolatedWorkspace>> | null = null;

  if (task.source_access === false) {
    workspace = await createIsolatedWorkspace({ runId: config.runId, storyFiles: [] });
    cwd = workspace.toDispatchOptions().cwd ?? projectDir;
  } else {
    cwd = projectDir;
  }

  // 7. Construct prompt
  const basePrompt = customPrompt
    ?? (storyKey === PER_RUN_SENTINEL
      ? `Execute task "${taskName}" for the current run.`
      : `Implement story ${storyKey}`);

  // 7b. Inject previous task's output contract context into the prompt (story 13-2)
  let prompt = buildPromptWithContractContext(basePrompt, previousOutputContract ?? null);

  // 7c. Coverage deduplication (story 16-5): append coverage context when
  // coverage_met is true and the previous contract has coverage data.
  const coverageDedup = buildCoverageDeduplicationContext(
    previousOutputContract ?? null,
    projectDir,
  );
  if (coverageDedup) {
    prompt = `${prompt}\n\n${coverageDedup}`;
  }

  // 8. Build DispatchOpts for the driver
  const dispatchOpts: DispatchOpts = {
    prompt,
    model,
    cwd,
    sourceAccess: task.source_access !== false,
    ...(sessionId ? { sessionId } : {}),
    ...(tracePrompt ? { appendSystemPrompt: tracePrompt } : {}),
    ...((task.plugins ?? definition.plugins) ? { plugins: task.plugins ?? definition.plugins } : {}),
    ...(task.max_budget_usd != null ? { timeout: task.max_budget_usd } : {}),
  };

  // 9. Dispatch through the driver and consume AsyncIterable<StreamEvent>
  const emit = config.onEvent;
  if (emit) {
    emit({ type: 'dispatch-start', taskName, storyKey, driverName, model });
  } else {
    info(`[${taskName}] ${storyKey} — dispatching via ${driverName} (model: ${model})...`);
  }
  let output = '';
  let resultSessionId = '';
  let cost = 0;
  let errorEvent: { error: string; errorCategory?: string } | null = null;

  // Track changed files from tool-start/tool-input/tool-complete events (Task 2)
  const changedFiles: string[] = [];
  let activeToolName: string | null = null;
  let activeToolInput = '';

  // Timing measurement (Task 6)
  const startMs = Date.now();

  try {
    for await (const event of driver.dispatch(dispatchOpts)) {
      // Emit stream event to TUI
      if (emit) {
        emit({ type: 'stream-event', taskName, storyKey, driverName, streamEvent: event });
      }
      if (event.type === 'text') {
        output += event.text;
      }
      if (event.type === 'tool-start') {
        const toolStart = event as ToolStartEvent;
        activeToolName = toolStart.name;
        activeToolInput = '';
      }
      if (event.type === 'tool-input') {
        activeToolInput += event.partial;
      }
      if (event.type === 'tool-complete') {
        // Extract file path from Write/Edit tool completions
        if (activeToolName && FILE_WRITE_TOOL_NAMES.has(activeToolName)) {
          try {
            const parsed = JSON.parse(activeToolInput) as Record<string, unknown>;
            const filePath = (parsed.file_path ?? parsed.path ?? parsed.filePath) as string | undefined;
            if (filePath && typeof filePath === 'string') {
              changedFiles.push(filePath);
            }
          } catch { // IGNORE: best-effort — tool input may not be valid JSON (partial accumulation)
          }
        }
        activeToolName = null;
        activeToolInput = '';
      }
      if (event.type === 'result') {
        const resultEvt = event as ResultEvent;
        resultSessionId = resultEvt.sessionId;
        cost = resultEvt.cost;
        if (resultEvt.error) {
          errorEvent = { error: resultEvt.error, errorCategory: resultEvt.errorCategory };
        }
      }
    }
  } finally {
    // Cleanup workspace regardless of dispatch success/failure
    if (workspace) {
      await workspace.cleanup();
    }
  }

  const elapsedMs = Date.now() - startMs;
  if (emit) {
    emit({ type: 'dispatch-end', taskName, storyKey, driverName, elapsedMs, costUsd: cost });
  } else {
    const elapsed = (elapsedMs / 1000).toFixed(1);
    info(`[${taskName}] ${storyKey} — done (${elapsed}s, cost: $${cost.toFixed(4)})`);
  }

  // 10. If the driver reported an error in the result event, throw DispatchError
  if (errorEvent) {
    // Map ErrorCategory to DispatchErrorCode
    const categoryToCode: Record<string, string> = {
      RATE_LIMIT: 'RATE_LIMIT',
      NETWORK: 'NETWORK',
      SDK_INIT: 'SDK_INIT',
      AUTH: 'UNKNOWN',
      TIMEOUT: 'UNKNOWN',
      UNKNOWN: 'UNKNOWN',
    };
    const code = categoryToCode[errorEvent.errorCategory ?? 'UNKNOWN'] ?? 'UNKNOWN';
    throw new DispatchError(
      errorEvent.error,
      code as DispatchErrorCode,
      definition.name,
      errorEvent,
    );
  }

  // 11. Record session ID (if dispatch returned one)
  let updatedState = state;
  if (resultSessionId) {
    updatedState = recordSessionId(sessionKey, resultSessionId, updatedState);
  } else {
    // Append checkpoint manually when no session ID is returned
    const checkpoint: TaskCheckpoint = {
      task_name: taskName,
      story_key: storyKey,
      completed_at: new Date().toISOString(),
    };
    updatedState = {
      ...updatedState,
      tasks_completed: [...updatedState.tasks_completed, checkpoint],
    };
  }

  // 12. Record trace ID
  updatedState = recordTraceId(traceId, updatedState);

  // 12b. Construct and write output contract (Task 1)
  const durationMs = Date.now() - startMs;
  let contract: OutputContract | null = null;
  try {
    contract = {
      version: 1,
      taskName,
      storyId: storyKey,
      driver: driverName,
      model,
      timestamp: new Date().toISOString(),
      cost_usd: cost > 0 ? cost : null,
      duration_ms: durationMs,
      changedFiles: [...new Set(changedFiles)],
      testResults: null,
      output,
      acceptanceCriteria: [],
    };
    writeOutputContract(contract, join(projectDir, '.codeharness', 'contracts'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`workflow-engine: failed to write output contract for ${taskName}/${storyKey}: ${message}`);
    contract = null;
  }

  // 13. Write state to disk
  writeWorkflowState(updatedState, projectDir);

  return { updatedState, output, contract };
}

// --- Retry Prompt Construction (Task 3) ---

/**
 * Build a retry prompt with evaluator findings injected.
 * Includes only failed/unknown findings.
 */
export function buildRetryPrompt(storyKey: string, findings: EvaluatorVerdict['findings']): string {
  const failedFindings = findings.filter(
    (f) => f.status === 'fail' || f.status === 'unknown',
  );

  if (failedFindings.length === 0) {
    return `Implement story ${storyKey}`;
  }

  const formattedFindings = failedFindings
    .map((f) => {
      const status = f.status.toUpperCase();
      let entry = `AC #${f.ac} (${status}): ${f.description}`;
      if (f.evidence?.reasoning) {
        entry += `\n  Evidence: ${f.evidence.reasoning}`;
      }
      return entry;
    })
    .join('\n\n');

  return `Retry story ${storyKey}. Previous evaluator findings:\n\n${formattedFindings}\n\nFocus on fixing the failed criteria above.`;
}

// --- All-UNKNOWN Verdict Builder ---

/**
 * Build an all-UNKNOWN EvaluatorVerdict as fallback when the evaluator
 * fails to produce valid JSON after retry.
 */
export function buildAllUnknownVerdict(
  workItems: WorkItem[],
  reasoning: string,
): EvaluatorVerdict {
  const findings = workItems.map((_, index) => ({
    ac: index + 1,
    description: `AC #${index + 1}`,
    status: 'unknown' as const,
    evidence: {
      commands_run: [] as string[],
      output_observed: '',
      reasoning,
    },
  }));

  return {
    verdict: 'fail',
    score: {
      passed: 0,
      failed: 0,
      unknown: findings.length,
      total: findings.length,
    },
    findings,
  };
}

// --- Failed Story Filtering (Task 4) ---

/**
 * Determine which work items failed based on evaluator findings.
 * If verdict is null (parse failure), returns all items (conservative fallback).
 */
export function getFailedItems(
  verdict: EvaluatorVerdict | null,
  allItems: WorkItem[],
): WorkItem[] {
  if (!verdict) return allItems;

  // If verdict passed, no items need retry
  if (verdict.verdict === 'pass') return [];

  // All items are retried on failure — per-story filtering based on individual
  // story results is not possible with the current verdict shape (verdict is per-run).
  // The findings track ACs, not stories. Conservative: retry all on failure.
  return allItems;
}

// --- Loop Block Execution (Task 5) ---

/**
 * Result of loop block execution.
 */
interface LoopBlockResult {
  state: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
}

/**
 * Execute a loop block: iterate tasks until pass, max iterations, or circuit breaker.
 */
export async function executeLoopBlock(
  loopBlock: LoopBlock,
  state: WorkflowState,
  config: EngineConfig,
  workItems: WorkItem[],
  initialContract?: OutputContract | null,
): Promise<LoopBlockResult> {
  const projectDir = config.projectDir ?? process.cwd();
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const errors: EngineError[] = [];
  let tasksCompleted = 0;
  let currentState = state;
  let lastVerdict: EvaluatorVerdict | null = null;
  let lastOutputContract: OutputContract | null = initialContract ?? null;
  let accumulatedCostUsd = 0;

  // Handle empty loop block
  if (loopBlock.loop.length === 0) {
    return { state: currentState, errors, tasksCompleted, halted: false, lastContract: lastOutputContract };
  }

  while (true) {
    // 1. Determine whether to increment iteration or resume a partial one.
    //    On fresh start (iteration === 0), always increment.
    //    On resume (iteration > 0), check if the current iteration is fully done.
    const nextIteration = currentState.iteration + 1;
    const allCurrentIterationDone = currentState.iteration > 0 && loopBlock.loop.every((tn) => {
      const t = config.workflow.tasks[tn];
      if (!t) return true; // missing task = skip = "done"
      if (t.scope === 'per-story') {
        return workItems.every((item) =>
          isLoopTaskCompleted(currentState, tn, item.key, currentState.iteration));
      }
      return isLoopTaskCompleted(currentState, tn, PER_RUN_SENTINEL, currentState.iteration);
    });

    if (currentState.iteration === 0 || allCurrentIterationDone) {
      // Fresh start or current iteration fully done — advance
      currentState = {
        ...currentState,
        iteration: nextIteration,
      };
      writeWorkflowState(currentState, projectDir);
    }
    // else: resuming a partially completed iteration — keep current iteration

    let haltedInLoop = false;

    // 2. Execute each task in the loop
    for (const taskName of loopBlock.loop) {
      const task = config.workflow.tasks[taskName];
      if (!task) {
        warn(`workflow-engine: task "${taskName}" not found in workflow tasks, skipping`);
        continue;
      }

      // --- Null task path in loop ---
      if (task.agent === null) {
        if (task.scope === 'per-story') {
          const itemsToProcess = lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems;
          for (const item of itemsToProcess) {
            if (isLoopTaskCompleted(currentState, taskName, item.key, currentState.iteration)) {
              warn(`workflow-engine: skipping completed task ${taskName} for ${item.key}`);
              continue;
            }
            try {
              const nullResult = await executeNullTask(
                task, taskName, item.key, currentState, config, lastOutputContract ?? undefined, accumulatedCostUsd,
              );
              currentState = nullResult.updatedState;
              lastOutputContract = nullResult.contract;
              tasksCompleted++;
            } catch (err: unknown) {
              const engineError = isEngineError(err)
                ? err
                : handleDispatchError(err, taskName, item.key);
              errors.push(engineError);
              currentState = recordErrorInState(currentState, taskName, item.key, engineError);
              writeWorkflowState(currentState, projectDir);
            }
          }
        } else {
          if (isLoopTaskCompleted(currentState, taskName, PER_RUN_SENTINEL, currentState.iteration)) {
            warn(`workflow-engine: skipping completed task ${taskName} for ${PER_RUN_SENTINEL}`);
            continue;
          }
          try {
            const nullResult = await executeNullTask(
              task, taskName, PER_RUN_SENTINEL, currentState, config, lastOutputContract ?? undefined, accumulatedCostUsd,
            );
            currentState = nullResult.updatedState;
            lastOutputContract = nullResult.contract;
            tasksCompleted++;
          } catch (err: unknown) {
            const engineError = isEngineError(err)
              ? err
              : handleDispatchError(err, taskName, PER_RUN_SENTINEL);
            errors.push(engineError);
            currentState = recordErrorInState(currentState, taskName, PER_RUN_SENTINEL, engineError);
            writeWorkflowState(currentState, projectDir);
          }
        }
        continue;
      }

      // --- Agent task path in loop ---
      const definition = config.agents[task.agent];
      if (!definition) {
        warn(`workflow-engine: agent "${task.agent}" not found for task "${taskName}", skipping`);
        continue;
      }

      if (task.scope === 'per-story') {
        // Determine which items to dispatch for
        const itemsToRetry = lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems;

        for (const item of itemsToRetry) {
          // Skip if already completed for this iteration (crash recovery — AC #4)
          if (isLoopTaskCompleted(currentState, taskName, item.key, currentState.iteration)) {
            warn(`workflow-engine: skipping completed task ${taskName} for ${item.key}`);
            continue;
          }

          // Build prompt: inject findings if we have a previous verdict
          const prompt = lastVerdict
            ? buildRetryPrompt(item.key, lastVerdict.findings)
            : undefined;

          try {
            const dispatchResult = await dispatchTaskWithResult(
              task, taskName, item.key, definition, currentState, config, prompt, lastOutputContract ?? undefined,
            );
            currentState = dispatchResult.updatedState;
            lastOutputContract = dispatchResult.contract;
            propagateVerifyFlags(taskName, dispatchResult.contract, projectDir);
            accumulatedCostUsd += dispatchResult.contract?.cost_usd ?? 0;
            tasksCompleted++;
          } catch (err: unknown) {
            const engineError = handleDispatchError(err, taskName, item.key);
            errors.push(engineError);
            currentState = recordErrorInState(currentState, taskName, item.key, engineError);
            writeWorkflowState(currentState, projectDir);

            if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) {
              haltedInLoop = true;
              break;
            }
            continue;
          }
        }

        if (haltedInLoop) break;
      } else {
        // per-run task (e.g., verify)
        // Skip if already completed for this iteration (crash recovery — AC #4)
        if (isLoopTaskCompleted(currentState, taskName, PER_RUN_SENTINEL, currentState.iteration)) {
          warn(`workflow-engine: skipping completed task ${taskName} for ${PER_RUN_SENTINEL}`);
          continue;
        }

        try {
          // We need the dispatch result output to parse verdict
          const dispatchResult = await dispatchTaskWithResult(
            task, taskName, PER_RUN_SENTINEL, definition, currentState, config,
            undefined, lastOutputContract ?? undefined,
          );
          currentState = dispatchResult.updatedState;
          lastOutputContract = dispatchResult.contract;
          propagateVerifyFlags(taskName, dispatchResult.contract, projectDir);
          accumulatedCostUsd += dispatchResult.contract?.cost_usd ?? 0;
          tasksCompleted++;

          // Attempt to parse verdict from output with retry semantics (story 6-2)
          let verdict: EvaluatorVerdict | null = null;
          try {
            verdict = parseVerdict(dispatchResult.output);
          } catch (parseErr: unknown) {
            if (parseErr instanceof VerdictParseError && parseErr.retryable) {
              // Re-dispatch evaluator for one retry attempt
              warn(`workflow-engine: verdict parse failed, retrying evaluator for ${taskName}`);
              try {
                const retryResult = await dispatchTaskWithResult(
                  task, taskName, PER_RUN_SENTINEL, definition, currentState, config,
                  undefined, lastOutputContract ?? undefined,
                );
                currentState = retryResult.updatedState;
                lastOutputContract = retryResult.contract;
                propagateVerifyFlags(taskName, retryResult.contract, projectDir);
                tasksCompleted++;
                verdict = parseVerdict(retryResult.output);
              } catch { // IGNORE: retry failed — fall back to all-UNKNOWN verdict
                // Second failure: generate all-UNKNOWN verdict
                verdict = buildAllUnknownVerdict(
                  workItems,
                  'Evaluator failed to produce valid JSON after retry',
                );
              }
            }
            // If not a VerdictParseError or not retryable, verdict stays null
          }
          lastVerdict = verdict;

          // Record score in state
          if (verdict) {
            const score = {
              iteration: currentState.iteration,
              passed: verdict.score.passed,
              failed: verdict.score.failed,
              unknown: verdict.score.unknown,
              total: verdict.score.total,
              timestamp: new Date().toISOString(),
            };
            currentState = {
              ...currentState,
              evaluator_scores: [...currentState.evaluator_scores, score],
            };
          } else {
            // Parse failure: record all-UNKNOWN score
            const totalItems = workItems.length;
            const score = {
              iteration: currentState.iteration,
              passed: 0,
              failed: 0,
              unknown: totalItems,
              total: totalItems,
              timestamp: new Date().toISOString(),
            };
            currentState = {
              ...currentState,
              evaluator_scores: [...currentState.evaluator_scores, score],
            };
          }
          writeWorkflowState(currentState, projectDir);

          // Circuit breaker: evaluate progress after recording score
          const cbDecision = evaluateProgress(currentState.evaluator_scores);
          if (cbDecision.halt) {
            currentState = {
              ...currentState,
              circuit_breaker: {
                triggered: true,
                reason: cbDecision.reason,
                score_history: cbDecision.scoreHistory,
              },
            };
            writeWorkflowState(currentState, projectDir);
          }
        } catch (err: unknown) {
          const engineError = handleDispatchError(err, taskName, PER_RUN_SENTINEL);
          errors.push(engineError);
          currentState = recordErrorInState(currentState, taskName, PER_RUN_SENTINEL, engineError);
          writeWorkflowState(currentState, projectDir);

          // Clear stale verdict so next iteration retries all items
          lastVerdict = null;

          if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) {
            haltedInLoop = true;
            break;
          }
          continue;
        }
      }
    }

    if (haltedInLoop) {
      return { state: currentState, errors, tasksCompleted, halted: true, lastContract: lastOutputContract };
    }

    // 3. Check termination conditions
    if (lastVerdict?.verdict === 'pass') {
      // Success: loop passes
      return { state: currentState, errors, tasksCompleted, halted: false, lastContract: lastOutputContract };
    }

    if (currentState.iteration >= maxIterations) {
      currentState = { ...currentState, phase: 'max-iterations' };
      writeWorkflowState(currentState, projectDir);
      return { state: currentState, errors, tasksCompleted, halted: false, lastContract: lastOutputContract };
    }

    if (currentState.circuit_breaker.triggered) {
      currentState = { ...currentState, phase: 'circuit-breaker' };
      writeWorkflowState(currentState, projectDir);
      return { state: currentState, errors, tasksCompleted, halted: false, lastContract: lastOutputContract };
    }
  }
}


// --- Driver Health Check ---

/** Default timeout for the health check phase (NFR6). */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Run health checks on all unique drivers referenced in a workflow.
 *
 * Collects unique driver names from `workflow.tasks`, resolves each via
 * `getDriver()`, and runs all `healthCheck()` calls concurrently with a
 * 5-second timeout (NFR6).
 *
 * Throws if any driver is unavailable or if the timeout fires.
 */
export async function checkDriverHealth(workflow: ResolvedWorkflow, timeoutMs?: number): Promise<void> {
  // 1. Collect unique driver names from all tasks (skip null agent tasks)
  const driverNames = new Set<string>();
  for (const task of Object.values(workflow.tasks)) {
    if (task.agent === null) continue;
    driverNames.add(task.driver ?? 'claude-code');
  }

  // 2. Resolve drivers
  const drivers = new Map<string, ReturnType<typeof getDriver>>();
  for (const name of driverNames) {
    drivers.set(name, getDriver(name));
  }

  // 3. Run health checks concurrently, tracking which drivers responded
  interface HealthResult { name: string; health: DriverHealth }
  const responded = new Set<string>();
  const healthChecks = Promise.all(
    [...drivers.entries()].map(async ([name, driver]): Promise<HealthResult> => {
      const health = await driver.healthCheck();
      responded.add(name);
      return { name, health };
    }),
  );

  // 4. Race against timeout (NFR6) — clear timer on success to prevent leaks
  const effectiveTimeout = timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), effectiveTimeout);
  });

  const result = await Promise.race([healthChecks, timeoutPromise]);

  if (result === 'timeout') {
    // Report only the drivers that did NOT respond (AC #6)
    const pending = [...driverNames].filter((n) => !responded.has(n));
    const names = pending.length > 0 ? pending.join(', ') : [...driverNames].join(', ');
    throw new Error(
      `Driver health check timed out after ${effectiveTimeout}ms. Drivers that did not respond: ${names}`,
    );
  }

  // Health checks completed before timeout — clear the timer
  clearTimeout(timer!);

  // 5. Check for failures
  const failures = result.filter((r) => !r.health.available);
  if (failures.length > 0) {
    const details = failures
      .map((f) => `${f.name}: ${f.health.error ?? 'unavailable'}`)
      .join('; ');
    throw new Error(`Driver health check failed: ${details}`);
  }
}

// --- Main Execution ---

/**
 * Execute a workflow sequentially: iterate through flow steps, dispatch tasks
 * per-story or per-run, checkpoint state after each dispatch.
 *
 * Loop blocks execute iteratively until pass, max-iterations, or circuit-breaker.
 *
 * Returns an EngineResult summarizing the execution.
 */
export async function executeWorkflow(config: EngineConfig): Promise<EngineResult> {
  const startMs = Date.now();
  const projectDir = config.projectDir ?? process.cwd();
  const errors: EngineError[] = [];
  let tasksCompleted = 0;
  const processedStories = new Set<string>();

  // 1. Read or initialize workflow state
  let state = readWorkflowState(projectDir);

  // Early exit: workflow already completed (AC #6)
  if (state.phase === 'completed') {
    return {
      success: true,
      tasksCompleted: 0,
      storiesProcessed: 0,
      errors: [],
      durationMs: 0,
    };
  }

  // Log resume from previous error state
  if (state.phase === 'error' || state.phase === 'failed') {
    const errorCount = state.tasks_completed.filter(t => t.error).length;
    info(`Resuming from ${state.phase} state — ${errorCount} previous error(s), retrying failed tasks`);
  }

  state = {
    ...state,
    phase: 'executing',
    started: state.started || new Date().toISOString(),
    workflow_name: config.workflow.storyFlow.filter((s) => typeof s === 'string').join(' -> '),
  };
  writeWorkflowState(state, projectDir);

  // 1b. Pre-flight driver health check
  try {
    await checkDriverHealth(config.workflow);
  } catch (err: unknown) { // IGNORE: health check failure — record and abort
    const message = err instanceof Error ? err.message : String(err);
    state = { ...state, phase: 'failed' };
    const engineError: EngineError = {
      taskName: '__health_check__',
      storyKey: '__health_check__',
      code: 'HEALTH_CHECK',
      message,
    };
    errors.push(engineError);
    writeWorkflowState(state, projectDir);
    return {
      success: false,
      tasksCompleted: 0,
      storiesProcessed: 0,
      errors,
      durationMs: Date.now() - startMs,
    };
  }

  // 1c. Pre-flight capability conflict check (advisory only — never aborts)
  const capWarnings = checkCapabilityConflicts(config.workflow);
  for (const cw of capWarnings) {
    warn(cw.message);
  }

  // 2. Load work items
  const workItems = loadWorkItems(config.sprintStatusPath, config.issuesPath);

  // 3. Iterate through flow steps
  let halted = false;
  let lastOutputContract: OutputContract | null = null;
  let accumulatedCostUsd = 0;
  for (const step of config.workflow.storyFlow) {
    if (halted) break;
    if (config.abortSignal?.aborted) {
      info('Execution interrupted — saving state');
      state = { ...state, phase: 'interrupted' };
      writeWorkflowState(state, projectDir);
      halted = true;
      break;
    }

    // Execute loop blocks
    if (isLoopBlock(step)) {
      const loopResult = await executeLoopBlock(step, state, config, workItems, lastOutputContract);
      state = loopResult.state;
      errors.push(...loopResult.errors);
      tasksCompleted += loopResult.tasksCompleted;
      lastOutputContract = loopResult.lastContract;

      // Track processed stories from loop
      for (const item of workItems) {
        processedStories.add(item.key);
      }

      if (loopResult.halted) {
        halted = true;
      }

      // If loop ended with max-iterations or circuit-breaker, treat as failure
      if (state.phase === 'max-iterations' || state.phase === 'circuit-breaker') {
        halted = true;
      }
      continue;
    }

    // step is a string task name
    const taskName = step;
    const task = config.workflow.tasks[taskName];

    if (!task) {
      warn(`workflow-engine: task "${taskName}" not found in workflow tasks, skipping`);
      continue;
    }

    // --- Null task path (agent: null) ---
    if (task.agent === null) {
      if (task.scope === 'per-run') {
        if (isTaskCompleted(state, taskName, PER_RUN_SENTINEL)) {
          warn(`workflow-engine: skipping completed task ${taskName} for ${PER_RUN_SENTINEL}`);
          continue;
        }
        try {
          const nullResult = await executeNullTask(
            task, taskName, PER_RUN_SENTINEL, state, config, lastOutputContract ?? undefined, accumulatedCostUsd,
          );
          state = nullResult.updatedState;
          lastOutputContract = nullResult.contract;
          tasksCompleted++;
        } catch (err: unknown) {
          const engineError = isEngineError(err)
            ? err
            : handleDispatchError(err, taskName, PER_RUN_SENTINEL);
          errors.push(engineError);
          state = recordErrorInState(state, taskName, PER_RUN_SENTINEL, engineError);
          writeWorkflowState(state, projectDir);
        }
      } else {
        for (const item of workItems) {
          processedStories.add(item.key);
          if (isTaskCompleted(state, taskName, item.key)) {
            warn(`workflow-engine: skipping completed task ${taskName} for ${item.key}`);
            continue;
          }
          try {
            const nullResult = await executeNullTask(
              task, taskName, item.key, state, config, lastOutputContract ?? undefined, accumulatedCostUsd,
            );
            state = nullResult.updatedState;
            lastOutputContract = nullResult.contract;
            tasksCompleted++;
          } catch (err: unknown) {
            const engineError = isEngineError(err)
              ? err
              : handleDispatchError(err, taskName, item.key);
            errors.push(engineError);
            state = recordErrorInState(state, taskName, item.key, engineError);
            writeWorkflowState(state, projectDir);
          }
        }
      }
      continue;
    }

    // --- Agent task path ---

    // Look up the agent definition
    const definition = config.agents[task.agent];
    if (!definition) {
      warn(`workflow-engine: agent "${task.agent}" not found for task "${taskName}", skipping`);
      continue;
    }

    if (task.scope === 'per-run') {
      // Skip if already completed (crash recovery — AC #3)
      if (isTaskCompleted(state, taskName, PER_RUN_SENTINEL)) {
        warn(`workflow-engine: skipping completed task ${taskName} for ${PER_RUN_SENTINEL}`);
        continue;
      }

      // Per-run: dispatch once with sentinel key
      try {
        const dispatchResult = await dispatchTaskWithResult(
          task, taskName, PER_RUN_SENTINEL, definition, state, config, undefined, lastOutputContract ?? undefined,
        );
        state = dispatchResult.updatedState;
        lastOutputContract = dispatchResult.contract;
        propagateVerifyFlags(taskName, dispatchResult.contract, projectDir);
        accumulatedCostUsd += dispatchResult.contract?.cost_usd ?? 0;
        tasksCompleted++;
      } catch (err: unknown) {
        const engineError = handleDispatchError(err, taskName, PER_RUN_SENTINEL);
        errors.push(engineError);
        if (config.onEvent) {
          config.onEvent({ type: 'dispatch-error', taskName, storyKey: PER_RUN_SENTINEL, error: { code: engineError.code, message: engineError.message } });
        } else {
          warn(`[${taskName}] ${PER_RUN_SENTINEL} — ERROR: [${engineError.code}] ${engineError.message}`);
        }

        // Record error checkpoint in state (AC #13)
        state = recordErrorInState(state, taskName, PER_RUN_SENTINEL, engineError);
        writeWorkflowState(state, projectDir);

        // Halt on critical errors
        if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) {
          halted = true;
        }
      }
    } else {
      // Per-story: dispatch once per work item
      for (const item of workItems) {
        if (config.abortSignal?.aborted) {
          halted = true;
          break;
        }
        processedStories.add(item.key);

        // Skip if already completed (crash recovery — AC #1, #2, #7)
        if (isTaskCompleted(state, taskName, item.key)) {
          warn(`workflow-engine: skipping completed task ${taskName} for ${item.key}`);
          continue;
        }

        try {
          const dispatchResult = await dispatchTaskWithResult(
            task, taskName, item.key, definition, state, config, undefined, lastOutputContract ?? undefined,
          );
          state = dispatchResult.updatedState;
          lastOutputContract = dispatchResult.contract;
          propagateVerifyFlags(taskName, dispatchResult.contract, projectDir);
          accumulatedCostUsd += dispatchResult.contract?.cost_usd ?? 0;
          tasksCompleted++;
        } catch (err: unknown) {
          const engineError = handleDispatchError(err, taskName, item.key);
          errors.push(engineError);
          if (config.onEvent) {
            config.onEvent({ type: 'dispatch-error', taskName, storyKey: item.key, error: { code: engineError.code, message: engineError.message } });
          } else {
            warn(`[${taskName}] ${item.key} — ERROR: [${engineError.code}] ${engineError.message}`);
          }

          // Record error checkpoint in state (AC #13)
          state = recordErrorInState(state, taskName, item.key, engineError);
          writeWorkflowState(state, projectDir);

          // Halt on critical errors, continue on UNKNOWN
          if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) {
            halted = true;
            break;
          }
          // UNKNOWN errors: record and continue to next story
          continue;
        }
      }
    }
  }

  // 4. Set final phase if no errors and phase not already set by loop/interrupt
  if (state.phase === 'interrupted') {
    // Already written by abort handler — don't overwrite
  } else if (errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
    state = { ...state, phase: 'completed' };
    writeWorkflowState(state, projectDir);
  }

  // 5. Return result
  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
  return {
    success: errors.length === 0 && !loopTerminated && state.phase !== 'interrupted',
    tasksCompleted,
    storiesProcessed: processedStories.size,
    errors,
    durationMs: Date.now() - startMs,
  };
}

// --- Error Handling ---

/**
 * Record a dispatch error in workflow state: set phase to "error" and append
 * a TaskCheckpoint with the error details (AC #13).
 */
function recordErrorInState(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
  error: EngineError,
): WorkflowState {
  const errorCheckpoint: TaskCheckpoint = {
    task_name: taskName,
    story_key: storyKey,
    completed_at: new Date().toISOString(),
    error: true,
    error_message: error.message,
    error_code: error.code,
  };
  return {
    ...state,
    phase: 'error',
    tasks_completed: [...state.tasks_completed, errorCheckpoint],
  };
}

function isEngineError(err: unknown): err is EngineError {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  return typeof e.taskName === 'string' && typeof e.storyKey === 'string'
    && typeof e.code === 'string' && typeof e.message === 'string';
}

function handleDispatchError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (err instanceof DispatchError) {
    return {
      taskName,
      storyKey,
      code: err.code,
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    taskName,
    storyKey,
    code: 'UNKNOWN',
    message,
  };
}
