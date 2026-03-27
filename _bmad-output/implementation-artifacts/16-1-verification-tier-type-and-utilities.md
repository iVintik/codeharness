# Story 16-1: Define VerificationTier Type and Utilities
<!-- verification-tier: test-provable -->

## Status: review

## Story

As a codeharness developer,
I want a single `VerificationTier` enum replacing the three overlapping verification classification systems,
So that tier classification is unambiguous and all downstream code references one vocabulary.

## Acceptance Criteria

- [x] AC1: Given `src/modules/verify/types.ts`, when inspected, then it exports `VerificationTier = 'test-provable' | 'runtime-provable' | 'environment-provable' | 'escalate'` <!-- verification: test-provable -->
- [x] AC2: Given `src/modules/verify/types.ts`, when inspected, then it exports `TIER_HIERARCHY` as a readonly array ordered `['test-provable', 'runtime-provable', 'environment-provable', 'escalate']` (lowest to highest) <!-- verification: test-provable -->
- [x] AC3: Given `maxTier(['test-provable', 'runtime-provable'])` is called, when evaluated, then it returns `'runtime-provable'` (highest tier wins) <!-- verification: test-provable -->
- [x] AC4: Given `maxTier(['test-provable'])` is called, when evaluated, then it returns `'test-provable'` <!-- verification: test-provable -->
- [x] AC5: Given `maxTier(['test-provable', 'environment-provable', 'runtime-provable'])` is called, when evaluated, then it returns `'environment-provable'` <!-- verification: test-provable -->
- [x] AC6: Given `maxTier([])` is called with an empty array, when evaluated, then it returns `'test-provable'` (safe default) <!-- verification: test-provable -->
- [x] AC7: Given `src/modules/verify/types.ts`, when inspected, then it exports `LEGACY_TIER_MAP` mapping `'cli-verifiable' -> 'test-provable'`, `'integration-required' -> 'environment-provable'`, `'unit-testable' -> 'test-provable'` <!-- verification: test-provable -->
- [x] AC8: Given the old `Verifiability` type, when inspected, then it still exists as a deprecated alias for backward compatibility (not removed yet — downstream code uses it until Stories 16-2 through 16-4 land) <!-- verification: test-provable -->
- [x] AC9: Given `ParsedAC` interface, when inspected, then it has a new `tier: VerificationTier` field alongside the existing `verifiability` and `strategy` fields (both deprecated but present for backward compat) <!-- verification: test-provable -->

## Technical Notes

**File:** `src/modules/verify/types.ts`

Add after line 10 (the existing `Verifiability` type):

```typescript
/** The four verification tiers — what evidence is needed to prove ACs work. */
export type VerificationTier = 'test-provable' | 'runtime-provable' | 'environment-provable' | 'escalate';

/** Tier ordering from lowest to highest. Index = priority. */
export const TIER_HIERARCHY: readonly VerificationTier[] = [
  'test-provable',
  'runtime-provable',
  'environment-provable',
  'escalate',
] as const;

/** Returns the highest tier from an array of tiers. Empty array -> 'test-provable'. */
export function maxTier(tiers: VerificationTier[]): VerificationTier {
  if (tiers.length === 0) return 'test-provable';
  return tiers.reduce((max, t) =>
    TIER_HIERARCHY.indexOf(t) > TIER_HIERARCHY.indexOf(max) ? t : max
  );
}

/** Maps old tag values to new VerificationTier values for backward compat. */
export const LEGACY_TIER_MAP: Record<string, VerificationTier> = {
  'cli-verifiable': 'test-provable',
  'integration-required': 'environment-provable',
  'unit-testable': 'test-provable',
};
```

Mark `Verifiability` type (L10) and `VerificationStrategy` type (L20) with `@deprecated` JSDoc comments. Do NOT remove them yet.

Add `tier: VerificationTier` to the `ParsedAC` interface (L22-L28) as a new field.

## Files to Change

- `src/modules/verify/types.ts` — Add `VerificationTier` type, `TIER_HIERARCHY` const, `maxTier()` function, `LEGACY_TIER_MAP` const. Deprecate `Verifiability` and `VerificationStrategy`. Add `tier` field to `ParsedAC`.
