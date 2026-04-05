# Story 21-6: Migrate all test files to new module imports

Status: review

## Story

As a developer,
I want all test file imports updated to reference the canonical decomposed modules (workflow-runner, workflow-actors, workflow-types, workflow-compiler, workflow-machines, verdict-parser),
So that no test file imports from the deleted `workflow-machine.ts` shim, every import traces to the module that owns the symbol, and the codebase is ready for per-module test splitting (21-7).

## Dependencies

- **Requires:** 21-1 through 21-5 complete (all extractions done, old files deleted)
- **Blocks:** 21-7 (dedicated test files per module)

## Acceptance Criteria

1. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** the exit code is 0 and the pass count is ≥4960 with zero failures.
   <!-- verification: `npx vitest run` exits 0; output contains "passed" with count >= 4960 and 0 failures -->

2. **Given** the `src/` directory is searched for test files importing from `workflow-machine.js`, **When** `grep -rE "from.*['\"].*workflow-machine\.js['\"]" src/lib/__tests__/` is run, **Then** zero matches are returned — no test file imports from the deleted shim.
   <!-- verification: `grep -rE "from.*['\"].*workflow-machine\.js['\"]" src/lib/__tests__/` produces no output, exit code 1 -->

3. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no errors.
   <!-- verification: `npm run build` exits 0 -->

4. **Given** `npx tsc --noEmit` is run, **When** type-checking completes, **Then** no type errors reference `workflow-machine` — the deleted module causes no type resolution failures.
   <!-- verification: `npx tsc --noEmit 2>&1 | grep -i workflow-machine` produces no output -->

5. **Given** the test file `src/lib/__tests__/workflow-machine.test.ts` imports `runWorkflowActor`, `loadWorkItems`, `checkDriverHealth`, **When** its imports are inspected, **Then** these symbols come from `../workflow-runner.js`.
   <!-- verification: `grep -E "from.*workflow-runner" src/lib/__tests__/workflow-machine.test.ts` shows runWorkflowActor, loadWorkItems, checkDriverHealth -->

6. **Given** the test file `src/lib/__tests__/workflow-machine.test.ts` imports compiler utilities, **When** its imports are inspected, **Then** `isTaskCompleted`, `isLoopTaskCompleted`, `buildRetryPrompt`, `buildAllUnknownVerdict`, `getFailedItems`, `PER_RUN_SENTINEL` come from `../workflow-compiler.js`.
   <!-- verification: `grep -E "from.*workflow-compiler" src/lib/__tests__/workflow-machine.test.ts` shows these symbols -->

7. **Given** the test file `src/lib/__tests__/workflow-machine.test.ts` imports `buildCoverageDeduplicationContext`, **When** its imports are inspected, **Then** it comes from `../workflow-actors.js`.
   <!-- verification: `grep "buildCoverageDeduplicationContext" src/lib/__tests__/workflow-machine.test.ts | grep "workflow-actors"` matches -->

8. **Given** the test file `src/lib/__tests__/workflow-machine.test.ts` imports types, **When** its imports are inspected, **Then** `EngineConfig`, `EngineError`, `EngineEvent`, `WorkItem` come from `../workflow-types.js`.
   <!-- verification: `grep -E "from.*workflow-types" src/lib/__tests__/workflow-machine.test.ts` shows EngineConfig, EngineError, EngineEvent, WorkItem -->

9. **Given** the test file `src/lib/__tests__/workflow-engine.test.ts` imports values, **When** its imports are inspected, **Then** `runWorkflowActor`, `loadWorkItems` from `../workflow-runner.js`; `dispatchTask`, `executeLoopBlock` from `../workflow-machines.js`; `parseVerdict` from `../verdict-parser.js`; compiler utilities from `../workflow-compiler.js`; `buildCoverageDeduplicationContext` from `../workflow-actors.js`.
   <!-- verification: `grep -E "^import" src/lib/__tests__/workflow-engine.test.ts` shows no workflow-machine.js references; shows workflow-runner, workflow-machines, verdict-parser, workflow-compiler, workflow-actors -->

10. **Given** the test file `src/lib/__tests__/driver-health-check.test.ts` imports values, **When** its imports are inspected, **Then** `checkDriverHealth`, `runWorkflowActor` from `../workflow-runner.js`; `EngineConfig` from `../workflow-types.js`.
    <!-- verification: `grep -E "^import" src/lib/__tests__/driver-health-check.test.ts | grep -v vitest` shows workflow-runner and workflow-types, no workflow-machine -->

11. **Given** the test file `src/lib/__tests__/story-flow-execution.test.ts` imports values, **When** its imports are inspected, **Then** `runWorkflowActor` from `../workflow-runner.js`; `EngineConfig` from `../workflow-types.js`.
    <!-- verification: `grep -E "^import" src/lib/__tests__/story-flow-execution.test.ts | grep -v vitest` shows workflow-runner and workflow-types, no workflow-machine -->

12. **Given** the test file `src/lib/__tests__/null-task-engine.test.ts` imports values, **When** its imports are inspected, **Then** `runWorkflowActor`, `checkDriverHealth` from `../workflow-runner.js`; `executeLoopBlock` from `../workflow-machines.js`; `isTaskCompleted`, `PER_RUN_SENTINEL` from `../workflow-compiler.js`; types from `../workflow-types.js`.
    <!-- verification: `grep -E "^import" src/lib/__tests__/null-task-engine.test.ts | grep -v vitest` shows workflow-runner, workflow-machines, workflow-compiler, workflow-types, no workflow-machine -->

13. **Given** the test file `src/lib/__tests__/lane-pool.test.ts` imports `EngineResult`, **When** its imports are inspected, **Then** it comes from `../workflow-compiler.js`.
    <!-- verification: `grep "EngineResult" src/lib/__tests__/lane-pool.test.ts | grep "workflow-compiler"` matches -->

14. **Given** the linter is run on all migrated test files, **When** `npx eslint src/lib/__tests__/workflow-machine.test.ts src/lib/__tests__/workflow-engine.test.ts src/lib/__tests__/driver-health-check.test.ts src/lib/__tests__/story-flow-execution.test.ts src/lib/__tests__/null-task-engine.test.ts src/lib/__tests__/lane-pool.test.ts` completes, **Then** it exits 0 with zero errors.
    <!-- verification: eslint command above exits 0 -->

15. **Given** the boundary/architecture policy tests exist, **When** `npx vitest run -t 'boundar'` is run, **Then** all boundary tests pass with zero failures — import migration doesn't violate architectural constraints.
    <!-- verification: `npx vitest run -t 'boundar'` exits 0 -->

## Tasks / Subtasks

- [x] Task 1: Audit all test files for stale `workflow-machine.js` imports (AC: 2)
  - [x] 1.1: Run `grep -rE "from.*workflow-machine\.js" src/lib/__tests__/` and list any remaining references
  - [x] 1.2: For each match, identify which canonical module owns the imported symbol using the Import Migration Map (see Dev Notes)

- [x] Task 2: Migrate `workflow-machine.test.ts` imports (AC: 5, 6, 7, 8)
  - [x] 2.1: Replace any `workflow-machine.js` import of `runWorkflowActor`, `loadWorkItems`, `checkDriverHealth` → `../workflow-runner.js`
  - [x] 2.2: Replace any `workflow-machine.js` import of `isTaskCompleted`, `isLoopTaskCompleted`, `buildRetryPrompt`, `buildAllUnknownVerdict`, `getFailedItems`, `PER_RUN_SENTINEL` → `../workflow-compiler.js`
  - [x] 2.3: Replace any `workflow-machine.js` import of `buildCoverageDeduplicationContext` → `../workflow-actors.js`
  - [x] 2.4: Replace any `workflow-machine.js` type imports of `EngineConfig`, `EngineError`, `EngineEvent`, `WorkItem` → `../workflow-types.js`
  - [x] 2.5: Replace any `workflow-machine.js` type import of `EngineResult` → `../workflow-compiler.js`

- [x] Task 3: Migrate `workflow-engine.test.ts` imports (AC: 9)
  - [x] 3.1: `runWorkflowActor`, `loadWorkItems` → `../workflow-runner.js`
  - [x] 3.2: `dispatchTask`, `executeLoopBlock` → `../workflow-machines.js`
  - [x] 3.3: `parseVerdict` → `../verdict-parser.js`
  - [x] 3.4: Compiler utilities → `../workflow-compiler.js`
  - [x] 3.5: `buildCoverageDeduplicationContext` → `../workflow-actors.js`
  - [x] 3.6: Types → `../workflow-types.js`

- [x] Task 4: Migrate remaining test files (AC: 10, 11, 12, 13)
  - [x] 4.1: `driver-health-check.test.ts` — `checkDriverHealth`, `runWorkflowActor` → `../workflow-runner.js`; `EngineConfig` → `../workflow-types.js`
  - [x] 4.2: `story-flow-execution.test.ts` — `runWorkflowActor` → `../workflow-runner.js`; `EngineConfig` → `../workflow-types.js`
  - [x] 4.3: `null-task-engine.test.ts` — `runWorkflowActor`, `checkDriverHealth` → `../workflow-runner.js`; `executeLoopBlock` → `../workflow-machines.js`; compiler symbols → `../workflow-compiler.js`; types → `../workflow-types.js`
  - [x] 4.4: `lane-pool.test.ts` — `EngineResult` → `../workflow-compiler.js`

- [x] Task 5: Final verification (AC: 1–15)
  - [x] 5.1: `npm run build` exits 0
  - [x] 5.2: `npx vitest run` — all tests pass, count ≥ 4960 (4960 passed, 190 files)
  - [x] 5.3: `grep -rE "from.*workflow-machine\.js" src/lib/__tests__/` — zero matches
  - [x] 5.4: `npx tsc --noEmit 2>&1 | grep -i workflow-machine` — no output
  - [x] 5.5: `npx eslint` on all migrated test files — exits 0
  - [x] 5.6: `npx vitest run -t 'boundar'` — boundary tests pass (16 passed)

## Dev Notes

### Current State (post-21-5)

Story 21-5 already deleted `workflow-machine.ts` and `hierarchical-flow.ts`, inlined hierarchical-flow logic into `workflow-parser.ts`, and migrated most consumer imports. The codebase currently has **4960 passing tests** across **190 test files**.

A preliminary scan shows the import migration for test files is **largely complete** — 21-5 Task 1 handled the bulk of it. This story serves as the **verification and cleanup gate** to confirm every test file imports from the correct canonical module before 21-7 splits tests per module.

### Import Migration Map

| Symbol | Canonical Module | Kind |
|--------|-----------------|------|
| `runWorkflowActor` | `workflow-runner.js` | value |
| `checkDriverHealth` | `workflow-runner.js` | value |
| `loadWorkItems` | `workflow-runner.js` | value |
| `executeLoopBlock` | `workflow-machines.js` | value |
| `dispatchTask` | `workflow-machines.js` | value |
| `buildCoverageDeduplicationContext` | `workflow-actors.js` | value |
| `isTaskCompleted` | `workflow-compiler.js` | value |
| `isLoopTaskCompleted` | `workflow-compiler.js` | value |
| `buildRetryPrompt` | `workflow-compiler.js` | value |
| `buildAllUnknownVerdict` | `workflow-compiler.js` | value |
| `getFailedItems` | `workflow-compiler.js` | value |
| `PER_RUN_SENTINEL` | `workflow-compiler.js` | value |
| `parseVerdict` | `verdict-parser.js` | value |
| `EngineConfig` | `workflow-types.js` | type |
| `EngineEvent` | `workflow-types.js` | type |
| `EngineError` | `workflow-types.js` | type |
| `WorkItem` | `workflow-types.js` | type |
| `DispatchInput` | `workflow-types.js` | type |
| `DispatchOutput` | `workflow-types.js` | type |
| `NullTaskInput` | `workflow-types.js` | type |
| `EngineResult` | `workflow-compiler.js` | type |
| `LoopBlockResult` | `workflow-compiler.js` | type |
| `DriverHealth` | `workflow-compiler.js` | type (re-exported from agents/types) |
| `OutputContract` | `workflow-compiler.js` | type (re-exported from agents/types) |

### Affected Test Files

| Test File | Primary Module Under Test |
|-----------|--------------------------| 
| `workflow-machine.test.ts` | Mixed (runner, compiler, actors, types) |
| `workflow-engine.test.ts` | Mixed (runner, machines, compiler, actors) |
| `driver-health-check.test.ts` | workflow-runner |
| `story-flow-execution.test.ts` | workflow-runner |
| `null-task-engine.test.ts` | workflow-runner + workflow-machines |
| `lane-pool.test.ts` | lane-pool (types from workflow-compiler) |

### Risk

Low. This is a pure import-path change with no behavioral modification. If an import is wrong, `tsc --noEmit` and `vitest run` will catch it immediately as a missing-export error.

### Note on `workflow-machine.test.ts` naming

The file `workflow-machine.test.ts` still exists and tests symbols spread across multiple canonical modules. It is **not renamed** in this story — renaming and splitting is the scope of 21-7 (dedicated test files per module). This story only ensures imports are correct.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated if needed

## Testing Requirements

- [ ] All existing tests pass
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Story 21-5 completed all import migrations as part of its Task 1 (migrate consumer imports away from workflow-machine.js). This story served as the verification and cleanup gate. All 15 ACs confirmed satisfied:

- AC 1: 4960 tests passed, 0 failures
- AC 2: zero grep matches for workflow-machine.js in test files
- AC 3: `npm run build` exits 0
- AC 4: `npx tsc --noEmit | grep workflow-machine` — no output
- ACs 5–13: All per-file imports verified correct via grep inspection
- AC 14: eslint exits 0 on all 6 migrated test files
- AC 15: boundary tests — 16 passed

No code changes were needed; all migration was pre-done by 21-5.

### File List

No files were modified — all imports were already migrated by story 21-5.
