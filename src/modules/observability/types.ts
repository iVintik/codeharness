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

// ============================================================
// Coverage state types (Story 1.3)
// ============================================================

/** A single coverage history entry with timestamp */
export interface CoverageHistoryEntry {
  /** Coverage percentage at this point in time */
  readonly coveragePercent: number;
  /** ISO 8601 timestamp when this measurement was taken */
  readonly timestamp: string;
}

/** Static analysis coverage state persisted in sprint-state.json */
export interface StaticCoverageState {
  /** Current coverage percentage */
  readonly coveragePercent: number;
  /** ISO 8601 timestamp of last scan */
  readonly lastScanTimestamp: string;
  /** Historical coverage entries */
  readonly history: readonly CoverageHistoryEntry[];
}

/** Coverage targets configuration */
export interface CoverageTargets {
  /** Target coverage percentage for static analysis (default 80) */
  readonly staticTarget: number;
  /** Target coverage percentage for runtime observability (default 60) */
  readonly runtimeTarget?: number;
}

/**
 * Top-level observability coverage state in sprint-state.json.
 *
 * Contains `static` (Story 1.3) and optional `runtime` (Story 2.1) sections.
 * Follows architecture Decision 2 (Separate Metrics).
 */
export interface ObservabilityCoverageState {
  /** Static analysis coverage metrics */
  readonly static: StaticCoverageState;
  /** Coverage targets */
  readonly targets: CoverageTargets;
  /** Runtime observability coverage metrics (Story 2.1) */
  readonly runtime?: RuntimeCoverageState;
}

// ============================================================
// Runtime coverage types (Story 2.1)
// ============================================================

/** A single AC's runtime coverage entry from verification */
export interface RuntimeCoverageEntry {
  /** Acceptance criterion identifier */
  readonly acId: string;
  /** Whether log events were detected for this AC */
  readonly logEventsDetected: boolean;
  /** Number of log events detected */
  readonly logEventCount: number;
  /** Gap note if no log events detected */
  readonly gapNote?: string;
}

/** Result of computing runtime coverage from parsed observability gaps */
export interface RuntimeCoverageResult {
  /** Per-AC runtime coverage entries */
  readonly entries: readonly RuntimeCoverageEntry[];
  /** Total number of ACs evaluated */
  readonly totalACs: number;
  /** Number of ACs that produced log events */
  readonly acsWithLogs: number;
  /** Runtime coverage percentage: acsWithLogs / totalACs * 100 */
  readonly coveragePercent: number;
}

/** Runtime coverage state persisted in sprint-state.json */
export interface RuntimeCoverageState {
  /** Runtime coverage percentage */
  readonly coveragePercent: number;
  /** ISO 8601 timestamp of last validation */
  readonly lastValidationTimestamp: string;
  /** Number of modules with telemetry */
  readonly modulesWithTelemetry: number;
  /** Total number of modules */
  readonly totalModules: number;
  /** Whether telemetry was detected at all */
  readonly telemetryDetected: boolean;
}

/** Trend comparison between latest and previous coverage entries */
export interface CoverageTrend {
  /** Latest coverage percentage */
  readonly current: number;
  /** Previous coverage percentage, or null if only one entry */
  readonly previous: number | null;
  /** Delta: current - previous, or null if only one entry */
  readonly delta: number | null;
  /** Timestamp of latest measurement */
  readonly currentTimestamp: string;
  /** Timestamp of previous measurement, or null */
  readonly previousTimestamp: string | null;
}

/** Result of checking coverage against a target */
export interface CoverageTargetResult {
  /** Whether coverage meets or exceeds the target */
  readonly met: boolean;
  /** Current coverage percentage */
  readonly current: number;
  /** Target coverage percentage */
  readonly target: number;
  /** Gap: target - current (0 if met) */
  readonly gap: number;
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
