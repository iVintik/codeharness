/**
 * Migration from old scattered state files to unified sprint-state.json.
 * Runs once when sprint-state.json does not exist and old files are found.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, StoryState, StoryStatus, ActionItem } from '../../types/state.js';
import { defaultState, writeStateAtomic, computeSprintCounts } from './state.js';

const OLD_FILES = {
  storyRetries: 'ralph/.story_retries',
  flaggedStories: 'ralph/.flagged_stories',
  ralphStatus: 'ralph/status.json',
  sprintStatusYaml: '_bmad-output/implementation-artifacts/sprint-status.yaml',
  sessionIssues: '_bmad-output/implementation-artifacts/.session-issues.md',
} as const;

function resolve(relative: string): string {
  return join(process.cwd(), relative);
}

function readIfExists(relative: string): string | null {
  const p = resolve(relative);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf-8'); } catch { return null; }
}

/** Return a fresh empty StoryState */
function emptyStory(): StoryState {
  return {
    status: 'backlog', attempts: 0, lastAttempt: null,
    lastError: null, proofPath: null, acResults: null,
  };
}

/** Ensure a story entry exists, then apply a partial update */
function upsertStory(
  stories: Record<string, StoryState>,
  key: string,
  patch: Partial<StoryState>,
): void {
  stories[key] = { ...(stories[key] ?? emptyStory()), ...patch };
}

/** Parse ralph/.story_retries: "<key> <count>" per line */
function parseStoryRetries(content: string, stories: Record<string, StoryState>): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const count = parseInt(parts[1], 10);
    if (!isNaN(count)) upsertStory(stories, parts[0], { attempts: count });
  }
}

/** Parse ralph/.flagged_stories: one key per line */
function parseFlaggedStories(content: string, stories: Record<string, StoryState>): void {
  for (const line of content.split('\n')) {
    const key = line.trim();
    if (key) upsertStory(stories, key, { status: 'blocked' });
  }
}

/** Map YAML status strings to StoryStatus */
function mapYamlStatus(value: string): StoryStatus | null {
  const mapping: Record<string, StoryStatus> = {
    done: 'done', backlog: 'backlog', verifying: 'verifying',
    'in-progress': 'in-progress', 'ready-for-dev': 'ready',
    blocked: 'blocked', failed: 'failed', review: 'review', ready: 'ready',
  };
  return mapping[value.trim().toLowerCase()] ?? null;
}

/**
 * Parse sprint-status.yaml (flat key: value).
 * Story lines like "  1-1-result-type: done" become entries.
 * Epic lines like "  epic-1: done" are skipped.
 */
function parseSprintStatusYaml(content: string, stories: Record<string, StoryState>): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1];
    if (key === 'development_status' || key.startsWith('epic-')) continue;
    const status = mapYamlStatus(match[2]);
    if (status) upsertStory(stories, key, { status });
  }
}

interface RalphStatusJson {
  loop_count?: number;
  stories_total?: number;
  stories_completed?: number;
  elapsed_seconds?: number;
  status?: string;
}

/** Parse ralph/status.json into run section */
function parseRalphStatus(content: string): SprintState['run'] | null {
  try {
    const data = JSON.parse(content) as RalphStatusJson;
    return {
      active: data.status === 'running', startedAt: null,
      iteration: data.loop_count ?? 0, cost: 0, completed: [], failed: [],
    };
  } catch { return null; }
}

/** Parse .session-issues.md for action items (best effort) */
function parseSessionIssues(content: string): ActionItem[] {
  const items: ActionItem[] = [];
  let currentStory = '';
  let itemId = 0;
  for (const line of content.split('\n')) {
    const headerMatch = line.match(/^###\s+([a-zA-Z0-9_-]+)\s*[—-]/);
    if (headerMatch) { currentStory = headerMatch[1]; continue; }
    const bulletMatch = line.match(/^-\s+(.+)/);
    if (bulletMatch && currentStory) {
      itemId++;
      items.push({
        id: `migrated-${itemId}`, story: currentStory,
        description: bulletMatch[1], source: 'retro', resolved: false,
      });
    }
  }
  return items;
}

/**
 * Migrate from old format files to SprintState.
 * Returns fail() if no old files exist (caller should use default).
 */
export function migrateFromOldFormat(): Result<SprintState> {
  const hasAnyOldFile = Object.values(OLD_FILES).some((rel) => existsSync(resolve(rel)));
  if (!hasAnyOldFile) return fail('No old format files found for migration');

  try {
    const stories: Record<string, StoryState> = {};
    let run = defaultState().run;
    let actionItems: ActionItem[] = [];

    const yamlContent = readIfExists(OLD_FILES.sprintStatusYaml);
    if (yamlContent) parseSprintStatusYaml(yamlContent, stories);

    const retriesContent = readIfExists(OLD_FILES.storyRetries);
    if (retriesContent) parseStoryRetries(retriesContent, stories);

    const flaggedContent = readIfExists(OLD_FILES.flaggedStories);
    if (flaggedContent) parseFlaggedStories(flaggedContent, stories);

    const statusContent = readIfExists(OLD_FILES.ralphStatus);
    if (statusContent) {
      const parsed = parseRalphStatus(statusContent);
      if (parsed) run = parsed;
    }

    const issuesContent = readIfExists(OLD_FILES.sessionIssues);
    if (issuesContent) actionItems = parseSessionIssues(issuesContent);

    const sprint = computeSprintCounts(stories);

    const migrated: SprintState = {
      version: 1,
      sprint,
      stories, run, actionItems,
    };

    const writeResult = writeStateAtomic(migrated);
    if (!writeResult.success) return fail(writeResult.error);
    return ok(migrated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Migration failed: ${msg}`);
  }
}
