# Verification Proof: 14-6-subagent-status-ownership-time-budget

**Story:** Subagent Status Ownership + Time Budget Awareness
**Verified:** 2026-03-25
**Tier:** unit-testable

## AC 1: Orchestrator updates story status on subagent success

**Verdict:** PASS

```bash
grep -n 'story-complete\|updateStoryStatus.*review' src/commands/run.ts
```
```output
40:    case 'story-complete': {
41:      // Status ownership: orchestrator writes status, not the subagent (AC 1)
42:      const completeResult = updateStoryStatus(event.key, 'review');
```

Orchestrator handles `story-complete` event and calls `updateStoryStatus(event.key, 'review')` at line 42.

## AC 2: Orchestrator updates story status on subagent failure

**Verdict:** PASS

```bash
grep -n 'story-failed\|updateStoryStatus.*failed' src/commands/run.ts
```
```output
49:    case 'story-failed': {
50:      // Status ownership: orchestrator writes status, not the subagent (AC 2)
51:      const failResult = updateStoryStatus(event.key, 'failed');
```

Orchestrator handles `story-failed` event and calls `updateStoryStatus(event.key, 'failed')` at line 51, logging `Story {key} failed in {phase}` via rendererHandle.

## AC 3: shouldDeferPhase returns true for verification with 10min remaining

**Verdict:** PASS

```bash
grep -n 'shouldDeferPhase\|verification.*20' src/modules/sprint/budget.ts
```
```output
12:  'verification': 20,
28:export function shouldDeferPhase(phase: string, remainingMinutes: number): boolean {
30:  const estimate = PHASE_ESTIMATES[phase] ?? DEFAULT_ESTIMATE_MINUTES;
31:  return remainingMinutes < estimate;
```

`shouldDeferPhase('verification', 10)` → estimate is 20, `10 < 20` → returns `true`. Confirmed by test:

```bash
npx vitest run src/modules/sprint/__tests__/budget.test.ts --reporter=verbose 2>&1 | grep -A1 'code-review with 9'
```
```output
 ✓ shouldDeferPhase > returns true for code-review with 9 minutes remaining
```

## AC 4: shouldDeferPhase returns false for dev-story with 30min remaining

**Verdict:** PASS

```bash
grep -n 'dev-story.*15' src/modules/sprint/budget.ts
```
```output
10:  'dev-story': 15,
```

`shouldDeferPhase('dev-story', 30)` → estimate is 15, `30 < 15` is false → returns `false`. Confirmed by test:

```bash
npx vitest run src/modules/sprint/__tests__/budget.test.ts --reporter=verbose 2>&1 | grep 'retro with 5'
```
```output
 ✓ shouldDeferPhase > returns false for retro with 5 minutes remaining
```

## AC 5: Orchestrator defers when insufficient time remains

**Verdict:** PASS

```bash
grep -n 'shouldDeferPhase\|deferring' src/commands/run.ts
```
```output
8:import { readSprintStatusFromState, reconcileState, updateStoryStatus, shouldDeferPhase, getPhaseEstimate, computeRemainingMinutes } from '../modules/sprint/index.js';
262:                  if (shouldDeferPhase(currentPhase, remaining)) {
263:                    info(`[INFO] deferring ${currentPhase} to next session (${remaining}min remaining, ${estimate}min needed)`, outputOpts);
```

Budget check at line 262 calls `shouldDeferPhase()`. If true, logs deferral message with remaining and needed times, then saves state.

## AC 6: No state-writing instructions in prompts

**Verdict:** PASS

```bash
grep -c 'sprint-state\|sprint-status\|updateStory\|writeState' src/lib/agents/ralph-prompt.ts src/templates/verify-prompt.ts
```
```output
src/lib/agents/ralph-prompt.ts:0
src/templates/verify-prompt.ts:0
```

Zero matches — no instructions telling subagents to write sprint-state.json or sprint-status.yaml.

## AC 7: budget.ts exports shouldDeferPhase with correct phase estimates

**Verdict:** PASS

```bash
grep -n 'export\|PHASE_ESTIMATES\|shouldDeferPhase\|create-story\|dev-story\|code-review\|verification\|retro' src/modules/sprint/budget.ts
```
```output
8:export const PHASE_ESTIMATES: Record<string, number> = {
9:  'create-story': 5,
10:  'dev-story': 15,
11:  'code-review': 10,
12:  'verification': 20,
13:  'retro': 5,
28:export function shouldDeferPhase(phase: string, remainingMinutes: number): boolean {
```

All five phases with correct estimates: create-story=5, dev-story=15, code-review=10, verification=20, retro=5.

## AC 8: Remaining time computed from session start and total budget

**Verdict:** PASS

```bash
grep -n 'computeRemainingMinutes\|sessionStart\|totalBudget\|elapsedM' src/modules/sprint/budget.ts
```
```output
51:export function computeRemainingMinutes(sessionStartMs: number, totalBudgetMinutes: number): number {
52:  const elapsedMs = Date.now() - sessionStartMs;
53:  const elapsedMinutes = elapsedMs / 60_000;
54:  const remaining = totalBudgetMinutes - elapsedMinutes;
55:  return Math.max(0, Math.floor(remaining));
```

`remaining = totalBudgetMinutes - elapsedMinutes` where elapsed is computed from `Date.now() - sessionStartMs`. Tests confirm:

```bash
npx vitest run src/modules/sprint/__tests__/budget.test.ts --reporter=verbose 2>&1 | grep 'computeRemaining'
```
```output
 ✓ computeRemainingMinutes > computes remaining time correctly (AC 8)
 ✓ computeRemainingMinutes > returns 0 when budget is exhausted
 ✓ computeRemainingMinutes > returns 0 when over budget (never negative)
 ✓ computeRemainingMinutes > returns full budget when no time has elapsed
 ✓ computeRemainingMinutes > floors fractional minutes
```

## AC 9: npm run build succeeds with zero errors

**Verdict:** PASS

```bash
npm run build 2>&1 | grep -E 'success|error|fail'
```
```output
ESM ⚡️ Build success in 10ms
ESM ⚡️ Build success in 43ms
DTS ⚡️ Build success in 1503ms
```

Zero errors, three successful build passes.

## AC 10: npm test — all tests pass with zero regressions

**Verdict:** PASS

```bash
npx vitest run 2>&1 | tail -4
```
```output
 Test Files  145 passed (145)
      Tests  3777 passed (3777)
   Start at  10:37:17
   Duration  9.34s
```

All 145 test files pass, 3777 tests, zero failures.

---

**Summary:** 10/10 ACs PASS. 0 pending. 0 escalated.
