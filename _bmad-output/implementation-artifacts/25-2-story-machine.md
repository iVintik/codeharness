<story-spec>

# Story 25-2: Create story machine

Status: done

## Story

As a developer,
I want a `storyMachine` created via `setup()` + `createMachine()` that processes one story through compiled storyFlow steps (plain tasks, gates, for_each blocks),
So that each story is a real XState state machine with typed context, sequential step processing, gate invocation, and proper error/interrupt handling — replacing the imperative `storyFlowActor` approach.

## Context

**Epic 25: XState Machine Hierarchy** — this is story 2 of 5. Story 25-1 (gate machine) is complete: `gateMachine` exists in `workflow-gate-machine.ts` (236 lines) with `setup()` + `createMachine()`, typed `GateContext`/`GateOutput`, phase-level actors, 5 pure guards, 4 final states. All 14 ACs verified, 13 tests passing.

**What exists and is usable:**

- `workflow-gate-machine.ts` (236 lines): `gateMachine` with `GateOutput` type — the child machine this story machine will invoke for gate steps. Uses `checkPhaseActor`/`fixPhaseActor` internally.
- `workflow-types.ts` (282 lines): `StoryContext` (with `item`, `config`, `storyFlowTasks`, `workflowState`, `errors`, `tasksCompleted`, `halted`, `lastContract`, `accumulatedCostUsd`), `StoryFlowInput`, `StoryFlowOutput`, `GateContext`, `GateConfig`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `FlowStep`, all type guards (`isGateConfig`, `isForEachConfig`).
- `workflow-compiler.ts` (259 lines): `compileStep()` → `CompiledInvokeState`, `compileGate()` → `CompiledGateState`, `compileForEach()` → `CompiledForEachState`, `compileFlow()` → sequential machine config. Step-level `onDone` assigns use `stepOnDoneAssign`. Error chain: `isAbortError` → interrupted, `isHaltError` → halted, fallback → record error.
- `workflow-actors.ts`: `dispatchTaskCore()`, `nullTaskCore()` — the async I/O functions.
- `workflow-machines.ts` (397 lines): Current imperative `storyFlowActor` (lines 196-246) — the legacy approach this story replaces. Also contains `loopMachine`, `epicMachine`, `runMachine`.
- `circuit-breaker.ts`: `evaluateProgress()` — used by gate machine, not directly by story machine.

**What this story builds:**

A real XState machine definition in `workflow-story-machine.ts` (new file, following gate machine's pattern) that:
1. Uses `setup()` + `createMachine()` with typed `StoryContext` input and `StoryFlowOutput` output
2. Registers actors: `dispatchActor` (fromPromise wrapping `dispatchTaskCore`), `nullTaskActor` (fromPromise wrapping `nullTaskCore`), `gateMachine` (for gate steps)
3. Implements pure guards: `isAbortError`, `isHaltError`
4. Processes storyFlow steps sequentially: plain tasks via dispatch/null actors, gates via `gateMachine` invocation
5. Handles `INTERRUPT` event at machine level → `interrupted` final state
6. Merges gate output into story context via `assign` on `onDone`
7. Returns story result (updated state, errors, cost, contract, halted flag) as machine output
8. Emits `story-done` event via `config.onEvent` when all steps complete without halt

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD2: Separate machines invoked as children. Story machine receives typed input, returns typed output. Parent (epicMachine) merges via `assign` on `onDone`.
- Pattern 1: Always `setup()` + `createMachine()`.
- Pattern 2: `assign()` with immutable updates.
- Pattern 5: Every invoke handles both `onDone` and `onError`. Every `onError` checks `isAbortError` first.
- AD4: `on: { INTERRUPT: '.interrupted' }` at every machine level.
- Context flow: StoryFlowInput in, StoryFlowOutput out. Parent picks from story context, story picks from gate output.

**Dependencies:** Story 25-1 (gate machine) complete. Epics 21-24 complete.

## Acceptance Criteria

1. [x] **Given** the codebase after implementation, **When** `npm run build` is executed in the project root, **Then** it exits with code 0 and produces no TypeScript errors in the terminal output.
   <!-- verification: `npm run build` exits 0 -->

2. [x] **Given** the full test suite, **When** `npx vitest run` is executed in the project root, **Then** the summary line shows zero failures and all tests pass — no regressions from adding the story machine.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. [x] **Given** a test that creates and starts a story machine with a single plain task step configured to succeed, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `done` final state and the task was dispatched exactly once.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*machine.*done" or "story.*single.*task" -->

4. [x] **Given** a test that creates and starts a story machine with three plain task steps in sequence, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming all three tasks were dispatched in order and the machine reaches `done` with `tasksCompleted` equal to 3.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*sequential" or "story.*three.*steps" -->

5. [x] **Given** a test that creates and starts a story machine with a gate step where all check tasks pass, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the gate was invoked, the gate passed, and the machine reaches `done` — the story machine correctly delegates to the gate machine.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*gate.*pass" or "story.*gate.*done" -->

6. [x] **Given** a test that creates and starts a story machine with a gate step that halts (e.g., max retries exceeded), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `halted` final state and the gate's output (errors, halted flag) is merged into the story context.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*gate.*halt" or "story.*gate.*maxed" -->

7. [x] **Given** a test that creates and starts a story machine where a plain task dispatch throws a halt error (e.g., `RATE_LIMIT`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine transitions to `halted` and the error is recorded in context.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*halt.*error" or "story.*RATE_LIMIT" -->

8. [x] **Given** a test that creates and starts a story machine and then sends an `INTERRUPT` event, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `interrupted` final state.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*interrupted" or "story.*INTERRUPT" -->

9. [x] **Given** a test that creates and starts a story machine with a null task step (agent: null), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the null task was dispatched through the null task actor path, not the agent dispatch actor.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*null.*task" or "story.*nullTask" -->

10. [x] **Given** a test that creates a story machine and runs it to completion with all steps succeeding, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine output includes updated `workflowState`, accumulated `errors`, `tasksCompleted` count, `lastContract`, `accumulatedCostUsd`, and `halted` flag — matching the `StoryFlowOutput` type.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*output" or "story.*result" -->

11. [x] **Given** a test that creates a story machine with a mix of plain task, gate, and plain task steps in sequence, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine processes task → gate → task in order, the gate output is merged into the story context, and subsequent tasks receive the updated context.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*mixed.*steps" or "story.*task.*gate.*task" -->

12. [x] **Given** the story machine definition file, **When** `npx eslint` is run against it, **Then** it exits with code 0 and produces no lint errors.
    <!-- verification: `npx eslint src/lib/workflow-story-machine.ts` exits 0 -->

13. [x] **Given** the story machine definition file, **When** its line count is checked, **Then** it contains <= 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-story-machine.ts` shows <= 300 -->

14. [x] **Given** the story machine source file, **When** its imports are inspected, **Then** it does not import from `workflow-runner.ts`, `workflow-visualizer.ts`, or `workflow-persistence.ts` — boundary rules are respected.
    <!-- verification: `grep "from.*workflow-runner\|from.*workflow-visualizer\|from.*workflow-persistence" src/lib/workflow-story-machine.ts` returns no matches -->

15. [x] **Given** a test that creates a story machine where a plain task throws a non-halt error, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the error is recorded in the context `errors` array and the machine transitions to `halted` (story-level errors halt the story, unlike gate-level where non-halt errors allow continuation).
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "story.*non-halt.*error" or "story.*error.*recorded" -->

## Tasks / Subtasks

### T1: Define story machine actors

- `dispatchActor`: `fromPromise` wrapping `dispatchTaskCore` — takes `DispatchInput`, returns `DispatchOutput`
- `nullTaskActor`: `fromPromise` wrapping `nullTaskCore` — takes `NullTaskInput`, returns `DispatchOutput`
- Reuse from `workflow-actors.ts` if already exported as `fromPromise` actors, or create new wrappers in the story machine file (same pattern as gate machine)
- Import `gateMachine` from `workflow-gate-machine.ts` for gate step invocation

### T2: Define story machine guards

- `isAbortError`: returns true when error is `AbortError` instance (`event.error?.name === 'AbortError'`)
- `isHaltError`: returns true when error is `DispatchError` with halt code (`RATE_LIMIT`, `NETWORK`, `SDK_INIT`)
- All guards are pure functions: event/context in, boolean out. No I/O, no side effects.

### T3: Build story step processor

The story machine needs to process compiled storyFlow steps. Two approaches:

**Approach A — Phase-level actor (like gate machine):** A single `storyStepActor` (`fromPromise`) that processes all steps sequentially in one actor invocation. The machine has a simple structure: `processing` → `done` | `halted` | `interrupted`. This is the pattern used by the gate machine's `checkPhaseActor`/`fixPhaseActor`.

**Approach B — Per-step XState states:** Use the compiler output to generate per-step invoke states. The story machine would have `step_0` → `step_1` → ... → `done` with each step being an invoke state.

Recommend **Approach A** for consistency with gate machine pattern and simplicity. The phase actor handles:
- Iterating through `config.workflow.storyFlow` steps
- Plain string steps: dispatch via `dispatchTaskCore` or `nullTaskCore`
- Gate steps (`isGateConfig`): create and run `gateMachine` as a child actor, merge `GateOutput` into story context
- Abort/halt error propagation: throw to machine level for guard-based transitions
- `onEvent` callback for story-done emission

### T4: Create the story machine with `setup()` + `createMachine()`

- Use `setup({ types, guards, actors })` pattern
- Type the machine: `types: {} as { context: StoryContext; input: StoryFlowInput; output: StoryFlowOutput }`
- Register guards from T2 and actors from T1
- Machine ID: `'story'`
- Context initialized from input: `context: ({ input }) => ({ ...input, errors: [], tasksCompleted: 0, halted: false })`
- Add top-level `on: { INTERRUPT: '.interrupted' }` for two-phase interrupt
- States:
  - `processing`: invoke `storyStepActor`, input from context
    - `onDone`: target `done`, assign output
    - `onError`: chain: `isAbortError` → interrupted, `isHaltError` → halted (with error), fallback → halted (with error)
  - `done`: `{ type: 'final' }`
  - `halted`: `{ type: 'final' }` — entry assigns `halted: true`
  - `interrupted`: `{ type: 'final' }` — entry assigns `halted: true`

### T5: Implement story step actor

- `fromPromise` actor that receives `StoryContext` (or a subset) as input
- Iterates through `config.workflow.storyFlow` steps sequentially
- For each step:
  - Check `signal.aborted` — throw AbortError if true
  - If `isGateConfig(step)`: build `GateContext`, create `gateMachine` actor, run to completion, merge `GateOutput` (errors, state, cost, contract, halted flag). If gate halted, stop processing.
  - If `typeof step === 'string'`: resolve task from `config.workflow.tasks`, dispatch via `dispatchTaskCore` (agent task) or `nullTaskCore` (null task). Update state, contract, cost, tasksCompleted.
  - If dispatch throws: rethrow abort/halt errors for machine-level handling. Record non-halt errors and halt the story.
- On successful completion: emit `story-done` via `config.onEvent`
- Returns `StoryContext` with accumulated results

### T6: Define input/output types

- Input: `StoryFlowInput` (already defined in workflow-types.ts) — `Pick<StoryContext, 'item' | 'config' | 'workflowState' | 'lastContract' | 'accumulatedCostUsd' | 'storyFlowTasks'>`
- Output: `StoryFlowOutput` (already defined) — `Pick<StoryContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>`
- Context initialization in machine: spread input + add `errors: []`, `tasksCompleted: 0`, `halted: false`
- Machine output function: extract `StoryFlowOutput` fields from context

### T7: Gate invocation within story step actor

When the story step actor encounters a `GateConfig` step:
1. Build `GateContext` from current story state:
   ```typescript
   {
     gate: gateConfig,
     config: ctx.config,
     workflowState: ctx.workflowState,  // reset iteration/scores/cb for fresh gate
     errors: [],
     tasksCompleted: 0,
     halted: false,
     lastContract: ctx.lastContract,
     accumulatedCostUsd: ctx.accumulatedCostUsd,
     verdicts: {},
     parentItemKey: ctx.item.key,
   }
   ```
2. Reset gate-specific state: `iteration: 0`, `evaluator_scores: []`, `circuit_breaker: { triggered: false, ... }`
3. Create `gateMachine` actor with input, run to completion
4. Merge `GateOutput` back: errors, workflowState, tasksCompleted, lastContract, accumulatedCostUsd, halted

### T8: Write comprehensive unit tests

- Test: single plain task → `done` final state, task dispatched once
- Test: three sequential tasks → `done`, all dispatched in order, `tasksCompleted === 3`
- Test: gate step with all-pass verdicts → gate passes, story reaches `done`
- Test: gate step that halts (maxRetries) → story reaches `halted`, gate output merged
- Test: halt error from dispatch → `halted` state, error recorded
- Test: INTERRUPT event → `interrupted` final state
- Test: null task step uses `nullTaskCore` path
- Test: machine output matches `StoryFlowOutput` shape
- Test: mixed steps (task → gate → task) processed in order with context flow
- Test: non-halt error from dispatch → error recorded, story halted
- Use mocked actors (same pattern as gate machine tests: `vi.mock` for `dispatchTaskCore`/`nullTaskCore`)
- Use `createActor` + `waitFor` for machine execution

### T9: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint src/lib/workflow-story-machine.ts` exits 0
- `wc -l src/lib/workflow-story-machine.ts` <= 300 lines
- `npx vitest run` — all tests pass, zero regressions
- `grep` boundary check: no imports from runner/visualizer/persistence

## Dev Notes

### The story machine processes compiled steps, not raw YAML

The story machine reads `config.workflow.storyFlow` — an array of `FlowStep` values. Each is either a `string` (task name), a `GateConfig` (gate block), or a `ForEachConfig` (nested iteration — not expected at story level in v1). The story machine uses type guards (`isGateConfig`) to determine dispatch strategy.

### Gate invocation pattern

Unlike the gate machine which implements the full check/fix cycle internally, the story machine delegates to `gateMachine` for gate steps. The story step actor creates a `gateMachine` child actor, runs it to completion, and merges the `GateOutput` back into story context. This matches AD2: separate machines invoked as children.

Key: reset gate-related workflow state before each gate invocation:
```typescript
const gateWorkflowState = {
  ...ctx.workflowState,
  iteration: 0,
  evaluator_scores: [],
  circuit_breaker: { triggered: false, reason: null, score_history: [] },
};
```
This ensures each gate starts fresh (same pattern as current `storyFlowActor` lines 206-208).

### Error handling differs from gate machine

At the gate level, non-halt dispatch errors are recorded and execution continues (the gate may still pass on subsequent checks). At the story level, ANY dispatch error halts the story — there's no retry mechanism at story level. The story machine should:
- Abort errors → `interrupted` (same as gate)
- Halt errors → `halted` (same as gate)
- Non-halt errors → record in context, halt story (different from gate — story has no recovery path for task failures)

This matches the current `storyFlowActor` behavior (line 241: any dispatch error triggers `break`).

### File organization

Following gate machine pattern: new file `src/lib/workflow-story-machine.ts`. Expected ~150-200 lines. Gate machine is 236 lines; story machine should be similar or smaller since it delegates gate logic to the gate machine.

### What this story does NOT do

- Does not implement epic machine refactor (story 25-3)
- Does not replace `storyFlowActor` usage in `epicStepActor` — that wiring happens when epic machine is refactored
- Does not implement for_each within story flow — no current workflow uses nested `for_each` at story level
- Does not implement persistence, visualization, or run-level concerns
- Does not modify `workflow-compiler.ts` — the compiler is done

### Test strategy

Same mocking pattern as gate machine tests:
- Mock `workflow-actors.ts` exports: `dispatchTaskCore`, `nullTaskCore`
- Mock `agent-dispatch.js`: `DispatchError`
- Mock `output.js`: `warn`
- Use real `gateMachine` import (it will use the mocked actors internally)
- Create `StoryFlowInput` fixtures with configured tasks and storyFlow steps
- Assert final state via `actor.getSnapshot().value`
- Assert context/output via `actor.getSnapshot().output`

### Relationship to existing code

The current `storyFlowActor` (workflow-machines.ts:196-246) is an imperative `fromPromise` actor that does the same thing this story machine does, but without proper XState state management. After this story, both will coexist — the old one used by `epicStepActor`, the new one ready for story 25-3 to wire into the refactored epic machine.

</story-spec>
