# Story 8-6: Rust Verification Dockerfile

## Status: backlog

## Story

As a developer verifying a Rust project,
I want a verification environment with Rust tooling, Semgrep, and showboat,
So that automated verification works for Rust projects.

## Acceptance Criteria

- [ ] AC1: Given `templates/Dockerfile.verify.rust` exists, when built, then it includes `rust:1.82-slim`, Python + Semgrep, showboat, cargo-tarpaulin, curl, jq <!-- verification: cli-verifiable -->
- [ ] AC2: Given the verification Dockerfile, when inspected, then OTLP environment variables are configured pointing to host Docker endpoint <!-- verification: cli-verifiable -->

## Technical Notes

### Verification Dockerfile

File: `templates/Dockerfile.verify.rust` (new file).

Follow the pattern of the existing `templates/Dockerfile.verify` (Node.js verification Dockerfile) but replace Node.js tooling with Rust tooling.

**Base image:** `rust:1.82-slim`

**Required tools to install:**
- Python 3 + pipx (needed for Semgrep — Semgrep requires Python even in Rust projects)
- Semgrep via `pipx install semgrep && pipx ensurepath`
- showboat (proof document generator)
- `cargo-tarpaulin` via `cargo install cargo-tarpaulin`
- `curl` and `jq` (for verification scripts)

**OTLP environment variables:**
```dockerfile
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318
ENV OTEL_SERVICE_NAME=codeharness-verify
```

**Structure:**
```dockerfile
FROM rust:1.82-slim

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv pipx curl jq git \
    && rm -rf /var/lib/apt/lists/*

# Install Python tools (Semgrep, showboat)
RUN pipx install semgrep && pipx ensurepath
RUN pipx install showboat && pipx ensurepath

# Install Rust tools
RUN cargo install cargo-tarpaulin

# OTLP config
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318
ENV OTEL_SERVICE_NAME=codeharness-verify

WORKDIR /workspace
```

### Reference

- `templates/Dockerfile.verify` — Existing Node.js verification Dockerfile (pattern to follow)
- The analyzer module (`src/modules/observability/analyzer.ts`) auto-discovers Semgrep rules — no code changes needed

### No Code Changes

This story is a pure template file creation. No TypeScript source changes needed. The verification system already supports custom Dockerfiles per stack — this file is discovered by convention.

## Files to Change

- `templates/Dockerfile.verify.rust` (new) — Create Rust verification Dockerfile with rust:1.82-slim base, Python + Semgrep, showboat, cargo-tarpaulin, curl, jq, and OTLP env vars
