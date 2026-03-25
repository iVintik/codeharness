/**
 * Sprint state — read/write unified sprint-state.json with atomic writes.
 * Also generates sprint-status.yaml as a derived human-readable view.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, SprintStateAny, StoryStatus, StoryState, EpicState } from '../../types/state.js';
import type { StoryDetail, RunProgressUpdate } from './types.js';
import { migrateFromOldFormat, migrateV1ToV2, parseStoryRetriesRecord, parseFlaggedStoriesList } from './migration.js';

/** Result of state reconciliation */
export interface ReconciliationResult {
  readonly corrections: string[];
  readonly stateChanged: boolean;
}

/** Resolve project root (directory containing package.json) */
function projectRoot(): string {
  return process.cwd();
}

/** Path to the sprint state file */
export function statePath(): string {
  return join(projectRoot(), 'sprint-state.json');
}

/** Path to the temporary file used for atomic writes */
function tmpPath(): string {
  return join(projectRoot(), '.sprint-state.json.tmp');
}

/** Path to the sprint-status.yaml file (derived view) */
export function sprintStatusYamlPath(): string {
  return join(projectRoot(), '_bmad-output', 'implementation-artifacts', 'sprint-status.yaml');
}

/** Return an empty default SprintState (v2) */
export function defaultState(): SprintState {
  return {
    version: 2,
    sprint: {
      total: 0,
      done: 0,
      failed: 0,
      blocked: 0,
      inProgress: null,
    },
    stories: {},
    retries: {},
    flagged: [],
    epics: {},
    session: {
      active: false,
      startedAt: null,
      iteration: 0,
      elapsedSeconds: 0,
    },
    observability: {
      statementCoverage: null,
      branchCoverage: null,
      functionCoverage: null,
      lineCoverage: null,
    },
    run: {
      active: false,
      startedAt: null,
      iteration: 0,
      cost: 0,
      completed: [],
      failed: [],
      currentStory: null,
      currentPhase: null,
      lastAction: null,
      acProgress: null,
    },
    actionItems: [],
  };
}

/** Return a default StoryState */
function defaultStoryState(): StoryState {
  return {
    status: 'backlog',
    attempts: 0,
    lastAttempt: null,
    lastError: null,
    proofPath: null,
    acResults: null,
  };
}

/**
 * Derive a flat story-key → status map from sprint state.
 * This replaces the old `readSprintStatus()` which parsed YAML.
 * Only includes story keys (digit-digit-name pattern), not epic keys.
 */
export function getStoryStatusesFromState(state: SprintState): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, story] of Object.entries(state.stories)) {
    result[key] = story.status;
  }
  return result;
}

/**
 * Map internal StoryStatus values to sprint-status.yaml status strings.
 * Most map 1:1, but 'ready' maps to 'ready-for-dev' for YAML compatibility.
 */
function yamlStatus(status: StoryStatus): string {
  if (status === 'ready') return 'ready-for-dev';
  return status;
}

/**
 * Generate sprint-status.yaml content from sprint state.
 * Groups stories by epic prefix and produces the same YAML structure
 * that existed as the hand-maintained file.
 */
export function generateSprintStatusYaml(state: SprintState): string {
  const lines: string[] = [
    '# codeharness Sprint Status (auto-generated from sprint-state.json)',
    `# generated: ${new Date().toISOString().slice(0, 10)}`,
    '# This file is a derived view — do NOT edit manually.',
    '# Source of truth: sprint-state.json',
    '',
    'development_status:',
  ];

  // Group stories by epic prefix (first number segment, or 'TD' for TD- stories)
  const epicGroups = new Map<string, string[]>();
  const sortedKeys = Object.keys(state.stories).sort((a, b) => {
    // Sort by epic number, then story number (TD stories sort last)
    const [aEpic, aStory] = parseStoryKey(a);
    const [bEpic, bStory] = parseStoryKey(b);
    if (aEpic !== bEpic) return aEpic - bEpic;
    return aStory - bStory;
  });

  for (const key of sortedKeys) {
    const epicKey = getEpicGroupKey(key);
    if (!epicGroups.has(epicKey)) {
      epicGroups.set(epicKey, []);
    }
    epicGroups.get(epicKey)!.push(key);
  }

  // Emit each epic group
  for (const [epicKey, storyKeys] of epicGroups) {
    lines.push('');
    lines.push(`  # Epic ${epicKey}`);

    // Compute epic status from stories
    // epic-TD is always in-progress regardless of story statuses
    let epicStatus: string;
    if (epicKey === 'TD') {
      epicStatus = 'in-progress';
    } else {
      const allDone = storyKeys.every(k => state.stories[k].status === 'done');
      epicStatus = allDone ? 'done' : 'backlog';
    }
    lines.push(`  epic-${epicKey}: ${epicStatus}`);

    for (const key of storyKeys) {
      const story = state.stories[key];
      lines.push(`  ${key}: ${yamlStatus(story.status)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Parse a story key into [epicNumber, storyNumber].
 * e.g. "11-2-sprint-status-yaml-derived-view" → [11, 2]
 * TD-prefix stories (e.g. "TD-1-slug") return [Infinity, storyNumber].
 */
function parseStoryKey(key: string): [number, number] {
  // Handle TD-prefix stories
  const tdMatch = key.match(/^TD-(\d+)/);
  if (tdMatch) return [Infinity, parseInt(tdMatch[1], 10)];
  const match = key.match(/^(\d+)-(\d+)/);
  if (!match) return [Infinity, Infinity];
  return [parseInt(match[1], 10), parseInt(match[2], 10)];
}

/**
 * Get the epic group key for a story key.
 * Returns 'TD' for TD-prefix stories, or the numeric epic prefix as string.
 */
function getEpicGroupKey(key: string): string {
  if (key.startsWith('TD-')) return 'TD';
  const match = key.match(/^(\d+)-/);
  return match ? match[1] : String(Infinity);
}

/**
 * Write the derived sprint-status.yaml from current state.
 * Best-effort: failures are silently ignored since this is a convenience view.
 */
function writeSprintStatusYaml(state: SprintState): void {
  try {
    const yamlPath = sprintStatusYamlPath();
    // Only write if the directory exists (project has been set up)
    const dir = dirname(yamlPath);
    if (!existsSync(dir)) return;
    const content = generateSprintStatusYaml(state);
    writeFileSync(yamlPath, content, 'utf-8');
  } catch {
    // IGNORE: YAML view write is best-effort, not critical
  }
}

/**
 * Write state to disk atomically: write to tmp, then rename.
 * Also regenerates sprint-status.yaml as a derived view.
 */
export function writeStateAtomic(state: SprintState): Result<void> {
  try {
    const data = JSON.stringify(state, null, 2) + '\n';
    const tmp = tmpPath();
    const final = statePath();
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, final);
    // Regenerate YAML view after successful state write
    writeSprintStatusYaml(state);
    return ok(undefined);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to write sprint state: ${msg}`);
  }
}

/**
 * Read and parse sprint-state.json.
 * If the file does not exist, attempt migration from old files.
 * If no old files exist either, return defaultState().
 * Automatically migrates v1 state to v2.
 */
export function getSprintState(): Result<SprintState> {
  const fp = statePath();

  if (existsSync(fp)) {
    try {
      const raw = readFileSync(fp, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const version = parsed.version as number | undefined;

      // Already v2 — merge with defaults and return
      if (version === 2) {
        const defaults = defaultState();
        const run = parsed.run as Record<string, unknown> | undefined;
        const sprint = parsed.sprint as Record<string, unknown> | undefined;
        const session = parsed.session as Record<string, unknown> | undefined;
        const observability = parsed.observability as Record<string, unknown> | undefined;
        const state: SprintState = {
          ...(parsed as unknown as SprintState),
          sprint: {
            ...defaults.sprint,
            ...(sprint as unknown as SprintState['sprint']),
          },
          run: {
            ...defaults.run,
            ...(run as unknown as SprintState['run']),
          },
          session: {
            ...defaults.session,
            ...(session as unknown as SprintState['session']),
          },
          observability: {
            ...defaults.observability,
            ...(observability as unknown as SprintState['observability']),
          },
          stories: (parsed.stories as Record<string, import('../../types/state.js').StoryState>) ?? {},
          retries: (parsed.retries as Record<string, number>) ?? {},
          flagged: (parsed.flagged as string[]) ?? [],
          epics: (parsed.epics as Record<string, import('../../types/state.js').EpicState>) ?? {},
          actionItems: (parsed.actionItems as string[]) ?? [],
        };
        return ok(state);
      }

      // v1 or missing version — migrate to v2
      const v1State = parsed as unknown as import('../../types/state.js').SprintStateV1;
      const migrated = migrateV1ToV2(v1State);
      const writeResult = writeStateAtomic(migrated);
      if (!writeResult.success) {
        return fail(writeResult.error);
      }
      return ok(migrated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Failed to read sprint state: ${msg}`);
    }
  }

  // No sprint-state.json — try migration from old scattered files
  const migrationResult = migrateFromOldFormat();
  if (migrationResult.success) {
    return migrationResult;
  }

  // Migration found nothing or failed — return default
  return ok(defaultState());
}

/** Recompute sprint summary counts from story data */
export function computeSprintCounts(
  stories: Record<string, StoryState>,
): SprintState['sprint'] {
  let total = 0;
  let done = 0;
  let failed = 0;
  let blocked = 0;
  let inProgress: string | null = null;

  for (const [key, story] of Object.entries(stories)) {
    total++;
    if (story.status === 'done') done++;
    else if (story.status === 'failed') failed++;
    else if (story.status === 'blocked') blocked++;
    else if (story.status === 'in-progress') inProgress = key;
  }

  return { total, done, failed, blocked, inProgress };
}

/**
 * Update a single story's status in sprint-state.json.
 * Reads current state, merges update, writes atomically.
 */
export function updateStoryStatus(
  key: string,
  status: StoryStatus,
  detail?: StoryDetail,
): Result<void> {
  const stateResult = getSprintState();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const current = stateResult.data;
  const existingStory = current.stories[key] ?? defaultStoryState();

  const isNewAttempt = status === 'in-progress';

  const updatedStory: StoryState = {
    ...existingStory,
    status,
    attempts: isNewAttempt
      ? existingStory.attempts + 1
      : existingStory.attempts,
    lastAttempt: isNewAttempt
      ? new Date().toISOString()
      : existingStory.lastAttempt,
    lastError: detail?.error ?? existingStory.lastError,
    proofPath: detail?.proofPath ?? existingStory.proofPath,
    acResults: existingStory.acResults,
  };

  const updatedStories = { ...current.stories, [key]: updatedStory };
  const updatedSprint = computeSprintCounts(updatedStories);

  const updatedState: SprintState = {
    ...current,
    sprint: updatedSprint,
    stories: updatedStories,
  };

  return writeStateAtomic(updatedState);
}

/**
 * Update live run progress fields in sprint-state.json.
 * Only provided fields are updated; omitted fields retain their current values.
 */
export function updateRunProgress(update: RunProgressUpdate): Result<void> {
  const stateResult = getSprintState();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const current = stateResult.data;
  const updatedRun = {
    ...current.run,
    ...(update.currentStory !== undefined && { currentStory: update.currentStory }),
    ...(update.currentPhase !== undefined && { currentPhase: update.currentPhase }),
    ...(update.lastAction !== undefined && { lastAction: update.lastAction }),
    ...(update.acProgress !== undefined && { acProgress: update.acProgress }),
  };

  const updatedState: SprintState = {
    ...current,
    run: updatedRun,
  };

  return writeStateAtomic(updatedState);
}

/**
 * Clear all live run progress fields to null.
 * Called when a story completes or fails.
 */
export function clearRunProgress(): Result<void> {
  const stateResult = getSprintState();
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const current = stateResult.data;
  const updatedState: SprintState = {
    ...current,
    run: {
      ...current.run,
      currentStory: null,
      currentPhase: null,
      lastAction: null,
      acProgress: null,
    },
  };

  return writeStateAtomic(updatedState);
}

/**
 * Reconcile sprint state on session start.
 * Merges orphaned files, validates epic consistency, regenerates YAML.
 * Best-effort: returns corrections made; callers should log them.
 */
export function reconcileState(): Result<ReconciliationResult> {
  try {
    // 1. Read current state (handles v1→v2 migration internally)
    const stateResult = getSprintState();
    if (!stateResult.success) {
      return fail(stateResult.error);
    }

    // Work with a mutable copy
    const state: SprintState = JSON.parse(JSON.stringify(stateResult.data));
    const corrections: string[] = [];
    let changed = false;

    // 2. Merge orphaned .story_retries file
    const retriesPath = join(projectRoot(), 'ralph', '.story_retries');
    if (existsSync(retriesPath)) {
      try {
        const content = readFileSync(retriesPath, 'utf-8');
        const fileRetries = parseStoryRetriesRecord(content);
        const mergedRetries = { ...state.retries };
        for (const [key, count] of Object.entries(fileRetries)) {
          if (count > (mergedRetries[key] ?? 0)) {
            mergedRetries[key] = count;
            changed = true;
          }
        }
        (state as { retries: Record<string, number> }).retries = mergedRetries;
        unlinkSync(retriesPath);
        corrections.push('merged .story_retries into sprint-state.json');
      } catch {
        // IGNORE: malformed .story_retries file, delete and move on
        try { unlinkSync(retriesPath); } catch { /* IGNORE: cleanup failure */ }
        corrections.push('removed malformed .story_retries file');
      }
    }

    // 3. Merge orphaned .flagged_stories file
    const flaggedPath = join(projectRoot(), 'ralph', '.flagged_stories');
    if (existsSync(flaggedPath)) {
      try {
        const content = readFileSync(flaggedPath, 'utf-8');
        const fileKeys = parseFlaggedStoriesList(content);
        const existing = new Set(state.flagged);
        const merged = [...state.flagged];
        for (const key of fileKeys) {
          if (!existing.has(key)) {
            merged.push(key);
            existing.add(key);
            changed = true;
          }
        }
        (state as { flagged: string[] }).flagged = merged;
        unlinkSync(flaggedPath);
        corrections.push('merged .flagged_stories into sprint-state.json');
      } catch {
        // IGNORE: malformed .flagged_stories file, delete and move on
        try { unlinkSync(flaggedPath); } catch { /* IGNORE: cleanup failure */ }
        corrections.push('removed malformed .flagged_stories file');
      }
    }

    // 4. Validate epic consistency — ensure every story's epic prefix has an epic entry
    const epicStories = new Map<string, string[]>();
    for (const key of Object.keys(state.stories)) {
      const [epicNum] = parseStoryKey(key);
      if (epicNum === Infinity) continue; // Not a valid story key
      const epicKey = `epic-${epicNum}`;
      if (!epicStories.has(epicKey)) {
        epicStories.set(epicKey, []);
      }
      epicStories.get(epicKey)!.push(key);
    }

    const updatedEpics: Record<string, import('../../types/state.js').EpicState> = { ...state.epics };
    for (const [epicKey, storyKeys] of epicStories) {
      if (!(epicKey in updatedEpics)) {
        // Compute epic status from its stories
        const total = storyKeys.length;
        const doneCount = storyKeys.filter(k => state.stories[k].status === 'done').length;
        const epicStatus = doneCount === total ? 'done' : 'in-progress';
        updatedEpics[epicKey] = {
          status: epicStatus,
          storiesTotal: total,
          storiesDone: doneCount,
        };
        changed = true;
        corrections.push(`created missing epic entry: ${epicKey}`);
      }
    }
    (state as { epics: Record<string, import('../../types/state.js').EpicState> }).epics = updatedEpics;

    // 5. Write state atomically if mutations were made (also regenerates YAML),
    //    otherwise just regenerate YAML standalone (idempotent, cheap).
    if (changed) {
      const writeResult = writeStateAtomic(state);
      if (!writeResult.success) {
        return fail(writeResult.error);
      }
    } else {
      writeSprintStatusYaml(state);
    }

    // 7. Note YAML regeneration in corrections if any corrections were made
    if (corrections.length > 0) {
      corrections.push('regenerated sprint-status.yaml');
    }

    return ok({ corrections, stateChanged: changed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`State reconciliation failed: ${msg}`);
  }
}
