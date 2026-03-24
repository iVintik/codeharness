# Story 13-3: Migrate run.ts to Use AgentDriver

## Status: backlog

## Story

As a developer,
I want `run.ts` to use `AgentDriver` instead of directly spawning Ralph,
So that the run command is agent-agnostic.

## Acceptance Criteria

- [ ] AC1: Given `src/commands/run.ts`, when inspected, then it imports `AgentDriver` and calls `driver.spawn()`, not `spawn('bash', [ralphPath, ...])` <!-- verification: cli-verifiable -->
- [ ] AC2: Given `resolveRalphPath()` in run.ts, when migration completes, then it's moved into `ralph.ts` and run.ts uses `driver.getExecutablePath()` <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 3 (Agent Abstraction).** The run command becomes agent-agnostic by programming to the `AgentDriver` interface.

Current `src/commands/run.ts` directly:
- Imports `spawn` from `child_process`
- Calls `resolveRalphPath()` to find ralph.sh
- Builds args array specific to ralph.sh flags
- Parses ralph's stderr for iteration/status messages
- Reads `ralph/status.json` for session results

After migration:
```typescript
// src/commands/run.ts
import { getRalphDriver } from '../lib/agents/index.js';
import type { AgentDriver, AgentEvent } from '../lib/agents/types.js';

// In the run action:
const driver: AgentDriver = getRalphDriver();
const process = driver.spawn({
  storyKey,
  prompt,
  workDir: projectDir,
  timeout: sessionTimeout,
  env: { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }
});

process.stderr.on('data', (chunk) => {
  const event = driver.parseOutput(chunk.toString());
  if (event) handleAgentEvent(event);
});

process.on('close', (code) => {
  // Read results from driver.getStatusFile()
});
```

The `handleAgentEvent()` function replaces the current inline parsing. It switches on `event.type` and updates the Ink renderer or sprint state accordingly.

A factory function `getDriver(name?: string): AgentDriver` in `src/lib/agents/index.ts` defaults to `RalphDriver`. Future drivers can be selected via CLI flag `--agent`.

## Files to Change

- `src/commands/run.ts` — Replace direct ralph spawning with `AgentDriver` interface calls. Remove `resolveRalphPath()` import. Add `handleAgentEvent()` dispatcher
- `src/lib/agents/index.ts` — Add `getDriver()` factory function that returns `RalphDriver` by default
- `src/lib/agents/ralph.ts` — Ensure `resolveRalphPath()` is exposed or used internally by `spawn()`
- `src/commands/run.ts` imports — Update from `run-helpers.ts` to `agents/index.ts`
