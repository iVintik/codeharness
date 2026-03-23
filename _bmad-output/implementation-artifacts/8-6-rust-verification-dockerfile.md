# Story 8.6: Rust verification Dockerfile

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer verifying a Rust project,
I want a verification environment with Rust tooling, Semgrep, and showboat,
so that automated verification works for Rust projects.

## Acceptance Criteria

1. **AC1:** Given `templates/Dockerfile.verify.rust` exists, when its content is inspected, then it uses `rust:1.82-slim` as base image, installs Python + Semgrep via pipx, installs Node.js + showboat via npm, installs cargo-tarpaulin, and includes curl and jq <!-- verification: cli-verifiable -->
2. **AC2:** Given the verification Dockerfile, when inspected, then OTLP environment variables `OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318`, `OTEL_SERVICE_NAME=codeharness-verify`, `OTEL_TRACES_EXPORTER=otlp`, `OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp` are configured <!-- verification: cli-verifiable -->
3. **AC3:** Given a Rust project (stack = `'rust'`), when `detectProjectType()` is called, then it returns `'rust'` (not `'generic'`) <!-- verification: cli-verifiable -->
4. **AC4:** Given a Rust project, when `buildVerifyImage()` is called, then it uses `Dockerfile.verify.rust` as the template (not the default or generic variant) <!-- verification: cli-verifiable -->
5. **AC5:** Given `resolveDockerfileTemplate(projectDir, 'rust')` is called, when `templates/Dockerfile.verify.rust` exists, then it returns the path to the Rust verification Dockerfile <!-- verification: cli-verifiable -->
6. **AC6:** Given the `ProjectType` type, when inspected, then it includes `'rust'` as a valid union member <!-- verification: cli-verifiable -->
7. **AC7:** Given `codeharness init` runs on a Rust project, when the verification environment build phase executes, then it builds a Rust-specific verification image (not generic) <!-- verification: integration-required -->
8. **AC8:** Given all changes, when `npm test` runs, then all existing tests pass with zero regressions and new Rust verification tests pass <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `templates/Dockerfile.verify.rust` (AC: #1, #2)
  - [x] 1.1 Base image: `FROM rust:1.82-slim`
  - [x] 1.2 System deps: `apt-get install -y --no-install-recommends python3 python3-pip python3-venv pipx curl jq git` + cache cleanup
  - [x] 1.3 Semgrep: `RUN pipx install semgrep && pipx ensurepath` + `ENV PATH="/root/.local/bin:${PATH}"`
  - [x] 1.4 Node.js: Install Node.js 20 LTS via NodeSource (needed for showboat npm package)
  - [x] 1.5 Showboat + Claude Code: `RUN npm install -g showboat @anthropic-ai/claude-code`
  - [x] 1.6 Rust tools: `RUN cargo install cargo-tarpaulin`
  - [x] 1.7 OTLP env vars: all 5 env vars matching existing Dockerfile.verify pattern
  - [x] 1.8 `WORKDIR /workspace`
- [x] Task 2: Add `'rust'` to `ProjectType` union in `src/modules/verify/types.ts` (AC: #6)
  - [x] 2.1 Change `type ProjectType = 'nodejs' | 'python' | 'plugin' | 'generic'` to include `| 'rust'`
- [x] Task 3: Update `detectProjectType()` in `src/modules/verify/env.ts` (AC: #3)
  - [x] 3.1 Add `if (stack === 'rust') return 'rust';` after the Python check and before the plugin check
- [x] Task 4: Update `resolveDockerfileTemplate()` in `src/modules/verify/env.ts` (AC: #5)
  - [x] 4.1 Add `'rust'` variant support: `const filename = variant === 'generic' ? 'Dockerfile.verify.generic' : variant === 'rust' ? 'Dockerfile.verify.rust' : 'Dockerfile.verify';`
- [x] Task 5: Add `buildRustImage()` function in `src/modules/verify/env.ts` (AC: #4)
  - [x] 5.1 Create `buildRustImage(projectDir: string): void` following `buildGenericImage` pattern
  - [x] 5.2 Create temp build context, copy `Cargo.toml`, `Cargo.lock` (if exists), `src/` directory
  - [x] 5.3 Use `resolveDockerfileTemplate(projectDir, 'rust')` for the Dockerfile
  - [x] 5.4 Run `docker build -t codeharness-verify .` in build context
  - [x] 5.5 Clean up temp build context in `finally` block
- [x] Task 6: Route Rust projects in `buildVerifyImage()` (AC: #4)
  - [x] 6.1 Add `else if (projectType === 'rust') { buildRustImage(projectDir); }` after the Python branch (L101)
  - [x] 6.2 Update the generic/plugin hash skip check (L88) to include `'rust'` — Rust projects have `target/` not `dist/`, so hash check should be skipped for now
- [x] Task 7: Add tests in `src/modules/verify/__tests__/verify-env.test.ts` (AC: #3, #5, #6, #8)
  - [x] 7.1 Test: `detectProjectType()` returns `'rust'` when `detectStack()` returns `'rust'`
  - [x] 7.2 Test: `buildVerifyImage()` uses Rust Dockerfile for Rust projects
  - [x] 7.3 Test: `resolveDockerfileTemplate()` resolves `Dockerfile.verify.rust` for variant `'rust'`
- [x] Task 8: Run full test suite — zero regressions (AC: #8)

## Dev Notes

### Critical: showboat is an npm package

showboat is installed via `npm install -g showboat` (see `templates/Dockerfile.verify` L22). The `rust:1.82-slim` base image does NOT include Node.js or npm. The Rust verification Dockerfile MUST install Node.js to get npm for showboat. Use NodeSource to install Node.js 20 LTS:

```dockerfile
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*
```

Alternatively, install curl first in the system deps step, then run the NodeSource script. The order matters.

### Existing Verification Dockerfile Pattern

`templates/Dockerfile.verify` (Node.js) uses:
- `FROM node:20-slim` (has npm built-in)
- `apt-get install ... python3 python3-pip pipx curl jq`
- `pipx install semgrep && pipx ensurepath`
- `npm install -g showboat @anthropic-ai/claude-code`
- 5 OTLP env vars
- `WORKDIR /workspace`

`templates/Dockerfile.verify.generic` uses:
- `FROM node:20-slim`
- `apt-get install ... bash curl jq git`
- `npm install -g showboat @anthropic-ai/claude-code`
- 5 OTLP env vars
- `WORKDIR /workspace` + `COPY . /workspace/`

The Rust variant follows the same structure but replaces the base with `rust:1.82-slim` and adds Node.js explicitly.

### Current Code in env.ts

`detectProjectType()` (L69-78) currently only checks for `'nodejs'`, `'python'`, plugin, or falls through to `'generic'`. Rust projects get `'generic'`. After this story, they get `'rust'`.

`resolveDockerfileTemplate()` (L263-271) uses a simple ternary: `variant === 'generic' ? 'Dockerfile.verify.generic' : 'Dockerfile.verify'`. It must support `variant === 'rust'` mapping to `'Dockerfile.verify.rust'`.

`buildVerifyImage()` (L81-106) routes to `buildNodeImage`, `buildPythonImage`, `buildPluginImage`, or `buildGenericImage`. Add `buildRustImage` in the routing.

### ProjectType type

In `src/modules/verify/types.ts` L122:
```typescript
export type ProjectType = 'nodejs' | 'python' | 'plugin' | 'generic';
```
Add `'rust'` to this union.

### buildRustImage Pattern

Follow `buildGenericImage` (L250-261) pattern — create temp build context, copy Dockerfile, run docker build, clean up. For Rust projects, the build context should include project source since the verification Dockerfile may need to compile code. Use `COPY . /workspace/` at the end of the Dockerfile template to copy project files into the container at build time or mount at runtime.

Actually, looking at the verification Dockerfile's purpose more carefully: it's a **verification environment**, not a deployment image. The verification image provides tools (Semgrep, showboat, tarpaulin, etc.) and the project is mounted at runtime. So the build step just creates the tooling image — no project source needed in the build context.

Follow the `buildGenericImage` pattern exactly:
1. Create temp build context
2. Copy Dockerfile only
3. `docker build -t codeharness-verify .`
4. Clean up

### Hash Check for Rust

The current `buildVerifyImage()` L88 skips hash check for `'generic'` and `'plugin'` project types (they may not have `dist/`). Rust projects similarly have no `dist/` — they have `target/`. Add `'rust'` to the skip list.

### OTLP Environment Variables

All 5 env vars must match the existing pattern exactly:
```dockerfile
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318
ENV OTEL_SERVICE_NAME=codeharness-verify
ENV OTEL_TRACES_EXPORTER=otlp
ENV OTEL_METRICS_EXPORTER=otlp
ENV OTEL_LOGS_EXPORTER=otlp
```

### Architecture Constraints

- **<300 line limit**: `env.ts` is 293 lines. Adding ~20 lines for `buildRustImage` + routing puts it at ~313 lines. May need to extract helper or keep it tight. The `buildRustImage` function should be minimal (follow `buildGenericImage` at 12 lines).
- **No new npm dependencies**: Pure Docker template + routing code.
- **NFR5**: Uses existing `Result<T>` pattern. `ProjectType` union expansion is backward-compatible.

### Do NOT Create

- Do NOT create deployment Dockerfile for Rust (that was story 8-5, already done)
- Do NOT create Semgrep rules for Rust (that's story 8-9)
- Do NOT modify `dockerfile-template.ts` (that's the deployment template, not verification)

### Project Structure Notes

Files to create:
- `templates/Dockerfile.verify.rust` — Rust verification Dockerfile

Files to modify:
- `src/modules/verify/types.ts` L122 — add `'rust'` to `ProjectType` union
- `src/modules/verify/env.ts` L69-78 — add Rust to `detectProjectType()`
- `src/modules/verify/env.ts` L81-106 — add Rust routing in `buildVerifyImage()`
- `src/modules/verify/env.ts` L263-271 — add Rust variant to `resolveDockerfileTemplate()`
- `src/modules/verify/env.ts` — add `buildRustImage()` function
- `src/modules/verify/__tests__/verify-env.test.ts` — add Rust-specific tests

Files for reference only (do NOT modify):
- `templates/Dockerfile.verify` — Node.js pattern to follow
- `templates/Dockerfile.verify.generic` — Generic pattern to follow
- `src/modules/infra/dockerfile-template.ts` — deployment templates (different from verification)
- `src/modules/observability/analyzer.ts` — auto-discovers Semgrep rules (no changes)

### References

- [Source: templates/Dockerfile.verify — Node.js verification Dockerfile pattern]
- [Source: templates/Dockerfile.verify.generic — Generic verification Dockerfile pattern]
- [Source: src/modules/verify/types.ts#L122 — ProjectType union definition]
- [Source: src/modules/verify/env.ts#L69-78 — detectProjectType() function]
- [Source: src/modules/verify/env.ts#L81-106 — buildVerifyImage() routing]
- [Source: src/modules/verify/env.ts#L250-261 — buildGenericImage() pattern to follow]
- [Source: src/modules/verify/env.ts#L263-271 — resolveDockerfileTemplate() function]
- [Source: _bmad-output/planning-artifacts/epics-rust-stack-support.md#FR12 — requirement]
- [Source: _bmad-output/implementation-artifacts/tech-spec-rust-stack-support.md#Task9 — tech spec task]

### Previous Story Intelligence (8-5)

- 8-5 added `rustTemplate()` to `dockerfile-template.ts` — that's the deployment Dockerfile. This story creates the verification Dockerfile in `templates/`.
- 8-5 confirmed the mocking pattern uses `vi.mock('node:fs')` at top level.
- 8-5 had zero regressions on ~2994 tests (1 pre-existing migration.test.ts failure).
- 8-5 touched only `dockerfile-template.ts` and its test — no file overlap with this story.

### Git Intelligence

Recent commits: 79f3449 (8-5 verified), 4e805b9 (8-4 verified), ebaddac (8-3 verified), d6a76bf (8-2 verified).
All Rust stories so far: stack-detect.ts, state.ts, coverage.ts, deps.ts, dockerfile-template.ts + tests.
This story touches `verify/env.ts`, `verify/types.ts`, and their tests — clean isolation from previous work.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/8-6-rust-verification-dockerfile.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/8-6-rust-verification-dockerfile.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Verification Findings

_Last updated: 2026-03-23T07:28Z_

The following ACs failed black-box verification:

### AC1: Dockerfile.verify.rust template content
**Verdict:** FAIL
**Error output:**
```
templates/Dockerfile.verify.rust not shipped in npm package. package.json files array only includes "templates/Dockerfile.verify" — missing entries for Dockerfile.verify.rust and Dockerfile.verify.generic. The template exists in source but is not packaged.
Fix: Add "templates/Dockerfile.verify.rust" and "templates/Dockerfile.verify.generic" to the files array in package.json.
```

### AC2: OTLP environment variables in Dockerfile.verify.rust
**Verdict:** FAIL
**Error output:**
```
Cannot inspect OTLP vars because the Dockerfile.verify.rust template file is not shipped in the npm package (dependency on AC1 fix).
```

### AC7: codeharness init on Rust project builds Rust-specific verification image
**Verdict:** FAIL
**Error output:**
```
Two blockers: (1) No Docker-in-Docker available in verification container. (2) Even with Docker, build would fail because Dockerfile.verify.rust not shipped in npm package.
The Docker-in-Docker limitation is expected (ESCALATE-worthy). The missing template file is a real bug (same as AC1).
```

### AC8: npm test passes with zero regressions
**Verdict:** ESCALATE
**Error output:**
```
No source code available in black-box verification container. Cannot run npm test. Dev agent reports 2998 tests pass, zero regressions. This is genuinely impossible to verify in black-box mode.
```

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Created `templates/Dockerfile.verify.rust` with rust:1.82-slim base, Python+Semgrep via pipx, Node.js 20 via NodeSource, showboat+claude-code via npm, cargo-tarpaulin, all 5 OTLP env vars, WORKDIR /workspace
- Added `'rust'` to `ProjectType` union in types.ts
- Added Rust detection in `detectProjectType()` — returns `'rust'` when `detectStack()` returns `'rust'`
- Updated `resolveDockerfileTemplate()` to resolve `Dockerfile.verify.rust` for variant `'rust'`
- Added `buildRustImage()` function following `buildGenericImage` pattern (Dockerfile-only build context, 300s timeout for cargo install)
- Routed Rust projects in `buildVerifyImage()` and added `'rust'` to the hash-skip list (no dist/ for Rust)
- Updated existing test that expected `'rust'` → `'generic'` to expect `'rust'` → `'rust'`
- Added 3 new tests: Rust image build, no dist/ requirement, Dockerfile template resolution
- Full suite: 2998 tests pass, zero regressions

### File List

- `templates/Dockerfile.verify.rust` (new)
- `src/modules/verify/types.ts` (modified)
- `src/modules/verify/env.ts` (modified)
- `src/modules/verify/__tests__/verify-env.test.ts` (modified)
- `_bmad-output/implementation-artifacts/8-6-rust-verification-dockerfile.md` (modified)
