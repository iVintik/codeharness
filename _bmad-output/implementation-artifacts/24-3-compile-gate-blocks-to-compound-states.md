<story-spec>

# Story 24-3: Compile gate blocks to compound negotiation states

Status: draft

## Story

As a developer,
I want `compileGate(gateConfig, tasks)` to return a compound XState state config with a checking → evaluate → fixing cycle,
So that gates are real state machine structures with guards controlling exit — not imperative loops.

## Context

**Epic 24: Workflow Compiler** — this is story 3 of 5. Story 24-1 (shared types module) and 24-2 (compile plain task steps) are complete. This story implements the gate compilation primitive: turning a `GateConfig` into a compound XState state with child states that implement the check/evaluate/fix negotiation cycle.

**Current state:** `src/lib/workflow-compiler.ts` (233 lines) contains `compileStep()` (from story 24-2), pure helper functions, and re-exports. It has no gate compilation logic. The current `workflow-machines.ts` uses an imperative `loopIterationActor` (fromPromise) that manually iterates gate tasks in a for-loop with inline verdict parsing, circuit breaker evaluation, and halt detection. `compileGate` will replace this imperative approach with a declarative compound state config.

**What exists and is usable:**
- `workflow-types.ts` (260 lines): All shared types including `GateConfig`, `GateContext`, `StoryContext`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `EvaluatorVerdict`, `FlowStep`, `ResolvedTask`
- `workflow-compiler.ts`: `compileStep()` already compiles individual tasks to invoke states — `compileGate` will reuse it for check/fix tasks
- `workflow-actors.ts`: `dispatchActor` and `nullTaskDispatchActor` exported
- `workflow-machines.ts`: Current imperative `loopMachine` showing the check → evaluate → fix pattern (lines 100-154) with guards: `halted`, `verdictPass`, `maxIterations`, `circuitBreaker`
- `GateConfig` type: `{ gate: string; check: string[]; fix: string[]; pass_when: GatePassStrategy; max_retries: number; circuit_breaker: string }`
- `GateContext` type: `{ gate: GateConfig; config: EngineConfig; workflowState: WorkflowState; errors: EngineError[]; tasksCompleted: number; halted: boolean; lastContract: OutputContract | null; accumulatedCostUsd: number }`

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD1: `gate` → compound state: `checking → evaluate → fixing → checking` cycle with guards (`allPassed`, `maxRetries`, `circuitBreaker`)
- AD2: Gate structure uses guards on `evaluate` to control exit. Guards are pure functions on context — names are strings, implementations provided at `setup()` time.
- AD2: Verdicts accumulated in gate context map. Each check task's `onDone` adds its verdict via `assign`.
- AD2: Every `onError` must check `isAbortError` guard first, then `isHaltError`, then generic error.
- AD6: `workflow-compiler.ts` ≤ 300 lines, zero imports from actors/machines/runner/persistence.

**Target compound state structure (from epic story 2.3):**
```
compileGate(gateConfig, tasks) → {
  initial: 'checking',
  states: {
    checking: { /* sequential invoke of check tasks, each onDone adds verdict */ },
    evaluate: {
      always: [
        { guard: 'allPassed', target: 'passed' },
        { guard: 'maxRetries', target: 'maxedOut' },
        { guard: 'circuitBreaker', target: 'halted' },
        { target: 'fixing' }
      ]
    },
    fixing: { /* sequential invoke of fix tasks, onDone → checking */ },
    passed: { type: 'final' },
    maxedOut: { type: 'final' },
    halted: { type: 'final' },
    interrupted: { type: 'final' }
  }
}
```

**Dependencies:** Stories 24-1 and 24-2 complete. `compileStep` is available for compiling individual check/fix tasks. `GateConfig` and `GateContext` types exist.

**Current test baseline:** 5053+ tests passing. Build exits 0.

## Acceptance Criteria

1. **Given** a workflow YAML file containing a `gate: quality` block with `check: [check, review]`, `fix: [retry]`, `pass_when: consensus`, `max_retries: 5`, **When** `npm run build` is executed, **Then** it exits 0 with zero TypeScript errors — the new `compileGate` function compiles cleanly.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all tests pass with zero failures — no regressions from adding gate compiler logic.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. **Given** a test that compiles a gate config with multiple check tasks, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled gate has a `checking` child state that invokes check tasks sequentially — each check task appears as a distinct invoke state within the checking phase.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*checking.*check" or equivalent -->

4. **Given** a test that compiles a gate config, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled gate has an `evaluate` child state with guard-based transitions: `allPassed` → `passed`, `maxRetries` → `maxedOut`, `circuitBreaker` → `halted`, and a default fallback → `fixing`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*evaluate.*guard" or equivalent -->

5. **Given** a test that compiles a gate config with fix tasks, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled gate has a `fixing` child state that invokes fix tasks and transitions back to `checking` upon completion.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*fixing.*checking" or equivalent -->

6. **Given** a test that compiles a gate config, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the compiled gate has four final states: `passed`, `maxedOut`, `halted`, and `interrupted` — all with `type: 'final'`.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*final.*passed.*maxedOut.*halted.*interrupted" or equivalent -->

7. **Given** a test that compiles a gate with `check: [check, review]`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming each check task's `onDone` handler accumulates a verdict entry in the gate context — the checking phase records per-task verdicts before transitioning to evaluate.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*verdict.*assign" or equivalent -->

8. **Given** a test that compiles a gate with a check task referencing a task name not in the tasks map, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming an error is thrown at compile time — not deferred to runtime.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*unknown.*throws" or equivalent -->

9. **Given** a test that compiles a gate with a fix task referencing a task name not in the tasks map, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming an error is thrown at compile time.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*unknown.*fix.*throws" or equivalent -->

10. **Given** a test that compiles a gate where all check tasks have `agent: null`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the check task invoke states use `nullTaskActor` as the source — not `dispatchActor`.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*null.*nullTaskActor" or equivalent -->

11. **Given** a test that compiles the same gate config twice with identical inputs, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming identical outputs — `compileGate` is pure and deterministic with no side effects.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*pure.*deterministic" or equivalent -->

12. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `npx eslint src/lib/workflow-compiler.ts` is executed, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-compiler.ts` exits 0 -->

13. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `wc -l src/lib/workflow-compiler.ts` is executed, **Then** the file is ≤ 300 lines (per NFR3 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-compiler.ts` shows ≤ 300 -->

14. **Given** a test that compiles a gate with `check: [check]` (single check task) and `fix: [retry]`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the checking phase has exactly one invoke state (not a sequential chain) and the fixing phase has exactly one invoke state.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileGate.*single.*check.*single.*fix" or equivalent -->

## Tasks / Subtasks

### T1: Design the `compileGate` function signature and return type

- Define `compileGate(gate: GateConfig, tasks: Record<string, ResolvedTask>): CompiledGateState`
- The return type is a compound XState `StateNodeConfig` with child states (checking, evaluate, fixing, passed, maxedOut, halted, interrupted)
- Define `CompiledGateState` interface (or extend existing `CompiledInvokeState` pattern) to represent the compound state shape
- The function must be exported from `workflow-compiler.ts`

### T2: Implement the `checking` child state

- The checking phase invokes each check task sequentially
- For N check tasks, create N invoke states chained: `check_0` → `check_1` → ... → `check_N-1` → (transition to `evaluate`)
- Each check task is compiled using existing `compileStep()` but with `onDone` that also records the task's verdict in the gate context via `assign`
- The verdict assignment merges `event.output` verdict into a `verdicts` map keyed by task name
- Use `dispatchActor` for agent tasks, `nullTaskActor` for null tasks (delegated to `compileStep`)

### T3: Implement the `evaluate` child state

- The evaluate state uses `always` transitions with guards (no invoke, immediate evaluation)
- Guard chain in priority order:
  1. `{ guard: 'allPassed', target: 'passed' }` — all verdicts in the map are 'pass'
  2. `{ guard: 'maxRetries', target: 'maxedOut' }` — iteration count >= gate.max_retries
  3. `{ guard: 'circuitBreaker', target: 'halted' }` — circuit breaker triggered
  4. `{ target: 'fixing' }` — default fallback, start fix cycle
- Guard names are strings — implementations provided at `setup()` time by the machine layer
- The evaluate state may also include an `entry` action to increment the iteration counter via `assign`

### T4: Implement the `fixing` child state

- The fixing phase invokes each fix task sequentially (same pattern as checking)
- For M fix tasks, create M invoke states chained: `fix_0` → `fix_1` → ... → `fix_M-1` → (transition back to `checking`)
- The transition back to `checking` resets the verdicts map for the next evaluation round
- Each fix task is compiled using `compileStep()` with appropriate `onDone`/`onError`

### T5: Implement final states

- `passed`: `{ type: 'final' }` — gate quality criteria met
- `maxedOut`: `{ type: 'final' }` — max retries exceeded without passing
- `halted`: `{ type: 'final' }` — circuit breaker triggered (stagnation detected)
- `interrupted`: `{ type: 'final' }` — abort signal received

### T6: Implement compile-time validation

- If any task in `gate.check` is not found in `tasks` map, throw a descriptive error at compile time
- If any task in `gate.fix` is not found in `tasks` map, throw a descriptive error at compile time
- The error should identify which gate and which task reference is invalid
- Use plain `Error` (not `WorkflowError` — that's for runtime errors)

### T7: Add comprehensive unit tests

- Create or extend `src/lib/__tests__/workflow-compiler.test.ts`
- Test: gate with multiple check tasks produces sequential checking substates
- Test: evaluate state has correct guard chain (allPassed → maxRetries → circuitBreaker → fixing)
- Test: fixing phase transitions back to checking
- Test: four final states exist (passed, maxedOut, halted, interrupted)
- Test: check task onDone accumulates verdicts in context
- Test: unknown check task throws at compile time
- Test: unknown fix task throws at compile time
- Test: null agent check tasks use nullTaskActor
- Test: single check + single fix produces one invoke each
- Test: pure/deterministic — same inputs produce same outputs
- All tests use structural assertions on the returned config object

### T8: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint src/lib/workflow-compiler.ts` exits 0
- `wc -l src/lib/workflow-compiler.ts` ≤ 300 lines
- `npx vitest run` — all tests pass, zero regressions

## Dev Notes

### compileGate produces a compound state config, not a machine instance

`compileGate` returns a plain object describing a compound XState state node with child states. It does NOT call `setup()` or `createMachine()`. The returned config will be embedded into a parent machine config by `compileFlow` (story 24-5) or the story machine layer.

### Reuse compileStep for check and fix tasks

Each individual check/fix task is a plain task step. Use the existing `compileStep()` to compile each one into an invoke state. The gate wrapping (verdict recording, evaluate guards, cycle transitions) is what `compileGate` adds on top.

However, check tasks need a modified `onDone` that also records verdicts. This means `compileGate` may need to augment the output of `compileStep` — either by wrapping it, or by passing an additional `onDone` action. Consider whether `compileStep` should accept an optional extra `onDone` action, or whether `compileGate` should construct the invoke states directly (duplicating some of `compileStep`'s logic).

### Guard names are strings, not functions

The compiled gate config references guards by name: `'allPassed'`, `'maxRetries'`, `'circuitBreaker'`. The actual guard implementations are provided when the machine is created via `setup({ guards: { ... } })` in the machine definition layer. This keeps the compiler pure.

### Verdicts map in gate context

The `GateContext` type does not currently have a `verdicts` field. The compiler may need to assume the gate context will be extended with `verdicts: Record<string, EvaluatorVerdict>` (or similar) when the machine layer implements the gate machine (epic 25 / story 4.1). The compiler produces `assign` actions that write to this field — the machine `setup()` must ensure the context type includes it.

If extending `GateContext` is needed, it should be done in `workflow-types.ts` as a minimal addition — add `verdicts: Record<string, string>` or `verdicts: Map<string, Verdict>` to `GateContext`.

### Sequential task chaining within checking and fixing phases

For a gate with `check: ['check', 'review']`, the checking phase needs two invoke states chained sequentially. This is the same pattern that `compileFlow` (story 24-5) will implement for top-level step chaining. Consider factoring out a `chainSteps()` helper that both `compileGate` and `compileFlow` can use, or implement the chaining inline in `compileGate` and extract it later in story 24-5.

### Iteration counter

The gate needs to track how many check/fix cycles have occurred (for `maxRetries` guard). This is likely an `iteration` field in the gate context, incremented on each transition from `fixing` back to `checking` (or in the `evaluate` entry action). The compiler produces the `assign` action that increments it.

### What this story does NOT do

- Does not compile `for_each` blocks (story 24-4)
- Does not implement `compileFlow` to chain top-level steps (story 24-5)
- Does not implement guard functions (`allPassed`, `maxRetries`, `circuitBreaker`) — those are machine-layer concerns
- Does not implement the actual gate machine with `setup()` + `createMachine()` — that's epic 25 / story 4.1
- Does not change runtime behavior of existing machines — this adds new functions alongside existing ones
- Does not implement verdict parsing from dispatch output — the compiler produces the `assign` structure, the actor output provides the verdict data

### File size budget

The current file is 233 lines. The gate compiler will add substantial logic (checking chain, evaluate, fixing chain, final states, validation). Budget approximately 60-70 additional lines. If the file approaches 300 lines, extract shared helpers (e.g., `chainSteps()`) or move the `CompiledGateState` interface to `workflow-types.ts`.

## Verification Requirements

- [ ] All acceptance criteria verified via CLI commands (npm run build, npx vitest run, npx eslint, wc -l)
- [ ] Proof document at `verification/24-3-compile-gate-blocks-to-compound-states-proof.md`
- [ ] Evidence is reproducible — all verification commands can be re-run

## Documentation Requirements

- [ ] Inline JSDoc on `compileGate` explaining parameters, return value, and compound state structure
- [ ] Per-subsystem AGENTS.md updated if workflow-compiler scope changed
- [ ] Exec-plan created at `docs/exec-plans/active/24-3-compile-gate-blocks-to-compound-states.md`

## Testing Requirements

- [ ] Tests written for all new code (compileGate checking chain, evaluate guards, fixing cycle, final states, validation)
- [ ] All tests passing — zero regressions
- [ ] Test file ≤ 300 lines (per NFR3)

</story-spec>
