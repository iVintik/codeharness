# Story 3.1: Error Capture on Timeout

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want every iteration to produce a report even on timeout,
so that work is never silently lost.

## Acceptance Criteria

1. **Given** a ralph iteration exits with code 124 (timeout), **When** the timeout is detected, **Then** the system captures: git diff (staged + unstaged), sprint-state.json delta (before vs after), and partial stderr from the output log. <!-- verification: cli-verifiable -->
2. **Given** captured timeout data, **When** saved, **Then** it is written to an iteration timeout report file at `ralph/logs/timeout-report-<iteration>-<story-key>.md` containing: story key, iteration number, duration (timeout minutes), git diff summary, state delta, and partial stderr (last 100 lines of output). <!-- verification: cli-verifiable -->
3. **Given** any iteration (success, failure, or timeout), **When** it completes, **Then** a report file exists in `ralph/logs/` with non-zero content (>0 bytes). <!-- verification: cli-verifiable -->
4. **Given** the `captureTimeoutReport` function is called in the sprint module, **When** any error occurs (missing git, missing state file, I/O failure), **Then** it returns `Result<TimeoutReport>` with `fail(error)` — never throws an uncaught exception. <!-- verification: cli-verifiable -->
5. **Given** ralph detects exit code 124, **When** it calls the timeout capture logic, **Then** the capture completes in under 10 seconds and does not itself hang or timeout. <!-- verification: cli-verifiable -->
6. **Given** a timeout report is generated, **When** the operator runs `codeharness status --story <key>`, **Then** the drill-down shows the last timeout report path and a summary line (e.g., "Last timeout: iteration 5, 30m, 3 files changed"). <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Define timeout report types in `src/modules/sprint/types.ts` (AC: #1, #2, #4)
  - [x] Define `TimeoutCapture` type: `storyKey: string`, `iteration: number`, `durationMinutes: number`, `gitDiff: string`, `stateDelta: string`, `partialStderr: string`, `timestamp: string`
  - [x] Define `TimeoutReport` type: `filePath: string`, `capture: TimeoutCapture`
- [x] Task 2: Implement `captureTimeoutReport()` in `src/modules/sprint/timeout.ts` (AC: #1, #2, #3, #4, #5)
  - [x] Create new file `src/modules/sprint/timeout.ts` (keep under 300 lines)
  - [x] Implement `captureGitDiff(): Result<string>` — runs `git diff` + `git diff --cached` via `child_process.execSync` with a 5-second timeout, returns combined diff summary (stat only, not full patch)
  - [x] Implement `captureStateDelta(beforePath: string, afterPath: string): Result<string>` — compares two sprint-state.json snapshots, returns human-readable delta of changed story statuses
  - [x] Implement `capturePartialStderr(outputFile: string, maxLines: number): Result<string>` — reads last N lines from the iteration output log
  - [x] Implement `captureTimeoutReport(opts: { storyKey: string; iteration: number; durationMinutes: number; outputFile: string; stateSnapshotPath: string }): Result<TimeoutReport>` — orchestrates all captures, writes markdown report file, returns Result
  - [x] All functions return `Result<T>`, wrap in try/catch, never throw
  - [x] Use `execSync` with `{ timeout: 5000 }` for git commands to prevent hanging (AC #5)
- [x] Task 3: Integrate timeout capture into ralph execution flow in `ralph/ralph.sh` (AC: #1, #2, #3)
  - [x] Before each iteration, snapshot `sprint-state.json` to `ralph/.state-snapshot.json`
  - [x] On exit code 124, call `npx codeharness timeout-report` (or invoke the TypeScript function via a thin CLI command) passing iteration number, story key, output file path, and snapshot path
  - [x] Verify report file exists with non-zero content after capture
- [x] Task 4: Add thin CLI command `timeout-report` in `src/commands/timeout-report.ts` (AC: #1, #2, #4)
  - [x] Create new command: `codeharness timeout-report --story <key> --iteration <n> --duration <minutes> --output-file <path> --state-snapshot <path>`
  - [x] Delegates to `captureTimeoutReport()` from sprint module
  - [x] Prints report file path on success, error message on failure
  - [x] Keep under 100 lines (NFR: thin command wrapper)
- [x] Task 5: Export from sprint module index (AC: #4)
  - [x] Add `captureTimeoutReport` to `src/modules/sprint/index.ts` exports
  - [x] Export `TimeoutReport` and `TimeoutCapture` types
- [x] Task 6: Write unit tests in `src/modules/sprint/__tests__/timeout.test.ts` (AC: #1, #2, #3, #4, #5)
  - [x] Test `captureGitDiff()` returns diff summary when git is available
  - [x] Test `captureGitDiff()` returns `fail()` when git is not available (mock execSync to throw)
  - [x] Test `captureStateDelta()` correctly identifies changed story statuses
  - [x] Test `captureStateDelta()` returns `fail()` on missing files
  - [x] Test `capturePartialStderr()` returns last N lines of output file
  - [x] Test `capturePartialStderr()` returns `fail()` on missing output file
  - [x] Test `captureTimeoutReport()` writes markdown file with all required fields
  - [x] Test `captureTimeoutReport()` handles partial failures gracefully (e.g., git unavailable but stderr captured)
  - [x] Test that all functions return `Result<T>` — never throw
  - [x] Test git command timeout (mock execSync to simulate hang)
- [x] Task 7: Write BATS integration test in `tests/` (AC: #3)
  - [x] Test that `codeharness timeout-report` command exists and accepts required options
  - [x] Test that report file is created with non-zero content
- [x] Task 8: Verify build (`npm run build`) succeeds
- [x] Task 9: Verify all existing tests pass (`npm test`)
- [x] Task 10: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18). Create a new `timeout.ts` file for the capture logic; do NOT add to existing `reporter.ts` or `state.ts`.
- **100% test coverage** on new code (NFR14).
- **Module boundary** — `timeout.ts` is internal to sprint module. Only `index.ts` is the public interface.
- **Thin CLI commands** — command files in `src/commands/` must be <100 lines (NFR, FR40). The timeout-report command just parses args and delegates.

### Key NFRs

- **NFR1:** No module failure crashes the overall system — structured error results.
- **NFR3:** Every ralph iteration produces a report, even on timeout — zero 0-byte outputs. This is the core requirement for this story.
- **NFR4:** State files use atomic write (temp + rename). The timeout report is write-once, so atomic write is not strictly required, but use `writeFileSync` for simplicity.

### Ralph Integration Details

Ralph (`ralph/ralph.sh`) uses `portable_timeout` to wrap Claude CLI invocations. When timeout fires, exit code is 124. Currently (line 687-689):

```bash
elif [[ $exit_code -eq 124 ]]; then
    log_status "WARN" "Iteration timed out after ${ITERATION_TIMEOUT_MINUTES}m"
    return 1
```

This logs a warning but captures nothing. The story adds a capture step between detection and return.

The output log file is already saved at `ralph/logs/claude_output_<timestamp>.log`. The timeout report should reference this file and extract the last 100 lines as partial stderr.

### State Snapshot Strategy

Before each iteration, ralph should copy `sprint-state.json` to `ralph/.state-snapshot.json`. On timeout, the delta is computed by comparing snapshot vs current `sprint-state.json`. This shows what (if anything) changed during the iteration.

### Git Diff Strategy

Use `git diff --stat` (not full patch) to keep the report concise. Include both staged and unstaged changes. Use `execSync` with `{ timeout: 5000 }` to prevent git from hanging on large repos.

### Report Format

The timeout report should be a simple markdown file:

```markdown
# Timeout Report: Iteration <N>

- **Story:** <key>
- **Duration:** <M> minutes (timeout)
- **Timestamp:** <ISO 8601>

## Git Changes

<git diff --stat output or "No changes detected">

## State Delta

<changed story statuses or "No state changes">

## Partial Output (last 100 lines)

```
<last 100 lines of output log>
```
```

### Existing Patterns to Follow

- **Types:** Follow the pattern in `src/modules/sprint/types.ts` — readonly interfaces, union types for statuses.
- **Module files:** Follow the pattern of `state.ts`, `selector.ts`, `reporter.ts` — pure functions taking state as input.
- **Tests:** Follow `reporter.test.ts` and `state.test.ts` patterns — describe blocks, explicit assertions, mock filesystem with `jest.mock('node:fs')`.
- **CLI commands:** Follow `src/commands/status.ts` pattern — Commander option parsing, delegate to module, format output.

### Sprint Module Structure After This Story

```
src/modules/sprint/
├── index.ts              # Re-exports: + captureTimeoutReport, TimeoutReport, TimeoutCapture
├── state.ts              # getSprintState(), updateStoryStatus(), writeStateAtomic()
├── selector.ts           # selectNextStory()
├── reporter.ts           # generateReport(), getStoryDrillDown()
├── drill-down.ts         # drill-down helpers
├── migration.ts          # migrateFromOldFormat()
├── timeout.ts            # captureTimeoutReport() (NEW)
├── types.ts              # Extended: + TimeoutCapture, TimeoutReport (NEW)
├── AGENTS.md             # Module documentation
├── __tests__/
    ├── index.test.ts     # Updated
    ├── state.test.ts     # Existing
    ├── migration.test.ts # Existing
    ├── selector.test.ts  # Existing
    ├── reporter.test.ts  # Existing
    ├── timeout.test.ts   # NEW
```

### Dependencies

- **Epic 2 (done):** Sprint module with `state.ts`, `types.ts`, `reporter.ts` all exist and work. `SprintState`, `StoryState` types are stable.
- **No external dependencies needed.** Uses `node:fs`, `node:child_process` (execSync for git), and existing sprint module types.
- **Ralph (bash):** Needs modification to `ralph/ralph.sh` — add state snapshot before iteration and timeout capture call on exit 124.

### Project Structure Notes

- New `timeout.ts` goes in `src/modules/sprint/` alongside existing module files.
- New `timeout-report.ts` goes in `src/commands/` — must be registered in the main CLI entry point (`src/index.ts` or equivalent Commander setup).
- Timeout report files go in `ralph/logs/` — this directory already exists and is used for iteration output logs.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 1 — Result<T> pattern]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 2 — Unified State Format]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 5 — Status file protocol]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 3.1 — Error Capture on Timeout]
- [Source: ralph/ralph.sh lines 549-704 — execute_iteration() and exit code handling]
- [Source: ralph/lib/timeout_utils.sh — portable_timeout implementation]
- [Source: src/types/result.ts — Result<T>, ok(), fail()]
- [Source: src/types/state.ts — SprintState, StoryState, StoryStatus]
- [Source: src/modules/sprint/types.ts — existing sprint module types]
- [Source: src/modules/sprint/state.ts — getSprintState(), statePath()]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-1-error-capture-on-timeout.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/3-1-error-capture-on-timeout.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None required — clean implementation, no debugging needed.

### Completion Notes List

- Implemented `TimeoutCapture` and `TimeoutReport` types in `types.ts` following existing readonly interface pattern
- Created `timeout.ts` (210 lines) with four exported functions: `captureGitDiff`, `captureStateDelta`, `capturePartialStderr`, `captureTimeoutReport` — all return `Result<T>`, never throw
- Git commands use `execSync` with `{ timeout: 5000 }` to prevent hanging (AC #5)
- `captureTimeoutReport` handles partial failures gracefully — if git is unavailable, other captures still proceed with "(unavailable: ...)" placeholders
- Created thin CLI command `timeout-report.ts` (73 lines) — parses args and delegates to sprint module
- Integrated into `ralph/ralph.sh`: snapshots `sprint-state.json` before each iteration, captures timeout report on exit code 124, verifies report file exists
- 21 unit tests covering all functions, error paths, and the "never throws" guarantee
- 2 BATS integration tests verifying CLI command existence and report file creation
- Updated CLI test to expect 18 commands (was 17)
- Updated `AGENTS.md` for sprint module with timeout.ts documentation
- All 1829 unit tests pass, all BATS integration tests pass
- AC #6 (status --story drill-down showing timeout info) is not implemented — it requires integration with the sprint state to store timeout report paths, which is beyond the scope of this story's tasks

### Change Log

- 2026-03-18: Implemented Story 3.1 — timeout capture on exit code 124. Added types, timeout module, CLI command, ralph integration, unit tests, BATS tests.

### File List

- src/modules/sprint/types.ts (modified — added TimeoutCapture, TimeoutReport interfaces)
- src/modules/sprint/timeout.ts (new — captureGitDiff, captureStateDelta, capturePartialStderr, captureTimeoutReport)
- src/modules/sprint/index.ts (modified — added captureTimeoutReport export and type re-exports)
- src/commands/timeout-report.ts (new — CLI command wrapper)
- src/index.ts (modified — registered timeout-report command)
- src/__tests__/cli.test.ts (modified — updated command count from 17 to 18)
- src/modules/sprint/__tests__/timeout.test.ts (new — 21 unit tests)
- src/modules/sprint/AGENTS.md (modified — added timeout.ts documentation)
- ralph/ralph.sh (modified — added state snapshot before iteration and timeout capture on exit 124)
- tests/timeout_report.bats (new — 2 BATS integration tests)
