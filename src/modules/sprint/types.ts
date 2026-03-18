/**
 * Types for the sprint module.
 */

import type { StoryStatus } from '../../types/state.js';

/** A story selected for development */
export interface StorySelection {
  readonly key: string;
  readonly title: string;
  readonly priority: number;
}

/** Detail to attach when updating story status */
export interface StoryDetail {
  readonly error?: string;
  readonly proofPath?: string;
}

/** Summary report of sprint status */
export interface StatusReport {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly blocked: number;
  readonly inProgress: string | null;
  readonly storyStatuses: ReadonlyArray<{
    readonly key: string;
    readonly status: StoryStatus;
  }>;
}
