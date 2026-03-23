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
  warn: vi.fn(),
  jsonOutput: vi.fn(),
}));

// Mock github module
vi.mock('../../lib/github.js', () => ({
  isGhAvailable: vi.fn(),
  findExistingGhIssue: vi.fn(),
  ghIssueCreate: vi.fn(),
  ensureLabels: vi.fn(),
  getRepoFromRemote: vi.fn(),
}));

// Mock state module
vi.mock('../../lib/state.js', () => ({
  readState: vi.fn(),
  StateFileNotFoundError: class StateFileNotFoundError extends Error {
    constructor() {
      super('No state file found');
      this.name = 'StateFileNotFoundError';
    }
  },
}));

import { registerRetroImportCommand } from '../retro-import.js';
import { createOrFindIssue, buildGapId } from '../../lib/beads.js';
import { ok, fail, info, warn, jsonOutput } from '../../lib/output.js';
import { isGhAvailable, findExistingGhIssue, ghIssueCreate, ensureLabels, getRepoFromRemote } from '../../lib/github.js';
import { readState, StateFileNotFoundError } from '../../lib/state.js';

const mockCreateOrFindIssue = vi.mocked(createOrFindIssue);
const mockBuildGapId = vi.mocked(buildGapId);
const mockIsGhAvailable = vi.mocked(isGhAvailable);
const mockFindExistingGhIssue = vi.mocked(findExistingGhIssue);
const mockGhIssueCreate = vi.mocked(ghIssueCreate);
const mockEnsureLabels = vi.mocked(ensureLabels);
const mockGetRepoFromRemote = vi.mocked(getRepoFromRemote);
const mockReadState = vi.mocked(readState);

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
  // Default: no state file (skips GitHub phase)
  mockReadState.mockImplementation(() => {
    throw new StateFileNotFoundError();
  });
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

    expect(vi.mocked(ok)).not.toHaveBeenCalled();
    // Check that at least 3 info calls contain "Skipping existing:"
    const skipCalls = vi.mocked(info).mock.calls.filter(c => c[0].includes('Skipping existing:'));
    expect(skipCalls).toHaveLength(3);
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

  // ─── GitHub integration tests ─────────────────────────────────────────

  describe('GitHub issue creation', () => {
    const setupBeadsSuccess = () => {
      mockCreateOrFindIssue.mockReturnValue({
        issue: { id: '1', title: 'test', status: 'open', type: 'task', priority: 2 },
        created: true,
      });
    };

    it('creates GitHub issues when retro_issue_targets is configured', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix project thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [
          { repo: 'auto', labels: ['retro-finding'] },
          { repo: 'iVintik/codeharness', labels: ['user-retro'] },
        ],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/project');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 42, url: 'https://github.com/owner/project/issues/42' });

      await runRetroImport(['--epic', '9']);

      expect(mockEnsureLabels).toHaveBeenCalled();
      expect(mockGhIssueCreate).toHaveBeenCalledTimes(1);
      expect(vi.mocked(ok)).toHaveBeenCalledWith(expect.stringContaining('GitHub issue created: owner/project#42'));
    });

    it('skips GitHub when retro_issue_targets is not configured', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
      } as ReturnType<typeof readState>);

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(info)).toHaveBeenCalledWith('No retro_issue_targets configured — skipping GitHub issues');
      expect(mockIsGhAvailable).not.toHaveBeenCalled();
    });

    it('skips GitHub when gh CLI is not available', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(false);

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(warn)).toHaveBeenCalledWith('gh CLI not available — skipping GitHub issue creation');
      expect(mockGhIssueCreate).not.toHaveBeenCalled();
    });

    it('skips duplicate GitHub issues', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue({
        number: 10,
        title: 'Existing',
        body: '<!-- gap-id: [gap:retro:epic-9-item-A1] -->',
        url: 'https://github.com/owner/repo/issues/10',
      });

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(info)).toHaveBeenCalledWith('GitHub issue exists: owner/repo#10');
      expect(mockGhIssueCreate).not.toHaveBeenCalled();
    });

    it('includes github field in JSON output', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'u' });

      await runRetroImport(['--epic', '9', '--json']);

      const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('github');
      const github = jsonCall['github'] as Record<string, unknown>;
      expect(github).toHaveProperty('created', 1);
      expect(github).toHaveProperty('skipped', 0);
      expect(github).toHaveProperty('errors', 0);
    });

    it('skips GitHub phase when no state file exists (beads still works)', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      // Default: mockReadState throws StateFileNotFoundError

      await runRetroImport(['--epic', '9']);

      // Beads import succeeds
      expect(mockCreateOrFindIssue).toHaveBeenCalledTimes(1);
      // GitHub phase skipped with info message
      expect(vi.mocked(info)).toHaveBeenCalledWith('No state file found — skipping GitHub issues');
      expect(mockGhIssueCreate).not.toHaveBeenCalled();
    });

    it('handles ghIssueCreate failure gracefully', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockImplementation(() => {
        throw new Error('API rate limit');
      });

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(
        expect.stringContaining('GitHub issue failed for A1'),
      );
    });

    it('warns when auto repo cannot be resolved', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue(undefined);

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve repo'));
    });

    it('suppresses info in JSON mode for state read errors', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockImplementation(() => {
        throw new Error('corrupted state');
      });

      await runRetroImport(['--epic', '9', '--json']);

      const infoCalls = vi.mocked(info).mock.calls.filter(c => c[0].includes('Could not read state'));
      expect(infoCalls).toHaveLength(0);
    });

    it('handles other state read errors gracefully', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockImplementation(() => {
        throw new Error('corrupted state');
      });

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(info)).toHaveBeenCalledWith('Could not read state file — skipping GitHub issues');
      expect(mockGhIssueCreate).not.toHaveBeenCalled();
    });

    it('routes project findings to non-auto target when no auto target exists', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix project thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [
          { repo: 'iVintik/codeharness', labels: ['retro-finding'] },
        ],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/project');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'u' });

      await runRetroImport(['--epic', '9']);

      // With no "auto" target, project findings go to first target
      expect(mockGhIssueCreate).toHaveBeenCalledWith(
        'iVintik/codeharness',
        expect.any(String),
        expect.any(String),
        ['retro-finding'],
      );
    });

    it('routes harness findings to non-auto target when no codeharness target exists', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix harness bug | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [
          { repo: 'other/repo', labels: ['user-retro'] },
        ],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/project');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'u' });

      await runRetroImport(['--epic', '9']);

      // Harness with no codeharness target → first non-auto target
      expect(mockGhIssueCreate).toHaveBeenCalledWith(
        'other/repo',
        expect.any(String),
        expect.any(String),
        ['user-retro'],
      );
    });

    it('routes harness findings to auto target as last fallback', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix harness bug | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [
          { repo: 'auto', labels: ['retro'] },
        ],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/project');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'u' });

      await runRetroImport(['--epic', '9']);

      // Harness with only auto target → auto fallback
      expect(mockGhIssueCreate).toHaveBeenCalledWith(
        'owner/project',
        expect.any(String),
        expect.any(String),
        ['retro'],
      );
    });

    it('suppresses warn in JSON mode when auto repo cannot be resolved', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue(undefined);

      await runRetroImport(['--epic', '9', '--json']);

      expect(vi.mocked(warn)).not.toHaveBeenCalled();
      const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
      const github = jsonCall['github'] as Record<string, unknown>;
      expect(github).toHaveProperty('errors', 1);
    });

    it('suppresses info in JSON mode for duplicate GitHub issues', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue({
        number: 10,
        title: 'Existing',
        body: '<!-- gap-id: [gap:retro:epic-9-item-A1] -->',
        url: 'https://github.com/owner/repo/issues/10',
      });

      await runRetroImport(['--epic', '9', '--json']);

      // In JSON mode, info() should not be called for existing issue
      const infoCalls = vi.mocked(info).mock.calls.filter(c => c[0].includes('GitHub issue exists'));
      expect(infoCalls).toHaveLength(0);
      const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
      const github = jsonCall['github'] as Record<string, unknown>;
      expect(github).toHaveProperty('skipped', 1);
    });

    it('includes status and notes in GitHub issue body', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix project thing | Not done | Needs attention. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [
          { repo: 'auto', labels: ['retro-finding'] },
        ],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/project');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 42, url: 'https://github.com/owner/project/issues/42' });

      await runRetroImport(['--epic', '9']);

      const createCall = mockGhIssueCreate.mock.calls[0];
      const body = createCall[2];
      expect(body).toContain('**Original status:** Not done');
      expect(body).toContain('**Notes:** Needs attention.');
      expect(body).toContain('<!-- gap-id:');
    });

    it('suppresses fail in JSON mode for GitHub creation errors', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockImplementation(() => {
        throw new Error('API rate limit');
      });

      await runRetroImport(['--epic', '9', '--json']);

      // In JSON mode, fail() should not be called for GitHub errors
      const failCalls = vi.mocked(fail).mock.calls.filter(c => c[0].includes('GitHub issue failed'));
      expect(failCalls).toHaveLength(0);
      const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
      const github = jsonCall['github'] as Record<string, unknown>;
      expect(github).toHaveProperty('errors', 1);
    });

    it('suppresses info in JSON mode when retro_issue_targets is empty', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [],
      } as ReturnType<typeof readState>);

      await runRetroImport(['--epic', '9', '--json']);

      const infoCalls = vi.mocked(info).mock.calls.filter(c => c[0].includes('No retro_issue_targets'));
      expect(infoCalls).toHaveLength(0);
      expect(mockIsGhAvailable).not.toHaveBeenCalled();
    });

    it('suppresses warn in JSON mode when gh CLI unavailable', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(false);

      await runRetroImport(['--epic', '9', '--json']);

      const warnCalls = vi.mocked(warn).mock.calls.filter(c => c[0].includes('gh CLI'));
      expect(warnCalls).toHaveLength(0);
    });

    it('suppresses ok in JSON mode for successful GitHub issue creation', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix project thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'u' });

      await runRetroImport(['--epic', '9', '--json']);

      const okCalls = vi.mocked(ok).mock.calls.filter(c => c[0].includes('GitHub issue created'));
      expect(okCalls).toHaveLength(0);
    });

    it('handles non-Error exceptions from ghIssueCreate', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix thing | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockImplementation(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(
        expect.stringContaining('string error'),
      );
    });

    it('routes harness findings to codeharness repo', async () => {
      createRetroFile(9, `
| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix harness bug | Not done | Ok. |
`);
      setupBeadsSuccess();
      mockReadState.mockReturnValue({
        harness_version: '0.1.0',
        initialized: true,
        stack: 'nodejs',
        stacks: ['nodejs'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
        verification_log: [],
        retro_issue_targets: [
          { repo: 'auto', labels: ['retro-finding'] },
          { repo: 'iVintik/codeharness', labels: ['user-retro'] },
        ],
      } as ReturnType<typeof readState>);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/project');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 5, url: 'u' });

      await runRetroImport(['--epic', '9']);

      // "harness" classification should target iVintik/codeharness
      expect(mockGhIssueCreate).toHaveBeenCalledWith(
        'iVintik/codeharness',
        expect.any(String),
        expect.any(String),
        ['user-retro'],
      );
    });
  });
});
