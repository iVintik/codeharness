import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTestCounts, parseCoverageReport } from '../parser.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-coverage-parser-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── parseTestCounts ─────────────────────────────────────────────────────────

describe('parseTestCounts', () => {
  it('parses Vitest output — passed only', () => {
    const output = 'Tests  42 passed';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(42);
    expect(failCount).toBe(0);
  });

  it('parses Vitest output — passed and failed', () => {
    const output = 'Tests  10 passed | 3 failed';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(10);
    expect(failCount).toBe(3);
  });

  it('parses Jest output — passed only', () => {
    const output = 'Tests:  12 passed, 12 total';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(12);
    expect(failCount).toBe(0);
  });

  it('parses Jest output — passed and failed', () => {
    const output = 'Tests:  3 failed, 12 passed, 15 total';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(12);
    expect(failCount).toBe(3);
  });

  it('parses pytest output — passed only', () => {
    const output = '12 passed in 0.5s';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(12);
    expect(failCount).toBe(0);
  });

  it('parses pytest output — passed and failed', () => {
    const output = '10 passed, 2 failed';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(10);
    expect(failCount).toBe(2);
  });

  it('parses cargo test output — ok with passed and failed (AC4)', () => {
    const output = 'test result: ok. 42 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.23s';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(42);
    expect(failCount).toBe(3);
  });

  it('parses cargo test output — FAILED result line', () => {
    const output = 'test result: FAILED. 10 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(10);
    expect(failCount).toBe(2);
  });

  it('parses cargo test output — all passed', () => {
    const output = 'test result: ok. 100 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.67s';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(100);
    expect(failCount).toBe(0);
  });

  it('aggregates multiple cargo test result lines for workspace projects', () => {
    const output = [
      'running 5 tests',
      'test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out',
      '',
      'running 10 tests',
      'test result: ok. 10 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out',
      '',
      'running 3 tests',
      'test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out',
    ].join('\n');
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(18);
    expect(failCount).toBe(3);
  });

  it('returns zeros for unrecognized output', () => {
    const output = 'no test results here';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(0);
    expect(failCount).toBe(0);
  });

  // AC3 ordering guard: cargo aggregation fires before pytest fallback
  it('cargo aggregation fires before pytest fallback when both patterns could match', () => {
    // This output contains "test result: ok. 5 passed; 0 failed" which matches cargo,
    // but also "5 passed" which could match pytest. Cargo must win.
    const output = [
      'running 5 tests',
      'test result: ok. 5 passed; 0 failed; 0 ignored',
      'running 3 tests',
      'test result: ok. 3 passed; 0 failed; 0 ignored',
    ].join('\n');
    const { passCount, failCount } = parseTestCounts(output);
    // If cargo aggregation fires, we get 8 passed (5 + 3)
    // If pytest fires first, we'd only get 5 passed
    expect(passCount).toBe(8);
    expect(failCount).toBe(0);
  });
});

// ─── parseCoverageReport ─────────────────────────────────────────────────────

describe('parseCoverageReport', () => {
  it('parses vitest-json coverage report', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(
      join(coverageDir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          statements: { total: 100, covered: 95, skipped: 0, pct: 95.83 },
          lines: { total: 100, covered: 95, skipped: 0, pct: 95 },
          branches: { total: 40, covered: 38, skipped: 0, pct: 95 },
          functions: { total: 30, covered: 28, skipped: 0, pct: 93.33 },
        },
      }),
    );

    const pct = parseCoverageReport(testDir, 'vitest-json');
    expect(pct).toBe(95.83);
  });

  it('parses coverage-py-json coverage report', () => {
    writeFileSync(
      join(testDir, 'coverage.json'),
      JSON.stringify({
        totals: {
          covered_lines: 95,
          num_statements: 100,
          percent_covered: 95.0,
        },
      }),
    );

    const pct = parseCoverageReport(testDir, 'coverage-py-json');
    expect(pct).toBe(95.0);
  });

  it('returns 0 when vitest coverage report missing', () => {
    const pct = parseCoverageReport(testDir, 'vitest-json');
    expect(pct).toBe(0);
  });

  it('returns 0 when python coverage report missing', () => {
    const pct = parseCoverageReport(testDir, 'coverage-py-json');
    expect(pct).toBe(0);
  });

  it('parses tarpaulin-json coverage report (AC3)', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(
      join(coverageDir, 'tarpaulin-report.json'),
      JSON.stringify({
        coverage: 85.5,
        files: [{ path: 'src/main.rs', covered: 10, coverable: 12 }],
      }),
    );

    const pct = parseCoverageReport(testDir, 'tarpaulin-json');
    expect(pct).toBe(85.5);
  });

  it('returns 0 when tarpaulin report missing', () => {
    const pct = parseCoverageReport(testDir, 'tarpaulin-json');
    expect(pct).toBe(0);
  });

  it('returns 0 when tarpaulin report is malformed JSON', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'tarpaulin-report.json'), '{invalid');
    const pct = parseCoverageReport(testDir, 'tarpaulin-json');
    expect(pct).toBe(0);
  });

  it('returns 0 when tarpaulin report has no coverage field', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(
      join(coverageDir, 'tarpaulin-report.json'),
      JSON.stringify({ files: [] }),
    );

    const pct = parseCoverageReport(testDir, 'tarpaulin-json');
    expect(pct).toBe(0);
  });

  it('returns 0 for unknown format', () => {
    const pct = parseCoverageReport(testDir, 'unknown-format');
    expect(pct).toBe(0);
  });

  it('returns 0 when coverage report is malformed JSON', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), '{invalid');
    const pct = parseCoverageReport(testDir, 'vitest-json');
    expect(pct).toBe(0);
  });

  it('returns 0 when python coverage report is malformed', () => {
    writeFileSync(join(testDir, 'coverage.json'), '{invalid');
    const pct = parseCoverageReport(testDir, 'coverage-py-json');
    expect(pct).toBe(0);
  });
});
