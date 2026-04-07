/**
 * Sprint state types matching architecture decision 2: Unified State Format.
 */

/** All possible story statuses */
export type StoryStatus =
  | 'backlog'
  | 'ready'
  | 'in-progress'
  | 'review'
  | 'checked'
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

/** State of an epic within the sprint */
export interface EpicState {
  readonly status: string;
  readonly name?: string;
  readonly storiesTotal: number;
  readonly storiesDone: number;
}

/** Session runtime state */
export interface SessionState {
  readonly active: boolean;
  readonly startedAt: string | null;
  readonly iteration: number;
  readonly elapsedSeconds: number;
}

/** Observability coverage metrics */
export interface ObservabilityState {
  readonly statementCoverage: number | null;
  readonly branchCoverage: number | null;
  readonly functionCoverage: number | null;
  readonly lineCoverage: number | null;
}

/** V1 sprint state (original schema) */
export interface SprintStateV1 {
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

/** V2 sprint state (unified schema with versioning) */
export interface SprintStateV2 {
  readonly version: 2;
  readonly sprint: {
    readonly total: number;
    readonly done: number;
    readonly failed: number;
    readonly blocked: number;
    readonly inProgress: string | null;
  };
  readonly stories: Record<string, StoryState>;
  readonly retries: Record<string, number>;
  readonly flagged: string[];
  readonly epics: Record<string, EpicState>;
  readonly session: SessionState;
  readonly observability: ObservabilityState;
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

/** Union of all sprint state versions */
export type SprintStateAny = SprintStateV1 | SprintStateV2;

/** Top-level sprint state — alias for current version (v2) */
export type SprintState = SprintStateV2;
