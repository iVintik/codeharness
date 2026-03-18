# Story 3.3: Verify-Dev Feedback Loop

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system,
I want verification failures to return stories to dev with findings,
so that the dev module can fix exact issues.

## Acceptance Criteria

1. **Given** a proof document exists at `verification/{story_key}-proof.md` with one or more failing ACs (verdict is not PASS and not `[ESCALATE]`), **When** the feedback loop processes the proof, **Then** it extracts each failing AC's number, description, and error output, writes a `## Verification Findings` section into the story file at `_bmad-output/implementation-artifacts/{story_key}.md`, and updates the story status to `in-progress` in `sprint-state.json` via `updateStoryStatus(key, 'in-progress')`. <!-- verification: cli-verifiable -->

2. **Given** a story file contains a `## Verification Findings` section from a previous verification cycle, **When** `developStory(key)` is invoked (via the harness-run orchestration), **Then** the dev prompt passed to `claude --print` includes the full text of the `## Verification Findings` section so the dev agent knows exactly which ACs failed and what the error output was. <!-- verification: integration-required -->

3. **Given** a story's attempt count in `sprint-state.json` reaches N >= 10 (via `stories[key].attempts`), **When** the feedback loop checks the attempt count, **Then** the story status is updated to `blocked` with `lastError: 'verify-dev-cycle-limit'` and the loop does NOT return the story to dev again. <!-- verification: cli-verifiable -->

4. **Given** `sprint-state.json` contains `stories[key].attempts = N` (where N > 0), **When** the process is restarted (new ralph iteration or new `codeharness run` session), **Then** the attempt count is read from `sprint-state.json` and continues from N (not reset to 0). <!-- verification: cli-verifiable -->

5. **Given** a proof document with ALL ACs passing (verdict PASS or `[ESCALATE]`), **When** the feedback loop processes it, **Then** the story status is updated to `done` and NO `## Verification Findings` section is written. <!-- verification: cli-verifiable -->

6. **Given** the `processVerifyResult` function is called and any error occurs (missing proof file, malformed proof, I/O failure), **When** the error is caught, **Then** it returns `Result<FeedbackResult>` with `fail(error)` -- never throws an uncaught exception. <!-- verification: cli-verifiable -->

7. **Given** `src/modules/sprint/feedback.ts` exists, **When** all files in `src/modules/sprint/` are reviewed, **Then** no file exceeds 300 lines (NFR18) and only `index.ts` is imported from outside the module. <!-- verification: cli-verifiable -->

8. **Given** new code in `src/modules/sprint/`, **When** unit tests run, **Then** 100% coverage on all new/changed code (NFR14) with tests in `src/modules/sprint/__tests__/`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Define feedback loop types in `src/modules/sprint/types.ts` (AC: #1, #3, #5, #6)
  - [x] Define `FailingAc` type: `acNumber: number`, `description: string`, `errorOutput: string`, `verdict: string`
  - [x] Define `FeedbackResult` type: `storyKey: string`, `action: 'return-to-dev' | 'mark-done' | 'mark-blocked'`, `failingAcs: FailingAc[]`, `attempts: number`
  - [x] All fields `readonly`

- [x] Task 2: Implement `src/modules/sprint/feedback.ts` (AC: #1, #3, #4, #5, #6)
  - [x] Implement `parseProofForFailures(proofPath: string): Result<FailingAc[]>` -- reads proof markdown, extracts failing ACs (non-PASS, non-ESCALATE verdicts) with AC number, description, and error output
  - [x] Implement `writeVerificationFindings(storyKey: string, failingAcs: FailingAc[]): Result<void>` -- reads story file, replaces or appends `## Verification Findings` section before `## Dev Agent Record` (or at end), writes back
  - [x] Implement `processVerifyResult(storyKey: string, opts?: { maxAttempts?: number }): Result<FeedbackResult>` -- orchestrates: read proof, check attempts, decide action (return-to-dev / mark-done / mark-blocked), update state, write findings if needed
  - [x] Default `maxAttempts` to 10
  - [x] Use `getSprintState()` and `updateStoryStatus()` from `./state.js` for state reads/writes
  - [x] Wrap all I/O in try/catch, return `Result<T>`, never throw
  - [x] Keep under 300 lines (NFR18)

- [x] Task 3: Export from sprint module index (AC: #6, #7)
  - [x] Add `processVerifyResult` to `src/modules/sprint/index.ts` exports
  - [x] Export `FeedbackResult` and `FailingAc` types

- [x] Task 4: Write unit tests in `src/modules/sprint/__tests__/feedback.test.ts` (AC: #1, #3, #4, #5, #6, #8)
  - [x] Test `parseProofForFailures()` extracts failing ACs from proof markdown
  - [x] Test `parseProofForFailures()` returns empty array when all ACs pass
  - [x] Test `parseProofForFailures()` skips `[ESCALATE]` verdicts (not treated as failures)
  - [x] Test `parseProofForFailures()` returns `fail()` on missing proof file
  - [x] Test `writeVerificationFindings()` appends findings section to story file
  - [x] Test `writeVerificationFindings()` replaces existing findings section
  - [x] Test `processVerifyResult()` returns `action: 'return-to-dev'` with failing ACs
  - [x] Test `processVerifyResult()` returns `action: 'mark-done'` when all pass
  - [x] Test `processVerifyResult()` returns `action: 'mark-blocked'` when attempts >= 10
  - [x] Test `processVerifyResult()` increments attempt count via `updateStoryStatus(key, 'in-progress')`
  - [x] Test `processVerifyResult()` reads existing attempt count from state (AC #4 -- persistence)
  - [x] Test all functions return `Result<T>` -- never throw
  - [x] Mock `node:fs` for file operations, mock state module functions

- [x] Task 5: Verify build and tests (AC: #7, #8)
  - [x] `npm run build` succeeds
  - [x] `npm test` passes all existing + new tests (1888 tests, 71 files)
  - [x] No file in `src/modules/sprint/` exceeds 300 lines (feedback.ts=246, types.ts=151, index.ts=115)
  - [x] Coverage target met on new code (100% statements, 100% functions)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** -- every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** -- all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** -- `strict: true`, no `any` types (NFR19).
- **File size limit** -- no file exceeds 300 lines (NFR18). Create a new `feedback.ts` file for the feedback loop logic; do NOT add to existing files.
- **100% test coverage** on new code (NFR14).
- **Module boundary** -- `feedback.ts` is internal to sprint module. Only `index.ts` is the public interface.
- **Atomic writes** -- when modifying `sprint-state.json`, use `updateStoryStatus()` from `./state.js` which already handles atomic write (temp + rename) per NFR4.

### Key FRs & NFRs

- **FR25:** System can detect when verification finds code bugs and return story to dev.
- **FR26:** Dev module can fail independently without crashing sprint execution.
- **FR9:** System can run autonomously for 8+ hours without crashes or unrecoverable state.
- **NFR1:** No module failure crashes the overall system -- structured error results.
- **NFR2:** codeharness run survives 8+ hours without crashes or memory leaks.
- **NFR3:** Every ralph iteration produces a report, even on timeout -- zero 0-byte outputs.
- **NFR14:** 100% test coverage on new/changed code.
- **NFR18:** No source file exceeds 300 lines.
- **NFR19:** Module interfaces documented with TypeScript types -- no `any`.

### How the Feedback Loop Works in Context

The feedback loop sits between the verify and dev phases in the harness-run orchestration (see `commands/harness-run.md`, Step 3d-vii Path A):

1. **Verification runs** and produces a proof document at `verification/{story_key}-proof.md`.
2. **`codeharness verify --story {story_key}`** parses the proof and reports pass/fail/escalate counts.
3. **If ACs fail** (pending > 0), the feedback loop:
   a. Reads the proof file and extracts failing AC details (number, description, error output).
   b. Writes a `## Verification Findings` section into the story file.
   c. Updates story status to `in-progress` in `sprint-state.json`.
   d. The next dev iteration picks up the findings from the story file.
4. **If all ACs pass**, the story is marked `done`.
5. **If attempts >= 10**, the story is marked `blocked`.

Currently, steps (a)-(d) are orchestrated by the harness-run skill at the markdown/prompt level. This story moves the logic into a TypeScript function `processVerifyResult()` in the sprint module, making it testable and reusable.

### Proof Document Format

Proof documents follow this structure (from `commands/harness-run.md`):

```markdown
## AC 1: Description of the acceptance criterion

```bash
command used to verify
```

```output
actual output from the command
```

**Verdict:** PASS
```

Failing ACs have `**Verdict:** FAIL` (or any verdict that is not `PASS` and not contains `[ESCALATE]`). The parser must handle:
- `**Verdict:** PASS` -- skip
- `**Verdict:** FAIL` -- extract as failure
- `**Verdict:** [ESCALATE]` -- skip (not a code bug)
- Verdicts can appear on the same line or the next line after `Verdict:`

### Verification Findings Format

Written into the story file (from `commands/harness-run.md`, Step 3d-vii):

```markdown
## Verification Findings

_Last updated: {ISO timestamp}_

The following ACs failed black-box verification:

### AC {N}: {description}
**Verdict:** FAIL
**Error output:**
```
{relevant error output from proof}
```
```

### Attempt Count Persistence (AC #4)

`sprint-state.json` already tracks `stories[key].attempts` as a number. The `updateStoryStatus(key, 'in-progress')` call in `state.ts` already increments `attempts` by 1 when status is set to `in-progress`. This means:
- The feedback loop does NOT need to manually increment attempts -- calling `updateStoryStatus(key, 'in-progress')` handles it.
- Persistence across sessions is automatic -- the count lives in `sprint-state.json`.
- To check the current count, read `getSprintState()` and check `stories[key].attempts`.

### Existing Functions to Reuse

- `getSprintState()` from `./state.js` -- reads sprint-state.json
- `updateStoryStatus(key, status, detail?)` from `./state.js` -- atomic write with attempt increment on `in-progress`
- `ok()`, `fail()` from `../../types/result.js` -- Result constructors

### Sprint Module Structure After This Story

```
src/modules/sprint/
├── index.ts              # Re-exports: + processVerifyResult, FeedbackResult, FailingAc
├── state.ts              # getSprintState(), updateStoryStatus(), writeStateAtomic()
├── selector.ts           # selectNextStory()
├── reporter.ts           # generateReport(), getStoryDrillDown()
├── drill-down.ts         # drill-down helpers
├── migration.ts          # migrateFromOldFormat()
├── timeout.ts            # captureTimeoutReport()
├── feedback.ts           # processVerifyResult(), parseProofForFailures(), writeVerificationFindings() (NEW)
├── types.ts              # Extended: + FailingAc, FeedbackResult (NEW)
├── AGENTS.md             # Module documentation
├── __tests__/
    ├── index.test.ts     # Updated
    ├── state.test.ts     # Existing
    ├── migration.test.ts # Existing
    ├── selector.test.ts  # Existing
    ├── reporter.test.ts  # Existing
    ├── timeout.test.ts   # Existing
    ├── feedback.test.ts  # NEW
```

### Dependencies

- **Epic 1 (done):** Result<T> types in `src/types/result.ts` -- `ok()`, `fail()`, `Result<T>`, `isOk()`, `isFail()`.
- **Epic 2 (done):** Sprint module with state management -- `getSprintState()`, `updateStoryStatus()`, `StoryState`, `StoryStatus` all exist and work.
- **Story 3.1 (verifying):** Timeout capture in `timeout.ts` -- similar pattern of wrapping I/O in try/catch and returning Result<T>.
- **Story 3.2 (verifying):** Dev module orchestrator in `orchestrator.ts` -- `developStory()` exists and works. The dev module is NOT modified by this story; the harness-run prompt handles injecting findings into the dev prompt.
- **Verify module (stub):** `verifyStory()` and `parseProof()` are stubs returning `fail('not implemented')`. This story does NOT depend on them being implemented -- `processVerifyResult` reads the proof file directly.

### What This Story Does NOT Do

- Does NOT modify the dev module (`src/modules/dev/`). The dev module receives findings via the harness-run prompt (AC #2), not via TypeScript code changes. AC #2 is about the prompt construction in `commands/harness-run.md`, which already handles this.
- Does NOT modify `commands/harness-run.md`. The harness-run skill already has the prompt logic for injecting findings.
- Does NOT implement the verify module. Proof parsing here is specific to extracting failures for the feedback loop, not full proof quality assessment.
- Does NOT add a CLI command. The feedback loop is invoked programmatically by the sprint orchestration, not directly by users.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 1 -- Result<T> pattern]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 3.3 -- Verify-Dev Feedback Loop]
- [Source: commands/harness-run.md#Step 3d-vii Path A -- Code bugs handling]
- [Source: commands/harness-run.md#Step 3b -- Dev prompt with verification findings]
- [Source: src/types/result.ts -- Result<T>, ok(), fail()]
- [Source: src/types/state.ts -- SprintState, StoryState, StoryStatus]
- [Source: src/modules/sprint/state.ts -- getSprintState(), updateStoryStatus()]
- [Source: src/modules/sprint/types.ts -- existing sprint module types]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-3-verify-dev-feedback-loop.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/3-3-verify-dev-feedback-loop.md`

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

- Implemented `FailingAc` and `FeedbackResult` types in `types.ts` with all fields readonly
- Created `feedback.ts` (246 lines) with three functions: `parseProofForFailures`, `writeVerificationFindings`, `processVerifyResult`
- All functions return `Result<T>`, never throw — wrapped in try/catch
- `processVerifyResult` orchestrates: parse proof -> check attempts -> decide action -> update state -> write findings
- Attempt counting delegated to `updateStoryStatus('in-progress')` which auto-increments
- 27 unit tests covering all ACs, edge cases, error paths, and never-throw guarantees
- 100% statement and function coverage on feedback.ts
- Full regression suite: 1888 tests pass (71 files), zero regressions
- Build clean, no TypeScript errors

### File List

- src/modules/sprint/types.ts (modified) — added FailingAc and FeedbackResult types
- src/modules/sprint/feedback.ts (new) — feedback loop implementation
- src/modules/sprint/index.ts (modified) — re-exports processVerifyResult, FeedbackResult, FailingAc
- src/modules/sprint/__tests__/feedback.test.ts (new) — 27 unit tests
