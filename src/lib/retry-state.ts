import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';

const RETRIES_FILE = '.story_retries';
const FLAGGED_FILE = '.flagged_stories';

const LINE_PATTERN = /^([^=]+)=(\d+)$/;

export function retriesPath(dir: string): string {
  return join(dir, RETRIES_FILE);
}

export function flaggedPath(dir: string): string {
  return join(dir, FLAGGED_FILE);
}

/**
 * Parse `.story_retries` into a Map<storyKey, retryCount>.
 * Lines not matching `{key}={count}` are ignored with a warning.
 */
export function readRetries(dir: string): Map<string, number> {
  const filePath = retriesPath(dir);
  if (!existsSync(filePath)) {
    return new Map();
  }

  const raw = readFileSync(filePath, 'utf-8');
  const result = new Map<string, number>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const match = LINE_PATTERN.exec(trimmed);
    if (!match) {
      warn(`Ignoring malformed retry line: ${trimmed}`);
      continue;
    }

    const key = match[1];
    const count = parseInt(match[2], 10);
    // Last occurrence wins (deduplication on read)
    result.set(key, count);
  }

  return result;
}

/**
 * Write retries map to `.story_retries` in strict `key=count` format.
 * Deduplicates by nature of Map.
 */
export function writeRetries(dir: string, retries: Map<string, number>): void {
  const filePath = retriesPath(dir);
  const lines: string[] = [];

  for (const [key, count] of retries) {
    lines.push(`${key}=${count}`);
  }

  writeFileSync(filePath, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf-8');
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
 * Read `.flagged_stories` — one story key per line.
 */
export function readFlaggedStories(dir: string): string[] {
  const filePath = flaggedPath(dir);
  if (!existsSync(filePath)) {
    return [];
  }

  const raw = readFileSync(filePath, 'utf-8');
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '');
}

/**
 * Write flagged stories list to file.
 */
export function writeFlaggedStories(dir: string, stories: string[]): void {
  const filePath = flaggedPath(dir);
  writeFileSync(filePath, stories.length > 0 ? stories.join('\n') + '\n' : '', 'utf-8');
}

/**
 * Remove a single story from `.flagged_stories`.
 */
export function removeFlaggedStory(dir: string, key: string): void {
  const stories = readFlaggedStories(dir);
  const filtered = stories.filter(s => s !== key);
  writeFlaggedStories(dir, filtered);
}
