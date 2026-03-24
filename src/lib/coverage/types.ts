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
