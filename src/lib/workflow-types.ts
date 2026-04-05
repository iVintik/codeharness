/**
 * Shared actor/workflow-boundary types for the XState v5 workflow engine.
 * No runtime code — pure type definitions.
 */

import type { OutputContract } from './agents/types.js';
import type { StreamEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedTask, ResolvedWorkflow, LoopBlock } from './workflow-parser.js';
import type { WorkflowState } from './workflow-state.js';
import type { EvaluatorVerdict } from './verdict-parser.js';

// ─── Core Engine Types ────────────────────────────────────────────────

export interface EngineError {
  taskName: string;
  storyKey: string;
  code: string;
  message: string;
}

export interface WorkItem {
  key: string;
  title?: string;
  source: 'sprint' | 'issues';
}

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

// ─── Story Flow Actor I/O ─────────────────────────────────────────────

export type StoryFlowInput = { item: WorkItem; config: EngineConfig; workflowState: WorkflowState; lastContract: OutputContract | null; accumulatedCostUsd: number; storyFlowTasks: Set<string> };
export type StoryFlowOutput = { workflowState: WorkflowState; errors: EngineError[]; tasksCompleted: number; lastContract: OutputContract | null; accumulatedCostUsd: number; halted: boolean };

// ─── Machine Context Types ────────────────────────────────────────────

export interface LoopMachineContext {
  loopBlock: LoopBlock;
  config: EngineConfig;
  workItems: WorkItem[];
  storyFlowTasks: Set<string> | undefined;
  onStreamEvent?: (event: StreamEvent, driverName?: string) => void;
  maxIterations: number;
  currentState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
  lastVerdict: EvaluatorVerdict | null;
  accumulatedCostUsd: number;
}

export interface EpicMachineContext {
  epicId: string;
  epicItems: WorkItem[];
  config: EngineConfig;
  storyFlowTasks: Set<string>;
  currentStoryIndex: number;
  workflowState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  storiesProcessed: Set<string>;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  halted: boolean;
  currentStepIndex: number;
}

export interface RunMachineContext {
  config: EngineConfig;
  storyFlowTasks: Set<string>;
  epicEntries: Array<[string, WorkItem[]]>;
  currentEpicIndex: number;
  workflowState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  storiesProcessed: Set<string>;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  halted: boolean;
}
