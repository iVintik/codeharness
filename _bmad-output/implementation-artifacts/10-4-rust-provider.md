# Story 10-4: Implement RustProvider
<!-- verification-tier: unit-testable -->

## Status: done

## Story

As a developer,
I want all Rust-specific logic in one file,
So that Rust behavior is encapsulated and testable in isolation.

## Acceptance Criteria

- [x] AC1: Given `src/lib/stacks/rust.ts` exists, when inspected, then it implements all `StackProvider` methods for Rust: `detectAppType()` (agent/server/cli/generic from Cargo.toml `[dependencies]` section parsing, `[[bin]]`, `[lib]`), `getCoverageTool()` (returns `'tarpaulin'`), `detectCoverageConfig()` (checks for cargo-tarpaulin availability and workspace flag), `getOtlpPackages()` (returns `['opentelemetry', 'opentelemetry-otlp', 'tracing-opentelemetry', 'tracing-subscriber']`), `installOtlp()` (runs `cargo add` for all OTLP deps), `getDockerfileTemplate()` (multi-stage builder+runtime Dockerfile with rust:1.82-slim and debian:bookworm-slim), `getDockerBuildStage()` (returns `FROM rust:1.82-slim AS build-rust` stage), `getRuntimeCopyDirectives()` (returns `COPY --from=build-rust` line), `getBuildCommands()` (`['cargo build', 'cargo test']`), `getTestCommands()` (`['cargo test']`), `getSemgrepLanguages()` (`['rust']`), `parseTestOutput()` (cargo test format with workspace aggregation), `parseCoverageReport()` (tarpaulin-report.json parsing), `getProjectName()` (reads `Cargo.toml` `[package] name`) <!-- verification: cli-verifiable -->
- [x] AC2: Given a temporary directory with a `Cargo.toml` containing `[dependencies]` with `async-openai`, when `RustProvider.detectAppType()` is called, then it returns `'agent'` <!-- verification: cli-verifiable -->
- [x] AC3: Given a temporary directory with a `Cargo.toml` containing `[dependencies]` with `actix-web`, when `RustProvider.detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC4: Given a temporary directory with a `Cargo.toml` containing `[dependencies]` with `axum`, when `RustProvider.detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC5: Given a temporary directory with a `Cargo.toml` containing `[dependencies]` with `rocket`, when `RustProvider.detectAppType()` is called, then it returns `'server'` <!-- verification: cli-verifiable -->
- [x] AC6: Given a temporary directory with a `Cargo.toml` containing a `[[bin]]` section and no web framework deps, when `RustProvider.detectAppType()` is called, then it returns `'cli'` <!-- verification: cli-verifiable -->
- [x] AC7: Given a temporary directory with a `Cargo.toml` containing a `[lib]` section and no `[[bin]]` section, when `RustProvider.detectAppType()` is called, then it returns `'generic'` <!-- verification: cli-verifiable -->
- [x] AC8: Given a temporary directory with a minimal `Cargo.toml` (no `[[bin]]`, `[lib]`, or framework deps), when `RustProvider.detectAppType()` is called, then it returns `'generic'` <!-- verification: cli-verifiable -->
- [x] AC9: Given `RustProvider.getCoverageTool()` is called, when the result is inspected, then it returns `'tarpaulin'` <!-- verification: cli-verifiable -->
- [x] AC10: Given a temporary directory with a `Cargo.toml` (non-workspace), when `RustProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'tarpaulin' }` with a defined `configFile` pointing to Cargo.toml <!-- verification: cli-verifiable -->
- [x] AC11: Given a temporary directory with a `Cargo.toml` containing a `[workspace]` section, when `RustProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'tarpaulin' }` with a `configFile` pointing to Cargo.toml <!-- verification: cli-verifiable -->
- [x] AC12: Given a temporary directory without a `Cargo.toml`, when `RustProvider.detectCoverageConfig()` is called, then it returns `{ tool: 'none' }` <!-- verification: cli-verifiable -->
- [x] AC13: Given `RustProvider.getOtlpPackages()` is called, when the result is inspected, then it returns exactly `['opentelemetry', 'opentelemetry-otlp', 'tracing-opentelemetry', 'tracing-subscriber']` <!-- verification: cli-verifiable -->
- [x] AC14: Given `RustProvider.getDockerfileTemplate()` is called, when the result is inspected, then it contains `FROM rust:1.82-slim AS builder`, `cargo build --release`, `FROM debian:bookworm-slim`, and `USER nobody` <!-- verification: cli-verifiable -->
- [x] AC15: Given `RustProvider.getDockerBuildStage()` is called, when the result is inspected, then it contains `FROM rust:1.82-slim AS build-rust` and `cargo build --release` <!-- verification: cli-verifiable -->
- [x] AC16: Given `RustProvider.getRuntimeCopyDirectives()` is called, when the result is inspected, then it contains `COPY --from=build-rust` <!-- verification: cli-verifiable -->
- [x] AC17: Given cargo test output `test result: ok. 42 passed; 3 failed; 1 ignored`, when `RustProvider.parseTestOutput()` is called, then it returns `{ passed: 42, failed: 3, skipped: 1, total: 46 }` <!-- verification: cli-verifiable -->
- [x] AC18: Given cargo workspace output with two `test result:` lines (`10 passed; 0 failed` and `5 passed; 2 failed`), when `RustProvider.parseTestOutput()` is called, then it returns `{ passed: 15, failed: 2, skipped: 0, total: 17 }` (workspace aggregation) <!-- verification: cli-verifiable -->
- [x] AC19: Given output with no recognizable cargo test format, when `RustProvider.parseTestOutput()` is called, then it returns `{ passed: 0, failed: 0, skipped: 0, total: 0 }` <!-- verification: cli-verifiable -->
- [x] AC20: Given a directory with `coverage/tarpaulin-report.json` containing `{ "coverage": 78.5 }`, when `RustProvider.parseCoverageReport()` is called, then it returns `78.5` <!-- verification: cli-verifiable -->
- [x] AC21: Given a directory without `coverage/tarpaulin-report.json`, when `RustProvider.parseCoverageReport()` is called, then it returns `0` <!-- verification: cli-verifiable -->
- [x] AC22: Given a directory with a `Cargo.toml` containing `[package]\nname = "my-rust-app"`, when `RustProvider.getProjectName()` is called, then it returns `'my-rust-app'` <!-- verification: cli-verifiable -->
- [x] AC23: Given a directory without `Cargo.toml`, when `RustProvider.getProjectName()` is called, then it returns `null` <!-- verification: cli-verifiable -->
- [x] AC24: Given `RustProvider.getSemgrepLanguages()` is called, when the result is inspected, then it returns `['rust']` <!-- verification: cli-verifiable -->
- [x] AC25: Given `RustProvider.getBuildCommands()` and `getTestCommands()` are called, when the results are inspected, then they return `['cargo build', 'cargo test']` and `['cargo test']` respectively <!-- verification: cli-verifiable -->
- [x] AC26: Given the `RustProvider` is registered in `src/lib/stacks/index.ts`, when `getStackProvider('rust')` is called, then it returns the RustProvider instance <!-- verification: cli-verifiable -->
- [x] AC27: Given unit tests exist in `src/lib/__tests__/stacks/rust.test.ts`, when `npm test` runs, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [x] Task 1: Create `src/lib/stacks/rust.ts` with `RustProvider` class skeleton -- Set `name: 'rust'`, `markers: ['Cargo.toml']`, `displayName: 'Rust (Cargo.toml)'`. Import shared helpers from `./utils.js`.
- [x] Task 2: Add `getCargoDepsSection()` and `hasCargoDep()` helpers to `src/lib/stacks/utils.ts` -- Extract from `src/lib/stack-detect.ts`. `getCargoDepsSection(content)` extracts the `[dependencies]` section up to the next section header. `hasCargoDep(depsSection, dep)` matches crate name with word-boundary-aware regex to avoid substring false positives.
- [x] Task 3: Implement `RustProvider.detectAppType()` -- Extract Rust app type detection from `src/lib/stack-detect.ts` `detectAppType()` (the `stack === 'rust'` branch). Read `Cargo.toml` content, extract `[dependencies]` section, check for agent deps (`async-openai`, `anthropic`, `llm-chain`), web framework deps (`actix-web`, `axum`, `rocket`, `tide`, `warp`), `[[bin]]` section (CLI), `[lib]` section (generic). Fall through to `'generic'`.
- [x] Task 4: Implement `RustProvider.getCoverageTool()` -- Return `'tarpaulin'` as the canonical Rust coverage tool.
- [x] Task 5: Implement `RustProvider.detectCoverageConfig()` -- Read `Cargo.toml` to detect workspace flag. Return `CoverageToolInfo` with `tool: 'tarpaulin'` and `configFile` pointing to Cargo.toml path. Return `{ tool: 'none' }` if no Cargo.toml exists.
- [x] Task 6: Implement `RustProvider.getOtlpPackages()` -- Return the `RUST_OTLP_PACKAGES` array from `otlp.ts`: `['opentelemetry', 'opentelemetry-otlp', 'tracing-opentelemetry', 'tracing-subscriber']`.
- [x] Task 7: Implement `RustProvider.installOtlp()` -- Extract from `otlp.ts` `installRustOtlp()`. Run `cargo add` with all OTLP packages. Return `OtlpResult` with success/failure.
- [x] Task 8: Implement `RustProvider.getDockerfileTemplate()` -- Extract from `dockerfile-template.ts` `rustTemplate()`. Return the multi-stage Dockerfile string with `rust:1.82-slim` builder and `debian:bookworm-slim` runtime.
- [x] Task 9: Implement `RustProvider.getDockerBuildStage()` -- Extract from `dockerfile-template.ts` `rustBuildStage()`. Return build stage snippet with `FROM rust:1.82-slim AS build-rust`.
- [x] Task 10: Implement `RustProvider.getRuntimeCopyDirectives()` -- Extract from `dockerfile-template.ts` `runtimeCopyDirectives()` (the rust branch). Return `COPY --from=build-rust /build/target/release/myapp /usr/local/bin/myapp`.
- [x] Task 11: Implement `RustProvider.getBuildCommands()` -- Return `['cargo build', 'cargo test']`.
- [x] Task 12: Implement `RustProvider.getTestCommands()` -- Return `['cargo test']`.
- [x] Task 13: Implement `RustProvider.getSemgrepLanguages()` -- Return `['rust']`.
- [x] Task 14: Implement `RustProvider.parseTestOutput()` -- Extract cargo test parsing from `coverage.ts` `parseTestCounts()`. Cargo format: `test result: ok. N passed; M failed; K ignored`. Must aggregate across multiple `test result:` lines for workspace projects (sum all lines before returning). Return `TestCounts` with `skipped` mapped from `ignored`.
- [x] Task 15: Implement `RustProvider.parseCoverageReport()` -- Extract from `coverage.ts` `parseTarpaulinCoverage()`. Read `coverage/tarpaulin-report.json` in project dir, parse `coverage` field. Return `0` if file missing or malformed.
- [x] Task 16: Implement `RustProvider.getProjectName()` -- Read `Cargo.toml`, find `[package]` section, extract `name = "..."` within that section only (stop at next `[` section header). Return `null` if not found.
- [x] Task 17: Register `RustProvider` in `src/lib/stacks/index.ts` -- Add `import { RustProvider } from './rust.js'` and `registerProvider(new RustProvider())` alongside existing NodejsProvider and PythonProvider registrations.
- [x] Task 18: Create `src/lib/__tests__/stacks/rust.test.ts` -- Unit tests for every method. Use temp directories with fixture Cargo.toml files. Cover: each app type variant (agent, server, cli, generic with `[lib]`, generic bare), coverage tool detection (standard, workspace, no Cargo.toml), test output parsing (single crate, workspace aggregation, no match), coverage report parsing (valid JSON, missing file, malformed), project name (present, missing, no name field), OTLP packages, Dockerfile content, build/test commands, semgrep languages.
- [x] Task 19: Verify the existing test suite still passes -- run `npm test` and confirm 0 regressions.

## Technical Notes

**Decision 2 (Stack Provider Pattern).** Rust has the most complex provider due to multi-stage Docker builds and Cargo.toml section parsing. This is the third and final provider implementation, following NodejsProvider (10-2) and PythonProvider (10-3).

### What moves INTO RustProvider

| Method | Source File | Source Function/Branch |
|--------|------------|----------------------|
| `detectAppType()` | `src/lib/stack-detect.ts` | `detectAppType()` -> `stack === 'rust'` branch |
| `getCoverageTool()` | `src/lib/coverage.ts` | `detectCoverageTool()` -> `stack === 'rust'` branch |
| `detectCoverageConfig()` | `src/lib/coverage.ts` | `detectCoverageTool()` -> `stack === 'rust'` branch (tarpaulin + workspace detection) |
| `getOtlpPackages()` | `src/lib/otlp.ts` | `RUST_OTLP_PACKAGES` constant |
| `installOtlp()` | `src/lib/otlp.ts` | `installRustOtlp()` |
| `getDockerfileTemplate()` | `src/modules/infra/dockerfile-template.ts` | `rustTemplate()` |
| `getDockerBuildStage()` | `src/modules/infra/dockerfile-template.ts` | `rustBuildStage()` |
| `getRuntimeCopyDirectives()` | `src/modules/infra/dockerfile-template.ts` | `runtimeCopyDirectives()` rust branch |
| `getBuildCommands()` | `src/modules/infra/docs-scaffold.ts` | `generateAgentsMdContent()` rust branch |
| `getTestCommands()` | `src/modules/infra/docs-scaffold.ts` | `generateAgentsMdContent()` rust branch |
| `getSemgrepLanguages()` | New | `['rust']` |
| `parseTestOutput()` | `src/lib/coverage.ts` | `parseTestCounts()` cargo test branch (with workspace aggregation) |
| `parseCoverageReport()` | `src/lib/coverage.ts` | `parseTarpaulinCoverage()` |
| `getProjectName()` | `src/modules/infra/docs-scaffold.ts` | `getProjectName()` Cargo.toml fallback path |

### What moves INTO shared utils

| Helper | Source File | Notes |
|--------|------------|-------|
| `getCargoDepsSection()` | `src/lib/stack-detect.ts` | Extracts `[dependencies]` section from Cargo.toml content |
| `hasCargoDep()` | `src/lib/stack-detect.ts` | Word-boundary-aware crate name matching |

### Important: Do NOT remove consumer branches yet

This story implements the provider methods only. Consumer files (`coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, `stack-detect.ts`) keep their existing if/else branches for now. Story 10-5 migrates consumers to use `provider.method()` and removes the branches. This avoids a big-bang migration.

### Rust app type detection constants

From `src/lib/stack-detect.ts`:
- `RUST_AGENT_DEPS = ['async-openai', 'anthropic', 'llm-chain']`
- `RUST_WEB_FRAMEWORKS = ['actix-web', 'axum', 'rocket', 'tide', 'warp']`
- CLI detection: `[[bin]]` section present in Cargo.toml
- Library detection: `[lib]` section present without `[[bin]]` -> returns `'generic'` (no `'library'` AppType exists in the type system)

### Cargo.toml parsing details

- `getCargoDepsSection(content)` extracts text between `[dependencies]` and the next `[` section header
- `hasCargoDep(depsSection, dep)` uses regex `(?:^|\s)escaped(?:\s*=|\s*\{)` to match crate names like `axum = "0.7"` and `axum = { version = "0.7" }` without matching substrings
- `getProjectName()` must extract `name` from within the `[package]` section only, stopping at the next section header to avoid matching names in other sections

### CoverageToolInfo mapping

The provider's `detectCoverageConfig()` returns `{ tool: 'tarpaulin', configFile: cargoPath }`. Unlike the consumer-level `detectCoverageTool()` which returns `runCommand` and `reportFormat`, the provider returns only the tool type and config location. The `runCommand` and `reportFormat` are derived by consumers (preserved in `coverage.ts` until story 10-5).

### Cargo test output parsing

The cargo test workspace aggregation is critical: workspace projects emit multiple `test result:` lines (one per crate). The parser must iterate ALL matches of the `test result:` regex and sum pass/fail/ignored counts. The `ignored` count from cargo maps to `skipped` in `TestCounts`. The regex pattern: `test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed(?:;\s*(\d+)\s+ignored)?`.

### Bevy system libs

The story technical notes mention Bevy detection for Docker system libs. This is **not** implemented in the current `dockerfile-template.ts` -- the current Rust template is static. Bevy-aware Docker generation is deferred to a future story or to story 10-5 when consumers are migrated. The RustProvider should NOT include Bevy detection in this story.

## Dev Notes

- The `NodejsProvider` in `src/lib/stacks/nodejs.ts` and `PythonProvider` in `src/lib/stacks/python.ts` are the reference implementations -- follow their structure exactly.
- Registration in `src/lib/stacks/index.ts` already registers NodejsProvider and PythonProvider; add RustProvider registration alongside them.
- `src/lib/stacks/utils.ts` already has `readJsonSafe()`, `readTextSafe()`, `getNodeDeps()`, `getPythonDepsContent()`, `hasPythonDep()` -- add `getCargoDepsSection()` and `hasCargoDep()` there.
- No `patchStartScript()` method for Rust -- Rust OTLP is configured via env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`), not source patching.

## Files to Change

- `src/lib/stacks/rust.ts` -- Create. Implement `RustProvider` class with all `StackProvider` methods including Cargo.toml section parsing
- `src/lib/stacks/utils.ts` -- Add `getCargoDepsSection()` and `hasCargoDep()` helpers (extracted from `stack-detect.ts`)
- `src/lib/stacks/index.ts` -- Register RustProvider: `registerProvider(new RustProvider())`
- `src/lib/__tests__/stacks/rust.test.ts` -- Create. Comprehensive unit tests for all RustProvider methods
