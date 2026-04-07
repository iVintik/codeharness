/** Shared workflow engine types. Keep dependency-free. */

export type ErrorCategory = 'RATE_LIMIT' | 'NETWORK' | 'AUTH' | 'TIMEOUT' | 'UNKNOWN';
export type GatePassStrategy = 'consensus' | 'all_pass' | 'majority' | 'any_pass';

export interface DriverHealth { readonly available: boolean; readonly authenticated: boolean; readonly version: string | null; readonly error?: string }
export interface ToolStartEvent { readonly type: 'tool-start'; readonly name: string; readonly id: string }
export interface ToolInputEvent { readonly type: 'tool-input'; readonly partial: string }
export interface ToolCompleteEvent { readonly type: 'tool-complete' }
export interface TextEvent { readonly type: 'text'; readonly text: string }
export interface RetryEvent { readonly type: 'retry'; readonly attempt: number; readonly delay: number }
export interface ResultEvent { readonly type: 'result'; readonly cost: number; readonly sessionId: string; readonly cost_usd?: number | null; readonly error?: string; readonly errorCategory?: ErrorCategory }
export type StreamEvent = ToolStartEvent | ToolInputEvent | ToolCompleteEvent | TextEvent | RetryEvent | ResultEvent;

export interface TestResults { readonly passed: number; readonly failed: number; readonly coverage: number | null }
export interface ACStatus { readonly id: string; readonly description: string; readonly status: string }
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

export interface SubagentDefinition { name: string; model: string; instructions: string; disallowedTools: string[]; plugins?: readonly string[]; bare: true }
export interface ResolvedTask {
  agent: string | null;
  session: 'fresh' | 'continue';
  source_access: boolean;
  prompt_template?: string;
  input_contract?: Record<string, unknown>;
  output_contract?: Record<string, unknown>;
  max_budget_usd?: number;
  /** Per-task timeout in minutes. Kills the dispatch process after this duration. */
  timeout_minutes?: number;
  driver?: string;
  model?: string;
  plugins?: string[];
}

export interface LoopBlock { loop: string[] }
export interface GateConfig { gate: string; check: string[]; fix: string[]; pass_when: GatePassStrategy; max_retries: number; circuit_breaker: string }
export interface ForEachConfig { for_each?: string; steps: FlowStep[] }
export type FlowStep = string | LoopBlock | GateConfig | ForEachConfig;

export interface ExecutionConfig {
  max_parallel: number;
  isolation: 'worktree' | 'none';
  merge_strategy: 'rebase' | 'merge-commit';
  epic_strategy: 'parallel' | 'sequential';
  story_strategy: 'sequential' | 'parallel';
}
export interface ResolvedWorkflow {
  tasks: Record<string, ResolvedTask>;
  storyFlow: FlowStep[];
  epicFlow: FlowStep[];
  /** Sprint-level steps that run ONCE after all epics complete (deploy, verify gate). */
  sprintFlow: FlowStep[];
  execution: ExecutionConfig;
  workflow?: ForEachConfig;
}

export interface TaskCheckpoint {
  task_name: string;
  story_key: string;
  completed_at: string;
  session_id?: string;
  error?: boolean;
  error_message?: string;
  error_code?: string;
}
export interface CheckpointEntry {
  storyKey: string;
  taskName: string;
  completedAt: string;
  verdict?: 'pass' | 'fail';
  costUsd?: number;
}
export type CheckpointLog = CheckpointEntry[];
export interface EvaluatorScore { iteration: number; passed: number; failed: number; unknown: number; total: number; timestamp: string }
export interface CircuitBreakerState { triggered: boolean; reason: string | null; score_history: number[] }
export interface WorkflowState {
  workflow_name: string;
  started: string;
  iteration: number;
  phase: string;
  tasks_completed: TaskCheckpoint[];
  evaluator_scores: EvaluatorScore[];
  circuit_breaker: CircuitBreakerState;
  trace_ids?: string[];
}

export interface EvaluatorFinding {
  ac: number;
  description: string;
  status: 'pass' | 'fail' | 'unknown';
  evidence: { commands_run: string[]; output_observed: string; reasoning: string };
}
export interface EvaluatorVerdict {
  verdict: 'pass' | 'fail';
  score: { passed: number; failed: number; unknown: number; total: number };
  findings: EvaluatorFinding[];
}

export interface EngineError { taskName: string; storyKey: string; code: string; message: string }
export class WorkflowError extends Error implements EngineError {
  public readonly code: string;
  public readonly taskName: string;
  public readonly storyKey: string;

  constructor(message: string, code: string, taskName: string, storyKey: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.taskName = taskName;
    this.storyKey = storyKey;
  }
}

export interface WorkItem { key: string; title?: string; source: 'sprint' | 'issues' }
export interface EngineEvent {
  type: 'dispatch-start' | 'dispatch-end' | 'dispatch-error' | 'stream-event' | 'task-skip' | 'story-done' | 'epic-verified' | 'workflow-viz';
  taskName: string;
  storyKey: string;
  verdictPassed?: boolean;
  driverName?: string;
  model?: string;
  streamEvent?: StreamEvent;
  error?: { code: string; message: string };
  elapsedMs?: number;
  costUsd?: number;
  /** Pre-rendered single-line ANSI visualization string (workflow-viz events). */
  vizString?: string;
  /** Raw WorkflowPosition from snapshotToPosition (workflow-viz events). Typed as unknown to avoid circular import from workflow-visualizer.ts. */
  position?: unknown;
}
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
export interface EngineResult { success: boolean; tasksCompleted: number; storiesProcessed: number; errors: EngineError[]; durationMs: number }

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

export interface StoryContext {
  item: WorkItem;
  config: EngineConfig;
  workflowState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  storyFlowTasks: Set<string>;
  completedTasks?: Set<string>;
}
export interface GateContext {
  gate: GateConfig;
  config: EngineConfig;
  workflowState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  /** Per-task raw output strings accumulated during the checking phase. */
  verdicts: Record<string, string>;
  /** When gate runs inside a for_each iteration, the current item key for namespacing storyKeys. */
  parentItemKey?: string;
}
export interface EpicContext {
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
  completedTasks?: Set<string>;
}
export interface RunContext {
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
  completedTasks?: Set<string>;
}
export type StoryFlowInput = Pick<StoryContext, 'item' | 'config' | 'workflowState' | 'lastContract' | 'accumulatedCostUsd' | 'storyFlowTasks' | 'completedTasks'>;
export type StoryFlowOutput = Pick<StoryContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>;
export interface LoopMachineContext {
  config: EngineConfig;
  loopBlock: LoopBlock;
  workItems: WorkItem[];
  storyFlowTasks?: Set<string>;
  onStreamEvent?: (event: StreamEvent, driverName?: string) => void;
  maxIterations: number;
  currentState: WorkflowState;
  errors: EngineError[];
  tasksCompleted: number;
  halted: boolean;
  lastContract: OutputContract | null;
  accumulatedCostUsd: number;
  lastVerdict: EvaluatorVerdict | null;
}
export type EpicMachineContext = EpicContext;
export type RunMachineContext = RunContext;
export interface LoopBlockResult { state: WorkflowState; errors: EngineError[]; tasksCompleted: number; halted: boolean; lastContract: OutputContract | null }

/** Minimal iteration context shape for compiled for_each assign actions. */
export interface IterationContext { currentIndex: number; items: WorkItem[]; item: WorkItem; [key: string]: unknown }
/** Compiled XState invoke state config returned by `compileStep`. */
export interface CompiledInvokeState {
  invoke: {
    src: string;
    input: (args: { context: StoryContext }) => DispatchInput | NullTaskInput;
    onDone: { target: string; actions: unknown };
    onError: Array<{ guard?: string; target?: string; actions?: unknown }>;
  };
}
/** Compiled XState compound state config returned by `compileGate`. */
export interface CompiledGateState { initial: 'checking'; states: Record<string, unknown> }
/** Compiled XState compound state config returned by `compileForEach`. */
export interface CompiledForEachState { initial: 'processItem'; states: Record<string, unknown>; meta?: { scope: string } }

export function isEngineError(value: unknown): value is EngineError {
  if (!value || typeof value !== 'object') return false;
  const err = value as Record<string, unknown>;
  return typeof err.taskName === 'string' && typeof err.storyKey === 'string' && typeof err.code === 'string' && typeof err.message === 'string';
}
export function isWorkflowError(value: unknown): value is WorkflowError {
  return value instanceof WorkflowError || (isEngineError(value) && (value as { name?: unknown }).name === 'WorkflowError');
}
export function isLoopBlock(step: FlowStep): step is LoopBlock {
  return typeof step === 'object' && step !== null && 'loop' in step && Array.isArray((step as { loop?: unknown }).loop);
}
export function isGateConfig(step: FlowStep): step is GateConfig {
  return typeof step === 'object' && step !== null && 'gate' in step && Array.isArray((step as { check?: unknown }).check) && Array.isArray((step as { fix?: unknown }).fix);
}
export function isForEachConfig(step: FlowStep): step is ForEachConfig {
  return typeof step === 'object' && step !== null && 'for_each' in step && Array.isArray((step as { steps?: unknown }).steps);
}
