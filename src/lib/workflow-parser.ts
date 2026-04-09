/** Workflow parser — core types, schema validation, and parseWorkflow(). */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateWorkflowSchema } from './schema-validate.js';
import { validateReferentialIntegrity } from './workflow-execution.js';
import type {
  ExecutionConfig as WorkflowExecutionConfig,
  FlowStep as WorkflowFlowStep,
  GateConfig,
  ForEachConfig,
  LoopBlock,
  ResolvedTask,
  ResolvedWorkflow,
} from './workflow-types.js';

// Re-export base types; workflow-parser.ts is the public compatibility surface.
export type { ResolvedTask, LoopBlock } from './workflow-types.js';
export type ForEachBlock = ForEachConfig;
export type GateBlock = GateConfig;
export type FlowStep = WorkflowFlowStep;
export type ForEachFlowStep = string | ForEachBlock | GateBlock;
export type { ResolvedWorkflow } from './workflow-types.js';
export type ExecutionConfig = WorkflowExecutionConfig;

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

const VALID_ISOLATION = new Set<string>(['worktree', 'none']);
const VALID_MERGE_STRATEGY = new Set<string>(['rebase', 'merge-commit']);
const VALID_EPIC_STRATEGY = new Set<string>(['parallel', 'sequential']);
const VALID_STORY_STRATEGY = new Set<string>(['sequential', 'parallel']);

// --- Error Class ---

export class WorkflowParseError extends Error {
  public readonly errors: Array<{ path: string; message: string }>;

  constructor(message: string, errors?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'WorkflowParseError';
    this.errors = errors ?? [];
  }
}

export class HierarchicalFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HierarchicalFlowError';
  }
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

  const storyFlow = normalizeFlowArray(parsed.story_flow);
  const epicFlow = normalizeFlowArray(parsed.epic_flow);
  const storyFlowRefs = epicFlow.filter((step) => step === 'story_flow');

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

// --- for_each Parser ---

/**
 * Recursively parse a `for_each` block, validating task name references.
 * Structural validation (required fields, types, minItems) is done by JSON schema before this runs.
 */
function parseForEachFlow(
  block: unknown,
  taskNames: Set<string>,
  path: string,
  errors: Array<{ path: string; message: string }>,
): ForEachBlock {
  const b = block as Record<string, unknown>;
  const scope = b.for_each as string | undefined;
  const rawSteps = b.steps as unknown[];

  const parsedSteps: ForEachFlowStep[] = [];

  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const stepPath = `${path}.steps[${i}]`;

    if (typeof step === 'string') {
      if (!taskNames.has(step)) {
        errors.push({
          path: stepPath,
          message: `Task "${step}" referenced in ${stepPath} but not defined in tasks`,
        });
      }
      parsedSteps.push(step);
    } else if (
      typeof step === 'object' &&
      step !== null &&
      'for_each' in step
    ) {
      const nested = parseForEachFlow(step, taskNames, stepPath, errors);
      parsedSteps.push(nested);
    } else if (
      typeof step === 'object' &&
      step !== null &&
      'gate' in step
    ) {
      const g = step as Record<string, unknown>;
      const checkTasks = (g.check as string[]) ?? [];
      const fixTasks = (g.fix as string[]) ?? [];

      // Validate check task references
      for (let j = 0; j < checkTasks.length; j++) {
        if (!taskNames.has(checkTasks[j])) {
          errors.push({
            path: `${stepPath}.check[${j}]`,
            message: `Gate check task "${checkTasks[j]}" at ${stepPath}.check[${j}] not defined in tasks`,
          });
        }
      }

      // Validate fix task references
      for (let j = 0; j < fixTasks.length; j++) {
        if (!taskNames.has(fixTasks[j])) {
          errors.push({
            path: `${stepPath}.fix[${j}]`,
            message: `Gate fix task "${fixTasks[j]}" at ${stepPath}.fix[${j}] not defined in tasks`,
          });
        }
      }

      const gateBlock: GateBlock = {
        gate: g.gate as string,
        check: checkTasks,
        fix: fixTasks,
        pass_when: (g.pass_when as GateBlock['pass_when']) ?? 'consensus',
        max_retries: (g.max_retries as number) ?? 3,
        circuit_breaker: (g.circuit_breaker as GateBlock['circuit_breaker']) ?? 'stagnation',
      };
      parsedSteps.push(gateBlock);
    } else {
      errors.push({
        path: stepPath,
        message: `Invalid step at ${stepPath}: expected task name, for_each block, or gate block`,
      });
    }
  }

  return { for_each: scope, steps: parsedSteps };
}

// --- Derive storyFlow/epicFlow from ForEachBlock ---

/**
 * Derive flat `storyFlow` and `epicFlow` arrays from a `ForEachBlock` workflow.
 *
 * The runtime (story machine, epic machine) iterates these flat lists.
 * This function extracts them from the structured for_each tree:
 *
 * - Top-level `for_each: story` block → produces storyFlow steps + adds `'story_flow'` sentinel to epicFlow
 * - Top-level string steps → epic-level task (added to epicFlow)
 * - GateBlock at any level → converted to LoopBlock `{ loop: [...check, ...fix] }`
 */
function deriveFlowsFromForEach(workflowBlock: ForEachBlock): { storyFlow: FlowStep[]; epicFlow: FlowStep[]; sprintFlow: FlowStep[] } {
  const storyFlow: FlowStep[] = [];
  const epicFlow: FlowStep[] = [];
  const sprintFlow: FlowStep[] = [];

  // If the top-level block has for_each: epic, process its steps as epic-level
  // If no for_each (plain steps block), find the for_each: epic inside
  const isTopLevelEpic = workflowBlock.for_each === 'epic';
  const topSteps = workflowBlock.steps;

  if (isTopLevelEpic) {
    // Top-level IS the epic iteration — all steps are epic-level
    extractEpicSteps(topSteps, storyFlow, epicFlow);
  } else {
    // Top-level is sprint-level — find for_each: epic inside, rest is sprint-level
    for (const step of topSteps) {
      if (typeof step === 'object' && step !== null && 'for_each' in step) {
        const nested = step as unknown as ForEachBlock;
        if (nested.for_each === 'epic') {
          extractEpicSteps(nested.steps, storyFlow, epicFlow);
        }
      } else if (typeof step === 'string') {
        sprintFlow.push(step);
      } else if (typeof step === 'object' && step !== null && 'gate' in step) {
        sprintFlow.push(step as FlowStep);
      }
    }
  }

  return { storyFlow, epicFlow, sprintFlow };
}

/** Extract storyFlow and epicFlow from the steps inside a for_each: epic block. */
function extractEpicSteps(steps: FlowStep[], storyFlow: FlowStep[], epicFlow: FlowStep[]): void {
  for (const step of steps) {
    if (typeof step === 'string') {
      epicFlow.push(step);
    } else if (typeof step === 'object' && step !== null && 'for_each' in step) {
      const nested = step as unknown as ForEachBlock;
      if (nested.for_each === 'story') {
        epicFlow.push('story_flow');
        for (const storyStep of nested.steps) {
          if (typeof storyStep === 'string') {
            storyFlow.push(storyStep);
          } else if (typeof storyStep === 'object' && storyStep !== null && 'gate' in storyStep) {
            storyFlow.push(storyStep as FlowStep);
          }
        }
      }
    } else if (typeof step === 'object' && step !== null && 'gate' in step) {
      epicFlow.push(step as FlowStep);
    }
  }
}

// --- Shared Validation & Resolution ---

/**
 * Validate parsed YAML against JSON schema, check referential integrity,
 * apply defaults, and return a typed ResolvedWorkflow.
 * Shared between parseWorkflow (direct file) and resolveWorkflow (patch chain).
 */
export function parseWorkflowData(parsed: unknown): ResolvedWorkflow {
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed)
  ) {
    const obj = parsed as Record<string, unknown>;
    const hasWorkflowKey = 'workflow' in obj && obj.workflow !== undefined;

    if (!hasWorkflowKey) {
      throw new WorkflowParseError(
        'Workflow must define "workflow" key with for_each format',
        [{ path: '/', message: 'Missing "workflow" key — use for_each format' }],
      );
    }
  }

  const result = validateWorkflowSchema(parsed);
  if (!result.valid) {
    const normalizedErrors = result.errors.map((e) => {
      if (e.path.endsWith('/gate')) {
        return {
          path: e.path,
          message: 'gate name must be a non-empty string',
        };
      }
      return { path: e.path, message: e.message };
    });
    const details = normalizedErrors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new WorkflowParseError(
      `Schema validation failed: ${details}`,
      normalizedErrors,
    );
  }

  const data = parsed as Record<string, unknown> & {
    tasks: Record<string, Record<string, unknown>>;
    flow?: unknown[];
    story_flow?: unknown[];
    epic_flow?: unknown[];
    workflow?: unknown;
    execution?: Record<string, unknown>;
  };

  const hasWorkflow = 'workflow' in data && data.workflow !== undefined;

  // --- New format: workflow: with for_each blocks ---
  if (hasWorkflow) {
    const taskNames = new Set(Object.keys(data.tasks));
    const allErrors: Array<{ path: string; message: string }> = [];

    const workflowBlock = parseForEachFlow(data.workflow, taskNames, 'workflow', allErrors);
    validateReferentialIntegrity(data, allErrors);

    if (allErrors.length > 0) {
      const details = allErrors.map((e) => e.message).join('; ');
      throw new WorkflowParseError(`Referential integrity errors: ${details}`, allErrors);
    }

    const defaults = (data.defaults as { driver?: string; model?: string } | undefined) ?? undefined;
    const resolvedTasks = resolveTasksMap(data.tasks, defaults);
    const rawExecution = (data.execution != null && typeof data.execution === 'object')
      ? data.execution as Record<string, unknown>
      : {};

    let execution: ExecutionConfig;
    try {
      execution = resolveExecutionConfig(rawExecution);
    } catch (err: unknown) {
      if (err instanceof HierarchicalFlowError) {
        throw new WorkflowParseError(err.message, [{ path: '/', message: err.message }]);
      }
      throw err;
    }

    const { storyFlow, epicFlow, sprintFlow } = deriveFlowsFromForEach(workflowBlock);
    return {
      tasks: resolvedTasks,
      storyFlow,
      epicFlow,
      sprintFlow,
      execution,
      workflow: workflowBlock,
    };
  }

  // If we reach here, the workflow key was missing (caught above) or format is unknown
  throw new WorkflowParseError('Workflow must use for_each format', [{ path: '/', message: 'Use workflow: with for_each blocks' }]);
}

/** Build the resolved tasks map from raw parsed task data, applying workflow defaults. */
function resolveTasksMap(
  rawTasks: Record<string, Record<string, unknown>>,
  defaults?: { driver?: string; model?: string },
): Record<string, ResolvedTask> {
  const resolvedTasks: Record<string, ResolvedTask> = {};
  for (const [taskName, task] of Object.entries(rawTasks)) {
    const resolved: ResolvedTask = {
      agent: task.agent as string | null,
      session: (task.session as ResolvedTask['session']) ?? 'fresh',
      source_access: (task.source_access as boolean) ?? true,
    };
    if (task.prompt_template !== undefined) resolved.prompt_template = task.prompt_template as string;
    if (task.input_contract !== undefined) resolved.input_contract = task.input_contract as Record<string, unknown>;
    if (task.output_contract !== undefined) resolved.output_contract = task.output_contract as Record<string, unknown>;
    if (task.max_budget_usd !== undefined) resolved.max_budget_usd = task.max_budget_usd as number;
    if (task.timeout_minutes !== undefined) resolved.timeout_minutes = task.timeout_minutes as number;
    // Apply defaults for driver/model if task doesn't specify them
    const driver = task.driver ?? defaults?.driver;
    if (driver != null) resolved.driver = driver as string;
    const model = task.model ?? defaults?.model;
    if (model != null) resolved.model = model as string;
    if (task.plugins !== undefined) resolved.plugins = task.plugins as string[];
    resolvedTasks[taskName] = resolved;
  }
  return resolvedTasks;
}

// --- Parser ---

/**
 * Parse a workflow YAML file from disk, validate it against the JSON schema,
 * check referential integrity, apply defaults, and return a typed ResolvedWorkflow.
 */
export function parseWorkflow(filePath: string): ResolvedWorkflow {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    const detail = code === 'ENOENT'
      ? 'File not found'
      : code === 'EACCES'
        ? 'Permission denied'
        : code === 'EISDIR'
          ? 'Path is a directory'
          : 'File not found or unreadable';
    throw new WorkflowParseError(`${detail}: ${filePath}`, [
      { path: filePath, message: detail },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const yamlMsg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML syntax: ${yamlMsg}`, [
      { path: filePath, message: yamlMsg },
    ]);
  }

  return parseWorkflowData(parsed);
}

// --- Re-exports ---

export type { WorkflowPatch } from './workflow-resolver.js';
export {
  loadWorkflowPatch,
  mergeWorkflowPatch,
  resolveWorkflow,
} from './workflow-resolver.js';
