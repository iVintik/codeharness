/**
 * Migration from old scattered state files to unified sprint-state.json.
 * Runs once when sprint-state.json does not exist and old files are found.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, SprintStateV1, StoryState, StoryStatus, ActionItem, SessionState } from '../../types/state.js';
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

/**
 * Parse ralph/.story_retries into a Record<string, number> for v2 retries field.
 * Format: "<key> <count>" per line (space-separated).
 */
export function parseStoryRetriesRecord(content: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const count = parseInt(parts[1], 10);
    if (!isNaN(count) && count >= 0) result[parts[0]] = count;
  }
  return result;
}

/**
 * Parse ralph/.flagged_stories into a string[] for v2 flagged field.
 * Format: one key per line.
 */
export function parseFlaggedStoriesList(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed !== '' && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
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
      currentStory: null, currentPhase: null, lastAction: null, acProgress: null,
    };
  } catch { return null; }
}

/** Parse ralph/status.json into SessionState for v2 */
function parseRalphStatusToSession(content: string): SessionState | null {
  try {
    const data = JSON.parse(content) as RalphStatusJson;
    return {
      active: data.status === 'running',
      startedAt: null,
      iteration: data.loop_count ?? 0,
      elapsedSeconds: data.elapsed_seconds ?? 0,
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
 * Migrate a v1 state to v2 by reading external files and merging into unified schema.
 * Does NOT delete source files (.story_retries, .flagged_stories).
 */
export function migrateV1ToV2(v1: SprintStateV1): SprintState {
  const defaults = defaultState();

  // Read retries from external file
  const retriesContent = readIfExists(OLD_FILES.storyRetries);
  const retries = retriesContent ? parseStoryRetriesRecord(retriesContent) : {};

  // Read flagged stories from external file
  const flaggedContent = readIfExists(OLD_FILES.flaggedStories);
  const flagged = flaggedContent ? parseFlaggedStoriesList(flaggedContent) : [];

  // Read session info from ralph/status.json
  const statusContent = readIfExists(OLD_FILES.ralphStatus);
  const session = statusContent
    ? (parseRalphStatusToSession(statusContent) ?? defaults.session)
    : defaults.session;

  return {
    version: 2,
    sprint: v1.sprint,
    stories: v1.stories,
    retries,
    flagged,
    epics: {},
    session,
    observability: defaults.observability,
    run: {
      ...defaults.run,
      ...v1.run,
    },
    actionItems: v1.actionItems,
  };
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
    let session = defaultState().session;
    if (statusContent) {
      const parsed = parseRalphStatus(statusContent);
      if (parsed) run = parsed;
      const parsedSession = parseRalphStatusToSession(statusContent);
      if (parsedSession) session = parsedSession;
    }

    const issuesContent = readIfExists(OLD_FILES.sessionIssues);
    if (issuesContent) actionItems = parseSessionIssues(issuesContent);

    const sprint = computeSprintCounts(stories);

    // Parse retries and flagged for v2 fields
    const retries = retriesContent ? parseStoryRetriesRecord(retriesContent) : {};
    const flagged = flaggedContent ? parseFlaggedStoriesList(flaggedContent) : [];

    const migrated: SprintState = {
      version: 2,
      sprint,
      stories,
      retries,
      flagged,
      epics: {},
      session,
      observability: defaultState().observability,
      run,
      actionItems,
    };

    const writeResult = writeStateAtomic(migrated);
    if (!writeResult.success) return fail(writeResult.error);
    return ok(migrated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Migration failed: ${msg}`);
  }
}
