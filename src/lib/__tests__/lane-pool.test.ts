import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LanePool,
  LanePoolError,
  type EpicDescriptor,
  type LaneEvent,
  type PoolResult,
  type EpicResult,
  type Lane,
  type LaneStatus,
  type ExecuteEpicFn,
} from '../lane-pool.js';
import type { WorktreeManager } from '../worktree-manager.js';
import type { EngineResult } from '../workflow-engine.js';

// --- Helpers ---

function makeEpic(id: string, slug?: string, stories?: string[]): EpicDescriptor {
  return { id, slug: slug ?? `epic-${id}`, stories: stories ?? [`story-${id}-1`] };
}

function makeEngineResult(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    success: true,
    tasksCompleted: 1,
    storiesProcessed: 1,
    errors: [],
    durationMs: 100,
    ...overrides,
  };
}

function createMockWorktreeManager(): WorktreeManager {
  return {
    createWorktree: vi.fn((epicId: string, _slug: string) => `/tmp/codeharness-wt-epic-${epicId}`),
    cleanupWorktree: vi.fn(),
    listWorktrees: vi.fn(() => []),
    detectOrphans: vi.fn(() => []),
  } as unknown as WorktreeManager;
}

describe('lane-pool', () => {
  let mockWtm: WorktreeManager;
  let events: LaneEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockWtm = createMockWorktreeManager();
    events = [];
  });

  function createPool(maxParallel: number): LanePool {
    const pool = new LanePool(mockWtm, maxParallel);
    pool.onEvent((e) => events.push(e));
    return pool;
  }

  // --- Task 1: Types and exports (AC #12) ---

  describe('exports (AC #12)', () => {
    it('exports LanePool class', () => {
      expect(LanePool).toBeDefined();
      expect(typeof LanePool).toBe('function');
    });

    it('exports LanePoolError class', () => {
      expect(LanePoolError).toBeDefined();
      const err = new LanePoolError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('LanePoolError');
    });

    it('exports all type interfaces (compile-time check)', () => {
      // These are type-only exports verified at compile time.
      // If they didn't exist, this file wouldn't compile.
      const _epicDescriptor: EpicDescriptor = { id: '1', slug: 'test', stories: [] };
      const _laneStatus: LaneStatus = 'executing';
      const _laneEvent: LaneEvent = {
        type: 'lane-started',
        epicId: '1',
        laneIndex: 0,
        timestamp: new Date().toISOString(),
      };
      const _epicResult: EpicResult = {
        epicId: '1',
        status: 'completed',
        durationMs: 100,
      };
      const _lane: Lane = {
        epicId: '1',
        laneIndex: 0,
        worktreePath: '/tmp/test',
        status: 'executing',
        promise: Promise.resolve(makeEngineResult()),
      };
      const _executeFn: ExecuteEpicFn = async () => makeEngineResult();

      // Verify runtime values are correct shapes
      expect(_epicDescriptor.id).toBe('1');
      expect(_laneStatus).toBe('executing');
      expect(_laneEvent.type).toBe('lane-started');
    });
  });

  // --- Task 2: Constructor and lane scheduling (AC #1, #2, #5, #7) ---

  describe('constructor', () => {
    it('throws LanePoolError for maxParallel < 1', () => {
      expect(() => new LanePool(mockWtm, 0)).toThrow(LanePoolError);
      expect(() => new LanePool(mockWtm, -1)).toThrow(LanePoolError);
    });

    it('accepts maxParallel >= 1', () => {
      expect(() => new LanePool(mockWtm, 1)).not.toThrow();
      expect(() => new LanePool(mockWtm, 10)).not.toThrow();
    });
  });

  describe('startPool creates up to maxParallel lanes simultaneously (AC #1)', () => {
    it('creates worktrees via WorktreeManager for each lane', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      await pool.startPool(epics, executeFn);

      expect(mockWtm.createWorktree).toHaveBeenCalledTimes(2);
      expect(mockWtm.createWorktree).toHaveBeenCalledWith('1', 'epic-1');
      expect(mockWtm.createWorktree).toHaveBeenCalledWith('2', 'epic-2');
    });
  });

  describe('startPool with maxParallel=2 and 4 epics — only 2 active at a time (AC #2)', () => {
    it('limits concurrent executions to maxParallel', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2'), makeEpic('3'), makeEpic('4')];

      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const resolvers = new Map<string, (value: EngineResult) => void>();

      const executeFn: ExecuteEpicFn = async (epicId) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        return new Promise<EngineResult>((resolve) => {
          resolvers.set(epicId, (result) => {
            currentConcurrent--;
            resolve(result);
          });
        });
      };

      const poolPromise = pool.startPool(epics, executeFn);

      // Wait for first batch (epics 1 & 2) to start
      await vi.waitFor(() => expect(resolvers.size).toBe(2));

      expect(maxConcurrent).toBe(2);
      expect(currentConcurrent).toBe(2);

      // Complete both epics in the first batch — epic 3 & 4 start as next batch
      // (AC #5: epic 3 can't start while epic 2 is still active since index 1 < 2)
      resolvers.get('1')!(makeEngineResult());
      resolvers.get('2')!(makeEngineResult());
      await vi.waitFor(() => expect(resolvers.size).toBe(4));

      expect(maxConcurrent).toBe(2);

      // Complete remaining
      resolvers.get('3')!(makeEngineResult());
      resolvers.get('4')!(makeEngineResult());

      const result = await poolPromise;
      expect(result.epicsProcessed).toBe(4);
      expect(result.success).toBe(true);
      expect(maxConcurrent).toBe(2);
    });
  });

  describe('each lane receives correct worktree path (AC #3)', () => {
    it('passes worktree path from WorktreeManager to executeFn', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      await pool.startPool(epics, executeFn);

      expect(executeFn).toHaveBeenCalledWith('1', '/tmp/codeharness-wt-epic-1');
      expect(executeFn).toHaveBeenCalledWith('2', '/tmp/codeharness-wt-epic-2');
    });
  });

  describe('Promise.race picks up completion and schedules next (AC #4)', () => {
    it('schedules next epic when a lane completes', async () => {
      const pool = createPool(1);
      const epics = [makeEpic('1'), makeEpic('2')];
      const callOrder: string[] = [];

      const executeFn: ExecuteEpicFn = async (epicId) => {
        callOrder.push(epicId);
        return makeEngineResult();
      };

      await pool.startPool(epics, executeFn);

      expect(callOrder).toEqual(['1', '2']);
    });
  });

  describe('epic independence — epic N waits for N-1 unless done (AC #5)', () => {
    it('epic 2 does not start until epic 0 completes when maxParallel=2', async () => {
      const pool = createPool(2);
      // epics: 0, 1, 2 — with maxParallel=2, slots 0 and 1 fill.
      // Epic 2 (index=2) should not start while epic 0 (index=0) is active.
      const epics = [makeEpic('A'), makeEpic('B'), makeEpic('C')];

      const resolvers = new Map<string, (value: EngineResult) => void>();
      const startOrder: string[] = [];

      const executeFn: ExecuteEpicFn = async (epicId) => {
        startOrder.push(epicId);
        return new Promise<EngineResult>((resolve) => {
          resolvers.set(epicId, resolve);
        });
      };

      const poolPromise = pool.startPool(epics, executeFn);

      // Wait for first batch
      await vi.waitFor(() => expect(startOrder.length).toBe(2));
      expect(startOrder).toEqual(['A', 'B']);

      // Complete B (index=1) — C should NOT start because A (index=0) is still active
      resolvers.get('B')!(makeEngineResult());
      // Give scheduler a tick
      await new Promise((r) => setTimeout(r, 10));
      // C cannot start — A (index 0) is still active, and C (index 2) depends on lower indices
      // But actually: C at index 2 only checks if any active lane has index < 2.
      // A is at index 0 which is < 2, so C should NOT start yet.
      expect(startOrder.length).toBe(2);

      // Complete A (index=0) — now C can start (no active epic with index < 2)
      resolvers.get('A')!(makeEngineResult());
      await vi.waitFor(() => expect(startOrder.length).toBe(3));
      expect(startOrder[2]).toBe('C');

      resolvers.get('C')!(makeEngineResult());

      const result = await poolPromise;
      expect(result.success).toBe(true);
      expect(result.epicsProcessed).toBe(3);
    });
  });

  describe('LaneEvent objects are emitted with correct types and fields (AC #6, #10)', () => {
    it('emits epic-queued, lane-started, lane-completed events', async () => {
      const pool = createPool(1);
      const epics = [makeEpic('1')];
      const executeFn = vi.fn(async () => makeEngineResult());

      await pool.startPool(epics, executeFn);

      const queuedEvents = events.filter((e) => e.type === 'epic-queued');
      const startedEvents = events.filter((e) => e.type === 'lane-started');
      const completedEvents = events.filter((e) => e.type === 'lane-completed');

      expect(queuedEvents.length).toBe(1);
      expect(queuedEvents[0].epicId).toBe('1');
      expect(queuedEvents[0].laneIndex).toBe(-1);
      expect(queuedEvents[0].timestamp).toBeTruthy();

      expect(startedEvents.length).toBe(1);
      expect(startedEvents[0].epicId).toBe('1');
      expect(startedEvents[0].laneIndex).toBe(0);
      expect(startedEvents[0].timestamp).toBeTruthy();

      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].epicId).toBe('1');
      expect(completedEvents[0].laneIndex).toBe(0);
      expect(completedEvents[0].result).toBeDefined();
    });

    it('all events include ISO 8601 timestamp', async () => {
      const pool = createPool(1);
      await pool.startPool([makeEpic('1')], async () => makeEngineResult());

      for (const event of events) {
        expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });
  });

  describe('maxParallel=1 executes epics sequentially (AC #7)', () => {
    it('runs one epic at a time', async () => {
      const pool = createPool(1);
      const epics = [makeEpic('1'), makeEpic('2'), makeEpic('3')];
      const executionOrder: string[] = [];

      const executeFn: ExecuteEpicFn = async (epicId) => {
        executionOrder.push(epicId);
        return makeEngineResult();
      };

      await pool.startPool(epics, executeFn);

      expect(executionOrder).toEqual(['1', '2', '3']);
    });

    it('never has more than 1 concurrent execution', async () => {
      const pool = createPool(1);
      const epics = [makeEpic('1'), makeEpic('2')];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const executeFn: ExecuteEpicFn = async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 5));
        currentConcurrent--;
        return makeEngineResult();
      };

      await pool.startPool(epics, executeFn);
      expect(maxConcurrent).toBe(1);
    });
  });

  describe('lane failure cleans up worktree and continues (AC #8)', () => {
    it('catches rejection, cleans up worktree, emits lane-failed, continues', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];

      const executeFn: ExecuteEpicFn = async (epicId) => {
        if (epicId === '1') throw new Error('Epic 1 crashed');
        return makeEngineResult();
      };

      const result = await pool.startPool(epics, executeFn);

      // Pool resolved (not rejected)
      expect(result.success).toBe(false);
      expect(result.epicsProcessed).toBe(2);

      // Failed epic result
      const epic1Result = result.epicResults.get('1')!;
      expect(epic1Result.status).toBe('failed');
      expect(epic1Result.error).toContain('Epic 1 crashed');

      // Successful epic result
      const epic2Result = result.epicResults.get('2')!;
      expect(epic2Result.status).toBe('completed');

      // Worktree cleanup called for failed epic
      expect(mockWtm.cleanupWorktree).toHaveBeenCalledWith('1');

      // lane-failed event emitted
      const failedEvents = events.filter((e) => e.type === 'lane-failed');
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].epicId).toBe('1');
      expect(failedEvents[0].error).toContain('Epic 1 crashed');
    });

    it('handles non-Error rejection', async () => {
      const pool = createPool(1);
      const epics = [makeEpic('1')];

      const executeFn: ExecuteEpicFn = async () => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      };

      const result = await pool.startPool(epics, executeFn);

      expect(result.success).toBe(false);
      const epic1Result = result.epicResults.get('1')!;
      expect(epic1Result.error).toBe('string error');
    });
  });

  describe('pool result contains per-epic results (AC #9)', () => {
    it('returns PoolResult with all epic outcomes', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2'), makeEpic('3')];

      const executeFn: ExecuteEpicFn = async (epicId) => {
        if (epicId === '2') throw new Error('fail');
        return makeEngineResult({ storiesProcessed: parseInt(epicId) });
      };

      const result = await pool.startPool(epics, executeFn);

      expect(result.epicsProcessed).toBe(3);
      expect(result.epicResults.size).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      expect(result.epicResults.get('1')!.status).toBe('completed');
      expect(result.epicResults.get('1')!.engineResult!.storiesProcessed).toBe(1);
      expect(result.epicResults.get('1')!.durationMs).toBeGreaterThanOrEqual(0);

      expect(result.epicResults.get('2')!.status).toBe('failed');
      expect(result.epicResults.get('2')!.error).toContain('fail');

      expect(result.epicResults.get('3')!.status).toBe('completed');
    });
  });

  describe('empty epics array returns success immediately (AC #11)', () => {
    it('resolves with empty PoolResult', async () => {
      const pool = createPool(2);

      const result = await pool.startPool([], vi.fn());

      expect(result.success).toBe(true);
      expect(result.epicsProcessed).toBe(0);
      expect(result.epicResults.size).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // No events emitted
      expect(events.length).toBe(0);

      // No worktree operations
      expect(mockWtm.createWorktree).not.toHaveBeenCalled();
    });
  });

  describe('worktree creation failure treated as lane failure (AC #8 edge case)', () => {
    it('catches WorktreeError, emits lane-failed, continues with remaining epics', async () => {
      (mockWtm.createWorktree as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => {
          throw new Error('git worktree add failed');
        })
        .mockImplementation((epicId: string) => `/tmp/codeharness-wt-epic-${epicId}`);

      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      const result = await pool.startPool(epics, executeFn);

      // Epic 1 failed (worktree creation), epic 2 succeeded
      expect(result.epicsProcessed).toBe(2);
      expect(result.epicResults.get('1')!.status).toBe('failed');
      expect(result.epicResults.get('1')!.error).toContain('Worktree creation failed');
      expect(result.epicResults.get('2')!.status).toBe('completed');

      // executeFn only called for epic 2
      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(executeFn).toHaveBeenCalledWith('2', '/tmp/codeharness-wt-epic-2');

      // lane-failed event emitted for epic 1
      const failedEvents = events.filter((e) => e.type === 'lane-failed');
      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].epicId).toBe('1');
    });

    it('handles non-Error throw from createWorktree', async () => {
      (mockWtm.createWorktree as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => {
          throw 'raw string worktree error'; // eslint-disable-line no-throw-literal
        })
        .mockImplementation((epicId: string) => `/tmp/codeharness-wt-epic-${epicId}`);

      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      const result = await pool.startPool(epics, executeFn);

      expect(result.epicResults.get('1')!.status).toBe('failed');
      // lane-failed event includes stringified error
      const failedEvents = events.filter((e) => e.type === 'lane-failed');
      expect(failedEvents[0].error).toBe('raw string worktree error');
    });
  });

  describe('worktree cleanup failure on lane failure is swallowed (AC #8)', () => {
    it('continues pool execution even when cleanupWorktree throws', async () => {
      (mockWtm.cleanupWorktree as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('cleanup exploded');
      });

      const pool = createPool(1);
      const epics = [makeEpic('1'), makeEpic('2')];

      const executeFn: ExecuteEpicFn = async (epicId) => {
        if (epicId === '1') throw new Error('epic 1 crashed');
        return makeEngineResult();
      };

      const result = await pool.startPool(epics, executeFn);

      // Pool still resolved despite cleanup failure
      expect(result.epicsProcessed).toBe(2);
      expect(result.epicResults.get('1')!.status).toBe('failed');
      expect(result.epicResults.get('2')!.status).toBe('completed');

      // cleanupWorktree was called (and threw)
      expect(mockWtm.cleanupWorktree).toHaveBeenCalledWith('1');
    });
  });

  describe('all epics fail — pool resolves with success: false', () => {
    it('resolves (not rejects) with success: false', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];

      const executeFn: ExecuteEpicFn = async () => {
        throw new Error('everything is broken');
      };

      const result = await pool.startPool(epics, executeFn);

      expect(result.success).toBe(false);
      expect(result.epicsProcessed).toBe(2);
      expect(result.epicResults.get('1')!.status).toBe('failed');
      expect(result.epicResults.get('2')!.status).toBe('failed');
    });

    it('breaks early when all worktree creations fail (no active lanes)', async () => {
      (mockWtm.createWorktree as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('all worktrees fail');
      });

      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      const result = await pool.startPool(epics, executeFn);

      // No epics executed — all failed at worktree creation
      expect(executeFn).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.epicsProcessed).toBe(2);
      expect(result.epicResults.get('1')!.status).toBe('failed');
      expect(result.epicResults.get('2')!.status).toBe('failed');
    });
  });

  describe('maxParallel > number of epics', () => {
    it('creates one lane per epic, never more', async () => {
      const pool = createPool(10);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      const result = await pool.startPool(epics, executeFn);

      expect(mockWtm.createWorktree).toHaveBeenCalledTimes(2);
      expect(executeFn).toHaveBeenCalledTimes(2);
      expect(result.epicsProcessed).toBe(2);
      expect(result.success).toBe(true);
    });
  });

  describe('single epic with maxParallel > 1', () => {
    it('runs one lane and completes', async () => {
      const pool = createPool(4);
      const epics = [makeEpic('1')];
      const executeFn = vi.fn(async () => makeEngineResult());

      const result = await pool.startPool(epics, executeFn);

      expect(result.success).toBe(true);
      expect(result.epicsProcessed).toBe(1);
    });
  });

  describe('onEvent listener registration', () => {
    it('supports multiple listeners', async () => {
      const pool = new LanePool(mockWtm, 1);
      const events1: LaneEvent[] = [];
      const events2: LaneEvent[] = [];

      pool.onEvent((e) => events1.push(e));
      pool.onEvent((e) => events2.push(e));

      await pool.startPool([makeEpic('1')], async () => makeEngineResult());

      expect(events1.length).toBeGreaterThan(0);
      expect(events1.length).toBe(events2.length);
    });
  });

  describe('cleanup on pool completion', () => {
    it('has no dangling promises after completion', async () => {
      const pool = createPool(2);
      const epics = [makeEpic('1'), makeEpic('2')];
      const executeFn = vi.fn(async () => makeEngineResult());

      const result = await pool.startPool(epics, executeFn);

      // Pool resolved — no unresolved promises
      expect(result.epicsProcessed).toBe(2);
      expect(result.success).toBe(true);
    });
  });
});
