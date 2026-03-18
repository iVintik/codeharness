/**
 * Types for the sprint module.
 */

import type { StoryStatus, ActionItem } from '../../types/state.js';

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

/** Info about a story blocked due to retry exhaustion */
export interface RetryExhaustedInfo {
  readonly key: string;
  readonly attempts: number;
  readonly reason: 'retry-exhausted';
}

/** Full result of story selection, including side-effect recommendations */
export interface SelectionResult {
  readonly selected: StorySelection | null;
  readonly retryExhausted: ReadonlyArray<RetryExhaustedInfo>;
}

/** Detail about a failed story for reporting */
export interface FailedStoryDetail {
  readonly key: string;
  readonly acNumber: number | null;
  readonly errorLine: string;
  readonly attempts: number;
  readonly maxAttempts: number;
}

/** An action item with a NEW or CARRIED label */
export interface LabeledActionItem {
  readonly item: ActionItem;
  readonly label: 'NEW' | 'CARRIED';
}

/** Summary of a run (active or completed) */
export interface RunSummary {
  readonly duration: string;
  readonly cost: number;
  readonly iterations: number;
  readonly completed: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<string>;
  readonly blocked: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<string>;
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
  readonly epicsTotal: number;
  readonly epicsDone: number;
  readonly sprintPercent: number;
  readonly activeRun: RunSummary | null;
  readonly lastRun: RunSummary | null;
  readonly failedDetails: ReadonlyArray<FailedStoryDetail>;
  readonly actionItemsLabeled: ReadonlyArray<LabeledActionItem>;
}
