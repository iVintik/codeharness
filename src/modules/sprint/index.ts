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
} from './types.js';
import {
  getSprintState as getSprintStateImpl,
  updateStoryStatus as updateStoryStatusImpl,
} from './state.js';
import { selectNextStory } from './selector.js';
import { generateReport as generateReportImpl } from './reporter.js';

export type {
  StorySelection,
  StoryDetail,
  StatusReport,
  SelectionResult,
  FailedStoryDetail,
  LabeledActionItem,
  RunSummary,
};

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
