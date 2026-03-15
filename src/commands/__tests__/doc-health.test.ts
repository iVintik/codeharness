import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock the doc-health library
vi.mock('../../lib/doc-health.js', () => ({
  scanDocHealth: vi.fn(),
  checkStoryDocFreshness: vi.fn(),
  printDocHealthOutput: vi.fn(),
}));

vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

import { registerDocHealthCommand } from '../doc-health.js';
import {
  scanDocHealth,
  checkStoryDocFreshness,
  printDocHealthOutput,
} from '../../lib/doc-health.js';
import { ok, fail, warn, info, jsonOutput } from '../../lib/output.js';
import type { DocHealthReport } from '../../lib/doc-health.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = realpathSync(mkdtempSync(join(tmpdir(), 'ch-doc-health-cmd-test-')));
  originalCwd = process.cwd();
  process.chdir(testDir);
  process.exitCode = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  rmSync(testDir, { recursive: true, force: true });
});

function makeReport(overrides: Partial<DocHealthReport> = {}): DocHealthReport {
  return {
    documents: [
      {
        path: 'AGENTS.md',
        grade: 'fresh',
        lastModified: new Date('2024-01-01'),
        codeLastModified: new Date('2024-01-01'),
        reason: 'Up to date',
      },
    ],
    summary: { fresh: 1, stale: 0, missing: 0, total: 1 },
    passed: true,
    scanDurationMs: 10,
    ...overrides,
  };
}

async function runDocHealthCmd(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerDocHealthCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'doc-health', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('doc-health command', () => {
  it('calls scanDocHealth for full scan', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(makeReport());

    await runDocHealthCmd([]);

    expect(scanDocHealth).toHaveBeenCalledWith(testDir);
    expect(printDocHealthOutput).toHaveBeenCalled();
  });

  it('calls checkStoryDocFreshness with --story flag', async () => {
    vi.mocked(checkStoryDocFreshness).mockReturnValue(makeReport());

    await runDocHealthCmd(['--story', 'test-story']);

    expect(checkStoryDocFreshness).toHaveBeenCalledWith('test-story', testDir);
    expect(scanDocHealth).not.toHaveBeenCalled();
  });

  it('outputs JSON with --json flag', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(makeReport());

    await runDocHealthCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        documents: expect.any(Array),
        summary: expect.objectContaining({ fresh: 1 }),
      }),
    );
  });

  it('JSON output has correct structure', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(makeReport());

    await runDocHealthCmd(['--json']);

    const call = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(call).toHaveProperty('status');
    expect(call).toHaveProperty('documents');
    expect(call).toHaveProperty('summary');
    expect(call).toHaveProperty('scanDurationMs');
  });

  it('sets exit code 0 for healthy docs', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(makeReport());

    await runDocHealthCmd([]);

    expect(process.exitCode).toBeUndefined();
  });

  it('sets exit code 1 for stale docs', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(
      makeReport({
        passed: false,
        summary: { fresh: 0, stale: 1, missing: 0, total: 1 },
      }),
    );

    await runDocHealthCmd([]);

    expect(process.exitCode).toBe(1);
  });

  it('sets exit code 1 for missing docs', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(
      makeReport({
        passed: false,
        summary: { fresh: 0, stale: 0, missing: 1, total: 1 },
      }),
    );

    await runDocHealthCmd([]);

    expect(process.exitCode).toBe(1);
  });

  it('JSON output reports status fail for stale docs', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(
      makeReport({
        passed: false,
        summary: { fresh: 0, stale: 1, missing: 0, total: 1 },
      }),
    );

    await runDocHealthCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fail' }),
    );
  });

  it('handles scan errors gracefully', async () => {
    vi.mocked(scanDocHealth).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    await runDocHealthCmd([]);

    expect(fail).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
    expect(process.exitCode).toBe(1);
  });

  it('handles scan errors in JSON mode', async () => {
    vi.mocked(scanDocHealth).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    await runDocHealthCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('Permission denied'),
      }),
    );
  });

  it('shows --fix warning', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(makeReport());

    await runDocHealthCmd(['--fix']);

    expect(warn).toHaveBeenCalledWith('--fix is not yet implemented');
  });

  it('prints story ID when --story is used', async () => {
    vi.mocked(checkStoryDocFreshness).mockReturnValue(makeReport());

    await runDocHealthCmd(['--story', 'my-story']);

    expect(info).toHaveBeenCalledWith('Story: my-story');
  });

  it('serializes dates as ISO strings in JSON output', async () => {
    vi.mocked(scanDocHealth).mockReturnValue(makeReport());

    await runDocHealthCmd(['--json']);

    const call = vi.mocked(jsonOutput).mock.calls[0][0] as { documents: Array<{ lastModified: string | null }> };
    const doc = call.documents[0];
    // Should be ISO string, not Date object
    expect(typeof doc.lastModified).toBe('string');
  });
});
