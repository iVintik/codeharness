# Story 14-6: Subagent Status Ownership + Time Budget Awareness

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer running harness-run,
I want the orchestrator to own all status writes and respect time budgets,
So that status is always correct and sessions don't fail at verification.

## Acceptance Criteria

1. Given a subagent completes dev-story with exit code 0 but doesn't update sprint-state.json, when the orchestrator checks after subagent return, then it updates the story status to the next phase (e.g., `in-review`) itself by calling `updateStoryStatus()` <!-- verification: cli-verifiable -->
2. Given a subagent fails (exit code non-zero), when the orchestrator checks after subagent return, then it sets the story status to `failed` and logs `Story {key} failed in {phase}` <!-- verification: cli-verifiable -->
3. Given `shouldDeferPhase(phase, remainingMinutes)` is called with phase `verification` and 10 minutes remaining, when the estimate for verification is 20 minutes, then it returns `true` <!-- verification: cli-verifiable -->
4. Given `shouldDeferPhase(phase, remainingMinutes)` is called with phase `dev-story` and 30 minutes remaining, when the estimate for dev-story is 15 minutes, then it returns `false` <!-- verification: cli-verifiable -->
5. Given 10 minutes remaining and next phase is verification (~20min), when harness-run checks budget before the phase transition, then it defers with `[INFO] deferring verify to next session (Xmin remaining, 20min needed)` and saves current state <!-- verification: cli-verifiable -->
6. Given ralph prompt templates in `src/lib/agents/ralph-prompt.ts` and verify prompt in `src/templates/verify-prompt.ts`, when inspected after this story, then they contain zero instructions telling subagents to write sprint-state.json or sprint-status.yaml <!-- verification: cli-verifiable -->
7. Given `src/modules/sprint/budget.ts` (new file) exists, when inspected, then it exports `shouldDeferPhase()` with phase time estimates: create-story=5min, dev-story=15min, code-review=10min, verification=20min, retro=5min <!-- verification: cli-verifiable -->
8. Given the session start time is tracked in the orchestrator, when `shouldDeferPhase()` is called, then remaining time is computed as `totalBudgetMinutes - elapsedMinutes` <!-- verification: cli-verifiable -->
9. Given `npm run build` runs after all changes, then TypeScript compilation succeeds with zero errors <!-- verification: cli-verifiable -->
10. Given `npm test` runs after all changes, then all existing tests pass with zero regressions <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 11 (Process Enforcement).** Two gates: status ownership and time budget awareness.

### Status Ownership

Currently, subagents (dev, review, verify) are instructed to update sprint-status.yaml. This is unreliable -- reported 7+ times in retros. The fix: subagents are read-only on state. The orchestrator owns all status writes.

Remove all instructions from ralph prompts and subagent prompts that tell them to update sprint-status.yaml or sprint-state.json.

After each subagent completes, the orchestrator in `src/commands/run.ts`:
1. Reads the subagent's output/exit code
2. Determines the status transition (e.g., dev complete -> move to review)
3. Writes the status to sprint-state.json itself via `updateStoryStatus()`
4. Regenerates sprint-status.yaml (via story 11-2's derived view)

```typescript
// After subagent returns
const exitCode = await waitForAgent(process);
if (exitCode === 0) {
  await updateStoryStatus(storyKey, nextPhaseStatus);
  output.ok(`Story ${storyKey} -> ${nextPhaseStatus}`);
} else {
  await updateStoryStatus(storyKey, 'failed');
  output.fail(`Story ${storyKey} failed in ${currentPhase}`);
}
```

### Time Budget Awareness

Phase time estimates (from architecture-v3.md):
- create-story: 5 min
- dev-story: 15 min
- code-review: 10 min
- verification: 20 min
- retro: 5 min

Before each phase, check remaining time:
```typescript
function shouldDeferPhase(phase: string, remainingMinutes: number): boolean {
  const estimates: Record<string, number> = {
    'create-story': 5,
    'dev-story': 15,
    'code-review': 10,
    'verification': 20,
    'retro': 5,
  };
  return remainingMinutes < (estimates[phase] ?? 10);
}
```

Track session start time and total budget. Before each phase transition (Step 3b, 3c, 3d), call `shouldDeferPhase()`. If true, log `[INFO] deferring ${phase} to next session (${remaining}min remaining, ${estimate}min needed)` and save current state for next session.

The session timeout is already tracked in ralph. Surface it to the TypeScript orchestrator.

### Dependencies

- `updateStoryStatus()` already exists in `src/modules/sprint/state.ts` (from story 11-1)
- Sprint-status.yaml regeneration exists via `generateSprintStatusYaml()` (from story 11-2)
- `src/modules/sprint/timeout.ts` handles timeout capture but NOT phase budget estimation — the budget logic is new

## Tasks / Subtasks

- [x] Task 1 (AC: 7, 3, 4, 8): Create `src/modules/sprint/budget.ts` with `shouldDeferPhase()` function and phase time estimate constants
- [x] Task 2 (AC: 7): Add unit tests for `shouldDeferPhase()` in `src/modules/sprint/__tests__/budget.test.ts`
- [x] Task 3 (AC: 1, 2): Add post-subagent status ownership logic in `src/commands/run.ts` — after each subagent returns, call `updateStoryStatus()` based on exit code
- [x] Task 4 (AC: 5, 8): Add time budget check before each phase transition in `src/commands/run.ts` — call `shouldDeferPhase()` and defer if needed
- [x] Task 5 (AC: 6): Audit `src/lib/agents/ralph-prompt.ts` and `src/templates/verify-prompt.ts` — remove any instructions telling subagents to write sprint-state.json or sprint-status.yaml
- [x] Task 6 (AC: 9): Verify TypeScript compilation with `npm run build`
- [x] Task 7 (AC: 10): Run `npm test` and confirm zero regressions

## Files to Change

- `src/commands/run.ts` — Add status ownership after each subagent, add time budget checks before each phase transition
- `src/modules/sprint/budget.ts` — NEW: `shouldDeferPhase()` function with phase time estimates, session budget tracking
- `src/modules/sprint/__tests__/budget.test.ts` — NEW: Unit tests for budget logic
- `src/lib/agents/ralph-prompt.ts` — Remove all instructions telling subagents to write state files
- `src/templates/verify-prompt.ts` — Remove state-writing instructions from verify prompts
- `src/modules/sprint/index.ts` — Re-export budget functions
