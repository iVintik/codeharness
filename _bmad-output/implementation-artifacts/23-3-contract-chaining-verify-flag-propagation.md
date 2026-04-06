<story-spec>

# Story 23-3: Contract Chaining & Verify Flag Propagation

Status: draft

## Story

As a workflow author,
I want each completed task's output contract to flow into the next task's prompt context, and verify flags (`tests_passed`, `coverage_met`) to propagate after `implement` tasks,
So that sequential tasks build on each other's results and the verify task can gate on test/coverage outcomes.

## Context

**Epic 23: Dispatch & Null Task Actors** — this is the third of 4 stories. Stories 23-1 and 23-2 validated the dispatch and null task actors individually. This story validates the *integration* between them: how contracts chain through the machine hierarchy and how verify flags propagate from `implement` tasks to session state.

**Current state:** Contract chaining is implemented across three layers:
1. **Actor layer** (`workflow-actors.ts`): `dispatchTaskCore()` calls `buildPromptWithContractContext(basePrompt, previousContract)` to inject the previous contract's output into the current task's prompt. It then calls `writeOutputContract()` to persist the contract to `.codeharness/contracts/`. `nullTaskCore()` does the same — writes contracts to disk and returns them in `DispatchOutput.contract`.
2. **Machine layer** (`workflow-machines.ts`): The `lastContract` field in machine context carries contracts between tasks. Each actor's `onDone` handler assigns the returned contract to context via `assign()`. The next task receives it as `previousContract` in its input.
3. **Verify flag layer** (`workflow-actors.ts`): `propagateVerifyFlags()` runs after `dispatchTaskCore()` for `implement` tasks only. It reads `testResults` from the contract, sets `session_flags.tests_passed` (when `failed === 0`) and `session_flags.coverage_met` (when `coverage >= target`).

**Architecture reference (AD cross-cutting concern #3):**
> Contract chaining — machine context holds `lastContract`. Each task reads from context, `onDone` assigns new contract. Pure context flow.

**Known issues from 23-2 review:**
- Story-level null task failures do not set `halted = true` in `storyFlowActor`, allowing `story-done` to emit after a null task error. This affects contract chain integrity — if a null task fails, the `lastContract` from before the failure is carried forward, not the failed task's contract. This story documents the behavior; story 23-4 will unify error handling.
- `propagateVerifyFlags()` is called with `testResults: null` for dispatch tasks that don't return test results, which causes an early return. This is correct behavior — only `implement` tasks with real test results should trigger flag propagation.

**Dependencies:** Story 23-1 (dispatch actor) and 23-2 (null task actor) validated. `buildPromptWithContractContext` from `output-contract.ts` stable. Session state management (`state.ts`) stable.

## Acceptance Criteria

1. **Given** a workflow with sequential tasks `create-story` (agent: story-creator) → `implement` (agent: dev), **When** both tasks complete successfully, **Then** `.codeharness/contracts/` contains contract JSON files for both tasks, and the `implement` contract's `output` field contains text referencing the `create-story` task's output (visible as injected contract context in the prompt).
   <!-- verification: run `codeharness run` with a two-task workflow, then `ls .codeharness/contracts/ | grep create-story` and `ls .codeharness/contracts/ | grep implement`; `cat` the implement contract and confirm the output references prior contract context -->

2. **Given** a workflow with tasks `implement` (agent: dev) → `telemetry` (agent: null) → `verify` (agent: evaluator), **When** all three tasks complete, **Then** `.codeharness/contracts/` contains contract files for all three tasks, each with a distinct `timestamp` and the correct `taskName`.
   <!-- verification: `ls .codeharness/contracts/` filtered for the three task names; `cat` each and verify taskName and timestamp fields are present and distinct -->

3. **Given** a workflow where task A completes and task B follows, **When** task B's contract is inspected, **Then** the `output` field of task B's contract contains text that references or incorporates content from task A's contract output — confirming the prompt included the previous contract's context.
   <!-- verification: run a sequential two-task workflow; `cat` both contract files; confirm task B's output contains phrases or data from task A's output, showing contract context injection -->

4. **Given** a workflow with a null task `telemetry` between two agent tasks, **When** all tasks complete, **Then** the agent task following `telemetry` receives `telemetry`'s contract as its previous context, confirmed by the downstream task's contract output referencing the null task's output content.
   <!-- verification: run workflow with agent → null → agent sequence; inspect downstream agent's contract output for references to null task output -->

5. **Given** a task `implement` completes with test results showing `failed: 0` and `coverage` ≥ the configured target, **When** the workflow state is inspected after that task, **Then** `codeharness status --story <key>` or the state file shows `session_flags.tests_passed: true` and `session_flags.coverage_met: true`.
   <!-- verification: after implement task completes successfully with passing tests, run `codeharness status --story <key>` or `cat .codeharness/state.yaml` and verify session_flags -->

6. **Given** a task `implement` completes with test results showing `failed: 3`, **When** the workflow state is inspected, **Then** `session_flags.tests_passed` remains `false` (or is absent), confirming flags are NOT set when tests fail.
   <!-- verification: after implement task with failing tests, inspect state file for session_flags.tests_passed — should be false or absent -->

7. **Given** a task `implement` completes with test results showing `coverage: null` (no coverage data), **When** the workflow state is inspected, **Then** `session_flags.coverage_met` remains `false` (or is absent), confirming the flag is NOT set when coverage is unavailable.
   <!-- verification: after implement task with null coverage, inspect state file for session_flags.coverage_met — should be false or absent -->

8. **Given** a task named `check` (not `implement`) completes with test results, **When** the workflow state is inspected after that task, **Then** `session_flags.tests_passed` and `session_flags.coverage_met` are NOT modified by the `check` task — only `implement` triggers flag propagation.
   <!-- verification: run workflow where check task produces test results; inspect state file before and after — session_flags should not change from check task -->

9. **Given** a workflow with 3+ sequential tasks that all complete, **When** the contracts directory is inspected, **Then** each contract file has a `timestamp` that is chronologically later than the previous task's contract `timestamp`, confirming sequential execution order.
   <!-- verification: `ls -lt .codeharness/contracts/` and `cat` each contract; compare timestamp fields to confirm chronological ordering -->

10. **Given** an `implement` task completes and sets `tests_passed: true`, **When** the `verify` task runs next, **Then** the verify task can observe `session_flags.tests_passed: true` in the state file (the flag was persisted before the verify task started).
    <!-- verification: after implement sets flags, inspect state file before verify runs (or after verify completes, confirm the verify contract's output references the passing test state) -->

11. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no TypeScript errors.
    <!-- verification: `npm run build` exits 0 -->

12. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** all tests pass with zero failures — no regressions from contract chaining or verify flag changes.
    <!-- verification: `npx vitest run` exits 0 with 0 failures -->

13. **Given** `workflow-actors.ts` exists on disk, **When** its line count is checked, **Then** it contains ≤ 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-actors.ts` shows ≤ 300 -->

## Tasks / Subtasks

### T1: Validate contract chaining through machine context
- Confirm `lastContract` field exists in all machine context types: `LoopMachineContext`, `EpicMachineContext`, `RunMachineContext`, `StoryFlowInput/Output`
- Confirm each actor's `onDone` handler assigns the returned contract to `lastContract` via `assign(({ event }) => event.output)`
- Confirm `previousContract` is passed to `dispatchTaskCore()` and `nullTaskCore()` from the machine context's `lastContract`
- Confirm the chain flows across machine boundaries: run → epic → story → loop → task, and back up

### T2: Validate `buildPromptWithContractContext` integration
- Confirm `dispatchTaskCore()` calls `buildPromptWithContractContext(basePrompt, previousContract)` to inject contract context into the prompt
- Confirm the injected context includes the previous task's `output`, `taskName`, `changedFiles`, and `testResults`
- Confirm null tasks also pass `previousContract` to handlers via `TaskContext.outputContract`

### T3: Validate contract file persistence
- Confirm `dispatchTaskCore()` calls `writeOutputContract(contract, contractsDir)` after dispatch completes
- Confirm `nullTaskCore()` calls `writeOutputContract(contract, contractsDir)` after handler completes
- Confirm contract files are named consistently (e.g., `<taskName>-<storyKey>.json`)
- Confirm all contract fields are populated: `version`, `taskName`, `storyId`, `driver`, `model`, `timestamp`, `cost_usd`, `duration_ms`, `changedFiles`, `testResults`, `output`, `acceptanceCriteria`

### T4: Validate verify flag propagation
- Confirm `propagateVerifyFlags()` is called after `dispatchTaskCore()` completes (line 197 in workflow-actors.ts)
- Confirm it only triggers for `taskName === 'implement'` — all other task names return early
- Confirm it only triggers when `contract?.testResults` is truthy — null test results return early
- Confirm `tests_passed` set to `true` when `failed === 0`
- Confirm `coverage_met` set to `true` when `coverage >= state.coverage.target`
- Confirm flags are NOT set when `failed > 0` (tests_passed stays false)
- Confirm flags are NOT set when `coverage === null` (coverage_met stays false)
- Confirm state is persisted via `writeState()` after flag updates

### T5: Validate contract chaining across null task boundaries
- Confirm null task contracts are included in the chain: agent → null → agent flows correctly
- Confirm `nullTaskCore()` returns `contract` in `DispatchOutput` that the machine assigns to `lastContract`
- Confirm the downstream agent task receives the null task's contract as `previousContract`
- Confirm `buildPromptWithContractContext()` works with null task contracts (driver: "engine", model: "null")

### T6: Validate error impact on contract chain
- Confirm that when a task fails, `lastContract` retains the last successful task's contract (not null)
- Confirm story-level null task failures break out of the story flow via `break` (line 232 in workflow-machines.ts)
- Confirm loop-level null task failures set `haltedInLoop = true` and break the loop
- Confirm epic-level null task failures set `halted = true`
- Note: story-level null task failure does NOT set `halted = true` — `story-done` still emits. This is a known issue documented in story 23-2 review; story 23-4 will address.

### T7: Add contract chaining integration tests
- Test: sequential dispatch tasks pass contracts through `lastContract` → `previousContract`
- Test: null task between dispatch tasks preserves contract chain
- Test: `propagateVerifyFlags` with `failed: 0, coverage: 95` (target: 90) sets both flags
- Test: `propagateVerifyFlags` with `failed: 3` does NOT set `tests_passed`
- Test: `propagateVerifyFlags` with `coverage: null` does NOT set `coverage_met`
- Test: `propagateVerifyFlags` with taskName !== 'implement' does nothing
- Test: contract files written to disk for both dispatch and null tasks
- Test: contract `timestamp` ordering matches execution order

### T8: Ensure build and code quality
- Run `npx vitest run` — zero failures
- Run `npm run build` — zero errors
- Confirm `workflow-actors.ts` ≤ 300 lines

## Dev Notes

### Contract chaining flow (end-to-end)

The full contract chain works as follows:
1. Machine creates actor input with `previousContract: context.lastContract`
2. Actor calls `buildPromptWithContractContext(basePrompt, previousContract)` — injects prior output into prompt
3. Actor dispatches to driver / executes null task handler
4. Actor creates `OutputContract` with task results
5. Actor calls `writeOutputContract()` to persist to `.codeharness/contracts/`
6. Actor returns `{ contract, ... }` in `DispatchOutput`
7. Machine's `onDone` assigns `event.output` to context (includes `lastContract: contract`)
8. Next task starts at step 1 with the new `lastContract`

### Verify flag propagation is dispatch-only

`propagateVerifyFlags()` is called only after `dispatchTaskCore()` — never after `nullTaskCore()`. This is correct: null tasks don't produce test results. Only agent-dispatched `implement` tasks should trigger flag propagation.

### Known gap: `testResults` is always `null` from actors

Both `dispatchTaskCore()` and `nullTaskCore()` set `testResults: null` in the output contract they construct. The actual `testResults` field is populated later by the evaluator/checker when parsing the agent's output. This means `propagateVerifyFlags()` — which runs immediately after `dispatchTaskCore()` — always receives `testResults: null` and returns early. The flags are actually set by a separate path (the evaluator writes test results, then the engine reads them). This needs validation: confirm that the verify flag mechanism works end-to-end despite `testResults: null` in the immediate contract.

### Machine context carries contracts across all levels

The `lastContract` field flows through:
- `RunMachineContext.lastContract` → `EpicMachineContext.lastContract` → `StoryFlowInput.lastContract` → `LoopMachineContext.lastContract`
- Each level's `onDone` handler uses `assign(({ event }) => event.output)` to merge the entire actor output (including `lastContract`) back into context
- This means contracts propagate both forward (task to task) and upward (story to epic to run)

### Story-level null task failure does not halt

In `storyFlowActor` (workflow-machines.ts line 230), a null task failure catches the error and `break`s out of the story flow loop, but does NOT set `halted = true`. The `story-done` event still emits at line 251. This means the epic continues to the next story even though the current story had a null task failure. The `lastContract` after the failure is whatever it was before the null task ran — not the failed task's contract (failed tasks don't produce contracts).

### Coverage deduplication context

`buildCoverageDeduplicationContext()` is an additional prompt enrichment for `implement` tasks that have already met coverage targets. It reads the state file to check `coverage_met` and appends a message telling the agent not to re-instrument already-covered code. This only fires if `propagateVerifyFlags()` previously set `coverage_met = true`.

### File size budget
Current `workflow-actors.ts`: 204 lines. Budget: 300 lines. ~96 lines of headroom. This story is primarily validation — minimal code changes expected.

### References
- [Source: architecture-xstate-engine.md — Cross-cutting concern #3: Contract chaining]
- [Source: epics-xstate-engine.md — Epic 3, Story 3.3 contract chaining spec]
- [Source: src/lib/workflow-actors.ts — dispatchTaskCore, nullTaskCore, propagateVerifyFlags]
- [Source: src/lib/workflow-machines.ts — lastContract flow through machine hierarchy]
- [Source: src/lib/workflow-types.ts — DispatchInput.previousContract, DispatchOutput.contract]
- [Source: src/lib/agents/output-contract.ts — buildPromptWithContractContext, writeOutputContract]
- [Source: verification/16-4-verify-flag-propagation-proof.md — prior verify flag validation]

</story-spec>
