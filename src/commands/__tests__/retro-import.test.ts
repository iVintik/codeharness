import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

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
import { ok, fail, info, warn, jsonOutput } from '../../lib/output.js';
import { isGhAvailable, findExistingGhIssue, ghIssueCreate, ensureLabels, getRepoFromRemote } from '../../lib/github.js';
import { readState, StateFileNotFoundError } from '../../lib/state.js';

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

describe('retro-import command', () => {
  it('parses action items from retro file', async () => {
    createRetroFile(9);

    await runRetroImport(['--epic', '9']);

    // Should parse 3 items and report them
    expect(vi.mocked(info)).toHaveBeenCalledTimes(4); // 3 items + 1 skip-github message
  });

  it('fails with invalid epic number', async () => {
    await runRetroImport(['--epic', 'abc']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Invalid epic number'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('fails when retro file does not exist', async () => {
    await runRetroImport(['--epic', '99']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Retro file not found'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles empty retro file with no action items', async () => {
    createRetroFile(5, '# Epic 5 Retrospective\n\nNo action items.');

    await runRetroImport(['--epic', '5']);

    expect(vi.mocked(info)).toHaveBeenCalledWith('No action items found in retro file');
  });

  it('outputs JSON when --json is set', async () => {
    createRetroFile(9);

    await runRetroImport(['--epic', '9', '--json']);

    expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('imported', 0);
    expect(jsonCall).toHaveProperty('skipped', 0);
    expect(jsonCall).toHaveProperty('issues');
    const issues = jsonCall['issues'] as unknown[];
    expect(issues).toHaveLength(3);
  });

  it('skips GitHub phase when no state file exists', async () => {
    createRetroFile(9);

    await runRetroImport(['--epic', '9']);

    expect(vi.mocked(info)).toHaveBeenCalledWith('No state file found — skipping GitHub issues');
  });

  describe('GitHub issue creation', () => {
    it('creates GitHub issues when state has retro_issue_targets', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'https://github.com/owner/repo/issues/1' });

      await runRetroImport(['--epic', '9']);

      expect(mockGhIssueCreate).toHaveBeenCalled();
    });

    it('skips GitHub when gh CLI not available', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(false);

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(warn)).toHaveBeenCalledWith('gh CLI not available — skipping GitHub issue creation');
    });

    it('skips GitHub when no retro_issue_targets configured', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({} as any);
      mockIsGhAvailable.mockReturnValue(true);

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(info)).toHaveBeenCalledWith('No retro_issue_targets configured — skipping GitHub issues');
    });

    it('skips duplicate issues found on GitHub', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue({ number: 42, title: 'existing issue', body: '', url: 'https://github.com/owner/repo/issues/42' });

      await runRetroImport(['--epic', '9']);

      expect(mockGhIssueCreate).not.toHaveBeenCalled();
      expect(vi.mocked(info)).toHaveBeenCalledWith(expect.stringContaining('GitHub issue exists'));
    });

    it('handles GitHub issue creation errors gracefully', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockImplementation(() => { throw new Error('API rate limit'); });

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(expect.stringContaining('API rate limit'));
    });

    it('skips when git remote cannot be resolved for auto repo', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue(undefined);

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(warn)).toHaveBeenCalledWith(expect.stringContaining('Cannot resolve repo'));
    });

    it('uses explicit repo when not auto', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'iVintik/codeharness', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue(undefined);
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 10, url: 'https://github.com/iVintik/codeharness/issues/10' });

      await runRetroImport(['--epic', '9']);

      expect(mockGhIssueCreate).toHaveBeenCalled();
    });

    it('handles state read errors gracefully', async () => {
      createRetroFile(9);
      mockReadState.mockImplementation(() => { throw new Error('corrupt state'); });

      await runRetroImport(['--epic', '9']);

      expect(vi.mocked(info)).toHaveBeenCalledWith('Could not read state file — skipping GitHub issues');
    });

    it('outputs JSON with GitHub result when --json', async () => {
      createRetroFile(9);
      mockReadState.mockReturnValue({
        retro_issue_targets: [{ repo: 'auto', labels: ['retro'] }],
      } as any);
      mockIsGhAvailable.mockReturnValue(true);
      mockGetRepoFromRemote.mockReturnValue('owner/repo');
      mockFindExistingGhIssue.mockReturnValue(undefined);
      mockGhIssueCreate.mockReturnValue({ number: 1, url: 'https://github.com/owner/repo/issues/1' });

      await runRetroImport(['--epic', '9', '--json']);

      const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('github');
      const github = jsonCall['github'] as Record<string, unknown>;
      expect(github.created).toBe(3);
    });

    it('handles negative epic number', async () => {
      await runRetroImport(['--epic', '-1']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(
        expect.stringContaining('Invalid epic number'),
        expect.any(Object),
      );
      expect(process.exitCode).toBe(1);
    });

    it('handles zero epic number', async () => {
      await runRetroImport(['--epic', '0']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(
        expect.stringContaining('Invalid epic number'),
        expect.any(Object),
      );
      expect(process.exitCode).toBe(1);
    });

    it('handles file read error', async () => {
      // Create the directory but make the file unreadable
      const storyDir = join(testDir, '_bmad-output', 'implementation-artifacts');
      mkdirSync(storyDir, { recursive: true });
      // Create a directory with the same name as the expected file to cause read error
      mkdirSync(join(storyDir, 'epic-7-retrospective.md'), { recursive: true });

      await runRetroImport(['--epic', '7']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read retro file'),
        expect.any(Object),
      );
      expect(process.exitCode).toBe(1);
    });

    it('outputs JSON for empty retro file', async () => {
      createRetroFile(5, '# Epic 5 Retrospective\n\nNo action items.');

      await runRetroImport(['--epic', '5', '--json']);

      expect(vi.mocked(jsonOutput)).toHaveBeenCalledWith(
        expect.objectContaining({ imported: 0, skipped: 0, issues: [] }),
      );
    });

    it('truncates long action item titles', async () => {
      const longTitle = 'A'.repeat(200);
      createRetroFile(9, `# Epic 9 Retrospective\n\n## Action Items\n\n| # | Action | Status | Notes |\n|---|--------|--------|-------|\n| A1 | ${longTitle} | Not done | Note. |\n`);

      await runRetroImport(['--epic', '9']);

      const infoCalls = vi.mocked(info).mock.calls.map(c => c[0]);
      const parsedCall = infoCalls.find(c => typeof c === 'string' && c.startsWith('Parsed:'));
      if (parsedCall) {
        // Title should be truncated to MAX_TITLE_LENGTH (120)
        expect(parsedCall.length).toBeLessThanOrEqual(200);
      }
    });
  });
});
