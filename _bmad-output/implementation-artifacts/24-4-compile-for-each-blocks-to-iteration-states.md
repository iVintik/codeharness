<story-spec>

# Story 24-4: Compile for_each blocks to iteration states

Status: draft

## Story

As a developer,
I want `compileForEach(config, tasks)` to return a compound XState state config with a `processItem → checkNext → processItem | done` iteration cycle,
So that `for_each` blocks are real state machine structures with a guard controlling continuation — not imperative for-loops.

## Context

**Epic 24: Workflow Compiler** — this is story 4 of 5. Stories 24-1 (shared types), 24-2 (compile plain task steps), and 24-3 (compile gate blocks) are complete. This story implements the for_each compilation primitive: turning a `ForEachConfig` into a compound XState state with child states that implement the AD4 iteration pattern (`processItem → checkNext → processItem | done`).

**Current state:** `src/lib/workflow-compiler.ts` (296 lines) contains `compileStep()` (from story 24-2) and `compileGate()` (from story 24-3). It has no for_each compilation logic. The current `workflow-machines.ts` uses an imperative `epicMachine`/`runMachine` that manually iterates items with index tracking. `compileForEach` will replace this imperative approach with a declarative compound state config.

**What exists and is usable:**
- `workflow-types.ts` (262 lines): All shared types including `ForEachConfig` (`{ for_each: string; steps: FlowStep[] }`), `StoryContext`, `EpicContext`, `RunContext`, `FlowStep`, `ResolvedTask`
- `workflow-compiler.ts`: `compileStep()` compiles individual tasks to invoke states, `compileGate()` compiles gate blocks to compound negotiation states — `compileForEach` will call both for nested steps
- `isForEachConfig()` type guard in `workflow-types.ts`
- `isGateConfig()` type guard for detecting gates within nested steps
- `workflow-actors.ts`: `dispatchActor` and `nullTaskDispatchActor` exported
- Default YAML (`templates/workflows/default.yaml`) shows nested for_each: `for_each: epic` containing `for_each: story` containing tasks and gates

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD1: `for_each` → compound state: `processItem → checkNext → processItem | done` (AD4 iteration pattern)
- AD1: Compiler is pure — YAML in, MachineConfig out. No I/O, no side effects. `compileForEach` is recursive.
- AD4: `checkNext` uses guard `hasMoreItems`: if true → `processItem` with `assign` incrementing index, default → `done` (final)
- AD4: The child flow inside `processItem` is compiled recursively from nested steps
- AD6: `workflow-compiler.ts` ≤ 300 lines, zero imports from actors/machines/runner/persistence

**Target compound state structure (from epic story 2.4 + AD4):**
```
compileForEach(config, tasks) → {
  initial: 'processItem',
  states: {
    processItem: {
      /* compiled child flow from config.steps — invoked as child machine or inline compound state */
      onDone: { target: 'checkNext' }
    },
    checkNext: {
      always: [
        { guard: 'hasMoreItems', target: 'processItem', actions: assign(/* increment index */) },
        { target: 'done' }
      ]
    },
    done: { type: 'final' }
  }
}
```

**Dependencies:** Stories 24-1, 24-2, 24-3 complete. `compileStep` and `compileGate` are available. `ForEachConfig` and related types exist.

**Current test baseline:** Build exits 0. All tests passing.

**Review feedback from story 24-3 (must address):**
- Gate tasks compiled with gate name as `storyKey` instead of the actual story identifier — `compileForEach` must NOT repeat this pattern. The iteration scope identifier (e.g., `'story'`, `'epic'`) must flow through context, not be hardcoded as a task key.
- Gate never advances retry state and never clears verdicts between cycles — `compileForEach` must correctly increment the iteration index on each cycle via `assign` in `checkNext`.

## Acceptance Criteria

1. **Given** a workflow YAML file containing nested `for_each` blocks, **When** `npm run build` is executed, **Then** it exits 0 with zero TypeScript errors — the new `compileForEach` function compiles cleanly.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all tests pass with zero failures — no regressions from adding for_each compiler logic.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. **Given** a test that compiles a `for_each: story` config with steps `['create-story', 'implement']`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled for_each has a `processItem` child state that contains a compiled flow from the nested steps — the nested steps appear as invoke states within the processItem phase.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*processItem.*steps" or equivalent -->

4. **Given** a test that compiles a `for_each` config, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled for_each has a `checkNext` child state with guard-based transitions: `hasMoreItems` → `processItem` (with index increment action), and a default fallback → `done`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*checkNext.*hasMoreItems.*guard" or equivalent -->

5. **Given** a test that compiles a `for_each` config, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled for_each has a `done` child state with `type: 'final'` — signaling iteration completion to the parent machine.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*done.*final" or equivalent -->

6. **Given** a test that compiles a `for_each: story` config with steps containing a gate block `{ gate: 'quality', check: ['check'], fix: ['retry'], ... }`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the gate block within processItem is compiled as a compound negotiation state (with checking/evaluate/fixing substates) — `compileForEach` delegates to `compileGate` for gate steps.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*gate.*checking.*evaluate" or equivalent -->

7. **Given** a test that compiles a nested `for_each` (e.g., `for_each: epic` containing `for_each: story`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the inner `for_each` is compiled recursively — the processItem of the outer for_each contains another compound iteration state with its own processItem/checkNext/done structure.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*nested.*recursive.*processItem" or equivalent -->

8. **Given** a test that compiles a `for_each` block where a nested step references a task name not in the tasks map, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming an error is thrown at compile time — not deferred to runtime.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*unknown.*throws" or equivalent -->

9. **Given** a test that compiles a `for_each` config with a single step `['implement']`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the processItem phase has exactly one invoke state (not a sequential chain) — single-step optimization.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*single.*step" or equivalent -->

10. **Given** a test that compiles the same `for_each` config twice with identical inputs, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming identical outputs — `compileForEach` is pure and deterministic with no side effects.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*pure.*deterministic" or equivalent -->

11. **Given** a test that compiles a `for_each` config with an empty steps array, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming either an error is thrown at compile time or the compiled state goes directly to `done` — empty iteration is handled explicitly, not silently ignored.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*empty.*steps" or equivalent -->

12. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `npx eslint src/lib/workflow-compiler.ts` is executed, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-compiler.ts` exits 0 -->

13. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `wc -l src/lib/workflow-compiler.ts` is executed, **Then** the file is ≤ 300 lines (per NFR3 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-compiler.ts` shows ≤ 300 -->

14. **Given** a test that compiles a `for_each` config, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the `checkNext` state's `hasMoreItems` transition includes an `assign` action — the index is incremented as part of the guard-true transition, not as a separate step.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileForEach.*checkNext.*assign.*index" or equivalent -->

## Tasks / Subtasks

### T1: Design the `compileForEach` function signature and return type

- Define `compileForEach(config: ForEachConfig, tasks: Record<string, ResolvedTask>): CompiledForEachState`
- The return type is a compound XState `StateNodeConfig` with child states (processItem, checkNext, done)
- Define `CompiledForEachState` interface (or extend existing pattern) to represent the compound state shape
- The function must be exported from `workflow-compiler.ts`

### T2: Implement the `processItem` child state

- The processItem phase contains a compiled child flow from `config.steps`
- For N steps, create N states chained sequentially: `step_0` → `step_1` → ... → `step_N-1` → `done` (internal done of processItem)
- Each step is compiled by dispatching on type:
  - `string` → `compileStep(step, tasks, nextState)`
  - `GateConfig` → `compileGate(gate, tasks)` embedded as compound state with `onDone` targeting next step
  - `ForEachConfig` → recursive `compileForEach(config, tasks)` embedded as compound state with `onDone` targeting next step
- processItem is itself a compound state with `initial: 'step_0'` and `onDone: { target: 'checkNext' }`
- The internal `done` state is `{ type: 'final' }` to signal completion of one iteration

### T3: Implement the `checkNext` child state

- The checkNext state uses `always` transitions with a guard (no invoke, immediate evaluation)
- Guard chain:
  1. `{ guard: 'hasMoreItems', target: 'processItem', actions: assign(/* increment currentIndex */) }` — more items to process
  2. `{ target: 'done' }` — default fallback, iteration complete
- Guard name is a string — implementation provided at `setup()` time by the machine layer
- The `assign` action increments `currentIndex` (or equivalent field) in the for_each context
- The assign also resets per-item state (e.g., clears lastContract, resets item reference to next item)

### T4: Implement the `done` final state

- `done: { type: 'final' }` — iteration complete, signals parent machine
- When the for_each compound state reaches `done`, its parent's `onDone` fires

### T5: Implement compile-time validation

- If `config.steps` is empty, throw a descriptive error (or produce a state that goes directly to `done` — decide and document)
- If any nested step references a task name not in `tasks` map, throw at compile time (delegated to `compileStep` / `compileGate`)
- For nested `for_each` blocks, validation is recursive — errors bubble up
- Use plain `Error` (not `WorkflowError` — that's for runtime errors)

### T6: Implement recursive compilation for nested for_each

- When a step in `config.steps` is itself a `ForEachConfig`, call `compileForEach` recursively
- The recursive call produces a compound state that is embedded within processItem's step chain
- Ensure the recursive output has `onDone` targeting the next step in the chain
- Test with at least 2 levels of nesting (epic → story)

### T7: Factor out step chaining helper (if needed for file size)

- The pattern of chaining N steps sequentially (step_0 → step_1 → ... → done) is shared between:
  - `compileForEach` processItem (this story)
  - `compileGate` checking/fixing phases (story 24-3)
  - `compileFlow` top-level (story 24-5)
- If the file approaches 300 lines, extract a `chainSteps()` helper that all three can use
- Alternatively, if compileGate already has an inline `buildPhaseStates()`, consider extracting it as a shared helper

### T8: Add comprehensive unit tests

- Create or extend `src/lib/__tests__/workflow-compiler.test.ts`
- Test: for_each with multiple plain steps produces processItem with sequential substates
- Test: checkNext has hasMoreItems guard → processItem, default → done
- Test: done state is `{ type: 'final' }`
- Test: nested gate block within steps is compiled via compileGate
- Test: nested for_each (recursive) produces nested processItem/checkNext/done
- Test: unknown task in nested steps throws at compile time
- Test: single step produces one invoke in processItem
- Test: pure/deterministic — same inputs produce same outputs
- Test: empty steps handled explicitly (error or direct-to-done)
- Test: checkNext assign action increments index
- All tests use structural assertions on the returned config object

### T9: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint src/lib/workflow-compiler.ts` exits 0
- `wc -l src/lib/workflow-compiler.ts` ≤ 300 lines
- `npx vitest run` — all tests pass, zero regressions

## Dev Notes

### compileForEach produces a compound state config, not a machine instance

`compileForEach` returns a plain object describing a compound XState state node with child states. It does NOT call `setup()` or `createMachine()`. The returned config will be embedded into a parent machine config by `compileFlow` (story 24-5) or the machine layer.

### AD4 iteration pattern: processItem → checkNext → processItem | done

This is the canonical XState pattern for iterating over a dynamic collection. The `hasMoreItems` guard reads from context (e.g., `context.currentIndex < context.items.length`). The actual guard implementation is provided at `setup()` time — the compiler only emits the guard name string.

The index increment happens as an `assign` action on the `hasMoreItems` → `processItem` transition. This is critical: the index MUST be incremented BEFORE re-entering processItem, otherwise the same item is processed forever.

### Recursive compilation

`compileForEach` must handle nested `for_each` blocks by calling itself recursively. For the default YAML workflow:
```yaml
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - create-story
        - implement
        - gate: quality
          ...
```

The outer `compileForEach({ for_each: 'epic', steps: [...] })` encounters an inner `ForEachConfig` as the first step, and calls `compileForEach({ for_each: 'story', steps: [...] })` recursively. The inner call encounters `'create-story'` (plain task → `compileStep`), `'implement'` (plain task → `compileStep`), and `gate: quality` (gate → `compileGate`).

### Step type dispatch within processItem

Each step in `config.steps` must be dispatched by type:
- `typeof step === 'string'` → `compileStep(step, tasks, nextState)`
- `isGateConfig(step)` → `compileGate(step, tasks)` wrapped with `onDone: { target: nextState }`
- `isForEachConfig(step)` → `compileForEach(step, tasks)` wrapped with `onDone: { target: nextState }`
- `isLoopBlock(step)` → not handled in this story (legacy format, can throw or skip)

The `compileGate` and `compileForEach` outputs are compound states, not invoke states. They need different wrapping than `compileStep` output. The compound state's internal `done` final state triggers the parent's `onDone`, which targets the next step.

### File size budget — CRITICAL

The current file is 296 lines — only 4 lines under the 300-line NFR. Adding `compileForEach` (likely 40-60 lines) will exceed this. Options:
1. **Extract `buildPhaseStates()` from `compileGate`** into a shared `chainSteps()` helper that both `compileGate` and `compileForEach` use — saves ~15-20 lines in compileGate
2. **Extract `CompiledGateState` and `CompiledInvokeState` interfaces** to `workflow-types.ts` — saves ~5 lines
3. **Tighten existing code** — the compileGate `buildPhaseStates` inner function has long lines that could be compressed or refactored
4. **Move re-exports** (`export { isEngineError, isLoopBlock }` etc.) to a barrel file

The most likely approach: extract a shared `compileSteps(steps, tasks)` helper that chains any mix of plain/gate/forEach steps into sequential states, then `compileGate` uses it for checking/fixing and `compileForEach` uses it for processItem. This is also needed by `compileFlow` in story 24-5.

### Scope field (`for_each: 'epic'` vs `for_each: 'story'`)

The `config.for_each` string (`'epic'`, `'story'`) identifies what collection to iterate over. The compiler does NOT resolve the collection — it just produces a compound state that assumes items are provided in context. The machine layer (epic 25) resolves the scope string to actual items at runtime. The compiler may embed the scope string as metadata in the state config for the machine layer to read.

### What this story does NOT do

- Does not implement `compileFlow` to chain top-level steps (story 24-5)
- Does not implement the `hasMoreItems` guard function — that's a machine-layer concern
- Does not resolve what items to iterate over (epic items, story items) — the machine layer does this
- Does not change runtime behavior of existing machines — this adds new functions alongside existing ones
- Does not implement parallel iteration (sequential only per AD4)
- Does not implement `LoopBlock` compilation (legacy format)

## Verification Requirements

- [ ] All acceptance criteria verified via CLI commands (npm run build, npx vitest run, npx eslint, wc -l)
- [ ] Proof document at `verification/24-4-compile-for-each-blocks-to-iteration-states-proof.md`
- [ ] Evidence is reproducible — all verification commands can be re-run

## Documentation Requirements

- [ ] Inline JSDoc on `compileForEach` explaining parameters, return value, and compound state structure
- [ ] Per-subsystem AGENTS.md updated if workflow-compiler scope changed
- [ ] Exec-plan created at `docs/exec-plans/active/24-4-compile-for-each-blocks-to-iteration-states.md`

## Testing Requirements

- [ ] Tests written for all new code (compileForEach processItem, checkNext guard, recursive nesting, gate integration, validation)
- [ ] All tests passing — zero regressions
- [ ] Test file ≤ 300 lines (per NFR3)

</story-spec>
