import type { EvaluatorScore } from './workflow-state.js';

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
 * Evaluate whether progress is being made based on evaluator score history.
 *
 * Stagnation rule: halt when the `passed` count has not increased for 2+
 * consecutive iterations (i.e., the most recent `passed` is not greater than
 * the one before it, for at least two data points).
 *
 * Pure computation — no I/O, no async, no state mutation.
 */
export function evaluateProgress(scores: EvaluatorScore[]): CircuitBreakerDecision {
  // Insufficient history — cannot detect stagnation
  if (scores.length < 2) {
    return { halt: false };
  }

  const scoreHistory = scores.map((s) => s.passed);

  // Check if the most recent passed count improved over the previous one
  const latest = scoreHistory[scoreHistory.length - 1];
  const previous = scoreHistory[scoreHistory.length - 2];

  if (latest > previous) {
    // Progress detected — no stagnation
    return { halt: false };
  }

  // Stagnation: passed count did not increase in the most recent iteration.
  // Build remainingFailures as placeholder indices [1..failCount].
  const latestScore = scores[scores.length - 1];
  const failCount = latestScore.total - latestScore.passed;
  const remainingFailures = Array.from({ length: failCount }, (_, i) => i + 1);

  return {
    halt: true,
    reason: 'score-stagnation',
    remainingFailures,
    scoreHistory,
  };
}
