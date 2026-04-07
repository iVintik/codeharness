# Verification Proof: 26-4-clear-persistence-on-completion

*2026-04-07T13:50:02Z by Showboat 0.6.1*
<!-- showboat-id: d9382562-9d37-40a4-9012-07d916de0c6e -->

## Retry Review: 26-4 Clear Persistence on Completion

Two issues raised in the previous review:
1. Gate checkpoint resume broken (tasks_completed reset breaks dual-condition gate skip)
2. Corrupt-snapshot fallback semantics

Both issues analyzed. Issue 1 is a REAL bug. Issue 2 reduces to Issue 1.

## Fix Applied

workflow-runner.ts: On config-change and corrupt-snapshot resume paths, instead of
clearing tasks_completed to [], synthesize it from checkpoint log entries. This ensures
hasSuccessfulGateCompletionRecord() in workflow-story-machine.ts can find gate records.

Lines fixed: 190-193 (invalid snapshot payload path), 209-212 (config-change path),
226 (corrupt snapshot path) — all three locations now use synthesized tasks_completed.

Regression test added: 'config-change resume: tasks_completed synthesized from checkpoint
log so gate skip guard can fire (bug fix)' at end of workflow-runner.test.ts.

```bash
npm run test:unit 2>&1 | tail -6
```

```output

[2m Test Files [22m [1m[32m198 passed[39m[22m[90m (198)[39m
[2m      Tests [22m [1m[32m5272 passed[39m[22m[90m (5272)[39m
[2m   Start at [22m 17:50:15
[2m   Duration [22m 10.45s[2m (transform 5.68s, setup 0ms, import 15.77s, tests 36.12s, environment 18ms)[22m

```

```bash
grep -n 'Synthesize tasks_completed\|synthesized1\|synthesized2\|synthesized3' /Users/ivintik/dev/personal/codeharness/src/lib/workflow-runner.ts
```

```output
190:        // Synthesize tasks_completed from checkpoint log so the gate skip guard
193:        const synthesized1 = checkpoints.map(e => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
194:        state = { ...state, tasks_completed: synthesized1, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
211:      // Synthesize tasks_completed from checkpoint log so the gate skip guard
214:      const synthesized2 = checkpoints.map(e => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
215:      state = { ...state, tasks_completed: synthesized2, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
230:    const synthesized3 = orphanedEntries.map(e => ({ task_name: e.taskName, story_key: e.storyKey, completed_at: e.completedAt }));
231:    state = { ...state, tasks_completed: synthesized3, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] }, trace_ids: state.trace_ids ?? [] };
```

```bash
npx vitest run --reporter=verbose src/lib/__tests__/workflow-runner.test.ts 2>&1 | grep -E 'gate skip guard|synthesized|config mismatch resets' | head -5
```

```output
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22msnapshot resume (story 26-2)[2m > [22mconfig mismatch resets stale tasks_completed — previously-completed task IS dispatched (AC #2)[32m 0[2mms[22m[39m
 [32m✓[39m lib/__tests__/workflow-runner.test.ts[2m > [22mconfig-change resume: tasks_completed synthesized from checkpoint log so gate skip guard can fire (bug fix)[32m 0[2mms[22m[39m
```

```bash
npm run build 2>&1 | grep -E 'success|error|Error' | head -5
```

```output
ESM ⚡️ Build success in 7ms
ESM ⚡️ Build success in 36ms
DTS ⚡️ Build success in 936ms
```

## Verdict: PASS (after fix)

Issue 1 (gate checkpoint resume broken): REAL BUG — FIXED
- Root cause: workflow-runner.ts cleared tasks_completed to [] on config-change/corrupt-snapshot resume.
  The gate skip guard in workflow-story-machine.ts line 37 uses an AND condition:
  completedTasksForGate.has(key) && hasSuccessfulGateCompletionRecord(name).
  With tasks_completed=[], hasSuccessfulGateCompletionRecord always returns false.
  Gates would always re-execute on config-change resume even when checkpointed.
- Fix: synthesize tasks_completed from checkpoint log entries instead of clearing to [].
  Applied at 3 locations: lines 190-194, 211-215, 230-231 in workflow-runner.ts.
- New regression test added confirming the fix.
- Old regression test (stale YAML entries not causing skips) still passes.

Issue 2 (corrupt-snapshot fallback semantics): NOT an independent bug.
  Reduces to Issue 1 (same tasks_completed clearing problem). Fixed by same patch.

Tests: 5272 passing (5271 before + 1 new), 0 failures
Build: exits 0
