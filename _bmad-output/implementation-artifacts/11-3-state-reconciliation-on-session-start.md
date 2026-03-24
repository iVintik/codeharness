# Story 11-3: State Reconciliation on Session Start
<!-- verification-tier: unit-testable -->

## Status: verifying

## Story

As a developer,
I want state consistency verified at the start of every session,
So that desyncs from crashes or manual edits are caught immediately.

## Acceptance Criteria

- [x] AC1: Given `sprint-state.json` and `sprint-status.yaml` are out of sync (e.g., a story status was manually edited in the YAML), when harness-run Step 1 pre-flight calls `reconcileState()`, then `sprint-state.json` is treated as authoritative and `sprint-status.yaml` is regenerated from it <!-- verification: cli-verifiable -->
- [x] AC2: Given `sprint-state.json` has no `version` field (legacy v1 state), when `reconcileState()` runs, then it triggers the v1-to-v2 migration from story 11-1 before proceeding with reconciliation <!-- verification: cli-verifiable -->
- [x] AC3: Given orphaned `ralph/.story_retries` file exists with entries already migrated into `sprint-state.json` retries field, when `reconcileState()` runs, then it merges any new entries from the file into `state.retries` and deletes the file <!-- verification: cli-verifiable -->
- [x] AC4: Given orphaned `ralph/.flagged_stories` file exists with entries already migrated into `sprint-state.json` flagged field, when `reconcileState()` runs, then it merges any new entries from the file into `state.flagged` (deduplicating) and deletes the file <!-- verification: cli-verifiable -->
- [x] AC5: Given every story in `state.stories` has a key with an epic prefix (e.g., `11-3-...`), when `reconcileState()` validates internal consistency, then every story's epic prefix corresponds to an epic entry in `state.epics`, and missing epic entries are auto-created with computed status <!-- verification: cli-verifiable -->
- [x] AC6: Given `reconcileState()` made corrections (YAML regeneration, file merges, epic creation), when it completes, then it logs each correction as `[INFO] Reconciled: <description>` (e.g., `[INFO] Reconciled: regenerated sprint-status.yaml`, `[INFO] Reconciled: merged .story_retries into sprint-state.json`) <!-- verification: cli-verifiable -->
- [x] AC7: Given `sprint-state.json` is fully consistent and no orphaned files exist, when `reconcileState()` runs, then it performs no writes and returns without logging any corrections (idempotent no-op) <!-- verification: cli-verifiable -->
- [x] AC8: Given `src/commands/run.ts` Step 1 pre-flight section, when inspected, then `reconcileState()` is called before story selection (before the current step that reads sprint statuses) <!-- verification: cli-verifiable -->
- [x] AC9: Given `src/modules/sprint/__tests__/reconciliation.test.ts` exists, when the test suite runs, then it covers: (a) out-of-sync YAML gets regenerated, (b) orphaned `.story_retries` merged and deleted, (c) orphaned `.flagged_stories` merged and deleted, (d) missing epic entries auto-created, (e) consistent state produces no-op, (f) v1 state triggers migration first <!-- verification: cli-verifiable -->
- [x] AC10: Given `npm test` is run after all changes, when it completes, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->
- [x] AC11: Given `npx tsc --noEmit` is run after all changes, when it completes, then zero new type errors are introduced <!-- verification: cli-verifiable -->
- [x] AC12: Given `reconcileState()` is called during `harness-run` Step 1 pre-flight, when a user has manually edited `sprint-status.yaml` during a session break, then their YAML changes are overwritten because `sprint-state.json` is the single source of truth <!-- verification: integration-required -->

## Tasks/Subtasks

- [x] Task 1: Create `reconcileState()` in `src/modules/sprint/state.ts` — The function should: (1) call `getSprintState()` to read current state (which already handles v1-to-v2 migration), (2) check for and merge orphaned `.story_retries` file into `state.retries` then delete the file, (3) check for and merge orphaned `.flagged_stories` file into `state.flagged` then delete the file, (4) validate epic consistency — for each story key, parse the epic prefix and ensure a matching epic exists in `state.epics`, creating any missing entries with computed status, (5) regenerate `sprint-status.yaml` unconditionally, (6) write state atomically only if mutations were made, (7) return a list of corrections made (for logging).
- [x] Task 2: Create a `ReconciliationResult` type — with fields `corrections: string[]` and `stateChanged: boolean` to communicate what happened to callers.
- [x] Task 3: Wire `reconcileState()` into `src/commands/run.ts` Step 1 pre-flight — Call it after resolving the Ralph path and plugin directory but before reading sprint statuses for story count. Log each correction from the result. If reconciliation fails, log a warning but do not abort the run (best-effort).
- [x] Task 4: Export `reconcileState` from `src/modules/sprint/index.ts` — Add import and re-export.
- [x] Task 5: Create `src/modules/sprint/__tests__/reconciliation.test.ts` — Test cases: (a) YAML regeneration on desync, (b) orphaned `.story_retries` file merged and deleted, (c) orphaned `.flagged_stories` file merged and deleted, (d) missing epic entries auto-created from story prefixes, (e) already-consistent state is a no-op (no writes), (f) state without `version` field triggers migration, (g) malformed orphan files handled gracefully without crashing.
- [x] Task 6: Run `npm test` and `npx tsc --noEmit` to verify zero regressions.

## Technical Notes

**Architecture Decision 1 (Unified State)** and **Decision 11 (Process Enforcement)** — state reconciliation is one of the embedded gates in harness-run Step 1 pre-flight.

### reconcileState() algorithm

```
function reconcileState(): Result<ReconciliationResult>
  1. state = getSprintState()          // handles v1→v2 migration internally
  2. corrections = []
  3. changed = false

  // Merge orphaned retry file
  4. if ralph/.story_retries exists:
       parse entries
       for each (key, count) where count > (state.retries[key] ?? 0):
         state.retries[key] = count
         changed = true
       delete ralph/.story_retries
       corrections.push("merged .story_retries into sprint-state.json")

  // Merge orphaned flagged file
  5. if ralph/.flagged_stories exists:
       parse keys
       for each key not in state.flagged:
         state.flagged.push(key)
         changed = true
       delete ralph/.flagged_stories
       corrections.push("merged .flagged_stories into sprint-state.json")

  // Validate epic consistency
  6. for each story key in state.stories:
       epicNum = parseEpicPrefix(key)  // e.g., "11" from "11-3-foo"
       epicKey = "epic-" + epicNum     // convention from sprint-status.yaml
       if epicKey not in state.epics:
         compute epic status from stories with same prefix
         state.epics[epicKey] = { status, storiesTotal, storiesDone }
         changed = true
         corrections.push("created missing epic entry: " + epicKey)

  // Always regenerate YAML (idempotent, cheap)
  7. regenerate sprint-status.yaml from state
     // writeSprintStatusYaml() already exists in state.ts

  8. if changed:
       writeStateAtomic(state)

  9. if corrections.length > 0:
       corrections.push("regenerated sprint-status.yaml")

  return ok({ corrections, stateChanged: changed })
```

### Integration point in run.ts

Currently, `run.ts` Step 1 pre-flight checks:
1. Ralph script exists
2. Plugin directory exists
3. Reads sprint statuses

`reconcileState()` should be called between steps 2 and 3, so that by the time statuses are read, state is guaranteed consistent. The call should be best-effort — a reconciliation failure should log a warning but not block the run.

### Orphan file handling

Story 11-1 explicitly deferred deletion of `.story_retries` and `.flagged_stories` to this story. The migration in 11-1 reads them into v2 fields but does NOT delete them. This story's reconciliation merges any remaining/new entries and then deletes the files, completing the migration lifecycle.

The merge strategy for retries uses `max(file_count, state_count)` to avoid losing data if the file was written to after migration. For flagged stories, it's a set union.

### Idempotency

Running `reconcileState()` on an already-consistent state (no orphan files, all epics present, YAML in sync) should be a no-op that makes zero file writes beyond YAML regeneration. YAML regeneration is always done (it's cheap and ensures freshness) but doesn't count as a "state change".

### Existing infrastructure to reuse

- `generateSprintStatusYaml()` and `writeSprintStatusYaml()` in `state.ts` — already exist from story 11-2
- `parseStoryRetriesRecord()` and `parseFlaggedStoriesList()` in `migration.ts` — already exist from story 11-1
- `parseStoryKey()` in `state.ts` — extracts `[epicNum, storyNum]` from a story key
- `getSprintState()` — already handles v1-to-v2 migration
- `writeStateAtomic()` — atomic write with YAML regeneration side-effect

### Relationship to validator.ts

`validator.ts` already has `validateStateConsistency()` which compares sprint-state.json against sprint-status.yaml. However, that function is a read-only validator that reports issues. `reconcileState()` is a write function that fixes issues. They are complementary — reconciliation runs first (pre-flight), validation can run later (audit mode).

## Dependencies

- Story 11-1 (Unified SprintState schema versioning) — **done**. Provides v2 schema, migration functions, `parseStoryRetriesRecord()`, `parseFlaggedStoriesList()`.
- Story 11-2 (sprint-status.yaml derived view) — **done**. Provides `generateSprintStatusYaml()`, `writeSprintStatusYaml()`, `readSprintStatusFromState()`.

## Files to Change

- `src/modules/sprint/state.ts` — Add `reconcileState()` function and `ReconciliationResult` type
- `src/commands/run.ts` — Call `reconcileState()` in Step 1 pre-flight, before reading sprint statuses
- `src/modules/sprint/index.ts` — Export `reconcileState` and `ReconciliationResult`
- `src/modules/sprint/__tests__/reconciliation.test.ts` — New test file: out-of-sync YAML regeneration, orphan file merge+delete, epic consistency, no-op on consistent state, v1 migration trigger, malformed file handling
