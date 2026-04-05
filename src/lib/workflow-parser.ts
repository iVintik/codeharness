/** Workflow parser — core types, schema validation, and parseWorkflow(). */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateWorkflowSchema } from './schema-validate.js';
import {
  resolveHierarchicalFlow,
  validateFlowReferences,
  validateReferentialIntegrity,
  HierarchicalFlowError,
  type ExecutionConfig,
  type HierarchicalFlow,
  type ResolvedTask,
  type FlowStep,
} from './workflow-execution.js';

// Re-export base types defined in workflow-execution.ts (they live there to avoid circular imports)
export type { ResolvedTask, LoopBlock, FlowStep } from './workflow-execution.js';

export interface ResolvedWorkflow {
  tasks: Record<string, ResolvedTask>;
  /** Story-level flow — runs for each story in the epic. */
  storyFlow: FlowStep[];
  /** Epic-level flow — runs once per epic. Contains 'story_flow' reference. */
  epicFlow: FlowStep[];
  /** Execution configuration (parallel, isolation, merge strategy). */
  execution: ExecutionConfig;
  /** @deprecated Flat flow for backward compat. Use storyFlow/epicFlow. */
  flow: FlowStep[];
}

// --- Error Class ---

export class WorkflowParseError extends Error {
  public readonly errors: Array<{ path: string; message: string }>;

  constructor(message: string, errors?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'WorkflowParseError';
    this.errors = errors ?? [];
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
    if (!('flow' in obj) && !('story_flow' in obj)) {
      throw new WorkflowParseError(
        'Schema validation failed: /: must have either "flow" or "story_flow"',
        [{ path: '/', message: 'must have either "flow" or "story_flow"' }],
      );
    }
  }

  const result = validateWorkflowSchema(parsed);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new WorkflowParseError(
      `Schema validation failed: ${details}`,
      result.errors.map((e) => ({ path: e.path, message: e.message })),
    );
  }

  const data = parsed as Record<string, unknown> & {
    tasks: Record<string, Record<string, unknown>>;
    flow?: unknown[];
    story_flow?: unknown[];
    epic_flow?: unknown[];
    execution?: Record<string, unknown>;
  };

  const hasStoryFlow = 'story_flow' in data && data.story_flow !== undefined;
  const hasEpicFlow = 'epic_flow' in data && data.epic_flow !== undefined;
  if (!hasStoryFlow) {
    throw new WorkflowParseError('Workflow must define "story_flow"', [{ path: '/', message: 'Missing "story_flow"' }]);
  }
  if (!hasEpicFlow) {
    throw new WorkflowParseError('Workflow must define "epic_flow"', [{ path: '/', message: 'Missing "epic_flow"' }]);
  }

  const effectiveStoryFlow: unknown[] = data.story_flow ?? [];
  const effectiveEpicFlow: unknown[] = data.epic_flow ?? [];

  const taskNames = new Set(Object.keys(data.tasks));
  const allErrors: Array<{ path: string; message: string }> = [];

  validateFlowReferences(effectiveStoryFlow, taskNames, 'story_flow', allErrors, false);
  validateFlowReferences(effectiveEpicFlow, taskNames, 'epic_flow', allErrors, true);
  validateReferentialIntegrity(data, allErrors);

  if (allErrors.length > 0) {
    const details = allErrors.map((e) => e.message).join('; ');
    throw new WorkflowParseError(`Referential integrity errors: ${details}`, allErrors);
  }

  const resolvedTasks: Record<string, ResolvedTask> = {};
  for (const [taskName, task] of Object.entries(data.tasks)) {
    const resolved: ResolvedTask = {
      agent: task.agent as string | null,
      session: (task.session as ResolvedTask['session']) ?? 'fresh',
      source_access: (task.source_access as boolean) ?? true,
    };
    if (task.prompt_template !== undefined) resolved.prompt_template = task.prompt_template as string;
    if (task.input_contract !== undefined) resolved.input_contract = task.input_contract as Record<string, unknown>;
    if (task.output_contract !== undefined) resolved.output_contract = task.output_contract as Record<string, unknown>;
    if (task.max_budget_usd !== undefined) resolved.max_budget_usd = task.max_budget_usd as number;
    if (task.driver !== undefined) resolved.driver = task.driver as string;
    if (task.model !== undefined) resolved.model = task.model as string;
    if (task.plugins !== undefined) resolved.plugins = task.plugins as string[];
    resolvedTasks[taskName] = resolved;
  }

  let hierarchical: HierarchicalFlow;
  try {
    hierarchical = resolveHierarchicalFlow(data, resolvedTasks);
  } catch (err: unknown) {
    if (err instanceof HierarchicalFlowError) {
      throw new WorkflowParseError(err.message, [{ path: '/', message: err.message }]);
    }
    throw err;
  }

  return {
    tasks: resolvedTasks,
    storyFlow: hierarchical.storyFlow,
    epicFlow: hierarchical.epicFlow,
    execution: hierarchical.execution,
    flow: hierarchical.storyFlow, // deprecated compat
  };
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
