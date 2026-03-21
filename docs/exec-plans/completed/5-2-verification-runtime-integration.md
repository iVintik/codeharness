# Exec Plan: 5-2-verification-runtime-integration

## Summary

Integrate observability evidence requirements into the verification patch and validate that existing observability infrastructure (parser, prompt template, runtime coverage) works end-to-end.

## Implementation

### Task 1: Update verification patch
- Added `### Observability Evidence` section to `patches/verify/story-verification.md`
- Includes VictoriaLogs query instruction, `[OBSERVABILITY GAP]` tagging, graceful degradation when backend unreachable
- References `verify-prompt.ts` Step 3.5 for full query pattern

### Tasks 2-5: Confirm existing code
- `verify-prompt.ts`: Step 3.5 already present with VictoriaLogs query and gap tagging
- `parser.ts`: `parseObservabilityGaps()` already parses `## AC N:` sections for gap tags
- `verify/index.ts`: `verifyStory()` already calls `parseObservabilityGaps()`, sets `observabilityGapCount` and `runtimeCoveragePercent`
- `runtime-coverage.ts`: `computeRuntimeCoverage()` and `saveRuntimeCoverage()` persist to `observability.runtime` in sprint-state.json

### Task 6: Tests
- Created `verification-observability-patch.test.ts` with 16 tests covering:
  - Patch content validation (6 tests)
  - Prompt template regression (4 tests)
  - Parser with exact AC #3 scenario (4 tests)
  - VerifyResult type contract (1 test)
  - Runtime coverage computation contract (1 test)

### Task 7: Integration verification
- Build: tsup compiles without errors
- Tests: 2871 tests pass, no regressions
- File sizes: 56 lines (patch), 232 lines (test) — both under 300
