import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock the coverage library module
vi.mock('../../lib/coverage.js', () => ({
  detectCoverageTool: vi.fn(),
  runCoverage: vi.fn(),
  checkOnlyCoverage: vi.fn(),
  evaluateCoverage: vi.fn(),
  updateCoverageState: vi.fn(),
  printCoverageOutput: vi.fn(),
  checkPerFileCoverage: vi.fn(() => ({ floor: 80, violations: [], totalFiles: 10 })),
}));

vi.mock('../../lib/output.js', () => ({
  ok: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  jsonOutput: vi.fn(),
}));

import { registerCoverageCommand } from '../coverage.js';
import {
  detectCoverageTool,
  runCoverage,
  checkOnlyCoverage,
  evaluateCoverage,
  updateCoverageState,
  printCoverageOutput,
} from '../../lib/coverage.js';
import { ok, fail, info, jsonOutput } from '../../lib/output.js';

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  vi.clearAllMocks();
  testDir = mkdtempSync(join(tmpdir(), 'ch-coverage-cmd-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  process.exitCode = undefined;
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  rmSync(testDir, { recursive: true, force: true });
});

async function runCoverageCmd(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output');
  registerCoverageCommand(program);
  try {
    await program.parseAsync(['node', 'test', 'coverage', ...args]);
  } catch {
    // Commander throws on exitOverride — ignore
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('coverage command', () => {
  it('fails when no coverage tool detected', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'unknown',
      runCommand: '',
      reportFormat: '',
    });

    await runCoverageCmd([]);

    expect(fail).toHaveBeenCalledWith(
      expect.stringContaining('No coverage tool detected'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('runs full coverage flow and prints output on success', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 42,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: 'Tests  42 passed',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: true,
      target: 100,
      actual: 100,
      delta: 5,
      baseline: 95,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd([]);

    expect(runCoverage).toHaveBeenCalled();
    expect(evaluateCoverage).toHaveBeenCalled();
    expect(updateCoverageState).toHaveBeenCalled();
    expect(printCoverageOutput).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('sets exit code 1 when tests fail', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: false,
      passCount: 8,
      failCount: 2,
      coveragePercent: 85,
      rawOutput: 'Tests  8 passed | 2 failed',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: false,
      target: 100,
      actual: 85,
      delta: null,
      baseline: 85,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd([]);

    expect(process.exitCode).toBe(1);
  });

  it('sets exit code 1 when coverage not met', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 90,
      rawOutput: 'Tests  10 passed',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: false,
      target: 100,
      actual: 90,
      delta: null,
      baseline: 90,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd([]);

    expect(process.exitCode).toBe(1);
  });

  it('outputs JSON when --json flag is set', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: true,
      target: 100,
      actual: 100,
      delta: 5,
      baseline: 95,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        testsPassed: true,
        passCount: 10,
        failCount: 0,
        coveragePercent: 100,
        target: 100,
        met: true,
        delta: 5,
        baseline: 95,
        tool: 'c8',
      }),
    );
  });

  it('JSON output includes story when --story flag is set', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: true,
      target: 100,
      actual: 100,
      delta: null,
      baseline: 100,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd(['--json', '--story', '4-3-test']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ story: '4-3-test' }),
    );
  });

  it('uses check-only mode when --check-only flag is set', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(checkOnlyCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 0,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: 'Check-only',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: true,
      target: 100,
      actual: 100,
      delta: null,
      baseline: 100,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd(['--check-only']);

    expect(checkOnlyCoverage).toHaveBeenCalled();
    expect(runCoverage).not.toHaveBeenCalled();
  });

  it('handles failed coverage execution gracefully', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: 'Test command not found',
    });

    await runCoverageCmd([]);

    expect(fail).toHaveBeenCalledWith('Test command not found');
    expect(process.exitCode).toBe(1);
  });

  it('continues when state file update fails', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: true,
      target: 100,
      actual: 100,
      delta: null,
      baseline: 100,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {
      throw new Error('No state file found');
    });

    await runCoverageCmd([]);

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('Could not update state file'),
    );
    expect(printCoverageOutput).toHaveBeenCalled();
  });

  it('outputs JSON failure when tool not detected with --json', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'unknown',
      runCommand: '',
      reportFormat: '',
    });

    await runCoverageCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'No coverage tool detected',
        tool: 'unknown',
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('outputs JSON failure when coverage execution fails with --json', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: 'Test command failed',
    });

    await runCoverageCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fail',
        message: 'Test command failed',
        testsPassed: false,
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('prints story info in text mode when --story is set', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 100,
      rawOutput: '',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: true,
      target: 100,
      actual: 100,
      delta: null,
      baseline: 100,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd(['--story', '4-3-test']);

    expect(info).toHaveBeenCalledWith('Story: 4-3-test');
  });

  it('JSON output has status=fail when tests pass but coverage not met', async () => {
    vi.mocked(detectCoverageTool).mockReturnValue({
      tool: 'c8',
      runCommand: 'npx vitest run --coverage',
      reportFormat: 'vitest-json',
    });
    vi.mocked(runCoverage).mockReturnValue({
      success: true,
      testsPassed: true,
      passCount: 10,
      failCount: 0,
      coveragePercent: 90,
      rawOutput: '',
    });
    vi.mocked(evaluateCoverage).mockReturnValue({
      met: false,
      target: 100,
      actual: 90,
      delta: null,
      baseline: 90,
    });
    vi.mocked(updateCoverageState).mockImplementation(() => {});

    await runCoverageCmd(['--json']);

    expect(jsonOutput).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'fail', met: false }),
    );
    expect(process.exitCode).toBe(1);
  });
});
