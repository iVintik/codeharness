# Story 8-5: Rust Dockerfile Template Generation

## Status: backlog

## Story

As a developer deploying a Rust project,
I want codeharness to generate a multi-stage Dockerfile,
So that I get a minimal runtime image with just the compiled binary.

## Acceptance Criteria

- [ ] AC1: Given a Rust project without a Dockerfile, when `generateDockerfileTemplate()` is called, then it writes a multi-stage Dockerfile with `rust:1.82-slim` builder and `debian:bookworm-slim` runtime <!-- verification: cli-verifiable -->
- [ ] AC2: Given the generated Dockerfile, when inspected, then it includes `cargo build --release` in build stage, `curl`/`jq` in runtime stage, and runs as non-root user <!-- verification: cli-verifiable -->
- [ ] AC3: Given a Rust project with an existing Dockerfile, when `generateDockerfileTemplate()` is called, then it returns `fail('Dockerfile already exists')` <!-- verification: cli-verifiable -->

## Technical Notes

### Dockerfile Template Function

File: `src/modules/infra/dockerfile-template.ts` — currently 119 lines.

Create `rustTemplate()` function returning a multi-stage Dockerfile string. Follow the pattern of existing `nodejsTemplate()` and `pythonTemplate()`.

**Build stage:**
```dockerfile
FROM rust:1.82-slim AS builder
WORKDIR /build
COPY . .
RUN cargo build --release
```

**Runtime stage:**
```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/<binary> /usr/local/bin/
USER nobody
WORKDIR /workspace
```

Use `<binary>` as a placeholder with a comment telling the user to replace it with their actual binary name (parsed from `[[bin]]` or `[package] name` in Cargo.toml if available).

### Integration Point

File: `src/modules/infra/dockerfile-template.ts` — `generateDockerfileTemplate()` at L99-108.

Add `else if (stack === 'rust')` branch at L102 that calls `rustTemplate()`. The existing function already handles the "Dockerfile already exists" check and returns `fail()` — no changes needed for AC3.

### Tests

File: `src/modules/infra/__tests__/dockerfile-template.test.ts`

Add test cases:
- `rustTemplate()` returns string containing `rust:1.82-slim`, `debian:bookworm-slim`, `cargo build --release`, `curl`, `jq`, `USER nobody`
- `generateDockerfileTemplate()` with stack `'rust'` calls `rustTemplate()`
- Existing Dockerfile → returns fail result

## Files to Change

- `src/modules/infra/dockerfile-template.ts` — Add `rustTemplate()` function, add `else if (stack === 'rust')` branch in `generateDockerfileTemplate()` (L102)
- `src/modules/infra/__tests__/dockerfile-template.test.ts` — Add test cases for Rust Dockerfile template content and generation flow
