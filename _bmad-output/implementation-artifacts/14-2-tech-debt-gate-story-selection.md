# Story 14-2: Tech Debt Gate in Story Selection

## Status: backlog

## Story

As a developer,
I want TD stories prioritized before new feature work,
So that debt gets paid before it accumulates further.

## Acceptance Criteria

- [ ] AC1: Given `epic-TD` has 3 backlog stories and a feature epic has 5 backlog stories, when harness-run Step 2 selects next story, then TD stories are selected first <!-- verification: cli-verifiable -->
- [ ] AC2: Given all TD stories are `done`, when Step 2 selects next story, then feature epic stories are selected normally <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 6c (Tech Debt Gate).** Before selecting ANY Tier D (backlog) story from a feature epic, check if `epic-TD` has pending work.

The story selection logic lives in `src/modules/sprint/selector.ts`. Currently it uses a tiered priority system (Tier A: in-progress, Tier B: blocked-unblocked, Tier C: next-in-epic, Tier D: backlog).

Modify the Tier D selection to insert a tech debt gate:

```typescript
function selectNextStory(state: SprintState): string | null {
  // Tier A: in-progress stories (continue work)
  // Tier B: previously blocked stories now unblocked
  // Tier C: next story in current epic sequence

  // Tier D: backlog — but check TD gate first
  const tdEpic = state.epics['epic-TD'];
  if (tdEpic) {
    const pendingTd = Object.entries(state.stories)
      .filter(([key, s]) => key.startsWith('TD-') && s.status === 'backlog')
      .map(([key]) => key);
    if (pendingTd.length > 0) {
      return pendingTd[0]; // TD stories first
    }
  }

  // Then normal feature epic backlog selection
  // ...
}
```

This ensures tech debt stories created by the retro pipeline (story 14-1) get addressed before new feature work starts. The gate only applies at Tier D -- in-progress and blocked stories still take priority regardless of type.

Write tests that verify:
1. TD backlog stories are selected before feature backlog stories
2. TD in-progress stories follow normal Tier A priority
3. When no TD stories are pending, normal selection resumes
4. epic-TD with all stories `done` does not block feature selection

## Files to Change

- `src/modules/sprint/selector.ts` — Add tech debt gate before Tier D feature story selection. Check `epic-TD` for pending backlog stories
- `src/modules/sprint/__tests__/selector.test.ts` — Add tests for TD priority, empty TD, mixed TD and feature stories
