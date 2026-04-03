import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { AgentDriver, DispatchOpts, DriverCapabilities, DriverHealth } from '../agents/types.js';
import type { StreamEvent } from '../agents/stream-parser.js';

// Create controllable mocks — must use vi.hoisted so they're available in vi.mock factories
const { mockReadFileSync, mockExecSync, mockExecAsync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockExecSync: vi.fn(),
  mockExecAsync: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
  exec: vi.fn(),
}));

// Mock node:util to return our controllable mockExecAsync
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

import {
  resolveConflicts,
  buildConflictPrompt,
  type MergeConflictContext,
  type ConflictResolutionResult,
} from '../merge-agent.js';

// --- Test Helpers ---

function createMockDriver(overrides?: {
  dispatchFn?: (opts: DispatchOpts) => AsyncIterable<StreamEvent>;
}): AgentDriver {
  const defaultDispatch = async function* (_opts: DispatchOpts): AsyncIterable<StreamEvent> {
    // Yield nothing — simulates silent resolution
  };

  return {
    name: 'mock-driver',
    defaultModel: 'mock-model',
    capabilities: {
      supportsPlugins: false,
      supportsStreaming: true,
      costReporting: false,
      costTier: 1,
    },
    healthCheck: vi.fn().mockResolvedValue({
      available: true,
      authenticated: true,
      version: '1.0.0',
    }),
    dispatch: overrides?.dispatchFn ?? defaultDispatch,
    getLastCost: vi.fn().mockReturnValue(null),
  };
}

function createContext(overrides?: Partial<MergeConflictContext>): MergeConflictContext {
  return {
    epicId: '18',
    branch: 'codeharness/epic-18-feature',
    conflicts: ['src/index.ts', 'src/utils.ts'],
    mainDescription: 'Main branch has the base implementation',
    branchDescription: 'Feature branch adds conflict resolution',
    cwd: '/repo',
    testCommand: 'npm test',
    driver: createMockDriver(),
    ...overrides,
  };
}

describe('merge-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MergeConflictContext interface shape (AC #9)', () => {
    it('has all required fields', () => {
      const ctx = createContext();
      expect(ctx).toHaveProperty('epicId');
      expect(ctx).toHaveProperty('branch');
      expect(ctx).toHaveProperty('conflicts');
      expect(ctx).toHaveProperty('mainDescription');
      expect(ctx).toHaveProperty('branchDescription');
      expect(ctx).toHaveProperty('cwd');
      expect(ctx).toHaveProperty('testCommand');
      expect(ctx).toHaveProperty('driver');
    });
  });

  describe('ConflictResolutionResult interface shape (AC #7)', () => {
    it('success result has correct shape', () => {
      const result: ConflictResolutionResult = {
        resolved: true,
        attempts: 1,
        escalated: false,
        testResults: { passed: 10, failed: 0, coverage: 95 },
        resolvedFiles: ['src/index.ts'],
      };
      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.escalated).toBe(false);
      expect(result.testResults).toEqual({ passed: 10, failed: 0, coverage: 95 });
      expect(result.resolvedFiles).toEqual(['src/index.ts']);
    });

    it('escalated result has correct shape', () => {
      const result: ConflictResolutionResult = {
        resolved: false,
        attempts: 3,
        escalated: true,
        escalationMessage: 'Could not resolve after 3 attempts',
      };
      expect(result.resolved).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.escalationMessage).toBeDefined();
      expect(result.testResults).toBeUndefined();
      expect(result.resolvedFiles).toBeUndefined();
    });
  });

  describe('buildConflictPrompt (AC #2, #8)', () => {
    it('includes conflict markers from files', () => {
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('index.ts')) return '<<<<<<< main\nold code\n=======\nnew code\n>>>>>>> branch';
        if (path.includes('utils.ts')) return '<<<<<<< main\nutil old\n=======\nutil new\n>>>>>>> branch';
        return '';
      });

      const ctx = createContext();
      const prompt = buildConflictPrompt(ctx);

      expect(prompt).toContain('src/index.ts');
      expect(prompt).toContain('src/utils.ts');
      expect(prompt).toContain('<<<<<<< main');
      expect(prompt).toContain('>>>>>>> branch');
    });

    it('includes main and branch descriptions (AC #8)', () => {
      mockReadFileSync.mockReturnValue('conflict content');

      const ctx = createContext({
        mainDescription: 'Main has base implementation',
        branchDescription: 'Branch adds conflict resolver',
      });
      const prompt = buildConflictPrompt(ctx);

      expect(prompt).toContain('**Main branch context:** Main has base implementation');
      expect(prompt).toContain('**Feature branch context:** Branch adds conflict resolver');
    });

    it('includes instructions to resolve and commit (AC #8)', () => {
      mockReadFileSync.mockReturnValue('conflict content');

      const ctx = createContext();
      const prompt = buildConflictPrompt(ctx);

      expect(prompt).toContain('Resolve ALL conflicts preserving changes from both branches');
      expect(prompt).toContain('Both are correct additions');
      expect(prompt).toContain('git add');
      expect(prompt).toContain('commit the merge resolution');
    });

    it('handles unreadable files gracefully', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const ctx = createContext();
      const prompt = buildConflictPrompt(ctx);

      expect(prompt).toContain('deleted on one side or unreadable');
    });

    it('includes test failure output on retry (AC #5)', () => {
      mockReadFileSync.mockReturnValue('conflict content');

      const ctx = createContext();
      const prompt = buildConflictPrompt(ctx, 'FAIL src/index.test.ts\n  TypeError: undefined is not a function');

      expect(prompt).toContain('**Previous attempt failed tests:**');
      expect(prompt).toContain('TypeError: undefined is not a function');
      expect(prompt).toContain('Fix the resolution to make all tests pass');
    });

    it('includes file count in prompt', () => {
      mockReadFileSync.mockReturnValue('content');

      const ctx = createContext({ conflicts: ['a.ts', 'b.ts', 'c.ts'] });
      const prompt = buildConflictPrompt(ctx);

      expect(prompt).toContain('Merge conflict in 3 file(s)');
    });
  });

  describe('resolveConflicts — exports (AC #1)', () => {
    it('exports resolveConflicts function', () => {
      expect(typeof resolveConflicts).toBe('function');
    });
  });

  describe('resolveConflicts — empty conflicts guard', () => {
    it('returns resolved immediately for empty conflict list', async () => {
      const ctx = createContext({ conflicts: [] });
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(0);
      expect(result.escalated).toBe(false);
    });
  });

  describe('resolveConflicts — successful resolution (AC #3, #4)', () => {
    it('returns resolved on first attempt when tests pass', async () => {
      mockReadFileSync.mockReturnValue('conflict content');
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\n0 failed' });

      const dispatchCalls: DispatchOpts[] = [];
      const driver = createMockDriver({
        dispatchFn: async function* (opts: DispatchOpts) {
          dispatchCalls.push(opts);
        },
      });

      const ctx = createContext({ driver });
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.escalated).toBe(false);
      expect(result.testResults).toEqual({ passed: 10, failed: 0 });
      expect(result.resolvedFiles).toEqual(['src/index.ts', 'src/utils.ts']);
      expect(dispatchCalls).toHaveLength(1);
    });

    it('dispatches driver with correct prompt containing conflict markers (AC #2, #8)', async () => {
      mockReadFileSync.mockReturnValue('<<<<<<< main\nold\n=======\nnew\n>>>>>>> branch');
      mockExecAsync.mockResolvedValue({ stdout: '5 passed' });

      const dispatchCalls: DispatchOpts[] = [];
      const driver = createMockDriver({
        dispatchFn: async function* (opts: DispatchOpts) {
          dispatchCalls.push(opts);
        },
      });

      const ctx = createContext({ driver });
      await resolveConflicts(ctx);

      expect(dispatchCalls).toHaveLength(1);
      expect(dispatchCalls[0].prompt).toContain('<<<<<<< main');
      expect(dispatchCalls[0].prompt).toContain('>>>>>>> branch');
      expect(dispatchCalls[0].prompt).toContain('Main branch context:');
      expect(dispatchCalls[0].prompt).toContain('Feature branch context:');
      expect(dispatchCalls[0].cwd).toBe('/repo');
      expect(dispatchCalls[0].sourceAccess).toBe(true);
    });

    it('includes coverage in test results when available', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecAsync.mockResolvedValue({ stdout: '10 passed\nAll files | 95.5' });

      const ctx = createContext();
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.testResults?.coverage).toBe(95.5);
    });
  });

  describe('resolveConflicts — retry on test failure (AC #5)', () => {
    it('retries up to 3 times with test failure context', async () => {
      mockReadFileSync.mockReturnValue('conflict content');

      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return { stdout: '5 passed\n2 failed' };
        }
        return { stdout: '7 passed\n0 failed' };
      });

      const dispatchCalls: DispatchOpts[] = [];
      const driver = createMockDriver({
        dispatchFn: async function* (opts: DispatchOpts) {
          dispatchCalls.push(opts);
        },
      });

      const ctx = createContext({ driver });
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(3);
      expect(dispatchCalls).toHaveLength(3);

      // Verify git reset was called between attempts
      const resetCalls = mockExecSync.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('reset --hard HEAD~1'),
      );
      expect(resetCalls).toHaveLength(2);
    });

    it('retry prompt includes previous test failure output', async () => {
      mockReadFileSync.mockReturnValue('conflict');

      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { stdout: '3 passed\n1 failed\nFAIL: TypeError at line 42' };
        }
        return { stdout: '4 passed\n0 failed' };
      });

      const dispatchCalls: DispatchOpts[] = [];
      const driver = createMockDriver({
        dispatchFn: async function* (opts: DispatchOpts) {
          dispatchCalls.push(opts);
        },
      });

      const ctx = createContext({ driver });
      await resolveConflicts(ctx);

      expect(dispatchCalls).toHaveLength(2);
      // Second dispatch should include the failure output
      expect(dispatchCalls[1].prompt).toContain('Previous attempt failed tests');
      expect(dispatchCalls[1].prompt).toContain('TypeError at line 42');
    });
  });

  describe('resolveConflicts — escalation after 3 failures (AC #6)', () => {
    it('returns escalated after 3 consecutive failures', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecAsync.mockResolvedValue({ stdout: '3 passed\n2 failed' });

      const ctx = createContext();
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.escalated).toBe(true);
      expect(result.escalationMessage).toBeDefined();
    });

    it('escalation message contains worktree path, branch, files, and git diff command', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecAsync.mockResolvedValue({ stdout: '0 passed\n1 failed' });

      const ctx = createContext({
        epicId: '42',
        branch: 'codeharness/epic-42-feature',
        conflicts: ['src/a.ts', 'src/b.ts'],
        cwd: '/repo',
      });
      const result = await resolveConflicts(ctx);

      expect(result.escalationMessage).toContain('/repo');
      expect(result.escalationMessage).toContain('codeharness/epic-42-feature');
      expect(result.escalationMessage).toContain('src/a.ts');
      expect(result.escalationMessage).toContain('src/b.ts');
      expect(result.escalationMessage).toContain('git diff');
    });
  });

  describe('resolveConflicts — unparseable test output', () => {
    it('treats zero-passed zero-failed as failure and retries', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecSync.mockReturnValue('');

      // First call: unparseable output (0 passed, 0 failed from parsing)
      // Second call: valid output
      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { stdout: 'Build completed successfully.' };
        }
        return { stdout: '5 passed\n0 failed' };
      });

      const ctx = createContext();
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe('resolveConflicts — driver dispatch failure', () => {
    it('treats dispatch error as failed attempt and retries', async () => {
      mockReadFileSync.mockReturnValue('conflict');

      let dispatchCallCount = 0;
      const driver = createMockDriver({
        dispatchFn: async function* (_opts: DispatchOpts) {
          dispatchCallCount++;
          if (dispatchCallCount === 1) {
            throw new Error('Network error');
          }
          // Second attempt succeeds
        },
      });

      mockExecAsync.mockResolvedValue({ stdout: '5 passed\n0 failed' });

      const ctx = createContext({ driver });
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('escalates after 3 consecutive dispatch failures', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecSync.mockReturnValue(''); // git reset succeeds

      const driver = createMockDriver({
        dispatchFn: async function* () {
          throw new Error('Network error');
        },
      });

      const ctx = createContext({ driver });
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.escalated).toBe(true);
      expect(result.escalationMessage).toBeDefined();
    });

    it('escalates immediately if git reset fails after dispatch error', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecSync.mockImplementation(() => {
        throw new Error('git state corrupted');
      });

      const driver = createMockDriver({
        dispatchFn: async function* () {
          throw new Error('Network error');
        },
      });

      const ctx = createContext({ driver });
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.attempts).toBe(1);
    });
  });

  describe('resolveConflicts — test command failure edge cases', () => {
    it('handles test command that throws with partial stdout', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      // Allow git reset to succeed
      mockExecSync.mockReturnValue('');

      // First call: test command throws with partial output containing pass/fail
      // Second call: tests pass
      let callCount = 0;
      mockExecAsync.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Command failed') as Error & { stdout: string };
          err.stdout = '3 passed\n2 failed\nError: some test error';
          throw err;
        }
        return { stdout: '5 passed\n0 failed' };
      });

      const ctx = createContext();
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('handles test command that throws with no output', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      // Allow git reset to succeed
      mockExecSync.mockReturnValue('');

      mockExecAsync.mockImplementation(async () => {
        const err = new Error('Command failed') as Error & { stdout: string };
        err.stdout = '';
        throw err;
      });

      const ctx = createContext();
      const result = await resolveConflicts(ctx);

      // Should exhaust retries and escalate
      expect(result.resolved).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.escalated).toBe(true);
    });
  });

  describe('resolveConflicts — git reset failure during retry', () => {
    it('escalates immediately if git reset fails after test failure', async () => {
      mockReadFileSync.mockReturnValue('conflict');
      mockExecAsync.mockResolvedValue({ stdout: '2 passed\n1 failed' });
      mockExecSync.mockImplementation(() => {
        throw new Error('git state corrupted');
      });

      const ctx = createContext();
      const result = await resolveConflicts(ctx);

      expect(result.resolved).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.escalationMessage).toContain('/repo');
    });
  });
});
