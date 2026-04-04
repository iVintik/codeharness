import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { validateWorkflowSchema } from './schema-validate.js';
import { listDrivers } from './agents/drivers/factory.js';
import { listEmbeddedAgents, resolveAgent, AgentResolveError } from './agent-resolver.js';
import {
  resolveHierarchicalFlow,
  HierarchicalFlowError,
  BUILTIN_EPIC_FLOW_TASKS,
  type ExecutionConfig,
  type HierarchicalFlow,
} from './hierarchical-flow.js';

// Re-export hierarchical flow types for consumers
export type { ExecutionConfig, HierarchicalFlow } from './hierarchical-flow.js';
export { BUILTIN_EPIC_FLOW_TASKS } from './hierarchical-flow.js';

import { getPackageRoot } from './templates.js';

const TEMPLATES_DIR = resolve(getPackageRoot(), 'templates/workflows');

// --- Interfaces ---

export interface ResolvedTask {
  agent: string | null;
  scope: 'per-story' | 'per-run' | 'per-epic';
  session: 'fresh' | 'continue';
  source_access: boolean;
  prompt_template?: string;
  input_contract?: Record<string, unknown>;
  output_contract?: Record<string, unknown>;
  max_budget_usd?: number;
  driver?: string;
  model?: string;
  plugins?: string[];
}

export interface LoopBlock {
  loop: string[];
}

export type FlowStep = string | LoopBlock;

export interface ResolvedWorkflow {
  tasks: Record<string, ResolvedTask>;
  flow: FlowStep[];
  /** Execution configuration (parallel, isolation, merge strategy). */
  execution: ExecutionConfig;
  /** Story-level flow steps (normalized from `flow` or `story_flow`). */
  storyFlow: FlowStep[];
  /** Epic-level flow steps (empty if not defined). */
  epicFlow: FlowStep[];
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

// --- Referential Integrity Validation ---

/**
 * Validate that driver and agent references in tasks point to real registered
 * drivers and resolvable agents. Collects errors into the provided array
 * (does not throw — caller decides when to throw).
 *
 * Driver validation is skipped when the driver registry is empty (parse can
 * be called independently of engine startup).
 *
 * Agent validation tries resolveAgent() first (covers embedded, user-level,
 * and project-level agents). Distinguishes between "not found" errors and
 * other failures (corrupt YAML, schema errors) to provide accurate messages.
 */
function validateReferentialIntegrity(
  data: { tasks: Record<string, Record<string, unknown>> },
  errors: Array<{ path: string; message: string }>,
): void {
  // Driver validation — only when registry is populated
  const registeredDrivers = listDrivers();
  const driverRegistryPopulated = registeredDrivers.length > 0;

  // Agent list for error messages
  const embeddedAgents = listEmbeddedAgents();

  for (const [taskName, task] of Object.entries(data.tasks)) {
    // Validate driver field if present
    if (task.driver !== undefined && typeof task.driver === 'string' && driverRegistryPopulated) {
      if (!registeredDrivers.includes(task.driver)) {
        errors.push({
          path: `/tasks/${taskName}/driver`,
          message: `Driver "${task.driver}" not found in task "${taskName}". Registered drivers: ${registeredDrivers.join(', ')}`,
        });
      }
    }

    // Validate agent field if present (skip null agents — engine-handled tasks)
    if (task.agent !== undefined && task.agent !== null && typeof task.agent === 'string') {
      try {
        resolveAgent(task.agent);
      } catch (err: unknown) {
        // Distinguish "not found" from "found but broken" (corrupt YAML, schema errors)
        if (err instanceof AgentResolveError && err.message.startsWith('Embedded agent not found:')) {
          const available = embeddedAgents.length > 0 ? embeddedAgents.join(', ') : '(none)';
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" not found in task "${taskName}". Available agents: ${available}`,
          });
        } else if (err instanceof AgentResolveError) {
          // Agent exists but is broken (corrupt YAML, schema validation failure, etc.)
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${err.message}`,
          });
        } else {
          // Unexpected error — still report it instead of silently swallowing
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

// --- Shared Validation & Resolution ---

/**
 * Validate parsed YAML against JSON schema, check referential integrity,
 * apply defaults, and return a typed ResolvedWorkflow.
 * Shared between parseWorkflow (direct file) and resolveWorkflow (patch chain).
 */
function validateAndResolve(parsed: unknown): ResolvedWorkflow {
  // Pre-schema validation: at least one of flow or story_flow must be present
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

  // Validate against JSON schema
  const result = validateWorkflowSchema(parsed);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new WorkflowParseError(
      `Schema validation failed: ${details}`,
      result.errors.map((e) => ({ path: e.path, message: e.message })),
    );
  }

  // At this point, parsed has passed schema validation — safe to cast
  const data = parsed as Record<string, unknown> & {
    tasks: Record<string, Record<string, unknown>>;
    flow?: unknown[];
    story_flow?: unknown[];
    epic_flow?: unknown[];
    execution?: Record<string, unknown>;
  };

  // Check for flow/story_flow coexistence (before referential integrity)
  const hasFlow = 'flow' in data && data.flow !== undefined;
  const hasStoryFlow = 'story_flow' in data && data.story_flow !== undefined;
  if (hasFlow && hasStoryFlow) {
    throw new WorkflowParseError(
      'Workflow cannot have both "flow" and "story_flow" — use "story_flow" for hierarchical workflows or "flow" for legacy mode',
      [{ path: '/', message: 'Cannot have both "flow" and "story_flow"' }],
    );
  }

  // Determine the effective story flow for referential integrity checks
  const effectiveStoryFlow: unknown[] = (hasStoryFlow ? data.story_flow : data.flow) ?? [];
  const effectiveEpicFlow: unknown[] = data.epic_flow ?? [];

  // Referential integrity check — collect all errors before throwing
  const taskNames = new Set(Object.keys(data.tasks));
  const allErrors: Array<{ path: string; message: string }> = [];

  // 1. Story flow (or legacy flow) task reference validation
  const storyFlowLabel = hasStoryFlow ? 'story_flow' : 'flow';
  validateFlowReferences(effectiveStoryFlow, taskNames, storyFlowLabel, allErrors, false);

  // 2. Epic flow task reference validation (with built-in whitelist)
  if (effectiveEpicFlow.length > 0) {
    validateFlowReferences(effectiveEpicFlow, taskNames, 'epic_flow', allErrors, true);
  }

  // 3. Driver and agent referential integrity check
  validateReferentialIntegrity(data, allErrors);

  if (allErrors.length > 0) {
    const details = allErrors.map((e) => e.message).join('; ');
    throw new WorkflowParseError(`Referential integrity errors: ${details}`, allErrors);
  }

  // Apply defaults and build resolved tasks
  const resolvedTasks: Record<string, ResolvedTask> = {};
  for (const [taskName, task] of Object.entries(data.tasks)) {
    const resolved: ResolvedTask = {
      agent: task.agent as string | null,
      scope: (task.scope as ResolvedTask['scope']) ?? 'per-story',
      session: (task.session as ResolvedTask['session']) ?? 'fresh',
      source_access: (task.source_access as boolean) ?? true,
    };
    if (task.prompt_template !== undefined) {
      resolved.prompt_template = task.prompt_template as string;
    }
    if (task.input_contract !== undefined) {
      resolved.input_contract = task.input_contract as Record<string, unknown>;
    }
    if (task.output_contract !== undefined) {
      resolved.output_contract = task.output_contract as Record<string, unknown>;
    }
    if (task.max_budget_usd !== undefined) {
      resolved.max_budget_usd = task.max_budget_usd as number;
    }
    if (task.driver !== undefined) {
      resolved.driver = task.driver as string;
    }
    if (task.model !== undefined) {
      resolved.model = task.model as string;
    }
    if (task.plugins !== undefined) {
      resolved.plugins = task.plugins as string[];
    }
    resolvedTasks[taskName] = resolved;
  }

  // Resolve hierarchical flow
  let hierarchical: HierarchicalFlow;
  try {
    hierarchical = resolveHierarchicalFlow(data, resolvedTasks);
  } catch (err: unknown) {
    if (err instanceof HierarchicalFlowError) {
      throw new WorkflowParseError(err.message, [{ path: '/', message: err.message }]);
    }
    throw err;
  }

  // Build resolved flow for backward compat (storyFlow is the primary flow)
  const resolvedFlow: FlowStep[] = hierarchical.storyFlow;

  return {
    tasks: resolvedTasks,
    flow: resolvedFlow,
    execution: hierarchical.execution,
    storyFlow: hierarchical.storyFlow,
    epicFlow: hierarchical.epicFlow,
  };
}

// --- Flow Reference Validation ---

/**
 * Validate that all task references in a flow array point to defined tasks.
 * When `allowBuiltins` is true, built-in epic flow task names are also accepted.
 */
function validateFlowReferences(
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

// --- Parser ---

/**
 * Parse a workflow YAML file from disk, validate it against the JSON schema,
 * check referential integrity, apply defaults, and return a typed ResolvedWorkflow.
 */
export function parseWorkflow(filePath: string): ResolvedWorkflow {
  // 1. Read file
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

  // 2. Parse YAML
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const yamlMsg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML syntax: ${yamlMsg}`, [
      { path: filePath, message: yamlMsg },
    ]);
  }

  return validateAndResolve(parsed);
}

// --- Patch Interfaces ---

/**
 * Patch file structure for workflow customization.
 * `extends` identifies the base, `overrides` are deep-merged, `replace` sections wholly overwrite.
 */
export interface WorkflowPatch {
  extends?: string;
  overrides?: Record<string, unknown>;
  replace?: Record<string, unknown>;
}

// --- Deep Merge ---

/**
 * Deep merge strategy: objects merge recursively, arrays replace, scalars replace.
 * Same semantics as agent-resolver deepMerge.
 */
function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const key of Object.keys(patch)) {
    const baseVal = base[key];
    const patchVal = patch[key];

    if (
      patchVal !== null &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        patchVal as Record<string, unknown>,
      );
    } else {
      result[key] = patchVal;
    }
  }

  return result;
}

// --- Patch Loading ---

/**
 * Load a workflow patch file. Returns null if the file does not exist (silent skip).
 * Throws WorkflowParseError on malformed YAML.
 */
export function loadWorkflowPatch(filePath: string): WorkflowPatch | null {
  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === 'ENOENT') {
      return null; // File disappeared between existsSync and readFileSync — treat as missing
    }
    const detail = code === 'EACCES' ? 'Permission denied' : 'File unreadable';
    throw new WorkflowParseError(`${detail}: ${filePath}`, [
      { path: filePath, message: detail },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML in patch file ${filePath}: ${msg}`, [
      { path: filePath, message: msg },
    ]);
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new WorkflowParseError(`Patch file is not a valid object: ${filePath}`, [
      { path: filePath, message: 'Patch must be a YAML object' },
    ]);
  }

  return parsed as WorkflowPatch;
}

// --- Patch Merging ---

/**
 * Merge a workflow patch onto a base config.
 * Deep-merges `overrides`, then applies `replace` sections as full overwrites.
 */
export function mergeWorkflowPatch(
  base: Record<string, unknown>,
  patch: WorkflowPatch,
): Record<string, unknown> {
  let result = { ...base };

  // Deep-merge overrides
  if (patch.overrides) {
    result = deepMerge(result, patch.overrides);
  }

  // Full replacement for replace sections
  if (patch.replace) {
    for (const key of Object.keys(patch.replace)) {
      result[key] = patch.replace[key];
    }
  }

  return result;
}

// --- Main Resolution ---

/**
 * Resolve a workflow through the embedded -> user -> project patch chain.
 *
 * 1. Load embedded workflow from templates/workflows/{name}.yaml
 * 2. Apply user-level patch from ~/.codeharness/workflows/{name}.patch.yaml (if exists)
 * 3. Apply project-level patch from .codeharness/workflows/{name}.patch.yaml (if exists)
 * 4. Validate merged result against JSON schema + referential integrity
 * 5. Apply defaults and return ResolvedWorkflow
 *
 * If a full custom workflow (no patch, no extends) exists at project level, it is loaded directly.
 */
export function resolveWorkflow(options?: { cwd?: string; name?: string }): ResolvedWorkflow {
  const cwd = options?.cwd ?? process.cwd();
  const name = options?.name ?? 'default';

  const userPatchPath = join(os.homedir(), '.codeharness', 'workflows', `${name}.patch.yaml`);
  const projectPatchPath = join(cwd, '.codeharness', 'workflows', `${name}.patch.yaml`);

  // Check for full custom workflow at project level (not a patch — no extends)
  const projectCustomPath = join(cwd, '.codeharness', 'workflows', `${name}.yaml`);
  if (existsSync(projectCustomPath)) {
    const customPatch = loadWorkflowPatch(projectCustomPath);
    if (customPatch && !customPatch.extends) {
      // This is a full custom workflow, not a patch — parse directly
      return parseWorkflow(projectCustomPath);
    }
  }

  // Load embedded base
  const embeddedPath = join(TEMPLATES_DIR, `${name}.yaml`);
  let raw: string;
  try {
    raw = readFileSync(embeddedPath, 'utf-8');
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : `File not found: ${embeddedPath}`;
    throw new WorkflowParseError(`Embedded workflow not found: ${name}`, [
      { path: embeddedPath, message: detail },
    ]);
  }

  let baseData: unknown;
  try {
    baseData = parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML in embedded workflow ${name}: ${msg}`, [
      { path: embeddedPath, message: msg },
    ]);
  }

  let merged = baseData as Record<string, unknown>;

  // Apply user-level patch
  const userPatch = loadWorkflowPatch(userPatchPath);
  if (userPatch) {
    merged = mergeWorkflowPatch(merged, userPatch);
  }

  // Apply project-level patch
  const projectPatch = loadWorkflowPatch(projectPatchPath);
  if (projectPatch) {
    merged = mergeWorkflowPatch(merged, projectPatch);
  }

  // Validate, check referential integrity, apply defaults, and return
  return validateAndResolve(merged);
}
