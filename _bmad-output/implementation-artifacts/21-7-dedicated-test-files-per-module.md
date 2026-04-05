<story-spec>
# Story 21-7: Create dedicated test files per module

Status: ready-for-dev

## Story

As a developer,
I want each decomposed workflow module to have its own focused test file,
So that tests are co-located with the module they exercise, the 4102-line `workflow-engine.test.ts` monolith is eliminated, test ownership is clear, and coverage gaps per module are visible at a glance.

## Dependencies

- **Requires:** 21-6 complete (all test imports migrated to canonical modules)
- **Blocks:** Nothing — this is the final story in Epic 21

## Acceptance Criteria

1. **Given** the test directory is listed via `ls src/lib/__tests__/workflow-compiler.test.ts`, **When** the file exists, **Then** the command exits 0 — a dedicated compiler test file has been created.
   <!-- verification: `ls src/lib/__tests__/workflow-compiler.test.ts` exits 0 -->

2. **Given** the test directory is listed via `ls src/lib/__tests__/workflow-machines.test.ts`, **When** the file exists, **Then** the command exits 0 — a dedicated machines test file has been created.
   <!-- verification: `ls src/lib/__tests__/workflow-machines.test.ts` exits 0 -->

3. **Given** the test directory is listed via `ls src/lib/__tests__/workflow-actors.test.ts`, **When** the file exists, **Then** the command exits 0 — a dedicated actors test file has been created.
   <!-- verification: `ls src/lib/__tests__/workflow-actors.test.ts` exits 0 -->

4. **Given** the test directory is listed via `ls src/lib/__tests__/workflow-runner.test.ts`, **When** the file exists, **Then** the command exits 0 — a dedicated runner test file has been created.
   <!-- verification: `ls src/lib/__tests__/workflow-runner.test.ts` exits 0 -->

5. **Given** the old monolith test file `workflow-engine.test.ts` is checked, **When** `ls src/lib/__tests__/workflow-engine.test.ts` is run, **Then** the command fails (exit code non-zero) — the monolith has been deleted after splitting.
   <!-- verification: `ls src/lib/__tests__/workflow-engine.test.ts` exits non-zero -->

6. **Given** the old mixed test file `workflow-machine.test.ts` is checked, **When** `ls src/lib/__tests__/workflow-machine.test.ts` is run, **Then** the command fails (exit code non-zero) — the legacy-named file has been deleted after splitting.
   <!-- verification: `ls src/lib/__tests__/workflow-machine.test.ts` exits non-zero -->

7. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** the exit code is 0, the pass count is ≥4960, and failures are 0 — no tests were lost or broken during the split.
   <!-- verification: `npx vitest run` exits 0; output shows ≥4960 passed, 0 failures -->

8. **Given** the compiler test file is run via `npx vitest run src/lib/__tests__/workflow-compiler.test.ts`, **When** tests complete, **Then** the exit code is 0 and all tests pass — compiler tests work in isolation.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-compiler.test.ts` exits 0 -->

9. **Given** the machines test file is run via `npx vitest run src/lib/__tests__/workflow-machines.test.ts`, **When** tests complete, **Then** the exit code is 0 and all tests pass — machines tests work in isolation.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-machines.test.ts` exits 0 -->

10. **Given** the actors test file is run via `npx vitest run src/lib/__tests__/workflow-actors.test.ts`, **When** tests complete, **Then** the exit code is 0 and all tests pass — actors tests work in isolation.
    <!-- verification: `npx vitest run src/lib/__tests__/workflow-actors.test.ts` exits 0 -->

11. **Given** the runner test file is run via `npx vitest run src/lib/__tests__/workflow-runner.test.ts`, **When** tests complete, **Then** the exit code is 0 and all tests pass — runner tests work in isolation.
    <!-- verification: `npx vitest run src/lib/__tests__/workflow-runner.test.ts` exits 0 -->

12. **Given** coverage is collected via `npx vitest run --coverage`, **When** the coverage report is inspected, **Then** `workflow-compiler.ts` has ≥90% line coverage.
    <!-- verification: `npx vitest run --coverage` exits 0; coverage output shows workflow-compiler.ts ≥ 90% lines -->

13. **Given** coverage is collected via `npx vitest run --coverage`, **When** the coverage report is inspected, **Then** `workflow-machines.ts` has ≥90% line coverage.
    <!-- verification: `npx vitest run --coverage` exits 0; coverage output shows workflow-machines.ts ≥ 90% lines -->

14. **Given** coverage is collected via `npx vitest run --coverage`, **When** the coverage report is inspected, **Then** `workflow-actors.ts` has ≥90% line coverage.
    <!-- verification: `npx vitest run --coverage` exits 0; coverage output shows workflow-actors.ts ≥ 90% lines -->

15. **Given** coverage is collected via `npx vitest run --coverage`, **When** the coverage report is inspected, **Then** `workflow-runner.ts` has ≥90% line coverage.
    <!-- verification: `npx vitest run --coverage` exits 0; coverage output shows workflow-runner.ts ≥ 90% lines -->

16. **Given** coverage is collected via `npx vitest run --coverage`, **When** the coverage report is inspected, **Then** `workflow-persistence.ts` has ≥90% line coverage.
    <!-- verification: `npx vitest run --coverage` exits 0; coverage output shows workflow-persistence.ts ≥ 90% lines -->

17. **Given** the linter is run on all new test files, **When** `npx eslint src/lib/__tests__/workflow-compiler.test.ts src/lib/__tests__/workflow-machines.test.ts src/lib/__tests__/workflow-actors.test.ts src/lib/__tests__/workflow-runner.test.ts` completes, **Then** it exits 0 with zero errors.
    <!-- verification: eslint command above exits 0 -->

18. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no errors — test file restructuring hasn't broken the build.
    <!-- verification: `npm run build` exits 0 -->

19. **Given** the boundary/architecture tests are run via `npx vitest run -t 'boundar'`, **When** all boundary tests complete, **Then** the exit code is 0 and all pass — the new test files don't violate architectural constraints.
    <!-- verification: `npx vitest run -t 'boundar'` exits 0 -->

20. **Given** each new test file's describe blocks are inspected, **When** the top-level describe names are checked, **Then** each file's describes reference only the module it tests — no cross-module test pollution (e.g., `workflow-compiler.test.ts` contains only compiler-related describes, not `dispatchTask` or `runWorkflowActor`).
    <!-- verification: `grep "describe(" src/lib/__tests__/workflow-compiler.test.ts` shows only compiler-related names (isTaskCompleted, isLoopTaskCompleted, buildRetryPrompt, buildAllUnknownVerdict, getFailedItems, PER_RUN_SENTINEL, compileFlow, etc.); `grep "describe(" src/lib/__tests__/workflow-runner.test.ts` shows only runner-related names (runWorkflowActor, loadWorkItems, checkDriverHealth, crash recovery); `grep "describe(" src/lib/__tests__/workflow-machines.test.ts` shows only machine-related names (dispatchTask, executeLoopBlock, loop block, output contract); `grep "describe(" src/lib/__tests__/workflow-actors.test.ts` shows only actor-related names (buildCoverageDeduplicationContext, propagateVerifyFlags, coverage deduplication) -->

## Tasks / Subtasks

- [ ] Task 1: Analyze and plan the test split (AC: 20)
  - [ ] 1.1: Map every `describe()` block in `workflow-engine.test.ts` (4102 lines) to its target module using the Import Migration Map from 21-6
  - [ ] 1.2: Map every `describe()` block in `workflow-machine.test.ts` (334 lines) to its target module
  - [ ] 1.3: Identify shared mock setup blocks and plan which mocks each new file needs
  - [ ] 1.4: Identify shared helper functions (e.g. `resetMocks()`) and plan reuse strategy

- [ ] Task 2: Create `workflow-compiler.test.ts` (AC: 1, 8, 12, 17, 20)
  - [ ] 2.1: Create the file with vitest imports and necessary mocks
  - [ ] 2.2: Move these describe blocks from `workflow-engine.test.ts`: `isTaskCompleted` (L2088), `isLoopTaskCompleted` (L2132), `buildRetryPrompt` (L1434), `getFailedItems` (L1487)
  - [ ] 2.3: Move these describe blocks from `workflow-machine.test.ts`: `PER_RUN_SENTINEL`, `isTaskCompleted`, `isLoopTaskCompleted`, `buildRetryPrompt`, `buildAllUnknownVerdict`, `getFailedItems`
  - [ ] 2.4: Deduplicate — if both source files test the same function, merge the test cases (keep all assertions, remove duplicated ones)
  - [ ] 2.5: Ensure imports reference only `../workflow-compiler.js` for values and `../workflow-types.js` for types
  - [ ] 2.6: Verify pure function tests use direct assertion style (no mocks needed for pure compiler functions)

- [ ] Task 3: Create `workflow-machines.test.ts` (AC: 2, 9, 13, 17, 20)
  - [ ] 3.1: Create the file with vitest imports and necessary hoisted mocks
  - [ ] 3.2: Move these describe blocks from `workflow-engine.test.ts`: `dispatchTask` (L549), `loop block execution` (L1516), `output contract writing (story 13-3)` (L3096), `coverage deduplication in dispatchTask (story 16-5)` (L4010), `plugin resolution cascade (story 15-1)` (L787)
  - [ ] 3.3: Include all mock setup required by these tests (agent-dispatch, drivers, model-resolver, workflow-state, etc.)
  - [ ] 3.4: Ensure imports reference `../workflow-machines.js` for values under test

- [ ] Task 4: Create `workflow-actors.test.ts` (AC: 3, 10, 14, 17, 20)
  - [ ] 4.1: Create the file with vitest imports and necessary hoisted mocks
  - [ ] 4.2: Move these describe blocks from `workflow-engine.test.ts`: `propagateVerifyFlags (story 16-4)` (L3582), `buildCoverageDeduplicationContext (story 16-5)` (L3866)
  - [ ] 4.3: Include mock setup required by actor tests
  - [ ] 4.4: Ensure imports reference `../workflow-actors.js` for values under test

- [ ] Task 5: Create `workflow-runner.test.ts` (AC: 4, 11, 15, 17, 20)
  - [ ] 5.1: Create the file with vitest imports and necessary hoisted mocks
  - [ ] 5.2: Move these describe blocks from `workflow-engine.test.ts`: `loadWorkItems` (L409), `runWorkflowActor` (L862), `crash recovery & resume` (L2159), `driver integration (story 10-5)` (L2749)
  - [ ] 5.3: Move these describe blocks from `workflow-machine.test.ts`: `loadWorkItems`, `runWorkflowActor`
  - [ ] 5.4: Deduplicate — merge tests for the same function from both source files
  - [ ] 5.5: Include all mock setup required (agent-dispatch, drivers, workflow-state, workflow-parser, trace-id, etc.)
  - [ ] 5.6: Ensure imports reference `../workflow-runner.js` for values under test

- [ ] Task 6: Handle `parseVerdict` tests (AC: 7, 20)
  - [ ] 6.1: Move `parseVerdict (re-exported from verdict-parser)` describe block (L1393) from `workflow-engine.test.ts` into the existing `verdict-parser.test.ts` if it exists, or into a new file
  - [ ] 6.2: Update imports to reference `../verdict-parser.js` directly

- [ ] Task 7: Delete old files (AC: 5, 6)
  - [ ] 7.1: Delete `src/lib/__tests__/workflow-engine.test.ts`
  - [ ] 7.2: Delete `src/lib/__tests__/workflow-machine.test.ts`
  - [ ] 7.3: Verify no other file imports from or references these deleted test files

- [ ] Task 8: Verify existing aligned test files (AC: 16)
  - [ ] 8.1: Run `npx vitest run src/lib/__tests__/workflow-persistence.test.ts` and confirm it passes
  - [ ] 8.2: Check coverage for `workflow-persistence.ts` — if below 90%, add tests to bring it up

- [ ] Task 9: Final verification (AC: 7, 17, 18, 19)
  - [ ] 9.1: `npx vitest run` — all tests pass, count ≥4960
  - [ ] 9.2: `npm run build` — exits 0
  - [ ] 9.3: `npx eslint` on all new test files — exits 0
  - [ ] 9.4: `npx vitest run -t 'boundar'` — boundary tests pass
  - [ ] 9.5: `npx vitest run --coverage` — all 6 modules ≥90% line coverage

## Dev Notes

### Current State (post-21-6)

All test imports already point to canonical modules. Two monolith test files remain:

| File | Lines | Content |
|------|-------|---------|
| `workflow-engine.test.ts` | 4102 | 16 describe blocks spanning runner, machines, compiler, actors, verdict-parser |
| `workflow-machine.test.ts` | 334 | 9 describe blocks mostly testing compiler + runner functions |

### Describe Block → Target Module Mapping

#### From `workflow-engine.test.ts` (4102 lines):

| Describe Block | Line | Target Test File | Module Under Test |
|---------------|------|-----------------|-------------------|
| `loadWorkItems` | 409 | `workflow-runner.test.ts` | workflow-runner |
| `dispatchTask` | 549 | `workflow-machines.test.ts` | workflow-machines |
| `plugin resolution cascade (story 15-1)` | 787 | `workflow-machines.test.ts` | workflow-machines |
| `runWorkflowActor` | 862 | `workflow-runner.test.ts` | workflow-runner |
| `parseVerdict (re-exported from verdict-parser)` | 1393 | verdict-parser tests | verdict-parser |
| `buildRetryPrompt` | 1434 | `workflow-compiler.test.ts` | workflow-compiler |
| `getFailedItems` | 1487 | `workflow-compiler.test.ts` | workflow-compiler |
| `loop block execution` | 1516 | `workflow-machines.test.ts` | workflow-machines |
| `isTaskCompleted` | 2088 | `workflow-compiler.test.ts` | workflow-compiler |
| `isLoopTaskCompleted` | 2132 | `workflow-compiler.test.ts` | workflow-compiler |
| `crash recovery & resume` | 2159 | `workflow-runner.test.ts` | workflow-runner |
| `driver integration (story 10-5)` | 2749 | `workflow-runner.test.ts` | workflow-runner |
| `output contract writing (story 13-3)` | 3096 | `workflow-machines.test.ts` | workflow-machines |
| `propagateVerifyFlags (story 16-4)` | 3582 | `workflow-actors.test.ts` | workflow-actors |
| `buildCoverageDeduplicationContext (story 16-5)` | 3866 | `workflow-actors.test.ts` | workflow-actors |
| `coverage deduplication in dispatchTask (story 16-5)` | 4010 | `workflow-machines.test.ts` | workflow-machines |

#### From `workflow-machine.test.ts` (334 lines):

| Describe Block | Line | Target Test File | Module Under Test |
|---------------|------|-----------------|-------------------|
| `PER_RUN_SENTINEL` | 196 | `workflow-compiler.test.ts` | workflow-compiler |
| `isTaskCompleted` | 202 | `workflow-compiler.test.ts` | workflow-compiler |
| `isLoopTaskCompleted` | 229 | `workflow-compiler.test.ts` | workflow-compiler |
| `buildRetryPrompt` | 243 | `workflow-compiler.test.ts` | workflow-compiler |
| `buildAllUnknownVerdict` | 262 | `workflow-compiler.test.ts` | workflow-compiler |
| `getFailedItems` | 277 | `workflow-compiler.test.ts` | workflow-compiler |
| `loadWorkItems` | 298 | `workflow-runner.test.ts` | workflow-runner |
| `runWorkflowActor` | 305 | `workflow-runner.test.ts` | workflow-runner |

### Mock Sharing Strategy

The biggest challenge is `workflow-engine.test.ts` which has a massive `vi.hoisted()` block with 20+ mock functions. Each new file needs only the mocks relevant to its module:

- **`workflow-compiler.test.ts`**: Minimal/no mocks — compiler functions are pure (take inputs, return outputs). This is the simplest split.
- **`workflow-runner.test.ts`**: Needs mocks for `agent-dispatch`, `workflow-state`, `workflow-parser`, `trace-id`, `session-manager`, drivers, YAML parser.
- **`workflow-machines.test.ts`**: Needs mocks for `agent-dispatch`, `workflow-state`, drivers, `model-resolver`, `output-contract`, `source-isolation`.
- **`workflow-actors.test.ts`**: Needs mocks for `agent-dispatch`, `workflow-state`, `output-contract`.

Each file gets its own `vi.hoisted()` block containing only the mocks it uses. Do NOT create a shared mock helper module — this adds coupling between test files.

### Deduplication Strategy

`isTaskCompleted`, `isLoopTaskCompleted`, `buildRetryPrompt`, `getFailedItems`, and `loadWorkItems` are tested in BOTH `workflow-machine.test.ts` and `workflow-engine.test.ts`. When merging:

1. Keep all unique test cases from both files
2. If identical assertions exist in both, keep one copy
3. Prefer the more thorough version if test cases overlap but differ slightly
4. Preserve `it()` description strings to maintain test audit trail

### Files NOT Touched

These test files already align with their modules and should remain as-is:
- `workflow-parser.test.ts` (1472 lines) — tests `workflow-parser.ts`
- `workflow-parser-hierarchical.test.ts` (678 lines) — tests hierarchical parsing
- `workflow-persistence.test.ts` (131 lines) — tests `workflow-persistence.ts`
- `workflow-state.test.ts` (577 lines) — tests `workflow-state.ts`
- `driver-health-check.test.ts` (494 lines) — tests driver health check via runner
- `story-flow-execution.test.ts` (768 lines) — tests story flow via runner
- `null-task-engine.test.ts` (911 lines) — tests null task handling across modules
- `lane-pool.test.ts` (595 lines) — tests lane pool

### Expected File Sizes (approximate)

| New File | Estimated Lines | Source |
|----------|----------------|--------|
| `workflow-compiler.test.ts` | ~400 | Compiler blocks from both files, merged |
| `workflow-machines.test.ts` | ~1800 | dispatchTask, loops, output contract, plugin cascade, coverage dedup |
| `workflow-runner.test.ts` | ~1200 | loadWorkItems, runWorkflowActor, crash recovery, driver integration |
| `workflow-actors.test.ts` | ~600 | propagateVerifyFlags, buildCoverageDeduplicationContext |

Total: ~4000 lines (vs current 4436 lines — deduplication saves ~400 lines)

### Risk

**Medium.** The 4102-line `workflow-engine.test.ts` has complex mock setup with `vi.hoisted()` at the top. Each mock function is shared across multiple describe blocks. The main risk is a new test file missing a required mock, causing runtime errors. Mitigation: run each new test file in isolation (Tasks 2-5) before deleting originals (Task 7).

### Coverage Baseline

Run `npx vitest run --coverage` before starting to capture baseline coverage per module. If any module is already below 90%, note it — additional tests may be needed (especially for `workflow-persistence.ts` which only has 131 lines of tests for 137 lines of source).

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (90% per module)
<!-- CODEHARNESS-PATCH-END:story-verification -->
</story-spec>
