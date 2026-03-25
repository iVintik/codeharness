# Story 14.5: Stack-Aware Verification Dockerfile Generation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- verification-tier: unit-testable -->

## Story

As a developer verifying a Rust/Bevy project,
I want the verification Dockerfile generated with the correct toolchain and system libs,
So that verification doesn't waste time fixing container issues manually.

## Acceptance Criteria

1. Given a Rust project with `bevy` in Cargo.toml dependencies, when `verify-env build` runs, then the generated Dockerfile includes: Rust toolchain via rustup, Bevy system libs (`libudev-dev`, `libasound2-dev`, `libwayland-dev`, `libxkbcommon-dev`, `libfontconfig1-dev`, `libx11-dev`), `clippy`, and `cargo-tarpaulin` <!-- verification: cli-verifiable -->
2. Given `ENV PATH="/root/.cargo/bin:$PATH"` in the generated Dockerfile, when `cargo tarpaulin` is run inside the container, then it executes without requiring manual `source "$HOME/.cargo/env"` <!-- verification: cli-verifiable -->
3. Given a Node.js project (package.json at root), when `verify-env build` runs, then the generated Dockerfile includes Node.js 20 LTS, npm, Semgrep, showboat, and claude-code CLI — matching current `Dockerfile.verify` functionality <!-- verification: cli-verifiable -->
4. Given a Python project (setup.py or pyproject.toml at root), when `verify-env build` runs, then the generated Dockerfile includes Python 3, pip, venv, Semgrep, and verification tooling <!-- verification: cli-verifiable -->
5. Given a Rust project WITHOUT `bevy` in Cargo.toml, when `verify-env build` runs, then the generated Dockerfile includes Rust toolchain, clippy, and cargo-tarpaulin but NOT the Bevy system libs <!-- verification: cli-verifiable -->
6. Given the `StackProvider` interface in `src/lib/stacks/types.ts`, when `getVerifyDockerfileSection()` is added, then all three providers (Nodejs, Python, Rust) implement the method and TypeScript compiles with zero errors <!-- verification: cli-verifiable -->
7. Given a multi-stack project (e.g., root has both package.json and Cargo.toml), when `verify-env build` runs, then the generated Dockerfile includes tooling for ALL detected stacks <!-- verification: cli-verifiable -->
8. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
9. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
10. Given the 300-line NFR1 rule, when line counts are checked, then `env.ts` does not grow beyond its current 313 lines (already over limit — should shrink or stay flat by extracting the generator to a separate file) <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 6): Add `getVerifyDockerfileSection(projectDir: string): string` to `StackProvider` interface in `src/lib/stacks/types.ts`
  - [x]The method takes `projectDir` so providers can inspect project files (e.g., Cargo.toml for Bevy detection)
  - [x]Return type is `string` — a Dockerfile snippet (RUN/ENV lines) for that stack's tooling

- [x] Task 2 (AC: 3): Implement `getVerifyDockerfileSection()` on `NodejsProvider` in `src/lib/stacks/nodejs.ts`
  - [x]Install Node.js 20 LTS via nodesource
  - [x]Install Semgrep via pipx
  - [x]Install showboat and claude-code via npm
  - [x]Match current `Dockerfile.verify` functionality

- [x] Task 3 (AC: 4): Implement `getVerifyDockerfileSection()` on `PythonProvider` in `src/lib/stacks/python.ts`
  - [x]Install python3-pip, python3-venv
  - [x]Install coverage, pytest
  - [x]Install Semgrep via pipx

- [x] Task 4 (AC: 1, 2, 5): Implement `getVerifyDockerfileSection()` on `RustProvider` in `src/lib/stacks/rust.ts`
  - [x]Install Rust toolchain via rustup (`curl ... | sh -s -- -y --default-toolchain stable`)
  - [x]Install clippy (`rustup component add clippy`)
  - [x]Install cargo-tarpaulin (`cargo install cargo-tarpaulin`)
  - [x]Set `ENV PATH="/root/.cargo/bin:$PATH"` for PATH inheritance
  - [x]Detect Bevy: read Cargo.toml at `projectDir`, check `[dependencies]` section for `bevy`
  - [x]If Bevy detected, add system libs: `libudev-dev libasound2-dev libwayland-dev libxkbcommon-dev libfontconfig1-dev libx11-dev`
  - [x]If Bevy NOT detected, skip system libs
  - [x]Use existing `readTextSafe` and `getCargoDepsSection`/`hasCargoDep` utils from `src/lib/stacks/utils.ts`

- [x] Task 5 (AC: 1, 3, 4, 5, 7): Create `src/modules/verify/dockerfile-generator.ts` with `generateVerifyDockerfile()`
  - [x]Function signature: `generateVerifyDockerfile(projectDir: string): string`
  - [x]Call `detectStacks(projectDir)` to get all detected stacks
  - [x]Build Dockerfile from sections:
    1. Base image: `FROM ubuntu:22.04`
    2. Common tools: `curl jq git python3 pipx`
    3. Semgrep: `pipx install semgrep && pipx ensurepath`
    4. Per-stack sections: iterate detections, call `getStackProvider(detection.stack).getVerifyDockerfileSection(projectDir)`
    5. OTLP env vars: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, etc.
    6. `WORKDIR /workspace`
  - [x]Return the complete Dockerfile as a string
  - [x]Keep file under 100 lines

- [x] Task 6 (AC: 1, 3, 7, 10): Update `src/modules/verify/env.ts` to use `generateVerifyDockerfile()`
  - [x]Replace `buildSimpleImage()` calls for `rust` and `generic` with new generator path
  - [x]Replace `buildNodeImage()` Dockerfile resolution with generated Dockerfile
  - [x]Replace `buildPythonImage()` Dockerfile resolution with generated Dockerfile
  - [x]Write generated Dockerfile to build context instead of copying from templates
  - [x]Remove or deprecate `resolveDockerfileTemplate()` and `DOCKERFILE_VARIANTS` constant
  - [x]Goal: reduce `env.ts` line count (currently 313) or at minimum keep it flat

- [x] Task 7 (AC: 1, 2, 5, 7): Add unit tests for the generator
  - [x]Test: Rust project with bevy -> Dockerfile contains Bevy system libs
  - [x]Test: Rust project without bevy -> Dockerfile does NOT contain Bevy system libs
  - [x]Test: Rust Dockerfile contains `ENV PATH="/root/.cargo/bin:$PATH"`
  - [x]Test: Node.js project -> Dockerfile contains Node.js 20, npm, showboat
  - [x]Test: Python project -> Dockerfile contains python3-pip, coverage
  - [x]Test: Multi-stack project -> Dockerfile contains sections for all stacks
  - [x]Test: Generic/plugin project -> Dockerfile contains only base + common tools

- [x] Task 8 (AC: 6, 8): Add unit tests for each provider's `getVerifyDockerfileSection()`
  - [x]Test: `RustProvider.getVerifyDockerfileSection()` with Bevy project
  - [x]Test: `RustProvider.getVerifyDockerfileSection()` without Bevy
  - [x]Test: `NodejsProvider.getVerifyDockerfileSection()` returns Node.js section
  - [x]Test: `PythonProvider.getVerifyDockerfileSection()` returns Python section

- [x] Task 9 (AC: 8): Run `npm run build` — TypeScript compilation succeeds
- [x] Task 10 (AC: 9): Run `npm test` — all existing tests pass, zero regressions
- [x] Task 11 (AC: 10): Verify line counts — `env.ts` should not grow, new `dockerfile-generator.ts` under 100 lines

## Dev Notes

### Architecture Compliance

- **Decision 10 (Stack-Aware Provisioning):** This story implements the core of Decision 10. The architecture mandates that verification Dockerfiles are GENERATED per-project from stack provider methods, not selected from static templates. The current static template approach (`Dockerfile.verify`, `Dockerfile.verify.rust`, `Dockerfile.verify.generic`) is replaced by dynamic generation.
- **NFR1 (300-line limit):** `env.ts` is already at 313 lines (over limit). This story should REDUCE it by extracting the generator to `dockerfile-generator.ts`. Do NOT add lines to `env.ts`.
- **NFR5 (Commands <100 lines):** `verify-env.ts` is at 157 lines — do not touch it beyond import changes if needed.

### Implementation Guidance

#### Current State Assessment

1. **`src/modules/verify/env.ts`** (313 lines) — Contains `buildVerifyImage()`, `buildNodeImage()`, `buildPythonImage()`, `buildSimpleImage()`, `buildPluginImage()`, and `resolveDockerfileTemplate()`. These use STATIC templates from `templates/Dockerfile.verify*`. This story replaces the template selection with dynamic generation.
2. **Static templates exist:**
   - `templates/Dockerfile.verify` — Node.js verification (node:20-slim base, npm pack, install from tarball)
   - `templates/Dockerfile.verify.rust` — Rust verification (rust:1.82-slim base, semgrep, tarpaulin, Node.js)
   - `templates/Dockerfile.verify.generic` — Generic/plugin verification
3. **`StackProvider` interface** (`src/lib/stacks/types.ts`, 96 lines) — Has `getDockerfileTemplate()`, `getDockerBuildStage()`, `getRuntimeCopyDirectives()` for app Dockerfiles, but NO verify-specific method.
4. **`RustProvider`** (239 lines) has `hasCargoDep()` utility already importable from `utils.ts` — use it for Bevy detection.
5. **`detectStacks()`** returns `StackDetection[]` with `{ stack: StackName, dir: string }` — use this for multi-stack support.

#### What to add

**`src/lib/stacks/types.ts`** — Add to `StackProvider` interface:
```typescript
/** Return Dockerfile snippet for verification environment tooling. */
getVerifyDockerfileSection(projectDir: string): string;
```

**`src/lib/stacks/rust.ts`** — New method on `RustProvider`:
- Detect Bevy via `hasCargoDep(getCargoDepsSection(cargoContent), 'bevy')`
- Return Dockerfile lines for: rustup install, clippy, tarpaulin, PATH env, and conditional Bevy system libs
- Reuse existing `readTextSafe`, `getCargoDepsSection`, `hasCargoDep` from `utils.ts`

**`src/lib/stacks/nodejs.ts`** — New method on `NodejsProvider`:
- Return Dockerfile lines for: Node.js 20 via nodesource, npm global tools (showboat, claude-code)

**`src/lib/stacks/python.ts`** — New method on `PythonProvider`:
- Return Dockerfile lines for: pip, venv, coverage, pytest

**`src/modules/verify/dockerfile-generator.ts`** — NEW file:
- `generateVerifyDockerfile(projectDir: string): string`
- Calls `detectStacks()`, iterates providers, assembles Dockerfile
- Base image: `ubuntu:22.04` (common base for multi-stack)
- Common layer: curl, jq, git, python3, pipx, semgrep
- Per-stack sections from providers
- OTLP env vars
- Target: under 100 lines

**`src/modules/verify/env.ts`** — Modify build functions:
- Replace template-based builds with `generateVerifyDockerfile()` calls
- Write generated Dockerfile to build context as a string (use `writeFileSync`)
- Remove `resolveDockerfileTemplate()` and `DOCKERFILE_VARIANTS` (dead code)
- Goal: reduce line count from 313

#### What NOT to do

- Do NOT delete the static template files yet — they may be used by older installed versions. Mark them as deprecated in comments.
- Do NOT change the `buildVerifyImage()` public API — it's called from `verify-env.ts` command.
- Do NOT change `detectProjectType()` — it's used for build strategy selection (npm pack vs simple build).
- Do NOT add Bevy detection as a separate function in env.ts — it belongs in `RustProvider.getVerifyDockerfileSection()`.
- Do NOT hardcode Rust version — use `stable` toolchain via rustup, not a pinned version.

#### Important: Node.js verify path

The current `buildNodeImage()` uses `npm pack` to create a tarball, then builds from `Dockerfile.verify` which COPYs and installs the tarball. The generated Dockerfile approach needs to preserve this `npm pack` + `COPY tarball` + `npm install -g` flow for Node.js projects. The `NodejsProvider.getVerifyDockerfileSection()` provides the NODE TOOLING section, but the tarball install logic stays in `buildNodeImage()` which writes additional Dockerfile lines into the build context.

Consider: `generateVerifyDockerfile()` returns the BASE + TOOLING portion. Build-specific steps (tarball copy, project mount) are appended by the build function in `env.ts`.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect, vi } from 'vitest'`
- Create new test file: `src/modules/verify/__tests__/dockerfile-generator.test.ts`
- Extend existing: `src/lib/stacks/__tests__/` for provider method tests
- Mock `detectStacks()` to return controlled stack detections
- Mock filesystem reads (`readTextSafe`) for Bevy detection tests
- Existing test patterns: see `src/modules/verify/__tests__/verify-env.test.ts` for env.ts mocking approach

### Previous Story Intelligence (14-4)

- Story 14-4 added `--observability-backend` (victoria/elk/none) support. `docker-setup.ts` ended at exactly 300 lines. `formatters.ts` grew by 23 lines (574 to 597).
- The 300-line limit was strictly enforced. Files at the limit required extraction or minimal changes.
- `env.ts` at 313 lines is ALREADY over the limit — this story should bring it down or at minimum not increase it.
- Test patterns: Vitest with `vi.mock()` for module mocking, `vi.fn()` for function stubs.
- Build verification: `npm run build` must succeed. `npm test` must pass all ~3683 vitest tests.

### Key Observations About Existing Code

1. **`buildSimpleImage()`** in `env.ts` calls `resolveDockerfileTemplate(projectDir, variant)` which looks up `DOCKERFILE_VARIANTS` map and finds the file in `templates/`. This is the function to replace.
2. **`buildNodeImage()`** calls `resolveDockerfileTemplate(projectDir)` (no variant) which finds `templates/Dockerfile.verify`. This needs the tarball-specific logic preserved.
3. **`buildPythonImage()`** also calls `resolveDockerfileTemplate(projectDir)` — same base template as Node.
4. **`buildPluginImage()`** calls `resolveDockerfileTemplate(projectDir, 'generic')` — uses generic template.
5. **The `writeFileSync` import is NOT currently in `env.ts`** — you'll need to add it for writing generated Dockerfiles.
6. **`getStackProvider()` can return `undefined`** — handle the case where no provider is registered for a detected stack.

### Project Structure Notes

- `src/modules/verify/` — Verification module. New `dockerfile-generator.ts` goes here.
- `src/lib/stacks/` — Stack providers. Interface change in `types.ts`, implementation in each provider.
- `templates/` — Static templates. Will become deprecated but not deleted.

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md lines 465-503] — Decision 10: Stack-Aware Provisioning
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 385-399] — Story 14-5 epic definition
- [Source: src/modules/verify/env.ts] — Current verify env (313 lines) — main modification target
- [Source: src/lib/stacks/types.ts] — StackProvider interface (96 lines) — add method
- [Source: src/lib/stacks/rust.ts] — RustProvider (239 lines) — add getVerifyDockerfileSection
- [Source: src/lib/stacks/nodejs.ts] — NodejsProvider (346 lines) — add getVerifyDockerfileSection
- [Source: src/lib/stacks/python.ts] — PythonProvider (280 lines) — add getVerifyDockerfileSection
- [Source: src/lib/stacks/utils.ts] — readTextSafe, getCargoDepsSection, hasCargoDep utilities
- [Source: templates/Dockerfile.verify.rust] — Current static Rust verify template (will be deprecated)
- [Source: templates/Dockerfile.verify] — Current static Node.js verify template (will be deprecated)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/14-5-stack-aware-verify-dockerfile.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/14-5-stack-aware-verify-dockerfile.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 11 tasks completed. 20 new tests added (8 provider tests + 12 generator tests), all 3712 tests passing.
- env.ts reduced from 313 to 304 lines (net -9). dockerfile-generator.ts is 63 lines (under 100 limit).
- Removed `resolveDockerfileTemplate()` and `DOCKERFILE_VARIANTS` dead code from env.ts.
- Updated 1 existing test in verify-env.test.ts (template resolution test replaced with generated Dockerfile test).

### Change Log

- 2026-03-25: Story created with 10 ACs (2 from epic, 8 derived from architecture Decision 10, existing code audit, multi-stack support, line-limit enforcement, and regression prevention). Full implementation guidance with file locations, line budgets, current-state assessment, Node.js tarball path notes, and anti-patterns. Status set to ready-for-dev.
- 2026-03-25: Implementation complete. All tasks done. Status set to review.

### File List

- `src/lib/stacks/types.ts` — Added `getVerifyDockerfileSection()` to `StackProvider` interface
- `src/lib/stacks/nodejs.ts` — Implemented `getVerifyDockerfileSection()` on NodejsProvider
- `src/lib/stacks/python.ts` — Implemented `getVerifyDockerfileSection()` on PythonProvider
- `src/lib/stacks/rust.ts` — Implemented `getVerifyDockerfileSection()` on RustProvider (with Bevy detection)
- `src/modules/verify/dockerfile-generator.ts` — NEW: `generateVerifyDockerfile()` assembles Dockerfile from stack providers
- `src/modules/verify/env.ts` — Replaced template-based builds with generated Dockerfiles, removed dead code
- `src/modules/verify/__tests__/dockerfile-generator.test.ts` — NEW: 12 tests for generator
- `src/lib/stacks/__tests__/verify-dockerfile-section.test.ts` — NEW: 8 tests for provider methods
- `src/modules/verify/__tests__/verify-env.test.ts` — Updated: mocked generator, replaced obsolete template test
