<story-spec>

# Story 24-1: Shared types module for XState workflow compiler

Status: draft

## Story

As a developer,
I want all workflow engine types consolidated in `workflow-types.ts` with zero imports from other `workflow-*.ts` files,
So that every module (compiler, machines, actors, visualizer, persistence, runner) imports from one canonical source without circular dependencies.

## Context

**Epic 24: Workflow Compiler** — this is the first of 5 stories that implement the pure recursive compiler for the XState workflow engine. Before the compiler can produce `MachineConfig` objects, all shared types must live in a single dependency-free module. The compiler (stories 24-2 through 24-5) will import these types; the machines (epic 25), actors (epic 23, already done), and all downstream modules depend on them.

**Current state:** `src/lib/workflow-types.ts` exists (157 lines) and already exports `EngineError`, `WorkflowError`, `WorkItem`, `EngineEvent`, `EngineConfig`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `StoryFlowInput`, `StoryFlowOutput`, `LoopMachineContext`, `EpicMachineContext`, `RunMachineContext`. However, it **violates** the architecture's zero-import rule — it currently imports from `workflow-parser.js`, `workflow-state.js`, `verdict-parser.js`, `agent-resolver.js`, and `agents/types.js`. Additionally, several types required by the compiler are missing: `GateConfig`, `ForEachConfig`, `StoryContext`, `GateContext`, `RunContext`, `EpicContext`, and `EngineResult` (currently in `workflow-compiler.ts`).

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD1: `workflow-types.ts` is the leaf dependency — zero imports from any `workflow-*.ts` file.
- Compiler functions are pure: YAML in, MachineConfig out. They import only from `workflow-types.ts`.
- Data flows down as typed input, results flow up as typed output. Each machine level has its own context type.
- `WorkflowError` extends `Error` with `code`, `taskName`, `storyKey`.
- Guards are pure functions on context — guard-relevant types must be in shared types.

**Dependencies:** Epics 21-23 complete. Parser types (`ForEachBlock`, `GateBlock`, `FlowStep`, `ResolvedTask`, `LoopBlock`) currently in `workflow-execution.ts`. `EngineResult` currently in `workflow-compiler.ts`.

**Current test baseline:** 5053 tests passing. Build exits 0.

## Acceptance Criteria

1. **Given** a fresh clone of the repository, **When** `npm run build` completes, **Then** it exits 0 with zero TypeScript errors.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite, **When** `npx vitest run` completes, **Then** all tests pass with zero failures — no regressions from type refactoring.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. **Given** `src/lib/workflow-types.ts`, **When** its import statements are inspected, **Then** it contains zero imports from any file matching `workflow-*.ts` (i.e., no imports from `workflow-parser`, `workflow-state`, `workflow-compiler`, `workflow-machines`, `workflow-actors`, `workflow-runner`, `workflow-execution`).
   <!-- verification: `grep -c 'from.*workflow-' src/lib/workflow-types.ts` shows only self-references or zero; `grep "from '.*workflow-" src/lib/workflow-types.ts` returns no matches to other workflow modules -->

4. **Given** `src/lib/workflow-types.ts`, **When** its exports are inspected, **Then** it exports at minimum: `RunContext`, `EpicContext`, `StoryContext`, `GateContext`, `EngineConfig`, `EngineResult`, `EngineError`, `EngineEvent`, `WorkItem`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `GateConfig`, `ForEachConfig`, `FlowStep`, and the `WorkflowError` class.
   <!-- verification: for each type name, `grep "export.*TypeName" src/lib/workflow-types.ts` returns a match -->

5. **Given** `src/lib/workflow-types.ts`, **When** `WorkflowError` is inspected, **Then** it is a class extending `Error` with readonly properties `code` (string), `taskName` (string), and `storyKey` (string).
   <!-- verification: `grep -A5 "class WorkflowError" src/lib/workflow-types.ts` shows `extends Error` and the three properties -->

6. **Given** `src/lib/workflow-compiler.ts`, **When** its imports are inspected, **Then** it imports shared types from `workflow-types.ts` (not defining them locally) and contains no duplicate type definitions that exist in `workflow-types.ts`.
   <!-- verification: `grep "from.*workflow-types" src/lib/workflow-compiler.ts` returns at least one match; `grep "export interface EngineResult" src/lib/workflow-compiler.ts` returns no match (moved to types) -->

7. **Given** any module that previously imported `EngineResult` from `workflow-compiler.ts`, **When** it is inspected after the refactor, **Then** it imports `EngineResult` from `workflow-types.ts` (directly or via re-export).
   <!-- verification: `grep -r "EngineResult" src/lib/ --include="*.ts"` shows all references resolve through workflow-types or its re-exports -->

8. **Given** `src/lib/workflow-types.ts`, **When** its line count is checked, **Then** it contains ≤ 300 lines (per NFR3 file size constraint).
   <!-- verification: `wc -l src/lib/workflow-types.ts` shows ≤ 300 -->

9. **Given** `src/lib/workflow-types.ts`, **When** linted via `npx eslint src/lib/workflow-types.ts`, **Then** it exits 0 with zero errors.
   <!-- verification: `npx eslint src/lib/workflow-types.ts` exits 0 -->

10. **Given** any `workflow-*.ts` file in `src/lib/`, **When** its imports from `workflow-types.ts` are inspected, **Then** no circular dependency exists — `workflow-types.ts` does not import from any `workflow-*.ts` file, while other `workflow-*.ts` files may import from `workflow-types.ts`.
    <!-- verification: `npx madge --circular src/lib/workflow-types.ts` (or manual grep) shows no circular dependency involving workflow-types.ts -->

11. **Given** the new `GateConfig` type exported from `workflow-types.ts`, **When** inspected, **Then** it includes fields: `gate` (string — the gate name), `check` (string array), `fix` (string array), `pass_when` (union of strategy strings), `max_retries` (number), and `circuit_breaker` (string, defaults to `'stagnation'`).
    <!-- verification: `grep -A8 "interface GateConfig\|type GateConfig" src/lib/workflow-types.ts` shows the required fields -->

12. **Given** the new `ForEachConfig` type exported from `workflow-types.ts`, **When** inspected, **Then** it includes fields: `for_each` (string — the scope name like `'epic'` or `'story'`) and `steps` (array of flow steps).
    <!-- verification: `grep -A4 "interface ForEachConfig\|type ForEachConfig" src/lib/workflow-types.ts` shows the required fields -->

13. **Given** the context types (`RunContext`, `EpicContext`, `StoryContext`, `GateContext`), **When** inspected, **Then** each contains at minimum: an `errors` array field, an accumulator for tasks completed, and a `halted` boolean — enabling guards to operate on any context level uniformly.
    <!-- verification: for each context type, `grep -A15 "interface RunContext\|interface EpicContext\|interface StoryContext\|interface GateContext" src/lib/workflow-types.ts` shows errors, tasksCompleted/halted fields -->

14. **Given** unit tests exist for `workflow-types.ts`, **When** `npx vitest run --reporter=verbose` is filtered to type-related tests, **Then** tests verify: `WorkflowError` construction, `WorkflowError` instanceof checks, type guard functions (if any), and that exported types are importable.
    <!-- verification: `npx vitest run --reporter=verbose` shows passing tests for WorkflowError and type exports -->

## Tasks / Subtasks

### T1: Audit current type locations and consumers
- Catalog every type/interface/class in `workflow-types.ts`, `workflow-compiler.ts`, `workflow-execution.ts`, and `workflow-parser.ts`
- Map each type to its consumers (which files import it)
- Identify types that need to move into `workflow-types.ts`
- Identify imports in `workflow-types.ts` that must be broken (currently imports from `workflow-parser.js`, `workflow-state.js`, `verdict-parser.js`, `agent-resolver.js`, `agents/types.js`)

### T2: Define missing compiler types in `workflow-types.ts`
- Add `GateConfig` interface (mirroring `GateBlock` from `workflow-execution.ts` but as a compiler-facing config type)
- Add `ForEachConfig` interface (mirroring `ForEachBlock` from `workflow-execution.ts` but as a compiler-facing config type)
- Add `FlowStep` type (compiler-level flow step union: `string | ForEachConfig | GateConfig`)
- Add `EngineResult` (move from `workflow-compiler.ts`)
- Keep existing `WorkflowError`, `EngineError`, `EngineEvent`, `WorkItem`

### T3: Define compiler context types
- Add `RunContext` — top-level machine context for the run machine (replaces or refines `RunMachineContext`)
- Add `EpicContext` — epic-level machine context (replaces or refines `EpicMachineContext`)
- Add `StoryContext` — story-level machine context (new — currently only `StoryFlowInput`/`StoryFlowOutput` exist)
- Add `GateContext` — gate/negotiation machine context (new — holds verdicts map, iteration count, check/fix tasks)
- Each context type must include: `errors: EngineError[]`, `tasksCompleted: number`, `halted: boolean`, `lastContract`, `accumulatedCostUsd`

### T4: Break circular imports — make `workflow-types.ts` dependency-free
- Remove imports from `workflow-parser.js` — inline or re-define the needed parser types (`ResolvedTask`, `LoopBlock`, `FlowStep`) as standalone interfaces
- Remove imports from `workflow-state.js` — define `WorkflowState` reference type or use a generic
- Remove imports from `verdict-parser.js` — define `EvaluatorVerdict` reference type locally if needed
- Remove imports from `agent-resolver.js` — define `SubagentDefinition` reference type locally if needed
- Remove imports from `agents/types.js` — define `OutputContract` and `StreamEvent` reference types locally if needed
- Alternative: if full type duplication is too heavy, use structural typing or `type-only` re-exports that don't create runtime deps

### T5: Update all consumer imports
- Update `workflow-compiler.ts` to import types from `workflow-types.ts` instead of defining them
- Update `workflow-machines.ts` to import context types from `workflow-types.ts`
- Update `workflow-actors.ts` to import from `workflow-types.ts`
- Update `workflow-runner.ts`, `run.ts`, and any other consumers
- Ensure re-exports in `workflow-compiler.ts` still work for downstream consumers that import from there

### T6: Add/update unit tests
- Test `WorkflowError` construction: verify `code`, `taskName`, `storyKey` properties, `instanceof Error`, `name === 'WorkflowError'`
- Test type exports are importable (compile-time check via test file imports)
- Test any type guard functions added
- Verify no test regressions: `npx vitest run` passes all 5053+ tests

### T7: Verify build and lint
- `npm run build` exits 0
- `npx eslint src/lib/workflow-types.ts` exits 0
- `wc -l src/lib/workflow-types.ts` ≤ 300
- No circular dependencies involving `workflow-types.ts`

## Dev Notes

### What already exists
`workflow-types.ts` (157 lines) already has most dispatch/engine types. The main work is:
1. Adding missing compiler types (`GateConfig`, `ForEachConfig`, context types)
2. Moving `EngineResult` from `workflow-compiler.ts`
3. Breaking the import chain so `workflow-types.ts` imports nothing from `workflow-*.ts`

### Type duplication vs. structural typing
The architecture says "zero imports from workflow-*.ts" for the types module. Two approaches:
- **Option A:** Duplicate key interfaces (`ResolvedTask`, `OutputContract`, etc.) in `workflow-types.ts`. Simple, explicit, but means two copies.
- **Option B:** Move the canonical definitions INTO `workflow-types.ts` and have `workflow-execution.ts` / `workflow-parser.ts` re-export FROM `workflow-types.ts`. More correct dependency direction, but larger refactor.
- **Recommended:** Option B where feasible, Option A for external types (`OutputContract`, `StreamEvent`) that belong to the agent layer.

### Context type naming
The architecture uses `RunContext`, `EpicContext`, `StoryContext`, `GateContext`. The current code uses `RunMachineContext`, `EpicMachineContext`, `LoopMachineContext`. This story should:
- Add the new names as the canonical compiler-level types
- Keep old names as type aliases for backward compatibility until epic 25 migrates machines

### File size budget
Current: 157 lines. Adding ~15 types at ~5-8 lines each = ~120 lines. Total ~277 lines, within the 300-line budget. If tight, context types can use compact single-line field definitions.

### What this story does NOT do
- Does not implement the compiler functions (stories 24-2 through 24-5)
- Does not create or modify XState machine definitions (epic 25)
- Does not change runtime behavior — this is purely a type refactoring story
- Does not remove the old context type names (backward compat aliases kept)

## Verification Requirements

- [ ] All acceptance criteria verified via Docker-based blind verification
- [ ] Proof document at `verification/24-1-shared-types-module-proof.md`
- [ ] Evidence is reproducible

## Documentation Requirements

- [ ] Per-subsystem AGENTS.md updated for any new/changed modules
- [ ] Exec-plan created at `docs/exec-plans/active/24-1-shared-types-module.md`
- [ ] Inline code documentation for new public APIs

## Testing Requirements

- [ ] Tests written for all new code
- [ ] Project-wide test coverage at 100%
- [ ] All tests passing

</story-spec>
