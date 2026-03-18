# Story 2.3: Status Report — One Screen Overview

Status: verifying

## Story

As an operator,
I want `codeharness status` to show full state in one screen,
so that I understand what happened in 10 seconds.

## Acceptance Criteria

1. **Given** an active run (state `run.active === true`), **When** `codeharness status` is called, **Then** the output includes: current story (`sprint.inProgress`), phase (e.g., "verifying", "dev"), AC progress (from `acResults`), iteration count (`run.iteration`), cost (`run.cost`), and elapsed time (computed from `run.startedAt`). <!-- verification: cli-verifiable -->
2. **Given** a completed run (`run.active === false` with `run.startedAt` set), **When** `codeharness status` is called, **Then** the output shows counts for: completed (done), failed (with one-line error per story), blocked, and skipped (retry-exhausted). <!-- verification: cli-verifiable -->
3. **Given** a failed story in the summary, **Then** the output shows: story key, failing AC number, and a one-line error message (from `stories[key].lastError`). <!-- verification: cli-verifiable -->
4. **Given** `codeharness status` is called, **When** execution time is measured, **Then** it returns in less than 3 seconds (NFR7). <!-- verification: cli-verifiable -->
5. **Given** action items exist in `sprint-state.json` (`actionItems` array), **When** `codeharness status` is called, **Then** each action item is shown with a NEW label (if from the current run, determined by matching `run.startedAt` session) or CARRIED label (if from a previous run/session). <!-- verification: integration-required -->
6. **Given** `generateReport()` is called from `src/modules/sprint/index.ts`, **When** it reads sprint state, **Then** it returns `Result<StatusReport>` with all summary fields populated — never throws. <!-- verification: cli-verifiable -->
7. **Given** the sprint state has stories across multiple epics, **When** `codeharness status` is called, **Then** the "Project State" section shows the overall sprint progress (e.g., "17/65 done (26%)") and the count of completed epics. <!-- verification: cli-verifiable -->
8. **Given** `codeharness status --json` is called, **When** output is captured, **Then** the JSON output includes all the same information as the human-readable output: sprint progress, run status, story summaries, and action items. <!-- verification: cli-verifiable -->
9. **Given** no `sprint-state.json` exists and no old-format files exist, **When** `codeharness status` is called, **Then** it shows a default empty state (0 stories, no active run) rather than crashing. <!-- verification: cli-verifiable -->
10. **Given** the reporter module, **When** any filesystem or parsing error occurs, **Then** `generateReport()` returns `fail(error)` — never throws an uncaught exception. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [ ] Task 1: Create `src/modules/sprint/reporter.ts` (AC: #1, #2, #3, #5, #6, #7, #9, #10)
  - [ ] Implement `generateReport(state: SprintState): Result<StatusReport>` — pure function over state
  - [ ] Compute sprint progress: total, done, failed, blocked counts from `state.stories`
  - [ ] Compute epic progress: group stories by epic prefix (e.g., "2-" → Epic 2), count completed epics
  - [ ] Build active-run section: current story, iteration, cost, elapsed time
  - [ ] Build completed-run section: completed, failed (with AC detail), blocked, skipped lists
  - [ ] Build failed-story detail: story key, failing AC number (from `acResults`), one-line error
  - [ ] Build action items section with NEW/CARRIED labels
  - [ ] Wrap all logic in try/catch, return `fail()` on error
- [ ] Task 2: Extend `src/modules/sprint/types.ts` (AC: #1, #2, #3, #5, #7)
  - [ ] Extend `StatusReport` with fields: `epicsTotal`, `epicsDone`, `sprintPercent`, `activeRun` (optional sub-object), `lastRun` (optional sub-object), `failedDetails`, `actionItemsLabeled`
  - [ ] Define `FailedStoryDetail` type: `key`, `acNumber`, `errorLine`, `attempts`, `maxAttempts`
  - [ ] Define `LabeledActionItem` type: `item: ActionItem`, `label: 'NEW' | 'CARRIED'`
  - [ ] Define `RunSummary` type: `duration`, `cost`, `iterations`, `completed`, `failed`, `blocked`, `skipped`
- [ ] Task 3: Update `src/modules/sprint/index.ts` (AC: #6)
  - [ ] Import `generateReport` from `./reporter.js`
  - [ ] Replace `generateReport()` stub with real implementation: call `getSprintState()`, then `generateReportImpl(state)`
  - [ ] Propagate errors as `fail()` results
- [ ] Task 4: Update `src/commands/status.ts` to use sprint module for sprint state display (AC: #1, #2, #3, #4, #5, #7, #8, #9)
  - [ ] Import `generateReport` from sprint module
  - [ ] Add sprint state section to `handleFullStatus()` — call `generateReport()` and format output per UX spec
  - [ ] Add sprint state section to `handleFullStatusJson()` — include all report fields in JSON output
  - [ ] Format output matching UX spec: "Project State", "Active Run" / "Last Run Summary", "Action Items" sections
  - [ ] Ensure total execution time <3 seconds (no network calls for sprint state)
- [ ] Task 5: Write unit tests in `src/modules/sprint/__tests__/reporter.test.ts` (AC: #1, #2, #3, #5, #6, #7, #9, #10)
  - [ ] Test active-run report: includes current story, iteration, cost, elapsed
  - [ ] Test completed-run report: includes done, failed, blocked, skipped counts
  - [ ] Test failed-story detail: shows story key, AC number, one-line error
  - [ ] Test action items labeled NEW vs CARRIED
  - [ ] Test epic progress: groups stories by prefix, counts completed epics
  - [ ] Test empty state: returns valid report with zero counts
  - [ ] Test error handling: malformed state returns `fail()`, not throw
  - [ ] Test JSON output includes all fields
- [ ] Task 6: Update `src/modules/sprint/__tests__/index.test.ts` (AC: #6)
  - [ ] Update or add test for `generateReport()` to verify it no longer returns `fail('not implemented')`
  - [ ] Test `generateReport()` delegates to reporter and returns correct result
- [ ] Task 7: Verify build (`npm run build`) succeeds
- [ ] Task 8: Verify all existing tests pass (`npm test`)
- [ ] Task 9: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18). The current `src/commands/status.ts` is 566 lines — do NOT increase it. Keep the reporter logic in `reporter.ts` and call it from status.ts.
- **100% test coverage** on new code (NFR14).
- **Module boundary** — `reporter.ts` is internal to sprint module. Only `index.ts` is the public interface.

### UX Spec Compliance

The output format MUST match the UX design specification (`_bmad-output/planning-artifacts/ux-design-specification.md`). Key sections:

**Active Run:**
```
── Project State ──────────────────────────────────────────────
Sprint: 17/65 done (26%) | 5/16 epics complete
Current epic: Epic 3 — ... (2/4 stories done)
Modules: infra:OK verify:OK sprint:OK dev:OK review:OK

── Active Run ─────────────────────────────────────────────────
Status: running (iteration 7, 2h14m elapsed)
Current: 3-3-bmad-parser-story-bridge → verifying (AC 4/7)
Budget: $23.40 spent | 47 stories remaining
```

**Completed Run:**
```
── Last Run Summary ───────────────────────────────────────────
Duration: 2h14m | Cost: $23.40 | Iterations: 7
Completed:  4 stories (3-1, 3-2, 4-1, 4-2)
Failed:     1 story
  └ 2-3: AC 4 — status --check-docker exit 1 (attempt 3/10)
Blocked:    2 stories (retry-exhausted)
```

### StatusReport Type Extension

The existing `StatusReport` in `src/modules/sprint/types.ts` has basic fields. Extend it to cover the full UX spec without breaking existing usage. The current fields (`total`, `done`, `failed`, `blocked`, `inProgress`, `storyStatuses`) remain — add new fields alongside them.

### Epic Grouping Logic

Stories are keyed like `2-3-status-report-one-screen-overview`. The epic prefix is the first number segment (everything before the first `-`). For example:
- `2-3-status-report...` → Epic 2
- `10-1-validation-ac-suite` → Epic 10

To count "epics complete", group all stories by their epic prefix. An epic is complete when ALL its stories are `done`.

### Action Item Labels

- **NEW:** action item where `item.source === 'verification'` and it was created during the current run (heuristic: item's story is in `run.completed` or `run.failed` lists).
- **CARRIED:** all other action items — they existed before this run started.

### Performance (NFR7: <3 seconds)

`generateReport()` operates entirely on the in-memory `SprintState` object. No filesystem reads, no Docker calls, no network calls. The <3s budget covers:
1. Reading `sprint-state.json` from disk (~10ms)
2. Generating the report from parsed state (~1ms)
3. Formatting and printing output (~10ms)

The existing `status.ts` Docker health checks and beads lookups are separate code paths. Sprint state reporting is additive — it should not slow down existing functionality.

### Interaction with Existing Status Command

The existing `src/commands/status.ts` (566 lines) handles Docker health, beads, onboarding, session flags, and coverage. This story ADDS sprint state reporting sections to the existing output. It does NOT replace the existing output — it adds new sections at the top (Project State, Active/Last Run, Action Items) per the UX spec.

The command should:
1. Show sprint state sections first (Project State, Run status, Action Items)
2. Then show existing sections (Docker, Beads, Session flags, etc.)

### Sprint Module Structure After This Story

```
src/modules/sprint/
├── index.ts              # Re-exports: getSprintState, updateStoryStatus, getNextStory (real), generateReport (real)
├── state.ts              # getSprintState(), updateStoryStatus(), writeStateAtomic(), defaultState()
├── selector.ts           # selectNextStory()
├── reporter.ts           # NEW: generateReport()
├── migration.ts          # migrateFromOldFormat()
├── types.ts              # Extended: StatusReport, FailedStoryDetail, LabeledActionItem, RunSummary
├── AGENTS.md             # Module documentation
└── __tests__/
    ├── index.test.ts     # Updated
    ├── state.test.ts     # Existing
    ├── migration.test.ts # Existing
    ├── selector.test.ts  # Existing
    └── reporter.test.ts  # NEW
```

### Dependencies

- **Story 2.1 (done):** `state.ts`, `getSprintState()`, `SprintState` type all exist and work.
- **Story 2.2 (done):** `selector.ts`, `getNextStory()` work. `SelectionResult` type exists.
- **No external dependencies needed.** Pure TypeScript logic over in-memory state for `reporter.ts`. Status command integration uses existing Commander.js patterns.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md — reporter.ts in sprint module]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR27, FR28, FR29, FR31]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Status command UX]
- [Source: src/types/state.ts — SprintState, StoryState, ActionItem]
- [Source: src/modules/sprint/types.ts — StatusReport (to extend)]
- [Source: src/modules/sprint/index.ts — generateReport() stub to replace]
- [Source: src/commands/status.ts — existing status command to augment]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-3-status-report-one-screen-overview.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/2-3-status-report-one-screen-overview.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
