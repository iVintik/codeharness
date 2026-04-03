/**
 * Public API for the agents subsystem.
 *
 * Re-exports types (story 13-1), stream parser functions/types,
 * and the getDriver() factory (story 13-3).
 *
 * Ralph driver and prompt removed in Story 1.2 — will be replaced
 * by workflow engine in Epic 5.
 */

import type { AgentDriver } from './types.js';

// New types (Epic 10)
export type {
  AgentDriver,
  DriverHealth,
  DriverCapabilities,
  DispatchOpts,
  ErrorCategory,
  OutputContract,
  TestResults,
  ACStatus,
} from './types.js';

// Deprecated types — kept for backward compatibility until story 10-3
/** @deprecated Use `DispatchOpts` instead. */
export type { SpawnOpts } from './types.js';
/** @deprecated Use `AsyncIterable<StreamEvent>` from `dispatch()` instead. */
export type { AgentProcess } from './types.js';
/** @deprecated Use `StreamEvent` from `stream-parser.ts` instead. */
export type { AgentEvent } from './types.js';

// Stream parser
export { parseStreamLine } from './stream-parser.js';
export type {
  StreamEvent,
  ToolStartEvent,
  ToolInputEvent,
  ToolCompleteEvent,
  TextEvent,
  RetryEvent,
  ResultEvent,
} from './stream-parser.js';

// --- Driver Factory ---

// TODO: v2 workflow-engine (Epic 5) — rebuild getDriver with workflow-based driver
/**
 * Returns an AgentDriver instance by name.
 * Throws for all driver names — Ralph removed, workflow engine pending (Epic 5).
 */
export function getDriver(name?: string, _config?: unknown): AgentDriver {
  const driverName = name ?? 'default';
  throw new Error(`No agent drivers available (requested: ${driverName}). Workflow engine pending (Epic 5).`);
}
