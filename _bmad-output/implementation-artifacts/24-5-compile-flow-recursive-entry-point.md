<story-spec>

# Story 24-5: compileFlow top-level recursive entry point

Status: draft

## Story

As a developer,
I want `compileFlow(steps, tasks)` to chain compiled steps into a sequential machine config where each state transitions to the next,
So that a list of heterogeneous steps (plain tasks, gates, for_each blocks) becomes a single machine config with `initial: 'step_0'` and a terminal `done` state.

## Context

**Epic 24: Workflow Compiler** — this is story 5 of 5, the final story. Stories 24-1 (shared types), 24-2 (compile plain task steps), 24-3 (compile gate blocks), and 24-4 (compile for_each blocks) are complete. This story implements the top-level orchestration function that ties all three compilation primitives together into a sequential machine config.

**Current state:** `src/lib/workflow-compiler.ts` (293 lines) contains:
- `compileStep()` (from story 24-2): compiles a single task string into an invoke state
- `compileGate()` (from story 24-3): compiles a gate block into a compound negotiation state
- `compileForEach()` (from story 24-4): compiles a for_each block into a compound iteration state

All three exist but nothing orchestrates them. `compileFlow` is the glue — it takes a mixed array of `FlowStep` items (strings, `GateConfig`, `ForEachConfig`) and produces a sequential machine config where `step_0 → step_1 → … → step_N-1 → done`.

**Key architectural decisions (from architecture-xstate-engine.md):**
- Compiler signature: `compileFlow(steps: FlowStep[], tasks: TaskMap) → MachineConfig`
- Pure function — no I/O, no side effects (NFR6)
- Step type dispatch: `string` → `compileStep`, `GateConfig` → `compileGate`, `ForEachConfig` → `compileForEach`
- `workflow-compiler.ts` must remain ≤ 300 lines (NFR3/AD6)
- Empty steps → machine with only `done: { type: 'final' }`
- The file currently sits at 293 lines — budget is extremely tight (7 lines)

**File size constraint is the main risk.** Adding `compileFlow` (likely 15-25 lines) will push the file over 300 lines. The shared step-chaining pattern already appears in three places:
1. `compileGate.buildPhaseStates()` — chains check/fix tasks sequentially
2. `compileForEach` — chains processItem steps sequentially
3. `compileFlow` (this story) — chains top-level steps sequentially

Extracting a shared `compileSteps()` helper that all three use will both reduce duplication and reclaim line budget.

**Dependencies:** Stories 24-1 through 24-4 complete. The `FlowStep` type union, `isGateConfig()`, and `isForEachConfig()` type guards exist in `workflow-types.ts`.

**Current test baseline:** Build exits 0. All tests passing.

**Review feedback from story 24-4 (carry forward):**
- The compiled error path can deadlock: `compileStep`'s fallback `onError` has no `target`, leaving the state active with no transition. Same exists in `compileGate`. `compileFlow` must NOT introduce deadlock-capable error paths.
- Gate tasks use gate name as storyKey — `compileFlow` must not repeat this; scope context flows through naturally.

## Acceptance Criteria

1. **Given** a workflow YAML file containing mixed step types, **When** `npm run build` is executed, **Then** the build exits 0 with zero TypeScript errors — the new `compileFlow` function compiles cleanly.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all tests pass with zero failures — no regressions from adding compileFlow logic.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. **Given** a test that compiles a mixed-step flow with steps `['create-story', 'implement', { gate: 'quality', ... }, 'document']`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled flow has four step states chained sequentially (`step_0` through `step_3`) plus a terminal `done` state, with `initial: 'step_0'`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*sequential.*step_0.*step_3.*done" or equivalent -->

4. **Given** a test that compiles a flow containing a gate block step, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the gate step is embedded as a compound state (with checking/evaluate/fixing substates) and its completion transitions to the next step in the chain.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*gate.*compound.*checking.*next" or equivalent -->

5. **Given** a test that compiles a flow containing a `for_each` block step, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the for_each step is embedded as a compound state (with processItem/checkNext/done substates) and its completion transitions to the next step in the chain.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*for_each.*processItem.*checkNext.*next" or equivalent -->

6. **Given** a test that compiles a flow with an empty steps array, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled flow contains only a `done` state with `type: 'final'` and `initial: 'done'` — empty flows resolve immediately.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*empty.*done.*final" or equivalent -->

7. **Given** a test that compiles a flow where one step references a task name not in the tasks map, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming an error is thrown at compile time with a message identifying the unknown task — not deferred to runtime.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*unknown.*task.*throws" or equivalent -->

8. **Given** a test that compiles a flow with a single plain task step, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled flow has exactly one step state (`step_0`) transitioning directly to `done` — no unnecessary intermediate states.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*single.*step.*done" or equivalent -->

9. **Given** a test that compiles the same flow config twice with identical inputs, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming both outputs are deeply equal — `compileFlow` is pure and deterministic.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*pure.*deterministic" or equivalent -->

10. **Given** a test that compiles a flow containing all three step types (plain task, gate, for_each) in a single steps array, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming each step type is dispatched correctly — plain tasks produce invoke states, gates produce compound negotiation states, for_each blocks produce compound iteration states — all chained sequentially.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*mixed.*invoke.*gate.*for_each" or equivalent -->

11. **Given** a test that compiles a flow with a nested structure (for_each containing steps that include a gate), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the recursive compilation works end-to-end — `compileFlow` delegates to `compileForEach` which delegates to `compileGate` within its processItem.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*recursive.*for_each.*gate" or equivalent -->

12. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `npx eslint src/lib/workflow-compiler.ts` is executed, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-compiler.ts` exits 0 -->

13. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `wc -l src/lib/workflow-compiler.ts` is executed, **Then** the file is ≤ 300 lines (per NFR3 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-compiler.ts` shows ≤ 300 -->

14. **Given** a test that compiles a flow containing a step with an unsupported type (e.g., a legacy `LoopBlock`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming an error is thrown at compile time with a descriptive message — unsupported step types are rejected explicitly.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileFlow.*unsupported.*loop.*throws" or equivalent -->

## Tasks / Subtasks

### T1: Extract shared `compileSteps` helper to reclaim line budget (AC: 13)

- The step-chaining pattern (iterate steps, dispatch by type, chain `step_0 → step_1 → … → done`) already exists in:
  - `compileGate.buildPhaseStates()` (lines 213-238) — chains check/fix task sequences
  - `compileForEach` (lines 270-278) — chains processItem's nested steps
- Extract a shared `compileSteps(steps: FlowStep[], tasks: Record<string, ResolvedTask>): Record<string, unknown>` helper
- This helper dispatches each step by type (`string` → `compileStep`, `GateConfig` → `compileGate`, `ForEachConfig` → `compileForEach`), chains them sequentially, and appends a terminal `done: { type: 'final' }`
- Refactor `compileGate` to use `compileSteps` for its check/fix phases (replacing `buildPhaseStates`)
- Refactor `compileForEach` to use `compileSteps` for its processItem states
- Net effect: reduce duplication by ~20-30 lines, making room for `compileFlow`
- Verify no regressions: `npm run build` and `npx vitest run` must pass after refactor

### T2: Implement `compileFlow` function (AC: 3, 4, 5, 6, 7, 8, 10, 14)

- Define `compileFlow(steps: FlowStep[], tasks: Record<string, ResolvedTask>): CompiledFlowConfig`
- Define `CompiledFlowConfig` type in `workflow-types.ts` (or reuse/extend existing compiled types): `{ initial: string; states: Record<string, unknown> }`
- Implementation:
  - If `steps.length === 0`: return `{ initial: 'done', states: { done: { type: 'final' } } }`
  - Otherwise: call `compileSteps(steps, tasks)` to get chained states, return `{ initial: 'step_0', states: chainedStates }`
- The function itself should be ~8-15 lines given the shared helper
- Export from `workflow-compiler.ts`

### T3: Handle unsupported step types (AC: 14)

- When a step in the array is neither `string`, `GateConfig`, nor `ForEachConfig`, throw a descriptive compile-time error
- This includes legacy `LoopBlock` (which has a `loop` property) — throw `Error('compileFlow: unsupported step type (legacy LoopBlock? migrate to for_each + gate format)')`
- This validation should live in `compileSteps` so it applies everywhere

### T4: Add comprehensive unit tests (AC: 3-11, 14)

- Create or extend `src/lib/__tests__/workflow-compiler.test.ts` with a `describe('compileFlow')` block
- Tests:
  - Mixed-step flow produces sequential states chained correctly (AC 3)
  - Gate step embedded as compound state with onDone targeting next step (AC 4)
  - ForEach step embedded as compound state with onDone targeting next step (AC 5)
  - Empty steps produce done-only config (AC 6)
  - Unknown task in steps array throws at compile time (AC 7)
  - Single step produces step_0 → done (AC 8)
  - Pure/deterministic: same inputs produce deeply equal outputs (AC 9)
  - All three step types in one flow dispatched correctly (AC 10)
  - Nested recursive compilation works end-to-end (AC 11)
  - Legacy LoopBlock step throws descriptive error (AC 14)
- All tests use structural assertions on the returned config object
- Use the same `makeTask` / `makeTasks` helpers pattern from existing compiler tests

### T5: Verify build, lint, and file size (AC: 1, 2, 12, 13)

- `npm run build` exits 0
- `npx eslint src/lib/workflow-compiler.ts` exits 0
- `wc -l src/lib/workflow-compiler.ts` ≤ 300 lines
- `npx vitest run` — all tests pass, zero regressions

## Dev Notes

### compileFlow is the composition root for the compiler

`compileFlow` is the function that `workflow-runner.ts` (story 25) will call to convert parsed YAML into a machine config. It's the public API of the compiler module. All other `compile*` functions are implementation details that `compileFlow` delegates to.

### File size budget is the primary constraint

The file is at 293 lines. Adding `compileFlow` without refactoring will exceed 300 lines. The critical path is:

1. Extract `compileSteps` shared helper (T1) — this should save 20-30 lines by deduplicating the step-chaining loop from `compileGate.buildPhaseStates` and `compileForEach`
2. Then add `compileFlow` (T2) — only ~8-15 lines since it delegates to `compileSteps`
3. Net result should be under 300 lines

If the refactor doesn't save enough lines, additional options:
- Move re-exports (`export { isEngineError, isLoopBlock }`) to a barrel file
- Move `CompiledInvokeState`/`CompiledGateState`/`CompiledForEachState` interface definitions (already in `workflow-types.ts`)
- Tighten formatting of long `compileGate` lines

### compileSteps vs compileFlow distinction

- `compileSteps(steps, tasks) → Record<string, unknown>` — internal helper, returns a states object (`{ step_0: ..., step_1: ..., done: { type: 'final' } }`)
- `compileFlow(steps, tasks) → { initial: string; states: Record<string, unknown> }` — public API, wraps `compileSteps` output with `initial` property

This separation keeps the helper reusable by `compileGate` (for check/fix phases) and `compileForEach` (for processItem states).

### Step type dispatch within compileSteps

Each step dispatches by type:
- `typeof step === 'string'` → `compileStep(step, tasks, nextState)` — returns invoke state, already has target baked in
- `isGateConfig(step)` → `compileGate(step, tasks)` wrapped with `onDone: { target: nextState }` — compound state needs external transition
- `isForEachConfig(step)` → `compileForEach(step, tasks)` wrapped with `onDone: { target: nextState }` — compound state needs external transition
- Otherwise → throw descriptive error (unsupported step type)

Note: `compileStep` bakes the `nextState` into its `onDone.target`. `compileGate` and `compileForEach` produce compound states whose internal `done` (final) triggers the parent's `onDone`, which must be added by the caller with the correct `target`.

### Empty flow returns done-only config, does NOT throw

Unlike `compileForEach` (which throws on empty steps because iterating nothing is a config error), `compileFlow` with empty steps returns a valid machine config that resolves immediately. This supports legitimate use cases like an epic with no story-level steps.

### What this story does NOT do

- Does not implement `workflow-runner.ts` or the `runWorkflowActor()` function — that's a separate epic (25)
- Does not change runtime behavior of existing machines
- Does not implement `setup()` or `createMachine()` — those are machine-layer concerns
- Does not resolve YAML parsing — the parser produces `FlowStep[]` which is the input to `compileFlow`

### Known deadlock risk from review feedback

The code review on story 24-4 flagged that `compileStep`'s fallback `onError` branch has no `target`, potentially leaving a state active with no transition. This is a pre-existing issue in `compileStep` (story 24-2). `compileFlow` does NOT need to fix this — it's a separate defect to address. However, `compileFlow` must not introduce NEW deadlock paths.

## Verification Requirements

- [ ] All acceptance criteria verified via CLI commands (npm run build, npx vitest run, npx eslint, wc -l)
- [ ] Proof document at `verification/24-5-compile-flow-recursive-entry-point-proof.md`
- [ ] Evidence is reproducible — all verification commands can be re-run

## Documentation Requirements

- [ ] Inline JSDoc on `compileFlow` explaining parameters, return value, and chaining behavior
- [ ] Per-subsystem AGENTS.md updated if workflow-compiler scope changed
- [ ] Exec-plan created at `docs/exec-plans/active/24-5-compile-flow-recursive-entry-point.md`

## Testing Requirements

- [ ] Tests written for all new code (compileFlow chaining, empty flow, error cases, mixed types, recursion)
- [ ] All tests passing — zero regressions
- [ ] Test file ≤ 300 lines (per NFR3)

</story-spec>
