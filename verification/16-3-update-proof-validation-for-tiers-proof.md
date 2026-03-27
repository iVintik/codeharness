# Story 16-3: Update Proof Validation for New Tiers — Verification Proof

**Tier:** test-provable

## Summary

- AC1: test-provable skips Docker enforcement — PASS
- AC2: runtime-provable skips Docker enforcement — PASS
- AC3: environment-provable runs Docker enforcement — PASS
- AC4: escalate skips Docker enforcement — PASS
- AC5: legacy unit-testable skips Docker enforcement — PASS
- AC6: legacy black-box runs Docker enforcement — PASS

## AC 1: test-provable tier skips Docker enforcement

**Result:** PASS

Proof: `validateProofQuality()` with `**Tier:** test-provable` returns `blackBoxPass: true` even without Docker evidence.

```bash
npx vitest run src/modules/verify/__tests__/verify-blackbox.test.ts -t "AC1: test-provable tier skips Docker enforcement"
```

```output
 ✓ validateProofQuality — tier-based Docker enforcement > AC1: test-provable tier skips Docker enforcement (blackBoxPass=true)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```

Implementation evidence in `src/modules/verify/proof.ts` L117-127:
- Tier regex built dynamically from `TIER_HIERARCHY` + `LEGACY_TIER_MAP` keys
- `skipDockerEnforcement = normalizedTier !== null && normalizedTier !== 'environment-provable'`
- test-provable maps to itself, so Docker enforcement is skipped

## AC 2: runtime-provable tier skips Docker enforcement

**Result:** PASS

```bash
npx vitest run src/modules/verify/__tests__/verify-blackbox.test.ts -t "AC2: runtime-provable tier skips Docker enforcement"
```

```output
 ✓ validateProofQuality — tier-based Docker enforcement > AC2: runtime-provable tier skips Docker enforcement (blackBoxPass=true)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```

## AC 3: environment-provable tier runs Docker enforcement

**Result:** PASS

```bash
npx vitest run src/modules/verify/__tests__/verify-blackbox.test.ts -t "AC3: environment-provable tier runs Docker enforcement normally"
```

```output
 ✓ validateProofQuality — tier-based Docker enforcement > AC3: environment-provable tier runs Docker enforcement normally
 Test Files  1 passed (1)
 Tests  1 passed (1)
```

The test creates a proof with `**Tier:** environment-provable` and only `cat README.md` evidence (no docker exec). Validation correctly returns `blackBoxPass: false` because Docker enforcement is NOT skipped for this tier.

## AC 4: escalate tier skips Docker enforcement

**Result:** PASS

```bash
npx vitest run src/modules/verify/__tests__/verify-blackbox.test.ts -t "AC4: escalate tier skips Docker enforcement"
```

```output
 ✓ validateProofQuality — tier-based Docker enforcement > AC4: escalate tier skips Docker enforcement (blackBoxPass=true)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```

## AC 5: legacy unit-testable backward compatibility

**Result:** PASS

```bash
npx vitest run src/modules/verify/__tests__/verify-blackbox.test.ts -t "AC5: legacy unit-testable tier still skips Docker enforcement"
```

```output
 ✓ validateProofQuality — tier-based Docker enforcement > AC5: legacy unit-testable tier still skips Docker enforcement (backward compat)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```

`LEGACY_TIER_MAP` maps `unit-testable` to `test-provable`, which skips Docker enforcement.

## AC 6: legacy black-box backward compatibility

**Result:** PASS

```bash
npx vitest run src/modules/verify/__tests__/verify-blackbox.test.ts -t "AC6: legacy black-box tier runs Docker enforcement"
```

```output
 ✓ validateProofQuality — tier-based Docker enforcement > AC6: legacy black-box tier runs Docker enforcement (backward compat)
 Test Files  1 passed (1)
 Tests  1 passed (1)
```

`LEGACY_TIER_MAP` maps `black-box` to `environment-provable`, which requires Docker enforcement.

## Test Evidence

**Build:** PASS (tsup build success)

**Unit tests:** 3887 passed, 0 failed (vitest). 149 test files.

**BATS tests:** 316 of 321 passed. 5 failures are pre-existing in `all_tasks_complete` (ralph bash compat issue, not related to this story).

**Coverage:** 96.86% — all 158 files above 80% threshold.

**Files changed:**
- `src/modules/verify/proof.ts` — Updated tier regex to use `TIER_HIERARCHY` + `LEGACY_TIER_MAP` dynamically; `skipDockerEnforcement` logic based on normalized tier
- `src/modules/verify/types.ts` — `VerificationTier` type, `TIER_HIERARCHY` array, `LEGACY_TIER_MAP` record
- `src/modules/verify/__tests__/verify-blackbox.test.ts` — 12 tier-specific tests covering all 6 ACs plus edge cases (case-insensitive, no tier, unknown tier, metrics still reported)
