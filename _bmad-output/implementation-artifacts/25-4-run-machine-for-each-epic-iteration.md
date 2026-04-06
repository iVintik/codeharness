<story-spec>

# Story 25-4: Run machine with for_each epic iteration

Status: complete

## Story

As a developer,
I want a `runMachine` created via `setup()` + `createMachine()` that iterates epics via the AD4 for_each pattern (`processEpic → checkNextEpic → processEpic | allDone`) with typed `RunContext` input and `RunOutput` output,
So that the top-level orchestrator is a real XState state machine with typed context, for_each iteration over epics via `epicMachine` invocation, proper error/interrupt handling, and `onEvent` callbacks — replacing the imperative `runEpicActor` + `runMachine` approach in `workflow-machines.ts`.

## Context

**Epic 25: XState Machine Hierarchy** — this is story 4 of 5. Stories 25-1 (gate machine), 25-2 (story machine), and 25-3 (epic machine) are complete.

**What exists and is usable:**

- `workflow-epic-machine.ts` (255 lines): `epicMachine` with `EpicOutput` type — the child machine this run machine invokes for each epic group. Uses `epicStoryActor`, `epicStepActor`, typed `EpicContext`/`EpicOutput`, 3 final states (`done`, `halted`, `interrupted`). Fully working, tested (15 tests).
- `workflow-story-machine.ts` (222 lines): `storyMachine` with `StoryFlowOutput` — invoked by `epicMachine` for each story. Complete.
- `workflow-gate-machine.ts` (236 lines): `gateMachine` with `GateOutput` — invoked by `epicMachine` for gate steps. Complete.
- `workflow-types.ts` (282 lines): `RunContext` (with `config`, `storyFlowTasks`, `epicEntries`, `currentEpicIndex`, `workflowState`, `errors`, `tasksCompleted`, `storiesProcessed`, `lastContract`, `accumulatedCostUsd`, `halted`), `RunMachineContext = RunContext`, `EpicContext`, `EpicMachineContext = EpicContext`, all type guards.
- `workflow-machines.ts` (397 lines): Current imperative `runEpicActor` (lines 345-369) + `runMachine` (lines 371-396) — the legacy approach this story replaces. Also contains `epicStepActor` (lines 248-316), `epicMachine` (lines 318-343), `storyFlowActor` (lines 196-246), `loopMachine`, `executeLoopBlock`, `collectGuideFiles`/`cleanupGuideFiles`.
- `workflow-runner.ts` (156 lines): `runWorkflowActor()` — the composition root that creates `runMachine` and runs it. Currently imports `runMachine` from `workflow-machines.ts`. After this story, it will import from the new `workflow-run-machine.ts`.
- `workflow-actors.ts`: `dispatchTaskCore()`, `nullTaskCore()` — async I/O functions.

**What this story builds:**

A new file `src/lib/workflow-run-machine.ts` (following gate/story/epic machine patterns) that:
1. Uses `setup()` + `createMachine()` with typed `RunContext` input and `RunOutput` output
2. Implements the AD4 for_each iteration pattern for epics: `processEpic → checkNextEpic → (processEpic | allDone)`
3. Invokes `epicMachine` as a child for each epic entry, merging `EpicOutput` back into run context
4. Registers actors: `runEpicActor` (fromPromise wrapping `epicMachine` invocation for each epic), `epicMachine` (for iteration)
5. Implements pure guards: `hasMoreEpics`, `isAbortError`, `isHaltError`, `isHalted`
6. Handles `INTERRUPT` event at machine level → `interrupted` final state
7. Emits `dispatch-start` event for each epic via `config.onEvent`
8. Returns run result (updated state, errors, cost, storiesProcessed, contract, halted flag) as machine output

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD2: Separate machines invoked as children. Run machine receives typed input, returns typed output.
- AD4: `for_each` = iteration primitive. `processItem → checkNext → processItem | done` pattern. Guard `hasMoreItems` controls loop.
- AD4 interrupt: `on: { INTERRUPT: '.interrupted' }` at every machine level.
- Pattern 1: Always `setup()` + `createMachine()`.
- Pattern 2: `assign()` with immutable updates.
- Pattern 5: Every invoke handles both `onDone` and `onError`. Every `onError` checks `isAbortError` first.
- Context flow: RunInput in, RunOutput out. Parent picks from run context, run picks from epic output.

**Dependencies:** Stories 25-1, 25-2, 25-3 complete. Epics 21-24 complete.

## Acceptance Criteria

1. [x] **Given** the codebase after implementation, **When** `npm run build` is executed in the project root, **Then** it exits with code 0 and produces no TypeScript errors in the terminal output.
   <!-- verification: `npm run build` exits 0 -->

2. [x] **Given** the full test suite, **When** `npx vitest run` is executed in the project root, **Then** the summary line shows zero failures and all tests pass — no regressions from adding the run machine.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. [x] **Given** a test that creates and starts a run machine with one epic entry containing one story item, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the epic machine was invoked for that entry, the run machine reaches `allDone`, and `storiesProcessed` contains the story item key.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*single.*epic" or "run.*one.*epic.*done" -->

4. [x] **Given** a test that creates and starts a run machine with three epic entries each containing one story item, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the epic machine was invoked three times in order, `currentEpicIndex` advanced through 0→1→2, and the run machine reaches `allDone` with all story keys in `storiesProcessed`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*three.*epics" or "run.*sequential.*epics" -->

5. [x] **Given** a test that creates a run machine with two epic entries where the second epic halts, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the first epic completed, the second epic's halt propagated, the run machine reaches `halted`, and only the first epic's story keys are in `storiesProcessed` as completed.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*epic.*halt" or "run.*halted.*epic" -->

6. [x] **Given** a test that creates a run machine and sends an `INTERRUPT` event during epic processing, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the run machine reaches the `interrupted` final state.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*interrupted" or "run.*INTERRUPT" -->

7. [x] **Given** a test that creates a run machine where the epic machine invocation throws an error, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the run machine records the error in its errors array and the error includes taskName and storyKey fields.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*error.*recorded" or "run.*epic.*error" -->

8. [x] **Given** a test that creates a run machine and runs it to completion with multiple epics, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine output includes updated `workflowState`, accumulated `errors`, `tasksCompleted` count, `storiesProcessed` set, `lastContract`, `accumulatedCostUsd`, and `halted` flag — matching the `RunOutput` type.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*output" or "run.*result" -->

9. [x] **Given** a test that creates a run machine with zero epic entries (empty `epicEntries`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine skips epic iteration entirely and reaches `allDone` with `storiesProcessed` being empty.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*empty.*epics" or "run.*no.*epics" -->

10. [x] **Given** a test that creates a run machine where the `onEvent` callback is provided, **When** each epic starts processing, **Then** verbose test output shows the callback received a `dispatch-start` event with `storyKey` matching the `__epic_N__` sentinel for that epic entry.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*onEvent" or "run.*dispatch-start.*epic" -->

11. [x] **Given** a test that creates a run machine with two epics where the first succeeds and context (workflowState, lastContract, accumulatedCostUsd) flows to the second epic, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the second epic received the updated context from the first epic's completion.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*context.*flow" or "run.*epic.*chain" -->

12. [x] **Given** a test that creates a run machine where an epic's invoke throws an `AbortError`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the run machine transitions to `interrupted` (not `halted`).
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*abort" or "run.*AbortError.*interrupted" -->

13. [x] **Given** the run machine definition file, **When** `npx eslint` is run against it, **Then** it exits with code 0 and produces no lint errors.
    <!-- verification: `npx eslint src/lib/workflow-run-machine.ts` exits 0 -->

14. [x] **Given** the run machine definition file, **When** its line count is checked, **Then** it contains <= 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-run-machine.ts` shows <= 300 -->

15. [x] **Given** the run machine source file, **When** its imports are inspected, **Then** it does not import from `workflow-runner.ts`, `workflow-visualizer.ts`, or `workflow-persistence.ts` — boundary rules are respected.
    <!-- verification: `grep "from.*workflow-runner\|from.*workflow-visualizer\|from.*workflow-persistence" src/lib/workflow-run-machine.ts` returns no matches -->

16. [x] **Given** a test that creates a run machine where an epic halts but subsequent epics exist, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the run machine stops processing further epics (does not invoke the next epic) and reaches `halted`.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "run.*halt.*stops" or "run.*no.*further.*epics" -->

## Tasks / Subtasks

### T1: Define RunOutput type and run machine actors

- `RunOutput`: `Pick<RunContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>` — matches the shape `workflow-runner.ts` needs
- `runEpicActor`: `fromPromise` wrapping `epicMachine` invocation for one epic entry at a time. Builds `EpicContext` from current `RunContext` + `epicEntries[currentEpicIndex]`, creates and runs `epicMachine` to completion, returns updated `RunContext` fields.
- Import `epicMachine` from `workflow-epic-machine.ts` for epic invocation
- Import `EpicOutput` from `workflow-epic-machine.ts` for output typing

### T2: Define run machine guards

- `hasMoreEpics`: `({ context }) => context.currentEpicIndex < context.epicEntries.length` — controls for_each iteration
- `isHalted`: `({ context }) => context.halted` — exits iteration early on halt
- `isAbortError`: returns true when error is `AbortError` instance (name === 'AbortError')
- `isHaltError`: returns true when error is `DispatchError` with halt code
- All guards are pure functions: context/event in, boolean out. No I/O, no side effects.

### T3: Build the run machine structure

The run machine uses the AD4 for_each pattern:

```
initial: 'processingEpic'
states:
  processingEpic:
    always:
      - guard: isHalted → #run.halted
      - guard: noMoreEpics → allDone
    invoke runEpicActor with input from current epicEntry
    onDone: merge RunContext fields → checkNextEpic
    onError: chain (isAbortError → interrupted, isHaltError → halted, fallback → halted with error recorded)
  checkNextEpic:
    always:
      - guard: isHalted → #run.halted
      - guard: hasMoreEpics → processingEpic (with incremented index)
      - target: allDone
  allDone: { type: 'final' }
  halted: { type: 'final' }
  interrupted: { type: 'final' }
on: { INTERRUPT: '.interrupted' }
```

### T4: Build runEpicActor for epic invocation

A `fromPromise` actor that processes ONE epic entry at a time:
- Reads `epicEntries[currentEpicIndex]` → `[epicId, epicItems]`
- Emits `dispatch-start` event via `config.onEvent` with `storyKey: __epic_${epicId}__`
- Builds `EpicContext` from current run state:
  ```typescript
  {
    epicId,
    epicItems,
    config: ctx.config,
    storyFlowTasks: ctx.storyFlowTasks,
    currentStoryIndex: 0,
    workflowState: ctx.workflowState,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: ctx.lastContract,
    accumulatedCostUsd: ctx.accumulatedCostUsd,
    halted: false,
    currentStepIndex: 0,
  }
  ```
- Creates `epicMachine` actor, runs to completion via `createActor` + `waitFor`
- Merges `EpicOutput` back into run context: errors, workflowState, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted
- Returns updated `RunContext` with `currentEpicIndex` incremented

### T5: Create the run machine with `setup()` + `createMachine()`

- Use `setup({ types, guards, actors })` pattern
- Type: `types: {} as { context: RunContext; input: RunContext; output: RunOutput }`
- Register guards from T2, actors from T1
- Machine ID: `'run'`
- Context initialized from input: `context: ({ input }) => ({ ...input })`
- Add top-level `on: { INTERRUPT: '.interrupted' }` for two-phase interrupt
- States: AD4 iteration structure from T3 plus `allDone`, `halted`, `interrupted` final states
- Output function: extract `RunOutput` fields from context

### T6: Write comprehensive unit tests

- Test: single epic → epic machine invoked, run reaches `allDone`, storiesProcessed has key
- Test: three sequential epics → all invoked in order, storiesProcessed has all keys
- Test: epic halts → run reaches `halted`, subsequent epics not processed
- Test: INTERRUPT event → `interrupted` final state
- Test: error from epic invoke → error recorded in run errors array
- Test: machine output matches `RunOutput` shape
- Test: empty epicEntries → skips to `allDone`
- Test: onEvent callback receives `dispatch-start` with epic sentinel for each epic
- Test: context flows between epics (workflowState, lastContract, accumulatedCostUsd from epic 1 → epic 2)
- Test: AbortError → `interrupted` (not `halted`)
- Test: halt stops further epic processing
- Use mocked actors (same pattern as epic machine tests)
- Use `createActor` + `waitFor` for machine execution

### T7: Update workflow-runner.ts import

- Change `import { runMachine } from './workflow-machines.js'` to `import { runMachine } from './workflow-run-machine.js'`
- Ensure `runWorkflowActor()` uses the new run machine's `output` (via `actor.getSnapshot().output`) instead of `context` — the new machine has typed output
- Verify build and all existing runner tests still pass

### T8: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint src/lib/workflow-run-machine.ts` exits 0
- `wc -l src/lib/workflow-run-machine.ts` <= 300 lines
- `npx vitest run` — all tests pass, zero regressions
- `grep` boundary check: no imports from runner/visualizer/persistence

## Dev Notes

### AD4 for_each iteration pattern

The run machine uses the same AD4 pattern from architecture-xstate-engine.md as the epic machine:
```
processEpic → checkNextEpic → processEpic | allDone
```

The `currentEpicIndex` in context tracks iteration position. `hasMoreEpics` guard controls the loop. Each epic invocation creates an `epicMachine` child with typed input, receives `EpicOutput` on completion.

### runEpicActor wraps epicMachine invocation

The actor creates `EpicContext` from the current run context and the current epic entry, invokes the epic machine, and merges the result back. This is the same pattern used in `epicStoryActor` (epic-machine.ts:104-121) which wraps `storyMachine`.

Key merge logic on epic completion:
```typescript
const epicOut = snap.output as EpicOutput;
const storiesProcessed = new Set(input.storiesProcessed);
for (const key of epicOut.storiesProcessed) storiesProcessed.add(key);
return {
  ...input,
  workflowState: epicOut.workflowState,
  errors: [...input.errors, ...epicOut.errors],
  tasksCompleted: input.tasksCompleted + epicOut.tasksCompleted,
  storiesProcessed,
  lastContract: epicOut.lastContract,
  accumulatedCostUsd: epicOut.accumulatedCostUsd,
  halted: epicOut.halted,
};
```

### dispatch-start event for each epic

The current `runEpicActor` (workflow-machines.ts:354) emits a `dispatch-start` event before invoking each epic:
```typescript
if (config.onEvent) config.onEvent({ type: 'dispatch-start', taskName: 'story_flow', storyKey: `__epic_${epicId}__` });
```
The new run machine must preserve this behavior. The event is emitted inside the `runEpicActor` fromPromise actor, before creating the `epicMachine` actor.

### Error handling at run level

- Epic halts → run halts (epic `EpicOutput.halted === true` propagates up)
- Epic abort errors → run `interrupted`
- Epic halt errors (RATE_LIMIT, NETWORK) → run `halted`
- Epic non-halt errors → record in context, halt run (no recovery path at run level)
- `onError` chain: `isAbortError` → interrupted, `isHaltError` → halted, fallback → halted with error recorded

### Halt stops further epic processing

When an epic halts, the `halted` flag is set in run context. The `checkNextEpic` state checks `isHalted` first. If true, it transitions to `#run.halted` without invoking the next epic. This prevents wasting time on subsequent epics after a rate limit or other halt condition.

### File organization

Following gate/story/epic machine pattern: new file `src/lib/workflow-run-machine.ts`. Expected ~120-180 lines. The run machine is simpler than the epic machine because it only has one phase (epic iteration), no epic-level steps.

### What this story does NOT do

- Does not replace `workflow-runner.ts` — the composition root stays. Only the `runMachine` import source changes.
- Does not implement persistence refactoring (Epic 26)
- Does not implement visualization refactoring (Epic 27)
- Does not implement parallel epic execution — sequential only per current runner architecture
- Does not modify `workflow-epic-machine.ts` — the epic machine is done
- Does not delete the legacy `runMachine`/`runEpicActor` from `workflow-machines.ts` — that cleanup happens in story 25-5 or later

### Test strategy

Same mocking pattern as epic machine tests:
- Mock `workflow-actors.ts` exports: `dispatchTaskCore`, `nullTaskCore`
- Mock `agent-dispatch.js`: `DispatchError`
- Mock `output.js`: `warn`
- Use real `epicMachine` import (it will use the mocked actors internally)
- Create `RunContext` fixtures with configured epicEntries, storyFlowTasks
- Assert final state via `actor.getSnapshot().value` or `actor.getSnapshot().status`
- Assert output via `actor.getSnapshot().output`
- Verify `storiesProcessed` set contains expected keys
- Verify `onEvent` mock was called with expected `dispatch-start` events

### Relationship to existing code

The current `runEpicActor` (workflow-machines.ts:345-369) + `runMachine` (371-396) is an imperative approach with a `fromPromise` actor that handles one epic at a time, feeding context back via `assign`. After this story, both will coexist — the old one still referenced by `workflow-runner.ts` (until T7 switches the import), the new one in `workflow-run-machine.ts` ready for use.

### workflow-runner.ts update (T7)

The current `workflow-runner.ts` creates the actor and reads `actor.getSnapshot().context` for the final state. The new run machine defines a proper `output` function, so the runner should read `actor.getSnapshot().output` instead. This is a cleaner pattern — the output explicitly declares what the machine returns, rather than exposing raw context.

However, `workflow-runner.ts` currently reads several fields from `finalContext` that the `RunOutput` type covers:
- `finalContext.workflowState` → `RunOutput.workflowState`
- `finalContext.errors` → `RunOutput.errors`
- `finalContext.tasksCompleted` → `RunOutput.tasksCompleted`
- `finalContext.storiesProcessed` → `RunOutput.storiesProcessed`

The runner also accesses `storiesProcessed.size` — so `RunOutput` must include the `Set<string>` (not a count).

</story-spec>
