---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
classification:
  projectType: developer_tool
  domain: general
  complexity: high
  projectContext: brownfield
inputDocuments:
  - prd-multi-framework.md (multi-framework orchestration PRD, brownfield context)
  - architecture-multi-framework.md (architecture with workflow engine details)
  - quick-spec-session-telemetry-retro-split.md (telemetry/retro quick spec)
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 3
workflowType: 'prd'
---

# Product Requirements Document - codeharness

**Author:** BMad
**Date:** 2026-04-03

## Executive Summary

codeharness currently executes stories sequentially — one at a time, one framework at a time. A 19-story sprint takes 8+ hours of wall-clock time. This PRD adds **parallel execution** at two levels: parallel epics via git worktrees and parallel stories within epics, cutting sprint time proportionally to the parallelism factor.

The workflow engine gains a **hierarchical flow model** with three levels. Sprint-level flow schedules epics (potentially in parallel). Epic-level flow schedules stories and runs an epic retro on completion. Story-level flow is the existing `implement → verify → loop` pipeline. Each level has distinct lifecycle hooks: per-story telemetry (zero-token, engine-handled) and per-epic retrospectives (LLM-powered, one call per epic instead of per-session).

Parallel execution requires **isolation**. Each parallel dispatch gets its own git worktree — a separate working directory on a separate branch. Stories within a worktree execute sequentially. When an epic completes, its worktree branch merges back to main. If merge conflicts occur, a merge agent resolves them with context from both branches.

Three additional optimizations ship with this: **`agent: null` tasks** let the engine handle telemetry without LLM dispatch (saving ~$120-180/sprint on retro overhead), **verify flag propagation** moves flag-setting from the evaluator to the engine (fixing unreliable verification), and **coverage deduplication** eliminates redundant coverage runs during verification.

### What Makes This Special

- **Worktree-isolated parallelism** — each parallel epic runs in its own git worktree. No shared mutable state during execution. Conflicts surface only at merge time, handled by a merge agent.
- **Hierarchical flow model** — sprint → epic → story, each with its own lifecycle. Not a flat task queue — a structured execution DAG with dependency-aware scheduling.
- **Zero-token engine tasks** — `agent: null` tasks execute without LLM dispatch. Telemetry collection, flag setting, and state bookkeeping become free operations.
- **Multi-lane TUI** — parallel execution visualized as concurrent workflow lanes, each showing its own story progress, driver, and cost.
- **Proportional speedup** — 2 parallel worktrees = ~2x faster sprints. Configurable up from there.

## Project Classification

- **Project Type:** Developer tool — npm CLI extending existing workflow engine
- **Domain:** General software development tooling
- **Complexity:** High — git worktree lifecycle, multi-process orchestration, merge conflict resolution, hierarchical state machines, multi-lane TUI rendering
- **Project Context:** Brownfield — workflow engine, driver layer, TUI, state management all exist. This adds parallelism, hierarchy, and merge on top.

## Success Criteria

### User Success

- **Sprint time reduction:** 2x parallel execution delivers ~2x wall-clock speedup. Target: 19-story sprint in <4h (vs current 8h+).
- **Zero merge failures:** Worktree isolation prevents file conflicts during execution. Merge agent resolves conflicts automatically. Target: <5% require manual intervention.
- **Retro cost elimination:** Per-session LLM retros replaced by zero-token telemetry. Target: $0 token cost for per-story data collection.
- **Parallel visibility:** User sees all active lanes in TUI — which epics running, which stories active, cost per lane.

### Business Success

- **3-month goal:** Parallel epic execution with worktrees, merge agent, and cross-worktree test validation working end-to-end. 2x speedup demonstrated.
- **6-month goal:** Parallel stories within epics. DAG-based scheduling. Configurable parallelism at 3-4 lanes.
- **Cost reduction:** ~$120-180/sprint from retro optimization. Additional savings from reduced wall-clock time.

### Technical Success

- **Worktree lifecycle:** Create, execute, merge, cleanup — fully automated. No orphaned worktrees.
- **State consistency:** Hierarchical state consistent across parallel worktrees. No corruption from concurrent writes.
- **Merge reliability:** Merge agent resolves conflicts on first attempt for >95% of merges.
- **Cross-worktree validation:** Full test suite passes on merged result before accepting.
- **TUI responsiveness:** Multi-lane rendering at 15 FPS with 2-4 concurrent lanes.
- **Backward compatibility:** `max_parallel: 1` produces identical behavior to current sequential execution.

### Measurable Outcomes

| Metric | Target | Method |
|--------|--------|--------|
| Sprint wall-clock time | <50% of sequential | Timed comparison |
| Merge conflict auto-resolution | >95% | Tracked per sprint |
| Retro token cost per story | $0 | Telemetry |
| Epic retro cost | <$10/epic (vs $50+ per-session) | Cost tracking |
| TUI FPS with 2 lanes | 15 FPS | Measured render |
| Orphaned worktrees | 0 after sprint | `git worktree list` |
| Post-merge test pass rate | 100% | Test suite on merge |

## Product Scope

### MVP

- Hierarchical flow model (sprint → epic → story) in workflow YAML
- `agent: null` tasks — engine-handled, zero-token telemetry
- `scope: per-epic` — epic-level lifecycle hooks (retro)
- Parallel epic execution with git worktree isolation (configurable, default 2)
- Worktree lifecycle — create branch, create worktree, execute, merge, cleanup
- Merge agent — LLM-powered automatic conflict resolution
- Cross-worktree test validation — full test suite on merged result before accepting
- Engine verify flag propagation — engine sets flags from output contract
- Coverage deduplication — dev phase only, verify reads from contract
- Multi-lane TUI — concurrent epic lanes with story progress
- Telemetry NDJSON — structured per-story data collection

### Post-MVP (Growth)

- Parallel stories within epics — nested worktrees or sequential with faster cycling
- DAG-based epic scheduling — dependency-aware parallel scheduling from epic declarations
- Dynamic parallelism — adjust concurrent lanes based on API rate limits and cost
- Parallel task execution within stories (e.g., implement + lint)

## User Journeys

### Journey 1: BMad — Running a Parallel Sprint

BMad has a 19-story sprint across 6 epics. Epics 10 and 14 have no dependency on each other. Today this takes 8+ hours sequentially.

**Opening:** BMad edits the workflow YAML:
```yaml
execution:
  max_parallel: 2
  isolation: worktree
  epic_strategy: parallel
  story_strategy: sequential
```
Runs `codeharness run`. The engine reads the epic dependency graph, identifies epic-10 and epic-14 as independent, and creates two git worktrees: `epic-10-driver-interface` and `epic-14-tui-workflow`.

**Rising Action:** The TUI shows two lanes:
```
━━━ Lane 1: Epic 10 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10-1 ◆  →  10-2  →  10-3  →  10-4  →  10-5
  claude-code
  $0.42 / 4m
━━━ Lane 2: Epic 14 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  14-1 ◆  →  14-2  →  14-3
  claude-code
  $0.31 / 3m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Done: (none yet)  |  Active: 2 lanes  |  Pending: 4 epics
```
Both epics execute simultaneously, each in its own worktree. Stories within each epic run sequentially.

**Climax:** Epic 14 finishes first (3 stories vs 5). The engine runs the per-epic telemetry summary, then triggers the epic-14 retro task (analyst agent reads telemetry, produces findings). Then it merges the `epic-14-tui-workflow` branch back to main. The cross-worktree test suite runs on the merged result — all tests pass. The worktree is cleaned up. Lane 2 picks up epic-11 (next independent epic).

**Resolution:** The sprint completes in 4.5 hours instead of 8+. BMad glances at the TUI — 6 epics done, 2 merge conflicts auto-resolved by the merge agent, 0 manual interventions, total cost $245 (vs $271 sequential due to fewer rate-limit waits).

---

### Journey 2: The Engine — Handling a Merge Conflict

Epic 10 (driver interface) and epic 11 (workflow schema) both modified `workflow-engine.ts`. Epic 10 finishes and merges cleanly. Epic 11 finishes, and the merge hits a conflict.

**Opening:** The engine detects the conflict after `git merge` returns non-zero. It reads the conflict markers from `workflow-engine.ts`.

**Rising Action:** The engine dispatches a merge agent (dev agent with merge context):
```
Merge conflict in src/lib/workflow-engine.ts

Epic 10 changes: Added driver factory resolution in dispatchTaskWithResult()
Epic 11 changes: Added driver/model validation in parseWorkflow()

Both changes are in different functions — no semantic conflict, only git hunk overlap.
```

**Climax:** The merge agent resolves the conflict — both changes are additive, different functions, no semantic overlap. It commits the resolution. The cross-worktree test suite runs — all tests pass.

**Resolution:** The merge completes automatically. The TUI shows: `[MERGE] epic-11 → main: auto-resolved (1 file)`. BMad never opened a terminal.

---

### Journey 3: BMad — Watching Telemetry Replace Retros

BMad used to get a $9 LLM-generated retro after every session. Now telemetry collects data for free.

**Opening:** After each story completes, the engine writes a telemetry entry to `.codeharness/telemetry.jsonl` — cost, duration, retries, files changed, test results. Zero tokens.

**Rising Action:** When epic 10 completes (5 stories), the engine triggers the `retro` task (`scope: per-epic`, `agent: analyst`). The analyst reads all 5 telemetry entries and produces a focused retro: "Story 10-3 had 3 retries due to Agent SDK error classification edge case. Story 10-5 was the cheapest at $3.20."

**Resolution:** One $8 retro per epic instead of five $9 retros per session. Same quality, 80% less cost. Telemetry data is structured JSON — queryable, aggregatable, no LLM parsing needed.

---

### Journey 4: The Engine — Zero-Token Telemetry Collection

The `telemetry` task has `agent: null`. The engine handles it directly.

**Opening:** Story 10-1 completes. The engine's flow reaches the `telemetry` step.

**Rising Action:** Instead of dispatching to a driver, the engine collects data from its own state: story key, duration, cost from driver's `getLastCost()`, changed files from output contract, test results from output contract, retry count from state.

**Climax:** The engine writes one NDJSON line to `.codeharness/telemetry.jsonl`. Zero API calls. Zero tokens. <1ms.

**Resolution:** The engine moves to the next flow step. The TUI doesn't even show a task transition — telemetry is invisible infrastructure.

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| **BMad — Parallel Sprint** | Worktree creation, parallel epic scheduling, multi-lane TUI, merge + test validation, worktree cleanup |
| **Engine — Merge Conflict** | Merge agent dispatch, conflict detection, resolution context, cross-worktree test validation |
| **BMad — Telemetry Replaces Retros** | agent: null tasks, scope: per-epic, telemetry NDJSON, epic retro synthesis |
| **Engine — Zero-Token Telemetry** | agent: null execution, output contract data extraction, NDJSON append |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Worktree-Isolated Parallel Execution**

No existing autonomous coding tool parallelizes across git worktrees. Claude Code's Agent tool supports `isolation: "worktree"` for subagents, but no orchestrator manages multiple concurrent worktrees with lifecycle, merge, and test validation.

**2. Hierarchical Flow Model**

Existing workflow engines (GitHub Actions, CircleCI) have flat or two-level flows. codeharness introduces three-level hierarchical flow (sprint → epic → story) where each level has its own task types, scoping rules, and lifecycle hooks.

**3. Zero-Token Engine Tasks**

`agent: null` is a new pattern — workflow tasks that the engine handles directly without LLM dispatch. This blurs the line between orchestration and execution, making the engine a hybrid of scheduler and data collector.

**4. Merge Agent Pattern**

LLM-powered merge conflict resolution with full semantic context from both branches. Not a text-level merge — the agent understands what both epics were building and resolves accordingly.

## Developer Tool Specific Requirements

### Technical Architecture Considerations

**Worktree Management:**
- `git worktree add` to create isolated working directories per epic
- Each worktree on its own branch: `epic-{N}-{slug}`
- Stories execute sequentially within worktree
- On epic completion: `git merge` branch into main, run tests, cleanup worktree

**Hierarchical State:**
- Sprint state: which epics are active, which lanes are occupied
- Epic state: which stories are done/in-progress within this epic's worktree
- Story state: existing task checkpointing (unchanged)
- All state files live in the worktree — no shared mutable state

**Parallel Orchestration:**
- `max_parallel` configurable (default 2)
- Engine maintains a lane pool — when a lane frees up, next independent epic starts
- Epic dependency graph built from sprint-state.json epic ordering + explicit dependencies

**TUI Multi-Lane:**
- Each lane renders its own workflow graph (from multi-framework PRD)
- Lanes stack vertically with separators
- Summary bar at bottom: active lanes, total cost, merge status

### Workflow YAML Extensions

```yaml
execution:
  max_parallel: 2           # concurrent worktrees
  isolation: worktree       # or 'none' for sequential
  merge_strategy: rebase    # or 'merge-commit'
  epic_strategy: parallel   # or 'sequential'
  story_strategy: sequential # or 'parallel' (post-MVP)

story_flow:                 # per-story task pipeline
  - implement
  - verify
  - loop:
      - retry
      - verify
  - telemetry               # agent: null

epic_flow:                  # runs when epic completes
  - retro                   # agent: analyst, scope: per-epic
  - merge                   # built-in: merge worktree → main
  - validate                # built-in: run test suite on merged result
```

## Functional Requirements

### Hierarchical Flow Model

- FR1: User can define `story_flow`, `epic_flow`, and `execution` sections in workflow YAML
- FR2: System can parse and validate the hierarchical flow model with backward compatibility (flat `flow:` still works)
- FR3: System can execute story-level flow for each story within an epic
- FR4: System can execute epic-level flow when all stories in an epic complete
- FR5: System can schedule epics according to `epic_strategy` (parallel or sequential)

### Parallel Execution & Worktrees

- FR6: System can create a git worktree for each parallel epic dispatch
- FR7: System can create a git branch per epic (`epic-{N}-{slug}`)
- FR8: System can execute stories sequentially within a worktree
- FR9: System can manage a lane pool limited by `max_parallel`
- FR10: System can detect epic independence (no dependency on in-progress epics) for parallel scheduling
- FR11: System can clean up worktrees and branches after epic completion and successful merge

### Merge & Validation

- FR12: System can merge an epic's branch into main after epic completion
- FR13: System can detect merge conflicts from failed `git merge`
- FR14: System can dispatch a merge agent with conflict context from both branches
- FR15: System can run the full test suite on the merged result before accepting
- FR16: System can reject a merge and escalate to the user if tests fail after conflict resolution
- FR17: User can configure merge strategy (rebase or merge-commit)

### Engine-Handled Tasks

- FR18: System can execute tasks with `agent: null` directly in the engine without LLM dispatch
- FR19: System can collect structured telemetry data (cost, duration, retries, files, tests) per story
- FR20: System can write telemetry entries as NDJSON to `.codeharness/telemetry.jsonl`
- FR21: System can read telemetry entries for a specific epic and inject as context into the retro task

### Scope: Per-Epic

- FR22: System can detect when all stories in an epic have reached `done` status
- FR23: System can trigger `epic_flow` tasks (retro, merge, validate) on epic completion
- FR24: System can track epic-level state (in-progress, merging, done) separately from story-level state

### Verify Flag Optimization

- FR25: System can set `tests_passed` and `coverage_met` flags from the dev task's output contract
- FR26: System can skip coverage re-run during verification if coverage result exists in output contract

### Multi-Lane TUI

- FR27: System can render multiple concurrent workflow graphs (one per active lane) in the Ink TUI
- FR28: System can display a summary bar showing active lanes, total cost, and merge status
- FR29: System can show merge progress and conflict resolution status in the TUI
- FR30: System can render lane completion (worktree merged, tests passed) as a distinct visual state

### Out of Scope (Explicitly Excluded from MVP)

- Parallel stories within epics (post-MVP)
- DAG-based epic scheduling from explicit dependency declarations (post-MVP)
- Dynamic parallelism adjustment based on API rate limits (post-MVP)

## Non-Functional Requirements

### Performance

- NFR1: Worktree creation must complete within 10 seconds per epic
- NFR2: Multi-lane TUI must render at 15 FPS with up to 4 concurrent lanes
- NFR3: Telemetry NDJSON write must complete within 10ms per entry
- NFR4: Merge operation (non-conflicting) must complete within 30 seconds
- NFR5: Cross-worktree test suite must complete within the project's normal test timeout

### Reliability

- NFR6: If a worktree's execution crashes, other lanes must continue unaffected
- NFR7: If merge fails after 3 agent resolution attempts, escalate to user — do not retry indefinitely
- NFR8: Sprint state must remain consistent across all worktrees — no concurrent write corruption
- NFR9: Orphaned worktrees must be detected and cleaned up on next `codeharness run`
- NFR10: `max_parallel: 1` must produce identical behavior and results to current sequential execution

### Integration

- NFR11: Git worktree commands must work with the project's existing git hooks
- NFR12: Worktree branches must not conflict with user's existing branches (prefix with `codeharness/`)
- NFR13: Telemetry NDJSON format must be stable across versions (versioned entries)
