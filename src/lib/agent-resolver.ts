import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';

import { validateAgentSchema } from './schema-validate.js';
import { getPackageRoot } from './templates.js';

// --- Interfaces ---

/**
 * Agent config shape matching agent.schema.json, plus optional prompt_patches
 * accumulated from patch files.
 */
export interface ResolvedAgent {
  name: string;
  role: {
    title: string;
    purpose: string;
  };
  persona: {
    identity: string;
    communication_style: string;
    principles: string[];
  };
  personality?: {
    traits: Record<string, number>;
  };
  disallowedTools?: string[];
  plugins?: string[];
  prompt_patches?: {
    append?: string;
  };
  prompt_template?: string;
}

/**
 * Compiled subagent definition ready for Agent SDK dispatch.
 */
export interface SubagentDefinition {
  name: string;
  model: string;
  instructions: string;
  disallowedTools: string[];
  plugins?: readonly string[];
  bare: true;
}

/**
 * Patch file structure: extends identifies base, overrides deep-merged,
 * prompt_patches preserved separately.
 */
export interface AgentPatch {
  extends?: string;
  overrides?: Record<string, unknown>;
  prompt_patches?: {
    append?: string;
  };
}

// --- Error Class ---

export class AgentResolveError extends Error {
  public readonly filePath: string;
  public readonly errors: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    filePath: string,
    errors?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'AgentResolveError';
    this.filePath = filePath;
    this.errors = errors ?? [];
  }
}

// --- Constants ---

const TEMPLATES_DIR = resolve(getPackageRoot(), 'templates/agents');
// --- Input Validation ---

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate agent name to prevent path traversal and unexpected characters.
 */
function validateName(name: string): void {
  if (!name || !SAFE_NAME_RE.test(name)) {
    throw new AgentResolveError(
      `Invalid agent name: "${name}" — must match ${SAFE_NAME_RE}`,
      '',
      [{ path: '', message: `Invalid agent name: ${name}` }],
    );
  }
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

// --- Embedded Agent Loading ---

/**
 * Load an embedded agent template from templates/agents/{name}.yaml.
 * Throws AgentResolveError if not found or invalid.
 */
export function loadEmbeddedAgent(name: string): ResolvedAgent {
  validateName(name);
  const filePath = join(TEMPLATES_DIR, `${name}.yaml`);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch { // IGNORE: rethrow as AgentResolveError with context
    throw new AgentResolveError(
      `Embedded agent not found: ${name}`,
      filePath,
      [{ path: filePath, message: `File not found: ${filePath}` }],
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentResolveError(
      `Invalid YAML in embedded agent ${name}: ${msg}`,
      filePath,
      [{ path: filePath, message: msg }],
    );
  }

  const result = validateAgentSchema(parsed);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new AgentResolveError(
      `Schema validation failed for embedded agent ${name}: ${details}`,
      filePath,
      result.errors.map((e) => ({ path: e.path, message: e.message })),
    );
  }

  return parsed as ResolvedAgent;
}

// --- Embedded Agent Listing ---

/**
 * List all embedded agent template names (filenames without .yaml extension).
 * Returns a sorted array of available agent names.
 */
export function listEmbeddedAgents(): string[] {
  try {
    const files = readdirSync(TEMPLATES_DIR);
    return files
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => f.replace(/\.yaml$/, ''))
      .sort();
  } catch { // IGNORE: directory unreadable — return empty list
    return [];
  }
}

// --- Patch Loading ---

/**
 * Load a patch file. Returns null if the file does not exist (silent skip).
 * Throws AgentResolveError on malformed YAML.
 */
export function loadPatch(filePath: string): AgentPatch | null {
  if (!existsSync(filePath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch { // IGNORE: file unreadable — treat as missing patch
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AgentResolveError(
      `Invalid YAML in patch file: ${msg}`,
      filePath,
      [{ path: filePath, message: msg }],
    );
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new AgentResolveError(
      `Patch file is not a valid object`,
      filePath,
      [{ path: filePath, message: 'Patch must be a YAML object' }],
    );
  }

  return parsed as AgentPatch;
}

// --- Patch Merging ---

/**
 * Merge a patch onto a base config. Deep-merges overrides, preserves prompt_patches separately.
 */
export function mergePatch(
  base: Record<string, unknown>,
  patch: AgentPatch,
): Record<string, unknown> {
  let result = { ...base };

  if (patch.overrides) {
    result = deepMerge(result, patch.overrides);
  }

  if (patch.prompt_patches) {
    const existing = result.prompt_patches as { append?: string } | undefined;
    const existingAppend = existing?.append ?? '';
    const newAppend = patch.prompt_patches.append ?? '';

    if (newAppend) {
      result.prompt_patches = {
        append: existingAppend ? `${existingAppend}\n${newAppend}` : newAppend,
      };
    }
  }

  return result;
}

// --- Main Resolution ---

/**
 * Resolve an agent through the embedded -> user -> project patch chain.
 * For custom agents (no embedded match, found at project/user level without extends), loads directly.
 */
export function resolveAgent(name: string, options?: { cwd?: string }): ResolvedAgent {
  validateName(name);
  const cwd = options?.cwd ?? process.cwd();
  const userPatchPath = join(os.homedir(), '.codeharness', 'agents', `${name}.patch.yaml`);
  const projectPatchPath = join(cwd, '.codeharness', 'agents', `${name}.patch.yaml`);

  // Check for custom agent (project-level full config, no extends)
  const projectCustomPath = join(cwd, '.codeharness', 'agents', `${name}.yaml`);
  const userCustomPath = join(os.homedir(), '.codeharness', 'agents', `${name}.yaml`);

  // Try custom agent at project level first, then user level
  for (const customPath of [projectCustomPath, userCustomPath]) {
    if (existsSync(customPath)) {
      const patch = loadPatch(customPath);
      if (patch && !patch.extends) {
        // This is a full custom agent, not a patch — load and validate directly
        const parsed = patch as unknown as Record<string, unknown>;
        // Strip prompt_patches before schema validation (not in schema, same as patch path)
        const { prompt_patches: customPP, ...customForValidation } = parsed as Record<string, unknown> & { prompt_patches?: unknown };
        const result = validateAgentSchema(customForValidation);
        if (!result.valid) {
          const details = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
          throw new AgentResolveError(
            `Schema validation failed for custom agent ${name}: ${details}`,
            customPath,
            result.errors.map((e) => ({ path: e.path, message: e.message })),
          );
        }
        return (customPP ? { ...customForValidation, prompt_patches: customPP } : customForValidation) as unknown as ResolvedAgent;
      }
    }
  }

  // Load embedded base
  const base = loadEmbeddedAgent(name);
  let merged: Record<string, unknown> = base as unknown as Record<string, unknown>;

  // Apply user patch
  const userPatch = loadPatch(userPatchPath);
  if (userPatch) {
    merged = mergePatch(merged, userPatch);
  }

  // Apply project patch
  const projectPatch = loadPatch(projectPatchPath);
  if (projectPatch) {
    merged = mergePatch(merged, projectPatch);
  }

  // Validate merged result (strip prompt_patches for schema validation since it's not in schema)
  const { prompt_patches, ...forValidation } = merged as Record<string, unknown> & { prompt_patches?: unknown };
  const result = validateAgentSchema(forValidation);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    const errorPath = projectPatch ? projectPatchPath : userPatch ? userPatchPath : 'merged';
    throw new AgentResolveError(
      `Schema validation failed after merging patches for ${name}: ${details}`,
      errorPath,
      result.errors.map((e) => ({ path: e.path, message: e.message })),
    );
  }

  // Re-attach prompt_patches if present, return without mutating forValidation
  return (prompt_patches
    ? { ...forValidation, prompt_patches }
    : forValidation) as unknown as ResolvedAgent;
}

// --- Subagent Compilation ---

/**
 * Compile a ResolvedAgent into a SubagentDefinition for Agent SDK dispatch.
 * Note: model is not set here - it comes from task config or driver default via resolveModel().
 */
export function compileSubagentDefinition(agent: ResolvedAgent): SubagentDefinition {
  const parts: string[] = [];

  parts.push(`You are ${agent.persona.identity}`);
  parts.push(`Communication style: ${agent.persona.communication_style}`);

  if (agent.persona.principles.length > 0) {
    const bullets = agent.persona.principles.map((p) => `- ${p}`).join('\n');
    parts.push(`Principles:\n${bullets}`);
  }

  if (agent.prompt_patches?.append) {
    parts.push(agent.prompt_patches.append);
  }

  if (agent.prompt_template) {
    parts.push(agent.prompt_template);
  }

  return {
    name: agent.name,
    model: '', // Intentionally empty - resolved at dispatch time via resolveModel()
    instructions: parts.join('\n\n'),
    disallowedTools: agent.disallowedTools ?? [],
    ...(agent.plugins?.length ? { plugins: agent.plugins } : {}),
    bare: true,
  };
}
