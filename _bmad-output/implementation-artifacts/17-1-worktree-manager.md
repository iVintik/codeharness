# Story 17.1: Worktree Manager

Status: done

## Story

As a developer,
I want a worktree manager that handles git worktree create/merge/cleanup,
so that parallel epics run in isolated working directories.

## Acceptance Criteria

1. **Given** `src/lib/worktree-manager.ts` exists, **when** `createWorktree(epicId, slug)` is called, **then** it creates a git branch named `codeharness/epic-{epicId}-{slug}` from the current HEAD of the main branch. <!-- verification: test-provable -->

2. **Given** `createWorktree(epicId, slug)` is called, **when** the branch is created, **then** it creates a git worktree at `/tmp/codeharness-wt-epic-{epicId}` pointing to the new branch and returns the absolute worktree path. <!-- verification: test-provable -->

3. **Given** `createWorktree(epicId, slug)` is called, **when** the operation completes, **then** the total wall-clock time is under 10 seconds (NFR1). <!-- verification: runtime-provable -->

4. **Given** `cleanupWorktree(epicId)` is called, **when** a worktree exists for that epicId, **then** the worktree is removed via `git worktree remove` and the branch `codeharness/epic-{epicId}-*` is deleted via `git branch -D`. <!-- verification: test-provable -->

5. **Given** `cleanupWorktree(epicId)` is called, **when** no worktree exists for that epicId, **then** the function completes without error (idempotent). <!-- verification: test-provable -->

6. **Given** `listWorktrees()` is called, **when** one or more codeharness worktrees exist, **then** it returns an array of `WorktreeInfo` objects containing `epicId`, `path`, `branch`, and `createdAt` for every worktree whose branch starts with `codeharness/epic-`. <!-- verification: test-provable -->

7. **Given** `listWorktrees()` is called, **when** no codeharness worktrees exist, **then** it returns an empty array. <!-- verification: test-provable -->

8. **Given** orphaned worktrees from a previous crashed run exist (worktree directory present but no active codeharness process), **when** `detectOrphans()` is called, **then** it returns an array of orphaned `WorktreeInfo` entries whose worktree paths are present on disk but not tracked by any running codeharness process. <!-- verification: test-provable -->

9. **Given** `createWorktree` is called, **when** the branch `codeharness/epic-{epicId}-{slug}` already exists (stale from a crash), **then** the function cleans up the stale branch and worktree before re-creating, rather than throwing. <!-- verification: test-provable -->

10. **Given** `createWorktree` is called, **when** the git command fails (e.g., not a git repo, disk full), **then** a descriptive `WorktreeError` is thrown with the stderr from the git command, and any partially-created branch or worktree is cleaned up. <!-- verification: test-provable -->

11. **Given** all git operations in worktree-manager, **when** they execute, **then** stderr is captured and included in error messages, and branch names are prefixed with `codeharness/` to avoid collision with user branches (NFR12). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/worktree-manager.ts` with types and interfaces (AC: #1, #2, #6, #8, #11)
  - [x] Define `WorktreeInfo` interface: `epicId`, `path`, `branch`, `createdAt`
  - [x] Define `WorktreeError` error class extending `Error` with `stderr` field
  - [x] Define `WorktreeManager` class with constructor accepting `mainBranch: string` (default `'main'`)
  - [x] Constants: `BRANCH_PREFIX = 'codeharness/epic-'`, `WORKTREE_BASE = '/tmp/codeharness-wt-epic-'`

- [x] Task 2: Implement `createWorktree(epicId, slug)` (AC: #1, #2, #3, #9, #10)
  - [x] Run `git branch codeharness/epic-{epicId}-{slug} {mainBranch}` via `execSync`
  - [x] Run `git worktree add /tmp/codeharness-wt-epic-{epicId} codeharness/epic-{epicId}-{slug}` via `execSync`
  - [x] On branch-already-exists: call cleanup first, then retry create (AC #9)
  - [x] On any failure: clean up partial state (remove worktree if created, delete branch if created)
  - [x] Wrap git stderr in `WorktreeError`
  - [x] Return absolute worktree path

- [x] Task 3: Implement `cleanupWorktree(epicId)` (AC: #4, #5)
  - [x] Find the branch matching `codeharness/epic-{epicId}-*` via `git branch --list`
  - [x] Run `git worktree remove /tmp/codeharness-wt-epic-{epicId} --force`
  - [x] Run `git branch -D {branch}` to delete the branch
  - [x] Swallow errors if worktree or branch doesn't exist (idempotent, AC #5)

- [x] Task 4: Implement `listWorktrees()` (AC: #6, #7)
  - [x] Run `git worktree list --porcelain` and parse output
  - [x] Filter to entries whose branch starts with `codeharness/epic-`
  - [x] Extract epicId from branch name pattern `codeharness/epic-{epicId}-{slug}`
  - [x] Return `WorktreeInfo[]` sorted by epicId

- [x] Task 5: Implement `detectOrphans()` (AC: #8)
  - [x] Call `listWorktrees()` to get all codeharness worktrees
  - [x] Check each worktree path for a `.codeharness/lane-state.json` file
  - [x] If lane-state.json doesn't exist or has no active PID, mark as orphan
  - [x] Return orphaned `WorktreeInfo[]`

- [x] Task 6: Write unit tests (AC: #1-#11)
  - [x] Test: createWorktree creates branch and worktree, returns path
  - [x] Test: createWorktree cleans up stale branch before re-creating
  - [x] Test: createWorktree throws WorktreeError with stderr on git failure
  - [x] Test: createWorktree cleans up partial state on failure
  - [x] Test: cleanupWorktree removes worktree and branch
  - [x] Test: cleanupWorktree is idempotent (no error when nothing exists)
  - [x] Test: listWorktrees returns only codeharness-prefixed worktrees
  - [x] Test: listWorktrees returns empty array when none exist
  - [x] Test: detectOrphans identifies worktrees without active process
  - [x] Test: branch names use codeharness/ prefix (NFR12)
  - [x] Test: all error messages include stderr from git

## Dev Notes

### Architecture Constraints

- **Architecture Decision 1** (architecture-parallel-execution.md): Each parallel epic gets its own git worktree on a dedicated branch. The worktree manager handles the full lifecycle: create -> execute -> merge -> validate -> cleanup. This story covers create, cleanup, list, and orphan detection. Merge is deferred to Story 18-1.
- **Worktree Operations Pattern**: All git operations MUST use `child_process.execSync` for atomic git commands (create branch, add worktree). Use `child_process.exec` with timeout for potentially slow operations. Capture stderr for error reporting. Clean up on failure.
- **Branch naming**: `codeharness/` prefix prevents collision with user branches (NFR12).
- **Worktree location**: `/tmp/codeharness-wt-epic-{N}` -- temporary, cleaned up after merge.

### Key Files to Create

| File | Purpose |
|------|---------|
| `src/lib/worktree-manager.ts` | Git worktree lifecycle module |
| `src/lib/__tests__/worktree-manager.test.ts` | Unit tests |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/hierarchical-flow.ts` | `ExecutionConfig` interface -- has `isolation: 'worktree' \| 'none'`. Worktree manager is used when `isolation === 'worktree'`. |
| `src/lib/null-task-registry.ts` | Pattern reference for registry modules with interfaces + error class. Follow the same module structure. |
| `src/lib/telemetry-writer.ts` | Pattern reference for `appendFileSync`/`mkdirSync` file operations, `node:fs` imports, test patterns. |
| `src/lib/session-manager.ts` | Pattern reference for `child_process` usage in this codebase. |

### Implementation Patterns

**Git command execution:**
```typescript
import { execSync } from 'node:child_process';

// Atomic git commands — use execSync
execSync(`git branch ${branchName} ${mainBranch}`, {
  cwd: projectDir,
  stdio: ['pipe', 'pipe', 'pipe'],  // capture stderr
});

// Parse git worktree list --porcelain output:
// worktree /path/to/worktree
// HEAD abc123
// branch refs/heads/codeharness/epic-17-worktree-manager
// (blank line)
```

**Error handling:**
```typescript
try {
  execSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
} catch (err: unknown) {
  const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
  throw new WorktreeError(`Failed to create worktree: ${stderr}`, stderr);
}
```

**Testing strategy:** Mock `execSync` with `vi.mock('node:child_process')`. Verify correct git commands are called with correct arguments. Test error paths by making mock throw with stderr buffer.

### Previous Story (16-6) Intelligence

- Story 16-6 completed the story flow execution. All 4779 tests pass. This is the first story in Epic 17 -- a new module with no modifications to existing files.
- Recent code patterns: TypeScript modules in `src/lib/`, tests colocated in `__tests__/`, ESM with `.js` import extensions, vitest test framework.
- Module pattern: export interfaces, export functions or class, export error class. JSDoc comments on all exports.
- The workflow engine already has `ExecutionConfig` parsed from YAML. The worktree manager will be consumed by the lane pool (Story 17-2) and the merge serialization (Story 18-1).

### Boundary: What This Story Does NOT Include

- **Merge operations** -- deferred to Story 18-1. This story has no `mergeWorktree()` method.
- **Lane pool integration** -- deferred to Story 17-2. The worktree manager is a standalone module.
- **Run command integration** -- deferred to Story 17-3.
- **TUI components** -- deferred to Epic 20.

### Edge Cases

- **Stale branch from crash**: If `codeharness/epic-17-slug` already exists when `createWorktree` is called, the previous run crashed. Clean up the stale state before re-creating (AC #9). Do not throw.
- **Worktree directory already exists on disk**: `/tmp/codeharness-wt-epic-17` might exist from a crash. `git worktree add` will fail. Handle by removing the directory first.
- **Not a git repo**: `execSync` throws. Wrap in `WorktreeError` with descriptive message.
- **Branch name with special characters**: The `slug` parameter comes from epic names. Sanitize to `[a-z0-9-]` before using in branch name.
- **Concurrent createWorktree calls**: Two calls with different epicIds are safe (different branches, different paths). Two calls with the same epicId are a bug in the caller -- the second will hit the stale-cleanup path.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/` directories
- ESM modules -- use `.js` extensions in imports
- Build: `npm run build`
- Test: `npm test`

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 17.1]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 1 — Worktree Lifecycle Model]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Worktree Operations Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Architectural Boundaries — Worktree Manager]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6, FR7, FR11]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1, NFR9, NFR12]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/17-1-worktree-manager-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/17-1-worktree-manager.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Implemented `WorktreeManager` class with `createWorktree`, `cleanupWorktree`, `listWorktrees`, and `detectOrphans` methods
- All git operations use `execSync` with stdio piped for stderr capture
- Slug sanitization enforces `[a-z0-9-]` pattern
- Stale state from crashed runs is cleaned up before re-creating (AC #9)
- Partial state is cleaned up on failure (AC #10)
- All catch blocks annotated with `// IGNORE:` comments per NFR3 boundary enforcement
- 33 unit tests covering all 11 acceptance criteria
- Full regression suite passes: 4813 tests across 178 files
- Code review fixes applied: epicId validation (command injection prevention), createdAt uses filesystem birthtime instead of current time, dead code path removed, branch coverage gaps closed

### Change Log

- 2026-04-03: Implemented story 17-1 — worktree manager module with full test coverage
- 2026-04-03: Code review — fixed command injection via epicId validation, fixed createdAt to use fs birthtime, removed dead code path, added 8 tests for coverage gaps

### File List

- `src/lib/worktree-manager.ts` (new) — WorktreeManager class, WorktreeInfo interface, WorktreeError class
- `src/lib/__tests__/worktree-manager.test.ts` (new) — 25 unit tests covering all ACs
