import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';
import type { CheckpointEntry } from './workflow-types.js';

const STATE_DIR = '.codeharness';
const CHECKPOINT_FILE = 'workflow-checkpoints.jsonl';

export function appendCheckpoint(entry: CheckpointEntry, projectDir?: string): void {
  const baseDir = projectDir ?? process.cwd();
  const stateDir = join(baseDir, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(join(stateDir, CHECKPOINT_FILE), JSON.stringify(entry) + '\n', 'utf-8');
}

export function loadCheckpointLog(projectDir?: string): CheckpointEntry[] {
  const baseDir = projectDir ?? process.cwd();
  const checkpointPath = join(baseDir, STATE_DIR, CHECKPOINT_FILE);
  if (!existsSync(checkpointPath)) return [];

  let raw: string;
  try {
    raw = readFileSync(checkpointPath, 'utf-8');
  } catch { // IGNORE: unreadable file — treat as no checkpoints
    warn('workflow-persistence: Could not read workflow-checkpoints.jsonl — starting with no checkpoints');
    return [];
  }

  const entries: CheckpointEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as CheckpointEntry);
    } catch { // IGNORE: corrupt line — skip with warning, do not crash
      warn(`workflow-persistence: corrupt checkpoint entry skipped (invalid JSON): ${line.slice(0, 80)}`);
    }
  }
  return entries;
}

export function clearCheckpointLog(projectDir?: string): void {
  const baseDir = projectDir ?? process.cwd();
  const checkpointPath = join(baseDir, STATE_DIR, CHECKPOINT_FILE);
  try {
    if (existsSync(checkpointPath)) unlinkSync(checkpointPath);
  } catch { // IGNORE: best-effort cleanup
  }
}
