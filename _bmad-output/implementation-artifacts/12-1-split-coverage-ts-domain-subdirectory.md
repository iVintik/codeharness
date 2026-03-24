# Story 12-1: Split coverage.ts into Domain Subdirectory

## Status: backlog

## Story

As a developer,
I want coverage logic in `src/lib/coverage/` with files under 300 lines each,
So that coverage code is maintainable and testable.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/coverage/` exists, when inspected, then it contains: `index.ts` (<50 lines, re-exports), `types.ts`, `runner.ts`, `evaluator.ts`, `parser.ts` <!-- verification: cli-verifiable -->
- [ ] AC2: Given each file in `src/lib/coverage/`, when line count is checked, then no file exceeds 300 lines <!-- verification: cli-verifiable -->
- [ ] AC3: Given `parseTestCounts()` in `parser.ts`, when cargo workspace output is mixed with pytest-like output, then cargo aggregation fires first (ordering guard test exists) <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 4 (lib/ Restructuring)** and **Decision 12 (File Size Enforcement).** `src/lib/coverage.ts` is currently 617 lines.

Target structure (from architecture-v3.md):

```
src/lib/coverage/
  index.ts      — Re-exports: detectCoverageTool, runCoverage, evaluateCoverage (<50 lines)
  types.ts      — CoverageToolInfo, CoverageResult, CoverageEvaluation types
  runner.ts     — runCoverage, checkOnlyCoverage (executing coverage tools)
  evaluator.ts  — evaluateCoverage, updateCoverageState (comparing against targets)
  parser.ts     — parseTestCounts, parseCoverageReport (delegates to stack provider after Epic 10)
```

Split strategy for current `src/lib/coverage.ts`:
- **Types**: Extract all interfaces and type definitions to `types.ts`
- **Runner**: Functions that execute coverage tools (`runCoverage`, `checkOnlyCoverage`, `runCoverageCommand`)
- **Evaluator**: Functions that compare coverage results against targets (`evaluateCoverage`, `updateCoverageState`, `meetsCoverageTarget`)
- **Parser**: Functions that parse test output and coverage reports (`parseTestCounts`, `parseCoverageReport`, `parseCloverXml`, `parseLcov`)

The `parseTestCounts()` function has a critical ordering dependency: cargo workspace output produces multiple `test result:` lines that must be aggregated before any single-test-framework parser runs. Write a specific test in `parser.test.ts` that feeds mixed cargo workspace + pytest output and verifies cargo aggregation runs first.

Import rule (Decision 4): External consumers import from `src/lib/coverage/index.ts` only. Internal files can import siblings.

Update all imports across the codebase from `src/lib/coverage.ts` to `src/lib/coverage/index.ts` (or just `src/lib/coverage/` with index resolution).

## Files to Change

- `src/lib/coverage.ts` — Delete after splitting into subdirectory
- `src/lib/coverage/index.ts` — Create. Re-exports only (<50 lines)
- `src/lib/coverage/types.ts` — Create. All coverage type definitions
- `src/lib/coverage/runner.ts` — Create. Coverage execution functions
- `src/lib/coverage/evaluator.ts` — Create. Coverage evaluation and state update
- `src/lib/coverage/parser.ts` — Create. Test output and coverage report parsing
- `src/lib/coverage/__tests__/parser.test.ts` — Create. Ordering guard test for cargo workspace aggregation
- All files importing from `src/lib/coverage.ts` — Update import paths
