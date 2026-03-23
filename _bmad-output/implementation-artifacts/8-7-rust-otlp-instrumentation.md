# Story 8-7: Rust OTLP Instrumentation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer instrumenting a Rust project,
I want codeharness to add OpenTelemetry crates and provide setup guidance,
so that I can quickly enable observability.

## Acceptance Criteria

1. **AC1:** Given a Rust project, when `instrumentProject()` runs, then `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber` is executed and `packages_installed` returns `true` <!-- verification: cli-verifiable -->
2. **AC2:** Given OTLP instrumentation succeeds on a Rust project, when state is updated, then `configureOtlpEnvVars()` writes `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` to `.env.codeharness` <!-- verification: cli-verifiable -->
3. **AC3:** Given a Rust project, when `configureAgent()` is called, then it skips with info message (no standard Rust agent SDK yet) and does NOT install any packages or set `agent_sdk` in state <!-- verification: cli-verifiable -->
4. **AC4:** Given `templates/otlp/rust.md` exists, when read, then it contains: packages to add (`cargo add` command), `tracing_subscriber` setup code snippet, `#[tracing::instrument]` usage, environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`), and verification steps <!-- verification: cli-verifiable -->
5. **AC5:** Given `installRustOtlp()` is called and `cargo add` fails, then it returns `{ status: 'failed', packages_installed: false }` with an error message <!-- verification: cli-verifiable -->
6. **AC6:** Given a Rust project, when `instrumentProject()` runs in non-json mode, then it prints an info message about Rust OTLP packages being installed <!-- verification: cli-verifiable -->
7. **AC7:** Given all changes, when `npm test` runs, then all existing tests pass with zero regressions and new Rust OTLP tests pass <!-- verification: cli-verifiable -->
8. **AC8:** Given `codeharness init` runs on a Rust project, when the OTLP instrumentation phase executes, then it runs `cargo add` for the OTLP crates (not just env vars) <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Add `RUST_OTLP_PACKAGES` constant and `installRustOtlp()` function to `src/lib/otlp.ts` (AC: #1, #5)
  - [x]1.1 Add `const RUST_OTLP_PACKAGES = ['opentelemetry', 'opentelemetry-otlp', 'tracing-opentelemetry', 'tracing-subscriber'];` after `PYTHON_OTLP_PACKAGES`
  - [x]1.2 Create `installRustOtlp(projectDir: string): OtlpResult` following `installNodeOtlp()` pattern
  - [x]1.3 Run `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber` via `execFileSync`
  - [x]1.4 Return `{ status: 'configured', packages_installed: true, ... }` on success
  - [x]1.5 Return `{ status: 'failed', packages_installed: false, error: '...' }` on failure with truncated error message
- [x] Task 2: Update `instrumentProject()` Rust branch to call `installRustOtlp()` (AC: #1, #6)
  - [x]2.1 Replace the current placeholder Rust branch (L318-329) with actual `installRustOtlp()` call
  - [x]2.2 On success, print `ok('OTLP: Rust packages installed')` in non-json mode
  - [x]2.3 On failure, the existing error handling path covers it (L369-371)
- [x] Task 3: Add `OTEL_EXPORTER_OTLP_ENDPOINT` to `.env.codeharness` for Rust (AC: #2)
  - [x]3.1 In `configureOtlpEnvVars()`, after calling `ensureServiceNameEnvVar()`, add Rust-specific logic to also write `OTEL_EXPORTER_OTLP_ENDPOINT` to `.env.codeharness` (Rust reads env vars directly, unlike Node.js `--require` or Python wrapper)
  - [x]3.2 Use same file append/update pattern as `ensureServiceNameEnvVar()`
- [x] Task 4: Add Rust case to `configureAgent()` — skip with info (AC: #3)
  - [x]4.1 Add `else if (stack === 'rust')` branch after the Python branch (L227)
  - [x]4.2 Log info message: `info('Rust agent SDK not yet supported — skipping agent configuration')`
  - [x]4.3 Return early — do NOT set `agent_sdk` in state (no Rust agent SDK exists)
- [x] Task 5: Create `templates/otlp/rust.md` (AC: #4)
  - [x]5.1 Follow pattern of `templates/otlp/nodejs.md` (54 lines) and `templates/otlp/python.md` (52 lines)
  - [x]5.2 Section: Packages to Install — `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber`
  - [x]5.3 Section: Setup Code — `tracing_subscriber` initialization with OTLP exporter layer in `main.rs`
  - [x]5.4 Section: Function Instrumentation — `#[tracing::instrument]` attribute usage
  - [x]5.5 Section: Environment Variables — `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, etc.
  - [x]5.6 Section: Verification — How to confirm traces are being exported
- [x] Task 6: Add tests in `src/lib/__tests__/otlp.test.ts` (AC: #1, #2, #3, #5, #6, #7)
  - [x]6.1 Test: `installRustOtlp()` success — runs `cargo add` with correct packages
  - [x]6.2 Test: `installRustOtlp()` failure — returns failed status with error message
  - [x]6.3 Test: `instrumentProject()` with stack `'rust'` — calls `cargo add` and returns `packages_installed: true`
  - [x]6.4 Test: `instrumentProject()` Rust prints info message in non-json mode
  - [x]6.5 Test: `configureOtlpEnvVars()` with stack `'rust'` — writes `OTEL_EXPORTER_OTLP_ENDPOINT` to `.env.codeharness`
  - [x]6.6 Test: `configureAgent()` with stack `'rust'` — skips without installing packages or setting agent_sdk
  - [x]6.7 Test: `installRustOtlp()` truncates long error messages
- [x] Task 7: Run full test suite — zero regressions (AC: #7)

## Dev Notes

### Current State of Rust in otlp.ts

The `instrumentProject()` function already has a Rust branch (added in story 8-2 or earlier), but it's a **placeholder** that does NOT call `cargo add`:

```typescript
} else if (stack === 'rust') {
    // Rust OTLP package installation is story 8-7.
    // For now, configure env vars and state hint only.
    result = {
      status: 'configured',
      packages_installed: false,  // <-- NOT INSTALLED
      start_script_patched: false,
      env_vars_configured: false,
    };
```

This story replaces that placeholder with a real `installRustOtlp()` call.

### configureOtlpEnvVars Already Has Rust Branch

The `configureOtlpEnvVars()` function already handles `stack === 'rust'` — it sets `rust_env_hint: 'OTEL_EXPORTER_OTLP_ENDPOINT'` in state (added by story 8-2). However, it does NOT write `OTEL_EXPORTER_OTLP_ENDPOINT` to `.env.codeharness`. This story adds that.

The current `ensureServiceNameEnvVar()` only writes `OTEL_SERVICE_NAME`. For Rust projects, we also need `OTEL_EXPORTER_OTLP_ENDPOINT` in `.env.codeharness` because Rust apps read env vars directly (unlike Node.js which uses `--require` flag or Python which uses `opentelemetry-instrument` wrapper).

### configureAgent Does Not Have Rust Branch

The `configureAgent()` function currently handles `'nodejs'` and `'python'` stacks. Any other stack (including `'rust'`) falls through and always sets `agent_sdk: 'traceloop'` in state — which is incorrect for Rust. This story adds an explicit Rust branch that skips and returns early.

### Test Patterns

Existing tests use:
- `vi.mock('node:child_process')` at module level
- Real temp directories via `mkdtempSync`
- `initState()` / `initStateWithOtlp()` helpers
- `mockExecFileSync` for verifying command invocations

### File Line Budget

`src/lib/otlp.ts` is currently 375 lines. Adding `RUST_OTLP_PACKAGES` (1 line), `installRustOtlp()` (~20 lines), Rust `configureAgent` branch (~4 lines), and env file writing (~10 lines) puts it at ~410 lines. This may exceed the 300-line limit from NFR1. If so, consider extracting `ensureServiceNameEnvVar` and the new endpoint helper into a small `otlp-env.ts` module, or accept the overage since `otlp.ts` was already at 330+ lines before this sprint.

### Architecture Constraints

- **No new npm dependencies**: Pure TypeScript, uses `execFileSync` from `node:child_process`
- **NFR5**: Follows existing `OtlpResult` return pattern
- **cargo add**: Adds all packages in one command (not one-by-one). If `cargo` is not available, `execFileSync` throws and the error is caught.

### References

- [Source: src/lib/otlp.ts — current OTLP module with Rust placeholder at L318-329]
- [Source: src/lib/otlp.ts#L207-227 — configureAgent() without Rust branch]
- [Source: src/lib/otlp.ts#L258-286 — configureOtlpEnvVars() with Rust state hint]
- [Source: src/lib/otlp.ts#L46-65 — installNodeOtlp() pattern to follow]
- [Source: src/lib/__tests__/otlp.test.ts — existing test patterns]
- [Source: templates/otlp/nodejs.md — 54-line Node.js guidance doc pattern]
- [Source: templates/otlp/python.md — 52-line Python guidance doc pattern]
- [Source: _bmad-output/planning-artifacts/epics-rust-stack-support.md#Story8-7 — epic definition]
- [Source: _bmad-output/implementation-artifacts/tech-spec-rust-stack-support.md#Task4-5 — tech spec tasks]

### Previous Story Intelligence (8-6)

- 8-6 added Rust to `ProjectType`, `detectProjectType()`, `resolveDockerfileTemplate()`, and `buildVerifyImage()` in the verify module — no file overlap with this story.
- 8-6 confirmed 2998 tests pass, zero regressions.
- configureOtlpEnvVars Rust test already exists in otlp.test.ts (L242-253) — added by earlier story. New tests should not duplicate it.

### Git Intelligence

Recent commits: f33294b (8-6 verified), 79f3449 (8-5 verified), 4e805b9 (8-4 verified), ebaddac (8-3 verified), d6a76bf (8-2 verified).
This story touches `src/lib/otlp.ts`, `src/lib/__tests__/otlp.test.ts`, and `templates/otlp/rust.md` — clean isolation from previous stories.

### Do NOT Create

- Do NOT modify `configureOtlpEnvVars()` Rust state hint — already done in 8-2
- Do NOT create Semgrep rules for Rust (that's story 8-9)
- Do NOT modify docs scaffolding (that's story 8-8)
- Do NOT modify stack detection (that's story 8-1, already done)

### Project Structure Notes

Files to create:
- `templates/otlp/rust.md` — LLM guidance doc for Rust OTLP instrumentation

Files to modify:
- `src/lib/otlp.ts` — Add `RUST_OTLP_PACKAGES`, `installRustOtlp()`, update `instrumentProject()` Rust branch, add Rust to `configureAgent()`, add endpoint env var writing for Rust
- `src/lib/__tests__/otlp.test.ts` — Add Rust OTLP test cases

Files for reference only (do NOT modify):
- `templates/otlp/nodejs.md` — Pattern for guidance doc
- `templates/otlp/python.md` — Pattern for guidance doc

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-7-rust-otlp-instrumentation.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-7-rust-otlp-instrumentation.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
