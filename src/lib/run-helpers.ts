/**
 * Helper functions for the run command.
 *
 * Extracted from run.ts to comply with NFR9 (max 300 lines per file).
 * Contains: elapsed time formatting, sprint status → story status mapping,
 * and ralph stderr → story message parsing.
 */

import type { StoryStatusEntry, StoryStatusValue, StoryMessage } from './ink-components.js';

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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  verified: number;
} {
  let total = 0;
  let ready = 0;
  let done = 0;
  let inProgress = 0;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  let verified = 0;

  for (const [key, status] of Object.entries(statuses)) {
    if (!STORY_KEY_PATTERN.test(key)) continue;
    total++;
    if (status === 'backlog' || status === 'ready-for-dev') ready++;
    else if (status === 'done') done++;
    else if (status === 'in-progress' || status === 'review') inProgress++;
    else if (status === 'verifying') verified++;
  }

  return { total, ready, done, inProgress, verified };
}

// --- Spawn Args Builder ---

/**
 * Builds the argument array for spawning Ralph.
 */
export function buildSpawnArgs(opts: {
  ralphPath: string;
  pluginDir: string;
  promptFile: string;
  maxIterations: number;
  timeout: number;
  iterationTimeout: number;
  calls: number;
  quiet: boolean;
  maxStoryRetries?: number;
  reset?: boolean;
}): string[] {
  const args = [
    opts.ralphPath,
    '--plugin-dir', opts.pluginDir,
    '--max-iterations', String(opts.maxIterations),
    '--timeout', String(opts.timeout),
    '--iteration-timeout', String(opts.iterationTimeout),
    '--calls', String(opts.calls),
    '--prompt', opts.promptFile,
  ];

  // When not quiet, pass --live so ralph tees Claude's stream-json to stdout.
  // The Ink renderer reads stdout to show live tool calls and thoughts.
  if (!opts.quiet) {
    args.push('--live');
  }

  if (opts.maxStoryRetries !== undefined) {
    args.push('--max-story-retries', String(opts.maxStoryRetries));
  }

  if (opts.reset) {
    args.push('--reset');
  }

  return args;
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

// --- Sprint Status → Story Status Mapping (AC #7) ---

/**
 * Maps a sprint-status.yaml status value to a StoryStatusValue for the Ink renderer.
 *
 * Mapping:
 *   done → done
 *   in-progress, review, verifying → in-progress
 *   backlog, ready-for-dev → pending
 *   failed → failed
 *   blocked, exhausted → blocked
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

// --- Ralph Stderr → Story Messages (AC #8) ---

/** Strip ANSI color codes */
const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

/** Strip timestamp prefix from ralph output lines */
const TIMESTAMP_PREFIX = /^\[[\d-]+\s[\d:]+\]\s*/;

/** Matches: [SUCCESS] Story {key}: DONE ... */
const SUCCESS_STORY = /\[SUCCESS\]\s+Story\s+([\w-]+):\s+DONE(.*)/;

/** Matches: [WARN] Story {key} exceeded retry limit ... flagging */
const WARN_STORY_RETRY = /\[WARN\]\s+Story\s+([\w-]+)\s+exceeded retry limit/;

/** Matches: [WARN] Story {key} ... retry N/M */
const WARN_STORY_RETRYING = /\[WARN\]\s+Story\s+([\w-]+)\s+.*retry\s+(\d+)\/(\d+)/;

/** Matches: [LOOP] iteration N */
const LOOP_ITERATION = /\[LOOP\]\s+iteration\s+(\d+)/;

/** Matches: [ERROR] ... */
const ERROR_LINE = /\[ERROR\]\s+(.+)/;

/**
 * Parse a ralph output line and return a StoryMessage if it matches
 * a story completion, failure, or warning pattern.
 * Returns null for non-matching lines.
 */
export function parseRalphMessage(rawLine: string): StoryMessage | null {
  const clean = rawLine.replace(ANSI_ESCAPE, '').replace(TIMESTAMP_PREFIX, '').trim();
  if (clean.length === 0) return null;

  // [SUCCESS] Story {key}: DONE ...
  const success = SUCCESS_STORY.exec(clean);
  if (success) {
    const key = success[1];
    const rest = success[2].trim().replace(/^—\s*/, '');
    return {
      type: 'ok',
      key,
      message: rest ? `DONE — ${rest}` : 'DONE',
    };
  }

  // [WARN] Story {key} exceeded retry limit
  const retryExceeded = WARN_STORY_RETRY.exec(clean);
  if (retryExceeded) {
    return {
      type: 'fail',
      key: retryExceeded[1],
      message: 'exceeded retry limit',
    };
  }

  // [WARN] Story {key} — retry N/M
  const retrying = WARN_STORY_RETRYING.exec(clean);
  if (retrying) {
    return {
      type: 'warn',
      key: retrying[1],
      message: `retry ${retrying[2]}/${retrying[3]}`,
    };
  }

  // [ERROR] ... — surface as a generic error message
  const errorMatch = ERROR_LINE.exec(clean);
  if (errorMatch) {
    // Try to extract story key from error message
    const keyMatch = errorMatch[1].match(/Story\s+([\w-]+)/);
    if (keyMatch) {
      return {
        type: 'fail',
        key: keyMatch[1],
        message: errorMatch[1].trim(),
      };
    }
    // Generic error without a story key — skip (no key to associate)
    return null;
  }

  return null;
}

/**
 * Parse a ralph stderr line for [LOOP] iteration messages.
 * Returns the iteration number if found, or null otherwise.
 */
export function parseIterationMessage(rawLine: string): number | null {
  const clean = rawLine.replace(ANSI_ESCAPE, '').replace(TIMESTAMP_PREFIX, '').trim();
  if (clean.length === 0) return null;
  const match = LOOP_ITERATION.exec(clean);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
