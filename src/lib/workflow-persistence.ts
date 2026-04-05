/**
 * Workflow Persistence — XState-compatible snapshot save/load.
 *
 * Replaces workflow-state.ts as the primary persistence mechanism.
 * Saves JSON snapshots to .codeharness/workflow-state.json.
 * Detects old YAML state files and warns (fresh start required).
 *
 * @see tech-spec-migrate-engine-to-xstate.md Task 7
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';
import type { WorkflowState, EvaluatorScore } from './workflow-state.js';
import type { EngineError } from './workflow-machine.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface WorkflowSnapshot {
  /** The workflow state at save time. */
  workflowState: WorkflowState;
  /** Accumulated errors. */
  errors: EngineError[];
  /** Tasks completed count. */
  tasksCompleted: number;
  /** Stories processed count. */
  storiesProcessed: number;
  /** ISO timestamp when snapshot was saved. */
  savedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────

const STATE_DIR = '.codeharness';
const SNAPSHOT_FILE = 'workflow-state.json';
const OLD_YAML_FILE = 'workflow-state.yaml';

// ─── Functions ───────────────────────────────────────────────────────

/**
 * Save a workflow snapshot to disk.
 *
 * Called after each task completion, on interrupt, and on error.
 */
export function saveSnapshot(
  data: Omit<WorkflowSnapshot, 'savedAt'>,
  projectDir?: string,
): void {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join(baseDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });

  const snapshot: WorkflowSnapshot = {
    ...data,
    savedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(stateDir, SNAPSHOT_FILE),
    JSON.stringify(snapshot, null, 2),
    'utf-8',
  );
}

/**
 * Load a workflow snapshot from disk.
 *
 * Returns null if no snapshot exists. Detects old YAML state files
 * and warns that a fresh start is required.
 */
export function loadSnapshot(projectDir?: string): WorkflowSnapshot | null {
  const baseDir = projectDir ?? process.cwd();
  const snapshotPath = join(baseDir, STATE_DIR, SNAPSHOT_FILE);
  const oldYamlPath = join(baseDir, STATE_DIR, OLD_YAML_FILE);

  // Detect old YAML state file
  if (existsSync(oldYamlPath) && !existsSync(snapshotPath)) {
    warn('workflow-persistence: Found old workflow-state.yaml — this format is no longer supported. A fresh start is required. Delete .codeharness/workflow-state.yaml to proceed.');
  }

  if (!existsSync(snapshotPath)) {
    return null;
  }

  let raw: string;
  try {
    raw = readFileSync(snapshotPath, 'utf-8');
  } catch { // IGNORE: snapshot file unreadable — treat as no snapshot
    warn('workflow-persistence: Could not read workflow-state.json — returning null');
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch { // IGNORE: snapshot file contains invalid JSON — treat as no snapshot
    warn('workflow-persistence: Invalid JSON in workflow-state.json — returning null');
    return null;
  }

  if (!isValidSnapshot(parsed)) {
    warn('workflow-persistence: Invalid snapshot shape — returning null');
    return null;
  }

  return parsed;
}

/**
 * Delete the snapshot file (used after successful completion).
 */
export function clearSnapshot(projectDir?: string): void {
  const baseDir = projectDir ?? process.cwd();
  const snapshotPath = join(baseDir, STATE_DIR, SNAPSHOT_FILE);
  try {
    if (existsSync(snapshotPath)) {
      unlinkSync(snapshotPath);
    }
  } catch { // IGNORE: snapshot deletion is best-effort — stale file won't cause data loss
    // best-effort cleanup
  }
}

// ─── Validation ──────────────────────────────────────────────────────

function isValidSnapshot(value: unknown): value is WorkflowSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;

  if (!s.workflowState || typeof s.workflowState !== 'object') return false;
  if (!Array.isArray(s.errors)) return false;
  if (typeof s.tasksCompleted !== 'number') return false;
  if (typeof s.storiesProcessed !== 'number') return false;
  if (typeof s.savedAt !== 'string') return false;

  return true;
}
