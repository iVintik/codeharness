/**
 * workflow-compiler.ts — pure helpers, no IO, no XState, no side effects.
 *
 * Contains constants, interfaces, and pure functions for the engine.
 * Dependency direction flows one way: the machine imports from here.
 */

import type { WorkflowState, TaskCheckpoint } from './workflow-state.js';
import { DispatchError } from './agent-dispatch.js';
import { WorkflowError, isEngineError, isLoopBlock } from './workflow-types.js';
import type { EvaluatorVerdict, WorkItem, EngineError } from './workflow-types.js';
export { isEngineError, isLoopBlock } from './workflow-types.js';
export type { OutputContract, DriverHealth, WorkItem, EngineError, EngineResult, LoopBlockResult } from './workflow-types.js';

// ─── Constants ───────────────────────────────────────────────────────

export const HALT_ERROR_CODES = new Set(['RATE_LIMIT', 'NETWORK', 'SDK_INIT']);
export const DEFAULT_MAX_ITERATIONS = 5;
export const PER_RUN_SENTINEL = '__run__';

// ─── Task Completion Checks ───────────────────────────────────────────

export function isTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
): boolean {
  return state.tasks_completed.some(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  );
}

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

// ─── Retry / Verdict Helpers ──────────────────────────────────────────

export function buildRetryPrompt(storyKey: string, findings: EvaluatorVerdict['findings']): string {
  const failedFindings = findings.filter((f) => f.status === 'fail' || f.status === 'unknown');
  if (failedFindings.length === 0) return `Implement story ${storyKey}`;
  const formatted = failedFindings
    .map((f) => {
      let entry = `AC #${f.ac} (${f.status.toUpperCase()}): ${f.description}`;
      if (f.evidence?.reasoning) entry += `\n  Evidence: ${f.evidence.reasoning}`;
      return entry;
    })
    .join('\n\n');
  return `Retry story ${storyKey}. Previous evaluator findings:\n\n${formatted}\n\nFocus on fixing the failed criteria above. BEFORE finishing: run \`npx eslint src/ --fix\` to auto-fix lint issues, then run \`npx eslint src/\` to verify zero warnings. If warnings remain, fix them manually. Also run \`npm run build\` and \`npx vitest run\` to verify no regressions.`;
}

export function buildAllUnknownVerdict(
  workItems: WorkItem[],
  reasoning: string,
): EvaluatorVerdict {
  const findings = workItems.map((_, index) => ({
    ac: index + 1,
    description: `AC #${index + 1}`,
    status: 'unknown' as const,
    evidence: { commands_run: [] as string[], output_observed: '', reasoning },
  }));
  return { verdict: 'fail', score: { passed: 0, failed: 0, unknown: findings.length, total: findings.length }, findings };
}

export function getFailedItems(verdict: EvaluatorVerdict | null, allItems: WorkItem[]): WorkItem[] {
  if (!verdict) return allItems;
  if (verdict.verdict === 'pass') return [];
  return allItems;
}

// ─── Error Handling ───────────────────────────────────────────────────

export function recordErrorInState(state: WorkflowState, taskName: string, storyKey: string, error: EngineError): WorkflowState {
  const errorCheckpoint: TaskCheckpoint = {
    task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString(),
    error: true, error_message: error.message, error_code: error.code,
  };
  return { ...state, phase: 'error', tasks_completed: [...state.tasks_completed, errorCheckpoint] };
}

export function handleDispatchError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (err instanceof WorkflowError) return err;
  if (err instanceof DispatchError) return new WorkflowError(err.message, err.code, taskName, storyKey);
  const message = err instanceof Error ? err.message : String(err);
  return new WorkflowError(message, 'UNKNOWN', taskName, storyKey);
}
