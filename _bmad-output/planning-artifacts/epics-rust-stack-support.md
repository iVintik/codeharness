---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/implementation-artifacts/tech-spec-rust-stack-support.md
  - _bmad-output/planning-artifacts/prd-operational-excellence.md
  - _bmad-output/planning-artifacts/architecture-operational-excellence.md
---

# Rust Stack Support - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for adding full Rust stack support to codeharness at parity with Node.js and Python.

## Requirements Inventory

### Functional Requirements

FR1: System detects Rust projects via `Cargo.toml` presence and returns stack `'rust'`
FR2: System detects Rust app type (CLI, server, library, agent, generic) by parsing `Cargo.toml` sections and dependencies
FR3: System detects `[workspace]` projects and treats them as single projects with `--workspace` flags
FR4: System generates multi-stage Dockerfile for Rust projects (build + runtime stages)
FR5: System installs OTLP crates (`opentelemetry`, `opentelemetry-otlp`, `tracing-opentelemetry`, `tracing-subscriber`) via `cargo add`
FR6: System provides LLM guidance doc for Rust OTLP instrumentation (`templates/otlp/rust.md`)
FR7: System detects `cargo-tarpaulin` as coverage tool for Rust projects
FR8: System parses `tarpaulin-report.json` for coverage percentage
FR9: System parses `cargo test` output for pass/fail counts
FR10: System generates AGENTS.md with Rust build/test commands
FR11: System creates Semgrep rules for Rust observability patterns (`tracing` crate)
FR12: System creates verification Dockerfile for Rust projects
FR13: System registers `cargo-tarpaulin` in dependency registry
FR14: System expands state types to support Rust coverage tool and OTLP config

### NonFunctional Requirements

NFR1: No file exceeds 300 lines (existing constraint from architecture)
NFR2: All new code has unit tests — 0 regressions on existing tests
NFR3: No new npm dependencies added to codeharness itself
NFR4: Cargo.toml parsing uses simple string matching — no TOML parser dependency
NFR5: All changes follow existing Result<T> pattern and module boundaries

### Additional Requirements

- Workspace detection must not break single-crate projects (false positive guard)
- `cargo-tarpaulin` is runtime-only dependency — not required at codeharness build time
- Semgrep Rust rules target standard `tracing` crate patterns only (custom macros out of scope)
- Verification Dockerfile needs Python for Semgrep even in Rust projects

### FR Coverage Map

| FR | Epic | Story |
|----|------|-------|
| FR1, FR2, FR3 | Epic 1 | 8-1 |
| FR14 | Epic 1 | 8-2 |
| FR7, FR8, FR9 | Epic 2 | 8-3 |
| FR13 | Epic 2 | 8-4 |
| FR4 | Epic 3 | 8-5 |
| FR12 | Epic 3 | 8-6 |
| FR5, FR6 | Epic 4 | 8-7 |
| FR10 | Epic 4 | 8-8 |
| FR11 | Epic 5 | 8-9 |

## Epic List

- **Epic 1: Rust Detection Foundation** — Stack detection, app type detection, state type expansion
- **Epic 2: Rust Coverage & Testing** — cargo-tarpaulin detection, report parsing, test output parsing
- **Epic 3: Rust Infrastructure** — Dockerfile template, verification Dockerfile
- **Epic 4: Rust Observability & Docs** — OTLP instrumentation, guidance doc, docs scaffolding
- **Epic 5: Rust Static Analysis** — Semgrep rules for tracing patterns

## Epic 1: Rust Detection Foundation

Enable codeharness to recognize Rust projects, detect their type, and store Rust-specific state.

### Story 8-1: Rust stack and app type detection

As a developer initializing codeharness on a Rust project,
I want the harness to detect my project as Rust and identify whether it's a CLI, server, library, or agent,
So that all downstream features (coverage, OTLP, Dockerfile) use the correct Rust configuration.

**Acceptance Criteria:**

**Given** a directory contains `Cargo.toml`
**When** `detectStack()` is called
**Then** it returns `'rust'`

**Given** a Rust project with `[[bin]]` in Cargo.toml and no web framework deps
**When** `detectAppType()` is called
**Then** it returns `'cli'`

**Given** a Rust project with `axum` in `[dependencies]`
**When** `detectAppType()` is called
**Then** it returns `'server'`

**Given** a Rust project with `[lib]` section and no `[[bin]]`
**When** `detectAppType()` is called
**Then** it returns `'generic'` (library)

**Given** a Rust project with `async-openai` in dependencies
**When** `detectAppType()` is called
**Then** it returns `'agent'`

**Given** a Rust project with `[workspace]` in Cargo.toml
**When** `detectStack()` is called
**Then** it still returns `'rust'` (treated as single project)

**Given** no `Cargo.toml` exists
**When** `detectStack()` is called
**Then** Rust is NOT detected (no false positive)

### Story 8-2: Expand state types for Rust

As a developer,
I want the harness state to support Rust-specific fields,
So that coverage tool and OTLP config are correctly stored.

**Acceptance Criteria:**

**Given** a Rust project is initialized
**When** state is written
**Then** `coverage.tool` accepts `'cargo-tarpaulin'` without type errors

**Given** a Rust project has OTLP configured
**When** state is written
**Then** `otlp.rust_env_hint` field is present with value `'OTEL_EXPORTER_OTLP_ENDPOINT'`

## Epic 2: Rust Coverage & Testing

Enable coverage detection, report parsing, and test output parsing for Rust projects using cargo-tarpaulin.

### Story 8-3: cargo-tarpaulin coverage detection and parsing

As a developer running coverage on a Rust project,
I want codeharness to detect cargo-tarpaulin, run it, and parse the JSON report,
So that coverage metrics are tracked at parity with Node.js/Python.

**Acceptance Criteria:**

**Given** a Rust project with `cargo-tarpaulin` installed
**When** `detectCoverageTool()` is called
**Then** it returns `{ tool: 'cargo-tarpaulin', runCommand: 'cargo tarpaulin --out json --output-dir coverage/', reportFormat: 'tarpaulin-json' }`

**Given** a Rust workspace project
**When** `detectCoverageTool()` is called
**Then** the run command includes `--workspace` flag

**Given** a `coverage/tarpaulin-report.json` file with `"coverage": 85.5`
**When** `parseCoverageReport()` is called with format `'tarpaulin-json'`
**Then** it returns `85.5`

**Given** `cargo test` output containing `test result: ok. 42 passed; 3 failed; 0 ignored`
**When** `parseTestCounts()` is called
**Then** it returns `{ passCount: 42, failCount: 3 }`

**Given** `cargo-tarpaulin` is NOT installed
**When** `detectCoverageTool()` is called on a Rust project
**Then** it returns `{ tool: 'unknown' }` with a warning

### Story 8-4: Register cargo-tarpaulin in dependency registry

As a developer initializing codeharness on a Rust project,
I want cargo-tarpaulin to be auto-installed if missing,
So that coverage works out of the box.

**Acceptance Criteria:**

**Given** `cargo-tarpaulin` is not installed
**When** `codeharness init` runs on a Rust project
**Then** it attempts `cargo install cargo-tarpaulin`

**Given** the dependency registry
**When** checked for `cargo-tarpaulin`
**Then** it has `critical: false`, install command `cargo install cargo-tarpaulin`, check command `cargo tarpaulin --version`

## Epic 3: Rust Infrastructure

Generate Dockerfiles for Rust project deployment and verification.

### Story 8-5: Rust Dockerfile template generation

As a developer deploying a Rust project,
I want codeharness to generate a multi-stage Dockerfile,
So that I get a minimal runtime image with just the compiled binary.

**Acceptance Criteria:**

**Given** a Rust project without a Dockerfile
**When** `generateDockerfileTemplate()` is called
**Then** it writes a multi-stage Dockerfile with `rust:1.82-slim` builder and `debian:bookworm-slim` runtime

**Given** the generated Dockerfile
**When** inspected
**Then** it includes `cargo build --release` in build stage, `curl`/`jq` in runtime stage, and runs as non-root user

**Given** a Rust project with an existing Dockerfile
**When** `generateDockerfileTemplate()` is called
**Then** it returns `fail('Dockerfile already exists')`

### Story 8-6: Rust verification Dockerfile

As a developer verifying a Rust project,
I want a verification environment with Rust tooling, Semgrep, and showboat,
So that automated verification works for Rust projects.

**Acceptance Criteria:**

**Given** `templates/Dockerfile.verify.rust` exists
**When** built
**Then** it includes `rust:1.82-slim`, Python + Semgrep, showboat, cargo-tarpaulin, curl, jq

**Given** the verification Dockerfile
**When** inspected
**Then** OTLP environment variables are configured pointing to host Docker endpoint

## Epic 4: Rust Observability & Documentation

Add OTLP instrumentation support and documentation scaffolding for Rust projects.

### Story 8-7: Rust OTLP instrumentation

As a developer instrumenting a Rust project,
I want codeharness to add OpenTelemetry crates and provide setup guidance,
So that I can quickly enable observability.

**Acceptance Criteria:**

**Given** a Rust project
**When** `instrumentProject()` runs
**Then** `cargo add opentelemetry opentelemetry-otlp tracing-opentelemetry tracing-subscriber` is executed

**Given** OTLP instrumentation succeeds
**When** state is updated
**Then** `configureOtlpEnvVars()` writes `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` to `.env.codeharness`

**Given** a Rust project
**When** `configureAgent()` is called
**Then** it skips with info message (no standard Rust agent SDK yet)

**Given** `templates/otlp/rust.md` exists
**When** read
**Then** it contains: packages to add, `tracing_subscriber` setup code snippet, `#[tracing::instrument]` usage, env vars, verification steps

### Story 8-8: Rust documentation scaffolding

As a developer initializing a Rust project,
I want AGENTS.md to include Rust-specific build/test commands,
So that AI agents know how to build and test my project.

**Acceptance Criteria:**

**Given** a Rust project
**When** `getStackLabel()` is called
**Then** it returns `'Rust (Cargo.toml)'`

**Given** a Rust project
**When** `getCoverageTool()` is called
**Then** it returns `'cargo-tarpaulin'`

**Given** a Rust project
**When** `generateAgentsMdContent()` is called
**Then** output includes `cargo build`, `cargo test`, `cargo tarpaulin --out json`

**Given** a Rust project with `[package] name = "myapp"` in Cargo.toml
**When** `getProjectName()` is called
**Then** it returns `'myapp'` (reads from Cargo.toml, not package.json)

## Epic 5: Rust Static Analysis

Create Semgrep rules to detect observability gaps in Rust code using tracing crate patterns.

### Story 8-9: Semgrep rules for Rust observability

As a developer auditing a Rust project,
I want Semgrep to detect functions and error paths without tracing,
So that observability gaps are identified automatically.

**Acceptance Criteria:**

**Given** a Rust function without `tracing::debug!`, `tracing::info!`, or `#[instrument]`
**When** Semgrep runs with `rust-function-no-tracing` rule
**Then** it reports an observability gap

**Given** a Rust `match` arm handling `Err` without `tracing::error!` or `tracing::warn!`
**When** Semgrep runs with `rust-catch-without-tracing` rule
**Then** it reports an observability gap

**Given** a Rust `.map_err()` or `.unwrap_or_else()` closure without tracing macros
**When** Semgrep runs with `rust-error-path-no-tracing` rule
**Then** it reports an observability gap

**Given** all 3 Rust rule files in `patches/observability/`
**When** `codeharness audit` runs on a Rust project with Semgrep installed
**Then** the observability static analysis dimension uses the Rust rules automatically (Semgrep auto-discovers by `languages: [rust]`)
