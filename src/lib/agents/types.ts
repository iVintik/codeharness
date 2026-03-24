/**
 * AgentDriver abstraction types.
 *
 * Defines the contract that all agent drivers (Ralph, future API-based agents)
 * must implement. See architecture-v3.md Decision 3.
 */

import type { Readable } from 'node:stream';

/**
 * Options for spawning an agent process.
 */
export interface SpawnOpts {
  storyKey: string;
  prompt: string;
  workDir: string;
  timeout: number;
  env?: Record<string, string>;
}

/**
 * Abstraction over a running agent process.
 * Wraps Node.js ChildProcess but allows non-process-based drivers
 * (direct API calls, WebSocket connections) to implement the same interface.
 */
export interface AgentProcess {
  stdout: Readable;
  stderr: Readable;
  on(event: 'close', handler: (code: number) => void): void;
  on(event: 'error', handler: (err: Error) => void): void;
  kill(signal?: string): void;
}

/**
 * Discriminated union of events emitted by an agent driver.
 * The `parseOutput()` method converts raw agent output lines into these typed events.
 */
export type AgentEvent =
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; name?: string; args?: string }
  | { type: 'text'; text: string }
  | { type: 'story-complete'; key: string; details: string }
  | { type: 'story-failed'; key: string; reason: string }
  | { type: 'iteration'; count: number }
  | { type: 'retry'; attempt: number; delay: number }
  | { type: 'result'; cost: number; sessionId: string };

/**
 * The core agent driver interface.
 * Each driver knows how to spawn an agent, parse its output, and locate its status file.
 */
export interface AgentDriver {
  readonly name: string;
  spawn(opts: SpawnOpts): AgentProcess;
  parseOutput(line: string): AgentEvent | null;
  getStatusFile(): string;
}
