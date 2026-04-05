# Story 21-1: Extract `workflow-actors.ts` from `workflow-machine.ts`

Status: in-progress

## Story

As a developer,
I want dispatch and null task actors extracted into their own module (`workflow-actors.ts`),
So that actors are independently testable, the monolith file shrinks toward the <=300 line target (NFR3), and the dependency direction established by the architecture (AD6) is enforced.

## Acceptance Criteria

1. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with zero errors in stdout/stderr.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** 4976+ tests pass with zero failures — no regressions from the extraction.
   <!-- verification: `npx vitest run` exits 0; pass count >= 4976 -->

3. **Given** the file `src/lib/workflow-actors.ts` exists, **When** its line count is measured via `wc -l`, **Then** it contains <=200 lines (imports, whitespace, and comments included). If the raw extraction exceeds 200 lines, constants like `TASK_PROMPTS` or `FILE_WRITE_TOOL_NAMES` must be moved to a separate module (e.g. `workflow-constants.ts`) to bring the count under budget.
   <!-- verification: `wc -l src/lib/workflow-actors.ts` shows number <= 200 -->

4. **Given** the original monolith `src/lib/workflow-machine.ts` was 1426 lines, **When** its current line count is measured via `wc -l`, **Then** it contains <=1276 lines (at least 150 lines fewer than the original).
   <!-- verification: `wc -l src/lib/workflow-machine.ts` shows number <= 1276 -->

5. **Given** `workflow-actors.ts` is the new module, **When** its contents are searched for references to `workflow-machine` via `grep -c 'workflow-machine' src/lib/workflow-actors.ts`, **Then** the count is 0 — no circular dependency back to the monolith.
   <!-- verification: `grep -c 'workflow-machine' src/lib/workflow-actors.ts` outputs 0 -->

6. **Given** `workflow-machine.ts` consumes actors from the new module, **When** its imports are searched via `grep 'workflow-actors' src/lib/workflow-machine.ts`, **Then** at least one import line from `./workflow-actors.js` is present.
   <!-- verification: `grep 'workflow-actors' src/lib/workflow-machine.ts` shows at least one import line -->

7. **Given** the test suite includes dispatch-related tests, **When** they are run via `npx vitest run -t 'dispatch'`, **Then** all matching tests pass (11+ test files, 140+ tests) — the extracted `dispatchTaskCore` function works identically to before.
   <!-- verification: `npx vitest run -t 'dispatch'` exits 0 with 0 failures -->

8. **Given** the test suite includes null-task-related tests, **When** they are run via `npx vitest run -t 'null'`, **Then** all matching tests pass (66+ test files, 254+ tests) — the extracted `nullTaskCore` function works identically to before.
   <!-- verification: `npx vitest run -t 'null'` exits 0 with 0 failures -->

9. **Given** the project linter is run on the new file via `npx eslint src/lib/workflow-actors.ts`, **When** linting completes, **Then** it exits 0 with zero errors and zero warnings.
   <!-- verification: `npx eslint src/lib/workflow-actors.ts` exits 0 with empty output -->

10. **Given** the TypeScript compiler is run via `npx tsc --noEmit`, **When** type-checking completes, **Then** zero errors reference `workflow-actors.ts`. Pre-existing type errors in other files are acceptable, but the new file must introduce no new ones.
    <!-- verification: `npx tsc --noEmit 2>&1 | grep 'workflow-actors'` produces no output -->

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/workflow-actors.ts` with extracted code (AC: 1, 3, 5, 9, 10)
  - [ ] 1.1: Create the file with module header
  - [ ] 1.2: Move `DispatchInput`, `DispatchOutput`, `NullTaskInput` interfaces
  - [ ] 1.3: Move `dispatchTaskCore()` function (~160 lines of dispatch logic)
  - [ ] 1.4: Move `nullTaskCore()` function (~38 lines of null task logic)
  - [ ] 1.5: Move `dispatchActor` and `nullTaskDispatchActor` — the `fromPromise` XState wrappers
  - [ ] 1.6: Move helper functions used exclusively by actors: `buildCoverageDeduplicationContext`, `propagateVerifyFlags`
  - [ ] 1.7: Move `HALT_ERROR_CODES` constant
  - [ ] 1.8: Add all necessary imports from external modules (drivers, trace-id, session-manager, output-contract, source-isolation, etc.)
  - [ ] 1.9: Export public API: `dispatchActor`, `nullTaskDispatchActor`, `dispatchTaskCore`, `nullTaskCore`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `buildCoverageDeduplicationContext`

- [ ] Task 2: Apply line budget — bring `workflow-actors.ts` under 200 lines (AC: 3)
  - [ ] 2.1: If file exceeds 200 lines, move `TASK_PROMPTS` to `workflow-constants.ts` or `workflow-prompts.ts`
  - [ ] 2.2: If still over, move `FILE_WRITE_TOOL_NAMES` to the same constants file
  - [ ] 2.3: If still over, move type interfaces (`DispatchInput`, `DispatchOutput`, `NullTaskInput`) to a future `workflow-types.ts` or keep in `workflow-machine.ts` and import them (dependency goes the right direction: actors imports from types, not from machine)
  - [ ] 2.4: Verify final `wc -l` <= 200

- [ ] Task 3: Update `src/lib/workflow-machine.ts` to import from new module (AC: 2, 4, 6, 7, 8)
  - [ ] 3.1: Remove all code moved in Task 1 from `workflow-machine.ts`
  - [ ] 3.2: Add import statement(s) from `./workflow-actors.js`
  - [ ] 3.3: Re-export any symbols that downstream consumers expect from `workflow-machine.ts` (preserve public API for backward compat)
  - [ ] 3.4: Remove imports that are no longer needed in `workflow-machine.ts` (they moved to `workflow-actors.ts`)
  - [ ] 3.5: Verify the orchestration actors (`loopIterationActor`, `storyFlowActor`, `epicStepActor`, `runEpicActor`) still compile — they call `dispatchTaskCore`/`nullTaskCore` which are now imported

- [ ] Task 4: Update cross-file imports if needed (AC: 1, 10)
  - [ ] 4.1: Search for any files that import moved symbols directly from `workflow-machine` (test files, other lib files)
  - [ ] 4.2: Update import paths to `./workflow-actors.js` OR rely on re-exports from Task 3.3
  - [ ] 4.3: Run `npx tsc --noEmit 2>&1 | grep workflow-actors` to confirm zero new type errors

- [ ] Task 5: Final verification (AC: 1-10)
  - [ ] 5.1: `npm run build` exits 0
  - [ ] 5.2: `npx vitest run` — all tests pass, pass count >= 4976
  - [ ] 5.3: `wc -l src/lib/workflow-actors.ts` <= 200
  - [ ] 5.4: `wc -l src/lib/workflow-machine.ts` <= 1276
  - [ ] 5.5: `grep -c 'workflow-machine' src/lib/workflow-actors.ts` outputs 0
  - [ ] 5.6: `grep 'workflow-actors' src/lib/workflow-machine.ts` shows import line(s)
  - [ ] 5.7: `npx vitest run -t 'dispatch'` passes
  - [ ] 5.8: `npx vitest run -t 'null'` passes
  - [ ] 5.9: `npx eslint src/lib/workflow-actors.ts` exits 0
  - [ ] 5.10: `npx tsc --noEmit 2>&1 | grep workflow-actors` produces no output

## Dev Notes

### What Gets Extracted

Target code from the current `workflow-machine.ts` (1426 lines original, 1090 current):

| Item | Type | Est. Lines |
|------|------|-----------|
| `DispatchInput` interface | Type | ~13 |
| `DispatchOutput` interface | Type | ~8 |
| `NullTaskInput` interface | Type | ~9 |
| `HALT_ERROR_CODES` | Constant | ~1 |
| `FILE_WRITE_TOOL_NAMES` | Constant | ~4 |
| `TASK_PROMPTS` | Constant | ~10 |
| `buildCoverageDeduplicationContext()` | Helper | ~18 |
| `propagateVerifyFlags()` | Helper | ~21 |
| `dispatchTaskCore()` | Core function | ~163 |
| `nullTaskCore()` | Core function | ~38 |
| `dispatchActor` | XState actor | ~3 |
| `nullTaskDispatchActor` | XState actor | ~3 |

**Raw total: ~290 lines.** Exceeds the 200-line budget. The line budget strategy (Task 2) must be applied.

### Line Budget Strategy (Priority Order)

1. **Move `TASK_PROMPTS` to `workflow-prompts.ts`** — it's a config constant, not actor logic (~10 lines saved)
2. **Move `FILE_WRITE_TOOL_NAMES` to same constants file** (~4 lines saved)
3. **Move interfaces to `workflow-types.ts`** — these are shared types, not actor-specific (~30 lines saved). Dependency direction: actors imports types (correct per AD6 boundary rules).
4. **Tighten whitespace/comments** — collapse single-line jsdoc, remove redundant blank lines
5. **Last resort:** Accept up to 210 lines if the overage is pure type definitions — but AC3 says <=200, so this is a negotiation with the user, not a default.

### Dependency Direction (CRITICAL)

```
workflow-actors.ts  <-- imports from --  workflow-machine.ts
       |
       | imports from
       v
  trace-id.ts, session-manager.ts, agent-dispatch.ts,
  output-contract.ts, source-isolation.ts, drivers/factory.ts,
  null-task-registry.ts, workflow-state.ts, verdict-parser.ts,
  circuit-breaker.ts, evaluator.ts, state.ts
```

`workflow-actors.ts` must NOT import from `workflow-machine.ts`. The dependency flows one way: machine imports actors. Violation of this rule creates a circular dependency that breaks the architecture's decomposition plan (AD6).

### What Stays in `workflow-machine.ts`

Everything NOT in the extraction list:
- `EngineEvent`, `EngineConfig`, `EngineResult`, `EngineError`, `WorkItem` interfaces
- `isTaskCompleted()`, `isLoopTaskCompleted()` helpers
- `loopIterationActor`, `storyFlowActor`, `epicStepActor`, `runEpicActor` — higher-level orchestration actors that CALL `dispatchTaskCore`/`nullTaskCore`
- `runMachine`, `epicMachine`, `loopMachine` — XState machine definitions
- `runWorkflowActor()` — the entry point
- `getFailedItems()`, `checkDriverHealth()`, `loadWorkItems()`
- Re-exports: `EvaluatorVerdict`, `parseVerdict`

### Anti-Patterns to Avoid

- **Do NOT create `workflow-types.ts` as a full shared type module** — that's Story 2.1. Only create it minimally if needed for line budget in Task 2.
- **Do NOT refactor `dispatchTaskCore` or `nullTaskCore` logic** — this is a pure move/extract. Zero behavior changes.
- **Do NOT move the orchestration actors** (`loopIterationActor`, `storyFlowActor`, etc.) — they stay in `workflow-machine.ts`. They are consumers of dispatch actors, not dispatch actors themselves.
- **Do NOT change any function signatures** — inputs, outputs, and error types must remain identical.

### Testing Strategy

No new tests needed. This is a pure extraction — existing tests cover all behavior. The verification is structural:
- Build passes (compilation correctness)
- All tests pass (behavioral correctness)
- Line counts meet constraints (architectural correctness)
- No circular deps (dependency correctness)

### Known Issue from Previous Attempt

The first implementation produced a 357-line `workflow-actors.ts` because the line budget strategy (Task 2) was not applied. The current `workflow-machine.ts` is 1090 lines (336 lines reduced from 1426, meeting AC4). The fix is to apply Task 2 to bring `workflow-actors.ts` under 200 lines.

### References

- Architecture: `_bmad-output/planning-artifacts/architecture-xstate-engine.md` — AD6 (File Organization), Component Boundaries table
- Epics: `_bmad-output/planning-artifacts/epics-xstate-engine.md` — Epic 7, Story 7.1
- Verification proof: `verification/21-1-extract-workflow-actors-proof.md` — AC3 FAIL (357 lines), AC10 pre-existing type errors
