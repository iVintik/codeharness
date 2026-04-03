---
stepsCompleted: [1, 2]
status: complete
completedAt: '2026-04-03'
inputDocuments:
  - prd.md (parallel execution PRD)
  - ux-design-specification.md (existing CLI UX v2)
  - architecture-multi-framework.md (TUI component architecture)
workflowType: 'ux-design'
note: 'Multi-lane TUI UX for parallel epic execution, merge status, and telemetry visibility'
---

# TUI UX Specification — Parallel Execution Extension

**Date:** 2026-04-03
**Extends:** ux-design-specification.md (CLI UX v2)

## Overview

This extends the existing CLI UX patterns for parallel execution. The core addition: the TUI goes from a single-lane view (one story at a time) to a **multi-lane view** (multiple epics executing concurrently in separate worktrees). All existing patterns (status prefixes, symbols, progressive detail, dense output) remain unchanged.

**New UX surfaces:**
1. Multi-lane TUI rendering during `codeharness run --live`
2. Merge status and conflict resolution display
3. Lane lifecycle visualization (create → execute → merge → cleanup)
4. Telemetry visibility (optional, not in default view)
5. Updated `codeharness status` for parallel runs

## Design Principles (Inherited + Extended)

All 8 existing principles apply. New additions:

9. **Lanes are independent.** Each lane is self-contained — a failure in lane 1 doesn't pollute lane 2's display.
10. **Merge is a first-class event.** Merge attempts, conflicts, resolutions, and test results are visible — not hidden in logs.
11. **Parallel ≠ noisy.** Two lanes should be as readable as one lane was. Compress, don't duplicate.

## Multi-Lane Live Mode: `codeharness run --live`

### Two Parallel Lanes (Default: max_parallel=2)

```
codeharness run | 2 lanes | 47m elapsed | $18.60 spent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Lane 1: Epic 10 — Driver Interface         Lane 2: Epic 14 — TUI Workflow
 10-3 ◆ dev (AC 4/9)                        14-1 ◆ verify (AC 2/6)
 ✓ 10-1  ✓ 10-2  ◆ 10-3  ○ 10-4  ○ 10-5   ◆ 14-1  ○ 14-2  ○ 14-3
 claude-code | $4.20 / 18m                   codex | $1.30 / 8m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: 10-1 ✓  10-2 ✓ │ Merging: — │ Pending: epic-11, epic-12, epic-13, epic-15
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✓ Read src/lib/agents/drivers/types.ts
 ⚡ Edit src/lib/agents/drivers/claude-code.ts ◌
```

### Layout Rules

**Header line:** `codeharness run | {N} lanes | {elapsed} | ${cost}`

**Lane columns:**
- Two lanes render side-by-side (half terminal width each)
- Three+ lanes: top 2 active lanes shown, others collapsed to one-line summaries below
- Each lane shows: epic title, current story + phase + AC progress, story progress bar, driver + cost/time

**Summary bar:** Between lanes and activity. Shows: done count, merge status, pending epics.

**Activity section:** Shows the MOST RECENTLY ACTIVE lane's tool/thought/retry. Only one activity stream at a time — the one that last produced output. Prefixed with lane number.

### Three or More Lanes

```
codeharness run | 3 lanes | 1h12m elapsed | $32.10 spent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Lane 1: Epic 10 — Driver Interface         Lane 2: Epic 14 — TUI Workflow
 10-4 ◆ verify (AC 3/7)                     14-2 ◆ dev
 ✓ 10-1  ✓ 10-2  ✓ 10-3  ◆ 10-4  ○ 10-5   ✓ 14-1  ◆ 14-2  ○ 14-3
 claude-code | $6.80 / 32m                   codex | $2.10 / 14m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Lane 3: Epic 11 — Workflow Schema │ 11-1 ◆ dev │ $0.40 / 2m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: 10-1 ✓  10-2 ✓  10-3 ✓  14-1 ✓ │ Merging: — │ Pending: epic-12, epic-13
```

Lane 3+ collapse to a single line: `Lane N: Epic Title │ story ◆ phase │ $cost / time`

### Single Lane (Backward Compatible)

When `max_parallel: 1` or only one epic remains:

```
codeharness run | iteration 3 | 47m elapsed | $12.30 spent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Story: 3-2-bmad-installation-workflow-patching
Phase: verify → AC 8/12

Done: 3-1 ✓  4-1 ✓  4-2 ✓
This: 3-2 ◆ verifying (8/12 ACs)
Next: 3-3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Identical to current single-lane UX. No visual changes.

## Merge Status Display

### Merge In Progress

When an epic completes and merges:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: 10-1 ✓ ... │ Merging: epic-14 → main ◌ │ Pending: epic-11, epic-12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Merge Successful (Clean)

```
[OK] Merge epic-14 → main: clean (0 conflicts)
[OK] Tests: 1650/1650 passed (18s)
[OK] Worktree cleaned: /tmp/codeharness-wt-epic-14
[INFO] Lane 2 → picking up epic-11
```

### Merge Conflict — Agent Resolving

```
[WARN] Merge epic-11 → main: 1 conflict in src/lib/workflow-engine.ts
[INFO] Dispatching merge agent...
```

Summary bar updates:

```
Done: ... │ Merging: epic-11 → main (resolving 1 conflict) ◌ │ Pending: ...
```

### Merge Conflict — Resolved

```
[OK] Merge epic-11 → main: 1 conflict auto-resolved
     └ src/lib/workflow-engine.ts: additive changes in different functions
[OK] Tests: 1652/1652 passed (19s)
[OK] Worktree cleaned: /tmp/codeharness-wt-epic-11
```

### Merge Conflict — Escalated

```
[FAIL] Merge epic-11 → main: conflict unresolvable after 3 attempts
       └ src/lib/workflow-engine.ts: semantic conflict in dispatchTaskWithResult()
       └ Epic 10 refactored function signature, epic 11 added parameters
       → Manual resolution required
       → Worktree preserved: /tmp/codeharness-wt-epic-11
       → Branch: codeharness/epic-11-workflow-schema
       → Run: cd /tmp/codeharness-wt-epic-11 && git diff main
```

### Cross-Worktree Test Validation

After merge, before cleanup:

```
[INFO] Running cross-worktree test validation on merged result...
[OK] Tests: 1652/1652 passed (19s)
[OK] Coverage: 96.8% (target: 90%)
```

If tests fail after merge:

```
[FAIL] Cross-worktree test validation failed after merge
       └ 3 tests failed in src/lib/workflow-engine.test.ts
       └ Merge conflict resolution may have introduced regression
       → Reverting merge: git reset --hard HEAD~1
       → Dispatching merge agent with test failure context (attempt 2/3)
```

## Updated `codeharness status` — Parallel Run

### Active Parallel Run

```
codeharness v0.27.0 | nodejs | enforcement: front:OFF db:OFF api:OFF obs:ON

── Project State ──────────────────────────────────────────────
Sprint: 31/47 done (66%) | 11/15 epics complete
Active epics: 10, 14 (parallel, 2 lanes)
Modules: infra:OK verify:OK sprint:OK dev:OK review:OK

── Active Run (parallel) ─────────────────────────────────────
Status: running (2 lanes, 1h12m elapsed)
Lane 1: Epic 10 → 10-4 verifying (AC 3/7) | $6.80
Lane 2: Epic 14 → 14-2 dev | $2.10
Total cost: $32.10 | 16 stories remaining

── This Run ───────────────────────────────────────────────────
Completed:  7 stories (10-1..10-3, 14-1, 11-1..11-2, 12-1)
Merged:     2 epics (epic-11 clean, epic-12 clean)
Conflicts:  0 auto-resolved, 0 escalated
Failed:     0 stories
In progress: 2 stories (10-4, 14-2)

── Worktrees ──────────────────────────────────────────────────
 Active: /tmp/codeharness-wt-epic-10 (branch: codeharness/epic-10)
 Active: /tmp/codeharness-wt-epic-14 (branch: codeharness/epic-14)
 Cleaned: 2 (epic-11, epic-12)
```

## Lane Lifecycle Events

### Lane Created

```
[INFO] Lane 1: creating worktree for epic-10 (5 stories)
[OK] Worktree: /tmp/codeharness-wt-epic-10
[OK] Branch: codeharness/epic-10-driver-interface
[INFO] Lane 1: starting 10-1-agentdriver-interface-types
```

### Lane Completed (Epic Done)

```
[OK] Lane 2: Epic 14 complete (3/3 stories, $3.40, 22m)
[INFO] Running epic retro...
[OK] Retro: _bmad-output/implementation-artifacts/epic-14-retrospective.md
[INFO] Merging epic-14 → main...
[OK] Merge: clean | Tests: 1652 passed
[OK] Worktree cleaned
[INFO] Lane 2 → picking up epic-15 (3 stories)
```

### All Lanes Finished

```
[OK] All epics complete. Sprint done.
     └ 6 epics | 19 stories | 4h12m | $245.30
     └ Merges: 6 (5 clean, 1 auto-resolved)
     └ Worktrees: 0 active, 6 cleaned
```

## Telemetry Display

Telemetry is **invisible by default** — it's infrastructure, not user-facing. The data feeds into epic retros and `codeharness stats`.

### Optional: `codeharness stats --telemetry`

```
── Session Telemetry ──────────────────────────────────────────
Entries: 19 stories | Source: .codeharness/telemetry.jsonl

By Epic:
  Epic 10: 5 stories | $18.20 | 42m | 2 retries
  Epic 11: 2 stories | $5.10  | 12m | 0 retries
  Epic 12: 3 stories | $9.40  | 21m | 1 retry
  Epic 13: 3 stories | $8.60  | 19m | 0 retries
  Epic 14: 3 stories | $3.40  | 14m | 0 retries
  Epic 15: 3 stories | $4.20  | 16m | 1 retry

Most expensive story: 10-3-claude-code-driver-extraction ($5.80)
Most retries: 10-5-workflow-engine-driver-integration (2 retries)
```

## Color Coding

Extends existing scheme:

| Element | Color | Context |
|---------|-------|---------|
| Lane header | white bold | Lane separator |
| Lane number | cyan | Active lane indicator |
| Merge in progress | yellow | Merging status |
| Merge clean | green | Successful merge |
| Merge conflict | red | Conflict detected |
| Merge resolved | green | Auto-resolved |
| Merge escalated | red bold | Manual intervention needed |
| Test pass (post-merge) | green | Cross-worktree validation |
| Test fail (post-merge) | red bold | Regression detected |
| Worktree active | dim cyan | Active worktree path |
| Worktree cleaned | dim | Cleaned worktree |

## Component Architecture

### New Ink Components

```
<App>
  <Header />                    # Extended: lane count, total cost across lanes
  <Separator />
  <LaneContainer>               # NEW: manages lane layout
    <Lane epic={10}>            # NEW: one per active worktree
      <WorkflowGraph />         # From multi-framework PRD
      <StoryProgress />
    </Lane>
    <Lane epic={14}>
      <WorkflowGraph />
      <StoryProgress />
    </Lane>
    <CollapsedLanes />          # NEW: one-line summaries for lanes 3+
  </LaneContainer>
  <Separator />
  <SummaryBar />                # NEW: done, merging, pending
  <Separator />
  <MergeStatus />               # NEW: merge progress, conflicts, test results
  <ActivityDisplay />           # Existing: shows most recently active lane
</App>
```

### Layout Responsiveness

- **Terminal width >= 120 cols:** Two lanes side-by-side
- **Terminal width 80-119 cols:** Two lanes stacked vertically (compact mode)
- **Terminal width < 80 cols:** Single active lane only, others collapsed

## Interaction Patterns

### `Ctrl+L` — Cycle Active Lane Display

When multiple lanes are active, `Ctrl+L` cycles which lane's activity stream is shown in the bottom activity section. Visual indicator: `[Lane 1 ▸]` or `[Lane 2 ▸]` in the activity header.

### `Ctrl+M` — Toggle Merge Detail

When a merge is in progress, `Ctrl+M` expands/collapses merge detail in the merge status section. Default: collapsed (one-line summary). Expanded: full conflict list, agent output, test results.
