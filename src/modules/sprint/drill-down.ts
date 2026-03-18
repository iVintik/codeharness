/**
 * Story drill-down — builds detailed view of a single story.
 * Pure function over in-memory state; no filesystem or network access.
 */

import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, StoryState } from '../../types/state.js';
import type {
  StoryDrillDown,
  AcDetail,
  AttemptRecord,
  ProofSummary,
  TimeoutSummary,
} from './types.js';
import { MAX_STORY_ATTEMPTS } from './selector.js';

/** Max attempts constant used for display */
const MAX_ATTEMPTS = MAX_STORY_ATTEMPTS;

/**
 * Extract the epic prefix from a story key.
 * E.g. "2-3-status-report..." -> "2", "10-1-validation..." -> "10"
 */
export function epicPrefix(key: string): string {
  const dashIdx = key.indexOf('-');
  if (dashIdx === -1) return key;
  return key.slice(0, dashIdx);
}

/**
 * Build AC details from a story's acResults.
 * Returns enriched AcDetail array, or empty array if acResults is null.
 */
function buildAcDetails(story: StoryState): AcDetail[] {
  if (!story.acResults) return [];
  return story.acResults.map((ac) => {
    const detail: AcDetail = { id: ac.id, verdict: ac.verdict };
    if (ac.verdict === 'fail' && story.lastError) {
      return { ...detail, reason: story.lastError };
    }
    return detail;
  });
}

/** Build synthetic attempt history from available story data */
function buildAttemptHistory(story: StoryState): AttemptRecord[] {
  const records: AttemptRecord[] = [];
  if (story.attempts === 0) return records;

  // For attempts before the last one, we only have the count
  for (let i = 1; i < story.attempts; i++) {
    records.push({
      number: i,
      outcome: 'details unavailable',
    });
  }

  // Last attempt has data
  const lastOutcome = story.status === 'done' ? 'passed' :
    story.status === 'failed' ? 'verify failed' :
    story.status === 'blocked' ? 'blocked' : story.status;

  const lastRecord: AttemptRecord = {
    number: story.attempts,
    outcome: lastOutcome,
    ...(story.lastAttempt ? { timestamp: story.lastAttempt } : {}),
  };

  // If there's a failing AC, add it
  if (story.acResults) {
    const failingAc = story.acResults.find((ac) => ac.verdict === 'fail');
    if (failingAc) {
      records.push({ ...lastRecord, failingAc: failingAc.id });
      return records;
    }
  }

  records.push(lastRecord);
  return records;
}

/** Build proof summary from story data */
function buildProofSummary(story: StoryState): ProofSummary | null {
  if (!story.proofPath) return null;

  let passCount = 0;
  let failCount = 0;
  let escalateCount = 0;
  let pendingCount = 0;

  if (story.acResults) {
    for (const ac of story.acResults) {
      if (ac.verdict === 'pass') passCount++;
      else if (ac.verdict === 'fail') failCount++;
      else if (ac.verdict === 'escalate') escalateCount++;
      else if (ac.verdict === 'pending') pendingCount++;
    }
  }

  return { path: story.proofPath, passCount, failCount, escalateCount, pendingCount };
}

/**
 * Get detailed drill-down for a single story.
 * Pure function — never throws, returns Result<StoryDrillDown>.
 */
export function getStoryDrillDown(
  state: SprintState,
  key: string,
  opts?: { timeoutSummary?: TimeoutSummary | null },
): Result<StoryDrillDown> {
  try {
    const story = state.stories[key];
    if (!story) {
      return fail(`Story '${key}' not found in sprint state`);
    }

    const epic = epicPrefix(key);
    const acDetails = buildAcDetails(story);
    const attemptHistory = buildAttemptHistory(story);
    const proofSummary = buildProofSummary(story);

    return ok({
      key,
      status: story.status,
      epic,
      attempts: story.attempts,
      maxAttempts: MAX_ATTEMPTS,
      lastAttempt: story.lastAttempt,
      acDetails,
      attemptHistory,
      proofSummary,
      timeoutSummary: opts?.timeoutSummary ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to get story drill-down: ${msg}`);
  }
}
