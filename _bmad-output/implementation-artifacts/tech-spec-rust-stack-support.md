---
title: 'Full Rust Stack Support'
slug: 'rust-stack-support'
created: '2026-03-23'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['typescript', 'rust', 'vitest', 'semgrep']
files_to_modify:
  - src/lib/stack-detect.ts
  - src/lib/otlp.ts
  - src/lib/coverage.ts
  - src/lib/state.ts
  - src/modules/infra/dockerfile-template.ts
  - src/modules/infra/docs-scaffold.ts
  - src/commands/init.ts
  - src/modules/infra/init-project.ts
  - src/modules/observability/analyzer.ts
  - src/lib/deps.ts
files_to_create:
  - templates/otlp/rust.md
  - templates/Dockerfile.verify.rust
  - patches/observability/rust-function-no-tracing.yaml
  - patches/observability/rust-catch-without-tracing.yaml
  - patches/observability/rust-error-path-no-tracing.yaml
code_patterns:
  - 'if/else on stack === "nodejs" | "python" — add "rust" branch at each'
  - 'Per-stack install/patch/detect functions: installNodeOtlp(), installPythonOtlp() → add installRustOtlp()'
  - 'Cargo.toml TOML parsing for app type and dependency detection'
test_patterns:
  - 'Mirror existing stack-detect.test.ts patterns for Rust cases'
  - 'Mirror otlp.test.ts patterns with Cargo.toml fixtures'
  - 'Mirror coverage.test.ts patterns with tarpaulin JSON fixtures'
---

# Tech-Spec: Full Rust Stack Support

**Created:** 2026-03-23

## Overview

### Problem Statement

Codeharness supports Node.js and Python across stack detection, OTLP instrumentation, coverage tools, Dockerfile generation, Semgrep rules, and docs scaffolding. Rust projects get `null` stack and no harness features. ~25 language-conditional code paths need Rust branches.

### Solution

Add Rust as a first-class stack at parity with TypeScript/Python. Use `cargo-tarpaulin` for coverage, `opentelemetry`/`opentelemetry-otlp` crates for OTLP, basic scaffolding + LLM guidance for instrumentation, and Semgrep Rust rules for observability static analysis. Treat workspaces (`[workspace]`) as single projects.

### Scope

**In Scope:**
- Stack detection (`Cargo.toml`, `[workspace]` support)
- App type detection (CLI/library/server via Cargo.toml parsing)
- Dockerfile generation (`rustTemplate()`)
- Verification Dockerfile (`Dockerfile.verify.rust`)
- OTLP dependency addition + config + LLM guidance docs
- Coverage tool detection (`cargo-tarpaulin`)
- Coverage report parsing (tarpaulin JSON format)
- Semgrep rules for Rust observability patterns
- Docs scaffolding (AGENTS.md, build commands)
- State file support (`rust` stack, `cargo-tarpaulin` tool)
- Tests for all new code paths

**Out of Scope:**
- Full auto-instrumentation code generation (LLM handles this via guidance docs)
- Per-crate workspace enumeration (treat workspace as single project)
- New observability backends
- Custom verification strategies

## Context for Development

### Codebase Patterns

- All stack-conditional logic uses `if (stack === 'nodejs') { ... } else if (stack === 'python') { ... }` — add `else if (stack === 'rust') { ... }` at each location
- Per-stack functions follow naming convention: `installNodeOtlp()`, `installPythonOtlp()` → add `installRustOtlp()`
- Coverage detection follows: `detectNodeCoverageTool()`, `detectPythonCoverageTool()` → add `detectRustCoverageTool()`
- Dockerfile templates follow: `nodejsTemplate()`, `pythonTemplate()` → add `rustTemplate()`
- OTLP templates are static markdown files in `templates/otlp/{stack}.md`
- Tests mirror source structure: `src/lib/__tests__/`, `src/modules/infra/__tests__/`

### Files to Reference

| File | Purpose | Lines | Rust Touchpoints |
| ---- | ------- | ----- | ---------------- |
| `src/lib/stack-detect.ts` | Stack detection + app type detection | 146 | `detectStack()` L7-14, `detectAppType()` L72-145, add Rust dep constants |
| `src/lib/otlp.ts` | OTLP instrumentation per stack | ~330 | `installRustOtlp()` new fn, `instrumentProject()` L295, `configureOtlpEnvVars()` L258-274, `configureAgent()` L207-227 |
| `src/lib/coverage.ts` | Coverage tool detection + report parsing | ~400 | `detectCoverageTool()` L35-53, `detectRustCoverageTool()` new fn, `parseTarpaulinCoverage()` new fn, `parseCoverageReport()` L257, `parseTestCounts()` L308 add cargo test format, `CoverageToolInfo.tool` type union |
| `src/lib/state.ts` | HarnessState interface | — | `coverage.tool` type, `otlp.rust_env_hint` field |
| `src/modules/infra/dockerfile-template.ts` | Dockerfile generation per stack | 119 | `rustTemplate()` new fn, `generateDockerfileTemplate()` L99-108 |
| `src/modules/infra/docs-scaffold.ts` | AGENTS.md + docs generation | 197 | `getStackLabel()` L32-36, `getCoverageTool()` L38-41, `generateAgentsMdContent()` L43-98 |
| `src/modules/observability/analyzer.ts` | Semgrep static analysis runner | ~150 | No code changes — Semgrep auto-discovers `.yaml` rules by language |
| `src/lib/deps.ts` | Dependency registry | ~100 | Add `cargo-tarpaulin` to `DEPENDENCY_REGISTRY` |
| `patches/observability/*.yaml` | Semgrep rules (JS/TS) | 3 files | Create 3 new Rust-specific YAML rules |
| `templates/otlp/nodejs.md` | Node.js OTLP guide | 54 | Pattern for `templates/otlp/rust.md` |
| `templates/otlp/python.md` | Python OTLP guide | 52 | Pattern for `templates/otlp/rust.md` |
| `templates/Dockerfile.verify` | Node.js verification Dockerfile | — | Pattern for `templates/Dockerfile.verify.rust` |

### Technical Decisions

- **Cargo.toml parsing:** Use `readTextSafe()` (already in stack-detect.ts) + simple string matching / regex on TOML content. No TOML parser dependency. Check for `[workspace]`, `[[bin]]`, `[lib]`, and known framework deps in `[dependencies]`.
- **Workspace handling:** Treat as single project. Use `--workspace` flag for `cargo test` and `cargo tarpaulin`. Detect via `[workspace]` section in root `Cargo.toml`.
- **OTLP approach:** Add `opentelemetry` + `opentelemetry-otlp` + `tracing-opentelemetry` crates via `cargo add`. Provide LLM guidance doc (`templates/otlp/rust.md`) explaining how to wire up `tracing` subscriber with OTLP exporter layer. Basic scaffolding only — LLM handles actual instrumentation.
- **Coverage:** `cargo-tarpaulin` with `--out Json` output. Parse `tarpaulin-report.json` for line coverage. Tarpaulin JSON format: `{ "files": [...], "coverage": 85.5 }` — top-level `coverage` field is the overall percentage.
- **Semgrep Rust rules:** Create 3 rules in `patches/observability/` with `languages: [rust]`:
  - `rust-function-no-tracing.yaml` — functions without `tracing::debug!`/`tracing::info!`/`#[instrument]`
  - `rust-catch-without-tracing.yaml` — `Err` match arms without `tracing::error!`/`tracing::warn!`
  - `rust-error-path-no-tracing.yaml` — `.unwrap_or_else`/`.map_err` without tracing
- **Dockerfile base:** Multi-stage build. Build stage: `rust:1.82-slim`, compile with `cargo build --release`. Runtime stage: `debian:bookworm-slim`, copy binary only. Add `curl`, `jq` for verification.
- **CoverageToolInfo type expansion:** Change `tool: 'c8' | 'coverage.py' | 'unknown'` to `tool: 'c8' | 'coverage.py' | 'cargo-tarpaulin' | 'unknown'`.
- **Rust app type detection constants:**
  - `RUST_WEB_FRAMEWORKS = ['actix-web', 'axum', 'rocket', 'tide', 'warp']`
  - `RUST_AGENT_DEPS = ['async-openai', 'anthropic', 'llm-chain']`
  - Detect CLI: `[[bin]]` without web framework deps
  - Detect library: `[lib]` section present, no `[[bin]]`
  - Detect server: web framework dep present
- **cargo-tarpaulin in dependency registry:** Add to `DEPENDENCY_REGISTRY` in `deps.ts` with `cargo install cargo-tarpaulin` as install command, `cargo tarpaulin --version` as check command, `critical: false`.
- **Test output parsing:** `cargo test` output format: `test result: ok. 42 passed; 0 failed; 0 ignored` — add regex to `parseTestCounts()`.

## Implementation Plan

### Tasks

Tasks ordered by dependency — foundation first, then consumers.

- [ ] Task 1: Stack detection — add Rust to `detectStack()` and `detectAppType()`
  - File: `src/lib/stack-detect.ts`
  - Action: Add `if (existsSync(join(dir, 'Cargo.toml'))) return 'rust';` after Python checks in `detectStack()` (L11). Add Rust constants `RUST_WEB_FRAMEWORKS`, `RUST_AGENT_DEPS`. Add `if (stack === 'rust') { ... }` block in `detectAppType()` after Python block (L142). Implement `getCargoContent()` helper using `readTextSafe()`. Parse `Cargo.toml` text for `[[bin]]`, `[lib]`, `[workspace]`, and dependency names. Priority order: agent → server (web framework) → CLI (`[[bin]]`) → library (`[lib]`) → generic.
  - Notes: Use `readTextSafe()` already in file. Simple string matching for TOML sections — no TOML parser. For `[workspace]` projects, still return the detected app type based on root deps.

- [ ] Task 2: Coverage tool detection — add `cargo-tarpaulin`
  - File: `src/lib/coverage.ts`
  - Action: Expand `CoverageToolInfo.tool` type union to include `'cargo-tarpaulin'`. Add `if (stack === 'rust') { return detectRustCoverageTool(baseDir); }` in `detectCoverageTool()` (L47). Create `detectRustCoverageTool()` — check for `Cargo.toml`, check if `cargo-tarpaulin` is present (try `cargo tarpaulin --version`), return `{ tool: 'cargo-tarpaulin', runCommand: 'cargo tarpaulin --out json --output-dir coverage/', reportFormat: 'tarpaulin-json' }`. For workspace projects, add `--workspace` flag. Create `parseTarpaulinCoverage()` — read `coverage/tarpaulin-report.json`, extract top-level `coverage` field (float 0-100). Add `'tarpaulin-json'` case to `parseCoverageReport()`. Add `cargo test` regex to `parseTestCounts()`: `/test result: ok\. (\d+) passed; (\d+) failed/`.
  - Notes: Detect workspace by checking `Cargo.toml` for `[workspace]`. If tarpaulin not installed, return `tool: 'unknown'` with warning.

- [ ] Task 3: Dockerfile template — add `rustTemplate()`
  - File: `src/modules/infra/dockerfile-template.ts`
  - Action: Create `rustTemplate()` function returning multi-stage Dockerfile string. Build stage: `FROM rust:1.82-slim AS builder`, `WORKDIR /build`, `COPY . .`, `RUN cargo build --release`. Runtime stage: `FROM debian:bookworm-slim`, `RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*`, `COPY --from=builder /build/target/release/<binary> /usr/local/bin/`, `USER nobody`, `WORKDIR /workspace`. Add `else if (stack === 'rust')` in `generateDockerfileTemplate()` (L102).
  - Notes: Use `<binary>` placeholder — user must replace with their binary name. Add comment in template.

- [ ] Task 4: OTLP instrumentation — add Rust support
  - File: `src/lib/otlp.ts`
  - Action: Add `RUST_OTLP_PACKAGES = ['opentelemetry', 'opentelemetry-otlp', 'tracing-opentelemetry', 'tracing-subscriber']`. Create `installRustOtlp()` — runs `cargo add` for each package. Add `else if (stack === 'rust')` in `instrumentProject()` (L309). In `configureOtlpEnvVars()` (L268), add Rust case: `{ rust_env_hint: 'OTEL_EXPORTER_OTLP_ENDPOINT' }` to state. In `configureAgent()` (L207), add Rust case — no standard agent SDK for Rust yet, so skip with info message.
  - Notes: `cargo add` adds to `Cargo.toml [dependencies]`. Must run from project root. If `cargo add` fails (not in a cargo project), return failed status.

- [ ] Task 5: OTLP guidance doc — create `templates/otlp/rust.md`
  - File: `templates/otlp/rust.md` (new)
  - Action: Create LLM guidance doc following pattern of `nodejs.md`/`python.md`. Include: packages to add (`cargo add ...`), code snippet for setting up `tracing_subscriber` with OTLP layer in `main.rs`, `#[tracing::instrument]` attribute usage for functions, environment variables (same as Node/Python: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`), verification steps.
  - Notes: This is guidance for the LLM, not auto-generated code. Keep it concise and practical.

- [ ] Task 6: Docs scaffolding — add Rust to AGENTS.md and labels
  - File: `src/modules/infra/docs-scaffold.ts`
  - Action: Add `if (stack === 'rust') return 'Rust (Cargo.toml)';` in `getStackLabel()` (L34). Add `if (stack === 'rust') return 'cargo-tarpaulin';` in `getCoverageTool()` (L40). Add Rust case in `generateAgentsMdContent()` (L66): `cargo build`, `cargo test`, `cargo tarpaulin --out json`. Update `getProjectName()` to read `[package] name = "..."` from `Cargo.toml` if no `package.json`.
  - Notes: `getProjectName()` currently only reads `package.json`. For Rust, parse `Cargo.toml` for `name = "..."` in `[package]` section.

- [ ] Task 7: Dependency registry — add `cargo-tarpaulin`
  - File: `src/lib/deps.ts`
  - Action: Add to `DEPENDENCY_REGISTRY`: `{ name: 'cargo-tarpaulin', displayName: 'cargo-tarpaulin', installCommands: [{ cmd: 'cargo', args: ['install', 'cargo-tarpaulin'] }], checkCommand: { cmd: 'cargo', args: ['tarpaulin', '--version'] }, critical: false }`.
  - Notes: Only relevant for Rust projects. The init pipeline should only install this for Rust stacks.

- [ ] Task 8: Semgrep rules — create Rust observability rules
  - Files: `patches/observability/rust-function-no-tracing.yaml`, `rust-catch-without-tracing.yaml`, `rust-error-path-no-tracing.yaml` (all new)
  - Action: Create 3 Semgrep YAML rules with `languages: [rust]`. Rule 1: functions without `tracing::debug!`/`tracing::info!`/`#[instrument]`. Rule 2: `Err(...)` match arms without `tracing::error!`/`tracing::warn!`. Rule 3: `.map_err()`/`.unwrap_or_else()` closures without tracing macros. Follow structure of existing JS/TS rules.
  - Notes: Semgrep's Rust support is solid for pattern matching. The analyzer module auto-discovers rules by scanning `patches/observability/` — no code changes needed in `analyzer.ts`.

- [ ] Task 9: Verification Dockerfile — create Rust variant
  - File: `templates/Dockerfile.verify.rust` (new)
  - Action: Create verification environment Dockerfile for Rust projects. Base: `rust:1.82-slim`. Install: Python + pipx + Semgrep (for static analysis), showboat (for proof docs), curl + jq. Configure OTLP env vars. Install `cargo-tarpaulin`. Pattern: follow existing `Dockerfile.verify` but replace Node.js tooling with Rust tooling.
  - Notes: Semgrep requires Python, so Python is needed even in Rust verification images.

- [ ] Task 10: State type — expand for Rust
  - File: `src/lib/state.ts`
  - Action: Ensure `HarnessState.coverage.tool` type accepts `'cargo-tarpaulin'`. Add optional `rust_env_hint?: string` to OTLP state section. No breaking changes — all additions are optional fields.
  - Notes: Minimal change. The state file is YAML frontmatter in `.claude/codeharness.local.md`.

- [ ] Task 11: Tests — full coverage for all new code
  - Files: `src/lib/__tests__/stack-detect.test.ts`, `src/lib/__tests__/coverage.test.ts`, `src/lib/__tests__/otlp.test.ts`, `src/modules/infra/__tests__/dockerfile-template.test.ts`, `src/modules/infra/__tests__/docs-scaffold.test.ts`, `src/lib/__tests__/deps.test.ts`
  - Action: Add Rust test cases mirroring existing Node.js/Python patterns. Stack detection: `Cargo.toml` exists → returns `'rust'`, workspace detection, app type detection (CLI/server/library/agent). Coverage: tarpaulin detection, tarpaulin JSON parsing, workspace `--workspace` flag, `cargo test` output parsing. OTLP: `installRustOtlp()` success/failure, env var config. Dockerfile: `rustTemplate()` content, multi-stage build. Docs: stack label, coverage tool name, build commands. Deps: cargo-tarpaulin registry entry.
  - Notes: Use `vi.mock('node:fs')` and `vi.mock('node:child_process')` patterns from existing tests. Create `Cargo.toml` fixtures with various configurations.

### Acceptance Criteria

- [ ] AC1: Given a project with `Cargo.toml`, when `codeharness init` runs, then stack is detected as `'rust'` and displayed as `Rust (Cargo.toml)`
- [ ] AC2: Given a Rust project with `[[bin]]` in Cargo.toml, when `detectAppType()` is called, then it returns `'cli'`
- [ ] AC3: Given a Rust project with `axum` in dependencies, when `detectAppType()` is called, then it returns `'server'`
- [ ] AC4: Given a Rust project with `[workspace]` in Cargo.toml, when coverage runs, then `--workspace` flag is included in the tarpaulin command
- [ ] AC5: Given a Rust project, when `generateDockerfileTemplate()` is called, then it produces a multi-stage Dockerfile with `rust:1.82-slim` builder and `debian:bookworm-slim` runtime
- [ ] AC6: Given a Rust project, when OTLP instrumentation runs, then `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber` is executed
- [ ] AC7: Given a Rust project with `cargo-tarpaulin` installed, when `detectCoverageTool()` is called, then it returns `{ tool: 'cargo-tarpaulin', runCommand: 'cargo tarpaulin ...', reportFormat: 'tarpaulin-json' }`
- [ ] AC8: Given a `tarpaulin-report.json` file with `"coverage": 85.5`, when `parseCoverageReport()` is called, then it returns `85.5`
- [ ] AC9: Given `cargo test` output `test result: ok. 42 passed; 3 failed; 0 ignored`, when `parseTestCounts()` is called, then it returns `{ passCount: 42, failCount: 3 }`
- [ ] AC10: Given a Rust project, when `generateAgentsMdContent()` is called, then it includes `cargo build`, `cargo test`, and `cargo tarpaulin` commands
- [ ] AC11: Given Semgrep is installed, when observability analysis runs on a Rust project, then `rust-function-no-tracing` rule detects functions without tracing
- [ ] AC12: Given a Rust project, when docs scaffolding runs, then `getCoverageTool()` returns `'cargo-tarpaulin'` and `getStackLabel()` returns `'Rust (Cargo.toml)'`
- [ ] AC13: Given no `Cargo.toml` exists, when `detectStack()` runs, then Rust is NOT detected (no false positives)
- [ ] AC14: Given all Rust features are implemented, when `npm test` runs, then all existing tests pass with 0 regressions and new Rust tests pass

## Additional Context

### Dependencies

- **cargo-tarpaulin**: Must be installable via `cargo install cargo-tarpaulin` on the target machine. Not required at codeharness build time — only at runtime on Rust projects.
- **Semgrep Rust support**: Semgrep supports Rust natively. No additional plugins needed. Rules use `languages: [rust]`.
- **No new npm dependencies**: All changes are internal to existing modules. No new packages added to codeharness itself.

### Testing Strategy

- **Unit tests**: Mock `fs.existsSync`, `fs.readFileSync`, `child_process.execFileSync` to simulate Rust project structures. Create `Cargo.toml` content fixtures for: plain binary, library, workspace, web framework project, agent project.
- **Integration tests**: None required — the init pipeline integration is already tested generically. Adding Rust to existing integration patterns is sufficient.
- **Manual testing**: Run `codeharness init` in a real Rust project (e.g., `cargo new test-project`) and verify all features work end-to-end.
- **Regression safety**: Run full test suite (`npm test`) after each task to catch breakage immediately. Target: 0 regressions.

### Notes

- **Cargo.toml parsing is intentionally simple**: Using regex/string matching avoids adding a TOML parser dependency. This works for the patterns we need (`[[bin]]`, `[lib]`, `[workspace]`, dependency names). If more complex parsing is needed later, consider adding the `toml` npm package.
- **No auto-instrumentation for Rust**: Unlike Node.js (auto-instrumentation via `--require`) and Python (`opentelemetry-instrument` wrapper), Rust requires explicit code changes to set up tracing. The guidance doc in `templates/otlp/rust.md` gives the LLM what it needs to instrument the project.
- **Semgrep Rust rule quality**: Rust's macro system means Semgrep patterns may not catch all tracing variants (e.g., custom macros wrapping `tracing`). The rules cover standard `tracing` crate patterns. Custom macros are out of scope.
- **Future consideration**: Go and Java support would follow the same pattern. The architecture is now proven for 3 languages.
