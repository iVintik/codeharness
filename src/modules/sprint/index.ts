/**
 * Sprint module — story selection, status tracking, reporting.
 */

import { fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { StoryStatus } from '../../types/state.js';
import type { SprintState } from '../../types/state.js';
import type { StorySelection, StoryDetail, StatusReport } from './types.js';
import {
  getSprintState as getSprintStateImpl,
  updateStoryStatus as updateStoryStatusImpl,
} from './state.js';

export type { StorySelection, StoryDetail, StatusReport };

export function getNextStory(): Result<StorySelection | null> {
  return fail('not implemented');
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
  return fail('not implemented');
}
