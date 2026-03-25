import { join } from 'node:path';
import { getSprintState, writeStateAtomic } from '../modules/sprint/index.js';
import type { SprintState } from '../types/state.js';

const RETRIES_FILE = '.story_retries';
const FLAGGED_FILE = '.flagged_stories';

/**
 * Internal helper: read current state, apply a mutation, write back atomically.
 * Returns silently on failure to preserve backward-compatible void API.
 */
function mutateState(mutator: (state: SprintState) => SprintState): void {
  const result = getSprintState();
  if (!result.success) return;
  writeStateAtomic(mutator(result.data));
}

/**
 * @deprecated Legacy path helper. retry-state now reads/writes sprint-state.json.
 * Kept for backward compatibility — will be removed in story 11-3.
 */
export function retriesPath(dir: string): string {
  return join(dir, RETRIES_FILE);
}

/**
 * @deprecated Legacy path helper. retry-state now reads/writes sprint-state.json.
 * Kept for backward compatibility — will be removed in story 11-3.
 */
export function flaggedPath(dir: string): string {
  return join(dir, FLAGGED_FILE);
}

/**
 * Read retries from sprint-state.json as a Map<storyKey, retryCount>.
 * The `dir` parameter is kept for backward compatibility but is not used.
 */
export function readRetries(_dir: string): Map<string, number> {
  const result = getSprintState();
  if (!result.success) {
    return new Map();
  }
  return new Map(Object.entries(result.data.retries));
}

/**
 * Write retries map to sprint-state.json.
 * The `dir` parameter is kept for backward compatibility but is not used.
 */
export function writeRetries(_dir: string, retries: Map<string, number>): void {
  mutateState(state => ({
    ...state,
    retries: Object.fromEntries(retries),
  }));
}

/**
 * Get retry count for a single story. Returns 0 if not found.
 */
export function getRetryCount(dir: string, storyKey: string): number {
  const retries = readRetries(dir);
  return retries.get(storyKey) ?? 0;
}

/**
 * Set retry count for a single story. Deduplicates automatically.
 */
export function setRetryCount(dir: string, storyKey: string, count: number): void {
  const retries = readRetries(dir);
  retries.set(storyKey, count);
  writeRetries(dir, retries);
}

/**
 * Reset retry state. If storyKey is provided, removes only that entry.
 * Otherwise clears all entries. Also clears flagged stories accordingly.
 */
export function resetRetry(dir: string, storyKey?: string): void {
  if (storyKey) {
    const retries = readRetries(dir);
    retries.delete(storyKey);
    writeRetries(dir, retries);
    removeFlaggedStory(dir, storyKey);
  } else {
    writeRetries(dir, new Map());
    writeFlaggedStories(dir, []);
  }
}

/**
 * Read flagged stories from sprint-state.json.
 * The `dir` parameter is kept for backward compatibility but is not used.
 */
export function readFlaggedStories(_dir: string): string[] {
  const result = getSprintState();
  if (!result.success) {
    return [];
  }
  return [...result.data.flagged];
}

/**
 * Write flagged stories list to sprint-state.json.
 * The `dir` parameter is kept for backward compatibility but is not used.
 */
export function writeFlaggedStories(_dir: string, stories: string[]): void {
  mutateState(state => ({
    ...state,
    flagged: stories,
  }));
}

/**
 * Remove a single story from flagged stories in sprint-state.json.
 */
export function removeFlaggedStory(dir: string, key: string): void {
  const stories = readFlaggedStories(dir);
  const filtered = stories.filter(s => s !== key);
  writeFlaggedStories(dir, filtered);
}
