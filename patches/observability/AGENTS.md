# patches/observability/ — Semgrep Rules for Observability Gap Detection

Standalone Semgrep YAML rules for static analysis of observability gaps. Each `.yaml` file is a complete Semgrep config — no build step, no TypeScript. Deleting a rule file removes that check.

## Rules

### JavaScript / TypeScript

| File | Purpose | Severity |
|------|---------|----------|
| catch-without-logging.yaml | Detects catch blocks without error/warn logging | WARNING |
| function-no-debug-log.yaml | Detects functions without debug/info logging | INFO |
| error-path-no-log.yaml | Detects error paths (throw/return err) without preceding log | WARNING |

### Rust

| File | Purpose | Severity |
|------|---------|----------|
| rust-function-no-tracing.yaml | Detects Rust functions without tracing instrumentation | INFO |
| rust-catch-without-tracing.yaml | Detects Rust error match arms without tracing | WARNING |
| rust-error-path-no-tracing.yaml | Detects Rust error-path closures (map_err/unwrap_or_else) without tracing | WARNING |

## Test Fixtures

### JavaScript / TypeScript

| File | Purpose |
|------|---------|
| catch-without-logging.ts | Test cases for catch-without-logging rule (annotated with `// ruleid:` / `// ok:`) |
| function-no-debug-log.ts | Test cases for function-no-debug-log rule |
| error-path-no-log.ts | Test cases for error-path-no-log rule |

### Rust

| File | Purpose |
|------|---------|
| rust-function-no-tracing.rs | Test cases for rust-function-no-tracing rule |
| rust-catch-without-tracing.rs | Test cases for rust-catch-without-tracing rule |
| rust-error-path-no-tracing.rs | Test cases for rust-error-path-no-tracing rule |

## Testing

Run `semgrep --test patches/observability/` to execute all test fixtures against their rules.

## Customization

Edit YAML rules to add custom logger patterns (e.g., `logger.error(...)` for winston). Rules use `pattern-not` / `pattern-not-inside` to detect absence of logging.
