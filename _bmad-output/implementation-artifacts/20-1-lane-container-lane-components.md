# Story 20.1: Lane Container & Lane Components

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see multiple epic lanes in the TUI during parallel execution,
so that I can track progress across all active worktrees.

## Acceptance Criteria

1. **Given** a new `src/lib/ink-lane.tsx`, **when** imported, **then** it exports a `Lane` React component that accepts `LaneProps` (epicId, epicTitle, currentStory, phase, acProgress, storyProgressEntries, driver, cost, elapsedTime) and renders a single lane's status display. <!-- verification: test-provable -->

2. **Given** a new `src/lib/ink-lane-container.tsx`, **when** imported, **then** it exports a `LaneContainer` React component that accepts `LaneContainerProps` (lanes array, terminalWidth) and renders all lanes according to layout rules. <!-- verification: test-provable -->

3. **Given** a terminal width >= 120 columns and 2 active lanes, **when** `LaneContainer` renders, **then** the two lanes display side-by-side (each lane occupying roughly half the terminal width). <!-- verification: test-provable -->

4. **Given** a terminal width between 80 and 119 columns and 2 active lanes, **when** `LaneContainer` renders, **then** the two lanes display stacked vertically in compact mode. <!-- verification: test-provable -->

5. **Given** a terminal width < 80 columns, **when** `LaneContainer` renders, **then** only the single most recently active lane renders in full, and others collapse to one-line summaries. <!-- verification: test-provable -->

6. **Given** each `Lane` component, **when** rendered, **then** it shows: epic title, current story key + phase, a story progress bar (done/in-progress/pending symbols per story), and driver name + cost/time. <!-- verification: test-provable -->

7. **Given** 3 or more active lanes, **when** `LaneContainer` renders at >= 120 cols, **then** lanes 1 and 2 render in full side-by-side, and lanes 3+ collapse to one-line summaries in the format: `Lane N: Epic Title │ story ◆ phase │ $cost / time`. <!-- verification: test-provable -->

8. **Given** `max_parallel: 1` (single lane mode), **when** the TUI renders, **then** the display is visually identical to the current single-lane TUI — no `LaneContainer` wrapper visible, no layout changes. <!-- verification: test-provable -->

9. **Given** a `Lane` component receives a `CollapsedLanes` subcomponent, **when** rendered, **then** `CollapsedLanes` accepts an array of collapsed lane data and renders each as a single line with lane index, epic title, current story, phase, cost, and time. <!-- verification: test-provable -->

10. **Given** the `ink-app.tsx` root component, **when** updated to integrate `LaneContainer`, **then** it conditionally renders `LaneContainer` when `laneCount > 1` or renders the existing single-lane layout when `laneCount <= 1`, preserving backward compatibility. <!-- verification: test-provable -->

11. **Given** the `Header` component in `ink-components.tsx`, **when** multiple lanes are active, **then** the header displays lane count and total cost across all lanes (e.g., `codeharness run | 2 lanes | 47m elapsed | $18.60 spent`). <!-- verification: test-provable -->

12. **Given** the `LaneContainer` component, **when** the terminal is resized, **then** the layout mode (side-by-side, stacked, single) re-evaluates based on the new terminal width. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/ink-lane.tsx` (AC: #1, #6)
  - [x] Define `LaneProps` interface with all required fields
  - [x] Define `StoryProgressEntry` type: `{ key: string; status: 'done' | 'in-progress' | 'pending' }`
  - [x] Implement `Lane` component rendering epic title, current story + phase, story progress bar, driver + cost/time
  - [x] Use `✓` for done stories, `◆` for in-progress, `○` for pending in the progress bar
  - [x] Format cost as `$X.XX` and elapsed as `Xm` or `Xh Xm`

- [x] Task 2: Create `src/lib/ink-lane-container.tsx` (AC: #2, #3, #4, #5, #7, #9, #12)
  - [x] Define `LaneContainerProps` with `lanes: LaneData[]`, `terminalWidth: number`
  - [x] Define `LaneData` interface capturing all per-lane state for rendering
  - [x] Implement layout mode calculation: `side-by-side` (>=120), `stacked` (80-119), `single` (<80)
  - [x] Render top 2 lanes in full, lanes 3+ via `CollapsedLanes`
  - [x] Implement `CollapsedLanes` sub-component: single-line summaries for overflow lanes
  - [x] Listen for terminal resize via `process.stdout.columns` to re-evaluate layout

- [x] Task 3: Integrate into `ink-app.tsx` (AC: #8, #10)
  - [x] Add conditional rendering: if `state.lanes && state.lanes.length > 1`, render `LaneContainer`; else render existing single-lane layout
  - [x] Ensure zero visual changes when `laneCount <= 1`
  - [x] Import `LaneContainer` from `./ink-lane-container.js`

- [x] Task 4: Extend Header in `ink-components.tsx` (AC: #11)
  - [x] Add optional `laneCount` and `totalCost` fields to `SprintInfo`
  - [x] Conditionally render lane count in header when `laneCount > 1`
  - [x] Format: `codeharness run | {N} lanes | {elapsed} | ${cost}`

- [x] Task 5: Write unit tests for `src/lib/__tests__/ink-lane.test.tsx` (AC: #1, #6)
  - [x] Test: `Lane` renders epic title
  - [x] Test: `Lane` renders current story and phase
  - [x] Test: `Lane` renders story progress bar with correct symbols
  - [x] Test: `Lane` renders driver name, cost, and elapsed time
  - [x] Test: `Lane` exports correct types

- [x] Task 6: Write unit tests for `src/lib/__tests__/ink-lane-container.test.tsx` (AC: #2-#5, #7, #8, #9, #12)
  - [x] Test: side-by-side layout when terminalWidth >= 120 and 2 lanes
  - [x] Test: stacked layout when terminalWidth 80-119 and 2 lanes
  - [x] Test: single-lane layout when terminalWidth < 80
  - [x] Test: lanes 3+ collapse to one-line summaries
  - [x] Test: single lane mode renders without container wrapper
  - [x] Test: collapsed lane format matches `Lane N: Epic Title │ story ◆ phase │ $cost / time`
  - [x] Test: layout mode re-evaluates when terminalWidth changes

- [x] Task 7: Write unit tests for Header extension (AC: #11)
  - [x] Test: Header shows lane count when `laneCount > 1`
  - [x] Test: Header omits lane count when `laneCount` is 1 or undefined
  - [x] Test: Header shows total cost across lanes

## Dev Notes

### Architecture Constraints

- **Architecture Decision 8** (architecture-parallel-execution.md): The Ink render tree gains a `LaneContainer` component that manages lane layout. Each lane is a `Lane` component wrapping existing `WorkflowGraph` + `StoryProgress`. The renderer receives events from all active lanes and routes them by lane ID.
- **TUI Boundary** (architecture-parallel-execution.md): TUI receives `LaneEvent` objects from the lane pool. Does NOT manage lanes or worktrees. Layout logic is purely presentational — responds to terminal width.
- **Single Ink instance**: All lanes feed into the same Ink render loop. No multiple Ink instances — that would break terminal rendering.
- **NFR2**: Multi-lane TUI must render at 15 FPS with up to 4 concurrent lanes. Keep component rendering lightweight.

### What This Story Actually Does

This story creates the **multi-lane TUI layout layer** — two new Ink components (`Lane`, `LaneContainer`) that present multiple concurrent epic executions in the terminal. It:

1. **Renders** multiple lanes side-by-side, stacked, or single depending on terminal width
2. **Collapses** overflow lanes (3+) to one-line summaries
3. **Preserves** single-lane backward compatibility (zero visual change at `max_parallel: 1`)
4. **Extends** the Header to show lane count and total cost
5. **Integrates** into the existing `ink-app.tsx` render tree conditionally

This is a pure presentational story — no lane management, no worktree operations, no event routing (that's 20-3).

### Key Files to Create

| File | Why |
|------|-----|
| `src/lib/ink-lane.tsx` | New — single lane display component |
| `src/lib/ink-lane-container.tsx` | New — multi-lane layout manager with CollapsedLanes |
| `src/lib/__tests__/ink-lane.test.tsx` | Tests for Lane component |
| `src/lib/__tests__/ink-lane-container.test.tsx` | Tests for LaneContainer and CollapsedLanes |

### Key Files to Modify

| File | Why |
|------|-----|
| `src/lib/ink-app.tsx` | Integrate LaneContainer into the render tree |
| `src/lib/ink-components.tsx` | Extend SprintInfo/Header with lane count |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/ink-workflow.tsx` | `WorkflowGraph` component — embedded inside each Lane |
| `src/lib/ink-activity-components.tsx` | Activity display components — remain below LaneContainer |
| `src/lib/ink-renderer.tsx` | `RendererHandle`, `RendererState` — drives re-renders |
| `src/lib/lane-pool.ts` | `LaneEvent`, `Lane`, `LaneStatus` — event types consumed by TUI |
| `src/lib/ink-components.tsx` | `SprintInfo`, `RendererState`, `StoryStatusEntry` — existing types |

### Component Hierarchy (Target State)

```
<App>
  <Header />                       ← MODIFY: add lane count
  <LaneContainer>                  ← NEW: layout manager
    <Lane epic={10}>               ← NEW: per-epic view
      <WorkflowGraph />            ← EXISTING: reused inside Lane
      <StoryProgress />            ← Inline in Lane
    </Lane>
    <Lane epic={14}>
      <WorkflowGraph />
      <StoryProgress />
    </Lane>
    <CollapsedLanes />             ← NEW: one-line summaries for 3+
  </LaneContainer>
  <Separator />
  <CompletedTools />               ← EXISTING: activity section unchanged
  <ActiveTool />
  <LastThought />
  <RetryNotice />
</App>
```

### Existing Patterns to Follow

- **Component file naming**: `ink-{name}.tsx` — pure presentational components.
- **Import style**: `import React from 'react'` + `import { Text, Box } from 'ink'` — standard Ink pattern throughout codebase.
- **ESM imports**: Use `.js` extensions in TypeScript ESM imports (`'./ink-components.js'`).
- **Type exports**: Types go at top of component file. Example: `ink-components.tsx` exports all types, then components.
- **No hooks**: Existing components are stateless (state comes from parent via props). The `Lane` and `LaneContainer` should follow this pattern — pure function components, no `useState` or `useEffect`.
- **Symbols**: Done `✓`, active `◆`, pending `○` — already used in `StoryBreakdown` and `WorkflowGraph`.
- **Color scheme**: Use `ink` `<Text color="...">` — green for done, yellow for active, dim for pending. Matches existing `ink-components.tsx`.
- **Separator**: Reuse `<Separator />` from `ink-components.tsx` between sections.

### Layout Rules (from UX Spec)

| Terminal Width | Layout Mode | Behavior |
|----------------|-------------|----------|
| >= 120 cols | side-by-side | Two lanes in columns, each ~half width |
| 80-119 cols | stacked | Two lanes vertically, compact |
| < 80 cols | single | One full lane, rest collapsed |

**Lane display format (full):**
```
 Lane 1: Epic 10 — Driver Interface
 10-3 ◆ dev (AC 4/9)
 ✓ 10-1  ✓ 10-2  ◆ 10-3  ○ 10-4  ○ 10-5
 claude-code | $4.20 / 18m
```

**Collapsed lane format (one-line):**
```
 Lane 3: Epic 11 — Workflow Schema │ 11-1 ◆ dev │ $0.40 / 2m
```

### Previous Story (19-2) Intelligence

- Story 19-2 created `epic-flow-executor.ts` (~230 lines) — wiring layer for epic completion. Consumed existing modules.
- Testing pattern: vitest, `vi.mock`, colocated tests in `src/lib/__tests__/`.
- ESM module pattern: `.js` extensions in imports, TypeScript ESM.
- Build: `npm run build`, Test: `npm test`.
- All tests passed after 19-2 with zero regressions.
- State builder helpers exist at `src/lib/__tests__/fixtures/state-builders.ts`.
- Ink component testing: use `ink-testing-library` render function. Check existing `src/lib/__tests__/ink-*.test.tsx` patterns.

### Git Intelligence

Recent commits:
- `a5d5ceb feat: story 19-2-epic-flow-execution` — epic flow execution module
- `2a6f637 feat: story 19-1-epic-completion-detection` — epic completion detection
- `6c245cb feat: story 18-3-cross-worktree-test-validation` — cross-worktree test validation
- `5d78b76 feat: story 18-2-merge-agent-conflict-resolution` — merge agent
- `39582ec feat: story 18-1-merge-serialization-execution` — worktree merge with mutex

All epic 17-19 modules are complete. This story starts Epic 20 (Multi-Lane TUI).

### Edge Cases

- **Zero lanes**: Should not render `LaneContainer` at all — fall back to existing layout.
- **One lane**: Render existing single-lane TUI identically (backward compat).
- **Terminal width exactly 120**: Side-by-side mode (inclusive boundary).
- **Terminal width exactly 80**: Stacked mode (inclusive boundary).
- **Terminal width < 40**: Degenerate case — render single lane, truncate long strings.
- **Lane with very long epic title**: Truncate to fit available width with `…`.
- **Story progress bar with 10+ stories**: May need to wrap or abbreviate for narrow terminals.
- **Cost = 0 or null**: Display `$0.00` or `--` respectively.
- **Elapsed time > 1 hour**: Format as `1h 12m` not `72m`.

### Boundary: What This Story Does NOT Include

- **Lane event routing** — That's story 20-3.
- **Summary bar** — That's story 20-2.
- **Merge status display** — That's story 20-2.
- **Activity display lane filtering** — That's story 20-3.
- **Ctrl+L keybinding** — That's story 20-3.
- **Wiring LaneEvent from lane pool to renderer** — That's story 20-3.
- **RendererState changes for multi-lane** — Minimal changes here (just adding lane data to state). Full event routing in 20-3.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/`
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`, Test: `npm test`
- New `.tsx` files for React/Ink components
- Keep each new component file focused: `ink-lane.tsx` (~80-120 lines), `ink-lane-container.tsx` (~120-180 lines)

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 20.1]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 8 -- Multi-Lane TUI Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Multi-Lane Live Mode]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Layout Rules]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Component Architecture]
- [Source: src/lib/ink-app.tsx]
- [Source: src/lib/ink-components.tsx#SprintInfo]
- [Source: src/lib/ink-renderer.tsx#RendererHandle]
- [Source: src/lib/ink-workflow.tsx#WorkflowGraph]
- [Source: src/lib/lane-pool.ts#LaneEvent]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/20-1-lane-container-lane-components-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/20-1-lane-container-lane-components.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- All 7 tasks implemented and tested
- Fixed pre-existing test bug in ink-lane-container.test.tsx (wrong assertion for single-mode tie-break)
- Created new ink-header.test.tsx for Header extension tests (Task 7)
- 187 test files, 5062 tests pass — zero regressions
- Build succeeds cleanly

### File List

- `src/lib/ink-lane.tsx` — Lane component (pre-existing, verified)
- `src/lib/ink-lane-container.tsx` — LaneContainer + CollapsedLanes (pre-existing, verified)
- `src/lib/ink-app.tsx` — Integrated LaneContainer conditional rendering (pre-existing, verified)
- `src/lib/ink-components.tsx` — Extended SprintInfo/Header with laneCount/laneTotalCost (pre-existing, verified)
- `src/lib/__tests__/ink-lane.test.tsx` — Lane unit tests (pre-existing, verified)
- `src/lib/__tests__/ink-lane-container.test.tsx` — LaneContainer unit tests (pre-existing, fixed 1 assertion)
- `src/lib/__tests__/ink-header.test.tsx` — Header extension unit tests (NEW)
