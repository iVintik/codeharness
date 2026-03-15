import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { warn } from './output.js';
import type { BeadsIssue } from './beads.js';

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

/**
 * Maps beads statuses to story file statuses.
 * Beads `open` -> story `in-progress` (assumes work started if issue exists).
 * Beads `closed` -> story `done`.
 */
const BEADS_TO_STORY_STATUS: Record<string, string> = {
  open: 'in-progress',
  closed: 'done',
};

/**
 * Maps story file statuses to beads statuses.
 * `backlog`, `ready-for-dev`, `in-progress`, `review` -> beads `open`.
 * `done` -> beads `closed`.
 */
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

// ─── Story File Operations ──────────────────────────────────────────────────

/**
 * Extracts story file path from beads issue description field.
 * The bridge command sets description = story file path (e.g. `_bmad-output/implementation-artifacts/3-1-beads-installation-cli-wrapper.md`).
 * Returns null if description doesn't contain a valid path.
 */
export function resolveStoryFilePath(beadsIssue: BeadsIssue): string | null {
  const desc = beadsIssue.description;
  if (!desc || !desc.trim()) {
    return null;
  }
  const trimmed = desc.trim();
  // Must look like a relative path ending in .md
  if (!trimmed.endsWith('.md')) {
    return null;
  }
  return trimmed;
}

/**
 * Reads the `Status:` line from a story markdown file.
 * Story file format:
 *   # Story N.M: Title
 *
 *   Status: ready-for-dev
 *
 * The Status line is found by scanning for `Status: <value>`.
 * Returns null if file doesn't exist or has no Status line.
 */
export function readStoryFileStatus(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^Status:\s*(.+)$/m);
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
  const statusRegex = /^Status:\s*.+$/m;

  if (statusRegex.test(content)) {
    const updated = content.replace(statusRegex, `Status: ${newStatus}`);
    writeFileSync(filePath, updated, 'utf-8');
  } else {
    // Insert after the first line (title)
    const lines = content.split('\n');
    const titleIndex = lines.findIndex(l => l.startsWith('# '));
    if (titleIndex !== -1) {
      lines.splice(titleIndex + 1, 0, '', `Status: ${newStatus}`);
    } else {
      // No title found, prepend
      lines.unshift(`Status: ${newStatus}`, '');
    }
    writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}

// ─── Sprint Status YAML ────────────────────────────────────────────────────

const SPRINT_STATUS_PATH = '_bmad-output/implementation-artifacts/sprint-status.yaml';

/**
 * Reads sprint-status.yaml and returns the development_status map.
 */
export function readSprintStatus(dir?: string): Record<string, string> {
  const root = dir ?? process.cwd();
  const filePath = join(root, SPRINT_STATUS_PATH);
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parse(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const devStatus = parsed.development_status;
    if (!devStatus || typeof devStatus !== 'object') {
      return {};
    }
    return devStatus as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Updates a single story's status in sprint-status.yaml while preserving structure and comments.
 * Uses line-level text replacement to preserve YAML comments.
 */
export function updateSprintStatus(storyKey: string, newStatus: string, dir?: string): void {
  const root = dir ?? process.cwd();
  const filePath = join(root, SPRINT_STATUS_PATH);
  if (!existsSync(filePath)) {
    warn(`sprint-status.yaml not found at ${filePath}, skipping update`);
    return;
  }

  const content = readFileSync(filePath, 'utf-8');

  // Use regex replacement to preserve comments and structure
  const keyPattern = new RegExp(`^(\\s*${escapeRegExp(storyKey)}:\\s*)\\S+(.*)$`, 'm');
  if (!keyPattern.test(content)) {
    // Key not found in file, skip
    return;
  }

  const updated = content.replace(keyPattern, `$1${newStatus}$2`);
  writeFileSync(filePath, updated, 'utf-8');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Onboarding Epic → Sprint Status ────────────────────────────────────────

/**
 * Determines the next epic number by scanning existing epic-N entries.
 */
function nextEpicNumber(statuses: Record<string, string>): number {
  let max = -1;
  for (const key of Object.keys(statuses)) {
    const match = key.match(/^epic-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

/**
 * Converts an onboarding story title to a sprint-status story key slug.
 * e.g. "Create ARCHITECTURE.md" → "create-architecture-md"
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface OnboardingStoryEntry {
  title: string;
  key?: string;
}

/**
 * Appends an onboarding epic with stories to sprint-status.yaml.
 * Creates entries like:
 *   epic-10: backlog
 *   10-1-create-architecture-md: backlog
 *   10-2-add-test-coverage-for-src-lib: backlog
 *   epic-10-retrospective: optional
 *
 * Returns the epic number and story keys created.
 */
export function appendOnboardingEpicToSprint(
  stories: OnboardingStoryEntry[],
  dir?: string,
): { epicNumber: number; storyKeys: string[] } {
  const root = dir ?? process.cwd();
  const filePath = join(root, SPRINT_STATUS_PATH);

  if (!existsSync(filePath)) {
    warn(`sprint-status.yaml not found at ${filePath}, cannot append onboarding epic`);
    return { epicNumber: -1, storyKeys: [] };
  }

  const statuses = readSprintStatus(dir);
  const epicNum = nextEpicNumber(statuses);
  const storyKeys: string[] = [];

  const lines: string[] = [''];
  lines.push(`  epic-${epicNum}: backlog`);

  for (let i = 0; i < stories.length; i++) {
    const slug = slugify(stories[i].title);
    const storyKey = `${epicNum}-${i + 1}-${slug}`;
    storyKeys.push(storyKey);
    lines.push(`  ${storyKey}: backlog`);
  }

  lines.push(`  epic-${epicNum}-retrospective: optional`);
  lines.push('');

  const content = readFileSync(filePath, 'utf-8');
  const updated = content.trimEnd() + '\n' + lines.join('\n');
  writeFileSync(filePath, updated, 'utf-8');

  return { epicNumber: epicNum, storyKeys };
}

// ─── Sync Functions ─────────────────────────────────────────────────────────

/**
 * Extracts a story key from a story file path.
 * e.g. `_bmad-output/implementation-artifacts/3-1-beads-installation-cli-wrapper.md` -> `3-1-beads-installation-cli-wrapper`
 */
function storyKeyFromPath(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  return base.replace(/\.md$/, '');
}

/**
 * Syncs a beads issue status to the linked story file.
 * Reads beads issue status, resolves story file path from description,
 * reads story file status, updates story file if statuses differ.
 */
export function syncBeadsToStoryFile(
  beadsId: string,
  beadsFns: {
    listIssues: () => BeadsIssue[];
  },
  dir?: string,
): SyncResult {
  const root = dir ?? process.cwd();
  const issues = beadsFns.listIssues();
  const issue = issues.find(i => i.id === beadsId);

  if (!issue) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: '',
      newStatus: '',
      synced: false,
      error: `Beads issue not found: ${beadsId}`,
    };
  }

  const storyFilePath = resolveStoryFilePath(issue);
  if (!storyFilePath) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: issue.status,
      newStatus: '',
      synced: false,
      error: `No story file path in beads issue description: ${beadsId}`,
    };
  }

  const storyKey = storyKeyFromPath(storyFilePath);
  const fullPath = join(root, storyFilePath);
  const currentStoryStatus = readStoryFileStatus(fullPath);

  if (currentStoryStatus === null) {
    return {
      storyKey,
      beadsId,
      previousStatus: issue.status,
      newStatus: '',
      synced: false,
      error: `Story file not found or has no Status line: ${storyFilePath}`,
    };
  }

  const targetStoryStatus = beadsStatusToStoryStatus(issue.status);
  if (!targetStoryStatus) {
    return {
      storyKey,
      beadsId,
      previousStatus: currentStoryStatus,
      newStatus: '',
      synced: false,
      error: `Unknown beads status: ${issue.status}`,
    };
  }

  if (currentStoryStatus === targetStoryStatus) {
    return {
      storyKey,
      beadsId,
      previousStatus: currentStoryStatus,
      newStatus: currentStoryStatus,
      synced: false,
    };
  }

  updateStoryFileStatus(fullPath, targetStoryStatus);
  updateSprintStatus(storyKey, targetStoryStatus, root);

  return {
    storyKey,
    beadsId,
    previousStatus: currentStoryStatus,
    newStatus: targetStoryStatus,
    synced: true,
  };
}

/**
 * Syncs a story file status to the matching beads issue.
 * Reads story file status, finds matching beads issue (by description path containing story key),
 * updates beads issue status if statuses differ.
 */
export function syncStoryFileToBeads(
  storyKey: string,
  beadsFns: {
    listIssues: () => BeadsIssue[];
    updateIssue: (id: string, opts: { status?: string }) => void;
    closeIssue: (id: string) => void;
  },
  dir?: string,
): SyncResult {
  const root = dir ?? process.cwd();
  const storyFilePath = `_bmad-output/implementation-artifacts/${storyKey}.md`;
  const fullPath = join(root, storyFilePath);

  const currentStoryStatus = readStoryFileStatus(fullPath);
  if (currentStoryStatus === null) {
    return {
      storyKey,
      beadsId: '',
      previousStatus: '',
      newStatus: '',
      synced: false,
      error: `Story file not found or has no Status line: ${storyFilePath}`,
    };
  }

  const issues = beadsFns.listIssues();
  const issue = issues.find(i => {
    const path = resolveStoryFilePath(i);
    if (!path) return false;
    return storyKeyFromPath(path) === storyKey;
  });

  if (!issue) {
    return {
      storyKey,
      beadsId: '',
      previousStatus: currentStoryStatus,
      newStatus: '',
      synced: false,
      error: `No beads issue found for story: ${storyKey}`,
    };
  }

  const targetBeadsStatus = storyStatusToBeadsStatus(currentStoryStatus);
  if (!targetBeadsStatus) {
    return {
      storyKey,
      beadsId: issue.id,
      previousStatus: currentStoryStatus,
      newStatus: '',
      synced: false,
      error: `Unknown story status: ${currentStoryStatus}`,
    };
  }

  if (issue.status === targetBeadsStatus) {
    return {
      storyKey,
      beadsId: issue.id,
      previousStatus: currentStoryStatus,
      newStatus: currentStoryStatus,
      synced: false,
    };
  }

  // Use closeIssue for closing, updateIssue for reopening
  if (targetBeadsStatus === 'closed') {
    beadsFns.closeIssue(issue.id);
  } else {
    beadsFns.updateIssue(issue.id, { status: targetBeadsStatus });
  }

  // Also update sprint-status.yaml
  updateSprintStatus(storyKey, currentStoryStatus, root);

  return {
    storyKey,
    beadsId: issue.id,
    previousStatus: issue.status,
    newStatus: targetBeadsStatus,
    synced: true,
  };
}

/**
 * Closes a beads issue and updates the linked story file to `done`.
 * This is the primary path used by Ralph/sprint execution when completing a story.
 */
export function syncClose(
  beadsId: string,
  beadsFns: {
    closeIssue: (id: string) => void;
    listIssues: () => BeadsIssue[];
  },
  dir?: string,
): SyncResult {
  const root = dir ?? process.cwd();

  // Capture issue data BEFORE closing — listIssues() may exclude closed issues
  const issues = beadsFns.listIssues();
  const issue = issues.find(i => i.id === beadsId);

  // Close the beads issue
  beadsFns.closeIssue(beadsId);

  if (!issue) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: '',
      newStatus: 'closed',
      synced: false,
      error: `Beads issue not found: ${beadsId}`,
    };
  }

  const storyFilePath = resolveStoryFilePath(issue);
  if (!storyFilePath) {
    return {
      storyKey: '',
      beadsId,
      previousStatus: issue.status,
      newStatus: 'closed',
      synced: false,
      error: `No story file path in beads issue description: ${beadsId}`,
    };
  }

  const storyKey = storyKeyFromPath(storyFilePath);
  const fullPath = join(root, storyFilePath);
  const previousStatus = readStoryFileStatus(fullPath);

  if (previousStatus === null) {
    if (!existsSync(fullPath)) {
      return {
        storyKey,
        beadsId,
        previousStatus: '',
        newStatus: 'closed',
        synced: false,
        error: `Story file not found: ${storyFilePath}`,
      };
    }
    // File exists but no Status line — insert one
  }

  updateStoryFileStatus(fullPath, 'done');
  updateSprintStatus(storyKey, 'done', root);

  return {
    storyKey,
    beadsId,
    previousStatus: previousStatus ?? '',
    newStatus: 'done',
    synced: true,
  };
}

/**
 * Syncs all beads issues in the specified direction.
 * For `bidirectional`, beads is the source of truth (beads status wins on conflict).
 */
export function syncAll(
  direction: SyncDirection,
  beadsFns: {
    listIssues: () => BeadsIssue[];
    updateIssue: (id: string, opts: { status?: string }) => void;
    closeIssue: (id: string) => void;
  },
  dir?: string,
): SyncResult[] {
  const root = dir ?? process.cwd();
  const results: SyncResult[] = [];

  // Single call to listIssues up front
  let issues: BeadsIssue[];
  try {
    issues = beadsFns.listIssues();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [{
      storyKey: '',
      beadsId: '',
      previousStatus: '',
      newStatus: '',
      synced: false,
      error: `Failed to list beads issues: ${message}`,
    }];
  }

  // Create a wrapper that returns cached issues
  const cachedListIssues = () => issues;

  for (const issue of issues) {
    const storyFilePath = resolveStoryFilePath(issue);
    if (!storyFilePath) {
      // Skip issues without story file links (non-story issues from onboard, etc.)
      continue;
    }

    const storyKey = storyKeyFromPath(storyFilePath);

    try {
      if (direction === 'beads-to-files' || direction === 'bidirectional') {
        const result = syncBeadsToStoryFile(issue.id, { listIssues: cachedListIssues }, root);
        results.push(result);
      } else if (direction === 'files-to-beads') {
        const result = syncStoryFileToBeads(storyKey, {
          listIssues: cachedListIssues,
          updateIssue: beadsFns.updateIssue,
          closeIssue: beadsFns.closeIssue,
        }, root);
        results.push(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        storyKey,
        beadsId: issue.id,
        previousStatus: '',
        newStatus: '',
        synced: false,
        error: message,
      });
    }
  }

  return results;
}
