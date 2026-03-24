# Story 11-1: Unified SprintState Schema with Versioning

## Status: backlog

## Story

As a developer,
I want one `sprint-state.json` with a versioned schema that contains all sprint runtime data,
So that state is never out of sync.

## Acceptance Criteria

- [ ] AC1: Given `sprint-state.json` has `version: 2` schema, when inspected, then it contains: `stories`, `retries`, `flagged`, `epics`, `session`, `observability`, `run` <!-- verification: cli-verifiable -->
- [ ] AC2: Given an old `sprint-state.json` without `version` field, when `readSprintState()` is called, then it auto-migrates to version 2 schema <!-- verification: cli-verifiable -->
- [ ] AC3: Given `.story_retries` and `.flagged_stories` files exist, when migration runs, then their data is merged into `sprint-state.json` and the files are deleted <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 1 (Unified State).** Consolidate 5 state files into 2: `codeharness.local.md` (project config) and `sprint-state.json` (sprint runtime).

The unified `SprintState` schema (from architecture-v3.md):

```typescript
interface SprintState {
  version: 2;
  stories: Record<string, StoryState>;
  retries: Record<string, number>;
  flagged: string[];
  epics: Record<string, EpicState>;
  session: SessionState;
  observability: ObservabilityState;
  run: RunProgress;
}
```

Currently `src/modules/sprint/state.ts` manages sprint-state.json but the schema lacks `version`, `retries`, `flagged`, and `session` fields. These are stored separately in `.story_retries` (managed by `src/lib/retry-state.ts`) and `.flagged_stories`.

Migration logic in `readSprintState()`:
1. Read `sprint-state.json`
2. If no `version` field, set `version: 2`
3. If `.story_retries` exists, read it, merge into `state.retries`, delete file
4. If `.flagged_stories` exists, read it, merge into `state.flagged`, delete file
5. If `ralph/status.json` exists, read relevant fields into `state.session`
6. Write back the migrated state atomically

Atomic writes per architecture: write to `.tmp` then `renameSync`.

Update `src/modules/sprint/types.ts` with the full `SprintState` interface including all new fields.

Update `src/lib/retry-state.ts` to read/write from `sprint-state.json` `retries` field instead of `.story_retries` file. Eventually this file can be deleted and its functions inlined into `src/modules/sprint/state.ts`.

## Files to Change

- `src/modules/sprint/types.ts` — Add `version`, `retries`, `flagged`, `session`, `observability`, `run` fields to SprintState interface
- `src/modules/sprint/state.ts` — Add migration logic in `readSprintState()`, update `writeSprintState()` for atomic writes, add version check
- `src/modules/sprint/migration.ts` — Add v1-to-v2 migration function that reads `.story_retries`, `.flagged_stories`, `ralph/status.json` and merges into unified schema
- `src/lib/retry-state.ts` — Refactor to read/write `sprint-state.json` `retries` field instead of `.story_retries` file
- `src/modules/sprint/__tests__/migration.test.ts` — Test migration from v1 (no version field) to v2, including file deletion
