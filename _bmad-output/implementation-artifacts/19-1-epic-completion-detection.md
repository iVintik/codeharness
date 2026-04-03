# Story 19.1: Epic Completion Detection

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the engine to detect when all stories in an epic are done,
so that epic_flow tasks are triggered automatically.

## Acceptance Criteria

1. **Given** a new `src/lib/epic-completion.ts` module, **when** imported, **then** it exports `checkEpicCompletion(state, epicId): boolean`, `getEpicStories(state, epicId): string[]`, and `transitionEpicState(state, epicId, targetStatus): SprintState` functions. <!-- verification: test-provable -->

2. **Given** a sprint state where all stories in epic N have status `done`, **when** `checkEpicCompletion(state, epicId)` is called, **then** it returns `true`. <!-- verification: test-provable -->

3. **Given** a sprint state where at least one story in epic N does NOT have status `done`, **when** `checkEpicCompletion(state, epicId)` is called, **then** it returns `false`. <!-- verification: test-provable -->

4. **Given** an epic with status `in-progress` and all stories `done`, **when** `transitionEpicState(state, epicId, 'completing')` is called, **then** it returns a new state with the epic status set to `completing` and `storiesDone` updated to match `storiesTotal`. <!-- verification: test-provable -->

5. **Given** `getEpicStories(state, epicId)` is called with epicId `"19"`, **when** the sprint state contains stories `19-1-foo`, `19-2-bar`, and also `20-1-baz`, **then** it returns only `['19-1-foo', '19-2-bar']` — stories are matched by the numeric prefix before the first dash. <!-- verification: test-provable -->

6. **Given** the `EpicLifecycleStatus` type, **when** inspected, **then** it includes: `'in-progress'`, `'completing'`, `'merging'`, `'validating'`, `'done'`, `'failed'`. <!-- verification: test-provable -->

7. **Given** `transitionEpicState` is called with an invalid transition (e.g., `done` → `in-progress`), **when** executed, **then** it throws an `EpicCompletionError` with a descriptive message listing the current status and attempted target. <!-- verification: test-provable -->

8. **Given** the valid epic state transitions, **when** inspected, **then** they match: `in-progress → completing → merging → validating → done`, and `completing|merging|validating → failed`. <!-- verification: test-provable -->

9. **Given** an epic that does not exist in `state.epics`, **when** `checkEpicCompletion` or `transitionEpicState` is called, **then** it throws an `EpicCompletionError` with message indicating the epic was not found. <!-- verification: test-provable -->

10. **Given** an epic with zero stories in the sprint state, **when** `checkEpicCompletion` is called, **then** it returns `false` — an epic with no stories is never considered complete. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/epic-completion.ts` (AC: #1, #6, #8)
  - [x] Define `EpicLifecycleStatus` type with all six states
  - [x] Define `VALID_TRANSITIONS` map encoding the allowed state machine transitions
  - [x] Define `EpicCompletionError` class extending `Error`
  - [x] Export all types and functions

- [x] Task 2: Implement `getEpicStories()` (AC: #5)
  - [x] Filter `state.stories` by epic ID prefix (extract epic number from story key pattern `{epicNum}-{storyNum}-{slug}`)
  - [x] Return array of matching story keys

- [x] Task 3: Implement `checkEpicCompletion()` (AC: #2, #3, #9, #10)
  - [x] Validate epic exists in `state.epics`; throw `EpicCompletionError` if not
  - [x] Get stories for epic via `getEpicStories()`
  - [x] Return `false` if zero stories
  - [x] Return `true` only if ALL stories have status `done`

- [x] Task 4: Implement `transitionEpicState()` (AC: #4, #7, #8, #9)
  - [x] Validate epic exists in `state.epics`; throw `EpicCompletionError` if not
  - [x] Validate transition is allowed via `VALID_TRANSITIONS`; throw `EpicCompletionError` if not
  - [x] Return a new `SprintState` with the epic's status updated (immutable — do not mutate input)
  - [x] Update `storiesDone` count when transitioning to `completing` (count stories with status `done`)

- [x] Task 5: Write unit tests for `src/lib/__tests__/epic-completion.test.ts` (AC: #1-#10)
  - [x] Test: `checkEpicCompletion` returns `true` when all stories are `done`
  - [x] Test: `checkEpicCompletion` returns `false` when any story is not `done`
  - [x] Test: `checkEpicCompletion` returns `false` for epic with zero stories
  - [x] Test: `checkEpicCompletion` throws for non-existent epic
  - [x] Test: `getEpicStories` filters correctly by epic ID prefix
  - [x] Test: `getEpicStories` does not include stories from other epics
  - [x] Test: `transitionEpicState` returns updated state with new status
  - [x] Test: `transitionEpicState` updates `storiesDone` on `completing` transition
  - [x] Test: `transitionEpicState` throws on invalid transition
  - [x] Test: `transitionEpicState` throws for non-existent epic
  - [x] Test: `EpicLifecycleStatus` includes all six values
  - [x] Test: `VALID_TRANSITIONS` encodes the correct state machine

## Dev Notes

### Architecture Constraints

- **Architecture Decision 6** (architecture-parallel-execution.md): Epic completion is deterministic — count done stories. The multi-step completion state (`completing → merging → validating → done`) gives the TUI and status command precise information about where the epic is in its lifecycle.
- **EpicState type** (`src/types/state.ts`): Current `EpicState` has `status: string`, `storiesTotal: number`, `storiesDone: number`. The new `EpicLifecycleStatus` type narrows the `status` field for lifecycle transitions. The existing `EpicState.status` is `string` (not a union) so the new type is compatible — the module should accept both the existing broad type for reads and validate narrower transitions.
- **SprintState V2** (`src/types/state.ts`): `SprintStateV2.epics` is `Record<string, EpicState>`. Stories live in `SprintStateV2.stories` as `Record<string, StoryState>`.

### What This Story Actually Does

This story creates the **epic completion detection module** — a pure logic module with no side effects. It:

1. **Detects** when all stories in an epic reach `done` status
2. **Provides** a state machine for epic lifecycle transitions (`in-progress → completing → merging → validating → done`)
3. **Filters** stories by epic ID from the sprint state

This module is a building block. It does NOT:
- Wire into the workflow engine (that's 19-2)
- Trigger epic_flow tasks (that's 19-2)
- Merge worktrees (that's already in worktree-manager.ts)
- Write state files (callers do that)

### Key Files to Create

| File | Why |
|------|-----|
| `src/lib/epic-completion.ts` | New module — epic completion detection + lifecycle state machine |
| `src/lib/__tests__/epic-completion.test.ts` | Tests for all detection and transition logic |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/types/state.ts` | `SprintState` (V2), `EpicState`, `StoryState`, `StoryStatus` — the state types this module operates on |
| `src/lib/lane-pool.ts` | `EpicDescriptor`, `LaneStatus`, `EpicResult` — types used by the lane pool that will consume epic completion in 19-2 |
| `src/lib/worktree-manager.ts` | `WorktreeManager` — merge lifecycle that epic completion triggers (wired in 19-2) |
| `src/lib/telemetry-writer.ts` | `readTelemetryForEpic()` — used by retro step in epic_flow (wired in 19-2) |
| `src/lib/hierarchical-flow.ts` | `HierarchicalFlow`, `ExecutionConfig`, `BUILTIN_EPIC_FLOW_TASKS` — epic_flow structure |

### Implementation Patterns

**Story filtering by epic ID:**
```typescript
export function getEpicStories(state: SprintState, epicId: string): string[] {
  return Object.keys(state.stories).filter((key) => {
    const dash = key.indexOf('-');
    if (dash === -1) return false;
    return key.slice(0, dash) === epicId;
  });
}
```

**Completion check:**
```typescript
export function checkEpicCompletion(state: SprintState, epicId: string): boolean {
  if (!state.epics[`epic-${epicId}`]) {
    throw new EpicCompletionError(`Epic epic-${epicId} not found in state`);
  }
  const stories = getEpicStories(state, epicId);
  if (stories.length === 0) return false;
  return stories.every((key) => state.stories[key]?.status === 'done');
}
```

**State transition (immutable):**
```typescript
export function transitionEpicState(
  state: SprintState,
  epicId: string,
  targetStatus: EpicLifecycleStatus,
): SprintState {
  const epicKey = `epic-${epicId}`;
  const epic = state.epics[epicKey];
  if (!epic) throw new EpicCompletionError(`Epic ${epicKey} not found in state`);

  const currentStatus = epic.status as EpicLifecycleStatus;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed?.includes(targetStatus)) {
    throw new EpicCompletionError(
      `Invalid transition: ${currentStatus} → ${targetStatus}`,
    );
  }

  const storiesDone = targetStatus === 'completing'
    ? getEpicStories(state, epicId).filter((k) => state.stories[k]?.status === 'done').length
    : epic.storiesDone;

  return {
    ...state,
    epics: {
      ...state.epics,
      [epicKey]: { ...epic, status: targetStatus, storiesDone },
    },
  };
}
```

**Valid transitions map:**
```typescript
export const VALID_TRANSITIONS: Record<string, EpicLifecycleStatus[]> = {
  'in-progress': ['completing'],
  'completing': ['merging', 'failed'],
  'merging': ['validating', 'failed'],
  'validating': ['done', 'failed'],
};
```

### Previous Story (18-3) Intelligence

- Story 18-3 created `cross-worktree-validator.ts` — a focused extraction module (~120 lines). This story follows the same pattern: small, focused, pure logic.
- Testing pattern: vitest, `vi.mock`, colocated tests in `src/lib/__tests__/`.
- ESM module pattern: `.js` extensions in imports, TypeScript ESM.
- Build: `npm run build`, Test: `npm test`.
- All 124 tests passed after 18-3 with zero regressions.
- State builder helpers exist at `src/lib/__tests__/fixtures/state-builders.ts` — use `buildSprintState`, `buildStoryEntry`, `buildEpicState` for test data construction.

### Git Intelligence

Recent commits (18-1 through 18-3) established the merge lifecycle modules. This story builds on top of those by providing the detection logic that will trigger the merge flow in 19-2.

Files created in Epic 18:
- `src/lib/merge-agent.ts`
- `src/lib/cross-worktree-validator.ts`
- `src/lib/__tests__/merge-agent.test.ts`
- `src/lib/__tests__/cross-worktree-validator.test.ts`

### Edge Cases

- **Story key with no dash** (e.g., `"orphan"`): `getEpicStories` should not match — the `indexOf('-')` check returns -1, so the story is skipped.
- **Epic key format**: Sprint state uses `epic-{N}` as keys in `state.epics` (e.g., `epic-19`). Story keys use `{N}-{storyNum}-{slug}` (e.g., `19-1-epic-completion-detection`). The module must bridge this naming convention.
- **Multiple stories with same epic prefix but different total digits**: e.g., epic `1` vs epic `19`. Story `19-1-foo` must NOT match epic `1`. The filter must match the exact prefix up to the first dash.
- **Concurrent calls**: The module is stateless (pure functions over immutable data). Safe for concurrent use.
- **`state.stories` is empty**: `getEpicStories` returns `[]`, `checkEpicCompletion` returns `false`.

### Boundary: What This Story Does NOT Include

- **Wiring into the workflow engine** — 19-2 wires `checkEpicCompletion` into the engine's story-completion hook.
- **Executing epic_flow tasks** — 19-2 handles the retro → merge → validate sequence.
- **Persisting state transitions to disk** — callers (19-2) use `writeState()` from `state.ts`.
- **TUI display of epic lifecycle** — Epic 20.
- **Modifying `EpicState` type** in `src/types/state.ts` — the existing `status: string` is broad enough. The new `EpicLifecycleStatus` type narrows it for the module's own use.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/`
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`, Test: `npm test`
- The `epic-completion.ts` should be a focused module (~80-120 lines). Pure logic, no I/O.
- Use state builder helpers from `src/lib/__tests__/fixtures/state-builders.ts` in tests.

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 19.1]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 6 -- Epic Completion Detection]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Epic State Transitions]
- [Source: src/types/state.ts#EpicState]
- [Source: src/types/state.ts#SprintStateV2]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/19-1-epic-completion-detection-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/19-1-epic-completion-detection.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 24 unit tests pass covering all 10 acceptance criteria
- Full suite: 4976 tests pass, 183 test files, zero regressions
- Module is ~120 lines, pure logic, no I/O — matches architecture constraints
- Follows existing patterns from cross-worktree-validator.ts and merge-agent.ts

### File List

- `src/lib/epic-completion.ts` — new module (epic completion detection + lifecycle state machine)
- `src/lib/__tests__/epic-completion.test.ts` — 24 unit tests covering all ACs
