import type { WorkflowState, TaskCheckpoint } from './workflow-state.js';

// --- Types ---

/** Session boundary mode as defined in workflow YAML schema. */
export type SessionBoundary = 'fresh' | 'continue';

/** Key that uniquely identifies a task+story combination for session lookup. */
export interface SessionLookupKey {
  taskName: string;
  storyKey: string;
  runId?: string;
}

// --- Functions ---

/**
 * Resolve the session ID to use for a dispatch call.
 *
 * - `fresh`: always returns undefined (new session).
 * - `continue`: returns the most recent session ID for the task+story pair,
 *    or undefined if none exists (first invocation falls back to fresh).
 *
 * Does NOT cache — always reads from the supplied WorkflowState for crash-recovery safety.
 */
export function resolveSessionId(
  boundary: SessionBoundary,
  key: SessionLookupKey,
  state: WorkflowState,
): string | undefined {
  if (boundary === 'fresh') {
    return undefined;
  }

  if (boundary !== 'continue') {
    // Defensive: unknown boundary value treated as fresh (safe default).
    return undefined;
  }

  return getLastSessionId(state, key.taskName, key.storyKey, key.runId);
}

/**
 * Record a session ID on a new TaskCheckpoint in the workflow state.
 *
 * Returns a **new** WorkflowState (does not mutate the input).
 *
 * Appends a new checkpoint entry with `session_id`, `task_name`, `story_key`,
 * and `completed_at` (set to current time). The workflow engine (story 5-1)
 * may enrich the checkpoint with additional fields after creation.
 *
 * Throws if `sessionId` is empty — an empty session ID indicates an SDK bug
 * and must not be silently recorded.
 */
export function recordSessionId(
  key: SessionLookupKey,
  sessionId: string,
  state: WorkflowState,
): WorkflowState {
  if (!sessionId) {
    throw new Error('recordSessionId: sessionId must be a non-empty string');
  }

  const checkpoint: TaskCheckpoint = {
    task_name: key.taskName,
    story_key: key.storyKey,
    completed_at: new Date().toISOString(),
    run_id: key.runId,
    session_id: sessionId,
  };

  return {
    ...state,
    tasks_completed: [...state.tasks_completed, checkpoint],
  };
}

/**
 * Find the most recent session ID for a given task+story pair.
 *
 * Searches `tasks_completed` in reverse order so the most recent checkpoint
 * (including from loop iterations) is found first.
 *
 * Returns undefined when no matching checkpoint exists.
 */
export function getLastSessionId(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
  runId?: string,
): string | undefined {
  const tasks = state.tasks_completed;

  for (let i = tasks.length - 1; i >= 0; i--) {
    const cp = tasks[i];
    const sameRun = runId === undefined || cp.run_id === undefined || cp.run_id === runId;
    if (sameRun && cp.task_name === taskName && cp.story_key === storyKey && cp.session_id !== undefined) {
      return cp.session_id;
    }
  }

  return undefined;
}
