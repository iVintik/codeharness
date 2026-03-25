import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { analyze, runSemgrep, parseSemgrepOutput } from '../analyzer.js';
import { execFileSync } from 'node:child_process';
import type { SemgrepRawOutput } from '../types.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSemgrepOutput(
  results: SemgrepRawOutput['results'],
): SemgrepRawOutput {
  return { results };
}

// ============================================================
// Semgrep rule integration: error-handling rules
// ============================================================

describe('error-handling rules integration', () => {
  it('parseSemgrepOutput maps no-bare-except-pass findings with error severity', () => {
    const raw = makeSemgrepOutput([
      {
        check_id: 'no-bare-except-pass',
        path: 'app/main.py',
        start: { line: 10, col: 1 },
        end: { line: 13, col: 9 },
        extra: {
          message:
            'Bare `except Exception: pass` swallows errors silently. Handle the error, log it, or add a # IGNORE: comment explaining why.',
          severity: 'ERROR',
        },
      },
    ]);

    const gaps = parseSemgrepOutput(raw);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({
      file: 'app/main.py',
      line: 10,
      type: 'no-bare-except-pass',
      description: expect.stringContaining('except Exception: pass'),
      severity: 'error',
    });
  });

  it('parseSemgrepOutput maps no-bare-except-ellipsis findings with error severity', () => {
    const raw = makeSemgrepOutput([
      {
        check_id: 'no-bare-except-ellipsis',
        path: 'lib/utils.py',
        start: { line: 25, col: 1 },
        end: { line: 28, col: 9 },
        extra: {
          message:
            'Bare `except Exception: ...` swallows errors silently. Handle the error, log it, or add a # IGNORE: comment explaining why.',
          severity: 'ERROR',
        },
      },
    ]);

    const gaps = parseSemgrepOutput(raw);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({
      file: 'lib/utils.py',
      line: 25,
      type: 'no-bare-except-ellipsis',
      description: expect.stringContaining('except Exception: ...'),
      severity: 'error',
    });
  });

  it('ERROR severity from Semgrep normalizes to error (high severity)', () => {
    const raw = makeSemgrepOutput([
      {
        check_id: 'no-bare-except-pass',
        path: 'test.py',
        start: { line: 1, col: 1 },
        end: { line: 4, col: 9 },
        extra: {
          message: 'Bare except',
          severity: 'ERROR',
        },
      },
    ]);

    const gaps = parseSemgrepOutput(raw);
    expect(gaps[0]!.severity).toBe('error');
  });

  it('analyze includes error-handling rules directory by default', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput([])));

    analyze('/project');

    // Second call is the actual semgrep scan
    const scanCall = mockExecFileSync.mock.calls[1];
    expect(scanCall).toBeDefined();
    const args = scanCall![1] as string[];
    // Should include --config for both observability and error-handling
    expect(args).toContain('--config');
    expect(args.some(a => a.includes('patches/error-handling/'))).toBe(true);
    expect(args.some(a => a.includes('patches/observability/'))).toBe(true);
  });

  it('analyze with custom additionalRulesDirs overrides defaults', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput([])));

    analyze('/project', { additionalRulesDirs: ['custom/error-rules/'] });

    const scanCall = mockExecFileSync.mock.calls[1];
    const args = scanCall![1] as string[];
    expect(args.some(a => a.includes('custom/error-rules/'))).toBe(true);
    // Should NOT include the default error-handling dir
    expect(args.some(a => a.includes('patches/error-handling/'))).toBe(false);
  });

  it('analyze with empty additionalRulesDirs disables additional dirs', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput([])));

    analyze('/project', { additionalRulesDirs: [] });

    const scanCall = mockExecFileSync.mock.calls[1];
    const args = scanCall![1] as string[];
    // Should only have one --config for the primary rules dir
    const configIndices = args.reduce<number[]>((acc, a, i) => {
      if (a === '--config') acc.push(i);
      return acc;
    }, []);
    expect(configIndices).toHaveLength(1);
  });

  it('runSemgrep passes additional rule dirs as separate --config args', () => {
    mockExecFileSync.mockReturnValueOnce(
      JSON.stringify(makeSemgrepOutput([])),
    );

    runSemgrep('/project', '/project/patches/observability/', 60000, [
      '/project/patches/error-handling/',
    ]);

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'semgrep',
      [
        'scan',
        '--config',
        '/project/patches/observability/',
        '--config',
        '/project/patches/error-handling/',
        '--json',
        '/project',
      ],
      expect.any(Object),
    );
  });

  it('mixed findings from observability and error-handling rules are combined', () => {
    const raw = makeSemgrepOutput([
      {
        check_id: 'catch-without-logging',
        path: 'src/lib/docker.ts',
        start: { line: 42, col: 5 },
        end: { line: 44, col: 6 },
        extra: {
          message: 'Catch block without error logging',
          severity: 'WARNING',
        },
      },
      {
        check_id: 'no-bare-except-pass',
        path: 'scripts/deploy.py',
        start: { line: 15, col: 1 },
        end: { line: 18, col: 9 },
        extra: {
          message: 'Bare `except Exception: pass` swallows errors silently.',
          severity: 'ERROR',
        },
      },
    ]);

    const gaps = parseSemgrepOutput(raw);

    expect(gaps).toHaveLength(2);
    expect(gaps[0]!.type).toBe('catch-without-logging');
    expect(gaps[0]!.severity).toBe('warning');
    expect(gaps[1]!.type).toBe('no-bare-except-pass');
    expect(gaps[1]!.severity).toBe('error');
  });
});
