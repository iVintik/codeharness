import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  ghIssueSearch: vi.fn(),
  getRepoFromRemote: vi.fn(),
}));

import { registerGithubImportCommand } from '../github-import.js';
import { ok, fail, info, jsonOutput } from '../../lib/output.js';
import { isGhAvailable, ghIssueSearch, getRepoFromRemote } from '../../lib/github.js';

const mockIsGhAvailable = vi.mocked(isGhAvailable);
const mockGhIssueSearch = vi.mocked(ghIssueSearch);
const mockGetRepoFromRemote = vi.mocked(getRepoFromRemote);

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
});

async function runGithubImport(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerGithubImportCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'github-import', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

describe('github-import command', () => {
  it('fails with install message when gh is unavailable', async () => {
    mockIsGhAvailable.mockReturnValue(false);

    await runGithubImport([]);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      'gh CLI not found. Install: https://cli.github.com/',
      { json: false },
    );
    expect(process.exitCode).toBe(1);
  });

  it('uses specified repo when --repo is provided', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'owner/repo']);

    expect(mockGetRepoFromRemote).not.toHaveBeenCalled();
    expect(mockGhIssueSearch).toHaveBeenCalledWith('owner/repo', 'label:sprint-candidate');
  });

  it('auto-detects repo from git remote when --repo is omitted', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGetRepoFromRemote.mockReturnValue('detected/repo');
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport([]);

    expect(mockGetRepoFromRemote).toHaveBeenCalled();
    expect(mockGhIssueSearch).toHaveBeenCalledWith('detected/repo', 'label:sprint-candidate');
  });

  it('fails when auto-detect fails and no --repo provided', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGetRepoFromRemote.mockReturnValue(undefined);

    await runGithubImport([]);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      'Cannot detect repo. Use --repo owner/repo',
      { json: false },
    );
    expect(process.exitCode).toBe(1);
  });

  it('uses custom label when --label is provided', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r', '--label', 'needs-triage']);

    expect(mockGhIssueSearch).toHaveBeenCalledWith('o/r', 'label:needs-triage');
  });

  it('uses default label sprint-candidate when --label is omitted', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r']);

    expect(mockGhIssueSearch).toHaveBeenCalledWith('o/r', 'label:sprint-candidate');
  });

  it('parses issues and reports them in info messages', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 42, title: 'Fix bug', body: 'Description', url: 'u' },
    ]);

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(info)).toHaveBeenCalledWith('Parsed: o/r#42 — Fix bug');
  });

  it('outputs zero counts when no issues found (non-JSON)', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(info)).not.toHaveBeenCalled();
  });

  it('outputs zero counts in JSON when no issues found', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r', '--json']);

    expect(vi.mocked(jsonOutput)).toHaveBeenCalledWith({
      imported: 0,
      skipped: 0,
      errors: 0,
      issues: [],
    });
  });

  it('outputs JSON with issues fields with --json', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'New', body: '', url: 'u', labels: [{ name: 'bug' }] },
      { number: 2, title: 'Old', body: '', url: 'u' },
    ]);

    await runGithubImport(['--repo', 'o/r', '--json']);

    expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('imported', 0);
    expect(jsonCall).toHaveProperty('skipped', 0);
    expect(jsonCall).toHaveProperty('issues');
    const issues = jsonCall['issues'] as unknown[];
    expect(issues).toHaveLength(2);
  });

  it('handles ghIssueSearch failure', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockImplementation(() => {
      throw new Error('API error');
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Failed to search GitHub issues'),
      { json: false },
    );
    expect(process.exitCode).toBe(1);
  });

  it('truncates long titles to MAX_TITLE_LENGTH', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    const longTitle = 'A'.repeat(200);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: longTitle, body: '', url: 'u' },
    ]);

    await runGithubImport(['--repo', 'o/r', '--json']);

    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    const issues = jsonCall['issues'] as Array<Record<string, unknown>>;
    expect((issues[0].title as string).length).toBe(120);
    expect(issues[0].title).toMatch(/\.\.\.$/);
  });

  it('gh unavailable in JSON mode outputs JSON fail', async () => {
    mockIsGhAvailable.mockReturnValue(false);

    await runGithubImport(['--json']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      'gh CLI not found. Install: https://cli.github.com/',
      { json: true },
    );
    expect(process.exitCode).toBe(1);
  });

  it('repo auto-detect failure in JSON mode outputs JSON fail', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGetRepoFromRemote.mockReturnValue(undefined);

    await runGithubImport(['--json']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      'Cannot detect repo. Use --repo owner/repo',
      { json: true },
    );
    expect(process.exitCode).toBe(1);
  });
});
