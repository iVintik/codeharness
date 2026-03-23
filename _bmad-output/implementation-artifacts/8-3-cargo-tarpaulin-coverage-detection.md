# Story 8.3: cargo-tarpaulin coverage detection and parsing

Status: verifying

## Story

As a developer running coverage on a Rust project,
I want codeharness to detect cargo-tarpaulin, run it, and parse the JSON report,
so that coverage metrics are tracked at parity with Node.js/Python.

## Acceptance Criteria

- [x] AC1: Given a Rust project with `cargo-tarpaulin` installed, when `detectCoverageTool()` is called, then it returns `{ tool: 'cargo-tarpaulin', runCommand: 'cargo tarpaulin --out json --output-dir coverage/', reportFormat: 'tarpaulin-json' }` <!-- verification: cli-verifiable -->
- [x] AC2: Given a Rust workspace project (Cargo.toml contains `[workspace]`), when `detectCoverageTool()` is called, then the run command includes `--workspace` flag <!-- verification: cli-verifiable -->
- [x] AC3: Given a `coverage/tarpaulin-report.json` file with `"coverage": 85.5`, when `parseCoverageReport()` is called with format `'tarpaulin-json'`, then it returns `85.5` <!-- verification: cli-verifiable -->
- [x] AC4: Given `cargo test` output containing `test result: ok. 42 passed; 3 failed; 0 ignored`, when `parseTestCounts()` is called, then it returns `{ passCount: 42, failCount: 3 }` <!-- verification: cli-verifiable -->
- [x] AC5: Given `cargo-tarpaulin` is NOT installed, when `detectCoverageTool()` is called on a Rust project, then it returns `{ tool: 'unknown' }` with a warning <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Update `detectCoverageTool()` rust branch in coverage.ts (AC: #1, #2, #5)
  - [x] 1.1 Add `cargo-tarpaulin` installation check via `cargo tarpaulin --version` subprocess
  - [x] 1.2 Return `{ tool: 'unknown' }` with warning if tarpaulin not installed
  - [x] 1.3 Update `runCommand` to `'cargo tarpaulin --out json --output-dir coverage/'`
  - [x] 1.4 Add workspace detection: read Cargo.toml for `[workspace]` section, append `--workspace` if present
- [x] Task 2: Add `tarpaulin-json` branch to `parseCoverageReport()` (AC: #3)
  - [x] 2.1 Create `parseTarpaulinCoverage(dir)` function
  - [x] 2.2 Read `coverage/tarpaulin-report.json`, extract top-level `"coverage"` field
  - [x] 2.3 Wire into `parseCoverageReport()` format switch
- [x] Task 3: Add `cargo test` output parsing to `parseTestCounts()` (AC: #4)
  - [x] 3.1 Add regex for `test result: ok. N passed; N failed; N ignored` format
  - [x] 3.2 Handle both `ok` and `FAILED` result lines
- [x] Task 4: Write unit tests for all new code paths
  - [x] 4.1 Tests for detectCoverageTool rust with tarpaulin installed vs not installed
  - [x] 4.2 Tests for workspace flag inclusion
  - [x] 4.3 Tests for parseTarpaulinCoverage with valid/invalid/missing report
  - [x] 4.4 Tests for parseTestCounts with cargo test output format (ok and FAILED)
- [x] Task 5: Run full test suite — zero regressions

## Dev Notes

### Current State of Rust Coverage Code

Story 8-2 already added a rust branch to `detectCoverageTool()` in `src/lib/coverage.ts` (lines 51-57). It is a stub that needs replacement:

```typescript
// CURRENT (incomplete — from 8-2 code review fix)
if (stack === 'rust') {
  return {
    tool: 'cargo-tarpaulin',
    runCommand: 'cargo tarpaulin --out json',
    reportFormat: 'tarpaulin-json',
  };
}
```

**Problems with current code:**
1. No tarpaulin install check — unconditionally returns `cargo-tarpaulin` (violates AC #5)
2. Wrong `runCommand` — missing `--output-dir coverage/` (violates AC #1)
3. No workspace detection — missing `--workspace` flag (violates AC #2)
4. `parseCoverageReport()` has no `tarpaulin-json` branch — falls through to `return 0` (violates AC #3)
5. `parseTestCounts()` has no cargo test regex (violates AC #4)

### Implementation Guide

**All changes in single file: `src/lib/coverage.ts`**

#### 1. Replace rust branch in detectCoverageTool (lines 51-57)

```typescript
if (stack === 'rust') {
  // Check if cargo-tarpaulin is installed
  try {
    execSync('cargo tarpaulin --version', { stdio: 'pipe', timeout: 10_000 });
  } catch {
    warn('cargo-tarpaulin not installed — coverage detection unavailable');
    return { tool: 'unknown', runCommand: '', reportFormat: '' };
  }

  // Detect workspace
  const cargoPath = join(baseDir, 'Cargo.toml');
  let isWorkspace = false;
  try {
    const cargoContent = readFileSync(cargoPath, 'utf-8');
    isWorkspace = /^\[workspace\]/m.test(cargoContent);
  } catch { /* not a workspace */ }

  const wsFlag = isWorkspace ? ' --workspace' : '';
  return {
    tool: 'cargo-tarpaulin',
    runCommand: `cargo tarpaulin --out json --output-dir coverage/${wsFlag}`,
    reportFormat: 'tarpaulin-json',
  };
}
```

`execSync` is already imported at line 1. `readFileSync` and `join` are already imported.

#### 2. Add tarpaulin-json to parseCoverageReport (around line 272)

In `parseCoverageReport()`, add before the `return 0` fallthrough:

```typescript
if (format === 'tarpaulin-json') {
  return parseTarpaulinCoverage(dir);
}
```

New function (place near other parse functions around line 314):

```typescript
function parseTarpaulinCoverage(dir: string): number {
  const reportPath = join(dir, 'coverage', 'tarpaulin-report.json');
  if (!existsSync(reportPath)) {
    warn('Tarpaulin report not found at coverage/tarpaulin-report.json');
    return 0;
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as { coverage?: number };
    return report.coverage ?? 0;
  } catch {
    warn('Failed to parse tarpaulin coverage report');
    return 0;
  }
}
```

#### 3. Add cargo test regex to parseTestCounts (around line 344)

Add before the final `return { passCount: 0, failCount: 0 }`:

```typescript
// cargo test format: "test result: ok. 42 passed; 3 failed; 0 ignored"
const cargoMatch = /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed/i.exec(output);
if (cargoMatch) {
  return {
    passCount: parseInt(cargoMatch[1], 10),
    failCount: parseInt(cargoMatch[2], 10),
  };
}
```

### Tarpaulin Report Format

```json
{
  "coverage": 85.5,
  "files": [
    { "path": "src/main.rs", "covered": 10, "coverable": 12 }
  ]
}
```

Only the top-level `"coverage"` field is needed (float 0-100).

### Cargo Test Output Formats

```
test result: ok. 42 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.23s
test result: FAILED. 10 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out
```

The regex `test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed` handles both.

### Architecture Constraints

- **<300 line limit**: `coverage.ts` is already 568 lines (pre-existing violation). Adding ~40 lines is acceptable — follow existing pattern, don't refactor file structure in this story.
- **No new npm dependencies**: All parsing uses `JSON.parse`, regex, and `execSync` (already imported).
- **NFR4 from epics**: Cargo.toml parsing uses regex, not a TOML parser. Same approach as `stack-detect.ts`.
- **Result<T> pattern**: `detectCoverageTool` returns `CoverageToolInfo` directly (existing convention). Do not change return type.

### Testing Patterns

Follow existing test patterns in `src/lib/__tests__/coverage.test.ts`:
- `mkdtempSync` for temp directories, `rmSync` in `afterEach`
- Write `Cargo.toml` and `tarpaulin-report.json` fixtures to temp dir
- For tarpaulin install check: use `vi.spyOn` on child_process `execSync` or use `vi.mock`
- Existing tests mock at the filesystem level, not at the function level

### Do NOT Duplicate

These were already done in story 8-2 (code review fixes):
- `CoverageToolInfo.tool` union already includes `'cargo-tarpaulin'`
- `getDefaultState()` returns `'cargo-tarpaulin'` for rust stack
- `getStackLabel()` returns `'Rust (Cargo.toml)'` for rust
- `generateAgentsMdContent()` handles rust stack
- `getCoverageTool()` in docs-scaffold.ts returns `'cargo-tarpaulin'` for rust

### References

- [Source: src/lib/coverage.ts — detectCoverageTool L35-61, parseCoverageReport L265-273, parseTestCounts L316-345]
- [Source: src/lib/stack-detect.ts — workspace pattern regex from getCargoDepsSection L70-77]
- [Source: src/lib/__tests__/coverage.test.ts — test patterns, mkdtempSync fixtures]
- [Source: _bmad-output/planning-artifacts/epics-rust-stack-support.md — FR7, FR8, FR9]
- [Source: _bmad-output/implementation-artifacts/8-2-expand-state-types-for-rust.md — previous story learnings]

### Previous Story Intelligence (8-2)

- The rust branch in `detectCoverageTool` was added as a code review fix — it's a stub that this story replaces.
- Test suite was at 2968 tests after 8-2. Zero regressions expected.
- Code review in 8-2 found that `detectCoverageTool` originally had no rust branch at all (fell through to unknown). The fix was minimal — this story completes it.

### Git Intelligence

Recent commits: d6a76bf (8-2 verified), 9ddd65e (8-2 AC2 fix), 4c7f498 (8-1 detection).
Files modified: `state.ts`, `coverage.ts`, `stack-detect.ts`, `docs-scaffold.ts` + tests.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-3-cargo-tarpaulin-coverage-detection.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-3-cargo-tarpaulin-coverage-detection.md`

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
- Replaced stub rust branch in detectCoverageTool with tarpaulin install check, workspace detection, correct runCommand
- Added parseTarpaulinCoverage function and wired into parseCoverageReport
- Added cargo test output regex to parseTestCounts (placed before pytest regex to avoid false match)
- Added 11 new tests (67 total in coverage.test.ts, 2979 total suite)
- Used vi.mock('node:child_process') with importOriginal to mock execSync for ESM compatibility
- Zero regressions across full test suite

### File List
- src/lib/coverage.ts (modified: detectCoverageTool rust branch, parseCoverageReport tarpaulin-json, parseTarpaulinCoverage new, parseTestCounts cargo regex)
- src/lib/__tests__/coverage.test.ts (modified: 12 new tests for AC1-AC5 + workspace aggregation)
- src/lib/AGENTS.md (modified: updated coverage.ts description to include cargo-tarpaulin)

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (1M context)
**Date:** 2026-03-23

### Findings Summary
- 1 HIGH fixed, 1 MEDIUM fixed (AGENTS.md), 1 MEDIUM deferred (proof doc — out of scope for code review)

### HIGH — Fixed: Workspace cargo test count aggregation
`parseTestCounts()` used `.exec()` which only captures the first `test result:` line. For workspace projects, `cargo test` emits one line per crate. Changed to `matchAll`-style loop with global regex to sum all crate counts. Added test for multi-crate output (18 passed, 3 failed across 3 crates).

### MEDIUM — Fixed: AGENTS.md stale for coverage module
`src/lib/AGENTS.md` listed coverage.ts tools as "(Vitest/c8/coverage.py)" — updated to include cargo-tarpaulin.

### MEDIUM — Not fixed: Missing Showboat proof document
No proof doc at `docs/exec-plans/active/8-3-cargo-tarpaulin-coverage-detection.proof.md`. This is created during verification, not code review.

### Verification
- 2980 tests pass (was 2979, +1 workspace aggregation test), zero regressions
- `codeharness coverage --min-file 80` passes: all 123 files above 80% floor, overall 97%
- All 5 ACs verified against implementation

### Outcome: Approved with fixes applied → status set to `verifying`
