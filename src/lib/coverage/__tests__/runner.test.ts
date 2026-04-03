import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execSync: vi.fn(actual.execSync) };
});

import { execSync } from 'node:child_process';
const mockedExecSync = vi.mocked(execSync);
import {
  detectCoverageTool,
  getTestCommand,
  runCoverage,
  checkOnlyCoverage,
} from '../runner.js';
import type { CoverageToolInfo } from '../types.js';
import { writeState, getDefaultState } from '../../state.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-coverage-runner-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  mockedExecSync.mockReset();
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

  it('detects cargo-tarpaulin for rust project with Cargo.toml when tarpaulin installed (AC1)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "my-crate"\nversion = "0.1.0"\n');

    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('cargo tarpaulin --version')) {
        return Buffer.from('cargo-tarpaulin 0.27.0');
      }
      return Buffer.from('');
    });

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('cargo-tarpaulin');
    expect(result.runCommand).toBe('cargo tarpaulin --out json --output-dir coverage/');
    expect(result.reportFormat).toBe('tarpaulin-json');
  });

  it('returns unknown for rust project when tarpaulin not installed (AC5)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "my-crate"\nversion = "0.1.0"\n');

    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('cargo tarpaulin --version')) {
        throw new Error('command not found: cargo-tarpaulin');
      }
      return Buffer.from('');
    });

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('unknown');
    expect(result.runCommand).toBe('');
  });

  it('includes --workspace flag for rust workspace projects (AC2)', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[workspace]\nmembers = ["crate-a", "crate-b"]\n');

    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('cargo tarpaulin --version')) {
        return Buffer.from('cargo-tarpaulin 0.27.0');
      }
      return Buffer.from('');
    });

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('cargo-tarpaulin');
    expect(result.runCommand).toContain('--workspace');
    expect(result.runCommand).toBe('cargo tarpaulin --out json --output-dir coverage/ --workspace');
  });

  it('omits --workspace flag for non-workspace rust projects', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "single-crate"\nversion = "0.1.0"\n');

    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('cargo tarpaulin --version')) {
        return Buffer.from('cargo-tarpaulin 0.27.0');
      }
      return Buffer.from('');
    });

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).not.toContain('--workspace');
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

  it('uses test:unit script for vitest when test:coverage absent', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { 'test:unit': 'vitest run' },
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).toBe('npx vitest run --coverage');
  });

  it('uses npm run test:unit for c8 runner with test:unit script', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { 'test:unit': 'c8 mocha' },
        devDependencies: { c8: '^7.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).toBe('npm run test:unit');
  });

  it('uses npm test for c8 runner with test script only', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        scripts: { test: 'c8 mocha' },
        devDependencies: { c8: '^7.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).toBe('npm test');
  });

  it('falls back to npm test for c8 with no scripts', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { c8: '^7.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).toBe('npm test');
  });

  it('falls back to npx vitest for vitest with no scripts', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    const result = detectCoverageTool(testDir);
    expect(result.runCommand).toBe('npx vitest run --coverage');
  });

  it('returns unknown for python project without coverage tools', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'flask==2.0\nrequests==2.28\n');

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('unknown');
  });

  it('detects coverage.py from pytest-cov in pyproject.toml', () => {
    writeFileSync(join(testDir, 'pyproject.toml'), '[tool.pytest.ini_options]\naddopts = "--cov"\n# uses pytest-cov\n');

    const result = detectCoverageTool(testDir);
    expect(result.tool).toBe('coverage.py');
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

// ─── runCoverage ─────────────────────────────────────────────────────────────

describe('runCoverage', () => {
  it('returns failure result when no coverage tool detected', () => {
    const result = runCoverage(testDir);
    expect(result.success).toBe(false);
    expect(result.testsPassed).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });

  it('runs tests successfully and parses output', () => {
    // Set up a vitest project
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
      JSON.stringify({ total: { statements: { pct: 92.5 } } }),
    );

    mockedExecSync.mockReturnValue('Tests  15 passed' as never);

    const result = runCoverage(testDir);
    expect(result.success).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.passCount).toBe(15);
    expect(result.failCount).toBe(0);
    expect(result.coveragePercent).toBe(92.5);
  });

  it('handles test command failure with output', () => {
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
      JSON.stringify({ total: { statements: { pct: 80 } } }),
    );

    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        const err = new Error('Test failed') as Error & { stdout: string; stderr: string };
        err.stdout = 'Tests  8 passed | 2 failed';
        err.stderr = '';
        throw err;
      }
      return Buffer.from('');
    });

    const result = runCoverage(testDir);
    expect(result.success).toBe(true);
    expect(result.testsPassed).toBe(false);
    expect(result.passCount).toBe(8);
    expect(result.failCount).toBe(2);
    expect(result.coveragePercent).toBe(80);
  });

  it('handles test command failure with no output', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    mockedExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        const err = new Error('Test failed') as Error & { stdout?: string; stderr?: string };
        throw err;
      }
      return Buffer.from('');
    });

    const result = runCoverage(testDir);
    expect(result.success).toBe(false);
    expect(result.testsPassed).toBe(false);
    expect(result.rawOutput).toBe('Test command failed with no output');
  });

  it('sets testsPassed to false when failCount > 0 even if execSync succeeds', () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        devDependencies: { '@vitest/coverage-v8': '^1.0.0' },
      }),
    );

    // execSync succeeds (exit 0) but output shows failures
    mockedExecSync.mockReturnValue('Tests  10 passed | 3 failed' as never);

    const result = runCoverage(testDir);
    expect(result.testsPassed).toBe(false);
    expect(result.failCount).toBe(3);
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

// --- Story 16-5: Coverage Deduplication Skip Logic ---

describe('runCoverage skipIfMet (story 16-5)', () => {
  it('AC#2: skips coverage run when skipIfMet=true and coverage_met=true in state', () => {
    const state = getDefaultState('nodejs');
    state.session_flags.coverage_met = true;
    state.session_flags.tests_passed = true;
    state.coverage.current = 95;
    state.coverage.target = 90;
    writeState(state, testDir);

    // No package.json, no vitest config — normal run would fail
    const result = runCoverage(testDir, true);

    expect(result.success).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.coveragePercent).toBe(95);
    expect(result.rawOutput).toContain('Coverage skip: already met');
    // execSync should NOT have been called
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it('AC#4: does NOT skip when skipIfMet=true but coverage_met=false', () => {
    const state = getDefaultState('nodejs');
    state.session_flags.coverage_met = false;
    state.session_flags.tests_passed = true;
    state.coverage.current = 50;
    writeState(state, testDir);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    // Will fall through to normal run and fail (no coverage tool)
    const result = runCoverage(testDir, true);

    // Falls through: no vitest config detected → unknown tool → fail
    expect(result.success).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });

  it('AC#3: does NOT skip when skipIfMet=false even if coverage_met=true', () => {
    const state = getDefaultState('nodejs');
    state.session_flags.coverage_met = true;
    state.session_flags.tests_passed = true;
    state.coverage.current = 95;
    writeState(state, testDir);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    // skipIfMet = false → normal run
    const result = runCoverage(testDir, false);

    // Falls through: no vitest config detected → unknown tool → fail
    expect(result.success).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });

  it('falls through to normal run when state file is unreadable', () => {
    // No state file written — readStateWithBody will throw
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const result = runCoverage(testDir, true);

    // Falls through to normal run (state unreadable)
    expect(result.success).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });
});

describe('checkOnlyCoverage skipIfMet (story 16-5)', () => {
  it('AC#2: skips coverage check when skipIfMet=true and coverage_met=true in state', () => {
    const state = getDefaultState('nodejs');
    state.session_flags.coverage_met = true;
    state.session_flags.tests_passed = true;
    state.coverage.current = 95;
    state.coverage.target = 90;
    writeState(state, testDir);

    const result = checkOnlyCoverage(testDir, true);

    expect(result.success).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.coveragePercent).toBe(95);
    expect(result.rawOutput).toContain('Coverage skip: already met');
  });

  it('AC#4: does NOT skip when skipIfMet=true but coverage_met=false', () => {
    const state = getDefaultState('nodejs');
    state.session_flags.coverage_met = false;
    writeState(state, testDir);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const result = checkOnlyCoverage(testDir, true);

    // Falls through: no vitest config detected → unknown tool → fail
    expect(result.success).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });

  it('backward compat: works normally without skipIfMet parameter', () => {
    const state = getDefaultState('nodejs');
    state.session_flags.coverage_met = true;
    state.session_flags.tests_passed = true;
    writeState(state, testDir);
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    // No skipIfMet → normal run
    const result = checkOnlyCoverage(testDir);

    // Falls through: no vitest config detected → unknown tool → fail
    expect(result.success).toBe(false);
    expect(result.rawOutput).toContain('No coverage tool detected');
  });
});
