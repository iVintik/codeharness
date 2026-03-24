import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { warn } from '../output.js';

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

  const keyPattern = new RegExp(`^(\\s*${escapeRegExp(storyKey)}:\\s*)\\S+(.*)$`, 'm');
  if (!keyPattern.test(content)) {
    return;
  }

  const updated = content.replace(keyPattern, `$1${newStatus}$2`);
  writeFileSync(filePath, updated, 'utf-8');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Onboarding Epic → Sprint Status ────────────────────────────────────────

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
