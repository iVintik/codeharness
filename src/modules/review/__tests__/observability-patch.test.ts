import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSemgrepOutput } from '../../observability/analyzer.js';

const ROOT = resolve(__dirname, '..', '..', '..', '..');

let reviewPatch: string;
let devPatch: string;

beforeAll(() => {
  reviewPatch = readFileSync(
    resolve(ROOT, 'patches/review/enforcement.md'),
    'utf-8',
  );
  devPatch = readFileSync(
    resolve(ROOT, 'patches/dev/enforcement.md'),
    'utf-8',
  );
});

describe('patches/review/enforcement.md — observability section', () => {
  it('contains ### Observability section', () => {
    expect(reviewPatch).toContain('### Observability');
  });

  it('instructs to run semgrep scan --config patches/observability/ --config patches/error-handling/ --json', () => {
    expect(reviewPatch).toContain(
      'semgrep scan --config patches/observability/ --config patches/error-handling/ --json',
    );
  });

  it('instructs to list each gap as a review issue with file, line, description', () => {
    expect(reviewPatch).toContain('file path');
    expect(reviewPatch).toContain('line number');
    expect(reviewPatch).toContain('description');
  });

  it('contains skip/warning guidance for missing Semgrep', () => {
    expect(reviewPatch).toContain(
      'static analysis skipped — install semgrep',
    );
    expect(reviewPatch).toContain('do NOT fail the review');
  });

  it('instructs silent pass when zero gaps found', () => {
    expect(reviewPatch).toContain('passes silently');
  });
});

describe('patches/dev/enforcement.md — observability section', () => {
  it('contains semgrep scan --config patches/observability/ instruction', () => {
    expect(devPatch).toContain(
      'semgrep scan --config patches/observability/',
    );
  });

  it('instructs to run before committing', () => {
    expect(devPatch).toContain('before committing');
  });
});

describe('Semgrep JSON output format contract', () => {
  const mockSemgrepOutput = {
    results: [
      {
        check_id: 'catch-without-logging',
        path: 'src/lib/docker.ts',
        start: { line: 42, col: 5 },
        end: { line: 44, col: 6 },
        extra: {
          message: 'catch block without logging',
          severity: 'WARNING',
        },
      },
      {
        check_id: 'function-no-debug-log',
        path: 'src/lib/state.ts',
        start: { line: 10, col: 1 },
        end: { line: 20, col: 2 },
        extra: {
          message: 'function lacks debug-level log statement',
          severity: 'INFO',
        },
      },
      {
        check_id: 'error-path-no-log',
        path: 'src/commands/init.ts',
        start: { line: 88, col: 3 },
        end: { line: 90, col: 4 },
        extra: {
          message: 'error path without logging',
          severity: 'WARNING',
        },
      },
    ],
  };

  it('parseSemgrepOutput extracts gaps with file, line, type, description from raw JSON', () => {
    const gaps = parseSemgrepOutput(mockSemgrepOutput);

    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toEqual({
      file: 'src/lib/docker.ts',
      line: 42,
      type: 'catch-without-logging',
      description: 'catch block without logging',
      severity: 'warning',
    });
    expect(gaps[1]).toEqual({
      file: 'src/lib/state.ts',
      line: 10,
      type: 'function-no-debug-log',
      description: 'function lacks debug-level log statement',
      severity: 'info',
    });
    expect(gaps[2]).toEqual({
      file: 'src/commands/init.ts',
      line: 88,
      type: 'error-path-no-log',
      description: 'error path without logging',
      severity: 'warning',
    });
  });

  it('parseSemgrepOutput returns empty array for empty results', () => {
    const gaps = parseSemgrepOutput({ results: [] });
    expect(gaps).toHaveLength(0);
  });

  it('each raw result contains required review fields: check_id, path, start.line, extra.message', () => {
    for (const result of mockSemgrepOutput.results) {
      expect(result).toHaveProperty('check_id');
      expect(typeof result.check_id).toBe('string');
      expect(result).toHaveProperty('path');
      expect(typeof result.path).toBe('string');
      expect(result).toHaveProperty('start.line');
      expect(typeof result.start.line).toBe('number');
      expect(result).toHaveProperty('extra.message');
      expect(typeof result.extra.message).toBe('string');
    }
  });
});
