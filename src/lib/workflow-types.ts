/**
 * Shared actor/workflow-boundary types for the XState v5 workflow engine.
 * No runtime code — pure type definitions.
 */

import type { OutputContract } from './agents/types.js';
import type { StreamEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedTask } from './workflow-parser.js';
import type { WorkflowState } from './workflow-state.js';
import type { EngineConfig } from './workflow-machine.js';

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
