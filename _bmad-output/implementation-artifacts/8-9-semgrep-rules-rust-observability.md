# Story 8-9: Semgrep Rules for Rust Observability

## Status: backlog

## Story

As a developer auditing a Rust project,
I want Semgrep to detect functions and error paths without tracing,
So that observability gaps are identified automatically.

## Acceptance Criteria

- [ ] AC1: Given a Rust function without `tracing::debug!`, `tracing::info!`, or `#[instrument]`, when Semgrep runs with `rust-function-no-tracing` rule, then it reports an observability gap <!-- verification: cli-verifiable -->
- [ ] AC2: Given a Rust `match` arm handling `Err` without `tracing::error!` or `tracing::warn!`, when Semgrep runs with `rust-catch-without-tracing` rule, then it reports an observability gap <!-- verification: cli-verifiable -->
- [ ] AC3: Given a Rust `.map_err()` or `.unwrap_or_else()` closure without tracing macros, when Semgrep runs with `rust-error-path-no-tracing` rule, then it reports an observability gap <!-- verification: cli-verifiable -->
- [ ] AC4: Given all 3 Rust rule files in `patches/observability/`, when `codeharness audit` runs on a Rust project with Semgrep installed, then the observability static analysis dimension uses the Rust rules automatically (Semgrep auto-discovers by `languages: [rust]`) <!-- verification: cli-verifiable -->

## Technical Notes

### Rule 1: Functions Without Tracing

File: `patches/observability/rust-function-no-tracing.yaml` (new).

Semgrep rule with `languages: [rust]`. Detects `fn` definitions that lack:
- `tracing::debug!(...)` or `tracing::info!(...)` calls inside the function body
- `#[tracing::instrument]` or `#[instrument]` attribute on the function

Follow the structure of existing JS/TS rules in `patches/observability/` (e.g., `function-no-logging.yaml` or similar). Use Semgrep pattern-not-inside and metavariable patterns.

Example Semgrep pattern structure:
```yaml
rules:
  - id: rust-function-no-tracing
    patterns:
      - pattern: |
          fn $FUNC(...) { ... }
      - pattern-not: |
          #[instrument]
          fn $FUNC(...) { ... }
      - pattern-not-inside: |
          fn $FUNC(...) {
            ...
            tracing::info!(...);
            ...
          }
      - pattern-not-inside: |
          fn $FUNC(...) {
            ...
            tracing::debug!(...);
            ...
          }
    message: "Function '$FUNC' has no tracing instrumentation"
    languages: [rust]
    severity: WARNING
    metadata:
      category: observability
```

### Rule 2: Err Match Arms Without Tracing

File: `patches/observability/rust-catch-without-tracing.yaml` (new).

Detects `Err(...)` match arms that don't call `tracing::error!()` or `tracing::warn!()`.

```yaml
rules:
  - id: rust-catch-without-tracing
    patterns:
      - pattern: |
          Err($E) => { ... }
      - pattern-not-inside: |
          Err($E) => {
            ...
            tracing::error!(...);
            ...
          }
      - pattern-not-inside: |
          Err($E) => {
            ...
            tracing::warn!(...);
            ...
          }
    message: "Error handling for '$E' has no tracing"
    languages: [rust]
    severity: WARNING
    metadata:
      category: observability
```

### Rule 3: Error Path Closures Without Tracing

File: `patches/observability/rust-error-path-no-tracing.yaml` (new).

Detects `.map_err(|..| { ... })` and `.unwrap_or_else(|..| { ... })` closures that don't include tracing macros.

```yaml
rules:
  - id: rust-error-path-no-tracing
    patterns:
      - pattern-either:
          - pattern: |
              $X.map_err(|$E| { ... })
          - pattern: |
              $X.unwrap_or_else(|$E| { ... })
      - pattern-not-inside: |
          $X.map_err(|$E| {
            ...
            tracing::error!(...);
            ...
          })
      - pattern-not-inside: |
          $X.unwrap_or_else(|$E| {
            ...
            tracing::error!(...);
            ...
          })
    message: "Error path closure has no tracing"
    languages: [rust]
    severity: WARNING
    metadata:
      category: observability
```

### Auto-Discovery

No code changes needed in `src/modules/observability/analyzer.ts`. The analyzer module auto-discovers all `.yaml` rules in `patches/observability/` and passes them to Semgrep. Semgrep filters rules by `languages` field — Rust rules will only apply to `.rs` files.

### Semgrep Rust Support

Semgrep has solid native Rust support for pattern matching. However, Rust's macro system means patterns may not catch all tracing variants (e.g., custom macros wrapping `tracing`). These rules cover standard `tracing` crate patterns only — custom macros are out of scope.

### Testing

These rules can be tested by running `semgrep scan --config patches/observability/ --include="*.rs"` against sample Rust files. Create simple test `.rs` fixtures with:
- A function with tracing (should NOT match)
- A function without tracing (should match rule 1)
- An Err match arm with tracing (should NOT match)
- An Err match arm without tracing (should match rule 2)
- A `.map_err` with tracing (should NOT match)
- A `.map_err` without tracing (should match rule 3)

## Files to Change

- `patches/observability/rust-function-no-tracing.yaml` (new) — Semgrep rule detecting Rust functions without `tracing` instrumentation or `#[instrument]` attribute
- `patches/observability/rust-catch-without-tracing.yaml` (new) — Semgrep rule detecting `Err` match arms without `tracing::error!`/`tracing::warn!`
- `patches/observability/rust-error-path-no-tracing.yaml` (new) — Semgrep rule detecting `.map_err()`/`.unwrap_or_else()` closures without tracing macros
