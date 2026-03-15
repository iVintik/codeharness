import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  ghIssueSearch: vi.fn(),
  getRepoFromRemote: vi.fn(),
}));

import { registerGithubImportCommand } from '../github-import.js';
import { createOrFindIssue, buildGapId } from '../../lib/beads.js';
import { ok, fail, info, jsonOutput } from '../../lib/output.js';
import { isGhAvailable, ghIssueSearch, getRepoFromRemote } from '../../lib/github.js';

const mockCreateOrFindIssue = vi.mocked(createOrFindIssue);
const mockBuildGapId = vi.mocked(buildGapId);
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

// ─── Task 3.1: gh unavailable ──────────────────────────────────────────────

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

  // ─── Task 3.2: --repo provided ────────────────────────────────────────

  it('uses specified repo when --repo is provided', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'owner/repo']);

    expect(mockGetRepoFromRemote).not.toHaveBeenCalled();
    expect(mockGhIssueSearch).toHaveBeenCalledWith('owner/repo', 'label:sprint-candidate');
  });

  // ─── Task 3.3: no --repo, auto-detect ─────────────────────────────────

  it('auto-detects repo from git remote when --repo is omitted', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGetRepoFromRemote.mockReturnValue('detected/repo');
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport([]);

    expect(mockGetRepoFromRemote).toHaveBeenCalled();
    expect(mockGhIssueSearch).toHaveBeenCalledWith('detected/repo', 'label:sprint-candidate');
  });

  // ─── Task 3.4: auto-detect fails ──────────────────────────────────────

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

  // ─── Task 3.5: correct gap-id format ──────────────────────────────────

  it('imports issues with correct gap-id format [source:github:owner/repo#N]', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 42, title: 'Fix bug', body: 'Description', url: 'https://github.com/o/r/issues/42' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Fix bug', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockBuildGapId).toHaveBeenCalledWith('source', 'github:o/r#42');
  });

  // ─── Task 3.6: label-to-type mapping ──────────────────────────────────

  it('maps bug label to type=bug', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Bug issue', body: '', url: 'u', labels: [{ name: 'bug' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Bug issue', status: 'open', type: 'bug', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Bug issue',
      expect.any(String),
      expect.objectContaining({ type: 'bug' }),
    );
  });

  it('maps enhancement label to type=story', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 2, title: 'Feature', body: '', url: 'u', labels: [{ name: 'enhancement' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Feature', status: 'open', type: 'story', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Feature',
      expect.any(String),
      expect.objectContaining({ type: 'story' }),
    );
  });

  it('maps unlabeled issue to type=task (default)', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 3, title: 'Task', body: '', url: 'u', labels: [{ name: 'sprint-candidate' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Task', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Task',
      expect.any(String),
      expect.objectContaining({ type: 'task' }),
    );
  });

  it('maps issue with no labels field to type=task', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 4, title: 'No labels', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'No labels', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'No labels',
      expect.any(String),
      expect.objectContaining({ type: 'task' }),
    );
  });

  // ─── Task 3.7: label-to-priority mapping ──────────────────────────────

  it('maps priority:high label to priority 1', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Urgent', body: '', url: 'u', labels: [{ name: 'priority:high' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Urgent', status: 'open', type: 'task', priority: 1 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Urgent',
      expect.any(String),
      expect.objectContaining({ priority: 1 }),
    );
  });

  it('maps priority:low label to priority 3', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Low', body: '', url: 'u', labels: [{ name: 'priority:low' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Low', status: 'open', type: 'task', priority: 3 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Low',
      expect.any(String),
      expect.objectContaining({ priority: 3 }),
    );
  });

  it('defaults to priority 2 when no priority label', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Normal', body: '', url: 'u', labels: [{ name: 'bug' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Normal', status: 'open', type: 'bug', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Normal',
      expect.any(String),
      expect.objectContaining({ priority: 2 }),
    );
  });

  // ─── Task 3.8: existing beads issue skips with info ────────────────────

  it('skips existing beads issue with matching gap-id', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 5, title: 'Existing', body: 'body', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Existing', status: 'open', type: 'task', priority: 2 },
      created: false,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(info)).toHaveBeenCalledWith('Skipping existing: o/r#5 — Existing');
    expect(vi.mocked(info)).toHaveBeenCalledWith('Summary: 0 imported, 1 skipped, 0 errors');
    expect(vi.mocked(ok)).not.toHaveBeenCalled();
  });

  // ─── Task 3.9: --json flag outputs JSON ────────────────────────────────

  it('outputs JSON with imported, skipped, issues fields with --json', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'New', body: '', url: 'u', labels: [{ name: 'bug' }] },
      { number: 2, title: 'Old', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue
      .mockReturnValueOnce({
        issue: { id: '1', title: 'New', status: 'open', type: 'bug', priority: 2 },
        created: true,
      })
      .mockReturnValueOnce({
        issue: { id: '2', title: 'Old', status: 'open', type: 'task', priority: 2 },
        created: false,
      });

    await runGithubImport(['--repo', 'o/r', '--json']);

    expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('imported', 1);
    expect(jsonCall).toHaveProperty('skipped', 1);
    expect(jsonCall).toHaveProperty('issues');
    const issues = jsonCall['issues'] as unknown[];
    expect(issues).toHaveLength(2);
  });

  // ─── Task 3.10: --json suppresses console output ──────────────────────

  it('suppresses ok/info messages in JSON mode', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'New', body: '', url: 'u' },
      { number: 2, title: 'Old', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue
      .mockReturnValueOnce({
        issue: { id: '1', title: 'New', status: 'open', type: 'task', priority: 2 },
        created: true,
      })
      .mockReturnValueOnce({
        issue: { id: '2', title: 'Old', status: 'open', type: 'task', priority: 2 },
        created: false,
      });

    await runGithubImport(['--repo', 'o/r', '--json']);

    expect(vi.mocked(ok)).not.toHaveBeenCalled();
    expect(vi.mocked(info)).not.toHaveBeenCalled();
  });

  // ─── Task 3.11: custom --label ─────────────────────────────────────────

  it('uses custom label when --label is provided', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r', '--label', 'needs-triage']);

    expect(mockGhIssueSearch).toHaveBeenCalledWith('o/r', 'label:needs-triage');
  });

  // ─── Task 3.12: no issues found ───────────────────────────────────────

  it('outputs zero counts when no issues found (non-JSON)', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).not.toHaveBeenCalled();
    expect(vi.mocked(ok)).not.toHaveBeenCalled();
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

  // ─── Task 3.13: createOrFindIssue throws ──────────────────────────────

  it('calls fail, sets exitCode, and continues when createOrFindIssue throws', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'First', body: '', url: 'u' },
      { number: 2, title: 'Second', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue
      .mockImplementationOnce(() => {
        throw new Error('bd crashed');
      })
      .mockReturnValueOnce({
        issue: { id: '2', title: 'Second', status: 'open', type: 'task', priority: 2 },
        created: true,
      });

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Failed to import o/r#1'),
      { json: false },
    );
    // Second issue should still be processed
    expect(vi.mocked(ok)).toHaveBeenCalledWith('Imported: o/r#2 — Second');
    // Exit code should be 1 due to error
    expect(process.exitCode).toBe(1);
  });

  it('handles createOrFindIssue failure in JSON mode', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'First', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockImplementation(() => {
      throw new Error('bd crashed');
    });

    await runGithubImport(['--repo', 'o/r', '--json']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('Failed to import o/r#1'),
      { json: true },
    );
    // JSON output should still be emitted
    expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('imported', 0);
    expect(jsonCall).toHaveProperty('skipped', 0);
    expect(jsonCall).toHaveProperty('errors', 1);
    expect(process.exitCode).toBe(1);
  });

  // ─── Additional edge cases ─────────────────────────────────────────────

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

  it('prints ok message for successfully imported issues in non-JSON mode', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 10, title: 'My issue', body: 'body text', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'My issue', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'owner/repo']);

    expect(vi.mocked(ok)).toHaveBeenCalledWith('Imported: owner/repo#10 — My issue');
  });

  it('uses default label sprint-candidate when --label is omitted', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([]);

    await runGithubImport(['--repo', 'o/r']);

    expect(mockGhIssueSearch).toHaveBeenCalledWith('o/r', 'label:sprint-candidate');
  });

  it('passes issue body as description to createOrFindIssue', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Issue', body: 'Detailed description', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Issue', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Issue',
      expect.any(String),
      expect.objectContaining({ description: 'Detailed description' }),
    );
  });

  it('handles issue with null body', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Issue', body: null as unknown as string, url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Issue', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue).toHaveBeenCalledWith(
      'Issue',
      expect.any(String),
      expect.objectContaining({ description: '' }),
    );
  });

  it('includes correct fields in JSON issues array', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 7, title: 'Test issue', body: '', url: 'u', labels: [{ name: 'enhancement' }] },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'Test issue', status: 'open', type: 'story', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r', '--json']);

    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    const issues = jsonCall['issues'] as Array<Record<string, unknown>>;
    expect(issues[0]).toEqual(expect.objectContaining({
      number: 7,
      title: 'Test issue',
      type: 'story',
      created: true,
    }));
    expect(issues[0]).toHaveProperty('gapId');
  });

  it('handles non-Error exceptions from createOrFindIssue', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'Issue', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockImplementation(() => {
      throw 'string error'; // eslint-disable-line no-throw-literal
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(fail)).toHaveBeenCalledWith(
      expect.stringContaining('string error'),
      expect.any(Object),
    );
    expect(process.exitCode).toBe(1);
  });

  // ─── Title truncation ──────────────────────────────────────────────────

  it('truncates long titles to MAX_TITLE_LENGTH', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    const longTitle = 'A'.repeat(200);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: longTitle, body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: longTitle, status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    const calledTitle = mockCreateOrFindIssue.mock.calls[0][0];
    expect(calledTitle).toHaveLength(120);
    expect(calledTitle).toMatch(/\.\.\.$/);
  });

  it('does not truncate titles at or below MAX_TITLE_LENGTH', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    const exactTitle = 'B'.repeat(120);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: exactTitle, body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: exactTitle, status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r']);

    expect(mockCreateOrFindIssue.mock.calls[0][0]).toBe(exactTitle);
  });

  // ─── Summary message ──────────────────────────────────────────────────

  it('prints summary message in non-JSON mode when issues exist', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'New', body: '', url: 'u' },
      { number: 2, title: 'Old', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue
      .mockReturnValueOnce({
        issue: { id: '1', title: 'New', status: 'open', type: 'task', priority: 2 },
        created: true,
      })
      .mockReturnValueOnce({
        issue: { id: '2', title: 'Old', status: 'open', type: 'task', priority: 2 },
        created: false,
      });

    await runGithubImport(['--repo', 'o/r']);

    expect(vi.mocked(info)).toHaveBeenCalledWith('Summary: 1 imported, 1 skipped, 0 errors');
  });

  // ─── JSON errors field ────────────────────────────────────────────────

  it('JSON output includes errors count', async () => {
    mockIsGhAvailable.mockReturnValue(true);
    mockGhIssueSearch.mockReturnValue([
      { number: 1, title: 'New', body: '', url: 'u' },
    ]);
    mockCreateOrFindIssue.mockReturnValue({
      issue: { id: '1', title: 'New', status: 'open', type: 'task', priority: 2 },
      created: true,
    });

    await runGithubImport(['--repo', 'o/r', '--json']);

    const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
    expect(jsonCall).toHaveProperty('errors', 0);
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
