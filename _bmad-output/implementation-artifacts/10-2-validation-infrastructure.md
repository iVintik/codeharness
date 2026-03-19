# Story 10.2: Validation Infrastructure

Status: verifying

## Story

As a release manager,
I want the harness to fix what validation finds,
so that it adapts using its own dev/review/verify pipeline and self-heals without manual intervention.

## Acceptance Criteria

1. **Given** the validation AC registry from story 10-1, **When** `createValidationSprint()` is called, **Then** it populates `sprint-state.json` with one story entry per validation AC (79 entries), each with status `backlog` and attempts `0`. <!-- verification: cli-verifiable -->
2. **Given** a validation AC fails during execution, **When** the failure is detected, **Then** the harness creates a fix story file in `_bmad-output/implementation-artifacts/` with the failing AC description, error output, and suggested fix — then routes it through the dev module. <!-- verification: integration-required -->
3. **Given** a fix has been applied by the dev module, **When** re-validation runs, **Then** only the specific failing AC is re-validated (not the entire suite), using the AC's `command` or check function from the registry. <!-- verification: cli-verifiable -->
4. **Given** a validation AC has failed 10 consecutive attempts, **When** `processValidationResult()` evaluates it, **Then** it is marked as `blocked` in sprint-state.json with reason `retry-exhausted` and a human-readable blocker description. <!-- verification: cli-verifiable -->
5. **Given** `createValidationSprint()` is called, **Then** it preserves any existing non-validation stories in sprint-state.json (does not clobber the current sprint). <!-- verification: cli-verifiable -->
6. **Given** a CLI-verifiable validation AC, **When** executed by the validation runner, **Then** the runner spawns the AC's `command` in a subprocess, captures stdout/stderr, and determines pass/fail from exit code. <!-- verification: cli-verifiable -->
7. **Given** an integration-required validation AC, **When** encountered by the validation runner, **Then** it is skipped with status `blocked` and reason `integration-required` (these require Docker/services not available in CLI context). <!-- verification: cli-verifiable -->
8. **Given** a validation run in progress, **When** `getValidationProgress()` is called, **Then** it returns counts: total, passed, failed, blocked, remaining, and per-AC status. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create validation sprint initializer (AC: 1, 5)
  - [x] Add `createValidationSprint()` to `src/modules/verify/validation-runner.ts`
  - [x] Read all 79 ACs from the registry (`VALIDATION_ACS`)
  - [x] Generate story keys in format `val-{acId}` (e.g., `val-1`, `val-42`)
  - [x] Merge into existing sprint-state.json without overwriting non-validation entries
  - [x] Return `Result<ValidationSprintResult>` with count of ACs added
  - [x] Unit test: creates 79 story entries with correct initial state
  - [x] Unit test: preserves existing stories in sprint-state.json
- [x] Task 2: Create validation AC executor (AC: 3, 6, 7)
  - [x] Add `executeValidationAC(ac: ValidationAC)` to `src/modules/verify/validation-runner.ts`
  - [x] For CLI-verifiable ACs: spawn `ac.command` via `child_process.execSync`, capture stdout/stderr, check exit code
  - [x] For integration-required ACs: return `{ verdict: 'blocked', reason: 'integration-required' }` immediately
  - [x] Return `Result<ValidationACResult>` with verdict, output, duration
  - [x] Unit test: CLI AC with passing command returns pass
  - [x] Unit test: CLI AC with failing command returns fail with captured output
  - [x] Unit test: integration AC returns blocked
- [x] Task 3: Create fix story generator (AC: 2)
  - [x] Add `createFixStory(ac: ValidationAC, error: string)` to `src/modules/verify/validation-runner.ts`
  - [x] Generate a minimal story markdown file with: AC description, error output, suggested fix approach
  - [x] Write to `_bmad-output/implementation-artifacts/val-fix-{acId}.md`
  - [x] Return the story key so it can be routed to the dev module
  - [x] Unit test: generates valid markdown with AC details
- [x] Task 4: Create validation result processor (AC: 4, 8)
  - [x] Add `processValidationResult(acId: number, result: ValidationACResult)` to validation-runner.ts
  - [x] Update sprint-state.json: increment attempts, set verdict, record error
  - [x] If attempts >= 10: mark `blocked` with `retry-exhausted`
  - [x] Add `getValidationProgress()` returning aggregate counts
  - [x] Unit test: marks blocked after 10 failures
  - [x] Unit test: progress counts match expected
- [x] Task 5: Create validation orchestrator (AC: 2, 3)
  - [x] Add `runValidationCycle()` that: selects next failing/backlog validation AC, executes it, processes result
  - [x] On failure: call `createFixStory()` then route to dev module via `developStory()`
  - [x] On re-validation: only re-run the specific AC that was fixed (not full suite)
  - [x] Return `Result<ValidationCycleResult>` with action taken
  - [x] Unit test: orchestration routes failures to dev module
- [x] Task 6: Add types (AC: all)
  - [x] Add `ValidationSprintResult`, `ValidationACResult`, `ValidationCycleResult`, `ValidationProgress` types
  - [x] Ensure all functions return `Result<T>` — never throw
  - [x] Re-export from verify module index.ts

## Dev Notes

### Current State

Story 10-1 created the validation AC registry with 79 typed ACs in `src/modules/verify/validation-acs.ts`. Each AC has an `id`, `frRef`, `description`, `verificationMethod` (`cli` | `integration`), optional `command`, and `category`. The registry is already exported from the verify module.

The sprint module already has: `getSprintState()`, `writeStateAtomic()`, `updateStoryStatus()`, `selectNextStory()`, `processVerifyResult()`. The dev module has `developStory()`. The feedback loop in `src/modules/sprint/feedback.ts` handles verify-to-dev routing with `processVerifyResult()`.

This story builds the **validation-specific** runner that connects the AC registry to the existing sprint/dev/verify pipeline. It does NOT create the `codeharness validate` CLI command (that is story 10-3).

### What Changes

New file: `src/modules/verify/validation-runner.ts` — the core validation infrastructure with:
- Sprint initialization from AC registry
- AC execution (subprocess for CLI, skip for integration)
- Fix story generation for failing ACs
- Result processing with retry tracking
- Orchestration of the fix cycle

### What Does NOT Change

- The validation AC registry (story 10-1) — read-only consumer
- `sprint-state.json` format — reuse existing `StoryState` type
- Sprint module functions — call existing `updateStoryStatus()`, `getSprintState()`
- Dev module — call existing `developStory()` for fix routing
- No new CLI commands (story 10-3 adds `codeharness validate`)

### Architecture Compliance

- All functions return `Result<T>` — never throw (FR37, NFR1)
- New file stays under 300 lines (NFR18) — split if needed
- Reuse existing `StoryState`, `SprintState` types from `src/types/state.ts`
- Reuse existing `ValidationAC` type from `src/modules/verify/validation-ac-types.ts`
- Reuse `writeStateAtomic()` for state persistence (NFR4 — atomic writes)
- Module boundary: validation-runner lives in verify module, calls sprint module through public exports only
- AC execution via `child_process.execSync` — captures stdout/stderr, determines pass/fail from exit code
- Integration-required ACs are skipped (blocked), not faked — honest reporting

### Key Design Decisions

1. **Story keys for validation ACs** use `val-{acId}` prefix to avoid collision with real sprint stories (e.g., `val-1`, `val-42`).
2. **CLI execution** uses `execSync` with a timeout (30s per AC) to prevent hangs. Capture both stdout and stderr.
3. **Fix story generation** creates minimal markdown — just enough for the dev agent to understand what broke and what to fix.
4. **Re-validation targets a single AC** by its `id` — does not re-run the full suite. This is critical for the adaptation loop's efficiency.
5. **Integration-required ACs** are immediately blocked — no attempt to fake or simulate their execution in CLI context.

### Existing Code to Reuse

- `VALIDATION_ACS`, `getACById()`, `getCliVerifiableACs()` from `src/modules/verify/validation-acs.ts`
- `getSprintState()`, `writeStateAtomic()`, `updateStoryStatus()` from `src/modules/sprint/state.ts`
- `selectNextStory()`, `MAX_STORY_ATTEMPTS` from `src/modules/sprint/selector.ts`
- `developStory()` from `src/modules/dev/index.ts`
- `ok()`, `fail()`, `Result<T>` from `src/types/result.ts`
- `SprintState`, `StoryState`, `StoryStatus` from `src/types/state.ts`

### Project Structure Notes

- New file: `src/modules/verify/validation-runner.ts`
- New test file: `src/modules/verify/__tests__/validation-runner.test.ts`
- Modified: `src/modules/verify/index.ts` (re-export new functions)
- No new commands — `codeharness validate` is story 10-3

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Epic 10: Self-Validation & Adaptation — Story 10.2]
- [Source: _bmad-output/implementation-artifacts/10-1-validation-ac-suite.md — previous story, AC registry]
- [Source: src/modules/verify/validation-acs.ts — AC registry barrel export]
- [Source: src/modules/verify/validation-ac-types.ts — ValidationAC type definition]
- [Source: src/modules/sprint/state.ts — getSprintState, writeStateAtomic, updateStoryStatus]
- [Source: src/modules/sprint/selector.ts — selectNextStory, MAX_STORY_ATTEMPTS]
- [Source: src/modules/sprint/feedback.ts — processVerifyResult, verify-dev feedback loop pattern]
- [Source: src/modules/dev/index.ts — developStory]
- [Source: src/types/result.ts — Result type, ok(), fail()]
- [Source: src/types/state.ts — SprintState, StoryState, StoryStatus]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/10-2-validation-infrastructure-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/verify)
- [ ] Exec-plan created in `docs/exec-plans/active/10-2-validation-infrastructure.md`

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

- Task 6 (types): Created `validation-runner-types.ts` with `ValidationACResult`, `ValidationSprintResult`, `ValidationCycleResult`, `ValidationProgress`, `ValidationVerdict` types. All functions return `Result<T>`. Re-exported from `verify/index.ts`.
- Task 1 (sprint initializer): `createValidationSprint()` reads 79 ACs, generates `val-{acId}` keys, merges into existing sprint-state.json without clobbering non-validation entries. Returns count of ACs added and existing stories preserved.
- Task 2 (AC executor): `executeValidationAC()` spawns CLI commands via `execSync` with 30s timeout, captures stdout/stderr, determines pass/fail from exit code. Integration ACs return blocked immediately.
- Task 3 (fix story generator): `createFixStory()` generates minimal markdown fix stories in `_bmad-output/implementation-artifacts/val-fix-{acId}.md` with AC description, error output, and suggested fix.
- Task 4 (result processor): `processValidationResult()` updates sprint-state.json: increments attempts, sets verdict, marks blocked after 10 failures with `retry-exhausted`. `getValidationProgress()` returns aggregate counts.
- Task 5 (orchestrator): `runValidationCycle()` selects next actionable AC (failed > backlog), executes it, processes result, and routes failures to dev via `createFixStory()` + `developStory()`. Re-validation targets specific AC only.
- Split implementation across 3 files for NFR18 compliance: `validation-runner.ts` (296 lines), `validation-orchestrator.ts` (186 lines), `validation-runner-types.ts` (63 lines).
- Added `writeStateAtomic` and `computeSprintCounts` to sprint module's public API to maintain module boundary compliance (caught by import-boundaries test).
- 27 unit tests covering all 6 tasks, all passing. Full regression suite: 2326 tests pass, 0 failures.

### Change Log

- 2026-03-19: Implemented all 6 tasks for validation infrastructure (Story 10-2)
- 2026-03-19: Code review — fixed 3 issues (1 HIGH, 2 MEDIUM), added 6 tests, coverage 96.39%

### File List

- src/modules/verify/validation-runner-types.ts (new)
- src/modules/verify/validation-runner.ts (new)
- src/modules/verify/validation-orchestrator.ts (new)
- src/modules/verify/__tests__/validation-runner.test.ts (new)
- src/modules/verify/index.ts (modified)
- src/modules/verify/AGENTS.md (modified)
- src/modules/sprint/index.ts (modified)
- docs/exec-plans/active/10-2-validation-infrastructure.md (new)
