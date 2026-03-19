/**
 * Sprint state types matching architecture decision 2: Unified State Format.
 */

/** All possible story statuses */
export type StoryStatus =
  | 'backlog'
  | 'ready'
  | 'in-progress'
  | 'review'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'blocked';

/** Verdict for a single acceptance criterion check */
export type AcVerdict = 'pass' | 'fail' | 'escalate' | 'pending';

/** Result of checking one acceptance criterion */
export interface AcResult {
  readonly id: string;
  readonly verdict: AcVerdict;
}

/** State of an individual story */
export interface StoryState {
  readonly status: StoryStatus;
  readonly attempts: number;
  readonly lastAttempt: string | null;
  readonly lastError: string | null;
  readonly proofPath: string | null;
  readonly acResults: AcResult[] | null;
}

/** Source of an action item */
export type ActionItemSource = 'verification' | 'retro' | 'manual';

/** An action item tracked across sprints */
export interface ActionItem {
  readonly id: string;
  readonly story: string;
  readonly description: string;
  readonly source: ActionItemSource;
  readonly resolved: boolean;
}

/** Top-level sprint state persisted to disk */
export interface SprintState {
  readonly version: 1;
  readonly sprint: {
    readonly total: number;
    readonly done: number;
    readonly failed: number;
    readonly blocked: number;
    readonly inProgress: string | null;
  };
  readonly stories: Record<string, StoryState>;
  readonly run: {
    readonly active: boolean;
    readonly startedAt: string | null;
    readonly iteration: number;
    readonly cost: number;
    readonly completed: string[];
    readonly failed: string[];
    readonly currentStory: string | null;
    readonly currentPhase: 'create' | 'dev' | 'review' | 'verify' | null;
    readonly lastAction: string | null;
    readonly acProgress: string | null;
  };
  readonly actionItems: ActionItem[];
}
