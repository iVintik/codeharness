/**
 * Shared actor/workflow-boundary types for the XState v5 workflow engine.
 * No runtime code — pure type definitions.
 */

import type { OutputContract } from './agents/types.js';
import type { StreamEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedTask, ResolvedWorkflow } from './workflow-parser.js';
import type { WorkflowState } from './workflow-state.js';

// ─── Engine Event ─────────────────────────────────────────────────────

export interface EngineEvent {
  type: 'dispatch-start' | 'dispatch-end' | 'dispatch-error' | 'stream-event' | 'task-skip' | 'story-done' | 'epic-verified';
  taskName: string;
  storyKey: string;
  verdictPassed?: boolean;
  driverName?: string;
  model?: string;
  streamEvent?: StreamEvent;
  error?: { code: string; message: string };
  elapsedMs?: number;
  costUsd?: number;
}

// ─── Engine Config ─────────────────────────────────────────────────────

export interface EngineConfig {
  workflow: ResolvedWorkflow;
  agents: Record<string, SubagentDefinition>;
  sprintStatusPath: string;
  issuesPath?: string;
  runId: string;
  projectDir?: string;
  maxIterations?: number;
  onEvent?: (event: EngineEvent) => void;
  abortSignal?: AbortSignal;
}

// ─── Dispatch Input/Output ────────────────────────────────────────────

export interface DispatchInput {
  task: ResolvedTask;
  taskName: string;
  storyKey: string;
  definition: SubagentDefinition;
  config: EngineConfig;
  workflowState: WorkflowState;
  previousContract: OutputContract | null;
  onStreamEvent?: (event: StreamEvent, driverName?: string) => void;
  storyFiles?: string[];
  customPrompt?: string;
  accumulatedCostUsd?: number;
}

export interface DispatchOutput {
  output: string;
  cost: number;
  changedFiles: string[];
  sessionId: string;
  contract: OutputContract | null;
  updatedState: WorkflowState;
}

export interface NullTaskInput {
  task: ResolvedTask;
  taskName: string;
  storyKey: string;
  config: EngineConfig;
  workflowState: WorkflowState;
  previousContract: OutputContract | null;
  accumulatedCostUsd: number;
}
