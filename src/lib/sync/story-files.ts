import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SyncResult {
  storyKey: string;
  previousStatus: string;
  newStatus: string;
  synced: boolean;
  error?: string;
}

export type SyncDirection = 'bidirectional';

// TODO: v2 issue tracker (Epic 8) — beads status mappings and resolveStoryFilePath removed with beads cleanup

export function storyKeyFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.md$/, '');
}

/**
 * Resolves a story file path from a description string.
 * Returns null if description doesn't contain a valid .md path.
 */
export function resolveStoryFilePath(description: string | undefined): string | null {
  if (!description || !description.trim()) {
    return null;
  }
  const trimmed = description.trim();
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
