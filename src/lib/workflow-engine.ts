import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { warn } from './output.js';
import { dispatchAgent, DispatchError } from './agent-dispatch.js';
import type { DispatchOptions, DispatchResult } from './agent-dispatch.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedWorkflow, ResolvedTask, FlowStep, LoopBlock } from './workflow-parser.js';
import {
  readWorkflowState,
  writeWorkflowState,
} from './workflow-state.js';
import type { WorkflowState, TaskCheckpoint } from './workflow-state.js';
import { createIsolatedWorkspace } from './source-isolation.js';
import { generateTraceId, formatTracePrompt, recordTraceId } from './trace-id.js';
import { resolveSessionId, recordSessionId } from './session-manager.js';
import type { SessionLookupKey } from './session-manager.js';

// --- Interfaces ---

/**
 * Configuration for the workflow engine.
 */
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
}

/**
 * Evaluator verdict returned by a verify task (AD5).
 */
export interface EvaluatorVerdict {
  verdict: 'pass' | 'fail';
  score: {
    passed: number;
    failed: number;
    unknown: number;
    total: number;
  };
  findings: Array<{
    ac: number;
    description: string;
    status: 'pass' | 'fail' | 'unknown';
    evidence: {
      commands_run: string[];
      output_observed: string;
      reasoning: string;
    };
  }>;
  evaluator_trace_id?: string;
  duration_seconds?: number;
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
const PER_RUN_SENTINEL = '__run__';

/** DispatchError codes that should halt execution immediately. */
const HALT_ERROR_CODES = new Set(['RATE_LIMIT', 'NETWORK', 'SDK_INIT']);

/** Default maximum loop iterations before termination. */
const DEFAULT_MAX_ITERATIONS = 5;

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
): Promise<WorkflowState> {
  const { updatedState } = await dispatchTaskWithResult(
    task, taskName, storyKey, definition, state, config, customPrompt,
  );
  return updatedState;
}

// --- Flow Step Type Guard ---

function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step;
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
): Promise<{ updatedState: WorkflowState; output: string }> {
  const projectDir = config.projectDir ?? process.cwd();

  // 1. Generate trace ID
  const traceId = generateTraceId(config.runId, state.iteration, taskName);

  // 2. Format trace prompt
  const tracePrompt = formatTracePrompt(traceId);

  // 3. Resolve session ID
  const sessionKey: SessionLookupKey = { taskName, storyKey };
  const sessionId = resolveSessionId(task.session, sessionKey, state);

  // 4. Build dispatch options based on source_access
  let dispatchOptions: DispatchOptions;
  let workspace: Awaited<ReturnType<typeof createIsolatedWorkspace>> | null = null;

  if (task.source_access === false) {
    workspace = await createIsolatedWorkspace({ runId: config.runId, storyFiles: [] });
    dispatchOptions = {
      ...workspace.toDispatchOptions(),
      sessionId,
      appendSystemPrompt: tracePrompt,
    };
  } else {
    dispatchOptions = {
      cwd: projectDir,
      sessionId,
      appendSystemPrompt: tracePrompt,
    };
  }

  // 5. Construct prompt
  const prompt = customPrompt
    ?? (storyKey === PER_RUN_SENTINEL
      ? `Execute task "${taskName}" for the current run.`
      : `Implement story ${storyKey}`);

  // 6. Dispatch agent
  let result: DispatchResult;
  try {
    result = await dispatchAgent(definition, prompt, dispatchOptions);
  } finally {
    // Cleanup workspace regardless of dispatch success/failure
    if (workspace) {
      await workspace.cleanup();
    }
  }

  // 7. Record session ID (if dispatch returned one)
  let updatedState = state;
  if (result.sessionId) {
    updatedState = recordSessionId(sessionKey, result.sessionId, updatedState);
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

  // 8. Record trace ID
  updatedState = recordTraceId(traceId, updatedState);

  // 9. Write state to disk
  writeWorkflowState(updatedState, projectDir);

  return { updatedState, output: result.output };
}

// --- Verdict Parsing (Task 2) ---

/**
 * Attempt to parse a DispatchResult.output string as an EvaluatorVerdict.
 * Returns null if parsing fails or required fields are missing.
 */
export function parseVerdict(output: string): EvaluatorVerdict | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch { // IGNORE: invalid JSON means no verdict — return null
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;

  // Validate required top-level fields
  if (obj.verdict !== 'pass' && obj.verdict !== 'fail') return null;
  if (!obj.score || typeof obj.score !== 'object') return null;
  if (!Array.isArray(obj.findings)) return null;

  const score = obj.score as Record<string, unknown>;
  if (typeof score.passed !== 'number') return null;
  if (typeof score.failed !== 'number') return null;
  if (typeof score.unknown !== 'number') return null;
  if (typeof score.total !== 'number') return null;

  return parsed as EvaluatorVerdict;
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
}

/**
 * Execute a loop block: iterate tasks until pass, max iterations, or circuit breaker.
 */
export async function executeLoopBlock(
  loopBlock: LoopBlock,
  state: WorkflowState,
  config: EngineConfig,
  workItems: WorkItem[],
): Promise<LoopBlockResult> {
  const projectDir = config.projectDir ?? process.cwd();
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const errors: EngineError[] = [];
  let tasksCompleted = 0;
  let currentState = state;
  let lastVerdict: EvaluatorVerdict | null = null;

  // Handle empty loop block
  if (loopBlock.loop.length === 0) {
    return { state: currentState, errors, tasksCompleted, halted: false };
  }

  while (true) {
    // 1. Increment iteration
    currentState = {
      ...currentState,
      iteration: currentState.iteration + 1,
    };
    writeWorkflowState(currentState, projectDir);

    let haltedInLoop = false;

    // 2. Execute each task in the loop
    for (const taskName of loopBlock.loop) {
      const task = config.workflow.tasks[taskName];
      if (!task) {
        warn(`workflow-engine: task "${taskName}" not found in workflow tasks, skipping`);
        continue;
      }

      const definition = config.agents[task.agent];
      if (!definition) {
        warn(`workflow-engine: agent "${task.agent}" not found for task "${taskName}", skipping`);
        continue;
      }

      if (task.scope === 'per-story') {
        // Determine which items to dispatch for
        const itemsToRetry = lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems;

        for (const item of itemsToRetry) {
          // Build prompt: inject findings if we have a previous verdict
          const prompt = lastVerdict
            ? buildRetryPrompt(item.key, lastVerdict.findings)
            : undefined;

          try {
            currentState = await dispatchTask(
              task, taskName, item.key, definition, currentState, config, prompt,
            );
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
        try {
          // We need the dispatch result output to parse verdict
          // dispatchTask doesn't return the DispatchResult directly, so we
          // intercept via a wrapper that captures the output
          const dispatchResult = await dispatchTaskWithResult(
            task, taskName, PER_RUN_SENTINEL, definition, currentState, config,
          );
          currentState = dispatchResult.updatedState;
          tasksCompleted++;

          // Attempt to parse verdict from output
          const verdict = parseVerdict(dispatchResult.output);
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
      return { state: currentState, errors, tasksCompleted, halted: true };
    }

    // 3. Check termination conditions
    if (lastVerdict?.verdict === 'pass') {
      // Success: loop passes
      return { state: currentState, errors, tasksCompleted, halted: false };
    }

    if (currentState.iteration >= maxIterations) {
      currentState = { ...currentState, phase: 'max-iterations' };
      writeWorkflowState(currentState, projectDir);
      return { state: currentState, errors, tasksCompleted, halted: false };
    }

    if (currentState.circuit_breaker.triggered) {
      currentState = { ...currentState, phase: 'circuit-breaker' };
      writeWorkflowState(currentState, projectDir);
      return { state: currentState, errors, tasksCompleted, halted: false };
    }
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
  state = {
    ...state,
    phase: 'executing',
    started: state.started || new Date().toISOString(),
    workflow_name: config.workflow.flow.filter((s) => typeof s === 'string').join(' -> '),
  };
  writeWorkflowState(state, projectDir);

  // 2. Load work items
  const workItems = loadWorkItems(config.sprintStatusPath, config.issuesPath);

  // 3. Iterate through flow steps
  let halted = false;
  for (const step of config.workflow.flow) {
    if (halted) break;

    // Execute loop blocks
    if (isLoopBlock(step)) {
      const loopResult = await executeLoopBlock(step, state, config, workItems);
      state = loopResult.state;
      errors.push(...loopResult.errors);
      tasksCompleted += loopResult.tasksCompleted;

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

    // Look up the agent definition
    const definition = config.agents[task.agent];
    if (!definition) {
      warn(`workflow-engine: agent "${task.agent}" not found for task "${taskName}", skipping`);
      continue;
    }

    if (task.scope === 'per-run') {
      // Per-run: dispatch once with sentinel key
      try {
        state = await dispatchTask(task, taskName, PER_RUN_SENTINEL, definition, state, config);
        tasksCompleted++;
      } catch (err: unknown) {
        const engineError = handleDispatchError(err, taskName, PER_RUN_SENTINEL);
        errors.push(engineError);

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
        processedStories.add(item.key);
        try {
          state = await dispatchTask(task, taskName, item.key, definition, state, config);
          tasksCompleted++;
        } catch (err: unknown) {
          const engineError = handleDispatchError(err, taskName, item.key);
          errors.push(engineError);

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

  // 4. Set final phase if no errors and phase not already set by loop termination
  if (errors.length === 0 && state.phase !== 'max-iterations' && state.phase !== 'circuit-breaker') {
    state = { ...state, phase: 'completed' };
    writeWorkflowState(state, projectDir);
  }

  // 5. Return result
  const loopTerminated = state.phase === 'max-iterations' || state.phase === 'circuit-breaker';
  return {
    success: errors.length === 0 && !loopTerminated,
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
  };
  return {
    ...state,
    phase: 'error',
    tasks_completed: [...state.tasks_completed, errorCheckpoint],
  };
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
