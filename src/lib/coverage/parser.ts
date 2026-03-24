import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from '../output.js';

// ─── Test Output Parsing ─────────────────────────────────────────────────────

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
  // ORDERING GUARD: cargo aggregation MUST fire before the pytest fallback regex,
  // because "N passed" alone could match pytest's pattern on cargo output.
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

// ─── Coverage Report Parsing ─────────────────────────────────────────────────

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

/**
 * Find coverage-summary.json — it may be at coverage/ or src/coverage/
 * depending on the vitest root config.
 */
export function findCoverageSummary(dir: string): string | null {
  const candidates = [
    join(dir, 'coverage', 'coverage-summary.json'),
    join(dir, 'src', 'coverage', 'coverage-summary.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
