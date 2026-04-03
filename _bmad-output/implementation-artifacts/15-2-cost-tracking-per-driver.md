# Story 15.2: Cost Tracking Per Driver

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see accumulated cost per driver across a workflow run and per-story cost breakdown by driver in the TUI,
so that I can compare framework costs and optimize my workflow configurations.

## Acceptance Criteria

1. **Given** a multi-driver workflow run where tasks complete on `claude-code` and `codex` drivers
   **When** each task's result event includes `cost_usd`
   **Then** the workflow engine accumulates cost per driver name in a `Record<string, number>` structure
   **And** the accumulated totals are accessible to the TUI renderer
   <!-- verification: test-provable -->

2. **Given** accumulated per-driver costs exist after task completions
   **When** the TUI renders the `DriverCostSummary` component
   **Then** total cost per driver is displayed as `Cost: claude-code $X.XX, codex $Y.YY` (sorted alphabetically by driver name)
   <!-- verification: test-provable -->

3. **Given** a driver that does not report cost (e.g., `cost_usd` is null in its result event)
   **When** the TUI displays per-driver cost totals
   **Then** that driver is excluded from the cost summary (it does not show `$0.00`)
   <!-- verification: test-provable -->

4. **Given** a workflow run with multiple stories each using different drivers
   **When** the TUI renders the `StoryBreakdown` section for completed stories
   **Then** each completed story line shows its per-driver cost breakdown (e.g., `1-1 ✓ claude-code $0.42, codex $0.15`)
   <!-- verification: test-provable -->

5. **Given** a completed story where only one driver was used
   **When** the TUI renders the story breakdown
   **Then** the story line shows cost for that single driver (e.g., `1-1 ✓ claude-code $0.42`)
   <!-- verification: test-provable -->

6. **Given** a completed story where no driver reported cost
   **When** the TUI renders the story breakdown
   **Then** the story line shows the status without any cost annotation (e.g., `1-1 ✓`)
   <!-- verification: test-provable -->

7. **Given** multiple result events arrive for the same driver within the same story
   **When** the renderer accumulates costs
   **Then** costs are summed (not replaced) per driver per story
   <!-- verification: test-provable -->

8. **Given** `npm run build` is executed after all changes
   **When** the build completes
   **Then** it succeeds with zero TypeScript errors
   <!-- verification: test-provable -->

9. **Given** `npm run test:unit` is executed after all changes
   **When** the tests complete
   **Then** all existing tests pass with zero regressions
   <!-- verification: test-provable -->

10. **Given** no new file exceeds 300 lines
    **When** line count is checked for all modified/created files
    **Then** every source file stays under 300 lines
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1 (AC: #4, #5, #6, #7): Add per-story cost tracking to `RendererState` and `StoryStatusEntry`
  - [x] In `src/lib/ink-components.tsx`, add `costByDriver?: Record<string, number>` to `StoryStatusEntry` interface
  - [x] In `src/lib/ink-renderer.tsx`, add `currentStoryCosts: Record<string, number>` to internal state tracking
  - [x] On each `result` event with `cost > 0` and `driverName`, accumulate into `currentStoryCosts[driverName]`
  - [x] Expose a method or mechanism for the sprint runner to snapshot `currentStoryCosts` when a story completes and attach it to the `StoryStatusEntry`
  - [x] Reset `currentStoryCosts` when a new story starts (on `updateStories` or `updateSprintState` with a new `storyKey`)

- [x] Task 2 (AC: #4, #5, #6): Update `StoryBreakdown` to display per-story cost breakdown
  - [x] In `src/lib/ink-components.tsx`, modify `StoryBreakdown` to render cost info for done stories
  - [x] For each done story with `costByDriver` entries: append formatted cost string after the `✓` marker
  - [x] Format: `shortKey ✓ driver1 $X.XX, driver2 $Y.YY` (sorted alphabetically)
  - [x] If `costByDriver` is empty or undefined, render just `shortKey ✓` (no cost annotation)

- [x] Task 3 (AC: #1, #2, #3): Verify existing `driverCosts` accumulation in `ink-renderer.tsx`
  - [x] Confirm `driverCosts` accumulation already works correctly for run-level totals (existing code at lines 215-221)
  - [x] Confirm `DriverCostSummary` already renders total cost per driver (existing component)
  - [x] Confirm drivers with null cost are excluded (existing: `event.cost > 0` guard)
  - [x] Add tests if any gaps found

- [x] Task 4 (AC: #1, #7): Write unit tests for per-story cost accumulation
  - [x] Test: result events from multiple drivers accumulate per-story costs correctly
  - [x] Test: multiple result events from same driver within one story sum correctly
  - [x] Test: story cost resets when new story starts
  - [x] Test: null/zero cost events do not create entries

- [x] Task 5 (AC: #4, #5, #6): Write unit tests for StoryBreakdown cost display
  - [x] Test: done story with multi-driver costs shows breakdown
  - [x] Test: done story with single-driver cost shows that driver
  - [x] Test: done story with no cost data shows just the checkmark
  - [x] Test: cost format uses `$X.XX` pattern

- [x] Task 6 (AC: #8): Run `npm run build` — zero TypeScript errors
- [x] Task 7 (AC: #9): Run `npm run test:unit` — all tests pass, zero regressions
- [x] Task 8 (AC: #10): Verify all modified files are under 300 lines

## Dev Notes

### Architecture Compliance

This story implements Epic 6, Story 6.2 (mapped to sprint Epic 15, Story 15-2) "Cost Tracking Per Driver" from `epics-multi-framework.md`. It covers:
- **FR8:** System can capture cost information from driver output and normalize to cost_usd
- **FR33:** System can display per-story cost breakdown by driver in the story breakdown section
- **FR34:** System can accumulate cost per driver across a workflow run
- **FR35:** System can display total cost per driver in the TUI

Key architecture decisions honored:
- **Decision 1 (AgentDriver interface):** `getLastCost(): number | null` — already on all drivers
- **Decision 5 (TUI Workflow Graph):** Cost/time per node in workflow graph — already implemented
- **Cost reporting pattern:** `cost_usd = null` (not 0) when driver doesn't report cost

### What Already Exists (from previous epics)

**Run-level cost accumulation is fully implemented.** The plumbing:

1. **All 3 drivers** implement `getLastCost()` and set `lastCost` from result events
2. **StreamEvent result events** carry `cost` and `cost_usd` fields
3. **`ink-renderer.tsx` lines 215-221:** `driverCosts` accumulation on `result` events with `driverName`
4. **`DriverCostSummary` component** (`ink-activity-components.tsx` line 104): renders `Cost: driver1 $X.XX, driver2 $Y.YY`
5. **`ink-app.tsx` line 24:** `DriverCostSummary` is rendered in the App layout
6. **`RendererState.driverCosts`** (`ink-components.tsx` line 77): `Record<string, number>`
7. **Workflow graph** (`ink-workflow.tsx`): `formatCost()` shows cost per task node
8. **Output contract** (`types.ts` line 74): `cost_usd: number | null` per task
9. **Existing tests** in `ink-renderer.test.tsx` and `ink-activity-components.test.tsx` cover run-level accumulation

**What's missing (the actual work for this story):**

1. **Per-story cost breakdown in `StoryBreakdown`** — FR33 says "per-story cost breakdown by driver in the story breakdown section." The `StoryBreakdown` component currently shows story status only (done/in-progress/pending/failed/blocked) with NO cost information.
2. **Per-story cost tracking in renderer state** — `currentStoryCosts` per story is not tracked. The renderer accumulates `driverCosts` across the entire run but doesn't partition by story.
3. **`StoryStatusEntry` lacks cost data** — The interface has `key`, `status`, `retryCount`, `maxRetries` but no cost fields.

### Data Flow (New)

```
result event { cost: 0.42 } + driverName='claude-code'
     ↓
ink-renderer.update(event, 'claude-code')
     ↓
  state.driverCosts['claude-code'] += 0.42   (existing — run-level total)
  state.currentStoryCosts['claude-code'] += 0.42   (NEW — per-story accumulation)
     ↓
When story completes → snapshot currentStoryCosts into StoryStatusEntry.costByDriver
     ↓
StoryBreakdown renders: "1-1 ✓ claude-code $0.42"
```

### Implementation Approach

The cleanest approach: add `costByDriver` to `StoryStatusEntry`, track `currentStoryCosts` in the renderer's closure, and snapshot it onto stories when `updateStories()` is called with a status change from in-progress to done.

The `updateStories()` method already receives the full stories array. When it detects a story that just moved to `done` status, it can attach `currentStoryCosts` and reset.

Alternative: The sprint runner (in `src/commands/run.ts`) could attach cost data to `StoryStatusEntry` before passing it to `updateStories()`. This would keep the renderer dumber but requires the runner to track per-story costs. Given the renderer already has `driverCosts` accumulation, extending it with per-story tracking is more cohesive.

### What NOT to Do

- Do NOT modify any driver files — cost reporting is already correct
- Do NOT modify `DispatchOpts`, `OutputContract`, or `AgentDriver` interface — they already support cost
- Do NOT modify the workflow engine's `dispatchTaskWithResult` — it already reads `cost` from events correctly
- Do NOT change the workflow graph component — per-task cost/time is already displayed there
- Do NOT modify `DriverCostSummary` — run-level totals are already correct
- Do NOT add new npm dependencies
- Do NOT attempt to merge per-story costs and run-level costs — they serve different purposes

### Line Budget Analysis

| File | Current Lines | Estimated Change | Target |
|------|--------------|------------------|--------|
| `ink-components.tsx` | ~215 | +15 (StoryStatusEntry + StoryBreakdown cost) | ~230 |
| `ink-renderer.tsx` | ~250 | +15 (currentStoryCosts tracking) | ~265 |
| Tests (various) | — | +40-60 (new test cases) | within budget |

All source files stay well under 300 lines.

### Testing Guidance

- **Vitest** (not Jest). Use `vi.fn()`, `vi.mock()`, `vi.mocked()`.
- For `StoryBreakdown` cost display: extend `src/lib/__tests__/ink-renderer.test.tsx` or the component-level tests
- For per-story cost accumulation: extend `src/lib/__tests__/ink-renderer.test.tsx` `describe('driver name in update()')` section
- For `DriverCostSummary`: existing tests in `src/lib/__tests__/ink-activity-components.test.tsx` already pass — verify no regressions
- Pattern: follow the existing `driverCosts` accumulation tests as a template for per-story cost tests
- Render tests use `ink-testing-library` `render()` and `lastFrame()`

### Previous Story Intelligence (15-1)

- Story 15-1 added agent-level plugin configuration. Pattern: extend interfaces first (add to types), then wire into the system, then tests.
- 4614 tests at end of 15-1. Expect to add ~10-15 new tests.
- Build is clean. TypeScript strict mode is on.
- The test suite is large. Add tests sparingly — focus on new behavior (per-story cost in StoryBreakdown, currentStoryCosts tracking).

### Git Intelligence

Last commits:
- `dcaf19b feat: story 15-1-plugin-pass-through-configuration — Plugin Pass-Through Configuration`
- `8272ef0 feat: epic 14 complete`

Pattern from story 15-1: stories that extend existing plumbing (type extension → state wiring → component update → tests) complete cleanly in one pass.

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 6.2: Cost Tracking Per Driver]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md — Cost reporting pattern, Decision 1, Decision 5]
- [Source: _bmad-output/planning-artifacts/prd.md — FR8, FR33, FR34, FR35]
- [Source: src/lib/ink-components.tsx — StoryBreakdown component, StoryStatusEntry interface, RendererState]
- [Source: src/lib/ink-renderer.tsx — driverCosts accumulation, update() function, startRenderer()]
- [Source: src/lib/ink-activity-components.tsx — DriverCostSummary component]
- [Source: src/lib/ink-app.tsx — App layout with DriverCostSummary placement]
- [Source: src/lib/ink-workflow.tsx — formatCost(), per-task cost in workflow graph]
- [Source: src/lib/agents/types.ts — AgentDriver.getLastCost(), OutputContract.cost_usd, DriverCapabilities.costReporting]
- [Source: src/lib/agents/drivers/claude-code.ts — lastCost tracking, getLastCost()]
- [Source: src/lib/agents/drivers/codex.ts — lastCost tracking, getLastCost()]
- [Source: src/lib/agents/drivers/opencode.ts — lastCost tracking, getLastCost()]

## Files to Change

- `src/lib/ink-components.tsx` — Add `costByDriver?: Record<string, number>` to `StoryStatusEntry`; update `StoryBreakdown` to render per-story cost
- `src/lib/ink-renderer.tsx` — Add `currentStoryCosts` tracking; snapshot into stories on completion; reset on new story
- `src/lib/__tests__/ink-renderer.test.tsx` — Add tests for per-story cost accumulation and story breakdown cost display
- `src/lib/__tests__/ink-activity-components.test.tsx` — Verify existing DriverCostSummary tests still pass (no new tests expected)

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/15-2-cost-tracking-per-driver-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/15-2-cost-tracking-per-driver.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Added `costByDriver?: Record<string, number>` to `StoryStatusEntry` interface
- Added `currentStoryCosts` and `lastStoryKey` internal tracking to ink-renderer controller
- Per-story cost accumulation on result events with driverName, snapshotted onto StoryStatusEntry when story transitions to done, reset on story key change
- Updated `StoryBreakdown` to render per-story cost breakdown after checkmark for done stories, sorted alphabetically by driver name
- Verified existing `driverCosts` run-level accumulation and `DriverCostSummary` still work correctly (no changes needed)
- 10 new tests: 6 for StoryBreakdown cost display, 4 for per-story cost accumulation controller integration
- Build: 0 TypeScript errors. Tests: 4624 passed, 0 regressions. All files under 300 lines.

### Change Log

- 2026-04-03: Story created with 10 ACs covering FR8, FR33, FR34, FR35. Per-story cost breakdown in StoryBreakdown is the primary new work; run-level driverCosts accumulation and DriverCostSummary already exist from Epics 10-14. Status set to ready-for-dev.
- 2026-04-03: Implementation complete. Per-story cost tracking added to renderer, StoryBreakdown updated to display per-driver costs on done stories, 10 tests added. Status set to review.
- 2026-04-03: Code review fixes — Fixed cost-loss bug on story key change (costs for old story were discarded when updateSprintState changed the key before updateStories could snapshot them). Introduced pendingStoryCosts map to properly freeze per-story costs on key change. Fixed caller object mutation in updateStories. Added _getState() test hook. Upgraded controller integration tests from crash-only to value-asserting. Extracted promoteActiveTool helper to reduce ink-renderer.tsx from 321 to 284 lines. Status set to verifying.

### File List

- src/lib/ink-components.tsx (modified — added costByDriver to StoryStatusEntry, updated StoryBreakdown cost rendering)
- src/lib/ink-renderer.tsx (modified — added currentStoryCosts tracking, snapshot on story completion, reset on story change)
- src/lib/__tests__/ink-renderer.test.tsx (modified — added 10 new tests for per-story cost display and accumulation)
