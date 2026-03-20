/**
 * Audit module types — dimension status, results, and gaps.
 *
 * FR13 (full compliance report), FR14 (per-dimension status + metric),
 * FR21 (structured output).
 */

/** Status of a single audit dimension */
export type DimensionStatus = 'pass' | 'fail' | 'warn';

/** A specific compliance gap found during audit */
export interface AuditGap {
  /** Which dimension this gap belongs to */
  readonly dimension: string;
  /** Description of the gap */
  readonly description: string;
  /** Suggested fix for the gap */
  readonly suggestedFix: string;
}

/** Result of checking a single audit dimension */
export interface DimensionResult {
  /** Name of the dimension (e.g., 'observability', 'testing') */
  readonly name: string;
  /** Overall status of this dimension */
  readonly status: DimensionStatus;
  /** Human-readable metric (e.g., '85%', 'A', '3/5 verified') */
  readonly metric: string;
  /** List of gaps found in this dimension */
  readonly gaps: AuditGap[];
}

/** Aggregated result of running all audit dimensions */
export interface AuditResult {
  /** Per-dimension results keyed by dimension name */
  readonly dimensions: Record<string, DimensionResult>;
  /** Overall status: fail if any fail, warn if any warn, pass if all pass */
  readonly overallStatus: DimensionStatus;
  /** Total number of gaps across all dimensions */
  readonly gapCount: number;
  /** Time taken to run the full audit in milliseconds */
  readonly durationMs: number;
}
