/**
 * Types for the validation runner infrastructure.
 * Story 10-2: Validation Infrastructure
 */

import type { StoryStatus } from '../../types/state.js';

/** Verdict for a single validation AC execution */
export type ValidationVerdict = 'pass' | 'fail' | 'blocked';

/** Result of executing a single validation AC */
export interface ValidationACResult {
  /** AC id that was executed */
  readonly acId: number;
  /** Pass/fail/blocked verdict */
  readonly verdict: ValidationVerdict;
  /** Combined stdout/stderr output (empty for blocked) */
  readonly output: string;
  /** Execution duration in milliseconds (0 for blocked) */
  readonly durationMs: number;
  /**
   * Reason for blocked status (e.g. 'integration-required', 'retry-exhausted').
   * Note: 'integration-required' is a status reason string, not a tier name.
   * The corresponding verification tier is `environment-provable`.
   */
  readonly reason?: string;
}

/** Result of creating a validation sprint */
export interface ValidationSprintResult {
  /** Number of validation ACs added to sprint state */
  readonly acsAdded: number;
  /** Number of existing non-validation stories preserved */
  readonly existingPreserved: number;
}

/** Result of a single validation cycle iteration */
export interface ValidationCycleResult {
  /** AC id that was processed */
  readonly acId: number;
  /** What action was taken */
  readonly action: 'passed' | 'failed-routed-to-dev' | 'blocked' | 'no-actionable-ac';
  /** The AC result if one was executed */
  readonly result?: ValidationACResult;
  /** Story key for fix story if one was created */
  readonly fixStoryKey?: string;
  /** Error from dev module if routing failed */
  readonly devError?: string;
}

/** Aggregate progress of a validation run */
export interface ValidationProgress {
  /** Total number of validation ACs */
  readonly total: number;
  /** Number that passed */
  readonly passed: number;
  /** Number that failed (still actionable) */
  readonly failed: number;
  /**
   * Number blocked (integration-required or retry-exhausted).
   * Note: 'integration-required' maps to the `environment-provable` verification tier;
   * 'retry-exhausted' is a status reason unrelated to tier classification.
   */
  readonly blocked: number;
  /** Number remaining in backlog */
  readonly remaining: number;
  /** Per-AC status breakdown */
  readonly perAC: ReadonlyArray<{
    readonly acId: number;
    readonly status: StoryStatus;
    readonly attempts: number;
    readonly lastError: string | null;
  }>;
}
