---
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
completedAt: '2026-04-05'
inputDocuments:
  - architecture-xstate-engine.md
  - tech-spec-migrate-engine-to-xstate.md
  - current implementation problems (adversarial reviews)
---

# codeharness XState Workflow Engine - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the XState workflow engine redesign, decomposing the architecture decisions into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: Execute multi-level flows defined in YAML (`for_each` nesting, arbitrary depth)
- FR2: Support configurable negotiation gates (`gate:` with consensus, check/fix/exit)
- FR3: Compile YAML workflow config into XState machine definitions (pure, recursive compiler)
- FR4: Dispatch tasks to multiple driver backends via `fromPromise` actors
- FR5: Support null tasks (engine-executed, no driver dispatch) via `fromPromise(nullTaskActor)`
- FR6: Track cost, duration, changed files, output contracts per task in typed machine context
- FR7: Persist state via dual-layer: XState snapshot + semantic checkpoint log
- FR8: Resume from XState snapshot (fast path) or checkpoint log (config-change resilient)
- FR9: Stream real-time dispatch events to TUI via sideband callback
- FR10: Expose machine state to TUI via XState `inspect` API
- FR11: Visualize workflow as one-row compressed flow (≤80 chars target)
- FR12: Handle abort/interrupt via two-phase (AbortSignal + INTERRUPT event)
- FR13: Support parallel epic execution via LanePool (unchanged interface)
- FR14: Propagate contracts between tasks via machine context
- FR15: Validate YAML at compile time (reject unnamed gates, unknown tasks, zero-check gates)

### Non-Functional Requirements

- NFR1: 8+ hour unattended operation without crashes
- NFR2: All state writes atomic
- NFR3: No single file > 300 lines
- NFR4: 100% test coverage on compiler, machine transitions, guards
- NFR5: XState machines inspectable (Stately Inspector compatible)
- NFR6: Pure compiler (no I/O, no state)
- NFR7: Pure guards (no side effects)
- NFR8: Visualization renders any workflow shape in ≤120 chars max

### Additional Requirements (Current Problems)

- P1: Decompose 1426-line workflow-machine.ts into 7 files
- P2: Replace imperative actor wrappers with real XState state machines
- P3: Use immutable context updates only (no mutation outside assign)
- P4: Propagate errors properly in onError (no silent swallowing)
- P5: Use WorkflowError class, not plain object throws
- P6: Fix max_budget_usd → timeout mapping bug
- P7: Separate side effects from assign() into action arrays
- P8: Use getPersistedSnapshot() for real XState persistence
- P9: Emit story-done events when storyFlow completes, not on verify
- P10: Clean import organization
- P11: Replace old loop: YAML format with gate: format
- P12: Add for_each + gate parser support
- P13: Replace sentinel keys with machine context identity

### FR Coverage Map

```
FR1:  Epic 1, Epic 4 — Multi-level for_each flows
FR2:  Epic 1, Epic 4 — Gate negotiation with consensus
FR3:  Epic 2 — Pure recursive compiler
FR4:  Epic 3, Epic 4 — Dispatch actors + machine invocation
FR5:  Epic 3 — Null task actors
FR6:  Epic 3 — Cost/duration/files/contract tracking
FR7:  Epic 5 — Dual-layer persistence
FR8:  Epic 5 — Resume from snapshot or checkpoint
FR9:  Epic 3 — Sideband streaming to TUI
FR10: Epic 6 — Inspect API for machine state
FR11: Epic 6 — One-row compressed visualization
FR12: Epic 4 — Two-phase interrupt (AbortSignal + INTERRUPT)
FR13: Epic 4 — LanePool unchanged interface
FR14: Epic 3 — Contract chaining via context
FR15: Epic 1 — Compile-time YAML validation
NFR1: Epic 4 — 8-hour stability via XState
NFR2: Epic 5 — Atomic state writes
NFR3: Epic 7 — ≤300 line files
NFR4: Epic 7 — 100% test coverage
NFR5: Epic 4 — Inspectable machines
NFR6: Epic 2 — Pure compiler
NFR7: Epic 2 — Pure guards
NFR8: Epic 6 — ≤120 char visualization
P1-P13: Distributed across epics 1-7
```

## Epic List

### Epic 1: Flow Configuration Format & Parser
Users can define workflows using the new `for_each` + `gate` YAML format with arbitrary nesting, named gates, consensus semantics, and compile-time validation.
**FRs covered:** FR1, FR2, FR15, P11, P12

### Epic 2: Workflow Compiler
The engine compiles YAML workflow configs into XState machine definitions via a pure, recursive compiler.
**FRs covered:** FR3, NFR6, NFR7, P2

### Epic 3: Dispatch & Null Task Actors
Task dispatch and null task execution through properly typed `fromPromise` XState actors with sideband streaming, contract output, and error classification.
**FRs covered:** FR4, FR5, FR6, FR9, FR14, P3, P4, P5, P6, P7, P10

### Epic 4: XState Machine Hierarchy
Run, epic, story, and gate machines with `setup()` + `createMachine()`, typed contexts, pure guards, proper state transitions, INTERRUPT handling.
**FRs covered:** FR1, FR2, FR4, FR12, FR13, P2, P3, P13, NFR1, NFR5

### Epic 5: Persistence & Resume
Dual-layer persistence: XState `getPersistedSnapshot()` + semantic checkpoint log. Config hash invalidation. Atomic writes.
**FRs covered:** FR7, FR8, NFR2, P8

### Epic 6: TUI Visualization & Integration
One-row workflow visualization driven by inspect API. Sliding window, gate rendering, scope prefix. run.ts simplified.
**FRs covered:** FR10, FR11, NFR8, P9

### Epic 7: File Decomposition & Migration
Split workflow-machine.ts into 7 files. Update imports. Delete hierarchical-flow.ts. Migrate tests.
**FRs covered:** NFR3, NFR4, P1

**Dependencies:** Epic 1 → Epic 2 → Epic 4 (with Epic 3 parallel). Epic 5, 6 depend on Epic 4. Epic 7 after all.

---

## Stories

### Epic 1: Flow Configuration Format & Parser

Users can define workflows using the new `for_each` + `gate` YAML format with arbitrary nesting, named gates, consensus semantics, and compile-time validation.

#### Story 1.1: Parse `for_each` blocks in workflow YAML

As a workflow author,
I want to define nested iteration levels using `for_each: epic` and `for_each: story`,
So that my workflow YAML naturally expresses multi-level execution.

**Acceptance Criteria:**

**Given** a YAML file with `workflow: { for_each: epic, steps: [...] }`
**When** the parser resolves the workflow
**Then** it returns a `ForEachBlock` with `scope: 'epic'` and nested `steps` array
**And** nested `for_each: story` blocks within steps are also parsed recursively

**Given** a `for_each` block without a scope name
**When** the parser validates the YAML
**Then** it throws a `WorkflowParseError` with message indicating missing scope

#### Story 1.2: Parse named `gate` blocks in workflow YAML

As a workflow author,
I want to define negotiation gates with explicit check/fix/exit semantics,
So that retry logic is readable and configurable per-gate.

**Acceptance Criteria:**

**Given** a YAML step `gate: quality` with `check: [check, review]`, `fix: [retry]`, `pass_when: consensus`, `max_retries: 5`
**When** the parser resolves the step
**Then** it returns a `GateBlock` with name, check tasks, fix tasks, pass_when, max_retries, and circuit_breaker defaulting to `'stagnation'`

**Given** a gate without a name
**When** the parser validates
**Then** it throws `WorkflowParseError` with "gate must be named"

**Given** a gate with empty `check: []`
**When** the parser validates
**Then** it throws `WorkflowParseError` with "gate must have at least one check task"

**Given** a gate referencing a task name not in `tasks:`
**When** the parser validates
**Then** it throws `WorkflowParseError` with "unknown task reference"

#### Story 1.3: Update default.yaml to new format

As a workflow author,
I want the default workflow template to use `for_each` + `gate` syntax,
So that new projects start with the clean format.

**Acceptance Criteria:**

**Given** the file `templates/workflows/default.yaml`
**When** the parser loads it
**Then** it successfully parses with `for_each: epic` at top level, `for_each: story` nested, and named gates `quality` and `verification`
**And** the old `story_flow` / `epic_flow` / `loop:` keys are absent

### Epic 2: Workflow Compiler

The engine compiles YAML workflow configs into XState machine definitions via a pure, recursive compiler.

#### Story 2.1: Create `workflow-types.ts` with shared types

As a developer,
I want all workflow engine types in a single shared module,
So that all other modules import from one source without circular deps.

**Acceptance Criteria:**

**Given** the file `src/lib/workflow-types.ts`
**When** imported by compiler, machines, actors, visualizer, persistence, or runner
**Then** it exports: `RunContext`, `EpicContext`, `StoryContext`, `GateContext`, `EngineConfig`, `EngineResult`, `EngineError`, `EngineEvent`, `WorkItem`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `GateConfig`, `ForEachConfig`, `FlowStep`, `WorkflowError` class
**And** the file has zero imports from any `workflow-*.ts` file
**And** `WorkflowError` extends `Error` with `code`, `taskName`, `storyKey` properties

#### Story 2.2: Compile plain task steps to invoke states

As a developer,
I want `compileStep('implement', tasks)` to return an XState state config that invokes the dispatch actor,
So that each task in the flow becomes a real state with onDone/onError transitions.

**Acceptance Criteria:**

**Given** a plain string step `'implement'` and a tasks map containing `implement: { agent: 'dev', ... }`
**When** `compileStep('implement', tasks, scope)` is called
**Then** it returns a `StateNodeConfig` with `invoke: { src: 'dispatchActor', input: ..., onDone: { target: nextState }, onError: [...] }`
**And** `onError` includes `isAbortError` guard check first, then `isHaltError`, then generic error

**Given** a task with `agent: null`
**When** `compileStep` is called
**Then** it returns a state config with `invoke: { src: 'nullTaskActor' }` instead of `dispatchActor`

#### Story 2.3: Compile `gate` blocks to compound negotiation states

As a developer,
I want `compileGate(gateConfig, tasks)` to return a compound XState state with checking → evaluate → fixing cycle,
So that gates are real state machines with guards controlling exit.

**Acceptance Criteria:**

**Given** a gate config `{ name: 'quality', check: ['check', 'review'], fix: ['retry'], pass_when: 'consensus', max_retries: 5 }`
**When** `compileGate(config, tasks)` is called
**Then** it returns a compound state with substates: `checking`, `evaluate`, `fixing`
**And** `evaluate` has guards: `allPassed` → `passed`, `maxRetries` → `maxedOut`, `circuitBreaker` → `halted`, default → `fixing`
**And** `fixing.onDone` transitions back to `checking`
**And** `passed`, `maxedOut`, `halted` are all `type: 'final'`

**Given** `pass_when: 'consensus'` with 3 check tasks
**When** the checking substates complete
**Then** each check task's onDone adds its verdict to `context.verdicts` map via `assign`
**And** the `allPassed` guard returns `true` only when ALL verdicts are `'pass'`

#### Story 2.4: Compile `for_each` blocks to iteration states

As a developer,
I want `compileForEach(config, tasks, scope)` to return a compound iteration state with AD4 pattern,
So that `for_each` blocks iterate over items via XState state transitions and guards.

**Acceptance Criteria:**

**Given** a `for_each: story` block with `steps: ['create-story', 'implement', { gate: 'quality', ... }]`
**When** `compileForEach(config, tasks, scope)` is called
**Then** it returns a compound state: `processItem` → `checkNext` → `processItem` | `done`
**And** `checkNext` has guard `hasMoreItems`: if true → `processItem` with `assign` incrementing index
**And** `checkNext` default → `done` (final)
**And** the child machine is compiled recursively from nested steps

#### Story 2.5: `compileFlow` top-level recursive entry point

As a developer,
I want `compileFlow(steps, tasks, scope)` to chain compiled steps into a sequential machine config,
So that a list of steps becomes a machine where each state transitions to the next.

**Acceptance Criteria:**

**Given** steps `['create-story', 'implement', { gate: 'quality', ... }, 'document']`
**When** `compileFlow(steps, tasks, scope)` is called
**Then** it returns a `MachineConfig` with states chained: `step_0` → `step_1` → `step_2` → `step_3` → `done`
**And** each `step_N` is the output of `compileStep` for that step
**And** the machine has `initial: 'step_0'`

**Given** an empty steps array
**When** `compileFlow` is called
**Then** it returns a machine with only `done: { type: 'final' }`

### Epic 3: Dispatch & Null Task Actors

Task dispatch and null task execution through properly typed `fromPromise` XState actors.

#### Story 3.1: Create `workflow-actors.ts` with dispatch actor

As a developer,
I want a `dispatchActor` defined as `fromPromise<DispatchOutput, DispatchInput>` in its own module,
So that task dispatch is a clean, typed XState actor with sideband streaming.

**Acceptance Criteria:**

**Given** a `DispatchInput` with task, taskName, storyKey, definition, config, workflowState, previousContract
**When** the dispatch actor is invoked by a machine
**Then** it resolves driver, model, constructs prompt, dispatches via `driver.dispatch(opts)`
**And** streams events to TUI via sideband callback
**And** returns `DispatchOutput` with output, cost, changedFiles, sessionId, contract, updatedState

**Given** the driver reports an error
**When** the actor processes the result
**Then** it throws a `WorkflowError` with mapped error code

**Given** `task.source_access === false`
**When** the actor prepares dispatch
**Then** it creates an isolated workspace and cleans up in `finally` block

#### Story 3.2: Create null task actor

As a developer,
I want a `nullTaskActor` defined as `fromPromise<DispatchOutput, NullTaskInput>`,
So that null tasks execute through the same invoke pattern as agent tasks.

**Acceptance Criteria:**

**Given** a `NullTaskInput` with task (agent: null), taskName, storyKey
**When** the null task actor is invoked
**Then** it looks up handler, builds `TaskContext`, calls handler, returns `DispatchOutput`

**Given** no handler registered
**When** the actor runs
**Then** it throws `WorkflowError` with code `NULL_TASK_NOT_FOUND`

**Given** handler returns `success: false`
**When** the actor processes result
**Then** it throws `WorkflowError` with code `NULL_TASK_FAILED`

#### Story 3.3: Contract chaining and verify flag propagation

As a developer,
I want each actor to write output contracts and propagate verify flags,
So that the next task receives the previous task's contract context.

**Acceptance Criteria:**

**Given** a dispatch completes successfully
**When** the actor builds the output contract
**Then** it writes to `.codeharness/contracts/` and returns contract in `DispatchOutput`
**And** machine's `onDone` assigns `lastContract` in context

**Given** taskName is `'implement'` and contract has `testResults`
**When** `propagateVerifyFlags` runs
**Then** it sets `session_flags.tests_passed` and `session_flags.coverage_met`

#### Story 3.4: Error classification with WorkflowError

As a developer,
I want all actor errors to be `WorkflowError` instances with structured codes,
So that machine `onError` guards can classify errors correctly.

**Acceptance Criteria:**

**Given** a `WorkflowError` with `code: 'RATE_LIMIT'`
**When** machine's `onError` handler runs
**Then** `isHaltError` guard returns true, machine transitions to `halted`

**Given** a `WorkflowError` with `code: 'UNKNOWN'`
**When** machine's `onError` handler runs
**Then** error is recorded in context, execution continues

**Given** an `AbortError`
**When** machine's `onError` handler runs
**Then** `isAbortError` guard returns true, machine transitions to `interrupted`

### Epic 4: XState Machine Hierarchy

Real XState machines with `setup()` + `createMachine()`, typed contexts, pure guards, proper transitions.

#### Story 4.1: Create gate machine

As a developer,
I want a `gateMachine` implementing checking → evaluate → fixing cycle,
So that gates are real XState compound states with guards driving exit.

**Acceptance Criteria:**

**Given** a gate machine started with gate config input
**When** running
**Then** it enters `checking`, invokes each check task sequentially, assigns verdicts to context map

**Given** `evaluate` state with all verdicts `'pass'`
**When** `allPassed` guard fires
**Then** transitions to `passed` (final)

**Given** `context.iteration >= context.maxRetries`
**When** `maxRetries` guard fires
**Then** transitions to `maxedOut` (final)

**Given** stagnation detected
**When** `circuitBreaker` guard fires
**Then** transitions to `halted` (final)

**Given** no exit guards fire
**When** default transition runs
**Then** transitions to `fixing`, invokes fix tasks, returns to `checking`

**Given** `INTERRUPT` event received
**When** processed
**Then** transitions to `interrupted` (final)

#### Story 4.2: Create story machine

As a developer,
I want a `storyMachine` that processes one story through compiled storyFlow steps,
So that each story is a real state machine.

**Acceptance Criteria:**

**Given** a story machine started with storyFlow steps
**When** running
**Then** it processes steps sequentially via dispatch actors, transitions on `onDone`

**Given** a step is a compiled gate
**When** reached
**Then** invokes `gateMachine` as child, merges output on `onDone`

**Given** halt error on dispatch
**When** `onError` fires
**Then** `isHaltError` matches, transitions to `halted`, error recorded via immutable `assign`

**Given** all steps complete
**When** `done` reached
**Then** output includes updated state, errors, tasksCompleted, lastContract, cost

#### Story 4.3: Create epic machine with for_each story iteration

As a developer,
I want an `epicMachine` that iterates stories via AD4 pattern then runs epic-level steps,
So that epics process stories through story machines then execute deploy/verify/retro.

**Acceptance Criteria:**

**Given** epic machine started with epicItems
**When** running
**Then** enters `processingStory`, invokes `storyMachine` for first item

**Given** `checkNextStory` with more stories
**When** `hasMoreStories` guard true
**Then** transitions back to `processingStory` with incremented index

**Given** all stories done
**When** `hasMoreStories` false
**Then** proceeds to epic-level steps (deploy, gate, retro)

**Given** story completes without error
**When** story machine `onDone` fires
**Then** `config.onEvent` called with `{ type: 'story-done', storyKey: item.key }`

#### Story 4.4: Create run machine with for_each epic iteration

As a developer,
I want a `runMachine` iterating epics via AD4 pattern,
So that the top-level orchestrator is a real XState machine.

**Acceptance Criteria:**

**Given** run machine started with epicEntries
**When** running
**Then** enters `processingEpic`, invokes `epicMachine` for first epic

**Given** `checkNextEpic` with more epics
**When** `hasMoreEpics` true
**Then** transitions back with incremented index

**Given** all epics processed
**When** `hasMoreEpics` false
**Then** transitions to `allDone` (final)

**Given** `INTERRUPT` event sent
**When** received
**Then** transitions to `interrupted` at every level, propagates to children

**Given** `onError` on epic invoke
**When** error received
**Then** error recorded in context (not swallowed)

#### Story 4.5: Wire `runWorkflowActor()` to use compiled machines

As a developer,
I want `runWorkflowActor(config)` to compile YAML, create run machine, return EngineResult,
So that LanePool and run.ts get same interface with real XState underneath.

**Acceptance Criteria:**

**Given** an `EngineConfig`
**When** `runWorkflowActor(config)` called
**Then** runs pre-flight checks, compiles workflow, creates actor, starts, returns `Promise<EngineResult>`

**Given** phase is `'completed'`
**When** state read
**Then** returns immediately with success

**Given** health check failure
**When** `checkDriverHealth()` throws
**Then** returns `{ success: false, errors: [{ code: 'HEALTH_CHECK' }] }`

### Epic 5: Persistence & Resume

Dual-layer persistence with XState snapshots and semantic checkpoint log.

#### Story 5.1: XState snapshot persistence via `getPersistedSnapshot()`

As a developer,
I want snapshots saved after every task completion,
So that exact machine state is recoverable.

**Acceptance Criteria:**

**Given** a dispatch actor completes
**When** inspect callback receives snapshot change
**Then** `getPersistedSnapshot()` saved to `.codeharness/workflow-snapshot.json` with `configHash`

**Given** INTERRUPT event
**When** machine transitions to `interrupted`
**Then** snapshot saved before actor stops

#### Story 5.2: Snapshot resume with config hash validation

As a developer,
I want `runWorkflowActor()` to resume from snapshot if config matches,
So that crash recovery is instant.

**Acceptance Criteria:**

**Given** snapshot exists with matching configHash
**When** `runWorkflowActor()` compiles workflow
**Then** creates actor with `createActor(machine, { snapshot })`

**Given** snapshot with mismatched configHash
**When** compared
**Then** snapshot discarded with warning, falls back to checkpoint log

#### Story 5.3: Semantic checkpoint log for config-change resilient resume

As a developer,
I want an append-only checkpoint log,
So that resume works even after YAML changes.

**Acceptance Criteria:**

**Given** task completes
**When** machine's `onDone` runs
**Then** checkpoint appended to `.codeharness/workflow-checkpoints.jsonl`

**Given** invalid snapshot and checkpoint log exists
**When** engine starts fresh machine
**Then** guards skip completed tasks by reading checkpoint log

#### Story 5.4: Clear persistence on workflow completion

As a developer,
I want cleanup on successful completion,
So that next run starts fresh.

**Acceptance Criteria:**

**Given** run machine reaches `allDone` with zero errors
**When** completion processed
**Then** snapshot and checkpoint files deleted, phase set to `'completed'`

**Given** machine reaches `halted` or `maxedOut`
**When** workflow finishes with errors
**Then** files preserved for resume

### Epic 6: TUI Visualization & Integration

One-row visualization driven by inspect API, run.ts simplified.

#### Story 6.1: Create `workflow-visualizer.ts` with pure rendering function

As a developer,
I want `visualize(machineConfig, snapshot, vizConfig) → string`,
So that any workflow state renders as one terminal row.

**Acceptance Criteria:**

**Given** snapshot at story processing step
**When** `visualize()` called with `{ maxWidth: 80, maxStepSlots: 5, taskNameMaxLen: 8 }`
**Then** returns string like `Epic 17 [1/6] create✓ → impl… → ⟲quality → doc` within 80 chars

**Given** snapshot inside gate iteration 2/5 with mixed verdicts
**When** called
**Then** renders `⟲quality(2/5 1✓1✗)…`

**Given** flow with 8 steps, active at step 6
**When** sliding window applies
**Then** `[5✓]` prefix, `→ …2 more` suffix

#### Story 6.2: Derive workflow position from XState snapshot state path

As a developer,
I want the visualizer to parse snapshot value to determine active level/step/gate/iteration,
So that visualization is purely derived from XState state.

**Acceptance Criteria:**

**Given** snapshot with nested state value path
**When** visualizer parses
**Then** determines level, epicIndex, storyIndex, activeStep, gatePhase, checkIndex from state path and context

#### Story 6.3: Wire `inspect` API to visualizer in run.ts

As a developer,
I want inspect callback on run machine actor driving visualization updates,
So that state transitions trigger TUI refresh.

**Acceptance Criteria:**

**Given** actor created with `inspect` callback
**When** `@xstate.snapshot` event fires
**Then** `visualize()` called, result passed to `renderer.updateWorkflowRow()`

**Given** snapshot unchanged (actor internal progress only)
**When** inspect fires
**Then** visualizer NOT called (debounce on state transitions only)

#### Story 6.4: Wire sideband streaming to TUI renderer

As a developer,
I want dispatch actors to feed stream events via sideband,
So that user sees real-time agent output.

**Acceptance Criteria:**

**Given** `config.onEvent` set
**When** dispatch actor streams
**Then** each `StreamEvent` forwarded via `config.onEvent`
**And** dispatch-start and dispatch-end emitted with timing/cost

#### Story 6.5: Simplify run.ts — remove hand-tracked state

As a developer,
I want run.ts to derive ALL display state from machine snapshot,
So that hand-tracked variables are eliminated.

**Acceptance Criteria:**

**Given** current hand-tracked variables (`inEpicPhase`, `currentStoryKey`, `taskStates`, etc.)
**When** migration complete
**Then** all deleted, workflow visualization from `inspect` → `visualize()` only
**And** `onEvent` handler only tracks `totalCostUsd`, `storiesDone`, forwards stream events

### Epic 7: File Decomposition & Migration

Split monolith into 7 files, update imports, migrate tests, delete dead code.

#### Story 7.1: Extract `workflow-actors.ts` from `workflow-machine.ts`

As a developer,
I want dispatch and null task actors in their own module,
So that actors are independently testable and ≤200 lines.

**Acceptance Criteria:**

**Given** `src/lib/workflow-actors.ts` created
**When** containing dispatchActor, nullTaskActor, dispatchTaskCore, nullTaskCore
**Then** ≤200 lines, imports only from workflow-types.ts and externals
**And** all existing dispatch tests pass

#### Story 7.2: Extract `workflow-compiler.ts`

As a developer,
I want compiler in its own pure module,
So that it has zero runtime dependencies.

**Acceptance Criteria:**

**Given** `src/lib/workflow-compiler.ts` created
**When** containing compileFlow, compileStep, compileGate, compileForEach
**Then** ≤200 lines, zero imports from actors/machines/runner/persistence, all functions pure

#### Story 7.3: Extract `workflow-machines.ts`

As a developer,
I want machine definitions in their own module.

**Acceptance Criteria:**

**Given** `src/lib/workflow-machines.ts` created
**When** containing gateMachine, storyMachine, epicMachine, runMachine
**Then** ≤250 lines, imports from types + actors only

#### Story 7.4: Extract `workflow-runner.ts`

As a developer,
I want `runWorkflowActor()` in its own module as the composition root.

**Acceptance Criteria:**

**Given** `src/lib/workflow-runner.ts` created
**When** containing runWorkflowActor, checkDriverHealth, loadWorkItems
**Then** ≤150 lines, imports from all workflow modules
**And** run.ts and lane-pool.ts import from workflow-runner.ts

#### Story 7.5: Delete `workflow-machine.ts` and `hierarchical-flow.ts`

As a developer,
I want dead code removed.

**Acceptance Criteria:**

**Given** all consumers import from new files
**When** old files deleted
**Then** `npm run build` and `npx vitest run` pass with zero references remaining

#### Story 7.6: Migrate all test files to new module imports

As a developer,
I want all test imports updated to correct new modules.

**Acceptance Criteria:**

**Given** all test files updated
**When** imports point to workflow-runner, workflow-actors, workflow-types, workflow-compiler
**Then** all 4976+ tests pass, zero references to workflow-machine.ts

#### Story 7.7: Create dedicated test files per module

As a developer,
I want each new module to have focused tests.

**Acceptance Criteria:**

**Given** test files: compiler, machines, actors, visualizer, persistence, runner
**When** `npx vitest run --coverage`
**Then** each module ≥90% line coverage
**And** compiler tests use pure snapshot assertions
**And** machine tests assert actual XState state transitions
