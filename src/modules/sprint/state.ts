/**
 * Sprint state — read/write unified sprint-state.json with atomic writes.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { SprintState, SprintStateAny, StoryStatus, StoryState } from '../../types/state.js';
import type { StoryDetail, RunProgressUpdate } from './types.js';
import { migrateFromOldFormat, migrateV1ToV2 } from './migration.js';

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
 * Write state to disk atomically: write to tmp, then rename.
 */
export function writeStateAtomic(state: SprintState): Result<void> {
  try {
    const data = JSON.stringify(state, null, 2) + '\n';
    const tmp = tmpPath();
    const final = statePath();
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, final);
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
          retries: (parsed.retries as Record<string, number>) ?? {},
          flagged: (parsed.flagged as string[]) ?? [],
          epics: (parsed.epics as Record<string, import('../../types/state.js').EpicState>) ?? {},
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
