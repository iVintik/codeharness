# Story 16-8: Update All Tests for Verification Tier Rework
<!-- verification-tier: test-provable -->

## Status: backlog

## Story

As a codeharness developer,
I want all tests to use the new `VerificationTier` vocabulary and cover the new functions,
So that `npm test` passes with zero regressions and the new tier system has full test coverage.

## Acceptance Criteria

- [ ] AC1: Given `verify-parser.test.ts`, when `classifyStrategy` tests are inspected, then they are replaced/supplemented with `classifyTier` tests covering all four tiers <!-- verification: test-provable -->
- [ ] AC2: Given `verify-parser.test.ts`, when `parseVerificationTag` tests are inspected, then they cover all four new tier names (`test-provable`, `runtime-provable`, `environment-provable`, `escalate`) <!-- verification: test-provable -->
- [ ] AC3: Given `verify-parser.test.ts`, when backward compat tests are inspected, then `parseVerificationTag('<!-- verification: cli-verifiable -->')` returns `'test-provable'` and `parseVerificationTag('<!-- verification: integration-required -->')` returns `'environment-provable'` <!-- verification: test-provable -->
- [ ] AC4: Given new tests for `maxTier()`, when `maxTier(['test-provable', 'runtime-provable'])` is tested, then it returns `'runtime-provable'` <!-- verification: test-provable -->
- [ ] AC5: Given new tests for `maxTier()`, when `maxTier([])` is tested, then it returns `'test-provable'` (default) <!-- verification: test-provable -->
- [ ] AC6: Given new tests for `maxTier()`, when `maxTier(['test-provable', 'environment-provable', 'runtime-provable'])` is tested, then it returns `'environment-provable'` <!-- verification: test-provable -->
- [ ] AC7: Given `verify.test.ts` (proof validation), when tier recognition tests are inspected, then they cover `**Tier:** test-provable`, `**Tier:** runtime-provable`, `**Tier:** environment-provable`, and `**Tier:** escalate` <!-- verification: test-provable -->
- [ ] AC8: Given `verify.test.ts`, when backward compat tier test is inspected, then `**Tier:** unit-testable` still results in Docker enforcement being skipped <!-- verification: test-provable -->
- [ ] AC9: Given `validation-acs.test.ts`, when inspected, then any references to `getCliVerifiableACs()` are updated to `getTestProvableACs()` (or test both the new name and deprecated alias) <!-- verification: test-provable -->
- [ ] AC10: Given `validation-runner.test.ts`, when inspected, then any `verificationMethod` assertions still pass (no behavioral change, just comment updates in the source) <!-- verification: test-provable -->
- [ ] AC11: Given `parseStoryACs` tests, when a story file with new tier tags is parsed, then each `ParsedAC` has the correct `tier` field <!-- verification: test-provable -->
- [ ] AC12: Given `npm test`, when run after all changes, then all tests pass with 0 failures <!-- verification: test-provable -->

## Technical Notes

**Test files to update:**

1. **`src/modules/verify/__tests__/verify-parser.test.ts`**
   - Add `describe('classifyTier')` block with tests for each tier's keywords
   - Update `describe('parseVerificationTag')` to test new tier names
   - Add backward compat tests for `parseVerificationTag` with old tag values
   - Update `describe('parseStoryACs')` to assert `tier` field on results
   - Keep existing `classifyStrategy` tests but they may need adjustment if the function signature changed

2. **`src/modules/verify/__tests__/verify.test.ts`** (or `verify-blackbox.test.ts`)
   - Add/update tests for `validateProofQuality()` with all four `**Tier:**` values
   - Ensure `test-provable` and `runtime-provable` skip Docker enforcement
   - Ensure `environment-provable` requires Docker enforcement
   - Ensure `escalate` skips Docker enforcement
   - Keep `unit-testable` backward compat test

3. **`src/modules/verify/__tests__/validation-acs.test.ts`**
   - Update calls from `getCliVerifiableACs()` to `getTestProvableACs()`
   - Update calls from `getIntegrationRequiredACs()` to `getEnvironmentProvableACs()`
   - Or test both old (deprecated) and new function names

4. **`src/modules/verify/__tests__/validation-runner.test.ts`**
   - No behavioral changes expected — just verify tests still pass

5. **New test file or section for `maxTier()` and `TIER_HIERARCHY`:**
   - Could go in `verify-parser.test.ts` or a new `tier-utils.test.ts`
   - Test `maxTier` with: empty array, single tier, multiple tiers, all four tiers
   - Test `TIER_HIERARCHY` ordering: index of `escalate` > index of `environment-provable` > index of `runtime-provable` > index of `test-provable`
   - Test `LEGACY_TIER_MAP` contains correct mappings

6. **`src/modules/verify/__tests__/index.test.ts`**
   - May need updates if module re-exports changed

## Files to Change

- `src/modules/verify/__tests__/verify-parser.test.ts` — Add `classifyTier` tests, update `parseVerificationTag` tests, add backward compat tests, assert `tier` field in `parseStoryACs` tests.
- `src/modules/verify/__tests__/verify.test.ts` — Add proof validation tests for all four tier names.
- `src/modules/verify/__tests__/verify-blackbox.test.ts` — Update if black-box enforcement tests reference tier names.
- `src/modules/verify/__tests__/validation-acs.test.ts` — Update helper function names.
- `src/modules/verify/__tests__/validation-runner.test.ts` — Verify no regressions.
- `src/modules/verify/__tests__/index.test.ts` — Update if re-exports changed.
