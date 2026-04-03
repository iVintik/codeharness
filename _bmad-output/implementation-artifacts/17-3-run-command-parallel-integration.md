# Story 17.3: Run Command Parallel Integration

Status: verifying

## Story

As a user,
I want `codeharness run` to use the lane pool when `execution.epic_strategy: parallel`,
so that parallel execution works end-to-end.

## Acceptance Criteria

1. **Given** a workflow with `execution: { max_parallel: 2, epic_strategy: parallel }`, **when** `codeharness run` executes, **then** the run command reads the `execution` config from the resolved workflow's `ResolvedWorkflow.execution` field. <!-- verification: test-provable -->

2. **Given** `execution.epic_strategy` is `'parallel'` and `execution.max_parallel >= 2`, **when** the run command starts, **then** it creates a `LanePool` instance with the `WorktreeManager` and `max_parallel` from the execution config. <!-- verification: test-provable -->

3. **Given** the lane pool is created, **when** the run command builds the epic list, **then** it reads all pending epics from the sprint state (epics whose status is not `'done'`) and converts them to `EpicDescriptor[]` with `id`, `slug`, and `stories` fields populated from the sprint state's story keys. <!-- verification: test-provable -->

4. **Given** the lane pool is created with pending epics, **when** `startPool(epics, executeFn)` is called, **then** each epic's `executeFn` callback invokes `executeWorkflow` with `EngineConfig.projectDir` set to the worktree path provided by the lane pool. <!-- verification: test-provable -->

5. **Given** epics are executing in parallel via the lane pool, **when** stories within each epic run, **then** they execute sequentially within their worktree (the engine's existing sequential behavior is preserved per lane). <!-- verification: test-provable -->

6. **Given** a lane's workflow engine promise rejects (epic execution crashes), **when** the error is caught by the lane pool, **then** the crash does not affect other active lanes and the run command continues until all epics are processed (NFR6 crash isolation). <!-- verification: test-provable -->

7. **Given** all epics have been processed (completed or failed) by the lane pool, **when** the pool returns `PoolResult`, **then** the run command reports final results: total epics processed, per-epic success/failure, total stories processed, total duration, and exits with code 0 if all succeeded or code 1 if any failed. <!-- verification: test-provable -->

8. **Given** `execution.epic_strategy` is `'sequential'` (the default), **when** `codeharness run` executes, **then** the run command uses the existing single-engine execution path (no lane pool, no worktree manager) — backward compatible with the current behavior. <!-- verification: test-provable -->

9. **Given** `execution.epic_strategy` is `'parallel'` but `max_parallel` is `1`, **when** the run command starts, **then** it creates a lane pool with `maxParallel: 1`, producing sequential execution through the pool (one lane at a time) identical to sequential strategy (NFR10). <!-- verification: test-provable -->

10. **Given** the lane pool emits `LaneEvent` objects during execution, **when** the run command receives them, **then** it logs lane lifecycle events (lane started, lane completed, lane failed) to the console output using `info()`. <!-- verification: runtime-provable -->

11. **Given** the run command in parallel mode, **when** it finishes execution, **then** all worktrees created during the run are cleaned up (via `WorktreeManager.cleanupWorktree` called by the lane pool on completion/failure). <!-- verification: test-provable -->

12. **Given** the resolved workflow has `execution.isolation` set to `'worktree'`, **when** `epic_strategy` is `'parallel'`, **then** the run command creates worktrees for each epic. **And given** `isolation` is `'none'` (the default), **when** `epic_strategy` is `'parallel'`, **then** the run command still uses worktree isolation (parallel requires worktrees regardless of the isolation field). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Modify `src/commands/run.ts` to detect parallel execution config (AC: #1, #8, #12)
  - [x] After resolving the workflow, read `parsedWorkflow.execution.epic_strategy` and `parsedWorkflow.execution.max_parallel`
  - [x] If `epic_strategy === 'parallel'`, branch into parallel execution path
  - [x] If `epic_strategy === 'sequential'` (or default), preserve existing single-engine path unchanged (AC #8)

- [x] Task 2: Implement epic discovery from sprint state (AC: #3)
  - [x] Read sprint state via `getSprintState()` from `src/modules/sprint/index.ts`
  - [x] Group stories by epic ID (extract epic prefix from story key, e.g., `17-1-foo` -> epic `17`)
  - [x] Filter to epics whose status is not `'done'` in `state.epics`
  - [x] Build `EpicDescriptor[]` with `id` (epic number), `slug` (sanitized epic name), `stories` (story keys belonging to that epic)

- [x] Task 3: Implement parallel execution path in run command (AC: #2, #4, #5, #9, #12)
  - [x] Import `WorktreeManager` from `src/lib/worktree-manager.ts`
  - [x] Import `LanePool` from `src/lib/lane-pool.ts`
  - [x] Create `WorktreeManager` instance (default main branch)
  - [x] Create `LanePool` with `worktreeManager` and `max_parallel`
  - [x] Define `executeFn` callback: takes `(epicId, worktreePath)`, builds `EngineConfig` with `projectDir: worktreePath`, calls `executeWorkflow(config)` and returns the result
  - [x] Call `pool.startPool(epics, executeFn)` and await the `PoolResult`
  - [x] When `max_parallel === 1`, pool still runs (NFR10 — sequential through the pool, AC #9)
  - [x] When `epic_strategy === 'parallel'`, always use worktree isolation regardless of `execution.isolation` value (AC #12)

- [x] Task 4: Implement lane event logging (AC: #10)
  - [x] Register `pool.onEvent(callback)` before starting the pool
  - [x] On `lane-started`: log `info('[LANE] Started epic {epicId} in lane {laneIndex}')`
  - [x] On `lane-completed`: log `ok('[LANE] Epic {epicId} completed in lane {laneIndex}')`
  - [x] On `lane-failed`: log `fail('[LANE] Epic {epicId} failed in lane {laneIndex}: {error}')`
  - [x] On `epic-queued`: log `info('[LANE] Epic {epicId} queued for execution')`

- [x] Task 5: Implement result reporting for parallel execution (AC: #7)
  - [x] After `PoolResult` is returned, compute aggregate statistics: total epics, succeeded, failed, total stories processed, total duration
  - [x] If `poolResult.success`: log success message with aggregate stats, exit code 0
  - [x] If `!poolResult.success`: log failure message with per-epic breakdown, exit code 1
  - [x] For each failed epic: log the epic ID and error from `EpicResult`

- [x] Task 6: Ensure worktree cleanup (AC: #11)
  - [x] Lane pool already handles cleanup on completion/failure (via `WorktreeManager.cleanupWorktree`)
  - [x] Verify this works by testing that after pool completion, no codeharness worktrees remain
  - [x] Add a safety net: after pool completes, call `worktreeManager.listWorktrees()` and warn if any remain

- [x] Task 7: Write unit tests (AC: #1-#12)
  - [x] Test: parallel mode detected when `epic_strategy === 'parallel'`
  - [x] Test: sequential mode preserves existing single-engine behavior
  - [x] Test: LanePool created with correct `maxParallel` from execution config
  - [x] Test: epic descriptors built correctly from sprint state
  - [x] Test: executeFn sets `projectDir` to worktree path
  - [x] Test: pool result maps to correct exit code (0 for success, 1 for failure)
  - [x] Test: lane events are logged to console
  - [x] Test: `max_parallel: 1` with parallel strategy works correctly
  - [x] Test: parallel strategy forces worktree isolation regardless of `execution.isolation`
  - [x] Test: crash in one lane does not abort the run command
  - [x] Test: remaining worktrees are warned about after pool completion

## Dev Notes

### Architecture Constraints

- **Architecture Decision 2** (architecture-parallel-execution.md): The engine maintains a fixed-size lane pool. Each lane is an async task that runs a workflow engine instance against a worktree directory. This story wires the lane pool into the run command.
- **Lane Isolation Pattern**: Each lane MUST set `cwd` to its worktree path for all agent dispatches. The `executeFn` callback achieves this by setting `EngineConfig.projectDir` to the worktree path.
- **Backward Compatibility** (NFR10): When `epic_strategy === 'sequential'`, the run command MUST use the existing single-engine execution path. No lane pool, no worktree manager. Zero behavior change.

### Key Files to Modify

| File | Why |
|------|-----|
| `src/commands/run.ts` | Main integration point — add parallel execution branch after workflow resolution |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/lane-pool.ts` | `LanePool` class, `EpicDescriptor`, `PoolResult`, `LaneEvent` interfaces — used directly in the run command. |
| `src/lib/worktree-manager.ts` | `WorktreeManager` class — instantiated by the run command for parallel mode. |
| `src/lib/workflow-engine.ts` | `executeWorkflow()`, `EngineConfig`, `EngineResult` — the engine is the `executeFn` callback target. |
| `src/lib/hierarchical-flow.ts` | `ExecutionConfig` interface — has `max_parallel`, `epic_strategy`, `isolation`. |
| `src/modules/sprint/index.ts` | `getSprintState()`, `readSprintStatusFromState()` — for discovering pending epics and their stories. |
| `src/types/state.ts` | `SprintState`, `EpicState`, `StoryState` — for reading epic/story data. |
| `src/lib/workflow-parser.ts` | `ResolvedWorkflow` — has `execution`, `storyFlow`, `epicFlow` fields. |

### Implementation Patterns

**Parallel execution branch in run command:**
```typescript
// After workflow resolution and agent resolution...
const { execution } = parsedWorkflow;

if (execution.epic_strategy === 'parallel') {
  // Parallel path: lane pool + worktrees
  const worktreeManager = new WorktreeManager();
  const pool = new LanePool(worktreeManager, execution.max_parallel);

  // Register event listener for console output
  pool.onEvent((event) => { /* log lane events */ });

  // Build epic descriptors from sprint state
  const epics = buildEpicDescriptors(state);

  // Define executeFn: runs engine in worktree
  const executeFn: ExecuteEpicFn = async (epicId, worktreePath) => {
    const epicConfig: EngineConfig = {
      ...config,
      projectDir: worktreePath,
    };
    return executeWorkflow(epicConfig);
  };

  const result = await pool.startPool(epics, executeFn);
  // Report results...
} else {
  // Sequential path: existing single-engine behavior (unchanged)
  const result = await executeWorkflow(config);
  // Existing reporting...
}
```

**Epic descriptor construction from sprint state:**
```typescript
function buildEpicDescriptors(state: SprintState): EpicDescriptor[] {
  const epicMap = new Map<string, string[]>();
  for (const [storyKey, story] of Object.entries(state.stories)) {
    const epicId = extractEpicId(storyKey);
    if (!epicMap.has(epicId)) epicMap.set(epicId, []);
    epicMap.get(epicId)!.push(storyKey);
  }

  return [...epicMap.entries()]
    .filter(([epicId]) => state.epics[`epic-${epicId}`]?.status !== 'done')
    .map(([epicId, stories]) => ({
      id: epicId,
      slug: `epic-${epicId}`,
      stories,
    }));
}
```

**Testing strategy:** Mock `WorktreeManager`, `LanePool`, and `executeWorkflow` with `vi.mock()`. Verify the run command creates the pool with correct config, passes correct `executeFn`, and reports results correctly. Test both parallel and sequential paths. Use fake sprint state fixtures.

### Previous Story (17-2) Intelligence

- Story 17-2 completed the lane pool module. The `LanePool` class has `startPool(epics, executeFn) -> PoolResult` and `onEvent(callback)`. All types are exported.
- Story 17-1 completed the worktree manager. `WorktreeManager` has `createWorktree(epicId, slug) -> string` and `cleanupWorktree(epicId)`.
- Both modules are standalone — this story wires them into the run command.
- Current test count: ~4850+ tests across 178+ files. All passing.
- Module patterns: TypeScript in `src/`, ESM with `.js` import extensions, vitest test framework.

### Boundary: What This Story Does NOT Include

- **Merge operations** -- deferred to Epic 18. The run command does not merge worktrees. The lane pool creates and cleans up worktrees, but merging is a separate concern.
- **Epic completion detection** -- deferred to Story 19-1. The run command does not trigger epic_flow tasks.
- **TUI components** -- deferred to Epic 20. The run command logs lane events to console, not to multi-lane TUI.
- **State reconciliation across worktrees** -- deferred to Epic 18/19. Each worktree has its own local state; merging state is not in scope.

### Edge Cases

- **No pending epics**: All epics in sprint state are done. The run command should report "no stories ready" (existing behavior) or pass an empty array to the pool (which returns immediately with success).
- **Single epic with parallel strategy**: One epic, one lane. Pool runs it and completes. No worktree isolation benefit, but the path should work correctly.
- **All epics fail**: Pool returns `success: false`. Run command exits with code 1 and reports per-epic failures.
- **Workflow with no `execution` section**: Defaults to `epic_strategy: 'sequential'`, `max_parallel: 1`. Existing behavior preserved.
- **executeFn throws synchronously**: Should not happen (`executeWorkflow` is async), but the pool handles promise rejections.
- **WorktreeManager fails to create worktree for first epic**: Pool treats it as lane failure, continues with remaining epics.
- **`--resume` flag with parallel mode**: Resume semantics apply per-epic — each worktree's workflow state determines where to resume. This may need the engine to look for worktree-local state.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/` and `src/commands/__tests__/` directories
- ESM modules -- use `.js` extensions in imports
- Build: `npm run build`
- Test: `npm test`

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 17.3]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 2 -- Lane Pool & Scheduling]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Lane Isolation Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Modified Files -- run.ts]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6, FR7, FR8, FR9, FR10]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR6, NFR10]
