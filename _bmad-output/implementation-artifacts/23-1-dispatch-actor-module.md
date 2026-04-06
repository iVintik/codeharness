<story-spec>

# Story 23-1: Create `workflow-actors.ts` with dispatch actor

Status: draft

## Story

As a workflow author,
I want `codeharness run` to dispatch tasks to AI agents through a typed dispatch actor,
So that each task in my workflow executes with proper driver resolution, prompt construction, streaming, error handling, and source isolation.

## Context

**Epic 23: Dispatch & Null Task Actors** — this is the first of 4 stories that implement the actor layer of the XState workflow engine. The dispatch actor is the primary workhorse: it takes a task definition, resolves the driver (claude-code, codex, opencode), constructs a prompt with contract context, dispatches via the driver, streams events to the TUI, and returns a structured `DispatchOutput`.

**Current state:** `src/lib/workflow-actors.ts` already exists (197 lines) with `dispatchTaskCore()` and `nullTaskCore()` implementations, plus XState `fromPromise` actor wrappers. This story validates and hardens the existing implementation against the architecture spec, ensuring all behaviors are observable through CLI, logs, and file system artifacts.

**Key architectural decisions (from architecture-xstate-engine.md):**
- Actors do I/O, machines do decisions. Clean separation.
- `dispatchActor = fromPromise<DispatchOutput, DispatchInput>` — typed XState v5 actor.
- Sideband streaming: driver events flow to TUI via callback, NOT through XState event system.
- Source isolation: `source_access === false` → isolated workspace created, cleaned up in `finally`.
- Error classification: driver errors mapped to `DispatchError` with structured codes (RATE_LIMIT, NETWORK, SDK_INIT, UNKNOWN).
- Contract chaining: output contract written to `.codeharness/contracts/`, returned in `DispatchOutput`.
- Session management: sessions resolved/recorded per task+story key.
- Trace IDs: generated per dispatch, embedded in prompt, recorded in workflow state.

**Dependencies:** Epic 22 (parser) complete. Types in `workflow-types.ts` defined. Driver abstraction layer, agent resolver, contract system all existing and stable.

**Current test baseline:** Check via `npx vitest run` — all tests must continue passing.

## Acceptance Criteria

1. **Given** a project with a workflow YAML containing a task `implement` with `agent: dev` and `driver: claude-code`, **When** `codeharness run` executes that task, **Then** `docker logs` (or terminal output with `--quiet` disabled) shows a `dispatch-start` log line containing the task name `implement` and driver name `claude-code`.
   <!-- verification: run `codeharness run`, observe terminal/logs for dispatch-start with taskName=implement, driverName=claude-code -->

2. **Given** a running workflow that has dispatched a task, **When** the task completes successfully, **Then** `docker logs` (or terminal output) shows a `dispatch-end` log line containing the task name, elapsed time in milliseconds, and cost in USD.
   <!-- verification: observe terminal/logs for dispatch-end with taskName, elapsedMs, costUsd fields -->

3. **Given** a task with `source_access: false` in the workflow YAML, **When** `codeharness run` dispatches that task, **Then** the dispatch log lines show the task executed in an isolated workspace path (not the project root), and after completion the isolated workspace directory no longer exists on disk.
   <!-- verification: observe dispatch logs for cwd path different from project root; after task completes, verify workspace dir is gone with `ls` -->

4. **Given** a task with `source_access: true` (or no `source_access` key), **When** `codeharness run` dispatches that task, **Then** the dispatch executes in the project root directory (visible in dispatch logs or `codeharness status`).
   <!-- verification: observe dispatch logs showing cwd = project root -->

5. **Given** a workflow with two sequential tasks `create-story` → `implement`, **When** both tasks complete, **Then** `.codeharness/contracts/` contains at least two contract JSON files, each with fields: `taskName`, `storyId`, `driver`, `model`, `timestamp`, `cost_usd`, `duration_ms`, `changedFiles`, and `output`.
   <!-- verification: `ls .codeharness/contracts/` shows files; `cat` a contract file and verify JSON contains required fields -->

6. **Given** the API key is invalid or the AI provider returns a rate limit error, **When** `codeharness run` dispatches a task and the driver fails, **Then** the terminal output or logs show an error with a classification code (one of: `RATE_LIMIT`, `NETWORK`, `SDK_INIT`, or `UNKNOWN`) and the task name that failed.
   <!-- verification: set invalid API key, run `codeharness run`, observe error output contains error code and task name -->

7. **Given** a workflow where the driver returns a rate limit error (code `RATE_LIMIT`), **When** the error is reported, **Then** `codeharness status` or the workflow state file (`.codeharness/workflow-state.json`) shows the workflow entered a `halted` state (not crashed, not silently continuing).
   <!-- verification: trigger rate limit, check `codeharness status` or `cat .codeharness/workflow-state.json` for halted indicator -->

8. **Given** a running dispatch is interrupted (Ctrl+C / SIGINT), **When** the interrupt signal is received, **Then** the currently running driver subprocess is killed, the workflow state is saved to disk (`.codeharness/workflow-state.json` has a recent timestamp), and if `source_access: false` the isolated workspace is cleaned up.
   <!-- verification: start `codeharness run`, send SIGINT during dispatch, verify state file exists with recent timestamp, verify no orphan workspace dirs -->

9. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no TypeScript errors.
   <!-- verification: `npm run build` exits 0 -->

10. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** all tests pass with zero failures — no regressions from actor changes.
    <!-- verification: `npx vitest run` exits 0 with 0 failures -->

11. **Given** a workflow with a task named `implement` that completes with test results showing 0 failures and coverage ≥ the configured target, **When** the dispatch actor finishes, **Then** `codeharness status --story <key>` (or the story state file) shows `tests_passed: true` and `coverage_met: true` in the session flags.
    <!-- verification: after implement task completes, run `codeharness status --story <key>` or inspect state file for session_flags -->

12. **Given** a task dispatched via `codeharness run`, **When** the dispatch completes, **Then** the workflow state file (`.codeharness/workflow-state.json`) contains a `tasks_completed` entry for that task with `task_name`, `story_key`, and `completed_at` timestamp.
    <!-- verification: `cat .codeharness/workflow-state.json | jq '.tasks_completed[-1]'` shows the completed task entry -->

13. **Given** `workflow-actors.ts` is linted via `npx eslint src/lib/workflow-actors.ts`, **When** linting completes, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-actors.ts` exits 0 -->

14. **Given** `workflow-actors.ts` exists on disk, **When** its line count is checked, **Then** it contains ≤ 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-actors.ts` shows ≤ 300 -->

## Tasks / Subtasks

### T1: Validate existing `dispatchTaskCore` against architecture spec
- Confirm driver resolution via `getDriver(driverName)`
- Confirm model resolution via `resolveModel(task, definition, driver)`
- Confirm prompt construction with contract context via `buildPromptWithContractContext`
- Confirm sideband streaming: `onStreamEvent` callback invoked per driver event
- Confirm `DispatchOutput` shape matches `workflow-types.ts` interface

### T2: Validate source isolation (source_access === false)
- Confirm `createIsolatedWorkspace` called when `task.source_access === false`
- Confirm `workspace.cleanup()` called in `finally` block (no orphan workspaces)
- Confirm fallback to `projectDir` if workspace creation fails

### T3: Validate error classification
- Confirm driver errors mapped to `DispatchError` with `code` field
- Confirm mapping: RATE_LIMIT → RATE_LIMIT, NETWORK → NETWORK, SDK_INIT → SDK_INIT, other → UNKNOWN
- Confirm error includes `agentName` (from definition.name)

### T4: Validate contract output and session management
- Confirm output contract written to `.codeharness/contracts/` via `writeOutputContract`
- Confirm session ID resolved and recorded in workflow state
- Confirm trace ID generated, formatted into prompt, recorded in state

### T5: Validate verify flag propagation
- Confirm `propagateVerifyFlags` called after dispatch for `implement` tasks
- Confirm `tests_passed` set when `failed === 0`
- Confirm `coverage_met` set when coverage ≥ target

### T6: Validate XState actor wrappers
- Confirm `dispatchActor = fromPromise(...)` wraps `dispatchTaskCore`
- Confirm `nullTaskDispatchActor = fromPromise(...)` wraps `nullTaskCore`
- Confirm both actors accept typed input and return typed output

### T7: Ensure tests pass and code quality
- Run `npx vitest run` — zero failures
- Run `npm run build` — zero errors
- Run `npx eslint src/lib/workflow-actors.ts` — zero errors
- Confirm file ≤ 300 lines

## Dev Notes

### What already exists
The `workflow-actors.ts` file (197 lines) already implements `dispatchTaskCore`, `nullTaskCore`, `propagateVerifyFlags`, `buildCoverageDeduplicationContext`, and the two XState actor wrappers. This story is primarily about **validation and hardening**, not greenfield development.

### Key error class
Errors are thrown as `DispatchError` (from `agent-dispatch.ts`), not a separate `WorkflowError` class. The architecture mentions `WorkflowError` — story 23-4 will introduce that. For now, `DispatchError` with its `code` field serves the same purpose for dispatch actors. Null task errors are currently thrown as plain objects with `{ code, message, taskName, storyKey }` — story 23-4 will unify these.

### Null task actor is in-scope but covered separately
`nullTaskCore` and `nullTaskDispatchActor` live in the same file. Story 23-2 will add dedicated ACs for null task behavior. This story's ACs focus on the dispatch (agent) path.

### Contract chaining
The dispatch actor writes contracts but does NOT read them from context — that's the machine's job (story 23-3). The actor receives `previousContract` as input and uses it for prompt construction only.

### File size budget
Current: 197 lines. Budget: 300 lines. 103 lines of headroom for any hardening changes.

### Stream events are sideband
Driver events flow through `onStreamEvent` callback, NOT through XState events. This is by design — XState machines should not see individual stream tokens. The TUI subscribes to the sideband.

</story-spec>
