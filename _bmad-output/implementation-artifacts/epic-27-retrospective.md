# Epic 27 Retrospective: TUI Visualization & Integration

**Epic:** Epic 27 — TUI Visualization & Integration (epic 6 of the XState engine plan, mapped to "Epic 6" in epics-xstate-engine.md)
**Date:** 2026-04-07
**Stories Completed:** 5 (27-1, 27-2, 27-3, 27-4, 27-5)
**Status:** All stories marked done in sprint-status.yaml
**Previous Retro:** Epic 26 (Persistence & Resume)
**XState Engine Status:** This was the FINAL epic. Epics 21–27 are all complete. The XState engine redesign is done.

---

## Epic Summary

Epic 27 replaced the hand-tracked TUI state in `run.ts` with XState inspect-API-driven visualization. The TUI now derives all display state from machine snapshots — eliminating an entire class of state synchronization bugs.

**Story 27-1 — Pure visualizer function** created `src/lib/workflow-visualizer.ts` with a pure `visualize(position, vizConfig) → string` function. One-row compressed flow rendering: scope prefix, sliding window, gate consensus detail, ANSI color. ≤80 char target, ≤120 char max.

**Story 27-2 — Derive position from snapshot state path** added `snapshotToPosition(snapshot, workflow) → WorkflowPosition` to extract current epic/story/step/gate state from XState persisted snapshots. Parsed flat state names + context fields into structured position.

**Story 27-3 — Wire inspect API to visualizer** added an `inspect` callback in `workflow-runner.ts` that fires on state transitions, calls `snapshotToPosition()` → `visualize()`, and emits `workflow-viz` engine events to the TUI renderer via `renderer.updateWorkflowRow()`.

**Story 27-4 — Sideband streaming to TUI** validated and completed the sideband event pipeline: `dispatch-start`, `stream-event`, `dispatch-end` engine events flowing from `dispatchTaskCore()` through `config.onEvent` to the Ink renderer. Real-time agent activity visible in terminal.

**Story 27-5 — Simplify run.ts** removed all hand-tracked state variables: `inEpicPhase`, `taskStates`, `taskMeta`, `storyFlowTasks`, `epicLoopTasks`, `headerRefresh`, and all `updateWorkflowState()` calls. The `onEvent` handler was reduced to forwarding events and tracking `totalCostUsd` + `storiesDone`.

By the end of Epic 27: **199 test files, 5,287 tests passing** (up from 5,221 post-Epic-26 — 66 new tests), build clean.

---

## Acceptance Criteria Verification (Story 27-5)

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC8 | Hand-tracked vars removed from `run.ts` | ✅ Pass | `grep -c "inEpicPhase\|taskStates\|taskMeta\|storyFlowTasks\|epicLoopTasks\|headerRefresh" src/commands/run.ts` → **0** |
| AC9 | `run.ts` ≤ 400 lines | ❌ Fail | `wc -l src/commands/run.ts` → **486 lines** (target was ≤400, down from 610 but not enough) |
| AC10 | `updateWorkflowState()` calls removed | ✅ Pass | `grep -c "updateWorkflowState" src/commands/run.ts` → **0** |
| AC11 | All tests pass | ✅ Pass | `npx vitest run` → 5,287 passed (199 files) |
| AC12 | Build succeeds | ✅ Pass | `npm run build` → exit 0 |

**AC1–AC7** (behavioral/visual): Not independently verified in this retro — these require interactive `codeharness run` observation. Documented as pending.

---

## What Went Well

### 1. Hand-Tracked State Elimination Was Complete

The core goal of Epic 27 succeeded: `run.ts` has zero references to `inEpicPhase`, `taskStates`, `taskMeta`, `storyFlowTasks`, `epicLoopTasks`, or `headerRefresh`. Zero calls to `updateWorkflowState()`. The TUI visualization row is now driven entirely by XState inspect callbacks. This eliminates an entire class of bugs where the TUI showed one thing while the engine was doing another.

### 2. Clean 5-Story Dependency Chain

The sequencing was correct and each story built on the previous:
- 27-1: Pure rendering (no I/O, no state)
- 27-2: Snapshot parsing (consumer of 27-1's types)
- 27-3: Inspect wiring (consumer of 27-1 + 27-2)
- 27-4: Sideband events (parallel concern, independent)
- 27-5: Cleanup (consumer of all above)

No story needed to rework previous stories. Same clean sequencing pattern as Epic 26.

### 3. Architecture Decisions Mapped Directly to Stories

AD5 from `architecture-xstate-engine.md` specified: "pure function (machine, snapshot, config) → string" and "run.ts role is pre-flight, compile, create actor, wire inspect + sideband, wait." Every story in Epic 27 was a direct implementation of AD5. No design pivots needed.

### 4. Visualizer File Size Discipline

`workflow-visualizer.ts` at 296 lines — under the 300-line NFR18 limit. Packs both `visualize()` and `snapshotToPosition()` plus all types. The AD5 estimate of "~150 lines" was optimistic but the 300-line ceiling held.

### 5. Test Suite Growth Continued

66 new tests across Epic 27 (5,221 → 5,287). The visualizer alone has 35+ tests (mentioned in story 27-3 context). Zero regressions. Test discipline held through the entire 7-epic XState redesign.

### 6. XState Engine Redesign Is Complete

Epics 21–27 are all done. The full pipeline works:
- Epic 21: File decomposition (7 modules from 1,426-line monolith)
- Epic 22: Flow config parser (for_each + gate YAML)
- Epic 23: Dispatch & null task actors
- Epic 24: Workflow compiler (YAML → XState machine config)
- Epic 25: Machine hierarchy (gate/story/epic/run machines)
- Epic 26: Persistence & resume (dual-layer snapshot + checkpoint)
- Epic 27: TUI visualization (inspect API → pure visualizer → renderer)

From problem statement (P1: "decompose 1,426-line workflow-machine.ts") to fully operational XState-driven engine across 7 epics, ~35 stories.

---

## What Didn't Go Well

### 1. `run.ts` Missed the 400-Line Target (AC9 Failed)

Story 27-5 targeted ≤400 lines. Actual: **486 lines**. Down from 610 (a 20% reduction) but 86 lines over target. The parallel execution path (LanePool routing), pre-flight checks, option parsing, and quiet-mode summary reporting weren't as shrinkable as estimated. AC9 is a hard fail.

### 2. Zero Story-Level Commits — Third Epic in a Row

`git log --oneline` shows no commits referencing `27-*`. Same failure as Epic 22 and Epic 26. Epic 26 retro action item A1 ("create per-story git commits during harness runs") was not implemented. Three consecutive epics with invisible git history.

This is now a **systemic problem**, not a one-off miss.

### 3. Story Spec Status Headers Not Updated

All 5 story specs still say `Status: ready-for-dev` despite being marked done in sprint-status.yaml. Same pattern flagged in Epic 26 retro (pattern P3). The harness updates sprint-state.json but doesn't update the story spec files.

### 4. Behavioral ACs (AC1–AC7) Not Independently Verified

Seven acceptance criteria require interactive observation of `codeharness run` (watching the TUI update during story transitions, gate iterations, error scenarios, quiet mode). No verification proofs exist for these. The structural ACs (AC8, AC10–AC12) are verified, but the user-facing behavior is unproven.

### 5. No Verification Proofs for Stories 27-1 through 27-4

Only story 27-5 has documented acceptance criteria in the task context. Stories 27-1 through 27-4 have no verification proof documents. Given that these are the foundation stories, this is the same gap flagged for story 26-1.

---

## Epic 26 Retro Action Item Follow-Through

| # | Action | Status | Evidence |
|---|--------|--------|----------|
| A1 | Create per-story git commits during harness runs | ❌ Not addressed | Zero commits referencing `27-*`. Third epic in a row. |
| A2 | Split `workflow-persistence.ts` before adding features | ⏳ Not needed | Epic 27 didn't add persistence features. File still at 297 lines. Debt remains. |
| A3 | Update story 26-4 status header to "done" | ❌ Not done | Not checked this retro, but the same pattern persists in Epic 27 stories. |
| A4 | Verify story 26-1 acceptance criteria | ⏳ Unknown | No evidence of retroactive verification. |
| A5 | Add dev agent record to story 26-2 | ⏳ Unknown | Not checked. |
| A6 | Confirm 26-4 AC statuses | ⏳ Unknown | Not checked. |

**Summary:** A1 failed again (critical). A2 deferred (legitimate — no persistence changes). A3–A6 unknown/not addressed.

---

## Patterns Observed

### P1: Story-Level Git Commits Remain Absent (Systemic)

Three consecutive epics (22, 26, 27) with zero story-level commits. The harness runs stories autonomously but creates no commit trail. This is not a process failure — it's a missing feature. The harness would need to `git add -A && git commit` after each story completion. Until this is built, all harness-driven epics will have opaque git history.

### P2: AC Line-Count Targets Are Consistently Optimistic

- AC9: run.ts target ≤400, actual 486
- AD5 estimate: visualizer ~150 lines, actual 296
- Pattern: line count targets underestimate by ~30-50%

This doesn't mean the code is bloated — it means estimates don't account for error handling, edge cases, and TypeScript type overhead.

### P3: Story Spec Files Are Write-Once

Story specs are created during sprint planning and never updated during or after implementation. Status stays "ready-for-dev" forever. Dev agent records are inconsistent. The specs serve as input docs but not as living records.

### P4: Pure Function Architecture Enables Clean Testing

Stories 27-1 and 27-2 produced pure functions (no I/O, no state) that are trivially testable with snapshot assertions. 35+ tests for the visualizer alone. The architectural decision to separate pure logic from I/O wiring pays dividends in test quality and speed.

### P5: Final-Epic Cleanup Stories Are High-Value

Story 27-5 (remove hand-tracked state) was the climactic payoff of 6 prior epics of infrastructure. It deleted code rather than adding it. The reduction from 610 → 486 lines with complete elimination of 6 mutable state variables and all legacy `updateWorkflowState()` calls is a net simplification even if it missed the 400-line target.

---

## Lessons Learned

### L1: The XState Inspect API Is the Right Abstraction for TUI

Wiring inspect callbacks to pure visualizers is cleaner than hand-tracking state. The old approach required maintaining ~15 mutable variables that shadowed machine state. The new approach: machine transitions → inspect event → snapshot → position → string → renderer. One pipeline, one source of truth, zero drift.

### L2: Line Count Targets Should Include a 30% Buffer

If the target is 400 lines, design for 300. The extra 100 lines will be consumed by error handling, type definitions, imports, and edge cases. For future ACs, either raise targets or accept "reduced by X%" as the criterion instead of absolute counts.

### L3: Harness Per-Story Commits Need to Be a Product Feature, Not a Process Rule

Three epics of "action item: commit per story" have failed because it's a manual process that the autonomous harness doesn't execute. The fix is code, not process: the harness should `git commit` after each story's tests pass. Add this to the harness backlog as a feature story.

### L4: Verification Proofs Should Be Generated During Implementation, Not After

Stories 27-1 through 27-4 lack proofs. By the time a retro asks "was this verified?", the context is cold. The harness should generate verification proofs immediately after tests pass for each story.

### L5: Seven-Epic Redesign Was Successful Despite Process Gaps

Epics 21–27 collectively replaced a 1,426-line monolith with 7 focused modules, added XState machines at every level, built dual-layer persistence, and eliminated hand-tracked TUI state. Test count grew from ~4,976 (pre-21) to 5,287 (post-27). Build stayed green throughout. The architecture held. The process gaps (commits, proofs, status tracking) are real but didn't block delivery.

---

## Technical Debt

| # | Debt Item | Severity | Source |
|---|-----------|----------|--------|
| D1 | `run.ts` at 486 lines — 86 lines over AC9 target, well over 300-line NFR18 | Medium | AC9 failure |
| D2 | `workflow-persistence.ts` at 297/300 lines — no room for growth | Medium | Carried from Epic 26 D1 |
| D3 | `workflow-visualizer.ts` at 296/300 lines — no room for growth | Low | Same ceiling pressure |
| D4 | Behavioral ACs (AC1–AC7) unverified — TUI correctness during transitions, errors, quiet mode | Medium | No proof docs |
| D5 | No checkpoint log compaction — carried from Epic 26 D3 | Low | Deferred |
| D6 | Gate iteration state not restored on checkpoint resume — carried from Epic 26 D4 | Low | Deferred |

---

## Action Items

| # | Action | Owner | Priority |
|---|--------|-------|----------|
| A1 | **Build per-story git commit into the harness** — not a process rule, a feature. After each story's tests pass, the harness should stage changed files and commit with message `feat(X-Y): story title`. Three epics of missed action items prove this can't be manual. | Dev | High — next feature epic |
| A2 | **Split `run.ts`** — at 486 lines, it violates NFR18 (300 max). Extract the parallel execution path (LanePool setup/event routing) into a `run-parallel.ts` helper. Extract pre-flight + option parsing into a helper. Target: run.ts ≤ 250 lines. | Dev | Medium — before next run.ts changes |
| A3 | **Verify behavioral ACs (AC1–AC7) interactively** — run `codeharness run` on a multi-story workflow and visually confirm: header updates, workflow row resets on story transition, epic-level pipeline switch, monotonic cost, non-freezing timer, quiet-mode summary, error display. Document observations. | QA | Medium — next session |
| A4 | **Split `workflow-persistence.ts` (297 lines) and `workflow-visualizer.ts` (296 lines)** — both are at the NFR18 ceiling. Persistence: split into snapshot + checkpoint. Visualizer: split into renderer + position-parser. | Dev | Low — before adding features to either |
| A5 | **Update all story spec status headers** — stories 27-1 through 27-5 still say "ready-for-dev". Build this into the harness story completion flow. | Dev | Low |
| A6 | **Generate verification proofs during implementation** — make the harness emit a proof doc after each story's tests pass. Capture: AC statuses, test counts, file changes, build status. | Dev | Medium — harness feature |

---

## XState Engine Redesign — Final Summary

### By the Numbers

| Metric | Before (pre-Epic 21) | After (post-Epic 27) | Delta |
|--------|----------------------|----------------------|-------|
| Monolith file | 1,426 lines (workflow-machine.ts) | Deleted | -1,426 lines |
| Module count | 1 file + hierarchical-flow.ts | 9 focused modules | +7 modules |
| Test count | ~4,976 | 5,287 | +311 tests |
| Test files | ~183 | 199 | +16 files |
| Hand-tracked TUI vars | ~15 mutable variables | 2 (totalCostUsd, storiesDone) | -13 vars |
| Machine type | Imperative actor wrappers | Real XState state machines | Architecture upgrade |
| Persistence | Basic JSON dump | Dual-layer (snapshot + checkpoint) | Crash + config-change resilient |
| Visualization | Hand-tracked flow graph | Inspect API → pure function | Single source of truth |

### Architecture Decisions That Held

- AD2: `fromPromise` actors for dispatch (not child machines)
- AD3: Dual-layer persistence (snapshot + checkpoint)
- AD4: `for_each` iteration via guard-driven state transitions
- AD5: Pure visualizer function driven by inspect API
- AD6: Recursive compiler (YAML → XState machine config)

### What Needs Attention Going Forward

1. **`run.ts` is the new pressure point** — 486 lines, NFR18 violator, but it's the CLI entry point with many concerns (options, pre-flight, sequential path, parallel path, quiet mode, signals). Needs decomposition.
2. **Persistence and visualizer modules at 297/296 lines** — any feature addition will breach NFR18. Split before extending.
3. **Harness tooling gaps** — per-story commits, verification proofs, story status updates are all manual today. These should be harness features.

The XState engine redesign achieved its goals: decomposed monolith, real state machines, proper persistence, inspect-driven TUI. Process gaps around git history and verification tracking are the main improvement area for the next project phase.
