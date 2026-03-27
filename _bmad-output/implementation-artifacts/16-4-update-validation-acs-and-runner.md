# Story 16.4: Update Validation ACs and Runner for New Tiers
<!-- verification-tier: test-provable -->

Status: verifying

## Story

As a codeharness developer,
I want the validation AC registry and runner to use the new `VerificationTier` vocabulary,
So that the self-validation system classifies and dispatches ACs using the unified tier system.

## Acceptance Criteria

- [x] AC1: Given `validation-acs.ts`, when `getTestProvableACs()` is called, then it returns all ACs with `verificationMethod === 'cli'` (same data as old `getCliVerifiableACs()`), and the old function name still works as a deprecated alias <!-- verification: cli-verifiable -->
- [x] AC2: Given `validation-acs.ts`, when `getEnvironmentProvableACs()` is called, then it returns all ACs with `verificationMethod === 'integration'` (same data as old `getIntegrationRequiredACs()`), and the old function name still works as a deprecated alias <!-- verification: cli-verifiable -->
- [x] AC3: Given `validation-runner.ts` `executeValidationAC()`, when an AC with `verificationMethod === 'integration'` is passed, then it returns `blocked` with reason `'integration-required'` (no behavioral change, but a JSDoc comment explains the mapping to `environment-provable` tier) <!-- verification: cli-verifiable -->
- [x] AC4: Given `validation-runner-types.ts`, when inspected, then all comments referencing old tier names (`cli-verifiable`, `integration-required`) are updated to reference new tier names (`test-provable`, `environment-provable`), and `reason: 'integration-required'` string is kept with a comment noting it's a status reason, not a tier name <!-- verification: cli-verifiable -->
- [x] AC5: Given `validation-ac-types.ts`, when `VerificationMethod` type is inspected, then it has a JSDoc comment noting correspondence: `'cli'` maps to `test-provable` tier, `'integration'` maps to `environment-provable` tier <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Rename helpers in `validation-acs.ts` (AC: 1, 2)
  - [x] 1.1: Create `getTestProvableACs()` — filters `verificationMethod === 'cli'`
  - [x] 1.2: Create `getEnvironmentProvableACs()` — filters `verificationMethod === 'integration'`
  - [x] 1.3: Keep `getCliVerifiableACs()` as deprecated alias calling `getTestProvableACs()`
  - [x] 1.4: Keep `getIntegrationRequiredACs()` as deprecated alias calling `getEnvironmentProvableACs()`
  - [x] 1.5: Update the barrel export in `validation-acs.ts` to export both old and new names
- [x] Task 2: Update `index.ts` re-exports (AC: 1, 2)
  - [x] 2.1: Add `getTestProvableACs` and `getEnvironmentProvableACs` to the import/re-export in `src/modules/verify/index.ts`
  - [x] 2.2: Keep old names in the export list (they're deprecated aliases, not removed)
- [x] Task 3: Add mapping comment to `validation-runner.ts` (AC: 3)
  - [x] 3.1: Add JSDoc above L106 (`if (ac.verificationMethod === 'integration')`) explaining the mapping: `'integration'` in `ValidationAC` corresponds to `environment-provable` in `VerificationTier`; `'cli'` corresponds to `test-provable`. No behavioral change.
- [x] Task 4: Update comments in `validation-runner-types.ts` (AC: 4)
  - [x] 4.1: Update L22 comment `'integration-required'` — add note that this is a status reason string, not a tier name; the corresponding tier is `environment-provable`
  - [x] 4.2: Update L56 comment `blocked (integration-required or retry-exhausted)` to note tier correspondence
- [x] Task 5: Add JSDoc to `VerificationMethod` type in `validation-ac-types.ts` (AC: 5)
  - [x] 5.1: Add JSDoc to the `VerificationMethod` type alias explaining the correspondence to `VerificationTier`

## Dev Notes

This story is purely additive — rename functions, add deprecation aliases, update comments/JSDoc. No behavioral changes to any runtime logic.

### Key Constraints

- **Do NOT change `VerificationMethod` type values.** The `'cli' | 'integration'` values are used in the validation AC data arrays (`validation-ac-data.ts`) across 79 entries. Changing the type values would require updating all 79 data entries — that's out of scope. This story only adds vocabulary mapping comments.
- **Do NOT change the `'integration-required'` string** in `ValidationACResult.reason`. It's a status reason, not a tier name. Just add a comment noting the terminology difference.
- **Do NOT modify `validation-ac-data.ts`.** That file contains the 79 AC entries and is not in scope.
- **Keep all old function exports working.** Consumers use `getCliVerifiableACs()` and `getIntegrationRequiredACs()` — they must still work. The test file (`validation-acs.test.ts`) also imports them.

### Consumers of renamed functions (must not break)

1. `src/modules/verify/index.ts` L87-88: re-exports `getCliVerifiableACs`, `getIntegrationRequiredACs`
2. `src/modules/verify/__tests__/validation-acs.test.ts`: imports and tests both functions
3. `src/coverage/coverage-summary.json`: references function names (auto-generated, will update on next coverage run)
4. `src/modules/verify/AGENTS.md`: documents the functions

### Current file state (from story 16-1, 16-2, 16-3)

- `src/modules/verify/types.ts` already has `VerificationTier`, `TIER_HIERARCHY`, `maxTier()`, `LEGACY_TIER_MAP`
- `src/modules/verify/parser.ts` already uses `classifyTier()` with new tier vocabulary
- `src/modules/verify/proof.ts` already recognizes all four tier names in `**Tier:**` parsing
- `validation-acs.ts`, `validation-runner.ts`, `validation-runner-types.ts`, `validation-ac-types.ts` still use old vocabulary — this story updates them

### Project Structure Notes

- All files are in `src/modules/verify/` — the verify module
- Tests are in `src/modules/verify/__tests__/`
- NFR18: 300-line file limit. All target files are well under this limit.
- Follow existing JSDoc patterns: `/** @deprecated Use X instead. */`

### References

- [Source: _bmad-output/implementation-artifacts/tech-spec-verification-tier-rework.md#Task 4] — "Replace all cli-verifiable/integration-required references with new tier names"
- [Source: src/modules/verify/types.ts#L10-L38] — `VerificationTier` type and `LEGACY_TIER_MAP` already defined
- [Source: src/modules/verify/validation-acs.ts#L34-L42] — Current function signatures to rename
- [Source: src/modules/verify/index.ts#L85-L89] — Re-exports that need updating

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-4-update-validation-acs-and-runner-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-4-update-validation-acs-and-runner.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A — no errors encountered.

### Completion Notes List

- Created `getTestProvableACs()` and `getEnvironmentProvableACs()` as new primary functions in `validation-acs.ts`
- Converted `getCliVerifiableACs()` and `getIntegrationRequiredACs()` to deprecated aliases delegating to the new functions
- Added both new functions to `index.ts` re-exports while keeping old names
- Added JSDoc tier mapping comment in `validation-runner.ts` above the `integration` check — no behavioral change
- Updated `validation-runner-types.ts` comments on L22 (`reason` field) and L56 (`blocked` count) to note tier correspondence and clarify `'integration-required'` is a status reason, not a tier name
- Added JSDoc to `VerificationMethod` type in `validation-ac-types.ts` documenting `cli` -> `test-provable` and `integration` -> `environment-provable` correspondence
- Added 5 new tests: `getTestProvableACs` (3 tests), `getEnvironmentProvableACs` (2 tests) — all pass
- Updated AGENTS.md to reflect new exports and deprecations
- Full test suite: 149 files, 3892 tests — all pass, zero regressions

### Change Log

- 2026-03-27: Story 16-4 implemented — added new tier-vocabulary functions, deprecated old names, updated JSDoc/comments across validation modules

### File List

- src/modules/verify/validation-acs.ts (modified)
- src/modules/verify/validation-ac-types.ts (modified)
- src/modules/verify/validation-runner.ts (modified)
- src/modules/verify/validation-runner-types.ts (modified)
- src/modules/verify/index.ts (modified)
- src/modules/verify/AGENTS.md (modified)
- src/modules/verify/__tests__/validation-acs.test.ts (modified)
