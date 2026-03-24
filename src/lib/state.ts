import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { warn } from './output.js';
import { detectStack, detectStacks, type StackName } from './stacks/index.js';

export interface HarnessState {
  harness_version: string;
  initialized: boolean;
  stack: string | null;
  stacks: StackName[];
  app_type?: 'server' | 'cli' | 'web' | 'agent' | 'generic';
  enforcement: {
    frontend: boolean;
    database: boolean;
    api: boolean;
  };
  coverage: {
    target: number;
    baseline: number | null;
    current: number | null;
    tool: 'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown';
    /** Per-stack coverage tools map (stack name -> tool) for multi-stack projects */
    tools?: Record<string, string>;
  };
  session_flags: {
    logs_queried: boolean;
    tests_passed: boolean;
    coverage_met: boolean;
    verification_run: boolean;
  };
  verification_log: string[];
  otlp?: {
    enabled: boolean;
    endpoint: string;
    service_name: string;
    mode: 'local-shared' | 'remote-direct' | 'remote-routed';
    node_require?: string;
    python_wrapper?: string;
    cli_env_vars?: Record<string, string>;
    web_snippet_path?: string;
    resource_attributes?: string;
    agent_sdk?: string;
    rust_env_hint?: string;
  };
  retro_issue_targets?: Array<{ repo: string; labels: string[] }>;
  docker?: {
    compose_file: string;
    stack_running: boolean;
    remote_endpoints?: {
      logs_url?: string;
      metrics_url?: string;
      traces_url?: string;
    };
    ports: {
      logs: number;
      metrics: number;
      traces: number;
      otel_grpc: number;
      otel_http: number;
    };
  };
}

function migrateState(state: HarnessState): HarnessState {
  const raw = state as Record<string, unknown>;

  // New format: stacks array already present
  if (Array.isArray(raw.stacks) && raw.stacks.length > 0) {
    state.stacks = raw.stacks as StackName[];
    state.stack = state.stacks[0] ?? null;
    return state;
  }

  // Old format: has stack string but no stacks array
  if (typeof raw.stack === 'string' && raw.stack) {
    state.stacks = [raw.stack as StackName];
    return state;
  }

  // Neither present
  state.stacks = [];
  state.stack = null;
  return state;
}

const STATE_DIR = '.claude';
const STATE_FILE = 'codeharness.local.md';
const DEFAULT_BODY = '\n# Codeharness State\n\nThis file is managed by the codeharness CLI. Do not edit manually.\n';

/** Default coverage tool names keyed by stack. */
const COVERAGE_TOOL_DEFAULTS: Record<string, HarnessState['coverage']['tool']> = {
  python: 'coverage.py',
  rust: 'cargo-tarpaulin',
};

export function getDefaultCoverageTool(stack?: string | null): HarnessState['coverage']['tool'] {
  if (stack && COVERAGE_TOOL_DEFAULTS[stack]) return COVERAGE_TOOL_DEFAULTS[stack];
  return 'c8';
}

export function getDefaultState(stack?: string | null): HarnessState {
  return {
    harness_version: '0.1.0',
    initialized: false,
    stack: stack ?? null,
    stacks: stack ? [stack as StackName] : [],
    enforcement: {
      frontend: true,
      database: true,
      api: true,
    },
    coverage: {
      target: 90,
      baseline: null,
      current: null,
      tool: getDefaultCoverageTool(stack),
    },
    session_flags: {
      logs_queried: false,
      tests_passed: false,
      coverage_met: false,
      verification_run: false,
    },
    verification_log: [],
  };
}

export function getStatePath(dir: string): string {
  return join(dir, STATE_DIR, STATE_FILE);
}

export function writeState(state: HarnessState, dir?: string, body?: string): void {
  const baseDir = dir ?? process.cwd();
  const claudeDir = join(baseDir, STATE_DIR);
  mkdirSync(claudeDir, { recursive: true });

  // Sync stack from stacks[0] for backward compat (shallow copy to avoid mutating caller's object)
  const toWrite = { ...state };
  if (toWrite.stacks && toWrite.stacks.length > 0) {
    toWrite.stack = toWrite.stacks[0];
  }

  const yamlContent = stringify(toWrite, { nullStr: 'null' });
  const markdownBody = body ?? DEFAULT_BODY;
  const fileContent = `---\n${yamlContent}---\n${markdownBody}`;

  writeFileSync(join(claudeDir, STATE_FILE), fileContent, 'utf-8');
}

export function readState(dir?: string): HarnessState {
  const baseDir = dir ?? process.cwd();
  const filePath = getStatePath(baseDir);

  if (!existsSync(filePath)) {
    throw new StateFileNotFoundError();
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parts = raw.split('---');

  // parts[0] is empty (before first ---), parts[1] is YAML, rest is body
  if (parts.length < 3) {
    return recoverCorruptedState(baseDir);
  }

  try {
    const state = parse(parts[1]) as HarnessState;
    if (!isValidState(state)) {
      return recoverCorruptedState(baseDir);
    }
    return migrateState(state);
  } catch {
    return recoverCorruptedState(baseDir);
  }
}

export function readStateWithBody(dir?: string): { state: HarnessState; body: string } {
  const baseDir = dir ?? process.cwd();
  const filePath = getStatePath(baseDir);

  if (!existsSync(filePath)) {
    throw new StateFileNotFoundError();
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parts = raw.split('---');

  if (parts.length < 3) {
    const state = recoverCorruptedState(baseDir);
    return { state, body: DEFAULT_BODY };
  }

  try {
    const state = parse(parts[1]) as HarnessState;
    if (!isValidState(state)) {
      const recovered = recoverCorruptedState(baseDir);
      return { state: recovered, body: DEFAULT_BODY };
    }
    // Everything after the second --- is the body
    const body = parts.slice(2).join('---');
    return { state: migrateState(state), body: body || DEFAULT_BODY };
  } catch {
    const state = recoverCorruptedState(baseDir);
    return { state, body: DEFAULT_BODY };
  }
}

function isValidState(state: unknown): state is HarnessState {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  if (typeof s.harness_version !== 'string') return false;
  if (typeof s.initialized !== 'boolean') return false;
  if (s.stack !== null && typeof s.stack !== 'string') return false;
  if (!s.enforcement || typeof s.enforcement !== 'object') return false;
  if (!s.coverage || typeof s.coverage !== 'object') return false;
  if (!s.session_flags || typeof s.session_flags !== 'object') return false;
  if (!Array.isArray(s.verification_log)) return false;
  // Accept old format (no stacks) and new format (stacks is array of strings)
  if (s.stacks !== undefined && !Array.isArray(s.stacks)) return false;
  if (Array.isArray(s.stacks) && s.stacks.some((v: unknown) => typeof v !== 'string')) return false;
  return true;
}

function recoverCorruptedState(dir: string): HarnessState {
  warn('State file corrupted — recreating from detected config');
  const stack = detectStack(dir);
  const allStacks = detectStacks(dir);
  const state = getDefaultState(stack);
  // Dedupe: detectStacks may return same stack from multiple dirs
  const uniqueStackNames = [...new Set(allStacks.map(s => s.stack))];
  state.stacks = uniqueStackNames;
  // Sync stack from stacks[0] if stacks were detected but root stack was null
  if (state.stack === null && uniqueStackNames.length > 0) {
    state.stack = uniqueStackNames[0];
  }
  writeState(state, dir);
  return state;
}

export class StateFileNotFoundError extends Error {
  constructor() {
    super('No state file found. Run \'codeharness init\' first.');
    this.name = 'StateFileNotFoundError';
  }
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validateKeyPath(keyPath: string): void {
  const keys = keyPath.split('.');
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`Invalid key path: '${key}' is not allowed`);
    }
  }
}

export function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  validateKeyPath(keyPath);
  const keys = keyPath.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function setNestedValue(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  validateKeyPath(keyPath);
  const keys = keyPath.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

export function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== '') return num;
  return raw;
}
