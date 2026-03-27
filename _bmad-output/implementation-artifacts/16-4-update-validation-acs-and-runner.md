# Story 16-4: Update Validation ACs and Runner for New Tiers
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want the validation AC registry and runner to use the new `VerificationTier` vocabulary,
So that the self-validation system classifies and dispatches ACs using the unified tier system.

## Acceptance Criteria

- [ ] AC1: Given `validation-acs.ts`, when `getCliVerifiableACs()` is inspected, then it is renamed to `getTestProvableACs()` (or aliased with deprecation) and filters by the new tier equivalent <!-- verification: test-provable -->
- [ ] AC2: Given `validation-acs.ts`, when `getIntegrationRequiredACs()` is inspected, then it is renamed to `getEnvironmentProvableACs()` (or aliased with deprecation) and filters by the new tier equivalent <!-- verification: test-provable -->
- [ ] AC3: Given `validation-runner.ts` line 106, when `executeValidationAC()` checks `ac.verificationMethod === 'integration'`, then the check also handles the new tier vocabulary (treat `'integration'` the same as before for backward compat with existing `ValidationAC` data) <!-- verification: test-provable -->
- [ ] AC4: Given `validation-runner-types.ts`, when inspected, then any comments or string literals referencing old tier names are updated to reference new tier names <!-- verification: test-provable -->
- [ ] AC5: Given `validation-ac-types.ts`, when inspected, then the `VerificationMethod` type has a JSDoc comment noting correspondence to `VerificationTier` (`'cli' -> test-provable`, `'integration' -> environment-provable`) <!-- verification: test-provable -->

## Technical Notes

**File:** `src/modules/verify/validation-acs.ts`

- `getCliVerifiableACs()` (L35-L37): Rename to `getTestProvableACs()`. Keep `getCliVerifiableACs()` as a deprecated alias calling `getTestProvableACs()`.
- `getIntegrationRequiredACs()` (L40-L42): Rename to `getEnvironmentProvableACs()`. Keep `getIntegrationRequiredACs()` as a deprecated alias.

**File:** `src/modules/verify/validation-runner.ts`

- L106: The check `ac.verificationMethod === 'integration'` stays functionally the same (the `ValidationAC` data uses `'cli' | 'integration'` which is its own type, not `VerificationTier`). Add a comment explaining the mapping. No behavioral change needed here — the validation AC data structure is separate from story-level tiers.

**File:** `src/modules/verify/validation-runner-types.ts`

- Update any comments referencing `cli-verifiable` or `integration-required` to use new tier names.
- The `reason: 'integration-required'` string on L21 stays as-is (it's a status reason, not a tier name), but add a comment noting the terminology difference.

**File:** `src/modules/verify/validation-ac-types.ts`

- Add JSDoc to `VerificationMethod` type explaining correspondence: `'cli'` corresponds to `test-provable`, `'integration'` corresponds to `environment-provable`.

## Files to Change

- `src/modules/verify/validation-acs.ts` — Rename helper functions with deprecated aliases.
- `src/modules/verify/validation-runner.ts` — Add mapping comments, no behavioral change.
- `src/modules/verify/validation-runner-types.ts` — Update comments referencing old tier names.
- `src/modules/verify/validation-ac-types.ts` — Add JSDoc mapping `VerificationMethod` to `VerificationTier`.
