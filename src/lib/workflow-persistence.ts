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
export { appendCheckpoint, clearCheckpointLog, loadCheckpointLog } from './workflow-checkpoint-log.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface XStateWorkflowSnapshot {
  /** XState getPersistedSnapshot() output — full serializable machine state. */
  snapshot: unknown;
  /** SHA-256 hash of the workflow config. Used to invalidate stale snapshots. */
  configHash: string;
  /** ISO 8601 timestamp when snapshot was saved. */
  savedAt: string;
}

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
  const stableJson = JSON.stringify({ workflow: config.workflow, agents: config.agents }, stableReplacer);
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

const SET_TYPE_MARKER = '__Set__';

function setReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return { [SET_TYPE_MARKER]: true, values: Array.from(value) };
  }
  return value;
}

function setReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record[SET_TYPE_MARKER] === true && Array.isArray(record.values)) {
      return new Set(record.values);
    }
  }
  return value;
}

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

  writeFileSync(tmpPath, JSON.stringify(data, setReplacer, 2), 'utf-8');
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
/**
 * Returns true if a snapshot file exists on disk (regardless of validity).
 *
 * Used by the runner to distinguish a *missing* snapshot (no file — normal
 * first run or post-success) from a *corrupt* snapshot (file present but
 * `loadSnapshot` returned null), so the two cases can be handled differently.
 */
export function snapshotFileExists(projectDir?: string): boolean {
  const baseDir = projectDir ?? process.cwd();
  return existsSync(join(baseDir, STATE_DIR, SNAPSHOT_FILE));
}

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
    parsed = JSON.parse(raw, setReviver);
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

// ─── Cleanup Utilities ───────────────────────────────────────────────

/**
 * Delete the stale .tmp file left from a previous crashed atomic write.
 *
 * Called at run startup (before snapshot load) and inside clearAllPersistence.
 * Best-effort: swallows errors — a leftover .tmp file is harmless.
 */
export function cleanStaleTmpFiles(projectDir?: string): void {
  const baseDir = projectDir ?? process.cwd();
  const tmpPath = join(baseDir, STATE_DIR, `${SNAPSHOT_FILE}.tmp`);
  try {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  } catch { // IGNORE: best-effort .tmp cleanup
  }
}

/**
 * Clear all persistence files after successful workflow completion.
 *
 * Consolidates clearSnapshot() + clearCheckpointLog() into a single operation.
 * Also cleans any stale .tmp file. Each sub-operation is independent — if one
 * fails the other still runs. Returns which files were actually deleted so the
 * caller can emit meaningful CLI feedback.
 *
 * @see architecture-xstate-engine.md AD3: Persistence
 */
export function clearAllPersistence(projectDir?: string): { snapshotCleared: boolean; checkpointCleared: boolean } {
  cleanStaleTmpFiles(projectDir);
  const baseDir = projectDir ?? process.cwd();
  const checkpointPath = join(baseDir, STATE_DIR, 'workflow-checkpoints.jsonl');
  let snapshotCleared = false;
  let checkpointCleared = false;

  try {
    const snapshotPath = join(baseDir, STATE_DIR, SNAPSHOT_FILE);
    if (existsSync(snapshotPath)) {
      unlinkSync(snapshotPath);
      snapshotCleared = true;
    }
  } catch { // IGNORE: best-effort snapshot cleanup
  }

  try {
    if (existsSync(checkpointPath)) {
      unlinkSync(checkpointPath);
      checkpointCleared = true;
    }
  } catch { // IGNORE: best-effort checkpoint cleanup
  }

  return { snapshotCleared, checkpointCleared };
}

// ─── Validation ──────────────────────────────────────────────────────

function isValidSnapshot(value: unknown): value is XStateWorkflowSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;

  if (!s.snapshot || typeof s.snapshot !== 'object') return false;
  if (typeof s.configHash !== 'string' || s.configHash.length === 0) return false;
  if (typeof s.savedAt !== 'string' || Number.isNaN(Date.parse(s.savedAt))) return false;

  return true;
}

// ─── XState snapshot validation ──────────────────────────────────────────────

/** Valid XState v5 actor status values present in persisted snapshots. */
const XSTATE_SNAPSHOT_STATUSES = new Set(['active', 'done', 'error', 'stopped']);

/**
 * Type-guard: accepts only well-formed XState v5 persisted snapshots.
 *
 * A real XState v5 persisted snapshot (from `actor.getPersistedSnapshot()`)
 * always has all three of: `status` (a known XState status string), `value`
 * (a non-null state value), and `context` (an object).  Requiring all three
 * rejects partial objects like `{ value: 'x' }` or `{ context: {} }` that
 * would cause createActor to throw or produce undefined behaviour.
 */
export function isRestorableXStateSnapshot(snapshot: unknown): snapshot is Record<string, unknown> {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const candidate = snapshot as Record<string, unknown>;

  return (
    Object.hasOwn(candidate, 'status') &&
    typeof candidate.status === 'string' &&
    XSTATE_SNAPSHOT_STATUSES.has(candidate.status) &&
    Object.hasOwn(candidate, 'value') &&
    candidate.value !== null &&
    candidate.value !== undefined &&
    Object.hasOwn(candidate, 'context') &&
    candidate.context !== null &&
    typeof candidate.context === 'object'
  );
}
