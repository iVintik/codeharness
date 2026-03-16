# Story 13.1: Verification Environment Setup

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want `codeharness verify-env` to prepare both the clean workspace and Docker container for verification,
So that the verifier agent is structurally isolated from source code and the tested software runs safely in Docker.

## Acceptance Criteria

1. **Given** the developer runs `codeharness verify-env build`, **when** the project has a valid `package.json` (Node.js) or built dist (Python), **then** it builds a Docker image (`codeharness-verify`) from an embedded Dockerfile template that installs the project as a user would (`npm install` from `package.json` for Node.js, `pip install` from built dist for Python), includes `curl`, `jq`, `showboat`, contains NO source code, **and** sets OTEL environment variables in the container pointing to `host.docker.internal:4318` (host observability stack). (AC:1) <!-- verification: cli-verifiable -->

2. **Given** the developer runs `codeharness verify-env prepare --story {story-key}`, **when** a valid story key is provided, **then** it creates a clean temp workspace at `/tmp/codeharness-verify-{story-key}/` containing ONLY: `story.md` (copied from `_bmad-output/implementation-artifacts/{story-key}.md`), `README.md` (copied from project root), `docs/` (copied from project root), `verification/` (empty directory for proof output) — and NO `src/`, NO `tests/`, NO `.git/`, NO `node_modules/`. (AC:2) <!-- verification: cli-verifiable -->

3. **Given** the developer runs `codeharness verify-env check`, **when** a Docker image has been built, **then** it validates: Docker image exists, CLI works inside the container (`docker run --rm codeharness-verify codeharness --version`), **and** observability endpoints are reachable from inside the container. (AC:3) <!-- verification: integration-required -->

4. **Given** a clean build environment, **when** `codeharness verify-env build` runs, **then** Docker image build completes in less than 2 minutes (NFR29). (AC:4) <!-- verification: cli-verifiable -->

5. **Given** the Docker image has been built previously, **when** `dist/` content hash has not changed, **then** the image is NOT rebuilt (cache hit). **When** `dist/` content hash has changed, **then** the image IS rebuilt. The hash is stored in the state file for cache invalidation. (AC:5) <!-- verification: cli-verifiable -->

6. **Given** the developer runs `codeharness verify-env build --json`, **when** the build completes, **then** it outputs structured JSON with at minimum: image tag, image size, and build time. (AC:6) <!-- verification: cli-verifiable -->

7. **Given** the developer runs `codeharness verify-env cleanup --story {story-key}`, **when** a temp workspace and/or container exist for that story, **then** it removes the temp workspace at `/tmp/codeharness-verify-{story-key}/` and stops/removes the container. (AC:7) <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `verify-env` subcommand group in Commander.js (AC: 1, 2, 3, 6, 7)
  - [x] 1.1: Add `src/commands/verify-env.ts` with Commander subcommands: `build`, `prepare`, `check`, `cleanup`
  - [x] 1.2: Register `verify-env` in `src/cli.ts` (or equivalent entry point)
  - [x] 1.3: Wire `--json` flag on `build` subcommand
  - [x] 1.4: Wire `--story <key>` option on `prepare` and `cleanup` subcommands

- [x]Task 2: Create Dockerfile template (AC: 1)
  - [x]2.1: Add `src/templates/verify-dockerfile.ts` as a TypeScript string literal template (per Architecture Decision 6 — all templates are TypeScript string literals)
  - [x]2.2: Template installs project as a user would: `npm install -g` from packed tarball (Node.js) or `pip install` from dist (Python)
  - [x]2.3: Template includes `curl`, `jq`, `showboat` in the image
  - [x]2.4: Template sets OTEL environment variables: `OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318`, `OTEL_SERVICE_NAME=codeharness-verify`
  - [x]2.5: Template explicitly excludes source code — only built artifact enters the image

- [x]Task 3: Implement `verify-env build` (AC: 1, 4, 5, 6)
  - [x]3.1: Create `src/lib/verify-env.ts` with `buildVerifyImage(options)` function
  - [x]3.2: Detect project stack (reuse `stack-detect.ts`) and select appropriate install strategy (npm vs pip)
  - [x]3.3: Compute `dist/` content hash (SHA-256 of all files in dist/) and compare against hash stored in state file
  - [x]3.4: If hash matches, skip build and report cache hit
  - [x]3.5: If hash differs (or no prior build), generate Dockerfile from template, run `docker build -t codeharness-verify .`
  - [x]3.6: Store new hash in state file after successful build
  - [x]3.7: Measure build time and image size (`docker image inspect`)
  - [x]3.8: When `--json` flag is set, output `{ "imageTag": "codeharness-verify", "imageSize": "...", "buildTimeMs": N, "cached": boolean }`
  - [x]3.9: Use `ok()`, `fail()`, `info()`, `jsonOutput()` from `src/lib/output.ts` for consistent CLI output

- [x]Task 4: Implement `verify-env prepare` (AC: 2)
  - [x]4.1: Add `prepareVerifyWorkspace(storyKey, projectDir)` function to `src/lib/verify-env.ts`
  - [x]4.2: Validate story key with same pattern as `isValidStoryId()` in `src/commands/verify.ts`
  - [x]4.3: Create `/tmp/codeharness-verify-{story-key}/` directory
  - [x]4.4: Copy story file from `_bmad-output/implementation-artifacts/{story-key}.md` → `story.md`
  - [x]4.5: Copy `README.md` from project root
  - [x]4.6: Copy `docs/` directory from project root (if exists)
  - [x]4.7: Create empty `verification/` directory
  - [x]4.8: Verify exclusions — assert that `src/`, `tests/`, `.git/`, `node_modules/` do NOT exist in the workspace

- [x]Task 5: Implement `verify-env check` (AC: 3)
  - [x]5.1: Add `checkVerifyEnv()` function to `src/lib/verify-env.ts`
  - [x]5.2: Check Docker image exists: `docker image inspect codeharness-verify`
  - [x]5.3: Check CLI works inside container: `docker run --rm codeharness-verify codeharness --version`
  - [x]5.4: Check observability endpoints reachable from container: `docker run --rm --add-host=host.docker.internal:host-gateway codeharness-verify curl -sf http://host.docker.internal:4318/v1/status`
  - [x]5.5: Report pass/fail for each check with clear error messages

- [x]Task 6: Implement `verify-env cleanup` (AC: 7)
  - [x]6.1: Add `cleanupVerifyEnv(storyKey)` function to `src/lib/verify-env.ts`
  - [x]6.2: Remove temp workspace directory `/tmp/codeharness-verify-{story-key}/`
  - [x]6.3: Stop and remove container if running: `docker stop codeharness-verify-{story-key}` + `docker rm`
  - [x]6.4: Handle gracefully if workspace or container doesn't exist (idempotent)

- [x]Task 7: Unit tests (AC: 1, 2, 3, 5, 6, 7)
  - [x]7.1: Test Dockerfile template generation produces valid Dockerfile with OTEL env vars and no source code references
  - [x]7.2: Test `dist/` hash computation and cache invalidation logic
  - [x]7.3: Test workspace preparation creates correct file structure and excludes forbidden directories
  - [x]7.4: Test cleanup is idempotent (no error when workspace/container doesn't exist)
  - [x]7.5: Test `--json` output structure from build command
  - [x]7.6: Test story key validation rejects path traversal and invalid characters
  - [x]7.7: Test stack detection selects correct install strategy (npm vs pip)

- [x]Task 8: Integration tests (AC: 3, 4)
  - [x]8.1: Test full build→check→cleanup cycle with Docker (requires Docker daemon running)
  - [x]8.2: Test build time is under 2 minutes (NFR29)
  - [x]8.3: Test observability endpoint reachability from inside container (requires observability stack running)

## Dev Notes

### Architecture Constraints

- **CLI orchestrates all verification** (Architecture Decision 8). The verify-env command owns Docker image lifecycle and workspace preparation — agents do not build images or prepare workspaces directly.
- **All templates are TypeScript string literals** (Architecture Decision 6). The Dockerfile template lives in `src/templates/verify-dockerfile.ts`, not as a standalone Dockerfile.
- **Two-layer isolation** (Architecture Decision 10). Clean workspace prevents source code access. Docker container protects the host environment. OTEL telemetry flows from container to host observability stack.
- **State file is the contract** — dist/ hash for cache invalidation is stored in `.claude/codeharness.local.md` YAML frontmatter.

### Existing Code to Reuse

- `detectStack()` in `src/lib/stack-detect.ts` — detects Node.js vs Python from project files
- `readState()` / `writeState()` in `src/lib/state.ts` — state file read/write for hash storage
- `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` from `src/lib/output.ts` — standard CLI output helpers
- `isValidStoryId()` pattern from `src/commands/verify.ts` — story key validation
- `execFileSync` from `node:child_process` — used throughout for Docker commands
- Docker management patterns from `src/lib/docker.ts` — existing Docker Compose lifecycle management

### Key File Locations

| File | Purpose |
|------|---------|
| `src/commands/verify-env.ts` | **NEW** — Commander subcommand group for verify-env |
| `src/lib/verify-env.ts` | **NEW** — Core logic: build, prepare, check, cleanup |
| `src/templates/verify-dockerfile.ts` | **NEW** — Dockerfile template (TypeScript string literal) |
| `src/lib/state.ts` | Store/read dist/ hash for cache invalidation |
| `src/lib/stack-detect.ts` | Detect project stack for install strategy |
| `src/lib/docker.ts` | Existing Docker management patterns |
| `src/lib/output.ts` | CLI output helpers (ok, fail, info, jsonOutput) |
| `src/lib/__tests__/verify-env.test.ts` | **NEW** — Unit tests |

### Anti-Patterns to Avoid

- Do NOT copy source code into the Docker image — the entire point is black-box isolation. The image gets the built artifact only.
- Do NOT hardcode Node.js as the only stack — use `detectStack()` to support Python as well.
- Do NOT skip hash comparison on build — the cache invalidation is critical for performance (NFR29 < 2 min applies to cold builds; cached builds should be near-instant).
- Do NOT put the Dockerfile as a standalone file in `templates/` — it must be a TypeScript string literal per Architecture Decision 6.
- Do NOT share filesystem between verifier session and main session — the workspace at `/tmp/` is the isolation boundary.
- Do NOT trust that Docker is always available — check and report clearly if it's missing.

### Evidence Model (from Architecture Decision 10)

| Tier | Type | Example |
|------|------|---------|
| PRIMARY | `docker exec` exercising CLI | `docker exec codeharness-verify codeharness init --json` |
| PRIMARY | Observability query | `curl localhost:9428/select/logsql/query?query=...` |
| SUPPLEMENTARY | showboat verify reproducibility | `showboat verify proof.md` |
| REJECTED | grep against source code | `grep -n 'pattern' src/lib/foo.ts` |
| REJECTED | Unit test output as primary evidence | `npm run test:unit` alone |

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Epic 13, Story 13.1]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 10 (Black-Box Verification)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 6 (TypeScript string literal templates)]
- [Source: _bmad-output/planning-artifacts/architecture.md, Decision 8 (CLI orchestrates verification)]
- [Source: _bmad-output/planning-artifacts/prd.md, FR80-FR82, NFR29]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-16.md]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x]Showboat proof document created (`docs/exec-plans/active/13-1-verification-dockerfile-generator.proof.md`)
- [x]All acceptance criteria verified with real-world evidence
- [x]Test coverage meets target (100%)

## Documentation Requirements

- [x]Relevant AGENTS.md files updated (list modules touched)
- [x]Exec-plan created in `docs/exec-plans/active/13-1-verification-dockerfile-generator.md`

## Testing Requirements

- [x]Unit tests written for all new/changed code
- [x]Integration tests for cross-module interactions
- [x]Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
