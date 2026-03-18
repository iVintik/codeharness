/**
 * Story selection — cross-epic prioritization logic.
 *
 * Selects the next actionable story from sprint state based on priority tiers:
 *   0: in-progress (continue current work)
 *   1: verifying with proof (proofPath set)
 *   2: verifying without proof
 *   3: backlog
 *
 * Stories that are done, failed, blocked, or retry-exhausted are excluded.
 */

import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, StoryState } from '../../types/state.js';
import type { StorySelection, SelectionResult, RetryExhaustedInfo } from './types.js';

/** Maximum attempts before a story is considered retry-exhausted */
export const MAX_STORY_ATTEMPTS = 10;

/** Statuses that are terminal — no further action possible */
const TERMINAL_STATUSES = new Set(['done', 'failed', 'blocked']);

/**
 * Compute the priority tier for a story.
 * Lower number = higher priority.
 * Returns null if the story should be excluded from selection.
 */
function priorityTier(story: StoryState): number | null {
  if (TERMINAL_STATUSES.has(story.status)) {
    return null;
  }
  // Note: retry-exhausted check (attempts >= MAX_STORY_ATTEMPTS) is handled
  // by the caller before priorityTier is invoked.

  switch (story.status) {
    case 'in-progress':
      return 0;
    case 'verifying':
      return story.proofPath !== null ? 1 : 2;
    case 'backlog':
    case 'ready':
    case 'review':
      return 3;
    default:
      return null;
  }
}

/** Transform a story key into a human-readable title */
function keyToTitle(key: string): string {
  if (key.length === 0) return key;
  const spaced = key.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Select the next actionable story from sprint state.
 *
 * Priority order: in-progress > verifying-with-proof > verifying > backlog.
 * Within the same tier: fewer attempts first, then lexicographic key order.
 *
 * Returns ok(null) when no actionable stories remain.
 */
export function selectNextStory(
  state: SprintState,
): Result<SelectionResult> {
  try {
    const candidates: Array<{
      key: string;
      story: StoryState;
      tier: number;
    }> = [];
    const retryExhausted: RetryExhaustedInfo[] = [];

    for (const [key, story] of Object.entries(state.stories)) {
      // Track retry-exhausted stories (AC #2)
      if (
        !TERMINAL_STATUSES.has(story.status) &&
        story.attempts >= MAX_STORY_ATTEMPTS
      ) {
        retryExhausted.push({
          key,
          attempts: story.attempts,
          reason: 'retry-exhausted',
        });
        continue;
      }

      const tier = priorityTier(story);
      if (tier !== null) {
        candidates.push({ key, story, tier });
      }
    }

    if (candidates.length === 0) {
      return ok({ selected: null, retryExhausted });
    }

    candidates.sort((a, b) => {
      // Primary: priority tier ascending (lower = higher priority)
      if (a.tier !== b.tier) return a.tier - b.tier;
      // Secondary: fewer attempts first
      if (a.story.attempts !== b.story.attempts) {
        return a.story.attempts - b.story.attempts;
      }
      // Tertiary: lexicographic key order
      return a.key.localeCompare(b.key);
    });

    const winner = candidates[0];
    const selection: StorySelection = {
      key: winner.key,
      title: keyToTitle(winner.key),
      priority: winner.tier,
    };

    return ok({ selected: selection, retryExhausted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Story selection failed: ${msg}`);
  }
}
