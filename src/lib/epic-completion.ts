/**
 * Epic Completion Detection.
 *
 * Pure logic module that detects when all stories in an epic reach
 * "done" status and provides a state machine for epic lifecycle
 * transitions: in-progress → completing → merging → validating → done.
 *
 * @see Story 19-1: Epic Completion Detection
 */

import type { SprintState } from '../types/state.js';

// --- Types ---

/**
 * All possible epic lifecycle statuses.
 * Narrows the broad `string` type from EpicState.status.
 */
export type EpicLifecycleStatus =
  | 'in-progress'
  | 'completing'
  | 'merging'
  | 'validating'
  | 'done'
  | 'failed';

// --- Error ---

/**
 * Error thrown for invalid epic operations:
 * - Epic not found in state
 * - Invalid state transition
 */
export class EpicCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpicCompletionError';
  }
}

// --- State Machine ---

/**
 * Valid epic state transitions.
 *
 * Happy path: in-progress → completing → merging → validating → done
 * Failure:    completing|merging|validating → failed
 *
 * Terminal statuses (done, failed) have no outgoing transitions.
 */
type TransitionableStatus = Exclude<EpicLifecycleStatus, 'done' | 'failed'>;

export const VALID_TRANSITIONS: Record<TransitionableStatus, EpicLifecycleStatus[]> = {
  'in-progress': ['completing'],
  'completing': ['merging', 'failed'],
  'merging': ['validating', 'failed'],
  'validating': ['done', 'failed'],
};

// --- Functions ---

/**
 * Get all story keys belonging to a given epic.
 *
 * Stories are matched by the numeric prefix before the first dash.
 * E.g., epicId "19" matches "19-1-foo" and "19-2-bar" but not "1-9-baz".
 */
export function getEpicStories(state: SprintState, epicId: string): string[] {
  return Object.keys(state.stories).filter((key) => {
    const dash = key.indexOf('-');
    if (dash === -1) return false;
    return key.slice(0, dash) === epicId;
  }).sort();
}

/**
 * Check whether all stories in an epic have status "done".
 *
 * Returns false for epics with zero stories (never considered complete).
 * Throws EpicCompletionError if the epic does not exist in state.
 */
export function checkEpicCompletion(state: SprintState, epicId: string): boolean {
  if (!state.epics[`epic-${epicId}`]) {
    throw new EpicCompletionError(`Epic epic-${epicId} not found in state`);
  }
  const stories = getEpicStories(state, epicId);
  if (stories.length === 0) return false;
  return stories.every((key) => state.stories[key]?.status === 'done');
}

/**
 * Transition an epic to a new lifecycle status (immutable).
 *
 * Validates that:
 * 1. The epic exists in state
 * 2. The transition is allowed by the state machine
 *
 * When transitioning to "completing", updates storiesDone to the
 * count of stories with status "done".
 *
 * Returns a new SprintState — does not mutate the input.
 */
export function transitionEpicState(
  state: SprintState,
  epicId: string,
  targetStatus: EpicLifecycleStatus,
): SprintState {
  const epicKey = `epic-${epicId}`;
  const epic = state.epics[epicKey];
  if (!epic) throw new EpicCompletionError(`Epic ${epicKey} not found in state`);

  const currentStatus = epic.status as EpicLifecycleStatus;
  const allowed = VALID_TRANSITIONS[currentStatus as TransitionableStatus];
  if (!allowed?.includes(targetStatus)) {
    throw new EpicCompletionError(
      `Invalid transition: ${currentStatus} → ${targetStatus}`,
    );
  }

  const storiesDone = targetStatus === 'completing'
    ? getEpicStories(state, epicId).filter((k) => state.stories[k]?.status === 'done').length
    : epic.storiesDone;

  return {
    ...state,
    epics: {
      ...state.epics,
      [epicKey]: { ...epic, status: targetStatus, storiesDone },
    },
  };
}
