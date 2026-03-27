# Verification Proof: 16-1-verification-tier-type-and-utilities

**Story:** 16-1 — Define VerificationTier Type and Utilities
**Tier:** unit-testable
**Date:** 2026-03-27
**Build:** PASS (tsup ESM + DTS success)
**Tests:** 3849 vitest passed, 25 tier-specific tests passed

---

## AC 1: VerificationTier type exported with four literal values

**Verdict:** PASS

<!-- showboat exec: verify VerificationTier type definition -->
```bash
grep -n "export type VerificationTier" src/modules/verify/types.ts
```

```output
14:export type VerificationTier = 'test-provable' | 'runtime-provable' | 'environment-provable' | 'escalate';
```
<!-- /showboat exec -->

---

## AC 2: TIER_HIERARCHY exported as readonly array with correct order

**Verdict:** PASS

<!-- showboat exec: verify TIER_HIERARCHY definition -->
```bash
sed -n '17,22p' src/modules/verify/types.ts
```

```output
export const TIER_HIERARCHY: readonly VerificationTier[] = [
  'test-provable',
  'runtime-provable',
  'environment-provable',
  'escalate',
] as const;
```
<!-- /showboat exec -->

---

## AC 3: maxTier(['test-provable', 'runtime-provable']) returns 'runtime-provable'

**Verdict:** PASS

<!-- showboat exec: verify maxTier AC3 test -->
```bash
npx vitest run src/modules/verify/__tests__/verification-tier.test.ts -t "AC3" 2>&1 | grep -E "PASS|FAIL|✓|✗"
```

```output
 ✓ maxTier > returns runtime-provable for [test-provable, runtime-provable] (AC3)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```
<!-- /showboat exec -->

---

## AC 4: maxTier(['test-provable']) returns 'test-provable'

**Verdict:** PASS

<!-- showboat exec: verify maxTier AC4 test -->
```bash
npx vitest run src/modules/verify/__tests__/verification-tier.test.ts -t "AC4" 2>&1 | grep -E "PASS|FAIL|✓|✗"
```

```output
 ✓ maxTier > returns test-provable for single test-provable (AC4)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```
<!-- /showboat exec -->

---

## AC 5: maxTier(['test-provable', 'environment-provable', 'runtime-provable']) returns 'environment-provable'

**Verdict:** PASS

<!-- showboat exec: verify maxTier AC5 test -->
```bash
npx vitest run src/modules/verify/__tests__/verification-tier.test.ts -t "AC5" 2>&1 | grep -E "PASS|FAIL|✓|✗"
```

```output
 ✓ maxTier > returns environment-provable for [test-provable, environment-provable, runtime-provable] (AC5)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```
<!-- /showboat exec -->

---

## AC 6: maxTier([]) returns 'test-provable' (safe default)

**Verdict:** PASS

<!-- showboat exec: verify maxTier AC6 test -->
```bash
npx vitest run src/modules/verify/__tests__/verification-tier.test.ts -t "AC6" 2>&1 | grep -E "PASS|FAIL|✓|✗"
```

```output
 ✓ maxTier > returns test-provable for empty array (AC6)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```
<!-- /showboat exec -->

---

## AC 7: LEGACY_TIER_MAP exports correct mappings

**Verdict:** PASS

<!-- showboat exec: verify LEGACY_TIER_MAP definition -->
```bash
sed -n '33,37p' src/modules/verify/types.ts
```

```output
export const LEGACY_TIER_MAP: Record<string, VerificationTier> = {
  'cli-verifiable': 'test-provable',
  'integration-required': 'environment-provable',
  'unit-testable': 'test-provable',
};
```
<!-- /showboat exec -->

<!-- showboat exec: verify LEGACY_TIER_MAP tests pass -->
```bash
npx vitest run src/modules/verify/__tests__/verification-tier.test.ts -t "AC7" 2>&1 | grep -E "PASS|FAIL|✓|✗"
```

```output
 ✓ LEGACY_TIER_MAP > maps cli-verifiable to test-provable (AC7)
 ✓ LEGACY_TIER_MAP > maps integration-required to environment-provable (AC7)
 ✓ LEGACY_TIER_MAP > maps unit-testable to test-provable (AC7)
 Test Files  1 passed (1)
 Tests  3 passed (3)
```
<!-- /showboat exec -->

---

## AC 8: Verifiability type exists as deprecated alias

**Verdict:** PASS

<!-- showboat exec: verify deprecated Verifiability type -->
```bash
grep -n -A1 "@deprecated" src/modules/verify/types.ts | head -4
```

```output
10:/** @deprecated Use `VerificationTier` instead. Will be removed in a future release. */
11:export type Verifiability = 'cli-verifiable' | 'integration-required';
```
<!-- /showboat exec -->

---

## AC 9: ParsedAC has tier: VerificationTier field

**Verdict:** PASS

<!-- showboat exec: verify ParsedAC tier field -->
```bash
sed -n '51,61p' src/modules/verify/types.ts
```

```output
export interface ParsedAC {
  readonly id: string;
  readonly description: string;
  readonly type: 'ui' | 'api' | 'db' | 'general';
  /** @deprecated Use `tier` instead. */
  readonly verifiability: Verifiability;
  /** @deprecated Use `tier` instead. */
  readonly strategy: VerificationStrategy;
  /** The verification tier for this AC. */
  readonly tier: VerificationTier;
}
```
<!-- /showboat exec -->

---

## Summary

| AC | Verdict |
|----|---------|
| AC1 | PASS |
| AC2 | PASS |
| AC3 | PASS |
| AC4 | PASS |
| AC5 | PASS |
| AC6 | PASS |
| AC7 | PASS |
| AC8 | PASS |
| AC9 | PASS |

**Overall:** 9/9 PASS, 0 FAIL, 0 ESCALATE

## Test Results
- Full suite: 149 test files, 3849 tests passed
- Tier-specific: `verification-tier.test.ts` — 25 tests passed
- Duration: 9.14s (full), 284ms (tier-specific)

## Coverage
- Overall: 96.85%
- All 157 files above 80% statement coverage threshold
