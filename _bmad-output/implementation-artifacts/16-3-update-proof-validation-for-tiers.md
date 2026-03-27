# Story 16-3: Update Proof Validation for New Tiers
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want proof validation to recognize all four verification tier names and apply enforcement rules per tier,
So that `test-provable` and `runtime-provable` stories skip Docker enforcement while `environment-provable` stories require Docker evidence.

## Acceptance Criteria

- [ ] AC1: Given a proof with `**Tier:** test-provable`, when `validateProofQuality()` runs, then `blackBoxPass` is `true` (Docker enforcement skipped) <!-- verification: test-provable -->
- [ ] AC2: Given a proof with `**Tier:** runtime-provable`, when `validateProofQuality()` runs, then `blackBoxPass` is `true` (Docker enforcement skipped) <!-- verification: test-provable -->
- [ ] AC3: Given a proof with `**Tier:** environment-provable`, when `validateProofQuality()` runs, then Docker enforcement runs normally (requires `docker exec` evidence per AC) <!-- verification: test-provable -->
- [ ] AC4: Given a proof with `**Tier:** escalate`, when `validateProofQuality()` runs, then `blackBoxPass` is `true` (enforcement skipped — human judgment needed) <!-- verification: test-provable -->
- [ ] AC5: Given a proof with the old `**Tier:** unit-testable`, when `validateProofQuality()` runs, then it still skips Docker enforcement (backward compat) <!-- verification: test-provable -->
- [ ] AC6: Given a proof with `**Tier:** black-box`, when `validateProofQuality()` runs, then Docker enforcement runs (backward compat for old default) <!-- verification: test-provable -->

## Technical Notes

**File:** `src/modules/verify/proof.ts`

**Line 116:** The current regex is:
```typescript
const bbTierMatch = /\*\*Tier:\*\*\s*(unit-testable|black-box)/i.exec(content);
const bbIsUnitTestable = bbTierMatch ? bbTierMatch[1].toLowerCase() === 'unit-testable' : false;
```

Replace with:
```typescript
const bbTierMatch = /\*\*Tier:\*\*\s*(test-provable|runtime-provable|environment-provable|escalate|unit-testable|black-box)/i.exec(content);
const tierValue = bbTierMatch ? bbTierMatch[1].toLowerCase() : null;
// Skip Docker enforcement for tiers that don't need Docker
const skipDockerEnforcement = tierValue === 'test-provable'
  || tierValue === 'runtime-provable'
  || tierValue === 'escalate'
  || tierValue === 'unit-testable'; // backward compat
```

Then use `skipDockerEnforcement` instead of `bbIsUnitTestable` in the ternary on L118-L119.

The logic: only `environment-provable` (and old `black-box`) require Docker evidence. Everything else skips Docker enforcement.

## Files to Change

- `src/modules/verify/proof.ts` — Update `**Tier:**` regex (L116) to recognize all four new tier names plus old names. Change skip logic: `test-provable`, `runtime-provable`, `escalate`, and legacy `unit-testable` all skip Docker enforcement. Only `environment-provable` and legacy `black-box` require it.
