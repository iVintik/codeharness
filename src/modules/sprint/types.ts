/**
 * Types for the sprint module.
 */

import type { StoryStatus, ActionItem, AcVerdict } from '../../types/state.js';

/** Partial update for live run progress fields */
export interface RunProgressUpdate {
  readonly currentStory?: string | null;
  readonly currentPhase?: 'create' | 'dev' | 'review' | 'verify' | null;
  readonly lastAction?: string | null;
  readonly acProgress?: string | null;
}

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

/** Detail for a single acceptance criterion in a drill-down view */
export interface AcDetail {
  readonly id: string;
  readonly verdict: AcVerdict;
  readonly command?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly reason?: string;
  readonly suggestedFix?: string;
}

/** Record of a single verification attempt */
export interface AttemptRecord {
  readonly number: number;
  readonly outcome: string;
  readonly failingAc?: string;
  readonly timestamp?: string;
}

/** Summary of a proof document */
export interface ProofSummary {
  readonly path: string;
  readonly passCount: number;
  readonly failCount: number;
  readonly escalateCount: number;
  readonly pendingCount: number;
}

/** Full drill-down detail for a single story */
export interface StoryDrillDown {
  readonly key: string;
  readonly status: StoryStatus;
  readonly epic: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastAttempt: string | null;
  readonly acDetails: ReadonlyArray<AcDetail>;
  readonly attemptHistory: ReadonlyArray<AttemptRecord>;
  readonly proofSummary: ProofSummary | null;
  readonly timeoutSummary: TimeoutSummary | null;
}

/** Data captured during a timeout event */
export interface TimeoutCapture {
  readonly storyKey: string;
  readonly iteration: number;
  readonly durationMinutes: number;
  readonly gitDiff: string;
  readonly stateDelta: string;
  readonly partialStderr: string;
  readonly timestamp: string;
}

/** A timeout report with file path and captured data */
export interface TimeoutReport {
  readonly filePath: string;
  readonly capture: TimeoutCapture;
}

/** Summary of the latest timeout for a story, shown in drill-down */
export interface TimeoutSummary {
  readonly reportPath: string;
  readonly iteration: number;
  readonly durationMinutes: number;
  readonly filesChanged: number;
}

/** A single failing acceptance criterion extracted from a proof document */
export interface FailingAc {
  readonly acNumber: number;
  readonly description: string;
  readonly errorOutput: string;
  readonly verdict: string;
}

/** Result of processing a verification proof for the feedback loop */
export interface FeedbackResult {
  readonly storyKey: string;
  readonly action: 'return-to-dev' | 'mark-done' | 'mark-blocked';
  readonly failingAcs: ReadonlyArray<FailingAc>;
  readonly attempts: number;
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
