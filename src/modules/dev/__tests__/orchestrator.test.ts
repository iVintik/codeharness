import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeBmadDevStory } from '../orchestrator.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

import { execFileSync, execSync } from 'node:child_process';

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedExecSync = vi.mocked(execSync);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

/** Helper: configure mockedExecSync to return file lists for git diff/ls-files calls. */
function mockGitFilesChanged(files: string[]): void {
  const unstaged = files.filter((f) => !f.startsWith('+')).join('\n');
  const untracked = files.filter((f) => f.startsWith('+')).map((f) => f.slice(1)).join('\n');
  mockedExecSync
    .mockReturnValueOnce(unstaged)   // git diff --name-only
    .mockReturnValueOnce('')         // git diff --cached --name-only
    .mockReturnValueOnce(untracked); // git ls-files --others
}

describe('invokeBmadDevStory', () => {
  it('returns ok(DevResult) on successful workflow', () => {
    mockedExecFileSync.mockReturnValueOnce('Workflow completed successfully.\nAll tests pass.');
    mockGitFilesChanged([
      'src/modules/dev/orchestrator.ts',
      'src/modules/dev/__tests__/orchestrator.test.ts',
    ]);
    const result = invokeBmadDevStory('3-2-graceful-dev-module');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.key).toBe('3-2-graceful-dev-module');
    expect(result.data.filesChanged).toContain('src/modules/dev/orchestrator.ts');
    expect(result.data.filesChanged).toContain('src/modules/dev/__tests__/orchestrator.test.ts');
    expect(result.data.testsAdded).toBe(1);
    expect(result.data.duration).toBeGreaterThanOrEqual(0);
    expect(result.data.output).toContain('Workflow completed successfully');
  });

  it('uses execFileSync with claude --print and default timeout', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockGitFilesChanged([]);
    invokeBmadDevStory('1-1-my-story');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print']),
      expect.objectContaining({ timeout: 1_500_000, encoding: 'utf-8' }),
    );
    const args = mockedExecFileSync.mock.calls[0][1] as string[];
    expect(args[1]).toContain('1-1-my-story');
  });

  it('uses custom timeout when provided', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockGitFilesChanged([]);
    invokeBmadDevStory('1-1-my-story', { timeoutMs: 60_000 });
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'claude', expect.anything(), expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('returns fail() on non-zero exit code with filesChanged', () => {
    const error = new Error('Command failed') as Error & { status: number; stderr: string; stdout: string };
    error.status = 1;
    error.stderr = 'Error: story file not found';
    error.stdout = 'Starting workflow...';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    mockGitFilesChanged(['src/partial-work.ts']);
    const result = invokeBmadDevStory('bad-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('exit code 1');
    expect(result.error).toContain('bad-story');
    expect(result.context).toBeDefined();
    expect(result.context?.['output']).toContain('story file not found');
    expect(result.context?.['filesChanged']).toEqual(['src/partial-work.ts']);
    expect(result.context?.['testsAdded']).toBe(0);
  });

  it('returns fail(timeout: ...) when workflow times out via killed', () => {
    const error = new Error('TIMEOUT') as Error & { killed: boolean; signal: string; stderr: string; stdout: string };
    error.killed = true;
    error.signal = 'SIGTERM';
    error.stderr = 'partial output before timeout';
    error.stdout = 'some stdout';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    mockGitFilesChanged(['src/partial.ts']);
    const result = invokeBmadDevStory('timeout-story', { timeoutMs: 5000 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/^timeout:/);
    expect(result.error).toContain('timeout-story');
    expect(result.error).toContain('5s');
    expect(result.context).toBeDefined();
    expect(result.context?.['filesChanged']).toEqual(['src/partial.ts']);
    expect(result.context?.['output']).toContain('partial output before timeout');
  });

  it('detects timeout via signal SIGTERM without killed flag', () => {
    const error = new Error('SIGTERM') as Error & { signal: string; stderr: string; stdout: string };
    error.signal = 'SIGTERM';
    error.stderr = '';
    error.stdout = '';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    mockGitFilesChanged([]);
    const result = invokeBmadDevStory('sigterm-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/^timeout:/);
    expect(result.error).toContain('sigterm-story');
  });

  it('preserves partial work on timeout (filesChanged populated)', () => {
    const error = new Error('TIMEOUT') as Error & { killed: boolean; stderr: string; stdout: string };
    error.killed = true;
    error.stderr = '';
    error.stdout = '';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    mockGitFilesChanged(['src/modules/dev/types.ts', 'src/modules/dev/__tests__/new.test.ts']);
    const result = invokeBmadDevStory('partial-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.context?.['filesChanged']).toContain('src/modules/dev/types.ts');
    expect(result.context?.['testsAdded']).toBe(1);
  });

  it('returns fail() on missing story file (generic error)', () => {
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('ENOENT: no such file or directory'); });
    const result = invokeBmadDevStory('nonexistent-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('nonexistent-story');
    expect(result.error).toContain('ENOENT');
  });

  it('captures git diff after workflow for filesChanged', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockGitFilesChanged(['src/new-file.ts', 'src/__tests__/new.test.ts']);
    const result = invokeBmadDevStory('my-story');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filesChanged).toEqual(['src/new-file.ts', 'src/__tests__/new.test.ts']);
    expect(mockedExecSync).toHaveBeenCalledWith('git diff --name-only', expect.objectContaining({ timeout: 5000 }));
    expect(mockedExecSync).toHaveBeenCalledWith('git diff --cached --name-only', expect.objectContaining({ timeout: 5000 }));
  });

  it('counts test files correctly for testsAdded', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockGitFilesChanged(['src/foo.ts', 'src/foo.test.ts', 'src/bar.spec.ts', 'src/__tests__/baz.ts', 'src/utils.ts']);
    const result = invokeBmadDevStory('test-count');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.testsAdded).toBe(3);
  });

  it('handles git failure gracefully — returns empty filesChanged', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockedExecSync.mockImplementation(() => { throw new Error('git not found'); });
    const result = invokeBmadDevStory('git-fail');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filesChanged).toEqual([]);
    expect(result.data.testsAdded).toBe(0);
  });

  it('truncates output to last 200 lines', () => {
    const longOutput = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join('\n');
    mockedExecFileSync.mockReturnValueOnce(longOutput);
    mockGitFilesChanged([]);
    const result = invokeBmadDevStory('long-output');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.output).toContain('line 101');
    expect(result.data.output).toContain('line 300');
    expect(result.data.output).not.toContain('line 100\n');
    expect(result.data.output.split('\n').length).toBe(200);
  });

  it('deduplicates files across git diff sources', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockedExecSync
      .mockReturnValueOnce('src/foo.ts')     // unstaged
      .mockReturnValueOnce('src/foo.ts')     // staged
      .mockReturnValueOnce('src/foo.ts');    // untracked
    const result = invokeBmadDevStory('dedup-test');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filesChanged).toEqual(['src/foo.ts']);
  });

  it('filters out empty lines from git output', () => {
    mockedExecFileSync.mockReturnValueOnce('done');
    mockedExecSync
      .mockReturnValueOnce('src/a.ts\n\nsrc/b.ts\n')  // unstaged with empties
      .mockReturnValueOnce('')                          // staged empty
      .mockReturnValueOnce('');                         // untracked empty
    const result = invokeBmadDevStory('empty-lines-test');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.filesChanged).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('all code paths return Result<T> — never throw', () => {
  it('never throws on workflow failure', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => invokeBmadDevStory('x')).not.toThrow();
    const result = invokeBmadDevStory('x');
    expect(result.success).toBe(false);
  });

  it('never throws on timeout', () => {
    const error = new Error('TIMEOUT') as Error & { killed: boolean };
    error.killed = true;
    mockedExecFileSync.mockImplementation(() => { throw error; });
    mockedExecSync.mockImplementation(() => { throw new Error('git fail'); });
    expect(() => invokeBmadDevStory('x')).not.toThrow();
    const result = invokeBmadDevStory('x');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/^timeout:/);
  });

  it('never throws on unknown error types', () => {
    mockedExecFileSync.mockImplementation(() => { throw 'string error'; }); // eslint-disable-line no-throw-literal
    expect(() => invokeBmadDevStory('x')).not.toThrow();
    const result = invokeBmadDevStory('x');
    expect(result.success).toBe(false);
  });
});
