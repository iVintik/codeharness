# Story 13-2: Implement RalphDriver

## Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

<!-- verification-tier: unit-testable -->

## Story

As a developer,
I want Ralph wrapped in an `AgentDriver` implementation,
So that ralph-specific behavior is isolated in one file.

## Acceptance Criteria

1. Given `src/lib/agents/ralph.ts` exists, when inspected, then it exports a `RalphDriver` class implementing `AgentDriver` with `spawn()`, `parseOutput()`, and `getStatusFile()` methods <!-- verification: cli-verifiable -->
2. Given `RalphDriver.spawn()`, when called with valid `SpawnOpts`, then it builds the ralph.sh args array (equivalent to current `buildSpawnArgs()`) and spawns a child process returning an `AgentProcess` <!-- verification: cli-verifiable -->
3. Given `RalphDriver.parseOutput()`, when called with a ralph stderr line like `[SUCCESS] Story 1-1-foo: DONE`, then it returns the appropriate `AgentEvent` (e.g., `{ type: 'story-complete', key: '1-1-foo', details: 'DONE' }`) <!-- verification: cli-verifiable -->
4. Given `RalphDriver.parseOutput()`, when called with a `[LOOP] iteration N` line, then it returns `{ type: 'iteration', count: N }` <!-- verification: cli-verifiable -->
5. Given `RalphDriver.parseOutput()`, when called with a stream-json NDJSON line, then it delegates to the stream parser and returns the corresponding `AgentEvent` or null <!-- verification: cli-verifiable -->
6. Given `RalphDriver.getStatusFile()`, when called, then it returns `'ralph/status.json'` <!-- verification: cli-verifiable -->
7. Given `src/lib/agents/ralph.ts` absorbs `parseRalphMessage()`, `parseIterationMessage()`, and `buildSpawnArgs()` from `src/lib/run-helpers.ts`, when migration completes, then those functions are no longer exported from `run-helpers.ts` and all callers import from `src/lib/agents/ralph.ts` instead <!-- verification: cli-verifiable -->
8. Given `src/lib/stream-parser.ts`, when migration completes, then it is moved to `src/lib/agents/stream-parser.ts` and all import paths across the codebase are updated <!-- verification: cli-verifiable -->
9. Given `src/templates/ralph-prompt.ts`, when migration completes, then it is moved to `src/lib/agents/ralph-prompt.ts` and all import paths are updated <!-- verification: cli-verifiable -->
10. Given `src/lib/run-helpers.ts`, when migration completes, then it contains only non-ralph-specific functions (`formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `countStories`, `createLineProcessor`) OR is deleted if all functions have been migrated <!-- verification: cli-verifiable -->
11. Given `src/lib/agents/index.ts`, when inspected, then it re-exports `RalphDriver`, stream parser types/functions, and ralph prompt types/functions <!-- verification: cli-verifiable -->
12. Given `src/index.ts` exports `parseStreamLine` and stream event types, when the stream parser moves to `src/lib/agents/stream-parser.ts`, then `src/index.ts` import paths are updated and the public API is unchanged <!-- verification: cli-verifiable -->
13. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
14. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
15. Given no file in `src/lib/agents/`, when line count is checked, then no file exceeds 300 lines <!-- verification: cli-verifiable -->
16. Given `src/lib/agents/__tests__/ralph.test.ts` exists, when inspected, then it tests `RalphDriver.parseOutput()` for all ralph stderr patterns (success, retry, retry-exceeded, error, iteration) and stream-json delegation, plus `getStatusFile()` and `spawn()` arg building <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x]Task 1 (AC: 8, 12): Move `src/lib/stream-parser.ts` to `src/lib/agents/stream-parser.ts`
  - [x]Move the file
  - [x]Update all imports across the codebase: `src/lib/run-helpers.ts`, `src/index.ts`, `src/__tests__/run-pipeline.test.ts`, `src/lib/ink-renderer.tsx`, `src/lib/__tests__/stream-parser.test.ts`, `src/lib/__tests__/ink-renderer.test.tsx`
  - [x]Move `src/lib/__tests__/stream-parser.test.ts` to `src/lib/agents/__tests__/stream-parser.test.ts`
  - [x]Verify `src/index.ts` public API still exports `parseStreamLine` and all `StreamEvent` types

- [x]Task 2 (AC: 9): Move `src/templates/ralph-prompt.ts` to `src/lib/agents/ralph-prompt.ts`
  - [x]Move the file
  - [x]Update imports: `src/commands/run.ts`
  - [x]Move `src/templates/__tests__/ralph-prompt.test.ts` to `src/lib/agents/__tests__/ralph-prompt.test.ts`

- [x]Task 3 (AC: 1, 2, 3, 4, 5, 6, 7, 10): Create `src/lib/agents/ralph.ts` implementing `RalphDriver`
  - [x]Import `AgentDriver`, `SpawnOpts`, `AgentProcess`, `AgentEvent` from `./types.js`
  - [x]Migrate `buildSpawnArgs()` from `run-helpers.ts` into ralph.ts (as private method or module-level function)
  - [x]Migrate `parseRalphMessage()` and `parseIterationMessage()` from `run-helpers.ts` into ralph.ts
  - [x]Add `resolveRalphPath()` from `run.ts` into ralph.ts
  - [x]Implement `spawn(opts: SpawnOpts): AgentProcess` — builds args via `buildSpawnArgs`, spawns `bash ralph.sh`
  - [x]Implement `parseOutput(line: string): AgentEvent | null` — tries ralph stderr patterns first, falls back to stream-json parser, maps internal types to `AgentEvent`
  - [x]Implement `getStatusFile(): string` — returns `'ralph/status.json'`
  - [x]Export `RalphDriver` class and re-export migrated functions for backward compatibility

- [x]Task 4 (AC: 7, 10): Clean up `src/lib/run-helpers.ts`
  - [x]Remove `parseRalphMessage()`, `parseIterationMessage()`, `buildSpawnArgs()` and their regex constants
  - [x]Remove the `import { parseStreamLine } from './stream-parser.js'` (file moved)
  - [x]Update `createLineProcessor` to import from new locations
  - [x]Keep `formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `countStories`, `createLineProcessor` — these are run-command helpers, not ralph-specific
  - [x]Update `src/commands/run.ts` to import `buildSpawnArgs` from `../lib/agents/ralph.js` and `resolveRalphPath` from same

- [x]Task 5 (AC: 11): Update `src/lib/agents/index.ts`
  - [x]Re-export `RalphDriver` from `./ralph.js`
  - [x]Re-export stream parser functions and types from `./stream-parser.js`
  - [x]Re-export ralph prompt functions and types from `./ralph-prompt.js`

- [x]Task 6 (AC: 16): Create `src/lib/agents/__tests__/ralph.test.ts`
  - [x]Test `parseOutput()` with `[SUCCESS] Story ...` lines → `story-complete` events
  - [x]Test `parseOutput()` with `[WARN] Story ... exceeded retry limit` → `story-failed` events
  - [x]Test `parseOutput()` with `[WARN] Story ... retry N/M` → `retry` events
  - [x]Test `parseOutput()` with `[LOOP] iteration N` → `iteration` events
  - [x]Test `parseOutput()` with stream-json NDJSON lines → delegated events
  - [x]Test `parseOutput()` with unrecognized lines → null
  - [x]Test `getStatusFile()` returns `'ralph/status.json'`
  - [x]Test `buildSpawnArgs()` via unit tests (migrated from run-helpers.test.ts or new)
  - [x]Test `name` property equals `'ralph'`

- [x]Task 7 (AC: 13): Run `npm run build` — TypeScript compilation succeeds
- [x]Task 8 (AC: 14): Run `npm test` — all existing tests pass, zero regressions
- [x]Task 9 (AC: 15): Verify all new files in `src/lib/agents/` are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 3 (Agent Abstraction):** This story creates the first concrete `AgentDriver` implementation. `RalphDriver` wraps `ralph.sh` invocation behind the interface defined in story 13-1.
- **Decision 4 (Domain Subdirectories):** All ralph-related code moves under `src/lib/agents/`. The stream parser and ralph prompt template also relocate here.
- **300-line limit (Decision 7, NFR5):** `ralph.ts` will absorb ~130 lines from `run-helpers.ts` (ralph-specific functions) plus ~30 lines for the class shell. Target: ~170 lines. Stream parser stays at 193 lines. Ralph prompt stays at 84 lines. All well under 300.

### Implementation Guidance

**RalphDriver class shape:**

```typescript
import { spawn } from 'node:child_process';
import type { AgentDriver, SpawnOpts, AgentProcess, AgentEvent } from './types.js';
import { parseStreamLine } from './stream-parser.js';

export class RalphDriver implements AgentDriver {
  readonly name = 'ralph';

  spawn(opts: SpawnOpts): AgentProcess {
    const args = buildSpawnArgs({ /* map SpawnOpts to buildSpawnArgs format */ });
    const child = spawn('bash', args, {
      cwd: opts.workDir,
      env: { ...process.env, ...opts.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    return child as unknown as AgentProcess;
  }

  parseOutput(line: string): AgentEvent | null {
    // 1. Try ralph stderr patterns (story-complete, story-failed, iteration, retry)
    // 2. Fall back to stream-json parser
    // 3. Map internal types to AgentEvent discriminated union
  }

  getStatusFile(): string {
    return 'ralph/status.json';
  }
}
```

**Type mapping in `parseOutput()`:**

The existing `parseRalphMessage()` returns `StoryMessage` with `type: 'ok' | 'fail' | 'warn'`. The `AgentEvent` uses different discriminants. Mapping:

- `StoryMessage { type: 'ok' }` → `AgentEvent { type: 'story-complete', key, details }`
- `StoryMessage { type: 'fail' }` → `AgentEvent { type: 'story-failed', key, reason }`
- `StoryMessage { type: 'warn' }` → `AgentEvent { type: 'retry', attempt, delay }` (parse retry N/M from message)
- `parseIterationMessage()` returns number → `AgentEvent { type: 'iteration', count }`
- `parseStreamLine()` returns `StreamEvent` → map to corresponding `AgentEvent` variants

**Note on `createLineProcessor()`:** This function stays in `run-helpers.ts` for now. It calls `parseStreamLine()` and `parseRalphMessage()`, so its imports will need updating. Story 13-3 will refactor `run.ts` to use `AgentDriver` directly, which may obsolete `createLineProcessor`.

**Note on backward compatibility:** `src/lib/run-helpers.ts` currently re-exports functions that `run.ts` and test files import. After migration:
- `buildSpawnArgs` moves to `ralph.ts` — update `run.ts` import
- `parseRalphMessage`, `parseIterationMessage` move to `ralph.ts` — update `createLineProcessor` and test imports
- `run-helpers.ts` keeps: `formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `countStories`, `createLineProcessor`
- `run.ts` re-exports `countStories`, `buildSpawnArgs` — update the re-export source for `buildSpawnArgs`

**Files that import from `stream-parser.ts` (must update paths):**
- `src/index.ts` (lines 27-28)
- `src/lib/run-helpers.ts` (lines 10-11)
- `src/__tests__/run-pipeline.test.ts` (lines 19-20)
- `src/lib/ink-renderer.tsx` (line 13)
- `src/lib/__tests__/stream-parser.test.ts` (lines 2, 11)
- `src/lib/__tests__/ink-renderer.test.tsx` (line 6)

**Files that import from `ralph-prompt.ts` (must update paths):**
- `src/commands/run.ts` (line 8)
- `src/templates/__tests__/ralph-prompt.test.ts` (line 2)

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect } from 'vitest'`
- Import convention: use `.js` extension for ESM resolution (e.g., `from '../ralph.js'`).
- Mock `node:child_process` `spawn` for `RalphDriver.spawn()` tests — verify args passed to spawn, not actual process creation.
- Existing `run-helpers.test.ts` tests for `buildSpawnArgs`, `parseRalphMessage`, `parseIterationMessage` should be migrated to `ralph.test.ts` or updated to import from the new location.
- `stream-parser.test.ts` moves as-is to `agents/__tests__/` — only import path changes.

### Previous Story Intelligence (13-1)

- Story 13-1 completed. Types are at `src/lib/agents/types.ts`. All 3561 tests passing.
- `AgentProcess` has both `'close'` and `'error'` event overloads (the `'error'` was an addition beyond spec).
- `AgentEvent` discriminated union covers 8 types: `tool-start`, `tool-complete`, `text`, `story-complete`, `story-failed`, `iteration`, `retry`, `result`.
- Test pattern established in `src/lib/agents/__tests__/types.test.ts` — follow same style.

### Project Structure After This Story

```
src/lib/agents/
├── types.ts              # AgentDriver, SpawnOpts, AgentProcess, AgentEvent (from 13-1)
├── ralph.ts              # RalphDriver implementation + migrated ralph functions
├── stream-parser.ts      # Moved from src/lib/stream-parser.ts
├── ralph-prompt.ts       # Moved from src/templates/ralph-prompt.ts
├── index.ts              # Re-export facade (updated)
└── __tests__/
    ├── types.test.ts     # From 13-1
    ├── ralph.test.ts     # New: RalphDriver unit tests
    ├── stream-parser.test.ts  # Moved from src/lib/__tests__/
    └── ralph-prompt.test.ts   # Moved from src/templates/__tests__/
```

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md lines 255-289] — Epic 13 (Agent Abstraction) stories
- [Source: _bmad-output/implementation-artifacts/13-1-agentdriver-interface-and-types.md] — Story 13-1 completion notes
- [Source: src/lib/run-helpers.ts] — Functions to migrate: `buildSpawnArgs`, `parseRalphMessage`, `parseIterationMessage`
- [Source: src/lib/stream-parser.ts] — File to move to agents/
- [Source: src/templates/ralph-prompt.ts] — File to move to agents/
- [Source: src/commands/run.ts] — Primary consumer, `resolveRalphPath()` to migrate
