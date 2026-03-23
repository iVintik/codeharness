---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/implementation-artifacts/tech-spec-multi-stack-support.md
---

# Multi-Stack Project Support - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for adding multi-stack project support to codeharness, enabling monorepo projects with multiple languages to get full harness features for all stacks.

## Requirements Inventory

### Functional Requirements

FR1: System detects all stack markers at project root (not early-return)
FR2: System scans immediate subdirectories for stack markers (monorepo layout)
FR3: System returns `StackDetection[]` with stack name + directory for each detected stack
FR4: System migrates state from `stack: string | null` to `stacks: string[]` with backward compat
FR5: System runs coverage detection per-stack independently
FR6: System installs OTLP packages per-stack independently
FR7: System generates multi-stage Dockerfile composing build stages for all detected stacks
FR8: System generates combined AGENTS.md listing all stacks with per-stack build/test commands

### NonFunctional Requirements

NFR1: No file exceeds 300 lines
NFR2: Zero regressions on existing single-stack tests
NFR3: No new npm dependencies
NFR4: `detectStack()` compat wrapper and `state.stack` field preserved — no breaking changes

### Additional Requirements

- Subdirectory scan skips `node_modules`, `.git`, `target`, `__pycache__`, `dist`, `build`, `coverage`
- Detection order: root stacks first (nodejs > python > rust), then subdir stacks alphabetically
- Single-stack output must be identical to current templates (no visual regression)

### FR Coverage Map

| FR | Epic | Story |
|----|------|-------|
| FR1, FR2, FR3 | Epic 1 | 9-1 |
| FR4 | Epic 1 | 9-2 |
| FR5, FR6 | Epic 2 | 9-3 |
| FR7 | Epic 2 | 9-4 |
| FR8 | Epic 2 | 9-5 |

## Epic List

- **Epic 1: Multi-Stack Detection & State** — Detect multiple stacks, subdir scanning, state migration
- **Epic 2: Multi-Stack Consumers** — Per-stack init orchestration, multi-stage Dockerfile, combined docs

## Epic 1: Multi-Stack Detection & State

Enable codeharness to detect all stacks in a project (root and subdirectories) and store them in state with backward compatibility.

### Story 9-1: Multi-stack detection with subdirectory scanning

As a developer with a monorepo containing multiple languages,
I want codeharness to detect all stacks in my project,
So that every language gets harness features instead of just the first detected.

**Acceptance Criteria:**

**Given** a project with `package.json` AND `Cargo.toml` at root
**When** `detectStacks()` is called
**Then** it returns `[{ stack: 'nodejs', dir: '.' }, { stack: 'rust', dir: '.' }]`

**Given** a monorepo with `frontend/package.json` and `backend/Cargo.toml`
**When** `detectStacks()` is called
**Then** it returns `[{ stack: 'nodejs', dir: 'frontend' }, { stack: 'rust', dir: 'backend' }]`

**Given** a single-stack project with only `package.json`
**When** `detectStacks()` is called
**Then** it returns `[{ stack: 'nodejs', dir: '.' }]`
**And** `detectStack()` compat wrapper returns `'nodejs'`

**Given** an empty directory
**When** `detectStacks()` is called
**Then** it returns `[]`
**And** `detectStack()` compat wrapper returns `null`

**Given** a project with `node_modules/some-package/Cargo.toml`
**When** `detectStacks()` scans subdirectories
**Then** `node_modules` is skipped (no false positive)

**Given** root has `package.json` and subdir `api/` has `Cargo.toml`
**When** `detectStacks()` is called
**Then** root stacks appear first, subdir stacks after, sorted alphabetically by dir name

### Story 9-2: State schema migration for multi-stack

As a developer upgrading codeharness,
I want my existing state file to auto-migrate to the new multi-stack format,
So that I don't have to re-initialize.

**Acceptance Criteria:**

**Given** an old state file with `stack: 'nodejs'`
**When** `readState()` is called
**Then** `state.stacks` is `['nodejs']` and `state.stack` is `'nodejs'`

**Given** a new state file with `stacks: ['nodejs', 'rust']`
**When** `readState()` is called
**Then** `state.stacks` is `['nodejs', 'rust']` and `state.stack` is `'nodejs'`

**Given** a state file with neither `stack` nor `stacks`
**When** `readState()` is called
**Then** `state.stacks` is `[]` and `state.stack` is `null`

**Given** state is written via `writeState()`
**When** the file is inspected
**Then** it contains both `stacks: ['nodejs', 'rust']` AND `stack: 'nodejs'` for backward compat

## Epic 2: Multi-Stack Consumers

Update init orchestration, Dockerfile generation, and docs scaffolding to handle multiple stacks.

### Story 9-3: Init orchestrator per-stack iteration

As a developer running `codeharness init` on a multi-stack project,
I want coverage and OTLP to be configured for each detected stack,
So that all languages get observability and test coverage.

**Acceptance Criteria:**

**Given** a multi-stack project (nodejs + rust)
**When** `codeharness init` runs
**Then** coverage tools are detected for each stack independently (c8 for nodejs, cargo-tarpaulin for rust)

**Given** a multi-stack project (nodejs + rust)
**When** `codeharness init` runs
**Then** OTLP packages are installed for each stack independently (npm packages for nodejs, cargo crates for rust)

**Given** a multi-stack project
**When** `codeharness init` runs
**Then** info messages list all detected stacks (e.g., `Stack detected: Node.js (package.json) + Rust (Cargo.toml)`)

**Given** a multi-stack project
**When** state is created
**Then** `state.stacks` contains all detected stack names and `state.app_type` reflects primary stack

### Story 9-4: Multi-stage Dockerfile generation

As a developer deploying a multi-stack project,
I want a single Dockerfile with build stages for each stack,
So that all components are built and packaged together.

**Acceptance Criteria:**

**Given** a multi-stack project (nodejs + rust)
**When** `generateDockerfileTemplate()` is called
**Then** it produces a multi-stage Dockerfile with `node:22-slim` AND `rust:1.82-slim` build stages and a combined `debian:bookworm-slim` runtime stage

**Given** a single-stack project
**When** `generateDockerfileTemplate()` is called
**Then** output is identical to the current single-stack template (no regression)

**Given** a multi-stack Dockerfile
**When** inspected
**Then** each build stage is named `build-{stack}` and the runtime stage copies from all build stages

### Story 9-5: Multi-stack docs and remaining consumers

As a developer initializing a multi-stack project,
I want AGENTS.md and README to reflect all detected stacks,
So that AI agents and humans know how to build/test all components.

**Acceptance Criteria:**

**Given** a multi-stack project
**When** `generateAgentsMdContent()` is called
**Then** it lists build/test commands for all detected stacks

**Given** `['nodejs', 'rust']`
**When** `getStackLabel()` is called
**Then** it returns `'Node.js (package.json) + Rust (Cargo.toml)'`

**Given** a multi-stack project
**When** `getProjectName()` is called
**Then** it tries each stack's project file (package.json name, Cargo.toml [package] name) and returns the first found

**Given** state has `stacks: ['nodejs', 'rust']`
**When** `verify/env.ts` checks for nodejs
**Then** it uses `stacks.includes('nodejs')` instead of `stack === 'nodejs'`

**Given** all changes complete
**When** `npm test` runs
**Then** all existing single-stack tests pass with 0 regressions
