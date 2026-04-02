import type { WorkflowState } from './workflow-state.js';

// --- Functions ---

/**
 * Sanitize a string segment for use in a trace ID.
 *
 * Replaces non-alphanumeric characters (except hyphens) with hyphens,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 */
export function sanitizeSegment(segment: string): string {
  return segment
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Maximum length for individual segments (runId, taskName) after sanitization. */
const MAX_SEGMENT_LENGTH = 128;

/**
 * Generate a trace ID for a workflow iteration.
 *
 * Format: `ch-{runId}-{iteration}-{taskName}`
 *
 * The `runId` and `taskName` segments are sanitized to be safe for logs,
 * metrics labels, HTTP headers, and YAML serialization.
 *
 * Throws if `iteration` is not a non-negative integer.
 */
export function generateTraceId(
  runId: string,
  iteration: number,
  taskName: string,
): string {
  if (!Number.isInteger(iteration) || iteration < 0) {
    throw new Error(
      `generateTraceId: iteration must be a non-negative integer, got ${iteration}`,
    );
  }

  const safeRunId = sanitizeSegment(runId).slice(0, MAX_SEGMENT_LENGTH);
  const safeTask = sanitizeSegment(taskName).slice(0, MAX_SEGMENT_LENGTH);
  return `ch-${safeRunId}-${iteration}-${safeTask}`;
}

/**
 * Format a trace ID as a system prompt fragment for agent injection.
 *
 * Returns a structured block that an agent can include in log/metric/trace output.
 *
 * Throws if `traceId` is empty.
 */
export function formatTracePrompt(traceId: string): string {
  if (!traceId) {
    throw new Error('formatTracePrompt: traceId must be a non-empty string');
  }
  return `[TRACE] trace_id=${traceId}\nInclude this trace ID in all log output, metric labels, and trace spans for correlation.`;
}

/**
 * Record a trace ID in workflow state.
 *
 * Returns a **new** WorkflowState with the trace ID appended to `trace_ids`.
 * Does not mutate the input state.
 *
 * Throws if `traceId` is empty.
 */
export function recordTraceId(
  traceId: string,
  state: WorkflowState,
): WorkflowState {
  if (!traceId) {
    throw new Error('recordTraceId: traceId must be a non-empty string');
  }

  return {
    ...state,
    trace_ids: [...(state.trace_ids ?? []), traceId],
  };
}
