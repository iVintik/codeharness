/**
 * Null Task Handler Registry.
 *
 * Provides a registry pattern for tasks with `agent: null` that execute
 * directly in the engine without LLM dispatch. Handlers are registered at
 * module initialization time. The engine calls `getNullTask(name)` to look
 * up a handler and execute it inline.
 *
 * @see Story 16-2: Engine-Handled Null Tasks
 */

import type { OutputContract } from './agents/types.js';
import { writeTelemetryEntry } from './telemetry-writer.js';

// --- Interfaces ---

/**
 * Context passed to a null task handler.
 */
export interface TaskContext {
  /** Story key (e.g., "16-2-engine-handled-null-tasks") or "__run__" for per-run. */
  storyKey: string;
  /** Task name (e.g., "telemetry"). */
  taskName: string;
  /** Accumulated cost from previous tasks (USD). */
  cost: number;
  /** Elapsed time since workflow start (ms). */
  durationMs: number;
  /** Previous task's output contract, or null if first task. */
  outputContract: OutputContract | null;
  /** Project root directory. */
  projectDir: string;
}

/**
 * Result returned by a null task handler.
 */
export interface NullTaskResult {
  /** Whether the handler completed successfully. */
  success: boolean;
  /** Optional text output for logging. */
  output?: string;
}

/**
 * A null task handler function.
 */
export type NullTaskHandler = (ctx: TaskContext) => Promise<NullTaskResult>;

// --- Registry ---

const registry = new Map<string, NullTaskHandler>();

/**
 * Register a null task handler.
 *
 * @param name  The task name to register (must match the task key in workflow YAML).
 * @param handler  The handler function to execute when this task is reached.
 */
export function registerNullTask(name: string, handler: NullTaskHandler): void {
  registry.set(name, handler);
}

/**
 * Look up a registered null task handler.
 *
 * @param name  The task name to look up.
 * @returns The handler function, or `undefined` if no handler is registered.
 */
export function getNullTask(name: string): NullTaskHandler | undefined {
  return registry.get(name);
}

/**
 * List all registered null task handler names.
 * Used for error messages when an unknown null task is encountered.
 */
export function listNullTasks(): string[] {
  return [...registry.keys()];
}

/**
 * Clear all registered handlers. Intended for test cleanup only.
 * Does NOT re-register built-in handlers — callers must re-register
 * any handlers they need after clearing.
 */
export function clearNullTaskRegistry(): void {
  registry.clear();
}

// --- Built-in Handlers ---

/**
 * Telemetry handler — writes structured NDJSON after each story completes.
 * @see Story 16-3: Telemetry Writer
 */
registerNullTask('telemetry', writeTelemetryEntry);
