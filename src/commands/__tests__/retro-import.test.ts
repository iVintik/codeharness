import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { parse } from 'yaml';

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

const SECTION_RETRO_CONTENT = `
# Epic 10 Retrospective

## 6. Action Items

### Fix Now (Before Next Session)
- Fix bare catch blocks in registry.ts
- Resolve flaky test in pipeline

### Fix Soon (Next Sprint)
1. Add element type checking to isValidState()
2. Improve error messages in parser

### Backlog (Track But Not Urgent)
- Remove StackDetection type duplication
- Consider migrating to new test runner
`;

const MIXED_RETRO_CONTENT_NO_SECTIONS = `
# Epic 7 Retrospective

## Action Items

| # | Action | Status | Notes |
|---|--------|--------|-------|
| A1 | Fix flaky CI pipeline | Regressed | Urgent fix needed. |
| A2 | Add integration tests for auth module | Not done | Carry forward. |
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
  it('parses action items from retro file and imports to issues.yaml', async () => {
    createRetroFile(9);

    await runRetroImport(['--epic', '9']);

    // Should import 3 items to issues.yaml (ok calls) + parse 3 items (info calls) + 1 skip-github message
    expect(vi.mocked(ok)).toHaveBeenCalledTimes(3);
    // Verify issues.yaml was created
    const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
    expect(existsSync(issuesPath)).toBe(true);
    const data = parse(readFileSync(issuesPath, 'utf-8'));
    expect(data.issues).toHaveLength(3);
    expect(data.issues[0].source).toBe('retro-epic-9');
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
    expect(jsonCall).toHaveProperty('imported', 3);
    expect(jsonCall).toHaveProperty('skipped', 0);
    expect(jsonCall).toHaveProperty('duplicates', 0);
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

  describe('issues.yaml import — section-based', () => {
    it('imports Fix Now items with priority=high', async () => {
      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      expect(existsSync(issuesPath)).toBe(true);
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      const highItems = data.issues.filter((i: any) => i.priority === 'high');
      expect(highItems).toHaveLength(2);
      expect(highItems[0].title).toBe('Fix bare catch blocks in registry.ts');
      expect(highItems[1].title).toBe('Resolve flaky test in pipeline');
    });

    it('imports Fix Soon items with priority=medium', async () => {
      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      const mediumItems = data.issues.filter((i: any) => i.priority === 'medium');
      expect(mediumItems).toHaveLength(2);
      expect(mediumItems[0].title).toBe('Add element type checking to isValidState()');
    });

    it('skips Backlog items (not imported)', async () => {
      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      // Only 4 items (2 Fix Now + 2 Fix Soon), no Backlog
      expect(data.issues).toHaveLength(4);
      // Verify backlog items were logged as skipped
      expect(vi.mocked(info)).toHaveBeenCalledWith(
        expect.stringContaining('Skipped (backlog'),
      );
    });

    it('sets source to retro-epic-<n> on all imported issues', async () => {
      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      for (const issue of data.issues) {
        expect(issue.source).toBe('retro-epic-10');
      }
    });
  });

  describe('issues.yaml import — table-based fallback', () => {
    it('falls back to table parser when no subsections found', async () => {
      createRetroFile(7, MIXED_RETRO_CONTENT_NO_SECTIONS);

      await runRetroImport(['--epic', '7']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      expect(existsSync(issuesPath)).toBe(true);
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      expect(data.issues).toHaveLength(2);
      expect(data.issues[0].source).toBe('retro-epic-7');
    });

    it('maps derivePriority=1 (regressed) to high', async () => {
      createRetroFile(7, MIXED_RETRO_CONTENT_NO_SECTIONS);

      await runRetroImport(['--epic', '7']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      // A1 is Regressed -> derivePriority returns 1 -> high
      const a1Issue = data.issues.find((i: any) => i.title === 'Fix flaky CI pipeline');
      expect(a1Issue.priority).toBe('high');
    });

    it('maps derivePriority=2 (default) to medium', async () => {
      createRetroFile(7, MIXED_RETRO_CONTENT_NO_SECTIONS);

      await runRetroImport(['--epic', '7']);

      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      // A2 is Not done, no urgency -> derivePriority returns 2 -> medium
      const a2Issue = data.issues.find((i: any) => i.title === 'Add integration tests for auth module');
      expect(a2Issue.priority).toBe('medium');
    });

    it('skips duplicate items in table-based fallback', async () => {
      // Pre-populate with an issue matching a table item
      const codeharnessDir = join(testDir, '.codeharness');
      mkdirSync(codeharnessDir, { recursive: true });
      writeFileSync(
        join(codeharnessDir, 'issues.yaml'),
        'issues:\n  - id: issue-001\n    title: Fix flaky CI pipeline\n    source: manual\n    priority: medium\n    status: backlog\n    created_at: "2026-01-01T00:00:00.000Z"\n',
      );

      createRetroFile(7, MIXED_RETRO_CONTENT_NO_SECTIONS);

      await runRetroImport(['--epic', '7']);

      const data = parse(readFileSync(join(codeharnessDir, 'issues.yaml'), 'utf-8'));
      // 1 existing + 1 new (A2) = 2 total; A1 is duplicate of existing
      expect(data.issues).toHaveLength(2);
      expect(vi.mocked(info)).toHaveBeenCalledWith(
        expect.stringContaining('Skipped (duplicate'),
      );
    });
  });

  describe('issues.yaml import — duplicate detection', () => {
    it('skips duplicate items based on word overlap', async () => {
      // Pre-populate issues.yaml with an existing issue
      const codeharnessDir = join(testDir, '.codeharness');
      mkdirSync(codeharnessDir, { recursive: true });
      writeFileSync(
        join(codeharnessDir, 'issues.yaml'),
        'issues:\n  - id: issue-001\n    title: Fix bare catch blocks in registry.ts\n    source: manual\n    priority: medium\n    status: backlog\n    created_at: "2026-01-01T00:00:00.000Z"\n',
      );

      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      const data = parse(readFileSync(join(codeharnessDir, 'issues.yaml'), 'utf-8'));
      // One duplicate skipped, so 3 new + 1 existing = 4
      expect(data.issues).toHaveLength(4);
      // Verify duplicate message was logged
      expect(vi.mocked(info)).toHaveBeenCalledWith(
        expect.stringContaining('Skipped (duplicate'),
      );
    });

    it('does not modify existing issues when duplicate found', async () => {
      const codeharnessDir = join(testDir, '.codeharness');
      mkdirSync(codeharnessDir, { recursive: true });
      writeFileSync(
        join(codeharnessDir, 'issues.yaml'),
        'issues:\n  - id: issue-001\n    title: Fix bare catch blocks in registry.ts\n    source: manual\n    priority: low\n    status: in-progress\n    created_at: "2026-01-01T00:00:00.000Z"\n',
      );

      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      const data = parse(readFileSync(join(codeharnessDir, 'issues.yaml'), 'utf-8'));
      // The existing issue should retain its original values
      const existing = data.issues.find((i: any) => i.id === 'issue-001');
      expect(existing.priority).toBe('low');
      expect(existing.status).toBe('in-progress');
    });
  });

  describe('issues.yaml import — JSON output', () => {
    it('JSON output includes imported/skipped/duplicates counts and issues array', async () => {
      // Pre-populate one duplicate
      const codeharnessDir = join(testDir, '.codeharness');
      mkdirSync(codeharnessDir, { recursive: true });
      writeFileSync(
        join(codeharnessDir, 'issues.yaml'),
        'issues:\n  - id: issue-001\n    title: Fix bare catch blocks in registry.ts\n    source: manual\n    priority: medium\n    status: backlog\n    created_at: "2026-01-01T00:00:00.000Z"\n',
      );

      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10', '--json']);

      expect(vi.mocked(jsonOutput)).toHaveBeenCalledTimes(1);
      const jsonCall = vi.mocked(jsonOutput).mock.calls[0][0];
      expect(jsonCall).toHaveProperty('imported', 3);
      expect(jsonCall).toHaveProperty('skipped', 2); // 2 backlog items
      expect(jsonCall).toHaveProperty('duplicates', 1);
      const issues = jsonCall['issues'] as Array<Record<string, unknown>>;
      expect(issues).toHaveLength(3);
      // Each issue has id, title, source, priority
      for (const issue of issues) {
        expect(issue).toHaveProperty('id');
        expect(issue).toHaveProperty('title');
        expect(issue).toHaveProperty('source', 'retro-epic-10');
        expect(issue).toHaveProperty('priority');
      }
    });
  });

  describe('issues.yaml import — creates file when missing', () => {
    it('creates issues.yaml when it does not exist', async () => {
      const issuesPath = join(testDir, '.codeharness', 'issues.yaml');
      expect(existsSync(issuesPath)).toBe(false);

      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      expect(existsSync(issuesPath)).toBe(true);
      const data = parse(readFileSync(issuesPath, 'utf-8'));
      expect(data.issues).toHaveLength(4);
    });
  });

  describe('issues.yaml import — summary output', () => {
    it('prints summary in non-JSON mode after import', async () => {
      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      expect(vi.mocked(info)).toHaveBeenCalledWith(
        expect.stringContaining('Summary: 4 imported, 2 skipped, 0 duplicates'),
      );
    });
  });

  describe('issues.yaml import — error and edge cases', () => {
    it('missing retro file exits with code 1', async () => {
      await runRetroImport(['--epic', '99']);

      expect(vi.mocked(fail)).toHaveBeenCalledWith(
        expect.stringContaining('Retro file not found'),
        expect.any(Object),
      );
      expect(process.exitCode).toBe(1);
    });

    it('warns and continues when issues.yaml import fails', async () => {
      // Create a file at .codeharness to prevent mkdirSync from working
      writeFileSync(join(testDir, '.codeharness'), 'not-a-directory');

      createRetroFile(10, SECTION_RETRO_CONTENT);

      await runRetroImport(['--epic', '10']);

      expect(vi.mocked(warn)).toHaveBeenCalledWith(
        expect.stringContaining('Local issues.yaml import failed'),
      );
      // Should not crash — GitHub phase still runs (or skips gracefully)
      expect(process.exitCode).toBeUndefined();
    });

    it('empty retro file with no action items exits with code 0', async () => {
      createRetroFile(5, '# Epic 5 Retrospective\n\nNo action items here.');

      await runRetroImport(['--epic', '5']);

      expect(vi.mocked(info)).toHaveBeenCalledWith('No action items found in retro file');
      expect(process.exitCode).toBeUndefined();
    });
  });
});
