import { join } from 'node:path';
import { Command } from 'commander';
import { ok, warn, jsonOutput } from '../lib/output.js';
import {
  readRetries,
  readFlaggedStories,
  resetRetry,
} from '../lib/retry-state.js';

const RALPH_SUBDIR = 'ralph';

/**
 * Validates that a story key is safe (no path traversal, only alphanumeric/hyphens/underscores).
 */
function isValidStoryKey(key: string): boolean {
  if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

interface RetryOptions {
  reset?: boolean;
  story?: string;
  status?: boolean;
}

export function registerRetryCommand(program: Command): void {
  program
    .command('retry')
    .description('Manage retry state for stories')
    .option('--reset', 'Clear retry counters and flagged stories')
    .option('--story <key>', 'Target a specific story key (used with --reset or --status)')
    .option('--status', 'Show retry status for all stories')
    .action((_options: RetryOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as RetryOptions & { json?: boolean };
      const isJson = opts.json === true;
      const dir = join(process.cwd(), RALPH_SUBDIR);

      // Validate story key if provided
      if (opts.story && !isValidStoryKey(opts.story)) {
        if (isJson) {
          jsonOutput({ status: 'fail', message: `Invalid story key: ${opts.story}` });
        } else {
          warn(`Invalid story key: ${opts.story}`);
        }
        process.exitCode = 1;
        return;
      }

      if (opts.reset) {
        handleReset(dir, opts.story, isJson);
        return;
      }

      if (opts.story && !opts.status) {
        // --story without --reset or --status: warn and show status for that story
        warn('--story without --reset or --status; showing status for that story');
      }

      handleStatus(dir, isJson, opts.story);
    });
}

function handleReset(dir: string, storyKey: string | undefined, isJson: boolean): void {
  if (storyKey) {
    resetRetry(dir, storyKey);
    if (isJson) {
      jsonOutput({ status: 'ok', action: 'reset', story: storyKey });
    } else {
      ok(`Retry counter and flagged status cleared for ${storyKey}`);
    }
  } else {
    resetRetry(dir);
    if (isJson) {
      jsonOutput({ status: 'ok', action: 'reset_all' });
    } else {
      ok('All retry counters and flagged stories cleared');
    }
  }
}

function handleStatus(dir: string, isJson: boolean, filterStory?: string): void {
  const retries = readRetries(dir);
  const flagged = new Set(readFlaggedStories(dir));

  if (isJson) {
    const entries: Record<string, { count: number; flagged: boolean }> = {};
    for (const [key, count] of retries) {
      if (filterStory && key !== filterStory) continue;
      entries[key] = { count, flagged: flagged.has(key) };
    }
    // Include flagged stories that have no retry entry
    for (const key of flagged) {
      if (filterStory && key !== filterStory) continue;
      if (!entries[key]) {
        entries[key] = { count: 0, flagged: true };
      }
    }
    jsonOutput({ status: 'ok', entries });
    return;
  }

  // Merge keys from both sources
  const allKeys = new Set([...retries.keys(), ...flagged]);
  const displayKeys = filterStory
    ? [...allKeys].filter(k => k === filterStory)
    : [...allKeys];

  if (displayKeys.length === 0) {
    console.log('No retry entries.');
    return;
  }

  console.log('Story                                  Retries  Flagged');
  console.log('─'.repeat(55));

  for (const key of displayKeys) {
    const count = retries.get(key) ?? 0;
    const isFlagged = flagged.has(key);
    const paddedKey = key.padEnd(38);
    const paddedCount = String(count).padStart(4);
    const flagStr = isFlagged ? '  yes' : '  no';
    console.log(`${paddedKey} ${paddedCount}${flagStr}`);
  }
}
