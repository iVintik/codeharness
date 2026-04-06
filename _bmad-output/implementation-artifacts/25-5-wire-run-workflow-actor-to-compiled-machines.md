<story-spec>

# Story 25-5: Wire runWorkflowActor() to compiled machines

Status: done

## Story

As a developer,
I want `runWorkflowActor()` in `workflow-runner.ts` to use the new XState machine hierarchy (run → epic → story → gate machines from stories 25-1 through 25-4) instead of the legacy machines in `workflow-machines.ts`,
So that the full workflow execution pipeline uses real XState state machines with typed contexts, proper output functions, and clean machine boundaries — completing the Epic 25 wire-up and making the legacy `epicMachine`, `runEpicActor`, `epicStepActor`, `storyFlowActor`, and `runMachine` in `workflow-machines.ts` dead code.

## Context

**Epic 25: XState Machine Hierarchy** — this is story 5 of 5. Stories 25-1 (gate machine), 25-2 (story machine), 25-3 (epic machine), and 25-4 (run machine) are complete and verified.

**What exists and is usable:**

- `workflow-run-machine.ts` (173 lines): New run machine with typed `RunOutput`, AD4 for_each pattern, 3 final states (`allDone`, `halted`, `interrupted`). **Currently imports `epicMachine` from `workflow-machines.ts` (the legacy file)** — this is the critical wire that needs changing.
- `workflow-epic-machine.ts` (255 lines): New epic machine with typed `EpicOutput`, story iteration + epic-level step processing, invokes `storyMachine` and `gateMachine`. Complete, tested (17 tests).
- `workflow-story-machine.ts` (222 lines): New story machine with typed `StoryFlowOutput`. Complete, tested (15 tests).
- `workflow-gate-machine.ts` (236 lines): New gate machine with typed `GateOutput`. Complete, tested (14 tests).
- `workflow-runner.ts` (156 lines): Composition root. Already imports `runMachine` from `workflow-run-machine.ts`. **Currently reads `actor.getSnapshot().context` on completion** — should use `.output` since the new run machine defines a typed output function.
- `workflow-machines.ts` (397 lines): Legacy file containing `loopMachine`, `executeLoopBlock`, `dispatchTask`, `collectGuideFiles`, `cleanupGuideFiles`, `storyFlowActor`, `epicStepActor`, `epicMachine` (legacy), `runEpicActor` (legacy), `runMachine` (legacy). After this story, the run/epic/story actors in this file become dead code. The `loopMachine`, `executeLoopBlock`, and `dispatchTask` functions are still used by the new epic machine and must be preserved.
- `workflow-run-machine.ts` line 7: `import { epicMachine } from './workflow-machines.js'` — currently wired to legacy epic machine. Must change to `import { epicMachine } from './workflow-epic-machine.js'`.

**What this story does:**

1. **Switch the run machine's epic import** — change `workflow-run-machine.ts` to import `epicMachine` from `workflow-epic-machine.ts` instead of `workflow-machines.ts`
2. **Update runEpicActor to use typed EpicOutput** — the new epic machine returns `EpicOutput` via `.output` (not raw `.context`). The `runEpicActor` in `workflow-run-machine.ts` must read `snap.output as EpicOutput` and handle the typed output shape correctly.
3. **Update workflow-runner.ts to use machine output** — switch from `actor.getSnapshot().context` to `actor.getSnapshot().output` since the new run machine defines a proper output function returning `RunOutput`.
4. **Remove dead legacy exports from workflow-machines.ts** — delete the now-unused `epicMachine` (legacy), `runEpicActor` (legacy), `runMachine` (legacy), `epicStepActor`, `storyFlowActor` from `workflow-machines.ts`. Keep `loopMachine`, `executeLoopBlock`, `dispatchTask`, `collectGuideFiles`, `cleanupGuideFiles` which are still in use.
5. **Update all import consumers** — any file importing from `workflow-machines.ts` that referenced the removed exports must be updated.
6. **Verify full integration** — build, lint, all tests pass, no regressions.

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD2: Context flows down as typed input, results flow up as typed output. Parent merges via `assign` on `onDone`.
- The runner is the composition root — it creates actors and starts machines.
- Boundary rules: runner imports from all workflow modules.

**Dependencies:** Stories 25-1, 25-2, 25-3, 25-4 complete. This story completes Epic 25.

## Acceptance Criteria

1. [x] **Given** the codebase after implementation, **When** `npm run build` is executed in the project root, **Then** it exits with code 0 and produces no TypeScript errors in the terminal output.
   <!-- verification: `npm run build` exits 0 -->

2. [x] **Given** the full test suite, **When** `npx vitest run` is executed in the project root, **Then** the summary line shows zero failures and all tests pass — no regressions from the wiring changes.
   <!-- verification: `npx vitest run` exits 0 with 0 failures -->

3. [x] **Given** the run machine module, **When** its imports are inspected via `grep`, **Then** it imports `epicMachine` from `workflow-epic-machine` (not from `workflow-machines`).
   <!-- verification: `grep "from.*workflow-epic-machine" src/lib/workflow-run-machine.ts` returns a match AND `grep "from.*workflow-machines" src/lib/workflow-run-machine.ts` returns no matches -->

4. [x] **Given** the existing run machine tests, **When** `npx vitest run src/lib/__tests__/workflow-run-machine.test.ts --reporter=verbose` is executed, **Then** all 16 existing tests still pass — confirming the wire-up to the new epic machine is backward-compatible.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-run-machine.test.ts --reporter=verbose` shows 16 passing tests and 0 failures -->

5. [x] **Given** the existing runner tests, **When** `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` is executed, **Then** all existing tests pass — confirming `runWorkflowActor()` works correctly with the machine output change.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` shows 0 failures -->

6. [x] **Given** the workflow runner module, **When** its source is inspected, **Then** it reads the final result from the run machine's output (not raw context) — verified by the presence of `.output` access pattern and absence of `.context` access for the final machine result.
   <!-- verification: `grep "getSnapshot().output\|\.output" src/lib/workflow-runner.ts` returns at least one match for the actor result reading -->

7. [x] **Given** a test that exercises the full pipeline — `runWorkflowActor()` called with a valid `EngineConfig` containing work items — **When** `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the function returns an `EngineResult` with `success`, `tasksCompleted`, `storiesProcessed`, `errors`, and `durationMs` fields.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` shows a passing test matching "runWorkflowActor.*result\|runWorkflowActor.*success\|runWorkflowActor.*EngineResult" -->

8. [x] **Given** `runWorkflowActor()` called with an `EngineConfig` where the workflow state phase is `'completed'`, **When** `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming it returns immediately with `{ success: true, tasksCompleted: 0, storiesProcessed: 0 }` without starting the machine.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` shows a passing test matching "completed.*phase\|already.*completed\|phase.*completed" -->

9. [x] **Given** `runWorkflowActor()` called with an `EngineConfig` where `checkDriverHealth()` throws, **When** `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming it returns `{ success: false }` with an error containing `code: 'HEALTH_CHECK'`.
   <!-- verification: `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` shows a passing test matching "health.*check\|driver.*health\|HEALTH_CHECK" -->

10. [x] **Given** the legacy machines file (`workflow-machines.ts`), **When** its exports are inspected, **Then** it no longer exports `runMachine` or the legacy `epicMachine` — those symbols have been removed since the new modules provide them.
    <!-- verification: `grep "^export.*\brunMachine\b\|^export const runMachine\|^export const epicMachine" src/lib/workflow-machines.ts` returns no matches for `runMachine` and no match for the old `epicMachine` setup+createMachine block -->

11. [x] **Given** the codebase after cleanup, **When** `grep -r "from.*workflow-machines" src/` is executed, **Then** any remaining imports from `workflow-machines.ts` reference only the preserved functions (`executeLoopBlock`, `loopMachine`, `dispatchTask`, `collectGuideFiles`, or `cleanupGuideFiles`) — no import references the removed `epicMachine`, `runMachine`, `storyFlowActor`, `epicStepActor`, or `runEpicActor`.
    <!-- verification: `grep -r "from.*workflow-machines" src/` shows no references to removed symbols -->

12. [x] **Given** the new epic machine tests, **When** `npx vitest run src/lib/__tests__/workflow-epic-machine.test.ts --reporter=verbose` is executed, **Then** all 17 existing tests pass — confirming the new epic machine is unaffected by the wiring changes.
    <!-- verification: `npx vitest run src/lib/__tests__/workflow-epic-machine.test.ts --reporter=verbose` shows 0 failures -->

13. [x] **Given** a test where `runWorkflowActor()` is called and the workflow encounters a halt error (e.g., `RATE_LIMIT`), **When** `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` is executed, **Then** verbose output shows a passing test confirming the function returns `{ success: false }` with errors populated — demonstrating halt propagation through the full machine hierarchy.
    <!-- verification: `npx vitest run src/lib/__tests__/workflow-runner.test.ts --reporter=verbose` shows a passing test matching "halt\|RATE_LIMIT\|error.*propagat" -->

14. [x] **Given** all linted files, **When** `npx eslint src/lib/workflow-run-machine.ts src/lib/workflow-runner.ts src/lib/workflow-machines.ts` is executed, **Then** it exits with code 0 and produces no lint errors.
    <!-- verification: `npx eslint src/lib/workflow-run-machine.ts src/lib/workflow-runner.ts src/lib/workflow-machines.ts` exits 0 -->

15. [x] **Given** the modified files, **When** their line counts are checked, **Then** `workflow-run-machine.ts` is <= 300 lines, `workflow-runner.ts` is <= 300 lines, and `workflow-machines.ts` is reduced in size compared to its pre-story 397 lines (since dead code was removed).
    <!-- verification: `wc -l src/lib/workflow-run-machine.ts src/lib/workflow-runner.ts src/lib/workflow-machines.ts` shows all files under 300 lines -->

16. [x] **Given** the run machine's `runEpicActor`, **When** it completes processing an epic, **Then** it reads the epic machine's typed output (not raw context) — verified by the `runEpicActor` accessing `snap.output` instead of `snap.context`.
    <!-- verification: `grep "snap.output\|\.output as EpicOutput\|output as Epi" src/lib/workflow-run-machine.ts` returns at least one match -->

## Tasks / Subtasks

### T1: Switch epicMachine import in workflow-run-machine.ts

- Change line 7 from `import { epicMachine } from './workflow-machines.js'` to `import { epicMachine } from './workflow-epic-machine.js'`
- Import `EpicOutput` from `workflow-epic-machine.ts` (if not already imported from types)
- Verify the `runEpicActor` properly uses the new epic machine's typed output

### T2: Update runEpicActor to use typed EpicOutput

- The new `epicMachine` defines `output: ({ context }) => (...)` returning `EpicOutput`
- Change `snap.context as EpicContext` to `snap.output as EpicOutput` in the `runEpicActor`
- Adjust field access: `EpicOutput` is `Pick<EpicContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>` — all fields the run machine needs are present
- The `workflowState.tasks_completed` filtering for `completedStoryKeys` should still work since `workflowState` is included in `EpicOutput`

### T3: Update workflow-runner.ts to use machine output

- Change the actor result reading from:
  ```typescript
  const finalContext = await new Promise<RunMachineContext>((resolve) => {
    const actor = createActor(runMachine, { input: runInput });
    actor.subscribe({ complete: () => resolve(actor.getSnapshot().context) });
    actor.start();
  });
  ```
  To:
  ```typescript
  const finalOutput = await new Promise<RunOutput>((resolve) => {
    const actor = createActor(runMachine, { input: runInput });
    actor.subscribe({ complete: () => resolve(actor.getSnapshot().output!) });
    actor.start();
  });
  ```
- Update downstream references: `finalContext.workflowState` → `finalOutput.workflowState`, etc.
- Import `RunOutput` from `workflow-run-machine.ts`
- All fields the runner needs (`workflowState`, `errors`, `tasksCompleted`, `storiesProcessed`, `lastContract`, `accumulatedCostUsd`, `halted`) are in `RunOutput`

### T4: Remove dead legacy code from workflow-machines.ts

Remove the following from `workflow-machines.ts`:
- `storyFlowActor` (lines 196-246) — replaced by `storyMachine` in `workflow-story-machine.ts`
- `epicStepActor` (lines 248-316) — replaced by actors in `workflow-epic-machine.ts`
- `epicMachine` (lines 318-343) — replaced by `epicMachine` in `workflow-epic-machine.ts`
- `runEpicActor` (lines 345-369) — replaced by `runEpicActor` in `workflow-run-machine.ts`
- `runMachine` (lines 371-396) — replaced by `runMachine` in `workflow-run-machine.ts`

Keep:
- `loopIterationActor` + `loopMachine` + `executeLoopBlock` — still used by `workflow-epic-machine.ts` for legacy `loop:` blocks
- `dispatchTask` — still referenced by integration code
- `collectGuideFiles` + `cleanupGuideFiles` — duplicated in `workflow-epic-machine.ts` but may still be imported elsewhere

### T5: Update imports across the codebase

- Search for all files importing `epicMachine`, `runMachine`, `storyFlowActor`, `epicStepActor`, or `runEpicActor` from `workflow-machines.ts`
- Update imports to point to the new module files
- Verify no dangling references remain

### T6: Update runner test to work with typed output

- If `workflow-runner.test.ts` mocks the run machine actor and asserts on `.context`, update to match the new `.output` pattern
- Ensure all existing runner tests pass with the output-based reading
- Add or update a test that verifies `runWorkflowActor()` correctly reads `RunOutput` fields from the machine

### T7: Verify full integration

- `npm run build` exits 0
- `npx vitest run` — all tests pass, zero regressions
- `npx eslint` on modified files — clean
- `wc -l` on modified files — all under 300 lines
- `grep` for removed symbols — no dangling references
- Confirm `workflow-machines.ts` line count decreased

## Dev Notes

### The critical wire change

The entire purpose of this story is one import change + its cascading effects:

```
workflow-run-machine.ts:7
- import { epicMachine } from './workflow-machines.js';
+ import { epicMachine } from './workflow-epic-machine.js';
```

This switches the entire machine hierarchy from legacy (imperative actors) to new (real XState machines). Everything else in this story is cleanup and consistency.

### Context vs Output

The legacy machines used raw `.context` as their "return value" — the caller read the full machine context after completion. The new machines define proper `output` functions that return a `Pick<Context, ...>` subset. This is cleaner because:
- The output explicitly declares what the machine returns
- Internal context fields (like `currentStepIndex`) are not leaked to the caller
- Type safety is enforced — caller can only access declared output fields

### EpicOutput shape

The new `epicMachine` output is:
```typescript
type EpicOutput = Pick<EpicContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>;
```

The `runEpicActor` currently accesses these exact fields from `snap.context as EpicContext`. The switch to `snap.output as EpicOutput` should be a straightforward type change with no behavioral difference.

### RunOutput shape

The run machine output is:
```typescript
type RunOutput = Pick<RunContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>;
```

The runner currently reads `finalContext.workflowState`, `finalContext.errors`, `finalContext.tasksCompleted`, `finalContext.storiesProcessed` — all present in `RunOutput`.

### What stays in workflow-machines.ts

After cleanup, `workflow-machines.ts` should contain only:
- `loopIterationActor` — used by `loopMachine`
- `loopMachine` — used by `executeLoopBlock`
- `executeLoopBlock` — exported, used by `workflow-epic-machine.ts` for `loop:` blocks
- `dispatchTask` — exported, used by integration code
- `collectGuideFiles` / `cleanupGuideFiles` — keep if still imported, otherwise remove (duplicated in `workflow-epic-machine.ts`)

Expected post-cleanup size: ~160-200 lines (down from 397).

### Test strategy

This story is primarily a wiring change. The main verification is:
1. All 16 run machine tests pass (AC4) — proves the new epic machine works as a drop-in
2. All runner tests pass (AC5) — proves the output-based reading works
3. All epic/story/gate machine tests pass (AC12) — proves no regressions
4. Build + lint clean (AC1, AC14)
5. Dead code removal verified by grep (AC10, AC11)

No new test files needed. Existing tests cover the behavior. The wiring change should be transparent to tests since they mock the actors anyway.

### What this story does NOT do

- Does not modify the new machine implementations (25-1 through 25-4 machines are locked)
- Does not implement persistence refactoring (Epic 5)
- Does not implement visualization refactoring (Epic 6)
- Does not remove the `loopMachine` / `executeLoopBlock` from `workflow-machines.ts` — those are still actively used for legacy `loop:` YAML blocks
- Does not change the `EngineResult` interface or `runWorkflowActor()` function signature — the external API is preserved

### Risk: snapshot output access

When XState machine reaches a final state, `actor.getSnapshot().output` should contain the machine's output. However, if the machine is still running or errored, `.output` may be `undefined`. The runner must handle this — the current `!` assertion (`actor.getSnapshot().output!`) relies on the `subscribe({ complete })` callback only firing when the machine is done. This is safe because XState's `complete` callback fires only when the machine reaches a final state.

### Relationship to workflow-machines.ts legacy code

After this story:
- `workflow-machines.ts` becomes a "loop machine" module only
- Consider renaming to `workflow-loop-machine.ts` in a future cleanup story
- The file still exports `executeLoopBlock` which is the key function used by epic-machine for `loop:` blocks

## Dev Agent Record

### Implementation Plan

All wiring changes were already in place prior to this story session (implemented in a prior autonomous run). This session verified correctness and confirmed all ACs pass.

### Completion Notes

- **T1 (epicMachine import):** `workflow-run-machine.ts:7` imports `epicMachine` from `./workflow-epic-machine.js` — confirmed via grep, no reference to `workflow-machines` remains.
- **T2 (EpicOutput):** `runEpicActor` reads `snap.output as EpicOutput` at line 58 — typed output, not raw context.
- **T3 (RunOutput):** `workflow-runner.ts` resolves `actor.getSnapshot().output!` into `finalOutput: RunOutput` at line 137-141. All downstream field access updated.
- **T4 (dead code removal):** `workflow-machines.ts` reduced from 397 → 164 lines. Removed `storyFlowActor`, `epicStepActor`, `epicMachine` (legacy), `runEpicActor` (legacy), `runMachine` (legacy). Retained `loopIterationActor`, `loopMachine`, `executeLoopBlock`, `dispatchTask`.
- **T5 (import cleanup):** No remaining imports of removed symbols from `workflow-machines`. Remaining imports (`dispatchTask`, `executeLoopBlock`) reference only preserved exports.
- **T6 (runner tests):** All 48 runner tests pass with output-based reading. `returns correct EngineResult shape` confirms full `EngineResult` shape. `returns early when phase is completed` covers AC8. `fails fast on health check failure` covers AC9. `halts on RATE_LIMIT dispatch errors` covers AC13. `persists interrupted phase to disk when abort signal fires mid-run` locks the interrupt persistence fix.
- **T7 (integration):** `npm run build` exits 0. `npx vitest run` — 197 test files, 5166 tests, 0 failures. `npx eslint` exits 0. All files under 300 lines.

## File List

- `src/lib/workflow-run-machine.ts` (modified — T1, T2: import changed to `workflow-epic-machine`, `snap.output as EpicOutput`)
- `src/lib/workflow-runner.ts` (modified — T3: reads `actor.getSnapshot().output!` as `RunOutput`)
- `src/lib/workflow-machines.ts` (modified — T4: dead legacy code removed, 397→164 lines)

## Change Log

- 2026-04-06: Verified and confirmed all story wiring (T1-T7). All 16 ACs pass. Story status → done.
- 2026-04-06 (retry): Fixed interrupt-persistence bug found by code review. `workflow-runner.ts` now always calls `writeWorkflowState` after machine completion — previously `interrupted` and `halted` terminal states left the on-disk phase as `executing`. Added `persists interrupted phase to disk when abort signal fires mid-run` test to lock the behavior. 5166 tests pass, build + lint clean.

</story-spec>
