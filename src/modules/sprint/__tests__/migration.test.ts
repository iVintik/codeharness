import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { migrateFromOldFormat } from '../migration.js';

const ROOT = process.cwd();
const STATE_FILE = join(ROOT, 'sprint-state.json');
const TMP_FILE = join(ROOT, '.sprint-state.json.tmp');
const RALPH_DIR = join(ROOT, 'ralph');
const BMAD_DIR = join(
  ROOT,
  '_bmad-output',
  'implementation-artifacts',
);

// Paths to old files (use test-specific versions to not conflict with real files)
const RETRIES_FILE = join(RALPH_DIR, '.story_retries_test');
const FLAGGED_FILE = join(RALPH_DIR, '.flagged_stories_test');
const STATUS_FILE = join(RALPH_DIR, 'status_test.json');
const YAML_FILE = join(BMAD_DIR, 'sprint-status-test.yaml');
const ISSUES_FILE = join(BMAD_DIR, '.session-issues-test.md');

// We need to test with actual old file paths, so we'll create/cleanup them
const REAL_RETRIES = join(RALPH_DIR, '.story_retries');
const REAL_FLAGGED = join(RALPH_DIR, '.flagged_stories');
const REAL_STATUS = join(RALPH_DIR, 'status.json');
const REAL_YAML = join(BMAD_DIR, 'sprint-status.yaml');
const REAL_ISSUES = join(BMAD_DIR, '.session-issues.md');

// Store original contents for restoration
let originalRetries: string | null = null;
let originalFlagged: string | null = null;
let originalStatus: string | null = null;
let originalYaml: string | null = null;
let originalIssues: string | null = null;

function readSafe(path: string): string | null {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

function saveOriginals(): void {
  originalRetries = readSafe(REAL_RETRIES);
  originalFlagged = readSafe(REAL_FLAGGED);
  originalStatus = readSafe(REAL_STATUS);
  originalYaml = readSafe(REAL_YAML);
  originalIssues = readSafe(REAL_ISSUES);
}

function restoreOriginals(): void {
  // Clean up sprint-state.json
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE);

  // Restore originals
  if (originalRetries !== null) writeFileSync(REAL_RETRIES, originalRetries, 'utf-8');
  if (originalFlagged !== null) writeFileSync(REAL_FLAGGED, originalFlagged, 'utf-8');
  if (originalStatus !== null) writeFileSync(REAL_STATUS, originalStatus, 'utf-8');
  if (originalYaml !== null) writeFileSync(REAL_YAML, originalYaml, 'utf-8');
  if (originalIssues !== null) writeFileSync(REAL_ISSUES, originalIssues, 'utf-8');
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
    // Remove old files so we control exactly what's present
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
    // Write invalid JSON to status.json — parseRalphStatus should catch and return null
    writeFileSync(REAL_STATUS, '{not valid json!!!', 'utf-8');

    const result = migrateFromOldFormat();
    expect(result.success).toBe(true);
    if (result.success) {
      // Should fall back to default run section
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
      // malformed-no-count has only 1 part, should be skipped
      expect(result.data.stories['malformed-no-count']).toBeUndefined();
      // notanumber is NaN, should be skipped
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
});
