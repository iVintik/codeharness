/**
 * Public API for the agents subsystem.
 *
 * Currently exports only type definitions (story 13-1).
 * Future stories will add driver registry and concrete implementations
 * (e.g., RalphDriver in story 13-2).
 */

// Types
export type {
  SpawnOpts,
  AgentProcess,
  AgentEvent,
  AgentDriver,
} from './types.js';
