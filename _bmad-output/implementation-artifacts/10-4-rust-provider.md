# Story 10-4: Implement RustProvider

## Status: backlog

## Story

As a developer,
I want all Rust-specific logic in one file,
So that Rust behavior is encapsulated and testable in isolation.

## Acceptance Criteria

- [ ] AC1: Given `src/lib/stacks/rust.ts` exists, when inspected, then it implements all `StackProvider` methods for Rust: Cargo.toml detection, app type (CLI/server/library/agent), cargo-tarpaulin, cargo add OTLP, multi-stage Dockerfile, `[dependencies.foo]` subsection parsing, `'library'` AppType <!-- verification: cli-verifiable -->
- [ ] AC2: Given all Rust if/else branches are removed from consumer files, when `npm test` runs, then all tests pass <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 2 (Stack Provider Pattern).** Rust has the most complex provider due to multi-stage Docker builds, Bevy system libs, and Cargo.toml subsection parsing.

Extract Rust-specific logic from these current locations:

- **Coverage detection**: `src/lib/coverage.ts` has cargo-tarpaulin detection. Move into `RustProvider.detectCoverageConfig()`.
- **Test output parsing**: `src/lib/coverage.ts` `parseTestCounts()` has `cargo test` output patterns (`test result: ok. X passed; Y failed`), including cargo workspace aggregation. Move into `RustProvider.parseTestOutput()`. The cargo workspace aggregation (summing across multiple `test result:` lines) must fire before any other parser -- this ordering guard is critical.
- **Coverage report parsing**: `src/lib/coverage.ts` reads tarpaulin cobertura XML. Move into `RustProvider.parseCoverageReport()`.
- **OTLP packages**: `src/lib/otlp.ts` has `opentelemetry`, `tracing-opentelemetry` cargo dependencies. Move into `RustProvider.getOtlpPackages()`.
- **OTLP install**: `src/lib/otlp.ts` runs `cargo add` for OTLP deps, including `[dependencies.foo]` subsection handling. Move into `RustProvider.installOtlp()`.
- **Dockerfile template**: `src/modules/infra/dockerfile-template.ts` has Rust multi-stage Dockerfile (builder stage with cargo-chef, runtime stage with minimal deps). Move into `RustProvider.getDockerfileTemplate()`, `getDockerBuildStage()`, `getRuntimeCopyDirectives()`.
- **Bevy system libs**: When `bevy` is detected in Cargo.toml dependencies, include wayland, udev, alsa, x11, xkbcommon, fontconfig system libs in the Docker build stage.
- **App type detection**: `src/lib/stack-detect.ts` checks Cargo.toml for `[[bin]]` (CLI), actix-web/axum/rocket (server), `[lib]` (library). The `'library'` AppType was added for Rust. Move into `RustProvider.detectAppType()`.
- **Project name**: Read from `Cargo.toml` `[package] name`. Move into `RustProvider.getProjectName()`.

Markers: `['Cargo.toml']`. DisplayName: `'Rust (Cargo.toml)'`. Semgrep languages: `['rust']`.

## Files to Change

- `src/lib/stacks/rust.ts` — Create. Implement `RustProvider` class with all `StackProvider` methods including Bevy detection and Cargo.toml subsection parsing
- `src/lib/stacks/registry.ts` — Register RustProvider: `registry.set('rust', new RustProvider())`
- `src/lib/coverage.ts` — Remove Rust-specific branches (tarpaulin detection, cargo test parsing, workspace aggregation)
- `src/lib/otlp.ts` — Remove Rust-specific OTLP package lists, cargo add logic, subsection handling
- `src/modules/infra/dockerfile-template.ts` — Remove Rust multi-stage Dockerfile template generation
- `src/modules/infra/docs-scaffold.ts` — Remove Rust-specific command generation
- `src/lib/stack-detect.ts` — Remove Rust app type detection logic
