/**
 * Sprint module — story selection, status tracking, reporting.
 */

import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { StoryStatus } from '../../types/state.js';
import type { SprintState } from '../../types/state.js';
import type {
  StorySelection,
  StoryDetail,
  StatusReport,
  SelectionResult,
  FailedStoryDetail,
  LabeledActionItem,
  RunSummary,
  StoryDrillDown,
  TimeoutReport,
  TimeoutCapture,
  FeedbackResult,
  FailingAc,
  TimeoutSummary,
  RunProgressUpdate,
} from './types.js';
import {
  getSprintState as getSprintStateImpl,
  updateStoryStatus as updateStoryStatusImpl,
  writeStateAtomic as writeStateAtomicImpl,
  computeSprintCounts as computeSprintCountsImpl,
  updateRunProgress as updateRunProgressImpl,
  clearRunProgress as clearRunProgressImpl,
  generateSprintStatusYaml as generateSprintStatusYamlImpl,
  getStoryStatusesFromState as getStoryStatusesFromStateImpl,
  reconcileState as reconcileStateImpl,
} from './state.js';
import type { ReconciliationResult } from './state.js';
import { selectNextStory } from './selector.js';
import { generateReport as generateReportImpl, getStoryDrillDown as getStoryDrillDownImpl } from './reporter.js';
import { captureTimeoutReport as captureTimeoutReportImpl, findLatestTimeoutReport as findLatestTimeoutReportImpl } from './timeout.js';
import { processVerifyResult as processVerifyResultImpl } from './feedback.js';
import { validateStateConsistency as validateStateConsistencyImpl } from './validator.js';
import type { ValidationReport, ValidationIssue } from './validator.js';

export type {
  StorySelection,
  StoryDetail,
  StatusReport,
  SelectionResult,
  FailedStoryDetail,
  LabeledActionItem,
  RunSummary,
  StoryDrillDown,
  TimeoutReport,
  TimeoutCapture,
  TimeoutSummary,
  FeedbackResult,
  FailingAc,
  RunProgressUpdate,
};

export type { ValidationReport, ValidationIssue };
export type { ReconciliationResult };

/**
 * Select the next actionable story.
 * Also marks retry-exhausted stories as blocked (AC #2).
 */
export function getNextStory(): Result<SelectionResult> {
  const stateResult = getSprintStateImpl();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const selectionResult = selectNextStory(stateResult.data);
  if (!selectionResult.success) {
    return fail(selectionResult.error);
  }

  // Side-effect: mark retry-exhausted stories as blocked (AC #2)
  for (const exhausted of selectionResult.data.retryExhausted) {
    updateStoryStatusImpl(exhausted.key, 'blocked', {
      error: 'retry-exhausted',
    });
  }

  return ok(selectionResult.data);
}

export function updateStoryStatus(
  key: string,
  status: StoryStatus,
  detail?: StoryDetail,
): Result<void> {
  return updateStoryStatusImpl(key, status, detail);
}

export function getSprintState(): Result<SprintState> {
  return getSprintStateImpl();
}

export function generateReport(): Result<StatusReport> {
  const stateResult = getSprintStateImpl();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }
  return generateReportImpl(stateResult.data);
}

export function getStoryDrillDown(key: string): Result<StoryDrillDown> {
  const stateResult = getSprintStateImpl();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  // Look up latest timeout report for this story
  const timeoutResult = findLatestTimeoutReportImpl(key);
  const timeoutSummary = timeoutResult.success ? timeoutResult.data : null;

  return getStoryDrillDownImpl(stateResult.data, key, { timeoutSummary });
}

export function captureTimeoutReport(opts: {
  storyKey: string;
  iteration: number;
  durationMinutes: number;
  outputFile: string;
  stateSnapshotPath: string;
}): Result<TimeoutReport> {
  return captureTimeoutReportImpl(opts);
}

export function processVerifyResult(
  storyKey: string,
  opts?: { maxAttempts?: number },
): Result<FeedbackResult> {
  return processVerifyResultImpl(storyKey, opts);
}

export function validateStateConsistency(
  statePath: string,
  sprintStatusPath: string,
): Result<ValidationReport> {
  return validateStateConsistencyImpl(statePath, sprintStatusPath);
}

export function writeStateAtomic(state: SprintState): Result<void> {
  return writeStateAtomicImpl(state);
}

export function computeSprintCounts(
  stories: Record<string, import('../../types/state.js').StoryState>,
): SprintState['sprint'] {
  return computeSprintCountsImpl(stories);
}

export function updateRunProgress(update: RunProgressUpdate): Result<void> {
  return updateRunProgressImpl(update);
}

export function clearRunProgress(): Result<void> {
  return clearRunProgressImpl();
}

export function generateSprintStatusYaml(state: SprintState): string {
  return generateSprintStatusYamlImpl(state);
}

export function getStoryStatusesFromState(state: SprintState): Record<string, string> {
  return getStoryStatusesFromStateImpl(state);
}

/**
 * Reconcile sprint state on session start.
 * Merges orphaned files, validates epic consistency, regenerates YAML.
 */
export function reconcileState(): Result<ReconciliationResult> {
  return reconcileStateImpl();
}

/**
 * Read sprint state and derive story statuses as a flat map.
 * Drop-in replacement for the old readSprintStatus() that parsed YAML.
 */
export function readSprintStatusFromState(): Record<string, string> {
  const stateResult = getSprintStateImpl();
  if (!stateResult.success) return {};
  return getStoryStatusesFromStateImpl(stateResult.data);
}
