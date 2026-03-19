# Story 0.1: Sprint State Live Updates from Claude Session

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want the Claude session to write progress to sprint-state.json as it works,
so that external tools can read what's happening inside the session.

## Acceptance Criteria

1. **Given** harness-run.md processes a story, **When** it starts dev/review/verify on a story, **Then** it updates `sprint-state.json` with `run.currentStory`, `run.currentPhase`, and `run.lastAction`. <!-- verification: cli-verifiable -->
2. **Given** harness-run.md completes an AC during verification, **When** the AC result is known, **Then** `sprint-state.json` is updated with per-AC progress (e.g., `run.acProgress: "4/12"`). <!-- verification: cli-verifiable -->
3. **Given** a story completes or fails, **When** the status changes, **Then** `sprint-state.json` is updated immediately — not at session end. <!-- verification: cli-verifiable -->
4. **Given** `sprint-state.json` is written during a session, **When** another process reads it, **Then** it sees current progress (atomic writes, no partial state). <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Extend `SprintState` type with live run progress fields (AC: #1, #2)
  - [x] Add `run.currentStory: string | null` to `SprintState` interface in `src/types/state.ts`
  - [x] Add `run.currentPhase: 'create' | 'dev' | 'review' | 'verify' | null` to `SprintState` interface
  - [x] Add `run.lastAction: string | null` to `SprintState` interface
  - [x] Add `run.acProgress: string | null` to `SprintState` interface (format: "N/M")
  - [x] Update `defaultState()` in `src/modules/sprint/state.ts` to include new fields with null defaults
- [x] Add `updateRunProgress()` function to sprint state module (AC: #1, #2, #3)
  - [x] Create function in `src/modules/sprint/state.ts`: `updateRunProgress(update: RunProgressUpdate): Result<void>`
  - [x] Define `RunProgressUpdate` type in `src/modules/sprint/types.ts` with optional fields: `currentStory`, `currentPhase`, `lastAction`, `acProgress`
  - [x] Function reads current state, merges run progress fields, writes atomically
  - [x] Export from `src/modules/sprint/index.ts`
- [x] Add `clearRunProgress()` function for story completion/failure (AC: #3)
  - [x] Create function in `src/modules/sprint/state.ts`: `clearRunProgress(): Result<void>`
  - [x] Resets `run.currentStory`, `run.currentPhase`, `run.lastAction`, `run.acProgress` to null
  - [x] Export from `src/modules/sprint/index.ts`
- [x] Add instructions to `commands/harness-run.md` for live state updates (AC: #1, #2, #3)
  - [x] In Step 3 preamble: before executing each sub-step (3a/3b/3c/3d), call `updateRunProgress` with currentStory and currentPhase
  - [x] In Step 3d (verification): after each AC result in proof parsing, call `updateRunProgress` with acProgress
  - [x] In Step 4 (story complete) and Step 6 (failure): call `clearRunProgress` to reset live fields
  - [x] In Step 7 (sprint summary): call `clearRunProgress` to ensure clean state on exit
- [x] Write unit tests for new functions (AC: #1, #2, #3, #4)
  - [x] Test `updateRunProgress` sets fields correctly on existing state
  - [x] Test `updateRunProgress` with partial updates (only currentPhase changes)
  - [x] Test `clearRunProgress` resets all live fields to null
  - [x] Test atomic write guarantee: tmp file written then renamed (already tested, verify coverage)
- [x] Verify atomic write behavior for concurrent readers (AC: #4)
  - [x] Confirm `writeStateAtomic` uses `writeFileSync` + `renameSync` pattern (already implemented)
  - [x] Add test that reads state immediately after write and gets complete JSON

## Dev Notes

### Existing Infrastructure — What's Already Done

The sprint module already has atomic writes and state management. This story extends it, not replaces it.

**Key files to modify:**

- `src/types/state.ts` — Add new fields to `SprintState.run` interface
- `src/modules/sprint/state.ts` — Add `updateRunProgress()` and `clearRunProgress()` functions
- `src/modules/sprint/types.ts` — Add `RunProgressUpdate` type
- `src/modules/sprint/index.ts` — Export new functions
- `commands/harness-run.md` — Add instructions for when to call state updates

**Key files to read (do NOT modify):**

- `src/modules/sprint/state.ts` — Existing `writeStateAtomic()`, `getSprintState()`, `updateStoryStatus()` patterns
- `src/modules/sprint/AGENTS.md` — Module documentation

### Current SprintState.run Type

```typescript
readonly run: {
  readonly active: boolean;
  readonly startedAt: string | null;
  readonly iteration: number;
  readonly cost: number;
  readonly completed: string[];
  readonly failed: string[];
};
```

This needs to be extended with:

```typescript
readonly run: {
  readonly active: boolean;
  readonly startedAt: string | null;
  readonly iteration: number;
  readonly cost: number;
  readonly completed: string[];
  readonly failed: string[];
  readonly currentStory: string | null;    // NEW — e.g., "1-2-user-auth"
  readonly currentPhase: string | null;    // NEW — "create" | "dev" | "review" | "verify"
  readonly lastAction: string | null;      // NEW — e.g., "Starting code review"
  readonly acProgress: string | null;      // NEW — e.g., "4/12"
};
```

### Atomic Write Pattern (Already Implemented)

`writeStateAtomic()` in `state.ts` already uses `writeFileSync` to a `.sprint-state.json.tmp` temp file, then `renameSync` to the final path. This is the standard POSIX atomic write pattern — `rename(2)` is atomic on all major filesystems. AC #4 is satisfied by the existing implementation; this story just needs to ensure all new writes go through `writeStateAtomic`.

### RunProgressUpdate Type

```typescript
interface RunProgressUpdate {
  readonly currentStory?: string | null;
  readonly currentPhase?: 'create' | 'dev' | 'review' | 'verify' | null;
  readonly lastAction?: string | null;
  readonly acProgress?: string | null;
}
```

Partial updates are important — when updating `acProgress`, you don't want to clear `currentStory` and `currentPhase`.

### harness-run.md Integration Points

The `commands/harness-run.md` file is a prompt (not code). The live update instructions need to be added as explicit steps that the Claude session follows. The Claude session will call these functions via `codeharness` CLI or by reading/writing `sprint-state.json` directly using the existing atomic write pattern.

Specific insertion points in `harness-run.md`:

1. **Step 3 (before each sub-step):** "Before executing step 3a/3b/3c/3d, update sprint-state.json: set `run.currentStory` to the story key, `run.currentPhase` to the phase name, and `run.lastAction` to a description of what's starting."

2. **Step 3d-vi (proof validation):** "After parsing each AC verdict from the proof, update sprint-state.json: set `run.acProgress` to `{passed}/{total}` where passed is ACs with PASS verdict and total is all ACs."

3. **Step 4 (story complete):** "Clear run progress: set `run.currentStory`, `run.currentPhase`, `run.lastAction`, `run.acProgress` all to null."

4. **Step 6 (failure):** Same as Step 4 — clear run progress on failure.

5. **Step 7 (summary):** Clear run progress before printing summary to ensure clean state.

### How harness-run.md Will Write State

The harness-run.md prompt executes inside a Claude session that has access to bash. The simplest approach: use `node -e` or a small helper script to read/update/write sprint-state.json atomically. Alternatively, add a `codeharness progress` subcommand that wraps `updateRunProgress()`.

**Recommended approach:** Add a `codeharness progress` CLI command that accepts `--story`, `--phase`, `--action`, `--ac-progress`, `--clear` flags. This keeps harness-run.md simple (bash one-liners) and reuses the atomic write infrastructure.

Example usage in harness-run.md:
```bash
codeharness progress --story 1-2-user-auth --phase dev --action "Starting development"
codeharness progress --ac-progress "4/12"
codeharness progress --clear
```

### Critical Constraints

- **Result<T> pattern** — All new functions return `Result<T>`, never throw
- **Atomic writes** — All state mutations go through `writeStateAtomic()`
- **<300 line file limit** — `state.ts` is currently ~175 lines; new functions add ~40 lines. Safe.
- **No breaking changes** — New fields are nullable, existing code continues to work with old state files
- **Backward compatibility** — `getSprintState()` reading an old file without the new fields should fill them with null defaults via spread/merge

### What This Story Does NOT Include

- No ralph integration for reading progress — that's Story 0.2
- No dashboard display — that's Story 0.3
- No CLI pretty-printing of progress — this is the data layer only
- No observability/telemetry — that's Epic 1+

### Project Structure Notes

- All changes are in the existing `src/modules/sprint/` module — no new modules
- The `commands/harness-run.md` is a prompt file, not TypeScript — edits are plain text instructions
- Tests go in `src/modules/sprint/__tests__/` following existing patterns

### References

- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 0.1] — acceptance criteria and user story
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Implementation Patterns] — atomic writes, Result<T> pattern
- [Source: src/types/state.ts] — current SprintState interface
- [Source: src/modules/sprint/state.ts] — current atomic write implementation
- [Source: commands/harness-run.md] — harness run execution flow with integration points

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/0-1-sprint-state-live-updates-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/sprint/AGENTS.md — add new functions)
- [ ] Exec-plan created in `docs/exec-plans/active/0-1-sprint-state-live-updates.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 4 ACs implemented: type extensions, updateRunProgress/clearRunProgress functions, harness-run.md integration, atomic writes verified
- Added `codeharness progress` CLI command with --story, --phase, --action, --ac-progress, --clear flags
- 22 new tests (16 unit tests for state functions + 6 CLI command tests), all passing
- Full test suite: 2364 tests passing, build succeeds

### File List

- `src/types/state.ts` — Extended SprintState.run with currentStory, currentPhase, lastAction, acProgress
- `src/modules/sprint/types.ts` — Added RunProgressUpdate interface
- `src/modules/sprint/state.ts` — Added updateRunProgress() and clearRunProgress() functions
- `src/modules/sprint/index.ts` — Exported new type and functions
- `src/modules/sprint/AGENTS.md` — Updated module documentation
- `src/commands/progress.ts` — New CLI command for progress updates (NEW FILE)
- `src/index.ts` — Registered progress command
- `src/__tests__/cli.test.ts` — Updated command count assertion
- `commands/harness-run.md` — Added live progress update instructions at Steps 3, 3d-vi, 4, 6, 7
- `src/modules/sprint/__tests__/run-progress.test.ts` — Unit tests for new functions (NEW FILE)
- `src/commands/__tests__/progress.test.ts` — CLI command tests (NEW FILE)
