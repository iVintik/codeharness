---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - architecture-v3.md
  - tech-spec-retro-pipeline-harness-fixes.md
  - tech-spec-rust-stack-support.md
  - tech-spec-multi-stack-support.md
---

# Architecture v3 — Epic Breakdown

## Overview

6 migration phases from architecture-v3.md, mapped to epics 10-15. Each epic ships working software. No backward compatibility — breaking changes are acceptable. State migration handles upgrades automatically.

## Epic List

- **Epic 10: Stack Provider Pattern** — Eliminate 41 if/else branches. One file per language.
- **Epic 11: Unified State** — Consolidate 5 state files into 2. Schema versioning.
- **Epic 12: lib/ Restructuring** — Split oversized files. Domain subdirectories. Thin commands.
- **Epic 13: Agent Abstraction** — Ralph behind an interface. 28 files decoupled.
- **Epic 14: Process & Infra Fixes** — Retro pipeline, tech debt gate, Docker pre-check, observability choice, verify provisioning.
- **Epic 15: Enforcement** — CI file size gate, ESLint rules, boundary tests, template migration.

---

## Epic 10: Stack Provider Pattern

Eliminate all stack conditionals outside `src/lib/stacks/`. Adding a language = adding one file.

### Story 10-1: Create StackProvider interface and registry

As a developer,
I want a StackProvider interface that encapsulates all language-specific behavior,
So that adding a new language requires only one new file.

**Acceptance Criteria:**

**Given** `src/lib/stacks/types.ts` exists
**When** inspected
**Then** it defines `StackProvider` interface with: `name`, `markers`, `displayName`, `detectAppType()`, `getCoverageTool()`, `detectCoverageConfig()`, `getOtlpPackages()`, `installOtlp()`, `getDockerfileTemplate()`, `getDockerBuildStage()`, `getRuntimeCopyDirectives()`, `getBuildCommands()`, `getTestCommands()`, `getSemgrepLanguages()`, `parseTestOutput()`, `parseCoverageReport()`, `getProjectName()`

**Given** `src/lib/stacks/registry.ts` exists
**When** `detectStacks()` is called
**Then** it uses the registry's marker list (not hardcoded checks) to detect stacks

**Given** the registry
**When** `getStackProvider('nodejs')` is called
**Then** it returns the NodejsProvider instance

### Story 10-2: Implement NodejsProvider

As a developer,
I want all Node.js-specific logic in one file,
So that Node.js behavior is encapsulated and testable in isolation.

**Acceptance Criteria:**

**Given** `src/lib/stacks/nodejs.ts` exists
**When** inspected
**Then** it implements all `StackProvider` methods for Node.js: package.json detection, vitest/jest/c8 coverage, npm OTLP packages, Dockerfile template, AGENTS.md commands

**Given** the NodejsProvider
**When** `detectCoverageConfig()` is called on a project with vitest
**Then** it returns the same result as the current `detectNodeCoverageTool()`

**Given** all Node.js if/else branches are removed from `coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`
**When** `npm test` runs
**Then** all tests pass (0 regressions)

### Story 10-3: Implement PythonProvider

As a developer,
I want all Python-specific logic in one file,
So that Python behavior is encapsulated and testable in isolation.

**Acceptance Criteria:**

**Given** `src/lib/stacks/python.ts` exists
**When** inspected
**Then** it implements all `StackProvider` methods for Python: requirements.txt/pyproject.toml/setup.py detection, coverage.py, pip/pipx OTLP packages, Dockerfile template

**Given** all Python if/else branches are removed from consumer files
**When** `npm test` runs
**Then** all tests pass

### Story 10-4: Implement RustProvider

As a developer,
I want all Rust-specific logic in one file,
So that Rust behavior is encapsulated and testable in isolation.

**Acceptance Criteria:**

**Given** `src/lib/stacks/rust.ts` exists
**When** inspected
**Then** it implements all `StackProvider` methods for Rust: Cargo.toml detection, app type (CLI/server/library/agent), cargo-tarpaulin, cargo add OTLP, multi-stage Dockerfile, `[dependencies.foo]` subsection parsing, `'library'` AppType

**Given** all Rust if/else branches are removed from consumer files
**When** `npm test` runs
**Then** all tests pass

### Story 10-5: Migrate all consumers to use StackProvider

As a developer,
I want zero `if (stack === 'nodejs')` patterns outside `src/lib/stacks/`,
So that the stack abstraction doesn't leak.

**Acceptance Criteria:**

**Given** `coverage.ts`, `otlp.ts`, `docs-scaffold.ts`, `dockerfile-template.ts`, `verify/env.ts`, `readme.ts`
**When** inspected
**Then** zero stack string comparisons remain — all use `provider.method()`

**Given** a boundary test exists
**When** it scans `src/` for `stack === 'nodejs'` or `stack === 'python'` or `stack === 'rust'` outside `src/lib/stacks/`
**Then** it finds zero matches

---

## Epic 11: Unified State

Consolidate 5 state files into 2. Schema versioning. Derived views.

### Story 11-1: Unified SprintState schema with versioning

As a developer,
I want one `sprint-state.json` with a versioned schema that contains all sprint runtime data,
So that state is never out of sync.

**Acceptance Criteria:**

**Given** `sprint-state.json` has `version: 2` schema
**When** inspected
**Then** it contains: `stories`, `retries`, `flagged`, `epics`, `session`, `observability`, `run`

**Given** an old `sprint-state.json` without `version` field
**When** `readSprintState()` is called
**Then** it auto-migrates to version 2 schema

**Given** `.story_retries` and `.flagged_stories` files exist
**When** migration runs
**Then** their data is merged into `sprint-state.json` and the files are deleted

### Story 11-2: sprint-status.yaml becomes derived view

As a developer,
I want `sprint-status.yaml` generated from `sprint-state.json`,
So that there's one source of truth with a human-readable view.

**Acceptance Criteria:**

**Given** `sprint-state.json` has story statuses
**When** `generateSprintStatusYaml()` is called
**Then** it writes a valid YAML file matching the current sprint-status.yaml format

**Given** a story status changes in `sprint-state.json`
**When** `writeSprintState()` completes
**Then** `sprint-status.yaml` is regenerated automatically

**Given** harness-run reads story statuses
**When** it queries state
**Then** it reads from `sprint-state.json` directly (not sprint-status.yaml)

### Story 11-3: State reconciliation on session start

As a developer,
I want state consistency verified at the start of every session,
So that desyncs from crashes or manual edits are caught immediately.

**Acceptance Criteria:**

**Given** `sprint-state.json` and `sprint-status.yaml` are out of sync
**When** harness-run Step 1 pre-flight runs `reconcileState()`
**Then** `sprint-state.json` is authoritative and `sprint-status.yaml` is regenerated

---

## Epic 12: lib/ Restructuring

Split oversized files into domain subdirectories. Move business logic from commands to modules.

### Story 12-1: Split coverage.ts into domain subdirectory

As a developer,
I want coverage logic in `src/lib/coverage/` with files under 300 lines each,
So that coverage code is maintainable and testable.

**Acceptance Criteria:**

**Given** `src/lib/coverage/` exists
**When** inspected
**Then** it contains: `index.ts` (<50 lines, re-exports), `types.ts`, `runner.ts`, `evaluator.ts`, `parser.ts`

**Given** each file in `src/lib/coverage/`
**When** line count is checked
**Then** no file exceeds 300 lines

**Given** `parseTestCounts()` in `parser.ts`
**When** cargo workspace output is mixed with pytest-like output
**Then** cargo aggregation fires first (ordering guard test exists)

### Story 12-2: Split docker.ts, otlp.ts, beads-sync.ts, doc-health.ts

As a developer,
I want all 832/590/422/378-line files split into domain subdirectories,
So that the entire codebase respects the 300-line limit.

**Acceptance Criteria:**

**Given** `src/lib/docker/` with `compose.ts`, `health.ts`, `cleanup.ts`
**And** `src/lib/observability/` with `instrument.ts`, `config.ts`, `backends.ts`
**And** `src/lib/sync/` with `beads.ts`, `sprint-yaml.ts`, `story-files.ts`
**When** each file is checked
**Then** no file exceeds 300 lines

**Given** all splits complete
**When** `npm test` runs
**Then** all tests pass with 0 regressions

### Story 12-3: Move business logic from status.ts command to status module

As a developer,
I want `src/commands/status.ts` under 100 lines with logic in `src/modules/status/`,
So that status logic is testable without command wiring.

**Acceptance Criteria:**

**Given** `src/modules/status/` with `index.ts`, `formatters.ts`, `endpoints.ts`, `drill-down.ts`
**When** `src/commands/status.ts` is inspected
**Then** it's under 100 lines — just arg parsing, module call, output formatting

**Given** `src/modules/status/endpoints.ts`
**When** `buildScopedEndpoints()` is called
**Then** it produces the same URLs as the current `status.ts` implementation

### Story 12-4: Shared test utilities and fixtures

As a developer,
I want reusable test helpers and fixtures,
So that tests don't duplicate mock setup across 50+ files.

**Acceptance Criteria:**

**Given** `src/lib/__tests__/fixtures/` exists
**When** inspected
**Then** it contains: `cargo-toml-variants.ts`, `state-builders.ts`, `mock-factories.ts`

**Given** `src/lib/__tests__/helpers.ts` exists
**When** test files import from it
**Then** common patterns (mock Docker, mock fs, create temp state) are one-liners

---

## Epic 13: Agent Abstraction

Ralph behind an AgentDriver interface.

### Story 13-1: Create AgentDriver interface and types

As a developer,
I want an `AgentDriver` interface that abstracts agent execution,
So that Ralph can be replaced or supplemented without touching 28 files.

**Acceptance Criteria:**

**Given** `src/lib/agents/types.ts` exists
**When** inspected
**Then** it defines `AgentDriver`, `AgentProcess`, `AgentEvent` types

**Given** the `AgentEvent` type
**When** inspected
**Then** it covers: `tool-start`, `tool-complete`, `text`, `story-complete`, `story-failed`, `iteration`, `retry`, `result`

### Story 13-2: Implement RalphDriver

As a developer,
I want Ralph wrapped in an `AgentDriver` implementation,
So that ralph-specific behavior is isolated in one file.

**Acceptance Criteria:**

**Given** `src/lib/agents/ralph.ts` exists
**When** inspected
**Then** it implements `AgentDriver` with: `spawn()` (builds ralph.sh args), `parseOutput()` (parses ralph stderr + stream-json)

**Given** `run-helpers.ts` ralph-specific functions (`parseRalphMessage`, `parseIterationMessage`, `buildSpawnArgs`)
**When** migration completes
**Then** they're moved into `ralph.ts` and `run-helpers.ts` is deleted

### Story 13-3: Migrate run.ts to use AgentDriver

As a developer,
I want `run.ts` to use `AgentDriver` instead of directly spawning Ralph,
So that the run command is agent-agnostic.

**Acceptance Criteria:**

**Given** `src/commands/run.ts`
**When** inspected
**Then** it imports `AgentDriver` and calls `driver.spawn()`, not `spawn('bash', [ralphPath, ...])`

**Given** `resolveRalphPath()` in run.ts
**When** migration completes
**Then** it's moved into `ralph.ts` and run.ts uses `driver.getExecutablePath()`

---

## Epic 14: Process & Infrastructure Fixes

Retro pipeline, tech debt gate, Docker fixes, observability choice, verify provisioning.

### Story 14-1: Retro-to-sprint pipeline (Step 8b) + persistent epic-TD

As a developer running harness-run,
I want retro action items to auto-create stories under epic-TD,
So that tech debt gets tracked and prioritized automatically.

**Acceptance Criteria:**

**Given** a retro file with `### Fix Now` items
**When** Step 8b runs
**Then** new `TD-N-slug: backlog` entries appear in sprint-state.json under epic-TD

**Given** `epic-TD` doesn't exist
**When** Step 8b creates the first TD story
**Then** `epic-TD` is created with `status: in-progress` (never transitions to `done`)

**Given** a duplicate action item (80%+ word overlap with existing TD story)
**When** Step 8b processes it
**Then** it's skipped with `[INFO]` message

### Story 14-2: Tech debt gate in story selection

As a developer,
I want TD stories prioritized before new feature work,
So that debt gets paid before it accumulates further.

**Acceptance Criteria:**

**Given** `epic-TD` has 3 backlog stories and a feature epic has 5 backlog stories
**When** harness-run Step 2 selects next story
**Then** TD stories are selected first

**Given** all TD stories are `done`
**When** Step 2 selects next story
**Then** feature epic stories are selected normally

### Story 14-3: Docker pre-check and orphan cleanup

As a developer,
I want Docker availability checked BEFORE any verification attempt,
So that sessions don't burn 30 minutes on Docker failures.

**Acceptance Criteria:**

**Given** Docker daemon is not running
**When** harness-run Step 1 pre-flight runs
**Then** it fails fast with `[FAIL] Docker not available` without attempting any verification

**Given** a leftover `codeharness-verify` container from a crashed session
**When** Step 1 pre-flight runs
**Then** the orphaned container is removed

### Story 14-4: Observability backend choice (Victoria vs ELK vs Remote)

As a developer initializing codeharness,
I want to choose my observability backend and provide remote endpoints,
So that I'm not locked into VictoriaMetrics with hardcoded ports.

**Acceptance Criteria:**

**Given** `codeharness init --observability-backend elk`
**When** init runs
**Then** state stores `otlp.backend: 'elk'` and ELK compose is used

**Given** `codeharness init --otel-endpoint https://remote:4318 --logs-url https://remote:9200`
**When** init runs
**Then** no local Docker stack is started and state stores remote endpoints

**Given** `otlp.backend` is `'elk'`
**When** `codeharness status --check-docker` runs
**Then** it checks ELK containers (not Victoria)

### Story 14-5: Stack-aware verification Dockerfile generation

As a developer verifying a Rust/Bevy project,
I want the verification Dockerfile generated with the correct toolchain and system libs,
So that verification doesn't waste time fixing container issues manually.

**Acceptance Criteria:**

**Given** a Rust project with `bevy` in Cargo.toml
**When** `verify-env build` runs
**Then** the generated Dockerfile includes: correct Rust version, Bevy system libs (wayland, udev, alsa, x11, xkbcommon, fontconfig), clippy, cargo-tarpaulin

**Given** `ENV PATH="/root/.cargo/bin:$PATH"` in the generated Dockerfile
**When** `cargo tarpaulin` is run inside the container
**Then** it works without manual `source "$HOME/.cargo/env"`

### Story 14-6: Subagent status ownership + time budget awareness

As a developer running harness-run,
I want the orchestrator to own all status writes and respect time budgets,
So that status is always correct and sessions don't fail at verification.

**Acceptance Criteria:**

**Given** a subagent completes dev-story but doesn't update sprint-state.json
**When** the orchestrator checks after subagent return
**Then** it updates the status itself

**Given** 10 minutes remaining and next phase is verification (~20min)
**When** harness-run checks budget
**Then** it defers with `[INFO] deferring verify to next session`

### Story 14-7: Fix beads sync, session flags, ralph story tracking, proof docs

As a developer,
I want chronic infrastructure bugs fixed,
So that sessions stop wasting time on known issues.

**Acceptance Criteria:**

**Given** a story file with `## Status: backlog` header
**When** `readStoryFileStatus()` runs
**Then** it returns `'backlog'` (handles `##` prefix)

**Given** `bd` CLI is not installed
**When** `codeharness sync` runs
**Then** it prints `[INFO] beads CLI not installed — skipping` (not `[FAIL]`)

**Given** `cargo test` passes
**When** `codeharness.local.md` is checked
**Then** `session_flags.tests_passed` is `true`

**Given** ralph times out during a story
**When** timeout report is generated
**Then** `status.json` contains the correct `story` field (not `unknown`)

**Given** the codeharness proof format
**When** `commands/harness-verify.md` is read
**Then** the expected markdown structure is documented

---

## Epic 15: Enforcement

CI gates, ESLint rules, boundary tests, template migration.

### Story 15-1: CI file size gate + fix remaining violations

As a developer,
I want a CI check that fails if any `.ts` file exceeds 300 lines,
So that file size debt stops accumulating.

**Acceptance Criteria:**

**Given** CI pipeline runs
**When** any `.ts` file in `src/` (excluding `__tests__/`) exceeds 300 lines
**Then** the build fails with the filename and line count

**Given** all file splits from Epic 12 are complete
**When** CI gate is enabled
**Then** it passes (zero violations)

### Story 15-2: ESLint no-empty-catch + boundary tests

As a developer,
I want automated enforcement of error handling and module boundaries,
So that architectural rules aren't just documented but enforced.

**Acceptance Criteria:**

**Given** ESLint runs
**When** a catch block is empty (no `// IGNORE:` comment)
**Then** it reports an error

**Given** a boundary test scans `src/`
**When** it finds `stack === 'nodejs'` outside `src/lib/stacks/`
**Then** the test fails

**Given** a boundary test scans module imports
**When** a module imports from another module's internal file (not index.ts)
**Then** the test fails

### Story 15-3: Template migration — all templates to static files

As a developer,
I want all templates in `templates/` as static files (not generated in TypeScript),
So that there's one template system.

**Acceptance Criteria:**

**Given** `templates/dockerfiles/`, `templates/prompts/`, `templates/docs/` directories
**When** inspected
**Then** they contain all Dockerfile templates, prompt templates, and doc templates that were previously in `src/templates/*.ts`

**Given** `src/templates/` TypeScript generators
**When** migration completes
**Then** they're replaced with `renderTemplate()` calls reading from `templates/`

**Given** `renderTemplate('templates/dockerfiles/Dockerfile.nodejs', { TARBALL: 'package.tgz' })`
**When** called
**Then** it returns the same Dockerfile content as the current `nodejsTemplate()` function

### Story 15-4: Fix ~40 TS compilation errors in test files

As a developer,
I want `npx tsc --noEmit` to produce zero errors,
So that type safety is enforced across the entire codebase.

**Acceptance Criteria:**

**Given** `npx tsc --noEmit` is run
**When** it completes
**Then** zero compilation errors (down from ~40)

**Given** the fixes
**When** inspected
**Then** they're type annotation changes only — no logic changes

### Story 15-5: Lint rule for bare exception swallowing

As a developer,
I want code review to flag `except Exception: pass` (Python) and empty catch blocks,
So that error swallowing doesn't cause silent production incidents.

**Acceptance Criteria:**

**Given** code-review subagent reviews Python code
**When** it finds `except Exception: pass`
**Then** it flags it as HIGH severity

**Given** `post-write-check.sh` hook runs after writing a Python file
**When** the file contains `except Exception: pass`
**Then** it prints a warning
