# Story 20.2: Summary Bar & Merge Status

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to see done/merging/pending counts and merge progress in the TUI,
so that I know the sprint's overall state at a glance.

## Acceptance Criteria

1. **Given** a new `src/lib/ink-summary-bar.tsx`, **when** imported, **then** it exports a `SummaryBar` React component that accepts `SummaryBarProps` (doneStories: string[], mergingEpic: MergingEpicInfo | null, pendingEpics: string[]) and renders a one-line summary in the format: `Done: {stories} │ Merging: {epic} → main ◌ │ Pending: {epics}`. <!-- verification: test-provable -->

2. **Given** no epic is currently merging (`mergingEpic` is null), **when** `SummaryBar` renders, **then** the Merging section displays `Merging: —`. <!-- verification: test-provable -->

3. **Given** a `mergingEpic` with status `'in-progress'`, **when** `SummaryBar` renders, **then** the Merging section displays the epic name with a spinner indicator: `Merging: epic-{N} → main ◌`. <!-- verification: test-provable -->

4. **Given** a `mergingEpic` with status `'resolving'` and a `conflictCount`, **when** `SummaryBar` renders, **then** the Merging section displays: `Merging: epic-{N} → main (resolving {X} conflict(s)) ◌` in yellow. <!-- verification: test-provable -->

5. **Given** a new `src/lib/ink-merge-status.tsx`, **when** imported, **then** it exports a `MergeStatus` React component that accepts `MergeStatusProps` (mergeState: MergeState | null) and renders detailed merge progress below the summary bar. <!-- verification: test-provable -->

6. **Given** a `mergeState` with outcome `'clean'`, **when** `MergeStatus` renders, **then** it displays a green line: `[OK] Merge epic-{N} → main: clean (0 conflicts)`. <!-- verification: test-provable -->

7. **Given** a `mergeState` with outcome `'resolved'` and resolved conflict details, **when** `MergeStatus` renders, **then** it displays: `[OK] Merge epic-{N} → main: {X} conflict(s) auto-resolved` followed by indented file paths. <!-- verification: test-provable -->

8. **Given** a `mergeState` with outcome `'escalated'`, **when** `MergeStatus` renders, **then** it displays a red `[FAIL]` line with the reason and preserved worktree path. <!-- verification: test-provable -->

9. **Given** a `mergeState` with `testResults` (passed count, coverage), **when** `MergeStatus` renders, **then** it displays post-merge test results: `[OK] Tests: {passed}/{total} passed ({duration}s)` in green, or `[FAIL] Tests: ...` in red if any failed. <!-- verification: test-provable -->

10. **Given** a lane completes all its stories, **when** `SummaryBar` renders, **then** a lane completion line is displayed: `[OK] Lane {N}: Epic {X} complete ({stories} stories, ${cost}, {time})`. <!-- verification: test-provable -->

11. **Given** the `ink-app.tsx` root component, **when** updated to integrate `SummaryBar` and `MergeStatus`, **then** they render between the lane section and the activity section (after `LaneContainer` / single-lane layout, before `CompletedTools`), separated by `<Separator />` lines. <!-- verification: test-provable -->

12. **Given** `max_parallel: 1` (single lane mode), **when** the TUI renders, **then** neither `SummaryBar` nor `MergeStatus` render — they are only visible during multi-lane execution. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/ink-summary-bar.tsx` (AC: #1, #2, #3, #4, #10)
  - [x] Define `MergingEpicInfo` interface: `{ epicId: string; status: 'in-progress' | 'resolving' | 'complete'; conflictCount?: number }`
  - [x] Define `SummaryBarProps` interface with doneStories, mergingEpic, pendingEpics, completedLanes
  - [x] Define `CompletedLaneInfo` interface: `{ laneIndex: number; epicId: string; storyCount: number; cost: number; elapsed: string }`
  - [x] Implement `SummaryBar` component: done section (green ✓ per story), merging section (yellow when resolving, dim when idle), pending section (dim list)
  - [x] Implement lane completion line rendering: `[OK] Lane N: Epic X complete (...)` in green
  - [x] Format done stories as `{key} ✓` with green color
  - [x] Handle empty states: no done stories → `Done: —`, no pending → `Pending: —`

- [x] Task 2: Create `src/lib/ink-merge-status.tsx` (AC: #5, #6, #7, #8, #9)
  - [x] Define `MergeState` interface: `{ epicId: string; outcome: 'clean' | 'resolved' | 'escalated' | 'in-progress'; conflicts?: string[]; conflictCount?: number; testResults?: { passed: number; failed: number; total: number; durationSecs: number; coverage: number | null }; worktreePath?: string; reason?: string }`
  - [x] Implement `MergeStatus` component: dispatch on outcome for rendering
  - [x] Clean merge: green `[OK]` line
  - [x] Resolved merge: green `[OK]` line + indented resolved file paths
  - [x] Escalated merge: red `[FAIL]` line with reason + preserved worktree path
  - [x] Test results: green `[OK]` or red `[FAIL]` depending on failure count
  - [x] Render nothing when `mergeState` is null (no active/recent merge)

- [x] Task 3: Integrate into `ink-app.tsx` (AC: #11, #12)
  - [x] Import `SummaryBar` from `./ink-summary-bar.js` and `MergeStatus` from `./ink-merge-status.js`
  - [x] Add conditional rendering: only show when `laneCount > 1`
  - [x] Place between lane section and activity section with `<Separator />` delimiters
  - [x] Add `summaryBar` and `mergeState` fields to `RendererState` interface in `ink-components.tsx`

- [x] Task 4: Extend `RendererState` in `ink-components.tsx` (AC: #11)
  - [x] Add optional `summaryBar` field with type from `ink-summary-bar.tsx`
  - [x] Add optional `mergeState` field with type from `ink-merge-status.tsx`

- [x] Task 5: Write unit tests for `src/lib/__tests__/ink-summary-bar.test.tsx` (AC: #1, #2, #3, #4, #10)
  - [x] Test: SummaryBar renders done stories with ✓ symbols
  - [x] Test: SummaryBar renders `Merging: —` when no merge active
  - [x] Test: SummaryBar renders merging epic with spinner when in-progress
  - [x] Test: SummaryBar renders resolving merge in yellow with conflict count
  - [x] Test: SummaryBar renders pending epics list
  - [x] Test: SummaryBar renders lane completion line
  - [x] Test: SummaryBar handles empty done/pending lists with `—` fallback
  - [x] Test: SummaryBar exports correct types

- [x] Task 6: Write unit tests for `src/lib/__tests__/ink-merge-status.test.tsx` (AC: #5, #6, #7, #8, #9)
  - [x] Test: MergeStatus renders nothing when mergeState is null
  - [x] Test: MergeStatus renders clean merge in green
  - [x] Test: MergeStatus renders resolved merge with file paths
  - [x] Test: MergeStatus renders escalated merge in red with worktree path
  - [x] Test: MergeStatus renders passing test results in green
  - [x] Test: MergeStatus renders failing test results in red
  - [x] Test: MergeStatus exports correct types

- [x] Task 7: Write integration tests for `ink-app.tsx` changes (AC: #11, #12)
  - [x] Test: SummaryBar and MergeStatus render when laneCount > 1
  - [x] Test: SummaryBar and MergeStatus do NOT render when laneCount <= 1

## Dev Notes

### Architecture Constraints

- **Architecture Decision 8** (architecture-parallel-execution.md): The Ink render tree hierarchy places `SummaryBar` and `MergeStatus` between the lane section and the activity section. They are first-class display elements, not sub-components of Lane or LaneContainer.
- **TUI Boundary**: SummaryBar and MergeStatus are purely presentational. They receive data via props — no direct access to lane pool, worktree manager, or merge agent. Event routing (20-3) will wire real data into these props.
- **Single Ink instance**: All components feed into the same Ink render loop.
- **NFR2**: Multi-lane TUI must render at 15 FPS with up to 4 concurrent lanes.

### What This Story Actually Does

This story creates two new Ink components for the **sprint-level status layer**:

1. `SummaryBar` — one-line overview: done stories, merge status, pending epics
2. `MergeStatus` — detailed merge progress: clean/resolved/escalated outcomes, test results

It also:
3. Extends `RendererState` to carry summary and merge data
4. Integrates both components into `ink-app.tsx` (conditional on multi-lane mode)
5. Ensures single-lane mode is unaffected

This is a pure presentational story. No event routing, no merge execution, no lane management.

### Key Files to Create

| File | Why |
|------|-----|
| `src/lib/ink-summary-bar.tsx` | New — summary bar component (done/merging/pending) |
| `src/lib/ink-merge-status.tsx` | New — merge status detail component |
| `src/lib/__tests__/ink-summary-bar.test.tsx` | Tests for SummaryBar |
| `src/lib/__tests__/ink-merge-status.test.tsx` | Tests for MergeStatus |

### Key Files to Modify

| File | Why |
|------|-----|
| `src/lib/ink-app.tsx` | Integrate SummaryBar and MergeStatus into render tree |
| `src/lib/ink-components.tsx` | Extend RendererState with summary/merge data |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/ink-lane-container.tsx` | `LaneContainer`, `LaneData` — renders above SummaryBar |
| `src/lib/ink-lane.tsx` | `Lane`, `StoryProgressEntry` — per-lane display |
| `src/lib/ink-activity-components.tsx` | Activity display — renders below MergeStatus |
| `src/lib/ink-renderer.tsx` | `RendererHandle`, `RendererState` — drives re-renders |
| `src/lib/ink-components.tsx` | `SprintInfo`, `RendererState`, `Separator` — existing types and components |
| `src/lib/worktree-manager.ts` | `MergeResult`, `MergeConflictInfo` — merge outcome types |
| `src/lib/lane-pool.ts` | `LaneEvent`, `LaneStatus` — lane lifecycle events |
| `src/lib/merge-agent.ts` | `MergeConflictContext` — conflict resolution types |

### Component Hierarchy (Target State)

```
<App>
  <Header />                       ← Already extended (20-1) with lane count
  <LaneContainer>                  ← Already created (20-1)
    <Lane epic={10}> ... </Lane>
    <Lane epic={14}> ... </Lane>
    <CollapsedLanes />
  </LaneContainer>
  <Separator />
  <SummaryBar />                   ← NEW: done, merging, pending
  <Separator />
  <MergeStatus />                  ← NEW: merge progress, conflicts, test results
  <Separator />
  <CompletedTools />               ← Existing: activity section unchanged
  <ActiveTool />
  <LastThought />
  <RetryNotice />
</App>
```

### Existing Patterns to Follow

- **Component file naming**: `ink-{name}.tsx` — pure presentational components.
- **Import style**: `import React from 'react'` + `import { Text, Box } from 'ink'` — standard Ink pattern.
- **ESM imports**: Use `.js` extensions in TypeScript ESM imports (`'./ink-summary-bar.js'`).
- **Type exports**: Types at top of component file, then components.
- **No hooks**: Existing components are stateless (state from parent via props). `SummaryBar` and `MergeStatus` should be pure function components.
- **Symbols**: Done `✓`, active `◆`, pending `○`, spinner `◌` — already used throughout.
- **Color scheme**: Green for success/done, yellow for warnings/in-progress, red for failure, dim for inactive/pending.
- **Status prefixes**: `[OK]`, `[FAIL]`, `[WARN]`, `[INFO]` — established pattern from UX spec.
- **Separator**: Reuse `<Separator />` from `ink-components.tsx` between sections.
- **Ink testing**: Use `ink-testing-library` render function. See `src/lib/__tests__/ink-*.test.tsx`.

### UX Display Formats

**Summary bar (one line):**
```
Done: 10-1 ✓  10-2 ✓  10-3 ✓  14-1 ✓ │ Merging: — │ Pending: epic-12, epic-13
```

**Summary bar during active merge:**
```
Done: 10-1 ✓  10-2 ✓ │ Merging: epic-14 → main ◌ │ Pending: epic-11, epic-12
```

**Summary bar during conflict resolution:**
```
Done: ... │ Merging: epic-11 → main (resolving 1 conflict) ◌ │ Pending: ...
```

**Merge status — clean:**
```
[OK] Merge epic-14 → main: clean (0 conflicts)
[OK] Tests: 1650/1650 passed (18s)
[OK] Worktree cleaned: /tmp/codeharness-wt-epic-14
```

**Merge status — resolved:**
```
[OK] Merge epic-11 → main: 1 conflict auto-resolved
     └ src/lib/workflow-engine.ts: additive changes in different functions
[OK] Tests: 1652/1652 passed (19s)
```

**Merge status — escalated:**
```
[FAIL] Merge epic-11 → main: conflict unresolvable after 3 attempts
       └ src/lib/workflow-engine.ts: semantic conflict in dispatchTaskWithResult()
       → Manual resolution required
       → Worktree preserved: /tmp/codeharness-wt-epic-11
```

**Lane completion:**
```
[OK] Lane 2: Epic 14 complete (3 stories, $4.80, 22m)
```

### Previous Story (20-1) Intelligence

- Story 20-1 created `ink-lane.tsx` (~80-120 lines) and `ink-lane-container.tsx` (~120-180 lines).
- Extended `Header` with `laneCount` and `laneTotalCost`.
- Added `lanes?: LaneData[]` to `RendererState`.
- Testing pattern: vitest, `vi.mock`, `ink-testing-library`, colocated in `src/lib/__tests__/`.
- ESM module pattern: `.js` extensions in imports.
- Build: `npm run build`, Test: `npm test`.
- 187 test files, 5062 tests pass — zero regressions after 20-1.

### Edge Cases

- **No done stories**: Display `Done: —` (em dash, not empty).
- **No pending epics**: Display `Pending: —`.
- **No active merge**: Display `Merging: —`.
- **Multiple merges queued**: Only one merge can run at a time (merge serialization from 18-1). Show the active one.
- **Merge with 0 conflicts but test failure**: Show `[OK] Merge ... clean` then `[FAIL] Tests: ...`.
- **MergeStatus with null state**: Render nothing (component returns null).
- **Very long list of done stories**: May need truncation or wrapping for narrow terminals.
- **Cost = 0**: Display `$0.00`.
- **Coverage = null**: Omit coverage from test results display.

### Boundary: What This Story Does NOT Include

- **Lane event routing** — That's story 20-3.
- **Wiring real merge data into MergeStatus** — That's 20-3 (event routing connects live merge events to renderer state).
- **Activity display lane filtering** — That's story 20-3.
- **Ctrl+L / Ctrl+M keybindings** — That's story 20-3.
- **Merge execution logic** — Already exists in `worktree-manager.ts` (18-1) and `merge-agent.ts` (18-2).
- **Lane pool management** — Already exists in `lane-pool.ts` (17-2).

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/`
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`, Test: `npm test`
- New `.tsx` files for React/Ink components
- Keep each new component file focused: `ink-summary-bar.tsx` (~80-120 lines), `ink-merge-status.tsx` (~100-150 lines)

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 20.2]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 8 -- Multi-Lane TUI Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Merge Status Display]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Summary Bar]
- [Source: _bmad-output/planning-artifacts/ux-design-parallel-execution.md#Component Architecture]
- [Source: src/lib/ink-app.tsx]
- [Source: src/lib/ink-components.tsx#RendererState]
- [Source: src/lib/ink-lane-container.tsx#LaneData]
- [Source: src/lib/worktree-manager.ts#MergeResult]
- [Source: src/lib/lane-pool.ts#LaneEvent]
