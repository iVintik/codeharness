import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail as failOut, info, warn } from './output.js';
import { readStateWithBody, writeState } from './state.js';
import { detectStack, getStackProvider } from './stacks/index.js';
import type { StackName } from './stacks/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CoverageToolInfo {
  tool: 'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown';
  runCommand: string;
  reportFormat: string;
}

export interface CoverageResult {
  success: boolean;
  testsPassed: boolean;
  passCount: number;
  failCount: number;
  coveragePercent: number;
  rawOutput: string;
}

export interface CoverageEvaluation {
  met: boolean;
  target: number;
  actual: number;
  delta: number | null;
  baseline: number | null;
}

// ─── Coverage Tool Detection (Task 1) ────────────────────────────────────────

export function detectCoverageTool(dir?: string): CoverageToolInfo {
  const baseDir = dir ?? process.cwd();

  // Check state file hint first
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

  // Delegate to stack-specific detection via provider-keyed helper map
  const detector = coverageDetectors[provider.name];
  if (detector) {
    return detector(baseDir, stateHint);
  }

  warn('No recognized stack detected — cannot determine coverage tool');
  return { tool: 'unknown', runCommand: '', reportFormat: '' };
}

/** Stack-keyed coverage detection dispatchers (no stack string comparisons outside stacks/) */
const coverageDetectors: Record<string, (dir: string, stateHint: string | null) => CoverageToolInfo> = {
  nodejs: (dir, stateHint) => detectNodeCoverageTool(dir, stateHint),
  python: (dir) => detectPythonCoverageTool(dir),
  rust: (dir) => detectRustCoverageTool(dir),
};

function detectRustCoverageTool(dir: string): CoverageToolInfo {
  // Check if cargo-tarpaulin is installed
  try {
    execSync('cargo tarpaulin --version', { stdio: 'pipe', timeout: 10_000 });
  } catch {
    warn('cargo-tarpaulin not installed — coverage detection unavailable');
    return { tool: 'unknown', runCommand: '', reportFormat: '' };
  }

  // Detect workspace
  const cargoPath = join(dir, 'Cargo.toml');
  let isWorkspace = false;
  try {
    const cargoContent = readFileSync(cargoPath, 'utf-8');
    isWorkspace = /^\[workspace\]/m.test(cargoContent);
  } catch { /* not a workspace */ }

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
    return null;
  }
}

function detectNodeCoverageTool(dir: string, stateHint: string | null): CoverageToolInfo {
  // Check for Vitest config files
  const hasVitestConfig =
    existsSync(join(dir, 'vitest.config.ts')) ||
    existsSync(join(dir, 'vitest.config.js'));

  // Check package.json devDependencies
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
      // Malformed package.json — continue with defaults
    }
  }

  // Determine tool and run command
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

  // State hint says c8 but nothing found — re-detect failed
  if (stateHint === 'c8') {
    warn('State indicates c8 but no Vitest/c8 found in project — re-detecting');
  }

  warn('No Node.js coverage tool detected');
  return { tool: 'unknown', runCommand: '', reportFormat: '' };
}

function getNodeTestCommand(scripts: Record<string, string>, runner: string): string {
  // Prefer package.json scripts in order: test:coverage -> test:unit -> test
  if (scripts['test:coverage']) {
    return 'npm run test:coverage';
  }
  if (scripts['test:unit']) {
    // Need to add --coverage flag
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
  // Check requirements.txt
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
      // Continue checking
    }
  }

  // Check pyproject.toml
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
      // Continue checking
    }
  }

  warn('No Python coverage tool detected');
  return { tool: 'unknown', runCommand: '', reportFormat: '' };
}

export function getTestCommand(dir?: string): string {
  const toolInfo = detectCoverageTool(dir);
  return toolInfo.runCommand;
}

// ─── Coverage Execution and Parsing (Task 2) ─────────────────────────────────

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

  // Parse test counts from output
  const { passCount, failCount } = parseTestCounts(rawOutput);

  // If we detected failures from output but exit code was 0, trust the output
  if (failCount > 0) {
    testsPassed = false;
  }

  // Parse coverage from report file
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

export function parseCoverageReport(dir: string, format: string): number {
  if (format === 'vitest-json' || format === 'jest-json') {
    return parseVitestCoverage(dir);
  }
  if (format === 'coverage-py-json') {
    return parsePythonCoverage(dir);
  }
  if (format === 'tarpaulin-json') {
    return parseTarpaulinCoverage(dir);
  }
  return 0;
}

function parseVitestCoverage(dir: string): number {
  const reportPath = findCoverageSummary(dir);
  if (!reportPath) {
    warn('Coverage report not found at coverage/coverage-summary.json');
    return 0;
  }

  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
      total?: {
        statements?: { pct?: number };
        lines?: { pct?: number };
        branches?: { pct?: number };
        functions?: { pct?: number };
      };
    };
    return report.total?.statements?.pct ?? 0;
  } catch {
    warn('Failed to parse coverage report');
    return 0;
  }
}

function parsePythonCoverage(dir: string): number {
  const reportPath = join(dir, 'coverage.json');
  if (!existsSync(reportPath)) {
    warn('Coverage report not found at coverage.json');
    return 0;
  }

  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as {
      totals?: { percent_covered?: number };
    };
    return report.totals?.percent_covered ?? 0;
  } catch {
    warn('Failed to parse coverage report');
    return 0;
  }
}

function parseTarpaulinCoverage(dir: string): number {
  const reportPath = join(dir, 'coverage', 'tarpaulin-report.json');
  if (!existsSync(reportPath)) {
    warn('Tarpaulin report not found at coverage/tarpaulin-report.json');
    return 0;
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as { coverage?: number };
    return report.coverage ?? 0;
  } catch {
    warn('Failed to parse tarpaulin coverage report');
    return 0;
  }
}

export function parseTestCounts(output: string): { passCount: number; failCount: number } {
  // Vitest format: "Tests  12 passed | 3 failed"
  const vitestMatch = /Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?/i.exec(output);
  if (vitestMatch) {
    return {
      passCount: parseInt(vitestMatch[1], 10),
      failCount: vitestMatch[2] ? parseInt(vitestMatch[2], 10) : 0,
    };
  }

  // Jest format: "Tests:  3 failed, 12 passed, 15 total"
  const jestMatch = /Tests:\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed/i.exec(output);
  if (jestMatch) {
    return {
      passCount: parseInt(jestMatch[2], 10),
      failCount: jestMatch[1] ? parseInt(jestMatch[1], 10) : 0,
    };
  }

  // cargo test format: "test result: ok. 42 passed; 3 failed; 0 ignored"
  // Workspace projects emit multiple test result lines (one per crate) — aggregate all.
  const cargoRegex = /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed/gi;
  let cargoMatch = cargoRegex.exec(output);
  if (cargoMatch) {
    let totalPass = 0;
    let totalFail = 0;
    while (cargoMatch) {
      totalPass += parseInt(cargoMatch[1], 10);
      totalFail += parseInt(cargoMatch[2], 10);
      cargoMatch = cargoRegex.exec(output);
    }
    return { passCount: totalPass, failCount: totalFail };
  }

  // pytest format: "12 passed, 3 failed"
  const pytestMatch = /(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i.exec(output);
  if (pytestMatch) {
    return {
      passCount: parseInt(pytestMatch[1], 10),
      failCount: pytestMatch[2] ? parseInt(pytestMatch[2], 10) : 0,
    };
  }

  return { passCount: 0, failCount: 0 };
}

// ─── Check-only mode: read last coverage report without running tests ────────

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

  // Preserve existing tests_passed flag from state rather than blindly assuming true.
  // Check-only mode doesn't run tests, so it should not overwrite the flag.
  let testsPassed = true;
  try {
    const { state } = readStateWithBody(baseDir);
    testsPassed = state.session_flags.tests_passed;
  } catch {
    // No state file — default to true (optimistic for first-run check-only)
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

// ─── Coverage Evaluation and State Updates (Task 3) ──────────────────────────

export function evaluateCoverage(result: CoverageResult, dir?: string): CoverageEvaluation {
  const baseDir = dir ?? process.cwd();

  let target = 90;
  let baseline: number | null = null;

  try {
    const { state } = readStateWithBody(baseDir);
    target = state.coverage.target ?? 90;
    baseline = state.coverage.baseline;
  } catch {
    // No state file — use defaults
  }

  const actual = result.coveragePercent;
  const met = actual >= target;

  // If baseline is null (first run), set it to current
  const effectiveBaseline = baseline ?? actual;
  const delta = baseline !== null ? actual - baseline : null;

  return {
    met,
    target,
    actual,
    delta,
    baseline: effectiveBaseline,
  };
}

export function updateCoverageState(
  result: CoverageResult,
  evaluation: CoverageEvaluation,
  dir?: string,
): void {
  const baseDir = dir ?? process.cwd();
  const { state, body } = readStateWithBody(baseDir);

  state.session_flags.tests_passed = result.testsPassed;
  state.session_flags.coverage_met = evaluation.met;
  state.coverage.current = evaluation.actual;

  // Set baseline on first run (when it was null)
  if (state.coverage.baseline === null) {
    state.coverage.baseline = evaluation.actual;
  }

  writeState(state, baseDir, body);
}

// ─── Per-file Coverage Floor Check ───────────────────────────────────────────

export interface FileCoverageEntry {
  file: string;
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface PerFileCoverageResult {
  floor: number;
  violations: FileCoverageEntry[];
  totalFiles: number;
}

/**
 * Checks per-file coverage against a minimum floor.
 * Reads coverage-summary.json and returns any files below the threshold.
 */
export function checkPerFileCoverage(floor: number, dir?: string): PerFileCoverageResult {
  const baseDir = dir ?? process.cwd();
  const reportPath = findCoverageSummary(baseDir);

  if (!reportPath) {
    return { floor, violations: [], totalFiles: 0 };
  }

  let report: Record<string, { statements?: { pct?: number }; branches?: { pct?: number }; functions?: { pct?: number }; lines?: { pct?: number } }>;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf-8')) as typeof report;
  } catch {
    warn('Failed to parse coverage-summary.json');
    return { floor, violations: [], totalFiles: 0 };
  }

  const violations: FileCoverageEntry[] = [];
  let totalFiles = 0;

  for (const [key, data] of Object.entries(report)) {
    if (key === 'total') continue;
    totalFiles++;

    const stmts = data.statements?.pct ?? 0;
    const branches = data.branches?.pct ?? 0;
    const funcs = data.functions?.pct ?? 0;
    const lines = data.lines?.pct ?? 0;

    if (stmts < floor) {
      // Extract relative path from absolute
      const relative = key.startsWith(baseDir)
        ? key.slice(baseDir.length + 1)
        : key;

      violations.push({
        file: relative,
        statements: stmts,
        branches,
        functions: funcs,
        lines,
      });
    }
  }

  // Sort worst first
  violations.sort((a, b) => a.statements - b.statements);

  return { floor, violations, totalFiles };
}

/**
 * Find coverage-summary.json — it may be at coverage/ or src/coverage/
 * depending on the vitest root config.
 */
function findCoverageSummary(dir: string): string | null {
  const candidates = [
    join(dir, 'coverage', 'coverage-summary.json'),
    join(dir, 'src', 'coverage', 'coverage-summary.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function formatCoverageOutput(evaluation: CoverageEvaluation): string[] {
  const lines: string[] = [];

  if (evaluation.met) {
    lines.push(`[OK] Coverage: ${evaluation.actual}%`);
  } else {
    lines.push(`[FAIL] Coverage: ${evaluation.actual}% (target: ${evaluation.target}%)`);
  }

  if (evaluation.delta !== null && evaluation.baseline !== null) {
    const sign = evaluation.delta >= 0 ? '+' : '';
    const before = evaluation.actual - evaluation.delta;
    lines.push(
      `[INFO] Coverage delta: ${sign}${evaluation.delta}% (${before}% -> ${evaluation.actual}%)`,
    );
  }

  return lines;
}

export function printCoverageOutput(
  result: CoverageResult,
  evaluation: CoverageEvaluation,
): void {
  // Print test results
  if (result.testsPassed) {
    ok(`Tests passed: ${result.passCount} passed`);
  } else {
    failOut(`Tests failed: ${result.passCount} passed, ${result.failCount} failed`);
  }

  // Print coverage evaluation
  if (evaluation.met) {
    ok(`Coverage: ${evaluation.actual}%`);
  } else {
    failOut(`Coverage: ${evaluation.actual}% (target: ${evaluation.target}%)`);
  }

  // Print delta if available
  if (evaluation.delta !== null && evaluation.baseline !== null) {
    const sign = evaluation.delta >= 0 ? '+' : '';
    const before = evaluation.actual - evaluation.delta;
    info(`Coverage delta: ${sign}${evaluation.delta}% (${before}% -> ${evaluation.actual}%)`);
  }
}
