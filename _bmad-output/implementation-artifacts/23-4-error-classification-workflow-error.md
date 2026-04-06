<story-spec>

# Story 23-4: Error Classification with WorkflowError

Status: draft

## Story

As a workflow author,
I want all workflow engine errors — from dispatch actors, null task actors, and machine-level failures — to be classified through a single `WorkflowError` class with structured error codes,
So that the engine consistently halts on fatal errors (RATE_LIMIT, NETWORK, SDK_INIT), records non-fatal errors, and never silently swallows or misclassifies failures.

## Context

**Epic 23: Dispatch & Null Task Actors** — this is the fourth and final story. Stories 23-1 through 23-3 validated dispatch actors, null task actors, and contract chaining. All three stories documented the same gap: **errors are thrown as two incompatible types** — `DispatchError` (a real Error subclass with `code`, `agentName`, `cause`) for dispatch tasks, and **plain objects** (`{ code, message, taskName, storyKey }`) for null tasks. The architecture mandates a single `WorkflowError` class (enforcement rule #8, implementation pattern #6).

**Current problems this story solves:**

1. **Null task errors are plain objects, not Error instances.** `nullTaskCore()` throws `{ code, message, taskName, storyKey }` — a plain object that fails `instanceof Error`, has no stack trace, and breaks the `err instanceof DispatchError` check in `workflow-machines.ts`. This means null task errors with halt-worthy codes (like if a null task handler triggers a rate limit) are never caught by the `HALT_ERROR_CODES` check.

2. **Error classification is split across two code paths.** `workflow-machines.ts` checks `err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)` for dispatch errors, and uses `isEngineError(err)` for null task plain objects. These are different classification mechanisms that could diverge.

3. **Story-level null task failure doesn't halt.** In `storyFlowActor`, a null task error `break`s out of the story loop but does NOT set `halted = true`. The `story-done` event still emits. The epic continues to the next story even though the current story had a failure. This was documented as a known issue in stories 23-2 and 23-3.

4. **No unified error guard for XState machines.** The architecture requires `isAbortError` and `isHaltError` guards on every `invoke.onError`. Currently, halt detection uses `instanceof DispatchError` checks in imperative code, not XState guards.

**Architecture requirements (from architecture-xstate-engine.md):**

- Pattern #6: "Use `WorkflowError` class (extends Error) with `code`, `taskName`, `storyKey` — never plain objects"
- Pattern #6: "Error classification determines machine transition: `isAbortError` → interrupted, `isHaltError` → halted, otherwise → error + continue"
- Enforcement rule #8: "Use `WorkflowError` class, not plain objects"
- Cross-cutting concern #1: "Error classification — halt errors (RATE_LIMIT) vs recoverable vs task failures. `isAbortError` guard on every invoke's `onError`. Propagates through machine hierarchy."

**Dependencies:** Stories 23-1, 23-2, 23-3 complete. `DispatchError` in `agent-dispatch.ts` is the existing Error subclass for dispatch-level errors. `EngineError` in `workflow-types.ts` is the plain interface for error records.

## Acceptance Criteria

1. **Given** a workflow with a null task `telemetry` whose handler throws an exception, **When** `codeharness run` executes that task, **Then** the terminal output or logs show an error with a classification code (`NULL_TASK_HANDLER_ERROR`) and the task name `telemetry`, AND the error includes a stack trace (visible in debug/verbose mode or log file).
   <!-- verification: register a throwing null task handler, run `codeharness run`, observe error output contains "NULL_TASK_HANDLER_ERROR", "telemetry", and a stack trace line with "at" -->

2. **Given** a workflow with a null task referencing an unregistered handler, **When** `codeharness run` reaches that task, **Then** the terminal output shows an error with code `NULL_TASK_NOT_FOUND`, AND `codeharness status` or the workflow state file shows the workflow halted — it did NOT continue to the next task or next story.
   <!-- verification: configure workflow with unregistered null task, run `codeharness run`, confirm error with "NULL_TASK_NOT_FOUND"; then `codeharness status` or `cat .codeharness/workflow-state.yaml` shows phase is "error" or halted indicator -->

3. **Given** a workflow where a null task fails at the story level (inside story flow, not in a loop), **When** the null task error is processed, **Then** the workflow state file shows the story DID NOT emit a `story-done` event for that story key, AND the terminal output does NOT show a `story-done` log for that story.
   <!-- verification: run workflow where story-level null task fails, grep logs for "story-done" with that story key — expect zero matches; inspect workflow state for halted indicator -->

4. **Given** a workflow where a dispatch task fails with error code `RATE_LIMIT`, **When** the error is processed, **Then** `codeharness status` or the workflow state file shows the workflow entered a halted/error state, AND the error record in the state file contains `code: "RATE_LIMIT"` and the task name.
   <!-- verification: trigger rate limit error (invalid API key or mock), run `codeharness run`, check `codeharness status` for halted state; inspect state file errors array for code=RATE_LIMIT entry -->

5. **Given** a workflow where a dispatch task fails with error code `NETWORK`, **When** the error is processed, **Then** the workflow halts (same behavior as RATE_LIMIT — the workflow does NOT continue to the next task).
   <!-- verification: trigger network error, run `codeharness run`, confirm workflow stopped and state file shows error state -->

6. **Given** a workflow where a dispatch task fails with error code `UNKNOWN`, **When** the error is processed, **Then** the error is recorded in the workflow state file's error entries, AND the workflow halts the current story but the epic continues to the next story (non-fatal for the overall run).
   <!-- verification: trigger unknown error, inspect state file for error entry with code=UNKNOWN; observe that subsequent stories in the same epic are attempted -->

7. **Given** a running workflow that receives SIGINT (Ctrl+C), **When** a dispatch is in progress, **Then** the running driver subprocess is killed, the workflow state is persisted to disk with a recent timestamp, AND the state file shows a phase of `interrupted` (not `error` or `executing`).
   <!-- verification: start `codeharness run`, send SIGINT during active dispatch, inspect state file for phase="interrupted" and recent timestamp -->

8. **Given** a workflow where multiple tasks fail across different stories, **When** the entire run completes, **Then** `codeharness status` shows all errors with their task names, story keys, and classification codes — no errors are swallowed or missing from the summary.
   <!-- verification: run workflow that hits multiple errors, then `codeharness status` or inspect state file — count error entries matches expected count, each has taskName/storyKey/code -->

9. **Given** a workflow with a null task failure followed by subsequent stories, **When** the error occurs in story N, **Then** the workflow state file shows an error record for story N's null task, AND story N+1 begins execution (null task failure in one story does not halt the entire epic — unless the error code is in the halt set).
   <!-- verification: run workflow with 2+ stories where story 1 has a failing null task with code NULL_TASK_FAILED (non-halt code), observe story 2 is attempted; inspect state for error entry for story 1 -->

10. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no TypeScript errors.
    <!-- verification: `npm run build` exits 0 -->

11. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** all tests pass with zero failures — no regressions from error classification changes.
    <!-- verification: `npx vitest run` exits 0 with 0 failures -->

12. **Given** `workflow-actors.ts` exists on disk, **When** its line count is checked, **Then** it contains ≤ 300 lines (per NFR18 file size constraint).
    <!-- verification: `wc -l src/lib/workflow-actors.ts` shows ≤ 300 -->

13. **Given** `workflow-machines.ts` exists on disk, **When** its line count is checked, **Then** it contains ≤ 400 lines (current ~402 lines, target ≤ 400 after cleanup).
    <!-- verification: `wc -l src/lib/workflow-machines.ts` shows ≤ 400 -->

## Tasks / Subtasks

### T1: Create `WorkflowError` class in `workflow-types.ts`
- Add `WorkflowError extends Error` with `code: string`, `taskName: string`, `storyKey: string`
- Constructor takes `(message, code, taskName, storyKey)` and calls `super(message)`
- Sets `this.name = 'WorkflowError'` for proper `instanceof` checks
- Preserves stack trace (relies on native Error stack capture)
- Export from `workflow-types.ts` (no new file — architecture says types go here)

### T2: Add `isHaltError` and `isAbortError` classification functions
- `isHaltError(err: unknown): boolean` — returns true if `err` is a `WorkflowError` or `DispatchError` with code in `HALT_ERROR_CODES` set
- `isAbortError(err: unknown): boolean` — returns true if `err` is an `AbortError` or the abort signal was triggered
- Place in `workflow-compiler.ts` alongside existing `handleDispatchError` and `isEngineError`
- These replace the current inline `err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)` checks

### T3: Convert `nullTaskCore` to throw `WorkflowError` instead of plain objects
- Replace the 3 `throw { code, message, taskName, storyKey }` sites in `nullTaskCore()` with `throw new WorkflowError(message, code, taskName, storyKey)`
- Import `WorkflowError` from `workflow-types.ts`
- This gives null task errors stack traces and makes them work with `instanceof` checks

### T4: Update `handleDispatchError` to produce `WorkflowError`
- `handleDispatchError` currently converts `DispatchError` to `EngineError` (plain object)
- Update it to also check for `WorkflowError` instances and extract code/taskName/storyKey
- The function's return type (`EngineError`) stays the same — it's the error record format for state persistence

### T5: Fix story-level null task failure to set `halted = true`
- In `storyFlowActor` (workflow-machines.ts ~line 230), the null task catch block calls `break` but does not set `halted = true`
- Add halt detection: if the error is a halt-worthy code (via `isHaltError`), set `halted = true`
- For non-halt null task errors: still break the story, but don't set `halted` — epic continues to next story
- This prevents the false `story-done` event emission on line 251 (the `!halted` check already gates it for halt errors)

### T6: Unify halt detection in `workflow-machines.ts`
- Replace all `err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)` patterns with `isHaltError(err)`
- This works for both `DispatchError` and `WorkflowError` instances
- Locations: `loopIterationActor` (~line 93), `storyFlowActor` (~line 247), `epicStepActor` (~line 317)

### T7: Update tests for new error classification
- Update `workflow-actors.test.ts`: null task error tests should assert `WorkflowError` instances (not plain objects)
- Update `workflow-compiler.test.ts`: add tests for `isHaltError`, `isAbortError`
- Update `workflow-machines.test.ts`: verify halt detection works with `WorkflowError` (null task halt codes)
- Add test: story-level null task failure sets `halted = true` when error code is in halt set
- Add test: story-level null task failure with non-halt code breaks story but epic continues

### T8: Ensure build and code quality
- Run `npx vitest run` — zero failures
- Run `npm run build` — zero errors
- Confirm `workflow-actors.ts` ≤ 300 lines
- Confirm `workflow-machines.ts` ≤ 400 lines

## Dev Notes

### WorkflowError vs DispatchError vs EngineError

Three error types will coexist after this story:

| Type | Usage | Created by | Has stack trace |
|------|-------|-----------|-----------------|
| `DispatchError` | Thrown by driver dispatch layer (`agent-dispatch.ts`) | `dispatchAgent()`, low-level driver code | Yes (extends Error) |
| `WorkflowError` | Thrown by workflow actors (`workflow-actors.ts`) | `nullTaskCore()`, any workflow-level failure | Yes (extends Error) |
| `EngineError` | Recorded in state file, passed in events | `handleDispatchError()` — converts thrown errors to state records | No (plain interface) |

The flow is: actor throws `DispatchError` or `WorkflowError` → catch block calls `handleDispatchError()` → produces `EngineError` for state persistence → original error checked for halt classification.

`DispatchError` is NOT replaced by this story. It lives in the driver layer and is the right type there. `WorkflowError` replaces the **plain object throws** in the workflow actor layer.

### Halt vs non-halt error codes

Current `HALT_ERROR_CODES`: `RATE_LIMIT`, `NETWORK`, `SDK_INIT`

These halt the entire workflow (no point continuing if the API is down). All other codes (`UNKNOWN`, `NULL_TASK_NOT_FOUND`, `NULL_TASK_FAILED`, `NULL_TASK_HANDLER_ERROR`) are non-halt: they break the current story/loop but the epic continues.

Exception: `NULL_TASK_NOT_FOUND` might warrant halting since it indicates a configuration error. Current behavior (non-halt) is preserved for now — the workflow records the error and moves on. If this turns out wrong, it's a one-line change to add the code to `HALT_ERROR_CODES`.

### Story-level null task halting fix

The critical behavioral fix in T5: in `storyFlowActor`, when a null task fails with a halt-worthy code, `halted` must be set to `true`. This prevents:
1. The false `story-done` event (line 251 checks `!halted`)
2. The epic continuing when it should stop (parent checks `storyResult.halted`)

For non-halt null task errors, the current behavior is preserved: break the story, record the error, but let the epic continue with the next story.

### No changes to `isEngineError`

The `isEngineError()` function checks for the plain-object shape `{ taskName, storyKey, code, message }`. After this story, null tasks throw `WorkflowError` instances instead of plain objects. `WorkflowError` has these same properties, so `isEngineError()` still returns `true` for `WorkflowError` instances (duck typing). No change needed.

### File size budget

- `workflow-actors.ts`: current 208 lines. Adding `WorkflowError` import + changing 3 throw sites = net ~0 lines. Well within 300.
- `workflow-machines.ts`: current ~402 lines. Replacing inline `instanceof` checks with `isHaltError()` calls saves a few characters per site. Adding the null task halt fix adds ~2 lines. Target: stay ≤ 400.
- `workflow-types.ts`: current 144 lines. Adding `WorkflowError` class = ~12 lines. Still well under 300.

### References
- [Source: architecture-xstate-engine.md — Pattern #6: Error Handling Pattern]
- [Source: architecture-xstate-engine.md — Enforcement rule #8: Use WorkflowError class]
- [Source: architecture-xstate-engine.md — Cross-cutting concern #1: Error classification]
- [Source: epics-xstate-engine.md — Epic 3, Story 3.4: Error classification with WorkflowError]
- [Source: src/lib/workflow-actors.ts — nullTaskCore plain object throws at lines 42, 49, 52]
- [Source: src/lib/workflow-machines.ts — storyFlowActor null task catch at line 230]
- [Source: src/lib/agent-dispatch.ts — DispatchError class at line 40]
- [Source: 23-2 story review — documented plain object gap]
- [Source: 23-3 story review — documented story-level null task halting gap]

</story-spec>
