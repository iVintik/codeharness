# Story 10.1: AgentDriver Interface & Types

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a formalized AgentDriver interface with DriverHealth, DispatchOpts, and StreamEvent types,
so that all drivers (Claude Code, Codex, OpenCode) implement a consistent contract and the workflow engine can dispatch to any driver uniformly.

## Acceptance Criteria

1. **Given** the file `src/lib/agents/types.ts`
   **When** the interface is refactored
   **Then** `AgentDriver` has these members: `readonly name: string`, `readonly defaultModel: string`, `readonly capabilities: DriverCapabilities`, `healthCheck(): Promise<DriverHealth>`, `dispatch(opts: DispatchOpts): AsyncIterable<StreamEvent>`, `getLastCost(): number | null`
   **And** each member is typed correctly per the architecture document
   <!-- verification: test-provable -->

2. **Given** the `DispatchOpts` interface in `src/lib/agents/types.ts`
   **When** inspected
   **Then** it includes: `prompt: string`, `model: string`, `cwd: string`, `sourceAccess: boolean`, `plugins?: string[]`, `timeout?: number`, `outputContract?: OutputContract`
   **And** optional fields use `?` syntax (not `| undefined`)
   <!-- verification: test-provable -->

3. **Given** the `DriverHealth` interface in `src/lib/agents/types.ts`
   **When** inspected
   **Then** it includes: `available: boolean`, `authenticated: boolean`, `version: string | null`, `error?: string`
   <!-- verification: test-provable -->

4. **Given** the `DriverCapabilities` interface in `src/lib/agents/types.ts`
   **When** inspected
   **Then** it includes at minimum: `supportsPlugins: boolean`, `supportsStreaming: boolean`, `costReporting: boolean`
   **And** the interface is extensible (new boolean fields can be added without breaking existing drivers)
   <!-- verification: test-provable -->

5. **Given** the `ErrorCategory` type in `src/lib/agents/types.ts`
   **When** inspected
   **Then** it is a union of exactly: `'RATE_LIMIT' | 'NETWORK' | 'AUTH' | 'TIMEOUT' | 'UNKNOWN'`
   <!-- verification: test-provable -->

6. **Given** the `OutputContract` interface in `src/lib/agents/types.ts`
   **When** inspected
   **Then** it includes: `version: number`, `taskName: string`, `storyId: string`, `driver: string`, `model: string`, `timestamp: string`, `cost_usd: number | null`, `duration_ms: number`, `changedFiles: string[]`, `testResults: TestResults | null`, `output: string`, `acceptanceCriteria: ACStatus[]`
   **And** `TestResults` has `passed: number`, `failed: number`, `coverage: number | null`
   **And** `ACStatus` has `id: string`, `description: string`, `status: string`
   <!-- verification: test-provable -->

7. **Given** `dispatch()` on the new `AgentDriver` interface
   **When** its return type is inspected
   **Then** it returns `AsyncIterable<StreamEvent>` (not `AgentProcess`, not a Promise of array)
   <!-- verification: test-provable -->

8. **Given** the existing `StreamEvent` types in `src/lib/agents/stream-parser.ts`
   **When** the refactoring is complete
   **Then** all existing `StreamEvent` variant types (`ToolStartEvent`, `ToolInputEvent`, `ToolCompleteEvent`, `TextEvent`, `RetryEvent`, `ResultEvent`) are preserved without breaking changes
   **And** `ResultEvent` gains an optional `cost_usd: number | null` field (in addition to existing `cost: number`) for multi-driver normalization
   <!-- verification: test-provable -->

9. **Given** the old `AgentDriver` interface shape (`name`, `spawn()`, `parseOutput()`, `getStatusFile()`)
   **When** code consuming the old interface is inspected
   **Then** the old `SpawnOpts` type, `AgentProcess` type, and `AgentEvent` type are preserved as deprecated exports with `@deprecated` JSDoc tags
   **And** `src/lib/agents/index.ts` barrel still re-exports them for backward compatibility
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

11. **Given** unit tests for the new types in `src/lib/agents/__tests__/types.test.ts`
    **When** `npm run test:unit` is executed
    **Then** tests validate: all `AgentDriver` members exist on a mock implementation, `DispatchOpts` accepts all required and optional fields, `DriverHealth` accepts valid health objects, `DriverCapabilities` accepts capability objects, `ErrorCategory` covers exactly 5 values, `OutputContract` accepts valid contracts, `AsyncIterable<StreamEvent>` return type compiles, deprecated types still compile
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add new types to `src/lib/agents/types.ts` (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Add `DriverHealth` interface
  - [x] Add `DriverCapabilities` interface
  - [x] Add `ErrorCategory` type union
  - [x] Add `DispatchOpts` interface (import `OutputContract` type)
  - [x] Add `OutputContract`, `TestResults`, `ACStatus` interfaces
  - [x] Refactor `AgentDriver` interface to new shape: `name`, `defaultModel`, `capabilities`, `healthCheck()`, `dispatch()`, `getLastCost()`
  - [x] Mark old `SpawnOpts`, `AgentProcess`, `AgentEvent` with `@deprecated` JSDoc

- [x] Task 2: Update `StreamEvent` types in `src/lib/agents/stream-parser.ts` (AC: #8)
  - [x] Add optional `cost_usd: number | null` field to `ResultEvent` (keep existing `cost: number` for backward compat)
  - [x] Verify all existing event types are preserved

- [x] Task 3: Update barrel exports in `src/lib/agents/index.ts` (AC: #9)
  - [x] Export new types: `DriverHealth`, `DriverCapabilities`, `DispatchOpts`, `ErrorCategory`, `OutputContract`, `TestResults`, `ACStatus`
  - [x] Keep deprecated type exports with `@deprecated` JSDoc comments
  - [x] Update `getDriver()` stub signature if needed (still throws — factory implementation is story 10-2)

- [x] Task 4: Update unit tests in `src/lib/agents/__tests__/types.test.ts` (AC: #10, #11)
  - [x] Add test suite for new `AgentDriver` interface shape (mock implementing all members)
  - [x] Add test for `DispatchOpts` with all required and optional fields
  - [x] Add test for `DriverHealth` interface
  - [x] Add test for `DriverCapabilities` interface
  - [x] Add test for `ErrorCategory` covering all 5 values
  - [x] Add test for `OutputContract`, `TestResults`, `ACStatus`
  - [x] Add test proving `dispatch()` returns `AsyncIterable<StreamEvent>`
  - [x] Preserve and update existing tests for deprecated types
  - [x] Verify `npm run build` and `npm run test:unit` pass

## Dev Notes

### Architecture Compliance

This story implements the **AgentDriver Interface Design** from `_bmad-output/planning-artifacts/architecture-multi-framework.md` (Decision 1). Key constraints:

- **Interface signature must match exactly** what the architecture specifies (see Decision 1 code block)
- `dispatch()` returns `AsyncIterable<StreamEvent>` — this is the core design choice enabling both in-process (Agent SDK yields) and CLI-wrapped (stdout parsed to events) drivers
- Drivers must be stateless between dispatches except for `lastCost`
- `DriverCapabilities` enables FR37-FR38 (capability matrix and routing hints) in later stories

### Existing Code to Modify

1. **`src/lib/agents/types.ts`** — Current interface: `{ name, spawn(), parseOutput(), getStatusFile() }`. Must be refactored to new shape. Old types must stay as deprecated exports.
2. **`src/lib/agents/stream-parser.ts`** — Contains `StreamEvent` union and all variant types. Add `cost_usd` to `ResultEvent`. Do NOT change `parseStreamLine()` behavior — it stays Claude-Code-specific. Other drivers will have their own parsers.
3. **`src/lib/agents/index.ts`** — Barrel file. Must export new types. The `getDriver()` function currently throws — leave that (factory comes in story 10-2).
4. **`src/lib/agents/__tests__/types.test.ts`** — Existing tests for old interface. Must be updated for new interface AND kept for deprecated types.

### What NOT to Do

- Do NOT create `src/lib/agents/drivers/` directory yet — that is story 10-2 (factory) and 10-3 (claude-code driver extraction)
- Do NOT modify `workflow-engine.ts` or `agent-dispatch.ts` — integration comes in story 10-5
- Do NOT create a `model-resolver.ts` — that is story 10-4
- Do NOT remove the old types — they must stay as deprecated exports for backward compatibility until story 10-3 completes the migration
- Do NOT change `parseStreamLine()` in `stream-parser.ts` — only extend `ResultEvent` type

### Error Classification (from Architecture)

The `ErrorCategory` type must use exactly these 5 values, in this priority order for classification:
1. HTTP 429 or "rate limit" in message -> `RATE_LIMIT`
2. ECONNREFUSED, ETIMEDOUT, ENOTFOUND -> `NETWORK`
3. HTTP 401/403 or "unauthorized"/"forbidden" -> `AUTH`
4. Process killed by timeout -> `TIMEOUT`
5. Everything else -> `UNKNOWN`

Drivers must NOT invent new categories. This will be enforced via the type system.

### StreamEvent Ordering Contract (from Architecture)

For reference (implemented in later stories, but types must support):
1. Zero or more `tool-start` -> `tool-input` -> `tool-complete` sequences
2. Zero or more `text` events (interleaved)
3. Zero or more `retry` events
4. Exactly one `result` event at the end

### Testing Patterns

- Follow existing Vitest patterns in `src/lib/agents/__tests__/types.test.ts`
- Type-level tests: construct values satisfying each interface to prove they compile
- Runtime tests: assert field values on constructed objects
- Use `describe/it/expect` structure consistent with existing test file
- Do NOT use mocking frameworks — these are pure type/interface tests

### Project Structure Notes

- All new types go in `src/lib/agents/types.ts` (single file, not sharded)
- `OutputContract` type lives here because it's part of `DispatchOpts` — the separate `output-contract.ts` module (story 10-4+) will import this type
- No new files created in this story — only modifications to existing files

### References

- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 1: Driver Interface Design]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 1.1: AgentDriver Interface & Types]
- [Source: src/lib/agents/types.ts — current interface to refactor]
- [Source: src/lib/agents/stream-parser.ts — StreamEvent types to extend]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/10-1-agentdriver-interface-types-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/10-1-agentdriver-interface-types.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no debug issues encountered.

### Completion Notes List

- Refactored `AgentDriver` interface to new v2 shape with `dispatch()`, `healthCheck()`, `getLastCost()`, `capabilities`, `defaultModel`
- Added `DriverHealth`, `DriverCapabilities`, `ErrorCategory`, `DispatchOpts`, `OutputContract`, `TestResults`, `ACStatus` types
- Marked old `SpawnOpts`, `AgentProcess`, `AgentEvent` as `@deprecated` with JSDoc
- Extended `ResultEvent` with optional `cost_usd` field
- Updated barrel exports in `index.ts` with all new types
- Comprehensive test suite: 30+ tests covering all interfaces, deprecated types, and barrel re-exports
- Build: zero TS errors in agents module. All 4219 unit tests pass.

### File List

- `src/lib/agents/types.ts` — refactored interface + new types + deprecated old types
- `src/lib/agents/stream-parser.ts` — added `cost_usd` to `ResultEvent`
- `src/lib/agents/index.ts` — updated barrel exports
- `src/lib/agents/__tests__/types.test.ts` — rewritten test suite
