# Story 8.6: Rust Verification Dockerfile — Black-Box Verification Proof

Verified: 2026-03-23
Verifier: Claude Opus 4.6 (black-box)
Container: codeharness-verify (codeharness v0.23.1)

---

## AC1: Dockerfile.verify.rust template content

**Verdict: PASS**

The template exists in the installed npm package and contains all required components: `rust:1.82-slim` base image, Python + Semgrep via pipx, Node.js 20 LTS via NodeSource, showboat + claude-code via npm, cargo-tarpaulin, curl, and jq.

```bash
docker exec codeharness-verify cat /usr/local/lib/node_modules/codeharness/templates/Dockerfile.verify.rust
```

```output
# Rust black-box verification environment
# Provides Rust tooling, Semgrep, showboat, and cargo-tarpaulin for automated verification.
# NO project source enters the image — the project is mounted at runtime.
FROM rust:1.82-slim

# System utilities + Python for Semgrep
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    pipx \
    curl \
    jq \
    git \
  && rm -rf /var/lib/apt/lists/*

# Semgrep for static analysis verification
RUN pipx install semgrep && pipx ensurepath
ENV PATH="/root/.local/bin:${PATH}"

# Node.js 20 LTS (needed for showboat and claude-code npm packages)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Verification tools + Claude Code CLI
RUN npm install -g showboat @anthropic-ai/claude-code

# Rust coverage tool
RUN cargo install cargo-tarpaulin

# OTEL environment pointing to host observability stack
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318
ENV OTEL_SERVICE_NAME=codeharness-verify
ENV OTEL_TRACES_EXPORTER=otlp
ENV OTEL_METRICS_EXPORTER=otlp
ENV OTEL_LOGS_EXPORTER=otlp

WORKDIR /workspace
```

Checklist:
- [x] `FROM rust:1.82-slim` base image
- [x] Python + Semgrep via pipx
- [x] Node.js 20 LTS via NodeSource
- [x] showboat + claude-code via npm
- [x] cargo-tarpaulin
- [x] curl and jq installed

---

## AC2: OTLP environment variables in Dockerfile.verify.rust

**Verdict: PASS**

All 5 required OTLP environment variables are present with correct values.

```bash
docker exec codeharness-verify grep -n 'OTEL' /usr/local/lib/node_modules/codeharness/templates/Dockerfile.verify.rust
```

```output
33:ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318
34:ENV OTEL_SERVICE_NAME=codeharness-verify
35:ENV OTEL_TRACES_EXPORTER=otlp
36:ENV OTEL_METRICS_EXPORTER=otlp
37:ENV OTEL_LOGS_EXPORTER=otlp
```

Checklist:
- [x] `OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318`
- [x] `OTEL_SERVICE_NAME=codeharness-verify`
- [x] `OTEL_TRACES_EXPORTER=otlp`
- [x] `OTEL_METRICS_EXPORTER=otlp`
- [x] `OTEL_LOGS_EXPORTER=otlp`

---

## AC3: detectProjectType returns 'rust' for Rust projects

**Verdict: PASS**

Created a fake Rust project with `Cargo.toml` and ran `codeharness init --json`. The output shows `"stack":"rust"` — the project type was correctly detected as Rust, not generic.

```bash
docker exec codeharness-verify sh -c 'mkdir -p /tmp/rustproj/src && echo "[package]\nname = \"test-rust\"\nversion = \"0.1.0\"\nedition = \"2021\"" > /tmp/rustproj/Cargo.toml && echo "fn main() { println!(\"hello\"); }" > /tmp/rustproj/src/main.rs && cd /tmp/rustproj && codeharness init --json 2>&1'
```

```output
{"status":"fail","stack":"rust","enforcement":{"frontend":true,"database":true,"api":true},"documentation":{"agents_md":"skipped","docs_scaffold":"skipped","readme":"skipped"},"app_type":"generic","dockerfile":{"generated":true,"stack":"rust"},"error":"Docker not installed","docker":{"compose_file":"","stack_running":false,"services":[],"ports":{"logs":9428,"metrics":8428,"traces":16686,"otel_grpc":4317,"otel_http":4318}}}
```

Key evidence: `"stack":"rust"` — not `"generic"`.

---

## AC4: buildVerifyImage uses Dockerfile.verify.rust for Rust projects

**Verdict: PASS**

Verified in the compiled bundle. `buildVerifyImage()` routes Rust projects to `buildSimpleImage(projectDir, "rust", 3e5)`, which uses the `DOCKERFILE_VARIANTS` map where `rust` maps to `"Dockerfile.verify.rust"`.

```bash
docker exec codeharness-verify sed -n '7389,7390p' /usr/local/lib/node_modules/codeharness/dist/index.js
```

```output
  } else if (projectType === "rust") {
    buildSimpleImage(projectDir, "rust", 3e5);
```

```bash
docker exec codeharness-verify sed -n '7553,7555p' /usr/local/lib/node_modules/codeharness/dist/index.js
```

```output
var DOCKERFILE_VARIANTS = {
  generic: "Dockerfile.verify.generic",
  rust: "Dockerfile.verify.rust"
```

The routing chain: `detectProjectType() → "rust" → buildVerifyImage() → buildSimpleImage(dir, "rust") → resolveDockerfileTemplate(dir, "rust") → "Dockerfile.verify.rust"`.

---

## AC5: resolveDockerfileTemplate resolves Dockerfile.verify.rust for variant 'rust'

**Verdict: PASS**

The `DOCKERFILE_VARIANTS` map includes `rust: "Dockerfile.verify.rust"`, and `resolveDockerfileTemplate()` uses this map to resolve the filename.

```bash
docker exec codeharness-verify grep -A5 'DOCKERFILE_VARIANTS' /usr/local/lib/node_modules/codeharness/dist/index.js
```

```output
var DOCKERFILE_VARIANTS = {
  generic: "Dockerfile.verify.generic",
  rust: "Dockerfile.verify.rust"
};
function resolveDockerfileTemplate(projectDir, variant) {
  const filename = (variant && DOCKERFILE_VARIANTS[variant]) ?? "Dockerfile.verify";
```

When `variant === "rust"`, `DOCKERFILE_VARIANTS["rust"]` returns `"Dockerfile.verify.rust"`. The template file exists at `/usr/local/lib/node_modules/codeharness/templates/Dockerfile.verify.rust` (confirmed in AC1).

---

## AC6: ProjectType includes 'rust' as a valid union member

**Verdict: PASS**

The bundle uses `"rust"` as a valid project type value throughout. Key evidence points:

```bash
docker exec codeharness-verify grep -n '"rust"' /usr/local/lib/node_modules/codeharness/dist/index.js | head -15
```

```output
65:  if (existsSync(join(dir, "Cargo.toml"))) return "rust";
173:  if (stack === "rust") {
203:  if (stack === "rust") return "cargo-tarpaulin";
572:    ...stack === "rust" ? { rust_env_hint: "OTEL_EXPORTER_OTLP_ENDPOINT" } : {}
602:  } else if (stack === "rust") {
1879:  if (stack === "rust") return "Rust (Cargo.toml)";
1884:  if (stack === "rust") return "cargo-tarpaulin";
1889:  const stackLabel = stack === "nodejs" ? "Node.js" : stack === "python" ? "Python" : stack === "rust" ? "Rust" : "Unknown";
7363:  if (stack === "rust") return "rust";
7374:  if (projectType === "generic" || projectType === "plugin" || projectType === "rust") {
7389:  } else if (projectType === "rust") {
7390:    buildSimpleImage(projectDir, "rust", 3e5);
```

`detectProjectType()` at line 7363 returns `"rust"`, and `buildVerifyImage()` at line 7374 and 7389 handles it as a valid project type. The type is used consistently throughout the codebase.

---

## AC7: codeharness init on Rust project builds Rust-specific verification image

**Verdict: PARTIAL PASS / ESCALATE (Docker-in-Docker)**

Detection and template resolution are verified (AC3, AC4, AC5). The `codeharness init --json` output confirms `"stack":"rust"` and `"dockerfile":{"generated":true,"stack":"rust"}`.

The actual Docker image build cannot be verified because Docker is not available inside the verification container:

```bash
docker exec codeharness-verify sh -c 'docker --version 2>&1; echo "EXIT:$?"'
```

```output
sh: 1: docker: not found
EXIT:127
```

**[ESCALATE]** The Docker-in-Docker portion of AC7 is genuinely impossible to verify in this black-box environment. The detection, routing, and template resolution parts are all verified through AC3-AC5.

---

## AC8: npm test passes with zero regressions

**Verdict: ESCALATE**

No source code exists in the black-box verification container. This is by design — the container has only the built npm package installed globally.

```bash
docker exec codeharness-verify sh -c 'ls /workspace/package.json 2>&1; echo "EXIT:$?"'
```

```output
ls: cannot access '/workspace/package.json': No such file or directory
EXIT:2
```

**[ESCALATE]** Running `npm test` requires source code and dev dependencies, which are intentionally excluded from the black-box verification environment. Dev agent reports 2998 tests pass with zero regressions.

---

## Summary

| AC | Description | Verdict |
|----|-------------|---------|
| AC1 | Dockerfile.verify.rust content | PASS |
| AC2 | OTLP environment variables | PASS |
| AC3 | detectProjectType returns 'rust' | PASS |
| AC4 | buildVerifyImage uses Rust Dockerfile | PASS |
| AC5 | resolveDockerfileTemplate resolves rust | PASS |
| AC6 | ProjectType includes 'rust' | PASS |
| AC7 | Integration: Rust-specific image build | ESCALATE (no Docker-in-Docker) |
| AC8 | npm test passes | ESCALATE (no source code in container) |

**Overall: 6/8 PASS, 2/8 ESCALATE (both are genuinely impossible in black-box mode)**

The previous verification findings noted that `templates/Dockerfile.verify.rust` was not shipped in the npm package. This has been fixed — the template is now present in the installed package at `/usr/local/lib/node_modules/codeharness/templates/Dockerfile.verify.rust`.
