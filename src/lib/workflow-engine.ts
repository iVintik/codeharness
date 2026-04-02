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
): Promise<WorkflowState> {
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
  const prompt = storyKey === PER_RUN_SENTINEL
    ? `Execute task "${taskName}" for the current run.`
    : `Implement story ${storyKey}`;

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

  return updatedState;
}

// --- Flow Step Type Guard ---

function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step;
}

// --- Main Execution ---

/**
 * Execute a workflow sequentially: iterate through flow steps, dispatch tasks
 * per-story or per-run, checkpoint state after each dispatch.
 *
 * Loop blocks are skipped with a warning (story 5-2).
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

    // Skip loop blocks (story 5-2)
    if (isLoopBlock(step)) {
      warn('workflow-engine: loop blocks are not yet implemented (story 5-2), skipping');
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

  // 4. Set final phase if no errors
  if (errors.length === 0) {
    state = { ...state, phase: 'completed' };
    writeWorkflowState(state, projectDir);
  }

  // 5. Return result
  return {
    success: errors.length === 0,
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
