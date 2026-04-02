import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { migrateFromOldFormat, migrateV1ToV2 } from '../migration.js';
import type { SprintStateV1 } from '../../../types/state.js';

const ROOT = process.cwd();
const STATE_FILE = join(ROOT, 'sprint-state.json');
const TMP_FILE = join(ROOT, '.sprint-state.json.tmp');
const RALPH_DIR = join(ROOT, 'ralph');
const BMAD_DIR = join(
  ROOT,
  '_bmad-output',
  'implementation-artifacts',
);

// We need to test with actual old file paths, so we'll create/cleanup them
const REAL_RETRIES = join(RALPH_DIR, '.story_retries');
const REAL_FLAGGED = join(RALPH_DIR, '.flagged_stories');
const REAL_STATUS = join(RALPH_DIR, 'status.json');
const REAL_YAML = join(BMAD_DIR, 'sprint-status.yaml');
const REAL_ISSUES = join(BMAD_DIR, '.session-issues.md');

// Store original contents for restoration
let ralphDirExisted = false;
let originalRetries: string | null = null;
let originalFlagged: string | null = null;
let originalStatus: string | null = null;
let originalYaml: string | null = null;
let originalIssues: string | null = null;
let originalState: string | null = null;

function readSafe(path: string): string | null {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

function saveOriginals(): void {
  ralphDirExisted = existsSync(RALPH_DIR);
  originalRetries = readSafe(REAL_RETRIES);
  originalFlagged = readSafe(REAL_FLAGGED);
  originalStatus = readSafe(REAL_STATUS);
  originalYaml = readSafe(REAL_YAML);
  originalIssues = readSafe(REAL_ISSUES);
  originalState = readSafe(STATE_FILE);
}

function restoreOriginals(): void {
  // Clean up sprint-state.json
  if (originalState !== null) {
    writeFileSync(STATE_FILE, originalState, 'utf-8');
  } else if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
  if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE);

  // Restore originals
  if (originalRetries !== null) writeFileSync(REAL_RETRIES, originalRetries, 'utf-8');
  else if (existsSync(REAL_RETRIES)) unlinkSync(REAL_RETRIES);
  if (originalFlagged !== null) writeFileSync(REAL_FLAGGED, originalFlagged, 'utf-8');
  else if (existsSync(REAL_FLAGGED)) unlinkSync(REAL_FLAGGED);
  if (originalStatus !== null) writeFileSync(REAL_STATUS, originalStatus, 'utf-8');
  else if (existsSync(REAL_STATUS)) unlinkSync(REAL_STATUS);
  if (originalYaml !== null) writeFileSync(REAL_YAML, originalYaml, 'utf-8');
  if (originalIssues !== null) writeFileSync(REAL_ISSUES, originalIssues, 'utf-8');

  // If ralph/ didn't exist before tests, clean it up (Story 1.2 — ralph/ deleted)
  if (!ralphDirExisted && existsSync(RALPH_DIR)) {
    rmSync(RALPH_DIR, { recursive: true, force: true });
  }
}

function removeOldFiles(): void {
  for (const f of [REAL_RETRIES, REAL_FLAGGED, REAL_STATUS, REAL_YAML, REAL_ISSUES]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe('migrateFromOldFormat', () => {
  beforeEach(() => {
    saveOriginals();
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    // ralph/ may not exist after Story 1.2 deletion — create it for migration tests
    mkdirSync(RALPH_DIR, { recursive: true });
    removeOldFiles();
  });

  afterEach(() => {
    restoreOriginals();
  });

  it('returns fail when no old files exist', () => {
    const result = migrateFromOldFormat();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('No old format files');
    }
  });

  it('migrates story retries into attempts', () => {
    writeFileSync(
      REAL_RETRIES,
      'story-a 3\nstory-b 1\n',
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['story-a'].attempts).toBe(3);
      expect(result.data.stories['story-b'].attempts).toBe(1);
    }
  });

  it('migrates sprint-status.yaml into story statuses', () => {
    writeFileSync(
      REAL_YAML,
      [
        '# Sprint Status',
        'development_status:',
        '  epic-1: done',
        '  1-1-result-type: done',
        '  1-2-module-skeleton: backlog',
        '  2-1-sprint-state: in-progress',
      ].join('\n'),
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['1-1-result-type'].status).toBe('done');
      expect(result.data.stories['1-2-module-skeleton'].status).toBe('backlog');
      expect(result.data.stories['2-1-sprint-state'].status).toBe('in-progress');
      // epic-level entries should be skipped
      expect(result.data.stories['epic-1']).toBeUndefined();
    }
  });

  it('migrates ralph/status.json into run section', () => {
    writeFileSync(
      REAL_STATUS,
      JSON.stringify({
        loop_count: 5,
        stories_total: 25,
        stories_completed: 3,
        elapsed_seconds: 1200,
        status: 'running',
      }),
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.run.iteration).toBe(5);
      expect(result.data.run.active).toBe(true);
    }
  });

  it('migrates flagged stories as blocked', () => {
    writeFileSync(REAL_FLAGGED, 'story-x\nstory-y\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['story-x'].status).toBe('blocked');
      expect(result.data.stories['story-y'].status).toBe('blocked');
    }
  });

  it('migrates session issues into action items', () => {
    writeFileSync(
      REAL_ISSUES,
      [
        '# Session Issues',
        '',
        '### story-abc — dev-story (2026-03-18)',
        '',
        '- Something went wrong',
        '- Another concern',
        '',
        '### story-def — code-review (2026-03-18)',
        '',
        '- Review finding',
      ].join('\n'),
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionItems.length).toBe(3);
      expect(result.data.actionItems[0].story).toBe('story-abc');
      expect(result.data.actionItems[0].description).toBe('Something went wrong');
      expect(result.data.actionItems[2].story).toBe('story-def');
    }
  });

  it('handles missing old files gracefully (partial migration)', () => {
    // Only retries file exists
    writeFileSync(REAL_RETRIES, 'only-story 2\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['only-story'].attempts).toBe(2);
      expect(result.data.run.active).toBe(false); // no status.json
    }
  });

  it('writes sprint-state.json after migration', () => {
    writeFileSync(REAL_RETRIES, 'migrated-story 1\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    expect(existsSync(STATE_FILE)).toBe(true);
  });

  it('handles invalid JSON in ralph/status.json gracefully', () => {
    writeFileSync(REAL_STATUS, '{not valid json!!!', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.run.active).toBe(false);
      expect(result.data.run.iteration).toBe(0);
    }
  });

  it('handles retries file with malformed lines', () => {
    writeFileSync(
      REAL_RETRIES,
      'story-a 3\nmalformed-no-count\n\nstory-b notanumber\nstory-c 5\n',
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stories['story-a'].attempts).toBe(3);
      expect(result.data.stories['story-c'].attempts).toBe(5);
      expect(result.data.stories['malformed-no-count']).toBeUndefined();
      expect(result.data.stories['story-b']).toBeUndefined();
    }
  });

  it('computes sprint counts correctly', () => {
    writeFileSync(
      REAL_YAML,
      [
        'development_status:',
        '  s1: done',
        '  s2: done',
        '  s3: failed',
        '  s4: blocked',
        '  s5: backlog',
      ].join('\n'),
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sprint.total).toBe(5);
      expect(result.data.sprint.done).toBe(2);
      expect(result.data.sprint.failed).toBe(1);
      expect(result.data.sprint.blocked).toBe(1);
    }
  });

  it('outputs version 2 from migrateFromOldFormat', () => {
    writeFileSync(REAL_RETRIES, 'story-a 1\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(2);
    }
  });

  it('populates v2 retries field from .story_retries', () => {
    writeFileSync(REAL_RETRIES, 'story-a 3\nstory-b 1\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retries).toEqual({ 'story-a': 3, 'story-b': 1 });
    }
  });

  it('populates v2 flagged field from .flagged_stories', () => {
    writeFileSync(REAL_FLAGGED, 'story-x\nstory-y\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.flagged).toEqual(['story-x', 'story-y']);
    }
  });

  it('populates v2 session from ralph/status.json', () => {
    writeFileSync(
      REAL_STATUS,
      JSON.stringify({
        loop_count: 3,
        elapsed_seconds: 3698,
        status: 'running',
      }),
      'utf-8',
    );

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session.active).toBe(true);
      expect(result.data.session.iteration).toBe(3);
      expect(result.data.session.elapsedSeconds).toBe(3698);
    }
  });

  it('initializes v2 epics as empty and observability as null', () => {
    writeFileSync(REAL_RETRIES, 'story-a 1\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.epics).toEqual({});
      expect(result.data.observability).toEqual({
        statementCoverage: null,
        branchCoverage: null,
        functionCoverage: null,
        lineCoverage: null,
      });
    }
  });

  it('does NOT delete .story_retries or .flagged_stories after migration', () => {
    writeFileSync(REAL_RETRIES, 'story-a 1\n', 'utf-8');
    writeFileSync(REAL_FLAGGED, 'story-b\n', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    // Files should still exist (deletion deferred to story 11-3)
    expect(existsSync(REAL_RETRIES)).toBe(true);
    expect(existsSync(REAL_FLAGGED)).toBe(true);
  });
});

// ─── migrateV1ToV2 ──────────────────────────────────────────────────────────

describe('migrateV1ToV2', () => {
  beforeEach(() => {
    saveOriginals();
    // ralph/ may not exist after Story 1.2 deletion — create it for migration tests
    mkdirSync(RALPH_DIR, { recursive: true });
    removeOldFiles();
  });

  afterEach(() => {
    restoreOriginals();
  });

  it('converts v1 state with retries/flagged files to v2', () => {
    writeFileSync(REAL_RETRIES, '10-3-python-provider 2\n10-5-migrate-consumers 1\n', 'utf-8');
    writeFileSync(REAL_FLAGGED, '9-5-multi-stack\n10-3-python-provider\n', 'utf-8');

    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 5, done: 3, failed: 0, blocked: 0, inProgress: null },
      stories: {
        'story-a': { status: 'done', attempts: 1, lastAttempt: null, lastError: null, proofPath: null, acResults: null },
      },
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.retries).toEqual({ '10-3-python-provider': 2, '10-5-migrate-consumers': 1 });
    expect(v2.flagged).toEqual(['9-5-multi-stack', '10-3-python-provider']);
    expect(v2.stories).toEqual(v1.stories);
    expect(v2.sprint).toEqual(v1.sprint);
    expect(v2.run).toEqual(v1.run);
    expect(v2.actionItems).toEqual(v1.actionItems);
  });

  it('converts v1 state without retries/flagged files to v2 with empty defaults', () => {
    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.retries).toEqual({});
    expect(v2.flagged).toEqual([]);
    expect(v2.epics).toEqual({});
    expect(v2.session).toEqual({ active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 });
    expect(v2.observability).toEqual({
      statementCoverage: null,
      branchCoverage: null,
      functionCoverage: null,
      lineCoverage: null,
    });
  });

  it('reads session data from ralph/status.json during migration', () => {
    writeFileSync(
      REAL_STATUS,
      JSON.stringify({ status: 'running', loop_count: 3, elapsed_seconds: 3698 }),
      'utf-8',
    );

    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.session.active).toBe(true);
    expect(v2.session.iteration).toBe(3);
    expect(v2.session.elapsedSeconds).toBe(3698);
  });

  it('handles missing version field (treated as v1)', () => {
    // Simulate a state with no version field
    const noVersion = {
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    } as unknown as SprintStateV1;

    const v2 = migrateV1ToV2(noVersion);
    expect(v2.version).toBe(2);
    expect(v2.retries).toEqual({});
    expect(v2.flagged).toEqual([]);
  });

  it('handles retries file with malformed lines gracefully', () => {
    writeFileSync(REAL_RETRIES, 'good-story 3\nbad-line\n\nanother-bad abc\nok-story 5\n', 'utf-8');

    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.retries).toEqual({ 'good-story': 3, 'ok-story': 5 });
    // Malformed lines should be skipped
    expect(v2.retries['bad-line']).toBeUndefined();
    expect(v2.retries['another-bad']).toBeUndefined();
  });

  it('does NOT delete source files after migration', () => {
    writeFileSync(REAL_RETRIES, 'story-a 1\n', 'utf-8');
    writeFileSync(REAL_FLAGGED, 'story-b\n', 'utf-8');

    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    migrateV1ToV2(v1);
    expect(existsSync(REAL_RETRIES)).toBe(true);
    expect(existsSync(REAL_FLAGGED)).toBe(true);
  });

  it('rejects negative retry counts', () => {
    writeFileSync(REAL_RETRIES, 'story-a -1\nstory-b 3\nstory-c -99\n', 'utf-8');

    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.retries).toEqual({ 'story-b': 3 });
    expect(v2.retries['story-a']).toBeUndefined();
    expect(v2.retries['story-c']).toBeUndefined();
  });

  it('deduplicates flagged stories', () => {
    writeFileSync(REAL_FLAGGED, 'story-a\nstory-b\nstory-a\nstory-c\nstory-b\n', 'utf-8');

    const v1: SprintStateV1 = {
      version: 1,
      sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
      stories: {},
      run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [], currentStory: null, currentPhase: null, lastAction: null, acProgress: null },
      actionItems: [],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.flagged).toEqual(['story-a', 'story-b', 'story-c']);
  });
});
