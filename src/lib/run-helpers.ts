/**
 * Helper functions for the run command.
 *
 * Extracted from run.ts to comply with NFR9 (max 300 lines per file).
 * Contains: elapsed time formatting, sprint status -> story status mapping,
 * and line processing utilities.
 *
 * Ralph-specific functions removed in Story 1.2 — workflow engine pending (Epic 5).
 */

import type { StoryStatusEntry, StoryStatusValue } from './ink-components.js';

// --- Story Counting ---

/** Story key pattern: digit-digit-name */
const STORY_KEY_PATTERN = /^\d+-\d+-/;

/**
 * Counts stories by status from sprint-status.yaml.
 */
export function countStories(statuses: Record<string, string>): {
  total: number;
  ready: number;
  done: number;
  inProgress: number;
  checked: number;
  verified: number;
} {
  let total = 0;
  let ready = 0;
  let done = 0;
  let inProgress = 0;
  let checked = 0;
  let verified = 0;

  for (const [key, status] of Object.entries(statuses)) {
    if (!STORY_KEY_PATTERN.test(key)) continue;
    total++;
    if (status === 'backlog' || status === 'ready-for-dev') ready++;
    else if (status === 'done') done++;
    else if (status === 'in-progress' || status === 'review') inProgress++;
    else if (status === 'checked') checked++;
    else if (status === 'verifying') verified++;
  }

  return { total, ready, done, inProgress, checked, verified };
}

// --- Elapsed Time Formatting (AC #6) ---

/**
 * Format elapsed milliseconds as "Xm" or "XhYm".
 * Matches the UX spec format (not the DashboardFormatter "Xm Ys" format).
 */
export function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  return `${totalMinutes}m`;
}

// --- Sprint Status -> Story Status Mapping (AC #7) ---

/**
 * Maps a sprint-status.yaml status value to a StoryStatusValue for the Ink renderer.
 *
 * Mapping:
 *   done -> done
 *   in-progress, review, verifying -> in-progress
 *   backlog, ready-for-dev -> pending
 *   failed -> failed
 *   blocked, exhausted -> blocked
 */
export function mapSprintStatus(status: string): StoryStatusValue {
  switch (status) {
    case 'done':
      return 'done';
    case 'in-progress':
    case 'review':
    case 'verifying':
      return 'in-progress';
    case 'backlog':
    case 'ready-for-dev':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'blocked':
    case 'exhausted':
      return 'blocked';
    default:
      return 'pending';
  }
}

/**
 * Converts sprint-status.yaml entries to StoryStatusEntry[] for the Ink renderer.
 * Filters out epic keys, retrospective keys, and optional entries.
 */
export function mapSprintStatuses(statuses: Record<string, string>): StoryStatusEntry[] {
  const entries: StoryStatusEntry[] = [];
  for (const [key, status] of Object.entries(statuses)) {
    if (!STORY_KEY_PATTERN.test(key)) continue;
    if (status === 'optional') continue;
    entries.push({ key, status: mapSprintStatus(status) });
  }
  return entries;
}

