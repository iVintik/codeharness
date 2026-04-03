import { describe, it, expect } from 'vitest';
import { evaluateProgress } from '../circuit-breaker.js';
import type { CircuitBreakerDecision } from '../circuit-breaker.js';
import type { EvaluatorScore } from '../workflow-state.js';

// --- Helpers ---

function makeScore(
  iteration: number,
  passed: number,
  failed: number,
  unknown: number,
): EvaluatorScore {
  const total = passed + failed + unknown;
  return {
    iteration,
    passed,
    failed,
    unknown,
    total,
    timestamp: new Date().toISOString(),
  };
}

// --- Tests ---

describe('evaluateProgress', () => {
  // AC #4: fewer than 2 scores returns halt: false
  describe('insufficient history', () => {
    it('returns halt: false for empty scores array', () => {
      const result = evaluateProgress([]);
      expect(result).toEqual({ halt: false });
    });

    it('returns halt: false for a single score', () => {
      const result = evaluateProgress([makeScore(1, 2, 1, 0)]);
      expect(result).toEqual({ halt: false });
    });
  });

  // AC #2: stagnation detection
  describe('stagnation detection', () => {
    it('halts when passed count has not increased for 2 consecutive iterations', () => {
      const scores = [makeScore(1, 2, 1, 0), makeScore(2, 2, 1, 0)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
    });

    it('halts when passed count decreased', () => {
      const scores = [makeScore(1, 3, 0, 0), makeScore(2, 2, 1, 0)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
    });

    it('halts with reason "score-stagnation"', () => {
      const scores = [makeScore(1, 1, 2, 0), makeScore(2, 1, 2, 0)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(result.reason).toBe('score-stagnation');
      }
    });
  });

  // AC #3: progress detection
  describe('progress detection', () => {
    it('returns halt: false when passed count increased on last iteration', () => {
      const scores = [makeScore(1, 1, 2, 0), makeScore(2, 2, 1, 0)];
      const result = evaluateProgress(scores);
      expect(result).toEqual({ halt: false });
    });

    it('returns halt: false when passed goes 1, 1, 2 (improved on last iteration)', () => {
      const scores = [
        makeScore(1, 1, 2, 0),
        makeScore(2, 1, 2, 0),
        makeScore(3, 2, 1, 0),
      ];
      const result = evaluateProgress(scores);
      expect(result).toEqual({ halt: false });
    });
  });

  // AC #5: halt includes remainingFailures and scoreHistory
  describe('halt decision details', () => {
    it('includes correct remainingFailures', () => {
      // total=3, passed=1 → 2 remaining failures → [1, 2]
      const scores = [makeScore(1, 1, 2, 0), makeScore(2, 1, 2, 0)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(result.remainingFailures).toEqual([1, 2]);
      }
    });

    it('includes correct scoreHistory', () => {
      const scores = [
        makeScore(1, 0, 3, 0),
        makeScore(2, 1, 2, 0),
        makeScore(3, 1, 2, 0),
      ];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(result.scoreHistory).toEqual([0, 1, 1]);
      }
    });

    it('remainingFailures is empty when all pass but stagnation still detected', () => {
      // Edge case: all passed but count stayed the same
      const scores = [makeScore(1, 3, 0, 0), makeScore(2, 3, 0, 0)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(result.remainingFailures).toEqual([]);
      }
    });
  });

  // AC #6: discriminated union type check
  describe('type discrimination', () => {
    it('halt: false has no extra fields', () => {
      const result: CircuitBreakerDecision = evaluateProgress([]);
      expect(result).toEqual({ halt: false });
      expect(Object.keys(result)).toEqual(['halt']);
    });

    it('halt: true includes reason, remainingFailures, scoreHistory', () => {
      const scores = [makeScore(1, 1, 1, 0), makeScore(2, 1, 1, 0)];
      const result: CircuitBreakerDecision = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(typeof result.reason).toBe('string');
        expect(Array.isArray(result.remainingFailures)).toBe(true);
        expect(Array.isArray(result.scoreHistory)).toBe(true);
      }
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('all-unknown scores (passed=0 across iterations) triggers halt', () => {
      const scores = [makeScore(1, 0, 0, 3), makeScore(2, 0, 0, 3)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(result.reason).toBe('score-stagnation');
        expect(result.scoreHistory).toEqual([0, 0]);
        expect(result.remainingFailures).toEqual([1, 2, 3]);
      }
    });

    it('single-AC edge case: passed goes 0, 0 = stagnation', () => {
      const scores = [makeScore(1, 0, 1, 0), makeScore(2, 0, 1, 0)];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
    });

    it('passed goes 1, 2, 2 = stagnation (last two identical)', () => {
      const scores = [
        makeScore(1, 1, 2, 0),
        makeScore(2, 2, 1, 0),
        makeScore(3, 2, 1, 0),
      ];
      const result = evaluateProgress(scores);
      expect(result.halt).toBe(true);
      if (result.halt) {
        expect(result.scoreHistory).toEqual([1, 2, 2]);
      }
    });
  });

  // AC #7: performance
  describe('performance', () => {
    it('evaluates 20 scores in under 5ms', () => {
      const scores: EvaluatorScore[] = [];
      for (let i = 1; i <= 20; i++) {
        scores.push(makeScore(i, Math.floor(i / 2), 3, 0));
      }

      const start = performance.now();
      evaluateProgress(scores);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
    });
  });
});
