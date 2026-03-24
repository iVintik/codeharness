import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SprintState } from '../../types/state.js';
import {
  processRetroActionItems,
  ensureEpicTd,
  createTdStory,
  nextTdStoryNumber,
  generateSlug,
} from '../retro-to-sprint.js';

function baseState(): SprintState {
  return {
    version: 2,
    sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
    stories: {},
    retries: {},
    flagged: [],
    epics: {},
    session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
    observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
    run: {
      active: false, startedAt: null, iteration: 0, cost: 0,
      completed: [], failed: [], currentStory: null,
      currentPhase: null, lastAction: null, acProgress: null,
    },
    actionItems: [],
  };
}

const RETRO_CONTENT = `
## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts (line 73)
- Update init-project to persist multi-stacks

### Fix Soon (Next Sprint)
1. Add element type checking to isValidState()

### Backlog (Track But Not Urgent)
- Remove StackDetection type duplication
- Address pre-existing TS compilation errors
`;

// ─── processRetroActionItems ────────────────────────────────────────────

describe('processRetroActionItems', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'retro-to-sprint-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates TD stories for Fix Now items', () => {
    const state = baseState();
    const result = processRetroActionItems(RETRO_CONTENT, state, testDir);
    const tdKeys = Object.keys(result.updatedState.stories).filter(k => k.startsWith('TD-'));
    // 2 fix-now + 1 fix-soon = 3 TD stories
    expect(tdKeys.length).toBe(3);
    expect(result.created).toHaveLength(3);
  });

  it('creates TD stories for Fix Soon items', () => {
    const content = `
## 6. Action Items

### Fix Soon (Next Sprint)
- Add element type checking to isValidState()
`;
    const result = processRetroActionItems(content, baseState(), testDir);
    expect(result.created).toHaveLength(1);
    expect(Object.keys(result.updatedState.stories)).toContain('TD-1-add-element-type-checking-to-isvalidstat');
  });

  it('does NOT create stories for Backlog items, appends to file', () => {
    const result = processRetroActionItems(RETRO_CONTENT, baseState(), testDir);
    // Backlog items should not be in stories
    const tdKeys = Object.keys(result.updatedState.stories).filter(k => k.startsWith('TD-'));
    expect(tdKeys.length).toBe(3); // only fix-now and fix-soon

    // Backlog items should be in backlogAppended
    expect(result.backlogAppended).toHaveLength(2);
    expect(result.backlogAppended[0]).toBe('Remove StackDetection type duplication');

    // File should exist
    const filePath = join(testDir, 'tech-debt-backlog.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Remove StackDetection type duplication');
    expect(content).toContain('Address pre-existing TS compilation errors');
  });

  it('skips duplicate items (80%+ overlap)', () => {
    const state: SprintState = {
      ...baseState(),
      stories: {
        'TD-1-fix-bare-catch-blocks-in-registryts': {
          status: 'backlog', attempts: 0,
          lastAttempt: null, lastError: null, proofPath: null, acResults: null,
        },
      },
      epics: { 'epic-TD': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 } },
    };
    const content = `
## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts (line 73)
- A completely new item here
`;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = processRetroActionItems(content, state, testDir);
    expect(result.skipped).toHaveLength(1);
    expect(result.created).toHaveLength(1);
    // Should log info about skipped duplicate
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO] Skipping duplicate'));
    consoleSpy.mockRestore();
  });

  it('creates non-duplicate items (< 80% overlap)', () => {
    const state: SprintState = {
      ...baseState(),
      stories: {
        'TD-1-fix-bare-catch-blocks': {
          status: 'backlog', attempts: 0,
          lastAttempt: null, lastError: null, proofPath: null, acResults: null,
        },
      },
      epics: { 'epic-TD': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 } },
    };
    const content = `
## 6. Action Items

### Fix Now
- Add unit tests for scanner module
`;
    const result = processRetroActionItems(content, state, testDir);
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('auto-creates epic-TD on first TD story', () => {
    const state = baseState();
    expect(state.epics['epic-TD']).toBeUndefined();

    const content = `
## 6. Action Items

### Fix Now
- Some new item
`;
    const result = processRetroActionItems(content, state, testDir);
    expect(result.updatedState.epics['epic-TD']).toBeDefined();
    expect(result.updatedState.epics['epic-TD'].status).toBe('in-progress');
    expect(result.updatedState.epics['epic-TD'].storiesTotal).toBe(1);
  });

  it('increments epic-TD.storiesTotal on subsequent stories', () => {
    const state: SprintState = {
      ...baseState(),
      stories: {
        'TD-1-existing-story': {
          status: 'done', attempts: 1,
          lastAttempt: null, lastError: null, proofPath: null, acResults: null,
        },
      },
      epics: { 'epic-TD': { status: 'in-progress', storiesTotal: 1, storiesDone: 1 } },
    };
    const content = `
## 6. Action Items

### Fix Now
- New item one
- New item two
`;
    const result = processRetroActionItems(content, state, testDir);
    expect(result.updatedState.epics['epic-TD'].storiesTotal).toBe(3);
  });

  it('auto-increments TD story numbering correctly', () => {
    const state: SprintState = {
      ...baseState(),
      stories: {
        'TD-1-first-story': {
          status: 'done', attempts: 0,
          lastAttempt: null, lastError: null, proofPath: null, acResults: null,
        },
        'TD-2-second-story': {
          status: 'backlog', attempts: 0,
          lastAttempt: null, lastError: null, proofPath: null, acResults: null,
        },
      },
      epics: { 'epic-TD': { status: 'in-progress', storiesTotal: 2, storiesDone: 1 } },
    };
    const content = `
## 6. Action Items

### Fix Now
- A third new item
`;
    const result = processRetroActionItems(content, state, testDir);
    const keys = Object.keys(result.updatedState.stories).filter(k => k.startsWith('TD-'));
    expect(keys).toContain('TD-3-a-third-new-item');
  });

  it('does not report backlogAppended when projectRoot is omitted', () => {
    const result = processRetroActionItems(RETRO_CONTENT, baseState());
    // Backlog items parsed but not written — should not appear in backlogAppended
    expect(result.backlogAppended).toHaveLength(0);
    // But fix-now and fix-soon stories should still be created
    expect(result.created).toHaveLength(3);
  });
});

// ─── ensureEpicTd ───────────────────────────────────────────────────────

describe('ensureEpicTd', () => {
  it('creates epic-TD when absent', () => {
    const state = baseState();
    const result = ensureEpicTd(state);
    expect(result.epics['epic-TD']).toEqual({
      status: 'in-progress',
      storiesTotal: 0,
      storiesDone: 0,
    });
  });

  it('returns same state when epic-TD exists', () => {
    const state: SprintState = {
      ...baseState(),
      epics: { 'epic-TD': { status: 'in-progress', storiesTotal: 2, storiesDone: 1 } },
    };
    const result = ensureEpicTd(state);
    expect(result).toBe(state); // same reference
  });
});

// ─── nextTdStoryNumber ──────────────────────────────────────────────────

describe('nextTdStoryNumber', () => {
  it('returns 1 when no TD stories exist', () => {
    expect(nextTdStoryNumber(baseState())).toBe(1);
  });

  it('returns max+1 from existing TD stories', () => {
    const state: SprintState = {
      ...baseState(),
      stories: {
        'TD-3-some-story': { status: 'done', attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null },
        'TD-1-other-story': { status: 'done', attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null },
      },
    };
    expect(nextTdStoryNumber(state)).toBe(4);
  });

  it('ignores non-TD story keys', () => {
    const state: SprintState = {
      ...baseState(),
      stories: {
        '1-1-normal-story': { status: 'done', attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null },
      },
    };
    expect(nextTdStoryNumber(state)).toBe(1);
  });
});

// ─── generateSlug ───────────────────────────────────────────────────────

describe('generateSlug', () => {
  it('generates slug from item text', () => {
    expect(generateSlug('Fix bare catch blocks in registry.ts')).toBe('fix-bare-catch-blocks-in-registry-ts');
  });

  it('truncates to 40 chars and trims trailing hyphens', () => {
    const slug = generateSlug('This is a very long description that should be truncated at forty characters');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).not.toMatch(/-$/);
  });

  it('removes leading and trailing hyphens', () => {
    expect(generateSlug('  -test item-  ')).toBe('test-item');
  });

  it('returns "untitled" for punctuation-only input', () => {
    expect(generateSlug('...')).toBe('untitled');
    expect(generateSlug('')).toBe('untitled');
    expect(generateSlug('   ')).toBe('untitled');
  });
});
