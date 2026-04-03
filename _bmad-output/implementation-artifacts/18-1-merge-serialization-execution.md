# Story 18.1: Merge Serialization & Execution

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want epic branches to merge into main one at a time with full test validation,
so that merged code is always tested and conflicts don't race.

## Acceptance Criteria

1. **Given** `worktree-manager.ts` already exists with `createWorktree` and `cleanupWorktree`, **when** the `mergeWorktree(epicId)` method is added, **then** it performs `git merge codeharness/epic-{N}-{slug}` on the main branch and returns a `MergeResult` indicating success or conflict. <!-- verification: test-provable -->

2. **Given** two epics complete concurrently and both call `mergeWorktree`, **when** merge is triggered, **then** a mutex ensures only one merge executes at a time — the second caller blocks until the first finishes. <!-- verification: test-provable -->

3. **Given** `mergeWorktree(epicId)` runs and `git merge` succeeds (no conflicts), **when** the merge completes, **then** the full test suite is executed on the merged main via `npm test` (or the project's configured test command). <!-- verification: test-provable -->

4. **Given** `git merge` succeeds and the test suite passes, **when** post-merge validation finishes, **then** the worktree is cleaned up via `cleanupWorktree(epicId)` and the `MergeResult` has `success: true` with test results (pass count, fail count, coverage). <!-- verification: test-provable -->

5. **Given** `git merge` succeeds but the test suite fails, **when** post-merge validation finishes, **then** the merge is reverted (`git reset --hard HEAD~1`), the `MergeResult` has `success: false`, `reason: 'tests-failed'`, and the worktree is preserved for investigation. <!-- verification: test-provable -->

6. **Given** `git merge` produces conflicts (exit code 1 with conflict markers), **when** merge conflict is detected, **then** `mergeWorktree` returns `MergeResult` with `success: false`, `reason: 'conflict'`, and `conflicts: string[]` listing the conflicting file paths. <!-- verification: test-provable -->

7. **Given** a non-conflicting merge, **when** measured end-to-end (merge + test suite), **then** the merge operation itself (excluding test suite) completes within 30 seconds (NFR4). <!-- verification: runtime-provable -->

8. **Given** the workflow has `execution.merge_strategy: 'rebase'`, **when** `mergeWorktree` is called, **then** it uses `git rebase` instead of `git merge`. **And given** `execution.merge_strategy: 'merge-commit'` (the default), **when** `mergeWorktree` is called, **then** it uses `git merge --no-ff`. <!-- verification: test-provable -->

9. **Given** the `MergeResult` interface, **when** inspected, **then** it includes fields: `success: boolean`, `reason?: 'conflict' | 'tests-failed' | 'git-error'`, `conflicts?: string[]`, `testResults?: { passed: number; failed: number; coverage?: number }`, and `durationMs: number`. <!-- verification: test-provable -->

10. **Given** an unexpected git error during merge (not a conflict — e.g., branch not found, detached HEAD), **when** `mergeWorktree` catches the error, **then** `MergeResult` has `success: false`, `reason: 'git-error'`, and the main branch state is unchanged (rolled back if partially modified). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define `MergeResult` interface and `MergeStrategy` type (AC: #9)
  - [x] Add `MergeResult` interface to `src/lib/worktree-manager.ts` with all fields from AC #9
  - [x] Add `MergeStrategy` type alias: `'rebase' | 'merge-commit'`
  - [x] Export both from `worktree-manager.ts`

- [x] Task 2: Implement merge mutex (AC: #2)
  - [x] Create a simple async mutex class (or use a lightweight pattern — no external dependency)
  - [x] The mutex must be a module-level singleton shared across all `WorktreeManager` instances
  - [x] Pattern: `acquire()` returns a `release()` function; callers `await acquire()` and call `release()` in `finally`

- [x] Task 3: Implement `mergeWorktree(epicId, strategy?)` method (AC: #1, #6, #8, #10)
  - [x] Find the branch for the given epicId using `findBranchForEpic(epicId)`
  - [x] Acquire merge mutex
  - [x] If `strategy === 'rebase'`: run `git rebase {branch}` on main
  - [x] If `strategy === 'merge-commit'` (default): run `git merge --no-ff {branch}`
  - [x] Parse git output to detect conflicts (exit code + `--name-only` on `git diff --diff-filter=U`)
  - [x] On unexpected git errors: ensure main branch is restored (`git merge --abort` or `git rebase --abort`)
  - [x] Return `MergeResult`

- [x] Task 4: Implement post-merge test suite execution (AC: #3, #4, #5)
  - [x] After successful merge (no conflict), run `npm test` (or configurable test command) via `child_process.exec` with timeout
  - [x] Parse test results from stdout (pass/fail count, coverage if available)
  - [x] If tests pass: call `cleanupWorktree(epicId)`, return `MergeResult` with `success: true`
  - [x] If tests fail: run `git reset --hard HEAD~1` to revert merge, return `MergeResult` with `success: false, reason: 'tests-failed'`

- [x] Task 5: Wire merge strategy from `ExecutionConfig` (AC: #8)
  - [x] Accept `MergeStrategy` as parameter to `mergeWorktree`
  - [x] Default to `'merge-commit'` if not specified
  - [x] Lane pool or caller passes `execution.merge_strategy` from the resolved workflow

- [x] Task 6: Write unit tests (AC: #1-#10)
  - [x] Test: `mergeWorktree` calls `git merge --no-ff` for merge-commit strategy
  - [x] Test: `mergeWorktree` calls `git rebase` for rebase strategy
  - [x] Test: mutex serializes concurrent merge calls
  - [x] Test: clean merge + passing tests returns `success: true` and cleans up worktree
  - [x] Test: clean merge + failing tests reverts merge and returns `tests-failed`
  - [x] Test: conflict detected returns `conflicts` array and `reason: 'conflict'`
  - [x] Test: unexpected git error returns `reason: 'git-error'` and rolls back
  - [x] Test: `MergeResult` has correct shape with all required fields
  - [x] Test: default strategy is `merge-commit` when not specified
  - [x] Test: merge mutex is shared across instances (singleton)

## Dev Notes

### Architecture Constraints

- **Architecture Decision 3** (architecture-parallel-execution.md): Merges are serialized — only one `git merge` into main at a time. Use a mutex pattern. Cross-worktree test validation runs after every merge.
- **Merge Safety Pattern**: Acquire mutex before any git operation on main. Run `git status` before merge to verify main is clean. On test failure: `git reset --hard HEAD~1`. On git error: `git merge --abort` / `git rebase --abort`.
- **WorktreeManager boundary**: The worktree manager knows git operations. It does NOT know about agents, stories, or TUI. The merge agent (story 18-2) will call `mergeWorktree` and handle conflict resolution separately.

### Key Files to Modify

| File | Why |
|------|-----|
| `src/lib/worktree-manager.ts` | Add `mergeWorktree()` method, `MergeResult` interface, `MergeStrategy` type, merge mutex |
| `src/lib/__tests__/worktree-manager.test.ts` | Add tests for all merge-related functionality |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/lane-pool.ts` | `LanePool`, `EpicResult` — the pool will call `mergeWorktree` after epic completion (wired in 18-2/19-1, not this story) |
| `src/lib/hierarchical-flow.ts` | `ExecutionConfig.merge_strategy` — provides the strategy choice |
| `src/lib/workflow-engine.ts` | `EngineResult` — used in lane results, not directly by merge |

### Implementation Patterns

**Merge mutex (async, no external deps):**
```typescript
class AsyncMutex {
  private locked = false;
  private waitQueue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    while (this.locked) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }
    this.locked = true;
    return () => {
      this.locked = false;
      const next = this.waitQueue.shift();
      if (next) next();
    };
  }
}

// Module-level singleton
const mergeMutex = new AsyncMutex();
```

**Merge execution:**
```typescript
async mergeWorktree(epicId: string, strategy: MergeStrategy = 'merge-commit'): Promise<MergeResult> {
  const start = Date.now();
  const branch = this.findBranchForEpic(epicId);
  if (!branch) throw new WorktreeError(`No branch found for epic ${epicId}`, '');

  const release = await mergeMutex.acquire();
  try {
    // Verify main is clean
    this.execGit('git status --porcelain');

    // Perform merge or rebase
    try {
      if (strategy === 'rebase') {
        this.execGit(`git rebase ${branch}`);
      } else {
        this.execGit(`git merge --no-ff ${branch}`);
      }
    } catch (err) {
      // Detect conflict vs other error
      const conflicts = this.detectConflicts();
      if (conflicts.length > 0) {
        this.abortMerge(strategy);
        return { success: false, reason: 'conflict', conflicts, durationMs: Date.now() - start };
      }
      this.abortMerge(strategy);
      return { success: false, reason: 'git-error', durationMs: Date.now() - start };
    }

    // Run test suite
    const testResults = await this.runTestSuite();
    if (testResults.failed > 0) {
      this.execGit('git reset --hard HEAD~1');
      return { success: false, reason: 'tests-failed', testResults, durationMs: Date.now() - start };
    }

    // Success — cleanup
    this.cleanupWorktree(epicId);
    return { success: true, testResults, durationMs: Date.now() - start };
  } finally {
    release();
  }
}
```

**Test suite execution:**
```typescript
private async runTestSuite(): Promise<{ passed: number; failed: number; coverage?: number }> {
  // Use child_process.exec (async) with timeout — not execSync
  // Parse JSON reporter output or stdout for pass/fail counts
}
```

### Previous Story (17-3) Intelligence

- Story 17-3 completed the run command parallel integration. The run command creates `WorktreeManager` and `LanePool`, builds epic descriptors from sprint state, and reports results.
- The `WorktreeManager` currently has `createWorktree`, `cleanupWorktree`, `listWorktrees`, and `detectOrphans`.
- The `execGit` private helper wraps `execSync` with error handling and 30s timeout. Reuse this for merge commands.
- Tests use `vi.mock('node:child_process')` to mock `execSync`. The merge tests will follow the same pattern.
- The `findBranchForEpic(epicId)` private method already exists — returns the branch name for a given epicId or undefined.
- Current test count: ~4850+ tests across 178+ files.
- Module patterns: TypeScript in `src/`, ESM with `.js` import extensions, vitest test framework.

### Boundary: What This Story Does NOT Include

- **Conflict resolution via merge agent** -- deferred to Story 18-2. This story detects conflicts and reports them but does NOT resolve them.
- **Cross-worktree test validation as a standalone module** -- deferred to Story 18-3. This story runs tests inline within `mergeWorktree`.
- **Epic state transitions** -- deferred to Epic 19. This story does not update epic state (completing, merging, etc).
- **TUI merge status display** -- deferred to Epic 20.
- **Wiring mergeWorktree into the lane pool completion flow** -- the lane pool and epic completion detector (19-1) will call `mergeWorktree`. This story adds the method; callers are wired later.

### Edge Cases

- **Branch not found for epicId**: `mergeWorktree` should return a git-error `MergeResult`, not throw.
- **Main branch is dirty** (uncommitted changes): `git status --porcelain` before merge; abort if non-empty.
- **Rebase with conflicts**: `git rebase` produces conflicts differently than `git merge`. Both paths must detect and abort correctly.
- **Test command not found**: `npm test` fails if no test script is defined. Treat as test failure (not git error).
- **Concurrent `cleanupWorktree` during merge**: The mutex prevents this — cleanup only happens after merge succeeds inside the mutex.
- **`git reset --hard HEAD~1` fails**: This would indicate a corrupted git state. Log the error but still return `tests-failed` result.
- **Empty branch (no commits)**: `git merge --no-ff` with no changes produces a no-op merge. Handle gracefully.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/` directories
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`
- Test: `npm test`
- The `worktree-manager.ts` file is ~387 lines. Adding merge support will grow it but should stay under 500.
- The `child_process` mock pattern is already established in the test file.

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 18.1]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 3 -- Merge Serialization & Agent]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Merge Safety Pattern]
- [Source: _bmad-output/planning-artifacts/prd.md#FR12, FR13, FR16, FR17]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR4]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/18-1-merge-serialization-execution-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/18-1-merge-serialization-execution.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A

### Completion Notes List
- All 6 tasks completed, all 10 ACs addressed
- 55 tests total (29 existing + 26 new merge tests), all passing
- Coverage: 98.35% statements, 91.17% branches, 100% functions, 98.84% lines
- Build succeeds cleanly

### File List
- `src/lib/worktree-manager.ts` — added MergeResult, MergeStrategy, AsyncMutex, mergeMutex, mergeWorktree(), detectConflicts(), abortMerge(), runTestSuite(), parseTestOutput()
- `src/lib/__tests__/worktree-manager.test.ts` — added 26 tests covering all merge ACs
