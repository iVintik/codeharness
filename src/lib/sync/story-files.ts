import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BeadsIssue } from '../beads.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SyncResult {
  storyKey: string;
  beadsId: string;
  previousStatus: string;
  newStatus: string;
  synced: boolean;
  error?: string;
}

export type SyncDirection = 'beads-to-files' | 'files-to-beads' | 'bidirectional';

// ─── Status Mapping ─────────────────────────────────────────────────────────

const BEADS_TO_STORY_STATUS: Record<string, string> = {
  open: 'in-progress',
  closed: 'done',
};

const STORY_TO_BEADS_STATUS: Record<string, string> = {
  backlog: 'open',
  'ready-for-dev': 'open',
  'in-progress': 'open',
  review: 'open',
  done: 'closed',
};

export function beadsStatusToStoryStatus(beadsStatus: string): string | null {
  return BEADS_TO_STORY_STATUS[beadsStatus] ?? null;
}

export function storyStatusToBeadsStatus(storyStatus: string): string | null {
  return STORY_TO_BEADS_STATUS[storyStatus] ?? null;
}

export function storyKeyFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.md$/, '');
}

/**
 * Extracts story file path from beads issue description field.
 * The bridge command sets description = story file path.
 * Returns null if description doesn't contain a valid path.
 */
export function resolveStoryFilePath(beadsIssue: BeadsIssue): string | null {
  const desc = beadsIssue.description;
  if (!desc || !desc.trim()) {
    return null;
  }
  const trimmed = desc.trim();
  if (!trimmed.endsWith('.md')) {
    return null;
  }
  return trimmed;
}

/**
 * Reads the `Status:` line from a story markdown file.
 * Returns null if file doesn't exist or has no Status line.
 */
export function readStoryFileStatus(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^#{0,2}\s*Status:\s*(.+)$/m);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

/**
 * Updates the `Status:` line in a story markdown file in-place.
 * If no `Status:` line exists, inserts one after the title line.
 */
export function updateStoryFileStatus(filePath: string, newStatus: string): void {
  const content = readFileSync(filePath, 'utf-8');
  const statusRegex = /^(#{0,2}\s*)Status:\s*.+$/m;

  if (statusRegex.test(content)) {
    const updated = content.replace(statusRegex, `$1Status: ${newStatus}`);
    writeFileSync(filePath, updated, 'utf-8');
  } else {
    const lines = content.split('\n');
    const titleIndex = lines.findIndex(l => l.startsWith('# '));
    if (titleIndex !== -1) {
      lines.splice(titleIndex + 1, 0, '', `Status: ${newStatus}`);
    } else {
      lines.unshift(`Status: ${newStatus}`, '');
    }
    writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}
