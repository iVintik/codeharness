import { describe, it, expect } from 'vitest';
import {
  TIER_HIERARCHY,
  maxTier,
  LEGACY_TIER_MAP,
} from '../types.js';
import type { VerificationTier } from '../types.js';

// ─── VerificationTier type ──────────────────────────────────────────────────

describe('VerificationTier type', () => {
  it('TIER_HIERARCHY contains exactly the four tiers', () => {
    expect(TIER_HIERARCHY).toEqual([
      'test-provable',
      'runtime-provable',
      'environment-provable',
      'escalate',
    ]);
  });

  it('TIER_HIERARCHY has length 4', () => {
    expect(TIER_HIERARCHY).toHaveLength(4);
  });

  it('TIER_HIERARCHY is an array (readonly at type level via as const)', () => {
    expect(Array.isArray(TIER_HIERARCHY)).toBe(true);
  });
});

// ─── maxTier ────────────────────────────────────────────────────────────────

describe('maxTier', () => {
  it('returns test-provable for empty array (AC6)', () => {
    expect(maxTier([])).toBe('test-provable');
  });

  it('returns test-provable for single test-provable (AC4)', () => {
    expect(maxTier(['test-provable'])).toBe('test-provable');
  });

  it('returns runtime-provable for [test-provable, runtime-provable] (AC3)', () => {
    expect(maxTier(['test-provable', 'runtime-provable'])).toBe('runtime-provable');
  });

  it('returns environment-provable for [test-provable, environment-provable, runtime-provable] (AC5)', () => {
    expect(maxTier(['test-provable', 'environment-provable', 'runtime-provable'])).toBe('environment-provable');
  });

  it('returns escalate when escalate is present', () => {
    expect(maxTier(['test-provable', 'escalate'])).toBe('escalate');
  });

  it('returns escalate for all four tiers', () => {
    expect(maxTier(['test-provable', 'runtime-provable', 'environment-provable', 'escalate'])).toBe('escalate');
  });

  it('returns the single tier when array has one element', () => {
    const tiers: VerificationTier[] = ['runtime-provable'];
    expect(maxTier(tiers)).toBe('runtime-provable');
  });

  it('returns environment-provable for [environment-provable, runtime-provable]', () => {
    expect(maxTier(['environment-provable', 'runtime-provable'])).toBe('environment-provable');
  });

  it('handles duplicates correctly', () => {
    expect(maxTier(['test-provable', 'test-provable', 'test-provable'])).toBe('test-provable');
  });

  it('handles duplicates with higher tier', () => {
    expect(maxTier(['runtime-provable', 'runtime-provable', 'test-provable'])).toBe('runtime-provable');
  });

  it('is order-independent', () => {
    const a = maxTier(['escalate', 'test-provable', 'runtime-provable']);
    const b = maxTier(['test-provable', 'runtime-provable', 'escalate']);
    const c = maxTier(['runtime-provable', 'escalate', 'test-provable']);
    expect(a).toBe('escalate');
    expect(b).toBe('escalate');
    expect(c).toBe('escalate');
  });
});

// ─── LEGACY_TIER_MAP ────────────────────────────────────────────────────────

describe('LEGACY_TIER_MAP', () => {
  it('maps cli-verifiable to test-provable (AC7)', () => {
    expect(LEGACY_TIER_MAP['cli-verifiable']).toBe('test-provable');
  });

  it('maps integration-required to environment-provable (AC7)', () => {
    expect(LEGACY_TIER_MAP['integration-required']).toBe('environment-provable');
  });

  it('maps unit-testable to test-provable (AC7)', () => {
    expect(LEGACY_TIER_MAP['unit-testable']).toBe('test-provable');
  });

  it('has exactly 3 entries', () => {
    expect(Object.keys(LEGACY_TIER_MAP)).toHaveLength(3);
  });

  it('returns undefined for unknown keys', () => {
    expect(LEGACY_TIER_MAP['nonexistent']).toBeUndefined();
  });

  it('all values are valid VerificationTier values', () => {
    for (const value of Object.values(LEGACY_TIER_MAP)) {
      expect(TIER_HIERARCHY).toContain(value);
    }
  });
});

// ─── TIER_HIERARCHY ordering ────────────────────────────────────────────────

describe('TIER_HIERARCHY ordering', () => {
  it('test-provable has lowest index (0)', () => {
    expect(TIER_HIERARCHY.indexOf('test-provable')).toBe(0);
  });

  it('runtime-provable has index 1', () => {
    expect(TIER_HIERARCHY.indexOf('runtime-provable')).toBe(1);
  });

  it('environment-provable has index 2', () => {
    expect(TIER_HIERARCHY.indexOf('environment-provable')).toBe(2);
  });

  it('escalate has highest index (3)', () => {
    expect(TIER_HIERARCHY.indexOf('escalate')).toBe(3);
  });
});

// ─── Module exports ─────────────────────────────────────────────────────────

describe('module exports from index', () => {
  it('re-exports VerificationTier utilities from barrel', async () => {
    const barrel = await import('../index.js');
    expect(barrel.TIER_HIERARCHY).toBeDefined();
    expect(barrel.maxTier).toBeDefined();
    expect(barrel.LEGACY_TIER_MAP).toBeDefined();
  });
});
