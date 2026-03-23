# Story 8-7: Rust OTLP Instrumentation

## Status: backlog

## Story

As a developer instrumenting a Rust project,
I want codeharness to add OpenTelemetry crates and provide setup guidance,
So that I can quickly enable observability.

## Acceptance Criteria

- [ ] AC1: Given a Rust project, when `instrumentProject()` runs, then `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber` is executed <!-- verification: cli-verifiable -->
- [ ] AC2: Given OTLP instrumentation succeeds, when state is updated, then `configureOtlpEnvVars()` writes `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` to `.env.codeharness` <!-- verification: cli-verifiable -->
- [ ] AC3: Given a Rust project, when `configureAgent()` is called, then it skips with info message (no standard Rust agent SDK yet) <!-- verification: cli-verifiable -->
- [ ] AC4: Given `templates/otlp/rust.md` exists, when read, then it contains: packages to add, `tracing_subscriber` setup code snippet, `#[tracing::instrument]` usage, env vars, verification steps <!-- verification: cli-verifiable -->

## Technical Notes

### OTLP Crate Installation

File: `src/lib/otlp.ts` — ~330 lines.

Add constant at module level:
```typescript
const RUST_OTLP_PACKAGES = ['opentelemetry', 'opentelemetry-otlp', 'tracing-opentelemetry', 'tracing-subscriber'];
```

Create `installRustOtlp(baseDir: string)` function:
1. Run `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber` from project root
2. Follow the pattern of existing `installNodeOtlp()` and `installPythonOtlp()` functions
3. If `cargo add` fails (not in a cargo project), return failed status

### instrumentProject() Integration

File: `src/lib/otlp.ts` — `instrumentProject()` at L295 (approx L309 per tech spec).

Add `else if (stack === 'rust')` branch that calls `installRustOtlp()`.

### Environment Variable Configuration

File: `src/lib/otlp.ts` — `configureOtlpEnvVars()` at L258-274.

Add Rust case: write `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` to `.env.codeharness`. Store `{ rust_env_hint: 'OTEL_EXPORTER_OTLP_ENDPOINT' }` in state (requires story 8-2 state type expansion).

### Agent Configuration

File: `src/lib/otlp.ts` — `configureAgent()` at L207-227.

Add Rust case: no standard agent SDK for Rust yet. Skip with info message (e.g., `log.info('Rust agent SDK not yet supported — skipping agent configuration')`).

### LLM Guidance Document

File: `templates/otlp/rust.md` (new).

Follow the pattern of `templates/otlp/nodejs.md` (54 lines) and `templates/otlp/python.md` (52 lines). Include:
1. **Packages to add**: `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber`
2. **Setup code snippet**: `tracing_subscriber` initialization with OTLP exporter layer in `main.rs`
3. **Function instrumentation**: `#[tracing::instrument]` attribute usage
4. **Environment variables**: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`
5. **Verification steps**: How to confirm traces are being exported

This is guidance for the LLM, not auto-generated code. Keep concise and practical.

### Tests

File: `src/lib/__tests__/otlp.test.ts`

Mirror existing Node.js/Python test patterns with `vi.mock('node:child_process')`. Test cases:
- `installRustOtlp()` success → runs `cargo add` with correct packages
- `installRustOtlp()` failure → returns failed status
- `instrumentProject()` with stack `'rust'` → calls `installRustOtlp()`
- `configureOtlpEnvVars()` with stack `'rust'` → writes env vars
- `configureAgent()` with stack `'rust'` → skips with info message

## Files to Change

- `src/lib/otlp.ts` — Add `RUST_OTLP_PACKAGES` constant, add `installRustOtlp()` function, add Rust branch to `instrumentProject()` (L309), add Rust case to `configureOtlpEnvVars()` (L268), add Rust case to `configureAgent()` (L207)
- `templates/otlp/rust.md` (new) — Create LLM guidance doc for Rust OTLP instrumentation with setup code, attribute usage, env vars, and verification steps
- `src/lib/__tests__/otlp.test.ts` — Add Rust OTLP test cases for installation, instrumentation, env vars, and agent config skip
