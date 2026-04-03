---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - prd.md (parallel execution PRD, 30 FRs, 13 NFRs)
  - architecture-parallel-execution.md (8 decisions)
  - ux-design-parallel-execution.md (multi-lane TUI UX)
---

# codeharness - Epic Breakdown (Parallel Execution)

## Overview

This document provides the complete epic and story breakdown for codeharness parallel execution, decomposing 30 FRs into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: User can define story_flow, epic_flow, and execution sections in workflow YAML
- FR2: System can parse and validate the hierarchical flow model with backward compatibility
- FR3: System can execute story-level flow for each story within an epic
- FR4: System can execute epic-level flow when all stories in an epic complete
- FR5: System can schedule epics according to epic_strategy (parallel or sequential)
- FR6: System can create a git worktree for each parallel epic dispatch
- FR7: System can create a git branch per epic
- FR8: System can execute stories sequentially within a worktree
- FR9: System can manage a lane pool limited by max_parallel
- FR10: System can detect epic independence for parallel scheduling
- FR11: System can clean up worktrees and branches after epic completion
- FR12: System can merge an epic's branch into main after epic completion
- FR13: System can detect merge conflicts from failed git merge
- FR14: System can dispatch a merge agent with conflict context from both branches
- FR15: System can run the full test suite on the merged result before accepting
- FR16: System can reject a merge and escalate if tests fail after resolution
- FR17: User can configure merge strategy (rebase or merge-commit)
- FR18: System can execute tasks with agent: null directly without LLM dispatch
- FR19: System can collect structured telemetry data per story
- FR20: System can write telemetry entries as NDJSON to .codeharness/telemetry.jsonl
- FR21: System can read telemetry entries for a specific epic and inject as retro context
- FR22: System can detect when all stories in an epic have reached done status
- FR23: System can trigger epic_flow tasks on epic completion
- FR24: System can track epic-level state separately from story-level state
- FR25: System can set tests_passed and coverage_met flags from dev task output contract
- FR26: System can skip coverage re-run during verification if coverage exists in contract
- FR27: System can render multiple concurrent workflow graphs in the Ink TUI
- FR28: System can display a summary bar showing active lanes, total cost, merge status
- FR29: System can show merge progress and conflict resolution status in the TUI
- FR30: System can render lane completion as a distinct visual state

### Non-Functional Requirements

- NFR1-NFR5: Performance (worktree <10s, TUI 15 FPS, telemetry <10ms, merge <30s)
- NFR6-NFR10: Reliability (crash isolation, merge retry limit, state consistency, orphan cleanup, backward compat)
- NFR11-NFR13: Integration (git hooks compat, branch prefix, telemetry format stability)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 16 | Hierarchical flow YAML sections |
| FR2 | Epic 16 | Parse/validate with backward compat |
| FR3 | Epic 16 | Execute story-level flow |
| FR4 | Epic 16 | Execute epic-level flow |
| FR5 | Epic 16 | Schedule epics by strategy |
| FR6 | Epic 17 | Create git worktree per epic |
| FR7 | Epic 17 | Create git branch per epic |
| FR8 | Epic 17 | Execute stories in worktree |
| FR9 | Epic 17 | Lane pool with max_parallel |
| FR10 | Epic 17 | Detect epic independence |
| FR11 | Epic 17 | Clean up worktrees/branches |
| FR12 | Epic 18 | Merge epic branch to main |
| FR13 | Epic 18 | Detect merge conflicts |
| FR14 | Epic 18 | Dispatch merge agent |
| FR15 | Epic 18 | Cross-worktree test validation |
| FR16 | Epic 18 | Reject merge + escalate |
| FR17 | Epic 18 | Configure merge strategy |
| FR18 | Epic 16 | agent: null execution |
| FR19 | Epic 16 | Collect telemetry data |
| FR20 | Epic 16 | Write telemetry NDJSON |
| FR21 | Epic 16 | Read telemetry for retro injection |
| FR22 | Epic 19 | Detect epic completion |
| FR23 | Epic 19 | Trigger epic_flow |
| FR24 | Epic 19 | Track epic-level state |
| FR25 | Epic 16 | Engine sets verify flags |
| FR26 | Epic 16 | Coverage deduplication |
| FR27 | Epic 20 | Multi-lane workflow graphs |
| FR28 | Epic 20 | Summary bar |
| FR29 | Epic 20 | Merge status in TUI |
| FR30 | Epic 20 | Lane completion visual state |

## Epic List

### Epic 16: Hierarchical Flow Model & Engine-Handled Tasks
Users can define story_flow, epic_flow, and execution sections in workflow YAML. Tasks with agent: null execute directly in the engine. Existing flat flow: still works. Verify flags set from output contract.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR18, FR19, FR20, FR21, FR25, FR26

### Epic 17: Worktree Management & Lane Pool
Users can run parallel epics in isolated git worktrees. Lane pool schedules epics concurrently up to max_parallel.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11

### Epic 18: Merge Agent & Cross-Worktree Validation
Epic branches merge to main with auto-conflict resolution and test validation.
**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17

### Epic 19: Epic Completion & Lifecycle
System detects epic completion and triggers epic_flow tasks.
**FRs covered:** FR22, FR23, FR24

### Epic 20: Multi-Lane TUI
TUI renders concurrent lanes with merge status and summary bar.
**FRs covered:** FR27, FR28, FR29, FR30

## Epic 16: Hierarchical Flow Model & Engine-Handled Tasks

Users can define hierarchical workflows with engine-handled zero-token tasks, verify flag propagation, and telemetry collection.

### Story 16.1: Hierarchical Flow Schema & Parser

As a user,
I want to define `execution`, `story_flow`, and `epic_flow` sections in workflow YAML,
So that I can configure sprint-level, epic-level, and story-level behavior separately.

**Acceptance Criteria:**

**Given** `src/schemas/workflow.schema.json`
**When** updated with `execution`, `story_flow`, and `epic_flow` sections
**Then** `execution` supports `max_parallel`, `isolation`, `merge_strategy`, `epic_strategy`, `story_strategy`
**And** `story_flow` accepts the same format as existing `flow` (task refs + loop blocks)
**And** `epic_flow` accepts task refs including built-in names `merge` and `validate`
**And** existing workflows with only `flow:` parse successfully (backward compat — treated as `story_flow`)
**And** `workflow-parser.ts` resolves hierarchical flow via `hierarchical-flow.ts`
**And** validation rejects `story_flow` tasks not defined in `tasks:` section

### Story 16.2: Engine-Handled Null Tasks

As a developer,
I want tasks with `agent: null` to execute directly in the engine without LLM dispatch,
So that telemetry collection and state bookkeeping cost zero tokens.

**Acceptance Criteria:**

**Given** a task definition with `agent: null` in workflow YAML
**When** the workflow engine reaches this task in the flow
**Then** the engine looks up the task name in the null task handler registry
**And** calls the handler directly (no driver dispatch, no stream events)
**And** the handler receives `TaskContext` with story key, cost, duration, output contract
**And** unknown null task names produce a descriptive error
**And** null tasks complete in <10ms for data collection operations

### Story 16.3: Telemetry Writer

As a developer,
I want structured telemetry written as NDJSON after each story completes,
So that epic retros have rich data without per-session LLM cost.

**Acceptance Criteria:**

**Given** a new `src/lib/telemetry-writer.ts`
**When** the `telemetry` null task handler runs after a story
**Then** it writes one NDJSON line to `.codeharness/telemetry.jsonl`
**And** each entry includes: version, timestamp, storyKey, epicId, duration_ms, cost_usd, attempts, acResults, filesChanged, testResults, errors
**And** fields not available are set to `null` (never fabricated)
**And** writes are append-only with `appendFileSync`
**And** telemetry entries include `version: 1` for forward compatibility
**And** a `readTelemetryForEpic(epicId)` function returns all entries for a given epic

### Story 16.4: Verify Flag Propagation

As a developer,
I want the engine to set `tests_passed` and `coverage_met` from the dev task's output contract,
So that verification doesn't fail on missing flags set by subagents.

**Acceptance Criteria:**

**Given** the implement task completes with an output contract containing `testResults`
**When** `testResults.failed === 0`
**Then** the engine sets `tests_passed = true` in the state file
**And** when `testResults.coverage >= coverage.target`
**Then** the engine sets `coverage_met = true` in the state file
**And** the verify task no longer needs to set these flags itself
**And** existing behavior is preserved when output contract has no testResults

### Story 16.5: Coverage Deduplication

As a developer,
I want the verify phase to read coverage from the output contract instead of re-running,
So that coverage is not computed twice per story.

**Acceptance Criteria:**

**Given** the implement task's output contract contains `testResults.coverage`
**When** the verify task starts
**Then** if `coverage_met` is already true (set by engine in 16.4), skip coverage re-run
**And** the evaluator prompt includes coverage result from the contract as context
**And** if no coverage data exists in the contract, verify runs coverage normally (fallback)

### Story 16.6: Story Flow Execution

As a developer,
I want the workflow engine to execute `story_flow` for each story within an epic,
So that the hierarchical flow model drives story-level execution.

**Acceptance Criteria:**

**Given** a workflow with `story_flow: [implement, verify, loop: [retry, verify], telemetry]`
**When** the engine processes an epic's stories
**Then** each story runs through the complete story_flow pipeline
**And** the `telemetry` null task runs after verify completes (or after loop exits)
**And** story_flow respects existing loop semantics (max iterations, circuit breaker)
**And** backward compat: workflows with `flow:` (no `story_flow`) produce identical behavior

## Epic 17: Worktree Management & Lane Pool

Users can run epics in parallel using git worktree isolation with configurable concurrency.

### Story 17.1: Worktree Manager

As a developer,
I want a worktree manager that handles git worktree create/merge/cleanup,
So that parallel epics run in isolated working directories.

**Acceptance Criteria:**

**Given** a new `src/lib/worktree-manager.ts`
**When** `createWorktree(epicId, slug)` is called
**Then** it creates branch `codeharness/epic-{N}-{slug}` from main
**And** creates worktree at `/tmp/codeharness-wt-epic-{N}`
**And** returns the worktree path
**And** creation completes within 10 seconds (NFR1)
**And** `cleanupWorktree(epicId)` removes worktree and deletes branch
**And** `listWorktrees()` returns all active codeharness worktrees
**And** orphaned worktrees (from previous crashed runs) are detected and reported

### Story 17.2: Lane Pool

As a developer,
I want a lane pool that schedules epics concurrently up to `max_parallel`,
So that the engine runs multiple epics simultaneously.

**Acceptance Criteria:**

**Given** a new `src/lib/lane-pool.ts`
**When** `startPool(epics, maxParallel)` is called
**Then** it creates up to `maxParallel` lanes simultaneously
**And** each lane creates a worktree and runs the workflow engine for that epic's stories
**And** `Promise.race` on active lanes detects completion
**And** when a lane completes, the next independent epic is scheduled
**And** epic independence is determined by epic ordering (epic N only if no epic < N is active, except done)
**And** the pool emits `LaneEvent` objects for TUI consumption
**And** `maxParallel: 1` produces sequential execution identical to current behavior (NFR10)

### Story 17.3: Run Command Parallel Integration

As a user,
I want `codeharness run` to use the lane pool when `execution.epic_strategy: parallel`,
So that parallel execution works end-to-end.

**Acceptance Criteria:**

**Given** a workflow with `execution: { max_parallel: 2, epic_strategy: parallel }`
**When** `codeharness run` executes
**Then** the run command reads `execution` config from the resolved workflow
**And** creates a lane pool with `max_parallel` from config
**And** passes all pending epics (from sprint state) to the pool
**And** stories within each epic execute sequentially in their worktree
**And** crash in one lane does not affect other lanes (NFR6)
**And** the run command reports final results from all lanes

## Epic 18: Merge Agent & Cross-Worktree Validation

Epic branches merge to main with automated conflict resolution and test validation.

### Story 18.1: Merge Serialization & Execution

As a developer,
I want epic branches to merge into main one at a time with full test validation,
So that merged code is always tested and conflicts don't race.

**Acceptance Criteria:**

**Given** `worktree-manager.ts` gains `mergeWorktree(epicId)` method
**When** an epic completes and merge is triggered
**Then** a mutex ensures only one merge runs at a time
**And** `git merge codeharness/epic-{N}-{slug}` executes on main
**And** if merge succeeds (no conflicts), the full test suite runs on merged result
**And** if tests pass, worktree is cleaned up
**And** merge completes within 30 seconds for non-conflicting cases (NFR4)
**And** user can configure merge strategy (rebase or merge-commit) via `execution.merge_strategy`

### Story 18.2: Merge Agent for Conflict Resolution

As a developer,
I want a merge agent that resolves git conflicts with semantic context,
So that parallel epics don't require manual conflict resolution.

**Acceptance Criteria:**

**Given** a new `src/lib/merge-agent.ts`
**When** `git merge` returns conflicts
**Then** the merge agent is dispatched with: conflicting files, main content, branch content, both epics' descriptions
**And** the agent resolves conflicts by understanding what both epics built
**And** after resolution, the test suite runs on the merged result
**And** if tests fail, the merge is reverted and the agent retries (up to 3 attempts)
**And** after 3 failures, the merge is escalated: worktree and branch preserved, user notified with instructions
**And** escalation message includes: worktree path, branch name, conflicting files, and `git diff` command

### Story 18.3: Cross-Worktree Test Validation

As a developer,
I want the full test suite to run after every merge,
So that merged code is proven to work before accepting.

**Acceptance Criteria:**

**Given** a successful merge (clean or agent-resolved)
**When** the test suite runs on the merged main
**Then** all tests must pass for the merge to be accepted
**And** if tests fail after clean merge, the merge is reverted and escalated immediately
**And** if tests fail after agent resolution, revert and retry agent with test failure context
**And** test suite runs within the project's configured test timeout
**And** test results (pass/fail count, coverage) are logged to telemetry

## Epic 19: Epic Completion & Lifecycle

System detects epic completion and triggers epic_flow tasks in sequence.

### Story 19.1: Epic Completion Detection

As a developer,
I want the engine to detect when all stories in an epic are done,
So that epic_flow tasks are triggered automatically.

**Acceptance Criteria:**

**Given** a new `src/lib/epic-completion.ts`
**When** a story reaches `done` status
**Then** the engine checks if all stories in that epic are `done`
**And** if yes, the epic state transitions from `in-progress` to `completing`
**And** `epic_flow` tasks are triggered in sequence (retro → merge → validate)
**And** epic state tracks: `in-progress → completing → merging → validating → done`
**And** if merge fails, epic state becomes `failed` (worktree preserved)

### Story 19.2: Epic Flow Execution

As a developer,
I want `epic_flow` tasks to execute in sequence when an epic completes,
So that retro, merge, and validate happen automatically.

**Acceptance Criteria:**

**Given** an epic reaches `completing` state
**When** `epic_flow` is `[retro, merge, validate]`
**Then** `retro` dispatches the analyst agent with telemetry data for this epic (from FR21)
**And** `merge` calls `worktree-manager.mergeWorktree()` (built-in, no agent)
**And** `validate` runs the test suite on merged result (built-in, no agent)
**And** each step updates epic state (completing → merging → validating → done)
**And** if any step fails, subsequent steps are skipped and epic is marked `failed`
**And** the lane is freed for the next epic after completion or failure

## Epic 20: Multi-Lane TUI

TUI renders concurrent lanes with merge status and responsive layout.

### Story 20.1: Lane Container & Lane Components

As a user,
I want to see multiple epic lanes in the TUI during parallel execution,
So that I can track progress across all active worktrees.

**Acceptance Criteria:**

**Given** new `src/lib/ink-lane.tsx` and `src/lib/ink-lane-container.tsx`
**When** 2 lanes are active
**Then** the TUI renders lanes side-by-side (terminal >= 120 cols) or stacked (80-119 cols) or single (<80 cols)
**And** each lane shows: epic title, current story + phase, story progress bar, driver + cost/time
**And** lanes 3+ collapse to one-line summaries: `Lane N: Epic Title │ story ◆ phase │ $cost / time`
**And** single lane mode (`max_parallel: 1`) renders identically to current single-lane TUI

### Story 20.2: Summary Bar & Merge Status

As a user,
I want to see done/merging/pending counts and merge progress in the TUI,
So that I know the sprint's overall state at a glance.

**Acceptance Criteria:**

**Given** new `src/lib/ink-summary-bar.tsx` and `src/lib/ink-merge-status.tsx`
**When** rendered between lanes and activity section
**Then** summary bar shows: `Done: X stories │ Merging: epic-N → main ◌ │ Pending: epic-A, epic-B`
**And** merge status shows: merge in progress (spinner), clean merge (green), conflict resolving (yellow), escalated (red)
**And** post-merge test results shown: pass count, coverage
**And** lane completion event: `[OK] Lane N: Epic X complete (stories, cost, time)`

### Story 20.3: Lane Event Routing & Activity Display

As a user,
I want the activity section to show the most recently active lane's tool calls,
So that I can see what's happening without noise from all lanes.

**Acceptance Criteria:**

**Given** the existing activity display (tool calls, thoughts, retries)
**When** multiple lanes are producing stream events
**Then** the activity section shows events from the most recently active lane only
**And** the active lane is indicated: `[Lane 1 ▸]` in the activity header
**And** `Ctrl+L` cycles which lane's activity is displayed
**And** TUI remains responsive at 15 FPS with up to 4 concurrent lanes (NFR2)
**And** a crashed lane does not freeze the TUI (NFR6 — event stream ends, lane marked failed)
