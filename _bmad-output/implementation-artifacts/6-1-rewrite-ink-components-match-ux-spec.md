# Story 6-1: Rewrite Ink Components to Match UX Spec

## Status: backlog

## Goal
The Ink terminal renderer output must visually match the UX spec mockup in `_bmad-output/planning-artifacts/ux-design-specification.md` lines 197-253. Every prior implementation diverged from the spec. This story requires literal reproduction of the spec format.

## Context: Why This Keeps Failing
Previous sessions "interpreted" the visual format instead of reproducing it literally. The tests verify data flow (function calls, event types) but never compare actual terminal output to the spec mockup. This time: start from the spec mockup, build backward.

## Target Output (from UX spec — reproduce EXACTLY)

### Running state:
```
codeharness run | iteration 3 | 47m elapsed | $12.30 spent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Story: 3-2-bmad-installation-workflow-patching
Phase: verify → AC 8/12 (docker exec ... codeharness init --json)

Done: 3-1 ✓  4-1 ✓  4-2 ✓
This: 3-2 ◆ verifying (8/12 ACs)
Next: 3-3 (verifying, no proof yet)

Blocked: 0-1 ✕ (10/10)  13-3 ✕ (10/10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Story completion:
```
[OK] Story 3-2: DONE — 12/12 ACs verified
  └ Proof: verification/3-2-proof.md
  └ Duration: 18m | Cost: $4.20
[INFO] Sprint: 18/65 done (28%) — moving to 3-3
```

### Story returned to dev:
```
[WARN] Story 3-3: verification found 2 failing ACs → returning to dev
  └ AC 3: bridge --dry-run output missing epic headers
  └ AC 7: bridge creates duplicate beads issues
  └ Attempt 2/10 — dev will fix and re-verify
```

## Acceptance Criteria

- [ ] AC1: Header line shows `codeharness run | iteration N | Xm elapsed | $Y.ZZ spent` — NO box border
- [ ] AC2: `━━━` separator line spans terminal width (no Ink Box border)
- [ ] AC3: `Story:` and `Phase:` on separate lines below header
- [ ] AC4: Story breakdown uses labeled sections: `Done:` with individual short keys, `This:` with current story + AC progress, `Next:` with next pending, `Blocked:` with retry counts
- [ ] AC5: Story completion messages include proof path, duration, and cost
- [ ] AC6: Story warning/failure messages include AC details and attempt count
- [ ] AC7: Cost tracking sourced from stream-json `result` events (accumulated per session)
- [ ] AC8: Iteration number sourced from ralph stderr `[LOOP]` messages
- [ ] AC9: All existing tests updated to match new component structure
- [ ] AC10: Visual snapshot test added — renders a known state and asserts output matches spec format character-by-character

## Technical Approach
- Rewrite `ink-components.tsx` — remove Box border, restructure layout to match spec
- Add `iterationCount` and `totalCost` to `SprintInfo` type
- Add `acProgress` (current/total) to `SprintInfo`
- Parse `[LOOP]` messages from ralph stderr to extract iteration number
- Accumulate cost from `result` events in renderer state
- Update `ink-renderer.tsx` state management for new fields
- Update `run-helpers.ts` `parseRalphMessage` to extract `[LOOP]` iteration numbers

## Files to Change
- `src/lib/ink-components.tsx` — complete rewrite of layout
- `src/lib/ink-renderer.tsx` — add iterationCount, totalCost, acProgress to state
- `src/lib/run-helpers.ts` — parse [LOOP] messages
- `src/commands/run.ts` — wire new state fields
- `tests/` — update all renderer/component tests
