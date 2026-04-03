import type { ResolvedTask, FlowStep, LoopBlock } from './workflow-parser.js';

// --- Interfaces ---

export interface ExecutionConfig {
  max_parallel: number;
  isolation: 'worktree' | 'none';
  merge_strategy: 'rebase' | 'merge-commit';
  epic_strategy: 'parallel' | 'sequential';
  story_strategy: 'sequential' | 'parallel';
}

export interface HierarchicalFlow {
  execution: ExecutionConfig;
  storyFlow: FlowStep[];
  epicFlow: FlowStep[];
  tasks: Record<string, ResolvedTask>;
}

// --- Constants ---

/** Built-in epic flow task names that do not need entries in `tasks:`. */
export const BUILTIN_EPIC_FLOW_TASKS = new Set(['merge', 'validate']);

/** Default execution configuration values. */
export const EXECUTION_DEFAULTS: ExecutionConfig = {
  max_parallel: 1,
  isolation: 'none',
  merge_strategy: 'merge-commit',
  epic_strategy: 'sequential',
  story_strategy: 'sequential',
};

/** Valid enum values for execution config fields. */
const VALID_ISOLATION = new Set<string>(['worktree', 'none']);
const VALID_MERGE_STRATEGY = new Set<string>(['rebase', 'merge-commit']);
const VALID_EPIC_STRATEGY = new Set<string>(['parallel', 'sequential']);
const VALID_STORY_STRATEGY = new Set<string>(['sequential', 'parallel']);

// --- Resolution ---

/**
 * Resolve a parsed workflow YAML object into a HierarchicalFlow.
 *
 * Handles three cases:
 * 1. Legacy: only `flow` present → normalized to `storyFlow`
 * 2. Hierarchical: `story_flow` (and optionally `epic_flow`, `execution`) present
 * 3. Conflict: both `flow` and `story_flow` → rejected with error
 *
 * This is a pure parsing/normalization function with no side effects.
 */
export function resolveHierarchicalFlow(
  parsed: Record<string, unknown>,
  resolvedTasks: Record<string, ResolvedTask>,
): HierarchicalFlow {
  const hasFlow = 'flow' in parsed && parsed.flow !== undefined;
  const hasStoryFlow = 'story_flow' in parsed && parsed.story_flow !== undefined;

  // Reject coexistence of flow and story_flow
  if (hasFlow && hasStoryFlow) {
    throw new HierarchicalFlowError(
      'Workflow cannot have both "flow" and "story_flow" — use "story_flow" for hierarchical workflows or "flow" for legacy mode',
    );
  }

  // Resolve execution config with defaults and validation
  const rawExecution = (parsed.execution != null && typeof parsed.execution === 'object')
    ? parsed.execution as Record<string, unknown>
    : {};
  const execution = resolveExecutionConfig(rawExecution);

  // Resolve story flow
  const rawStoryFlow = hasStoryFlow ? parsed.story_flow : parsed.flow;
  const storyFlow: FlowStep[] = normalizeFlowArray(rawStoryFlow);

  // Resolve epic flow
  const epicFlow: FlowStep[] = normalizeFlowArray(parsed.epic_flow);

  return {
    execution,
    storyFlow,
    epicFlow,
    tasks: resolvedTasks,
  };
}

/**
 * Resolve and validate execution config, applying defaults for missing fields.
 * Rejects invalid enum values with a descriptive error.
 */
function resolveExecutionConfig(raw: Record<string, unknown>): ExecutionConfig {
  const maxParallel = raw.max_parallel;
  if (maxParallel !== undefined && (typeof maxParallel !== 'number' || !Number.isInteger(maxParallel) || maxParallel < 1)) {
    throw new HierarchicalFlowError(
      `Invalid execution.max_parallel: expected positive integer, got ${JSON.stringify(maxParallel)}`,
    );
  }

  if (raw.isolation !== undefined && !VALID_ISOLATION.has(String(raw.isolation))) {
    throw new HierarchicalFlowError(
      `Invalid execution.isolation: expected "worktree" or "none", got ${JSON.stringify(raw.isolation)}`,
    );
  }

  if (raw.merge_strategy !== undefined && !VALID_MERGE_STRATEGY.has(String(raw.merge_strategy))) {
    throw new HierarchicalFlowError(
      `Invalid execution.merge_strategy: expected "rebase" or "merge-commit", got ${JSON.stringify(raw.merge_strategy)}`,
    );
  }

  if (raw.epic_strategy !== undefined && !VALID_EPIC_STRATEGY.has(String(raw.epic_strategy))) {
    throw new HierarchicalFlowError(
      `Invalid execution.epic_strategy: expected "parallel" or "sequential", got ${JSON.stringify(raw.epic_strategy)}`,
    );
  }

  if (raw.story_strategy !== undefined && !VALID_STORY_STRATEGY.has(String(raw.story_strategy))) {
    throw new HierarchicalFlowError(
      `Invalid execution.story_strategy: expected "sequential" or "parallel", got ${JSON.stringify(raw.story_strategy)}`,
    );
  }

  return {
    max_parallel: (maxParallel as number) ?? EXECUTION_DEFAULTS.max_parallel,
    isolation: (raw.isolation as ExecutionConfig['isolation']) ?? EXECUTION_DEFAULTS.isolation,
    merge_strategy: (raw.merge_strategy as ExecutionConfig['merge_strategy']) ?? EXECUTION_DEFAULTS.merge_strategy,
    epic_strategy: (raw.epic_strategy as ExecutionConfig['epic_strategy']) ?? EXECUTION_DEFAULTS.epic_strategy,
    story_strategy: (raw.story_strategy as ExecutionConfig['story_strategy']) ?? EXECUTION_DEFAULTS.story_strategy,
  };
}

/**
 * Normalize an unknown value into a FlowStep array.
 * Returns [] for undefined/null. Validates that each step is a string or loop block.
 */
function normalizeFlowArray(raw: unknown): FlowStep[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new HierarchicalFlowError(
      `Expected flow to be an array, got ${typeof raw}`,
    );
  }
  return raw.map((step: unknown, i: number) => {
    if (typeof step === 'string') return step;
    if (typeof step === 'object' && step !== null && 'loop' in step) {
      const loopVal = (step as Record<string, unknown>).loop;
      if (!Array.isArray(loopVal) || !loopVal.every((v) => typeof v === 'string')) {
        throw new HierarchicalFlowError(
          `Invalid loop block at index ${i}: "loop" must be an array of strings`,
        );
      }
      return step as LoopBlock;
    }
    throw new HierarchicalFlowError(
      `Invalid flow step at index ${i}: expected string or loop block, got ${JSON.stringify(step)}`,
    );
  });
}

// --- Error Class ---

export class HierarchicalFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HierarchicalFlowError';
  }
}
