import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { warn } from './output.js';
import type { WorkflowState } from './workflow-types.js';

// Re-export canonical types so existing imports from workflow-state.ts continue to work.
export type { TaskCheckpoint, WorkflowState } from './workflow-types.js';

// --- Interfaces ---

export interface EvaluatorScore {
  iteration: number;
  passed: number;
  failed: number;
  unknown: number;
  total: number;
  timestamp: string;
}

export interface CircuitBreakerState {
  triggered: boolean;
  reason: string | null;
  score_history: number[];
}

// --- Constants ---

const STATE_DIR = '.codeharness';
const STATE_FILE = 'workflow-state.yaml';

// --- Functions ---

export function getDefaultWorkflowState(): WorkflowState {
  return {
    workflow_name: '',
    started: '',
    iteration: 0,
    phase: 'idle',
    tasks_completed: [],
    evaluator_scores: [],
    circuit_breaker: {
      triggered: false,
      reason: null,
      score_history: [],
    },
    trace_ids: [],
  };
}

export function writeWorkflowState(state: WorkflowState, dir?: string): void {
  const baseDir = dir ?? process.cwd();
  const stateDir = join(baseDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  const yamlContent = stringify(state, { nullStr: 'null' });
  writeFileSync(join(stateDir, STATE_FILE), yamlContent, 'utf-8');
}

export function readWorkflowState(dir?: string): WorkflowState {
  const baseDir = dir ?? process.cwd();
  const filePath = join(baseDir, STATE_DIR, STATE_FILE);

  if (!existsSync(filePath)) {
    return getDefaultWorkflowState();
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch { // IGNORE: unreadable file (permissions, EISDIR, etc.) — recover with defaults
    warn('workflow-state.yaml could not be read — returning default state');
    return getDefaultWorkflowState();
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch { // IGNORE: corrupted YAML — recover with defaults
    warn('workflow-state.yaml contains invalid YAML — returning default state');
    return getDefaultWorkflowState();
  }

  if (!isValidWorkflowState(parsed)) {
    warn('workflow-state.yaml has invalid shape — returning default state');
    return getDefaultWorkflowState();
  }

  return parsed;
}

// --- Validation ---

function isValidWorkflowState(value: unknown): value is WorkflowState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;

  if (typeof s.workflow_name !== 'string') return false;
  if (typeof s.started !== 'string') return false;
  if (typeof s.iteration !== 'number') return false;
  if (typeof s.phase !== 'string') return false;
  if (!Array.isArray(s.tasks_completed)) return false;
  if (!Array.isArray(s.evaluator_scores)) return false;
  if (!s.circuit_breaker || typeof s.circuit_breaker !== 'object') return false;

  // Validate trace_ids (optional array of strings)
  if (s.trace_ids !== undefined) {
    if (!Array.isArray(s.trace_ids)) return false;
    for (const id of s.trace_ids) {
      if (typeof id !== 'string') return false;
    }
  }

  // Validate tasks_completed element shapes
  for (const t of s.tasks_completed) {
    if (!t || typeof t !== 'object') return false;
    const tc = t as Record<string, unknown>;
    if (typeof tc.task_name !== 'string') return false;
    if (typeof tc.story_key !== 'string') return false;
    if (typeof tc.completed_at !== 'string') return false;
    if (tc.session_id !== undefined && typeof tc.session_id !== 'string') return false;
    if (tc.error !== undefined && typeof tc.error !== 'boolean') return false;
  }

  // Validate evaluator_scores element shapes
  for (const e of s.evaluator_scores) {
    if (!e || typeof e !== 'object') return false;
    const es = e as Record<string, unknown>;
    if (typeof es.iteration !== 'number') return false;
    if (typeof es.passed !== 'number') return false;
    if (typeof es.failed !== 'number') return false;
    if (typeof es.unknown !== 'number') return false;
    if (typeof es.total !== 'number') return false;
    if (typeof es.timestamp !== 'string') return false;
  }

  const cb = s.circuit_breaker as Record<string, unknown>;
  if (typeof cb.triggered !== 'boolean') return false;
  if (cb.reason !== null && typeof cb.reason !== 'string') return false;
  if (!Array.isArray(cb.score_history)) return false;

  // Validate score_history elements are numbers
  for (const score of cb.score_history) {
    if (typeof score !== 'number') return false;
  }

  return true;
}
