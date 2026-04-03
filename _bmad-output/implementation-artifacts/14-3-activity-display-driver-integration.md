# Story 14.3: Activity Display Driver Integration

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see which driver is active in the tool activity section and see per-story cost breakdown by driver,
so that I know which framework is executing the current tool call and how much each driver costs.

## Acceptance Criteria

1. **Given** stream events arriving from a driver during task execution
   **When** a `tool-start` event is processed by the renderer
   **Then** the `ActiveTool` component displays the active driver name (e.g., `claude-code`, `codex`, `opencode`) alongside the tool name, in dimmed text
   <!-- verification: test-provable -->

2. **Given** stream events arriving from a driver during task execution
   **When** a `tool-complete` event is processed by the renderer
   **Then** the `CompletedTool` component displays the driver name that executed the tool, in dimmed text after the tool args
   <!-- verification: test-provable -->

3. **Given** the `RendererHandle` interface
   **When** inspected
   **Then** `update(event)` accepts a second optional parameter `driverName?: string` that identifies which driver emitted the event
   <!-- verification: test-provable -->

4. **Given** a multi-driver workflow where tasks use different drivers
   **When** the TUI activity section renders
   **Then** each tool call shows the correct driver name for the driver that dispatched it (not a global default)
   <!-- verification: test-provable -->

5. **Given** the `RendererState` interface
   **When** inspected
   **Then** it includes an `activeDriverName: string | null` field to track which driver is currently active in the activity section
   <!-- verification: test-provable -->

6. **Given** the `CompletedToolEntry` interface
   **When** inspected
   **Then** it includes a `driver?: string` field to record which driver executed the tool
   <!-- verification: test-provable -->

7. **Given** a per-story cost result event with `cost_usd` from a specific driver
   **When** the renderer accumulates cost data
   **Then** `RendererState` tracks per-driver cost accumulation in a `driverCosts: Record<string, number>` field
   <!-- verification: test-provable -->

8. **Given** the `StoryBreakdown` component (or a new `DriverCostSummary` component)
   **When** `driverCosts` has entries for multiple drivers
   **Then** a cost-by-driver summary line is rendered (e.g., `Cost: claude-code $1.23, codex $0.45`) in dimmed text
   <!-- verification: test-provable -->

9. **Given** a driver failure (error event) during task execution
   **When** the TUI renders
   **Then** the activity section continues to render normally — no freeze, no crash, the failed tool shows as completed with the driver name
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed after all changes
    **When** the build completes
    **Then** it succeeds with zero TypeScript errors
    <!-- verification: test-provable -->

11. **Given** `npm run test:unit` is executed after all changes
    **When** the tests complete
    **Then** all existing tests pass with zero regressions
    <!-- verification: test-provable -->

12. **Given** no new file exceeds 300 lines
    **When** line count is checked for all modified/created files
    **Then** every file stays under 300 lines (NFR5/NFR9)
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1 (AC: #5, #6): Extend type interfaces for driver tracking
  - [x] In `src/lib/ink-components.tsx`, add `activeDriverName: string | null` to `RendererState`
  - [x] In `src/lib/ink-components.tsx`, add `driver?: string` to `CompletedToolEntry`
  - [x] In `src/lib/ink-components.tsx`, add `driverCosts: Record<string, number>` to `RendererState`
  - [x] Update initial state in `src/lib/ink-renderer.tsx` with `activeDriverName: null` and `driverCosts: {}`

- [x] Task 2 (AC: #3): Extend `RendererHandle.update()` with driver name parameter
  - [x] In `src/lib/ink-renderer.tsx`, change `update(event: StreamEvent)` to `update(event: StreamEvent, driverName?: string)`
  - [x] Update `noopHandle` to accept the new parameter
  - [x] Update `RendererHandle` interface type to match

- [x] Task 3 (AC: #1, #2, #4, #9): Wire driver name into renderer state transitions
  - [x] In the `update()` function, on `tool-start`: set `state.activeDriverName = driverName ?? null`
  - [x] On `tool-start` when promoting the previous active tool to completed: include `driver: state.activeDriverName ?? undefined` in the `CompletedToolEntry`
  - [x] On `tool-complete`: include `driver: state.activeDriverName ?? undefined` in the `CompletedToolEntry`, then clear `state.activeDriverName` to null
  - [x] On `result` event with `cost_usd`: if `driverName` is provided, accumulate `state.driverCosts[driverName] += cost_usd`

- [x] Task 4 (AC: #1): Update `ActiveTool` component to show driver name
  - [x] In `src/lib/ink-activity-components.tsx`, extend `ActiveTool` props to accept `driverName?: string`
  - [x] Render driver name in dimmed text after the tool name (e.g., `⚡ [Bash] ` becomes `⚡ [Bash] (claude-code) `)
  - [x] When `driverName` is null/undefined, render as before (backward compatible)

- [x] Task 5 (AC: #2): Update `CompletedTool` component to show driver name
  - [x] In `src/lib/ink-activity-components.tsx`, extend `CompletedTool` to read `entry.driver`
  - [x] Render driver name in dimmed text after the args summary (e.g., `✓ [Edit] src/foo.ts (codex)`)
  - [x] When `entry.driver` is undefined, render as before (backward compatible)

- [x] Task 6 (AC: #8): Add driver cost summary rendering
  - [x] In `src/lib/ink-activity-components.tsx`, create a `DriverCostSummary` component that accepts `driverCosts: Record<string, number>`
  - [x] Renders nothing when `driverCosts` is empty
  - [x] Renders a single line `Cost: claude-code $X.XX, codex $Y.YY` (dimmed) when entries exist, sorted alphabetically by driver name
  - [x] Export from `ink-activity-components.tsx` and re-export from `ink-components.tsx`

- [x] Task 7 (AC: #8): Wire `DriverCostSummary` into the App layout
  - [x] In `src/lib/ink-app.tsx`, import `DriverCostSummary` and place it after `StoryBreakdown` (before the separator), passing `state.driverCosts`

- [x] Task 8 (AC: #1-#9): Write unit tests
  - [x] Add tests in `src/lib/__tests__/ink-activity-components.test.tsx` (NEW file):
    - Test: `ActiveTool` renders driver name when provided
    - Test: `ActiveTool` renders without driver name (backward compat)
    - Test: `CompletedTool` renders driver name from entry
    - Test: `CompletedTool` renders without driver name (backward compat)
    - Test: `DriverCostSummary` renders nothing when empty
    - Test: `DriverCostSummary` renders multi-driver costs sorted alphabetically
    - Test: `DriverCostSummary` formats cost as `$X.XX`
  - [x] Add tests in `src/lib/__tests__/ink-renderer.test.tsx` (EXTEND existing):
    - Test: `update(event, 'codex')` sets `activeDriverName` to `'codex'` on `tool-start`
    - Test: `tool-complete` records driver in `CompletedToolEntry`
    - Test: `result` event with `cost_usd` and `driverName` accumulates in `driverCosts`
    - Test: `update(event)` without driver name leaves `activeDriverName` null (backward compat)
    - Test: Driver failure event still renders normally (no crash)

- [x] Task 9 (AC: #10): Run `npm run build` — zero TypeScript errors
- [x] Task 10 (AC: #11): Run `npm run test:unit` — all tests pass, zero regressions
- [x] Task 11 (AC: #12): Verify all modified files are under 300 lines

## Dev Notes

### Architecture Compliance

This story implements Epic 5, Story 5.3 (mapped to sprint Epic 14, Story 14-3) "Activity Display Driver Integration" from `epics-multi-framework.md`. It covers:
- **FR31:** System can display stream events from any driver in the activity section (tool calls, thoughts, retries) — already works since all drivers emit `StreamEvent`; this story adds driver attribution.
- **FR32:** System can display the active driver name alongside tool activity — the core deliverable.
- **FR33:** System can display per-story cost breakdown by driver — `DriverCostSummary` component.
- **NFR17:** TUI must remain responsive during driver failures — AC #9 tests resilience.

Key architecture decisions honored:
- **Decision 5 (TUI Workflow Graph Component):** Extends the activity display area under the workflow graph.
- Architecture maps FR31-FR33 to `ink-renderer.tsx` and `ink-activity-components.tsx`.

### What Already Exists (from Stories 14-1 and 14-2)

- `ActiveTool` component in `src/lib/ink-activity-components.tsx` — renders `⚡ [ToolName] <spinner>`. Currently NO driver name.
- `CompletedTool` / `CompletedTools` in `src/lib/ink-activity-components.tsx` — renders `✓ [ToolName] args`. Currently NO driver name.
- `CompletedToolEntry` in `src/lib/ink-components.tsx` — `{ name: string; args: string }`. No `driver` field.
- `RendererState` in `src/lib/ink-components.tsx` — has `activeTool`, `completedTools`, etc. No `activeDriverName`, no `driverCosts`.
- `update(event: StreamEvent)` in `src/lib/ink-renderer.tsx` — handles `tool-start`, `tool-input`, `tool-complete`, `text`, `retry`, `result`. No driver tracking.
- `ResultEvent` in `src/lib/agents/stream-parser.ts` — already has `cost_usd?: number | null` field from Epic 13.
- `TaskNodeMeta` in `src/lib/ink-components.tsx` — has `driver?: string`, `costUsd`, `elapsedMs` (from story 14-2). This is per-task-node (graph), not per-tool-call (activity).
- `noopHandle` in `src/lib/ink-renderer.tsx` — must be updated with new `update` signature.
- Tests in `src/lib/__tests__/ink-renderer.test.tsx` — 881 lines. Must extend carefully (300-line budget).

### Data Flow

The `update()` method is called from `createLineProcessor()` in `src/lib/run-helpers.ts`, which is called from the workflow engine's dispatch loop. Currently the `onEvent` callback only passes the event. To wire `driverName`, the calling code in `workflow-engine.ts` would need modification — **but this story only builds the TUI-layer API**. The `driverName` parameter is optional so it's backward compatible. Actual engine wiring is NOT part of this story.

For testing purposes, the `update()` method accepts `driverName` as a second parameter. In production, this will be wired when the engine passes driver context to the renderer callback.

### Line Budget Analysis

| File | Current Lines | Estimated Change | Target |
|------|--------------|------------------|--------|
| `ink-activity-components.tsx` | 100 | +50 (driver props, DriverCostSummary) | ~150 |
| `ink-components.tsx` | 213 | +5 (3 fields) | ~218 |
| `ink-renderer.tsx` | 257 | +15 (driver state, accumulation) | ~272 |
| `ink-app.tsx` | 33 | +3 (DriverCostSummary import + use) | ~36 |
| `ink-activity-components.test.tsx` | 0 (NEW) | ~180 | ~180 |
| `ink-renderer.test.tsx` | 881 | +30 (new tests) | ~911 (test files excluded from 300-line limit) |

All source files stay well under 300 lines. Test files are excluded from NFR5 per project convention.

### What NOT to Do

- Do NOT modify `workflow-engine.ts` — engine-to-renderer wiring is a future integration concern. This story makes `update()` accept an optional driver name.
- Do NOT modify `stream-parser.ts` — the `StreamEvent` types are stable.
- Do NOT modify `workflow-parser.ts` or `workflow-state.ts`.
- Do NOT modify `ink-workflow.tsx` — the workflow graph component already handles driver labels via `taskMeta` (story 14-2). This story is about the activity section below the graph.
- Do NOT add new npm dependencies. Use existing Ink primitives (`Text`, `Box`).
- Do NOT break backward compatibility — all new parameters are optional, all new fields have defaults.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- Imports: `import { describe, it, expect, vi } from 'vitest'`
- For activity component tests: use `ink-testing-library` `render()` + `lastFrame()` string assertions, same pattern as `ink-workflow.test.tsx`.
- For renderer tests: extend existing `src/lib/__tests__/ink-renderer.test.tsx`. The existing `makeState` helper already has `taskMeta: {}` from story 14-2 — add `activeDriverName: null` and `driverCosts: {}` to it.
- For `DriverCostSummary`: test empty state → null output, single driver, multi-driver sorted, formatting.

### Previous Story Intelligence (14-2)

- Story 14-2 added `TaskNodeMeta` for driver labels in the workflow graph (per-node metadata).
- This story adds driver tracking for the activity display (per-tool-call metadata). They are complementary.
- Pattern from 14-2: extend interfaces first, then components, then tests. Keep backward compatibility.
- The `ink-renderer.test.tsx` file is already large (881 lines). Add tests sparingly — focus on the new behavior, don't duplicate existing coverage.
- Activity components have NO tests yet — `src/lib/__tests__/ink-activity-components.test.tsx` does not exist. Create it.

### Git Intelligence

Last commit: `fcadbf7 feat: story 14-2-task-status-driver-labels — Task Status & Driver Labels`

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 5.3: Activity Display Driver Integration]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — FR31-FR33 mapped to ink-renderer.tsx, ink-activity-components.tsx]
- [Source: _bmad-output/planning-artifacts/prd.md — FR31, FR32, FR33, NFR17]
- [Source: src/lib/ink-activity-components.tsx — ActiveTool, CompletedTool, CompletedTools components]
- [Source: src/lib/ink-components.tsx — CompletedToolEntry, RendererState interfaces]
- [Source: src/lib/ink-renderer.tsx — RendererHandle, update(), startRenderer()]
- [Source: src/lib/agents/stream-parser.ts — ResultEvent.cost_usd field]

## Files to Change

- `src/lib/ink-components.tsx` — Add `driver?: string` to `CompletedToolEntry`, add `activeDriverName: string | null` and `driverCosts: Record<string, number>` to `RendererState`.
- `src/lib/ink-renderer.tsx` — Extend `update()` with `driverName` param, update `RendererHandle` type, update `noopHandle`, wire driver state in event handlers.
- `src/lib/ink-activity-components.tsx` — Extend `ActiveTool` and `CompletedTool` with driver name display, add `DriverCostSummary` component.
- `src/lib/ink-app.tsx` — Import and render `DriverCostSummary` from state.
- `src/lib/__tests__/ink-activity-components.test.tsx` — NEW: unit tests for activity components with driver names and cost summary.
- `src/lib/__tests__/ink-renderer.test.tsx` — EXTEND: add tests for driver name in `update()`, driver cost accumulation, `activeDriverName` state.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/14-3-activity-display-driver-integration.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/14-3-activity-display-driver-integration.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

N/A

### Completion Notes List

- All 11 tasks completed. 15 new tests added (10 activity component, 5 renderer driver integration).
- Build passes with zero TypeScript errors. Full test suite: 4591 tests, 170 files, zero regressions.
- All source files under 300 lines (ink-components: 216, ink-renderer: 270, ink-activity-components: 110, ink-app: 34).
- Added defensive null check to DriverCostSummary for runtime safety.

### Change Log

- 2026-04-03: Story created with 12 ACs (3 from epic FR31-FR33, 9 derived from architecture, testing, and code analysis). Full implementation guidance with line budgets, data flow analysis, and anti-patterns. Status set to ready-for-dev.
- 2026-04-03: Implementation complete. All tasks done, all tests passing. Status set to review.
- 2026-04-03: Adversarial code review. Found 2 HIGH, 3 MEDIUM, 2 LOW issues. Fixed H1 (renderer driver tests had zero assertions — rewrote with App component rendering and real expect() checks), H2/M3 (added App-level integration tests for DriverCostSummary and driver name rendering), M2 (added test for long args with driver suffix). 7 new tests added (4598 total). Build clean, coverage 96.86%, all files above 80% floor. Status set to verifying.

### File List

- `src/lib/ink-components.tsx` — Added `driver?` to CompletedToolEntry, `activeDriverName` and `driverCosts` to RendererState, re-exported DriverCostSummary
- `src/lib/ink-renderer.tsx` — Extended `update()` with `driverName` param, updated noopHandle, wired driver state in event handlers, added per-driver cost accumulation
- `src/lib/ink-activity-components.tsx` — Extended ActiveTool/CompletedTool with driver display, added DriverCostSummary component
- `src/lib/ink-app.tsx` — Imported DriverCostSummary, wired into layout, passed driverName to ActiveTool
- `src/lib/__tests__/ink-activity-components.test.tsx` — NEW: 10 tests for activity components with driver names and cost summary
- `src/lib/__tests__/ink-renderer.test.tsx` — Extended: 5 new tests for driver name in update(), driver cost accumulation, backward compat, failure resilience
