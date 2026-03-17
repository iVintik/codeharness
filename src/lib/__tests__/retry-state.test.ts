import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readRetries,
  writeRetries,
  getRetryCount,
  setRetryCount,
  resetRetry,
  readFlaggedStories,
  writeFlaggedStories,
  removeFlaggedStory,
  retriesPath,
  flaggedPath,
} from '../retry-state.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-retry-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── readRetries ──────────────────────────────────────────────────────────────

describe('readRetries', () => {
  it('returns empty map when file does not exist', () => {
    const result = readRetries(testDir);
    expect(result.size).toBe(0);
  });

  it('parses strict key=count format', () => {
    writeFileSync(retriesPath(testDir), '2-1-dependency-auto-install=4\n0-1-sprint-execution-skill=3\n');
    const result = readRetries(testDir);
    expect(result.get('2-1-dependency-auto-install')).toBe(4);
    expect(result.get('0-1-sprint-execution-skill')).toBe(3);
    expect(result.size).toBe(2);
  });

  it('ignores empty lines', () => {
    writeFileSync(retriesPath(testDir), '\n2-1-dep=1\n\n\n');
    const result = readRetries(testDir);
    expect(result.size).toBe(1);
    expect(result.get('2-1-dep')).toBe(1);
  });

  it('ignores malformed lines with a warning', () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(retriesPath(testDir), '13-3-black-box-verifier-agent 4\ngood-key=2\nbad line here\n');
    const result = readRetries(testDir);
    expect(result.size).toBe(1);
    expect(result.get('good-key')).toBe(2);
    // Two bad lines should produce two warnings
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0][0]).toContain('Ignoring malformed retry line');
    expect(warnSpy.mock.calls[1][0]).toContain('Ignoring malformed retry line');
    warnSpy.mockRestore();
  });

  it('last occurrence wins when duplicates exist', () => {
    writeFileSync(retriesPath(testDir), 'story-a=1\nstory-a=5\n');
    const result = readRetries(testDir);
    expect(result.get('story-a')).toBe(5);
    expect(result.size).toBe(1);
  });

  it('handles count of zero', () => {
    writeFileSync(retriesPath(testDir), 'story-a=0\n');
    const result = readRetries(testDir);
    expect(result.get('story-a')).toBe(0);
  });

  it('rejects lines with non-numeric count', () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(retriesPath(testDir), 'story-a=abc\nstory-b=2\n');
    const result = readRetries(testDir);
    expect(result.size).toBe(1);
    expect(result.get('story-b')).toBe(2);
    warnSpy.mockRestore();
  });

  it('rejects lines with space delimiter (old format)', () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(retriesPath(testDir), '13-3-black-box-verifier-agent 4\n');
    const result = readRetries(testDir);
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('rejects lines with multiple = signs', () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeFileSync(retriesPath(testDir), 'story=key=2\n');
    const result = readRetries(testDir);
    expect(result.size).toBe(0);
    warnSpy.mockRestore();
  });
});

// ─── writeRetries ─────────────────────────────────────────────────────────────

describe('writeRetries', () => {
  it('writes strict key=count format', () => {
    const map = new Map([['story-a', 3], ['story-b', 1]]);
    writeRetries(testDir, map);
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toBe('story-a=3\nstory-b=1\n');
  });

  it('writes empty file for empty map', () => {
    writeRetries(testDir, new Map());
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toBe('');
  });

  it('deduplicates by nature of Map (last set wins)', () => {
    const map = new Map<string, number>();
    map.set('story-a', 1);
    map.set('story-a', 5);
    writeRetries(testDir, map);
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toBe('story-a=5\n');
  });

  it('overwrites existing file', () => {
    writeFileSync(retriesPath(testDir), 'old-story=99\n');
    writeRetries(testDir, new Map([['new-story', 1]]));
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toBe('new-story=1\n');
    expect(content).not.toContain('old-story');
  });
});

// ─── getRetryCount ────────────────────────────────────────────────────────────

describe('getRetryCount', () => {
  it('returns 0 when file does not exist', () => {
    expect(getRetryCount(testDir, 'nonexistent')).toBe(0);
  });

  it('returns 0 for unknown story key', () => {
    writeFileSync(retriesPath(testDir), 'story-a=3\n');
    expect(getRetryCount(testDir, 'story-b')).toBe(0);
  });

  it('returns count for known story key', () => {
    writeFileSync(retriesPath(testDir), 'story-a=7\n');
    expect(getRetryCount(testDir, 'story-a')).toBe(7);
  });
});

// ─── setRetryCount ────────────────────────────────────────────────────────────

describe('setRetryCount', () => {
  it('creates file if it does not exist', () => {
    setRetryCount(testDir, 'story-a', 1);
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toBe('story-a=1\n');
  });

  it('adds entry to existing file', () => {
    writeFileSync(retriesPath(testDir), 'story-a=2\n');
    setRetryCount(testDir, 'story-b', 3);
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toContain('story-a=2');
    expect(content).toContain('story-b=3');
  });

  it('updates existing entry (deduplicates)', () => {
    writeFileSync(retriesPath(testDir), 'story-a=2\nstory-b=1\n');
    setRetryCount(testDir, 'story-a', 5);
    const content = readFileSync(retriesPath(testDir), 'utf-8');
    expect(content).toContain('story-a=5');
    expect(content).toContain('story-b=1');
    // Only one occurrence of story-a
    const lines = content.trim().split('\n');
    const storyALines = lines.filter(l => l.startsWith('story-a='));
    expect(storyALines).toHaveLength(1);
  });
});

// ─── resetRetry ───────────────────────────────────────────────────────────────

describe('resetRetry', () => {
  it('clears all entries when no storyKey provided', () => {
    writeFileSync(retriesPath(testDir), 'story-a=2\nstory-b=3\n');
    writeFileSync(flaggedPath(testDir), 'story-a\nstory-b\n');
    resetRetry(testDir);
    expect(readFileSync(retriesPath(testDir), 'utf-8')).toBe('');
    expect(readFileSync(flaggedPath(testDir), 'utf-8')).toBe('');
  });

  it('clears only specified story when storyKey provided', () => {
    writeFileSync(retriesPath(testDir), 'story-a=2\nstory-b=3\n');
    writeFileSync(flaggedPath(testDir), 'story-a\nstory-b\n');
    resetRetry(testDir, 'story-a');
    const retries = readRetries(testDir);
    expect(retries.has('story-a')).toBe(false);
    expect(retries.get('story-b')).toBe(3);
    const flagged = readFlaggedStories(testDir);
    expect(flagged).not.toContain('story-a');
    expect(flagged).toContain('story-b');
  });

  it('is a no-op when clearing a nonexistent story key', () => {
    writeFileSync(retriesPath(testDir), 'story-a=2\n');
    writeFileSync(flaggedPath(testDir), 'story-a\n');
    resetRetry(testDir, 'nonexistent');
    const retries = readRetries(testDir);
    expect(retries.get('story-a')).toBe(2);
    const flagged = readFlaggedStories(testDir);
    expect(flagged).toContain('story-a');
  });

  it('works when files do not exist', () => {
    // Should not throw
    resetRetry(testDir);
    expect(readFileSync(retriesPath(testDir), 'utf-8')).toBe('');
    expect(readFileSync(flaggedPath(testDir), 'utf-8')).toBe('');
  });

  it('works with storyKey when files do not exist', () => {
    resetRetry(testDir, 'story-a');
    expect(readFileSync(retriesPath(testDir), 'utf-8')).toBe('');
    expect(readFileSync(flaggedPath(testDir), 'utf-8')).toBe('');
  });
});

// ─── readFlaggedStories ───────────────────────────────────────────────────────

describe('readFlaggedStories', () => {
  it('returns empty array when file does not exist', () => {
    expect(readFlaggedStories(testDir)).toEqual([]);
  });

  it('returns story keys one per line', () => {
    writeFileSync(flaggedPath(testDir), 'story-a\nstory-b\n');
    expect(readFlaggedStories(testDir)).toEqual(['story-a', 'story-b']);
  });

  it('ignores empty lines', () => {
    writeFileSync(flaggedPath(testDir), '\nstory-a\n\nstory-b\n\n');
    expect(readFlaggedStories(testDir)).toEqual(['story-a', 'story-b']);
  });

  it('trims whitespace', () => {
    writeFileSync(flaggedPath(testDir), '  story-a  \n  story-b  \n');
    expect(readFlaggedStories(testDir)).toEqual(['story-a', 'story-b']);
  });
});

// ─── writeFlaggedStories ──────────────────────────────────────────────────────

describe('writeFlaggedStories', () => {
  it('writes one key per line', () => {
    writeFlaggedStories(testDir, ['story-a', 'story-b']);
    const content = readFileSync(flaggedPath(testDir), 'utf-8');
    expect(content).toBe('story-a\nstory-b\n');
  });

  it('writes empty file for empty array', () => {
    writeFlaggedStories(testDir, []);
    const content = readFileSync(flaggedPath(testDir), 'utf-8');
    expect(content).toBe('');
  });
});

// ─── removeFlaggedStory ───────────────────────────────────────────────────────

describe('removeFlaggedStory', () => {
  it('removes a single story from flagged list', () => {
    writeFileSync(flaggedPath(testDir), 'story-a\nstory-b\nstory-c\n');
    removeFlaggedStory(testDir, 'story-b');
    expect(readFlaggedStories(testDir)).toEqual(['story-a', 'story-c']);
  });

  it('is a no-op when story is not in list', () => {
    writeFileSync(flaggedPath(testDir), 'story-a\n');
    removeFlaggedStory(testDir, 'nonexistent');
    expect(readFlaggedStories(testDir)).toEqual(['story-a']);
  });

  it('works when file does not exist', () => {
    removeFlaggedStory(testDir, 'story-a');
    // Should create an empty file
    expect(readFileSync(flaggedPath(testDir), 'utf-8')).toBe('');
  });
});

// ─── path helpers ─────────────────────────────────────────────────────────────

describe('path helpers', () => {
  it('retriesPath returns correct path', () => {
    expect(retriesPath('/some/dir')).toBe('/some/dir/.story_retries');
  });

  it('flaggedPath returns correct path', () => {
    expect(flaggedPath('/some/dir')).toBe('/some/dir/.flagged_stories');
  });
});
