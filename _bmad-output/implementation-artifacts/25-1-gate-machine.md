<story-spec>

# Story 25-1: Create gate machine

Status: review

## Story

As a developer,
I want a `gateMachine` created via `setup()` + `createMachine()` that implements the checking → evaluate → fixing cycle,
So that gates are real XState compound state machines with typed context, pure guards, and proper transitions — replacing the imperative `loopIterationActor` approach.

## Context

**Epic 25: XState Machine Hierarchy** — this is story 1 of 5. Epic 24 (Workflow Compiler) is complete: `compileGate()` in `workflow-compiler.ts` produces a `CompiledGateState` config with `checking`, `evaluate`, `fixing`, and four final states (`passed`, `maxedOut`, `halted`, `interrupted`). Epic 23 (Actors) is complete: `dispatchActor` and `nullTaskDispatchActor` exist in `workflow-actors.ts`. All shared types exist in `workflow-types.ts`.

**What exists and is usable:**
- `workflow-types.ts` (280 lines): `GateConfig`, `GateContext` (with `verdicts: Record<string, string>`, `parentItemKey?`), `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `EvaluatorVerdict`, `WorkflowError`, `EngineError`, all guard-relevant types
- `workflow-compiler.ts` (259 lines): `compileGate()` produces `CompiledGateState` — the structural config. Guard names are strings (`allPassed`, `maxRetries`, `circuitBreaker`). Error guards: `isAbortError`, `isHaltError`. Uses `getCachedGateInput()` for typed input functions and `getGateOnDoneAssign()`/`getGateErrorAssign()` for cached assign actions.
- `workflow-actors.ts`: `dispatchTaskCore()`, `nullTaskCore()` — the async I/O functions that `fromPromise` actors will wrap
- `workflow-machines.ts` (400 lines): Current imperative `loopMachine` with `loopIterationActor` — the legacy approach this story replaces at the gate level. Contains `executeLoopBlock()` used by `storyFlowActor` and `epicStepActor`.
- `circuit-breaker.ts`: `evaluateProgress()` — determines stagnation from evaluator score history
- `verdict-parser.ts`: `parseVerdict()` — extracts `EvaluatorVerdict` from raw task output

**What this story builds:**
A real XState machine definition in `workflow-machines.ts` (or a new `workflow-gate-machine.ts` if file size demands) that:
1. Uses `setup()` + `createMachine()` with typed `GateContext`
2. Registers actors: `dispatchActor` (fromPromise wrapping `dispatchTaskCore`), `nullTaskActor` (fromPromise wrapping `nullTaskCore`)
3. Implements pure guards: `allPassed`, `maxRetries`, `circuitBreaker`, `isAbortError`, `isHaltError`
4. Runs the checking → evaluate → fixing → checking cycle
5. Handles `INTERRUPT` event at machine level → `interrupted` final state
6. Accumulates verdicts in `GateContext.verdicts` via `assign` on each check task `onDone`
7. Increments iteration counter on each cycle through evaluate
8. Returns gate result (pass/fail/halt status, updated state, cost) as machine output

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD2: Separate machines invoked as children. Gate machine receives typed input, returns typed output. Parent merges via `assign` on `onDone`.
- Pattern 1: Always `setup()` + `createMachine()` — never bare.
- Pattern 2: `assign()` with immutable updates — never in-place mutation.
- Pattern 3: Separate side effects from `assign()` — use action arrays.
- Pattern 4: Guards are pure functions on context — no I/O, no side effects.
- Pattern 5: Every invoke handles both `onDone` and `onError`. Every `onError` checks `isAbortError` first.
- AD4: `on: { INTERRUPT: '.interrupted' }` at every machine level.

**Dependencies:** Epics 21-24 complete. `compileGate` config structure is the blueprint. The gate machine instantiates what the compiler describes.

## Acceptance Criteria

1. **Given** the codebase after implementation, **When** `npm run build` is executed in the project root, **Then** it exits with code 0 and produces no TypeScript errors in the terminal output.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite, **When** `npx vitest run` is executed in the project root, **Then** the summary line shows zero failures and all tests pass — no regressions from adding the gate machine.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. **Given** a test that creates and starts a gate machine with all check tasks configured to return passing verdicts, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `passed` final state — the gate exited because all checks passed.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*machine.*passed" or "gate.*allPassed" -->

4. **Given** a test that creates and starts a gate machine where check tasks return failing verdicts and the iteration count equals `max_retries`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `maxedOut` final state — the gate exited because retry limit was hit.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*maxedOut" or "gate.*maxRetries" -->

5. **Given** a test that creates and starts a gate machine where the circuit breaker condition triggers, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `halted` final state — the gate exited due to stagnation detection.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*halted" or "gate.*circuitBreaker" -->

6. **Given** a test that creates and starts a gate machine and then sends an `INTERRUPT` event, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine reaches the `interrupted` final state — the gate stopped because it was interrupted.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*interrupted" or "gate.*INTERRUPT" -->

7. **Given** a test that creates and starts a gate machine where check tasks fail on the first cycle but pass on the second cycle, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine completes a full checking → evaluate → fixing → checking → evaluate → passed cycle — the fix-and-retry loop worked.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*cycle" or "gate.*fixing.*checking.*passed" -->

8. **Given** a test that creates a gate machine with two check tasks, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming both check tasks are invoked sequentially and each produces a verdict entry in the gate context — verdicts accumulate per check task.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*verdict" or "gate.*check.*sequential" -->

9. **Given** a test that creates a gate machine with a check task whose actor throws a halt error (e.g., `RATE_LIMIT`), **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine transitions to `halted` — halt errors from actors stop the gate.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*halt.*error" or "gate.*RATE_LIMIT.*halted" -->

10. **Given** the gate machine definition file, **When** `npx eslint` is run against it, **Then** it exits with code 0 and produces no lint errors.
    <!-- verification: `npx eslint src/lib/workflow-gate-machine.ts` (or workflow-machines.ts) exits 0 -->

11. **Given** the gate machine definition file, **When** its line count is checked, **Then** it contains ≤ 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l <file>` shows ≤ 300 -->

12. **Given** a test that creates a gate machine with `null` agent check tasks, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming null tasks are dispatched through the null task actor path — not the agent dispatch actor.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*null.*task" or "gate.*nullTask" -->

13. **Given** the gate machine source file, **When** its imports are inspected, **Then** it does not import from `workflow-runner.ts`, `workflow-visualizer.ts`, or `workflow-persistence.ts` — boundary rules are respected (machines depend on types, actors, compiler — not runner/viz/persistence).
    <!-- verification: `grep "from.*workflow-runner\|from.*workflow-visualizer\|from.*workflow-persistence" <file>` returns no matches -->

14. **Given** a test that creates a gate machine and runs it to completion, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the machine output includes updated `workflowState`, accumulated `errors`, `tasksCompleted` count, and `accumulatedCostUsd` — the gate returns structured results to its parent.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test matching "gate.*output" or "gate.*result" -->

## Tasks / Subtasks

### T1: Define gate machine guards as pure functions

- Implement `allPassed`: reads `context.verdicts` — returns true when every check task's verdict string contains a passing signal (parsed via `parseVerdict` or raw string match)
- Implement `maxRetries`: returns true when `context.workflowState.iteration >= context.gate.max_retries`
- Implement `circuitBreaker`: returns true when `context.workflowState.circuit_breaker.triggered`
- Implement `isAbortError`: returns true when error is `AbortError` instance
- Implement `isHaltError`: returns true when error is `DispatchError` with halt code (`RATE_LIMIT`, `NETWORK`, `SDK_INIT`)
- All guards are pure functions: context in, boolean out. No I/O, no side effects.

### T2: Define gate machine actors

- `dispatchActor`: `fromPromise` wrapping `dispatchTaskCore` — takes `DispatchInput`, returns `DispatchOutput`
- `nullTaskActor`: `fromPromise` wrapping `nullTaskCore` — takes `NullTaskInput`, returns `DispatchOutput`
- Reuse existing actor definitions from `workflow-actors.ts` if already exported as `fromPromise` actors, or create new wrappers

### T3: Create the gate machine with `setup()` + `createMachine()`

- Use `setup({ types, guards, actors, actions })` pattern
- Type the machine: `types: {} as { context: GateContext; input: GateInput; output: GateOutput }`
- Register guards from T1 and actors from T2
- Machine ID: `'gate'`
- Context initialized from input: `context: ({ input }) => input`
- Add top-level `on: { INTERRUPT: '.interrupted' }` for two-phase interrupt

### T4: Implement the checking state

- Compound state with sequential invoke substates for each check task
- Each check task invoke uses `dispatchActor` or `nullTaskActor` based on `task.agent`
- Each `onDone` merges verdict into `context.verdicts` via `assign` (immutable spread)
- Each `onDone` also updates `workflowState`, `lastContract`, `tasksCompleted`, `accumulatedCostUsd`
- Each `onError` chain: `isAbortError` → interrupted, `isHaltError` → halted, fallback → record error
- Last check task's `onDone` transitions to `evaluate`

### T5: Implement the evaluate state

- Eventless (`always`) transitions with guard priority chain:
  1. `{ guard: 'allPassed', target: 'passed' }`
  2. `{ guard: 'maxRetries', target: 'maxedOut' }`
  3. `{ guard: 'circuitBreaker', target: 'halted' }`
  4. `{ target: 'fixing' }` — default fallback
- Entry action: increment `context.workflowState.iteration` via `assign`
- Entry action: evaluate circuit breaker via side-effect action (calls `evaluateProgress`, updates `context.workflowState.circuit_breaker`)

### T6: Implement the fixing state

- Compound state with sequential invoke substates for each fix task
- Same actor dispatch pattern as checking
- Each `onDone` updates context (state, contract, cost)
- Each `onError` chain: same as checking
- On completion (all fix tasks done): transition back to `checking`
- Entry action: reset `context.verdicts` to empty `{}` for next evaluation round

### T7: Implement final states and machine output

- `passed`: `{ type: 'final' }` — all checks passed
- `maxedOut`: `{ type: 'final' }` — retry limit exceeded
- `halted`: `{ type: 'final' }` — circuit breaker or halt error
- `interrupted`: `{ type: 'final' }` — abort signal received
- Machine output: extract from context on completion — `{ workflowState, errors, tasksCompleted, halted, lastContract, accumulatedCostUsd, verdicts }`

### T8: Define input/output types

- Define `GateInput` type (or reuse `GateContext` as input) — what the parent passes in
- Define `GateOutput` type — what the parent receives on `onDone`
- Export both from `workflow-types.ts` or co-locate with machine
- Ensure parent machines can invoke gate machine with typed input and receive typed output

### T9: Write comprehensive unit tests

- Test: gate with all-pass verdicts → `passed` final state
- Test: gate hitting max_retries → `maxedOut` final state
- Test: gate with circuit breaker triggered → `halted` final state
- Test: INTERRUPT event → `interrupted` final state
- Test: full cycle: check-fail → evaluate → fix → check-pass → passed
- Test: multiple check tasks produce sequential verdicts in context
- Test: halt error from actor → `halted` state
- Test: null task check uses nullTaskActor path
- Test: machine output includes workflowState, errors, tasksCompleted, accumulatedCostUsd
- Test: guard purity — `allPassed` returns correct boolean for various verdict maps
- Test: guard purity — `maxRetries` returns correct boolean for iteration vs max_retries
- Use mocked actors (replace `dispatchTaskCore`/`nullTaskCore` with controlled fakes)
- All tests use XState `createActor` + `waitFor` or subscribe to completion

### T10: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint <gate-machine-file>` exits 0
- `wc -l <gate-machine-file>` ≤ 300 lines
- `npx vitest run` — all tests pass, zero regressions
- `grep` boundary check: no imports from runner/visualizer/persistence

## Dev Notes

### The gate machine instantiates what the compiler describes

`compileGate()` (story 24-3) produces a `CompiledGateState` — a plain config object describing the state structure. This story creates the actual XState machine that _uses_ that structure. The compiled config tells us the shape (checking → evaluate → fixing cycle with guard names). The machine definition provides the actual guard implementations, actor registrations, and context typing.

However, there are two valid approaches:
1. **Use `compileGate` output directly** — call `compileGate()` at machine creation time, pass the result into `createMachine()`. This maximizes reuse but couples the machine to the compiler.
2. **Define the machine structure independently** — the gate machine defines its own states matching the compiled pattern. The compiler is used for embedding gates inside parent flows, while the standalone gate machine defines the same pattern with real guards.

Approach 2 is likely cleaner — the gate machine is self-contained and testable without the compiler. The compiler output is consumed by parent machines (story 25-2+).

### Guard implementations

The compiler uses guard _names_ as strings. The machine provides guard _implementations_:

- `allPassed`: Parse each `context.verdicts[taskName]` string using `parseVerdict()` from `verdict-parser.ts`. If every verdict has `verdict: 'pass'`, return true. If verdicts map is empty, return false.
- `maxRetries`: `context.workflowState.iteration >= context.gate.max_retries`
- `circuitBreaker`: `context.workflowState.circuit_breaker.triggered`
- `isAbortError`: `event.error?.name === 'AbortError'`
- `isHaltError`: Check if error is `DispatchError` with code in `HALT_ERROR_CODES`

### Verdict accumulation pattern

Each check task's `onDone` runs an `assign` that spreads the new verdict into context:
```typescript
assign(({ context, event }) => ({
  verdicts: { ...context.verdicts, [taskName]: event.output.contract?.output ?? '' },
  workflowState: event.output.updatedState,
  lastContract: event.output.contract,
  tasksCompleted: context.tasksCompleted + 1,
  accumulatedCostUsd: context.accumulatedCostUsd + event.output.cost,
}))
```
This matches the `getGateOnDoneAssign()` pattern already in the compiler.

### Circuit breaker evaluation in evaluate state

The `evaluate` state entry action should:
1. Increment iteration counter: `assign({ workflowState: { ...state, iteration: state.iteration + 1 } })`
2. Call `evaluateProgress()` with current scores and update `circuit_breaker` in context
3. Then the `circuitBreaker` guard reads the updated `circuit_breaker.triggered` flag

Important: the `assign` that increments iteration must run BEFORE the `always` guard chain evaluates. XState v5 guarantees `entry` actions run before `always` transitions.

### File organization options

Current `workflow-machines.ts` is 400 lines — already over the 300-line NFR. Adding the gate machine there would push it further over. Options:
1. Create `workflow-gate-machine.ts` (~150-200 lines) — preferred, stays under 300
2. Refactor `workflow-machines.ts` to extract gate logic — risky mid-sprint

Recommend option 1: new file `src/lib/workflow-gate-machine.ts` with the gate machine definition, exported for use by story machines (story 25-2).

### What this story does NOT do

- Does not implement story machine, epic machine, or run machine (stories 25-2, 25-3, 25-4)
- Does not wire the gate machine into the parent story flow (story 25-5)
- Does not replace the existing `loopMachine`/`executeLoopBlock` — that happens when story machines adopt the gate machine
- Does not implement persistence (snapshot save/restore) — that's a separate concern
- Does not implement visualization — that reads snapshots, doesn't affect machine definition
- Does not change `workflow-compiler.ts` — the compiler is done (epic 24)

### Test strategy

Mock the async I/O boundary (actors) to make tests fast and deterministic:
- Create mock `dispatchActor` that returns controlled `DispatchOutput` with configurable verdict strings
- Create mock `nullTaskActor` that returns controlled output
- Use XState `createActor(gateMachine, { input: mockGateContext })` and subscribe to completion
- Assert final state via `actor.getSnapshot().value`
- Assert context values via `actor.getSnapshot().context`

## Verification Requirements

- [x] All acceptance criteria verified via CLI commands (npm run build, npx vitest run, npx eslint, wc -l)
- [x] Proof document at `verification/25-1-gate-machine-proof.md`
- [x] Evidence is reproducible — all verification commands can be re-run

## Documentation Requirements

- [x] Inline JSDoc on gate machine setup, guards, and exported factory
- [ ] Per-subsystem AGENTS.md updated if new file created
- [ ] Exec-plan created at `docs/exec-plans/active/25-1-gate-machine.md`

## Testing Requirements

- [x] Tests written for all new code (gate machine states, guards, transitions, output)
- [x] Tests cover all four final states (passed, maxedOut, halted, interrupted)
- [x] Tests cover the full fix-and-retry cycle
- [x] All tests passing — zero regressions
- [x] Test file ≤ 300 lines (per NFR18)

## Dev Agent Record

### Implementation Notes

- Created `src/lib/workflow-gate-machine.ts` (236 lines, within NFR18 ≤300 limit) with XState v5 `setup()` + `createMachine()` gate machine
- Used phase-level actors (`checkPhaseActor`, `fixPhaseActor`) as `fromPromise` wrappers that run all tasks sequentially — simpler and more testable than per-task substates
- Guards implemented as pure functions: `allPassed` (uses `parseVerdict`), `maxRetries`, `circuitBreaker`, `isAbortError`, `isHaltError`
- `evaluate` entry action increments iteration + evaluates circuit breaker in a single `assign` — XState v5 guarantees entry runs before `always` transitions
- Verdicts reset inside `fixPhaseActor` so next check phase starts fresh
- Exported `GateOutput` type co-located with machine; input reuses `GateContext` directly
- No imports from `workflow-runner.ts`, `workflow-visualizer.ts`, or `workflow-persistence.ts` (boundary respected)
- Test file `src/lib/__tests__/workflow-gate-machine.test.ts` (245 lines) — 13 tests covering all final states, fix-retry cycle, multi-task verdicts, null task path, halt error, machine output shape, nested-gate story keys, and interrupt signal propagation

### Verification Results

- `npm run build` — exits 0, no TypeScript errors
- `npx vitest run` — 5117 tests pass, 0 failures, 194 test files (no regressions)
- `npx eslint src/` — 0 warnings, 0 errors
- `wc -l src/lib/workflow-gate-machine.ts` — 236 lines (≤300 ✓)
- `wc -l src/lib/__tests__/workflow-gate-machine.test.ts` — 245 lines (≤300 ✓)
- Boundary check: no imports from runner/visualizer/persistence ✓

### File List

- `src/lib/workflow-gate-machine.ts` — new file: XState v5 gate machine definition
- `src/lib/__tests__/workflow-gate-machine.test.ts` — new file: 13 comprehensive unit tests
- `_bmad-output/implementation-artifacts/25-1-gate-machine.md` — status updated to review
- `verification/25-1-gate-machine-proof.md` — acceptance-criteria proof for this story

### Change Log

- 2026-04-06: Implemented story 25-1 — gate machine with checking → evaluate → fixing cycle, 4 final states, 5 pure guards, phase-level actors, 13 unit tests. Build clean, lint clean, all 5117 tests pass.

</story-spec>
