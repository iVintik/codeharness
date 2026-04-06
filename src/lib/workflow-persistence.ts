/**
 * Workflow Persistence — XState snapshot save/load via getPersistedSnapshot().
 *
 * Primary persistence mechanism for the XState engine.
 * Saves XState persisted snapshots to .codeharness/workflow-snapshot.json.
 * Atomic writes (write .tmp → rename) prevent corrupt files on crash.
 * Config hash invalidates stale snapshots on workflow config changes.
 *
 * @see architecture-xstate-engine.md AD3: Persistence
 * @see tech-spec-migrate-engine-to-xstate.md Task 7
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';
import type { EngineConfig } from './workflow-types.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface XStateWorkflowSnapshot {
  /** XState getPersistedSnapshot() output — full serializable machine state. */
  snapshot: unknown;
  /** SHA-256 hash of the workflow config. Used to invalidate stale snapshots. */
  configHash: string;
  /** ISO 8601 timestamp when snapshot was saved. */
  savedAt: string;
}

/** @deprecated Use XStateWorkflowSnapshot. Kept for test compatibility. */
export type WorkflowSnapshot = XStateWorkflowSnapshot;

// ─── Constants ───────────────────────────────────────────────────────

const STATE_DIR = '.codeharness';
const SNAPSHOT_FILE = 'workflow-snapshot.json';
const OLD_YAML_FILE = 'workflow-state.yaml';

// ─── Config Hash ─────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash of the workflow configuration.
 *
 * The hash captures tasks, storyFlow, epicFlow, and execution settings.
 * Runtime-only fields (projectDir, abortSignal, onEvent, runId) are excluded.
 * Same config always produces the same hash; any task or flow change produces
 * a different hash so stale snapshots are invalidated on resume.
 */
export function computeConfigHash(config: EngineConfig): string {
  const stableJson = JSON.stringify(config.workflow, stableReplacer);
  return createHash('sha256').update(stableJson).digest('hex');
}

/** JSON replacer that sorts object keys for stable serialization. */
function stableReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

// ─── Save ────────────────────────────────────────────────────────────

/**
 * Save an XState persisted snapshot to disk atomically.
 *
 * Uses write-to-.tmp + rename to prevent partial writes from corrupting the
 * snapshot file on crash (POSIX rename is atomic).
 *
 * Called after each task completion, on interrupt, and on error.
 */
export function saveSnapshot(
  xstateSnapshot: unknown,
  configHash: string,
  projectDir?: string,
): void {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join(baseDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });

  const snapshotPath = join(stateDir, SNAPSHOT_FILE);
  const tmpPath = snapshotPath + '.tmp';

  const data: XStateWorkflowSnapshot = {
    snapshot: xstateSnapshot,
    configHash,
    savedAt: new Date().toISOString(),
  };

  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmpPath, snapshotPath);
}

// ─── Load ────────────────────────────────────────────────────────────

/**
 * Load a workflow snapshot from disk.
 *
 * Returns null if no snapshot exists, if the file is corrupt/truncated, or
 * if the shape is invalid. Logs a warning for corrupt files so operators can
 * diagnose problems.
 *
 * Detects old YAML state files and warns (fresh start required).
 */
export function loadSnapshot(projectDir?: string): XStateWorkflowSnapshot | null {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join(baseDir, STATE_DIR);
  const snapshotPath = join(stateDir, SNAPSHOT_FILE);
  const oldYamlPath = join(baseDir, STATE_DIR, OLD_YAML_FILE);

  // Clean up stale .tmp file from a previous interrupted write
  const tmpPath = snapshotPath + '.tmp';
  if (existsSync(tmpPath)) {
    try { unlinkSync(tmpPath); } catch { // IGNORE: stale .tmp cleanup is best-effort — a leftover .tmp file is harmless
    }
  }

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
  } catch { // IGNORE: unreadable file — treat as no snapshot
    warn('workflow-persistence: Could not read workflow-snapshot.json — invalid or corrupt file, starting fresh');
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch { // IGNORE: truncated/corrupt JSON — treat as no snapshot
    warn('workflow-persistence: corrupt workflow-snapshot.json (invalid JSON) — starting fresh');
    return null;
  }

  if (!isValidSnapshot(parsed)) {
    warn('workflow-persistence: invalid workflow-snapshot.json shape (missing required fields) — starting fresh');
    return null;
  }

  return parsed;
}

// ─── Clear ───────────────────────────────────────────────────────────

/**
 * Delete the snapshot file after successful workflow completion.
 *
 * Best-effort: a stale file on disk won't cause data loss.
 * Does NOT delete on error/halt/interrupt — the snapshot is preserved for
 * story 26-2 resume.
 */
export function clearSnapshot(projectDir?: string): void {
  const baseDir = projectDir ?? process.cwd();
  const snapshotPath = join(baseDir, STATE_DIR, SNAPSHOT_FILE);
  try {
    if (existsSync(snapshotPath)) {
      unlinkSync(snapshotPath);
    }
  } catch { // IGNORE: best-effort cleanup — stale file won't cause data loss
  }
}

// ─── Validation ──────────────────────────────────────────────────────

function isValidSnapshot(value: unknown): value is XStateWorkflowSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;

  if (!('snapshot' in s)) return false;
  if (typeof s.configHash !== 'string' || s.configHash.length === 0) return false;
  if (typeof s.savedAt !== 'string' || s.savedAt.length === 0) return false;

  return true;
}
