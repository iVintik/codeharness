# Exec Plan: 27-4 Wire sideband streaming to TUI renderer

Story: `_bmad-output/implementation-artifacts/27-4-sideband-streaming-to-tui.md`

## What this story did

All sideband wiring was already present from prior implementation work. This story was a
verification and test-writing exercise. No new runtime code was added.

## Verification findings

### T1: Sideband wiring in compiled dispatch actors

`src/lib/workflow-actors.ts` lines 156–196: `dispatchTaskCore()` emits three engine events
via `config.onEvent`:
- Line 157: `dispatch-start` — emitted before the driver loop, carries `taskName`, `storyKey`,
  `driverName`, `model`
- Line 171: `stream-event` — emitted for each `StreamEvent` yielded by the driver's async
  iterable, carries `streamEvent`, `taskName`, `storyKey`, `driverName`
- Line 196: `dispatch-end` — emitted after the driver loop completes, carries `elapsedMs`,
  `costUsd`

All compiled machines (story, epic, gate) thread `EngineConfig` (which contains `onEvent`) to
dispatch actors — verified by tracing `config` through `workflow-story-machine.ts`,
`workflow-epic-machine.ts`, `workflow-gate-machine.ts`.

### T2: run.ts onEvent routing

`src/commands/run.ts` lines 295–358: the `onEvent` handler routes:
- `stream-event` → `renderer.update(event.streamEvent, event.driverName)` (line 297)
- `workflow-viz` → `renderer.updateWorkflowRow(event.vizString)` (line 300)
- `dispatch-start` → `renderer.updateSprintState()` with task name and story key (line 312)
- `dispatch-end` → `totalCostUsd` accumulation + `renderer.updateSprintState()` (lines 323–348)

### T3: Renderer channels are independent

`src/lib/ink-renderer.tsx`:
- `updateWorkflowRow()` (line 609) sets `state.workflowVizLine` only
- `update()` sets activity state (`completedTools`, `lastThought`, `activeTool`)
- These are separate fields in `RendererState` — no shared mutable state

### T4: Quiet mode

`src/lib/ink-renderer.tsx` line 99: `startRenderer({ quiet: true })` returns `noopHandle`
(lines 74–90) which has `updateWorkflowRow: () => {}` and all other methods as no-ops.

## Tests added

### `src/lib/__tests__/workflow-actors.test.ts` — describe block starting line 1348

5 tests in "sideband streaming to TUI (story 27-4)":
- T6-1: stream-event emitted for all StreamEvent types (text, tool-start, tool-complete, result)
- T6-2: dispatch-start includes storyKey and model
- T6-3: dispatch-end ordering and costUsd from result event
- T6-4: dispatch-end NOT emitted on mid-stream throw
- T6-5: no crash when config.onEvent is undefined

### `src/lib/__tests__/ink-renderer.test.tsx` — describe block starting line 1103

3 tests in "sideband streaming to TUI — renderer (story 27-4)":
- T6-5: quiet mode noopHandle has updateWorkflowRow as no-op
- T6-6: updateWorkflowRow and update() operate on independent state fields
- T6-7: update() after updateWorkflowRow does not clear workflowVizLine

## Test run result

`npm run test:unit`: 198 test files, 5278 tests — all passing.
`npm run build`: ESM and DTS build succeed.

## Files modified

- `src/lib/__tests__/workflow-actors.test.ts` — added 5 T6 tests
- `src/lib/__tests__/ink-renderer.test.tsx` — added 3 T6 tests
- `verification/27-4-sideband-streaming-to-tui-proof.md` — proof document
- `docs/exec-plans/active/27-4-sideband-streaming-to-tui.md` — this file
