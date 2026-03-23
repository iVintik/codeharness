---
title: 'Multi-Stack Project Support'
slug: 'multi-stack-support'
created: '2026-03-23'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['typescript', 'vitest']
files_to_modify:
  - src/lib/stack-detect.ts
  - src/lib/otlp.ts
  - src/lib/coverage.ts
  - src/lib/state.ts
  - src/modules/infra/dockerfile-template.ts
  - src/modules/infra/docs-scaffold.ts
  - src/modules/infra/init-project.ts
  - src/commands/init.ts
  - src/templates/readme.ts
  - src/modules/infra/types.ts
  - src/modules/verify/env.ts
  - src/commands/teardown.ts
code_patterns:
  - 'stack: string | null → stacks: string[] throughout'
  - 'Primary stack = stacks[0] for backward compat'
  - 'Per-stack iteration for coverage, OTLP, docs'
test_patterns:
  - 'Multi-stack fixtures: dir with package.json + Cargo.toml'
  - 'Monorepo fixtures: frontend/package.json + backend/Cargo.toml'
  - 'Single-stack backward compat tests must not regress'
---

# Tech-Spec: Multi-Stack Project Support

**Created:** 2026-03-23

## Overview

### Problem Statement

`detectStack()` returns a single `string | null`. Monorepo projects with `frontend/` (TS) + `backend/` (Rust) get only the first match. Coverage, OTLP, Dockerfile, and docs only target one stack. ~20 function signatures take `stack: string | null`. Projects with multiple stacks lose harness features for all stacks except the first detected.

### Solution

Change `detectStack()` to return `string[]` (array of all detected stacks). Each consumer iterates over stacks: coverage runs per-stack, OTLP installs per-stack, docs lists all stacks. Dockerfile uses a single multi-stage build. State stores `stacks: string[]` instead of `stack: string | null`. Add subdirectory scanning (1 level deep) for monorepo layout detection. Maintain backward compatibility via `stacks[0]` as primary stack.

### Scope

**In Scope:**
- `detectStack()` returns `string[]` with all detected stacks
- Subdirectory scanning for monorepo layouts (1 level deep)
- Per-stack coverage (run each stack's tool, report independently)
- Per-stack OTLP installation
- Combined docs scaffolding (list all stacks in AGENTS.md)
- Single Dockerfile with multi-stage build for all stacks
- State migration: `stack: string | null` → `stacks: string[]`
- Backward compat: primary stack = `stacks[0]` for consumers that need a single value

**Out of Scope:**
- Deep nested monorepo scanning (only 1 level)
- Per-stack verification Dockerfiles (one combined)
- Workspace-level Cargo.toml detection within a TS monorepo
- Custom per-subdirectory config

## Context for Development

### Codebase Patterns

- ~20 function signatures take `stack: string | null` — all need updating to `stacks: string[]` or providing a compat shim
- `HarnessState.stack` is persisted in YAML frontmatter — needs migration path
- All stack conditionals (`if stack === 'nodejs'`) become iteration (`for (const stack of stacks)`) or primary-stack access (`stacks[0]`)
- Tests use single-stack fixtures — need multi-stack variants added

### Files to Reference

| File | Purpose | Key Touchpoints |
| ---- | ------- | --------------- |
| `src/lib/stack-detect.ts` | `detectStack()` L7-14, `detectAppType()` L100 | Core: return `StackDetection[]` instead of `string \| null`. Add `readdirSync` for subdir scan. `detectAppType()` signature stays — called per-stack. |
| `src/lib/state.ts` | `HarnessState` L7-41 | Add `stacks: string[]`, deprecate `stack: string \| null`. Migration in `readState()`. |
| `src/lib/coverage.ts` | `detectCoverageTool()` L35-53, `runCoverage()` L194 | Callers pass single stack — no change to internal API. Init pipeline iterates stacks and calls per-stack. |
| `src/lib/otlp.ts` | `instrumentProject()` L345, `configureOtlpEnvVars()` L308 | Same — single-stack API. Init pipeline calls per-stack. |
| `src/modules/infra/dockerfile-template.ts` | `generateDockerfileTemplate()` L112 | New: `generateMultiStackDockerfile(stacks[])`. Composes per-stack build stages + combined runtime. |
| `src/modules/infra/docs-scaffold.ts` | `getStackLabel()` L50, `generateAgentsMdContent()` L63 | New overloads accepting `string[]`. Concat labels, concat build commands. |
| `src/modules/infra/init-project.ts` | `initProjectInner()` L51-162 | Core orchestrator: L68 `detectStack()` → `detectStacks()`. Loop over results for coverage, OTLP, app type. State gets `stacks[]`. |
| `src/modules/infra/types.ts` | `InitResult` L65, L77 | `stack: string \| null` → `stacks: string[]`. Keep `stack` as getter alias. |
| `src/modules/verify/env.ts` | Stack checks | Update to check `stacks.includes()` instead of `=== 'nodejs'`. |
| `src/commands/teardown.ts` | Stack reference | Minor — reads from state, uses primary stack. |
| `src/templates/readme.ts` | `getInstallCommand()` L72 | Accept `string[]`, render per-stack install commands. |

### Technical Decisions

- **New type:** `StackDetection = { stack: string; dir: string }` — `dir` is the directory where the stack marker was found (root or subdirectory).
- **Return type:** `detectStacks()` returns `StackDetection[]` (empty = no stack detected). Keep `detectStack()` as compat wrapper returning `stacks[0]?.stack ?? null`.
- **Subdirectory scanning:** Use `readdirSync(dir, { withFileTypes: true })` to list immediate children. For each directory child, check for stack markers. Skip `node_modules`, `.git`, `target`, `__pycache__`, `dist`, `build`.
- **Primary stack:** `stacks[0]` is primary. Detection order: root-level stacks first (nodejs > python > rust), then subdirectory stacks sorted alphabetically by dir name.
- **State migration:** New field `stacks: string[]`. `readState()` checks: if `stacks` exists, use it. If only `stack` exists (old format), convert to `stacks: [stack]`. `writeState()` always writes `stacks`. Keep `stack` field for backward compat = `stacks[0] ?? null`.
- **Coverage:** `init-project.ts` iterates `stacks` and calls `detectCoverageTool(dir)` per stack. `coverage.ts` internals unchanged — they already detect stack from the dir they're given.
- **OTLP:** `init-project.ts` iterates `stacks` and calls `instrumentProject(stackDir, stack)` per stack. Env vars shared (same endpoint/service name).
- **Dockerfile:** New `generateMultiStackDockerfile(detections: StackDetection[])` composes stages. If single stack, output identical to current templates. If multi-stack, one build stage per stack + combined runtime.
- **Docs:** `generateAgentsMdContent()` accepts `StackDetection[]`. Lists all stacks with per-stack build/test commands. `getStackLabel()` accepts `string[]` and joins with ` + `.
- **App type:** Per-stack. `detectAppType()` called for each stack independently. State stores `app_types: Record<string, AppType>` alongside primary `app_type: stacks[0]'s type`.
- **Minimal API surface change strategy:** Most consumers (`coverage.ts`, `otlp.ts`, `dockerfile-template.ts`) keep their single-stack signatures. The orchestrator (`init-project.ts`) loops over stacks. This minimizes blast radius — only the orchestrator and state/detection layers change significantly.

## Implementation Plan

### Tasks

Tasks ordered by dependency — core types first, then detection, then consumers.

- [ ] Task 1: Define `StackDetection` type and update `detectStack()`
  - File: `src/lib/stack-detect.ts`
  - Action: Add `export interface StackDetection { stack: string; dir: string; }`. Create `detectStacks(dir)` that: (1) checks root for all stack markers (not early-return), collecting all matches; (2) scans immediate subdirectories (skip `node_modules`, `.git`, `target`, `__pycache__`, `dist`, `build`, `coverage`) for stack markers; (3) returns `StackDetection[]` ordered: root stacks first (nodejs > python > rust), then subdir stacks sorted by dir name. Keep `detectStack()` as compat wrapper: `return detectStacks(dir)[0]?.stack ?? null`.
  - Notes: Use `readdirSync(dir, { withFileTypes: true })` for subdir scan. Filter `dirent.isDirectory()`. Root detection collects ALL matches (remove early returns).

- [ ] Task 2: Update state schema and migration
  - File: `src/lib/state.ts`
  - Action: Add `stacks: string[]` to `HarnessState`. Keep `stack: string | null` as deprecated compat field. In `readState()`: if `stacks` exists use it; if only `stack` exists convert `[stack]`; if neither, `[]`. In `writeState()`: always write `stacks`, also write `stack: stacks[0] ?? null` for compat. Update `getDefaultState()` to accept `string[]`.
  - Notes: This is the migration path. Old state files with `stack: 'nodejs'` auto-upgrade to `stacks: ['nodejs']`.

- [ ] Task 3: Update init orchestrator to loop over stacks
  - File: `src/modules/infra/init-project.ts`
  - Action: L68: replace `detectStack(projectDir)` with `detectStacks(projectDir)`. Store `StackDetection[]`. Iterate for: app type detection (per-stack), coverage tool (per-stack using detection.dir), OTLP instrumentation (per-stack using detection.dir). Pass primary stack to Dockerfile generation. Update state creation: `state.stacks = detections.map(d => d.stack)`, `state.stack = stacks[0] ?? null`. Update info messages to list all detected stacks.
  - Notes: This is the main orchestration change. Coverage and OTLP internals stay single-stack — only the loop changes.

- [ ] Task 4: Update `InitResult` and infra types
  - File: `src/modules/infra/types.ts`
  - Action: Change `stack: string | null` to `stacks: string[]` in `InitResult`. Keep `stack` as computed getter or set to `stacks[0] ?? null`. Update `dockerfile` type if needed.

- [ ] Task 5: Multi-stack Dockerfile generation
  - File: `src/modules/infra/dockerfile-template.ts`
  - Action: Add `generateMultiStackDockerfile(detections: StackDetection[]): string` that composes build stages from existing per-stack templates. Single stack = identical to current output. Multi-stack = one `FROM ... AS build-{stack}` per stack + combined `FROM debian:bookworm-slim` runtime copying from all build stages. Update `generateDockerfileTemplate()` to accept `StackDetection[]` and delegate.
  - Notes: Reuse existing `nodejsTemplate()`, `pythonTemplate()`, `rustTemplate()` as building blocks. Extract build vs runtime sections.

- [ ] Task 6: Multi-stack docs scaffolding
  - File: `src/modules/infra/docs-scaffold.ts`
  - Action: Update `getStackLabel()` to accept `string | string[]` — if array, join with ` + ` (e.g., `Node.js + Rust`). Update `getCoverageTool()` to accept `string | string[]` — if array, return primary stack's tool. Update `generateAgentsMdContent()` to accept `string | StackDetection[]` — if array, list build/test commands for each stack. Update `getProjectName()` — try each stack's project file.
  - Notes: Overloaded signatures maintain backward compat for existing callers.

- [ ] Task 7: Update remaining consumers
  - Files: `src/modules/verify/env.ts`, `src/commands/teardown.ts`, `src/templates/readme.ts`
  - Action: `verify/env.ts`: change `state.stack === 'nodejs'` to `state.stacks?.includes('nodejs')`. `teardown.ts`: read `stacks` from state, use primary for any stack-specific cleanup. `readme.ts`: accept `string[]`, render per-stack install commands.
  - Notes: Minor changes — these files have 1-2 stack references each.

- [ ] Task 8: Tests for all changes
  - Files: `src/lib/__tests__/stack-detect.test.ts`, `src/lib/__tests__/state.test.ts`, `src/modules/infra/__tests__/init-project.test.ts`, `src/modules/infra/__tests__/dockerfile-template.test.ts`, `src/modules/infra/__tests__/docs-scaffold.test.ts`
  - Action: Add multi-stack test cases: (1) root with `package.json` + `Cargo.toml` → detects both; (2) monorepo `frontend/package.json` + `backend/Cargo.toml` → detects both with correct dirs; (3) single-stack backward compat — all existing tests pass unchanged; (4) state migration — old `stack` field auto-converts to `stacks`; (5) multi-stack Dockerfile — multiple build stages; (6) multi-stack AGENTS.md — lists all stacks; (7) empty dir → `[]` not `null`.
  - Notes: Use `vi.mock('node:fs')` to simulate monorepo directory structures. Create fixtures for various layouts.

### Acceptance Criteria

- [ ] AC1: Given a project with `package.json` AND `Cargo.toml` at root, when `detectStacks()` is called, then it returns `[{ stack: 'nodejs', dir: '.' }, { stack: 'rust', dir: '.' }]`
- [ ] AC2: Given a monorepo with `frontend/package.json` and `backend/Cargo.toml`, when `detectStacks()` is called, then it returns `[{ stack: 'nodejs', dir: 'frontend' }, { stack: 'rust', dir: 'backend' }]`
- [ ] AC3: Given a single-stack project with only `package.json`, when `detectStacks()` is called, then it returns `[{ stack: 'nodejs', dir: '.' }]` and `detectStack()` returns `'nodejs'`
- [ ] AC4: Given an empty directory, when `detectStacks()` is called, then it returns `[]` and `detectStack()` returns `null`
- [ ] AC5: Given an old state file with `stack: 'nodejs'`, when `readState()` is called, then `state.stacks` is `['nodejs']` and `state.stack` is `'nodejs'`
- [ ] AC6: Given a multi-stack project, when `codeharness init` runs, then coverage tools are detected for each stack independently
- [ ] AC7: Given a multi-stack project, when `codeharness init` runs, then OTLP packages are installed for each stack independently
- [ ] AC8: Given a multi-stack project (nodejs + rust), when `generateDockerfileTemplate()` is called, then it produces a multi-stage Dockerfile with both `node:22-slim` and `rust:1.82-slim` build stages
- [ ] AC9: Given a single-stack project, when `generateDockerfileTemplate()` is called, then output is identical to current single-stack template (no regression)
- [ ] AC10: Given a multi-stack project, when `generateAgentsMdContent()` is called, then it lists build/test commands for all detected stacks
- [ ] AC11: Given a multi-stack project, when `getStackLabel()` is called with `['nodejs', 'rust']`, then it returns `'Node.js (package.json) + Rust (Cargo.toml)'`
- [ ] AC12: Given all changes, when `npm test` runs, then all existing single-stack tests pass with 0 regressions

## Additional Context

### Dependencies

- No new npm dependencies. Uses `readdirSync` from `node:fs` (already imported).
- No changes to the CLI interface — `codeharness init` works the same, just detects more.

### Testing Strategy

- **Unit tests:** Mock `readdirSync` and `existsSync` to simulate monorepo layouts. Test detection ordering (root first, then subdirs). Test state migration (old → new format). Test single-stack backward compat exhaustively.
- **Integration tests:** None required — init pipeline integration is already tested.
- **Manual testing:** Create a real monorepo (`mkdir -p frontend backend && cd frontend && npm init -y && cd ../backend && cargo init`) and run `codeharness init`.
- **Regression safety:** All existing single-stack tests must pass unchanged. `detectStack()` wrapper ensures callers that haven't migrated still work.

### Notes

- **Blast radius is small:** Only 3 files change significantly (stack-detect, state, init-project). The other 8 files have 1-3 line changes each. Coverage, OTLP, and Dockerfile internals stay single-stack.
- **No breaking changes:** `detectStack()` still works. `HarnessState.stack` still works. Old state files auto-migrate. This is purely additive.
- **Future: per-subdir config.** If users want different coverage targets or OTLP endpoints per stack, that's a future feature. For now, harness-level config applies to all stacks.
- **Subdir skip list is important:** Must skip `node_modules`, `.git`, `target`, etc. to avoid false positives (e.g., `node_modules/some-package/Cargo.toml`).
