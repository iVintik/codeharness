# Story 8-2: Expand State Types for Rust

## Status: verifying

## Story

As a developer,
I want the harness state to support Rust-specific fields,
So that coverage tool and OTLP config are correctly stored without type errors.

## Acceptance Criteria

- [x] AC1: Given a Rust project is initialized, when state is written, then `coverage.tool` accepts `'cargo-tarpaulin'` without type errors <!-- verification: cli-verifiable -->
- [x] AC2: Given a Rust project has OTLP configured, when state is written, then `otlp.rust_env_hint` field is present with value `'OTEL_EXPORTER_OTLP_ENDPOINT'` <!-- verification: cli-verifiable -->

## Technical Notes

### State Interface

File: `src/lib/state.ts` — `HarnessState` interface.

Two changes needed:

1. **Coverage tool type union**: Change `coverage.tool` type from `'c8' | 'coverage.py' | 'unknown'` to `'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown'`. This is referenced in `src/lib/coverage.ts` as `CoverageToolInfo.tool` — both must be updated consistently.

2. **OTLP rust_env_hint**: Add optional `rust_env_hint?: string` to the OTLP state section. This stores `'OTEL_EXPORTER_OTLP_ENDPOINT'` for Rust projects.

### Breaking Change Risk

None. All additions are optional fields or type union expansions. Existing Node.js and Python state files are unaffected.

### State Storage Format

The state file is YAML frontmatter in `.claude/codeharness.local.md`. No migration needed — new fields are optional.

### Tests

Verify TypeScript compilation passes with `cargo-tarpaulin` assigned to `coverage.tool` and `rust_env_hint` assigned to OTLP state. Add type assertion tests if existing test patterns support it.

## Files to Change

- `src/lib/state.ts` — Expand `HarnessState.coverage.tool` type union to include `'cargo-tarpaulin'`, add optional `rust_env_hint?: string` to OTLP state section
- `src/lib/coverage.ts` — Expand `CoverageToolInfo.tool` type union to include `'cargo-tarpaulin'` (must match state.ts)

## Tasks/Subtasks

- [x] Task 1: Expand `coverage.tool` type union in `HarnessState` (state.ts) from `string` to `'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown'`
- [x] Task 2: Expand `CoverageToolInfo.tool` type union in coverage.ts to include `'cargo-tarpaulin'`
- [x] Task 3: Add optional `rust_env_hint?: string` to OTLP state section in state.ts
- [x] Task 4: Update `getCoverageTool()` in docs-scaffold.ts to return `'cargo-tarpaulin'` for rust stack
- [x] Task 5: Write type assertion and round-trip tests for cargo-tarpaulin and rust_env_hint
- [x] Task 6: Run full test suite — 2961 tests pass, zero regressions

## Dev Agent Record

### Implementation Plan

- Expand `HarnessState.coverage.tool` from generic `string` to a proper type union `'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown'` (was previously untyped)
- Expand `CoverageToolInfo.tool` in coverage.ts to match the same union
- Add optional `rust_env_hint?: string` to the OTLP section of `HarnessState`
- Update `getCoverageTool()` to map `'rust'` stack to `'cargo-tarpaulin'`
- Add comprehensive tests: type assertions, YAML round-trip, optional field behavior

### Completion Notes

All acceptance criteria satisfied. TypeScript compilation passes for all modified files. The `coverage.tool` type was tightened from `string` to a proper union, which is a stricter (non-breaking) change. The `getCoverageTool()` function in docs-scaffold.ts was also updated to handle `'rust'` stack correctly. Full test suite: 113 files, 2961 tests, all passing.

## File List

- `src/lib/state.ts` — Modified: expanded `coverage.tool` type to union, added `rust_env_hint` to OTLP
- `src/lib/coverage.ts` — Modified: expanded `CoverageToolInfo.tool` type to include `'cargo-tarpaulin'`
- `src/modules/infra/docs-scaffold.ts` — Modified: updated `getCoverageTool()` return type and added rust mapping
- `src/lib/__tests__/state.test.ts` — Modified: added 5 tests for Rust type support (cargo-tarpaulin, rust_env_hint)
- `src/lib/__tests__/coverage.test.ts` — Modified: added CoverageToolInfo type assertion test for cargo-tarpaulin
- `src/modules/infra/__tests__/docs-scaffold.test.ts` — Modified: added getCoverageTool rust test

## Senior Developer Review (AI)

**Date:** 2026-03-23
**Reviewer:** Adversarial Code Review

### Issues Found: 1 HIGH, 4 MEDIUM, 1 LOW

**HIGH:**
1. `getDefaultState()` always defaults `coverage.tool` to `'c8'` regardless of stack — rust init would get wrong default. **FIXED:** Extracted `getDefaultCoverageTool()` helper that maps stack to correct tool.

**MEDIUM:**
2. `detectCoverageTool()` has no rust branch — falls through to `unknown` for Cargo.toml projects. **FIXED:** Added rust branch returning `cargo-tarpaulin` with correct runCommand.
3. `getStackLabel()` returns `'Unknown'` for rust stack. **FIXED:** Added `'rust'` → `'Rust (Cargo.toml)'` mapping.
4. `generateAgentsMdContent()` has no rust branch — rust projects get "No recognized stack" boilerplate. **FIXED:** Added rust branch with cargo build/test/tarpaulin commands.
5. Missing test coverage for rust in `detectCoverageTool`, `getStackLabel`, `generateAgentsMdContent`, and `getDefaultState` stack-dependent defaults. **FIXED:** Added 7 new tests.

**LOW:**
6. Git shows extra modified files (sprint-state.json, .session-issues.md) not in story File List — minor documentation gap. NOT FIXED (cosmetic).

### Result
All HIGH and MEDIUM issues fixed. Tests: 2968 passing (was 2961). Coverage: 97.03% overall, all 123 files above 80% per-file floor.

## Change Log

- 2026-03-23: Expanded state types for Rust stack support — coverage.tool union includes cargo-tarpaulin, OTLP section includes rust_env_hint, getCoverageTool maps rust to cargo-tarpaulin
- 2026-03-23: Code review fixes — getDefaultState stack-aware defaults, detectCoverageTool rust branch, getStackLabel/generateAgentsMdContent rust support, 7 new tests
