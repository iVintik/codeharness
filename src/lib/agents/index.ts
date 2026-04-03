/**
 * Public API for the agents subsystem.
 *
 * Re-exports types (story 10-1), stream parser functions/types,
 * and the driver factory (story 10-2).
 */

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

export { getDriver, registerDriver, listDrivers, resetDrivers } from './drivers/factory.js';

// --- Model Resolution ---

export { resolveModel } from './model-resolver.js';
