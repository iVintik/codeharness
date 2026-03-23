# Showboat Proof: 8-8 Rust Documentation Scaffolding

## Test Environment

- **Type:** Local development (macOS)
- **Date:** 2026-03-23
- **Tool:** Vitest unit tests + codeharness coverage
- **Story:** 8-8-rust-documentation-scaffolding

## AC #1: getStackLabel('rust') returns 'Rust (Cargo.toml)'

**Test:** `returns Rust label for rust stack`
**Evidence:** `getStackLabel('rust')` returns `'Rust (Cargo.toml)'` — verified by existing test at docs-scaffold.test.ts.

**Verdict:** PASS

## AC #2: getCoverageTool('rust') returns 'cargo-tarpaulin'

**Test:** `returns cargo-tarpaulin for rust`
**Evidence:** `getCoverageTool('rust')` returns `'cargo-tarpaulin'` — verified by existing test.

**Verdict:** PASS

## AC #3: generateAgentsMdContent includes cargo commands

**Test:** `includes Rust commands for rust stack`
**Evidence:** `generateAgentsMdContent(dir, 'rust')` output contains `cargo build`, `cargo test`, `cargo tarpaulin` — verified by existing test.

**Verdict:** PASS

## AC #4: getProjectName reads from Cargo.toml [package] name

**Test:** `returns name from Cargo.toml [package] section when no package.json`
**Evidence:** Given `Cargo.toml` with `[package]\nname = "myapp"` and no package.json, `getProjectName()` returns `'myapp'`.

**Verdict:** PASS

## AC #5: package.json takes precedence over Cargo.toml

**Test:** `returns package.json name over Cargo.toml name (precedence)`
**Evidence:** Given both `package.json` (name: "npm-name") and `Cargo.toml` (name: "rust-name"), `getProjectName()` returns `'npm-name'`.

**Verdict:** PASS

## AC #6: Does not return dependency name; falls back to basename

**Test:** `falls back to basename when Cargo.toml has name only in [dependencies]`
**Evidence:** Given `Cargo.toml` with `[dependencies]\nname = "dep-name"` but no `[package]` section, `getProjectName()` returns `basename(testDir)`, NOT `'dep-name'`.

**Verdict:** PASS

## AC #7: All tests pass with zero regressions

**Evidence:** Full test suite: 3021 tests across 113 files, zero failures. Coverage: 97.06% overall, all 123 files above 80% per-file floor.

**Verdict:** PASS

## Coverage

- **docs-scaffold.ts:** 96.29% statements, 90% branches, 100% functions
- **Overall:** 97.06% (target: 90%)
- **Per-file floor:** All 123 files above 80%
