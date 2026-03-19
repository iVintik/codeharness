# Story 10.3: Self-Validation Run

Status: verifying

## Story

As a release manager,
I want `codeharness validate` to produce a clean report,
so that the v1.0 release gate is met and I can ship with confidence.

## Acceptance Criteria

1. **Given** `codeharness validate` is run, **When** validation completes, **Then** the report shows: total ACs, passed, failed, blocked, and adaptation cycles count. <!-- verification: cli-verifiable -->
2. **Given** all validation ACs pass, **When** the report is generated, **Then** it outputs "RELEASE GATE: PASS -- v1.0 ready". <!-- verification: cli-verifiable -->
3. **Given** some validation ACs fail, **When** the report is generated, **Then** each failure has: AC description, command, output, attempts, and blocker reason. <!-- verification: cli-verifiable -->
4. **Given** a validation run in progress, **When** `codeharness status` is called, **Then** it shows validation progress in real time (total, passed, failed, blocked, remaining). <!-- verification: integration-required -->
5. **Given** CI mode, **When** `codeharness validate --ci` is run, **Then** it returns exit code 0 on all-pass and exit code 1 on any failure. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `codeharness validate` CLI command (AC: 1, 2, 3, 5)
  - [x] Create `src/commands/validate.ts` with `registerValidateCommand()`
  - [x] Wire command registration in `src/index.ts`
  - [x] Call `createValidationSprint()` to initialize validation stories in sprint-state.json
  - [x] Loop: call `runValidationCycle()` until no actionable ACs remain
  - [x] Call `getValidationProgress()` for final report data
  - [x] Format human-readable report: total, passed, failed, blocked, adaptation cycles
  - [x] Output "RELEASE GATE: PASS -- v1.0 ready" when all non-blocked ACs pass
  - [x] Output per-failure detail: AC description, command, output, attempts, blocker
  - [x] Support `--json` flag for machine-readable output
  - [x] Command must be <100 lines (FR40) — delegate to verify module functions
- [x] Task 2: Implement `--ci` mode (AC: 5)
  - [x] Add `--ci` option to validate command
  - [x] Set `process.exitCode = 0` on all-pass, `process.exitCode = 1` on any failure
  - [x] In CI mode, suppress human-readable formatting — output only the summary line and exit code
- [x] Task 3: Wire status integration (AC: 4)
  - [x] Ensure `getValidationProgress()` is callable from `codeharness status` during a validation run
  - [x] Update status output to show validation progress when validation stories exist in sprint-state.json
  - [x] Display: "Validation: X/Y passed, Z failed, W blocked" in status output
- [x] Task 4: Write unit tests (AC: 1, 2, 3, 5)
  - [x] Test: validate command produces report with correct counts
  - [x] Test: all-pass scenario outputs "RELEASE GATE: PASS" message
  - [x] Test: failure scenario includes per-AC detail (description, command, output, attempts, blocker)
  - [x] Test: --ci flag sets exit code 0 on pass, 1 on fail
  - [x] Test: --json flag outputs machine-readable JSON
  - [x] Test: command file is <100 lines

## Dev Notes

### Current State

Stories 10-1 and 10-2 built the foundation:
- **10-1** created the validation AC registry (`src/modules/verify/validation-acs.ts`) with 79 typed ACs covering FR, NFR, UX, Regression, and ActionItem categories
- **10-2** created the validation infrastructure (`src/modules/verify/validation-runner.ts`, `validation-orchestrator.ts`) with: `createValidationSprint()`, `executeValidationAC()`, `createFixStory()`, `processValidationResult()`, `getValidationProgress()`, `runValidationCycle()`

This story creates the **CLI surface** — the `codeharness validate` command that ties it all together. The heavy lifting is already done in the verify module; this command is a thin wrapper.

### What Changes

New file: `src/commands/validate.ts` — the `codeharness validate` CLI command
Modified: `src/index.ts` — register the new command
Modified: `src/commands/status.ts` — show validation progress when validation stories exist

### What Does NOT Change

- Validation AC registry (story 10-1) — read-only consumer
- Validation runner/orchestrator (story 10-2) — called, not modified
- `sprint-state.json` format — reuse existing types
- Other CLI commands — no changes

### Architecture Compliance

- CLI command <100 lines (FR40) — thin wrapper calling verify module functions
- All error handling via `Result<T>` pattern — command checks `.success` and sets `process.exitCode`
- Supports `--json` for machine-readable output (existing pattern from status, verify commands)
- Supports `--ci` for CI pipeline integration with exit codes
- No file >300 lines (NFR18)
- Module boundary: command imports only from `verify/index.ts` and `sprint/index.ts` public APIs

### Existing Code to Reuse

- `createValidationSprint()` from `src/modules/verify/validation-runner.ts` — initializes sprint-state.json with validation ACs
- `runValidationCycle()` from `src/modules/verify/validation-orchestrator.ts` — executes one AC, processes result, routes failures
- `getValidationProgress()` from `src/modules/verify/validation-orchestrator.ts` — aggregate counts
- `ok()`, `fail()`, `info()`, `jsonOutput()` from `src/lib/output.js` — output helpers
- `Command` from `commander` — CLI framework

### Key Design Decisions

1. **Loop until no actionable ACs**: The validate command calls `runValidationCycle()` in a loop. Each cycle picks the next failed/backlog AC, executes it, and processes the result. The loop terminates when `action === 'no-actionable-ac'`.
2. **Adaptation cycles**: Each time a failing AC is routed to dev and then re-validated, that counts as one adaptation cycle. The report tracks total cycles.
3. **Release gate**: The gate passes when all non-blocked (i.e., non-integration-required) ACs are `done`. Blocked ACs are expected — they require Docker/services.
4. **CI mode**: Minimal output, deterministic exit code. No interactive elements. Suitable for GitHub Actions.

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Epic 10: Self-Validation & Adaptation — Story 10.3]
- [Source: _bmad-output/implementation-artifacts/10-1-validation-ac-suite.md — AC registry]
- [Source: _bmad-output/implementation-artifacts/10-2-validation-infrastructure.md — validation runner/orchestrator]
- [Source: src/modules/verify/validation-runner.ts — createValidationSprint, executeValidationAC, processValidationResult]
- [Source: src/modules/verify/validation-orchestrator.ts — runValidationCycle, getValidationProgress]
- [Source: src/modules/verify/validation-runner-types.ts — ValidationProgress, ValidationCycleResult]
- [Source: src/index.ts — command registration pattern]
- [Source: src/commands/status.ts — status command pattern, --json support]

## Dev Agent Record

### Implementation Plan

- Created `src/commands/validate.ts` (87 lines) as thin wrapper calling verify module functions
- Command flow: createValidationSprint -> loop runValidationCycle -> getValidationProgress -> format report
- Three output modes: human-readable (default), --json (machine-readable), --ci (minimal + exit code)
- Release gate passes when failed=0 and remaining=0 (blocked ACs are expected)
- Added validation progress display to `codeharness status` (both text and JSON modes)
- Updated CLI test to expect 20 commands (was 19)

### Completion Notes

- All 4 tasks implemented and verified with 11 unit tests (all passing)
- Full regression suite: 2343 tests pass across 89 test files
- Command file is 87 lines (under 100-line FR40 limit)
- No TypeScript errors in modified files (pre-existing TS errors in verify-env.test.ts are unrelated)
- Module boundary compliance: command imports only from verify/index.ts public API

## File List

- src/commands/validate.ts (new)
- src/commands/__tests__/validate.test.ts (new)
- src/index.ts (modified)
- src/commands/status.ts (modified)
- src/__tests__/cli.test.ts (modified)
- src/commands/AGENTS.md (modified)
- src/modules/verify/AGENTS.md (modified)
- docs/exec-plans/active/10-3-self-validation-run.md (new)

## Change Log

- 2026-03-19: Implemented `codeharness validate` CLI command with --ci and --json support, wired status integration, added 11 unit tests. All tasks complete.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/10-3-self-validation-run-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/commands, src/modules/verify)
- [ ] Exec-plan created in `docs/exec-plans/active/10-3-self-validation-run.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
