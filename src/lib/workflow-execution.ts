/** Execution config, hierarchical flow resolution, and flow validation helpers. */
import { listDrivers } from './agents/drivers/factory.js';
import { listEmbeddedAgents, resolveAgent, AgentResolveError } from './agent-resolver.js';
import type { ResolvedTask, LoopBlock, ExecutionConfig, ForEachConfig, GateConfig } from './workflow-types.js';

export type { ResolvedTask, LoopBlock, ExecutionConfig } from './workflow-types.js';
export type ForEachBlock = ForEachConfig;
export type GateBlock = GateConfig;
export type FlowStep = string | LoopBlock;

/** A step inside a `for_each` block: either a task name, a nested for_each, or a gate block. */
export type ForEachFlowStep = string | ForEachConfig | GateConfig;

export interface HierarchicalFlow {
  execution: ExecutionConfig;
  storyFlow: FlowStep[];
  epicFlow: FlowStep[];
  tasks: Record<string, ResolvedTask>;
}

/** Built-in epic flow step names that do not need entries in `tasks:`. */
export const BUILTIN_EPIC_FLOW_TASKS = new Set(['merge', 'validate', 'story_flow']);

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

export class HierarchicalFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HierarchicalFlowError';
  }
}

export function resolveHierarchicalFlow(
  parsed: Record<string, unknown>,
  resolvedTasks: Record<string, ResolvedTask>,
): HierarchicalFlow {
  const hasStoryFlow = 'story_flow' in parsed && parsed.story_flow !== undefined;
  const hasEpicFlow = 'epic_flow' in parsed && parsed.epic_flow !== undefined;

  if (!hasStoryFlow) {
    throw new HierarchicalFlowError('Workflow must define "story_flow"');
  }
  if (!hasEpicFlow) {
    throw new HierarchicalFlowError('Workflow must define "epic_flow"');
  }

  const rawExecution = (parsed.execution != null && typeof parsed.execution === 'object')
    ? parsed.execution as Record<string, unknown>
    : {};
  const execution = resolveExecutionConfig(rawExecution);

  const storyFlow: FlowStep[] = normalizeFlowArray(parsed.story_flow);
  const epicFlow: FlowStep[] = normalizeFlowArray(parsed.epic_flow);

  const storyFlowRefs = epicFlow.filter(s => s === 'story_flow');
  if (storyFlowRefs.length === 0) {
    throw new HierarchicalFlowError('epic_flow must contain a "story_flow" reference');
  }
  if (storyFlowRefs.length > 1) {
    throw new HierarchicalFlowError('epic_flow must contain exactly one "story_flow" reference');
  }

  return {
    execution,
    storyFlow,
    epicFlow,
    tasks: resolvedTasks,
  };
}

export function resolveExecutionConfig(raw: Record<string, unknown>): ExecutionConfig {
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

// --- Flow Reference Validation ---

/**
 * Validate that all task references in a flow array point to defined tasks.
 * When `allowBuiltins` is true, built-in epic flow task names are also accepted.
 */
export function validateFlowReferences(
  flow: unknown[],
  taskNames: Set<string>,
  flowLabel: string,
  errors: Array<{ path: string; message: string }>,
  allowBuiltins: boolean,
): void {
  for (let i = 0; i < flow.length; i++) {
    const step = flow[i];
    if (typeof step === 'string') {
      const isValid = taskNames.has(step) || (allowBuiltins && BUILTIN_EPIC_FLOW_TASKS.has(step));
      if (!isValid) {
        errors.push({
          path: `/${flowLabel}/${i}`,
          message: `Task "${step}" referenced in ${flowLabel} but not defined in tasks`,
        });
      }
    } else if (typeof step === 'object' && step !== null && 'loop' in step) {
      const loopBlock = step as { loop: string[] };
      for (let j = 0; j < loopBlock.loop.length; j++) {
        const ref = loopBlock.loop[j];
        const isValid = taskNames.has(ref) || (allowBuiltins && BUILTIN_EPIC_FLOW_TASKS.has(ref));
        if (!isValid) {
          errors.push({
            path: `/${flowLabel}/${i}/loop/${j}`,
            message: `Task "${ref}" referenced in loop but not defined in tasks`,
          });
        }
      }
    }
  }
}

// --- Referential Integrity Validation ---

/**
 * Validate that driver and agent references in tasks point to real registered
 * drivers and resolvable agents. Collects errors into the provided array
 * (does not throw — caller decides when to throw).
 */
export function validateReferentialIntegrity(
  data: { tasks: Record<string, Record<string, unknown>> },
  errors: Array<{ path: string; message: string }>,
): void {
  const registeredDrivers = listDrivers();
  const driverRegistryPopulated = registeredDrivers.length > 0;
  const embeddedAgents = listEmbeddedAgents();

  for (const [taskName, task] of Object.entries(data.tasks)) {
    if (task.driver !== undefined && typeof task.driver === 'string' && driverRegistryPopulated) {
      if (!registeredDrivers.includes(task.driver)) {
        errors.push({
          path: `/tasks/${taskName}/driver`,
          message: `Driver "${task.driver}" not found in task "${taskName}". Registered drivers: ${registeredDrivers.join(', ')}`,
        });
      }
    }

    if (task.agent !== undefined && task.agent !== null && typeof task.agent === 'string') {
      try {
        resolveAgent(task.agent);
      } catch (err: unknown) {
        if (err instanceof AgentResolveError && err.message.startsWith('Embedded agent not found:')) {
          const available = embeddedAgents.length > 0 ? embeddedAgents.join(', ') : '(none)';
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" not found in task "${taskName}". Available agents: ${available}`,
          });
        } else if (err instanceof AgentResolveError) {
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${err.message}`,
          });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${msg}`,
          });
        }
      }
    }
  }
}
