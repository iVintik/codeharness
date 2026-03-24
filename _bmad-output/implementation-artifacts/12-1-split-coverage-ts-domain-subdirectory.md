# Story 12.1: Split coverage.ts into domain subdirectory

Status: verifying

## Story

As a developer,
I want coverage logic in `src/lib/coverage/` with files under 300 lines each,
So that coverage code is maintainable and testable.

## Acceptance Criteria

1. AC1: Given `src/lib/coverage/` directory exists, when inspected, then it contains: `index.ts` (under 50 lines, re-exports only), `types.ts`, `runner.ts`, `evaluator.ts`, `parser.ts` <!-- verification: cli-verifiable -->
2. AC2: Given each file in `src/lib/coverage/`, when `wc -l` is run on every file, then no file exceeds 300 lines <!-- verification: cli-verifiable -->
3. AC3: Given `parseTestCounts()` lives in `parser.ts`, when cargo workspace output is mixed with pytest-like output, then cargo aggregation fires first (an ordering guard test exists in the test suite) <!-- verification: cli-verifiable -->
4. AC4: Given the old `src/lib/coverage.ts` file, when the split is complete, then it no longer exists (deleted, not left as a stub) <!-- verification: cli-verifiable -->
5. AC5: Given all consumers that previously imported from `../lib/coverage.js` (`src/commands/coverage.ts`, `src/modules/audit/dimensions.ts`, `src/lib/scanner.ts`, `src/lib/onboard-checks.ts`) and their test files, when import paths are inspected, then they import from `../lib/coverage/index.js` (or `../lib/coverage/` which resolves to index) <!-- verification: cli-verifiable -->
6. AC6: Given `src/lib/coverage/index.ts` is inspected, when its contents are reviewed, then it re-exports exactly: `detectCoverageTool`, `getTestCommand`, `runCoverage`, `parseCoverageReport`, `parseTestCounts`, `checkOnlyCoverage`, `evaluateCoverage`, `updateCoverageState`, `checkPerFileCoverage`, `formatCoverageOutput`, `printCoverageOutput`, and all exported types (`CoverageToolInfo`, `CoverageResult`, `CoverageEvaluation`, `FileCoverageEntry`, `PerFileCoverageResult`) <!-- verification: cli-verifiable -->
7. AC7: Given `npm test` is run after all changes, when it completes, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->
8. AC8: Given `npx tsc --noEmit` is run after all changes, when it completes, then zero new type errors are introduced <!-- verification: cli-verifiable -->
9. AC9: Given coverage test file `src/lib/__tests__/coverage.test.ts` (968 lines), when the split is complete, then tests are reorganized under `src/lib/coverage/__tests__/` with files corresponding to the source modules (e.g., `runner.test.ts`, `evaluator.test.ts`, `parser.test.ts`) <!-- verification: cli-verifiable -->
10. AC10: Given `src/lib/coverage/runner.ts` imports from sibling files within `coverage/`, when cross-domain imports are checked, then no file inside `coverage/` imports directly from internal files of another domain directory (e.g., no `import from '../../docker/compose.js'` — only through `../../docker/index.js`) <!-- verification: cli-verifiable -->
11. AC11: Given a user runs `codeharness coverage` or `codeharness coverage --check-only`, when the command executes end-to-end, then observable behavior is identical to before the split (same output, same exit codes, same JSON format) <!-- verification: integration-required -->

## Tasks/Subtasks

- [x] Task 1: Create `src/lib/coverage/types.ts` — Move all interfaces and type aliases: `CoverageToolInfo`, `CoverageResult`, `CoverageEvaluation`, `FileCoverageEntry`, `PerFileCoverageResult` (AC: #1, #6)
  - [x] Include any type-only imports needed (e.g., `StackName`)
- [x] Task 2: Create `src/lib/coverage/parser.ts` — Move `parseTestCounts()` and `parseCoverageReport()` (AC: #1, #3)
  - [x] Ensure cargo aggregation ordering is preserved exactly
  - [x] Import types from `./types.js`
- [x] Task 3: Create `src/lib/coverage/runner.ts` — Move `detectCoverageTool()`, `getTestCommand()`, `runCoverage()`, `checkOnlyCoverage()`, and all private helpers (coverage detector map, `getStateToolHint`, stack-specific detection functions) (AC: #1)
  - [x] Import from `./types.js` and `./parser.js`
  - [x] Import shared utilities from `../state.js`, `../output.js`, `../stacks/index.js`
- [x] Task 4: Create `src/lib/coverage/evaluator.ts` — Move `evaluateCoverage()`, `updateCoverageState()`, `checkPerFileCoverage()`, `formatCoverageOutput()`, `printCoverageOutput()` (AC: #1)
  - [x] Import from `./types.js`
  - [x] Import shared utilities from `../state.js`, `../output.js`
- [x] Task 5: Create `src/lib/coverage/index.ts` — Pure re-export barrel file, under 50 lines (AC: #1, #6)
  - [x] Re-export all public functions and types from `./types.js`, `./runner.js`, `./evaluator.js`, `./parser.js`
- [x] Task 6: Update all consumer imports (AC: #5)
  - [x] `src/commands/coverage.ts` — `from '../lib/coverage.js'` → `from '../lib/coverage/index.js'`
  - [x] `src/modules/audit/dimensions.ts` — `from '../../lib/coverage.js'` → `from '../../lib/coverage/index.js'`
  - [x] `src/lib/scanner.ts` — `from './coverage.js'` → `from './coverage/index.js'`
  - [x] `src/lib/onboard-checks.ts` — `from './coverage.js'` → `from './coverage/index.js'`
  - [x] All corresponding test files that import from coverage
- [x] Task 7: Delete old `src/lib/coverage.ts` (AC: #4)
- [x] Task 8: Reorganize tests from `src/lib/__tests__/coverage.test.ts` into `src/lib/coverage/__tests__/` (AC: #9)
  - [x] `parser.test.ts` — tests for `parseTestCounts`, `parseCoverageReport`
  - [x] `runner.test.ts` — tests for `detectCoverageTool`, `runCoverage`, `checkOnlyCoverage`
  - [x] `evaluator.test.ts` — tests for `evaluateCoverage`, `updateCoverageState`, `checkPerFileCoverage`, `formatCoverageOutput`
  - [x] Delete old `src/lib/__tests__/coverage.test.ts`
  - [x] Update test imports in `src/modules/audit/__tests__/dimensions.test.ts` and `src/commands/__tests__/coverage.test.ts`
- [x] Task 9: Verify cross-domain import discipline (AC: #10)
  - [x] Grep for any imports from internal files of other domain dirs
- [x] Task 10: Run `npx tsc --noEmit` and `npm test` — zero regressions (AC: #7, #8)

## Dev Notes

### Current State of coverage.ts

- **Location:** `src/lib/coverage.ts` — 633 lines
- **Exports:** 11 functions + 5 types (see AC6 for full list)
- **Test file:** `src/lib/__tests__/coverage.test.ts` — 968 lines

### Consumers (files that import from coverage.ts)

| File | Imports |
|------|---------|
| `src/commands/coverage.ts` | `detectCoverageTool`, `runCoverage`, `checkOnlyCoverage`, `evaluateCoverage`, `updateCoverageState`, `printCoverageOutput`, `checkPerFileCoverage` |
| `src/modules/audit/dimensions.ts` | `checkOnlyCoverage` |
| `src/lib/scanner.ts` | `detectCoverageTool`, `parseCoverageReport` |
| `src/lib/onboard-checks.ts` | `checkPerFileCoverage` |
| `src/modules/audit/__tests__/dimensions.test.ts` | `checkOnlyCoverage` |
| `src/commands/__tests__/coverage.test.ts` | Multiple coverage imports |
| `src/lib/__tests__/coverage.test.ts` | All coverage imports |

### Target File Layout (from architecture-v3.md)

```
src/lib/coverage/
  index.ts      # Re-exports only (<50 lines)
  types.ts      # CoverageToolInfo, CoverageResult, CoverageEvaluation, FileCoverageEntry, PerFileCoverageResult
  runner.ts     # detectCoverageTool, getTestCommand, runCoverage, checkOnlyCoverage + private helpers
  evaluator.ts  # evaluateCoverage, updateCoverageState, checkPerFileCoverage, formatCoverageOutput, printCoverageOutput
  parser.ts     # parseTestCounts, parseCoverageReport
```

### Function-to-File Mapping

| Function | Target File | Lines (approx) |
|----------|------------|-----------------|
| Types (CoverageToolInfo, CoverageResult, CoverageEvaluation, FileCoverageEntry, PerFileCoverageResult) | `types.ts` | ~40 |
| `detectCoverageTool`, `getTestCommand`, private detector map + helpers | `runner.ts` | ~230 |
| `runCoverage`, `checkOnlyCoverage` | `runner.ts` | (included above) |
| `parseCoverageReport`, `parseTestCounts` | `parser.ts` | ~120 |
| `evaluateCoverage`, `updateCoverageState`, `checkPerFileCoverage`, `formatCoverageOutput`, `printCoverageOutput` | `evaluator.ts` | ~180 |
| Re-exports | `index.ts` | ~30 |

### Import Rules (architecture-v3.md, Decision 4)

- External consumers import from `src/lib/coverage/index.ts` only
- Within coverage/, files can import from siblings
- No cross-domain internal imports — use `../docker/index.js`, not `../docker/compose.js`
- `src/lib/state.ts` and `src/lib/output.ts` are shared utilities — any file can import them

### Dependency Graph Within coverage.ts

- `types.ts` — no internal dependencies (pure types)
- `parser.ts` — depends on `types.ts` only
- `runner.ts` — depends on `types.ts`, `parser.ts`, `../state.js`, `../output.js`, `../stacks/index.js`
- `evaluator.ts` — depends on `types.ts`, `../state.js`, `../output.js`

### Ordering Guard (AC3)

`parseTestCounts()` currently handles cargo workspace output specially. The cargo aggregation regex must fire before the pytest fallback regex when both patterns could match. This ordering is critical and must be preserved in `parser.ts`. A dedicated test must assert that mixed cargo+pytest-like output triggers cargo aggregation, not the pytest path.

### Project Structure Notes

- This is Story 12-1 of Epic 12 (lib/ Restructuring). Subsequent stories (12-2 through 12-4) will follow the same split pattern for other oversized files.
- The patterns established here (barrel index, test organization, import conventions) will be reused by stories 12-2, 12-3, and 12-4.
- Do NOT create `src/lib/coverage/AGENTS.md` — that's a modules/ convention, not a lib/ convention.

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md — Decision 4: lib/ Restructuring, coverage/ section]
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md — Epic 12, Story 12-1]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/12-1-split-coverage-ts-domain-subdirectory.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/12-1-split-coverage-ts-domain-subdirectory.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- Split `src/lib/coverage.ts` (633 lines) into 5 files under `src/lib/coverage/`: types.ts (43 lines), parser.ts (139 lines), runner.ts (284 lines), evaluator.ts (162 lines), index.ts (32 lines)
- All files under 300 lines, index.ts under 50 lines (pure re-exports)
- Reorganized tests from `src/lib/__tests__/coverage.test.ts` (968 lines) into 3 test files: parser.test.ts, runner.test.ts, evaluator.test.ts (69 tests total in coverage module)
- Added AC3 ordering guard test: verifies cargo aggregation fires before pytest fallback when both patterns could match
- Updated all 6 consumer import paths (4 source files + 2 test files) from `coverage.js` to `coverage/index.js`
- Deleted old `src/lib/coverage.ts` and `src/lib/__tests__/coverage.test.ts`
- Zero cross-domain internal imports in coverage/ — only imports from `../state.js`, `../output.js`, `../stacks/index.js` (shared utilities and barrel exports)
- Full test suite: 127 files, 3448 tests, all passing, zero regressions
- TypeScript: zero new type errors from coverage/ files
- `findCoverageSummary` exported from parser.ts (needed by evaluator.ts for `checkPerFileCoverage`)

### File List

- `src/lib/coverage/types.ts` (new) — All type/interface exports
- `src/lib/coverage/parser.ts` (new) — parseTestCounts, parseCoverageReport, findCoverageSummary
- `src/lib/coverage/runner.ts` (new) — detectCoverageTool, getTestCommand, runCoverage, checkOnlyCoverage
- `src/lib/coverage/evaluator.ts` (new) — evaluateCoverage, updateCoverageState, checkPerFileCoverage, formatCoverageOutput, printCoverageOutput
- `src/lib/coverage/index.ts` (new) — Barrel re-exports
- `src/lib/coverage/__tests__/parser.test.ts` (new) — Parser tests including AC3 ordering guard
- `src/lib/coverage/__tests__/runner.test.ts` (new) — Runner/detection tests
- `src/lib/coverage/__tests__/evaluator.test.ts` (new) — Evaluator/output tests
- `src/lib/coverage.ts` (deleted)
- `src/lib/__tests__/coverage.test.ts` (deleted)
- `src/commands/coverage.ts` (modified) — Import path updated
- `src/modules/audit/dimensions.ts` (modified) — Import path updated
- `src/lib/scanner.ts` (modified) — Import path updated
- `src/lib/onboard-checks.ts` (modified) — Import path updated
- `src/commands/__tests__/coverage.test.ts` (modified) — Mock and import paths updated
- `src/modules/audit/__tests__/dimensions.test.ts` (modified) — Mock and import paths updated
