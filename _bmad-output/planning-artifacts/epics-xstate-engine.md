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

## Epic 1: Flow Configuration Format & Parser

Users can define workflows using the new `for_each` + `gate` YAML format with arbitrary nesting, named gates, consensus semantics, and compile-time validation.

### Story 1.1: Parse `for_each` blocks in workflow YAML

As a workflow author, I want to define nested iteration levels using `for_each: epic` and `for_each: story`, So that my workflow YAML naturally expresses multi-level execution.

**Acceptance Criteria:**

**Given** a YAML file with `workflow: { for_each: epic, steps: [...] }` **When** the parser resolves the workflow **Then** it returns a `ForEachBlock` with `scope: 'epic'` and nested `steps` array **And** nested `for_each: story` blocks are parsed recursively

**Given** a `for_each` block without a scope name **When** the parser validates **Then** it throws `WorkflowParseError` with missing scope message

### Story 1.2: Parse named `gate` blocks in workflow YAML

As a workflow author, I want to define negotiation gates with explicit check/fix/exit semantics, So that retry logic is readable and configurable.

**Acceptance Criteria:**

**Given** `gate: quality` with `check: [check, review]`, `fix: [retry]`, `pass_when: consensus`, `max_retries: 5` **When** parsed **Then** returns `GateBlock` with all fields, `circuit_breaker` defaults to `'stagnation'`

**Given** unnamed gate **When** validated **Then** throws `WorkflowParseError` "gate must be named"

**Given** gate with `check: []` **When** validated **Then** throws `WorkflowParseError` "at least one check task"

**Given** gate referencing unknown task **When** validated **Then** throws `WorkflowParseError` "unknown task reference"

### Story 1.3: Update default.yaml to new format

As a workflow author, I want the default template to use `for_each` + `gate` syntax, So that new projects start clean.

**Acceptance Criteria:**

**Given** `templates/workflows/default.yaml` **When** parsed **Then** succeeds with `for_each: epic`, nested `for_each: story`, named gates `quality` and `verification` **And** old `story_flow`/`epic_flow`/`loop:` keys absent

## Epic 2: Workflow Compiler

Pure recursive compiler transforms parsed YAML into XState MachineConfig.

### Story 2.1: Create `workflow-types.ts` with shared types

As a developer, I want all workflow engine types in a single shared module, So that all modules import from one source without circular deps.

**Acceptance Criteria:**

**Given** `src/lib/workflow-types.ts` **When** imported by any workflow module **Then** exports all context types, config types, error types, `WorkflowError` class **And** zero imports from any `workflow-*.ts` file **And** `WorkflowError` extends `Error` with `code`, `taskName`, `storyKey`

### Story 2.2: Compile plain task steps to invoke states

As a developer, I want `compileStep('implement', tasks)` to return an XState invoke state config, So that each task becomes a real state with onDone/onError.

**Acceptance Criteria:**

**Given** string step `'implement'` with agent task **When** `compileStep` called **Then** returns state with `invoke: { src: 'dispatchActor' }`, onDone targeting next state, onError with isAbortError/isHaltError guards

**Given** task with `agent: null` **When** `compileStep` called **Then** returns state with `invoke: { src: 'nullTaskActor' }`

### Story 2.3: Compile `gate` blocks to compound negotiation states

As a developer, I want `compileGate()` to return a compound state with checking → evaluate → fixing cycle, So that gates are real state machines with guards.

**Acceptance Criteria:**

**Given** gate config with consensus and 2 check tasks **When** `compileGate` called **Then** returns compound state: `checking` (sequential invokes), `evaluate` (guards: allPassed/maxRetries/circuitBreaker), `fixing` (sequential invokes → back to checking) **And** final states: `passed`, `maxedOut`, `halted`

### Story 2.4: Compile `for_each` blocks to iteration states

As a developer, I want `compileForEach()` to return AD4 iteration pattern, So that items are iterated via state transitions and guards.

**Acceptance Criteria:**

**Given** `for_each: story` with nested steps **When** `compileForEach` called **Then** returns compound state: `processItem` → `checkNext` → `processItem` | `done` **And** child machine compiled recursively from nested steps **And** `hasMoreItems` guard controls iteration

### Story 2.5: `compileFlow` top-level recursive entry point

As a developer, I want `compileFlow(steps, tasks, scope)` to chain steps into sequential machine config.

**Acceptance Criteria:**

**Given** steps array **When** `compileFlow` called **Then** returns MachineConfig with states chained: `step_0` → `step_1` → ... → `done` **And** `initial: 'step_0'`

**Given** empty steps **When** called **Then** returns machine with only `done: { type: 'final' }`

## Epic 3: Dispatch & Null Task Actors

Typed `fromPromise` actors with streaming, contracts, error classification.

### Story 3.1: Create `workflow-actors.ts` with dispatch actor

As a developer, I want `dispatchActor` as `fromPromise<DispatchOutput, DispatchInput>`, So that task dispatch is a clean typed XState actor.

**Acceptance Criteria:**

**Given** DispatchInput **When** invoked **Then** resolves driver, dispatches, streams via sideband, returns DispatchOutput

**Given** driver error **When** processed **Then** throws `WorkflowError` with mapped code

**Given** `source_access: false` **When** dispatching **Then** creates isolated workspace, cleans up in `finally`

### Story 3.2: Create null task actor

As a developer, I want `nullTaskActor` as `fromPromise<DispatchOutput, NullTaskInput>`.

**Acceptance Criteria:**

**Given** NullTaskInput **When** invoked **Then** looks up handler, calls it, returns DispatchOutput with `driver: 'engine'`

**Given** no handler **When** invoked **Then** throws `WorkflowError` code `NULL_TASK_NOT_FOUND`

### Story 3.3: Contract chaining and verify flag propagation

As a developer, I want actors to write contracts and propagate flags, So that tasks chain context.

**Acceptance Criteria:**

**Given** dispatch completes **When** contract built **Then** written to `.codeharness/contracts/`, returned in output, assigned to `lastContract` via machine `onDone`

**Given** implement task with testResults **When** flags propagated **Then** `tests_passed` and `coverage_met` set in harness state

### Story 3.4: Error classification with WorkflowError

As a developer, I want all errors as `WorkflowError` instances, So that guards classify correctly.

**Acceptance Criteria:**

**Given** `code: 'RATE_LIMIT'` **When** onError **Then** `isHaltError` → `halted`
**Given** `code: 'UNKNOWN'` **When** onError **Then** recorded, continues
**Given** AbortError **When** onError **Then** `isAbortError` → `interrupted`

## Epic 4: XState Machine Hierarchy

Real machines with setup() + createMachine(), typed contexts, pure guards.

### Story 4.1: Create gate machine

As a developer, I want `gateMachine` implementing checking → evaluate → fixing cycle.

**Acceptance Criteria:**

**Given** gate started **When** running **Then** checking invokes check tasks sequentially, assigns verdicts to map
**Given** all pass **When** evaluate **Then** `allPassed` → `passed` (final)
**Given** max retries reached **When** evaluate **Then** `maxRetries` → `maxedOut` (final)
**Given** stagnation **When** evaluate **Then** `circuitBreaker` → `halted` (final)
**Given** no exit **When** default **Then** → `fixing` → back to `checking`, iteration incremented
**Given** INTERRUPT **When** received **Then** → `interrupted` (final)

### Story 4.2: Create story machine

As a developer, I want `storyMachine` processing one story through compiled steps.

**Acceptance Criteria:**

**Given** started with storyFlow **When** running **Then** processes steps sequentially via dispatch actors
**Given** gate step **When** reached **Then** invokes gateMachine as child, merges output
**Given** halt error **When** onError **Then** → `halted`, error recorded via immutable assign
**Given** all done **When** completed **Then** output includes state, errors, tasks, contract, cost

### Story 4.3: Create epic machine with for_each story iteration

As a developer, I want `epicMachine` iterating stories then running epic-level steps.

**Acceptance Criteria:**

**Given** started **When** running **Then** `processingStory` invokes storyMachine for first item
**Given** more stories **When** `hasMoreStories` true **Then** back to `processingStory`, index incremented
**Given** all stories done **When** false **Then** proceeds to epic-level steps
**Given** story completes **When** onDone **Then** emits `story-done` event

### Story 4.4: Create run machine

As a developer, I want `runMachine` iterating epics via AD4 pattern.

**Acceptance Criteria:**

**Given** started **When** running **Then** `processingEpic` invokes epicMachine
**Given** more epics **When** `hasMoreEpics` **Then** back, incremented
**Given** all done **When** false **Then** → `allDone` (final)
**Given** INTERRUPT **When** received **Then** → `interrupted` at every level
**Given** onError **When** epic fails **Then** error recorded (not swallowed)

### Story 4.5: Wire `runWorkflowActor()` to compiled machines

As a developer, I want `runWorkflowActor(config)` compiling YAML, creating actor, returning EngineResult.

**Acceptance Criteria:**

**Given** EngineConfig **When** called **Then** pre-flight, compile, create actor, start, return Promise<EngineResult>
**Given** phase `completed` **When** called **Then** returns immediately
**Given** health check failure **When** called **Then** returns `{ success: false, errors: [HEALTH_CHECK] }`

## Epic 5: Persistence & Resume

Dual-layer: XState snapshots + semantic checkpoint log.

### Story 5.1: XState snapshot via `getPersistedSnapshot()`

As a developer, I want snapshots saved after every task, So that exact state is recoverable.

**Acceptance Criteria:**

**Given** task completes **When** inspect fires **Then** snapshot + configHash saved to `.codeharness/workflow-snapshot.json`
**Given** INTERRUPT **When** transitioning **Then** snapshot saved before stop

### Story 5.2: Snapshot resume with config hash

As a developer, I want resume from matching snapshot, fallback on mismatch.

**Acceptance Criteria:**

**Given** matching configHash **When** resuming **Then** `createActor(machine, { snapshot })`
**Given** mismatched hash **When** compared **Then** discarded, falls back to checkpoint log

### Story 5.3: Semantic checkpoint log

As a developer, I want append-only checkpoint log for config-change resilience.

**Acceptance Criteria:**

**Given** task completes **When** onDone **Then** checkpoint appended to `.codeharness/workflow-checkpoints.jsonl`
**Given** no snapshot **When** fresh machine starts **Then** guards skip completed tasks from log

### Story 5.4: Clear persistence on completion

As a developer, I want cleanup on success.

**Acceptance Criteria:**

**Given** `allDone` with zero errors **When** completed **Then** snapshot + checkpoint deleted, phase `completed`
**Given** halted/maxed **When** finished **Then** files preserved

## Epic 6: TUI Visualization & Integration

One-row visualization via inspect API, simplified run.ts.

### Story 6.1: Pure visualizer function

As a developer, I want `visualize(config, snapshot, vizConfig) → string`.

**Acceptance Criteria:**

**Given** story-level snapshot **When** called **Then** `Epic 17 [1/6] create✓ → impl… → ⟲quality → doc` ≤80 chars
**Given** gate snapshot 2/5 mixed **When** called **Then** `⟲quality(2/5 1✓1✗)…`
**Given** 8 steps, active at 6 **When** sliding window **Then** `[5✓]` prefix, `→ …2 more` suffix

### Story 6.2: Derive position from snapshot state path

As a developer, I want visualizer to parse snapshot value for level/step/gate/iteration.

**Acceptance Criteria:**

**Given** nested state value **When** parsed **Then** determines level, indices, active step, gate phase from path + context

### Story 6.3: Wire inspect to visualizer in run.ts

As a developer, I want inspect callback driving visualization.

**Acceptance Criteria:**

**Given** actor with inspect **When** `@xstate.snapshot` fires **Then** `visualize()` → `renderer.updateWorkflowRow()`
**Given** unchanged snapshot **When** inspect fires **Then** debounced, not called

### Story 6.4: Sideband streaming to TUI

As a developer, I want dispatch actors feeding stream events via sideband.

**Acceptance Criteria:**

**Given** `config.onEvent` set **When** dispatching **Then** StreamEvents forwarded, dispatch-start/end emitted with timing/cost

### Story 6.5: Simplify run.ts

As a developer, I want all hand-tracked state removed.

**Acceptance Criteria:**

**Given** current hand-tracked vars **When** migrated **Then** deleted — visualization from inspect only
**And** onEvent tracks only totalCost, storiesDone, forwards streams
**And** stories marked done on `story-done` event only

## Epic 7: File Decomposition & Migration

Split monolith, update imports, migrate tests.

### Story 7.1: Extract `workflow-actors.ts`

As a developer, I want actors in own module ≤200 lines.

**Acceptance Criteria:**

**Given** created **When** containing dispatch/null actors **Then** ≤200 lines, imports from types + externals only, existing tests pass

### Story 7.2: Extract `workflow-compiler.ts`

As a developer, I want compiler in pure module ≤200 lines.

**Acceptance Criteria:**

**Given** created **When** containing compile functions **Then** ≤200 lines, zero imports from actors/machines/runner, all pure

### Story 7.3: Extract `workflow-machines.ts`

As a developer, I want machine defs in own module ≤250 lines.

**Acceptance Criteria:**

**Given** created **When** containing 4 machines **Then** ≤250 lines, imports from types + actors only

### Story 7.4: Extract `workflow-runner.ts`

As a developer, I want runner as composition root ≤150 lines.

**Acceptance Criteria:**

**Given** created **When** containing runWorkflowActor, checkDriverHealth, loadWorkItems **Then** ≤150 lines, run.ts + lane-pool import from here

### Story 7.5: Delete `workflow-machine.ts` and `hierarchical-flow.ts`

As a developer, I want dead code removed.

**Acceptance Criteria:**

**Given** all consumers updated **When** deleted **Then** build + tests pass, zero references

### Story 7.6: Migrate test imports

As a developer, I want all test files using new modules.

**Acceptance Criteria:**

**Given** all tests updated **When** imports point to new modules **Then** 4976+ tests pass, zero old references

### Story 7.7: Dedicated test files per module

As a developer, I want focused tests per module.

**Acceptance Criteria:**

**Given** 6 test files created **When** coverage run **Then** each module ≥90% lines
**And** compiler tests: pure snapshot assertions
**And** machine tests: actual XState state transition assertions
