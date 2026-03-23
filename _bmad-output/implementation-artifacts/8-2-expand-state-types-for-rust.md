# Story 8-2: Expand State Types for Rust

## Status: backlog

## Story

As a developer,
I want the harness state to support Rust-specific fields,
So that coverage tool and OTLP config are correctly stored without type errors.

## Acceptance Criteria

- [ ] AC1: Given a Rust project is initialized, when state is written, then `coverage.tool` accepts `'cargo-tarpaulin'` without type errors <!-- verification: cli-verifiable -->
- [ ] AC2: Given a Rust project has OTLP configured, when state is written, then `otlp.rust_env_hint` field is present with value `'OTEL_EXPORTER_OTLP_ENDPOINT'` <!-- verification: cli-verifiable -->

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
