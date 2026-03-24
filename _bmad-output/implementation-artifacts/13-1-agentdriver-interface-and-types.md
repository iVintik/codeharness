# Story 13-1: Create AgentDriver Interface and Types

## Status: backlog

## Story

As a developer,
I want an `AgentDriver` interface that abstracts agent execution,
So that Ralph can be replaced or supplemented without touching 28 files.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/agents/types.ts` exists, when inspected, then it defines `AgentDriver`, `AgentProcess`, `AgentEvent` types <!-- verification: cli-verifiable -->
- [ ] AC2: Given the `AgentEvent` type, when inspected, then it covers: `tool-start`, `tool-complete`, `text`, `story-complete`, `story-failed`, `iteration`, `retry`, `result` <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 3 (Agent Abstraction).** Define the contract that any agent implementation must fulfill.

The full type definitions (from architecture-v3.md):

```typescript
// src/lib/agents/types.ts
interface AgentDriver {
  readonly name: string;
  spawn(opts: SpawnOpts): AgentProcess;
  parseOutput(line: string): AgentEvent | null;
  getStatusFile(): string;
}

interface SpawnOpts {
  storyKey: string;
  prompt: string;
  workDir: string;
  timeout: number;
  env?: Record<string, string>;
}

interface AgentProcess {
  stdout: Readable;
  stderr: Readable;
  on(event: 'close', handler: (code: number) => void): void;
  kill(signal?: string): void;
}

type AgentEvent =
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; name: string; args: string }
  | { type: 'text'; text: string }
  | { type: 'story-complete'; key: string; details: string }
  | { type: 'story-failed'; key: string; reason: string }
  | { type: 'iteration'; count: number }
  | { type: 'retry'; attempt: number; delay: number }
  | { type: 'result'; cost: number; sessionId: string };
```

This is a types-only story. No implementation code beyond the interface definitions and the `index.ts` re-export facade.

The `AgentProcess` interface wraps Node.js `ChildProcess` but abstracts it so future drivers (direct API calls, WebSocket connections) can implement it differently.

`AgentEvent` is a discriminated union on `type`. The `parseOutput()` method converts raw agent output lines into typed events. Each driver knows its own output format.

Also create the `src/lib/agents/index.ts` facade that will later re-export the driver registry.

## Files to Change

- `src/lib/agents/types.ts` — Create. Define `AgentDriver`, `SpawnOpts`, `AgentProcess`, `AgentEvent` interfaces and types
- `src/lib/agents/index.ts` — Create. Re-export types. Will later re-export driver registry and implementations
