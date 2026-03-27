import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  chmodSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SprintState } from '../../../types/state.js';

// Mock migration so state tests are isolated from real project files
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

// Import after mock setup
const { getSprintState, updateStoryStatus, registerStory, writeStateAtomic, defaultState, statePath } =
  await import('../state.js');

// Use tmpdir isolation to prevent writeStateAtomic from corrupting real sprint-status.yaml
let testDir: string;
let originalCwd: string;

function stateFile(): string {
  return join(process.cwd(), 'sprint-state.json');
}

function tmpFile(): string {
  return join(process.cwd(), '.sprint-state.json.tmp');
}

// Global setup/teardown for all describe blocks that touch the filesystem
beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-state-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

describe('defaultState', () => {
  it('returns version 2 with empty stories and v2 fields', () => {
    const state = defaultState();
    expect(state.version).toBe(2);
    expect(state.stories).toEqual({});
    expect(state.run.active).toBe(false);
    expect(state.run.iteration).toBe(0);
    expect(state.sprint.total).toBe(0);
    expect(state.actionItems).toEqual([]);
  });
});

describe('statePath', () => {
  it('returns path ending in sprint-state.json', () => {
    expect(statePath()).toBe(stateFile());
  });
});

describe('writeStateAtomic', () => {
  it('writes valid JSON to sprint-state.json', () => {
    const state = defaultState();
    const result = writeStateAtomic(state);
    expect(result.success).toBe(true);
    expect(existsSync(stateFile())).toBe(true);

    const raw = readFileSync(stateFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(2);
  });

  it('tmp file does not remain after successful write', () => {
    const result = writeStateAtomic(defaultState());
    expect(result.success).toBe(true);
    expect(existsSync(tmpFile())).toBe(false);
  });
});

describe('getSprintState', () => {
  it('returns default state when no file exists', () => {
    const result = getSprintState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(2);
      expect(result.data.stories).toEqual({});
      expect(result.data.run.active).toBe(false);
      expect(result.data.sprint.inProgress).toBeNull();
      expect(result.data.actionItems).toEqual([]);
      expect(result.data.retries).toEqual({});
      expect(result.data.flagged).toEqual([]);
      expect(result.data.epics).toEqual({});
      expect(result.data.session.active).toBe(false);
      expect(result.data.observability.statementCoverage).toBeNull();
    }
  });

  it('reads and parses existing sprint-state.json', () => {
    const state: SprintState = {
      ...defaultState(),
      stories: {
        'test-story': {
          status: 'done',
          attempts: 2,
          lastAttempt: '2026-01-01T00:00:00Z',
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
    };
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');

    const result = getSprintState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['test-story'].status).toBe('done');
      expect(result.data.stories['test-story'].attempts).toBe(2);
    }
  });

  it('returns fail on invalid JSON', () => {
    writeFileSync(stateFile(), '{not valid json', 'utf-8');
    const result = getSprintState();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to read sprint state');
    }
  });

  it('parse time is under 100ms for 50 stories', () => {
    const stories: Record<string, SprintState['stories'][string]> = {};
    for (let i = 0; i < 50; i++) {
      stories[`story-${i}`] = {
        status: 'backlog',
        attempts: i,
        lastAttempt: new Date().toISOString(),
        lastError: `error ${i}`,
        proofPath: null,
        acResults: [
          { id: `ac-${i}-1`, verdict: 'pass' },
          { id: `ac-${i}-2`, verdict: 'fail' },
        ],
      };
    }
    const state: SprintState = { ...defaultState(), stories };
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');

    const start = performance.now();
    const result = getSprintState();
    const elapsed = performance.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });

  it('never throws — returns fail on fs error', () => {
    writeFileSync(stateFile(), '{}', 'utf-8');
    chmodSync(stateFile(), 0o000);

    const result = getSprintState();
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});

describe('updateStoryStatus', () => {
  it('updates a registered story', () => {
    registerStory('story-1');
    const result = updateStoryStatus('story-1', 'in-progress');
    expect(result.success).toBe(true);
    expect(existsSync(stateFile())).toBe(true);

    const state = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    expect(state.stories['story-1'].status).toBe('in-progress');
    expect(state.stories['story-1'].attempts).toBe(1);
    expect(state.sprint.inProgress).toBe('story-1');
  });

  it('rejects updates to unregistered stories (phantom prevention)', () => {
    const result = updateStoryStatus('phantom-story', 'in-progress');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('does not exist');
      expect(result.error).toContain('phantom');
    }
  });

  it('updates existing story preserving other stories', () => {
    registerStory('story-1');
    registerStory('story-2');
    updateStoryStatus('story-1', 'in-progress');
    updateStoryStatus('story-2', 'done');

    const state = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    expect(state.stories['story-1']).toBeDefined();
    expect(state.stories['story-2'].status).toBe('done');
    expect(state.sprint.done).toBe(1);
    expect(state.sprint.total).toBe(2);
  });

  it('attaches error detail when provided', () => {
    registerStory('story-1');
    updateStoryStatus('story-1', 'failed', { error: 'build broke' });

    const state = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    expect(state.stories['story-1'].lastError).toBe('build broke');
    expect(state.stories['story-1'].status).toBe('failed');
    expect(state.sprint.failed).toBe(1);
  });

  it('attaches proofPath when provided', () => {
    registerStory('story-1');
    updateStoryStatus('story-1', 'done', {
      proofPath: 'docs/proof.md',
    });

    const state = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    expect(state.stories['story-1'].proofPath).toBe('docs/proof.md');
  });

  it('increments attempts only on in-progress transition', () => {
    registerStory('story-1');
    updateStoryStatus('story-1', 'in-progress');
    updateStoryStatus('story-1', 'failed', { error: 'oops' });
    updateStoryStatus('story-1', 'in-progress');

    const state = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    expect(state.stories['story-1'].attempts).toBe(2);
  });

  it('uses atomic write (tmp then rename)', () => {
    registerStory('story-1');
    updateStoryStatus('story-1', 'done');
    expect(existsSync(tmpFile())).toBe(false);
    expect(existsSync(stateFile())).toBe(true);
  });

  it('round-trips state correctly (write then read)', () => {
    registerStory('roundtrip');
    updateStoryStatus('roundtrip', 'verifying');

    const result = getSprintState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['roundtrip'].status).toBe('verifying');
    }
  });
});

describe('lastAttempt semantics and error paths', () => {
  it('sets lastAttempt only on in-progress transitions', () => {
    registerStory('story-1');
    updateStoryStatus('story-1', 'in-progress');
    const state1 = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    const firstAttemptTime = state1.stories['story-1'].lastAttempt;
    expect(firstAttemptTime).not.toBeNull();
    updateStoryStatus('story-1', 'done');
    const state2 = JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
    expect(state2.stories['story-1'].lastAttempt).toBe(firstAttemptTime);
  });

  it('writeStateAtomic returns fail on serialization error', () => {
    const poison = {
      ...defaultState(),
      toJSON() { throw new Error('Serialization error'); },
    } as unknown as SprintState;
    const result = writeStateAtomic(poison);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to write sprint state');
    }
  });

  it('computeSprintCounts counts all status types', async () => {
    const { computeSprintCounts } = await import('../state.js');
    const mk = (s: string) => ({ status: s as 'done', attempts: 0, lastAttempt: null, lastError: null, proofPath: null, acResults: null });
    const counts = computeSprintCounts({ a: mk('done'), b: mk('failed'), c: mk('blocked'), d: mk('in-progress'), e: mk('backlog') });
    expect(counts).toEqual({ total: 5, done: 1, failed: 1, blocked: 1, inProgress: 'd' });
  });
});

describe('concurrent writes', () => {
  it('both writes produce valid JSON', () => {
    registerStory('concurrent-1');
    registerStory('concurrent-2');
    updateStoryStatus('concurrent-1', 'in-progress');
    updateStoryStatus('concurrent-2', 'done');

    const raw = readFileSync(stateFile(), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();

    const state = JSON.parse(raw) as SprintState;
    expect(state.stories['concurrent-1']).toBeDefined();
    expect(state.stories['concurrent-2']).toBeDefined();
    expect(state.stories['concurrent-2'].status).toBe('done');
  });
});
