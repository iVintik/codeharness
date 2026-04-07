# Exec Plan: 27-5 Simplify run.ts — remove hand-tracked state

Story: `_bmad-output/implementation-artifacts/27-5-simplify-run-ts-remove-hand-tracked-state.md`

## What this story did

Removed ~210 lines of hand-tracked shadow state from `src/commands/run.ts`. The `onEvent`
handler now derives all display state from sideband events directly, with no duplication of
machine knowledge.

## Implementation summary

### T1–T2: Hand-tracked variables removed (AC #8)

Deleted from `run.ts`:
- `inEpicPhase` boolean
- `taskStates` / `taskMeta` records and their initialization loops
- `storyFlowTasks` / `epicLoopTasks` sets and population loops
- `displayEpicId` / `displayStoryKeyForHeader` variables
- `currentStoryKey` / `currentTaskName` variables
- `headerRefresh` setInterval (replaced by `elapsedRefresh`)
- `epicData` record and the `getSprintState()` + loop that populated it
- All `renderer.updateWorkflowState()` calls in the sequential path (AC #10)

### T3–T7: Simplified event handlers

- `dispatch-start`: reads story key and task name directly from `event.storyKey` /
  `event.taskName`; calls `toDisplayKey()` inline for sentinel translation (3 lines, not 20)
- `dispatch-end`: accumulates `totalCostUsd`, updates header — nothing else
- `story-done`: increments `storiesDone`, updates story list, updates header immediately
  (fixes the stale-done-count bug — prior `headerRefresh` had 2-second lag)
- `dispatch-error`: gate errors (storyKey contains `:`) → warn; story errors → fail + mark done
- `stream-event` / `workflow-viz`: unchanged pass-through

### T6: Elapsed time

`headerRefresh` (20-line setInterval) replaced by `elapsedRefresh` — a minimal 2-second
interval that calls `renderer.updateSprintState()` with the updated elapsed field only.

### Retry 1: workflow-viz debounce bug fixed (AC #1–3, #7)

**Root cause**: inspect callback in `workflow-runner.ts` debounced solely on `snapshot.value`.
The root run machine stays in `processingEpic` for the entire epic — `value` never changes
while stories and tasks progress inside the nested epic/story machines. Result: `workflow-viz`
fired once at epic start, then froze.

**Fix** (`workflow-runner.ts` lines 171–183): Debounce key extended to
`value:tasks_completed_count`. Every task completion changes context, so the viz now updates
on every meaningful transition.

### Retry 1: resource leak fixed (Medium)

**Root cause**: Two early returns in the parallel path (sprint-state read failure and
zero-epics case) returned before calling `clearInterval(elapsedRefresh)`,
`process.removeListener(...)`, and `renderer.cleanup()`.

**Fix** (`run.ts`): Extracted all four cleanup operations into `cleanupResources()` helper.
All exit paths (early returns, parallel catch, sequential success/catch) now call it. No
resource leaks.

## Files modified

- `src/commands/run.ts` — primary simplification (610 → 400 lines)
- `src/lib/workflow-runner.ts` — debounce key fix (context-only advance propagation)
- `verification/27-5-simplify-run-ts-remove-hand-tracked-state-proof.md` — proof document
- `docs/exec-plans/active/27-5-simplify-run-ts-remove-hand-tracked-state.md` — this file

## AC verification

| AC | Check | Result |
|----|-------|--------|
| #8 | `grep -c "inEpicPhase\|taskStates\|taskMeta\|storyFlowTasks\|epicLoopTasks\|headerRefresh" src/commands/run.ts` | 0 |
| #9 | `wc -l src/commands/run.ts` | 400 |
| #10 | `grep -c "updateWorkflowState" src/commands/run.ts` | 0 |
| #11 | `npx vitest run` | 5286/5286 pass |
| #12 | `npm run build` | ESM + DTS success |
