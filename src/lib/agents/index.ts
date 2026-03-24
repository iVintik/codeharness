/**
 * Public API for the agents subsystem.
 *
 * Re-exports types (story 13-1), RalphDriver implementation (story 13-2),
 * stream parser functions/types, and ralph prompt functions/types.
 */

// Types
export type {
  SpawnOpts,
  AgentProcess,
  AgentEvent,
  AgentDriver,
} from './types.js';

// RalphDriver
export { RalphDriver } from './ralph.js';
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
