/**
 * Tests for workflow-persistence.ts — snapshot save/load/clear + config hash.
 *
 * Story 26-1: XState snapshot persistence via getPersistedSnapshot().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { saveSnapshot, loadSnapshot, clearSnapshot, computeConfigHash, appendCheckpoint, loadCheckpointLog, clearCheckpointLog, clearAllPersistence, cleanStaleTmpFiles } from '../workflow-persistence.js';
import type { XStateWorkflowSnapshot } from '../workflow-persistence.js';
import { warn } from '../output.js';
import type { EngineConfig } from '../workflow-types.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

vi.mock('../output.js', () => ({
  warn: vi.fn(),
  info: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<EngineConfig['workflow']>): EngineConfig {
  return {
    workflow: {
      tasks: { implement: { agent: 'dev', session: 'fresh', source_access: true } },
      storyFlow: ['implement'],
      epicFlow: ['story_flow'],
      sprintFlow: [],
      execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'merge-commit', epic_strategy: 'sequential', story_strategy: 'sequential' },
      flow: ['implement'],
      ...overrides,
    },
    agents: {},
    sprintStatusPath: '/project/sprint-status.yaml',
    runId: 'test-run',
    projectDir: '/project',
  } as EngineConfig;
}

function makeValidSnapshot(): XStateWorkflowSnapshot {
  return {
    snapshot: { value: 'processingEpic', context: { tasksCompleted: 3 } },
    configHash: 'abc123def456',
    savedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('workflow-persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── computeConfigHash ──────────────────────────────────────────────

  describe('computeConfigHash', () => {
    it('returns a non-empty string', () => {
      const hash = computeConfigHash(makeConfig());
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('same config produces same hash (deterministic)', () => {
      const config = makeConfig();
      expect(computeConfigHash(config)).toBe(computeConfigHash(config));
    });

    it('two configs with identical values produce same hash', () => {
      const a = makeConfig();
      const b = makeConfig();
      expect(computeConfigHash(a)).toBe(computeConfigHash(b));
    });

    it('different task definitions produce different hashes', () => {
      const a = makeConfig();
      const b = makeConfig({
        tasks: { implement: { agent: 'qa', session: 'fresh', source_access: true } },
      });
      expect(computeConfigHash(a)).not.toBe(computeConfigHash(b));
    });

    it('different agent definitions produce different hashes', () => {
      const a = makeConfig();
      const b = {
        ...makeConfig(),
        agents: {
          dev: {
            name: 'dev',
            model: 'claude-sonnet-4-6',
            instructions: 'original',
            disallowedTools: [],
            bare: true,
          },
        },
      } as EngineConfig;
      const c = {
        ...b,
        agents: {
          dev: {
            ...b.agents.dev,
            instructions: 'changed',
          },
        },
      } as EngineConfig;

      expect(computeConfigHash(a)).not.toBe(computeConfigHash(b));
      expect(computeConfigHash(b)).not.toBe(computeConfigHash(c));
    });

    it('different storyFlow produces different hash', () => {
      const a = makeConfig({ storyFlow: ['implement'] });
      const b = makeConfig({ storyFlow: ['implement', 'verify'] });
      expect(computeConfigHash(a)).not.toBe(computeConfigHash(b));
    });

    it('produces a 64-char hex string (SHA-256)', () => {
      const hash = computeConfigHash(makeConfig());
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── saveSnapshot ──────────────────────────────────────────────────

  describe('saveSnapshot', () => {
    it('creates .codeharness directory', () => {
      saveSnapshot({ value: 'allDone' }, 'hash-abc', '/tmp/project');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/project/.codeharness', { recursive: true });
    });

    it('writes to a .tmp file first (atomic write)', () => {
      saveSnapshot({ value: 'allDone' }, 'hash-abc', '/tmp/project');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/project/.codeharness/workflow-snapshot.json.tmp',
        expect.any(String),
        'utf-8',
      );
    });

    it('renames .tmp to final path (atomic write)', () => {
      saveSnapshot({ value: 'allDone' }, 'hash-abc', '/tmp/project');
      expect(fs.renameSync).toHaveBeenCalledWith(
        '/tmp/project/.codeharness/workflow-snapshot.json.tmp',
        '/tmp/project/.codeharness/workflow-snapshot.json',
      );
    });

    it('written JSON contains snapshot, configHash, and savedAt fields', () => {
      const xstateSnapshot = { value: 'allDone', context: { tasksCompleted: 5 } };
      saveSnapshot(xstateSnapshot, 'hash-xyz', '/tmp/project');

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string) as Record<string, unknown>;
      expect(written.snapshot).toEqual(xstateSnapshot);
      expect(written.configHash).toBe('hash-xyz');
      expect(typeof written.savedAt).toBe('string');
      expect(written.savedAt).toMatch(/^\d{4}-/);
    });

    it('savedAt is a valid ISO timestamp', () => {
      const before = Date.now();
      saveSnapshot({}, 'hash-abc', '/tmp/project');
      const after = Date.now();

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string) as Record<string, unknown>;
      const ts = new Date(written.savedAt as string).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  // ── loadSnapshot ──────────────────────────────────────────────────

  describe('loadSnapshot', () => {
    it('returns null when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
    });

    it('loads valid JSON snapshot with correct shape', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-snapshot.json'));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(makeValidSnapshot()));

      const result = loadSnapshot('/tmp/project');
      expect(result).not.toBeNull();
      expect(result!.configHash).toBe('abc123def456');
      expect(result!.savedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns null for truncated/corrupt JSON and logs warning with "corrupt"', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-snapshot.json'));
      vi.mocked(fs.readFileSync).mockReturnValue('{"snapshot":{"val'); // truncated

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/corrupt/i));
    });

    it('returns null for valid JSON but wrong shape and logs warning with "invalid"', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-snapshot.json'));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ foo: 'bar' }));

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/invalid/i));
    });

    it('returns null for snapshot missing configHash and logs warning', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-snapshot.json'));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ snapshot: {}, savedAt: '2026-01-01T00:00:00Z' }));

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalled();
    });

    it('returns null for snapshot with null snapshot payload and logs warning', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-snapshot.json'));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ snapshot: null, configHash: 'abc123', savedAt: '2026-01-01T00:00:00Z' }));

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/invalid/i));
    });

    it('returns null for snapshot with invalid savedAt timestamp and logs warning', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-snapshot.json'));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ snapshot: {}, configHash: 'abc123', savedAt: 'not-a-date' }));

      const result = loadSnapshot('/tmp/project');
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/invalid/i));
    });

    it('warns about old YAML state file when snapshot does not exist', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.yaml'));

      loadSnapshot('/tmp/project');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('old workflow-state.yaml'));
    });

    it('cleans up stale .tmp file if present', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.tmp'));

      loadSnapshot('/tmp/project');
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        '/tmp/project/.codeharness/workflow-snapshot.json.tmp',
      );
    });
  });

  // ── clearSnapshot ─────────────────────────────────────────────────

  describe('clearSnapshot', () => {
    it('deletes the snapshot file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      clearSnapshot('/tmp/project');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/project/.codeharness/workflow-snapshot.json');
    });

    it('does nothing when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      clearSnapshot('/tmp/project');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  // ── checkpoint log ────────────────────────────────────────────────

  describe('checkpoint log', () => {
    describe('appendCheckpoint', () => {
      it('appends a JSONL line to the checkpoint file', () => {
        appendCheckpoint({ storyKey: 'story-1', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' }, '/tmp/project');
        expect(fs.appendFileSync).toHaveBeenCalledWith(
          '/tmp/project/.codeharness/workflow-checkpoints.jsonl',
          expect.stringMatching(/^\{.*\}\n$/),
          'utf-8',
        );
      });

      it('creates .codeharness dir if missing', () => {
        appendCheckpoint({ storyKey: 'story-1', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' }, '/tmp/project');
        expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/project/.codeharness', { recursive: true });
      });

      it('appended line is valid JSON with correct fields', () => {
        const entry = { storyKey: 'story-2', taskName: 'verify', completedAt: '2026-02-01T00:00:00.000Z', costUsd: 0.05 };
        appendCheckpoint(entry, '/tmp/project');
        const written = vi.mocked(fs.appendFileSync).mock.calls[0][1] as string;
        const parsed = JSON.parse(written.trim()) as typeof entry;
        expect(parsed.storyKey).toBe('story-2');
        expect(parsed.taskName).toBe('verify');
        expect(parsed.costUsd).toBe(0.05);
      });

      it('multiple calls append multiple lines', () => {
        appendCheckpoint({ storyKey: 'story-1', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' }, '/tmp/project');
        appendCheckpoint({ storyKey: 'story-1', taskName: 'verify', completedAt: '2026-01-01T00:01:00.000Z' }, '/tmp/project');
        expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
      });
    });

    describe('loadCheckpointLog', () => {
      it('returns empty array when file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const result = loadCheckpointLog('/tmp/project');
        expect(result).toEqual([]);
      });

      it('reads and parses valid JSONL entries', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-checkpoints.jsonl'));
        const lines = [
          JSON.stringify({ storyKey: 'story-1', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' }),
          JSON.stringify({ storyKey: 'story-1', taskName: 'verify', completedAt: '2026-01-01T00:01:00.000Z' }),
        ].join('\n') + '\n';
        vi.mocked(fs.readFileSync).mockReturnValue(lines);
        const result = loadCheckpointLog('/tmp/project');
        expect(result).toHaveLength(2);
        expect(result[0].storyKey).toBe('story-1');
        expect(result[0].taskName).toBe('implement');
        expect(result[1].taskName).toBe('verify');
      });

      it('skips corrupt (non-JSON) lines with a warning', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-checkpoints.jsonl'));
        const lines = [
          JSON.stringify({ storyKey: 'story-1', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' }),
          'NOT_VALID_JSON',
          JSON.stringify({ storyKey: 'story-2', taskName: 'verify', completedAt: '2026-01-01T00:01:00.000Z' }),
        ].join('\n') + '\n';
        vi.mocked(fs.readFileSync).mockReturnValue(lines);
        const result = loadCheckpointLog('/tmp/project');
        expect(result).toHaveLength(2);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/corrupt checkpoint entry/i));
      });

      it('returns empty array for an empty file', () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('workflow-checkpoints.jsonl'));
        vi.mocked(fs.readFileSync).mockReturnValue('');
        const result = loadCheckpointLog('/tmp/project');
        expect(result).toEqual([]);
      });
    });

    describe('clearCheckpointLog', () => {
      it('deletes the checkpoint file when it exists', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        clearCheckpointLog('/tmp/project');
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/project/.codeharness/workflow-checkpoints.jsonl');
      });

      it('does nothing when file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        clearCheckpointLog('/tmp/project');
        expect(fs.unlinkSync).not.toHaveBeenCalled();
      });
    });
  });

  // ── cleanStaleTmpFiles ────────────────────────────────────────────

  describe('cleanStaleTmpFiles', () => {
    it('deletes the .tmp file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanStaleTmpFiles('/tmp/project');
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        '/tmp/project/.codeharness/workflow-snapshot.json.tmp',
      );
    });

    it('does nothing when .tmp file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      cleanStaleTmpFiles('/tmp/project');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('swallows errors silently (best-effort)', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error('EPERM'); });

      expect(() => cleanStaleTmpFiles('/tmp/project')).not.toThrow();
    });

    it('uses cwd when no projectDir provided', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      cleanStaleTmpFiles();
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('workflow-snapshot.json.tmp'),
      );
    });
  });

  // ── clearAllPersistence ───────────────────────────────────────────
  // NOTE: unlinkSync must be explicitly mocked in each test here because
  // Vitest 4's restoreMocks:true default resets it to the real fs.unlinkSync
  // between tests. Without explicit mocking, real unlinkSync throws ENOENT
  // for non-existent test paths, which the try/catch silences — leaving
  // snapshotCleared/checkpointCleared as false.

  describe('clearAllPersistence', () => {
    it('deletes both snapshot and checkpoint files when both exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined); // ensure no-op

      const result = clearAllPersistence('/tmp/project');
      expect(result).toEqual({ snapshotCleared: true, checkpointCleared: true });
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/project/.codeharness/workflow-snapshot.json');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/project/.codeharness/workflow-checkpoints.jsonl');
    });

    it('returns snapshotCleared: false, checkpointCleared: false when neither file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      const result = clearAllPersistence('/tmp/project');
      expect(result).toEqual({ snapshotCleared: false, checkpointCleared: false });
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('also cleans the .tmp file when it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      clearAllPersistence('/tmp/project');
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        '/tmp/project/.codeharness/workflow-snapshot.json.tmp',
      );
    });

    it('continues and clears checkpoint even when snapshot unlink throws', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      let snapshotThrown = false;
      vi.mocked(fs.unlinkSync).mockImplementation((p) => {
        if (String(p).endsWith('workflow-snapshot.json') && !String(p).endsWith('.tmp')) {
          snapshotThrown = true;
          throw new Error('EPERM');
        }
      });

      const result = clearAllPersistence('/tmp/project');
      expect(snapshotThrown).toBe(true);
      expect(result.snapshotCleared).toBe(false);
      expect(result.checkpointCleared).toBe(true);
    });

    it('returns snapshotCleared: false when all unlink calls throw', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error('EACCES'); });

      const result = clearAllPersistence('/tmp/project');
      expect(result.snapshotCleared).toBe(false);
      expect(result.checkpointCleared).toBe(false);
    });
  });
});
