import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { captureGitDiff, captureStateDelta, capturePartialStderr, captureTimeoutReport, findLatestTimeoutReport } from '../timeout.js';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';

const mockedExecSync = vi.mocked(execSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReaddirSync = vi.mocked(readdirSync);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('captureGitDiff', () => {
  it('returns diff summary when git is available', () => {
    mockedExecSync
      .mockReturnValueOnce(' src/foo.ts | 5 ++---\n 1 file changed')
      .mockReturnValueOnce(' src/bar.ts | 2 ++\n 1 file changed');

    const result = captureGitDiff();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toContain('Unstaged:');
    expect(result.data).toContain('src/foo.ts');
    expect(result.data).toContain('Staged:');
    expect(result.data).toContain('src/bar.ts');
  });

  it('returns "No changes detected" when both diffs are empty', () => {
    mockedExecSync
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');

    const result = captureGitDiff();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe('No changes detected');
  });

  it('returns fail() when git is not available', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('git: command not found');
    });

    const result = captureGitDiff();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to capture git diff');
    expect(result.error).toContain('git: command not found');
  });

  it('uses 5-second timeout for git commands', () => {
    mockedExecSync.mockReturnValue('');

    captureGitDiff();

    expect(mockedExecSync).toHaveBeenCalledWith(
      'git diff --stat',
      expect.objectContaining({ timeout: 5000 }),
    );
    expect(mockedExecSync).toHaveBeenCalledWith(
      'git diff --cached --stat',
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it('handles git command timeout (mock execSync to simulate hang)', () => {
    mockedExecSync.mockImplementation(() => {
      const err = new Error('TIMEOUT');
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      throw err;
    });

    const result = captureGitDiff();
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to capture git diff');
  });
});

describe('captureStateDelta', () => {
  it('correctly identifies changed story statuses', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({
        stories: {
          '1-1-auth': { status: 'in-progress' },
          '1-2-login': { status: 'backlog' },
        },
      }))
      .mockReturnValueOnce(JSON.stringify({
        stories: {
          '1-1-auth': { status: 'done' },
          '1-2-login': { status: 'backlog' },
        },
      }));

    const result = captureStateDelta('/tmp/before.json', '/tmp/after.json');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toContain('1-1-auth: in-progress');
    expect(result.data).toContain('done');
    expect(result.data).not.toContain('1-2-login');
  });

  it('returns "No state changes" when states are identical', () => {
    mockedExistsSync.mockReturnValue(true);
    const state = JSON.stringify({ stories: { '1-1-a': { status: 'done' } } });
    mockedReadFileSync
      .mockReturnValueOnce(state)
      .mockReturnValueOnce(state);

    const result = captureStateDelta('/tmp/before.json', '/tmp/after.json');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe('No state changes');
  });

  it('returns fail() on missing before file', () => {
    mockedExistsSync.mockReturnValueOnce(false);

    const result = captureStateDelta('/tmp/missing.json', '/tmp/after.json');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('State snapshot not found');
  });

  it('returns fail() on missing after file', () => {
    mockedExistsSync
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const result = captureStateDelta('/tmp/before.json', '/tmp/missing.json');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Current state file not found');
  });

  it('handles new stories appearing in after state', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce(JSON.stringify({
        stories: { '2-1-new': { status: 'in-progress' } },
      }));

    const result = captureStateDelta('/tmp/before.json', '/tmp/after.json');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toContain('2-1-new: (absent)');
    expect(result.data).toContain('in-progress');
  });
});

describe('capturePartialStderr', () => {
  it('returns last N lines of output file', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(lines.join('\n'));

    const result = capturePartialStderr('/tmp/output.log', 50);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toContain('line 151');
    expect(result.data).toContain('line 200');
    expect(result.data).not.toContain('line 150\n');
  });

  it('returns full content when file has fewer lines than maxLines', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('line 1\nline 2\nline 3');

    const result = capturePartialStderr('/tmp/output.log', 100);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe('line 1\nline 2\nline 3');
  });

  it('returns fail() on missing output file', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = capturePartialStderr('/tmp/missing.log');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Output file not found');
  });

  it('strips trailing empty line from files ending with newline', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('line 1\nline 2\nline 3\n');

    const result = capturePartialStderr('/tmp/output.log', 100);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe('line 1\nline 2\nline 3');
  });

  it('uses default maxLines of 100', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(lines.join('\n'));

    const result = capturePartialStderr('/tmp/output.log');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toContain('line 51');
    expect(result.data).toContain('line 150');
    expect(result.data).not.toContain('line 50\n');
  });
});

describe('captureTimeoutReport', () => {
  it('writes markdown file with all required fields', () => {
    // git diff
    mockedExecSync
      .mockReturnValueOnce(' src/foo.ts | 3 +++\n 1 file changed')
      .mockReturnValueOnce('');

    // state delta — existsSync for snapshot and state file
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({ stories: { '3-1-timeout': { status: 'in-progress' } } }))
      .mockReturnValueOnce(JSON.stringify({ stories: { '3-1-timeout': { status: 'in-progress' } } }))
      .mockReturnValueOnce('some output\nlast line');

    const result = captureTimeoutReport({
      storyKey: '3-1-timeout',
      iteration: 5,
      durationMinutes: 30,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snapshot.json',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.capture.storyKey).toBe('3-1-timeout');
    expect(result.data.capture.iteration).toBe(5);
    expect(result.data.capture.durationMinutes).toBe(30);
    expect(result.data.capture.timestamp).toBeTruthy();
    expect(result.data.filePath).toContain('timeout-report-5-3-1-timeout.md');

    // Verify writeFileSync was called with markdown content
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('timeout-report-5-3-1-timeout.md'),
      expect.stringContaining('# Timeout Report: Iteration 5'),
      'utf-8',
    );

    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toContain('**Story:** 3-1-timeout');
    expect(writtenContent).toContain('**Duration:** 30 minutes');
    expect(writtenContent).toContain('## Git Changes');
    expect(writtenContent).toContain('## State Delta');
    expect(writtenContent).toContain('## Partial Output');
  });

  it('handles partial failures gracefully (git unavailable but stderr captured)', () => {
    // git fails
    mockedExecSync.mockImplementation(() => {
      throw new Error('git not found');
    });

    // state files exist, output file exists
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce('captured output line');

    const result = captureTimeoutReport({
      storyKey: '3-1-test',
      iteration: 1,
      durationMinutes: 15,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snapshot.json',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.capture.gitDiff).toContain('(unavailable:');
    expect(result.data.capture.partialStderr).toBe('captured output line');
  });

  it('creates report directory if it does not exist', () => {
    mockedExecSync.mockReturnValue('');
    mockedExistsSync.mockImplementation((path: import('node:fs').PathLike) => {
      if (typeof path === 'string' && path.includes('ralph/logs')) return false;
      return true;
    });
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce('output');

    const result = captureTimeoutReport({
      storyKey: '3-1-test',
      iteration: 1,
      durationMinutes: 10,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snap.json',
    });

    expect(result.success).toBe(true);
    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('ralph/logs'),
      expect.objectContaining({ recursive: true }),
    );
  });

  it('rejects invalid iteration number', () => {
    const result = captureTimeoutReport({
      storyKey: '3-1-test',
      iteration: 0,
      durationMinutes: 10,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snap.json',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Invalid iteration number');
  });

  it('rejects negative duration', () => {
    const result = captureTimeoutReport({
      storyKey: '3-1-test',
      iteration: 1,
      durationMinutes: -5,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snap.json',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Invalid duration');
  });

  it('sanitizes story key in report filename', () => {
    mockedExecSync.mockReturnValue('');
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce('output');

    const result = captureTimeoutReport({
      storyKey: 'bad/key with spaces',
      iteration: 1,
      durationMinutes: 10,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snap.json',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filePath).toContain('timeout-report-1-bad_key_with_spaces.md');
    expect(result.data.filePath).not.toContain('/key');
  });

  it('returns Result<TimeoutReport> — never throws', () => {
    // Make writeFileSync throw
    mockedExecSync.mockReturnValue('');
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce(JSON.stringify({ stories: {} }))
      .mockReturnValueOnce('output');
    mockedWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = captureTimeoutReport({
      storyKey: '3-1-test',
      iteration: 1,
      durationMinutes: 10,
      outputFile: '/tmp/output.log',
      stateSnapshotPath: '/tmp/snap.json',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to capture timeout report');
    expect(result.error).toContain('EACCES');
  });
});

describe('findLatestTimeoutReport', () => {
  it('returns null when ralph/logs directory does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = findLatestTimeoutReport('3-1-timeout');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBeNull();
  });

  it('returns null when no matching timeout reports exist', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(['other-file.md', 'timeout-report-1-different-story.md'] as unknown as ReturnType<typeof readdirSync>);

    const result = findLatestTimeoutReport('3-1-timeout');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBeNull();
  });

  it('returns the latest timeout report (highest iteration)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'timeout-report-2-3-1-timeout.md',
      'timeout-report-5-3-1-timeout.md',
      'timeout-report-3-3-1-timeout.md',
    ] as unknown as ReturnType<typeof readdirSync>);
    mockedReadFileSync.mockReturnValue(
      '# Timeout Report: Iteration 5\n\n- **Duration:** 30 minutes (timeout)\n\n## Git Changes\n\n 3 files changed\n',
    );

    const result = findLatestTimeoutReport('3-1-timeout');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toBeNull();
    expect(result.data!.iteration).toBe(5);
    expect(result.data!.durationMinutes).toBe(30);
    expect(result.data!.filesChanged).toBe(3);
    expect(result.data!.reportPath).toContain('timeout-report-5-3-1-timeout.md');
  });

  it('parses files changed count from git diff stat', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'timeout-report-1-my-story.md',
    ] as unknown as ReturnType<typeof readdirSync>);
    mockedReadFileSync.mockReturnValue(
      '- **Duration:** 15 minutes\n\nUnstaged:\n 2 files changed\n\nStaged:\n 1 file changed\n',
    );

    const result = findLatestTimeoutReport('my-story');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.filesChanged).toBe(3);
  });

  it('returns 0 filesChanged when no git changes in report', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      'timeout-report-1-my-story.md',
    ] as unknown as ReturnType<typeof readdirSync>);
    mockedReadFileSync.mockReturnValue(
      '- **Duration:** 10 minutes\n\nNo changes detected\n',
    );

    const result = findLatestTimeoutReport('my-story');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.filesChanged).toBe(0);
  });

  it('never throws — returns fail on error', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation(() => { throw new Error('EACCES'); });

    expect(() => findLatestTimeoutReport('x')).not.toThrow();
    const result = findLatestTimeoutReport('x');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Failed to find timeout report');
  });
});

describe('all functions return Result<T> — never throw', () => {
  it('captureGitDiff never throws', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => captureGitDiff()).not.toThrow();
    const result = captureGitDiff();
    expect(result.success).toBe(false);
  });

  it('captureStateDelta never throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => captureStateDelta('/a', '/b')).not.toThrow();
    const result = captureStateDelta('/a', '/b');
    expect(result.success).toBe(false);
  });

  it('capturePartialStderr never throws', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => capturePartialStderr('/a')).not.toThrow();
    const result = capturePartialStderr('/a');
    expect(result.success).toBe(false);
  });

  it('captureTimeoutReport never throws', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('crash'); });
    mockedExistsSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => captureTimeoutReport({
      storyKey: 'x',
      iteration: 1,
      durationMinutes: 1,
      outputFile: '/a',
      stateSnapshotPath: '/b',
    })).not.toThrow();
  });
});
