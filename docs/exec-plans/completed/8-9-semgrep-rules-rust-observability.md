# Exec Plan: 8-9 Semgrep Rules for Rust Observability

## Summary

Create three Semgrep YAML rules for detecting observability gaps in Rust code, targeting the standard `tracing` crate. No TypeScript changes needed — Semgrep auto-discovers rules by `languages: [rust]`.

## Files Created

| File | Purpose |
|------|---------|
| `patches/observability/rust-function-no-tracing.yaml` | Detects Rust functions without tracing instrumentation |
| `patches/observability/rust-catch-without-tracing.yaml` | Detects Rust error match arms without tracing |
| `patches/observability/rust-error-path-no-tracing.yaml` | Detects Rust error-path closures without tracing |
| `patches/observability/rust-function-no-tracing.rs` | Semgrep test fixture (ruleid/ok annotations) |
| `patches/observability/rust-catch-without-tracing.rs` | Semgrep test fixture |
| `patches/observability/rust-error-path-no-tracing.rs` | Semgrep test fixture |
| `src/modules/observability/__tests__/rust-semgrep-rules.test.ts` | Vitest unit tests (47 tests) |

## Files Modified

| File | Change |
|------|--------|
| `patches/observability/AGENTS.md` | Added Rust rules and fixtures to documentation tables |

## Approach

1. Used existing JS/TS rules as structural templates
2. Mapped JS/TS logging patterns to Rust tracing crate equivalents
3. Covered all function forms: `fn`, `pub fn`, `async fn`, `pub async fn`
4. Excluded both namespaced (`tracing::debug!`) and bare (`debug!`) macro imports
5. Excluded `#[instrument]` and `#[tracing::instrument]` attributes
6. Validated via structural YAML tests (semgrep binary broken locally)
