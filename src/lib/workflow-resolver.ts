/** Workflow patch loading, merging, and resolution through the embedded→user→project chain. */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { getPackageRoot } from './templates.js';
import { parseWorkflow, parseWorkflowData, WorkflowParseError, type ResolvedWorkflow } from './workflow-parser.js';

const TEMPLATES_DIR = resolve(getPackageRoot(), 'templates/workflows');

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

  if (patch.overrides) {
    result = deepMerge(result, patch.overrides);
  }

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

  const userPatch = loadWorkflowPatch(userPatchPath);
  if (userPatch) {
    merged = mergeWorkflowPatch(merged, userPatch);
  }

  const projectPatch = loadWorkflowPatch(projectPatchPath);
  if (projectPatch) {
    merged = mergeWorkflowPatch(merged, projectPatch);
  }

  return parseWorkflowData(merged);
}
