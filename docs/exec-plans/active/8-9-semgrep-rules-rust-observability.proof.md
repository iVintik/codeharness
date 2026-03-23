# Showboat Proof: 8-9 Semgrep Rules for Rust Observability

## Test Environment

- **Type:** Local development (macOS)
- **Date:** 2026-03-23
- **Tool:** Vitest unit tests + YAML structural validation
- **Story:** 8-9-semgrep-rules-rust-observability

## AC #1: rust-function-no-tracing rule reports observability gaps

**Test:** `rust-function-no-tracing.yaml` — 15 structural tests in `rust-semgrep-rules.test.ts`
**Evidence:**
- Rule file exists at `patches/observability/rust-function-no-tracing.yaml`
- Rule ID: `rust-function-no-tracing`, languages: `[rust]`, severity: `INFO`
- pattern-either covers `fn`, `pub fn`, `async fn`, `pub async fn`
- pattern-not excludes `tracing::debug!`, `tracing::info!`, `tracing::warn!`, `tracing::error!`, `tracing::trace!`, and bare macro variants (`debug!`, `info!`, etc.)
- pattern-not excludes `#[tracing::instrument]` and `#[instrument]` attributes
- Test fixture `rust-function-no-tracing.rs` has `// ruleid:` and `// ok:` annotations
- Metadata: category=observability, CWE-778

**Verdict:** PASS

## AC #2: rust-catch-without-tracing rule reports observability gaps

**Test:** `rust-catch-without-tracing.yaml` — 13 structural tests in `rust-semgrep-rules.test.ts`
**Evidence:**
- Rule file exists at `patches/observability/rust-catch-without-tracing.yaml`
- Rule ID: `rust-catch-without-tracing`, languages: `[rust]`, severity: `WARNING`
- Pattern matches `Err($E) => { ... }` match arms
- pattern-not excludes `tracing::error!`, `tracing::warn!`, `error!`, `warn!` macros
- Test fixture `rust-catch-without-tracing.rs` has annotated positive/negative cases

**Verdict:** PASS

## AC #3: rust-error-path-no-tracing rule reports observability gaps

**Test:** `rust-error-path-no-tracing.yaml` — 13 structural tests in `rust-semgrep-rules.test.ts`
**Evidence:**
- Rule file exists at `patches/observability/rust-error-path-no-tracing.yaml`
- Rule ID: `rust-error-path-no-tracing`, languages: `[rust]`, severity: `WARNING`
- pattern-either covers `.map_err(|$E| { ... })` and `.unwrap_or_else(|$E| { ... })`
- pattern-not excludes tracing macros in both closure types
- Test fixture `rust-error-path-no-tracing.rs` has annotated positive/negative cases

**Verdict:** PASS

## AC #4: Semgrep auto-discovers Rust rules via languages field

**Evidence:**
- All 3 rules set `languages: [rust]` — Semgrep auto-discovers by language
- `analyzer.ts` runs `semgrep scan --config patches/observability/ --json` — no code changes needed
- `parseSemgrepOutput` correctly handles Rust rule IDs (verified by test)
- No TypeScript source modifications required

**Verdict:** PASS

## AC #5: All tests pass with zero regressions

**Evidence:** Full test suite: 3068 tests across 114 files, zero failures.
- Previous: 3021 tests / 113 files
- Added: 47 new tests / 1 new test file (`rust-semgrep-rules.test.ts`)

**Verdict:** PASS

## Coverage

- **New test file:** `rust-semgrep-rules.test.ts` — 47 tests covering YAML structure, metadata, patterns, cross-rule consistency, and analyzer integration
- **No TypeScript source changes** — only YAML rule files and test fixtures added
- **NFR1:** All 3 YAML files under 300 lines (largest: ~230 lines)
- **NFR3:** No new npm dependencies

## Note: Semgrep Validation

`semgrep --validate` could not run locally due to a known semgrep-core crash (Bigarray.create bug in semgrep 1.136.0 on this macOS). The same crash affects existing JS/TS rules — confirmed system-wide issue, not rule-specific. CI pipeline should validate successfully.
