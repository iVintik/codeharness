# Story 14-2: Tech Debt Gate in Story Selection

## Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

<!-- verification-tier: unit-testable -->

## Story

As a developer,
I want TD stories prioritized before new feature work,
So that debt gets paid before it accumulates further.

## Acceptance Criteria

1. Given `epic-TD` has 3 backlog stories and a feature epic has 5 backlog stories, when `selectNextStory()` runs, then a TD backlog story is selected first <!-- verification: cli-verifiable -->
2. Given all TD stories are `done`, when `selectNextStory()` runs, then feature epic stories are selected normally <!-- verification: cli-verifiable -->
3. Given `epic-TD` has backlog stories AND a non-TD story is `in-progress`, when `selectNextStory()` runs, then the in-progress story is still selected (TD gate only applies to Tier D backlog selection) <!-- verification: cli-verifiable -->
4. Given `epic-TD` has backlog stories AND a non-TD story is `verifying`, when `selectNextStory()` runs, then the verifying story is selected (TD gate does not override higher tiers) <!-- verification: cli-verifiable -->
5. Given `epic-TD` has no stories (no `TD-` prefixed keys in state), when `selectNextStory()` runs, then normal backlog selection applies (lexicographic + attempt-count ordering) <!-- verification: cli-verifiable -->
6. Given a TD story is `in-progress`, when `selectNextStory()` runs, then it follows normal Tier A priority (in-progress always wins, regardless of TD or feature) <!-- verification: cli-verifiable -->
7. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
8. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->
9. Given no new file created for this story, when line count is checked, then no modified file exceeds 300 lines <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1 (AC: 1, 5): Add TD gate logic to `selectNextStory()` in `selector.ts`
  - [x]After sorting candidates by tier, check if the winner is Tier 3 (backlog)
  - [x]If winner is Tier 3 AND is not a `TD-` prefixed story, scan candidates for any `TD-` prefixed Tier 3 stories
  - [x]If pending TD backlog stories exist, re-sort to place `TD-` stories before non-TD stories within Tier 3
  - [x]If no TD backlog candidates exist, proceed with normal selection

- [x] Task 2 (AC: 1): Add test — TD backlog stories selected before feature backlog stories
  - [x]State with `TD-1-fix-catch-blocks` (backlog) and `15-1-ci-file-size-gate` (backlog)
  - [x]Expect `TD-1-fix-catch-blocks` selected

- [x] Task 3 (AC: 2): Add test — all TD stories done, normal selection resumes
  - [x]State with `TD-1-fix-catch-blocks` (done), `TD-2-add-logging` (done), and `15-1-ci-file-size-gate` (backlog)
  - [x]Expect `15-1-ci-file-size-gate` selected

- [x] Task 4 (AC: 3): Add test — in-progress non-TD story wins over TD backlog
  - [x]State with `TD-1-fix-catch-blocks` (backlog) and `15-1-ci-file-size-gate` (in-progress)
  - [x]Expect `15-1-ci-file-size-gate` selected (Tier A beats Tier D)

- [x] Task 5 (AC: 4): Add test — verifying non-TD story wins over TD backlog
  - [x]State with `TD-1-fix-catch-blocks` (backlog) and `15-1-ci-file-size-gate` (verifying)
  - [x]Expect `15-1-ci-file-size-gate` selected (Tier B/C beats Tier D)

- [x] Task 6 (AC: 5): Add test — no TD stories, normal backlog selection
  - [x]State with `15-1-ci-file-size-gate` (backlog) and `15-2-eslint-rules` (backlog)
  - [x]Expect normal lexicographic + attempt-count ordering

- [x] Task 7 (AC: 6): Add test — TD story in-progress follows normal Tier A priority
  - [x]State with `TD-1-fix-catch-blocks` (in-progress) and `15-1-ci-file-size-gate` (backlog)
  - [x]Expect `TD-1-fix-catch-blocks` selected (Tier A, not because of TD gate)

- [x] Task 8 (AC: 1): Add test — TD backlog story with fewer attempts selected over TD story with more attempts
  - [x]State with `TD-1-fix-catch` (backlog, attempts: 3) and `TD-2-add-logging` (backlog, attempts: 1)
  - [x]Expect `TD-2-add-logging` selected (fewer attempts tiebreak preserved within TD)

- [x] Task 9 (AC: 7): Run `npm run build` — TypeScript compilation succeeds
- [x] Task 10 (AC: 8): Run `npm test` — all existing tests pass, zero regressions
- [x] Task 11 (AC: 9): Verify all modified files are under 300 lines

## Dev Notes

### Architecture Compliance

- **Decision 6c (Tech Debt Gate):** This story implements the third mechanism from architecture-v3.md Decision 6: tech debt gate in story selection. Before selecting ANY Tier D (backlog) story from a feature epic, check if `epic-TD` has pending work. If yes, process TD stories first. This ensures accumulated debt gets addressed before new features start.
- **Decision 7 (300-line limit, NFR5):** All modified files must stay under 300 lines.

### Implementation Guidance

#### Where to modify

The tech debt gate goes in `src/modules/sprint/selector.ts` in the `selectNextStory()` function. The current function:

1. Iterates all stories, filters out terminal and retry-exhausted
2. Assigns priority tiers (0=in-progress, 1=verifying-with-proof, 2=verifying, 3=backlog/ready/review)
3. Sorts by tier, then attempts, then key
4. Returns the first candidate

The gate should be inserted **after sorting** but **before returning**. If the winner is Tier 3, check if any `TD-` prefixed Tier 3 candidates exist. If so, prefer them.

#### Implementation approach

Modify the sort comparator to add a secondary sort dimension within Tier 3:

```typescript
candidates.sort((a, b) => {
  // Primary: priority tier ascending
  if (a.tier !== b.tier) return a.tier - b.tier;
  // TD gate: within Tier 3 (backlog), TD- stories come first
  if (a.tier === 3) {
    const aIsTd = a.key.startsWith('TD-');
    const bIsTd = b.key.startsWith('TD-');
    if (aIsTd !== bIsTd) return aIsTd ? -1 : 1;
  }
  // Secondary: fewer attempts first
  if (a.story.attempts !== b.story.attempts) {
    return a.story.attempts - b.story.attempts;
  }
  // Tertiary: lexicographic key order
  return a.key.localeCompare(b.key);
});
```

This approach is simpler than a post-sort gate check. It preserves existing behavior for Tiers 0-2 and only modifies the ordering within Tier 3. Within the TD group, the existing tiebreakers (attempts, then key) still apply.

#### Why sort-based over gate-based

The existing technical note in the old story file suggests a post-selection gate (`if tdEpic ... return pendingTd[0]`). The sort-based approach is better because:
1. It preserves attempt-count tiebreaking within TD stories
2. It doesn't require checking `state.epics` — the `TD-` prefix in the story key is sufficient
3. It's a 3-line change inside the existing sort comparator
4. It doesn't introduce a second code path

#### Key constraint

The gate ONLY applies within Tier 3 (backlog/ready/review). In-progress and verifying stories always take priority regardless of whether they are TD or feature stories. This is by design — Decision 6c says "before selecting ANY Tier D story."

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect } from 'vitest'`
- Use existing test helpers: `buildSprintState()`, `buildStoryEntry()` from `helpers.js`
- Follow the existing `makeState()` helper pattern already in `selector.test.ts`
- All new tests go in the existing `src/modules/sprint/__tests__/selector.test.ts` file
- The file currently has 274 lines — adding ~80 lines of tests keeps it well under 300 if structured compactly, but may push close. If needed, use `it.each` patterns to compress.

### Previous Story Intelligence (14-1)

- Story 14-1 completed successfully. It created `epic-TD`, `TD-N-slug` stories, and the retro-to-sprint pipeline.
- The `selector.ts` file is currently 123 lines — well within budget for a 3-line addition.
- `selector.test.ts` is 274 lines — adding tests will push it. Monitor the 300-line limit carefully.

### Key Observations About Existing Code

1. **`selectNextStory()`** (selector.ts:65-123) — the sort at line 100-109 is where the TD gate goes.
2. **`selector.test.ts`** (274 lines) — close to the 300-line limit. Use `it.each` for compact test cases if needed.
3. **No dependency on `state.epics`** — the `TD-` key prefix is sufficient to identify tech debt stories. No need to check if `epic-TD` exists in the epics map.
4. **`buildSprintState()`** already supports `epics` override, but it's not needed for this story since the gate uses key prefix detection.

### References

- [Source: _bmad-output/planning-artifacts/epics-architecture-v3.md lines 333-357] — Story 14-2 epic definition + Decision 6c
- [Source: _bmad-output/planning-artifacts/architecture-v3.md lines 336-357] — Decision 6 (Retro-to-Sprint Pipeline), section 6c
- [Source: src/modules/sprint/selector.ts] — Story selection logic to modify
- [Source: src/modules/sprint/__tests__/selector.test.ts] — Existing selector tests to extend

## Files to Change

- `src/modules/sprint/selector.ts` — Add TD gate within Tier 3 sort comparator (3-line change in the sort function)
- `src/modules/sprint/__tests__/selector.test.ts` — Add 7 new test cases for TD priority, empty TD, mixed TD and feature stories, higher-tier override

## Senior Developer Review (AI)

**Date:** 2026-03-25
**Reviewer:** Adversarial code review
**Outcome:** Approved with fixes applied

### Findings

| # | Severity | Description | Resolution |
|---|----------|-------------|------------|
| 1 | MEDIUM | AGENTS.md missing TD gate documentation for selector.ts | Fixed: added Decision 6c reference |
| 2 | MEDIUM | Shorthand status variables (`bl`, `dn`, `ip`, `vf`) polluting describe scope, reducing readability | Fixed: replaced with typed `it.each` and inline status strings |
| 3 | MEDIUM | No test for case-sensitivity edge case (`td-` lowercase) | Fixed: added test confirming uppercase-only match |
| 4 | LOW | No architecture decision reference in selector.ts comment | Not fixed (low priority) |
| 5 | LOW | `keyToTitle` produces "Td 1 fix" for "TD-1-fix" (acronym mangling) | Not fixed (pre-existing, not in scope) |

### Additional tests added during review
- TD gate applies to `ready` status (not just `backlog`)
- Lowercase `td-` prefix is NOT treated as tech debt (case-sensitivity confirmation)

### Verification
- Build: passes
- Tests: 3666 passed (32 in selector.test.ts, +2 from review)
- Coverage: 97.1% overall, all 154 files above 80% per-file floor
- Line counts: selector.ts=129, selector.test.ts=292 (both under 300)

## Change Log

- 2026-03-25: Story created from epic definition with 2 ACs, expanded to 9 ACs with full task breakdown, verification tags, and dev notes. Status set to ready-for-dev.
- 2026-03-25: Code review completed. 3 MEDIUM issues fixed (AGENTS.md, test readability, case-sensitivity test). 2 tests added. Status set to verifying.
