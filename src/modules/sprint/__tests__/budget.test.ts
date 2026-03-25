import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldDeferPhase, getPhaseEstimate, computeRemainingMinutes, PHASE_ESTIMATES } from '../budget.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PHASE_ESTIMATES', () => {
  it('exports correct estimates for all known phases', () => {
    expect(PHASE_ESTIMATES['create-story']).toBe(5);
    expect(PHASE_ESTIMATES['dev-story']).toBe(15);
    expect(PHASE_ESTIMATES['code-review']).toBe(10);
    expect(PHASE_ESTIMATES['verification']).toBe(20);
    expect(PHASE_ESTIMATES['retro']).toBe(5);
  });
});

describe('shouldDeferPhase', () => {
  it('returns true when remaining time is less than estimate (AC 3: verification with 10min remaining)', () => {
    // AC 3: phase=verification, remainingMinutes=10, estimate=20 → true
    expect(shouldDeferPhase('verification', 10)).toBe(true);
  });

  it('returns false when remaining time is sufficient (AC 4: dev-story with 30min remaining)', () => {
    // AC 4: phase=dev-story, remainingMinutes=30, estimate=15 → false
    expect(shouldDeferPhase('dev-story', 30)).toBe(false);
  });

  it('returns false when remaining time equals the estimate exactly', () => {
    expect(shouldDeferPhase('dev-story', 15)).toBe(false);
  });

  it('returns true when remaining time is 0', () => {
    expect(shouldDeferPhase('dev-story', 0)).toBe(true);
  });

  it('returns true for create-story with 4 minutes remaining', () => {
    expect(shouldDeferPhase('create-story', 4)).toBe(true);
  });

  it('returns false for create-story with 5 minutes remaining', () => {
    expect(shouldDeferPhase('create-story', 5)).toBe(false);
  });

  it('returns false for retro with 5 minutes remaining', () => {
    expect(shouldDeferPhase('retro', 5)).toBe(false);
  });

  it('returns true for code-review with 9 minutes remaining', () => {
    expect(shouldDeferPhase('code-review', 9)).toBe(true);
  });

  it('uses default estimate of 10 for unknown phases', () => {
    expect(shouldDeferPhase('unknown-phase', 9)).toBe(true);
    expect(shouldDeferPhase('unknown-phase', 10)).toBe(false);
  });

  it('returns true when remainingMinutes is NaN (unknown budget)', () => {
    expect(shouldDeferPhase('dev-story', NaN)).toBe(true);
  });

  it('defers when remainingMinutes is negative Infinity', () => {
    expect(shouldDeferPhase('dev-story', -Infinity)).toBe(true);
  });

  it('does not defer when remainingMinutes is positive Infinity (unlimited budget)', () => {
    expect(shouldDeferPhase('dev-story', Infinity)).toBe(false);
  });

  it('handles negative remainingMinutes (always defers)', () => {
    expect(shouldDeferPhase('dev-story', -5)).toBe(true);
  });
});

describe('getPhaseEstimate', () => {
  it('returns the correct estimate for known phases', () => {
    expect(getPhaseEstimate('create-story')).toBe(5);
    expect(getPhaseEstimate('dev-story')).toBe(15);
    expect(getPhaseEstimate('code-review')).toBe(10);
    expect(getPhaseEstimate('verification')).toBe(20);
    expect(getPhaseEstimate('retro')).toBe(5);
  });

  it('returns 10 for unknown phases', () => {
    expect(getPhaseEstimate('some-random-phase')).toBe(10);
  });
});

describe('computeRemainingMinutes', () => {
  it('computes remaining time correctly (AC 8)', () => {
    const now = Date.now();
    // 10 minutes elapsed out of 60 minute budget
    vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60_000);
    const remaining = computeRemainingMinutes(now, 60);
    expect(remaining).toBe(50);
  });

  it('returns 0 when budget is exhausted', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 70 * 60_000);
    const remaining = computeRemainingMinutes(now, 60);
    expect(remaining).toBe(0);
  });

  it('returns 0 when over budget (never negative)', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 120 * 60_000);
    const remaining = computeRemainingMinutes(now, 60);
    expect(remaining).toBe(0);
  });

  it('returns full budget when no time has elapsed', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const remaining = computeRemainingMinutes(now, 45);
    expect(remaining).toBe(45);
  });

  it('floors fractional minutes', () => {
    const now = Date.now();
    // 10.5 minutes elapsed → 49.5 remaining → floor to 49
    vi.spyOn(Date, 'now').mockReturnValue(now + 10.5 * 60_000);
    const remaining = computeRemainingMinutes(now, 60);
    expect(remaining).toBe(49);
  });
});
