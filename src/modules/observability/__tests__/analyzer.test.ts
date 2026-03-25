import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import {
  analyze,
  checkSemgrepInstalled,
  runSemgrep,
  parseSemgrepOutput,
  computeSummary,
} from '../analyzer.js';
import { analyze as analyzeFromBarrel } from '../index.js';
import { execFileSync } from 'node:child_process';
import type { SemgrepRawOutput } from '../types.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// -- Helper: build a minimal Semgrep raw output --
function makeSemgrepOutput(
  results: SemgrepRawOutput['results'],
): SemgrepRawOutput {
  return { results };
}

function makeSemgrepResult(overrides: Partial<SemgrepRawOutput['results'][0]> = {}) {
  return {
    check_id: 'catch-without-logging',
    path: 'src/lib/docker.ts',
    start: { line: 42, col: 5 },
    end: { line: 42, col: 50 },
    extra: {
      message: 'Catch block without error logging',
      severity: 'WARNING',
    },
    ...overrides,
  };
}

// ============================================================
// Module barrel export (index.ts)
// ============================================================

describe('module barrel export', () => {
  it('re-exports analyze from index.ts', () => {
    expect(analyzeFromBarrel).toBe(analyze);
  });
});

// ============================================================
// checkSemgrepInstalled
// ============================================================

describe('checkSemgrepInstalled', () => {
  it('returns true when semgrep --version succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('1.50.0'));
    expect(checkSemgrepInstalled()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'semgrep',
      ['--version'],
      expect.objectContaining({ encoding: 'utf-8', timeout: 5_000 }),
    );
  });

  it('returns false when semgrep is not installed', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(checkSemgrepInstalled()).toBe(false);
  });
});

// ============================================================
// runSemgrep
// ============================================================

describe('runSemgrep', () => {
  it('spawns semgrep with correct arguments and parses JSON output', () => {
    const rawOutput = makeSemgrepOutput([makeSemgrepResult()]);
    mockExecFileSync.mockReturnValue(JSON.stringify(rawOutput));

    const result = runSemgrep('/project', '/project/patches/observability/');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].check_id).toBe('catch-without-logging');
    }

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'semgrep',
      ['scan', '--config', '/project/patches/observability/', '--json', '/project'],
      expect.objectContaining({ encoding: 'utf-8', timeout: 60_000 }),
    );
  });

  it('returns fail when semgrep crashes', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('semgrep crashed');
    });

    const result = runSemgrep('/project', '/rules');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Semgrep scan failed');
    }
  });

  it('accepts a custom timeout', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify(makeSemgrepOutput([])));

    runSemgrep('/project', '/rules', 30_000);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'semgrep',
      expect.any(Array),
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('returns fail when semgrep returns invalid JSON without results array', () => {
    mockExecFileSync.mockReturnValue(JSON.stringify({ errors: [] }));

    const result = runSemgrep('/project', '/rules');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('invalid JSON: missing results array');
    }
  });

  it('returns fail when semgrep returns non-object JSON', () => {
    mockExecFileSync.mockReturnValue('"just a string"');

    const result = runSemgrep('/project', '/rules');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('invalid JSON: missing results array');
    }
  });

  it('returns fail when semgrep returns null JSON', () => {
    mockExecFileSync.mockReturnValue('null');

    const result = runSemgrep('/project', '/rules');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('invalid JSON: missing results array');
    }
  });
});

// ============================================================
// parseSemgrepOutput
// ============================================================

describe('parseSemgrepOutput', () => {
  it('maps Semgrep JSON results to ObservabilityGap[]', () => {
    const raw = makeSemgrepOutput([
      makeSemgrepResult({
        check_id: 'catch-without-logging',
        path: 'src/lib/docker.ts',
        start: { line: 42, col: 5 },
        extra: { message: 'Catch block without error logging', severity: 'WARNING' },
      }),
      makeSemgrepResult({
        check_id: 'function-no-debug-log',
        path: 'src/lib/scanner.ts',
        start: { line: 10, col: 1 },
        extra: { message: 'Function without debug log', severity: 'INFO' },
      }),
    ]);

    const gaps = parseSemgrepOutput(raw);
    expect(gaps).toHaveLength(2);

    expect(gaps[0]).toEqual({
      file: 'src/lib/docker.ts',
      line: 42,
      type: 'catch-without-logging',
      description: 'Catch block without error logging',
      severity: 'warning',
    });

    expect(gaps[1]).toEqual({
      file: 'src/lib/scanner.ts',
      line: 10,
      type: 'function-no-debug-log',
      description: 'Function without debug log',
      severity: 'info',
    });
  });

  it('normalizes ERROR severity to error', () => {
    const raw = makeSemgrepOutput([
      makeSemgrepResult({
        extra: { message: 'bad', severity: 'ERROR' },
      }),
    ]);
    const gaps = parseSemgrepOutput(raw);
    expect(gaps[0].severity).toBe('error');
  });

  it('normalizes unknown severity to info', () => {
    const raw = makeSemgrepOutput([
      makeSemgrepResult({
        extra: { message: 'note', severity: 'NOTE' },
      }),
    ]);
    const gaps = parseSemgrepOutput(raw);
    expect(gaps[0].severity).toBe('info');
  });

  it('returns empty array for empty results', () => {
    const raw = makeSemgrepOutput([]);
    expect(parseSemgrepOutput(raw)).toEqual([]);
  });

  it('returns empty array when results is undefined', () => {
    // Defensive: handle malformed input even though types say otherwise
    const raw = {} as SemgrepRawOutput;
    expect(parseSemgrepOutput(raw)).toEqual([]);
  });

  it('returns empty array when results is not an array', () => {
    const raw = { results: 'not-an-array' } as unknown as SemgrepRawOutput;
    expect(parseSemgrepOutput(raw)).toEqual([]);
  });
});

// ============================================================
// computeSummary
// ============================================================

describe('computeSummary', () => {
  it('computes 75% coverage for 20 functions with 15 having logs (AC #5)', () => {
    // 5 functions without logs = 5 function-no-debug-log matches
    const gaps = Array.from({ length: 5 }, (_, i) => ({
      file: `src/file${i}.ts`,
      line: i + 1,
      type: 'function-no-debug-log' as const,
      description: 'Function without debug log',
      severity: 'warning' as const,
    }));

    const summary = computeSummary(gaps, { totalFunctions: 20 });
    expect(summary.totalFunctions).toBe(20);
    expect(summary.functionsWithLogs).toBe(15);
    expect(summary.coveragePercent).toBe(75);
  });

  it('returns 100% coverage when totalFunctions is 0 (no functions = no gaps)', () => {
    const summary = computeSummary([]);
    expect(summary.totalFunctions).toBe(0);
    expect(summary.functionsWithLogs).toBe(0);
    expect(summary.coveragePercent).toBe(100);
  });

  it('counts error handlers without logs', () => {
    const gaps = [
      {
        file: 'a.ts', line: 1, type: 'catch-without-logging',
        description: 'catch', severity: 'warning' as const,
      },
      {
        file: 'b.ts', line: 2, type: 'error-path-no-log',
        description: 'err', severity: 'warning' as const,
      },
      {
        file: 'c.ts', line: 3, type: 'function-no-debug-log',
        description: 'fn', severity: 'info' as const,
      },
    ];

    const summary = computeSummary(gaps);
    expect(summary.errorHandlersWithoutLogs).toBe(2);
  });

  it('builds level distribution from gap severities', () => {
    const gaps = [
      { file: 'a.ts', line: 1, type: 'x', description: '', severity: 'warning' as const },
      { file: 'b.ts', line: 2, type: 'y', description: '', severity: 'warning' as const },
      { file: 'c.ts', line: 3, type: 'z', description: '', severity: 'error' as const },
    ];

    const summary = computeSummary(gaps);
    expect(summary.levelDistribution).toEqual({ warning: 2, error: 1 });
  });

  it('without totalFunctions override, uses functionsWithoutLogs count', () => {
    const gaps = [
      {
        file: 'a.ts', line: 1, type: 'function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
      {
        file: 'b.ts', line: 2, type: 'function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
    ];

    const summary = computeSummary(gaps);
    // 2 functions without logs, no override, so totalFunctions = 2, functionsWithLogs = 0
    expect(summary.totalFunctions).toBe(2);
    expect(summary.functionsWithLogs).toBe(0);
    expect(summary.coveragePercent).toBe(0);
  });

  it('handles path-prefixed rule IDs from Semgrep (e.g., tmp.foo.patches.observability.function-no-debug-log)', () => {
    // Semgrep produces check_ids with path prefixes when rules are loaded from local paths
    const gaps = [
      {
        file: 'a.ts', line: 1,
        type: 'tmp.test-ac5c.patches.observability.function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
      {
        file: 'b.ts', line: 2,
        type: 'tmp.test-ac5c.patches.observability.function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
      {
        file: 'c.ts', line: 3,
        type: 'tmp.test-ac5c.patches.observability.function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
      {
        file: 'd.ts', line: 4,
        type: 'tmp.test-ac5c.patches.observability.function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
      {
        file: 'e.ts', line: 5,
        type: 'tmp.test-ac5c.patches.observability.function-no-debug-log',
        description: 'fn', severity: 'warning' as const,
      },
    ];

    const summary = computeSummary(gaps, { totalFunctions: 20 });
    expect(summary.totalFunctions).toBe(20);
    expect(summary.functionsWithLogs).toBe(15);
    expect(summary.coveragePercent).toBe(75);
  });

  it('handles path-prefixed error handler rule IDs', () => {
    const gaps = [
      {
        file: 'a.ts', line: 1,
        type: 'tmp.foo.patches.observability.catch-without-logging',
        description: 'catch', severity: 'warning' as const,
      },
      {
        file: 'b.ts', line: 2,
        type: 'tmp.foo.patches.observability.error-path-no-log',
        description: 'err', severity: 'warning' as const,
      },
    ];

    const summary = computeSummary(gaps);
    expect(summary.errorHandlersWithoutLogs).toBe(2);
  });
});

// ============================================================
// analyze (integration of all pieces)
// ============================================================

describe('analyze', () => {
  it('returns Result<AnalyzerResult> with correct structure', () => {
    // Mock semgrep installed
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0')) // checkSemgrepInstalled
      .mockReturnValueOnce(
        JSON.stringify(
          makeSemgrepOutput([
            makeSemgrepResult({
              check_id: 'catch-without-logging',
              path: 'src/app.ts',
              start: { line: 10, col: 1 },
              extra: { message: 'Missing log', severity: 'WARNING' },
            }),
          ]),
        ),
      ); // runSemgrep

    const result = analyze('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool).toBe('semgrep');
      expect(result.data.gaps).toHaveLength(1);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.coveragePercent).toBeDefined();
      expect(result.data.skipped).toBeUndefined();
    }
  });

  it('spawns semgrep with correct arguments', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput([])));

    analyze('/my/project');

    // Second call is the scan (includes both observability and error-handling rules)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'semgrep',
      ['scan', '--config', '/my/project/patches/observability/', '--config', '/my/project/patches/error-handling/', '--json', '/my/project'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('returns ok result with skip warning when semgrep is not installed (AC #3)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = analyze('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skipped).toBe(true);
      expect(result.data.skipReason).toBe(
        'static analysis skipped -- install semgrep',
      );
      expect(result.data.gaps).toEqual([]);
      expect(result.data.summary.coveragePercent).toBe(0);
    }
  });

  it('returns fail when projectDir is empty', () => {
    const result = analyze('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('returns fail for unsupported tool', () => {
    const result = analyze('/project', { tool: 'eslint' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unsupported analyzer tool: eslint');
    }
  });

  it('returns fail when semgrep scan fails', () => {
    // semgrep installed
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockImplementationOnce(() => {
        throw new Error('scan error');
      });

    const result = analyze('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Semgrep scan failed');
    }
  });

  it('passes totalFunctions from config to computeSummary for accurate coverage', () => {
    const gaps = Array.from({ length: 5 }, (_, i) =>
      makeSemgrepResult({
        check_id: 'function-no-debug-log',
        path: `src/file${i}.ts`,
        start: { line: i + 1, col: 1 },
        extra: { message: 'Function without debug log', severity: 'INFO' },
      }),
    );
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput(gaps)));

    const result = analyze('/project', { totalFunctions: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.totalFunctions).toBe(20);
      expect(result.data.summary.functionsWithLogs).toBe(15);
      expect(result.data.summary.coveragePercent).toBe(75);
    }
  });

  it('defaults to conservative 0% coverage when totalFunctions not provided', () => {
    const gaps = [
      makeSemgrepResult({
        check_id: 'function-no-debug-log',
        path: 'src/file.ts',
        start: { line: 1, col: 1 },
        extra: { message: 'fn', severity: 'INFO' },
      }),
    ];
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput(gaps)));

    const result = analyze('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      // Without totalFunctions, defaults to functionsWithoutLogs count
      expect(result.data.summary.totalFunctions).toBe(1);
      expect(result.data.summary.functionsWithLogs).toBe(0);
      expect(result.data.summary.coveragePercent).toBe(0);
    }
  });

  it('uses custom rulesDir and timeout from config', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from('1.50.0'))
      .mockReturnValueOnce(JSON.stringify(makeSemgrepOutput([])));

    analyze('/project', { rulesDir: 'custom/rules/', timeout: 30_000 });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'semgrep',
      ['scan', '--config', '/project/custom/rules/', '--config', '/project/patches/error-handling/', '--json', '/project'],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });
});
