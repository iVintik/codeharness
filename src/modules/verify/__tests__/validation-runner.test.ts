import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SprintState, StoryState } from '../../../types/state.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock sprint module (public API)
const mockGetSprintState = vi.fn();
const mockWriteStateAtomic = vi.fn();
const mockComputeSprintCounts = vi.fn();

vi.mock('../../sprint/index.js', () => ({
  getSprintState: (...args: unknown[]) => mockGetSprintState(...args),
  writeStateAtomic: (...args: unknown[]) => mockWriteStateAtomic(...args),
  computeSprintCounts: (...args: unknown[]) => mockComputeSprintCounts(...args),
}));

// Mock dev module
const mockDevelopStory = vi.fn();
vi.mock('../../dev/index.js', () => ({
  developStory: (...args: unknown[]) => mockDevelopStory(...args),
}));

// Mock child_process
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock fs
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
vi.mock('node:fs', () => ({
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

// Import after mocks
import {
  createValidationSprint,
  executeValidationAC,
  createFixStory,
  processValidationResult,
} from '../validation-runner.js';
import {
  getValidationProgress,
  runValidationCycle,
} from '../validation-orchestrator.js';
import { VALIDATION_ACS } from '../validation-acs.js';
import type { ValidationAC } from '../validation-ac-types.js';
import type { ValidationACResult } from '../validation-runner-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyState(): SprintState {
  return {
    version: 2,
    sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
    stories: {},
    retries: {},
    flagged: [],
    epics: {},
    session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
    observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
    run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
    actionItems: [],
  };
}

function defaultStory(overrides?: Partial<StoryState>): StoryState {
  return {
    status: 'backlog',
    attempts: 0,
    lastAttempt: null,
    lastError: null,
    proofPath: null,
    acResults: null,
    ...overrides,
  };
}

function cliAC(id: number): ValidationAC {
  return {
    id,
    frRef: `FR${id}`,
    description: `Test AC ${id}`,
    verificationMethod: 'cli',
    command: `echo "AC ${id} ok"`,
    category: 'FR',
  };
}

function integrationAC(id: number): ValidationAC {
  return {
    id,
    frRef: `FR${id}`,
    description: `Test AC ${id}`,
    verificationMethod: 'integration',
    category: 'FR',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockComputeSprintCounts.mockReturnValue({
    total: 0, done: 0, failed: 0, blocked: 0, inProgress: null,
  });
  mockWriteStateAtomic.mockReturnValue({ success: true, data: undefined });
  mockDevelopStory.mockReturnValue({ success: true, data: { storyKey: 'test', status: 'done' } });
  mockMkdirSync.mockReturnValue(undefined);
  mockWriteFileSync.mockReturnValue(undefined);
});

// ─── Task 1: createValidationSprint ──────────────────────────────────────────

describe('createValidationSprint', () => {
  it('creates 79 story entries with correct initial state', () => {
    const state = emptyState();
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = createValidationSprint();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.acsAdded).toBe(79);
    expect(result.data.existingPreserved).toBe(0);

    // Verify writeStateAtomic was called with 79 val- entries
    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    const valKeys = Object.keys(writtenState.stories).filter(k => k.startsWith('val-'));
    expect(valKeys).toHaveLength(79);

    // Each entry has correct initial state
    for (const key of valKeys) {
      const story = writtenState.stories[key];
      expect(story.status).toBe('backlog');
      expect(story.attempts).toBe(0);
      expect(story.lastAttempt).toBeNull();
      expect(story.lastError).toBeNull();
    }
  });

  it('preserves existing non-validation stories in sprint-state.json', () => {
    const state = emptyState();
    state.stories['1-1-user-auth'] = defaultStory({ status: 'in-progress' });
    state.stories['2-1-data-model'] = defaultStory({ status: 'done' });
    // Treat stories as mutable for test setup
    (state as { stories: Record<string, StoryState> }).stories = {
      '1-1-user-auth': defaultStory({ status: 'in-progress' }),
      '2-1-data-model': defaultStory({ status: 'done' }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = createValidationSprint();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.existingPreserved).toBe(2);
    expect(result.data.acsAdded).toBe(79);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['1-1-user-auth']).toBeDefined();
    expect(writtenState.stories['1-1-user-auth'].status).toBe('in-progress');
    expect(writtenState.stories['2-1-data-model']).toBeDefined();
    expect(writtenState.stories['2-1-data-model'].status).toBe('done');
  });

  it('does not overwrite existing validation entries', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-1': defaultStory({ status: 'done', attempts: 3 }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = createValidationSprint();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.acsAdded).toBe(78); // 79 - 1 existing

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['val-1'].status).toBe('done');
    expect(writtenState.stories['val-1'].attempts).toBe(3);
  });

  it('returns fail when getSprintState fails', () => {
    mockGetSprintState.mockReturnValue({ success: false, error: 'disk error' });

    const result = createValidationSprint();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('disk error');
  });

  it('returns fail when writeStateAtomic fails', () => {
    mockGetSprintState.mockReturnValue({ success: true, data: emptyState() });
    mockWriteStateAtomic.mockReturnValue({ success: false, error: 'write failed' });

    const result = createValidationSprint();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('write failed');
  });
});

// ─── Task 2: executeValidationAC ─────────────────────────────────────────────

describe('executeValidationAC', () => {
  it('CLI AC with passing command returns pass', () => {
    const ac = cliAC(1);
    mockExecSync.mockReturnValue('all good');

    const result = executeValidationAC(ac);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.acId).toBe(1);
    expect(result.data.verdict).toBe('pass');
    expect(result.data.output).toBe('all good');
    expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('CLI AC with failing command returns fail with captured output', () => {
    const ac = cliAC(2);
    const execError = new Error('Command failed');
    (execError as unknown as Record<string, unknown>).stdout = 'partial output';
    (execError as unknown as Record<string, unknown>).stderr = 'error details';
    mockExecSync.mockImplementation(() => { throw execError; });

    const result = executeValidationAC(ac);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.acId).toBe(2);
    expect(result.data.verdict).toBe('fail');
    expect(result.data.output).toContain('partial output');
    expect(result.data.output).toContain('error details');
  });

  it('integration AC returns blocked with reason', () => {
    const ac = integrationAC(5);

    const result = executeValidationAC(ac);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.acId).toBe(5);
    expect(result.data.verdict).toBe('blocked');
    expect(result.data.reason).toBe('integration-required');
    expect(result.data.durationMs).toBe(0);
    expect(result.data.output).toBe('');
  });

  it('CLI AC without command returns blocked', () => {
    const ac: ValidationAC = {
      id: 99,
      frRef: 'FR99',
      description: 'No command AC',
      verificationMethod: 'cli',
      category: 'FR',
    };

    const result = executeValidationAC(ac);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.verdict).toBe('blocked');
    expect(result.data.reason).toBe('no-command');
  });

  it('passes timeout option to execSync', () => {
    const ac = cliAC(1);
    mockExecSync.mockReturnValue('ok');

    executeValidationAC(ac);

    expect(mockExecSync).toHaveBeenCalledWith(
      ac.command,
      expect.objectContaining({ timeout: 30_000 }),
    );
  });
});

// ─── Task 3: createFixStory ──────────────────────────────────────────────────

describe('createFixStory', () => {
  it('generates valid markdown with AC details', () => {
    const ac = cliAC(42);
    const error = 'Expected file not found';

    const result = createFixStory(ac, error);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe('val-fix-42');

    // Verify file was written
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);

    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toContain('# Fix: Validation AC 42');
    expect(writtenContent).toContain('FR42');
    expect(writtenContent).toContain('Expected file not found');
    expect(writtenContent).toContain(ac.description);
    expect(writtenContent).toContain('Status: ready-for-dev');
  });

  it('includes command in story when AC has one', () => {
    const ac = cliAC(10);
    const result = createFixStory(ac, 'fail');

    expect(result.success).toBe(true);
    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toContain('`echo "AC 10 ok"`');
  });

  it('omits command line when AC has no command', () => {
    const ac = integrationAC(20);
    const result = createFixStory(ac, 'missing service');

    expect(result.success).toBe(true);
    const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).not.toContain('**Command:**');
    expect(writtenContent).toContain('missing service');
  });

  it('returns fail on write error', () => {
    const ac = cliAC(1);
    mockMkdirSync.mockImplementation(() => { throw new Error('Permission denied'); });

    const result = createFixStory(ac, 'err');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Permission denied');
  });
});

// ─── Task 4: processValidationResult ─────────────────────────────────────────

describe('processValidationResult', () => {
  it('marks story done on pass', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-1': defaultStory({ status: 'backlog', attempts: 0 }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const acResult: ValidationACResult = {
      acId: 1, verdict: 'pass', output: 'ok', durationMs: 100,
    };

    const result = processValidationResult(1, acResult);
    expect(result.success).toBe(true);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['val-1'].status).toBe('done');
    expect(writtenState.stories['val-1'].attempts).toBe(1);
    expect(writtenState.stories['val-1'].lastError).toBeNull();
  });

  it('marks story failed on fail with error', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-5': defaultStory({ status: 'backlog', attempts: 0 }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const acResult: ValidationACResult = {
      acId: 5, verdict: 'fail', output: 'not found', durationMs: 50,
    };

    const result = processValidationResult(5, acResult);
    expect(result.success).toBe(true);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['val-5'].status).toBe('failed');
    expect(writtenState.stories['val-5'].lastError).toBe('not found');
  });

  it('marks blocked after 10 consecutive failures (retry-exhausted)', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-3': defaultStory({ status: 'failed', attempts: 9 }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const acResult: ValidationACResult = {
      acId: 3, verdict: 'fail', output: 'still broken', durationMs: 10,
    };

    const result = processValidationResult(3, acResult);
    expect(result.success).toBe(true);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['val-3'].status).toBe('blocked');
    expect(writtenState.stories['val-3'].lastError).toBe('retry-exhausted');
    expect(writtenState.stories['val-3'].attempts).toBe(10);
  });

  it('marks blocked when verdict is blocked', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-7': defaultStory(),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const acResult: ValidationACResult = {
      acId: 7, verdict: 'blocked', output: '', durationMs: 0, reason: 'integration-required',
    };

    const result = processValidationResult(7, acResult);
    expect(result.success).toBe(true);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['val-7'].status).toBe('blocked');
    expect(writtenState.stories['val-7'].lastError).toBe('integration-required');
  });

  it('returns fail when story not found', () => {
    mockGetSprintState.mockReturnValue({ success: true, data: emptyState() });

    const acResult: ValidationACResult = {
      acId: 999, verdict: 'pass', output: '', durationMs: 0,
    };

    const result = processValidationResult(999, acResult);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('val-999');
  });

  it('returns fail when getSprintState fails', () => {
    mockGetSprintState.mockReturnValue({ success: false, error: 'state corrupted' });

    const acResult: ValidationACResult = {
      acId: 1, verdict: 'pass', output: '', durationMs: 0,
    };

    const result = processValidationResult(1, acResult);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('state corrupted');
  });

  it('uses fallback message when fail output is empty', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-10': defaultStory({ status: 'backlog', attempts: 0 }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const acResult: ValidationACResult = {
      acId: 10, verdict: 'fail', output: '', durationMs: 50,
    };

    const result = processValidationResult(10, acResult);
    expect(result.success).toBe(true);

    const writtenState = mockWriteStateAtomic.mock.calls[0][0] as SprintState;
    expect(writtenState.stories['val-10'].lastError).toBe('validation failed');
  });
});

// ─── Task 4: getValidationProgress ───────────────────────────────────────────

describe('getValidationProgress', () => {
  it('returns correct counts for mixed statuses', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-1': defaultStory({ status: 'done' }),
      'val-2': defaultStory({ status: 'done' }),
      'val-3': defaultStory({ status: 'failed', attempts: 3 }),
      'val-4': defaultStory({ status: 'blocked' }),
      'val-5': defaultStory({ status: 'backlog' }),
      'val-6': defaultStory({ status: 'backlog' }),
      'val-7': defaultStory({ status: 'backlog' }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = getValidationProgress();
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Only counts ACs that exist in VALIDATION_ACS registry
    // val-1 through val-7 map to AC IDs 1-7 which exist in the 79-AC registry
    expect(result.data.passed).toBe(2);
    expect(result.data.failed).toBe(1);
    expect(result.data.blocked).toBe(1);
    expect(result.data.remaining).toBe(3);
    expect(result.data.total).toBe(7);
  });

  it('returns per-AC status with attempts and lastError', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-1': defaultStory({ status: 'done', attempts: 1, lastError: null }),
      'val-2': defaultStory({ status: 'failed', attempts: 5, lastError: 'exit code 1' }),
    };
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = getValidationProgress();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const ac1 = result.data.perAC.find(a => a.acId === 1);
    expect(ac1).toBeDefined();
    expect(ac1!.status).toBe('done');
    expect(ac1!.attempts).toBe(1);
    expect(ac1!.lastError).toBeNull();

    const ac2 = result.data.perAC.find(a => a.acId === 2);
    expect(ac2).toBeDefined();
    expect(ac2!.status).toBe('failed');
    expect(ac2!.attempts).toBe(5);
    expect(ac2!.lastError).toBe('exit code 1');
  });

  it('returns fail when state read fails', () => {
    mockGetSprintState.mockReturnValue({ success: false, error: 'no file' });

    const result = getValidationProgress();
    expect(result.success).toBe(false);
  });
});

// ─── Task 5: runValidationCycle ──────────────────────────────────────────────

describe('runValidationCycle', () => {
  it('routes failures to dev module via fix story', () => {
    // Find a CLI-verifiable AC from the real registry
    const targetAC = VALIDATION_ACS.find(ac => ac.verificationMethod === 'cli')!;
    const state = emptyState();
    // Set all ACs as done except our target
    for (let i = 1; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    (state as { stories: Record<string, StoryState> }).stories[`val-${targetAC.id}`] = defaultStory({ status: 'backlog' });

    // Both getSprintState calls return the same state
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    // The AC command fails
    mockExecSync.mockImplementation(() => {
      const err = new Error('fail');
      (err as unknown as Record<string, unknown>).stderr = 'error output';
      throw err;
    });

    const result = runValidationCycle();
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.action).toBe('failed-routed-to-dev');
    expect(result.data.fixStoryKey).toMatch(/^val-fix-/);
    expect(mockDevelopStory).toHaveBeenCalled();
  });

  it('returns no-actionable-ac when all are done or blocked', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-1': defaultStory({ status: 'done' }),
      'val-2': defaultStory({ status: 'blocked' }),
    };
    // Add remaining ACs as done
    for (let i = 3; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = runValidationCycle();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.action).toBe('no-actionable-ac');
  });

  it('prefers failed ACs over backlog ACs (re-validation)', () => {
    // Find two CLI-verifiable ACs
    const cliACs = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli');
    const backlogAC = cliACs[0];
    const failedAC = cliACs[1];

    const state = emptyState();
    // Fill all with done
    for (let i = 1; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    // Set backlog and failed
    (state as { stories: Record<string, StoryState> }).stories[`val-${backlogAC.id}`] = defaultStory({ status: 'backlog' });
    (state as { stories: Record<string, StoryState> }).stories[`val-${failedAC.id}`] = defaultStory({ status: 'failed', attempts: 2 });

    mockGetSprintState.mockReturnValue({ success: true, data: state });
    mockExecSync.mockReturnValue('fixed now');

    const result = runValidationCycle();
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Should pick failed AC, not backlog AC
    expect(result.data.acId).toBe(failedAC.id);
    expect(result.data.action).toBe('passed');
  });

  it('handles blocked (integration) ACs correctly', () => {
    // AC 2 is integration-required in the actual registry
    const state = emptyState();
    // Set all ACs as done except an integration-required one
    for (let i = 1; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    // Find an integration AC from the real registry
    const intAC = VALIDATION_ACS.find(ac => ac.verificationMethod === 'integration');
    if (!intAC) return; // safety
    (state as { stories: Record<string, StoryState> }).stories[`val-${intAC.id}`] = defaultStory({ status: 'backlog' });

    mockGetSprintState.mockReturnValue({ success: true, data: state });

    const result = runValidationCycle();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.acId).toBe(intAC.id);
    expect(result.data.action).toBe('blocked');
  });

  it('skips retry-exhausted ACs', () => {
    const state = emptyState();
    (state as { stories: Record<string, StoryState> }).stories = {
      'val-1': defaultStory({ status: 'failed', attempts: 10 }),
      'val-2': defaultStory({ status: 'backlog' }),
    };
    for (let i = 3; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    mockGetSprintState.mockReturnValue({ success: true, data: state });
    mockExecSync.mockReturnValue('ok');

    const result = runValidationCycle();
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Should skip val-1 (exhausted) and pick val-2
    expect(result.data.acId).toBe(2);
  });

  it('returns fail when state read fails', () => {
    mockGetSprintState.mockReturnValue({ success: false, error: 'disk error' });

    const result = runValidationCycle();
    expect(result.success).toBe(false);
  });

  it('returns fail when processValidationResult fails', () => {
    const cliACs = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli');
    const targetAC = cliACs[0];

    const state = emptyState();
    for (let i = 1; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    (state as { stories: Record<string, StoryState> }).stories[`val-${targetAC.id}`] = defaultStory({ status: 'backlog' });

    // First call to getSprintState (in runValidationCycle) succeeds
    // Second call (in processValidationResult) fails
    mockGetSprintState
      .mockReturnValueOnce({ success: true, data: state })
      .mockReturnValueOnce({ success: false, error: 'state write locked' });
    mockExecSync.mockReturnValue('ok');

    const result = runValidationCycle();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('state write locked');
  });

  it('returns fail when createFixStory fails', () => {
    const cliACs = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli');
    const targetAC = cliACs[0];

    const state = emptyState();
    for (let i = 1; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    (state as { stories: Record<string, StoryState> }).stories[`val-${targetAC.id}`] = defaultStory({ status: 'backlog' });

    mockGetSprintState.mockReturnValue({ success: true, data: state });
    // AC command fails
    mockExecSync.mockImplementation(() => {
      const err = new Error('fail');
      (err as unknown as Record<string, unknown>).stderr = 'error output';
      throw err;
    });
    // mkdirSync throws to make createFixStory fail
    mockMkdirSync.mockImplementation(() => { throw new Error('EACCES: permission denied'); });

    const result = runValidationCycle();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('permission denied');
  });

  it('reports devError when developStory fails', () => {
    const cliACs = VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli');
    const targetAC = cliACs[0];

    const state = emptyState();
    for (let i = 1; i <= 79; i++) {
      (state as { stories: Record<string, StoryState> }).stories[`val-${i}`] = defaultStory({ status: 'done' });
    }
    (state as { stories: Record<string, StoryState> }).stories[`val-${targetAC.id}`] = defaultStory({ status: 'backlog' });

    mockGetSprintState.mockReturnValue({ success: true, data: state });
    // AC command fails
    mockExecSync.mockImplementation(() => {
      const err = new Error('fail');
      (err as unknown as Record<string, unknown>).stderr = 'error output';
      throw err;
    });
    // developStory fails
    mockDevelopStory.mockReturnValue({ success: false, error: 'dev agent unavailable' });

    const result = runValidationCycle();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.action).toBe('failed-routed-to-dev');
    expect(result.data.devError).toBe('dev agent unavailable');
  });
});
