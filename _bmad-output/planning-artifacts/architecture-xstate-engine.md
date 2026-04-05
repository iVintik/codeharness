---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-05'
inputDocuments:
  - prd-overhaul.md
  - architecture-overhaul.md
  - tech-spec-migrate-engine-to-xstate.md
  - src/lib/workflow-machine.ts (current implementation)
  - templates/workflows/default.yaml (current flow config)
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-04-05'
---

# Architecture Decision Document — XState Workflow Engine

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The workflow engine must:
- Execute multi-level flows defined in YAML (`for_each` nesting, arbitrary depth)
- Support configurable negotiation gates (`gate:` with consensus, check/fix/exit semantics)
- Dispatch tasks to multiple driver backends (claude-code, codex, opencode)
- Track cost, duration, changed files, and output contracts per task
- Persist state durably via dual-layer persistence (XState snapshot + semantic checkpoint log)
- Stream real-time events to TUI via sideband callback (dispatch) and inspect API (state transitions)
- Support parallel epic execution via LanePool
- Handle abort/interrupt via two-phase mechanism (AbortSignal + INTERRUPT event)
- Support null tasks (engine-executed, no driver dispatch)
- Propagate contracts between tasks (output → input chaining via machine context)
- Compile YAML workflow config into XState machine definitions (pure, recursive compiler)
- Visualize workflow execution as a one-row compressed flow in the terminal

**Non-Functional Requirements:**
- 8+ hour unattended operation without crashes (NFR2)
- Resume from any interruption point — XState snapshot for fast resume, checkpoint log for config-change resilience
- All state writes atomic (no partial/corrupt state)
- File size: no single file > 300 lines (NFR18)
- 100% test coverage on compiler output, machine transitions, and guards
- XState machines must be inspectable (Stately Inspector compatible)
- Clean separation: XState manages state transitions, `fromPromise` actors do work
- Visualization renders any workflow shape in ≤80 chars (target), ≤120 chars (max)

**Scale & Complexity:**
- Primary domain: Node.js CLI workflow orchestrator
- Complexity: High — hierarchical state machines, concurrent execution, crash recovery, consensus negotiation
- Estimated components: flow compiler, 4 machine types (run/epic/story/gate), 3 actor types (dispatch/null/iteration), persistence layer, visualizer, TUI bridge

### Technical Constraints & Dependencies

| Constraint | Impact |
|-----------|--------|
| XState v5 | Machine architecture, actor model, inspect API, snapshot persistence |
| TypeScript strict | Full type safety on context, events, guards |
| Node.js ESM | Module system, async/await, generators for streaming |
| YAML workflow config | User-facing format, must be readable and versionable |
| LanePool interface | `runWorkflowActor(config): Promise<EngineResult>` preserved |
| Driver streaming | AsyncIterable<StreamEvent> — sideband, not XState events |
| Ink TUI | React-based terminal UI, receives state via inspect + sideband |

### Cross-Cutting Concerns

1. **Error classification** — halt errors (RATE_LIMIT) vs recoverable vs task failures. `isAbortError` guard on every invoke's `onError`. Propagates through machine hierarchy.
2. **Dual persistence** — XState snapshot (fast, exact resume) + semantic checkpoint log (survives config changes). Snapshot invalidated by config hash mismatch.
3. **Contract chaining** — machine context holds `lastContract`. Each task reads from context, `onDone` assigns new contract. Pure context flow.
4. **Abort propagation** — two-phase: `AbortSignal` kills running dispatch, `INTERRUPT` event stops machines from starting new tasks. Every machine level has `on: { INTERRUPT: '.interrupted' }`.
5. **Cost accumulation** — tracked at task, story, epic, and run levels in typed context. Flows up via machine output on completion.
6. **Gate semantics** — configurable per-gate: check tasks, fix tasks, `pass_when` (consensus/all_pass), max_retries, circuit_breaker. Verdicts accumulated in gate context map.

### Flow Configuration Format (Party Mode consensus)

```yaml
tasks:
  create-story:
    agent: story-creator
    model: claude-opus-4-6
    source_access: true
  implement:
    agent: dev
    model: claude-sonnet-4-6
    source_access: true
  check:
    agent: checker
    driver: codex
    source_access: true
  review:
    agent: reviewer
    driver: codex
    source_access: true
  verify:
    agent: evaluator
    source_access: false
    driver: codex
  # ... etc

workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - create-story
        - implement
        - gate: quality
            check: [check, review]
            fix: [retry]
            pass_when: consensus
            max_retries: 5
            circuit_breaker: stagnation
        - document
    - deploy
    - gate: verification
        check: [verify]
        fix: [retry, document, deploy]
        pass_when: all_pass
        max_retries: 3
        circuit_breaker: stagnation
    - retro

execution:
  epic_strategy: sequential
  story_strategy: sequential
  isolation: worktree
  max_parallel: 2
```

**Key format decisions:**
- `for_each` = nesting primitive. Hierarchy IS the YAML structure. Arbitrary depth.
- `gate` = negotiation primitive. Named. Check/fix/exit semantics explicit.
- `pass_when: consensus` = all check tasks must pass. Extensible to `majority`, `any_pass`.
- Iteration source implicit from scope (epics from sprint state, stories from epic).
- No nested gates in v1 — fix tasks are plain task references.
- Empty `for_each` scope = no-op, proceed to next step.
- Gate with zero check tasks = parse error.

### Machine Architecture (Party Mode consensus)

**Compiler**: `compileFlow(yaml, tasks) → MachineConfig` — pure, recursive, testable.

Each YAML primitive maps 1:1 to XState:
- **Plain task** → invoke state with `fromPromise(dispatchActor)`
- **`for_each`** → compound state: `processItem → checkNext → processItem | done` (AD4 iteration pattern)
- **`gate`** → compound state: `checking → evaluate → fixing → checking` cycle with guards (`allPassed`, `maxRetries`, `circuitBreaker`)

**Context flows down as input, results flow up as output:**

| Level | Context Holds | Receives from Parent | Returns to Parent |
|-------|--------------|---------------------|-------------------|
| RunMachine | epicEntries, currentIndex, results | EngineConfig, workItems | EngineResult |
| EpicMachine | epicItems, currentStepIndex, state | config, items, initial state | updated state, errors, cost |
| StoryMachine | storyFlow steps, task index | config, item, state, contract | updated state, errors, cost, contract |
| GateMachine | check/fix tasks, verdicts map, iteration | config, items, state, contract | updated state, verdicts, pass/fail |

No shared mutable state. Parent creates child with typed input, child returns typed output. `assign` on `onDone` merges output into parent context.

### TUI Workflow Visualization (Party Mode consensus)

**One-row compressed flow** driven by machine snapshot via `inspect` API.

**Rendering rules:**
1. **Scope prefix** — `Epic N [s/t]` inside story iteration, `Epic N` on epic steps, nothing for single-level
2. **Sliding window** — max 5 visible step slots. Completed before window: `[N✓]`. Overflow: `→ …N more`
3. **Gate rendering** — pending: `⟲name`, active: `⟲name(iter/max P✓F✗)`
4. **Width budget** — target 80 chars, max 120. Task names truncate at 8 chars
5. **Color** — dim=done, bold=active, red=failed, yellow=retrying

**Examples:**
```
Epic 17 [3/6] [2✓] → ⟲quality(2/5 1✓1✗)… → doc
Epic 17 stories✓ → deploy✓ → ⟲verify(1/3)… → retro
[5✓] → review… → ⟲quality → doc → …2 more
```

**Architecture:** Pure function `visualize(machine, snapshot, config) → string`. No hand-tracking in run.ts. Machine snapshot is the single source of truth.

### Persistence & Resume (Party Mode consensus)

**Dual-layer:**
- **Layer 1: XState snapshot** — `getPersistedSnapshot()` → `.codeharness/workflow-snapshot.json`. Exact machine state restore. Invalidated by config hash mismatch.
- **Layer 2: Semantic checkpoints** — append-only log of `{ scope, taskName, storyKey, verdict, costUsd }`. Survives YAML config changes. Engine fast-forwards through completed work on resume.

### Interrupt Architecture (Party Mode consensus)

**Two-phase:**
1. `AbortSignal` → kills running dispatch (driver subprocess)
2. `INTERRUPT` event → stops machine from starting new tasks
3. Every invoke has `onError: [{ guard: 'isAbortError', target: 'interrupted', actions: 'saveSnapshot' }]`
4. Every machine level has `on: { INTERRUPT: '.interrupted' }`

## Starter Template Evaluation

### Primary Technology Domain

Node.js CLI tool + Claude Code plugin. Brownfield — all technology choices established.

### Existing Technology Stack (Preserved)

| Decision | Choice | Status |
|----------|--------|--------|
| Language | TypeScript (strict mode) | Existing |
| Runtime | Node.js (ES modules) | Existing |
| CLI framework | Commander.js | Existing |
| Build | tsup (ESM output) | Existing |
| Test | Vitest + vi.mock | Existing |
| TUI | Ink (React for terminal) | Existing |
| Linting | ESLint | Existing |

### New Dependencies (This Architecture)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State machines | XState v5 | `setup()` + `createMachine()` + `createActor()`. Hierarchical machines, typed context, inspect API, snapshot persistence. |
| Workflow config | YAML (yaml package) | Already in use. User-facing format. Readable, versionable. |

### Decisions Not Changing

- No new frameworks, databases, or cloud dependencies
- Build pipeline, test infrastructure, CLI interface all preserved
- Driver abstraction layer (claude-code, codex, opencode) untouched
- Agent resolver, prompt templates, contract system untouched

**Scope:** This architecture affects only the workflow engine internals (`src/lib/workflow-*.ts`), the flow config format (`templates/workflows/`), and the TUI integration (`src/commands/run.ts`, `src/lib/ink-renderer.ts`).

## Core Architectural Decisions

### AD1: Flow Compilation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compiler output | MachineConfig objects | Testable as plain data, instantiated at runtime with `createMachine()` |
| Step compilation | Recursive `compileStep()` per primitive | `string` → task invoke state, `for_each` → iteration compound state, `gate` → negotiation compound state |
| Scope resolution | Implicit from scope type | `epic` → sprint state, `story` → parent epic. Compiler marks scope type, runner resolves data |
| Gate naming | Required | Enables diagnostics, resume messages, test assertions, TUI visualization |
| Validation | At compile time | Reject: zero check tasks, unknown task references, circular `for_each`, unnamed gates |

**Compiler signature:**
```typescript
compileFlow(steps: FlowStep[], tasks: TaskMap, scope: ScopeConfig) → MachineConfig
compileStep(step: FlowStep, tasks: TaskMap, scope: ScopeConfig) → StateNodeConfig
compileGate(gate: GateConfig, tasks: TaskMap) → StateNodeConfig  // checking → evaluate → fixing compound
compileForEach(forEach: ForEachConfig, tasks: TaskMap, scope: ScopeConfig) → StateNodeConfig  // recursive
```

### AD2: Machine Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Machine topology | Separate machines invoked as children | Isolation, testability, independent snapshots per level |
| Machines | `runMachine`, `epicMachine`, `storyMachine`, `gateMachine` | Each compiled from YAML, each with typed context |
| Gate structure | Compound state: `checking → evaluate → fixing → checking` | Guards on `evaluate` control exit (allPassed, maxRetries, circuitBreaker) |
| Context typing | Per-machine typed context | `RunContext`, `EpicContext`, `StoryContext`, `GateContext` — no shared mutables |
| Context flow | Input down, output up | Parent passes typed input, child returns typed output. `assign` on `onDone` merges |
| Actor dispatch | `fromPromise` wrapping `dispatchTaskCore` | Actor does I/O, machine does decisions |
| Null tasks | `fromPromise(nullTaskActor)` | Same invoke pattern as agent tasks, different actor |
| Consensus | `verdicts: Map<string, Verdict>` in GateContext | Each check task `onDone` adds verdict. `evaluate` guards read the map |

**Machine hierarchy:**
```
runMachine
  → invoke epicMachine (per epic, via for_each iteration)
    → invoke storyMachine (per story, via for_each iteration)
      → invoke dispatchActor (per task)
      → invoke gateMachine (per gate block)
        → invoke dispatchActor (check tasks)
        → evaluate (guards: allPassed, maxRetries, circuitBreaker)
        → invoke dispatchActor (fix tasks)
    → invoke dispatchActor (epic-level tasks: deploy, retro)
    → invoke gateMachine (epic-level gates: verify loop)
```

### AD3: Persistence

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary | XState `getPersistedSnapshot()` | Captures full state path for exact resume |
| Fallback | Semantic checkpoint log (append-only) | Survives config changes, fast-forward through completed work |
| Invalidation | Config hash comparison | Hash compiled machine config, store with snapshot, reject on mismatch |
| Storage | `.codeharness/workflow-snapshot.json` | JSON, atomic write |
| Save frequency | Every task completion + interrupt + error | Via inspect callback on state transitions |

**Resume flow:**
1. Load snapshot → check config hash → if match: `createActor(machine, { snapshot })` → instant resume
2. If mismatch or no snapshot: compile fresh machine → scan checkpoint log → skip completed tasks via guards
3. Checkpoint log is the durable safety net; XState snapshot is the fast path

### AD4: Interrupt Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Phase 1 | `AbortSignal` passed to dispatch actor | Kills running driver subprocess immediately |
| Phase 2 | `INTERRUPT` event sent to root actor | Propagates through hierarchy, stops new task starts |
| Error guard | `isAbortError` on every invoke `onError` | Transitions to `interrupted` final state with snapshot save |
| Machine handler | `on: { INTERRUPT: '.interrupted' }` at every level | Clean propagation through nested machines |

### AD5: TUI Integration

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State source | `inspect` API on root actor | Snapshot changes drive visualization updates |
| Streaming | Sideband callback in dispatch actor | Tool events/text too chatty for state machine |
| Visualizer | Pure function `(machine, snapshot, config) → string` | Testable, no side effects |
| run.ts role | Pre-flight, compile, create actor, wire inspect + sideband, wait | No hand-tracked state — machine snapshot is truth |
| Events | `story-done`, `gate-pass`, `gate-fail` derived from machine transitions | TUI reacts to machine state, not custom events |

**Visualization grammar (one row, ≤80 chars target):**
```
[scope] [N✓] → step… → ⟲gate(iter/max P✓F✗) → step → …N more
```
- Scope prefix: `Epic N [s/t]` when nested, nothing for single-level
- Sliding window: max 5 step slots visible
- Gate: `⟲name(iter/max)` with consensus detail
- Colors: dim=done, bold=active, red=failed, yellow=retrying

### AD6: File Organization (NFR18: ≤300 lines)

| File | Responsibility | Est. Lines |
|------|---------------|------------|
| `workflow-compiler.ts` | YAML → MachineConfig. `compileFlow`, `compileStep`, `compileGate`, `compileForEach` | ~200 |
| `workflow-machines.ts` | Machine definitions using `setup()` + `createMachine()` for run/epic/story/gate | ~250 |
| `workflow-actors.ts` | `fromPromise` actors: `dispatchActor`, `nullTaskActor` + types | ~200 |
| `workflow-visualizer.ts` | Pure visualizer: snapshot → one-row string | ~150 |
| `workflow-persistence.ts` | Dual-layer: XState snapshot + checkpoint log | ~150 |
| `workflow-runner.ts` | `runWorkflowActor(config)` — pre-flight, compile, instantiate, run, return | ~150 |
| `workflow-types.ts` | Shared types: contexts, events, configs, results | ~100 |

### Decision Impact Analysis

**Implementation sequence:**
1. `workflow-types.ts` — shared types (no deps)
2. `workflow-actors.ts` — dispatch/null actors (depends on types)
3. `workflow-compiler.ts` — YAML → MachineConfig (depends on types)
4. `workflow-machines.ts` — machine definitions (depends on compiler, actors, types)
5. `workflow-persistence.ts` — snapshot + checkpoint (depends on types)
6. `workflow-visualizer.ts` — snapshot → string (depends on types)
7. `workflow-runner.ts` — orchestrator (depends on all above)

**Cross-component dependencies:**
- Compiler output (MachineConfig) is consumed by machines and visualizer
- Actor types are shared between compiler (for invoke config) and runner (for instantiation)
- Persistence reads/writes snapshots that machines produce
- Visualizer reads snapshots that the inspect API provides

## Implementation Patterns & Consistency Rules

### Critical Conflict Points

7 areas where AI agents could make different choices that break consistency.

### 1. XState Machine Patterns

- **Always** use `setup()` + `createMachine()` — never bare `createMachine()`
- **Always** `assign()` for context updates — spread/concat, never in-place mutation (`push`, `add`)
- **Always** separate side effects from `assign()` — use action arrays: `entry: [assign(...), sideEffectFn]`
- **Never** put async work in actions or guards — only in `fromPromise` actors

### 2. Actor Patterns

- All async I/O goes through `fromPromise` actors
- Every `invoke` must handle both `onDone` and `onError`
- Every `onError` must check `isAbortError` guard first, then `isHaltError`, then generic error
- Actor input is typed and built from context via input function

### 3. Guard Patterns

- Guards are pure functions on context — no I/O, no side effects, no logging
- Guards used in `evaluate` states for gate exit conditions: `allPassed`, `maxRetries`, `circuitBreaker`
- Guards used in `checkNext` states for iteration: `hasMoreItems`

### 4. Compiler Patterns

- Compiler functions are pure: YAML in, MachineConfig out. No I/O, no state.
- Exhaustive pattern matching on step types: `string` → task, `gate` → negotiation, `for_each` → iteration
- Unknown step types throw `CompileError` at compile time
- Validation at compile time: reject zero check tasks, unknown task refs, unnamed gates

### 5. Context Boundary Pattern

- Data flows down as typed input, results flow up as typed output
- Parent creates child with typed input function on `invoke`
- Child returns typed output, parent merges via `assign` on `onDone`
- No shared mutable state between machine levels

### 6. Error Handling Pattern

- Use `WorkflowError` class (extends Error) with `code`, `taskName`, `storyKey` — never plain objects
- Error classification determines machine transition: `isAbortError` → interrupted, `isHaltError` → halted, otherwise → error + continue
- All errors recorded in context via `assign` — append to `errors` array with spread

### 7. YAML Flow Config Pattern

- Gates must be named: `gate: quality` not `gate:`
- Gates must specify: `check` (≥1 task), `fix` (≥1 task), `pass_when`, `max_retries`
- `for_each` must name scope: `for_each: story`
- `circuit_breaker` is optional, defaults to `stagnation`

### Enforcement

All AI agents MUST:
1. Use `setup()` + `createMachine()` for every machine
2. Use `assign()` with immutable updates for all context changes
3. Separate side effects from `assign()` into action arrays
4. Handle `onDone` + `onError` on every invoke
5. Keep guards pure
6. Keep compiler functions pure
7. Use typed context boundaries at every machine level
8. Use `WorkflowError` class, not plain objects
9. Name all gates in YAML config

## Project Structure & Boundaries

### File Tree

```
src/lib/
├── workflow-types.ts          # Shared types: contexts, events, configs, results (~100 lines)
├── workflow-compiler.ts       # YAML → MachineConfig, pure recursive (~200 lines)
├── workflow-machines.ts       # Machine defs: run, epic, story, gate (~250 lines)
├── workflow-actors.ts         # fromPromise actors: dispatch, null task (~200 lines)
├── workflow-visualizer.ts     # Snapshot → one-row TUI string, pure (~150 lines)
├── workflow-persistence.ts    # Dual-layer: XState snapshot + checkpoint log (~150 lines)
├── workflow-runner.ts         # runWorkflowActor() entry point (~150 lines)
├── workflow-parser.ts         # EXISTING — updated for for_each + gate format
├── workflow-state.ts          # EXISTING — kept for checkpoint log types
├── circuit-breaker.ts         # EXISTING — unchanged
├── __tests__/
│   ├── workflow-compiler.test.ts
│   ├── workflow-machines.test.ts
│   ├── workflow-actors.test.ts
│   ├── workflow-visualizer.test.ts
│   ├── workflow-persistence.test.ts
│   └── workflow-runner.test.ts
templates/workflows/
├── default.yaml              # Updated to for_each + gate format
src/commands/
├── run.ts                    # Simplified: compile, inspect bridge, wait
```

### Component Boundaries

| Component | Owns | Depends On | Depended On By |
|-----------|------|-----------|----------------|
| **workflow-types** | Types, interfaces | Nothing | Everything |
| **workflow-compiler** | YAML → MachineConfig | types | machines, runner |
| **workflow-actors** | Dispatch/null actors | types, drivers, trace, session | machines |
| **workflow-machines** | Machine definitions | types, actors, compiler | runner |
| **workflow-visualizer** | Snapshot → string | types | run.ts |
| **workflow-persistence** | Snapshot + checkpoint | types | runner |
| **workflow-runner** | Orchestration | all above | run.ts, lane-pool |

### Boundary Rules

1. **compiler** never imports machines, actors, or runner
2. **visualizer** never imports machines or runner
3. **actors** never imports machines
4. **runner** is the composition root — only file that creates actors and starts machines
5. **run.ts** imports only runner, visualizer, and types

### External Interface (Unchanged)

- `runWorkflowActor(config): Promise<EngineResult>` — same signature
- `EngineConfig`, `EngineResult` — same types
- `EngineEvent` — extended with `story-done`, `gate-pass`, `gate-fail`

### Migration Path

| Current | New | Action |
|---------|-----|--------|
| `workflow-machine.ts` (1100+ lines) | 7 files | Decompose |
| `workflow-parser.ts` | Updated for new format | Extend |
| `hierarchical-flow.ts` | Absorbed into compiler | Delete |
| `workflow-state.ts` | Kept for checkpoint types | Preserve |

## Architecture Validation

### Coherence: ✅ Pass
- All technology choices compatible (XState v5 + TypeScript strict + ESM)
- Patterns aligned: pure functional core (compiler, visualizer, guards) + I/O boundary (actors, actions)
- Boundaries hold: 7 files, clear dependency direction, no circular deps

### Requirements Coverage: ✅ All covered
- Multi-level flows → `for_each` compilation (AD1)
- Negotiation/consensus → `gate` compilation with verdict map (AD1, AD2)
- Crash resume → dual persistence (AD3)
- Interrupt → two-phase AbortSignal + INTERRUPT event (AD4)
- TUI visualization → inspect API + pure visualizer (AD5)
- Parallel epics → LanePool interface unchanged
- 8-hour stability → XState manages state, no drifting hand-tracked variables
- ≤300 line files → 7 files all under 250 estimated (AD6)
- Testability → compiler is pure, guards are pure, machines have typed transitions

### Gaps (Deferred)
- `pass_when: majority` — not in v1, `consensus` (all_pass) sufficient
- Nested gates — no current use case
- Escalation gate strategy — deferred per user input
- Stately Inspector UI — `inspect` API compatible, just needs wiring
- YAML backward compat — migration tool needed: old `loop:` → new `gate:`

### AI Agent Readiness: ✅ Ready
- Pure function signatures, typed boundaries, pattern matching rules all specified
- Two agents on different files cannot produce incompatible code — typed interfaces prevent it
