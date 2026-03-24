import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
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

// retry-state now reads from sprint-state.json via getSprintState() / writeStateAtomic()
// which use process.cwd() to find the file. We chdir to a temp dir for isolation.

let testDir: string;
let originalCwd: string;
let stateFile: string;

function makeStateJson(overrides?: { retries?: Record<string, number>; flagged?: string[] }): string {
  return JSON.stringify({
    version: 2,
    sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
    stories: {},
    retries: overrides?.retries ?? {},
    flagged: overrides?.flagged ?? [],
    epics: {},
    session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
    observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
    run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
    actionItems: [],
  }, null, 2) + '\n';
}

function readState(): { retries: Record<string, number>; flagged: string[] } {
  const raw = readFileSync(stateFile, 'utf-8');
  const parsed = JSON.parse(raw);
  return { retries: parsed.retries, flagged: parsed.flagged };
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-retry-test-'));
  stateFile = join(testDir, 'sprint-state.json');
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── readRetries ──────────────────────────────────────────────────────────────

describe('readRetries', () => {
  it('returns empty map when sprint-state.json does not exist', () => {
    const result = readRetries(testDir);
    expect(result.size).toBe(0);
  });

  it('reads retries from sprint-state.json', () => {
    writeFileSync(stateFile, makeStateJson({
      retries: { '2-1-dependency-auto-install': 4, '0-1-sprint-execution-skill': 3 },
    }));
    const result = readRetries(testDir);
    expect(result.get('2-1-dependency-auto-install')).toBe(4);
    expect(result.get('0-1-sprint-execution-skill')).toBe(3);
    expect(result.size).toBe(2);
  });

  it('returns empty map when retries field is empty', () => {
    writeFileSync(stateFile, makeStateJson({ retries: {} }));
    const result = readRetries(testDir);
    expect(result.size).toBe(0);
  });
});

// ─── writeRetries ─────────────────────────────────────────────────────────────

describe('writeRetries', () => {
  it('writes retries to sprint-state.json', () => {
    writeFileSync(stateFile, makeStateJson());
    const map = new Map([['story-a', 3], ['story-b', 1]]);
    writeRetries(testDir, map);
    const state = readState();
    expect(state.retries).toEqual({ 'story-a': 3, 'story-b': 1 });
  });

  it('writes empty retries for empty map', () => {
    writeFileSync(stateFile, makeStateJson({ retries: { old: 5 } }));
    writeRetries(testDir, new Map());
    const state = readState();
    expect(state.retries).toEqual({});
  });

  it('overwrites existing retries', () => {
    writeFileSync(stateFile, makeStateJson({ retries: { 'old-story': 99 } }));
    writeRetries(testDir, new Map([['new-story', 1]]));
    const state = readState();
    expect(state.retries).toEqual({ 'new-story': 1 });
  });
});

// ─── getRetryCount ────────────────────────────────────────────────────────────

describe('getRetryCount', () => {
  it('returns 0 when sprint-state.json does not exist', () => {
    expect(getRetryCount(testDir, 'nonexistent')).toBe(0);
  });

  it('returns 0 for unknown story key', () => {
    writeFileSync(stateFile, makeStateJson({ retries: { 'story-a': 3 } }));
    expect(getRetryCount(testDir, 'story-b')).toBe(0);
  });

  it('returns count for known story key', () => {
    writeFileSync(stateFile, makeStateJson({ retries: { 'story-a': 7 } }));
    expect(getRetryCount(testDir, 'story-a')).toBe(7);
  });
});

// ─── setRetryCount ────────────────────────────────────────────────────────────

describe('setRetryCount', () => {
  it('creates entry in sprint-state.json', () => {
    writeFileSync(stateFile, makeStateJson());
    setRetryCount(testDir, 'story-a', 1);
    const state = readState();
    expect(state.retries['story-a']).toBe(1);
  });

  it('adds entry to existing retries', () => {
    writeFileSync(stateFile, makeStateJson({ retries: { 'story-a': 2 } }));
    setRetryCount(testDir, 'story-b', 3);
    const state = readState();
    expect(state.retries['story-a']).toBe(2);
    expect(state.retries['story-b']).toBe(3);
  });

  it('updates existing entry', () => {
    writeFileSync(stateFile, makeStateJson({ retries: { 'story-a': 2, 'story-b': 1 } }));
    setRetryCount(testDir, 'story-a', 5);
    const state = readState();
    expect(state.retries['story-a']).toBe(5);
    expect(state.retries['story-b']).toBe(1);
  });
});

// ─── resetRetry ───────────────────────────────────────────────────────────────

describe('resetRetry', () => {
  it('clears all entries when no storyKey provided', () => {
    writeFileSync(stateFile, makeStateJson({
      retries: { 'story-a': 2, 'story-b': 3 },
      flagged: ['story-a', 'story-b'],
    }));
    resetRetry(testDir);
    const state = readState();
    expect(state.retries).toEqual({});
    expect(state.flagged).toEqual([]);
  });

  it('clears only specified story when storyKey provided', () => {
    writeFileSync(stateFile, makeStateJson({
      retries: { 'story-a': 2, 'story-b': 3 },
      flagged: ['story-a', 'story-b'],
    }));
    resetRetry(testDir, 'story-a');
    const state = readState();
    expect(state.retries['story-a']).toBeUndefined();
    expect(state.retries['story-b']).toBe(3);
    expect(state.flagged).not.toContain('story-a');
    expect(state.flagged).toContain('story-b');
  });

  it('is a no-op when clearing a nonexistent story key', () => {
    writeFileSync(stateFile, makeStateJson({
      retries: { 'story-a': 2 },
      flagged: ['story-a'],
    }));
    resetRetry(testDir, 'nonexistent');
    const state = readState();
    expect(state.retries['story-a']).toBe(2);
    expect(state.flagged).toContain('story-a');
  });

  it('works when sprint-state.json does not exist (uses defaults)', () => {
    // Should not throw — getSprintState returns default
    resetRetry(testDir);
    // After reset, a sprint-state.json should be created with empty retries/flagged
    expect(existsSync(stateFile)).toBe(true);
    const state = readState();
    expect(state.retries).toEqual({});
    expect(state.flagged).toEqual([]);
  });

  it('works with storyKey when sprint-state.json does not exist', () => {
    resetRetry(testDir, 'story-a');
    expect(existsSync(stateFile)).toBe(true);
    const state = readState();
    expect(state.retries).toEqual({});
    expect(state.flagged).toEqual([]);
  });
});

// ─── readFlaggedStories ───────────────────────────────────────────────────────

describe('readFlaggedStories', () => {
  it('returns empty array when sprint-state.json does not exist', () => {
    expect(readFlaggedStories(testDir)).toEqual([]);
  });

  it('returns flagged stories from sprint-state.json', () => {
    writeFileSync(stateFile, makeStateJson({ flagged: ['story-a', 'story-b'] }));
    expect(readFlaggedStories(testDir)).toEqual(['story-a', 'story-b']);
  });

  it('returns empty array when flagged field is empty', () => {
    writeFileSync(stateFile, makeStateJson({ flagged: [] }));
    expect(readFlaggedStories(testDir)).toEqual([]);
  });
});

// ─── writeFlaggedStories ──────────────────────────────────────────────────────

describe('writeFlaggedStories', () => {
  it('writes flagged stories to sprint-state.json', () => {
    writeFileSync(stateFile, makeStateJson());
    writeFlaggedStories(testDir, ['story-a', 'story-b']);
    const state = readState();
    expect(state.flagged).toEqual(['story-a', 'story-b']);
  });

  it('writes empty array for empty input', () => {
    writeFileSync(stateFile, makeStateJson({ flagged: ['old'] }));
    writeFlaggedStories(testDir, []);
    const state = readState();
    expect(state.flagged).toEqual([]);
  });
});

// ─── removeFlaggedStory ───────────────────────────────────────────────────────

describe('removeFlaggedStory', () => {
  it('removes a single story from flagged list', () => {
    writeFileSync(stateFile, makeStateJson({ flagged: ['story-a', 'story-b', 'story-c'] }));
    removeFlaggedStory(testDir, 'story-b');
    const state = readState();
    expect(state.flagged).toEqual(['story-a', 'story-c']);
  });

  it('is a no-op when story is not in list', () => {
    writeFileSync(stateFile, makeStateJson({ flagged: ['story-a'] }));
    removeFlaggedStory(testDir, 'nonexistent');
    const state = readState();
    expect(state.flagged).toEqual(['story-a']);
  });

  it('works when sprint-state.json does not exist', () => {
    removeFlaggedStory(testDir, 'story-a');
    // Should create sprint-state.json with empty flagged
    expect(existsSync(stateFile)).toBe(true);
    const state = readState();
    expect(state.flagged).toEqual([]);
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
