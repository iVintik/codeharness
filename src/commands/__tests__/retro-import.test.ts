import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock beads module
vi.mock('../../lib/beads.js', () => ({
  createOrFindIssue: vi.fn(),
  buildGapId: vi.fn((category: string, identifier: string) => `[gap:${category}:${identifier}]`),
}));

// Mock output module
vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

import { registerRetroImportCommand } from '../retro-import.js';
import { createOrFindIssue, buildGapId } from '../../lib/beads.js';
import { ok, fail, info, jsonOutput } from '../../lib/output.js';

const mockCreateOrFindIssue = vi.mocked(createOrFindIssue);
const mockBuildGapId = vi.mocked(buildGapId);

let testDir: string;
let originalCwd: string;

const RETRO_CONTENT = `
# Epic 9 Retrospective

## Epic 8 Retro Action Item Status

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Cover run.ts action handler (lines 110-276) | Not done | Permanent technical debt. |
| A2 | Fix harness initialization bug | Not done | Needs attention. |
| A3 | Raise overall branch coverage | Regressed | Dropped below target. |

**Summary:** 0 of 3 resolved.
`;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-retro-import-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  process.exitCode = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  rmSync(testDir, { recursive: true, force: true });
});

function createRetroFile(epicNum: number, content?: string): void {
  const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
  mkdirSync(storyDir, { recursive: true });
  writeFileSync(
    join(storyDir, `epic-${epicNum}-retrospective.md`),
    content ?? RETRO_CONTENT,
  );
}

async function runRetroImport(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerRetroImportCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'retro-import', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

// ─── Successful import ──────────────────────────────────────────────────

describe('retro-import command', () => {
  it('imports action items as beads issues', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '9']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledTimes(3);
    expect(vi.mocked(ok)).toHaveBeenCalledTimes(3);
    expect(process.exitCode).toBeUndefined();
  });

  it('passes correct gap-id format to createOrFindIssue', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '9']);

    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-9-item-A1');
    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-9-item-A2');
    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-9-item-A3');
  });

  // ─── Dedup skipping ────────────────────────────────────────────────────

  it('skips existing issues and prints info message', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: false,
    });

    await runRetroImport(['--epic', '9']);

    expect(vi.mocked(info)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(ok)).not.toHaveBeenCalled();
    // Verify the info messages contain "Skipping existing:"
    for (const call of vi.mocked(info).mock.calls) {
      expect(call[0]).toContain('Skipping existing:');
    }
  });

  // ─── JSON output ──────────────────────────────────────────────────────

  it('outputs JSON format when --json flag is set', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue
      .mockReturnValueOnce({
        issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
        created: true,
      })
      .mockReturnValueOnce({
        issue: { id: '2', title: 'test2', status: 'open', type: 'task', priority: 2 },
        created: false,
      })
      .mockReturnValueOnce({
        issue: { id: '3', title: 'test3', status: 'open', type: 'task', priority: 2 },
        created: true,
      });

    await runRetroImport(['--epic', '9', '--json']);

    expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('imported', 2);
    expect(jsonCall).toHaveProperty('skipped', 1);
    expect(jsonCall).toHaveProperty('issues');
    const issues = jsonCall['issues'] as unknown[];
    expect(issues).toHaveLength(3);
  });

  // ─── Missing retro file ───────────────────────────────────────────────

  it('fails when retro file does not exist', async () => {
    // Don't create any retro file
    mkdirSync(join(testDir, '_bmad-output', 'implementation-artifacts'), { recursive: true });

    await runRetroImport(['--epic', '5']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Retro file not found'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  // ─── Invalid epic number ──────────────────────────────────────────────

  it('fails with invalid epic number (zero)', async () => {
    await runRetroImport(['--epic', '0']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Invalid epic number'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails with invalid epic number (negative)', async () => {
    await runRetroImport(['--epic', '-1']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Invalid epic number'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails with non-numeric epic number', async () => {
    await runRetroImport(['--epic', 'abc']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Invalid epic number'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  // ─── Read error handling ────────────────────────────────────────────

  it('reports read errors gracefully', async () => {
    // Create the directory but make the file unreadable by writing
    // a directory where the file is expected (can't readFileSync a dir)
    const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
    mkdirSync(storyDir, { recursive: true });
    // Create the retro file as a directory to trigger a read error
    mkdirSync(join(storyDir, 'epic-99-retrospective.md'), { recursive: true });

    await runRetroImport(['--epic', '99']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read retro file'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  // ─── Gap-id format ────────────────────────────────────────────────────

  it('generates gap-id in format [gap:retro:epic-N-item-M]', async () => {
    createRetroFile(7, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Test item | Done | Ok. |
`);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '7']);

    expect(mockBuildGapId).toHaveBeenCalledWith('retro', 'epic-7-item-A1');
  });

  // ─── No action items ─────────────────────────────────────────────────

  it('handles retro file with no action items', async () => {
    createRetroFile(9, `
# Epic 9 Retrospective

## What Went Well

Everything was fine.
`);

    await runRetroImport(['--epic', '9']);

    expect(mockCreateOrFindIssue).not.toHaveBeenCalled();
    expect(vi.mocked(info)).toHaveBeenCalledWith('No action items found in retro file');
  });

  it('outputs JSON for empty action items with --json', async () => {
    createRetroFile(9, `
# Epic 9 Retrospective

Nothing here.
`);

    await runRetroImport(['--epic', '9', '--json']);

    expect(vi.mocked(jsonOutput)).toHaveBeenCalledWith({
      imported: 0,
      skipped: 0,
      issues: [],
    });
  });

  // ─── createOrFindIssue error handling ─────────────────────────────────

  it('handles createOrFindIssue failure gracefully', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockImplementation(() => {
      throw new Error('bd command failed');
    });

    await runRetroImport(['--epic', '9']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Failed to import A1'),
      expect.any(Object),
    );
  });

  it('handles createOrFindIssue failure in JSON mode', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockImplementation(() => {
      throw new Error('bd command failed');
    });

    await runRetroImport(['--epic', '9', '--json']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Failed to import A1'),
      { json: true },
    );
    // JSON output should still be emitted for the final result
    expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('imported', 0);
    expect(jsonCall).toHaveProperty('skipped', 0);
  });

  it('handles non-Error exceptions from createOrFindIssue', async () => {
    createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Single item | Done | Ok. |
`);
    mockCreateOrFindIssue.mockImplementation(() => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    });

    await runRetroImport(['--epic', '9']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('string error'),
      expect.any(Object),
    );
  });

  // ─── Classification in issue description ──────────────────────────────

  it('includes classification in issue description', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '9']);

    // A2 mentions "harness" so classification should be "harness"
    const secondCall = mockCreateOrFindIssue.mock.calls[1];
    const opts = secondCall[2];
    expect(opts?.description).toContain('Classification: harness');
  });

  // ─── Priority derivation ─────────────────────────────────────────────

  it('sets priority 1 for regressed items', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '9']);

    // A3 is "Regressed" -> priority 1
    const thirdCall = mockCreateOrFindIssue.mock.calls[2];
    const opts = thirdCall[2];
    expect(opts?.priority).toBe(1);
  });

  it('sets priority 2 for standard not-done items', async () => {
    createRetroFile(9);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '9']);

    // A1 is "Not done" with no urgency -> priority 2
    const firstCall = mockCreateOrFindIssue.mock.calls[0];
    const opts = firstCall[2];
    expect(opts?.priority).toBe(2);
  });

  // ─── Tool classification in description ─────────────────────────────

  it('includes tool classification string for tool-matching items', async () => {
    createRetroFile(8, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix showboat verification flow | Not done | Needs work. |
`);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '8']);

    const firstCall = mockCreateOrFindIssue.mock.calls[0];
    const opts = firstCall[2];
    expect(opts?.description).toContain('Classification: tool:showboat');
  });

  // ─── Title truncation ────────────────────────────────────────────────

  it('truncates long action item descriptions in titles', async () => {
    const longDesc = 'A'.repeat(200);
    createRetroFile(8, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | ${longDesc} | Not done | Long. |
`);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runRetroImport(['--epic', '8']);

    const firstCall = mockCreateOrFindIssue.mock.calls[0];
    const title = firstCall[0];
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title).toMatch(/\.\.\.$/);
  });
});
