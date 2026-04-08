import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SprintState } from '../../../types/state.js';

// Mock migration so tests are isolated from real project files
vi.mock('../migration.js', async () => {
  const actual = await vi.importActual<typeof import('../migration.js')>('../migration.js');
  return {
    ...actual,
    migrateFromOldFormat: vi.fn(() => ({
      success: false,
      error: 'No old format files found for migration',
    })),
    migrateV1ToV2: vi.fn((v1: Record<string, unknown>) => ({
      ...v1,
      version: 2,
      retries: {},
      flagged: [],
      epics: {},
      session: { active: false, startedAt: null, iteration: 0, elapsedSeconds: 0 },
      observability: { statementCoverage: null, branchCoverage: null, functionCoverage: null, lineCoverage: null },
    })),
  };
});

// Import after mock setup
const { reconcileState, defaultState, writeStateAtomic, getSprintState } =
  await import('../state.js');

let testDir: string;
let originalCwd: string;

function stateFile(): string {
  return join(process.cwd(), 'sprint-state.json');
}

function yamlDir(): string {
  return join(process.cwd(), '_bmad-output', 'implementation-artifacts');
}

function yamlFile(): string {
  return join(yamlDir(), 'sprint-status.yaml');
}

function ralphDir(): string {
  return join(process.cwd(), 'ralph');
}

function writeState(state: SprintState): void {
  writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf-8');
}

function readState(): SprintState {
  return JSON.parse(readFileSync(stateFile(), 'utf-8')) as SprintState;
}

function makeState(overrides: Partial<SprintState> = {}): SprintState {
  return {
    ...defaultState(),
    ...overrides,
  } as SprintState;
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-reconcile-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  // Create directories needed for YAML output and ralph files
  mkdirSync(yamlDir(), { recursive: true });
  mkdirSync(ralphDir(), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
});

describe('reconcileState', () => {
  describe('YAML regeneration on desync', () => {
    it('regenerates sprint-status.yaml from sprint-state.json (AC1)', () => {
      const state = makeState({
        stories: {
          '1-1-feature-a': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/1-1-feature-a-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
          '1-2-feature-b': {
            status: 'backlog', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        epics: {
          'epic-1': { status: 'in-progress', storiesTotal: 2, storiesDone: 1 },
        },
      });
      writeState(state);

      // Write a bogus YAML that's out of sync
      writeFileSync(yamlFile(), 'bogus: true\n', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      // YAML should be regenerated from state
      const yamlContent = readFileSync(yamlFile(), 'utf-8');
      expect(yamlContent).toContain('1-1-feature-a: done');
      expect(yamlContent).toContain('1-2-feature-b: backlog');
      expect(yamlContent).toContain('auto-generated from sprint-state.json');
    });
  });

  describe('orphaned .story_retries merged and deleted (AC3)', () => {
    it('merges retries file into state and deletes it', () => {
      const state = makeState({
        stories: {
          '2-1-foo': {
            status: 'failed', attempts: 2, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        retries: { '2-1-foo': 1 },
        epics: { 'epic-2': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 } },
      });
      writeState(state);

      // Write orphan retries file with higher count
      writeFileSync(join(ralphDir(), '.story_retries'), '2-1-foo 3\n', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.stateChanged).toBe(true);
      expect(result.data.corrections).toContain('merged .story_retries into sprint-state.json');

      // State should have merged count
      const updated = readState();
      expect(updated.retries['2-1-foo']).toBe(3);

      // File should be deleted
      expect(existsSync(join(ralphDir(), '.story_retries'))).toBe(false);
    });

    it('uses max(file_count, state_count) strategy', () => {
      const state = makeState({
        stories: {
          '3-1-bar': {
            status: 'failed', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        retries: { '3-1-bar': 5 },
        epics: { 'epic-3': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 } },
      });
      writeState(state);

      // File has lower count — state count should win
      writeFileSync(join(ralphDir(), '.story_retries'), '3-1-bar 2\n', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      // Retries should not have been lowered
      const updated = readState();
      expect(updated.retries['3-1-bar']).toBe(5);

      // File should still be deleted even when no merge needed
      expect(existsSync(join(ralphDir(), '.story_retries'))).toBe(false);
    });
  });

  describe('orphaned .flagged_stories merged and deleted (AC4)', () => {
    it('merges flagged file into state with deduplication and deletes it', () => {
      const state = makeState({
        stories: {
          '4-1-baz': {
            status: 'blocked', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
          '4-2-qux': {
            status: 'blocked', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        flagged: ['4-1-baz'],
        epics: { 'epic-4': { status: 'in-progress', storiesTotal: 2, storiesDone: 0 } },
      });
      writeState(state);

      // Orphan file has one existing and one new key
      writeFileSync(join(ralphDir(), '.flagged_stories'), '4-1-baz\n4-2-qux\n', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.stateChanged).toBe(true);
      expect(result.data.corrections).toContain('merged .flagged_stories into sprint-state.json');

      const updated = readState();
      expect(updated.flagged).toContain('4-1-baz');
      expect(updated.flagged).toContain('4-2-qux');
      // No duplicates
      expect(updated.flagged.filter(k => k === '4-1-baz').length).toBe(1);

      expect(existsSync(join(ralphDir(), '.flagged_stories'))).toBe(false);
    });
  });

  describe('missing epic entries auto-created (AC5)', () => {
    it('creates epic entries for stories with no matching epic', () => {
      const state = makeState({
        stories: {
          '5-1-alpha': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/5-1-alpha-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
          '5-2-beta': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/5-2-beta-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
          '6-1-gamma': {
            status: 'backlog', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        epics: {}, // No epic entries
      });
      writeState(state);

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.stateChanged).toBe(true);
      expect(result.data.corrections).toContain('created missing epic entry: epic-5');
      expect(result.data.corrections).toContain('created missing epic entry: epic-6');

      const updated = readState();
      expect(updated.epics['epic-5']).toEqual({
        status: 'done',
        storiesTotal: 2,
        storiesDone: 2,
      });
      expect(updated.epics['epic-6']).toEqual({
        status: 'in-progress',
        storiesTotal: 1,
        storiesDone: 0,
      });
    });

    it('does not overwrite existing epic entries', () => {
      const state = makeState({
        stories: {
          '7-1-existing': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/7-1-existing-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
        },
        epics: {
          'epic-7': { status: 'done', storiesTotal: 1, storiesDone: 1 },
        },
      });
      writeState(state);

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      // No epic corrections needed
      expect(result.data.corrections.filter(c => c.includes('epic'))).toEqual([]);
    });
  });

  describe('consistent state is a no-op (AC7)', () => {
    it('performs no writes and returns empty corrections when state is consistent', () => {
      const state = makeState({
        stories: {
          '8-1-clean': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/8-1-clean-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
        },
        epics: {
          'epic-8': { status: 'done', storiesTotal: 1, storiesDone: 1 },
        },
      });
      writeState(state);

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.stateChanged).toBe(false);
      expect(result.data.corrections).toEqual([]);
    });

    it('does not modify sprint-state.json when already consistent', () => {
      const state = makeState({
        stories: {
          '9-1-stable': {
            status: 'backlog', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        epics: {
          'epic-9': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 },
        },
      });
      writeState(state);
      const beforeContent = readFileSync(stateFile(), 'utf-8');

      reconcileState();

      const afterContent = readFileSync(stateFile(), 'utf-8');
      expect(afterContent).toBe(beforeContent);
    });

    it('reopens done stories without verification evidence back to checked', () => {
      const state = makeState({
        stories: {
          '9-1-stale': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        epics: {
          'epic-9': { status: 'done', storiesTotal: 1, storiesDone: 1 },
        },
      });
      writeState(state);

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.corrections).toContain('reopened unverified story 9-1-stale: done→checked');
      const updated = readState();
      expect(updated.stories['9-1-stale'].status).toBe('checked');
      expect(updated.epics['epic-9'].status).toBe('in-progress');
    });
  });

  describe('v1 state triggers migration (AC2)', () => {
    it('handles state without version field by triggering migration first', () => {
      // Write a v1-like state (no version field triggers migrateV1ToV2 in getSprintState)
      const v1State = {
        sprint: { total: 1, done: 0, failed: 0, blocked: 0, inProgress: null },
        stories: {
          '10-1-legacy': {
            status: 'backlog', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        run: {
          active: false, startedAt: null, iteration: 0, cost: 0,
          completed: [], failed: [],
          currentStory: null, currentPhase: null, lastAction: null, acProgress: null,
        },
        actionItems: [],
      };
      writeFileSync(stateFile(), JSON.stringify(v1State, null, 2), 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      // After reconciliation, the state should be v2
      const updated = readState();
      expect(updated.version).toBe(2);
    });
  });

  describe('malformed orphan files handled gracefully (AC9g)', () => {
    it('does not crash on malformed .story_retries file', () => {
      const state = makeState({
        stories: {
          '11-1-safe': {
            status: 'backlog', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        epics: { 'epic-11': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 } },
      });
      writeState(state);

      // Write garbage content
      writeFileSync(join(ralphDir(), '.story_retries'), '\x00\x01\x02binary garbage\n', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);

      // File should be cleaned up
      expect(existsSync(join(ralphDir(), '.story_retries'))).toBe(false);
    });

    it('does not crash on malformed .flagged_stories file', () => {
      const state = makeState({
        stories: {
          '12-1-resilient': {
            status: 'backlog', attempts: 0, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        epics: { 'epic-12': { status: 'in-progress', storiesTotal: 1, storiesDone: 0 } },
      });
      writeState(state);

      // Write empty content
      writeFileSync(join(ralphDir(), '.flagged_stories'), '', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
    });
  });

  describe('logging (AC6)', () => {
    it('includes regenerated sprint-status.yaml in corrections when changes made', () => {
      const state = makeState({
        stories: {
          '13-1-logged': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/13-1-logged-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
        },
        epics: {}, // Missing epic triggers correction
      });
      writeState(state);

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.corrections).toContain('regenerated sprint-status.yaml');
    });

    it('does not include YAML regeneration note when no corrections needed', () => {
      const state = makeState({
        stories: {
          '14-1-quiet': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: 'verification/14-1-quiet-proof.md', acResults: [{ id: 'AC1', verdict: 'pass' }], verifyVerdict: 'pass', verifyScore: 100, verifiedAt: '2026-04-08T00:00:00.000Z',
          },
        },
        epics: {
          'epic-14': { status: 'done', storiesTotal: 1, storiesDone: 1 },
        },
      });
      writeState(state);

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.corrections).not.toContain('regenerated sprint-status.yaml');
    });
  });

  describe('combined scenarios', () => {
    it('handles retries + flagged + missing epics in one pass', () => {
      const state = makeState({
        stories: {
          '15-1-multi': {
            status: 'failed', attempts: 2, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
          '15-2-multi-b': {
            status: 'done', attempts: 1, lastAttempt: null,
            lastError: null, proofPath: null, acResults: null,
          },
        },
        retries: {},
        flagged: [],
        epics: {}, // Missing
      });
      writeState(state);

      writeFileSync(join(ralphDir(), '.story_retries'), '15-1-multi 5\n', 'utf-8');
      writeFileSync(join(ralphDir(), '.flagged_stories'), '15-1-multi\n', 'utf-8');

      const result = reconcileState();
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.stateChanged).toBe(true);
      expect(result.data.corrections).toContain('merged .story_retries into sprint-state.json');
      expect(result.data.corrections).toContain('merged .flagged_stories into sprint-state.json');
      expect(result.data.corrections).toContain('created missing epic entry: epic-15');
      expect(result.data.corrections).toContain('regenerated sprint-status.yaml');

      const updated = readState();
      expect(updated.retries['15-1-multi']).toBe(5);
      expect(updated.flagged).toContain('15-1-multi');
      expect(updated.epics['epic-15']).toBeDefined();
    });
  });
});
