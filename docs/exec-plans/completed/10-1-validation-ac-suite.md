# Exec Plan: 10-1-validation-ac-suite

## Objective

Create a typed validation AC registry covering all 79 acceptance criteria for the v1.0 release gate. This story defines _what_ to validate; stories 10-2 and 10-3 will execute and adapt.

## Approach

1. Define types (`ValidationAC`, `VerificationMethod`, `AcCategory`) in `validation-ac-types.ts`
2. Populate 79 AC entries split across:
   - `validation-ac-fr.ts` — FR ACs 1-40
   - `validation-ac-data.ts` — NFR, UX, Regression, ActionItem ACs 41-79
3. Barrel export in `validation-acs.ts` with helper functions
4. Unit tests in `validation-acs.test.ts` covering registry structure, counts, category distribution

## Key Decisions

- Files split to comply with NFR18 (300-line limit)
- Verification method classification derived from `<!-- verification: ... -->` tags in story markdown
- Story table claims 53 cli / 26 integration but actual AC tags yield 55 cli / 24 integration — tests match reality
- No runtime AC execution in this story (that's 10-3)

## Files Changed

- `src/modules/verify/validation-ac-types.ts` (new)
- `src/modules/verify/validation-ac-fr.ts` (new)
- `src/modules/verify/validation-ac-data.ts` (new)
- `src/modules/verify/validation-acs.ts` (new)
- `src/modules/verify/__tests__/validation-acs.test.ts` (new)
- `src/modules/verify/AGENTS.md` (updated)
