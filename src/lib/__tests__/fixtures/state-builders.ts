/**
 * Builder factories for SprintState and related test data.
 *
 * Produces valid SprintStateV2 objects with sensible defaults.
 * Use `buildSprintState(overrides)` for top-level state and
 * `buildStoryEntry(overrides)` for individual story entries.
 */

import type {
  SprintState,
  StoryState,
  EpicState,
  SessionState,
  ObservabilityState,
  ActionItem,
} from '../../../types/state.js';

/** Default story state with "backlog" status and zero attempts */
const DEFAULT_STORY_STATE: StoryState = {
  status: 'backlog',
  attempts: 0,
  lastAttempt: null,
  lastError: null,
  proofPath: null,
  acResults: null,
};

/** Default session state — inactive */
const DEFAULT_SESSION_STATE: SessionState = {
  active: false,
  startedAt: null,
  iteration: 0,
  elapsedSeconds: 0,
};

/** Default observability state — no coverage data */
const DEFAULT_OBSERVABILITY_STATE: ObservabilityState = {
  statementCoverage: null,
  branchCoverage: null,
  functionCoverage: null,
  lineCoverage: null,
};

/** Default run state — inactive */
const DEFAULT_RUN_STATE: SprintState['run'] = {
  active: false,
  startedAt: null,
  iteration: 0,
  cost: 0,
  completed: [],
  failed: [],
  currentStory: null,
  currentPhase: null,
  lastAction: null,
  acProgress: null,
};

/**
 * Build a valid SprintStateV2 object with sensible defaults.
 * Pass partial overrides to customize specific fields.
 */
export function buildSprintState(overrides?: Partial<SprintState>): SprintState {
  return {
    version: 2,
    sprint: {
      total: 0,
      done: 0,
      failed: 0,
      blocked: 0,
      inProgress: null,
      ...overrides?.sprint,
    },
    stories: overrides?.stories ?? {},
    retries: overrides?.retries ?? {},
    flagged: overrides?.flagged ?? [],
    epics: overrides?.epics ?? {},
    session: { ...DEFAULT_SESSION_STATE, ...overrides?.session },
    observability: { ...DEFAULT_OBSERVABILITY_STATE, ...overrides?.observability },
    run: { ...DEFAULT_RUN_STATE, ...overrides?.run },
    actionItems: overrides?.actionItems ?? [],
  };
}

/**
 * Build a valid StoryState object with sensible defaults.
 * Pass partial overrides to customize specific fields.
 */
export function buildStoryEntry(overrides?: Partial<StoryState>): StoryState {
  return {
    ...DEFAULT_STORY_STATE,
    ...overrides,
  };
}

/**
 * Build a valid EpicState object with sensible defaults.
 */
export function buildEpicState(overrides?: Partial<EpicState>): EpicState {
  return {
    status: 'in-progress',
    storiesTotal: 0,
    storiesDone: 0,
    ...overrides,
  };
}

/**
 * Build a valid ActionItem object.
 */
export function buildActionItem(overrides?: Partial<ActionItem>): ActionItem {
  return {
    id: 'ai-1',
    story: '1-1-test',
    description: 'Test action item',
    source: 'manual',
    resolved: false,
    ...overrides,
  };
}

/**
 * Build a SprintState with a single story pre-populated.
 * Convenience wrapper for the common test pattern.
 */
export function buildSprintStateWithStory(
  storyKey: string,
  storyOverrides?: Partial<StoryState>,
  stateOverrides?: Partial<SprintState>,
): SprintState {
  return buildSprintState({
    ...stateOverrides,
    sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null, ...stateOverrides?.sprint },
    stories: {
      [storyKey]: buildStoryEntry(storyOverrides),
      ...stateOverrides?.stories,
    },
  });
}
