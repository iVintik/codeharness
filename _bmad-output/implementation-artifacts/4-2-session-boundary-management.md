# Story 4.2: Session Boundary Management

Status: done

## Story

As a developer,
I want session boundaries configurable per task,
so that context resets and continuity are controlled by the workflow definition.

## Acceptance Criteria

1. **Given** a task with `session: fresh` in the workflow YAML
   **When** `dispatchAgent()` is called for that task
   **Then** the SDK `query()` is invoked with no `resume` option (a brand-new session is started)
   <!-- verification: test-provable -->

2. **Given** a task with `session: continue` in the workflow YAML
   **When** `dispatchAgent()` is called for that task and a previous session ID exists for that task+story combination
   **Then** the SDK `query()` is invoked with `resume` set to the previous session ID
   <!-- verification: test-provable -->

3. **Given** a task with `session: continue` but no previous session ID exists (first invocation)
   **When** `dispatchAgent()` is called
   **Then** a fresh session is started (no `resume` option passed) and the resulting session ID is stored for future continuations
   <!-- verification: test-provable -->

4. **Given** any `dispatchAgent()` call that completes (success or failure)
   **When** the result is returned
   **Then** the returned `DispatchResult.sessionId` is recorded in `workflow-state.yaml` under the corresponding `TaskCheckpoint.session_id` field
   <!-- verification: test-provable -->

5. **Given** a `session: continue` task across a crash-recovery restart
   **When** the engine resumes and `dispatchAgent()` is called for the continued task
   **Then** the session ID is retrieved from the persisted `workflow-state.yaml` (not just in-memory state) and passed as `resume`
   <!-- verification: test-provable -->

6. **Given** a `session: fresh` task in a loop block (e.g., retry)
   **When** the loop repeats the task for a second iteration
   **Then** a new session is started each iteration (no `resume`), and each iteration's session ID is independently recorded
   <!-- verification: test-provable -->

7. **Given** a `session: continue` task in a loop block
   **When** the loop repeats the task for a second iteration
   **Then** the session ID from the previous iteration of the same task+story is passed as `resume`
   <!-- verification: test-provable -->

8. **Given** a workflow where `session` is not specified for a task
   **When** the task is dispatched
   **Then** the default `session: fresh` behavior is used (per the workflow JSON schema default)
   <!-- verification: test-provable -->

9. **Given** unit tests for session boundary management
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for the session boundary logic covering: fresh dispatch (no resume), continue dispatch (resume with session ID), fallback to fresh when no prior session, session ID persistence in workflow-state, crash recovery session retrieval, loop iteration fresh/continue behavior, and default to fresh when session field omitted
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create session manager module (AC: #1, #2, #3, #4, #8)
  - [x] Create `src/lib/session-manager.ts`
  - [x] Define `SessionBoundary` type: `'fresh' | 'continue'`
  - [x] Define `SessionLookupKey` as `{ taskName: string; storyKey: string }` to identify a task+story combination
  - [x] Implement `resolveSessionId(boundary: SessionBoundary, key: SessionLookupKey, state: WorkflowState): string | undefined` — returns undefined for fresh, looks up last session ID for continue
  - [x] Implement `recordSessionId(key: SessionLookupKey, sessionId: string, state: WorkflowState): WorkflowState` — writes session ID into the corresponding TaskCheckpoint

- [x] Task 2: Integrate session manager with agent-dispatch (AC: #1, #2, #3)
  - [x] Update `dispatchAgent()` caller contract — the workflow engine (story 5-1) will call `resolveSessionId()` before dispatch and pass the result via `DispatchOptions.sessionId`
  - [x] Verify that `agent-dispatch.ts` already passes `options.sessionId` as `resume` to the SDK query (it does — line 135)
  - [x] Verify that `agent-dispatch.ts` already handles the `sessionId` being `undefined` (no resume) — confirm by reading the existing spread: `...(options?.sessionId ? { resume: options.sessionId } : {})`

- [x] Task 3: Implement session ID persistence in workflow-state (AC: #4, #5)
  - [x] Verify that `TaskCheckpoint` already has `session_id?: string` field (it does)
  - [x] Implement helper `getLastSessionId(state: WorkflowState, taskName: string, storyKey: string): string | undefined` — searches `tasks_completed` array in reverse for matching task_name+story_key with a session_id
  - [x] The workflow-engine (story 5-1) will call `writeWorkflowState()` after each dispatch — this story ensures the `session_id` field is populated on the checkpoint

- [x] Task 4: Handle loop iteration session behavior (AC: #6, #7)
  - [x] For `session: fresh` in loops: `resolveSessionId()` returns undefined regardless of iteration count
  - [x] For `session: continue` in loops: `resolveSessionId()` returns the session ID from the most recent checkpoint for that task+story pair (which may be from a previous loop iteration)
  - [x] Ensure `getLastSessionId()` finds the most recent entry (reverse search handles multiple loop iteration checkpoints)

- [x] Task 5: Write unit tests (AC: #9)
  - [x] Create `src/lib/__tests__/session-manager.test.ts`
  - [x] Test: `resolveSessionId('fresh', ...)` returns undefined regardless of state
  - [x] Test: `resolveSessionId('continue', ...)` returns undefined when no prior checkpoint exists
  - [x] Test: `resolveSessionId('continue', ...)` returns session ID from matching checkpoint
  - [x] Test: `resolveSessionId('continue', ...)` returns most recent session ID when multiple checkpoints exist (loop iterations)
  - [x] Test: `recordSessionId()` populates session_id on the correct checkpoint
  - [x] Test: `getLastSessionId()` returns undefined when no matching checkpoint
  - [x] Test: `getLastSessionId()` returns most recent match (reverse order)
  - [x] Test: crash recovery scenario — session ID retrieved from deserialized state
  - [x] Test: default session boundary (fresh) produces no resume
  - [x] Verify 80%+ coverage on `session-manager.ts`

## Dev Notes

### Module Design Decision

Session boundary management is implemented as a separate `session-manager.ts` module rather than modifying `agent-dispatch.ts` directly. Rationale:

1. `agent-dispatch.ts` is intentionally stateless (it does not import `workflow-state`) — per story 4-1 anti-patterns
2. Session lookup requires reading `WorkflowState`, which is a different concern from SDK invocation
3. The workflow-engine (story 5-1) orchestrates the flow: resolve session ID -> dispatch agent -> record session ID -> write state

The `agent-dispatch.ts` module already supports session continuation via `DispatchOptions.sessionId` → `resume` (implemented in story 4-1, line 135). This story adds the logic to decide WHEN to pass a session ID and WHERE to find/store it.

### How Session Boundary Works End-to-End

```
workflow-engine (story 5-1) calls:
  1. resolveSessionId(task.session, { taskName, storyKey }, currentState)
     → returns sessionId or undefined
  2. dispatchAgent(definition, prompt, { sessionId })
     → agent-dispatch passes sessionId as `resume` to SDK
  3. recordSessionId({ taskName, storyKey }, result.sessionId, currentState)
     → updated state with session_id on checkpoint
  4. writeWorkflowState(updatedState)
     → persisted to disk for crash recovery
```

### Session ID Lookup Strategy

The `tasks_completed` array in `WorkflowState` stores all checkpoints including loop iterations. For `session: continue`, the lookup searches this array in reverse to find the most recent checkpoint matching both `task_name` and `story_key`. This naturally handles:
- First invocation: no match found, falls back to fresh
- Loop iterations: most recent checkpoint from previous iteration found
- Crash recovery: checkpoints persisted, so session ID survives restart

### Existing Code That Already Supports This

- `agent-dispatch.ts` line 135: `...(options?.sessionId ? { resume: options.sessionId } : {})` — already passes session ID as `resume`
- `workflow-state.ts` `TaskCheckpoint` interface: already has `session_id?: string`
- `workflow.schema.json` task definition: already has `session: { enum: ["fresh", "continue"], default: "fresh" }`
- `templates/workflows/default.yaml`: all tasks use `session: fresh`

### What This Story Does NOT Do

- Does NOT modify `agent-dispatch.ts` — it already handles session IDs via options
- Does NOT implement the workflow-engine orchestration loop (that's story 5-1)
- Does NOT generate trace IDs (that's story 4-3)
- Does NOT create source-isolated workspaces (that's story 4-4)
- Does NOT implement retry/finding injection (that's story 5-2)

### Anti-Patterns to Avoid

- **Do NOT add workflow-state imports to agent-dispatch.ts** — keep dispatch stateless
- **Do NOT cache session IDs in module-level variables** — always read from WorkflowState for crash recovery safety
- **Do NOT mutate WorkflowState in place** — return new state objects from `recordSessionId()`
- **Do NOT add retry logic** — that's the engine's responsibility

### Dependencies from Previous Stories

- **Story 4-1** created `agent-dispatch.ts` with `DispatchOptions.sessionId` and `DispatchResult.sessionId` — this module provides the logic to populate `DispatchOptions.sessionId`
- **Story 1-3** created `workflow-state.ts` with `TaskCheckpoint.session_id` and `writeWorkflowState()`/`readWorkflowState()` — this module reads/writes session IDs via the state
- **Story 2-1** created the workflow schema with `session: fresh | continue` — this module interprets that field

### Project Structure Notes

- New file: `src/lib/session-manager.ts` — session boundary resolution and session ID tracking
- New test file: `src/lib/__tests__/session-manager.test.ts`
- No modifications to existing source files
- Aligns with architecture pattern: each module in `src/lib/` is one file with co-located test

### Testing Strategy

Mock `WorkflowState` objects directly — no file I/O mocking needed since session-manager works with in-memory state objects. The workflow-engine (story 5-1) handles the read/write lifecycle.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 4.2: Session Boundary Management]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — agent-dispatch]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns — Session boundary enforcement]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR20 — Session boundaries]
- [Source: src/lib/agent-dispatch.ts — DispatchOptions.sessionId, line 135 resume passthrough]
- [Source: src/lib/workflow-state.ts — TaskCheckpoint.session_id field]
- [Source: src/schemas/workflow.schema.json — session enum definition]
- [Source: _bmad-output/implementation-artifacts/4-1-agent-dispatch-module-sdk-integration.md — predecessor story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None required — no debugging needed. All tests passed on first run.

### Completion Notes List

- Created `src/lib/session-manager.ts` with three exported functions: `resolveSessionId`, `recordSessionId`, `getLastSessionId`
- Defined `SessionBoundary` type (`'fresh' | 'continue'`) and `SessionLookupKey` interface
- `resolveSessionId('fresh')` always returns undefined (new session); `resolveSessionId('continue')` looks up most recent session ID via reverse search on `tasks_completed`
- `recordSessionId` returns a new WorkflowState (immutable) with the session ID appended as a new TaskCheckpoint
- `getLastSessionId` does reverse linear search on `tasks_completed` matching both `task_name` and `story_key`
- Verified `agent-dispatch.ts` line 135 already passes `sessionId` as `resume` option to SDK `query()`
- Verified `TaskCheckpoint` already has `session_id?: string` field in `workflow-state.ts`
- 22 unit tests covering all 9 acceptance criteria, including crash recovery and loop iteration scenarios
- 100% coverage (statements, branches, functions, lines) on `session-manager.ts`
- Full regression suite: 152 test files, 3855 tests, all passing

### Change Log

- 2026-04-02: Story 4.2 implemented — session boundary management module with full test coverage

### File List

- `src/lib/session-manager.ts` (new)
- `src/lib/__tests__/session-manager.test.ts` (new)
- `_bmad-output/implementation-artifacts/4-2-session-boundary-management.md` (modified)

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context) | **Date:** 2026-04-02

### Findings

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | MEDIUM | `resolveSessionId` — invalid boundary value silently falls through to `continue` behavior instead of defaulting to safe `fresh` | FIXED — added explicit `boundary !== 'continue'` guard |
| 2 | MEDIUM | `recordSessionId` — no validation on empty `sessionId`, would create checkpoint with falsy session_id causing silent lookup failures | FIXED — added throw on empty string |
| 3 | MEDIUM | `getLastSessionId` — falsy check (`cp.session_id`) treats empty string same as undefined, masking data integrity issues | FIXED — changed to explicit `!== undefined` check |
| 4 | MEDIUM | `recordSessionId` docstring contradicted implementation — claimed engine sets `completed_at` but function already set it | FIXED — updated docstring to match behavior |
| 5 | LOW | No module-level JSDoc on `session-manager.ts` | Not fixed (cosmetic) |
| 6 | LOW | Test helper `makeCheckpoint` defaults always produce same key, easy to accidentally test same key when different keys intended | Not fixed (test ergonomics) |

### Tests Added

- `resolveSessionId` — unknown boundary value defensive fallback
- `recordSessionId` — throws on empty sessionId
- `getLastSessionId` — returns empty string when present (does not skip it)

### Coverage

- `session-manager.ts`: 100% (statements, branches, functions, lines)
- Overall: 96.64% (above 90% target)
- All 155 files above 80% per-file floor

### Verdict

**Changes Requested** — 4 MEDIUM issues found and fixed. Story moved to `verifying`.
