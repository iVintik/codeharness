import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invokeBmadCodeReview } from '../orchestrator.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';

const mockedExecFileSync = vi.mocked(execFileSync);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('invokeBmadCodeReview', () => {
  it('returns ok(ReviewResult) with approved=true on successful review', () => {
    mockedExecFileSync.mockReturnValueOnce('Review complete.\nStatus: approved\nLGTM');

    const result = invokeBmadCodeReview('5-1-review-module');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.key).toBe('5-1-review-module');
    expect(result.data.approved).toBe(true);
    expect(result.data.duration).toBeGreaterThanOrEqual(0);
    expect(result.data.output).toContain('Review complete');
    expect(Array.isArray(result.data.comments)).toBe(true);
  });

  it('returns ok(ReviewResult) with approved=false when changes requested', () => {
    mockedExecFileSync.mockReturnValueOnce(
      'Review findings:\n- Missing error handling in orchestrator.ts line 45\n- Test coverage below threshold\nChanges requested',
    );

    const result = invokeBmadCodeReview('5-1-review-module');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.approved).toBe(false);
    expect(result.data.comments.length).toBeGreaterThan(0);
    expect(result.data.comments[0]).toContain('Missing error handling');
  });

  it('uses execFileSync with claude --print and default timeout', () => {
    mockedExecFileSync.mockReturnValueOnce('done');

    invokeBmadCodeReview('1-1-my-story');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print']),
      expect.objectContaining({ timeout: 1_500_000, encoding: 'utf-8' }),
    );
    const args = mockedExecFileSync.mock.calls[0][1] as string[];
    expect(args[1]).toContain('1-1-my-story');
    expect(args[1]).toContain('code-review');
  });

  it('uses custom timeout when provided', () => {
    mockedExecFileSync.mockReturnValueOnce('done');

    invokeBmadCodeReview('1-1-my-story', { timeoutMs: 60_000 });
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'claude', expect.anything(), expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('returns fail() on non-zero exit code', () => {
    const error = new Error('Command failed') as Error & { status: number; stderr: string; stdout: string };
    error.status = 1;
    error.stderr = 'Error: story file not found';
    error.stdout = 'Starting review...';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });

    const result = invokeBmadCodeReview('bad-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('exit code 1');
    expect(result.error).toContain('bad-story');
    expect(result.context).toBeDefined();
    expect(result.context?.['output']).toContain('story file not found');
  });

  it('returns fail(timeout: ...) when workflow times out via killed', () => {
    const error = new Error('TIMEOUT') as Error & { killed: boolean; signal: string; stderr: string; stdout: string };
    error.killed = true;
    error.signal = 'SIGTERM';
    error.stderr = 'partial output before timeout';
    error.stdout = 'some stdout';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    const result = invokeBmadCodeReview('timeout-story', { timeoutMs: 5000 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/^timeout:/);
    expect(result.error).toContain('timeout-story');
    expect(result.error).toContain('5s');
    expect(result.context).toBeDefined();
    expect(result.context?.['output']).toContain('partial output before timeout');
    expect(result.context?.['duration']).toBeGreaterThanOrEqual(0);
  });

  it('detects timeout via signal SIGTERM without killed flag', () => {
    const error = new Error('SIGTERM') as Error & { signal: string; stderr: string; stdout: string };
    error.signal = 'SIGTERM';
    error.stderr = '';
    error.stdout = '';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    const result = invokeBmadCodeReview('sigterm-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/^timeout:/);
    expect(result.error).toContain('sigterm-story');
  });

  it('includes key and duration in timeout error context', () => {
    const error = new Error('TIMEOUT') as Error & { killed: boolean; stderr: string; stdout: string };
    error.killed = true;
    error.stderr = '';
    error.stdout = '';
    mockedExecFileSync.mockImplementationOnce(() => { throw error; });
    const result = invokeBmadCodeReview('timeout-key', { timeoutMs: 10_000 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('timeout-key');
    expect(result.error).toContain('10s');
    expect(result.context?.['key']).toBe('timeout-key');
    expect(typeof result.context?.['duration']).toBe('number');
  });

  it('returns fail() on missing story file (generic error)', () => {
    mockedExecFileSync.mockImplementationOnce(() => { throw new Error('ENOENT: no such file or directory'); });
    const result = invokeBmadCodeReview('nonexistent-story');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('nonexistent-story');
    expect(result.error).toContain('ENOENT');
  });

  it('returns approved=true when output has no rejection or approval signals', () => {
    mockedExecFileSync.mockReturnValueOnce('Review completed. No issues found.');
    const result = invokeBmadCodeReview('no-signals');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.key).toBe('no-signals');
    expect(result.data.approved).toBe(true);
  });

  it('truncates output to last 200 lines', () => {
    const longOutput = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join('\n');
    mockedExecFileSync.mockReturnValueOnce(longOutput);

    const result = invokeBmadCodeReview('long-output');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.output).toContain('line 101');
    expect(result.data.output).toContain('line 300');
    expect(result.data.output).not.toContain('line 100\n');
    expect(result.data.output.split('\n').length).toBe(200);
  });

  it('parses rejection signals correctly', () => {
    mockedExecFileSync.mockReturnValueOnce('Not approved. Needs changes.');

    const result = invokeBmadCodeReview('rejected-story');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.approved).toBe(false);
  });

  it('defaults to approved when no signals present', () => {
    mockedExecFileSync.mockReturnValueOnce('Review completed without findings.');

    const result = invokeBmadCodeReview('no-signal-story');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.approved).toBe(true);
  });

  it('extracts comment lines from review output', () => {
    mockedExecFileSync.mockReturnValueOnce(
      'Findings:\n- Missing validation for empty input strings\n- Consider adding retry logic for network calls\n* Type assertions should be narrowed further\nApproved with comments',
    );

    const result = invokeBmadCodeReview('comments-story');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.comments).toHaveLength(3);
    expect(result.data.comments[0]).toContain('Missing validation');
  });

  it('returns ReviewResult with all required fields', () => {
    mockedExecFileSync.mockReturnValueOnce('LGTM');

    const result = invokeBmadCodeReview('field-check');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(typeof result.data.key).toBe('string');
    expect(typeof result.data.approved).toBe('boolean');
    expect(Array.isArray(result.data.comments)).toBe(true);
    expect(typeof result.data.duration).toBe('number');
    expect(typeof result.data.output).toBe('string');
  });
});

describe('all code paths return Result<T> — never throw', () => {
  it('never throws on workflow failure', () => {
    mockedExecFileSync.mockImplementation(() => { throw new Error('crash'); });
    expect(() => invokeBmadCodeReview('x')).not.toThrow();
    const result = invokeBmadCodeReview('x');
    expect(result.success).toBe(false);
  });

  it('never throws on timeout', () => {
    const error = new Error('TIMEOUT') as Error & { killed: boolean };
    error.killed = true;
    mockedExecFileSync.mockImplementation(() => { throw error; });
    expect(() => invokeBmadCodeReview('x')).not.toThrow();
    const result = invokeBmadCodeReview('x');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/^timeout:/);
  });

  it('never throws on unknown error types', () => {
    mockedExecFileSync.mockImplementation(() => { throw 'string error'; }); // eslint-disable-line no-throw-literal
    expect(() => invokeBmadCodeReview('x')).not.toThrow();
    const result = invokeBmadCodeReview('x');
    expect(result.success).toBe(false);
  });
});
