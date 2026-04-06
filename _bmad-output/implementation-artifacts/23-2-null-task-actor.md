<story-spec>

# Story 23-2: Null Task Actor Module

Status: draft

## Story

As a workflow author,
I want tasks with `agent: null` in my workflow YAML to execute through a typed XState `nullTaskDispatchActor`,
So that engine-handled tasks (telemetry, bookkeeping) cost zero tokens and follow the same invoke/contract/checkpoint pattern as agent-dispatched tasks.

## Context

**Epic 23: Dispatch & Null Task Actors** — this is the second of 4 stories. Story 23-1 validated and hardened the dispatch actor for agent tasks. This story covers the parallel path: null tasks that execute registered handlers directly in the engine without LLM dispatch.

**Current state:** `nullTaskCore()` already exists in `src/lib/workflow-actors.ts` (lines 35-63) and `nullTaskDispatchActor` is exported as `fromPromise(nullTaskCore)` at line 198. The null task registry (`src/lib/null-task-registry.ts`) provides `registerNullTask`, `getNullTask`, `listNullTasks`, and has a built-in `telemetry` handler. This story validates the null task actor against the architecture spec and hardens error handling, contract output, and checkpoint persistence.

**Key architectural decisions (from architecture-xstate-engine.md):**
- Null tasks use the same `fromPromise` actor pattern as dispatch tasks (AD2).
- `nullTaskActor = fromPromise<DispatchOutput, NullTaskInput>` — same typed interface, different actor.
- Null tasks produce `OutputContract` with `driver: "engine"`, `model: "null"`, `cost_usd: 0` — keeps contract chain intact.
- Null task errors should use `WorkflowError` class (architecture says so, but current code throws plain objects — this story documents the gap; story 23-4 will unify).
- Null tasks bypass driver health check, source isolation, session management, and trace ID generation.
- Null tasks still write `TaskCheckpoint` and `OutputContract` for crash recovery and contract chaining.

**Dependencies:** Story 23-1 (dispatch actor) complete. Null task registry (story 16-2) complete and stable.

**Review issues from 23-1 that affect null task path:**
- AC11 bug: `dispatchTaskCore()` writes `testResults: null` then calls `propagateVerifyFlags()` which returns early. This does NOT affect null tasks (null tasks don't call `propagateVerifyFlags`), but worth noting.
- The null task error path throws plain objects `{ code, message, taskName, storyKey }` instead of `WorkflowError` instances — story 23-4 will unify this.

## Acceptance Criteria

1. **Given** a workflow YAML with a task `telemetry` defined as `agent: null`, **When** `codeharness run` reaches that task in the flow, **Then** the terminal output or `docker logs` shows NO `dispatch-start` and NO `dispatch-end` log lines for `telemetry` — confirming the engine skipped driver dispatch entirely.
   <!-- verification: run `codeharness run` with a workflow containing agent:null task, grep terminal/logs for "dispatch-start" + "dispatch-end" filtered by taskName=telemetry — expect zero matches -->

2. **Given** a workflow with a null task `telemetry` that completes, **When** the task finishes, **Then** `.codeharness/contracts/` contains a contract JSON file for the `telemetry` task with fields: `taskName: "telemetry"`, `driver: "engine"`, `model: "null"`, `cost_usd: 0`, `duration_ms` (a number ≥ 0), `changedFiles: []`, and `output` (a string).
   <!-- verification: after workflow completes, `ls .codeharness/contracts/ | grep telemetry`; then `cat` the file and verify JSON fields match -->

3. **Given** a workflow with a null task `telemetry` that completes, **When** the workflow state file is inspected, **Then** `.codeharness/workflow-state.yaml` (or `.json`) contains a `tasks_completed` entry with `task_name: "telemetry"` and a `completed_at` ISO timestamp.
   <!-- verification: `cat .codeharness/workflow-state.yaml` or `cat .codeharness/workflow-state.json`, find the telemetry entry in tasks_completed array, verify task_name and completed_at fields -->

4. **Given** a workflow with a task `unknown-null-task` defined as `agent: null` but NO handler registered for that name, **When** `codeharness run` reaches that task, **Then** the terminal output or logs show an error containing the text `NULL_TASK_NOT_FOUND` and the task name `unknown-null-task`, and the workflow does NOT silently continue past the error.
   <!-- verification: configure workflow with unregistered null task name, run `codeharness run`, observe error output contains "NULL_TASK_NOT_FOUND" and "unknown-null-task" -->

5. **Given** a registered null task handler that returns `{ success: false }`, **When** `codeharness run` executes that task, **Then** the terminal output or logs show an error containing the text `NULL_TASK_FAILED` and the task name, and the workflow does NOT write a success checkpoint for that task.
   <!-- verification: register a failing handler or mock one, run `codeharness run`, observe error with "NULL_TASK_FAILED"; inspect workflow-state to confirm no success checkpoint for that task -->

6. **Given** a registered null task handler that throws an exception, **When** `codeharness run` executes that task, **Then** the terminal output or logs show an error containing the text `NULL_TASK_HANDLER_ERROR` and the original error message from the handler.
   <!-- verification: register a throwing handler or mock one, run `codeharness run`, observe error with "NULL_TASK_HANDLER_ERROR" and the original message -->

7. **Given** a workflow with sequential tasks `implement` (agent: dev) → `telemetry` (agent: null) → `verify` (agent: evaluator), **When** all three tasks complete, **Then** the `verify` task receives the `telemetry` task's output contract as its previous contract context (visible in the verify task's prompt or contract chain), confirming null tasks participate in contract chaining.
   <!-- verification: run workflow with mixed tasks, inspect .codeharness/contracts/ for all three files; the verify contract's prompt should reference the telemetry contract's output -->

8. **Given** a null task `telemetry` is executed, **When** the dispatch completes, **Then** the accumulated cost for the null task is $0.00 — no cost is charged to the workflow budget, and `codeharness status` or the workflow state shows no cost increase from the null task.
   <!-- verification: run workflow, note cost before and after null task; inspect contracts or status to confirm cost_usd=0 for telemetry task -->

9. **Given** a null task is executed, **When** the engine processes it, **Then** NO isolated workspace is created (no `source_access: false` isolation path is triggered), regardless of the task's `source_access` setting.
   <!-- verification: observe terminal/logs during null task execution — no workspace creation logs; verify no temporary workspace directories exist during/after null task -->

10. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no TypeScript errors.
    <!-- verification: `npm run build` exits 0 -->

11. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** all tests pass with zero failures — no regressions from null task actor changes.
    <!-- verification: `npx vitest run` exits 0 with 0 failures -->

12. **Given** `workflow-actors.ts` exists on disk, **When** its line count is checked, **Then** it contains ≤ 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-actors.ts` shows ≤ 300 -->

## Tasks / Subtasks

### T1: Validate existing `nullTaskCore` against architecture spec
- Confirm `nullTaskCore` accepts `NullTaskInput` with fields: `task`, `taskName`, `storyKey`, `config`, `workflowState`, `previousContract`, `accumulatedCostUsd`
- Confirm handler lookup via `getNullTask(taskName)` from null-task-registry
- Confirm `TaskContext` built correctly: `storyKey`, `taskName`, `cost` (from `accumulatedCostUsd`), `durationMs` (elapsed since workflow start), `outputContract` (from `previousContract`), `projectDir`
- Confirm result `DispatchOutput` shape matches `workflow-types.ts` interface

### T2: Validate error paths
- Confirm `NULL_TASK_NOT_FOUND` thrown when handler not registered (includes registered handler names in message)
- Confirm `NULL_TASK_HANDLER_ERROR` thrown when handler throws an exception (wraps original error message)
- Confirm `NULL_TASK_FAILED` thrown when handler returns `{ success: false }` (includes handler output if available)
- Note: All three error types are currently thrown as plain objects, not `WorkflowError` instances. Story 23-4 will unify. For now, verify the `code` field is present and correct.

### T3: Validate contract output
- Confirm `OutputContract` produced with: `version: 1`, `driver: "engine"`, `model: "null"`, `cost_usd: 0`, `duration_ms: <actual>`, `changedFiles: []`, `testResults: null`
- Confirm contract written to `.codeharness/contracts/` via `writeWorkflowState` (not `writeOutputContract` — null tasks currently skip contract file writing)
- **Bug candidate:** `nullTaskCore` creates an `OutputContract` but does NOT call `writeOutputContract()` to persist it to the contracts directory. It only returns the contract in the `DispatchOutput`. If the machine's `onDone` handler doesn't write it, contract files won't exist for null tasks. Validate whether this is intentional (contract chaining via context only) or a bug (missing file write).

### T4: Validate checkpoint persistence
- Confirm `TaskCheckpoint` written to workflow state with `task_name`, `story_key`, `completed_at`
- Confirm `writeWorkflowState(updatedState, projectDir)` called after handler completes
- Confirm crash recovery: if workflow resumes, completed null tasks are skipped

### T5: Validate null task does NOT trigger dispatch-specific paths
- Confirm NO driver resolution (`getDriver` not called)
- Confirm NO model resolution (`resolveModel` not called)
- Confirm NO source isolation (`createIsolatedWorkspace` not called)
- Confirm NO trace ID generation
- Confirm NO session management
- Confirm NO sideband streaming events
- Confirm NO `propagateVerifyFlags` call

### T6: Add dedicated null task tests to workflow-actors.test.ts
- Test: `nullTaskCore` with registered handler returns `DispatchOutput` with `cost: 0`
- Test: `nullTaskCore` with unregistered handler throws `NULL_TASK_NOT_FOUND`
- Test: `nullTaskCore` with handler returning `success: false` throws `NULL_TASK_FAILED`
- Test: `nullTaskCore` with throwing handler throws `NULL_TASK_HANDLER_ERROR`
- Test: `nullTaskCore` produces contract with `driver: "engine"`, `model: "null"`
- Test: `nullTaskCore` writes workflow state with checkpoint
- Test: `nullTaskCore` does NOT call `getDriver`, `resolveModel`, `createIsolatedWorkspace`
- Test: mixed flow (agent task → null task → agent task) preserves contract chain

### T7: Ensure build and code quality
- Run `npx vitest run` — zero failures
- Run `npm run build` — zero errors
- Confirm file ≤ 300 lines

## Dev Notes

### What already exists
The `nullTaskCore()` function (lines 35-63 in workflow-actors.ts) and the `nullTaskDispatchActor` wrapper (line 198) are already implemented. The null-task-registry.ts provides the handler lookup infrastructure with a built-in `telemetry` handler. This story is primarily about **validation, testing, and identifying bugs**, not greenfield development.

### Known gap: contract file writing
`nullTaskCore()` creates an `OutputContract` object and returns it in `DispatchOutput.contract`, but unlike `dispatchTaskCore()`, it does NOT call `writeOutputContract()` to persist the contract to `.codeharness/contracts/`. This means:
- Contract chaining works (machine context carries the contract to the next task)
- But there's no contract JSON file on disk for null tasks
- AC2 may fail if the contract file is expected on disk. Determine if this is by design or needs fixing.

### Error handling differences from dispatch actor
Null task errors are thrown as plain objects with `{ taskName, storyKey, code, message }` shape, NOT as `DispatchError` or `WorkflowError` instances. This means:
- `instanceof DispatchError` checks in `onError` guards will NOT match null task errors
- Machine error handling may need to check for `.code` property generically, not via `instanceof`
- Story 23-4 will unify all actor errors under `WorkflowError` class

### TaskContext field: `cost` vs `accumulatedCostUsd`
The `NullTaskInput` type has `accumulatedCostUsd: number` which maps to `TaskContext.cost`. This represents the total cost accumulated from ALL previous tasks in the workflow, not just the immediately preceding task. This is important for telemetry handlers that need to report total workflow cost.

### TaskContext field: `durationMs`
Calculated as `Date.now() - workflowStartMs` where `workflowStartMs` comes from `workflowState.started`. This is time since workflow start, not since the null task started. This is correct for telemetry reporting.

### No source isolation for null tasks
Null tasks always execute in the engine process. They never create isolated workspaces, regardless of `source_access` setting. This is by design — null tasks don't write code, they perform bookkeeping.

### No stream events for null tasks
Null tasks produce no `dispatch-start`, `dispatch-end`, or `stream-event` engine events. They execute silently from the TUI's perspective. The only observable artifact is the contract and checkpoint.

### File size budget
Current `workflow-actors.ts`: 199 lines. Budget: 300 lines. ~101 lines of headroom. Adding `writeOutputContract` for null tasks (if needed) would add ~5 lines.

### References
- [Source: architecture-xstate-engine.md — AD2 null task actor pattern]
- [Source: epics-xstate-engine.md — Epic 3, Story 3.2 null task actor spec]
- [Source: src/lib/workflow-actors.ts — nullTaskCore(), lines 35-63]
- [Source: src/lib/null-task-registry.ts — handler registry, TaskContext interface]
- [Source: src/lib/workflow-types.ts — NullTaskInput interface]
- [Source: 16-2-engine-handled-null-tasks.md — original null task story]

</story-spec>
