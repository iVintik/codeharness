/**
 * Public API for the agents subsystem.
 *
 * Re-exports types (story 13-1), RalphDriver implementation (story 13-2),
 * stream parser functions/types, ralph prompt functions/types,
 * and the getDriver() factory (story 13-3).
 */

import type { AgentDriver } from './types.js';
import { RalphDriver, type RalphConfig } from './ralph.js';

// Types
export type {
  SpawnOpts,
  AgentProcess,
  AgentEvent,
  AgentDriver,
} from './types.js';

// RalphDriver
export { RalphDriver } from './ralph.js';
export type { RalphConfig } from './ralph.js';
export { buildSpawnArgs, resolveRalphPath, parseRalphMessage, parseIterationMessage } from './ralph.js';

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

// Ralph prompt
export { generateRalphPrompt } from './ralph-prompt.js';
export type { RalphPromptConfig } from './ralph-prompt.js';

// --- Driver Factory ---

/**
 * Returns an AgentDriver instance by name.
 * Defaults to 'ralph'. Throws for unknown driver names.
 */
export function getDriver(name?: string, config?: RalphConfig): AgentDriver {
  const driverName = name ?? 'ralph';
  switch (driverName) {
    case 'ralph':
      return new RalphDriver(config);
    default:
      throw new Error(`Unknown agent driver: ${driverName}`);
  }
}
