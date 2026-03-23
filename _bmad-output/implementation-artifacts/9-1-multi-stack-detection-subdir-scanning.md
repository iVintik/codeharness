# Story 9-1: Multi-stack detection with subdirectory scanning

## Status: verifying

## Story

As a developer with a monorepo containing multiple languages,
I want codeharness to detect all stacks in my project,
So that every language gets harness features instead of just the first detected.

## Acceptance Criteria

- [x] AC1: Given a project with `package.json` AND `Cargo.toml` at root, when `detectStacks()` is called, then it returns `[{ stack: 'nodejs', dir: '.' }, { stack: 'rust', dir: '.' }]` <!-- verification: cli-verifiable -->
- [x] AC2: Given a monorepo with `frontend/package.json` and `backend/Cargo.toml`, when `detectStacks()` is called, then it returns `[{ stack: 'nodejs', dir: 'frontend' }, { stack: 'rust', dir: 'backend' }]` <!-- verification: cli-verifiable -->
- [x] AC3: Given a single-stack project with only `package.json`, when `detectStacks()` is called, then it returns `[{ stack: 'nodejs', dir: '.' }]` and `detectStack()` compat wrapper returns `'nodejs'` <!-- verification: cli-verifiable -->
- [x] AC4: Given an empty directory, when `detectStacks()` is called, then it returns `[]` and `detectStack()` compat wrapper returns `null` <!-- verification: cli-verifiable -->
- [x] AC5: Given a project with `node_modules/some-package/Cargo.toml`, when `detectStacks()` scans subdirectories, then `node_modules` is skipped (no false positive) <!-- verification: cli-verifiable -->
- [x] AC6: Given root has `package.json` and subdir `api/` has `Cargo.toml`, when `detectStacks()` is called, then root stacks appear first, subdir stacks after, sorted alphabetically by dir name <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [x] Task 1: Add `StackDetection` interface to `src/lib/stack-detect.ts`
- [x] Task 2: Add `SKIP_DIRS` set and `STACK_MARKERS` array constants
- [x] Task 3: Implement `detectStacks()` function with root scan and subdirectory scan
- [x] Task 4: Refactor `detectStack()` to be a compat wrapper delegating to `detectStacks()`
- [x] Task 5: Add comprehensive tests for `detectStacks()` covering all ACs

## Technical Notes

### New type to define

Add to `src/lib/stack-detect.ts`:

```ts
export interface StackDetection { stack: string; dir: string; }
```

### Changes to `src/lib/stack-detect.ts`

The current `detectStack()` function (L7-14) does an early-return on the first match. The new `detectStacks(dir)` function must:

1. **Root scan (no early return):** Check root for ALL stack markers (`package.json` for nodejs, `requirements.txt`/`pyproject.toml`/`setup.py` for python, `Cargo.toml` for rust). Collect all matches into `StackDetection[]` with `dir: '.'`.
2. **Subdirectory scan (1 level deep):** Use `readdirSync(dir, { withFileTypes: true })` to list immediate children. Filter `dirent.isDirectory()`. Skip directories in the skip list: `node_modules`, `.git`, `target`, `__pycache__`, `dist`, `build`, `coverage`. For each remaining directory, check for stack markers the same way as root.
3. **Ordering:** Root stacks first in priority order (nodejs > python > rust), then subdir stacks sorted alphabetically by dir name.
4. **Compat wrapper:** Keep `detectStack()` returning `string | null`. Implementation: `return detectStacks(dir)[0]?.stack ?? null`.

`detectAppType()` (L100) signature stays unchanged — it is called per-stack by the orchestrator.

### Test file

Create/update `src/lib/__tests__/stack-detect.test.ts`:
- Mock `readdirSync` and `existsSync` via `vi.mock('node:fs')` to simulate monorepo directory structures.
- Test cases: dual root stacks, monorepo layout, single-stack compat, empty dir, skip list enforcement, ordering.

## Files to Change

- `src/lib/stack-detect.ts` — Add `StackDetection` interface, add `detectStacks()` function, refactor `detectStack()` to be a compat wrapper delegating to `detectStacks()`
- `src/lib/__tests__/stack-detect.test.ts` — Add multi-stack detection tests (root dual-stack, monorepo layout, empty dir, skip list, ordering, compat wrapper)

## Dev Agent Record

### Implementation Plan

- Added `StackDetection` interface exported from `stack-detect.ts`
- Created `SKIP_DIRS` Set and `STACK_MARKERS` array for DRY marker/skip configuration
- Implemented `detectStacks()` with root-first scan (all markers, no early return) and 1-level subdirectory scan
- Refactored `detectStack()` to delegate to `detectStacks()[0]?.stack ?? null` with warn on empty
- Used real filesystem temp dirs in tests (consistent with existing test patterns) rather than mocking

### Completion Notes

All 6 acceptance criteria verified with dedicated tests. 15 new tests added for `detectStacks()` covering: dual root stacks, triple root stacks, monorepo layout, single-stack, empty dir, skip list (node_modules, .git, target, __pycache__, dist, build, coverage), ordering (root-first, priority order, alphabetical subdirs), deduplication of python markers, multiple stacks per subdir, and 1-level-only depth limit. All 76 tests in stack-detect.test.ts pass. Full regression suite: 3085 tests across 114 files, zero failures.

## File List

- `src/lib/stack-detect.ts` — Added `StackDetection` interface, `SKIP_DIRS`, `STACK_MARKERS`, `detectStacks()` function; refactored `detectStack()` as compat wrapper
- `src/lib/__tests__/stack-detect.test.ts` — Added 15 new tests in `detectStacks` describe block plus import of `detectStacks` and `StackDetection`

## Change Log

- 2026-03-23: Implemented multi-stack detection with subdirectory scanning (Story 9-1). Added `detectStacks()` function returning `StackDetection[]` with root + 1-level subdir scanning, skip list, priority ordering. Existing `detectStack()` refactored to compat wrapper. 15 new tests added. Zero regressions.
- 2026-03-23: **Code Review (adversarial).** Fixed 4 issues: (1) HIGH — `detectStack()` compat wrapper returned subdir stacks, breaking backward compat for callers expecting root-only behavior; fixed to filter `dir === '.'` only. (2) HIGH — SKIP_DIRS missing `.venv`, `venv`, `.tox`, `.mypy_cache`, `.cache` causing false-positive Python stack detections in virtual environments. (3) MEDIUM — `StackDetection.stack` typed as `string` instead of `StackName` union type; added `StackName = 'nodejs' | 'python' | 'rust'`. (4) MEDIUM — unused `StackDetection` type import in test file. Added 3 new tests (skip dirs, root-only compat). 79 tests pass, 3088 full suite, 97.05% coverage, all files above 80% floor.
