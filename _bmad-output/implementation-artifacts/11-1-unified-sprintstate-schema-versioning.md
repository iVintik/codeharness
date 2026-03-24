# Story 11-1: Unified SprintState Schema with Versioning
<!-- verification-tier: unit-testable -->

## Status: verifying

## Story

As a developer,
I want one `sprint-state.json` with a versioned schema that contains all sprint runtime data,
So that state is never out of sync.

## Acceptance Criteria

- [ ] AC1: Given `src/types/state.ts` is inspected, when the `SprintState` interface is read, then it has `version: 2` as a literal type and contains top-level fields: `sprint`, `stories`, `retries`, `flagged`, `epics`, `session`, `observability`, `run`, `actionItems` <!-- verification: cli-verifiable -->
- [ ] AC2: Given new interfaces `EpicState`, `SessionState`, and `ObservabilityState` are defined in `src/types/state.ts`, when inspected, then `EpicState` has at minimum `status: string` and `storiesTotal: number` and `storiesDone: number`; `SessionState` has `active: boolean`, `startedAt: string | null`, `iteration: number`, `elapsedSeconds: number`; `ObservabilityState` has `statementCoverage: number | null`, `branchCoverage: number | null`, `functionCoverage: number | null`, `lineCoverage: number | null` <!-- verification: cli-verifiable -->
- [ ] AC3: Given `src/types/state.ts` exports a union type `type SprintStateAny = SprintStateV1 | SprintStateV2`, when inspected, then `SprintStateV1` preserves the current `version: 1` schema exactly and `SprintStateV2` is the new schema with `version: 2` <!-- verification: cli-verifiable -->
- [ ] AC4: Given `src/modules/sprint/state.ts` function `defaultState()`, when called, then it returns a `SprintStateV2` object with `version: 2`, empty `retries: {}`, empty `flagged: []`, empty `epics: {}`, default `session`, default `observability`, and all existing default fields preserved <!-- verification: cli-verifiable -->
- [ ] AC5: Given an existing `sprint-state.json` with `"version": 1` (current schema), when `getSprintState()` is called, then it detects the v1 schema, runs the v1-to-v2 migration function, and returns a `SprintStateV2` object <!-- verification: cli-verifiable -->
- [ ] AC6: Given an existing `sprint-state.json` without a `version` field at all, when `getSprintState()` is called, then it treats the file as v1, runs the v1-to-v2 migration, and returns a `SprintStateV2` object <!-- verification: cli-verifiable -->
- [ ] AC7: Given `ralph/.story_retries` exists with content `10-3-python-provider 2\n10-5-migrate-consumers 1`, when the v1-to-v2 migration runs, then `state.retries` equals `{ "10-3-python-provider": 2, "10-5-migrate-consumers": 1 }` <!-- verification: cli-verifiable -->
- [ ] AC8: Given `ralph/.flagged_stories` exists with content `9-5-multi-stack\n10-3-python-provider`, when the v1-to-v2 migration runs, then `state.flagged` equals `["9-5-multi-stack", "10-3-python-provider"]` <!-- verification: cli-verifiable -->
- [ ] AC9: Given `ralph/status.json` exists with `{ "status": "running", "loop_count": 3, "elapsed_seconds": 3698 }`, when the v1-to-v2 migration runs, then `state.session` has `active: true`, `iteration: 3`, `elapsedSeconds: 3698` <!-- verification: cli-verifiable -->
- [ ] AC10: Given the v1-to-v2 migration completes successfully, when the migrated state is written, then it is written atomically (tmp file + rename) and has `"version": 2` <!-- verification: cli-verifiable -->
- [ ] AC11: Given `sprint-state.json` already has `"version": 2`, when `getSprintState()` is called, then no migration runs and the state is returned as-is <!-- verification: cli-verifiable -->
- [ ] AC12: Given `src/modules/sprint/migration.ts` is inspected, when the `migrateV1ToV2()` function is read, then it reads `.story_retries` content (space-separated `key count` per line), `.flagged_stories` content (one key per line), and `ralph/status.json`, merging each into the appropriate v2 field <!-- verification: cli-verifiable -->
- [ ] AC13: Given the v1-to-v2 migration reads `.story_retries` and `.flagged_stories`, when it completes, then it does NOT delete those files (deletion deferred to story 11-3 reconciliation, to avoid data loss if migration is interrupted) <!-- verification: cli-verifiable -->
- [ ] AC14: Given `src/lib/retry-state.ts` functions `readRetries()`, `setRetryCount()`, `getRetryCount()`, when called after migration, then they read from and write to `sprint-state.json` field `retries` instead of the `.story_retries` file <!-- verification: cli-verifiable -->
- [ ] AC15: Given `src/lib/retry-state.ts` functions `readFlaggedStories()`, `writeFlaggedStories()`, `removeFlaggedStory()`, when called after migration, then they read from and write to `sprint-state.json` field `flagged` instead of the `.flagged_stories` file <!-- verification: cli-verifiable -->
- [ ] AC16: Given all consumers of `retry-state.ts` (search for `readRetries`, `setRetryCount`, `getRetryCount`, `readFlaggedStories`, `writeFlaggedStories`, `removeFlaggedStory`, `resetRetry`), when inspected, then they continue to compile and pass tests without changes (the refactored retry-state functions maintain the same public API signatures) <!-- verification: cli-verifiable -->
- [ ] AC17: Given `npm test` is run after all changes, when it completes, then all tests pass with 0 regressions <!-- verification: cli-verifiable -->
- [ ] AC18: Given `npx tsc --noEmit` is run after all changes, when it completes, then zero new type errors are introduced <!-- verification: cli-verifiable -->
- [ ] AC19: Given `src/modules/sprint/__tests__/migration.test.ts` is inspected, when the v1-to-v2 migration tests are read, then there are tests for: (a) v1 state with retries/flagged files migrates to v2, (b) v1 state without retries/flagged files migrates to v2 with empty defaults, (c) v2 state is not re-migrated, (d) missing version field treated as v1, (e) retries file with malformed lines is handled gracefully <!-- verification: cli-verifiable -->

## Tasks/Subtasks

- [ ] Task 1: Define v2 schema types in `src/types/state.ts` -- Rename current `SprintState` to `SprintStateV1`. Create `SprintStateV2` with fields: `version: 2`, `sprint`, `stories`, `retries: Record<string, number>`, `flagged: string[]`, `epics: Record<string, EpicState>`, `session: SessionState`, `observability: ObservabilityState`, `run`, `actionItems`. Create `EpicState`, `SessionState`, `ObservabilityState` interfaces. Create `SprintStateAny = SprintStateV1 | SprintStateV2`. Export `SprintState` as alias for `SprintStateV2` (so existing consumers don't break).
- [ ] Task 2: Update `src/modules/sprint/state.ts` -- Change `defaultState()` to return `SprintStateV2` with `version: 2` and all new fields initialized. Update `getSprintState()` to check the `version` field: if `2`, return as-is; if `1` or missing, call `migrateV1ToV2()`. Update `writeStateAtomic()`, `updateStoryStatus()`, `updateRunProgress()`, `clearRunProgress()` to work with the v2 schema (they already spread existing fields, so new fields flow through).
- [ ] Task 3: Implement `migrateV1ToV2()` in `src/modules/sprint/migration.ts` -- Add a new exported function `migrateV1ToV2(v1: SprintStateV1): SprintStateV2` that: (a) reads `.story_retries` from `ralph/.story_retries` using space-separated format, (b) reads `.flagged_stories` from `ralph/.flagged_stories` one key per line, (c) reads `ralph/status.json` for session data, (d) merges into v2 schema fields, (e) does NOT delete source files. Update existing `migrateFromOldFormat()` to set `version: 2` in its output (it currently sets `version: 1`).
- [ ] Task 4: Refactor `src/lib/retry-state.ts` -- Replace file-based read/write with sprint-state.json access. `readRetries(dir)` calls `getSprintState()` and returns `state.retries` as a Map. `writeRetries(dir, retries)` calls `getSprintState()`, updates `retries` field, calls `writeStateAtomic()`. `readFlaggedStories(dir)` returns `state.flagged`. `writeFlaggedStories(dir, stories)` updates `state.flagged`. Keep the same public API signatures so callers don't change. The `dir` parameter becomes vestigial but is kept for backward compatibility.
- [ ] Task 5: Update `src/modules/sprint/__tests__/migration.test.ts` -- Add test cases for v1-to-v2 migration: state with retries file, state with flagged file, state with ralph/status.json, state with all three, state with none, state already at v2, state with no version field. Mock `fs` to provide file contents.
- [ ] Task 6: Update existing retry-state tests in `src/lib/__tests__/retry-state.test.ts` -- Tests currently mock file reads for `.story_retries` and `.flagged_stories`. Update mocks to verify the new code path reads from sprint-state.json instead. Ensure the public API behavior is identical.
- [ ] Task 7: Run `npm test` and `npx tsc --noEmit` to verify zero regressions.

## Technical Notes

**Architecture Decision 1 (Unified State).** Consolidate 5 state files into 2: `codeharness.local.md` (project config) and `sprint-state.json` (sprint runtime). This story handles the schema upgrade and retry/flagged data migration.

### Current state layout (v1)

| Data | Location | Format |
|------|----------|--------|
| Story statuses | `sprint-state.json` `.stories` | JSON |
| Retry counts | `ralph/.story_retries` | `key count` per line (space-separated) |
| Flagged stories | `ralph/.flagged_stories` | one key per line |
| Run progress | `sprint-state.json` `.run` | JSON |
| Sprint summary | `sprint-state.json` `.sprint` | JSON |
| Session info | `ralph/status.json` | JSON (separate file, not in sprint state) |
| Action items | `sprint-state.json` `.actionItems` | JSON |

### Target state layout (v2)

All of the above consolidated into `sprint-state.json` with `version: 2`. The `.story_retries` and `.flagged_stories` files are read during migration but NOT deleted (deletion happens in story 11-3 to avoid data loss).

### v2 Schema

```typescript
interface SprintStateV2 {
  version: 2;
  sprint: { total: number; done: number; failed: number; blocked: number; inProgress: string | null };
  stories: Record<string, StoryState>;
  retries: Record<string, number>;
  flagged: string[];
  epics: Record<string, EpicState>;
  session: SessionState;
  observability: ObservabilityState;
  run: { active: boolean; startedAt: string | null; iteration: number; cost: number; completed: string[]; failed: string[]; currentStory: string | null; currentPhase: string | null; lastAction: string | null; acProgress: string | null };
  actionItems: ActionItem[];
}

interface EpicState {
  status: string;        // 'backlog' | 'in-progress' | 'done'
  storiesTotal: number;
  storiesDone: number;
}

interface SessionState {
  active: boolean;
  startedAt: string | null;
  iteration: number;
  elapsedSeconds: number;
}

interface ObservabilityState {
  statementCoverage: number | null;
  branchCoverage: number | null;
  functionCoverage: number | null;
  lineCoverage: number | null;
}
```

### Migration strategy

`getSprintState()` checks `version` field:
- `version === 2` -> return as-is
- `version === 1` or `version` missing -> run `migrateV1ToV2()`, write result, return v2

`migrateV1ToV2()`:
1. Copy all existing v1 fields (`sprint`, `stories`, `run`, `actionItems`)
2. Read `ralph/.story_retries` -> parse space-separated lines -> `retries: Record<string, number>`
3. Read `ralph/.flagged_stories` -> parse one-per-line -> `flagged: string[]`
4. Read `ralph/status.json` -> map to `session: SessionState`
5. Initialize `epics: {}` and `observability: { statementCoverage: null, ... }` (populated by later stories)
6. Set `version: 2`
7. Write atomically

### retry-state.ts refactoring

The `dir` parameter in all `retry-state.ts` functions becomes vestigial. The functions now read from/write to `sprint-state.json` via `getSprintState()` / `writeStateAtomic()`. The `dir` parameter is kept to avoid breaking callers but is not used internally.

Note: `retry-state.ts` currently uses `=` as separator (`key=count`), while `migration.ts` parseStoryRetries uses space as separator (`key count`). The actual `ralph/.story_retries` file uses space separators. After this story, `retry-state.ts` no longer reads the file directly, so the format discrepancy becomes irrelevant.

### Consumers of retry-state.ts

Files that import from `src/lib/retry-state.ts` (must continue to work):
- `src/commands/run.ts`
- `src/modules/sprint/state.ts` (indirect via migration)
- Test files

### Deliberate non-goals for this story

- `.story_retries` and `.flagged_stories` files are NOT deleted (story 11-3)
- `sprint-status.yaml` is NOT made a derived view (story 11-2)
- `epics` field is initialized empty, not populated from sprint-status.yaml (story 11-2)
- State reconciliation is NOT implemented (story 11-3)

## Dependencies

- No blocking dependencies. Epic 10 (Stack Provider) is complete.
- Story 11-2 depends on this story (needs v2 schema to generate derived YAML).
- Story 11-3 depends on this story (needs v2 schema for reconciliation and file cleanup).

## Files to Change

- `src/types/state.ts` -- Rename `SprintState` to `SprintStateV1`, create `SprintStateV2` with new fields, create sub-interfaces, export `SprintState` as alias for `SprintStateV2`
- `src/modules/sprint/state.ts` -- Update `defaultState()` to return v2, update `getSprintState()` with version check and migration call
- `src/modules/sprint/migration.ts` -- Add `migrateV1ToV2()` function, fix existing `migrateFromOldFormat()` to output v2
- `src/lib/retry-state.ts` -- Refactor all functions to read/write sprint-state.json instead of flat files
- `src/modules/sprint/__tests__/migration.test.ts` -- Add v1-to-v2 migration test cases
- `src/lib/__tests__/retry-state.test.ts` -- Update mocks for new code path
