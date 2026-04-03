import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock issue-tracker to control the directory used
vi.mock('../../lib/issue-tracker.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return actual;
});

import { registerIssueCommand } from '../issue.js';
import { readIssues, writeIssues, type IssuesFile } from '../../lib/issue-tracker.js';

let testDir: string;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-issue-cmd-test-'));
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  // Override process.cwd to use our test dir
  vi.spyOn(process, 'cwd').mockReturnValue(testDir);
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  logSpy.mockRestore();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function makeProgram(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerIssueCommand(program);
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = makeProgram();
  program.exitOverride(); // throw instead of process.exit
  try {
    await program.parseAsync(['node', 'codeharness', ...args]);
  } catch {
    // Commander may throw on exitOverride — that's fine
  }
}

describe('issue create', () => {
  it('creates issues.yaml and outputs OK', async () => {
    await run(['issue', 'create', 'Fix Docker timeout', '--priority', 'high', '--source', 'retro-sprint-1']);

    const data = readIssues(testDir);
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].title).toBe('Fix Docker timeout');
    expect(data.issues[0].priority).toBe('high');
    expect(data.issues[0].source).toBe('retro-sprint-1');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[OK]'));
  });

  it('uses default priority and source', async () => {
    await run(['issue', 'create', 'Simple bug']);

    const data = readIssues(testDir);
    expect(data.issues[0].priority).toBe('medium');
    expect(data.issues[0].source).toBe('manual');
  });
});

describe('issue list', () => {
  it('displays issues', async () => {
    // Pre-populate
    const issueData: IssuesFile = {
      issues: [
        { id: 'issue-001', title: 'Bug A', source: 'manual', priority: 'high', status: 'backlog', created_at: '2026-01-01T00:00:00.000Z' },
      ],
    };
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    writeIssues(issueData, testDir);

    await run(['issue', 'list']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('issue-001'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Bug A'));
  });

  it('with --json outputs JSON', async () => {
    const issueData: IssuesFile = {
      issues: [
        { id: 'issue-001', title: 'Bug A', source: 'manual', priority: 'high', status: 'backlog', created_at: '2026-01-01T00:00:00.000Z' },
      ],
    };
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    writeIssues(issueData, testDir);

    await run(['--json', 'issue', 'list']);

    const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string;
    const parsed = JSON.parse(lastCall);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0].id).toBe('issue-001');
  });

  it('with no issues prints info message', async () => {
    await run(['issue', 'list']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No issues found'));
  });
});

describe('issue create validation', () => {
  it('rejects invalid priority', async () => {
    await run(['issue', 'create', 'Bad priority', '--priority', 'garbage']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[FAIL]'));
    expect(process.exitCode).toBe(1);
  });
});

describe('issue close', () => {
  it('updates status to done', async () => {
    // Create an issue first
    await run(['issue', 'create', 'To close']);

    await run(['issue', 'close', 'issue-001']);

    const data = readIssues(testDir);
    expect(data.issues[0].status).toBe('done');
    // The last log should be OK
    const okCalls = logSpy.mock.calls.filter((c) => (c[0] as string).includes('[OK]'));
    expect(okCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('with bad id returns error', async () => {
    await run(['issue', 'create', 'Exists']);

    await run(['issue', 'close', 'issue-999']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[FAIL]'));
    expect(process.exitCode).toBe(1);
  });
});
