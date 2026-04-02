# Story 4.1: Agent Dispatch Module — SDK Integration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an agent-dispatch module that spawns sessions via the Agent SDK,
so that agent execution is programmatic and reliable.

## Acceptance Criteria

1. **Given** a compiled `SubagentDefinition` and a prompt string
   **When** `dispatchAgent(definition, prompt, options)` is called
   **Then** the Agent SDK `query()` is invoked with the subagent definition, `bare: true`, and the prompt — and the function returns when the session completes
   <!-- verification: test-provable -->

2. **Given** a successful `dispatchAgent()` call
   **When** the Agent SDK session completes
   **Then** the function returns a `DispatchResult` containing `sessionId` (string), `success` (boolean), `durationMs` (number), and `output` (string — the agent's final text response)
   <!-- verification: test-provable -->

3. **Given** a compiled subagent definition
   **When** dispatched via `dispatchAgent()`
   **Then** spawn completes in <5s excluding model response time (NFR3)
   <!-- verification: runtime-provable -->

4. **Given** any `dispatchAgent()` call
   **When** the Agent SDK is invoked
   **Then** no `child_process.spawn`, `execFileSync`, or any CLI-based process spawning is used — only the Agent SDK `query()` API (NFR11)
   <!-- verification: test-provable -->

5. **Given** an API rate limit error from the Agent SDK
   **When** `dispatchAgent()` encounters it
   **Then** a `DispatchError` is thrown with `code: 'RATE_LIMIT'`, the original error message, and the subagent name — no retry logic (that is the engine's responsibility)
   <!-- verification: test-provable -->

6. **Given** a network error (timeout, DNS failure, connection refused)
   **When** `dispatchAgent()` encounters it
   **Then** a `DispatchError` is thrown with `code: 'NETWORK'`, the original error message, and the subagent name
   <!-- verification: test-provable -->

7. **Given** the Claude CLI binary is not installed or the SDK cannot initialize
   **When** `dispatchAgent()` encounters it
   **Then** a `DispatchError` is thrown with `code: 'SDK_INIT'`, a descriptive message, and the subagent name
   <!-- verification: test-provable -->

8. **Given** an unexpected/unknown error from the Agent SDK
   **When** `dispatchAgent()` encounters it
   **Then** a `DispatchError` is thrown with `code: 'UNKNOWN'`, the original error stringified, and the subagent name
   <!-- verification: test-provable -->

9. **Given** dispatch options include `cwd: '/some/path'`
   **When** `dispatchAgent()` is called
   **Then** the Agent SDK `query()` is invoked with `cwd` set to the specified path (used by evaluator for source isolation, story 4-4)
   <!-- verification: test-provable -->

10. **Given** unit tests for the agent-dispatch module
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for `src/lib/agent-dispatch.ts` covering: successful dispatch, result shape, error classification (rate limit, network, SDK init, unknown), cwd passthrough, bare:true enforcement, no child_process usage, and no regressions in existing tests
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add `@anthropic-ai/claude-agent-sdk` dependency (AC: #1, #4)
  - [x] Run `npm install @anthropic-ai/claude-agent-sdk` to add the SDK as a production dependency
  - [x] Verify the package installs and `query()` is importable
  - [x] Update `package.json` `files` array if any SDK-related template files are needed (unlikely)

- [x] Task 2: Define TypeScript interfaces (AC: #1, #2, #5-8)
  - [x] Define `DispatchOptions` interface: `cwd?: string`, `sessionId?: string` (for story 4-2 continue), `appendSystemPrompt?: string` (for story 4-3 trace IDs)
  - [x] Define `DispatchResult` interface: `sessionId: string`, `success: boolean`, `durationMs: number`, `output: string`
  - [x] Define `DispatchError` error class extending `Error` with `code: 'RATE_LIMIT' | 'NETWORK' | 'SDK_INIT' | 'UNKNOWN'`, `agentName: string`, and `cause: unknown`
  - [x] Import `SubagentDefinition` from `agent-resolver.ts` (the input type)

- [x] Task 3: Implement `dispatchAgent()` (AC: #1, #2, #3, #4, #9)
  - [x] Create `src/lib/agent-dispatch.ts`
  - [x] Import Agent SDK `query()` (or equivalent entry point from `@anthropic-ai/claude-agent-sdk`)
  - [x] Implement `async function dispatchAgent(definition: SubagentDefinition, prompt: string, options?: DispatchOptions): Promise<DispatchResult>`
  - [x] Pass `bare: true` to the SDK call (always, per AD2)
  - [x] Pass `cwd` from options if provided
  - [x] Pass `appendSystemPrompt` from options if provided (for trace ID injection, story 4-3)
  - [x] Record start time, await SDK completion, compute `durationMs`
  - [x] Extract `sessionId` and agent output text from SDK response
  - [x] Return `DispatchResult`

- [x] Task 4: Implement error classification (AC: #5, #6, #7, #8)
  - [x] Wrap the SDK `query()` call in try/catch
  - [x] Classify errors by inspecting error type/message/code from the SDK:
    - Rate limit: HTTP 429 or SDK-specific rate limit error → `code: 'RATE_LIMIT'`
    - Network: ECONNREFUSED, ETIMEDOUT, ENOTFOUND, fetch errors → `code: 'NETWORK'`
    - SDK init: binary not found, SDK constructor failure → `code: 'SDK_INIT'`
    - All other: `code: 'UNKNOWN'`
  - [x] All errors wrapped in `DispatchError` with original error as `cause`

- [x] Task 5: Write unit tests (AC: #10)
  - [x] Create `src/lib/__tests__/agent-dispatch.test.ts`
  - [x] Mock `@anthropic-ai/claude-agent-sdk` using vitest `vi.mock`
  - [x] Test: successful dispatch returns correct `DispatchResult` shape
  - [x] Test: `bare: true` is always passed to SDK
  - [x] Test: `cwd` is passed through from options
  - [x] Test: `appendSystemPrompt` is passed through from options
  - [x] Test: rate limit error (429) produces `DispatchError` with `code: 'RATE_LIMIT'`
  - [x] Test: network error (ECONNREFUSED) produces `DispatchError` with `code: 'NETWORK'`
  - [x] Test: SDK init failure produces `DispatchError` with `code: 'SDK_INIT'`
  - [x] Test: unknown error produces `DispatchError` with `code: 'UNKNOWN'`
  - [x] Test: `durationMs` is a positive number
  - [x] Test: module does not import `child_process` (grep source file or use static analysis)
  - [x] Test: no regressions in existing test suite

## Dev Notes

### Module Location and Architecture Role

Per architecture-v2 AD1, `agent-dispatch` calls Agent SDK `query()`, manages sessions, and injects trace IDs (FR19-23). It lives at `src/lib/agent-dispatch.ts` with tests at `src/lib/__tests__/agent-dispatch.test.ts`. This module is consumed by `workflow-engine` (story 5-1) for task execution and by `evaluator` (story 6-1) for spawning the evaluator agent.

### Agent SDK Integration

The `@anthropic-ai/claude-agent-sdk` package provides `query()` as the primary entry point. Key SDK options:

```typescript
// Conceptual — exact API shape depends on SDK version
import { query } from '@anthropic-ai/claude-agent-sdk';

const result = await query({
  model: definition.model,
  prompt: prompt,
  systemPrompt: definition.instructions,
  appendSystemPrompt: options?.appendSystemPrompt,
  disallowedTools: definition.disallowedTools,
  cwd: options?.cwd,
  bare: true,           // always — per AD2
});
```

**Important:** The exact SDK API may differ from what is shown above. The developer MUST check the actual `@anthropic-ai/claude-agent-sdk` package API when implementing. The key constraint is: use `query()` (or equivalent), pass `bare: true`, and DO NOT use `child_process`.

### Error Classification Strategy

The SDK may throw different error types. Classification heuristics:

| Signal | Classification |
|--------|---------------|
| HTTP 429, "rate limit" in message | `RATE_LIMIT` |
| ECONNREFUSED, ETIMEDOUT, ENOTFOUND, fetch failure | `NETWORK` |
| "claude not found", "binary not found", SDK constructor error | `SDK_INIT` |
| Everything else | `UNKNOWN` |

No retry logic in this module. Retry is the engine's responsibility (story 5-1).

### Session Management Extensibility

This story implements the basic dispatch. Story 4-2 adds session boundary management (fresh vs continue). The `DispatchOptions.sessionId` field is defined here but not actively used — it is a forward-compatible hook for story 4-2. Similarly, `appendSystemPrompt` is defined for story 4-3 (trace ID injection).

### What This Story Does NOT Do

- Does NOT implement session boundary management (that's story 4-2)
- Does NOT generate or inject trace IDs (that's story 4-3)
- Does NOT create source-isolated workspaces (that's story 4-4)
- Does NOT implement retry logic (that's workflow-engine, story 5-1)
- Does NOT parse agent output into structured data (that's evaluator, story 6-2)
- Does NOT cache subagent definitions (that's workflow-engine, story 5-1)
- Does NOT manage Docker lifecycle (that's workflow-engine)

### Anti-Patterns to Avoid

- **Do NOT use `child_process.spawn` or `execFileSync`** — NFR11 strictly forbids CLI process spawning
- **Do NOT implement retry logic** — that's the engine's responsibility
- **Do NOT cache SDK instances across calls** — each call is independent
- **Do NOT parse or validate agent output** — return raw text, let consumers (evaluator) parse
- **Do NOT import from `workflow-state`** — this module has no state awareness
- **Do NOT set `bare: false`** — always `bare: true` per AD2

### Dependencies from Previous Stories

- **Story 3-3** created `agent-resolver.ts` with `SubagentDefinition` interface and `compileSubagentDefinition()` — this module imports `SubagentDefinition` as its input type
- **Story 3-1** created the agent schema — validates configs before they reach this module
- **Story 3-2** created embedded agent templates — resolved by agent-resolver before reaching this module

### New Dependency

This story adds the first new runtime dependency since project inception: `@anthropic-ai/claude-agent-sdk`. This must be added to `package.json` `dependencies` (not `devDependencies`) since it is required at runtime.

### Existing Test Patterns

Follow the pattern in existing tests:
- Tests are co-located in `src/lib/__tests__/`
- Use vitest (`describe`, `it`, `expect`)
- Mock external dependencies with `vi.mock`
- Use `vi.fn()` for spying on SDK calls
- For testing error paths: create mock errors that match SDK error shapes
- Follow the `agent-resolver.test.ts` pattern for module testing style

### Git Intelligence

Recent commits follow `feat: story X-Y-slug -- description`. The codebase uses TypeScript with ESM (`"type": "module"`), vitest for testing, and tsup for building. All modules are single files in `src/lib/` with co-located tests in `__tests__/`.

### Project Structure Notes

- New file: `src/lib/agent-dispatch.ts` — the agent dispatch module
- New test file: `src/lib/__tests__/agent-dispatch.test.ts`
- Modified file: `package.json` — adds `@anthropic-ai/claude-agent-sdk` dependency
- No changes to any existing source files (besides package.json)

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 4.1: Agent Dispatch Module — SDK Integration]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — agent-dispatch]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD2: Evaluator Workspace Isolation]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns — Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR19-FR23 — Agent Dispatch FRs]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR3 — Session spawn <5s]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR11 — Programmatic dispatch only]
- [Source: src/lib/agent-resolver.ts — SubagentDefinition interface (input type)]
- [Source: _bmad-output/implementation-artifacts/3-3-agent-resolver-module.md — predecessor story]
