# Story 3.3: Onboard Alias

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want `codeharness onboard` to work the same as `codeharness audit`,
so that existing scripts and docs don't break when the audit command replaces onboard.

## Acceptance Criteria

1. **Given** `codeharness onboard` is run with no subcommand and no flags, **When** it executes, **Then** it produces identical output to `codeharness audit` (same dimension checks, same status/metric format, same exit code). <!-- verification: cli-verifiable -->
2. **Given** `codeharness onboard --fix` is run, **When** it executes, **Then** it produces identical output and behavior to `codeharness audit --fix` (generates fix stories for gaps, updates sprint state). <!-- verification: cli-verifiable -->
3. **Given** `codeharness onboard --json` is run, **When** it executes, **Then** it produces identical JSON output to `codeharness audit --json` (same structure, same fields). <!-- verification: cli-verifiable -->
4. **Given** `codeharness onboard --fix --json` is run, **When** it executes, **Then** it produces identical output to `codeharness audit --fix --json` (includes `fixStories` array in JSON). <!-- verification: cli-verifiable -->
5. **Given** the harness is not initialized, **When** `codeharness onboard` is run, **Then** it exits with `[FAIL] Harness not initialized -- run codeharness init first` and exit code 1 — same as `codeharness audit`. <!-- verification: cli-verifiable -->
6. **Given** `codeharness onboard scan` is run, **When** it executes, **Then** it prints a deprecation warning `[WARN] 'onboard scan' is deprecated — use 'codeharness audit' instead` and then runs the audit command (maps legacy subcommand to new behavior). <!-- verification: cli-verifiable -->
7. **Given** the old `registerOnboardCommand` function, **When** the alias is implemented, **Then** the old onboard command registration is removed from `src/index.ts` and replaced by the alias registration, so there is no duplicate command registration. <!-- verification: cli-verifiable -->
8. **Given** `codeharness --help` is run, **When** the help output is displayed, **Then** both `audit` and `onboard` appear in the command list, with `onboard` described as `Alias for audit — check all compliance dimensions`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Rewrite `src/commands/onboard.ts` as a thin alias (AC: #1, #2, #3, #4, #5, #6, #7, #8)
  - [x] 1.1: Remove all existing scan/coverage/audit/epic subcommand logic, shared state, and formatting helpers from `src/commands/onboard.ts`
  - [x] 1.2: Implement `registerOnboardCommand(program)` that creates a `program.command('onboard')` with description `'Alias for audit — check all compliance dimensions'`
  - [x] 1.3: Mirror the `--json` and `--fix` options from the audit command
  - [x] 1.4: In the action handler, delegate directly to the same logic as `registerAuditCommand` by calling the audit action internals (either extract shared handler or import and call `runAudit` / `generateFixStories` / `addFixStoriesToState` / formatting directly)
  - [x] 1.5: Add deprecated `scan` subcommand that prints `[WARN] 'onboard scan' is deprecated — use 'codeharness audit' instead` then runs audit logic (AC #6)

- [x] Task 2: Extract shared audit action handler (AC: #1, #2, #3, #4, #5)
  - [x] 2.1: Extract the audit action logic from `src/commands/audit.ts` into a shared function `executeAudit(opts: { isJson: boolean; isFix: boolean }): Promise<void>` in a new file `src/commands/audit-action.ts` (or keep inline if both commands can import the same handler)
  - [x] 2.2: Have both `registerAuditCommand` and `registerOnboardCommand` use the same handler, ensuring identical behavior
  - [x] 2.3: Keep `registerAuditCommand` in `src/commands/audit.ts` unchanged (or with minimal refactor to use extracted handler)

- [x] Task 3: Update `src/index.ts` registration (AC: #7)
  - [x] 3.1: Verify `registerOnboardCommand(program)` is still called in `src/index.ts` — the function name stays the same, only the implementation changes
  - [x] 3.2: Verify no duplicate `audit` or `onboard` commands are registered

- [x] Task 4: Remove dead code (AC: #7)
  - [x] 4.1: Remove imports for `scanCodebase`, `analyzeCoverageGaps`, `auditDocumentation` from `src/lib/scanner.js` if no longer used elsewhere
  - [x] 4.2: Remove imports for `generateOnboardingEpic`, `writeOnboardingEpic`, `formatEpicSummary`, `promptApproval`, `importOnboardingEpic` from `src/lib/epic-generator.js` if no longer used elsewhere
  - [x] 4.3: Remove imports for `listIssues`, `createIssue` from `src/lib/beads.js` (onboard no longer calls beads directly)
  - [x] 4.4: Remove imports for `filterTrackedGaps`, `findVerificationGaps`, `findPerFileCoverageGaps`, `findObservabilityGaps`, `getOnboardingProgress` from `src/lib/onboard-checks.js` if no longer used
  - [x] 4.5: Remove imports for `saveScanCache`, `loadValidCache` from `src/lib/scan-cache.js` if no longer used
  - [x] 4.6: Remove imports for `appendOnboardingEpicToSprint` from `src/lib/beads-sync.js` if no longer used
  - [x] 4.7: Check all removed imports — do NOT delete the library files themselves, only remove the imports from `onboard.ts`. Other commands may still use them.

- [x] Task 5: Update tests (AC: all)
  - [x] 5.1: Rewrite `src/commands/__tests__/onboard.test.ts` to test the alias behavior:
    - Test `codeharness onboard` delegates to audit logic
    - Test `codeharness onboard --fix` delegates to audit --fix logic
    - Test `codeharness onboard --json` produces same output as audit --json
    - Test `codeharness onboard scan` prints deprecation warning and runs audit
    - Test precondition failure (harness not initialized) produces same error as audit
  - [x] 5.2: Mock the same dependencies as `audit.test.ts` (runPreconditions, runAudit, formatAuditHuman, formatAuditJson, generateFixStories, addFixStoriesToState)
  - [x] 5.3: Verify the `--help` output includes both `audit` and `onboard` commands
  - [x] 5.4: Target 100% coverage on the rewritten `onboard.ts`

- [x] Task 6: Build and verify (AC: all)
  - [x] 6.1: Run `npm run build` — verify tsup compiles successfully
  - [x] 6.2: Run `npm run test:unit` — all tests pass, no regressions
  - [x] 6.3: Verify no file exceeds 300 lines (NFR9) — rewritten `onboard.ts` should be ~40-60 lines
  - [x] 6.4: Verify `codeharness onboard` runs end-to-end and produces audit output
  - [x] 6.5: Verify `codeharness audit` still works identically (no regression)
  - [x] 6.6: Verify `codeharness --help` shows both commands

## Dev Notes

### Architecture References

This story implements FR16 (`onboard` becomes alias for `audit`). It replaces the old onboard command (which had its own scan/coverage/audit/epic pipeline) with a thin alias that delegates to the new audit coordinator from Story 3.1/3.2.

### Key Implementation Details

**Alias, not duplicate:** The onboard command must produce byte-identical output to audit. The cleanest approach is to extract the audit action handler into a shared function and call it from both commands. Do NOT copy-paste the audit logic into onboard.ts.

**Legacy subcommand handling (AC #6):** The old `onboard` command had subcommands: `scan`, `coverage`, `audit`, `epic`. The new alias only needs to handle the bare `onboard` command (maps to `audit`) and provide a deprecation warning for `onboard scan`. The `coverage`, `audit`, and `epic` subcommands can be silently dropped — they were internal to the old onboarding pipeline.

**Shared state removal:** The old `onboard.ts` maintained module-level shared state (`lastScanResult`, `lastCoverageResult`, `lastAuditResult`) with getter/setter exports. These are no longer needed. Check if any other files import `getLastScanResult()`, `getLastCoverageResult()`, `getLastAuditResult()`, or `resetLastScanResult()` before removing — the test file `onboard.test.ts` imports `resetLastScanResult` but that will be rewritten.

**File size:** The rewritten `onboard.ts` should be dramatically smaller — from 478 lines to ~40-60 lines. Well under NFR9's 300-line limit.

### What NOT To Do

- **Do NOT delete `src/lib/scanner.ts`, `src/lib/epic-generator.ts`, `src/lib/onboard-checks.ts`, `src/lib/scan-cache.ts`, `src/lib/beads-sync.ts`** — other commands or tests may still use them. Only remove the imports from `onboard.ts`.
- **Do NOT modify `src/commands/audit.ts` behavior** — the audit command must continue to work identically. Only refactor to extract a shared handler if needed.
- **Do NOT add new npm dependencies** — this is pure refactoring.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.

### Existing Code to Reuse

- `src/commands/audit.ts` — `registerAuditCommand()`, the action handler logic to be shared
- `src/modules/audit/index.ts` — `runAudit()`, `generateFixStories()`, `addFixStoriesToState()` barrel exports
- `src/modules/audit/report.ts` — `formatAuditHuman()`, `formatAuditJson()` formatting
- `src/lib/onboard-checks.ts` — `runPreconditions()` (still needed for precondition check)
- `src/lib/output.ts` — `ok()`, `fail()`, `info()`, `warn()`, `jsonOutput()` for output formatting

### Dependencies

- **Depends on:** Story 3.1 (audit coordinator — `runAudit()`) — DONE. Story 3.2 (audit --fix — `generateFixStories()`) — DONE.
- **Depended on by:** None within this epic.

### File Size Constraint

Each new/modified file must be under 300 lines per NFR9.
- `src/commands/onboard.ts` — ~40-60 lines (down from 478, alias only)
- `src/commands/audit-action.ts` — ~80-100 lines (extracted shared handler, if created)
- `src/commands/__tests__/onboard.test.ts` — ~100-150 lines (simplified alias tests)

### Previous Story Intelligence (Story 3.2)

- **`runAudit()` returns `Promise<Result<AuditResult>>`** with `dimensions`, `overallStatus`, `gapCount`, `durationMs`.
- **`generateFixStories()` and `addFixStoriesToState()`** handle `--fix` logic.
- **`formatAuditHuman()` / `formatAuditJson()`** handle output formatting.
- **Commander.js** for CLI command registration with `.option()` and `.action()`.
- **`runPreconditions()`** from `src/lib/onboard-checks.js` for initialization check.

### Git Intelligence

The project uses Commander.js for CLI, vitest for testing, tsup for building. The existing `onboard.ts` is 478 lines with extensive functionality that is being replaced. The `audit.ts` command is 127 lines and well-structured.

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 3.3] — Acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#FR16] — `onboard` becomes alias for `audit`
- [Source: src/commands/audit.ts] — Audit command to alias
- [Source: src/commands/onboard.ts] — Existing onboard command to replace
- [Source: src/index.ts] — Command registration

### Project Structure Notes

- Modified files: `src/commands/onboard.ts` (full rewrite as alias), `src/commands/__tests__/onboard.test.ts` (full rewrite)
- Possibly new file: `src/commands/audit-action.ts` (shared handler extraction)
- Possibly modified: `src/commands/audit.ts` (if refactored to use shared handler)
- No patches created in this story
- Module follows existing conventions: Commander.js, Result<T> returns, <300 line files

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`docs/exec-plans/active/3-3-onboard-alias.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (src/commands/AGENTS.md)
- [x] Exec-plan created in `docs/exec-plans/active/3-3-onboard-alias.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] All I/O mocked (filesystem, subprocess, HTTP)
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Implementation Plan

- Extract `executeAudit()` from `audit.ts` into shared `audit-action.ts` module
- Refactor `audit.ts` to be a thin wrapper calling `executeAudit()`
- Rewrite `onboard.ts` as a 40-line alias calling `executeAudit()`
- Add deprecated `scan` subcommand with warning
- Rewrite test file to verify alias delegation, deprecation warning, and help output

### Completion Notes

- Reduced `onboard.ts` from 478 lines to 40 lines (92% reduction)
- Created `audit-action.ts` (119 lines) as shared handler
- Simplified `audit.ts` from 127 lines to 25 lines
- All shared state exports (`getLastScanResult`, etc.) removed -- only used by onboard.ts and its tests
- All old imports removed from onboard.ts (scanner, epic-generator, beads, onboard-checks, scan-cache, beads-sync)
- Library files preserved -- only imports from onboard.ts were removed
- 100% statement/line/function coverage on onboard.ts and audit.ts
- 100% statement/line/function coverage on audit-action.ts (95.83% branch)
- Full test suite: 108 files, 2781 tests, 0 failures, 0 regressions
- Build: tsup compiles successfully

## File List

- `src/commands/audit-action.ts` (new) — shared audit action handler
- `src/commands/audit.ts` (modified) — thin wrapper using audit-action
- `src/commands/onboard.ts` (rewritten) — thin alias for audit
- `src/commands/__tests__/onboard.test.ts` (rewritten) — alias behavior tests
- `src/commands/AGENTS.md` (updated) — reflects new architecture
- `docs/exec-plans/active/3-3-onboard-alias.md` (new) — exec plan
- `docs/exec-plans/active/3-3-onboard-alias.proof.md` (new) — proof document
- `_bmad-output/implementation-artifacts/3-3-onboard-alias.md` (updated) — story file

## Change Log

- 2026-03-21: Implemented Story 3.3 — replaced 478-line onboard command with 40-line alias delegating to shared audit handler. Extracted `executeAudit()` into `audit-action.ts`. Added deprecated `scan` subcommand. All 8 ACs satisfied. 108 test files, 2781 tests passing.
