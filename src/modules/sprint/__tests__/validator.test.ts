import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';
import {
  validateStateConsistency,
  parseSprintStatusKeys,
  parseStateFile,
} from '../validator.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-18T12:00:00Z'));
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_SPRINT_STATUS = `story-a:
  status: done
story-b:
  status: in-progress
story-c:
  status: backlog
`;

const VALID_STATE = JSON.stringify({
  version: 1,
  sprint: { total: 3, done: 1, failed: 0, blocked: 0, inProgress: 'story-b' },
  stories: {
    'story-a': {
      status: 'done',
      attempts: 2,
      lastAttempt: '2026-03-18T10:00:00Z',
      lastError: null,
      proofPath: null,
      acResults: null,
    },
    'story-b': {
      status: 'in-progress',
      attempts: 1,
      lastAttempt: '2026-03-18T11:00:00Z',
      lastError: null,
      proofPath: null,
      acResults: null,
    },
    'story-c': {
      status: 'backlog',
      attempts: 0,
      lastAttempt: null,
      lastError: null,
      proofPath: null,
      acResults: null,
    },
  },
  run: { active: true, startedAt: '2026-03-18T09:00:00Z', iteration: 5, cost: 1.5, completed: ['story-a'], failed: [] },
  actionItems: [],
});

// ─── parseSprintStatusKeys ───────────────────────────────────────────────────

describe('parseSprintStatusKeys', () => {
  it('extracts top-level keys from yaml content', () => {
    const result = parseSprintStatusKeys(VALID_SPRINT_STATUS);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(['story-a', 'story-b', 'story-c']);
  });

  it('returns empty array for empty content', () => {
    const result = parseSprintStatusKeys('');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it('ignores indented keys and comments', () => {
    const content = `# comment
story-x:
  status: done
  nested-key:
    deep: value
story-y:
`;
    const result = parseSprintStatusKeys(content);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(['story-x', 'story-y']);
  });
});

// ─── parseStateFile ──────────────────────────────────────────────────────────

describe('parseStateFile', () => {
  it('parses a valid state file', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(VALID_STATE);

    const result = parseStateFile('/tmp/sprint-state.json');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.version).toBe(1);
    expect(Object.keys(result.data.stories)).toHaveLength(3);
  });

  it('returns fail() when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = parseStateFile('/tmp/missing.json');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('State file not found');
  });

  it('returns fail() on invalid JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{bad json}}}');

    const result = parseStateFile('/tmp/bad.json');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to parse state file');
  });

  it('returns fail() on read error', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = parseStateFile('/tmp/noperm.json');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('EACCES');
  });
});

// ─── validateStateConsistency ────────────────────────────────────────────────

describe('validateStateConsistency', () => {
  it('returns valid report when state matches sprint-status', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(VALID_STATE) // state file
      .mockReturnValueOnce(VALID_SPRINT_STATUS); // sprint-status.yaml

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.totalStories).toBe(3);
    expect(result.data.validCount).toBe(3);
    expect(result.data.invalidCount).toBe(0);
    expect(result.data.missingKeys).toEqual([]);
    expect(result.data.issues).toEqual([]);
  });

  it('detects missing story key in state', () => {
    const stateWithMissing = JSON.stringify({
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'done',
          attempts: 1,
          lastAttempt: '2026-03-18T10:00:00Z',
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithMissing)
      .mockReturnValueOnce(VALID_SPRINT_STATUS);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.missingKeys).toContain('story-b');
    expect(result.data.missingKeys).toContain('story-c');
    expect(result.data.invalidCount).toBe(2);
    expect(result.data.issues.some((i) => i.storyKey === 'story-b' && i.field === 'entry')).toBe(true);
  });

  it('detects invalid status value', () => {
    const stateWithBadStatus = JSON.stringify({
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'invalid-status',
          attempts: 1,
          lastAttempt: '2026-03-18T10:00:00Z',
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: in-progress
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithBadStatus)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.invalidCount).toBe(1);
    expect(result.data.issues.some((i) => i.field === 'status' && i.message.includes('invalid-status'))).toBe(true);
  });

  it('detects negative attempt count', () => {
    const stateWithNegativeAttempts = JSON.stringify({
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'backlog',
          attempts: -1,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: backlog
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithNegativeAttempts)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.invalidCount).toBe(1);
    expect(result.data.issues.some((i) => i.field === 'attempts' && i.message.includes('-1'))).toBe(true);
  });

  it('detects stale lastError (lastAttempt > 24h ago)', () => {
    const stateWithStaleError = JSON.stringify({
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'in-progress',
          attempts: 3,
          lastAttempt: '2026-03-16T10:00:00Z', // 2+ days ago
          lastError: 'some old error',
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: in-progress
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithStaleError)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.invalidCount).toBe(1);
    expect(result.data.issues.some((i) => i.field === 'lastError' && i.message.includes('Stale'))).toBe(true);
  });

  it('does not flag lastError as stale when within 24h window', () => {
    const recentState = JSON.stringify({
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'in-progress',
          attempts: 3,
          lastAttempt: '2026-03-18T11:00:00Z', // 1 hour ago
          lastError: 'recent error',
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: in-progress
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(recentState)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.invalidCount).toBe(0);
    expect(result.data.issues).toEqual([]);
  });

  it('recovers after interrupted session (state preserved)', () => {
    // Simulates interrupted state: active run, some stories done, some in-progress
    const interruptedState = JSON.stringify({
      version: 1,
      sprint: { total: 3, done: 1, failed: 0, blocked: 0, inProgress: 'story-b' },
      stories: {
        'story-a': {
          status: 'done',
          attempts: 2,
          lastAttempt: '2026-03-18T10:00:00Z',
          lastError: null,
          proofPath: null,
          acResults: null,
        },
        'story-b': {
          status: 'in-progress',
          attempts: 3,
          lastAttempt: '2026-03-18T11:30:00Z',
          lastError: 'SIGINT',
          proofPath: null,
          acResults: null,
        },
        'story-c': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: true, startedAt: '2026-03-18T09:00:00Z', iteration: 8, cost: 3.0, completed: ['story-a'], failed: [] },
      actionItems: [],
    });

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(interruptedState)
      .mockReturnValueOnce(VALID_SPRINT_STATUS);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // All stories should be valid (statuses are correct, attempts non-negative)
    expect(result.data.validCount).toBe(3);
    expect(result.data.invalidCount).toBe(0);
    expect(result.data.issues).toEqual([]);
  });

  it('returns fail() when state file is missing', () => {
    mockedExistsSync.mockReturnValueOnce(false); // state file

    const result = validateStateConsistency('/tmp/missing.json', '/tmp/status.yaml');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('State file not found');
  });

  it('returns fail() when sprint-status file is missing', () => {
    mockedExistsSync
      .mockReturnValueOnce(true) // state file exists
      .mockReturnValueOnce(false); // sprint-status missing

    mockedReadFileSync.mockReturnValueOnce(VALID_STATE);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/missing.yaml');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Sprint status file not found');
  });

  it('returns fail() on corrupted state JSON', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValueOnce('{corrupted!!!');

    const result = validateStateConsistency('/tmp/bad.json', '/tmp/status.yaml');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to parse state file');
  });

  it('detects sprint.total mismatch with actual story count', () => {
    const stateWithTotalMismatch = JSON.stringify({
      version: 1,
      sprint: { total: 10, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: backlog
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithTotalMismatch)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.issues.some((i) => i.field === 'sprint.total' && i.message.includes('10'))).toBe(true);
  });

  it('detects extra stories in state not in sprint-status', () => {
    const stateWithExtra = JSON.stringify({
      version: 1,
      sprint: { total: 2, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
        'story-extra': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: backlog
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithExtra)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.issues.some((i) => i.storyKey === 'story-extra' && i.message.includes('no entry in sprint-status.yaml'))).toBe(true);
    // totalStories should be union: story-a + story-extra = 2
    expect(result.data.totalStories).toBe(2);
  });

  it('computes totalStories as union of sprint-status and state keys', () => {
    // Sprint-status has story-a, story-b, story-c
    // State has story-a, story-d (missing b,c from status; extra d not in status)
    const statePartial = JSON.stringify({
      version: 1,
      sprint: { total: 2, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
        'story-d': {
          status: 'backlog',
          attempts: 0,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(statePartial)
      .mockReturnValueOnce(VALID_SPRINT_STATUS);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Union: story-a, story-b, story-c, story-d = 4
    expect(result.data.totalStories).toBe(4);
    expect(result.data.missingKeys).toContain('story-b');
    expect(result.data.missingKeys).toContain('story-c');
  });

  it('detects non-integer attempt count', () => {
    const stateWithFloat = JSON.stringify({
      version: 1,
      sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': {
          status: 'backlog',
          attempts: 2.5,
          lastAttempt: null,
          lastError: null,
          proofPath: null,
          acResults: null,
        },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: backlog
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithFloat)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.invalidCount).toBe(1);
    expect(result.data.issues.some((i) => i.field === 'attempts')).toBe(true);
  });
});

// ─── All functions return Result<T> — never throw ────────────────────────────

describe('all functions return Result<T> — never throw', () => {
  it('parseSprintStatusKeys never throws', () => {
    // parseSprintStatusKeys takes a string, so it should never throw
    // even with weird input
    expect(() => parseSprintStatusKeys('')).not.toThrow();
    expect(() => parseSprintStatusKeys(':::invalid:::')).not.toThrow();
  });

  it('parseStateFile never throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('crash');
    });
    expect(() => parseStateFile('/tmp/crash.json')).not.toThrow();
    const result = parseStateFile('/tmp/crash.json');
    expect(result.success).toBe(false);
  });

  it('validateStateConsistency never throws', () => {
    mockedExistsSync.mockImplementation(() => {
      throw new Error('unexpected crash');
    });
    expect(() => validateStateConsistency('/tmp/x.json', '/tmp/y.yaml')).not.toThrow();
    const result = validateStateConsistency('/tmp/x.json', '/tmp/y.yaml');
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error may be caught by inner parseStateFile or outer validateStateConsistency
      expect(result.error).toContain('unexpected crash');
    }
  });

  it('validateStateConsistency handles non-Error thrown values', () => {
    mockedExistsSync.mockImplementation(() => {
      throw 'string error';
    });
    const result = validateStateConsistency('/tmp/x.json', '/tmp/y.yaml');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('string error');
    }
  });
});

// ─── Defensive catch coverage ─────────────────────────────────────────────────

describe('defensive catch blocks', () => {
  it('parseSprintStatusKeys catches when content.split throws', () => {
    // Create a string-like object whose split method throws
    const badContent = {
      split: () => {
        throw new Error('split exploded');
      },
    } as unknown as string;

    const result = parseSprintStatusKeys(badContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to parse sprint-status.yaml');
      expect(result.error).toContain('split exploded');
    }
  });

  it('parseSprintStatusKeys catch handles non-Error thrown values', () => {
    const badContent = {
      split: () => {
        throw 42;
      },
    } as unknown as string;

    const result = parseSprintStatusKeys(badContent);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('42');
    }
  });

  it('validateStateConsistency propagates parseSprintStatusKeys failure (line 115)', () => {
    // State file parses fine, sprint-status file exists, but its content
    // causes parseSprintStatusKeys to fail.
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(VALID_STATE) // state file — valid JSON
      .mockReturnValueOnce({
        // sprint-status content — a non-string whose split() throws
        split: () => {
          throw new Error('yaml parse boom');
        },
      } as unknown as string);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to parse sprint-status.yaml');
      expect(result.error).toContain('yaml parse boom');
    }
  });

  it('validateStateConsistency outer catch handles unexpected Error in validation loop (lines 207-208)', () => {
    // State parses fine but stories is null, causing Object.keys to throw
    // when iterating stories in the validation loop.
    const stateWithNullStories = JSON.stringify({
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: null,
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
      actionItems: [],
    });

    const simpleStatus = `story-a:
  status: backlog
`;

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(stateWithNullStories)
      .mockReturnValueOnce(simpleStatus);

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
    }
  });

  it('validateStateConsistency outer catch handles non-Error thrown in validation loop (line 207 else branch)', () => {
    // Mock readFileSync to return valid state on first call,
    // then throw a non-Error value on the second call (sprint-status read at line 112).
    // This bypasses parseStateFile's inner try-catch (which succeeds)
    // and hits the outer catch with a non-Error value.
    mockedExistsSync.mockReturnValue(true);

    // First call: state file — returns valid JSON
    // Second call: sprint-status file — throws a non-Error primitive
    mockedReadFileSync
      .mockReturnValueOnce(VALID_STATE)
      .mockImplementationOnce(() => {
         
        throw 42;
      });

    const result = validateStateConsistency('/tmp/state.json', '/tmp/status.yaml');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation failed');
      expect(result.error).toContain('42');
    }
  });
});
