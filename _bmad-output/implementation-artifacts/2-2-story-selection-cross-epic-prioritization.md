# Story 2.2: Story Selection — Cross-Epic Prioritization

Status: verifying

## Story

As a system,
I want story selection that prioritizes by readiness across all epics,
so that actionable stories are processed first.

## Acceptance Criteria

1. **Given** `src/modules/sprint/selector.ts` exists with a `selectNextStory(state: SprintState): Result<StorySelection | null>` function, **When** called with a state containing stories in mixed statuses, **Then** it returns stories in priority order: proof-exists (verifying with proof) > in-progress > verifying (no proof) > backlog — the highest-priority actionable story is returned. <!-- verification: cli-verifiable -->
2. **Given** a story in state with `attempts >= 10`, **When** `selectNextStory()` evaluates it, **Then** it is skipped and the story's status is updated to `blocked` with reason `retry-exhausted` in the returned detail. <!-- verification: cli-verifiable -->
3. **Given** no actionable stories remain (all stories are done, failed, blocked, or retry-exhausted), **When** `selectNextStory()` is called, **Then** it returns `ok(null)`. <!-- verification: cli-verifiable -->
4. **Given** the sprint module's `getNextStory()` in `index.ts`, **When** called, **Then** it delegates to `selectNextStory()` using the current sprint state from `getSprintState()` — replacing the existing `fail('not implemented')` stub. <!-- verification: cli-verifiable -->
5. **Given** two stories at the same priority tier, **When** `selectNextStory()` chooses between them, **Then** it selects the one with fewer attempts (least-attempted-first), and if attempts are equal, selects by lexicographic key order for determinism. <!-- verification: cli-verifiable -->
6. **Given** a story with status `done`, `failed`, or `blocked`, **When** `selectNextStory()` evaluates it, **Then** it is excluded from selection entirely. <!-- verification: cli-verifiable -->
7. **Given** `selectNextStory()` encounters a state read error, **When** called via `getNextStory()`, **Then** it returns `fail(error)` — never throws an uncaught exception. <!-- verification: cli-verifiable -->
8. **Given** a sprint state with stories across multiple epics (e.g., epic-2 and epic-3), **When** `selectNextStory()` is called, **Then** it considers stories from all epics — selection is cross-epic, not scoped to a single epic. <!-- verification: cli-verifiable -->
9. **Given** `selectNextStory()` is called during an active sprint run, **When** a story is already `in-progress`, **Then** that in-progress story is returned first (continue current work before picking new work). <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/sprint/selector.ts` (AC: #1, #2, #3, #5, #6, #8, #9)
  - [x]Implement `selectNextStory(state: SprintState): Result<StorySelection | null>`
  - [x]Define priority tiers: in-progress (current) > verifying-with-proof > verifying > backlog
  - [x]Filter out done, failed, blocked stories
  - [x]Filter out stories with `attempts >= 10` (retry-exhausted)
  - [x]Within same tier, sort by attempts ascending, then key lexicographically
  - [x]Return `ok(null)` when no actionable stories remain
  - [x]Wrap all logic in try/catch, return `fail()` on error
- [x] Task 2: Update `src/modules/sprint/index.ts` (AC: #4, #7)
  - [x]Import `selectNextStory` from `./selector.js`
  - [x]Replace `getNextStory()` stub with real implementation: call `getSprintState()`, then `selectNextStory(state)`
  - [x]Propagate errors as `fail()` results
- [x] Task 3: Write unit tests in `src/modules/sprint/__tests__/selector.test.ts` (AC: #1, #2, #3, #5, #6, #8, #9)
  - [x]Test priority ordering: in-progress returned before verifying, verifying before backlog
  - [x]Test proof-exists stories (verifying + proofPath set) returned before plain verifying
  - [x]Test retry-exhausted stories (attempts >= 10) are skipped
  - [x]Test `ok(null)` when all stories are terminal (done/failed/blocked)
  - [x]Test same-tier tiebreaking: fewer attempts first, then lexicographic key
  - [x]Test cross-epic selection: stories from different epics considered equally
  - [x]Test in-progress story returned first (continue current work)
  - [x]Test error propagation: invalid state returns `fail()`
- [x] Task 4: Update `src/modules/sprint/__tests__/index.test.ts` (AC: #4)
  - [x]Update or add test for `getNextStory()` to verify it no longer returns `fail('not implemented')`
  - [x]Test `getNextStory()` delegates to selector and returns correct result
- [x] Task 5: Verify build (`npm run build`) succeeds
- [x] Task 6: Verify all existing tests pass (`npm test`)
- [x] Task 7: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — selector.ts is internal to sprint module. Only `index.ts` is the public interface.

### Priority Tier Logic

Per FR7 and the epic definition, the priority order for story selection is:

| Priority | Status | Condition | Rationale |
|----------|--------|-----------|-----------|
| 0 (highest) | `in-progress` | Already started | Continue current work |
| 1 | `verifying` | `proofPath !== null` | Proof exists, just needs re-check |
| 2 | `verifying` | `proofPath === null` | Needs verification pass |
| 3 | `backlog` | `attempts < 10` | New work |
| Excluded | `done` / `failed` / `blocked` | Terminal | No action needed |
| Excluded | any | `attempts >= 10` | Retry-exhausted |

Within the same tier, sort by `attempts` ascending (least-attempted first), then by `key` lexicographically for determinism.

### StorySelection Type

Already defined in `src/modules/sprint/types.ts`:
```typescript
export interface StorySelection {
  readonly key: string;
  readonly title: string;
  readonly priority: number;
}
```

The `title` field should be populated from the story key (transformed to human-readable form) since the sprint state does not store titles. Use a simple transform: replace hyphens with spaces, capitalize first word. Alternatively, set to the key itself if no title source is available.

### Sprint State Structure

`SprintState.stories` is `Record<string, StoryState>` where each `StoryState` has:
- `status`: StoryStatus (backlog | ready | in-progress | review | verifying | done | failed | blocked)
- `attempts`: number
- `lastAttempt`: string | null
- `lastError`: string | null
- `proofPath`: string | null
- `acResults`: AcResult[] | null

### Retry Exhaustion Threshold

The threshold is 10 attempts (per FR11 and AC #2). This should be a named constant, not a magic number. Consider `const MAX_STORY_ATTEMPTS = 10` at the top of selector.ts.

### Sprint Module Structure After This Story

```
src/modules/sprint/
├── index.ts              # Re-exports: getSprintState, updateStoryStatus, getNextStory (real), generateReport (stub)
├── state.ts              # getSprintState(), updateStoryStatus(), writeStateAtomic(), defaultState()
├── selector.ts           # NEW: selectNextStory()
├── migration.ts          # migrateFromOldFormat()
├── types.ts              # StorySelection, StoryDetail, StatusReport
├── AGENTS.md             # Module documentation
└── __tests__/
    ├── index.test.ts     # Updated
    ├── state.test.ts     # Existing
    ├── migration.test.ts # Existing
    └── selector.test.ts  # NEW
```

### Dependencies

- **Story 2.1 (done):** `state.ts`, `getSprintState()`, `SprintState` type all exist and work.
- **No external dependencies needed.** Pure TypeScript logic over in-memory state.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md — selector.ts in sprint module]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR7, FR11]
- [Source: src/types/state.ts — SprintState, StoryState, StoryStatus]
- [Source: src/modules/sprint/types.ts — StorySelection]
- [Source: src/modules/sprint/index.ts — getNextStory() stub to replace]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-2-story-selection-cross-epic-prioritization.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/2-2-story-selection-cross-epic-prioritization.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
