/**
 * Sprint module — story selection, status tracking, reporting.
 */

import { fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { StoryStatus } from '../../types/state.js';
import type { SprintState } from '../../types/state.js';
import type { StorySelection, StoryDetail, StatusReport } from './types.js';

export type { StorySelection, StoryDetail, StatusReport };

export function getNextStory(): Result<StorySelection | null> {
  return fail('not implemented');
}

export function updateStoryStatus(
  _key: string,
  _status: StoryStatus,
  _detail?: StoryDetail,
): Result<void> {
  return fail('not implemented');
}

export function getSprintState(): Result<SprintState> {
  return fail('not implemented');
}

export function generateReport(): Result<StatusReport> {
  return fail('not implemented');
}
