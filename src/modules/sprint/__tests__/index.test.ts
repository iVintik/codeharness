import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Mock migration so index tests are isolated from real project files
vi.mock('../migration.js', () => ({
  migrateFromOldFormat: vi.fn(() => ({
    success: false,
    error: 'No old format files found for migration',
  })),
}));

const {
  getNextStory,
  updateStoryStatus,
  getSprintState,
  generateReport,
  getStoryDrillDown,
} = await import('../index.js');

const { writeFileSync } = await import('node:fs');

const STATE_FILE = join(process.cwd(), 'sprint-state.json');
const TMP_FILE = join(process.cwd(), '.sprint-state.json.tmp');

function cleanup(): void {
  for (const f of [STATE_FILE, TMP_FILE]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe('sprint module', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('getNextStory returns ok with null selected when no stories exist', () => {
    const result = getNextStory();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected).toBeNull();
      expect(result.data.retryExhausted).toEqual([]);
    }
  });

  it('getNextStory delegates to selector and returns selected story', () => {
    // Write a state file with a backlog story
    const state = {
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'test-story': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: {
        active: false,
        startedAt: null,
        iteration: 0,
        cost: 0,
        completed: [],
        failed: [],
      },
      actionItems: [],
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

    const result = getNextStory();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected).not.toBeNull();
      expect(result.data.selected!.key).toBe('test-story');
    }
  });

  it('getNextStory marks retry-exhausted stories as blocked', () => {
    const state = {
      version: 1,
      sprint: { total: 2, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'exhausted-story': {
          status: 'backlog',
          attempts: 10,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
        'good-story': {
          status: 'backlog',
          attempts: 1,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: {
        active: false,
        startedAt: null,
        iteration: 0,
        cost: 0,
        completed: [],
        failed: [],
      },
      actionItems: [],
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

    const result = getNextStory();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('good-story');
      expect(result.data.retryExhausted).toHaveLength(1);
      expect(result.data.retryExhausted[0].key).toBe('exhausted-story');
    }

    // Verify the exhausted story was actually marked as blocked in state
    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.stories['exhausted-story'].status).toBe(
        'blocked',
      );
      expect(stateResult.data.stories['exhausted-story'].lastError).toBe(
        'retry-exhausted',
      );
    }
  });

  it('getNextStory returns fail on state read error', () => {
    writeFileSync(STATE_FILE, '{invalid json!!!', 'utf-8');
    const result = getNextStory();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint state');
    }
  });

  it('getSprintState returns ok with default state when no file exists', () => {
    const result = getSprintState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.stories).toEqual({});
    }
  });

  it('updateStoryStatus writes state successfully', () => {
    const result = updateStoryStatus('1.1', 'in-progress');
    expect(result.success).toBe(true);
  });

  it('updateStoryStatus with detail writes state successfully', () => {
    const result = updateStoryStatus('1.1', 'failed', { error: 'boom' });
    expect(result.success).toBe(true);
  });

  it('generateReport returns a valid StatusReport from state', () => {
    // Write a state file with some stories
    const state = {
      version: 1,
      sprint: { total: 2, done: 1, failed: 0, blocked: 0, inProgress: null },
      stories: {
        '1-1-a': {
          status: 'done',
          attempts: 1,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
        '2-1-b': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: {
        active: false,
        startedAt: null,
        iteration: 0,
        cost: 0,
        completed: [],
        failed: [],
      },
      actionItems: [],
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

    const result = generateReport();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(2);
      expect(result.data.done).toBe(1);
      expect(result.data.epicsTotal).toBe(2);
      expect(result.data.sprintPercent).toBe(50);
      expect(result.data.storyStatuses).toHaveLength(2);
    }
  });

  it('generateReport returns ok with empty report when no state file', () => {
    const result = generateReport();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(0);
      expect(result.data.done).toBe(0);
    }
  });

  it('generateReport returns fail on corrupted state file', () => {
    writeFileSync(STATE_FILE, '{bad json!!!', 'utf-8');
    const result = generateReport();
    expect(result.success).toBe(false);
  });

  it('getStoryDrillDown delegates to reporter and returns drill-down data', () => {
    const state = {
      version: 1,
      sprint: { total: 1, done: 0, failed: 1, blocked: 0, inProgress: null },
      stories: {
        '2-3-status': {
          status: 'failed',
          attempts: 3,
          lastAttempt: '2026-03-18T03:42:15Z',
          lastError: 'exit 1',
          proofPath: null,
          acResults: [{ id: 'AC1', verdict: 'pass' }, { id: 'AC4', verdict: 'fail' }],
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

    const result = getStoryDrillDown('2-3-status');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe('2-3-status');
      expect(result.data.status).toBe('failed');
      expect(result.data.epic).toBe('2');
      expect(result.data.attempts).toBe(3);
      expect(result.data.acDetails).toHaveLength(2);
    }
  });

  it('getStoryDrillDown returns fail on state read error', () => {
    writeFileSync(STATE_FILE, '{invalid json!!!', 'utf-8');
    const result = getStoryDrillDown('anything');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint state');
    }
  });

  it('getStoryDrillDown returns fail for nonexistent story', () => {
    const result = getStoryDrillDown('nonexistent');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Story 'nonexistent' not found");
    }
  });
});
