/**
 * AgentDriver abstraction types.
 *
 * Defines the contract that all agent drivers (Claude Code, Codex, OpenCode)
 * must implement. See architecture-multi-framework.md Decision 1.
 */

import type { Readable } from 'node:stream';
import type { StreamEvent } from './stream-parser.js';

// --- New Types (Epic 10) ---

/**
 * Health status returned by a driver's healthCheck().
 */
export interface DriverHealth {
  readonly available: boolean;
  readonly authenticated: boolean;
  readonly version: string | null;
  readonly error?: string;
}

/**
 * Capability flags for a driver. Extensible — new boolean fields
 * can be added without breaking existing drivers.
 */
export interface DriverCapabilities {
  readonly supportsPlugins: boolean;
  readonly supportsStreaming: boolean;
  readonly costReporting: boolean;
  readonly costTier: number;
}

/**
 * A capability conflict or routing hint warning.
 * Pure data — no side effects. Used by checkCapabilityConflicts().
 */
export interface CapabilityWarning {
  readonly taskName: string;
  readonly driverName: string;
  readonly capability: string;
  readonly message: string;
}

/**
 * Error classification categories for driver errors.
 * Drivers must NOT invent new categories.
 *
 * Classification priority:
 * 1. HTTP 429 or "rate limit" in message -> RATE_LIMIT
 * 2. ECONNREFUSED, ETIMEDOUT, ENOTFOUND -> NETWORK
 * 3. HTTP 401/403 or "unauthorized"/"forbidden" -> AUTH
 * 4. Process killed by timeout -> TIMEOUT
 * 5. Everything else -> UNKNOWN
 */
export type ErrorCategory = 'RATE_LIMIT' | 'NETWORK' | 'AUTH' | 'TIMEOUT' | 'UNKNOWN';

/**
 * Test results summary for an output contract.
 */
export interface TestResults {
  readonly passed: number;
  readonly failed: number;
  readonly coverage: number | null;
}

/**
 * Acceptance criteria status entry.
 */
export interface ACStatus {
  readonly id: string;
  readonly description: string;
  readonly status: string;
}

/**
 * Structured output contract produced by a dispatch.
 */
export interface OutputContract {
  readonly version: number;
  readonly taskName: string;
  readonly storyId: string;
  readonly driver: string;
  readonly model: string;
  readonly timestamp: string;
  readonly cost_usd: number | null;
  readonly duration_ms: number;
  readonly changedFiles: readonly string[];
  readonly testResults: TestResults | null;
  readonly output: string;
  readonly acceptanceCriteria: readonly ACStatus[];
}

/**
 * Options for dispatching a task to a driver.
 */
export interface DispatchOpts {
  readonly prompt: string;
  readonly model: string;
  readonly cwd: string;
  readonly sourceAccess: boolean;
  readonly plugins?: readonly string[];
  readonly timeout?: number;
  readonly sessionId?: string;
  readonly appendSystemPrompt?: string;
  readonly outputContract?: OutputContract;
}

/**
 * The core agent driver interface (v2 — Epic 10).
 * Each driver knows how to check health, dispatch tasks, and report cost.
 * `dispatch()` returns `AsyncIterable<StreamEvent>` enabling both in-process
 * (Agent SDK yields) and CLI-wrapped (stdout parsed to events) drivers.
 */
export interface AgentDriver {
  readonly name: string;
  readonly defaultModel: string;
  readonly capabilities: DriverCapabilities;
  healthCheck(): Promise<DriverHealth>;
  dispatch(opts: DispatchOpts): AsyncIterable<StreamEvent>;
  getLastCost(): number | null;
}

// --- Deprecated Types (backward compatibility until story 10-3) ---

/**
 * Options for spawning an agent process.
 * @deprecated Use `DispatchOpts` instead. Will be removed after story 10-3.
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
 * @deprecated Use `AsyncIterable<StreamEvent>` from `dispatch()` instead. Will be removed after story 10-3.
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
 * @deprecated Use `StreamEvent` from `stream-parser.ts` instead. Will be removed after story 10-3.
 */
export type AgentEvent =
  | { type: 'tool-start'; name: string }
  | { type: 'tool-input'; partial: string }
  | { type: 'tool-complete'; name?: string; args?: string }
  | { type: 'text'; text: string }
  | { type: 'story-complete'; key: string; details: string }
  | { type: 'story-failed'; key: string; reason: string }
  | { type: 'iteration'; count: number }
  | { type: 'retry'; attempt: number; delay: number }
  | { type: 'result'; cost: number; sessionId: string };
