import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock migration so index tests are isolated from real project files
vi.mock('../migration.js', () => ({
  migrateFromOldFormat: vi.fn(() => ({
    success: false,
    error: 'No old format files found for migration',
  })),
  migrateV1ToV2: vi.fn((v1: Record<string, unknown>) => ({
    ...v1,
    version: 2,
    retries: {},
    flagged: [],
    epics: {},
    session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
    observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
  })),
}));

const {
  getNextStory,
  updateStoryStatus,
  getSprintState,
  generateReport,
  getStoryDrillDown,
  generateSprintStatusYaml,
  getStoryStatusesFromState,
  readSprintStatusFromState,
  writeStateAtomic,
  computeSprintCounts,
} = await import('../index.js');

const { defaultState } = await import('../state.js');
const { writeFileSync } = await import('node:fs');

// Use tmpdir isolation to prevent writeStateAtomic side effects from
// corrupting real sprint-status.yaml in the project directory.
let testDir: string;
let originalCwd: string;

function stateFile(): string {
  return join(process.cwd(), 'sprint-state.json');
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-index-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

describe('sprint module', () => {
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
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');

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
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');

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
    writeFileSync(stateFile(), '{invalid json!!!', 'utf-8');
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
      expect(result.data.version).toBe(2);
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
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');

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
    writeFileSync(stateFile(), '{bad json!!!', 'utf-8');
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
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');

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
    writeFileSync(stateFile(), '{invalid json!!!', 'utf-8');
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

// ─── Story 11-2: YAML generation and status derivation via index ────────────

describe('sprint module — YAML generation exports', () => {
  it('generateSprintStatusYaml delegates to state implementation', () => {
    const state = defaultState();
    const yaml = generateSprintStatusYaml(state);
    expect(yaml).toContain('development_status:');
    expect(yaml).toContain('auto-generated');
  });

  it('getStoryStatusesFromState delegates to state implementation', () => {
    const state = {
      ...defaultState(),
      stories: {
        '1-1-a': { status: 'done' as const, attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null },
      },
    };
    const result = getStoryStatusesFromState(state);
    expect(result).toEqual({ '1-1-a': 'done' });
  });

  it('readSprintStatusFromState returns empty map when no state file', () => {
    const result = readSprintStatusFromState();
    expect(result).toEqual({});
  });

  it('readSprintStatusFromState returns statuses from written state', () => {
    const state = {
      ...defaultState(),
      stories: {
        '2-1-story': { status: 'in-progress' as const, attempts: 1, lastAttempt: null, lastError: null, proofPath: null, acResults: null },
      },
    };
    writeStateAtomic(state);
    const result = readSprintStatusFromState();
    expect(result['2-1-story']).toBe('in-progress');
  });

  it('computeSprintCounts delegates to state implementation', () => {
    const mk = (s: string) => ({ status: s as 'done', attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null });
    const counts = computeSprintCounts({ a: mk('done'), b: mk('failed') });
    expect(counts.total).toBe(2);
    expect(counts.done).toBe(1);
    expect(counts.failed).toBe(1);
  });
});
