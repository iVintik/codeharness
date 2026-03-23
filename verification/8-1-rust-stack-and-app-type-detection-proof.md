# Verification Proof: Story 8-1 — Rust Stack and App Type Detection

**Date:** 2026-03-23
**Verifier:** Black-box verifier (Claude Code)
**Method:** CLI execution inside Docker container `codeharness-verify`

All tests create temporary directories with specific `Cargo.toml` files and run `codeharness init --json` to observe detected `stack` and `app_type` values. Exit code 1 is expected — the Docker error ("Docker not installed") is from nested Docker being unavailable inside the container and does not affect stack/app-type detection.

---

## AC1: Given a directory contains `Cargo.toml`, when `detectStack()` is called, then it returns `'rust'`

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac1 && printf "[package]\nname = \"testcli\"\nversion = \"0.1.0\"" > /tmp/test-ac1/Cargo.toml && cd /tmp/test-ac1 && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"generic","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"stack":"rust"` detected from presence of `Cargo.toml`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC2: Given a Rust project with `[[bin]]` in Cargo.toml and no web framework deps, when `detectAppType()` is called, then it returns `'cli'`

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac2 && printf "[package]\nname = \"mycli\"\nversion = \"0.1.0\"\n\n[[bin]]\nname = \"mycli\"\npath = \"src/main.rs\"\n\n[dependencies]\nclap = \"4.0\"\n" > /tmp/test-ac2/Cargo.toml && cd /tmp/test-ac2 && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"cli","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"app_type":"cli"` detected for `[[bin]]` crate with no web framework dependencies.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC3: Given a Rust project with `axum` in `[dependencies]`, when `detectAppType()` is called, then it returns `'server'`

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac3 && printf "[package]\nname = \"myserver\"\nversion = \"0.1.0\"\n\n[[bin]]\nname = \"myserver\"\npath = \"src/main.rs\"\n\n[dependencies]\naxum = \"0.7\"\ntokio = { version = \"1\", features = [\"full\"] }\n" > /tmp/test-ac3/Cargo.toml && cd /tmp/test-ac3 && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"server","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"app_type":"server"` detected when `axum` is in `[dependencies]`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC4: Given a Rust project with `[lib]` section and no `[[bin]]`, when `detectAppType()` is called, then it returns `'generic'` (library)

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac4 && printf "[package]\nname = \"mylib\"\nversion = \"0.1.0\"\n\n[lib]\nname = \"mylib\"\npath = \"src/lib.rs\"\n\n[dependencies]\nserde = \"1.0\"\n" > /tmp/test-ac4/Cargo.toml && cd /tmp/test-ac4 && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"generic","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"app_type":"generic"` returned for library crate with `[lib]` and no `[[bin]]`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC5: Given a Rust project with `async-openai` in dependencies, when `detectAppType()` is called, then it returns `'agent'`

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac5 && printf "[package]\nname = \"myagent\"\nversion = \"0.1.0\"\n\n[[bin]]\nname = \"myagent\"\npath = \"src/main.rs\"\n\n[dependencies]\nasync-openai = \"0.18\"\ntokio = { version = \"1\", features = [\"full\"] }\n" > /tmp/test-ac5/Cargo.toml && cd /tmp/test-ac5 && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"agent","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"app_type":"agent"` detected when `async-openai` is in `[dependencies]`.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC6: Given a Rust project with `[workspace]` in Cargo.toml, when `detectStack()` is called, then it still returns `'rust'`

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac6 && printf "[workspace]\nmembers = [\"crate-a\", \"crate-b\"]\n\n[workspace.dependencies]\nserde = \"1.0\"\n" > /tmp/test-ac6/Cargo.toml && cd /tmp/test-ac6 && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"generic","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"stack":"rust"` detected for workspace-style `Cargo.toml` with `[workspace]` section.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## AC7: Given no `Cargo.toml` exists, when `detectStack()` is called, then Rust is NOT detected

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/test-ac7 && cd /tmp/test-ac7 && rm -f Cargo.toml && codeharness init --json 2>&1'
```

```output
[WARN] No recognized stack detected
{"status":"fail","stack":null,"enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"generic","dockerfile":{"generated":true,"stack":"generic"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

**Result:** PASS — `"stack":null` returned when no `Cargo.toml` exists. No false positive for Rust.

[OBSERVABILITY GAP] No log events detected for this user interaction.

---

## Summary

| AC | Description | Result |
|----|-------------|--------|
| AC1 | Cargo.toml → stack: rust | PASS |
| AC2 | [[bin]] + no web deps → app_type: cli | PASS |
| AC3 | axum in deps → app_type: server | PASS |
| AC4 | [lib] + no [[bin]] → app_type: generic | PASS |
| AC5 | async-openai in deps → app_type: agent | PASS |
| AC6 | [workspace] → stack: rust | PASS |
| AC7 | No Cargo.toml → stack: null | PASS |

**Overall: 7/7 PASS**

**Observability note:** All 7 ACs show an observability gap — `codeharness init` does not emit structured log events to VictoriaLogs for stack/app-type detection operations.
