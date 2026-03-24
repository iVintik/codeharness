import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail as failOut, info, warn } from '../output.js';
import { readStateWithBody, writeState } from '../state.js';
import type { CoverageResult, CoverageEvaluation, FileCoverageEntry, PerFileCoverageResult } from './types.js';
import { findCoverageSummary } from './parser.js';

// ─── Coverage Evaluation and State Updates ───────────────────────────────────

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

// ─── Coverage Output Formatting ──────────────────────────────────────────────

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
