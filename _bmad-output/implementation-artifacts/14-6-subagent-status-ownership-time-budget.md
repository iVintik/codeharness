# Story 14-6: Subagent Status Ownership + Time Budget Awareness

## Status: backlog

## Story

As a developer running harness-run,
I want the orchestrator to own all status writes and respect time budgets,
So that status is always correct and sessions don't fail at verification.

## Acceptance Criteria

- [ ] AC1: Given a subagent completes dev-story but doesn't update sprint-state.json, when the orchestrator checks after subagent return, then it updates the status itself <!-- verification: cli-verifiable -->
- [ ] AC2: Given 10 minutes remaining and next phase is verification (~20min), when harness-run checks budget, then it defers with `[INFO] deferring verify to next session` <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 11 (Process Enforcement).** Two gates: status ownership and time budget awareness.

### Status Ownership

Currently, subagents (dev, review, verify) are instructed to update sprint-status.yaml. This is unreliable -- reported 7+ times in retros. The fix: subagents are read-only on state. The orchestrator owns all status writes.

Remove all instructions from ralph prompts and subagent prompts that tell them to update sprint-status.yaml or sprint-state.json.

After each subagent completes, the orchestrator in `src/commands/run.ts`:
1. Reads the subagent's output/exit code
2. Determines the status transition (e.g., dev complete -> move to review)
3. Writes the status to sprint-state.json itself
4. Regenerates sprint-status.yaml (via story 11-2)

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

## Files to Change

- `src/commands/run.ts` — Add status ownership after each subagent, add time budget checks before each phase transition
- `src/templates/ralph-prompt.ts` — Remove all instructions telling subagents to write state files
- `src/templates/verify-prompt.ts` — Remove state-writing instructions from verify prompts
- `src/modules/sprint/state.ts` — Add `updateStoryStatus()` convenience function if not present
- `src/modules/sprint/timeout.ts` — Add `shouldDeferPhase()` function with phase time estimates, track session start time
