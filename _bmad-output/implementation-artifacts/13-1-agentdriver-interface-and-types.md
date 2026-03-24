# Story 13-1: Create AgentDriver Interface and Types

## Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

<!-- verification-tier: unit-testable -->

## Story

As a developer,
I want an `AgentDriver` interface that abstracts agent execution,
So that Ralph can be replaced or supplemented without touching 28 files.

## Acceptance Criteria

1. Given `src/lib/agents/types.ts` exists, when inspected, then it exports `AgentDriver`, `SpawnOpts`, `AgentProcess`, `AgentEvent` types <!-- verification: cli-verifiable -->
2. Given the `AgentDriver` interface, when inspected, then it defines: `readonly name: string`, `spawn(opts: SpawnOpts): AgentProcess`, `parseOutput(line: string): AgentEvent | null`, `getStatusFile(): string` <!-- verification: cli-verifiable -->
3. Given the `SpawnOpts` interface, when inspected, then it defines: `storyKey: string`, `prompt: string`, `workDir: string`, `timeout: number`, `env?: Record<string, string>` <!-- verification: cli-verifiable -->
4. Given the `AgentProcess` interface, when inspected, then it defines: `stdout: Readable`, `stderr: Readable`, `on(event: 'close', handler: (code: number) => void): void`, `kill(signal?: string): void` <!-- verification: cli-verifiable -->
5. Given the `AgentEvent` type, when inspected, then it is a discriminated union on `type` covering: `tool-start`, `tool-complete`, `text`, `story-complete`, `story-failed`, `iteration`, `retry`, `result` <!-- verification: cli-verifiable -->
6. Given `src/lib/agents/index.ts` exists, when inspected, then it re-exports all types from `./types.js` <!-- verification: cli-verifiable -->
7. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
8. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
9. Given no file in `src/lib/agents/`, when line count is checked, then no file exceeds 300 lines <!-- verification: cli-verifiable -->
10. Given `src/lib/agents/__tests__/types.test.ts` exists, when inspected, then it verifies the type exports are importable and the `AgentEvent` discriminated union covers all 8 event types <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 1, 2, 3, 4, 5): Create `src/lib/agents/types.ts`
  - [x] Define and export `SpawnOpts` interface with `storyKey`, `prompt`, `workDir`, `timeout`, `env?`
  - [x] Import `Readable` from `node:stream`
  - [x] Define and export `AgentProcess` interface with `stdout`, `stderr`, `on('close')`, `kill()`
  - [x] Define and export `AgentEvent` discriminated union type with all 8 event types
  - [x] Define and export `AgentDriver` interface with `name`, `spawn()`, `parseOutput()`, `getStatusFile()`
- [x] Task 2 (AC: 6): Create `src/lib/agents/index.ts`
  - [x] Re-export all types from `./types.js`
  - [x] Add placeholder comment for future driver registry and implementations
- [x] Task 3 (AC: 10): Create `src/lib/agents/__tests__/types.test.ts`
  - [x] Verify all type exports are importable from the module
  - [x] Verify `AgentEvent` discriminated union covers all 8 event types via type-level tests
  - [x] Verify `AgentDriver` interface shape matches specification
- [x] Task 4 (AC: 7): Run `npm run build` — TypeScript compilation succeeds
- [x] Task 5 (AC: 8): Run `npm test` — all existing tests pass, zero regressions
- [x] Task 6 (AC: 9): Verify all new files are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 3 (Agent Abstraction):** This story creates the foundational types from architecture-v3.md Decision 3. The `AgentDriver` interface is the contract that `RalphDriver` (story 13-2) and future drivers must implement.
- **Decision 4 (Domain Subdirectories):** Files go under `src/lib/agents/` per the architecture's target file tree.
- **300-line limit (Decision 7, NFR5):** All new files must stay under 300 lines. This is a types-only story so files will be well under the limit.

### Implementation Guidance

This is a **types-only story**. No implementation code beyond interface definitions and the `index.ts` re-export facade.

The `AgentProcess` interface wraps Node.js `ChildProcess` but abstracts it so future drivers (direct API calls, WebSocket connections) can implement it differently. Import `Readable` from `node:stream` for the stream types.

`AgentEvent` is a discriminated union on `type`. The `parseOutput()` method converts raw agent output lines into typed events. Each driver knows its own output format.

All types should be `export`ed (not `export default`) so they can be individually imported.

### Type Design Notes

```typescript
// src/lib/agents/types.ts
import type { Readable } from 'node:stream';

export interface SpawnOpts {
  storyKey: string;
  prompt: string;
  workDir: string;
  timeout: number;
  env?: Record<string, string>;
}

export interface AgentProcess {
  stdout: Readable;
  stderr: Readable;
  on(event: 'close', handler: (code: number) => void): void;
  kill(signal?: string): void;
}

export type AgentEvent =
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; name: string; args: string }
  | { type: 'text'; text: string }
  | { type: 'story-complete'; key: string; details: string }
  | { type: 'story-failed'; key: string; reason: string }
  | { type: 'iteration'; count: number }
  | { type: 'retry'; attempt: number; delay: number }
  | { type: 'result'; cost: number; sessionId: string };

export interface AgentDriver {
  readonly name: string;
  spawn(opts: SpawnOpts): AgentProcess;
  parseOutput(line: string): AgentEvent | null;
  getStatusFile(): string;
}
```

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect } from 'vitest'`
- For a types-only story, tests verify that types are importable and that the discriminated union shape is correct. Use type-level assertions and runtime checks on type guard functions if applicable.
- Import convention: use `.js` extension for ESM resolution (e.g., `from '../types.js'`).

### Previous Story Intelligence (12-4)

- Story 12-4 completed successfully. All 3539 tests passing.
- Import boundaries test (`src/modules/__tests__/import-boundaries.test.ts`) enforces module isolation.
- Shared test utilities available at `src/lib/__tests__/helpers.ts`.

### Project Structure After This Story

```
src/lib/agents/
├── types.ts          # AgentDriver, SpawnOpts, AgentProcess, AgentEvent
├── index.ts          # Re-export facade
└── __tests__/
    └── types.test.ts # Type import verification tests
```

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md lines 173-213] — Decision 3 (Agent Abstraction) full specification
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 255-273] — Story 13-1 epic definition
- [Source: _bmad-output/implementation-artifacts/12-4-shared-test-utilities-fixtures.md] — Previous story learnings

## Dev Agent Record

### Implementation Plan

Types-only story. Created three files under `src/lib/agents/`:
1. `types.ts` — All four type/interface exports matching the architecture spec exactly
2. `index.ts` — Barrel re-export with placeholder comment for future driver registry
3. `__tests__/types.test.ts` — 19 tests verifying importability, discriminated union coverage, and interface shape

### Debug Log

- Initial test had off-by-one in a mock `parseOutput` slice (`slice(5)` vs `slice(6)` for `"TEXT: "` prefix). Fixed immediately.

### Completion Notes

- All 10 acceptance criteria satisfied
- TypeScript build succeeds with zero errors
- Full test suite: 135 files, 3561 tests, all passing (22 new tests added, 0 regressions)
- File line counts: types.ts=56, index.ts=15, types.test.ts=238 — all well under 300-line limit
- Updated `src/lib/AGENTS.md` with new agents subsystem documentation

## File List

- `src/lib/agents/types.ts` — Created. AgentDriver, SpawnOpts, AgentProcess, AgentEvent type definitions
- `src/lib/agents/index.ts` — Created. Barrel re-export facade
- `src/lib/agents/__tests__/types.test.ts` — Created. 19 type verification tests
- `src/lib/AGENTS.md` — Modified. Added agents subsystem documentation section

## Change Log

- 2026-03-24: Story 13-1 implemented — AgentDriver interface and all supporting types created with full test coverage
