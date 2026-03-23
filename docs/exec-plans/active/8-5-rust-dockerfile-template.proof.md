# Showboat Proof: 8-5 Rust Dockerfile Template Generation

## Test Environment

- **Type:** Local development (macOS)
- **Date:** 2026-03-23
- **Tool:** Vitest unit tests + codeharness coverage
- **Story:** 8-5-rust-dockerfile-template

## AC #1: generateDockerfileTemplate returns ok with stack: 'rust'

**Test:** `returns stack: rust and correct path`
**Evidence:** `generateDockerfileTemplate('/project', 'rust')` returns `{ success: true, data: { path: '/project/Dockerfile', stack: 'rust' } }` — NOT `'generic'`.

**Verdict:** PASS

## AC #2: Multi-stage build with correct FROM lines

**Test:** `contains FROM rust:1.82-slim AS builder and FROM debian:bookworm-slim`
**Evidence:** Written content contains both `FROM rust:1.82-slim AS builder` (builder stage) and `FROM debian:bookworm-slim` (runtime stage).

**Verdict:** PASS

## AC #3: cargo build --release and COPY --from=builder

**Tests:** `includes cargo build --release in builder stage`, `includes COPY --from=builder to copy compiled binary`
**Evidence:** Written content contains `cargo build --release` in builder stage and `COPY --from=builder /build/target/release/myapp /usr/local/bin/myapp` in runtime stage.

**Verdict:** PASS

## AC #4: curl, jq, non-root user, cache cleanup

**Tests:** `includes curl and jq verification tools`, `includes USER nobody for non-root execution`, `includes apt cache cleanup`
**Evidence:** Written content contains `apt-get install -y --no-install-recommends curl jq`, `USER nobody`, and `rm -rf /var/lib/apt/lists/*`.

**Verdict:** PASS

## AC #5: Existing Dockerfile returns fail

**Test:** `returns fail when Dockerfile already exists` (existing test, covers all stacks)
**Evidence:** When `existsSync` returns `true`, `generateDockerfileTemplate()` returns `{ success: false, error: 'Dockerfile already exists' }`.

**Verdict:** PASS

## AC #6: validateDockerfile passes all 6 rule categories

**Test:** `rust template passes all 6 rule categories`
**Evidence:** Generated Rust template content fed to `validateDockerfile()` returns `{ passed: true, gaps: [] }`. All 6 categories (pinned-from, binary-on-path, verification-tools, no-source-copy, non-root-user, cache-cleanup) pass.

**Verdict:** PASS

## AC #7: Integration — init-project.ts calls generator with 'rust' stack

**Evidence:** `init-project.ts` line 78 calls `generateDockerfileTemplate(projectDir, stack)`. When `detectStack()` returns `'rust'`, the new `else if (stack === 'rust')` branch in the generator produces the Rust template. No changes to `init-project.ts` were needed.

**Verdict:** PASS (integration path exists, no code change needed)

## Coverage

- **dockerfile-template.ts:** 100% statements, 100% branches, 100% functions, 100% lines
- **Overall project:** 97% (above 90% target)
- **Per-file floor:** All 123 files above 80%
