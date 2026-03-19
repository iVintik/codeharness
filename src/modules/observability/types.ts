/**
 * Types for the observability analyzer module.
 *
 * These interfaces are tool-agnostic: any static analysis tool
 * (Semgrep, ESLint, custom) can produce conforming output.
 * See architecture Decision 1 for rationale.
 */

/** Severity levels for observability gaps */
export type GapSeverity = 'error' | 'warning' | 'info';

/**
 * A single observability gap found by static analysis.
 *
 * Maps 1:1 from analyzer output. The `type` field carries the
 * rule ID from the analyzer (e.g., "catch-without-logging"),
 * NOT a Semgrep-specific identifier.
 */
export interface ObservabilityGap {
  /** File path where the gap was found */
  readonly file: string;
  /** Line number in the file */
  readonly line: number;
  /** Rule identifier from the analyzer */
  readonly type: string;
  /** Human-readable description of the gap */
  readonly description: string;
  /** Severity of the gap */
  readonly severity: GapSeverity;
}

/**
 * Summary statistics from an analysis run.
 */
export interface AnalyzerSummary {
  /** Total number of functions scanned */
  readonly totalFunctions: number;
  /** Number of functions that have log statements */
  readonly functionsWithLogs: number;
  /** Number of error handlers without logging */
  readonly errorHandlersWithoutLogs: number;
  /** Coverage percentage: functionsWithLogs / totalFunctions * 100 */
  readonly coveragePercent: number;
  /** Distribution of log levels found (e.g., { debug: 5, error: 3 }) */
  readonly levelDistribution: Record<string, number>;
}

/**
 * Configuration for the analyzer module.
 *
 * Allows callers to specify which tool to use and where rules live.
 * Defaults are applied when not provided.
 */
export interface AnalyzerConfig {
  /** The analysis tool to use. Default: 'semgrep' */
  readonly tool?: string;
  /** Directory containing analysis rules, relative to project root. Default: 'patches/observability/' */
  readonly rulesDir?: string;
  /** Timeout for the analysis subprocess in milliseconds. Default: 60000 */
  readonly timeout?: number;
  /**
   * Total number of functions in the project (from an external count or AST scan).
   * When provided, enables accurate coverage computation:
   * coveragePercent = (totalFunctions - functionsWithoutLogs) / totalFunctions * 100.
   * When omitted, totalFunctions defaults to the count of function-no-debug-log matches
   * (functions lacking logs), producing 0% coverage as the best conservative estimate.
   */
  readonly totalFunctions?: number;
}

/**
 * The result of an analysis run, independent of the underlying tool.
 *
 * Any static analysis tool that produces this shape can be used as
 * a drop-in replacement for Semgrep.
 */
export interface AnalyzerResult {
  /** The tool that produced this result (e.g., 'semgrep', 'eslint', 'custom') */
  readonly tool: string;
  /** Observability gaps found */
  readonly gaps: ObservabilityGap[];
  /** Summary statistics */
  readonly summary: AnalyzerSummary;
  /** Whether the analysis was skipped (e.g., tool not installed) */
  readonly skipped?: boolean;
  /** Reason the analysis was skipped, if applicable */
  readonly skipReason?: string;
}

/**
 * Raw JSON output from Semgrep's --json flag.
 * Internal type — not part of the public API.
 */
export interface SemgrepRawOutput {
  readonly results: ReadonlyArray<SemgrepResult>;
  readonly errors?: ReadonlyArray<unknown>;
}

/** A single result entry from Semgrep JSON output */
export interface SemgrepResult {
  readonly check_id: string;
  readonly path: string;
  readonly start: { readonly line: number; readonly col: number };
  readonly end: { readonly line: number; readonly col: number };
  readonly extra: {
    readonly message: string;
    readonly severity: string;
    readonly metadata?: Record<string, unknown>;
  };
}
