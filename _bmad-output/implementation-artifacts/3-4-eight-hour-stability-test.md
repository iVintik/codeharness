# Story 3.4: 8-Hour Stability Test

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want verified 8-hour unattended operation,
so that I can trust overnight runs.

## Acceptance Criteria

1. **Given** an 8-hour ralph run against a test fixture project with at least 5 stories (mix of trivially-passing, deliberately-failing, and timeout-inducing stories), **When** the run completes, **Then** ralph exits cleanly (exit 0 or loop-timeout), no uncaught exceptions appear in `ralph/logs/ralph.log`, no Node.js `FATAL ERROR` or `heap out of memory` messages appear in any output log under `ralph/logs/`, and `sprint-state.json` is valid JSON that can be parsed by `jq '.'` without error. <!-- verification: integration-required -->

2. **Given** a completed 8-hour run that included a mix of successful iterations (exit 0), failed iterations (exit 1), and timed-out iterations (exit 124), **When** `sprint-state.json` is inspected, **Then** every story key present in `sprint-status.yaml` has a corresponding entry in `sprint-state.json`, each story's `status` field is one of the valid values (`backlog`, `in-progress`, `verifying`, `done`, `blocked`), each story's `attempts` count is a non-negative integer, and `codeharness status` output matches `sprint-state.json` data (done count, failed count, blocked count all agree). <!-- verification: cli-verifiable -->

3. **Given** a running ralph iteration that is mid-verification (a Docker verification container is active), **When** the Docker container is killed externally via `docker kill`, **Then** the iteration detects the failure (non-zero exit from `docker exec` or `claude --print`), logs an error line containing the story key to `ralph/logs/ralph.log`, does NOT crash the ralph loop, and the next iteration starts within 60 seconds (or after the configured inter-iteration sleep). <!-- verification: integration-required -->

4. **Given** ralph runs for 8 hours with `LOOP_TIMEOUT_SECONDS=28800` and `MAX_ITERATIONS=500`, **When** the run completes, **Then** the resident memory (RSS) of the ralph bash process never exceeded 100MB at any point during execution (measured by periodic `ps -o rss=` sampling), and no individual `ralph/logs/claude_output_*.log` file exceeds 50MB in size. <!-- verification: integration-required -->

5. **Given** ralph runs for 8 hours, **When** the filesystem is inspected afterward, **Then** `ralph/logs/` contains at least one log file per completed iteration (`claude_output_*.log`), every log file has non-zero size (>0 bytes), and the total log directory size does not exceed 2GB. <!-- verification: cli-verifiable -->

6. **Given** a ralph run where a story transitions through `in-progress` -> `verifying` -> `in-progress` (verify-dev feedback loop) multiple times, **When** `sprint-state.json` is inspected, **Then** the `attempts` field for that story equals the number of times it entered `in-progress`, and the `lastError` field contains the most recent failure reason (not stale data from a prior cycle). <!-- verification: cli-verifiable -->

7. **Given** ralph encounters 3 consecutive iteration failures (exit code != 0 and != 124 and != 2), **When** the consecutive failure limit is reached, **Then** ralph halts with status `consecutive_failures` in `ralph/status.json`, and the operator can resume by running ralph again (state is recoverable, not corrupted). <!-- verification: cli-verifiable -->

8. **Given** `sprint-state.json` exists from a previous ralph session that was interrupted (e.g., SIGINT), **When** ralph starts a new session, **Then** it reads the existing `sprint-state.json` without error, preserves all story statuses and attempt counts from the previous session, and continues from the next actionable story (does not re-process `done` stories). <!-- verification: cli-verifiable -->

9. **Given** `src/modules/sprint/` directory, **When** all files are reviewed, **Then** no file exceeds 300 lines (NFR18) and only `index.ts` is imported from outside the module. <!-- verification: cli-verifiable -->

10. **Given** new code in `src/modules/sprint/`, **When** unit tests run, **Then** 100% coverage on all new/changed code (NFR14) with tests in `src/modules/sprint/__tests__/`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create test fixture project for stability testing (AC: #1, #2, #5)
  - [x] Create `tests/fixtures/stability-test-project/` with a minimal project structure
  - [x] Create `sprint-status.yaml` with 5 stories: 2 trivially-passing, 1 deliberately-failing, 1 timeout-inducing (infinite loop), 1 that cycles through verify-dev feedback
  - [x] Create minimal story files for each fixture story
  - [x] Create a `sprint-state.json` seed file with all stories in `backlog`

- [x] Task 2: Create stability test harness script `tests/stability/run-8h-test.sh` (AC: #1, #4, #5)
  - [x] Script invokes `ralph/ralph.sh` with `LOOP_TIMEOUT_SECONDS=28800`, `MAX_ITERATIONS=500`, `ITERATION_TIMEOUT_MINUTES=30`
  - [x] Periodic RSS sampling: background loop runs `ps -o rss= -p $RALPH_PID` every 60 seconds, appends to `tests/stability/rss-samples.log`
  - [x] On completion, validate: no `FATAL ERROR` in logs, `sprint-state.json` parseable, RSS never exceeded 100MB, no individual log > 50MB, total logs < 2GB
  - [x] Produce summary report at `tests/stability/stability-report.md`

- [x] Task 3: Implement `sprint-state.json` consistency validator in `src/modules/sprint/validator.ts` (AC: #2, #6, #7, #8)
  - [x] Implement `validateStateConsistency(statePath: string, sprintStatusPath: string): Result<ValidationReport>`
  - [x] Check: every story in sprint-status.yaml has a sprint-state.json entry
  - [x] Check: all status values are valid enum members
  - [x] Check: all attempt counts are non-negative integers
  - [x] Check: `lastError` is non-stale (timestamp within last attempt window)
  - [x] Return `Result<T>`, never throw

- [x] Task 4: Add `codeharness validate-state` CLI command (AC: #2, #6)
  - [x] Thin CLI wrapper (<100 lines) calling `validateStateConsistency()`
  - [x] Outputs: total stories, valid count, invalid count, per-story issues
  - [x] Exit 0 on all valid, exit 1 on any invalid

- [x] Task 5: Export from sprint module index (AC: #9)
  - [x] Add `validateStateConsistency` to `src/modules/sprint/index.ts` exports
  - [x] Export `ValidationReport` type

- [x] Task 6: Write unit tests for validator in `src/modules/sprint/__tests__/validator.test.ts` (AC: #2, #6, #7, #8, #10)
  - [x] Test valid state passes validation
  - [x] Test missing story key detected
  - [x] Test invalid status value detected
  - [x] Test negative attempt count detected
  - [x] Test stale `lastError` detected
  - [x] Test recovery after interrupted session (state preserved)
  - [x] Test all functions return `Result<T>` -- never throw
  - [x] Mock `node:fs` for file operations

- [x] Task 7: Write BATS integration tests in `tests/stability_validation.bats` (AC: #2, #7, #8)
  - [x] Test `codeharness validate-state` command exists and accepts options
  - [x] Test validation against a known-good fixture state file
  - [x] Test validation detects known-bad fixture state file
  - [x] Test ralph session recovery: start ralph, SIGINT, restart, verify state preserved

- [x] Task 8: Create Docker kill resilience test in `tests/stability/docker-kill-test.sh` (AC: #3)
  - [x] Start a ralph iteration that triggers verification
  - [x] In background, wait for Docker verification container to appear, then `docker kill` it
  - [x] Verify: ralph logs the error, does not crash, proceeds to next iteration
  - [x] This is a manual/CI integration test, not a unit test

- [x] Task 9: Verify build (`npm run build`) succeeds
- [x] Task 10: Verify all existing tests pass (`npm test`)
- [x] Task 11: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** -- every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** -- all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** -- `strict: true`, no `any` types (NFR19).
- **File size limit** -- no file exceeds 300 lines (NFR18). The validator should be a new file `validator.ts`, not added to existing files.
- **100% test coverage** on new code (NFR14).
- **Module boundary** -- `validator.ts` is internal to sprint module. Only `index.ts` is the public interface.
- **Thin CLI commands** -- command files in `src/commands/` must be <100 lines (NFR, FR40).

### Key FRs & NFRs

- **FR9:** System can run autonomously for 8+ hours without crashes or unrecoverable state. This is THE core requirement for this story.
- **FR12:** System captures useful output from every iteration, including failed/timed-out ones.
- **NFR1:** No module failure crashes the overall system -- structured error results.
- **NFR2:** codeharness run survives 8+ hours without crashes or memory leaks.
- **NFR3:** Every ralph iteration produces a report, even on timeout -- zero 0-byte outputs.
- **NFR4:** State files use atomic write (temp + rename).
- **NFR14:** 100% test coverage on new/changed code.
- **NFR18:** No source file exceeds 300 lines.

### What This Story Validates vs. Implements

This story is primarily a **validation** story -- it proves that the infrastructure built in Stories 3.1, 3.2, and 3.3 works correctly under sustained load. The new code is:

1. **State consistency validator** (`validator.ts`) -- a tool to verify sprint-state.json integrity after long runs.
2. **`validate-state` CLI command** -- thin wrapper for the validator.
3. **Test fixtures and harness scripts** -- infrastructure for running and validating 8-hour tests.

The story does NOT re-implement ralph's main loop, timeout handling, or feedback loop. Those are already implemented in Stories 3.1-3.3.

### Ralph Stability Properties (Already Implemented)

Ralph already has several stability mechanisms:
- **Circuit breaker** (`ralph/lib/circuit_breaker.sh`) -- halts on stagnation (3 no-progress iterations)
- **Rate limiting** -- MAX_CALLS_PER_HOUR with backoff
- **Consecutive failure limit** -- halts after 3 consecutive failures
- **Timeout capture** (Story 3.1) -- every timeout produces a report
- **Graceful dev module** (Story 3.2) -- dev failures return Result, never crash
- **Feedback loop** (Story 3.3) -- verify failures return to dev, blocked after 10 attempts
- **Crash recovery** -- reads existing state on restart
- **Atomic state writes** (Epic 2) -- temp + rename pattern

### 8-Hour Test Strategy

The 8-hour test cannot run in CI (too long). It is designed to:
1. Run locally or on a dedicated machine (`tests/stability/run-8h-test.sh`)
2. Use a test fixture project with controlled story outcomes
3. Monitor RSS memory usage via periodic sampling
4. Produce a human-readable stability report
5. The **unit-testable** parts (state validation, consistency checks) run in CI via `npm test` and BATS

### Docker Kill Test Strategy (AC #3)

AC #3 requires killing a Docker container mid-verification. This tests that:
- The `docker exec` or `claude --print` invocation inside the verification step fails with a non-zero exit
- The dev module (Story 3.2) catches the failure and returns `fail()`
- Ralph's main loop handles the failure (increments retry, continues)

This is a manual integration test script, not an automated unit test. It requires Docker to be running.

### Sprint Module Structure After This Story

```
src/modules/sprint/
├── index.ts              # Re-exports: + validateStateConsistency, ValidationReport
├── state.ts              # getSprintState(), updateStoryStatus(), writeStateAtomic()
├── selector.ts           # selectNextStory()
├── reporter.ts           # generateReport(), getStoryDrillDown()
├── drill-down.ts         # drill-down helpers
├── migration.ts          # migrateFromOldFormat()
├── timeout.ts            # captureTimeoutReport()
├── feedback.ts           # processVerifyResult()
├── validator.ts           # validateStateConsistency() (NEW)
├── types.ts              # Extended: + ValidationReport (NEW)
├── AGENTS.md             # Module documentation
├── __tests__/
    ├── index.test.ts     # Updated
    ├── state.test.ts     # Existing
    ├── migration.test.ts # Existing
    ├── selector.test.ts  # Existing
    ├── reporter.test.ts  # Existing
    ├── timeout.test.ts   # Existing
    ├── feedback.test.ts  # Existing
    ├── validator.test.ts # NEW
```

### Dependencies

- **Epic 1 (done):** Result<T> types in `src/types/result.ts` -- `ok()`, `fail()`, `Result<T>`, `isOk()`, `isFail()`.
- **Epic 2 (done):** Sprint module with state management -- `getSprintState()`, `updateStoryStatus()`, `SprintState`, `StoryState` all exist and work.
- **Story 3.1 (verifying):** Timeout capture -- `captureTimeoutReport()` writes reports on exit 124.
- **Story 3.2 (verifying):** Graceful dev module -- `developStory()` returns `Result<DevResult>`, never crashes.
- **Story 3.3 (verifying):** Feedback loop -- `processVerifyResult()` returns stories to dev or marks blocked.
- **Docker** -- AC #3 requires Docker to be running. The test script checks for Docker availability and skips if not present.

### Existing Patterns to Follow

- **Types:** Follow the pattern in `src/modules/sprint/types.ts` -- readonly interfaces, union types for statuses.
- **Module files:** Follow the pattern of `state.ts`, `feedback.ts` -- pure functions taking state as input, returning Result<T>.
- **Tests:** Follow `feedback.test.ts` and `state.test.ts` patterns -- describe blocks, explicit assertions, mock filesystem with `jest.mock('node:fs')`.
- **CLI commands:** Follow `src/commands/status.ts` pattern -- Commander option parsing, delegate to module, format output.
- **BATS tests:** Follow `tests/timeout_report.bats` pattern -- setup/teardown, run command, assert status/output.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 1 -- Result<T> pattern]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 2 -- Unified State Format]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 3.4 -- 8-Hour Stability Test]
- [Source: ralph/ralph.sh -- main loop, circuit breaker, timeout handling]
- [Source: ralph/lib/circuit_breaker.sh -- stagnation detection]
- [Source: src/types/result.ts -- Result<T>, ok(), fail()]
- [Source: src/types/state.ts -- SprintState, StoryState, StoryStatus]
- [Source: src/modules/sprint/state.ts -- getSprintState(), updateStoryStatus()]
- [Source: src/modules/sprint/timeout.ts -- captureTimeoutReport()]
- [Source: src/modules/sprint/feedback.ts -- processVerifyResult()]

## Verification Findings

_Last updated: 2026-03-18T17:05Z_

The following ACs failed black-box verification:

### AC 10: 100% test coverage on new code
**Verdict:** FAIL
**Error output:**
```
validator.ts coverage: 92.18% statements, 86.48% branches, 91.93% lines
Uncovered lines: 63-64, 115, 207-208
- Lines 63-64: catch branch in parseSprintStatusKeys (defensive)
- Line 115: fail(keysResult.error) branch (requires parseSprintStatusKeys to fail)
- Lines 207-208: outer catch in validateStateConsistency (defensive error handling)
```

All other ACs passed (7 PASS, 3 ESCALATE for integration-required 8-hour run scenarios).
Fix: Add unit tests that exercise the defensive catch blocks in validator.ts to reach 100% coverage.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-4-eight-hour-stability-test.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/3-4-eight-hour-stability-test.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
