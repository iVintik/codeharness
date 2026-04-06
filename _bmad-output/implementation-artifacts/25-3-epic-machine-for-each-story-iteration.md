<story-spec>

# Story 25-3: Epic machine with for_each story iteration

Status: done

## Story

As a developer,
I want an `epicMachine` created via `setup()` + `createMachine()` that iterates stories via the AD4 for_each pattern (`processStory → checkNextStory → processStory | epicSteps`) then processes epic-level steps (deploy, gates, retro),
So that epics are real XState state machines with typed context, for_each iteration over stories via `storyMachine` invocation, sequential epic-level step processing, and proper error/interrupt handling — replacing the imperative `epicStepActor` approach.

## Context

**Epic 25: XState Machine Hierarchy** — this is story 3 of 5. Stories 25-1 (gate machine) and 25-2 (story machine) are complete.

**What exists and is usable:**

- `workflow-gate-machine.ts` (236 lines): `gateMachine` with `GateOutput` type — gate steps at epic level invoke this machine.
- `workflow-story-machine.ts` (222 lines): `storyMachine` with `StoryFlowOutput` — the child machine this epic machine invokes for each story in the for_each iteration. Uses `storyStepActor`, typed `StoryContext`/`StoryFlowInput`/`StoryFlowOutput`, 3 final states (`done`, `halted`, `interrupted`).
- `workflow-types.ts` (282 lines): `EpicContext` (with `epicId`, `epicItems`, `config`, `storyFlowTasks`, `currentStoryIndex`, `currentStepIndex`, `workflowState`, `errors`, `tasksCompleted`, `storiesProcessed`, `lastContract`, `accumulatedCostUsd`, `halted`), `EpicMachineContext = EpicContext`, `StoryFlowInput`, `StoryFlowOutput`, `GateContext`, `GateConfig`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `FlowStep`, `WorkItem`, all type guards (`isGateConfig`, `isForEachConfig`, `isLoopBlock`).
- `workflow-compiler.ts` (259 lines): `compileForEach()` → `CompiledForEachState` with `processItem → checkNext → processItem | done` pattern. `compileStep()`, `compileGate()`, `compileFlow()`. Step-level `onDone` assigns use `stepOnDoneAssign`. Error chain: `isAbortError` → interrupted, `isHaltError` → halted, fallback → record error.
- `workflow-actors.ts`: `dispatchTaskCore()`, `nullTaskCore()` — the async I/O functions.
- `workflow-machines.ts` (397 lines): Current imperative `epicStepActor` (lines 248-316) + `epicMachine` (lines 318-343) — the legacy approach this story replaces. Also contains `storyFlowActor` (lines 196-246, legacy), `loopMachine`, `runMachine`, `runEpicActor`, helper functions `collectGuideFiles`/`cleanupGuideFiles`.
- `circuit-breaker.ts`: `evaluateProgress()` — used by gate machine indirectly.

**What this story builds:**

A new file `src/lib/workflow-epic-machine.ts` (following gate/story machine patterns) that:
1. Uses `setup()` + `createMachine()` with typed `EpicContext` input and `EpicOutput` output
2. Implements the AD4 for_each iteration pattern for stories: `processStory → checkNextStory → (processStory | epicSteps)`
3. Invokes `storyMachine` as a child for each story item, merging `StoryFlowOutput` back into epic context
4. After all stories: processes epic-level steps sequentially (plain tasks, gates, loop blocks)
5. Registers actors: `storyMachine` (for story iteration), `epicStepDispatchActor` (fromPromise wrapping `dispatchTaskCore` for epic-level tasks), `epicNullTaskActor` (fromPromise wrapping `nullTaskCore`), `gateMachine` (for epic-level gates)
6. Implements pure guards: `hasMoreStories`, `isAbortError`, `isHaltError`, `hasMoreEpicSteps`, `isHalted`
7. Handles `INTERRUPT` event at machine level → `interrupted` final state
8. Returns epic result (updated state, errors, cost, storiesProcessed, contract, halted flag) as machine output

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD2: Separate machines invoked as children. Epic machine receives typed input, returns typed output. Parent (runMachine) merges via `assign` on `onDone`.
- AD4: `for_each` = iteration primitive. `processItem → checkNext → processItem | done` pattern. Guard `hasMoreItems` controls loop.
- Pattern 1: Always `setup()` + `createMachine()`.
- Pattern 2: `assign()` with immutable updates.
- Pattern 5: Every invoke handles both `onDone` and `onError`. Every `onError` checks `isAbortError` first.
- AD4 interrupt: `on: { INTERRUPT: '.interrupted' }` at every machine level.
- Context flow: EpicInput in, EpicOutput out. Parent picks from epic context, epic picks from story output.

**Dependencies:** Stories 25-1 (gate machine) and 25-2 (story machine) complete. Epics 21-24 complete.

## Acceptance Criteria

1. [x] **Given** the codebase after implementation, **When** `npm run build` is executed in the project root, **Then** it exits with code 0 and produces no TypeScript errors in the terminal output.
   <!-- verification: `npm run build` exits 0 -->

2. [x] **Given** the full test suite, **When** `npx vitest run` is executed in the project root, **Then** the summary line shows zero failures and all tests pass — no regressions from adding the epic machine.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. [x] **Given** a test that creates and starts an epic machine with one story item and a storyFlow containing a single passing task, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the story machine was invoked for that item, the epic machine reaches `done`, and `storiesProcessed` contains the item key.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*single.*story" or "epic.*one.*story.*done" -->

4. [x] **Given** a test that creates and starts an epic machine with three story items, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the story machine was invoked three times in order (item keys match), the `currentStoryIndex` advanced through 0→1→2, and the epic machine reaches `done` with all three keys in `storiesProcessed`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*three.*stories" or "epic.*sequential.*stories" -->

5. [x] **Given** a test that creates an epic machine with two stories where the second story halts, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the first story completed, the second story's halt propagated, the epic machine reaches `halted`, and only the first story key is in `storiesProcessed` as completed.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*story.*halt" or "epic.*halted.*story" -->

6. [x] **Given** a test that creates an epic machine with stories completed and an epic-level plain task step (e.g., `deploy`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming all stories processed first, then the deploy task dispatched after story iteration completes, and the epic machine reaches `done`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*deploy" or "epic.*epic-level.*task" -->

7. [x] **Given** a test that creates an epic machine with stories completed and an epic-level gate step, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the gate machine was invoked at epic level after story iteration, the gate output was merged into epic context, and the epic machine reaches `done`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*epic.*gate" or "epic.*gate.*after.*stories" -->

8. [x] **Given** a test that creates an epic machine and sends an `INTERRUPT` event during story processing, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the epic machine reaches the `interrupted` final state.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*interrupted" or "epic.*INTERRUPT" -->

9. [x] **Given** a test that creates an epic machine with stories and multiple epic-level steps (task → gate → task), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the epic-level steps were processed in order after story iteration, with context flowing between steps (contract chaining, cost accumulation).
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*mixed.*steps" or "epic.*task.*gate.*task" -->

10. [x] **Given** a test that creates an epic machine where an epic-level task dispatch throws a halt error, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the epic machine transitions to `halted` and the error is recorded in the output errors array.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*halt.*error" or "epic.*RATE_LIMIT" -->

11. [x] **Given** a test that creates an epic machine with a null task step at epic level (agent: null), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the null task was dispatched through the null task actor path, not the agent dispatch actor.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*null.*task" or "epic.*nullTask" -->

12. [x] **Given** a test that creates an epic machine and runs it to completion, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine output includes updated `workflowState`, accumulated `errors`, `tasksCompleted` count, `storiesProcessed` set, `lastContract`, `accumulatedCostUsd`, and `halted` flag — matching the `EpicOutput` type.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*output" or "epic.*result" -->

13. [x] **Given** the epic machine definition file, **When** `npx eslint` is run against it, **Then** it exits with code 0 and produces no lint errors.
    <!-- verification: `npx eslint src/lib/workflow-epic-machine.ts` exits 0 -->

14. [x] **Given** the epic machine definition file, **When** its line count is checked, **Then** it contains <= 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-epic-machine.ts` shows <= 300 -->

15. [x] **Given** the epic machine source file, **When** its imports are inspected, **Then** it does not import from `workflow-runner.ts`, `workflow-visualizer.ts`, or `workflow-persistence.ts` — boundary rules are respected.
    <!-- verification: `grep "from.*workflow-runner\|from.*workflow-visualizer\|from.*workflow-persistence" src/lib/workflow-epic-machine.ts` returns no matches -->

16. [x] **Given** a test that creates an epic machine with zero story items (empty `epicItems`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine skips story iteration entirely, proceeds to epic-level steps, and reaches `done` with `storiesProcessed` being empty.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*empty.*stories" or "epic.*no.*stories" -->

17. [x] **Given** a test that creates an epic machine where the `onEvent` callback is provided, **When** a story completes successfully, **Then** verbose test output shows the callback received a `story-done` event with the correct `storyKey` for that story item.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "epic.*onEvent" or "epic.*story-done.*event" -->

## Tasks / Subtasks

### T1: Define EpicOutput type and epic machine actors

- `EpicOutput`: `Pick<EpicContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>` — matches the shape parents need
- `epicStepDispatchActor`: `fromPromise` wrapping `dispatchTaskCore` for epic-level plain tasks (uses `__epic_N__` sentinel as storyKey)
- `epicNullTaskActor`: `fromPromise` wrapping `nullTaskCore` for epic-level null tasks
- Import `storyMachine` from `workflow-story-machine.ts` for story invocation
- Import `gateMachine` from `workflow-gate-machine.ts` for epic-level gate invocation

### T2: Define epic machine guards

- `hasMoreStories`: `({ context }) => context.currentStoryIndex < context.epicItems.length` — controls for_each iteration
- `hasMoreEpicSteps`: `({ context }) => context.currentStepIndex < context.config.workflow.epicFlow.length` — controls epic-level step processing
- `isHalted`: `({ context }) => context.halted` — exits iteration/step processing early
- `isAbortError`: returns true when error is `AbortError` instance
- `isHaltError`: returns true when error is `DispatchError` with halt code
- All guards are pure functions: context/event in, boolean out. No I/O, no side effects.

### T3: Build the two-phase epic machine structure

The epic machine has two major phases:

**Phase 1 — Story iteration (for_each pattern):**
```
initial: 'iteratingStories'
states:
  iteratingStories:
    initial: 'processStory'
    states:
      processStory:
        invoke storyMachine with input from current epicItem
        onDone: merge StoryFlowOutput → checkNextStory
        onError: chain (isAbortError → interrupted, isHaltError → halted, fallback → halted)
      checkNextStory:
        always:
          - guard: isHalted → #epic.halted
          - guard: hasMoreStories → processStory (with incremented index)
          - target: done
      done: { type: 'final' }
    onDone: 'processingEpicSteps'   // all stories done → move to epic steps
```

**Phase 2 — Epic-level steps (sequential):**
```
  processingEpicSteps:
    initial: 'processStep'
    states:
      processStep:
        invoke epicStepActor (dispatches current epicFlow step)
        onDone: merge output → checkNextStep
        onError: chain
      checkNextStep:
        always:
          - guard: isHalted → #epic.halted
          - guard: hasMoreEpicSteps → processStep (with incremented index)
          - target: done
      done: { type: 'final' }
    onDone: 'done'
```

### T4: Build epic step actor for epic-level step processing

A `fromPromise` actor that processes ONE epic-level step at a time:
- Reads `config.workflow.epicFlow[currentStepIndex]`
- If `string` (plain task): resolve task and definition, dispatch via `dispatchTaskCore` or `nullTaskCore`. Use `__epic_N__` sentinel as storyKey.
- If `isGateConfig(step)`: build `GateContext`, reset iteration/scores/cb, create and run `gateMachine` to completion, merge `GateOutput`.
- If `isLoopBlock(step)`: delegate to existing `executeLoopBlock` for backward compat (or build new loop handling).
- Handles `collectGuideFiles`/`cleanupGuideFiles` for `source_access: false` tasks.
- Returns updated epic context fields.

### T5: Create the epic machine with `setup()` + `createMachine()`

- Use `setup({ types, guards, actors })` pattern
- Type: `types: {} as { context: EpicContext; input: EpicContext; output: EpicOutput }`
- Register guards from T2, actors from T1
- Machine ID: `'epic'`
- Context initialized from input: `context: ({ input }) => ({ ...input })`
- Add top-level `on: { INTERRUPT: '.interrupted' }` for two-phase interrupt
- States: compound two-phase structure from T3 plus `done`, `halted`, `interrupted` final states
- Output function: extract `EpicOutput` fields from context

### T6: Story invocation within epic machine

When the epic machine processes a story item:
1. Build `StoryFlowInput` from current epic context:
   ```typescript
   {
     item: epicItems[currentStoryIndex],
     config: ctx.config,
     workflowState: ctx.workflowState,
     lastContract: ctx.lastContract,
     accumulatedCostUsd: ctx.accumulatedCostUsd,
     storyFlowTasks: ctx.storyFlowTasks,
   }
   ```
2. Invoke `storyMachine` as child actor with this input
3. On `onDone`: merge `StoryFlowOutput` back — errors, workflowState, tasksCompleted, lastContract, accumulatedCostUsd, halted. Add item key to `storiesProcessed`.
4. Check halted flag: if story halted, epic halts too (no recovery at epic level for story halts)

### T7: Gate invocation at epic level

When the epic step actor encounters a `GateConfig` step at epic level:
1. Build `GateContext` from current epic state:
   ```typescript
   {
     gate: gateConfig,
     config: ctx.config,
     workflowState: { ...ctx.workflowState, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } },
     errors: [],
     tasksCompleted: 0,
     halted: false,
     lastContract: ctx.lastContract,
     accumulatedCostUsd: ctx.accumulatedCostUsd,
     verdicts: {},
     parentItemKey: `__epic_${ctx.epicId}__`,
   }
   ```
2. Create `gateMachine` actor, run to completion
3. Merge `GateOutput` back: errors, workflowState, tasksCompleted, lastContract, accumulatedCostUsd, halted

### T8: Write comprehensive unit tests

- Test: single story → story machine invoked, epic reaches `done`, storiesProcessed has key
- Test: three sequential stories → all invoked in order, storiesProcessed has all keys
- Test: story halts → epic reaches `halted`, subsequent stories not processed
- Test: epic-level plain task after stories → task dispatched, epic `done`
- Test: epic-level gate after stories → gate invoked, output merged, epic `done`
- Test: INTERRUPT event → `interrupted` final state
- Test: mixed epic-level steps (task → gate → task) processed in order
- Test: halt error from epic-level dispatch → `halted`, error recorded
- Test: null task at epic level → uses `nullTaskCore` path
- Test: machine output matches `EpicOutput` shape
- Test: empty epicItems → skips to epic-level steps
- Test: onEvent callback receives `story-done` for each completed story
- Use mocked actors (same pattern as story/gate machine tests)
- Use `createActor` + `waitFor` for machine execution

### T9: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint src/lib/workflow-epic-machine.ts` exits 0
- `wc -l src/lib/workflow-epic-machine.ts` <= 300 lines
- `npx vitest run` — all tests pass, zero regressions
- `grep` boundary check: no imports from runner/visualizer/persistence

## Dev Notes

### Two-phase architecture: stories first, then epic steps

The epic machine processes `epicItems` (stories) via the AD4 for_each pattern first, then processes `config.workflow.epicFlow` steps sequentially. This matches the YAML structure where `for_each: story` contains the story steps and epic-level steps (deploy, gates, retro) come after.

The current `epicStepActor` (workflow-machines.ts:248-316) handles this with `currentStepIndex` into `epicFlow`, where `step === 'story_flow'` triggers story iteration. The new machine makes this explicit with compound states.

### for_each iteration pattern (AD4)

The epic machine uses the AD4 pattern from architecture-xstate-engine.md:
```
processStory → checkNextStory → processStory | done
```

The `currentStoryIndex` in context tracks iteration position. `hasMoreStories` guard controls the loop. Each story invocation creates a `storyMachine` child with typed input, receives `StoryFlowOutput` on completion.

This is the same pattern `compileForEach()` produces, but implemented directly in the machine definition since epic-level iteration is structural (defined by `epicItems`), not compiled from YAML.

### Epic-level step sentinel pattern

Epic-level tasks use `__epic_N__` as the storyKey sentinel (e.g., `__epic_17__`). This convention is established in the current `epicStepActor` (line 285) and must be preserved. The sentinel enables task completion tracking at epic scope (separate from per-story tracking).

### collectGuideFiles / cleanupGuideFiles

The current `epicStepActor` collects guide files for `source_access: false` tasks (lines 301-302). These are verification-related — they aggregate user docs from story document contracts into temporary guide files that the verify agent can read without source access. The new epic machine must preserve this behavior.

### Error handling at epic level

- Story halts → epic halts (story `StoryFlowOutput.halted === true` propagates up)
- Epic-level task halt errors (RATE_LIMIT, NETWORK, SDK_INIT) → epic halts
- Epic-level abort errors → epic `interrupted`
- Epic-level non-halt errors → record in context, halt epic (same as story level — no recovery path)
- Gate halts at epic level → epic halts

### File organization

Following gate/story machine pattern: new file `src/lib/workflow-epic-machine.ts`. Expected ~200-280 lines. The epic machine is more complex than the story machine because it has two phases (story iteration + epic steps), but most epic-level step logic can reuse actor patterns from the story machine.

### What this story does NOT do

- Does not implement run machine refactor (story 25-4)
- Does not replace `epicStepActor`/`epicMachine` usage in `runEpicActor` — that wiring happens when run machine is refactored (story 25-4) or during integration (story 25-5)
- Does not modify `workflow-compiler.ts` — the compiler is done
- Does not implement persistence, visualization, or run-level concerns
- Does not implement parallel story execution — sequential only per `story_strategy: sequential`

### Test strategy

Same mocking pattern as story/gate machine tests:
- Mock `workflow-actors.ts` exports: `dispatchTaskCore`, `nullTaskCore`
- Mock `agent-dispatch.js`: `DispatchError`
- Mock `output.js`: `warn`
- Use real `storyMachine` and `gateMachine` imports (they will use the mocked actors internally)
- Create `EpicContext` fixtures with configured epicItems, storyFlowTasks, epicFlow steps
- Assert final state via `actor.getSnapshot().value`
- Assert context/output via `actor.getSnapshot().output`
- Verify `storiesProcessed` set contains expected keys

### Relationship to existing code

The current `epicStepActor` (workflow-machines.ts:248-316) + `epicMachine` (318-343) is an imperative approach with a `fromPromise` actor iterating through `epicFlow` steps. After this story, both will coexist — the old one used by `runEpicActor`, the new one ready for story 25-4/25-5 to wire into the refactored run machine.

</story-spec>
