# Story 2.1: Sprint State Module — Unified State File

Status: verifying

## Story

As an operator,
I want a single `sprint-state.json` replacing all scattered state files,
so that all story state is in one place.

## Acceptance Criteria

1. **Given** `src/modules/sprint/state.ts` exists, **When** `getSprintState()` is called, **Then** it returns `Result<SprintState>` — success with parsed state when file exists, or success with a default empty state when no file exists. <!-- verification: cli-verifiable -->
2. **Given** old format files exist (`ralph/.story_retries`, `ralph/.flagged_stories`, `ralph/status.json`, `_bmad-output/implementation-artifacts/sprint-status.yaml`), **When** `getSprintState()` is called for the first time and no `sprint-state.json` exists, **Then** it auto-migrates data from old files into `sprint-state.json` and returns the migrated state. <!-- verification: cli-verifiable -->
3. **Given** `updateStoryStatus(key, status, detail?)` is called, **When** writing to `sprint-state.json`, **Then** it uses atomic write (write to `.sprint-state.json.tmp`, then `renameSync` to `sprint-state.json`), and the returned `Result<void>` is successful. <!-- verification: cli-verifiable -->
4. **Given** `sprint-state.json` exists with story data, **When** `getSprintState()` is called, **Then** parse time is <100ms (measured by reading and JSON-parsing the file). <!-- verification: cli-verifiable -->
5. **Given** `sprint-state.json` does not exist, **When** `getSprintState()` is called, **Then** returns `ok(defaultState)` where `defaultState` has `version: 1`, empty stories record, inactive run, and empty action items — never throws. <!-- verification: cli-verifiable -->
6. **Given** `updateStoryStatus()` is called concurrently from two processes, **When** both writes complete, **Then** the file is valid JSON (not corrupted) because each write is atomic (temp + rename). <!-- verification: cli-verifiable -->
7. **Given** the sprint module, **When** `getSprintState()` or `updateStoryStatus()` encounter a filesystem error (permissions, disk full), **Then** they return `fail(error)` with a descriptive message — never throw an uncaught exception. <!-- verification: cli-verifiable -->
8. **Given** `sprint-state.json` exists from a previous session, **When** a new ralph session starts and calls `getSprintState()`, **Then** attempt counts, story statuses, and action items are preserved from the previous session. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/sprint/state.ts` (AC: #1, #3, #5, #7)
  - [x] Implement `getSprintState(): Result<SprintState>` — reads and parses `sprint-state.json`
  - [x] Implement `updateStoryStatus(key, status, detail?): Result<void>` — reads current state, merges update, writes atomically
  - [x] Implement `writeStateAtomic(state: SprintState): Result<void>` — internal helper, writes to `.sprint-state.json.tmp` then `renameSync`
  - [x] Implement `defaultState(): SprintState` — returns empty valid state with `version: 1`
  - [x] Wrap all filesystem operations in try/catch, return `fail()` on error
  - [x] State file path: `sprint-state.json` in project root (same directory as `package.json`)
- [x] Task 2: Create `src/modules/sprint/migration.ts` (AC: #2)
  - [x] Implement `migrateFromOldFormat(): Result<SprintState>` — reads old scattered files
  - [x] Parse `ralph/.story_retries` — format: `<story-key> <count>` per line — into `stories[key].attempts`
  - [x] Parse `ralph/.flagged_stories` — one key per line — into `stories[key].status = 'blocked'`
  - [x] Parse `ralph/status.json` — extract `loop_count`, `stories_total`, `stories_completed`, `elapsed_seconds` into `run` section
  - [x] Parse `_bmad-output/implementation-artifacts/sprint-status.yaml` — extract story statuses (done/backlog/verifying/in-progress) into `stories` record
  - [x] Parse `_bmad-output/implementation-artifacts/.session-issues.md` — extract action items if structured
  - [x] Write migrated state via `writeStateAtomic()`
  - [x] Only run migration when `sprint-state.json` does not exist AND at least one old file exists
- [x] Task 3: Update `src/modules/sprint/index.ts` (AC: #1)
  - [x] Replace stub `getSprintState()` with real implementation from `state.ts`
  - [x] Replace stub `updateStoryStatus()` with real implementation from `state.ts`
  - [x] Keep `getNextStory()` and `generateReport()` as stubs (stories 2.2 and 2.3)
- [x] Task 4: Write unit tests in `src/modules/sprint/__tests__/state.test.ts` (AC: #1, #3, #4, #5, #6, #7, #8)
  - [x] Test `getSprintState()` returns default state when no file exists
  - [x] Test `getSprintState()` reads and parses existing `sprint-state.json`
  - [x] Test `updateStoryStatus()` creates file if missing, updates if present
  - [x] Test `updateStoryStatus()` uses atomic write (verify .tmp file pattern)
  - [x] Test parse performance <100ms with a 50-story fixture
  - [x] Test error handling: permission denied returns `fail()`, not throw
  - [x] Test state persistence: write then read round-trips correctly
  - [x] Test concurrent writes produce valid JSON (both files valid, no corruption)
- [x] Task 5: Write unit tests in `src/modules/sprint/__tests__/migration.test.ts` (AC: #2)
  - [x] Test migration from `.story_retries` populates attempts
  - [x] Test migration from `sprint-status.yaml` populates story statuses
  - [x] Test migration from `ralph/status.json` populates run section
  - [x] Test migration skipped when `sprint-state.json` already exists
  - [x] Test migration handles missing old files gracefully (not all files need to exist)
- [x] Task 6: Verify build (`npm run build`) succeeds
- [x] Task 7: Verify all existing tests pass (`npm test`)
- [x] Task 8: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **Atomic writes** — all state writes use temp file + rename (NFR4). Use `writeFileSync(tmpPath, data)` then `renameSync(tmpPath, finalPath)`.
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **SprintState type** already exists at `src/types/state.ts` — import it, don't redefine it.
- **Sprint module types** already exist at `src/modules/sprint/types.ts` — extend if needed.

### State File Location

`sprint-state.json` lives in the project root (next to `package.json`). This is where ralph and the CLI both run from.

### Old Format Files Being Replaced

| Old File | Format | What It Stores |
|----------|--------|----------------|
| `ralph/.story_retries` | Text, `<key> <count>` per line | Per-story retry counts |
| `ralph/.flagged_stories` | Text, one key per line | Stories flagged as problematic |
| `ralph/status.json` | JSON | Ralph loop status (iteration count, timing, totals) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | YAML | Story statuses (done/backlog/verifying) |
| `_bmad-output/implementation-artifacts/.session-issues.md` | Markdown | Action items from sessions |

**Migration strategy:** Read old files, merge into `SprintState`, write `sprint-state.json`. Old files are NOT deleted (backwards compatibility for one release cycle, per architecture decision). Migration runs only when `sprint-state.json` does not exist.

### Ralph Integration

Ralph is a bash script that currently writes `ralph/status.json` and `ralph/.story_retries` directly. After this story, ralph continues to work because:
1. Old files still exist (not deleted)
2. Ralph will be updated in a future story to write `sprint-state.json` directly via `jq`
3. This story only adds the TypeScript read/write layer — it does not change ralph

### YAML Parsing

`sprint-status.yaml` uses a simple format (key: value). For migration, use a lightweight YAML parser or simple regex — do NOT add a heavy YAML dependency just for migration. Consider reading it line-by-line since the format is flat `key: value`.

### Naming Collision Warning

`src/lib/output.ts` exports `ok()` and `fail()` as console logging functions. `src/types/result.ts` exports `ok()` and `fail()` as Result constructors. Use explicit import paths — do NOT confuse them.

### Sprint Module Structure After This Story

```
src/modules/sprint/
├── index.ts              # Re-exports: getSprintState, updateStoryStatus, getNextStory (stub), generateReport (stub)
├── state.ts              # NEW: getSprintState(), updateStoryStatus(), writeStateAtomic(), defaultState()
├── migration.ts          # NEW: migrateFromOldFormat()
├── types.ts              # Existing: StorySelection, StoryDetail, StatusReport
└── __tests__/
    ├── index.test.ts     # Existing
    ├── state.test.ts     # NEW
    └── migration.test.ts # NEW
```

### Dependencies

- **Epic 1 (done):** `src/types/result.ts` and `src/types/state.ts` already exist and export `Result<T>`, `ok()`, `fail()`, `SprintState`, `StoryState`, `StoryStatus`.
- **No external dependencies needed.** Use Node.js `fs` for file operations, `path` for paths. For YAML migration, parse manually (flat key-value format).

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 2 — Unified State Format]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 5 — Status File Protocol]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR8, FR10, NFR4, NFR10]
- [Source: src/types/state.ts — SprintState interface]
- [Source: src/modules/sprint/index.ts — current stubs]
- [Source: src/modules/sprint/types.ts — StorySelection, StoryDetail, StatusReport]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-1-sprint-state-module-unified-state-file.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/2-1-sprint-state-module-unified-state-file.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
