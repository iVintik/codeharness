# Story 20.3: Lane Event Routing & Activity Display

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the activity section to show the most recently active lane's tool calls,
so that I can see what's happening without noise from all lanes.

## Acceptance Criteria

1. **Given** multiple lanes producing stream events concurrently, **when** a `StreamEvent` arrives from a lane, **then** `ink-renderer.tsx` routes the event to the correct per-lane state (tools, thoughts, retries) based on a `laneId` parameter on the `update()` method. <!-- verification: test-provable -->

2. **Given** the renderer is receiving events from multiple lanes, **when** the activity section renders, **then** it shows events (completed tools, active tool, last thought, retry notice) from the most recently active lane only — not a merged stream from all lanes. <!-- verification: test-provable -->

3. **Given** the activity section is showing lane 1's events, **when** lane 2 produces a new stream event, **then** the activity section automatically switches to show lane 2's events (most-recently-active heuristic). <!-- verification: test-provable -->

4. **Given** a multi-lane TUI, **when** `Ctrl+L` is pressed, **then** the displayed lane in the activity section cycles to the next active lane (wrapping around), overriding the most-recently-active heuristic until a new event arrives from a different lane. <!-- verification: runtime-provable -->

5. **Given** the activity section is showing a specific lane's events, **when** rendered, **then** a lane indicator `[Lane {N} ▸]` is displayed in the activity header showing which lane's activity is currently visible. <!-- verification: test-provable -->

6. **Given** `max_parallel: 1` (single lane mode), **when** the TUI renders, **then** no lane indicator is displayed and the activity section behaves identically to the current single-lane TUI — no event routing logic engaged. <!-- verification: test-provable -->

7. **Given** a lane event of type `lane-started`, **when** the renderer processes it, **then** the lane is added to the renderer's lane state map and becomes available for activity display and routing. <!-- verification: test-provable -->

8. **Given** a lane event of type `lane-completed`, **when** the renderer processes it, **then** the lane's final state is preserved for display but the lane is removed from the active rotation for `Ctrl+L` cycling. <!-- verification: test-provable -->

9. **Given** a lane event of type `lane-failed`, **when** the renderer processes it, **then** the lane is marked as failed in the TUI (lane status shows error state), the activity section does not freeze, and the TUI continues rendering other active lanes (NFR6 — crash isolation). <!-- verification: test-provable -->

10. **Given** a `LaneEvent` with type `lane-completed` and an `EngineResult`, **when** processed by the renderer, **then** the summary bar's `doneStories` and `pendingEpics` lists are updated to reflect the completed epic. <!-- verification: test-provable -->

11. **Given** merge events (from the merge serialization pipeline), **when** the renderer processes them, **then** the `mergeState` field on `RendererState` is updated and `MergeStatus` re-renders with the current merge progress (clean, resolved, escalated, in-progress). <!-- verification: test-provable -->

12. **Given** the TUI is rendering at `maxFps: 15` with 4 concurrent lanes each producing stream events, **when** measured, **then** the render loop does not drop below 15 FPS and event routing adds less than 5ms overhead per event (NFR2). <!-- verification: runtime-provable -->

## Tasks / Subtasks

- [x] Task 1: Extend `RendererHandle` and `RendererState` for multi-lane event routing (AC: #1, #6, #7, #8, #9)
  - [x] Add `laneId?: string` parameter to `RendererHandle.update()` signature
  - [x] Add `activeLaneId: string | null` field to `RendererState` (tracks which lane's activity is displayed)
  - [x] Add `laneStates: Map<string, LaneActivityState>` to renderer controller (per-lane tools, thoughts, retries)
  - [x] Define `LaneActivityState` interface: `{ completedTools: CompletedToolEntry[], activeTool: { name: string } | null, activeToolArgs: string, lastThought: string | null, retryInfo: RetryInfo | null, activeDriverName: string | null, status: 'active' | 'completed' | 'failed' }`
  - [x] Route `update()` events to per-lane state when `laneId` is provided
  - [x] Copy active lane's state to top-level `RendererState` fields for display
  - [x] When `laneId` is undefined (single-lane mode), behave exactly as today — no routing

- [x] Task 2: Add `processLaneEvent()` method to `RendererHandle` (AC: #7, #8, #9, #10)
  - [x] Define method: `processLaneEvent(event: LaneEvent): void`
  - [x] Handle `lane-started`: create entry in `laneStates` map, update `activeLaneId` if first lane
  - [x] Handle `lane-completed`: mark lane as completed, update `summaryBar` props (move epic stories to `doneStories`, remove from `pendingEpics`)
  - [x] Handle `lane-failed`: mark lane as failed, do NOT remove from display, do NOT freeze TUI
  - [x] Handle `epic-queued`: update `summaryBar.pendingEpics` list

- [x] Task 3: Add `updateMergeState()` method to `RendererHandle` (AC: #11)
  - [x] Define method: `updateMergeState(mergeState: MergeState | null): void`
  - [x] Set `state.mergeState` and trigger rerender
  - [x] Also update `summaryBar.mergingEpic` to reflect current merge status

- [x] Task 4: Implement most-recently-active lane tracking (AC: #2, #3)
  - [x] On each `update()` call with a `laneId`, record `lastActivityTime` for that lane
  - [x] When `laneId` differs from current `activeLaneId`, switch displayed lane unless user has pinned via `Ctrl+L`
  - [x] Copy the new active lane's state to the top-level display fields

- [x] Task 5: Implement `Ctrl+L` cycling (AC: #4)
  - [x] Add `useInput` hook in `ink-app.tsx` to listen for `Ctrl+L`
  - [x] On `Ctrl+L`, cycle `activeLaneId` to next active lane (skip completed/failed lanes)
  - [x] Set a `pinnedLane` flag that suppresses auto-switch until a new lane event arrives from a different lane
  - [x] Wrap around from last lane to first

- [x] Task 6: Add lane indicator to activity section (AC: #5, #6)
  - [x] Create `LaneActivityHeader` component showing `[Lane {N} ▸]` prefix
  - [x] Render above `CompletedTools` when `laneCount > 1`
  - [x] Do not render when `laneCount <= 1` (backward compat)

- [x] Task 7: Wire lane events from `lane-pool.ts` through `run.ts` to renderer (AC: #7, #8, #9)
  - [x] In `run.ts` (or parallel execution orchestrator), subscribe to `LaneEvent` emissions from the lane pool
  - [x] Call `renderer.processLaneEvent(event)` for each `LaneEvent`
  - [x] Pass `laneId` (epic ID) to `renderer.update(event, driverName, laneId)` for stream events

- [x] Task 8: Wire merge events to renderer (AC: #11)
  - [x] In the merge execution pipeline (where `worktree-manager.merge()` and `merge-agent` are called), emit `MergeState` updates
  - [x] Call `renderer.updateMergeState(mergeState)` at each stage: in-progress, clean, resolved, escalated

- [x] Task 9: Write unit tests for event routing in `src/lib/__tests__/ink-renderer.test.ts` (AC: #1, #2, #3, #6, #7, #8, #9, #10, #11)
  - [x] Test: events with laneId are routed to per-lane state
  - [x] Test: activity section shows most recently active lane's events
  - [x] Test: auto-switch to new lane when event arrives from different lane
  - [x] Test: single-lane mode (no laneId) behaves identically to pre-20-3
  - [x] Test: processLaneEvent lane-started creates lane state
  - [x] Test: processLaneEvent lane-completed marks lane done, updates summaryBar
  - [x] Test: processLaneEvent lane-failed marks lane failed, does not freeze
  - [x] Test: updateMergeState updates mergeState on RendererState
  - [x] Test: no lane indicator rendered when laneCount <= 1

- [x] Task 10: Write integration tests for `ink-app.tsx` with lane indicator (AC: #5)
  - [x] Test: `[Lane N ▸]` indicator renders in activity section when laneCount > 1
  - [x] Test: lane indicator not rendered when laneCount <= 1

- [x] Task 11: Performance validation (AC: #12)
  - [x] Test: routing 4 lanes of events does not cause measurable render delay
  - [x] Test: event routing overhead is within acceptable bounds (< 5ms per event)

## Dev Notes

### Architecture Constraints

- **Architecture Decision 8** (architecture-parallel-execution.md): The renderer receives events from all active lanes and routes them by lane ID. Only the most recently active lane shows in the activity section.
- **Single Ink instance**: All components feed into the same Ink render loop. Event routing happens in the controller (ink-renderer.tsx), not in components.
- **NFR2**: Multi-lane TUI must render at 15 FPS with up to 4 concurrent lanes. Event routing must not introduce perceptible overhead.
- **NFR6**: Crash in one lane must not freeze the TUI. A failed lane's event stream ends; the renderer marks it as failed and continues rendering other lanes.
- **NFR10**: `maxParallel: 1` must produce behavior identical to current single-lane TUI.

### What This Story Actually Does

This story wires live data into the multi-lane TUI components created in 20-1 and 20-2:

1. **Event routing** — StreamEvents are tagged with `laneId` and routed to per-lane state in the renderer.
2. **Activity display filtering** — The activity section (CompletedTools, ActiveTool, LastThought, RetryNotice) shows only the most recently active lane's events.
3. **Lane lifecycle** — LaneEvents (started, completed, failed) are processed to manage lane state and update the summary bar.
4. **Merge status wiring** — MergeState updates flow from the merge pipeline to the renderer.
5. **Ctrl+L cycling** — User can manually cycle which lane's activity is displayed.
6. **Lane indicator** — `[Lane N ▸]` shows which lane is currently displayed in the activity section.

### Key Files to Modify

| File | Why |
|------|-----|
| `src/lib/ink-renderer.tsx` | Add per-lane state, event routing, processLaneEvent, updateMergeState |
| `src/lib/ink-app.tsx` | Add `useInput` for Ctrl+L, render lane indicator |
| `src/lib/ink-components.tsx` | Extend `RendererState` with `activeLaneId` |
| `src/commands/run.ts` | Wire lane events and stream events with laneId to renderer |

### Key Files to Create

| File | Why |
|------|-----|
| `src/lib/__tests__/ink-renderer-lanes.test.ts` | Unit tests for multi-lane event routing |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/ink-summary-bar.tsx` | `SummaryBar`, `SummaryBarProps` — receives data from routing |
| `src/lib/ink-merge-status.tsx` | `MergeStatus`, `MergeState` — receives data from routing |
| `src/lib/ink-lane-container.tsx` | `LaneContainer`, `LaneData` — lane layout |
| `src/lib/ink-lane.tsx` | `Lane`, `StoryProgressEntry` — per-lane display |
| `src/lib/ink-activity-components.tsx` | `CompletedTools`, `ActiveTool`, `LastThought`, `RetryNotice` — activity section |
| `src/lib/lane-pool.ts` | `LaneEvent`, `LaneStatus`, `EpicResult` — lane lifecycle events |
| `src/lib/worktree-manager.ts` | `MergeResult` — merge outcome types |
| `src/lib/merge-agent.ts` | `MergeConflictContext` — conflict resolution types |
| `src/lib/agents/stream-parser.ts` | `StreamEvent` — event types that get routed per lane |

### Component Hierarchy (Target State After 20-3)

```
<App>
  <Header />                       ← Extended (20-1) with lane count
  <LaneContainer>                  ← Created (20-1)
    <Lane epic={10}> ... </Lane>
    <Lane epic={14}> ... </Lane>
    <CollapsedLanes />
  </LaneContainer>
  <Separator />
  <SummaryBar />                   ← Created (20-2), wired by 20-3
  <Separator />
  <MergeStatus />                  ← Created (20-2), wired by 20-3
  <Separator />
  <LaneActivityHeader />           ← NEW (20-3): [Lane N ▸]
  <CompletedTools />               ← Existing: now lane-filtered
  <ActiveTool />                   ← Existing: now lane-filtered
  <LastThought />                  ← Existing: now lane-filtered
  <RetryNotice />                  ← Existing: now lane-filtered
</App>
```

### Event Flow Architecture

```
lane-pool.ts                    stream-parser.ts
  │ LaneEvent                     │ StreamEvent + laneId
  │                               │
  ▼                               ▼
run.ts ─── renderer.processLaneEvent(e) ───► per-lane state map
       ─── renderer.update(e, driver, laneId) ──► per-lane activity state
       ─── renderer.updateMergeState(ms) ──────► RendererState.mergeState
                                                   │
                                                   ▼
                                          activeLaneId selects
                                          which lane's activity
                                          to copy to top-level
                                          RendererState fields
                                                   │
                                                   ▼
                                            <App> re-renders
```

### Existing Patterns to Follow

- **Component file naming**: `ink-{name}.tsx` — pure presentational components.
- **Import style**: `import React from 'react'` + `import { Text, Box } from 'ink'` — standard Ink pattern.
- **ESM imports**: Use `.js` extensions in TypeScript ESM imports.
- **useInput hook**: Ink provides `useInput(handler)` for keyboard input handling.
- **Symbols**: Done `✓`, active `◆`, pending `○`, spinner `◌`, lane indicator `▸`.
- **Color scheme**: Green for success/done, yellow for warnings/in-progress, red for failure, dim for inactive/pending.
- **Status prefixes**: `[OK]`, `[FAIL]`, `[WARN]`, `[INFO]` — established pattern.
- **Ink testing**: Use `ink-testing-library` render function. See `src/lib/__tests__/ink-*.test.tsx`.
- **Renderer testing**: Call `startRenderer()` with `_forceTTY: true`, call methods, check `_getState()`.

### Edge Cases

- **No laneId on update()**: Single-lane mode — route to top-level state directly (backward compat).
- **All lanes completed/failed**: Activity section shows last active lane's final state. `Ctrl+L` has no lanes to cycle to.
- **Lane event for unknown laneId**: Create new lane state on-the-fly (defensive).
- **Ctrl+L with only 1 active lane**: No-op (nothing to cycle to).
- **Rapid lane switching**: Auto-switch heuristic should not cause flicker — only switch on first event from a new lane, not on every event.
- **Merge events during single-lane**: Should still update `mergeState` but `MergeStatus` won't render (guarded by `laneCount > 1` in ink-app.tsx).
- **Lane pool emits events after renderer cleanup**: `processLaneEvent` should check `cleaned` flag.

### Boundary: What This Story Does NOT Include

- **LaneContainer creation** — Already done in 20-1.
- **SummaryBar / MergeStatus components** — Already done in 20-2.
- **Ctrl+M merge detail toggle** — Out of scope for MVP; could be a follow-up story.
- **Merge execution logic** — Already exists in `worktree-manager.ts` (18-1) and `merge-agent.ts` (18-2).
- **Lane pool scheduling** — Already exists in `lane-pool.ts` (17-2).
- **Epic flow execution** — Already exists from 19-2.

### Previous Stories Intelligence

- Story 20-1 created `ink-lane.tsx` and `ink-lane-container.tsx`. Extended `Header` with `laneCount` and `laneTotalCost`. Added `lanes?: LaneData[]` to `RendererState`.
- Story 20-2 created `ink-summary-bar.tsx` and `ink-merge-status.tsx`. Added `summaryBar` and `mergeState` to `RendererState`. Integrated into `ink-app.tsx` conditional on `laneCount > 1`.
- `ink-renderer.tsx` currently has no multi-lane awareness — it manages a single flat state. This story adds the routing layer.
- `RendererHandle.update()` currently takes `(event, driverName?)`. This story adds an optional `laneId` third parameter.
- Testing pattern: vitest, `vi.mock`, `ink-testing-library`, colocated in `src/lib/__tests__/`.
- Build: `npm run build`, Test: `npm test`.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/`
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`, Test: `npm test`
- Keep files under 300 lines (NFR from architecture)

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 20.3]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 8 -- Multi-Lane TUI Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Ctrl+L -- Cycle Active Lane Display]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Component Architecture]
- [Source: src/lib/ink-renderer.tsx]
- [Source: src/lib/ink-app.tsx]
- [Source: src/lib/ink-components.tsx#RendererState]
- [Source: src/lib/lane-pool.ts#LaneEvent]
- [Source: src/lib/ink-activity-components.tsx]
