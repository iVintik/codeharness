import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from '../output.js';
import { readStateWithBody } from '../state.js';
import { detectStack, getStackProvider } from '../stacks/index.js';
import type { StackName } from '../stacks/index.js';
import type { CoverageToolInfo, CoverageResult } from './types.js';
import { parseTestCounts, parseCoverageReport } from './parser.js';

export function detectCoverageTool(dir?: string): CoverageToolInfo {
  const baseDir = dir ?? process.cwd();
  const stateHint = getStateToolHint(baseDir);
  const stack = detectStack(baseDir);
  if (!stack) {
    warn('No recognized stack detected — cannot determine coverage tool');
    return { tool: 'unknown', runCommand: '', reportFormat: '' };
  }

  const provider = getStackProvider(stack as StackName);
  if (!provider) {
    warn('No recognized stack detected — cannot determine coverage tool');
    return { tool: 'unknown', runCommand: '', reportFormat: '' };
  }

  const detector = coverageDetectors[provider.name];
  if (detector) {
    return detector(baseDir, stateHint);
  }

  warn('No recognized stack detected — cannot determine coverage tool');
  return { tool: 'unknown', runCommand: '', reportFormat: '' };
}

const coverageDetectors: Record<string, (dir: string, stateHint: string | null) => CoverageToolInfo> = {
  nodejs: (dir, stateHint) => detectNodeCoverageTool(dir, stateHint),
  python: (dir) => detectPythonCoverageTool(dir),
  rust: (dir) => detectRustCoverageTool(dir),
};

function detectRustCoverageTool(dir: string): CoverageToolInfo {
  try {
    execSync('cargo tarpaulin --version', { stdio: 'pipe', timeout: 10_000 });
  } catch {
    // IGNORE: cargo-tarpaulin not installed
    warn('cargo-tarpaulin not installed — coverage detection unavailable');
    return { tool: 'unknown', runCommand: '', reportFormat: '' };
  }

  // Detect workspace
  const cargoPath = join(dir, 'Cargo.toml');
  let isWorkspace = false;
  try {
    const cargoContent = readFileSync(cargoPath, 'utf-8');
    isWorkspace = /^\[workspace\]/m.test(cargoContent);
  } catch { /* IGNORE: Cargo.toml may not exist */ }
  const wsFlag = isWorkspace ? ' --workspace' : '';
  return {
    tool: 'cargo-tarpaulin',
    runCommand: `cargo tarpaulin --out json --output-dir coverage/${wsFlag}`,
    reportFormat: 'tarpaulin-json',
  };
}

function getStateToolHint(dir: string): string | null {
  try {
    const { state } = readStateWithBody(dir);
    return state.coverage.tool || null;
  } catch {
    // IGNORE: state file may not exist
    return null;
  }
}

function detectNodeCoverageTool(dir: string, stateHint: string | null): CoverageToolInfo {
  const hasVitestConfig =
    existsSync(join(dir, 'vitest.config.ts')) ||
    existsSync(join(dir, 'vitest.config.js'));
  const pkgPath = join(dir, 'package.json');
  let hasVitestCoverageV8 = false;
  let hasVitestCoverageIstanbul = false;
  let hasC8 = false;
  let hasJest = false;
  let pkgScripts: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      hasVitestCoverageV8 = '@vitest/coverage-v8' in allDeps;
      hasVitestCoverageIstanbul = '@vitest/coverage-istanbul' in allDeps;
      hasC8 = 'c8' in allDeps;
      hasJest = 'jest' in allDeps;
      pkgScripts = pkg.scripts ?? {};
    } catch {
      // IGNORE: malformed package.json, continue with defaults
    }
  }

  if (hasVitestConfig || hasVitestCoverageV8 || hasVitestCoverageIstanbul) {
    const runCommand = getNodeTestCommand(pkgScripts, 'vitest');
    return { tool: 'c8', runCommand, reportFormat: 'vitest-json' };
  }

  if (hasC8) {
    const runCommand = getNodeTestCommand(pkgScripts, 'c8');
    return { tool: 'c8', runCommand, reportFormat: 'vitest-json' };
  }

  if (hasJest) {
    return {
      tool: 'c8',
      runCommand: 'npx jest --coverage --coverageReporters=json-summary',
      reportFormat: 'jest-json',
    };
  }

  if (stateHint === 'c8') {
    warn('State indicates c8 but no Vitest/c8 found in project — re-detecting');
  }

  warn('No Node.js coverage tool detected');
  return { tool: 'unknown', runCommand: '', reportFormat: '' };
}

function getNodeTestCommand(scripts: Record<string, string>, runner: string): string {
  if (scripts['test:coverage']) {
    return 'npm run test:coverage';
  }
  if (scripts['test:unit']) {
    if (runner === 'vitest') {
      return 'npx vitest run --coverage';
    }
    return `npm run test:unit`;
  }
  if (scripts['test']) {
    if (runner === 'vitest') {
      return 'npx vitest run --coverage';
    }
    return 'npm test';
  }
  if (runner === 'vitest') {
    return 'npx vitest run --coverage';
  }
  return 'npm test';
}

function detectPythonCoverageTool(dir: string): CoverageToolInfo {
  const reqPath = join(dir, 'requirements.txt');
  if (existsSync(reqPath)) {
    try {
      const content = readFileSync(reqPath, 'utf-8');
      if (content.includes('pytest-cov') || content.includes('coverage')) {
        return {
          tool: 'coverage.py',
          runCommand: 'coverage run -m pytest && coverage json',
          reportFormat: 'coverage-py-json',
        };
      }
    } catch {
      // IGNORE: requirements.txt may be unreadable
    }
  }

  const pyprojectPath = join(dir, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8');
      if (content.includes('pytest-cov') || content.includes('coverage')) {
        return {
          tool: 'coverage.py',
          runCommand: 'coverage run -m pytest && coverage json',
          reportFormat: 'coverage-py-json',
        };
      }
    } catch {
      // IGNORE: pyproject.toml may be unreadable
    }
  }

  warn('No Python coverage tool detected');
  return { tool: 'unknown', runCommand: '', reportFormat: '' };
}

export function getTestCommand(dir?: string): string {
  const toolInfo = detectCoverageTool(dir);
  return toolInfo.runCommand;
}

export function runCoverage(dir?: string): CoverageResult {
  const baseDir = dir ?? process.cwd();
  const toolInfo = detectCoverageTool(baseDir);

  if (toolInfo.tool === 'unknown' || !toolInfo.runCommand) {
    return {
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: 'No coverage tool detected. Ensure your project has a test runner configured.',
    };
  }

  let rawOutput = '';
  let testsPassed = true;

  try {
    rawOutput = execSync(toolInfo.runCommand, {
      cwd: baseDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000, // 5 minute timeout
    });
  } catch (err: unknown) {
    const execError = err as { status?: number; stdout?: string; stderr?: string };
    testsPassed = false;
    rawOutput = (execError.stdout ?? '') + (execError.stderr ?? '');

    if (!rawOutput) {
      return {
        success: false,
        testsPassed: false,
        passCount: 0,
        failCount: 0,
        coveragePercent: 0,
        rawOutput: 'Test command failed with no output',
      };
    }
  }

  const { passCount, failCount } = parseTestCounts(rawOutput);
  if (failCount > 0) {
    testsPassed = false;
  }

  const coveragePercent = parseCoverageReport(baseDir, toolInfo.reportFormat);

  return {
    success: true,
    testsPassed,
    passCount,
    failCount,
    coveragePercent,
    rawOutput,
  };
}

export function checkOnlyCoverage(dir?: string): CoverageResult {
  const baseDir = dir ?? process.cwd();
  const toolInfo = detectCoverageTool(baseDir);

  if (toolInfo.tool === 'unknown') {
    return {
      success: false,
      testsPassed: false,
      passCount: 0,
      failCount: 0,
      coveragePercent: 0,
      rawOutput: 'No coverage tool detected',
    };
  }

  const coveragePercent = parseCoverageReport(baseDir, toolInfo.reportFormat);
  // Preserve existing tests_passed flag — check-only doesn't run tests
  let testsPassed = true;
  try {
    const { state } = readStateWithBody(baseDir);
    testsPassed = state.session_flags.tests_passed;
  } catch {
    // IGNORE: no state file, default to true for first-run check-only
  }

  return {
    success: true,
    testsPassed,
    passCount: 0,
    failCount: 0,
    coveragePercent,
    rawOutput: 'Check-only mode — read existing coverage report',
  };
}
