# Verification Proof: Story 8-2 — Expand State Types for Rust

**Date:** 2026-03-23
**Verifier:** Black-box CLI verification
**CLI Version:** codeharness 0.23.1
**Container:** codeharness-verify

---

## AC1: coverage.tool accepts 'cargo-tarpaulin' without type errors

**Verdict: PASS**

### Method

Created a Rust project with `Cargo.toml`, initialized with `codeharness init --no-observability --json`, then inspected the generated state file.

### Evidence — Init JSON output (excerpt)

```bash
$ docker exec codeharness-verify bash -c '
cd /tmp && rm -rf rust-verify2 && mkdir rust-verify2 && cd rust-verify2 &&
cat > Cargo.toml << "TOML"
[package]
name = "verify-rust"
version = "0.1.0"
edition = "2021"
TOML
mkdir -p src && echo "fn main() {}" > src/main.rs &&
git init && git add -A && git commit -m "init" &&
codeharness init --no-observability --json'
```

```json
{"status":"ok","stack":"rust",...}
```

Exit code: 0 (no type errors).

### Evidence — State file (.claude/codeharness.local.md)

```bash
$ docker exec codeharness-verify cat /tmp/rust-verify2/.claude/codeharness.local.md
```

```yaml
---
harness_version: 0.23.1
initialized: true
stack: rust
enforcement:
  frontend: true
  database: true
  api: true
coverage:
  target: 90
  baseline: null
  current: null
  tool: cargo-tarpaulin
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
app_type: generic
otlp:
  enabled: true
  endpoint: http://localhost:4318
  service_name: rust-verify2
  mode: local-shared
---
```

### Evidence — Status JSON confirms coverage tool

```bash
$ docker exec codeharness-verify bash -c 'cd /tmp/rust-verify2 && codeharness status --json'
```

```json
{...,"coverage":{"target":90,"baseline":null,"current":null,"tool":"cargo-tarpaulin"},...}
```

**`coverage.tool` is `cargo-tarpaulin`** — written and read back without errors.

---

## AC2: otlp.rust_env_hint field present with value 'OTEL_EXPORTER_OTLP_ENDPOINT'

**Verdict: FAIL**

### Method

Created a Rust project and initialized with multiple OTLP configurations:
1. `codeharness init --no-observability` — OTLP section present but no `rust_env_hint`
2. `codeharness init --otel-endpoint http://localhost:4318` — OTLP section present but no `rust_env_hint`

### Evidence — State file with --otel-endpoint

```bash
$ docker exec codeharness-verify bash -c '
cd /tmp && rm -rf rust-verify3 && mkdir rust-verify3 && cd rust-verify3 &&
cat > Cargo.toml << "TOML"
[package]
name = "verify-rust"
version = "0.1.0"
edition = "2021"
TOML
mkdir -p src && echo "fn main() {}" > src/main.rs &&
git init && git add -A && git commit -m "init" &&
codeharness init --otel-endpoint http://localhost:4318 --json'
```

```json
{...,"otlp":{"status":"skipped","packages_installed":false,"start_script_patched":false,"env_vars_configured":false,"error":"Unsupported stack for OTLP instrumentation"},...}
```

### Evidence — State file contents

```bash
$ docker exec codeharness-verify cat /tmp/rust-verify3/.claude/codeharness.local.md
```

```yaml
otlp:
  enabled: true
  endpoint: http://localhost:4318
  service_name: rust-verify3
  mode: remote-direct
```

**`rust_env_hint` field is absent.** The OTLP instrumentation reports "Unsupported stack for OTLP instrumentation" for Rust projects. The type was added to the TypeScript interface (per story tasks), but the runtime code path that writes state never populates `rust_env_hint` for Rust projects.

### Root Cause

The OTLP instrumentation code does not have a Rust branch — it skips instrumentation entirely for Rust projects with the message "Unsupported stack for OTLP instrumentation". The `rust_env_hint` field exists in the type definition but is never written to the state file at runtime.

---

## Summary

| AC  | Description | Verdict |
|-----|-------------|---------|
| AC1 | coverage.tool accepts 'cargo-tarpaulin' | **PASS** |
| AC2 | otlp.rust_env_hint present with OTEL_EXPORTER_OTLP_ENDPOINT | **FAIL** |

**Overall: FAIL** — AC2 is not satisfied. The `rust_env_hint` field is never written to the state file because the OTLP instrumentation code does not support Rust projects at runtime.
