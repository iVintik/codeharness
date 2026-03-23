# Story 8.5: Rust Dockerfile template generation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer deploying a Rust project,
I want codeharness to generate a multi-stage Dockerfile,
so that I get a minimal runtime image with just the compiled binary.

## Acceptance Criteria

1. **AC1:** Given a Rust project (stack = `'rust'`) without a Dockerfile, when `generateDockerfileTemplate('/project', 'rust')` is called, then it writes a Dockerfile and returns `ok({ path: '/project/Dockerfile', stack: 'rust' })` — NOT `'generic'` <!-- verification: cli-verifiable -->
2. **AC2:** Given the generated Rust Dockerfile content, when inspected, then it contains a multi-stage build: a `FROM rust:1.82-slim AS builder` stage and a `FROM debian:bookworm-slim` runtime stage <!-- verification: cli-verifiable -->
3. **AC3:** Given the generated Rust Dockerfile content, when inspected, then the builder stage includes `cargo build --release` and the runtime stage uses `COPY --from=builder` to copy the compiled binary <!-- verification: cli-verifiable -->
4. **AC4:** Given the generated Rust Dockerfile content, when inspected, then the runtime stage installs `curl` and `jq` via `apt-get install`, runs as a non-root user, and includes `rm -rf /var/lib/apt/lists/*` cache cleanup <!-- verification: cli-verifiable -->
5. **AC5:** Given a Rust project with an existing Dockerfile, when `generateDockerfileTemplate()` is called, then it returns `fail('Dockerfile already exists')` <!-- verification: cli-verifiable -->
6. **AC6:** Given the generated Rust Dockerfile, when `validateDockerfile()` is called against it, then it passes all 6 rule categories with zero gaps <!-- verification: cli-verifiable -->
7. **AC7:** Given `codeharness init` runs on a Rust project without a Dockerfile, when the Dockerfile template generation phase executes, then it generates a Rust-specific Dockerfile (not generic) <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Add `rustTemplate()` function to `src/modules/infra/dockerfile-template.ts` (AC: #2, #3, #4)
  - [x]1.1 Create `rustTemplate(): string` returning a multi-stage Dockerfile string
  - [x]1.2 Builder stage: `FROM rust:1.82-slim AS builder`, `WORKDIR /build`, `COPY . .`, `RUN cargo build --release`
  - [x]1.3 Runtime stage: `FROM debian:bookworm-slim`, `apt-get install curl jq`, `rm -rf /var/lib/apt/lists/*`, `COPY --from=builder /build/target/release/myapp /usr/local/bin/myapp`, `USER nobody`, `WORKDIR /workspace`
  - [x]1.4 Include inline section comments matching existing template style
- [x] Task 2: Add `'rust'` branch to `generateDockerfileTemplate()` (AC: #1)
  - [x]2.1 In the if/else chain (lines 99-108), add `else if (stack === 'rust')` BEFORE the generic fallthrough
  - [x]2.2 Set `content = rustTemplate()` and `resolvedStack = 'rust'`
- [x] Task 3: Update existing test that asserts `'rust'` maps to `'generic'` (AC: #1)
  - [x]3.1 In `src/modules/infra/__tests__/dockerfile-template.test.ts` line 167, the test `'generates generic Dockerfile when stack is unknown'` passes `'rust'` and expects `stack: 'generic'` — this MUST change
  - [x]3.2 Replace `'rust'` in that test with a different unknown stack (e.g., `'java'`) so the generic fallthrough test still works
- [x] Task 4: Add new `describe('generateDockerfileTemplate — rust')` test block (AC: #1, #2, #3, #4)
  - [x]4.1 Test: returns `stack: 'rust'` and correct path
  - [x]4.2 Test: contains `FROM rust:1.82-slim AS builder` and `FROM debian:bookworm-slim`
  - [x]4.3 Test: includes `cargo build --release` in builder stage
  - [x]4.4 Test: includes `COPY --from=builder` to copy compiled binary
  - [x]4.5 Test: includes `curl` and `jq` verification tools
  - [x]4.6 Test: includes `USER nobody` for non-root execution
  - [x]4.7 Test: includes apt cache cleanup (`rm -rf /var/lib/apt/lists/*`)
  - [x]4.8 Test: includes inline section comments (`# Build`, `# System utilities`, `# Install`, `# Run as non-root`)
- [x] Task 5: Add Rust template to validation compliance tests (AC: #6)
  - [x]5.1 In the `describe('generated Dockerfiles pass validateDockerfile()')` block (line 273), add a `'rust template passes all 6 rule categories'` test
  - [x]5.2 Generate Rust template, feed content to `validateDockerfile()` via mocked `readFileSync`, assert `passed: true` and `gaps: []`
- [x] Task 6: Run full test suite — zero regressions

## Dev Notes

### Current Code Structure

`src/modules/infra/dockerfile-template.ts` (119 lines) has three template functions and one generator:
- `nodejsTemplate()` L21 → single-stage, `FROM node:22-slim`, `npm install -g` from tarball
- `pythonTemplate()` L41 → single-stage, `FROM python:3.12-slim`, `pip install` from wheel
- `genericTemplate()` L59 → single-stage, `FROM node:22-slim`, placeholder
- `generateDockerfileTemplate(projectDir, stack)` L82 → if/else chain: `'nodejs'` → `'python'` → else (generic)

Currently `'rust'` falls through to the `else` branch and produces a generic Dockerfile. After this story, it gets its own dedicated multi-stage template.

### Multi-Stage Build — Why Different

Existing templates (nodejs, python) are single-stage because they install from pre-built artifacts (tarball, wheel). Rust compiles from source to a static binary — the builder stage is needed to compile, then only the binary is copied to a minimal runtime image. This is standard Rust Docker practice.

### Validator Compatibility Analysis (AC6)

The 6 rule categories in `dockerfile-validator.ts` and how the Rust template passes:

1. **pinned-from** (L71): Checks all `FROM` lines for version tags. Both `rust:1.82-slim` and `debian:bookworm-slim` have version tags. **PASSES.**
2. **binary-on-path** (L85): Regex `/COPY\s+--from=/i` at L90 matches `COPY --from=builder ...`. **PASSES.**
3. **verification-tools** (L97): Looks for `curl` and `jq` on `apt-get install` lines. **PASSES.**
4. **no-source-copy** (L116): Regex checks for `COPY src/`, `COPY lib/`, `COPY test/`. **CRITICAL**: The builder stage uses `COPY . .` which does NOT match these patterns. Do NOT use `COPY src/ src/` in the builder stage — it triggers the validator. Use `COPY . .` instead. **PASSES with `COPY . .`.**
5. **non-root-user** (L129): Checks for `USER` instruction with non-root user. `USER nobody` qualifies. **PASSES.**
6. **cache-cleanup** (L144): Checks for `rm -rf /var/lib/apt/lists/`. **PASSES.**

### Template Content

```dockerfile
# === Builder stage ===
FROM rust:1.82-slim AS builder

WORKDIR /build

# Copy project files
COPY . .

# Build release binary
RUN cargo build --release

# === Runtime stage ===
FROM debian:bookworm-slim

# System utilities for verification
RUN apt-get update && apt-get install -y --no-install-recommends curl jq && rm -rf /var/lib/apt/lists/*

# Install compiled binary from builder (update 'myapp' to your binary name)
COPY --from=builder /build/target/release/myapp /usr/local/bin/myapp

# Run as non-root user
USER nobody

WORKDIR /workspace
```

The binary name `myapp` is a placeholder — same approach as `genericTemplate()` using `placeholder`. Users edit it. Do NOT attempt to read `Cargo.toml` at generation time.

### Breaking Test at Line 167

The existing test at line 164-172:
```typescript
it('generates generic Dockerfile when stack is unknown', () => {
    mockExistsSync.mockReturnValue(false);
    const r = generateDockerfileTemplate('/project', 'rust');
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stack).toBe('generic');
    }
  });
```

This test uses `'rust'` as the "unknown stack" example. After adding the Rust branch, this breaks. **Fix**: Replace `'rust'` with `'java'` (or any other unsupported stack) in this test, and create a separate Rust-specific test block.

### init-project.ts Integration (AC7)

`init-project.ts` line 78 already calls `generateDockerfileTemplate(projectDir, stack)`. When `detectStack()` returns `'rust'`, the generator now produces the Rust template. No changes to `init-project.ts` needed.

### Architecture Constraints

- **<300 line limit**: Adding ~30 lines to 119-line file = ~149 lines. Safe.
- **No new npm dependencies**: Pure string template.
- **NFR5**: Uses existing `Result<T>`, `DockerfileTemplateResult` type. No type changes.

### Project Structure Notes

Files to modify:
- `src/modules/infra/dockerfile-template.ts` — add `rustTemplate()` + branch
- `src/modules/infra/__tests__/dockerfile-template.test.ts` — update generic test, add rust test block + validation test

Files for reference only (do NOT modify):
- `src/modules/infra/dockerfile-validator.ts` — validator rules
- `src/modules/infra/init-project.ts` — calls generator (no changes needed)
- `src/modules/infra/index.ts` — re-exports (no changes needed)

### References

- [Source: src/modules/infra/dockerfile-template.ts#L82-118 — generateDockerfileTemplate function with if/else chain]
- [Source: src/modules/infra/dockerfile-template.ts#L21-74 — existing template functions pattern]
- [Source: src/modules/infra/__tests__/dockerfile-template.test.ts#L164-172 — existing test mapping rust→generic (MUST UPDATE)]
- [Source: src/modules/infra/__tests__/dockerfile-template.test.ts#L271-333 — validation compliance test block (ADD RUST)]
- [Source: src/modules/infra/dockerfile-validator.ts#L86-95 — checkBinaryOnPath accepts COPY --from=]
- [Source: src/modules/infra/dockerfile-validator.ts#L116-127 — checkNoSourceCopy regex (avoid COPY src/)]
- [Source: src/modules/infra/init-project.ts#L78 — generateDockerfileTemplate called during init]
- [Source: _bmad-output/planning-artifacts/epics-rust-stack-support.md#FR4 — requirement]

### Previous Story Intelligence (8-4)

- 8-4 added cargo-tarpaulin to dependency registry. Zero regressions on ~2980 tests.
- 8-4 only touched `deps.ts` and `deps.test.ts` — no file overlap with this story.
- Mocking pattern in dockerfile-template tests uses `vi.mock('node:fs')` at top level with `vi.mocked()` — follow this exact pattern.

### Git Intelligence

Recent commits: 4e805b9 (8-4 verified), ebaddac (8-3 verified), d6a76bf (8-2 verified), 4c7f498 (8-1 detection).
All Rust stories so far modified: `stack-detect.ts`, `state.ts`, `coverage.ts`, `deps.ts` + tests.
This story touches only `dockerfile-template.ts` and its test — clean isolation from previous work.

### Do NOT Duplicate

- Story 4-2 created `dockerfile-template.ts` with nodejs/python/generic. This story EXTENDS it.
- Story 8-6 will create `templates/Dockerfile.verify.rust` (verification Dockerfile). Do NOT create verification templates here.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-5-rust-dockerfile-template.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-5-rust-dockerfile-template.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- All 6 tasks completed. 34/34 dockerfile-template tests pass.
- 1 pre-existing failure in migration.test.ts (unrelated to this story).
- Zero regressions: 2994/2995 tests pass across full suite.

### File List

- `src/modules/infra/dockerfile-template.ts` — added `rustTemplate()` function and `'rust'` branch in if/else chain
- `src/modules/infra/__tests__/dockerfile-template.test.ts` — fixed generic test (rust→java), added 8 Rust tests, added Rust validation compliance test
- `src/modules/infra/AGENTS.md` — updated dockerfile-template.ts entry to include rust (review fix)
- `docs/exec-plans/active/8-5-rust-dockerfile-template.proof.md` — showboat proof document (review fix)
