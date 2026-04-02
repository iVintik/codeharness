# Story 6.1: Evaluator Module — Workspace & Spawn

Status: verifying

## Story

As a developer,
I want an evaluator module that sets up a source-free workspace and spawns the evaluator agent,
so that verification is truly blind and cannot access implementation code.

## Acceptance Criteria

1. **Given** `src/lib/evaluator.ts` exists
   **When** inspected
   **Then** it exports a `runEvaluator(options: EvaluatorOptions): Promise<EvaluatorResult>` function that orchestrates workspace creation, evaluator agent spawn, and result collection
   <!-- verification: test-provable -->

2. **Given** all stories in the sprint are implemented
   **When** the evaluator task runs via `runEvaluator()`
   **Then** a temp workspace is created at `/tmp/codeharness-verify-{runId}/` containing `story-files/` with AC files and `verdict/` for output, but no source code
   **And** the workspace is created via `createIsolatedWorkspace()` from `source-isolation.ts`
   <!-- verification: test-provable -->

3. **Given** the evaluator workspace is ready
   **When** the evaluator agent is spawned
   **Then** it is dispatched via `dispatchAgent()` with `bare: true` and `source_access: false` enforced
   **And** `disallowedTools: ["Edit", "Write"]` is set on the subagent definition (inherited from `evaluator.yaml`)
   **And** the agent's `cwd` is set to the temp workspace directory
   <!-- verification: test-provable -->

4. **Given** Docker is installed and running
   **When** the evaluator runs
   **Then** Docker availability is checked via `isDockerAvailable()` before spawning the evaluator
   **And** Docker access is available to the evaluator agent within its workspace
   <!-- verification: test-provable -->

5. **Given** Docker is NOT running or not installed
   **When** the evaluator task runs
   **Then** `runEvaluator()` returns a result with all ACs scored as `UNKNOWN`
   **And** a finding is recorded with `status: "unknown"` and `evidence.reasoning` explaining Docker is unavailable
   **And** execution does NOT throw a fatal error
   <!-- verification: test-provable -->

6. **Given** the evaluator agent dispatch exceeds the configured timeout
   **When** the dispatch times out
   **Then** a timeout handler produces a scored `UNKNOWN` result (not a fatal error)
   **And** the timeout duration is configurable via `EvaluatorOptions.timeoutMs` (default: 300000ms / 5 minutes)
   **And** the evaluator result includes a finding explaining the timeout
   <!-- verification: test-provable -->

7. **Given** the evaluator completes (success or timeout)
   **When** the workspace is no longer needed
   **Then** `workspace.cleanup()` is called to remove the temp directory
   **And** cleanup is idempotent and does not throw on missing directory
   <!-- verification: test-provable -->

8. **Given** `EvaluatorOptions` interface
   **When** inspected
   **Then** it includes: `runId: string`, `storyFiles: string[]`, `agentDefinition: SubagentDefinition`, `timeoutMs?: number`, `traceId?: string`
   <!-- verification: test-provable -->

9. **Given** `EvaluatorResult` interface
   **When** inspected
   **Then** it includes: `output: string` (raw agent output), `success: boolean`, `durationMs: number`, `dockerAvailable: boolean`, `timedOut: boolean`
   <!-- verification: test-provable -->

10. **Given** unit tests for the evaluator module
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for `evaluator.ts` covering: workspace creation, agent dispatch, Docker unavailable fallback, timeout handling, cleanup, and interface validation
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define evaluator interfaces and types (AC: #1, #8, #9)
  - [x] Create `src/lib/evaluator.ts`
  - [x] Define `EvaluatorOptions` interface: `{ runId: string; storyFiles: string[]; agentDefinition: SubagentDefinition; timeoutMs?: number; traceId?: string }`
  - [x] Define `EvaluatorResult` interface: `{ output: string; success: boolean; durationMs: number; dockerAvailable: boolean; timedOut: boolean }`
  - [x] Export `runEvaluator()` function signature

- [x] Task 2: Implement Docker availability check (AC: #4, #5)
  - [x] Import `isDockerAvailable()` from `./docker/index.js`
  - [x] At the start of `runEvaluator()`, check Docker availability
  - [x] If Docker not available, return early with `EvaluatorResult` containing `dockerAvailable: false`, `success: false`, `output` set to a JSON string matching `EvaluatorVerdict` with all ACs scored UNKNOWN and reasoning explaining Docker is unavailable

- [x] Task 3: Implement workspace creation (AC: #2)
  - [x] Call `createIsolatedWorkspace({ runId, storyFiles })` from `source-isolation.ts`
  - [x] The workspace already creates `/tmp/codeharness-verify-{runId}/` with `story-files/` and `verdict/` subdirectories

- [x] Task 4: Implement evaluator agent dispatch (AC: #3)
  - [x] Build `DispatchOptions` from the workspace: `{ cwd: workspace.dir }`
  - [x] If `traceId` provided, append trace prompt via `formatTracePrompt()` to `appendSystemPrompt`
  - [x] Call `dispatchAgent(agentDefinition, prompt, dispatchOptions)`
  - [x] The prompt instructs the evaluator to read story files from `story-files/`, run verification commands, and write its verdict as JSON

- [x] Task 5: Implement timeout handling (AC: #6)
  - [x] Wrap `dispatchAgent()` call with `Promise.race()` against a timeout promise
  - [x] Default timeout: 300000ms (5 minutes)
  - [x] On timeout: produce `EvaluatorResult` with `timedOut: true`, `success: false`, `output` set to a JSON string with all UNKNOWN verdicts and timeout reasoning

- [x] Task 6: Implement cleanup (AC: #7)
  - [x] In a `finally` block after dispatch (or timeout), call `workspace.cleanup()`
  - [x] Ensure cleanup runs regardless of success, failure, or timeout

- [x] Task 7: Write unit tests (AC: #10)
  - [x] Create `src/lib/__tests__/evaluator.test.ts`
  - [x] Mock `dispatchAgent()` from `agent-dispatch.ts`
  - [x] Mock `createIsolatedWorkspace()` from `source-isolation.ts`
  - [x] Mock `isDockerAvailable()` from `docker/index.ts`
  - [x] Mock `formatTracePrompt()` from `trace-id.ts`
  - [x] Test: successful evaluator spawn returns output and success
  - [x] Test: Docker unavailable returns all-UNKNOWN result without throwing
  - [x] Test: timeout produces UNKNOWN result and sets `timedOut: true`
  - [x] Test: cleanup called on success
  - [x] Test: cleanup called on failure
  - [x] Test: cleanup called on timeout
  - [x] Test: workspace created with correct runId and storyFiles
  - [x] Test: trace ID injected when provided
  - [x] Test: `disallowedTools` inherited from evaluator agent definition
  - [x] Test: interface shapes match expected types (compile-time via TypeScript)
  - [x] Verify 80%+ coverage on `evaluator.ts`

## Dev Notes

### Module Design

`evaluator.ts` is a focused module responsible for the blind evaluator lifecycle: workspace setup, Docker check, agent dispatch with timeout, and cleanup. It does NOT parse the evaluator's output into a structured verdict (that's story 6-2) or construct the evaluator prompt template (that's story 6-3). It returns the raw output string for downstream processing.

### Integration Points

The evaluator module connects these existing modules:
- `source-isolation.ts` — `createIsolatedWorkspace()` for `/tmp/codeharness-verify-{runId}/` with no source code
- `agent-dispatch.ts` — `dispatchAgent()` for SDK-based agent execution
- `docker/index.ts` — `isDockerAvailable()` to check Docker CLI presence
- `trace-id.ts` — `formatTracePrompt()` for optional trace ID injection
- `agent-resolver.ts` — `SubagentDefinition` type (passed in, not resolved here)

### Data Flow

```
runEvaluator(options)
  1. isDockerAvailable() → if false, return all-UNKNOWN result early
  2. createIsolatedWorkspace({ runId, storyFiles }) → workspace
  3. Build dispatch options: { cwd: workspace.dir, appendSystemPrompt: tracePrompt }
  4. Build evaluator prompt: instructions to read story-files/, verify ACs, output JSON
  5. Promise.race([dispatchAgent(...), timeoutPromise])
     → If dispatch wins: collect output
     → If timeout wins: generate UNKNOWN result
  6. workspace.cleanup() (always, via finally)
  7. Return EvaluatorResult
```

### Evaluator Prompt (Minimal for Story 6-1)

The evaluator prompt for this story is a simple instruction:
```
Read the acceptance criteria in ./story-files/. For each AC, determine if it passes by running commands and checking output. Report your findings as JSON.
```

The full prompt template with anti-leniency instructions and structured output enforcement is story 6-3.

### Docker Lifecycle

Per AD2, Docker lifecycle is managed by the engine. For story 6-1, Docker availability is checked — if Docker is not running, the evaluator gracefully returns UNKNOWN scores rather than throwing. The evaluator agent itself uses Docker commands within its session (e.g., `docker exec`, `docker logs`). The engine does NOT start/stop Docker containers — the evaluator uses whatever is already running.

### Timeout Strategy

`Promise.race()` between the dispatch and a `setTimeout`-based promise:
```typescript
const timeoutPromise = new Promise<never>((_, reject) => {
  const id = setTimeout(() => reject(new Error('Evaluator timeout')), timeoutMs);
  // Store id for cleanup
});
```

On timeout, the abort signal does not kill the underlying SDK session — it just returns early. The cleanup of the workspace happens regardless.

### What This Story Does NOT Do

- Does NOT parse evaluator output into `EvaluatorVerdict` — that's story 6-2
- Does NOT construct the full evaluator prompt template — that's story 6-3
- Does NOT start/stop Docker containers — the evaluator uses existing containers
- Does NOT implement verdict schema validation — that's story 6-2
- Does NOT implement retry on invalid JSON — that's story 6-2
- Does NOT integrate with the workflow engine's loop — that was done in story 5-2
- Does NOT implement circuit breaker logic — that's Epic 7

### Anti-Patterns to Avoid

- **Do NOT import `parseVerdict`** from workflow-engine — verdict parsing is story 6-2's concern
- **Do NOT use `child_process.spawn`** for Docker — only check `isDockerAvailable()`; the evaluator agent itself runs Docker commands via its session
- **Do NOT throw on Docker unavailability** — return graceful UNKNOWN result
- **Do NOT throw on timeout** — return graceful UNKNOWN result with `timedOut: true`
- **Do NOT cache workspace across evaluator runs** — each run creates a fresh workspace
- **Do NOT resolve the evaluator agent** — receive `SubagentDefinition` pre-compiled via `EvaluatorOptions`

### Workspace Directory Structure

Per AD2 in architecture-v2.md:
```
/tmp/codeharness-verify-{runId}/
  story-files/     # copied ACs from sprint — provided via options.storyFiles
  verdict/         # evaluator writes JSON verdict here
```

Source code is absent because it was never copied. The `source-isolation.ts` module handles this.

### Previous Story Intelligence

From story 4-4 (source isolation):
- `createIsolatedWorkspace({ runId, storyFiles })` creates the temp dir with `story-files/` and `verdict/`
- `workspace.toDispatchOptions()` returns `{ cwd: workspace.dir }`
- `workspace.cleanup()` is idempotent — safe to call multiple times
- Missing story files are warned and skipped, not thrown

From story 4-1 (agent dispatch):
- `dispatchAgent(definition, prompt, options?)` returns `Promise<DispatchResult>`
- `DispatchResult` has `{ sessionId, success, durationMs, output }`
- `DispatchError` has `{ code, agentName, cause }` — codes: RATE_LIMIT, NETWORK, SDK_INIT, UNKNOWN

From evaluator.yaml template:
- `disallowedTools: ["Edit", "Write"]` — already set on the agent definition
- `bare: true` — set during `compileSubagentDefinition()` in agent-resolver
- The agent definition passed to `runEvaluator()` already has these properties compiled

### Testing Strategy

Heavy mocking approach — all I/O dependencies are mocked:
- `dispatchAgent()` — returns fake `DispatchResult` with configurable output
- `createIsolatedWorkspace()` — returns fake workspace with mock methods
- `isDockerAvailable()` — returns `true` or `false` per test
- `formatTracePrompt()` — returns predictable string

Tests verify:
1. Docker check happens before workspace creation
2. Workspace created with correct options
3. Dispatch called with correct arguments (cwd, appendSystemPrompt)
4. Timeout race works correctly
5. Cleanup always runs (success, failure, timeout paths)
6. UNKNOWN results generated correctly for Docker-unavailable and timeout cases

### Project Structure Notes

- New file: `src/lib/evaluator.ts` — blind evaluator workspace + spawn
- New test file: `src/lib/__tests__/evaluator.test.ts`
- No modified files — this module is additive only

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 6.1: Evaluator Module — Workspace & Spawn]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD2: Evaluator Workspace Isolation]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD5: Evaluator Verdict Schema]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — evaluator]
- [Source: src/lib/source-isolation.ts — createIsolatedWorkspace(), IsolatedWorkspace, IsolationOptions]
- [Source: src/lib/agent-dispatch.ts — dispatchAgent(), DispatchResult, DispatchError, DispatchOptions]
- [Source: src/lib/agent-resolver.ts — SubagentDefinition]
- [Source: src/lib/docker/health.ts — isDockerAvailable()]
- [Source: src/lib/trace-id.ts — formatTracePrompt()]
- [Source: src/lib/workflow-engine.ts — EvaluatorVerdict (type reference only)]
- [Source: templates/agents/evaluator.yaml — evaluator agent definition]
- [Source: templates/workflows/default.yaml — verify task definition]
- [Source: _bmad-output/implementation-artifacts/5-1-flow-execution-sequential-steps.md — predecessor story format reference]
