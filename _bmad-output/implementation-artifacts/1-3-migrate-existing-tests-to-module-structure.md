# Story 1.3: Migrate Existing Tests to Module Structure

Status: verifying

## Story

As a developer,
I want existing tests reorganized into module `__tests__/` directories,
so that each module is independently testable.

## Acceptance Criteria

1. **Given** existing tests in `src/lib/__tests__/`, **When** migrated, **Then** verify-related tests (`verify.test.ts`, `verify-blackbox.test.ts`, `verify-prompt.test.ts`, `verify-env.test.ts`, `verify-parser.test.ts`, `verifier-session.test.ts`) move to `src/modules/verify/__tests__/`. <!-- verification: cli-verifiable -->
2. **Given** the migration, **When** all tests run (`npm test`), **Then** all pass with no regressions. <!-- verification: cli-verifiable -->
3. **Given** the migration, **When** coverage measured (`npm run test -- --coverage`), **Then** overall coverage does not decrease below current baseline (lines: 95.96%, statements: 95.37%, functions: 98.4%, branches: 85.1%). <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x]Task 1: Identify verify-related tests for migration (AC: #1)
  - [x]Catalog all test files in `src/lib/__tests__/` that test verify functionality
  - [x]Map each test file to its source file in `src/lib/` to confirm module affiliation:
    - `verify.test.ts` -> tests `src/lib/verify.ts` (core verify orchestration)
    - `verify-blackbox.test.ts` -> tests black-box verification logic
    - `verify-prompt.test.ts` -> tests verification prompt generation
    - `verify-env.test.ts` -> tests `src/lib/verify-env.ts` (environment checks)
    - `verify-parser.test.ts` -> tests `src/lib/verify-parser.ts` (proof parsing)
    - `verifier-session.test.ts` -> tests verifier session management
  - [x]Confirm no non-verify tests have verify dependencies that would break

- [x]Task 2: Move verify-related tests to `src/modules/verify/__tests__/` (AC: #1)
  - [x]Move `verify.test.ts` to `src/modules/verify/__tests__/verify.test.ts`
  - [x]Move `verify-blackbox.test.ts` to `src/modules/verify/__tests__/verify-blackbox.test.ts`
  - [x]Move `verify-prompt.test.ts` to `src/modules/verify/__tests__/verify-prompt.test.ts`
  - [x]Move `verify-env.test.ts` to `src/modules/verify/__tests__/verify-env.test.ts`
  - [x]Move `verify-parser.test.ts` to `src/modules/verify/__tests__/verify-parser.test.ts`
  - [x]Move `verifier-session.test.ts` to `src/modules/verify/__tests__/verifier-session.test.ts`
  - [x]Update all import paths in moved test files to reflect new relative location (e.g., `../../lib/verify.js` -> `../../../lib/verify.js` or direct module import)
  - [x]Ensure `src/modules/verify/__tests__/index.test.ts` (from story 1.2) is not overwritten or broken

- [x]Task 3: Update test configuration if needed (AC: #2)
  - [x]Verify Jest/Vitest config `testMatch` or `testPathPattern` covers `src/modules/**/\__tests__/**/*.test.ts`
  - [x]Verify no test config explicitly restricts test discovery to `src/lib/__tests__/` only
  - [x]Run `npm test` and confirm all tests pass (both migrated and remaining)

- [x]Task 4: Verify coverage is maintained (AC: #3)
  - [x]Run `npm run test -- --coverage` and capture coverage summary
  - [x]Compare against baseline: lines 95.96%, statements 95.37%, functions 98.4%, branches 85.1%
  - [x]If coverage drops, investigate — moving tests should not reduce coverage; the same source files are still covered

- [x]Task 5: Verify build still passes
  - [x]Run `npm run build` and confirm no compilation errors
  - [x]Confirm no runtime import resolution failures from path changes

## Dev Notes

### Architecture Constraints

- **ES modules** — all imports must use `.js` extension (e.g., `import { something } from '../../../lib/verify.js'`).
- **Strict TypeScript** — `strict: true`. No `any` types (NFR19).
- **100% test coverage** on new/changed code (NFR14). Since this is a migration (not new code), the goal is zero coverage regression.
- **Naming:** files `kebab-case.ts`, tests colocated in `__tests__/`.

### What Moves and What Stays

**Moves to `src/modules/verify/__tests__/`:**
- `verify.test.ts` — core verify orchestration
- `verify-blackbox.test.ts` — black-box verification
- `verify-prompt.test.ts` — prompt generation
- `verify-env.test.ts` — environment validation
- `verify-parser.test.ts` — proof document parsing
- `verifier-session.test.ts` — session management

**Stays in `src/lib/__tests__/`** (not verify-related, will move in future stories):
- `beads.test.ts`, `beads-sync.test.ts` — bead/artifact management
- `bmad.test.ts`, `bmad-bridge.test.ts`, `bmad-parser.test.ts` — BMAD integration
- `coverage.test.ts` — coverage utilities
- `deps.test.ts` — dependency management
- `doc-health.test.ts` — documentation health checks
- `docker.test.ts` — Docker utilities (infra module, future)
- `epic-generator.test.ts` — epic generation
- `github.test.ts` — GitHub integration
- `onboard-checks.test.ts` — onboarding checks
- `otlp.test.ts` — observability (infra module, future)
- `output.test.ts` — output formatting
- `patch-engine.test.ts` — patch engine
- `readme.test.ts` — README generation
- `retro-parser.test.ts` — retrospective parsing
- `retry-state.test.ts` — retry state management
- `scan-cache.test.ts`, `scanner.test.ts` — file scanning
- `stack-detect.test.ts`, `stack-path.test.ts` — stack detection (infra module, future)
- `state.test.ts` — state management (sprint module, future)
- `templates.test.ts` — template utilities

### Import Path Updates

When tests move from `src/lib/__tests__/` to `src/modules/verify/__tests__/`, relative imports to `src/lib/*.ts` change depth:
- **Before:** `../../lib/verify.js` (from `src/lib/__tests__/`)
- **After:** `../../../lib/verify.js` (from `src/modules/verify/__tests__/`)

All imports in moved test files must be audited and updated.

### Existing Module Tests

Story 1.2 already created `src/modules/verify/__tests__/index.test.ts` which tests the stub exports. The migrated verify tests are testing the actual implementation in `src/lib/verify*.ts`. Both should coexist in `src/modules/verify/__tests__/`.

### Why Only Verify Tests Move Now

The epic description (Story 1.3) specifically calls out "verify-related tests move to `src/modules/verify/__tests__/`". Other module test migrations (infra, sprint, dev, review) will happen when those modules are implemented in their respective epics. This story establishes the pattern.

### Dependency on Stories 1.1 and 1.2

- Story 1.1 created `src/types/result.ts` and shared types
- Story 1.2 created the module skeleton including `src/modules/verify/__tests__/index.test.ts`
- Both are done. The `__tests__` directory already exists.

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Module Layout]
- [Source: src/modules/verify/__tests__/index.test.ts — existing stub test from story 1.2]
- [Source: src/coverage/coverage-summary.json — baseline coverage numbers]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x]Showboat proof document created (`verification/1-3-migrate-existing-tests-to-module-structure-proof.md`)
- [x]All acceptance criteria verified with real-world evidence
- [x]Test coverage meets target (no regression from baseline)

## Documentation Requirements

- [x]Relevant AGENTS.md files updated (list modules touched)
- [x]Exec-plan not required (migration-only story, no new implementation)

## Testing Requirements

- [x]Unit tests written for all new/changed code
- [x]Integration tests for cross-module interactions
- [x]Coverage target: no regression from baseline
<!-- CODEHARNESS-PATCH-END:story-verification -->
