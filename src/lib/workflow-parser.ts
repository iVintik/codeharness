/** Workflow parser — core types, schema validation, and parseWorkflow(). */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateWorkflowSchema } from './schema-validate.js';
import {
  resolveExecutionConfig,
  validateReferentialIntegrity,
  HierarchicalFlowError,
  type ExecutionConfig,
  type ResolvedTask,
  type FlowStep,
  type ForEachBlock,
  type ForEachFlowStep,
  type GateBlock,
} from './workflow-execution.js';
import type { ResolvedWorkflow } from './workflow-types.js';

// Re-export base types; workflow-execution.ts and workflow-types.ts are the canonical sources.
export type { ResolvedTask, LoopBlock, FlowStep, ForEachBlock, ForEachFlowStep, GateBlock } from './workflow-execution.js';
export type { ResolvedWorkflow } from './workflow-types.js';

// --- Error Class ---

export class WorkflowParseError extends Error {
  public readonly errors: Array<{ path: string; message: string }>;

  constructor(message: string, errors?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'WorkflowParseError';
    this.errors = errors ?? [];
  }
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
  const scope = b.for_each as string;
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

// --- New-format to Legacy Derivation ---

/**
 * Derive legacy `storyFlow` and `epicFlow` from a new-format `ForEachBlock`.
 *
 * The new `workflow: { for_each: epic, steps: [...] }` format is richer than the
 * legacy `story_flow`/`epic_flow` flat lists, but the runtime executes via the legacy
 * fields. This function bridges the gap so both formats are runtime-compatible:
 *
 * - Top-level `for_each: story` block → produces storyFlow steps + adds `'story_flow'` sentinel to epicFlow
 * - Top-level string steps → epic-level task (added to epicFlow)
 * - GateBlock at any level → converted to LoopBlock `{ loop: [...check, ...fix] }`
 */
function deriveFlowsFromForEach(workflowBlock: ForEachBlock): { storyFlow: FlowStep[]; epicFlow: FlowStep[] } {
  const storyFlow: FlowStep[] = [];
  const epicFlow: FlowStep[] = [];

  for (const step of workflowBlock.steps) {
    if (typeof step === 'string') {
      epicFlow.push(step);
    } else if ('for_each' in step) {
      const nested = step as ForEachBlock;
      if (nested.for_each === 'story') {
        // Story-level block: add sentinel to epicFlow, extract storyFlow steps
        epicFlow.push('story_flow');
        for (const storyStep of nested.steps) {
          if (typeof storyStep === 'string') {
            storyFlow.push(storyStep);
          } else if ('gate' in storyStep) {
            // Keep GateConfig as-is — the story machine handles gates natively
            storyFlow.push(storyStep as FlowStep);
          }
          // Deeper for_each nesting at story level is not expected; skip.
        }
      } else {
        // Non-story for_each at epic level: treat as inline epic step expansion
        for (const innerStep of nested.steps) {
          if (typeof innerStep === 'string') epicFlow.push(innerStep);
          else if ('gate' in innerStep) {
            const gate = innerStep as GateBlock;
            epicFlow.push({ loop: [...gate.check, ...gate.fix] });
          }
        }
      }
    } else if ('gate' in step) {
      const gate = step as GateBlock;
      epicFlow.push({ loop: [...gate.check, ...gate.fix] });
    }
  }

  return { storyFlow, epicFlow };
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

    const resolvedTasks = resolveTasksMap(data.tasks);
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

    const { storyFlow, epicFlow } = deriveFlowsFromForEach(workflowBlock);
    return {
      tasks: resolvedTasks,
      storyFlow,
      epicFlow,
      execution,
      workflow: workflowBlock,
    };
  }

  // If we reach here, the workflow key was missing (caught above) or format is unknown
  throw new WorkflowParseError('Workflow must use for_each format', [{ path: '/', message: 'Use workflow: with for_each blocks' }]);
}

/** Build the resolved tasks map from raw parsed task data. */
function resolveTasksMap(
  rawTasks: Record<string, Record<string, unknown>>,
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
    if (task.driver !== undefined) resolved.driver = task.driver as string;
    if (task.model !== undefined) resolved.model = task.model as string;
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

// --- Re-exports for backward compatibility ---
// All symbols that were previously exported from this file and moved to sub-modules.

export type { ExecutionConfig, HierarchicalFlow } from './workflow-execution.js';
export {
  BUILTIN_EPIC_FLOW_TASKS,
  EXECUTION_DEFAULTS,
  HierarchicalFlowError,
  resolveHierarchicalFlow,
} from './workflow-execution.js';
export type { WorkflowPatch } from './workflow-resolver.js';
export {
  loadWorkflowPatch,
  mergeWorkflowPatch,
  resolveWorkflow,
} from './workflow-resolver.js';
