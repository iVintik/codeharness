<story-spec>

# Story 27-5: Simplify run.ts — remove hand-tracked state

Status: ready-for-dev

## Story

As a workflow operator,
I want `run.ts` to derive all display state from the XState machine snapshot (via the inspect API and sideband events),
So that the TUI is driven by a single source of truth — eliminating duplicated hand-tracked variables that can drift, desync, or misrepresent what the engine is actually doing during long unattended runs.

## Context

**Epic 27: TUI Visualization & Integration** — this is story 5 of 5 (final story).

**What exists and is usable (stories 27-1 through 27-4 complete):**

- `src/lib/workflow-visualizer.ts` (≤297 lines): Pure `visualize()` and `snapshotToPosition()` — renders one-row ANSI workflow status from XState snapshot. Fully tested (35 tests).
- `src/lib/workflow-runner.ts` (231 lines): `runWorkflowActor()` composition root with `inspect` callback that emits `workflow-viz` engine events on state transitions.
- `src/lib/workflow-actors.ts`: `dispatchTaskCore()` emits `dispatch-start`, `stream-event`, `dispatch-end` engine events via `config.onEvent`.
- `src/lib/ink-renderer.tsx`: `RendererHandle` with `updateWorkflowRow(vizLine)` for inspect-driven visualization, `update()` for sideband stream events, `updateSprintState()` for header, `updateStories()` for story list, and `updateWorkflowState()` for the legacy hand-tracked flow graph.
- `src/commands/run.ts` (610 lines): Contains the `onEvent` handler with extensive hand-tracked state that duplicates what the XState machine already knows.

**What this story removes — the hand-tracked state in `run.ts`:**

The `onEvent` handler currently maintains ~15 mutable variables that shadow machine state:

1. `inEpicPhase` (boolean) — tracks whether engine is past story_flow to epic-level tasks
2. `currentStoryKey` / `currentTaskName` — tracks active story and task
3. `displayEpicId` / `displayStoryKeyForHeader` — display-friendly versions of above
4. `taskStates` (Record) — per-task status map (pending/active/done/failed) — rebuilt on each story
5. `taskMeta` (Record) — per-task metadata (driver, cost, elapsed)
6. `storyFlowTasks` / `epicLoopTasks` (Sets) — task membership lookups built from parsed workflow
7. `epicData` (Record) — epic metadata loaded from sprint state
8. `headerRefresh` (setInterval) — periodic 2-second header refresh
9. Legacy `updateWorkflowState()` calls — pass hand-tracked taskStates/taskMeta to renderer

All of these are **redundant** now that:
- `inspect` callback → `snapshotToPosition()` → `visualize()` → `renderer.updateWorkflowRow()` provides the one-row workflow visualization (story 27-3)
- `dispatch-start` / `dispatch-end` / `story-done` events provide cost, timing, and story progress (story 27-4)

**What the simplified `onEvent` handler should do:**

1. `stream-event` → forward to `renderer.update()` (unchanged)
2. `workflow-viz` → forward to `renderer.updateWorkflowRow()` (unchanged)
3. `dispatch-start` → update header with story key and task name from the event itself (no hand-tracked shadow state)
4. `dispatch-end` → accumulate `totalCostUsd`, update header with new cost
5. `story-done` → increment `storiesDone`, update story list status, update sprint state
6. `dispatch-error` → update story list with failed status, show error message

**What this story does NOT change:**
- The parallel execution path (LanePool) — it has its own event routing
- The pre-flight checks, option parsing, workflow resolution — those are correct
- The renderer interface — no renderer API changes
- The inspect callback wiring in `workflow-runner.ts` — already done in story 27-3

**Key architectural decisions (from architecture-xstate-engine.md):**
- AD5: "`run.ts` role is pre-flight, compile, create actor, wire inspect + sideband, wait. No hand-tracked state — machine snapshot is truth."
- AD5: "Events `story-done`, `gate-pass`, `gate-fail` derived from machine transitions. TUI reacts to machine state, not custom events."

## Acceptance Criteria

1. **Given** a workflow with multiple story-level tasks (e.g., `create-story`, `implement`, `check`, `document`), **When** the user runs `codeharness run` and a task starts, **Then** the TUI header displays the current task name and story key — matching the task name shown in the workflow visualization row. The header and the workflow row agree on which task is active.
   <!-- verification: codeharness run on a multi-task workflow → observe header shows task name (e.g., "implement") that matches the highlighted step in the workflow visualization row -->

2. **Given** a workflow run processing multiple stories, **When** story N completes and story N+1 begins, **Then** the workflow visualization row resets to show the new story's task pipeline from the beginning (first task active), and the header updates to show the new story key. No stale state from story N appears in the visualization.
   <!-- verification: codeharness run on a multi-story sprint → watch the workflow visualization row reset when a new story starts; confirm no leftover "done" markers from the previous story persist in the new story's pipeline -->

3. **Given** a workflow with both story-level and epic-level tasks (e.g., `deploy`, `verify`, `retro` after all stories), **When** the engine transitions from story processing to epic-level tasks, **Then** the workflow visualization row updates to show the epic-level pipeline, and the header reflects the epic-level task name. The transition is visible without manual intervention.
   <!-- verification: codeharness run on a workflow with epic-level steps → observe the workflow visualization row changes from showing story tasks to showing epic tasks (e.g., "deploy → ⟲verify → retro") when all stories are done -->

4. **Given** a workflow run that has completed 3 tasks with known costs, **When** the user observes the TUI header after the 3rd task completes, **Then** the accumulated cost shown in the header equals the sum of all completed task costs. The cost only increases when a task finishes — it does not jump, reset, or show intermediate values.
   <!-- verification: codeharness run → note the cost after each task completes; verify it increases monotonically and the final value equals the sum of individual task costs -->

5. **Given** a workflow run in progress, **When** the user observes the TUI for 10+ seconds without any task starting or completing, **Then** the elapsed time counter in the header continues to update (it does not freeze). The rest of the header remains stable — no flickering, no stale task names appearing.
   <!-- verification: codeharness run → during a long-running task, watch the header; confirm elapsed time ticks up and no other header fields change unexpectedly -->

6. **Given** a workflow run in `--quiet` mode, **When** the run completes, **Then** the final summary line shows the correct total cost, stories processed count, tasks completed count, and elapsed time — identical to what the non-quiet TUI header would have shown at completion.
   <!-- verification: codeharness run --quiet → compare the final summary output (cost, stories, tasks, time) against a non-quiet run of the same workflow; values should match -->

7. **Given** a workflow where a dispatch task fails (e.g., driver error, rate limit), **When** the failure occurs, **Then** the TUI shows an error message identifying the failed task name and story key, the story list marks that story as failed (red), and the workflow visualization row marks that step as failed. No crash, no frozen UI.
   <!-- verification: codeharness run on a workflow where a task is expected to fail → observe error message appears with task name and story key; story list shows failed status; workflow row shows failed step marker -->

8. **Given** `src/commands/run.ts` after this story is implemented, **When** a developer searches the `onEvent` handler for the variables `inEpicPhase`, `taskStates`, `taskMeta`, `storyFlowTasks`, `epicLoopTasks`, or `headerRefresh`, **Then** none of these variables exist in the file. The `onEvent` handler body is reduced to forwarding events and tracking only `totalCostUsd` and `storiesDone`.
   <!-- verification: grep -c "inEpicPhase\|taskStates\|taskMeta\|storyFlowTasks\|epicLoopTasks\|headerRefresh" src/commands/run.ts → returns 0 -->

9. **Given** `src/commands/run.ts` after this story is implemented, **When** a developer counts the lines in the file, **Then** it is shorter than its current 610 lines. Target: ≤400 lines (the `onEvent` handler alone should shrink from ~150 lines to ~50 lines).
   <!-- verification: wc -l src/commands/run.ts → value is ≤ 400 -->

10. **Given** the `renderer.updateWorkflowState()` method (legacy hand-tracked flow graph), **When** the developer searches `run.ts` for calls to `updateWorkflowState`, **Then** zero calls remain in the sequential execution path. All workflow visualization goes through `updateWorkflowRow()` (inspect API path).
    <!-- verification: grep -c "updateWorkflowState" src/commands/run.ts → returns 0 (in sequential path; parallel path may retain it temporarily) -->

11. **Given** the full test suite, **When** `npm test` is executed, **Then** all existing tests pass with zero regressions.
    <!-- verification: npm test exits 0 -->

12. **Given** the build pipeline, **When** `npm run build` is executed, **Then** the build succeeds with exit code 0.
    <!-- verification: npm run build exits 0 -->

## Tasks / Subtasks

### T1: Remove hand-tracked task state variables (AC: #8, #9)

- Delete from the `onEvent` handler and its surrounding scope:
  - `inEpicPhase` boolean
  - `taskStates` record and its initialization loop
  - `taskMeta` record and its initialization loop
  - `storyFlowTasks` and `epicLoopTasks` sets and the loops that build them
  - `displayEpicId` and `displayStoryKeyForHeader` variables
  - `currentStoryKey` and `currentTaskName` variables (replace with event-local reads)
- Remove the `headerRefresh` setInterval and its `clearInterval` call
- Remove the `epicData` record and the `getSprintState()` + loop that populates it

### T2: Remove all `renderer.updateWorkflowState()` calls (AC: #10)

- Delete every call to `renderer.updateWorkflowState(...)` in the sequential execution path
- The workflow visualization is now entirely driven by `renderer.updateWorkflowRow(vizLine)` emitted by the inspect callback in `workflow-runner.ts`
- Confirm the `updateWorkflowState` method still exists on `RendererHandle` (parallel path may use it) — do NOT remove the renderer method itself

### T3: Simplify `dispatch-start` handler (AC: #1, #2, #3)

- Reduce to:
  1. Update header via `renderer.updateSprintState()` using fields from the event: `event.storyKey`, `event.taskName`
  2. Mark story as in-progress in `storyEntries` if not already
  3. Call `renderer.updateStories()` with updated entries
- No task state tracking, no epic phase detection, no sentinel key translation
- The story key and task name come from the event, not from hand-tracked variables

### T4: Simplify `dispatch-end` handler (AC: #4)

- Reduce to:
  1. Accumulate `totalCostUsd += event.costUsd ?? 0`
  2. Update header via `renderer.updateSprintState()` with new cost
- No task state updates, no task meta updates, no flow graph updates

### T5: Simplify `dispatch-error` handler (AC: #7)

- Reduce to:
  1. Show error message via `renderer.addMessage()`
  2. Mark story as failed in `storyEntries`
  3. Call `renderer.updateStories()` with updated entries
- No task state updates, no flow graph updates

### T6: Ensure header elapsed time still updates (AC: #5)

- The `headerRefresh` interval is being removed. Verify that the renderer's own heartbeat (500ms `setInterval` in `ink-renderer.tsx`) continues to drive elapsed time display.
- If the renderer's heartbeat does not update elapsed time (it currently re-renders but doesn't recompute elapsed), add elapsed time computation to `SprintInfo` or the renderer's heartbeat.
- Alternative: keep a minimal elapsed-time-only interval that calls `renderer.updateSprintState()` with only the elapsed field updated. This should be simpler than the current 20-line `headerRefresh` block.

### T7: Verify quiet mode parity (AC: #6)

- Confirm the final summary output (`result.storiesProcessed`, `result.tasksCompleted`, `result.durationMs`, accumulated `totalCostUsd`) is computed from `EngineResult` fields — not from hand-tracked TUI state.
- The final summary already reads from `result` (lines 589-599 in current run.ts). Verify no regression.

### T8: Update or remove affected tests (AC: #11, #12)

- Search test files for references to removed variables (`taskStates`, `taskMeta`, `inEpicPhase`, `storyFlowTasks`, `epicLoopTasks`, `updateWorkflowState`)
- Update or remove tests that assert on the removed hand-tracked state
- Add or update tests that verify the simplified `onEvent` handler:
  1. `dispatch-start` → `renderer.updateSprintState` called with event's storyKey/taskName
  2. `dispatch-end` → `totalCostUsd` accumulated correctly
  3. `story-done` → `storiesDone` incremented, story marked done
  4. `stream-event` → forwarded to `renderer.update()`
  5. `workflow-viz` → forwarded to `renderer.updateWorkflowRow()`

### T9: Verify no regressions (AC: #11, #12)

- Run full test suite: `npx vitest run`
- Run build: `npm run build`
- Run lint: `npx eslint src/commands/run.ts`
- Fix any TypeScript errors, test failures, or lint violations

## Dev Notes

- **Why this matters for 8-hour stability (NFR1):** Hand-tracked state can drift from machine state during long runs. If a task fails and the machine retries via a gate, the hand-tracked `taskStates` may show "failed" while the machine has already moved on. With inspect-driven visualization, the TUI always shows what the machine is actually doing.
- **Sentinel key translation (`__epic_`, `__run__`):** The current `dispatch-start` handler has ~20 lines translating sentinel keys to display names. After this story, these sentinel keys should be translated in `workflow-runner.ts` or `workflow-actors.ts` BEFORE they reach `config.onEvent`. If the engine already emits clean display keys, no translation is needed in run.ts. If not, add a thin translation at the top of `dispatch-start` handling (3-5 lines max, not the current 20-line block).
- **`updateWorkflowState` deprecation path:** This method is the legacy hand-tracked flow graph. After this story, the sequential path uses only `updateWorkflowRow()`. The parallel path (LanePool) may still call `updateWorkflowState()` — leave that for a future cleanup. Do NOT remove the method from `RendererHandle`.
- **Line budget:** `run.ts` is currently 610 lines. The pre-flight section (lines 1-243) is ~240 lines and mostly unchanged. The `onEvent` handler (lines 246-472) is ~225 lines and should shrink to ~50-60 lines. The execution section (lines 474-610) is ~135 lines with minor simplification. Target: ≤400 lines total.
- **File size constraint:** All files must remain ≤ 300 lines (NFR18). `run.ts` is a command file, not a `workflow-*.ts` library file, so the 300-line NFR18 is less strict — but aiming for ≤400 is a reasonable goal.
- **`storiesDone` and `totalCostUsd` remain:** These two variables are the minimal cumulative state that `run.ts` needs. They cannot be derived from a single event — they accumulate across the run. The architecture doc confirms this: "onEvent handler only tracks totalCostUsd, storiesDone, forwards stream events."
- **`storyEntries` array remains:** The story list for the renderer needs to be maintained in run.ts since it's built from sprint state at startup and updated on story-done/dispatch-error events. This is TUI presentation state, not engine state — acceptable to keep.

### Project Structure Notes

- `src/commands/run.ts` — primary file being simplified
- `src/lib/workflow-runner.ts` — emits `workflow-viz` events via inspect callback (no changes expected)
- `src/lib/workflow-actors.ts` — emits `dispatch-start`, `stream-event`, `dispatch-end` (no changes expected)
- `src/lib/ink-renderer.tsx` — renderer with `updateWorkflowRow()` and `updateWorkflowState()` (no interface changes)
- `src/lib/__tests__/` — test files that may reference removed variables

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#AD5] — "run.ts role: pre-flight, compile, create actor, wire inspect + sideband, wait. No hand-tracked state."
- [Source: _bmad-output/planning-artifacts/epics-xstate-engine.md#Epic 6, Story 6.5] — "all deleted, workflow visualization from inspect → visualize() only"
- [Source: _bmad-output/implementation-artifacts/27-3-wire-inspect-api-to-visualizer.md] — Inspect callback wiring that replaces hand-tracked visualization
- [Source: _bmad-output/implementation-artifacts/27-4-sideband-streaming-to-tui.md] — Sideband plumbing that provides dispatch events

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/27-5-simplify-run-ts-remove-hand-tracked-state-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via CLI execution
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/27-5-simplify-run-ts-remove-hand-tracked-state.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for simplified onEvent handler
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

</story-spec>
