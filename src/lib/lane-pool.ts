/**
 * Lane Pool.
 *
 * Schedules epics concurrently up to `maxParallel` using a fixed-size
 * lane pool. Each lane is an async task backed by a git worktree that
 * runs a workflow engine instance via a caller-provided callback.
 * `Promise.race()` detects lane completion and schedules the next
 * independent epic.
 *
 * @see Story 17-2: Lane Pool
 */

import type { WorktreeManager } from './worktree-manager.js';
import type { EngineResult } from './workflow-types.js';

// --- Types ---

/**
 * Describes an epic to be scheduled in the lane pool.
 */
export interface EpicDescriptor {
  /** Unique epic identifier. */
  readonly id: string;
  /** Human-readable slug for branch naming. */
  readonly slug: string;
  /** Story keys belonging to this epic. */
  readonly stories: string[];
}

/**
 * Status of an individual lane.
 */
export type LaneStatus = 'executing' | 'completed' | 'failed';

/**
 * Internal representation of an active lane.
 */
export interface Lane {
  /** The epic identifier running in this lane. */
  readonly epicId: string;
  /** The lane index (0-based). */
  readonly laneIndex: number;
  /** Absolute path to the worktree directory. */
  readonly worktreePath: string;
  /** Current lane status. */
  status: LaneStatus;
  /** The promise tracking the epic execution. */
  readonly promise: Promise<EngineResult>;
}

/**
 * Event emitted during lane pool execution for TUI consumption.
 */
export interface LaneEvent {
  /** Event type. */
  readonly type: 'lane-started' | 'lane-completed' | 'lane-failed' | 'epic-queued';
  /** The epic identifier. */
  readonly epicId: string;
  /** The lane index (0-based, -1 for queued events). */
  readonly laneIndex: number;
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  /** Error message (only for `lane-failed` events). */
  readonly error?: string;
  /** Engine result (only for `lane-completed` events). */
  readonly result?: EngineResult;
}

/**
 * Per-epic result collected after execution.
 */
export interface EpicResult {
  /** The epic identifier. */
  readonly epicId: string;
  /** Final status. */
  readonly status: 'completed' | 'failed';
  /** Engine result (only for completed epics). */
  readonly engineResult?: EngineResult;
  /** Error message (only for failed epics). */
  readonly error?: string;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Aggregate result returned when all epics have been processed.
 */
export interface PoolResult {
  /** True if all epics completed successfully. */
  readonly success: boolean;
  /** Total number of epics processed (completed + failed). */
  readonly epicsProcessed: number;
  /** Per-epic results keyed by epic ID. */
  readonly epicResults: Map<string, EpicResult>;
  /** Wall-clock duration of the entire pool run in milliseconds. */
  readonly durationMs: number;
}

/**
 * Callback function that executes an epic's stories in a worktree.
 *
 * @param epicId  The epic identifier.
 * @param worktreePath  Absolute path to the worktree directory (use as `cwd`).
 * @returns The engine result for the epic.
 */
export type ExecuteEpicFn = (epicId: string, worktreePath: string) => Promise<EngineResult>;

// --- Error Class ---

/**
 * Error thrown by lane pool operations.
 */
export class LanePoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LanePoolError';
  }
}

// --- LanePool Class ---

/**
 * Lane pool that schedules epics concurrently up to `maxParallel`.
 *
 * Each lane gets its own worktree via `WorktreeManager` and runs
 * the workflow engine via a caller-provided `ExecuteEpicFn` callback.
 * `Promise.race()` detects lane completion and the next independent
 * epic is scheduled into the freed slot.
 */
export class LanePool {
  private readonly worktreeManager: WorktreeManager;
  private readonly maxParallel: number;
  private readonly listeners: Array<(event: LaneEvent) => void> = [];

  // Internal state (set during startPool)
  private activeLanes: Map<string, Lane> = new Map();
  private completedEpicIds: Set<string> = new Set();
  private failedEpicIds: Set<string> = new Set();
  private epicIndexMap: Map<string, number> = new Map();
  private laneCounter = 0;

  /**
   * @param worktreeManager  The worktree manager for creating/cleaning up worktrees.
   * @param maxParallel  Maximum number of lanes to run simultaneously.
   */
  constructor(worktreeManager: WorktreeManager, maxParallel: number) {
    if (maxParallel < 1) {
      throw new LanePoolError('maxParallel must be at least 1');
    }
    this.worktreeManager = worktreeManager;
    this.maxParallel = maxParallel;
  }

  /**
   * Register a listener for lane events.
   *
   * @param callback  Function called for each `LaneEvent`.
   */
  onEvent(callback: (event: LaneEvent) => void): void {
    this.listeners.push(callback);
  }

  /**
   * Run all epics through the lane pool.
   *
   * Creates up to `maxParallel` lanes simultaneously. Each lane
   * executes one epic via the provided callback. When a lane completes,
   * the next independent epic is scheduled.
   *
   * @param epics  The epics to execute.
   * @param executeFn  Callback that runs the workflow engine for an epic.
   * @returns Aggregate pool result with per-epic outcomes.
   */
  async startPool(epics: EpicDescriptor[], executeFn: ExecuteEpicFn): Promise<PoolResult> {
    const poolStart = Date.now();

    // Edge case: empty epics array (AC #11)
    if (epics.length === 0) {
      return {
        success: true,
        epicsProcessed: 0,
        epicResults: new Map(),
        durationMs: Date.now() - poolStart,
      };
    }

    // Reset internal state
    this.activeLanes = new Map();
    this.completedEpicIds = new Set();
    this.failedEpicIds = new Set();
    this.epicIndexMap = new Map();
    this.laneCounter = 0;

    // Build index map and pending queue
    const pendingEpics: EpicDescriptor[] = [];
    for (let i = 0; i < epics.length; i++) {
      this.epicIndexMap.set(epics[i].id, i);
      pendingEpics.push(epics[i]);
    }

    // Emit epic-queued events
    for (const epic of epics) {
      this.emit({
        type: 'epic-queued',
        epicId: epic.id,
        laneIndex: -1,
        timestamp: new Date().toISOString(),
      });
    }

    const epicResults = new Map<string, EpicResult>();
    const epicStartTimes = new Map<string, number>();

    // Main scheduling loop (AC #3, #4)
    while (pendingEpics.length > 0 || this.activeLanes.size > 0) {
      // Collect ready epics to fill lanes up to maxParallel (AC #1, #2)
      // Determine candidates BEFORE adding to activeLanes so that epics
      // in the same batch don't block each other's independence check.
      const slotsAvailable = this.maxParallel - this.activeLanes.size;
      const candidates: EpicDescriptor[] = [];

      for (let s = 0; s < slotsAvailable && pendingEpics.length > 0; s++) {
        const readyIndex = this.findNextReadyEpic(pendingEpics);
        if (readyIndex === -1) break;
        candidates.push(pendingEpics.splice(readyIndex, 1)[0]);
      }

      // Launch all candidates into lanes
      for (const epic of candidates) {
        epicStartTimes.set(epic.id, Date.now());
        const lane = this.createLane(epic, executeFn);
        if (lane) {
          this.activeLanes.set(epic.id, lane);
        } else {
          // Worktree creation failed — treat as lane failure (AC #8)
          const duration = Date.now() - epicStartTimes.get(epic.id)!;
          this.failedEpicIds.add(epic.id);
          epicResults.set(epic.id, {
            epicId: epic.id,
            status: 'failed',
            error: 'Worktree creation failed',
            durationMs: duration,
          });
        }
      }

      // If no active lanes, break (all remaining epics are blocked or done)
      if (this.activeLanes.size === 0) break;

      // Wait for any lane to complete via Promise.race (AC #4)
      const completed = await Promise.race(
        [...this.activeLanes.values()].map((l) =>
          l.promise.then(
            (result) => ({ epicId: l.epicId, result, error: undefined as string | undefined }),
            (err: unknown) => ({
              epicId: l.epicId,
              result: undefined as EngineResult | undefined,
              error: err instanceof Error ? err.message : String(err),
            }),
          ),
        ),
      );

      // Process the completed lane
      const lane = this.activeLanes.get(completed.epicId)!;
      this.activeLanes.delete(completed.epicId);
      const epicDuration = Date.now() - epicStartTimes.get(completed.epicId)!;

      if (completed.error === undefined && completed.result) {
        // Lane success (AC #4)
        this.completedEpicIds.add(completed.epicId);
        epicResults.set(completed.epicId, {
          epicId: completed.epicId,
          status: 'completed',
          engineResult: completed.result,
          durationMs: epicDuration,
        });
        this.emit({
          type: 'lane-completed',
          epicId: completed.epicId,
          laneIndex: lane.laneIndex,
          timestamp: new Date().toISOString(),
          result: completed.result,
        });
      } else {
        // Lane failure (AC #8)
        this.failedEpicIds.add(completed.epicId);
        epicResults.set(completed.epicId, {
          epicId: completed.epicId,
          status: 'failed',
          error: completed.error ?? 'Unknown error',
          durationMs: epicDuration,
        });

        // Clean up worktree on failure
        try {
          this.worktreeManager.cleanupWorktree(completed.epicId);
        } catch { // IGNORE: worktree cleanup is best-effort — failure does not affect pool scheduling per AC #8
        }

        this.emit({
          type: 'lane-failed',
          epicId: completed.epicId,
          laneIndex: lane.laneIndex,
          timestamp: new Date().toISOString(),
          error: completed.error ?? 'Unknown error',
        });
      }
    }

    // Build final result (AC #9)
    const allSuccess = this.failedEpicIds.size === 0 && this.completedEpicIds.size === epics.length;

    return {
      success: allSuccess,
      epicsProcessed: epicResults.size,
      epicResults,
      durationMs: Date.now() - poolStart,
    };
  }

  // --- Private Methods ---

  /**
   * Create a lane for an epic: create worktree, then start execution.
   *
   * @returns The lane, or `null` if worktree creation failed.
   */
  private createLane(
    epic: EpicDescriptor,
    executeFn: ExecuteEpicFn,
  ): Lane | null {
    const laneIndex = this.laneCounter++;
    let worktreePath: string;

    try {
      worktreePath = this.worktreeManager.createWorktree(epic.id, epic.slug);
    } catch (err: unknown) {
      // Worktree creation failure — emit lane-failed event (AC #8)
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: 'lane-failed',
        epicId: epic.id,
        laneIndex,
        timestamp: new Date().toISOString(),
        error: errorMsg,
      });
      return null;
    }

    // Emit lane-started event (AC #6)
    this.emit({
      type: 'lane-started',
      epicId: epic.id,
      laneIndex,
      timestamp: new Date().toISOString(),
    });

    // Start execution (AC #3) — the promise tracks completion
    const promise = executeFn(epic.id, worktreePath);

    return {
      epicId: epic.id,
      laneIndex,
      worktreePath,
      status: 'executing',
      promise,
    };
  }

  /**
   * Find the index of the next ready epic in the pending queue.
   *
   * Epic N is ready only if no epic with index < N is still active
   * (except those already done/failed). (AC #5)
   *
   * @returns Index into `pendingEpics`, or -1 if none are ready.
   */
  private findNextReadyEpic(pendingEpics: EpicDescriptor[]): number {
    for (let i = 0; i < pendingEpics.length; i++) {
      const epicIndex = this.epicIndexMap.get(pendingEpics[i].id)!;
      if (this.isEpicReady(epicIndex)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Check if an epic is ready to be scheduled.
   *
   * Epic N is ready only if no epic with a lower index is still
   * active (i.e., all preceding epics are either completed or failed).
   */
  private isEpicReady(epicIndex: number): boolean {
    for (const [, lane] of this.activeLanes) {
      const activeIndex = this.epicIndexMap.get(lane.epicId);
      if (activeIndex !== undefined && activeIndex < epicIndex) {
        return false;
      }
    }
    return true;
  }

  /**
   * Emit a lane event to all registered listeners.
   */
  private emit(event: LaneEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
