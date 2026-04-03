import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { parse } from 'yaml';
import { validateWorkflowSchema } from './schema-validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = resolve(__dirname, '../../templates/workflows');

// --- Interfaces ---

export interface ResolvedTask {
  agent: string;
  scope: 'per-story' | 'per-run';
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
function validateAndResolve(parsed: unknown): ResolvedWorkflow {
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
  const data = parsed as { tasks: Record<string, Record<string, unknown>>; flow: unknown[] };

  // Referential integrity check
  const taskNames = new Set(Object.keys(data.tasks));
  const danglingRefs: Array<{ path: string; message: string }> = [];

  for (let i = 0; i < data.flow.length; i++) {
    const step = data.flow[i];
    if (typeof step === 'string') {
      if (!taskNames.has(step)) {
        danglingRefs.push({
          path: `/flow/${i}`,
          message: `Task "${step}" referenced in flow but not defined in tasks`,
        });
      }
    } else if (typeof step === 'object' && step !== null && 'loop' in step) {
      const loopBlock = step as { loop: string[] };
      for (let j = 0; j < loopBlock.loop.length; j++) {
        const ref = loopBlock.loop[j];
        if (!taskNames.has(ref)) {
          danglingRefs.push({
            path: `/flow/${i}/loop/${j}`,
            message: `Task "${ref}" referenced in loop but not defined in tasks`,
          });
        }
      }
    }
  }

  if (danglingRefs.length > 0) {
    const details = danglingRefs.map((e) => e.message).join('; ');
    throw new WorkflowParseError(`Dangling task references: ${details}`, danglingRefs);
  }

  // Apply defaults and build resolved tasks
  const resolvedTasks: Record<string, ResolvedTask> = {};
  for (const [taskName, task] of Object.entries(data.tasks)) {
    const resolved: ResolvedTask = {
      agent: task.agent as string,
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

  // Build resolved flow
  const resolvedFlow: FlowStep[] = data.flow.map((step) => {
    if (typeof step === 'string') {
      return step;
    }
    return step as LoopBlock;
  });

  return { tasks: resolvedTasks, flow: resolvedFlow };
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
