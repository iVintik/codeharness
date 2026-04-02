# Story 4.3: Trace ID Generation & Injection

Status: verifying

## Story

As a developer,
I want trace IDs generated per iteration and injected into prompts,
so that agent activity correlates to observability data.

## Acceptance Criteria

1. **Given** a trace ID generator module at `src/lib/trace-id.ts`
   **When** inspected
   **Then** it exports a `generateTraceId(runId: string, iteration: number, taskName: string): string` function
   <!-- verification: test-provable -->

2. **Given** an iteration starting with runId `abc123`, iteration `2`, and taskName `verify`
   **When** `generateTraceId()` is called
   **Then** the returned string matches the format `ch-abc123-2-verify` (pattern: `ch-{runId}-{iteration}-{taskName}`)
   <!-- verification: test-provable -->

3. **Given** a `generateTraceId()` call with a runId containing special characters (spaces, slashes, unicode)
   **When** the trace ID is generated
   **Then** special characters are sanitized (replaced with hyphens or stripped) so the trace ID is safe for use in logs, metrics labels, and HTTP headers
   <!-- verification: test-provable -->

4. **Given** a generated trace ID
   **When** it is formatted for injection via `formatTracePrompt(traceId: string): string`
   **Then** it returns a system prompt fragment containing the trace ID in a structured block (e.g., `[TRACE] trace_id=ch-abc123-2-verify`) that an agent can include in log/metric/trace output
   <!-- verification: test-provable -->

5. **Given** the `formatTracePrompt()` output
   **When** passed as `appendSystemPrompt` to `dispatchAgent()` (via `DispatchOptions`)
   **Then** it is appended to the agent's system prompt (verified by confirming `agent-dispatch.ts` line 123-124 already handles `appendSystemPrompt`)
   <!-- verification: test-provable -->

6. **Given** a trace ID generated during a dispatch
   **When** it is recorded in workflow state via `recordTraceId(traceId: string, state: WorkflowState): WorkflowState`
   **Then** the returned state has the trace ID appended to a `trace_ids: string[]` array on the `WorkflowState` object
   <!-- verification: test-provable -->

7. **Given** a `WorkflowState` with `trace_ids` persisted to `workflow-state.yaml`
   **When** `readWorkflowState()` reads it back
   **Then** the `trace_ids` array is correctly deserialized and accessible
   <!-- verification: test-provable -->

8. **Given** multiple iterations in a workflow run
   **When** each iteration generates and records a trace ID
   **Then** `workflow-state.yaml` contains all trace IDs in order (one per dispatch call)
   <!-- verification: test-provable -->

9. **Given** unit tests for trace ID generation and injection
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for the trace ID module covering: format correctness, sanitization of special characters, prompt fragment formatting, trace ID recording in state, round-trip persistence, and multiple iteration accumulation
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create trace ID generator module (AC: #1, #2, #3)
  - [x] Create `src/lib/trace-id.ts`
  - [x] Implement `generateTraceId(runId: string, iteration: number, taskName: string): string` — produces `ch-{runId}-{iteration}-{taskName}`
  - [x] Implement `sanitizeSegment(segment: string): string` — replaces non-alphanumeric characters (except hyphens) with hyphens, collapses consecutive hyphens, trims leading/trailing hyphens
  - [x] Apply sanitization to `runId` and `taskName` segments

- [x] Task 2: Create prompt injection formatter (AC: #4, #5)
  - [x] Implement `formatTracePrompt(traceId: string): string` — returns a structured system prompt fragment like:
    ```
    [TRACE] trace_id={traceId}
    Include this trace ID in all log output, metric labels, and trace spans for correlation.
    ```
  - [x] Verify that `agent-dispatch.ts` already handles `appendSystemPrompt` (it does — lines 121-125)
  - [x] No changes needed to `agent-dispatch.ts` — it already supports this via `DispatchOptions.appendSystemPrompt`

- [x] Task 3: Add trace_ids to WorkflowState (AC: #6, #7)
  - [x] Add `trace_ids?: string[]` to `WorkflowState` interface in `workflow-state.ts`
  - [x] Update `getDefaultWorkflowState()` to include `trace_ids: []`
  - [x] Update `isValidWorkflowState()` to validate `trace_ids` as optional array of strings
  - [x] Implement `recordTraceId(traceId: string, state: WorkflowState): WorkflowState` in `trace-id.ts` — returns new state with trace ID appended to `trace_ids` array (immutable)

- [x] Task 4: Write unit tests (AC: #9)
  - [x] Create `src/lib/__tests__/trace-id.test.ts`
  - [x] Test: `generateTraceId('abc123', 2, 'verify')` returns `'ch-abc123-2-verify'`
  - [x] Test: `generateTraceId('run with spaces', 1, 'implement')` sanitizes to `'ch-run-with-spaces-1-implement'`
  - [x] Test: `generateTraceId('a/b\\c', 0, 'd.e')` sanitizes slashes, backslashes, dots
  - [x] Test: `generateTraceId('', 1, 'verify')` handles empty runId gracefully
  - [x] Test: `formatTracePrompt('ch-abc-1-dev')` returns string containing `trace_id=ch-abc-1-dev`
  - [x] Test: `formatTracePrompt('ch-abc-1-dev')` includes instruction text about including trace ID in logs
  - [x] Test: `recordTraceId('ch-abc-1-dev', state)` appends to trace_ids array
  - [x] Test: `recordTraceId` does not mutate the input state
  - [x] Test: `recordTraceId` throws on empty traceId
  - [x] Test: round-trip — write state with trace_ids, read it back, array matches
  - [x] Test: multiple `recordTraceId` calls accumulate trace IDs in order
  - [x] Verify 80%+ coverage on `trace-id.ts`

## Dev Notes

### Module Design Decision

Trace ID generation is a standalone `trace-id.ts` module rather than being added to `agent-dispatch.ts` or `session-manager.ts`. Rationale:

1. `agent-dispatch.ts` is intentionally stateless — it does not import `workflow-state` (per story 4-1 anti-patterns)
2. `session-manager.ts` handles session boundary concerns, not observability — separate concern
3. The workflow-engine (story 5-1) orchestrates: generate trace ID -> format prompt -> dispatch agent -> record trace ID -> write state

### How Trace IDs Work End-to-End

```
workflow-engine (story 5-1) calls:
  1. generateTraceId(runId, iteration, taskName)
     -> returns 'ch-abc123-2-verify'
  2. formatTracePrompt(traceId)
     -> returns prompt fragment with [TRACE] block
  3. dispatchAgent(definition, prompt, { appendSystemPrompt: tracePrompt })
     -> agent-dispatch appends trace to system prompt (already implemented, line 123-124)
  4. recordTraceId(traceId, currentState)
     -> returns updated state with trace ID in trace_ids array
  5. writeWorkflowState(updatedState)
     -> persisted to disk
```

### Trace ID Format

Format: `ch-{runId}-{iteration}-{taskName}`

- `ch` prefix: identifies this as a codeharness trace (avoids collision with other trace systems)
- `runId`: unique per workflow run (generated by engine, story 5-1)
- `iteration`: integer, zero-based iteration counter within the run
- `taskName`: the workflow task name (e.g., 'implement', 'verify', 'retry')

All segments are sanitized to be safe for: log grep, metrics labels (Prometheus-compatible), HTTP headers (W3C Trace Context compatible character set), and YAML serialization.

### Existing Code That Already Supports This

- `agent-dispatch.ts` lines 14-15: `appendSystemPrompt?: string` in `DispatchOptions` — forward-compat placeholder created in story 4-1
- `agent-dispatch.ts` lines 121-125: appends `appendSystemPrompt` to `definition.instructions` — already implemented
- `workflow-state.ts` `WorkflowState` interface: will be extended with `trace_ids?: string[]`

### What This Story Does NOT Do

- Does NOT generate the `runId` — that's the workflow-engine's responsibility (story 5-1)
- Does NOT orchestrate when trace IDs are generated — that's the engine's loop (story 5-1)
- Does NOT implement OTLP trace propagation to observability backends — that's Epic 6 (evaluator observability)
- Does NOT modify `agent-dispatch.ts` — it already handles `appendSystemPrompt`
- Does NOT modify `session-manager.ts` — separate concern

### Anti-Patterns to Avoid

- **Do NOT add workflow-state imports to agent-dispatch.ts** — keep dispatch stateless
- **Do NOT generate runId in trace-id.ts** — the engine owns run identity
- **Do NOT cache trace IDs in module-level variables** — always return new state objects for crash recovery safety
- **Do NOT mutate WorkflowState in place** — return new state objects from `recordTraceId()`

### Dependencies from Previous Stories

- **Story 4-1** created `agent-dispatch.ts` with `DispatchOptions.appendSystemPrompt` — this module provides the formatted content for that field
- **Story 1-3** created `workflow-state.ts` with `WorkflowState` interface — this module extends it with `trace_ids`
- **Story 4-2** created `session-manager.ts` with the immutable state pattern — this module follows the same pattern

### Project Structure Notes

- New file: `src/lib/trace-id.ts` — trace ID generation, prompt formatting, state recording
- New test file: `src/lib/__tests__/trace-id.test.ts`
- Modified file: `src/lib/workflow-state.ts` — add `trace_ids?: string[]` to `WorkflowState`, update default and validator
- Aligns with architecture pattern: each module in `src/lib/` is one file with co-located test

### Testing Strategy

Unit tests only — no file I/O mocking needed for the generator and formatter. For `recordTraceId`, test with in-memory `WorkflowState` objects (same pattern as `session-manager.ts`). For round-trip persistence, use the existing `writeWorkflowState`/`readWorkflowState` with a temp directory.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 4.3: Trace ID Generation & Injection]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — agent-dispatch]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#FR36-37 — Observability, trace ID injection]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR22 — Trace ID per iteration]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR36 — Trace IDs correlate across iteration, prompt, logs, metrics, traces]
- [Source: src/lib/agent-dispatch.ts — DispatchOptions.appendSystemPrompt, lines 14-15, 121-125]
- [Source: src/lib/workflow-state.ts — WorkflowState interface, TaskCheckpoint]
- [Source: src/lib/session-manager.ts — immutable state pattern reference]
- [Source: _bmad-output/implementation-artifacts/4-1-agent-dispatch-module-sdk-integration.md — predecessor story]
- [Source: _bmad-output/implementation-artifacts/4-2-session-boundary-management.md — predecessor story]
