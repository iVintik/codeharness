<story-spec>

# Story 24-2: Compile plain task steps to invoke states

Status: draft

## Story

As a developer,
I want `compileStep(stepName, tasks, nextState)` to return an XState state config that invokes the dispatch actor with onDone/onError transitions,
So that each plain task in a workflow flow becomes a real XState invoke state with proper error classification guards.

## Context

**Epic 24: Workflow Compiler** — this is story 2 of 5. Story 24-1 (shared types module) is complete. This story implements the core primitive: compiling a single task name string into an XState `StateNodeConfig` with invoke, onDone, and onError.

**Current state:** `src/lib/workflow-compiler.ts` (95 lines) contains only pure helper functions (`isTaskCompleted`, `buildRetryPrompt`, `recordErrorInState`, etc.) and re-exports from `workflow-types.ts`. It has zero compilation logic. The current `workflow-machines.ts` uses imperative `fromPromise` actors that manually iterate tasks — the compiler will replace this with declarative state configs.

**What exists and is usable:**
- `workflow-types.ts` (260 lines): All shared types including `ResolvedTask`, `DispatchInput`, `DispatchOutput`, `NullTaskInput`, `StoryContext`, `GateContext`, `FlowStep`, `GateConfig`, `ForEachConfig`, `EngineError`, `WorkflowError`
- `workflow-actors.ts`: `dispatchActor` (fromPromise<DispatchOutput, DispatchInput>) and `nullTaskDispatchActor` (fromPromise<DispatchOutput, NullTaskInput>) already exported
- `workflow-machines.ts`: Current imperative machines showing the existing onError guard pattern (`isAbortError` first, `isHaltError` second, then generic error recording)

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD1: Plain task string → invoke state with `fromPromise(dispatchActor)`. Null task (agent: null) → invoke state with `fromPromise(nullTaskActor)`.
- AD1: Compiler is pure — YAML in, MachineConfig out. No I/O, no state, no side effects.
- AD2: Every `onError` must check `isAbortError` guard first, then `isHaltError`, then generic error.
- AD2: `assign()` on `onDone` merges actor output into parent context (immutable spread).
- AD2: Actor input is typed and built from context via input function.
- AD6: `workflow-compiler.ts` ≤ 300 lines, zero imports from actors/machines/runner/persistence.

**Compiler signature (from AD1):**
```typescript
compileStep(step: string, tasks: Record<string, ResolvedTask>, nextState: string): StateNodeConfig
```

**Expected output shape for an agent task:**
```typescript
{
  invoke: {
    src: 'dispatchActor',
    input: /* pure function deriving DispatchInput from context */,
    onDone: {
      target: nextState,
      actions: assign(/* merge DispatchOutput into context */)
    },
    onError: [
      { guard: 'isAbortError', target: 'interrupted' },
      { guard: 'isHaltError', target: 'halted', actions: assign(/* record error, set halted */) },
      { actions: assign(/* record error in context, continue to next */) }
    ]
  }
}
```

**Expected output shape for a null task (agent: null):**
```typescript
{
  invoke: {
    src: 'nullTaskActor',
    input: /* pure function deriving NullTaskInput from context */,
    onDone: { /* same pattern */ },
    onError: [ /* same guard chain */ ]
  }
}
```

**Dependencies:** Story 24-1 complete. `workflow-types.ts` has all needed types. `workflow-actors.ts` has both actors exported.

**Current test baseline:** 5053+ tests passing. Build exits 0.

## Acceptance Criteria

1. **Given** the project repository, **When** `npm run build` is executed, **Then** it exits 0 with zero TypeScript errors.
   <!-- verification: `npm run build` exits 0 -->

2. **Given** the full test suite, **When** `npx vitest run` is executed, **Then** all tests pass with zero failures — no regressions from adding compiler logic.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. **Given** a test that calls `compileStep` with a plain task name (e.g. `'implement'`) where the task has `agent: 'dev'`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the returned state config uses `src: 'dispatchActor'` as the invoke source.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*agent.*dispatchActor" or equivalent -->

4. **Given** a test that calls `compileStep` with a task name where the task has `agent: null`, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the returned state config uses `src: 'nullTaskActor'` as the invoke source.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*null.*nullTaskActor" or equivalent -->

5. **Given** a test that calls `compileStep` with a valid task name and a `nextState` target, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming `onDone.target` equals the provided `nextState` string.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*onDone.*target" or equivalent -->

6. **Given** a test that inspects the `onError` array of a compiled step, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming: the first entry has guard `'isAbortError'` targeting `'interrupted'`, the second entry has guard `'isHaltError'` targeting `'halted'`, and a fallback entry exists that records the error in context.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*onError.*guard.*abort.*halt" or equivalent -->

7. **Given** a test that calls `compileStep` with an agent task, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the `onDone` handler uses an `assign` action that merges `DispatchOutput` fields (updated state, errors, tasksCompleted, lastContract, accumulatedCostUsd) into the parent context.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*onDone.*assign.*context" or equivalent -->

8. **Given** a test that calls `compileStep` with an unknown task name not present in the tasks map, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming an error is thrown at compile time (not at runtime).
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*unknown.*throws" or equivalent -->

9. **Given** a test that calls `compileStep` with different task names, **When** `npx vitest run --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the invoke `input` function produces a `DispatchInput` (for agent tasks) or `NullTaskInput` (for null tasks) derived from the machine context — not hardcoded values.
   <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*input.*context" or equivalent -->

10. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `npx eslint src/lib/workflow-compiler.ts` is executed, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-compiler.ts` exits 0 -->

11. **Given** `src/lib/workflow-compiler.ts` after the change, **When** `wc -l src/lib/workflow-compiler.ts` is executed, **Then** the file is ≤ 300 lines (per NFR3 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-compiler.ts` shows ≤ 300 -->

12. **Given** `compileStep` is a pure function, **When** tests call it with the same inputs multiple times, **Then** verbose test output shows a passing test confirming identical outputs each time — no side effects, no I/O, no state mutation.
    <!-- verification: `npx vitest run --reporter=verbose` shows a passing test for "compileStep.*pure.*deterministic" or equivalent -->

## Tasks / Subtasks

### T1: Design the `compileStep` function signature and return type

- Define `compileStep(step: string, tasks: Record<string, ResolvedTask>, nextState: string): StateNodeConfig`
- The return type is an XState `StateNodeConfig` object (plain data, not a machine instance)
- Determine whether to use XState's exported `StateNodeConfig` type or define a local `CompiledStateConfig` interface
- The function must be exported from `workflow-compiler.ts`

### T2: Implement agent task compilation (dispatchActor path)

- When `tasks[step].agent` is a non-null string, compile to `invoke: { src: 'dispatchActor' }`
- Build the `input` function: a pure function `({ context }) => DispatchInput` that maps from StoryContext (or parent context) to DispatchInput
- The input function must map: `task`, `taskName`, `storyKey` (from context.item.key), `definition` (from context.config.agents), `config`, `workflowState`, `previousContract` (from context.lastContract), `accumulatedCostUsd`
- Build `onDone`: target is `nextState`, action is `assign` that merges `event.output` fields into context (updatedState → workflowState, increment tasksCompleted, append errors, update lastContract, accumulate cost)
- Build `onError` guard chain (see T4)

### T3: Implement null task compilation (nullTaskActor path)

- When `tasks[step].agent === null`, compile to `invoke: { src: 'nullTaskActor' }`
- Build the `input` function: a pure function `({ context }) => NullTaskInput` that maps from context
- The NullTaskInput shape differs from DispatchInput — no `definition`, no `onStreamEvent`, no `storyFiles`, no `customPrompt`
- `onDone` and `onError` follow the same patterns as agent tasks

### T4: Implement the onError guard chain

- First guard: `{ guard: 'isAbortError', target: 'interrupted' }` — abort errors transition to interrupted final state
- Second guard: `{ guard: 'isHaltError', target: 'halted', actions: assign(...) }` — halt errors (RATE_LIMIT, NETWORK, SDK_INIT) set `halted: true` and record error in context
- Default fallback: `{ actions: assign(...) }` — record error in context `errors` array, but do NOT transition (execution continues to next step if the invoke retries or the machine handles it)
- Guard names are strings referencing guards that will be provided in `setup()` by the machine definition (story 24-4/24-5) — the compiler does NOT define the guard implementations

### T5: Implement compile-time validation

- If `step` is not found in `tasks` map, throw a descriptive error immediately (compile time, not runtime)
- If `tasks[step].agent` is a non-null string but `tasks[step].agent` is not a valid agent reference, the compiler should still compile (agent validation is a separate concern — the machine will handle missing agents at runtime)
- The error thrown should be a plain `Error` (not `WorkflowError` — that's for runtime errors)

### T6: Add comprehensive unit tests

- Create or extend `src/lib/__tests__/workflow-compiler.test.ts`
- Test: agent task produces `src: 'dispatchActor'`
- Test: null task produces `src: 'nullTaskActor'`
- Test: `onDone.target` equals provided `nextState`
- Test: `onError` array has isAbortError guard first, isHaltError second, fallback third
- Test: `onDone` action is an assign that merges output fields
- Test: unknown task name throws at compile time
- Test: input function produces correct shape from mock context
- Test: pure/deterministic — same inputs produce same outputs
- Test: the compiled config is a plain object (serializable, no functions embedded except input/actions)
- All tests use snapshot assertions or structural assertions on the returned config object

### T7: Verify build, lint, and file size

- `npm run build` exits 0
- `npx eslint src/lib/workflow-compiler.ts` exits 0
- `wc -l src/lib/workflow-compiler.ts` ≤ 300 lines
- `npx vitest run` — all tests pass, zero regressions

## Dev Notes

### Compiler produces config data, not machine instances

`compileStep` returns a plain object describing an XState state node. It does NOT call `setup()` or `createMachine()`. The returned config will be assembled into a full machine config by `compileFlow` (story 24-5), which will then be instantiated by the runner.

### Guard names are strings, not functions

The compiled config references guards by name (`'isAbortError'`, `'isHaltError'`). The actual guard implementations are provided when the machine is created via `setup({ guards: { isAbortError: ..., isHaltError: ... } })` in the machine definition layer (stories 24-4/24-5 or epic 25). This keeps the compiler pure — it produces data, not behavior.

### Actor source names are strings, not references

Similarly, `src: 'dispatchActor'` and `src: 'nullTaskActor'` are string references. The actual actor implementations are provided in `setup({ actors: { ... } })`. This is the standard XState v5 pattern and keeps the compiler free of actor imports.

### Input functions are the one exception to "pure data"

The `input` property on invoke configs is a function `({ context }) => ActorInput`. This function IS embedded in the compiled config. It must be a pure function that derives actor input from the parent machine's context. This is standard XState v5 — input functions are how you pass typed data to child actors.

### Action functions in assign

The `actions: assign(...)` calls produce XState action objects. These are technically functions, but they're pure transformations of context + event. The compiler creates them using XState's `assign()` helper, which is imported from 'xstate'. This is the only XState import the compiler needs.

### Relationship to existing helper functions

The existing helpers in `workflow-compiler.ts` (`isTaskCompleted`, `buildRetryPrompt`, `recordErrorInState`, etc.) are used by the current imperative machines. They will NOT be used by `compileStep` — the compiled state configs handle these concerns through XState's assign actions and guard checks. The helpers remain for backward compatibility until the imperative machines are fully replaced.

### What this story does NOT do

- Does not compile gate blocks (story 24-3)
- Does not compile for_each blocks (story 24-4)
- Does not implement `compileFlow` to chain steps (story 24-5)
- Does not create or modify XState machine instances (epic 25)
- Does not change runtime behavior of existing machines — this adds new functions alongside existing ones

## Verification Requirements

- [ ] All acceptance criteria verified via CLI commands (npm run build, npx vitest run, npx eslint, wc -l)
- [ ] Proof document at `verification/24-2-compile-task-steps-to-invoke-states-proof.md`
- [ ] Evidence is reproducible — all verification commands can be re-run

## Documentation Requirements

- [ ] Inline JSDoc on `compileStep` explaining parameters, return value, and usage
- [ ] Per-subsystem AGENTS.md updated if workflow-compiler scope changed
- [ ] Exec-plan created at `docs/exec-plans/active/24-2-compile-task-steps-to-invoke-states.md`

## Testing Requirements

- [ ] Tests written for all new code (compileStep agent path, null path, error guards, validation)
- [ ] All tests passing — zero regressions
- [ ] Test file ≤ 300 lines (per NFR3)

</story-spec>
