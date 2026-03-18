# Story 2.4: Status Story Drill-Down

Status: verifying

## Story

As an operator,
I want `codeharness status --story <id>` for AC-level detail,
so that I can see exactly what failed.

## Acceptance Criteria

1. **Given** a story with failures in sprint-state.json, **When** `codeharness status --story <id>` is called, **Then** the output shows each AC with its verdict: PASS, FAIL, ESCALATE, or PENDING (from `stories[key].acResults`). <!-- verification: cli-verifiable -->
2. **Given** a FAIL verdict on an AC, **Then** the drill-down output shows: the command that was run, expected outcome, actual outcome, reason for failure, and a suggested fix (matching the UX spec format). <!-- verification: cli-verifiable -->
3. **Given** a story with `attempts > 0` and attempt history persisted in sprint-state.json, **When** drill-down is called, **Then** the output shows each attempt's outcome (e.g., "Attempt 1: verify failed (AC 4, same error)"). <!-- verification: cli-verifiable -->
4. **Given** a story with a `proofPath` set in sprint-state.json, **When** drill-down is called, **Then** the output shows the proof file path and AC counts (e.g., "Proof: verification/2-3-proof.md (5/7 pass, 1 fail, 1 escalate)"). <!-- verification: cli-verifiable -->
5. **Given** `codeharness status --story <id>` is called, **Then** the output header shows: full story key, status with attempt count (e.g., "failed (attempt 3/10)"), epic number, and last attempt timestamp. <!-- verification: cli-verifiable -->
6. **Given** `codeharness status --story <id> --json` is called, **When** output is captured, **Then** it returns valid JSON containing: story key, status, epic, attempts, acResults (with per-AC verdicts and detail), attempt history, and proof info. <!-- verification: cli-verifiable -->
7. **Given** a story key that does not exist in sprint-state.json, **When** `codeharness status --story <id>` is called, **Then** it prints a `[FAIL]` message like "Story '<id>' not found in sprint state" and exits with non-zero code. <!-- verification: cli-verifiable -->
8. **Given** `getStoryDrillDown(key)` is called in `src/modules/sprint/reporter.ts`, **When** any error occurs (malformed state, missing fields), **Then** it returns `fail(error)` -- never throws an uncaught exception. <!-- verification: cli-verifiable -->
9. **Given** a story with no acResults (null), **When** drill-down is called, **Then** it shows "No AC results recorded" instead of crashing. <!-- verification: cli-verifiable -->
10. **Given** the sprint module after this story, **When** `getStoryDrillDown` is called from `index.ts`, **Then** it delegates to `reporter.ts` using the current sprint state from `getSprintState()` and returns `Result<StoryDrillDown>`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Extend `src/modules/sprint/types.ts` with drill-down types (AC: #1, #2, #3, #4, #5, #6)
  - [x] Define `AcDetail` type: `id`, `verdict`, `command?`, `expected?`, `actual?`, `reason?`, `suggestedFix?`
  - [x] Define `AttemptRecord` type: `number`, `outcome`, `failingAc?`, `timestamp?`
  - [x] Define `ProofSummary` type: `path`, `passCount`, `failCount`, `escalateCount`
  - [x] Define `StoryDrillDown` type: `key`, `status`, `epic`, `attempts`, `maxAttempts`, `lastAttempt`, `acDetails`, `attemptHistory`, `proofSummary`
- [x] Task 2: Implement `getStoryDrillDown()` in `src/modules/sprint/reporter.ts` (AC: #1, #2, #3, #4, #5, #7, #8, #9)
  - [x] Implement `getStoryDrillDown(state: SprintState, key: string): Result<StoryDrillDown>`
  - [x] Return `fail()` if story key not found in state
  - [x] Build `acDetails` from `story.acResults` — map each AC to `AcDetail`, enriching FAIL entries with command/expected/actual/reason/fix from `lastError` or acResults metadata
  - [x] Build `attemptHistory` from story attempts count (note: current StoryState tracks count, not per-attempt log — build synthetic entries from available data)
  - [x] Build `proofSummary` from `story.proofPath` and `story.acResults` counts
  - [x] Handle null acResults gracefully (AC #9)
  - [x] Wrap all logic in try/catch, return `fail()` on error (AC #8)
- [x] Task 3: Update `src/modules/sprint/index.ts` (AC: #10)
  - [x] Import `getStoryDrillDown` from `./reporter.js`
  - [x] Export new `getStoryDrillDown(key: string): Result<StoryDrillDown>` that calls `getSprintState()` then delegates to reporter
  - [x] Export `StoryDrillDown` type
- [x] Task 4: Update `src/commands/status.ts` to support `--story <id>` option (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Add `.option('--story <id>', 'Show detailed status for a specific story')` to the status command
  - [x] When `--story` is provided, call `getStoryDrillDown(key)` instead of `generateReport()`
  - [x] Format human-readable output matching UX spec: header (story key, status, epic, last attempt), AC Results section (per-AC verdict with FAIL detail), History section (per-attempt outcomes), Proof line
  - [x] Format JSON output when `--json --story` are combined (AC #6)
  - [x] Print `[FAIL]` and exit non-zero if story not found (AC #7)
- [x] Task 5: Write unit tests in `src/modules/sprint/__tests__/reporter.test.ts` (AC: #1, #2, #3, #4, #5, #7, #8, #9)
  - [x] Test drill-down with all AC verdicts (pass, fail, escalate, pending)
  - [x] Test FAIL detail includes command, expected, actual, reason, suggested fix
  - [x] Test attempt history rendering
  - [x] Test proof summary with counts
  - [x] Test story not found returns `fail()`
  - [x] Test null acResults shows "No AC results recorded"
  - [x] Test error handling: malformed state returns `fail()`, not throw
  - [x] Test header includes status with attempt count, epic, last attempt timestamp
- [x] Task 6: Update `src/modules/sprint/__tests__/index.test.ts` (AC: #10)
  - [x] Add test for `getStoryDrillDown()` delegation to reporter
  - [x] Test error propagation from state read failure
- [x] Task 7: Verify build (`npm run build`) succeeds
- [x] Task 8: Verify all existing tests pass (`npm test`)
- [x] Task 9: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** -- every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** -- all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** -- `strict: true`, no `any` types (NFR19).
- **File size limit** -- no file exceeds 300 lines (NFR18). The reporter.ts is currently ~203 lines. Adding `getStoryDrillDown()` should keep it well under 300. If it would exceed, extract a `drill-down.ts` internal module.
- **100% test coverage** on new code (NFR14).
- **Module boundary** -- reporter.ts is internal to sprint module. Only `index.ts` is the public interface.

### UX Spec Compliance

The output format MUST match the UX design specification (`_bmad-output/planning-artifacts/ux-design-specification.md`). Key format:

```
Story: 2-3-observability-querying-agent-visibility-into-runtime
Status: failed (attempt 3/10)
Epic: 2 -- Observability Stack
Last attempt: 2026-03-18T03:42:15Z

-- AC Results -------------------------------------------------------
AC 1: [PASS] VictoriaLogs query returns structured logs
AC 2: [PASS] VictoriaMetrics query returns metrics
AC 3: [PASS] Agent queries logs during dev workflow
AC 4: [FAIL] Status command reports stack health correctly
  Command:  docker exec codeharness-verify codeharness status --check-docker
  Expected: exit 0 with "running" for all services
  Actual:   exit 1
  Output:   [FAIL] VictoriaMetrics stack: not running
  Reason:   Checks project-level container names (codeharness-victoria-logs-1)
            but shared stack uses (codeharness-shared-victoria-logs-1)
  Suggest:  Fix container name matching in src/commands/status.ts
AC 5: [PASS] Query endpoints accessible from verification container
AC 6: [ESCALATE] Observability data persists across sessions
AC 7: [PASS] OTLP instrumentation auto-configured

-- History ----------------------------------------------------------
Attempt 1: verify failed (AC 4, same error)
Attempt 2: dev fix applied -> verify failed (AC 4, same error)
Attempt 3: dev fix applied -> verify failed (AC 4, same error)

Proof: verification/2-3-proof.md (5/7 pass, 1 fail, 1 escalate)
```

### AcDetail Enrichment

The current `AcResult` type (`src/types/state.ts`) only has `id` and `verdict`. For FAIL detail (command, expected, actual, reason, suggestedFix), this data must come from somewhere. Options:

1. **Extend `AcResult`** in `state.ts` to include optional detail fields. This is the cleanest approach but changes a shared type.
2. **Parse proof document** at drill-down time to extract detail. More fragile but requires no schema change.
3. **Store detail in `lastError` as structured text.** Already partially done -- `lastError` often contains the failing AC info.

Recommended: Extend `AcResult` with optional detail fields (`command?`, `expected?`, `actual?`, `reason?`, `suggestedFix?`). The verifier already has this data when it produces verdicts. The drill-down just surfaces it. If detail fields are absent, show just the verdict without detail.

### Attempt History Limitation

The current `StoryState` tracks `attempts: number` (a count) and `lastAttempt: string | null` (a timestamp), but does NOT store per-attempt history. For this story, the drill-down can:

1. Show the total attempt count and the last attempt's details.
2. If acResults are available, show the current/latest attempt detail.
3. For historical attempts, show synthetic entries like "Attempt 1-2: details unavailable" or just show the count.

A future enhancement could add an `attemptHistory: AttemptRecord[]` field to `StoryState`, but that is out of scope for this story. The UX spec shows attempt history, so approximate it with available data.

### Sprint Module Structure After This Story

```
src/modules/sprint/
|-- index.ts              # Re-exports: getSprintState, updateStoryStatus, getNextStory, generateReport, getStoryDrillDown
|-- state.ts              # getSprintState(), updateStoryStatus(), writeStateAtomic(), defaultState()
|-- selector.ts           # selectNextStory()
|-- reporter.ts           # generateReport(), getStoryDrillDown() (NEW)
|-- migration.ts          # migrateFromOldFormat()
|-- types.ts              # Extended: StoryDrillDown, AcDetail, AttemptRecord, ProofSummary (NEW)
|-- AGENTS.md             # Module documentation
|-- __tests__/
    |-- index.test.ts     # Updated
    |-- state.test.ts     # Existing
    |-- migration.test.ts # Existing
    |-- selector.test.ts  # Existing
    |-- reporter.test.ts  # Updated with drill-down tests
```

### Dependencies

- **Story 2.1 (done):** `state.ts`, `getSprintState()`, `SprintState` type all exist and work.
- **Story 2.2 (done):** `selector.ts`, `getNextStory()` work.
- **Story 2.3 (done):** `reporter.ts`, `generateReport()` work. `StatusReport` and related types exist.
- **No external dependencies needed.** Pure TypeScript logic over in-memory state for drill-down. Status command integration uses existing Commander.js patterns.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md -- reporter.ts in sprint module]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 2.4]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md -- FR29, FR30]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md -- Story Drill-Down UX]
- [Source: src/types/state.ts -- SprintState, StoryState, AcResult, AcVerdict]
- [Source: src/modules/sprint/types.ts -- StatusReport, FailedStoryDetail (existing)]
- [Source: src/modules/sprint/reporter.ts -- generateReport() (existing, add getStoryDrillDown)]
- [Source: src/modules/sprint/index.ts -- add getStoryDrillDown() export]
- [Source: src/commands/status.ts -- add --story option]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-4-status-story-drill-down.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/2-4-status-story-drill-down.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
