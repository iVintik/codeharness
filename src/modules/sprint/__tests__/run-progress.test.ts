import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SprintState } from '../../../types/state.js';

// Mock migration so tests are isolated from real project files
vi.mock('../migration.js', () => ({
  migrateFromOldFormat: vi.fn(() => ({
    success: false,
    error: 'No old format files found for migration',
  })),
}));

// Import after mock setup
const {
  updateRunProgress,
  clearRunProgress,
  getSprintState,
  writeStateAtomic,
  defaultState,
} = await import('../state.js');

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-run-progress-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

function stateFile(): string {
  return join(process.cwd(), 'sprint-state.json');
}

function tmpFile(): string {
  return join(process.cwd(), '.sprint-state.json.tmp');
}

describe('updateRunProgress', () => {
  it('sets all progress fields on existing state', () => {
    writeStateAtomic(defaultState());

    const result = updateRunProgress({
      currentStory: '1-2-user-auth',
      currentPhase: 'dev',
      lastAction: 'Starting development',
      acProgress: '0/7',
    });

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBe('1-2-user-auth');
      expect(stateResult.data.run.currentPhase).toBe('dev');
      expect(stateResult.data.run.lastAction).toBe('Starting development');
      expect(stateResult.data.run.acProgress).toBe('0/7');
    }
  });

  it('partial update only changes specified fields', () => {
    const state = defaultState();
    const stateWithProgress: SprintState = {
      ...state,
      run: {
        ...state.run,
        currentStory: '1-2-user-auth',
        currentPhase: 'dev',
        lastAction: 'Starting development',
        acProgress: null,
      },
    };
    writeStateAtomic(stateWithProgress);

    const result = updateRunProgress({
      currentPhase: 'verify',
    });

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBe('1-2-user-auth');
      expect(stateResult.data.run.currentPhase).toBe('verify');
      expect(stateResult.data.run.lastAction).toBe('Starting development');
      expect(stateResult.data.run.acProgress).toBeNull();
    }
  });

  it('updates only acProgress without clearing other fields', () => {
    const state = defaultState();
    const stateWithProgress: SprintState = {
      ...state,
      run: {
        ...state.run,
        currentStory: '1-2-user-auth',
        currentPhase: 'verify',
        lastAction: 'Running verification',
        acProgress: '2/7',
      },
    };
    writeStateAtomic(stateWithProgress);

    const result = updateRunProgress({ acProgress: '5/7' });

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBe('1-2-user-auth');
      expect(stateResult.data.run.currentPhase).toBe('verify');
      expect(stateResult.data.run.lastAction).toBe('Running verification');
      expect(stateResult.data.run.acProgress).toBe('5/7');
    }
  });

  it('can set a field to null explicitly', () => {
    const state = defaultState();
    const stateWithProgress: SprintState = {
      ...state,
      run: {
        ...state.run,
        currentStory: '1-2-user-auth',
        currentPhase: 'dev',
        lastAction: 'Working',
        acProgress: '3/7',
      },
    };
    writeStateAtomic(stateWithProgress);

    const result = updateRunProgress({ acProgress: null });

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.acProgress).toBeNull();
      expect(stateResult.data.run.currentStory).toBe('1-2-user-auth');
    }
  });

  it('preserves non-progress run fields (active, iteration, etc.)', () => {
    const state = defaultState();
    const stateWithRun: SprintState = {
      ...state,
      run: {
        ...state.run,
        active: true,
        startedAt: '2026-03-19T10:00:00Z',
        iteration: 3,
        cost: 1.5,
        completed: ['story-a'],
        failed: ['story-b'],
      },
    };
    writeStateAtomic(stateWithRun);

    const result = updateRunProgress({
      currentStory: '1-3-new-story',
      currentPhase: 'create',
    });

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.active).toBe(true);
      expect(stateResult.data.run.startedAt).toBe('2026-03-19T10:00:00Z');
      expect(stateResult.data.run.iteration).toBe(3);
      expect(stateResult.data.run.cost).toBe(1.5);
      expect(stateResult.data.run.completed).toEqual(['story-a']);
      expect(stateResult.data.run.failed).toEqual(['story-b']);
      expect(stateResult.data.run.currentStory).toBe('1-3-new-story');
      expect(stateResult.data.run.currentPhase).toBe('create');
    }
  });

  it('creates state file if none exists', () => {
    const result = updateRunProgress({
      currentStory: 'new-story',
      currentPhase: 'dev',
    });

    expect(result.success).toBe(true);
    expect(existsSync(stateFile())).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBe('new-story');
    }
  });

  it('uses atomic write (no tmp file remains)', () => {
    writeStateAtomic(defaultState());

    updateRunProgress({ currentStory: 'test', currentPhase: 'dev' });

    expect(existsSync(tmpFile())).toBe(false);
    expect(existsSync(stateFile())).toBe(true);
  });

  it('returns fail on read error', () => {
    writeFileSync(stateFile(), '{invalid json', 'utf-8');

    const result = updateRunProgress({ currentStory: 'test' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint state');
    }
  });

  it('empty update (no fields specified) writes state unchanged', () => {
    const state = defaultState();
    const stateWithProgress: SprintState = {
      ...state,
      run: {
        ...state.run,
        currentStory: 'keep-me',
        currentPhase: 'dev',
      },
    };
    writeStateAtomic(stateWithProgress);

    const result = updateRunProgress({});

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBe('keep-me');
      expect(stateResult.data.run.currentPhase).toBe('dev');
    }
  });
});

describe('clearRunProgress', () => {
  it('resets all live fields to null', () => {
    const state = defaultState();
    const stateWithProgress: SprintState = {
      ...state,
      run: {
        ...state.run,
        currentStory: '1-2-user-auth',
        currentPhase: 'verify',
        lastAction: 'Checking AC 5',
        acProgress: '4/7',
      },
    };
    writeStateAtomic(stateWithProgress);

    const result = clearRunProgress();

    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBeNull();
      expect(stateResult.data.run.currentPhase).toBeNull();
      expect(stateResult.data.run.lastAction).toBeNull();
      expect(stateResult.data.run.acProgress).toBeNull();
    }
  });

  it('preserves non-progress run fields', () => {
    const state = defaultState();
    const stateWithRun: SprintState = {
      ...state,
      run: {
        ...state.run,
        active: true,
        startedAt: '2026-03-19T10:00:00Z',
        iteration: 5,
        cost: 2.0,
        completed: ['story-x'],
        failed: ['story-y'],
        currentStory: 'to-clear',
        currentPhase: 'dev',
        lastAction: 'to-clear',
        acProgress: '1/3',
      },
    };
    writeStateAtomic(stateWithRun);

    clearRunProgress();

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.active).toBe(true);
      expect(stateResult.data.run.startedAt).toBe('2026-03-19T10:00:00Z');
      expect(stateResult.data.run.iteration).toBe(5);
      expect(stateResult.data.run.cost).toBe(2.0);
      expect(stateResult.data.run.completed).toEqual(['story-x']);
      expect(stateResult.data.run.failed).toEqual(['story-y']);
      expect(stateResult.data.run.currentStory).toBeNull();
      expect(stateResult.data.run.currentPhase).toBeNull();
      expect(stateResult.data.run.lastAction).toBeNull();
      expect(stateResult.data.run.acProgress).toBeNull();
    }
  });

  it('is idempotent — clearing already-null fields succeeds', () => {
    writeStateAtomic(defaultState());

    const result = clearRunProgress();
    expect(result.success).toBe(true);

    const stateResult = getSprintState();
    expect(stateResult.success).toBe(true);
    if (stateResult.success) {
      expect(stateResult.data.run.currentStory).toBeNull();
      expect(stateResult.data.run.currentPhase).toBeNull();
      expect(stateResult.data.run.lastAction).toBeNull();
      expect(stateResult.data.run.acProgress).toBeNull();
    }
  });

  it('creates state file if none exists', () => {
    const result = clearRunProgress();

    expect(result.success).toBe(true);
    expect(existsSync(stateFile())).toBe(true);
  });

  it('returns fail on read error', () => {
    writeFileSync(stateFile(), '{invalid json', 'utf-8');

    const result = clearRunProgress();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint state');
    }
  });
});

describe('atomic write guarantee for concurrent readers', () => {
  it('state is complete JSON immediately after write', () => {
    writeStateAtomic(defaultState());

    updateRunProgress({
      currentStory: '1-2-user-auth',
      currentPhase: 'verify',
      lastAction: 'Running AC checks',
      acProgress: '3/7',
    });

    // Simulate external reader
    const raw = readFileSync(stateFile(), 'utf-8');
    const parsed = JSON.parse(raw) as SprintState;

    expect(parsed.version).toBe(1);
    expect(parsed.run.currentStory).toBe('1-2-user-auth');
    expect(parsed.run.currentPhase).toBe('verify');
    expect(parsed.run.lastAction).toBe('Running AC checks');
    expect(parsed.run.acProgress).toBe('3/7');
  });

  it('rapid sequential updates produce valid JSON each time', () => {
    writeStateAtomic(defaultState());

    for (let i = 1; i <= 10; i++) {
      updateRunProgress({ acProgress: `${i}/10` });

      const raw = readFileSync(stateFile(), 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();

      const parsed = JSON.parse(raw) as SprintState;
      expect(parsed.run.acProgress).toBe(`${i}/10`);
    }
  });
});

describe('backward compatibility', () => {
  it('getSprintState fills missing progress fields with null defaults on old state files', () => {
    // Simulate an old state file without the new progress fields
    const oldState = {
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: {
        active: false,
        startedAt: null,
        iteration: 0,
        cost: 0,
        completed: [],
        failed: [],
        // No currentStory, currentPhase, lastAction, acProgress
      },
      actionItems: [],
    };
    writeFileSync(
      join(process.cwd(), 'sprint-state.json'),
      JSON.stringify(oldState, null, 2),
      'utf-8',
    );

    const result = getSprintState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.run.currentStory).toBeNull();
      expect(result.data.run.currentPhase).toBeNull();
      expect(result.data.run.lastAction).toBeNull();
      expect(result.data.run.acProgress).toBeNull();
    }
  });
});
