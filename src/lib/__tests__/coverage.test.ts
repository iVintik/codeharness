import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectCoverageTool,
  getTestCommand,
  runCoverage,
  checkOnlyCoverage,
  evaluateCoverage,
  updateCoverageState,
  formatCoverageOutput,
  parseTestCounts,
  parseCoverageReport,
  printCoverageOutput,
  checkPerFileCoverage,
} from '../coverage.js';
import type { CoverageResult, CoverageEvaluation, CoverageToolInfo } from '../coverage.js';
import { writeState, getDefaultState, readStateWithBody } from '../state.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-coverage-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── detectCoverageTool ──────────────────────────────────────────────────────

describe('detectCoverageTool', () => {
  it('detects c8 from vitest config file', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    writeFileSync(join(testDir, 'vitest.config.ts'), 'export default {}');

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('c8');
    expect(result.reportFormat).toBe('vitest-json');
  });

  it('detects c8 from @vitest/coverage-v8 in devDependencies', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('c8');
  });

  it('detects c8 from @vitest/coverage-istanbul in devDependencies', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-istanbul': '^1.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('c8');
  });

  it('detects c8 from c8 in devDependencies', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { c8: '^7.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('c8');
  });

  it('detects jest coverage for jest projects', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { jest: '^29.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('c8');
    expect(result.runCommand).toContain('jest');
    expect(result.runCommand).toContain('--coverage');
  });

  it('detects coverage.py from requirements.txt', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'coverage==7.0\npytest==8.0\n');

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('coverage.py');
    expect(result.runCommand).toContain('coverage run');
    expect(result.reportFormat).toBe('coverage-py-json');
  });

  it('detects coverage.py from pytest-cov in requirements.txt', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'pytest-cov==4.0\n');

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('coverage.py');
  });

  it('detects coverage.py from pyproject.toml', () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '[tool.pytest]\ncoverage = true\n');

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('coverage.py');
  });

  it('returns unknown when no indicators found', () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'bare-project' }));

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('unknown');
    expect(result.runCommand).toBe('');
  });

  it('returns unknown for unrecognized stack', () => {
    // No package.json, no requirements.txt — no stack detected
    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('unknown');
  });

  it('CoverageToolInfo type accepts cargo-tarpaulin', () => {
    const info: CoverageToolInfo = {
      tool: 'cargo-tarpaulin',
      runCommand: 'cargo tarpaulin --out json',
      reportFormat: 'tarpaulin-json',
    };
    expect(info.tool).toBe('cargo-tarpaulin');
  });

  it('detects cargo-tarpaulin for rust project with Cargo.toml', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "my-crate"\nversion = "0.1.0"\n');
    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('cargo-tarpaulin');
    expect(result.runCommand).toBe('cargo tarpaulin --out json');
    expect(result.reportFormat).toBe('tarpaulin-json');
  });

  it('prefers test:coverage script when available', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { 'test:coverage': 'vitest run --coverage' },
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).toBe('npm run test:coverage');
  });

  it('reads state file hint but re-detects when project config disagrees', () => {
    // Create state with c8 hint
    const state = getDefaultState('nodejs');
    state.coverage.tool = 'c8';
    writeState(state, testDir);

    // But project has no vitest/c8
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'bare' }));

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('unknown'); // Re-detected as unknown
  });

  it('handles malformed package.json gracefully', () => {
    writeFileSync(join(testDir, 'package.json'), '{invalid json');
    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('unknown');
  });
});

// ─── getTestCommand ──────────────────────────────────────────────────────────

describe('getTestCommand', () => {
  it('returns the run command from detectCoverageTool', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    const cmd = getTestCommand(testDir);
    expect(cmd).toContain('vitest');
  });

  it('returns empty string when no tool detected', () => {
    const cmd = getTestCommand(testDir);
    expect(cmd).toBe('');
  });
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

  it('returns zeros for unrecognized output', () => {
    const output = 'no test results here';
    const { passCount, failCount } = parseTestCounts(output);
    expect(passCount).toBe(0);
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

// ─── runCoverage ─────────────────────────────────────────────────────────────

describe('runCoverage', () => {
  it('returns failure result when no coverage tool detected', () => {
    const result = runCoverage(testDir);
    expect(result.success).toBe(false);
    expect(result.testsPassed).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });
});

// ─── checkOnlyCoverage ───────────────────────────────────────────────────────

describe('checkOnlyCoverage', () => {
  it('reads existing coverage report without running tests', () => {
    // Set up a Node.js project with coverage data
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(
      join(coverageDir, 'coverage-summary.json'),
      JSON.stringify({
        total: {
          statements: { pct: 88.5 },
        },
      }),
    );

    const result = checkOnlyCoverage(testDir);
    expect(result.success).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.coveragePercent).toBe(88.5);
    expect(result.rawOutput).toContain('Check-only');
  });

  it('returns failure when no tool detected', () => {
    const result = checkOnlyCoverage(testDir);
    expect(result.success).toBe(false);
  });

  it('preserves tests_passed=false from state file', () => {
    // Set up project with coverage data
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(
      join(coverageDir, 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 90 } } }),
    );

    // Set up state with tests_passed=false (from a previous failed run)
    const state = getDefaultState('nodejs');
    state.session_flags.tests_passed = false;
    writeState(state, testDir);

    const result = checkOnlyCoverage(testDir);
    expect(result.success).toBe(true);
    expect(result.testsPassed).toBe(false); // Should preserve state, not assume true
    expect(result.coveragePercent).toBe(90);
  });

  it('defaults testsPassed to true when no state file exists', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(
      join(coverageDir, 'coverage-summary.json'),
      JSON.stringify({ total: { statements: { pct: 100 } } }),
    );

    const result = checkOnlyCoverage(testDir);
    expect(result.testsPassed).toBe(true);
  });
});

// ─── evaluateCoverage ────────────────────────────────────────────────────────

describe('evaluateCoverage', () => {
  it('returns met=true when coverage meets target', () => {
    const state = getDefaultState('nodejs');
    state.coverage.target = 100;
    state.coverage.baseline = 95;
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    };

    const evaluation = evaluateCoverage(result, testDir);
    expect(evaluation.met).toBe(true);
    expect(evaluation.target).toBe(100);
    expect(evaluation.actual).toBe(100);
    expect(evaluation.delta).toBe(5);
    expect(evaluation.baseline).toBe(95);
  });

  it('returns met=false when coverage below target', () => {
    const state = getDefaultState('nodejs');
    state.coverage.target = 100;
    state.coverage.baseline = 90;
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 87,
      rawOutput: '',
    };

    const evaluation = evaluateCoverage(result, testDir);
    expect(evaluation.met).toBe(false);
    expect(evaluation.actual).toBe(87);
    expect(evaluation.delta).toBe(-3);
  });

  it('sets baseline to current on first run (null baseline)', () => {
    const state = getDefaultState('nodejs');
    state.coverage.baseline = null;
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 75,
      rawOutput: '',
    };

    const evaluation = evaluateCoverage(result, testDir);
    expect(evaluation.baseline).toBe(75);
    expect(evaluation.delta).toBeNull();
  });

  it('calculates positive delta correctly', () => {
    const state = getDefaultState('nodejs');
    state.coverage.baseline = 90;
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    };

    const evaluation = evaluateCoverage(result, testDir);
    expect(evaluation.delta).toBe(10);
  });

  it('uses default target of 90 when no state file', () => {
    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 5,
      failCount: 0,
      coveragePercent: 85,
      rawOutput: '',
    };

    const evaluation = evaluateCoverage(result, testDir);
    expect(evaluation.target).toBe(90);
    expect(evaluation.met).toBe(false);
  });
});

// ─── updateCoverageState ─────────────────────────────────────────────────────

describe('updateCoverageState', () => {
  it('sets tests_passed and coverage_met flags', () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    };
    const evaluation: CoverageEvaluation = {
      met: true,
      target: 100,
      actual: 100,
      delta: 5,
      baseline: 95,
    };

    updateCoverageState(result, evaluation, testDir);

    const { state: updated } = readStateWithBody(testDir);
    expect(updated.session_flags.tests_passed).toBe(true);
    expect(updated.session_flags.coverage_met).toBe(true);
    expect(updated.coverage.current).toBe(100);
  });

  it('sets flags to false when tests fail', () => {
    const state = getDefaultState('nodejs');
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: false,
      passCount: 5,
      failCount: 3,
      coveragePercent: 80,
      rawOutput: '',
    };
    const evaluation: CoverageEvaluation = {
      met: false,
      target: 100,
      actual: 80,
      delta: null,
      baseline: 80,
    };

    updateCoverageState(result, evaluation, testDir);

    const { state: updated } = readStateWithBody(testDir);
    expect(updated.session_flags.tests_passed).toBe(false);
    expect(updated.session_flags.coverage_met).toBe(false);
    expect(updated.coverage.current).toBe(80);
  });

  it('sets baseline on first run when it was null', () => {
    const state = getDefaultState('nodejs');
    state.coverage.baseline = null;
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 75,
      rawOutput: '',
    };
    const evaluation: CoverageEvaluation = {
      met: false,
      target: 100,
      actual: 75,
      delta: null,
      baseline: 75,
    };

    updateCoverageState(result, evaluation, testDir);

    const { state: updated } = readStateWithBody(testDir);
    expect(updated.coverage.baseline).toBe(75);
  });

  it('does not overwrite existing baseline', () => {
    const state = getDefaultState('nodejs');
    state.coverage.baseline = 50;
    writeState(state, testDir);

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 90,
      rawOutput: '',
    };
    const evaluation: CoverageEvaluation = {
      met: false,
      target: 100,
      actual: 90,
      delta: 40,
      baseline: 50,
    };

    updateCoverageState(result, evaluation, testDir);

    const { state: updated } = readStateWithBody(testDir);
    expect(updated.coverage.baseline).toBe(50);
  });
});

// ─── formatCoverageOutput ────────────────────────────────────────────────────

describe('formatCoverageOutput', () => {
  it('formats passing coverage', () => {
    const evaluation: CoverageEvaluation = {
      met: true,
      target: 100,
      actual: 100,
      delta: null,
      baseline: 100,
    };

    const lines = formatCoverageOutput(evaluation);
    expect(lines).toEqual(['[OK] Coverage: 100%']);
  });

  it('formats failing coverage', () => {
    const evaluation: CoverageEvaluation = {
      met: false,
      target: 100,
      actual: 87,
      delta: null,
      baseline: 87,
    };

    const lines = formatCoverageOutput(evaluation);
    expect(lines).toEqual(['[FAIL] Coverage: 87% (target: 100%)']);
  });

  it('includes delta when available', () => {
    const evaluation: CoverageEvaluation = {
      met: true,
      target: 100,
      actual: 100,
      delta: 4,
      baseline: 96,
    };

    const lines = formatCoverageOutput(evaluation);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('[OK] Coverage: 100%');
    expect(lines[1]).toBe('[INFO] Coverage delta: +4% (96% -> 100%)');
  });

  it('formats negative delta', () => {
    const evaluation: CoverageEvaluation = {
      met: false,
      target: 100,
      actual: 85,
      delta: -5,
      baseline: 90,
    };

    const lines = formatCoverageOutput(evaluation);
    expect(lines[1]).toBe('[INFO] Coverage delta: -5% (90% -> 85%)');
  });
});

// ─── printCoverageOutput ─────────────────────────────────────────────────────

describe('printCoverageOutput', () => {
  it('calls console.log with formatted output for passing tests', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result: CoverageResult = {
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    };
    const evaluation: CoverageEvaluation = {
      met: true,
      target: 100,
      actual: 100,
      delta: null,
      baseline: 100,
    };

    printCoverageOutput(result, evaluation);

    expect(consoleSpy).toHaveBeenCalledWith('[OK] Tests passed: 10 passed');
    expect(consoleSpy).toHaveBeenCalledWith('[OK] Coverage: 100%');
    consoleSpy.mockRestore();
  });

  it('calls console.log with failure output for failing tests', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result: CoverageResult = {
      success: true,
      testsPassed: false,
      passCount: 8,
      failCount: 2,
      coveragePercent: 85,
      rawOutput: '',
    };
    const evaluation: CoverageEvaluation = {
      met: false,
      target: 100,
      actual: 85,
      delta: -5,
      baseline: 90,
    };

    printCoverageOutput(result, evaluation);

    expect(consoleSpy).toHaveBeenCalledWith('[FAIL] Tests failed: 8 passed, 2 failed');
    expect(consoleSpy).toHaveBeenCalledWith('[FAIL] Coverage: 85% (target: 100%)');
    expect(consoleSpy).toHaveBeenCalledWith('[INFO] Coverage delta: -5% (90% -> 85%)');
    consoleSpy.mockRestore();
  });
});

// ─── checkPerFileCoverage ───────────────────────────────────────────────────

describe('checkPerFileCoverage', () => {
  it('returns no violations when all files above floor', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), JSON.stringify({
      total: { statements: { pct: 95 } },
      '/project/src/good.ts': { statements: { pct: 95 }, branches: { pct: 90 }, functions: { pct: 100 }, lines: { pct: 95 } },
      '/project/src/also-good.ts': { statements: { pct: 88 }, branches: { pct: 82 }, functions: { pct: 100 }, lines: { pct: 88 } },
    }));

    const result = checkPerFileCoverage(80, testDir);
    expect(result.violations).toHaveLength(0);
    expect(result.totalFiles).toBe(2);
    expect(result.floor).toBe(80);
  });

  it('returns violations for files below floor', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), JSON.stringify({
      total: { statements: { pct: 85 } },
      [join(testDir, 'src', 'good.ts')]: { statements: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 }, lines: { pct: 100 } },
      [join(testDir, 'src', 'bad.ts')]: { statements: { pct: 30 }, branches: { pct: 20 }, functions: { pct: 50 }, lines: { pct: 30 } },
      [join(testDir, 'src', 'also-bad.ts')]: { statements: { pct: 60 }, branches: { pct: 55 }, functions: { pct: 75 }, lines: { pct: 60 } },
    }));

    const result = checkPerFileCoverage(80, testDir);
    expect(result.violations).toHaveLength(2);
    expect(result.totalFiles).toBe(3);
    // Sorted worst first
    expect(result.violations[0].statements).toBe(30);
    expect(result.violations[0].file).toBe(join('src', 'bad.ts'));
    expect(result.violations[1].statements).toBe(60);
  });

  it('returns empty when no coverage report found', () => {
    const result = checkPerFileCoverage(80, testDir);
    expect(result.violations).toHaveLength(0);
    expect(result.totalFiles).toBe(0);
  });

  it('finds coverage-summary.json in src/coverage/ fallback', () => {
    const coverageDir = join(testDir, 'src', 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), JSON.stringify({
      total: { statements: { pct: 90 } },
      '/project/src/file.ts': { statements: { pct: 70 }, branches: { pct: 60 }, functions: { pct: 80 }, lines: { pct: 70 } },
    }));

    const result = checkPerFileCoverage(80, testDir);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].statements).toBe(70);
  });

  it('handles malformed coverage-summary.json gracefully', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), 'not json');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = checkPerFileCoverage(80, testDir);
    expect(result.violations).toHaveLength(0);
    expect(result.totalFiles).toBe(0);
    consoleSpy.mockRestore();
  });

  it('excludes total key from file count', () => {
    const coverageDir = join(testDir, 'coverage');
    mkdirSync(coverageDir, { recursive: true });
    writeFileSync(join(coverageDir, 'coverage-summary.json'), JSON.stringify({
      total: { statements: { pct: 100 } },
      '/project/src/only.ts': { statements: { pct: 100 }, branches: { pct: 100 }, functions: { pct: 100 }, lines: { pct: 100 } },
    }));

    const result = checkPerFileCoverage(80, testDir);
    expect(result.totalFiles).toBe(1);
  });
});
