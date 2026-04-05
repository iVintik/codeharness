# Story 21-2: Extract `workflow-compiler.ts` from `workflow-machine.ts`

Status: draft

## Story

As a developer,
I want the pure helper functions extracted into their own module (`workflow-compiler.ts`),
So that the monolith continues shrinking toward the ≤300 line target (NFR3), all extracted functions are independently testable without mocking runtime dependencies, and the dependency direction established by the architecture (AD6) is enforced.

## Acceptance Criteria

1. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with zero errors in stdout/stderr.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** 4976+ tests pass with zero failures — no regressions from the extraction.
   <!-- verification: `npx vitest run` exits 0; pass count >= 4976 -->

3. **Given** the file `src/lib/workflow-compiler.ts` exists, **When** its line count is measured via `wc -l`, **Then** it contains ≤200 lines (imports, whitespace, and comments included).
   <!-- verification: `wc -l src/lib/workflow-compiler.ts` shows number <= 200 -->

4. **Given** the monolith `src/lib/workflow-machine.ts` was 1107 lines before this extraction, **When** its current line count is measured via `wc -l`, **Then** it contains ≤980 lines (at least 120 lines fewer than before).
   <!-- verification: `wc -l src/lib/workflow-machine.ts` shows number <= 980 -->

5. **Given** `workflow-compiler.ts` is the new module, **When** its contents are searched for references to `workflow-machine` via `grep -c 'workflow-machine' src/lib/workflow-compiler.ts`, **Then** the count is 0 — no circular dependency back to the monolith.
   <!-- verification: `grep -c 'workflow-machine' src/lib/workflow-compiler.ts` outputs 0 -->

6. **Given** `workflow-compiler.ts` is the new module, **When** its contents are searched for references to `workflow-actors` via `grep -c 'workflow-actors' src/lib/workflow-compiler.ts`, **Then** the count is 0 — no dependency on the actors module.
   <!-- verification: `grep -c 'workflow-actors' src/lib/workflow-compiler.ts` outputs 0 -->

7. **Given** `workflow-machine.ts` consumes helpers from the new module, **When** its imports are searched via `grep 'workflow-compiler' src/lib/workflow-machine.ts`, **Then** at least one import line from `./workflow-compiler.js` is present.
   <!-- verification: `grep 'workflow-compiler' src/lib/workflow-machine.ts` shows at least one import line -->

8. **Given** the test suite includes task-completion-related tests, **When** they are run via `npx vitest run -t 'completed'`, **Then** all matching tests pass — the extracted `isTaskCompleted` and `isLoopTaskCompleted` functions work identically to before.
   <!-- verification: `npx vitest run -t 'completed'` exits 0 with 0 failures -->

9. **Given** the test suite includes retry/verdict-related tests, **When** they are run via `npx vitest run -t 'retry\|verdict\|failed'`, **Then** all matching tests pass — the extracted `buildRetryPrompt`, `buildAllUnknownVerdict`, and `getFailedItems` functions work identically to before.
   <!-- verification: `npx vitest run -t 'retry|verdict|failed'` exits 0 with 0 failures -->

10. **Given** the project linter is run on the new file via `npx eslint src/lib/workflow-compiler.ts`, **When** linting completes, **Then** it exits 0 with zero errors and zero warnings.
    <!-- verification: `npx eslint src/lib/workflow-compiler.ts` exits 0 with empty output -->

11. **Given** the TypeScript compiler is run via `npx tsc --noEmit`, **When** type-checking completes, **Then** zero errors reference `workflow-compiler.ts`. Pre-existing type errors in other files are acceptable, but the new file must introduce no new ones.
    <!-- verification: `npx tsc --noEmit 2>&1 | grep 'workflow-compiler'` produces no output -->

12. **Given** `workflow-compiler.ts` contains only pure functions, **When** its imports are inspected, **Then** it imports only from `workflow-parser.ts` (for `FlowStep`/`LoopBlock` types), `workflow-state.ts` (for `WorkflowState`/`TaskCheckpoint` types), `verdict-parser.ts` (for `EvaluatorVerdict` type), and `workflow-types.ts` (for interface types) — no imports from `xstate`, `node:fs`, `node:path`, or any agent/driver/dispatch modules.
    <!-- verification: `grep "^import" src/lib/workflow-compiler.ts` shows only type imports from parser/state/verdict/types modules; `grep -c 'xstate\|node:fs\|node:path\|agent-dispatch\|drivers' src/lib/workflow-compiler.ts` outputs 0 -->

## Tasks / Subtasks

- [ ] Task 1: Create `src/lib/workflow-compiler.ts` with extracted pure functions (AC: 1, 3, 5, 6, 10, 11, 12)
  - [ ] 1.1: Create the file with module header documenting "pure helpers — no IO, no XState, no side effects"
  - [ ] 1.2: Move `isLoopBlock()` type guard function (~3 lines)
  - [ ] 1.3: Move `isTaskCompleted()` function (~8 lines)
  - [ ] 1.4: Move `isLoopTaskCompleted()` function (~12 lines)
  - [ ] 1.5: Move `buildRetryPrompt()` function (~12 lines)
  - [ ] 1.6: Move `buildAllUnknownVerdict()` function (~12 lines)
  - [ ] 1.7: Move `getFailedItems()` function (~8 lines)
  - [ ] 1.8: Move `recordErrorInState()` function (~7 lines)
  - [ ] 1.9: Move `isEngineError()` type guard function (~5 lines)
  - [ ] 1.10: Move `handleDispatchError()` function (~5 lines) — import `DispatchError` type only
  - [ ] 1.11: Move `PER_RUN_SENTINEL` constant
  - [ ] 1.12: Move `DEFAULT_MAX_ITERATIONS` constant
  - [ ] 1.13: Move `HALT_ERROR_CODES` constant
  - [ ] 1.14: Move `LoopBlockResult` interface (~7 lines)
  - [ ] 1.15: Move `EngineResult`, `EngineError`, `WorkItem` interfaces (~20 lines)
  - [ ] 1.16: Add all necessary type imports from `workflow-parser`, `workflow-state`, `verdict-parser`, `agent-dispatch` (type-only)
  - [ ] 1.17: Export full public API

- [ ] Task 2: Apply line budget — verify `workflow-compiler.ts` stays under 200 lines (AC: 3)
  - [ ] 2.1: Count lines after extraction
  - [ ] 2.2: If over 200, move interfaces (`EngineResult`, `EngineError`, `WorkItem`) to `workflow-types.ts` instead
  - [ ] 2.3: If still over, tighten whitespace/comments
  - [ ] 2.4: Verify final `wc -l` ≤ 200

- [ ] Task 3: Update `src/lib/workflow-machine.ts` to import from new module (AC: 2, 4, 7, 8, 9)
  - [ ] 3.1: Remove all code moved in Task 1 from `workflow-machine.ts`
  - [ ] 3.2: Add import statement(s) from `./workflow-compiler.js`
  - [ ] 3.3: Re-export any symbols that downstream consumers expect from `workflow-machine.ts` (preserve public API — `isTaskCompleted`, `isLoopTaskCompleted`, `buildRetryPrompt`, `buildAllUnknownVerdict`, `getFailedItems`, `EngineResult`, `EngineError`, `WorkItem`, `PER_RUN_SENTINEL`, `executeLoopBlock`, `dispatchTask`)
  - [ ] 3.4: Remove imports that are no longer needed in `workflow-machine.ts`
  - [ ] 3.5: Verify that `loopIterationActor`, `storyFlowActor`, `epicStepActor` still compile — they call the extracted helpers (now imported)

- [ ] Task 4: Update `workflow-actors.ts` if it imports moved symbols (AC: 1, 11)
  - [ ] 4.1: Check if `workflow-actors.ts` imports `HALT_ERROR_CODES` or `EngineError` — if so, update import path to `./workflow-compiler.js`
  - [ ] 4.2: Check for any other files importing moved symbols directly from `workflow-machine`
  - [ ] 4.3: Update import paths or rely on re-exports from Task 3.3
  - [ ] 4.4: Run `npx tsc --noEmit 2>&1 | grep workflow-compiler` to confirm zero new type errors

- [ ] Task 5: Final verification (AC: 1-12)
  - [ ] 5.1: `npm run build` exits 0
  - [ ] 5.2: `npx vitest run` — all tests pass, pass count ≥ 4976
  - [ ] 5.3: `wc -l src/lib/workflow-compiler.ts` ≤ 200
  - [ ] 5.4: `wc -l src/lib/workflow-machine.ts` ≤ 980
  - [ ] 5.5: `grep -c 'workflow-machine' src/lib/workflow-compiler.ts` outputs 0
  - [ ] 5.6: `grep -c 'workflow-actors' src/lib/workflow-compiler.ts` outputs 0
  - [ ] 5.7: `grep 'workflow-compiler' src/lib/workflow-machine.ts` shows import line(s)
  - [ ] 5.8: `npx vitest run -t 'completed'` passes
  - [ ] 5.9: `npx vitest run -t 'retry|verdict|failed'` passes
  - [ ] 5.10: `npx eslint src/lib/workflow-compiler.ts` exits 0
  - [ ] 5.11: `npx tsc --noEmit 2>&1 | grep workflow-compiler` produces no output
  - [ ] 5.12: `grep "^import" src/lib/workflow-compiler.ts` shows only type imports; `grep -c 'xstate\|node:fs\|node:path' src/lib/workflow-compiler.ts` outputs 0

## Dev Notes

### Naming Rationale

The architecture doc (AD6) envisioned `compileFlow, compileStep, compileGate, compileForEach` as a dynamic YAML→MachineConfig compiler. The current implementation uses static machine definitions with runtime interpretation — no dynamic compiler exists. This story extracts the **pure helper functions** that the machines and actors depend on. These are the "compilation helpers" — they transform config, state, and verdicts without side effects. The name `workflow-compiler.ts` is retained per epic naming, and future stories may introduce dynamic compilation if the architecture evolves.

### What Gets Extracted

Target code from the current `workflow-machine.ts` (1107 lines post-21-1):

| Item | Type | Est. Lines | Line Range |
|------|------|-----------|------------|
| `DEFAULT_MAX_ITERATIONS` | Constant | 1 | 63 |
| `HALT_ERROR_CODES` | Constant | 1 | 62 |
| `EngineResult` interface | Type | 7 | 70-77 |
| `EngineError` interface | Type | 6 | 78-83 |
| `WorkItem` interface | Type | 5 | 85-89 |
| `isTaskCompleted()` | Pure function | 8 | 96-104 |
| `isLoopTaskCompleted()` | Pure function | 12 | 106-118 |
| `buildRetryPrompt()` | Pure function | 12 | 182-193 |
| `buildAllUnknownVerdict()` | Pure function | 12 | 195-206 |
| `getFailedItems()` | Pure function | 8 | 208-214 |
| `isLoopBlock()` | Type guard | 3 | 216-218 |
| `LoopBlockResult` interface | Type | 7 | 222-228 |
| `recordErrorInState()` | Pure function | 7 | 1085-1091 |
| `isEngineError()` | Type guard | 5 | 1093-1097 |
| `handleDispatchError()` | Pure function | 5 | 1099-1103 |
| `PER_RUN_SENTINEL` | Constant | 1 | 1107 |

**Raw total: ~100 lines of code + ~25 lines of imports/header/whitespace = ~125 lines.** Well under 200-line budget.

### What Stays in `workflow-machine.ts`

Everything NOT in the extraction list:
- XState imports (`setup`, `assign`, `fromPromise`, `createActor`)
- `loopIterationActor` — the `fromPromise` loop iteration actor
- `loopMachine` — XState machine definition (uses `loopIterationActor`)
- `executeLoopBlock()` — creates `loopMachine` actor, runs to completion
- `dispatchTask()` — backward-compat wrapper
- `checkDriverHealth()` — IO function (driver health probes)
- `collectGuideFiles()` / `cleanupGuideFiles()` — IO functions (file read/write)
- `storyFlowActor` — runs story steps sequentially
- `EpicMachineContext` interface + `epicStepActor` — epic step execution
- `epicMachine` — XState machine definition
- `RunMachineContext` interface + `runEpicActor` — run-level orchestration
- `runMachine` — XState machine definition
- `runWorkflowActor()` — main entry point

### Dependency Direction (CRITICAL)

```
workflow-compiler.ts  <-- imports from --  workflow-machine.ts
                      <-- imports from --  workflow-actors.ts (if needed)
       |
       | imports from (TYPE-ONLY)
       v
  workflow-parser.ts (FlowStep, LoopBlock types)
  workflow-state.ts (WorkflowState, TaskCheckpoint types)
  verdict-parser.ts (EvaluatorVerdict type)
  agent-dispatch.ts (DispatchError type — for handleDispatchError)
```

`workflow-compiler.ts` must NOT import from `workflow-machine.ts` or `workflow-actors.ts`. The dependency flows one way: machine/actors import compiler helpers. Violation of this rule creates a circular dependency.

### Purity Constraint

Every function in `workflow-compiler.ts` must be pure:
- No `readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync`, `rmSync`
- No `createActor`, `setup`, `assign`, `fromPromise`
- No `process.cwd()`, `process.env`
- No `Date.now()` (note: `recordErrorInState` uses `new Date().toISOString()` — this is the ONE impurity, but it's a timestamp for logging, not control flow. Acceptable per the architecture's pragmatic purity rule.)
- All imports should be `import type` except for `DispatchError` class (needed for `instanceof` in `handleDispatchError`)

### handleDispatchError Note

`handleDispatchError()` does `instanceof DispatchError` which requires a VALUE import from `agent-dispatch.ts`. This is the only non-type import. It's acceptable because:
1. `DispatchError` is a simple error class with no side effects
2. The import direction is correct (compiler ← machine, compiler → agent-dispatch)
3. The function remains pure — it takes an error and returns a data object

### Anti-Patterns to Avoid

- **Do NOT create new compiler functions** (`compileFlow`, etc.) — that's future work beyond this extraction story.
- **Do NOT refactor any function logic** — this is a pure move/extract. Zero behavior changes.
- **Do NOT move IO functions** (`loadWorkItems`, `collectGuideFiles`, `checkDriverHealth`) — they are not pure.
- **Do NOT move XState machine definitions or actors** — they belong in workflow-machines.ts (Story 21-3).
- **Do NOT change any function signatures** — inputs, outputs, and error types must remain identical.
- **Do NOT break re-exports** — if `workflow-machine.ts` currently exports a symbol, it must continue to do so (via re-export from compiler).

### Testing Strategy

No new tests needed. This is a pure extraction — existing tests cover all behavior. The verification is structural:
- Build passes (compilation correctness)
- All tests pass (behavioral correctness)
- Line counts meet constraints (architectural correctness)
- No circular deps (dependency correctness)
- Only type imports from allowed modules (purity correctness)

### References

- Architecture: `_bmad-output/planning-artifacts/architecture-xstate-engine.md` — AD6 (File Organization), Compiler pattern
- Epics: `_bmad-output/planning-artifacts/epics-xstate-engine.md` — Epic 7, Story 7.2
- Prior story: `_bmad-output/implementation-artifacts/21-1-extract-workflow-actors.md` — established extraction patterns
- Existing types module: `src/lib/workflow-types.ts` — shared interfaces (DispatchInput, DispatchOutput, NullTaskInput, EngineConfig, EngineEvent)
- Existing constants module: `src/lib/workflow-constants.ts` — TASK_PROMPTS, FILE_WRITE_TOOL_NAMES
