<story-spec>
# Story 21-5: Delete `workflow-machine.ts` and `hierarchical-flow.ts`

Status: ready-for-dev

## Story

As a developer,
I want the re-export shim `workflow-machine.ts` and the legacy `hierarchical-flow.ts` deleted,
So that dead code is removed, all consumers import from canonical modules, and the file decomposition plan (AD6/Epic 7) is complete.

## Acceptance Criteria

1. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with zero errors in stdout/stderr.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** the pass count is ≥4976 with zero failures — no regressions from the deletion.
   <!-- verification: `npx vitest run` exits 0; pass count >= 4976 -->

3. **Given** the file `src/lib/workflow-machine.ts` previously existed as a re-export shim, **When** the project is searched for this file, **Then** the file does not exist on disk.
   <!-- verification: `test ! -f src/lib/workflow-machine.ts && echo PASS` outputs PASS -->

4. **Given** the file `src/lib/hierarchical-flow.ts` previously existed as legacy flow resolution logic, **When** the project is searched for this file, **Then** the file does not exist on disk.
   <!-- verification: `test ! -f src/lib/hierarchical-flow.ts && echo PASS` outputs PASS -->

5. **Given** the test file `src/lib/__tests__/hierarchical-flow.test.ts` previously tested hierarchical-flow.ts, **When** the project is searched for this file, **Then** the file does not exist on disk.
   <!-- verification: `test ! -f src/lib/__tests__/hierarchical-flow.test.ts && echo PASS` outputs PASS -->

6. **Given** the entire `src/` directory is searched for import references to `workflow-machine`, **When** the search completes, **Then** zero matches are found — no source file imports from the deleted shim.
   <!-- verification: `grep -rE "from.*workflow-machine" src/ | grep -v node_modules` produces no output -->

7. **Given** the entire `src/` directory is searched for import references to `hierarchical-flow`, **When** the search completes, **Then** zero matches are found — no source file imports from the deleted module.
   <!-- verification: `grep -rE "from.*hierarchical-flow" src/ | grep -v node_modules` produces no output -->

8. **Given** the `src/commands/run.ts` file imports `runWorkflowActor` and types, **When** its imports are inspected, **Then** it imports `runWorkflowActor` from `../lib/workflow-runner.js` and types `EngineConfig`, `EngineEvent` from `../lib/workflow-types.js`.
   <!-- verification: `grep "from.*workflow-runner" src/commands/run.ts` shows runWorkflowActor import; `grep "from.*workflow-types" src/commands/run.ts` shows EngineConfig/EngineEvent import -->

9. **Given** the `src/lib/lane-pool.ts` file imports `EngineResult` type, **When** its imports are inspected, **Then** it imports `EngineResult` from `./workflow-compiler.js`.
   <!-- verification: `grep "EngineResult" src/lib/lane-pool.ts` shows import from workflow-compiler.js -->

10. **Given** the `src/lib/workflow-persistence.ts` file imports `EngineError` type, **When** its imports are inspected, **Then** it imports `EngineError` from `./workflow-types.js`.
    <!-- verification: `grep "EngineError" src/lib/workflow-persistence.ts` shows import from workflow-types.js -->

11. **Given** `workflow-parser.ts` previously delegated to `hierarchical-flow.ts` for flow resolution, **When** its contents are inspected, **Then** the `resolveHierarchicalFlow`, `ExecutionConfig`, `HierarchicalFlow`, `BUILTIN_EPIC_FLOW_TASKS`, and `EXECUTION_DEFAULTS` logic is inlined or moved directly into `workflow-parser.ts`, with no import from `hierarchical-flow.js`.
    <!-- verification: `grep "hierarchical-flow" src/lib/workflow-parser.ts` produces no output; `grep "resolveHierarchicalFlow\|BUILTIN_EPIC_FLOW_TASKS\|ExecutionConfig" src/lib/workflow-parser.ts` shows these symbols defined locally -->

12. **Given** `workflow-parser.ts` still re-exports `ExecutionConfig`, `HierarchicalFlow`, and `BUILTIN_EPIC_FLOW_TASKS`, **When** test files that import these symbols from `workflow-parser.js` are run, **Then** all tests pass — the public API surface is preserved.
    <!-- verification: `npx vitest run -t 'workflow-parser\|hierarchical'` exits 0 with 0 failures -->

13. **Given** the project linter is run on all modified files, **When** linting completes, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/commands/run.ts src/lib/lane-pool.ts src/lib/workflow-persistence.ts src/lib/workflow-parser.ts src/lib/workflow-runner.ts` exits 0 -->

14. **Given** the TypeScript compiler is run via `npx tsc --noEmit`, **When** type-checking completes, **Then** zero new type errors are introduced by the deleted files. Pre-existing type errors in other files are acceptable.
    <!-- verification: `npx tsc --noEmit 2>&1 | grep -E 'workflow-machine|hierarchical-flow'` produces no output -->

15. **Given** the test files `workflow-machine.test.ts`, `workflow-engine.test.ts`, `driver-health-check.test.ts`, `story-flow-execution.test.ts`, `null-task-engine.test.ts`, and `lane-pool.test.ts` previously imported from `workflow-machine.js`, **When** their imports are inspected, **Then** each imports from the canonical module that actually exports the symbol (`workflow-runner.js`, `workflow-types.js`, `workflow-compiler.js`, `workflow-actors.js`, `workflow-machines.js`, or `verdict-parser.js`).
    <!-- verification: `grep -rE "from.*workflow-machine" src/lib/__tests__/` produces no output -->

16. **Given** the boundary/architecture policy tests exist, **When** they are run via `npx vitest run -t 'boundar'`, **Then** all boundary tests pass — no policy violations from the changes.
    <!-- verification: `npx vitest run -t 'boundar'` exits 0 with 0 failures -->

## Tasks / Subtasks

- [ ] Task 1: Migrate all consumer imports away from `workflow-machine.js` (AC: 6, 8, 9, 10, 15)
  - [ ] 1.1: Update `src/commands/run.ts` — change `runWorkflowActor` import to `../lib/workflow-runner.js`, change `EngineConfig`/`EngineEvent` type imports to `../lib/workflow-types.js`
  - [ ] 1.2: Update `src/lib/lane-pool.ts` — change `EngineResult` type import to `./workflow-compiler.js`
  - [ ] 1.3: Update `src/lib/workflow-persistence.ts` — change `EngineError` type import to `./workflow-types.js`
  - [ ] 1.4: Update `src/lib/__tests__/workflow-machine.test.ts` — remap all imports:
    - `executeLoopBlock`, `dispatchTask` → `../workflow-machines.js`
    - `buildRetryPrompt`, `buildAllUnknownVerdict`, `getFailedItems`, `isTaskCompleted`, `isLoopTaskCompleted`, `PER_RUN_SENTINEL` → `../workflow-compiler.js`
    - `buildCoverageDeduplicationContext` → `../workflow-actors.js`
    - `checkDriverHealth` → `../workflow-runner.js`
    - `EngineConfig`, `EngineResult`, `EngineError`, `EngineEvent`, `WorkItem` → `../workflow-types.js` (types) and `../workflow-compiler.js` (interfaces re-exported there)
  - [ ] 1.5: Update `src/lib/__tests__/workflow-engine.test.ts` — same pattern as 1.4
  - [ ] 1.6: Update `src/lib/__tests__/driver-health-check.test.ts` — `checkDriverHealth`, `runWorkflowActor` → `../workflow-runner.js`; `EngineConfig` → `../workflow-types.js`
  - [ ] 1.7: Update `src/lib/__tests__/story-flow-execution.test.ts` — `runWorkflowActor` → `../workflow-runner.js`; `EngineConfig` → `../workflow-types.js`
  - [ ] 1.8: Update `src/lib/__tests__/null-task-engine.test.ts` — same pattern as 1.4
  - [ ] 1.9: Update `src/lib/__tests__/lane-pool.test.ts` — `EngineResult` → `../workflow-compiler.js`

- [ ] Task 2: Inline `hierarchical-flow.ts` logic into `workflow-parser.ts` (AC: 7, 11, 12)
  - [ ] 2.1: Move `ExecutionConfig` interface into `workflow-parser.ts`
  - [ ] 2.2: Move `HierarchicalFlow` interface into `workflow-parser.ts`
  - [ ] 2.3: Move `BUILTIN_EPIC_FLOW_TASKS` constant into `workflow-parser.ts`
  - [ ] 2.4: Move `EXECUTION_DEFAULTS` constant into `workflow-parser.ts`
  - [ ] 2.5: Move validation sets (`VALID_ISOLATION`, `VALID_MERGE_STRATEGY`, etc.) into `workflow-parser.ts`
  - [ ] 2.6: Move `resolveHierarchicalFlow()` function into `workflow-parser.ts` (or inline its logic directly into `parseWorkflow`)
  - [ ] 2.7: Move `resolveExecutionConfig()` helper into `workflow-parser.ts`
  - [ ] 2.8: Move `normalizeFlowArray()` helper into `workflow-parser.ts`
  - [ ] 2.9: Replace `HierarchicalFlowError` usages — either keep a local class in `workflow-parser.ts` or convert throws to `WorkflowParseError` directly
  - [ ] 2.10: Remove the `import ... from './hierarchical-flow.js'` and `export ... from './hierarchical-flow.js'` lines from `workflow-parser.ts`
  - [ ] 2.11: Ensure `ExecutionConfig`, `HierarchicalFlow`, and `BUILTIN_EPIC_FLOW_TASKS` remain exported from `workflow-parser.ts` for downstream consumers

- [ ] Task 3: Migrate hierarchical-flow tests into workflow-parser tests (AC: 5, 12)
  - [ ] 3.1: Move relevant test cases from `hierarchical-flow.test.ts` into `workflow-parser.test.ts` (or a new `workflow-parser-hierarchical.test.ts` if needed for line budget)
  - [ ] 3.2: Update test imports to use `workflow-parser.js` instead of `hierarchical-flow.js`
  - [ ] 3.3: Verify all moved tests pass with `npx vitest run -t 'hierarchical'`

- [ ] Task 4: Delete dead files (AC: 3, 4, 5)
  - [ ] 4.1: Delete `src/lib/workflow-machine.ts`
  - [ ] 4.2: Delete `src/lib/hierarchical-flow.ts`
  - [ ] 4.3: Delete `src/lib/__tests__/hierarchical-flow.test.ts` (after tests migrated in Task 3)

- [ ] Task 5: Clean up build artifacts and references (AC: 1, 6, 7)
  - [ ] 5.1: Remove any references to `workflow-machine` in `src/lib/AGENTS.md`
  - [ ] 5.2: Update `src/lib/AGENTS.md` to reflect that `workflow-runner.ts` is the canonical entry point (no longer "re-exported via workflow-machine.ts")
  - [ ] 5.3: Verify no stale `.js`/`.d.ts` build output for deleted files lingers in `dist/` (run `npm run build` clean)

- [ ] Task 6: Final verification (AC: 1–16)
  - [ ] 6.1: `npm run build` exits 0
  - [ ] 6.2: `npx vitest run` — all tests pass, pass count ≥ 4976
  - [ ] 6.3: `test ! -f src/lib/workflow-machine.ts` — file gone
  - [ ] 6.4: `test ! -f src/lib/hierarchical-flow.ts` — file gone
  - [ ] 6.5: `test ! -f src/lib/__tests__/hierarchical-flow.test.ts` — file gone
  - [ ] 6.6: `grep -rE "from.*workflow-machine" src/` — zero matches
  - [ ] 6.7: `grep -rE "from.*hierarchical-flow" src/` — zero matches
  - [ ] 6.8: `npx eslint src/commands/run.ts src/lib/lane-pool.ts src/lib/workflow-persistence.ts src/lib/workflow-parser.ts` exits 0
  - [ ] 6.9: `npx tsc --noEmit 2>&1 | grep -E 'workflow-machine|hierarchical-flow'` — no output
  - [ ] 6.10: `npx vitest run -t 'boundar'` — boundary tests pass

## Dev Notes

### What Gets Deleted

| File | Lines | Reason |
|------|-------|--------|
| `src/lib/workflow-machine.ts` | 25 | Pure re-export shim — all consumers will import from canonical modules |
| `src/lib/hierarchical-flow.ts` | 169 | Legacy flow resolution — logic inlined into `workflow-parser.ts` |
| `src/lib/__tests__/hierarchical-flow.test.ts` | 680 | Tests migrated to workflow-parser test file |

### Import Migration Map

Every `from 'workflow-machine.js'` import must be replaced with the canonical source module. Here is the complete mapping:

| Symbol | Canonical Module | Type |
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
| `EngineResult` | `workflow-compiler.js` | type (re-exported) |
| `LoopBlockResult` | `workflow-compiler.js` | type |
| `DriverHealth` | `workflow-compiler.js` | type (re-exported from agents/types) |
| `OutputContract` | `workflow-compiler.js` | type (re-exported from agents/types) |
| `EvaluatorVerdict` | `verdict-parser.js` | type |

### Consumer File Changes (9 files)

| File | Current Import | New Import(s) |
|------|---------------|---------------|
| `src/commands/run.ts` | `workflow-machine.js` × 2 | `workflow-runner.js` (runWorkflowActor), `workflow-types.js` (EngineConfig, EngineEvent) |
| `src/lib/lane-pool.ts` | `workflow-machine.js` × 1 | `workflow-compiler.js` (EngineResult) |
| `src/lib/workflow-persistence.ts` | `workflow-machine.js` × 1 | `workflow-types.js` (EngineError) |
| `src/lib/__tests__/workflow-machine.test.ts` | `workflow-machine.js` × 2 | Split across `workflow-runner.js`, `workflow-compiler.js`, `workflow-actors.js`, `workflow-types.js` |
| `src/lib/__tests__/workflow-engine.test.ts` | `workflow-machine.js` × 2 | Split across `workflow-machines.js`, `workflow-compiler.js`, `workflow-actors.js`, `workflow-types.js` |
| `src/lib/__tests__/driver-health-check.test.ts` | `workflow-machine.js` × 2 | `workflow-runner.js` (checkDriverHealth, runWorkflowActor), `workflow-types.js` (EngineConfig) |
| `src/lib/__tests__/story-flow-execution.test.ts` | `workflow-machine.js` × 2 | `workflow-runner.js` (runWorkflowActor), `workflow-types.js` (EngineConfig) |
| `src/lib/__tests__/null-task-engine.test.ts` | `workflow-machine.js` × 2 | Split across `workflow-machines.js`, `workflow-runner.js`, `workflow-compiler.js`, `workflow-types.js` |
| `src/lib/__tests__/lane-pool.test.ts` | `workflow-machine.js` × 1 | `workflow-compiler.js` (EngineResult) |

### Hierarchical Flow Inlining Strategy

`hierarchical-flow.ts` (169 lines) contains:
- 2 interfaces (`ExecutionConfig`, `HierarchicalFlow`)
- 2 constants (`BUILTIN_EPIC_FLOW_TASKS`, `EXECUTION_DEFAULTS`)
- 4 validation sets (`VALID_ISOLATION`, `VALID_MERGE_STRATEGY`, `VALID_EPIC_STRATEGY`, `VALID_STORY_STRATEGY`)
- 3 functions (`resolveHierarchicalFlow`, `resolveExecutionConfig`, `normalizeFlowArray`)
- 1 error class (`HierarchicalFlowError`)

**Strategy:** Move all of this into `workflow-parser.ts` since `workflow-parser.ts` is the ONLY runtime consumer. The `HierarchicalFlowError` catch in `parseWorkflow()` can be simplified — the inlined `resolveHierarchicalFlow` can throw `WorkflowParseError` directly.

**Line budget concern:** `workflow-parser.ts` will grow by ~130 lines (169 minus imports/exports/error-class overhead). Check the resulting line count against NFR3 (≤300). If it exceeds 300, split the execution config validation into a separate helper file (`workflow-execution.ts`).

### Anti-Patterns to Avoid

- **Do NOT leave any `workflow-machine` import in `src/`** — grep must return zero matches.
- **Do NOT change function signatures or behavior** — this is a pure import path migration + dead code removal.
- **Do NOT skip migrating test file imports** — tests import from `workflow-machine.js` too and must be updated.
- **Do NOT forget to migrate `hierarchical-flow.test.ts` test cases** — deleting tests without migrating them loses coverage.
- **Do NOT leave stale `.js`/`.d.ts` files in `dist/`** — run a clean build.

### Execution Order (CRITICAL)

1. **First:** Inline `hierarchical-flow.ts` into `workflow-parser.ts` and migrate its tests (Task 2 + Task 3)
2. **Second:** Migrate all consumer imports away from `workflow-machine.js` (Task 1)
3. **Third:** Delete dead files (Task 4) — only after all imports are updated
4. **Fourth:** Clean up and verify (Task 5 + Task 6)

Doing deletions before import migration will break the build. The order matters.

### References

- Architecture: `_bmad-output/planning-artifacts/architecture-xstate-engine.md` — AD6 (File Organization)
- Epics: `_bmad-output/planning-artifacts/epics-xstate-engine.md` — Epic 7, Story 7.5 + 7.6
- Prior story (predecessor): `21-4-extract-workflow-runner.md` — created the re-export shim
- Current shim: `src/lib/workflow-machine.ts` — 25 lines, pure re-exports
- Legacy module: `src/lib/hierarchical-flow.ts` — 169 lines, flow resolution logic
- Current consumers: see "Consumer File Changes" table above

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/21-5-delete-workflow-machine-and-hierarchical-flow-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib/AGENTS.md — remove workflow-machine.ts, update canonical module references)
- [ ] Exec-plan created in docs/exec-plans/active/21-5-delete-workflow-machine-and-hierarchical-flow.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
</story-spec>
