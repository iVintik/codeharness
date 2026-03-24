# Story 13-3: Migrate run.ts to Use AgentDriver

## Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

<!-- verification-tier: unit-testable -->

## Story

As a developer,
I want `run.ts` to use `AgentDriver` instead of directly spawning Ralph,
So that the run command is agent-agnostic.

## Acceptance Criteria

1. Given `src/commands/run.ts`, when inspected, then it does NOT import `spawn` from `node:child_process` — all process spawning goes through `AgentDriver.spawn()` <!-- verification: cli-verifiable -->
2. Given `src/commands/run.ts`, when inspected, then it imports a `getDriver()` factory from `../lib/agents/index.js` and calls `driver.spawn(opts)` where `driver` is an `AgentDriver` instance <!-- verification: cli-verifiable -->
3. Given `src/commands/run.ts`, when inspected, then it does NOT import or call `buildSpawnArgs()` or `resolveRalphPath()` directly — those are encapsulated inside `RalphDriver.spawn()` <!-- verification: cli-verifiable -->
4. Given `src/commands/run.ts`, when inspected, then it replaces the inline `createLineProcessor` stderr/stdout wiring with `driver.parseOutput(line)` calls that return `AgentEvent` objects, and a `handleAgentEvent()` dispatcher function that updates the Ink renderer <!-- verification: cli-verifiable -->
5. Given `src/commands/run.ts`, when inspected, then the hardcoded `'ralph/status.json'` path is replaced with `driver.getStatusFile()` <!-- verification: cli-verifiable -->
6. Given `src/lib/agents/index.ts`, when inspected, then it exports a `getDriver(name?: string): AgentDriver` factory function that returns a `RalphDriver` instance by default and throws for unknown driver names <!-- verification: cli-verifiable -->
7. Given `RalphDriver.spawn()`, when called, then it internally calls `resolveRalphPath()` and `buildSpawnArgs()` — the `SpawnOpts` interface carries enough information for `RalphDriver` to construct all ralph.sh flags (the interface or `spawn()` signature may need extending to pass `pluginDir`, `maxIterations`, `iterationTimeout`, `calls`, `quiet`, `maxStoryRetries`, `reset`) <!-- verification: cli-verifiable -->
8. Given `src/commands/run.ts` re-exports `countStories` and `buildSpawnArgs`, when migration completes, then `buildSpawnArgs` and `resolveRalphPath` are no longer re-exported from `run.ts` (they are implementation details of `RalphDriver`) — `countStories` may still be re-exported if external consumers need it <!-- verification: cli-verifiable -->
9. Given `src/lib/run-helpers.ts`, when inspected, then `createLineProcessor` is either removed (if no longer used) or remains as a backward-compatible utility — run.ts itself must NOT use it <!-- verification: cli-verifiable -->
10. Given `src/commands/__tests__/run.test.ts`, when inspected, then it tests the run command through the `AgentDriver` interface: mocking `getDriver()` to return a mock driver, verifying `driver.spawn()` is called with correct opts, and verifying `driver.parseOutput()` events are dispatched to the renderer <!-- verification: cli-verifiable -->
11. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
12. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
13. Given no file in `src/lib/agents/` or `src/commands/`, when line count is checked, then no file exceeds 300 lines <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 7): Extend `RalphDriver.spawn()` to accept full run configuration
  - [x]Extend `SpawnOpts` or add a `RalphSpawnOpts` that includes `pluginDir`, `maxIterations`, `iterationTimeout`, `calls`, `quiet`, `maxStoryRetries`, `reset` fields needed by `buildSpawnArgs()`
  - [x]Update `RalphDriver.spawn()` to use these new fields instead of hardcoded defaults (currently hardcodes `maxIterations: 50`, `iterationTimeout: 30`, `calls: 100`, `quiet: false`)
  - [x]Ensure `resolveRalphPath()` is called internally by `spawn()` — the caller should NOT need to know about `ralph.sh`

- [x] Task 2 (AC: 6): Add `getDriver()` factory to `src/lib/agents/index.ts`
  - [x]Implement `getDriver(name?: string): AgentDriver` — defaults to `'ralph'`, returns `new RalphDriver()`
  - [x]Throw a descriptive error for unrecognized driver names (e.g., `Unknown agent driver: ${name}`)
  - [x]Export `getDriver` from the barrel

- [x] Task 3 (AC: 1, 2, 3, 4, 5, 8, 9): Refactor `src/commands/run.ts`
  - [x]Remove `import { spawn } from 'node:child_process'`
  - [x]Remove `import { buildSpawnArgs, resolveRalphPath } from '../lib/agents/ralph.js'`
  - [x]Add `import { getDriver } from '../lib/agents/index.js'`
  - [x]Add `import type { AgentDriver, AgentEvent } from '../lib/agents/types.js'`
  - [x]Replace `const ralphPath = resolveRalphPath(); if (!existsSync(ralphPath))` check with driver validation (the driver itself knows if its executable exists)
  - [x]Replace `const args = buildSpawnArgs(...)` + `spawn('bash', args, ...)` with `const driver = getDriver(); const child = driver.spawn(opts)`
  - [x]Create a `handleAgentEvent(event: AgentEvent, rendererHandle)` function that switches on `event.type` and calls appropriate renderer methods (`update`, `addMessage`, etc.)
  - [x]Replace `createLineProcessor` usage with a line splitter that calls `driver.parseOutput(line)` and dispatches via `handleAgentEvent()`
  - [x]Replace hardcoded `join(projectDir, 'ralph', 'status.json')` with `join(projectDir, driver.getStatusFile())`
  - [x]Remove re-exports of `buildSpawnArgs` and `resolveRalphPath` — keep `countStories` re-export
  - [x]Remove the `// resolveRalphPath moved to ...` comment (now fully encapsulated)

- [x] Task 4 (AC: 10): Update `src/commands/__tests__/run.test.ts`
  - [x]Mock `../lib/agents/index.js` to return a mock `AgentDriver` from `getDriver()`
  - [x]Remove mocks for `node:child_process` `spawn` (no longer directly called by run.ts)
  - [x]Verify `driver.spawn()` is called with the correct `SpawnOpts` when the run command executes
  - [x]Verify `driver.parseOutput()` is called for each output line
  - [x]Verify `driver.getStatusFile()` is used for reading session results
  - [x]Update any tests that reference `buildSpawnArgs` or `resolveRalphPath` imports from run.ts

- [x] Task 5 (AC: 11): Run `npm run build` — TypeScript compilation succeeds
- [x] Task 6 (AC: 12): Run `npm test` — all existing tests pass, zero regressions
- [x] Task 7 (AC: 13): Verify all modified files are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 3 (Agent Abstraction):** This is the capstone story of Epic 13. After this, `run.ts` programs exclusively to the `AgentDriver` interface. Swapping Ralph for another agent requires only a new driver implementation and a `getDriver('newagent')` call.
- **Decision 7 (300-line limit, NFR5):** `run.ts` is currently 282 lines. The refactoring should reduce it slightly (removing inline buildSpawnArgs/resolveRalphPath usage), but the `handleAgentEvent()` function adds some code. Monitor the total.

### Implementation Guidance

**The core change pattern:**

```typescript
// BEFORE (current run.ts):
import { spawn } from 'node:child_process';
import { buildSpawnArgs, resolveRalphPath } from '../lib/agents/ralph.js';
// ...
const ralphPath = resolveRalphPath();
const args = buildSpawnArgs({ ralphPath, pluginDir, promptFile, ... });
const child = spawn('bash', args, { stdio, cwd, env });
// ...
const stdoutHandler = createLineProcessor({ onEvent: ... });
const stderrHandler = createLineProcessor({ onEvent: ..., onMessage: ..., onIteration: ... }, { parseRalph: true });
child.stdout.on('data', stdoutHandler);
child.stderr.on('data', stderrHandler);
// ...
const statusFile = join(projectDir, 'ralph', 'status.json');

// AFTER:
import { getDriver } from '../lib/agents/index.js';
import type { AgentDriver, AgentEvent } from '../lib/agents/types.js';
// ...
const driver = getDriver();
const child = driver.spawn({ storyKey: '...', prompt: promptFile, workDir: projectDir, timeout, ... });
// ...
// Line splitting + driver.parseOutput() + handleAgentEvent()
// ...
const statusFile = join(projectDir, driver.getStatusFile());
```

**SpawnOpts extension challenge:**

The current `SpawnOpts` interface (from 13-1) has: `storyKey`, `prompt`, `workDir`, `timeout`, `env`. But `run.ts` passes many more options to `buildSpawnArgs()`: `pluginDir`, `maxIterations`, `iterationTimeout`, `calls`, `quiet`, `maxStoryRetries`, `reset`.

Options for handling this:
1. **Extend `SpawnOpts`** with optional ralph-specific fields (violates interface purity)
2. **Use `env` bag** to pass extra config (hacky)
3. **Add a `RalphSpawnOpts extends SpawnOpts`** type that `RalphDriver.spawn()` accepts (type-safe, recommended)
4. **Configure `RalphDriver` at construction time** — pass ralph-specific options to the constructor, leaving `SpawnOpts` generic

Option 3 or 4 is recommended. Option 4 is cleanest: `new RalphDriver(ralphConfig)` at construction, then `driver.spawn(genericOpts)` at call time. This keeps `SpawnOpts` agent-agnostic.

**handleAgentEvent() dispatcher:**

```typescript
function handleAgentEvent(
  event: AgentEvent,
  rendererHandle: RendererHandle,
  state: { currentIterationCount: number },
): void {
  switch (event.type) {
    case 'tool-start':
    case 'tool-complete':
    case 'text':
    case 'result':
    case 'retry':
      // Map to StreamEvent-like shape for renderer.update()
      rendererHandle.update(event);
      break;
    case 'story-complete':
      rendererHandle.addMessage({ type: 'ok', key: event.key, message: event.details });
      break;
    case 'story-failed':
      rendererHandle.addMessage({ type: 'fail', key: event.key, message: event.reason });
      break;
    case 'iteration':
      state.currentIterationCount = event.count;
      break;
  }
}
```

**Note on `createLineProcessor`:** The line-splitting logic (buffering partial lines across chunk boundaries, splitting on `\n`) is generic and useful. It can stay in `run-helpers.ts` as a utility OR be inlined in run.ts. The key change is that `createLineProcessor`'s internal calls to `parseStreamLine()` and `parseRalphMessage()` are replaced by `driver.parseOutput()`.

**Ralph existence check:** Currently run.ts does `if (!existsSync(ralphPath))`. After migration, the driver should handle this. Options:
- Add a `validate(): boolean` method to `AgentDriver` interface
- Have `driver.spawn()` throw if the executable is missing
- Keep a lightweight check in run.ts that asks the driver for its executable path

The simplest approach: let `driver.spawn()` throw with a descriptive error if ralph.sh is missing. run.ts catches the error in its existing try/catch.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Import convention: use `.js` extension for ESM resolution.
- The run.test.ts mock strategy shifts from mocking `node:child_process.spawn` to mocking `agents/index.js.getDriver()`. The mock driver returns a mock `AgentProcess` with controllable stdout/stderr emitters.
- Test that `handleAgentEvent()` correctly dispatches each `AgentEvent` type to the renderer.
- Existing tests for `buildSpawnArgs` in `run-helpers.test.ts` and `ralph.test.ts` are NOT affected — they test the ralph module directly.

### Previous Story Intelligence (13-2)

- Story 13-2 completed. `RalphDriver` exists at `src/lib/agents/ralph.ts` with `spawn()`, `parseOutput()`, `getStatusFile()`.
- `RalphDriver.spawn()` currently hardcodes `maxIterations: 50`, `iterationTimeout: 30`, `calls: 100`, `quiet: false`. These need to become configurable (Task 1).
- `createLineProcessor` in `run-helpers.ts` still imports from `agents/ralph.js` — it's the bridge between old and new patterns.
- `run.ts` currently re-exports `buildSpawnArgs` and `resolveRalphPath` from line 22. Tests import these from `run.ts`. After migration, tests should import directly from `agents/ralph.js`.

### Project Structure After This Story

```
src/commands/run.ts              # Refactored: uses AgentDriver interface only
src/lib/agents/
├── types.ts                     # AgentDriver, SpawnOpts, AgentProcess, AgentEvent (from 13-1)
├── ralph.ts                     # RalphDriver with configurable spawn (updated)
├── stream-parser.ts             # Unchanged (from 13-2)
├── ralph-prompt.ts              # Unchanged (from 13-2)
├── index.ts                     # Updated: adds getDriver() factory
└── __tests__/
    ├── types.test.ts            # From 13-1
    ├── ralph.test.ts            # From 13-2
    ├── stream-parser.test.ts    # From 13-2
    └── ralph-prompt.test.ts     # From 13-2
src/commands/__tests__/run.test.ts  # Updated: mocks AgentDriver instead of child_process
src/lib/run-helpers.ts              # Possibly trimmed: createLineProcessor may be removed
```

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md Decision 3] — Agent Abstraction specification
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 291-305] — Story 13-3 epic definition
- [Source: _bmad-output/implementation-artifacts/13-1-agentdriver-interface-and-types.md] — Story 13-1 completion notes
- [Source: _bmad-output/implementation-artifacts/13-2-ralph-driver-implementation.md] — Story 13-2 completion notes
- [Source: src/commands/run.ts] — Primary file to refactor
- [Source: src/lib/agents/ralph.ts] — RalphDriver implementation to extend
- [Source: src/lib/agents/index.ts] — Barrel to add getDriver() factory
- [Source: src/lib/run-helpers.ts] — createLineProcessor to potentially remove

## File List

- `src/commands/run.ts` — Refactor: replace direct spawn/buildSpawnArgs/resolveRalphPath with AgentDriver interface
- `src/lib/agents/index.ts` — Add `getDriver()` factory function
- `src/lib/agents/ralph.ts` — Extend `RalphDriver.spawn()` to accept full configuration
- `src/lib/agents/types.ts` — Possibly add `RalphSpawnOpts` or constructor config type
- `src/lib/run-helpers.ts` — Possibly remove `createLineProcessor` if no longer needed
- `src/commands/__tests__/run.test.ts` — Update mocks from child_process to AgentDriver

## Change Log

- 2026-03-24: Story created by /create-story
