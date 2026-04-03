# Story 17.2: Lane Pool

Status: done

## Story

As a developer,
I want a lane pool that schedules epics concurrently up to `max_parallel`,
so that the engine runs multiple epics simultaneously.

## Acceptance Criteria

1. **Given** `src/lib/lane-pool.ts` exists, **when** `startPool(epics, maxParallel)` is called, **then** it creates up to `maxParallel` lanes simultaneously, each backed by a worktree created via `WorktreeManager.createWorktree()`. <!-- verification: test-provable -->

2. **Given** `startPool(epics, maxParallel)` is called with `maxParallel: 2` and 4 epics, **when** two lanes are active, **then** only 2 worktrees exist concurrently and the remaining epics wait in the pending queue. <!-- verification: test-provable -->

3. **Given** each lane is created, **when** the lane starts executing, **then** it runs the workflow engine (via a provided `executeEpic` callback) for that epic's stories using the worktree path as `cwd`. <!-- verification: test-provable -->

4. **Given** multiple lanes are active, **when** any lane completes (its `Promise` resolves), **then** `Promise.race` detects the completion and the next independent epic is scheduled into the freed lane. <!-- verification: test-provable -->

5. **Given** the pending epic queue, **when** selecting the next epic to schedule, **then** epic independence is determined by epic ordering — epic N is ready only if no epic with index < N is still active (except those already done). <!-- verification: test-provable -->

6. **Given** lane lifecycle events occur (lane started, lane completed, lane failed), **when** the pool is running, **then** the pool emits `LaneEvent` objects consumable by the caller (for TUI consumption). <!-- verification: test-provable -->

7. **Given** `maxParallel: 1` in the execution config, **when** `startPool` runs, **then** epics execute sequentially one at a time — identical behavior to the current single-epic execution model (NFR10 backward compat). <!-- verification: test-provable -->

8. **Given** a lane's workflow engine promise rejects (epic execution crashes), **when** the error is caught, **then** the pool marks that lane as failed, cleans up its worktree via `WorktreeManager.cleanupWorktree()`, emits a `lane-failed` event, and continues scheduling remaining epics (NFR6 crash isolation). <!-- verification: test-provable -->

9. **Given** `startPool` is called, **when** all epics have been processed (completed or failed), **then** the pool resolves with a `PoolResult` containing per-epic results (success/failure, duration, errors). <!-- verification: test-provable -->

10. **Given** `LaneEvent` objects, **when** emitted by the pool, **then** each event includes `type` (`lane-started` | `lane-completed` | `lane-failed` | `epic-queued`), `epicId`, `laneIndex`, and a timestamp. <!-- verification: test-provable -->

11. **Given** `startPool` is called with an empty epics array, **when** the pool runs, **then** it resolves immediately with a `PoolResult` containing zero epics processed and `success: true`. <!-- verification: test-provable -->

12. **Given** all exports from `lane-pool.ts`, **when** inspected, **then** `LanePool`, `LaneEvent`, `PoolResult`, `LaneStatus`, and `EpicDescriptor` types are exported and documented with JSDoc. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/lane-pool.ts` with types and interfaces (AC: #1, #6, #10, #12)
  - [x] Define `EpicDescriptor` interface: `id: string`, `slug: string`, `stories: string[]`
  - [x] Define `LaneStatus` type: `'executing' | 'completed' | 'failed'`
  - [x] Define `Lane` interface: `epicId: string`, `laneIndex: number`, `worktreePath: string`, `status: LaneStatus`, `promise: Promise<EngineResult>`
  - [x] Define `LaneEvent` interface: `type: 'lane-started' | 'lane-completed' | 'lane-failed' | 'epic-queued'`, `epicId: string`, `laneIndex: number`, `timestamp: string`, `error?: string`, `result?: EngineResult`
  - [x] Define `PoolResult` interface: `success: boolean`, `epicsProcessed: number`, `epicResults: Map<string, EpicResult>`, `durationMs: number`
  - [x] Define `EpicResult` interface: `epicId: string`, `status: 'completed' | 'failed'`, `engineResult?: EngineResult`, `error?: string`, `durationMs: number`
  - [x] Define `ExecuteEpicFn` callback type: `(epicId: string, worktreePath: string) => Promise<EngineResult>`
  - [x] JSDoc all exports

- [x] Task 2: Implement `LanePool` class constructor and lane scheduling (AC: #1, #2, #5, #7)
  - [x] Constructor accepts `worktreeManager: WorktreeManager`, `maxParallel: number`
  - [x] `startPool(epics: EpicDescriptor[], executeFn: ExecuteEpicFn)` method
  - [x] Internal state: `activeLanes: Map<string, Lane>`, `pendingEpics: EpicDescriptor[]`, `completedEpicIds: Set<string>`
  - [x] Fill lanes up to `maxParallel` from the head of the pending queue
  - [x] Dependency check: `isEpicReady(epicIndex)` — true only if no epic with lower index is active (not in `completedEpicIds` and not failed)

- [x] Task 3: Implement the `Promise.race` scheduling loop (AC: #3, #4, #8, #9)
  - [x] Create a `createLane(epic)` method: calls `worktreeManager.createWorktree(epic.id, epic.slug)`, then calls `executeFn(epic.id, worktreePath)`
  - [x] Main loop: `while (pendingEpics.length > 0 || activeLanes.size > 0)` → fill lanes → `Promise.race` on active → process completion
  - [x] On lane success: add to `completedEpicIds`, record `EpicResult`, emit `lane-completed` event
  - [x] On lane failure: add to failed set, call `worktreeManager.cleanupWorktree(epicId)`, record `EpicResult` with error, emit `lane-failed` event
  - [x] After loop: return `PoolResult`

- [x] Task 4: Implement event emission (AC: #6, #10)
  - [x] Internal `EventEmitter` or callback array for `LaneEvent` delivery
  - [x] `onEvent(callback: (event: LaneEvent) => void)` method for registering listeners
  - [x] Emit `lane-started` when a lane is created
  - [x] Emit `lane-completed` when a lane's promise resolves
  - [x] Emit `lane-failed` when a lane's promise rejects
  - [x] Emit `epic-queued` when an epic enters the pending queue
  - [x] All events include ISO 8601 timestamp

- [x] Task 5: Handle edge cases (AC: #8, #11)
  - [x] Empty epics array: return immediately with empty `PoolResult`
  - [x] Worktree creation failure: treat as lane failure (don't crash the pool)
  - [x] All epics fail: pool still resolves (not rejects) with `success: false`
  - [x] Cleanup on pool completion: ensure no dangling promises

- [x] Task 6: Write unit tests (AC: #1-#12)
  - [x] Test: startPool creates up to maxParallel lanes simultaneously
  - [x] Test: startPool with maxParallel=2 and 4 epics — only 2 active at a time
  - [x] Test: each lane receives correct worktree path from WorktreeManager
  - [x] Test: Promise.race picks up completion and schedules next epic
  - [x] Test: epic independence — epic N waits for epic N-1 unless N-1 is done
  - [x] Test: LaneEvent objects are emitted with correct types and fields
  - [x] Test: maxParallel=1 executes epics sequentially
  - [x] Test: lane failure cleans up worktree and continues
  - [x] Test: pool result contains per-epic results
  - [x] Test: empty epics array returns success immediately
  - [x] Test: all types are exported from lane-pool.ts
  - [x] Test: worktree creation failure treated as lane failure (pool continues)

## Dev Notes

### Architecture Constraints

- **Architecture Decision 2** (architecture-parallel-execution.md): The engine maintains a fixed-size lane pool. Each lane is an async task (not a separate process) that runs a workflow engine instance against a worktree directory. `Promise.race()` on active lanes detects completion. When any lane completes, its result is processed and next epic scheduled.
- **Lane Pool Boundary** (architecture-parallel-execution.md): Manages lane lifecycle and scheduling. Does NOT execute stories directly. Delegates to workflow engine instances per lane. Interface: `startPool(epics, maxParallel) → PoolResult`.
- **Lane Isolation Pattern**: Each lane MUST set `cwd` to its worktree path for all agent dispatches. Lanes share no state during execution; results are collected at pool completion.

### Key Files to Create

| File | Purpose |
|------|---------|
| `src/lib/lane-pool.ts` | Lane pool scheduling module |
| `src/lib/__tests__/lane-pool.test.ts` | Unit tests |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/worktree-manager.ts` | `WorktreeManager` class — used by the pool to create/cleanup worktrees. Understand the `createWorktree(epicId, slug)` and `cleanupWorktree(epicId)` APIs. |
| `src/lib/hierarchical-flow.ts` | `ExecutionConfig` interface — has `max_parallel` and `epic_strategy`. Lane pool reads `max_parallel` from this config. |
| `src/lib/workflow-engine.ts` | `EngineResult` interface — returned by the execute callback. Has `success`, `tasksCompleted`, `storiesProcessed`, `errors`, `durationMs`. |
| `src/lib/null-task-registry.ts` | Pattern reference for registry modules with interfaces + error class. Follow the same module structure. |
| `src/lib/telemetry-writer.ts` | Pattern reference for module structure, JSDoc conventions, error handling. |

### Implementation Patterns

**Promise.race scheduling loop:**
```typescript
while (pendingEpics.length > 0 || activeLanes.size > 0) {
  // Fill lanes up to max
  while (activeLanes.size < maxLanes && hasReadyEpic()) {
    const epic = nextReadyEpic();
    const lane = await createLane(epic);
    activeLanes.set(epic.id, lane);
  }
  // Wait for any lane to complete
  if (activeLanes.size === 0) break;
  const completed = await Promise.race(
    [...activeLanes.values()].map(l =>
      l.promise.then(
        result => ({ epicId: l.epicId, result, error: undefined }),
        error => ({ epicId: l.epicId, result: undefined, error }),
      )
    )
  );
  // Process completion: record result, free lane, schedule next
  await processLaneCompletion(completed);
}
```

**Lane event emission:**
```typescript
private emit(event: LaneEvent): void {
  for (const listener of this.listeners) {
    listener(event);
  }
}
```

**Epic independence check:**
```typescript
private isEpicReady(epicIndex: number): boolean {
  // Epic N is ready only if no epic with index < N is still active
  for (const [, lane] of this.activeLanes) {
    const activeIndex = this.epicIndexMap.get(lane.epicId);
    if (activeIndex !== undefined && activeIndex < epicIndex) {
      return false;
    }
  }
  return true;
}
```

**Testing strategy:** Mock `WorktreeManager` with `vi.fn()` stubs. Provide a fake `executeFn` callback that resolves/rejects to simulate engine execution. Use `vi.useFakeTimers()` if timestamp assertions are needed. Verify event emission order with a captured event array.

### Previous Story (17-1) Intelligence

- Story 17-1 completed the worktree manager module. All 4813 tests pass across 178 files. The worktree manager provides `createWorktree(epicId, slug) → string` (returns worktree path) and `cleanupWorktree(epicId) → void`.
- Module patterns: TypeScript in `src/lib/`, tests in `src/lib/__tests__/`, ESM with `.js` import extensions, vitest test framework.
- Constructor pattern: `WorktreeManager` accepts `mainBranch` and optional `cwd`. Lane pool should accept `WorktreeManager` instance (dependency injection).
- Error pattern: `WorktreeError` extends `Error` with `stderr` field. Lane pool should define `LanePoolError` if needed.

### Boundary: What This Story Does NOT Include

- **Run command integration** — deferred to Story 17-3. The lane pool is a standalone module.
- **Merge operations** — deferred to Epic 18. The pool creates/cleans up worktrees but does not merge.
- **TUI components** — deferred to Epic 20. The pool emits `LaneEvent` objects but does not render them.
- **Epic completion detection** — deferred to Story 19-1. The pool just schedules and tracks lane completion.
- **State file management** — the pool does not read or write sprint-state.json. The `executeFn` callback handles that internally.

### Edge Cases

- **Empty epics array**: Return immediately with empty `PoolResult` (AC #11).
- **All epics fail**: Pool resolves (not rejects) with `success: false`. Each failed epic has its worktree cleaned up.
- **Worktree creation failure**: `WorktreeManager.createWorktree()` throws `WorktreeError`. The pool should catch this, treat it as a lane failure, and continue with remaining epics.
- **executeFn rejects with non-Error**: Wrap in a descriptive error string for the `EpicResult`.
- **maxParallel > number of epics**: Pool creates one lane per epic (never more lanes than epics).
- **Single epic with maxParallel > 1**: One lane, completes, pool finishes.
- **Concurrent Promise.race identity**: When wrapping promises in `.then()` for `Promise.race`, each wrapper must include the `epicId` so the pool knows which lane completed.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/` directories
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`
- Test: `npm test`

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 17.2]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 2 — Lane Pool & Scheduling]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Lane Pool Boundary]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Lane Isolation Pattern]
- [Source: _bmad-output/planning-artifacts/prd.md#FR9, FR10]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR6, NFR10]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/17-2-lane-pool-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/17-2-lane-pool.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
