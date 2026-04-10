import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeTelemetryEntry,
  readTelemetryForEpic,
} from '../telemetry-writer.js';
import type { TelemetryEntry } from '../telemetry-writer.js';
import type { TaskContext } from '../null-task-registry.js';
import { getNullTask } from '../null-task-registry.js';
import { writeTelemetryEntry as realWriteTelemetryEntry } from '../telemetry-writer.js';

// --- Helpers ---

function makeTmpDir(): string {
  const dir = join(tmpdir(), `telemetry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeCtx(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    storyKey: '16-3-telemetry-writer',
    taskName: 'telemetry',
    cost: 0.42,
    durationMs: 12345,
    outputContract: null,
    projectDir: '/tmp/test',
    ...overrides,
  };
}

function readTelemetryFile(projectDir: string): string {
  return readFileSync(join(projectDir, '.codeharness', 'telemetry.jsonl'), 'utf-8');
}

describe('telemetry-writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeTelemetryEntry', () => {
    it('creates .codeharness/ directory if missing', async () => {
      const ctx = makeCtx({ projectDir: tmpDir });
      await writeTelemetryEntry(ctx);
      expect(existsSync(join(tmpDir, '.codeharness'))).toBe(true);
    });

    it('appends one valid NDJSON line per call', async () => {
      const ctx = makeCtx({ projectDir: tmpDir });
      await writeTelemetryEntry(ctx);
      const content = readTelemetryFile(tmpDir);
      const lines = content.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(1);
      // Verify it's valid JSON
      expect(() => JSON.parse(lines[0])).not.toThrow();
    });

    it('entry contains all required fields with correct types', async () => {
      const ctx = makeCtx({
        projectDir: tmpDir,
        outputContract: {
          version: 1,
          taskName: 'implement',
          storyId: '16-3',
          driver: 'claude-code',
          model: 'claude-sonnet-4-20250514',
          timestamp: '2026-04-03T00:00:00.000Z',
          cost_usd: 0.10,
          duration_ms: 5000,
          changedFiles: ['src/lib/telemetry-writer.ts'],
          testResults: { passed: 10, failed: 0, coverage: 95.5 },
          output: 'done',
          acceptanceCriteria: [{ id: 'AC1', description: 'writes telemetry', status: 'passed' }],
        },
      });

      await writeTelemetryEntry(ctx);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());

      expect(entry.version).toBe(1);
      expect(typeof entry.timestamp).toBe('string');
      // Verify ISO 8601 format
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
      expect(entry.storyKey).toBe('16-3-telemetry-writer');
      expect(entry.epicId).toBe('16');
      expect(typeof entry.duration_ms).toBe('number');
      expect(entry.duration_ms).toBe(12345);
      expect(entry.cost_usd).toBe(0.42);
      expect(entry.attempts).toBeNull();
      expect(Array.isArray(entry.acResults)).toBe(true);
      expect(entry.acResults).toHaveLength(1);
      expect(entry.acResults![0]).toEqual({ id: 'AC1', description: 'writes telemetry', status: 'passed' });
      expect(entry.filesChanged).toEqual(['src/lib/telemetry-writer.ts']);
      expect(entry.testResults).toEqual({ passed: 10, failed: 0, coverage: 95.5 });
      expect(Array.isArray(entry.errors)).toBe(true);
      expect(entry.errors).toHaveLength(0);
    });

    it('version field is 1 in every entry', async () => {
      const ctx = makeCtx({ projectDir: tmpDir });
      await writeTelemetryEntry(ctx);
      await writeTelemetryEntry(ctx);
      const lines = readTelemetryFile(tmpDir).split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const entry = JSON.parse(line);
        expect(entry.version).toBe(1);
      }
    });

    it('version is the first field in serialized JSON', async () => {
      const ctx = makeCtx({ projectDir: tmpDir });
      await writeTelemetryEntry(ctx);
      const line = readTelemetryFile(tmpDir).trim();
      expect(line.startsWith('{"version":1,')).toBe(true);
    });

    it('unavailable fields are null when no output contract', async () => {
      const ctx = makeCtx({ projectDir: tmpDir, outputContract: null });
      await writeTelemetryEntry(ctx);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());

      expect(entry.attempts).toBeNull();
      expect(entry.acResults).toBeNull();
      expect(entry.testResults).toBeNull();
      expect(entry.filesChanged).toEqual([]);
      expect(entry.errors).toEqual([]);
    });

    it('returns success with correct output message', async () => {
      const ctx = makeCtx({ projectDir: tmpDir, storyKey: '16-3-telemetry-writer' });
      const result = await writeTelemetryEntry(ctx);
      expect(result.success).toBe(true);
      expect(result.output).toBe('telemetry: entry written for 16-3-telemetry-writer');
    });

    it('extracts epicId from storyKey correctly', async () => {
      const ctx = makeCtx({ projectDir: tmpDir, storyKey: '20-1-some-feature' });
      await writeTelemetryEntry(ctx);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());
      expect(entry.epicId).toBe('20');
    });

    it('handles storyKey with no dash (returns key as epicId)', async () => {
      const ctx = makeCtx({ projectDir: tmpDir, storyKey: 'standalone' });
      await writeTelemetryEntry(ctx);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());
      expect(entry.epicId).toBe('standalone');
    });

    it('handles __run__ sentinel storyKey', async () => {
      const ctx = makeCtx({ projectDir: tmpDir, storyKey: '__run__' });
      await writeTelemetryEntry(ctx);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());
      expect(entry.epicId).toBe('unknown');
      expect(entry.targetScope).toBe('run');
    });

    it('preserves explicit epic scope in telemetry entries', async () => {
      const ctx = makeCtx({ projectDir: tmpDir, storyKey: '__epic_3__', targetScope: 'epic' });
      await writeTelemetryEntry(ctx);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());
      expect(entry.targetScope).toBe('epic');
      expect(entry.epicId).toBe('3');
    });

    it('multiple sequential writes produce multiple lines', async () => {
      const ctx1 = makeCtx({ projectDir: tmpDir, storyKey: '16-1-first' });
      const ctx2 = makeCtx({ projectDir: tmpDir, storyKey: '16-2-second' });
      const ctx3 = makeCtx({ projectDir: tmpDir, storyKey: '16-3-third' });

      await writeTelemetryEntry(ctx1);
      await writeTelemetryEntry(ctx2);
      await writeTelemetryEntry(ctx3);

      const lines = readTelemetryFile(tmpDir).split('\n').filter((l) => l.trim());
      expect(lines).toHaveLength(3);

      const entries = lines.map((l) => JSON.parse(l) as TelemetryEntry);
      expect(entries[0].storyKey).toBe('16-1-first');
      expect(entries[1].storyKey).toBe('16-2-second');
      expect(entries[2].storyKey).toBe('16-3-third');
    });

    it('completes in <10ms (performance, AC #8)', async () => {
      // Pre-create the directory so we only measure append time
      mkdirSync(join(tmpDir, '.codeharness'), { recursive: true });
      const ctx = makeCtx({ projectDir: tmpDir });

      const start = performance.now();
      await writeTelemetryEntry(ctx);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('readTelemetryForEpic', () => {
    it('filters entries by epicId', async () => {
      // Write entries for different epics
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-1-first' }));
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '17-1-other' }));
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-2-second' }));
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '18-1-another' }));

      const entries = readTelemetryForEpic('16', tmpDir);
      expect(entries).toHaveLength(2);
      expect(entries[0].storyKey).toBe('16-1-first');
      expect(entries[1].storyKey).toBe('16-2-second');
    });

    it('returns [] when file does not exist', () => {
      const entries = readTelemetryForEpic('16', tmpDir);
      expect(entries).toEqual([]);
    });

    it('returns [] when no entries match the epicId', async () => {
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '17-1-other' }));
      const entries = readTelemetryForEpic('99', tmpDir);
      expect(entries).toEqual([]);
    });

    it('skips corrupted JSON lines', async () => {
      // Write a valid entry, a corrupted line, and another valid entry
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-1-first' }));
      const filePath = join(tmpDir, '.codeharness', 'telemetry.jsonl');
      const { appendFileSync } = await import('node:fs');
      appendFileSync(filePath, 'this is not valid json\n');
      appendFileSync(filePath, '{broken json\n');
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-2-second' }));

      const entries = readTelemetryForEpic('16', tmpDir);
      expect(entries).toHaveLength(2);
      expect(entries[0].storyKey).toBe('16-1-first');
      expect(entries[1].storyKey).toBe('16-2-second');
    });

    it('preserves insertion order', async () => {
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-3-third' }));
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-1-first' }));
      await writeTelemetryEntry(makeCtx({ projectDir: tmpDir, storyKey: '16-2-second' }));

      const entries = readTelemetryForEpic('16', tmpDir);
      expect(entries).toHaveLength(3);
      expect(entries[0].storyKey).toBe('16-3-third');
      expect(entries[1].storyKey).toBe('16-1-first');
      expect(entries[2].storyKey).toBe('16-2-second');
    });
  });

  describe('null-task-registry integration', () => {
    it('registered telemetry handler calls writeTelemetryEntry (not no-op)', async () => {
      const handler = getNullTask('telemetry');
      expect(handler).toBeDefined();

      const ctx = makeCtx({ projectDir: tmpDir });
      const result = await handler!(ctx);

      expect(result.success).toBe(true);
      expect(result.output).toBe('telemetry: entry written for 16-3-telemetry-writer');

      // Verify the file was actually written (not a no-op)
      expect(existsSync(join(tmpDir, '.codeharness', 'telemetry.jsonl'))).toBe(true);
      const entry: TelemetryEntry = JSON.parse(readTelemetryFile(tmpDir).trim());
      expect(entry.storyKey).toBe('16-3-telemetry-writer');
    });

    it('registered handler is the real writeTelemetryEntry function', () => {
      const handler = getNullTask('telemetry');
      expect(handler).toBe(realWriteTelemetryEntry);
    });
  });
});
