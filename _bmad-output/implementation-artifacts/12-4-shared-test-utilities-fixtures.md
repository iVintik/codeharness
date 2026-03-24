# Story 12.4: Shared Test Utilities and Fixtures

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

<!-- verification-tier: unit-testable -->

## Story

As a developer,
I want reusable test helpers and fixtures,
So that tests don't duplicate mock setup across 50+ files.

## Acceptance Criteria

1. Given `src/lib/__tests__/fixtures/` exists, when inspected, then it contains: `cargo-toml-variants.ts`, `state-builders.ts`, `mock-factories.ts` <!-- verification: cli-verifiable -->
2. Given `src/lib/__tests__/helpers.ts` exists, when test files import from it, then common patterns (mock Docker, mock fs, create temp state) are one-liners <!-- verification: cli-verifiable -->
3. Given `cargo-toml-variants.ts`, when inspected, then it exports named Cargo.toml string constants covering: minimal, actix-web, axum, async-openai, workspace, binary, library, and generic variants <!-- verification: cli-verifiable -->
4. Given `state-builders.ts`, when inspected, then it exports a `buildSprintState(overrides?: Partial<SprintState>): SprintState` factory that returns a valid SprintStateV2 object with sensible defaults <!-- verification: cli-verifiable -->
5. Given `mock-factories.ts`, when inspected, then it exports factory functions for commonly mocked modules: `createFsMock()`, `createChildProcessMock()`, `createDockerMock()`, `createStateMock()` <!-- verification: cli-verifiable -->
6. Given `helpers.ts`, when inspected, then it exports `withTempDir(fn: (dir: string) => Promise<void>)` that creates a temp directory, runs the callback, and cleans up on completion or error <!-- verification: cli-verifiable -->
7. Given `helpers.ts`, when inspected, then it re-exports all fixtures and mock factories so consumers have a single import point <!-- verification: cli-verifiable -->
8. Given `npm test` runs after all changes, then all existing 3493+ tests pass with zero regressions <!-- verification: cli-verifiable -->
9. Given at least 3 existing test files are refactored to use the new shared utilities, when inspected, then their mock setup boilerplate is reduced (demonstrating the pattern works in practice) <!-- verification: cli-verifiable -->
10. Given no file in `src/lib/__tests__/fixtures/` or `src/lib/__tests__/helpers.ts`, when line count is checked, then no file exceeds 300 lines <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 1, 3): Create `src/lib/__tests__/fixtures/cargo-toml-variants.ts`
  - [x] Export named string constants for each Cargo.toml variant (minimal, actix-web, axum, async-openai, workspace, binary, library, generic)
  - [x] Extract inline Cargo.toml strings from `src/lib/__tests__/stacks/rust.test.ts` as the source of truth
- [x] Task 2 (AC: 1, 4): Create `src/lib/__tests__/fixtures/state-builders.ts`
  - [x] Import `SprintState` (aliased to `SprintStateV2`) from `src/types/state.ts`
  - [x] Export `buildSprintState(overrides?)` with sensible defaults (version 2, current date, empty stories array, etc.)
  - [x] Export `buildStoryEntry(overrides?)` for individual story objects
- [x] Task 3 (AC: 1, 5): Create `src/lib/__tests__/fixtures/mock-factories.ts`
  - [x] `createFsMock()` — returns vi.fn() stubs for readFileSync, writeFileSync, existsSync, mkdirSync, etc.
  - [x] `createChildProcessMock()` — returns vi.fn() stubs for execFileSync, spawn, etc.
  - [x] `createDockerMock()` — returns vi.fn() stubs for isStackRunning, startStack, stopStack, etc.
  - [x] `createStateMock()` — returns vi.fn() stubs for readLocalConfig, getProjectRoot, etc.
- [x] Task 4 (AC: 2, 6, 7): Create `src/lib/__tests__/helpers.ts`
  - [x] Export `withTempDir()` utility
  - [x] Re-export all from `./fixtures/cargo-toml-variants.ts`, `./fixtures/state-builders.ts`, `./fixtures/mock-factories.ts`
- [x] Task 5 (AC: 9): Refactor at least 3 existing test files to use shared utilities
  - [x] `src/lib/__tests__/stacks/rust.test.ts` — replace inline Cargo.toml strings with fixture imports
  - [x] `src/modules/sprint/__tests__/selector.test.ts` — replace inline makeState/makeBadState with shared builders
  - [x] `src/modules/sprint/__tests__/feedback.test.ts` — replace inline mockState with state-builders
- [x] Task 6 (AC: 8): Run full test suite — all tests pass, zero regressions
- [x] Task 7 (AC: 10): Verify all new files are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 4 (Domain Subdirectories):** The architecture specifies `src/lib/__tests__/fixtures/` for shared test data and `src/lib/__tests__/helpers.ts` for mock factories and state builders. Follow this exactly.
- **300-line limit (Decision 7, NFR5):** All new files must stay under 300 lines.
- **Import convention:** Test files importing shared utilities should use `import { ... } from '../../lib/__tests__/helpers.js'` (or relative equivalent). The `.js` extension is required for ESM resolution.

### Duplication Analysis (Why This Story Matters)

Current test codebase has significant duplication:
- **17 `vi.mock('node:fs', ...)` declarations** across test files
- **22 `vi.mock('node:child_process', ...)` declarations**
- **26 `vi.mock(...)` calls for Docker-related modules**
- **8 `vi.mock(...)` calls for state modules**
- Inline Cargo.toml string literals repeated across 14+ test assertions in `rust.test.ts`
- Each test file independently builds mock objects for the same modules

### Testing Framework

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'`

### Mock Factory Design Guidance

Mock factories should return plain objects with `vi.fn()` stubs. They should NOT call `vi.mock()` themselves — that must happen at the module level in each test file (Vitest requirement: `vi.mock()` is hoisted). The factories provide the mock implementations that test files pass to `vi.mock()`.

Example pattern:
```typescript
// In mock-factories.ts:
export function createFsMock() {
  return {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(),
    rmSync: vi.fn(),
  };
}

// In a test file:
import { createFsMock } from '../../lib/__tests__/helpers.js';
const fsMock = createFsMock();
vi.mock('node:fs', () => fsMock);
```

### State Builder Design Guidance

The `buildSprintState()` factory must produce valid `SprintStateV2` objects. Reference `src/types/state.ts` for the interface (lines 97-127). Use `Partial<SprintState>` spread pattern for overrides.

### Previous Story Intelligence (12-3)

- Story 12-3 completed successfully. Pattern: extract from monolith into domain module, keep thin command layer.
- 3493 tests passing as of story 12-3 completion.
- Coverage: 97.09% overall, all 150 files above 80% per-file floor.
- Import boundaries test (`src/modules/__tests__/import-boundaries.test.ts`) enforces module isolation.

### Refactoring Guidance

When refactoring existing test files (Task 5), the approach is:
1. Import the shared utility
2. Replace the inline mock/fixture with the shared version
3. Run the specific test file to verify no regressions
4. Do NOT change test logic or assertions — only the mock setup

### Project Structure Notes

Target file tree after this story:
```
src/lib/__tests__/
  fixtures/
    cargo-toml-variants.ts   # Named Cargo.toml string constants
    state-builders.ts         # buildSprintState(), buildStoryEntry()
    mock-factories.ts         # createFsMock(), createChildProcessMock(), etc.
  helpers.ts                  # withTempDir(), re-exports all fixtures
  ... existing test files ...
```

### References

- [Source: _bmad-output/planning-artifacts/architecture-v3.md lines 273-275] — `src/lib/__tests__/` structure spec
- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 237-251] — Story 12-4 epic definition
- [Source: src/types/state.ts lines 97-131] — SprintStateV2 interface definition
- [Source: _bmad-output/implementation-artifacts/12-3-move-status-logic-to-module.md] — Previous story learnings

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/12-4-shared-test-utilities-fixtures.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/12-4-shared-test-utilities-fixtures.md`

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

- Task 1: Created `cargo-toml-variants.ts` with 8 named Cargo.toml string constants (74 lines)
- Task 2: Created `state-builders.ts` with `buildSprintState`, `buildStoryEntry`, `buildEpicState`, `buildActionItem`, `buildSprintStateWithStory` (139 lines)
- Task 3: Created `mock-factories.ts` with `createFsMock`, `createChildProcessMock`, `createDockerMock`, `createStateMock` (96 lines)
- Task 4: Created `helpers.ts` with `withTempDir()` and re-exports of all fixtures (37 lines)
- Task 5: Refactored 3 test files: rust.test.ts (11 inline Cargo.toml strings replaced), feedback.test.ts (2 inline SprintState objects replaced), selector.test.ts (makeState/makeBadState replaced with shared builders). Note: docker.test.ts was originally targeted but replaced with selector.test.ts because `vi.mock()` hoisting prevents using factory imports inside `vi.mock()` callbacks — the mock factory pattern is most useful for mock *configuration* (return values), not `vi.mock()` declarations themselves.
- Task 6: Full test suite passes — 3539 tests across 134 files, zero regressions (up from 3493 due to 46 new tests)
- Task 7: All new files under 300 lines (max: 139 lines for state-builders.ts)

### Change Log

- 2026-03-24: Story 12-4 implemented — shared test utilities and fixtures
- 2026-03-24: Code review fixes — removed phantom functions (readLocalConfig, getProjectRoot) from createStateMock; split into createStateMock + createSprintStateMock; removed unused StoryStatus import from state-builders.ts; updated tests and AGENTS.md

### File List

- src/lib/__tests__/fixtures/cargo-toml-variants.ts (new)
- src/lib/__tests__/fixtures/state-builders.ts (new)
- src/lib/__tests__/fixtures/mock-factories.ts (new)
- src/lib/__tests__/helpers.ts (new)
- src/lib/__tests__/fixtures/cargo-toml-variants.test.ts (new)
- src/lib/__tests__/fixtures/state-builders.test.ts (new)
- src/lib/__tests__/fixtures/mock-factories.test.ts (new)
- src/lib/__tests__/helpers.test.ts (new)
- src/lib/__tests__/stacks/rust.test.ts (modified)
- src/modules/sprint/__tests__/feedback.test.ts (modified)
- src/modules/sprint/__tests__/selector.test.ts (modified)
- src/lib/AGENTS.md (modified)
- docs/exec-plans/active/12-4-shared-test-utilities-fixtures.md (new)
