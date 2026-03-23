# Story 8-3: cargo-tarpaulin Coverage Detection and Parsing

## Status: backlog

## Story

As a developer running coverage on a Rust project,
I want codeharness to detect cargo-tarpaulin, run it, and parse the JSON report,
So that coverage metrics are tracked at parity with Node.js/Python.

## Acceptance Criteria

- [ ] AC1: Given a Rust project with `cargo-tarpaulin` installed, when `detectCoverageTool()` is called, then it returns `{ tool: 'cargo-tarpaulin', runCommand: 'cargo tarpaulin --out json --output-dir coverage/', reportFormat: 'tarpaulin-json' }` <!-- verification: cli-verifiable -->
- [ ] AC2: Given a Rust workspace project, when `detectCoverageTool()` is called, then the run command includes `--workspace` flag <!-- verification: cli-verifiable -->
- [ ] AC3: Given a `coverage/tarpaulin-report.json` file with `"coverage": 85.5`, when `parseCoverageReport()` is called with format `'tarpaulin-json'`, then it returns `85.5` <!-- verification: cli-verifiable -->
- [ ] AC4: Given `cargo test` output containing `test result: ok. 42 passed; 3 failed; 0 ignored`, when `parseTestCounts()` is called, then it returns `{ passCount: 42, failCount: 3 }` <!-- verification: cli-verifiable -->
- [ ] AC5: Given `cargo-tarpaulin` is NOT installed, when `detectCoverageTool()` is called on a Rust project, then it returns `{ tool: 'unknown' }` with a warning <!-- verification: cli-verifiable -->

## Technical Notes

### Coverage Tool Detection

File: `src/lib/coverage.ts` — `detectCoverageTool()` at L35-53.

Add `if (stack === 'rust') { return detectRustCoverageTool(baseDir); }` at L47 (after existing stack checks).

Create `detectRustCoverageTool(baseDir: string)` function:
1. Check `Cargo.toml` exists (sanity check)
2. Check if `cargo-tarpaulin` is installed: try `cargo tarpaulin --version` via `execFileSync`
3. If installed, return `{ tool: 'cargo-tarpaulin', runCommand: 'cargo tarpaulin --out json --output-dir coverage/', reportFormat: 'tarpaulin-json' }`
4. For workspace projects (detect `[workspace]` in `Cargo.toml`), add `--workspace` flag to `runCommand`
5. If not installed, return `{ tool: 'unknown' }` with a warning log

### Coverage Report Parsing

File: `src/lib/coverage.ts` — `parseCoverageReport()` at L257.

Add `'tarpaulin-json'` case. Create `parseTarpaulinCoverage(reportDir: string)` function:
1. Read `coverage/tarpaulin-report.json`
2. Parse JSON
3. Extract top-level `coverage` field (float 0-100)
4. Return the number directly

Tarpaulin JSON format: `{ "files": [...], "coverage": 85.5 }` — the top-level `coverage` field is the overall percentage.

### Test Output Parsing

File: `src/lib/coverage.ts` — `parseTestCounts()` at L308.

Add regex for `cargo test` output format:
```typescript
/test result: ok\. (\d+) passed; (\d+) failed/
```

This matches: `test result: ok. 42 passed; 3 failed; 0 ignored`

### Type Changes

`CoverageToolInfo.tool` type union must include `'cargo-tarpaulin'` (see story 8-2). `reportFormat` must accept `'tarpaulin-json'`.

### Tests

File: `src/lib/__tests__/coverage.test.ts`

Mirror existing Node.js/Python test patterns. Use `vi.mock('node:fs')` and `vi.mock('node:child_process')`. Test cases:
- Tarpaulin installed → returns correct CoverageToolInfo
- Tarpaulin not installed → returns `{ tool: 'unknown' }`
- Workspace project → `--workspace` flag in runCommand
- Tarpaulin JSON parsing → extracts `coverage` field
- `cargo test` output parsing → correct pass/fail counts
- Missing report file → graceful error

## Files to Change

- `src/lib/coverage.ts` — Add `detectRustCoverageTool()` function, add `parseTarpaulinCoverage()` function, add `'tarpaulin-json'` case to `parseCoverageReport()` (L257), add cargo test regex to `parseTestCounts()` (L308), add Rust branch to `detectCoverageTool()` (L47)
- `src/lib/__tests__/coverage.test.ts` — Add Rust coverage test cases for detection, parsing, workspace flag, and test output parsing
