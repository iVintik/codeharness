/**
 * Sprint reporter — generates a StatusReport from SprintState.
 * Pure function over in-memory state; no filesystem or network access.
 */

import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, StoryState } from '../../types/state.js';
import type {
  StatusReport,
  FailedStoryDetail,
  LabeledActionItem,
  RunSummary,
} from './types.js';

/** Max attempts constant used for display (matches selector logic) */
const MAX_ATTEMPTS = 10;

/**
 * Extract the epic prefix from a story key.
 * E.g. "2-3-status-report..." -> "2", "10-1-validation..." -> "10"
 */
function epicPrefix(key: string): string {
  const dashIdx = key.indexOf('-');
  if (dashIdx === -1) return key;
  return key.slice(0, dashIdx);
}

/** Format milliseconds as a human-readable duration like "2h14m" or "5m" */
function formatDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalMinutes = Math.floor(clamped / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

/** Compute epic progress from stories */
function computeEpicProgress(
  stories: Record<string, StoryState>,
): { epicsTotal: number; epicsDone: number } {
  const epicGroups = new Map<string, { total: number; done: number }>();

  for (const [key, story] of Object.entries(stories)) {
    const prefix = epicPrefix(key);
    const group = epicGroups.get(prefix) ?? { total: 0, done: 0 };
    group.total++;
    if (story.status === 'done') group.done++;
    epicGroups.set(prefix, group);
  }

  let epicsTotal = 0;
  let epicsDone = 0;
  for (const group of epicGroups.values()) {
    epicsTotal++;
    if (group.total > 0 && group.done === group.total) epicsDone++;
  }

  return { epicsTotal, epicsDone };
}

/** Build failed story detail entries */
function buildFailedDetails(
  stories: Record<string, StoryState>,
): ReadonlyArray<FailedStoryDetail> {
  const details: FailedStoryDetail[] = [];

  for (const [key, story] of Object.entries(stories)) {
    if (story.status !== 'failed') continue;

    let acNumber: number | null = null;
    if (story.acResults) {
      for (const ac of story.acResults) {
        if (ac.verdict === 'fail') {
          const num = parseInt(ac.id.replace(/\D/g, ''), 10);
          if (!isNaN(num)) {
            acNumber = num;
            break;
          }
        }
      }
    }

    details.push({
      key,
      acNumber,
      errorLine: story.lastError ?? 'unknown error',
      attempts: story.attempts,
      maxAttempts: MAX_ATTEMPTS,
    });
  }

  return details;
}

/** Build labeled action items */
function buildActionItemsLabeled(
  state: SprintState,
): ReadonlyArray<LabeledActionItem> {
  const runStories = new Set([
    ...state.run.completed,
    ...state.run.failed,
  ]);

  return state.actionItems.map((item) => {
    const isNew =
      item.source === 'verification' && runStories.has(item.story);
    return { item, label: isNew ? 'NEW' as const : 'CARRIED' as const };
  });
}

/** Build a RunSummary from the current state */
function buildRunSummary(state: SprintState, now: Date): RunSummary | null {
  if (!state.run.startedAt) return null;

  const startedAt = new Date(state.run.startedAt);
  const elapsed = now.getTime() - startedAt.getTime();

  // Collect blocked/skipped stories
  // "skipped" = retry-exhausted (blocked with attempts >= MAX_ATTEMPTS)
  const blocked: string[] = [];
  const skipped: string[] = [];
  for (const [key, story] of Object.entries(state.stories)) {
    if (story.status === 'blocked') {
      blocked.push(key);
      if (story.attempts >= MAX_ATTEMPTS) {
        skipped.push(key);
      }
    }
  }

  return {
    duration: formatDuration(elapsed),
    cost: state.run.cost,
    iterations: state.run.iteration,
    completed: [...state.run.completed],
    failed: [...state.run.failed],
    blocked,
    skipped,
  };
}

/**
 * Generate a full status report from sprint state.
 * Pure function — never throws, returns Result<StatusReport>.
 */
export function generateReport(
  state: SprintState,
  now?: Date,
): Result<StatusReport> {
  try {
    const effectiveNow = now ?? new Date();
    const stories = state.stories;

    // Basic counts
    let total = 0;
    let done = 0;
    let failed = 0;
    let blocked = 0;

    const storyStatuses: Array<{ key: string; status: StoryState['status'] }> = [];

    for (const [key, story] of Object.entries(stories)) {
      total++;
      if (story.status === 'done') done++;
      else if (story.status === 'failed') failed++;
      else if (story.status === 'blocked') blocked++;
      storyStatuses.push({ key, status: story.status });
    }

    const sprintPercent = total > 0 ? Math.round((done / total) * 100) : 0;
    const { epicsTotal, epicsDone } = computeEpicProgress(stories);

    // Run summary
    const runSummary = buildRunSummary(state, effectiveNow);
    const activeRun = state.run.active ? runSummary : null;
    const lastRun = !state.run.active ? runSummary : null;

    // Failed details and action items
    const failedDetails = buildFailedDetails(stories);
    const actionItemsLabeled = buildActionItemsLabeled(state);

    return ok({
      total,
      done,
      failed,
      blocked,
      inProgress: state.sprint.inProgress,
      storyStatuses,
      epicsTotal,
      epicsDone,
      sprintPercent,
      activeRun,
      lastRun,
      failedDetails,
      actionItemsLabeled,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to generate report: ${msg}`);
  }
}
