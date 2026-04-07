import type { EvaluatorScore } from './workflow-state.js';
import type { VerdictMetrics } from './verdict-parser.js';

// --- Types ---

export type CircuitBreakerDecision =
  | { halt: false }
  | {
      halt: true;
      reason: string;
      remainingFailures: number[];
      scoreHistory: number[];
    };

// --- Functions ---

/**
 * Evaluate whether progress is being made based on evaluator scores.
 *
 * Stagnation rule: halt when the passed count has not increased on the most
 * recent iteration (i.e., last score's passed <= second-to-last score's passed).
 *
 * Returns { halt: false } if progress is detected or insufficient history
 * (fewer than 2 data points).
 */
export function evaluateProgress(scores: EvaluatorScore[]): CircuitBreakerDecision {
  if (scores.length < 2) {
    return { halt: false };
  }

  const scoreHistory = scores.map((s) => s.passed);
  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];

  if (last.passed > prev.passed) {
    return { halt: false };
  }

  // Stagnation: passed count did not improve
  const total = last.total;
  const passed = last.passed;
  const remainingFailures = Array.from({ length: total - passed }, (_, i) => i + 1);

  return {
    halt: true,
    reason: 'score-stagnation',
    remainingFailures,
    scoreHistory,
  };
}

/**
 * Evaluate whether progress is being made based on structured metrics.
 *
 * Stagnation rule: halt when ALL metrics are identical for 3+ consecutive
 * iterations. "Changed" means any of: more tests passing, fewer tests failing,
 * fewer lint warnings, or fewer review issues.
 *
 * If metrics are null (agent didn't output them), those iterations are skipped
 * for stagnation purposes.
 *
 * Returns { halt: false } if progress is detected or insufficient history.
 */
export function evaluateMetricsProgress(metricsHistory: Array<VerdictMetrics | null>): { halt: false } | { halt: true; reason: string } {
  // Need at least 3 data points to detect stagnation
  if (metricsHistory.length < 3) {
    return { halt: false };
  }

  const last3 = metricsHistory.slice(-3);

  // If all 3 have structured metrics, compare them
  if (last3.every((m) => m !== null)) {
    const [a, b, c] = last3 as VerdictMetrics[];
    const identical =
      a.testsPassed === b.testsPassed && b.testsPassed === c.testsPassed &&
      a.testsFailed === b.testsFailed && b.testsFailed === c.testsFailed &&
      a.lintWarnings === b.lintWarnings && b.lintWarnings === c.lintWarnings &&
      a.issues === b.issues && b.issues === c.issues;

    if (identical) {
      return {
        halt: true,
        reason: `metrics-stagnation: tests=${c.testsPassed}/${c.testsPassed + c.testsFailed}, lint=${c.lintWarnings}, issues=${c.issues} unchanged for 3 iterations`,
      };
    }
  }

  return { halt: false };
}
