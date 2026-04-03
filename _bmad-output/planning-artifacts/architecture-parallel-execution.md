---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-03'
inputDocuments:
  - prd.md (parallel execution PRD, 30 FRs, 13 NFRs)
  - ux-design-parallel-execution.md (multi-lane TUI UX spec)
  - architecture-multi-framework.md (workflow engine architecture, brownfield)
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-04-03'
---

# Architecture Decision Document — Parallel Execution

_Extends architecture-multi-framework.md. All prior decisions (driver interface, output contracts, model resolution, TUI components) remain valid._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
30 FRs across 7 capability areas. Core is parallel epic execution via git worktrees (FR6-FR11), merge + validation (FR12-FR17), engine-handled null tasks (FR18-FR21), hierarchical flow model (FR1-FR5), per-epic scope (FR22-FR24), verify flag optimization (FR25-FR26), and multi-lane TUI (FR27-FR30).

**Non-Functional Requirements:**
13 NFRs. Worktree creation <10s, multi-lane TUI at 15 FPS with 4 lanes, telemetry writes <10ms, merge <30s (non-conflicting), crash isolation between lanes, no orphaned worktrees, backward compatibility at max_parallel=1.

**UX Requirements:**
Multi-lane TUI with side-by-side lanes (>=120 cols), stacked (80-119), single (<80). Merge status as first-class display element. Lane lifecycle events visible. Telemetry invisible by default. New Ink components: LaneContainer, Lane, CollapsedLanes, SummaryBar, MergeStatus.

**Scale & Complexity:**

- Primary domain: Node.js CLI with multi-process orchestration and git worktree management
- Complexity level: High — concurrent process management, git branch lifecycle, merge conflict resolution via LLM, hierarchical state machines
- Estimated new components: ~12 (worktree manager, lane pool, merge agent, hierarchical flow parser, epic completion detector, telemetry writer, 6 new Ink components)

### Technical Constraints & Dependencies

- **Git worktrees** — `git worktree add/remove/list`. Requires git >= 2.15. Each worktree is a separate working directory on a separate branch. Git operations must be atomic per worktree — no concurrent git commands on the same worktree.
- **Process isolation** — Each lane runs its own workflow engine instance (or async task). Lanes share the sprint-state.json on main only at merge boundaries.
- **Existing workflow engine** — Currently single-threaded, sequential. Must be refactored to support concurrent instances operating on different working directories.
- **Ink TUI** — Single React render tree. Multi-lane rendering is layout, not multi-instance. All lanes feed into the same Ink render loop.
- **State file** — sprint-state.json lives on main branch. Worktree-local state tracks per-epic progress. Merge reconciles worktree state back into main state.

### Cross-Cutting Concerns

1. **Concurrent git operations** — Two worktrees can `git commit` simultaneously (different branches), but `git merge` must be serialized (modifies main).
2. **State synchronization** — Sprint-state.json on main is the source of truth. Worktree-local state files track epic progress. Merge merges both code and state.
3. **Resource contention** — Multiple agent dispatches consume API rate limits from the same account. Lane pool must respect global rate limits.
4. **Error blast radius** — A crash in one lane must not corrupt another lane's worktree or state.

## Starter Template Evaluation

### Selected Starter: Existing codebase

**Rationale:** Brownfield. Extends the workflow engine, adds git and multi-lane orchestration modules.

**New modules to add:**

```
src/lib/
├── worktree-manager.ts       # NEW — git worktree create/merge/cleanup lifecycle
├── lane-pool.ts              # NEW — manages concurrent lanes, scheduling
├── merge-agent.ts            # NEW — dispatches dev agent for conflict resolution
├── telemetry-writer.ts       # NEW — NDJSON append for per-story telemetry
├── hierarchical-flow.ts      # NEW — parses story_flow/epic_flow/execution from YAML
├── epic-completion.ts        # NEW — detects all-stories-done, triggers epic_flow

src/lib/ink-lane.tsx          # NEW — Lane component (per-epic workflow view)
src/lib/ink-lane-container.tsx # NEW — LaneContainer (side-by-side layout)
src/lib/ink-summary-bar.tsx   # NEW — SummaryBar (done/merging/pending)
src/lib/ink-merge-status.tsx  # NEW — MergeStatus (conflict resolution display)
src/lib/ink-collapsed-lanes.tsx # NEW — CollapsedLanes (one-line summaries)

src/schemas/
├── workflow.schema.json      # MODIFY — add execution, story_flow, epic_flow sections
├── telemetry.schema.json     # NEW — NDJSON entry schema
```

## Core Architectural Decisions

### Decision 1: Worktree Lifecycle Model

**Decision:** Each parallel epic gets its own git worktree on a dedicated branch. The worktree manager handles the full lifecycle: create → execute → merge → validate → cleanup.

**Worktree creation:**
```bash
git branch codeharness/epic-{N}-{slug} main
git worktree add /tmp/codeharness-wt-epic-{N} codeharness/epic-{N}-{slug}
```

**Branch naming:** `codeharness/` prefix prevents collision with user branches (NFR12).

**Worktree location:** `/tmp/codeharness-wt-epic-{N}` — temporary, cleaned up after merge. User-visible in TUI and `codeharness status`.

**Merge flow (serialized — only one merge at a time):**
```
1. git checkout main
2. git merge codeharness/epic-{N}-{slug}
3. If conflict → dispatch merge agent
4. If resolved → run test suite
5. If tests pass → git worktree remove → git branch -d
6. If tests fail → revert merge, retry agent (up to 3 attempts), escalate
```

**Rationale:** Git worktrees are the lightest isolation primitive — no clone overhead, shared object store. The `/tmp` location makes cleanup obvious. Branch prefix prevents accidental collision.

### Decision 2: Lane Pool & Scheduling

**Decision:** The engine maintains a fixed-size lane pool. Each lane is an async task (not a separate process) that runs a workflow engine instance against a worktree directory.

**Pool structure:**
```typescript
interface LanePool {
  maxLanes: number;           // from execution.max_parallel
  activeLanes: Map<string, Lane>;  // epicId → Lane
  pendingEpics: string[];     // ordered queue of epics to schedule
  mergeQueue: string[];       // epics waiting to merge (serialized)
}

interface Lane {
  epicId: string;
  worktreePath: string;
  branch: string;
  engineInstance: Promise<EngineResult>;  // async workflow execution
  status: 'executing' | 'merging' | 'validating' | 'done' | 'failed';
}
```

**Scheduling:** When a lane frees up, the pool picks the next epic from `pendingEpics` that has no dependency on any `activeLane` epic. For MVP, dependency is determined by epic ordering — epic N can only run if no epic < N is still active (except completed ones). Post-MVP: explicit DAG from epic declarations.

**Concurrency model:** `Promise.race()` on active lanes. When any lane completes, its result is processed (merge queued), and next epic scheduled.

```typescript
while (pendingEpics.length > 0 || activeLanes.size > 0) {
  // Fill lanes up to max
  while (activeLanes.size < maxLanes && hasReadyEpic()) {
    const epic = nextReadyEpic();
    const lane = await createLane(epic);
    activeLanes.set(epic.id, lane);
  }
  // Wait for any lane to complete
  const completed = await Promise.race(
    [...activeLanes.values()].map(l => l.engineInstance)
  );
  // Process completion: queue merge, free lane
  await processLaneCompletion(completed);
}
```

**Rationale:** Async tasks (not processes) share the Node.js event loop — simpler than multi-process, and the engine already uses `async/await` throughout. `Promise.race` gives natural lane completion handling.

### Decision 3: Merge Serialization & Agent

**Decision:** Merges are serialized — only one `git merge` into main at a time. Conflicts dispatch a merge agent (dev agent with conflict context). Cross-worktree test validation runs after every merge.

**Merge serialization:**
```typescript
const mergeMutex = new Mutex();

async function mergeEpic(epic: Lane): Promise<MergeResult> {
  const release = await mergeMutex.acquire();
  try {
    const result = await gitMerge(epic.branch);
    if (result.conflicts.length > 0) {
      return await resolveMergeConflicts(epic, result.conflicts);
    }
    await runTestSuite();
    await cleanupWorktree(epic);
    return { success: true };
  } finally {
    release();
  }
}
```

**Merge agent context:**
```typescript
const mergePrompt = `
Merge conflict in ${file}:
<<<<<<< main
${mainContent}
=======
${branchContent}
>>>>>>> ${branchName}

Context:
- Main branch: ${mainEpicDescription}
- Feature branch: ${branchEpicDescription}
- Both changes are from: ${whatBothEpicsWereBuilding}

Resolve the conflict preserving both changes. Both are correct additions.
`;
```

**Retry policy:** 3 attempts with merge agent. If all fail, escalate to user — preserve worktree and branch for manual resolution.

**Rationale:** Serialized merges prevent race conditions on main. The merge agent gets full semantic context, not just diff markers. 3 attempts is generous — most conflicts are additive (different functions in same file).

### Decision 4: Hierarchical Flow Model

**Decision:** Workflow YAML gains three sections: `execution` (sprint-level config), `story_flow` (per-story pipeline), `epic_flow` (per-epic completion tasks). The existing flat `flow:` is syntactic sugar for `story_flow:` with `execution: { max_parallel: 1 }`.

**Schema:**
```yaml
execution:
  max_parallel: 2
  isolation: worktree
  merge_strategy: rebase       # or merge-commit
  epic_strategy: parallel      # or sequential
  story_strategy: sequential   # or parallel (post-MVP)

tasks:
  implement: { agent: dev, scope: per-story }
  verify: { agent: evaluator, scope: per-run }
  retry: { agent: dev, scope: per-story }
  telemetry: { agent: null, scope: per-story }
  retro: { agent: analyst, scope: per-epic }

story_flow:
  - implement
  - verify
  - loop:
      - retry
      - verify
  - telemetry

epic_flow:
  - retro
  - merge       # built-in
  - validate    # built-in
```

**Backward compatibility:** If only `flow:` is present (no `story_flow`/`epic_flow`/`execution`), the engine treats it as `story_flow: <flow>` with `execution: { max_parallel: 1, epic_strategy: sequential }`. Zero behavior change for existing workflows.

**Built-in tasks:** `merge` and `validate` are engine-handled (like `agent: null`). They don't appear in `tasks:` — the engine recognizes them as built-in epic_flow steps.

**Rationale:** Three-level hierarchy maps naturally to sprint → epic → story. Backward compatibility means existing workflows work unchanged. Built-in merge/validate avoids forcing users to define agent configs for git operations.

### Decision 5: Engine-Handled Null Tasks

**Decision:** When a task has `agent: null`, the engine executes it directly without dispatching to any driver. The engine checks the task name and calls the corresponding handler.

**Handler registry:**
```typescript
const nullTaskHandlers: Record<string, NullTaskHandler> = {
  telemetry: writeTelemetryEntry,
  merge: mergeWorktreeToMain,
  validate: runCrossWorktreeTests,
};

interface NullTaskHandler {
  (context: TaskContext): Promise<TaskResult>;
}
```

**Telemetry handler:**
```typescript
async function writeTelemetryEntry(ctx: TaskContext): Promise<TaskResult> {
  const entry: TelemetryEntry = {
    version: 1,
    timestamp: new Date().toISOString(),
    storyKey: ctx.storyKey,
    epicId: ctx.epicId,
    duration_ms: ctx.elapsedMs,
    cost_usd: ctx.accumulatedCost,
    attempts: ctx.retryCount,
    acResults: ctx.lastVerdict?.acResults ?? null,
    filesChanged: ctx.outputContract?.changedFiles ?? [],
    testResults: ctx.outputContract?.testResults ?? null,
    errors: ctx.errors,
  };
  await appendNdjson('.codeharness/telemetry.jsonl', entry);
  return { success: true, output: 'telemetry written' };
}
```

**Rationale:** Null tasks are pure data operations — no LLM needed. The handler registry is extensible. New built-in tasks just add a handler function.

### Decision 6: Epic Completion Detection

**Decision:** The engine tracks per-epic story counts. When all stories in an epic reach `done`, the engine triggers `epic_flow` tasks in sequence.

**Detection logic:**
```typescript
function checkEpicCompletion(state: SprintState, epicId: string): boolean {
  const epicStories = getStoriesForEpic(state, epicId);
  return epicStories.every(s => s.status === 'done');
}
```

**Epic state transitions:**
- `backlog` → `in-progress`: when lane is created for this epic
- `in-progress` → `completing`: when all stories done, epic_flow starts
- `completing` → `merging`: epic_flow reaches merge step
- `merging` → `validating`: merge succeeded, running tests
- `validating` → `done`: tests passed, worktree cleaned
- `validating` → `failed`: tests failed after 3 merge agent attempts

**Rationale:** Epic completion is deterministic — just count done stories. The multi-step completion state (completing → merging → validating → done) gives the TUI and status command precise information about where the epic is in its lifecycle.

### Decision 7: Verify Flag Propagation

**Decision:** The workflow engine sets `tests_passed` and `coverage_met` from the dev task's output contract, before dispatching the verify task.

**Implementation:**
```typescript
// After implement task completes:
if (taskName === 'implement' && outputContract?.testResults) {
  const { passed, failed, coverage } = outputContract.testResults;
  if (failed === 0) await setState('tests_passed', true);
  if (coverage >= state.coverage.target) await setState('coverage_met', true);
}
```

**Coverage deduplication:** The verify task receives test results via output contract. The evaluator checks the contract's `testResults` field instead of re-running coverage. If `testResults.coverage >= target`, coverage is already met — no re-run.

**Rationale:** The engine has all the data it needs from the output contract. Setting flags in the engine is deterministic and reliable — no dependency on the evaluator's ability to set flags in a subagent context.

### Decision 8: Multi-Lane TUI Architecture

**Decision:** The Ink render tree gains a `LaneContainer` component that manages lane layout. Each lane is a `Lane` component wrapping existing `WorkflowGraph` + `StoryProgress`. The renderer receives events from all active lanes and routes them by lane ID.

**Event routing:**
```typescript
interface LaneEvent {
  laneId: string;        // epic ID
  event: StreamEvent;    // from driver
}

// Renderer maintains per-lane state
const laneStates: Map<string, LaneState> = new Map();

function updateLane(laneEvent: LaneEvent) {
  const state = laneStates.get(laneEvent.laneId);
  // Update lane-specific state (story, phase, cost, tools)
  // Only the most recently active lane shows in activity section
}
```

**Layout decision (from UX spec):**
- >=120 cols: side-by-side columns
- 80-119 cols: stacked vertically (compact)
- <80 cols: single active lane, others collapsed

**Component tree:**
```
<App>
  <Header />                     # Extended: lane count
  <Separator />
  <LaneContainer width={cols}>   # NEW: manages layout mode
    <Lane epicId="10" />         # NEW: per-epic view
    <Lane epicId="14" />
    <CollapsedLanes lanes={3+} /> # NEW: overflow
  </LaneContainer>
  <Separator />
  <SummaryBar />                 # NEW: done/merging/pending
  <MergeStatus />                # NEW: active merge progress
  <Separator />
  <ActivityDisplay laneId={activeLane} />  # Existing: filtered by lane
</App>
```

**Rationale:** Single Ink render tree with lane-routed state. No multiple Ink instances — that would break terminal rendering. The `LaneContainer` handles responsive layout based on terminal width.

## Implementation Patterns & Consistency Rules

### Worktree Operations Pattern

**All git operations MUST:**
- Use `child_process.execSync` for atomic git commands (create branch, add worktree)
- Use `child_process.exec` with timeout for potentially slow operations (merge, test suite)
- Capture stderr for error reporting
- Clean up on failure (remove partially created worktrees)

### Lane Isolation Pattern

**Each lane MUST:**
- Set `cwd` to its worktree path for all agent dispatches
- Write worktree-local state to `{worktreePath}/.codeharness/lane-state.json`
- Never read or write main branch's sprint-state.json during execution
- Report results back to the lane pool via the lane's `Promise<EngineResult>`

### Merge Safety Pattern

**Merge operations MUST:**
- Acquire the merge mutex before any git operation on main
- Run `git status` before merge to verify main is clean
- Run the full test suite after merge (not just affected tests)
- On test failure: revert merge (`git reset --hard HEAD~1`), retry with agent context
- On 3 failures: preserve worktree, log escalation, continue with other lanes

### Telemetry Write Pattern

**Telemetry entries MUST:**
- Use append-only NDJSON (one `JSON.stringify` + `\n` per entry)
- Include `version: 1` field for forward compatibility
- Write atomically — buffer the line, write with `appendFileSync`
- Never read from telemetry.jsonl during the run (write-only during execution)

## Project Structure & Boundaries

### New Files

```
src/lib/
├── worktree-manager.ts       # Git worktree lifecycle (create/merge/cleanup)
├── lane-pool.ts              # Lane scheduling, Promise.race loop
├── merge-agent.ts            # Conflict resolution dispatch
├── telemetry-writer.ts       # NDJSON append
├── hierarchical-flow.ts      # Parse execution/story_flow/epic_flow
├── epic-completion.ts        # All-stories-done detection
├── ink-lane.tsx              # Lane component
├── ink-lane-container.tsx    # Layout manager (side-by-side/stacked/single)
├── ink-summary-bar.tsx       # Done/merging/pending bar
├── ink-merge-status.tsx      # Merge progress display
├── ink-collapsed-lanes.tsx   # One-line lane summaries

src/schemas/
├── workflow.schema.json      # MODIFY: execution, story_flow, epic_flow
├── telemetry.schema.json     # NEW: NDJSON entry schema

test/
├── unit/
│   ├── worktree-manager.test.ts
│   ├── lane-pool.test.ts
│   ├── merge-agent.test.ts
│   ├── telemetry-writer.test.ts
│   ├── hierarchical-flow.test.ts
│   ├── epic-completion.test.ts
│   └── ink-lane-container.test.tsx
```

### Modified Files

```
src/lib/workflow-engine.ts    # Integrate lane pool, epic_flow, null tasks
src/lib/workflow-parser.ts    # Parse hierarchical flow YAML
src/lib/ink-app.tsx           # Add LaneContainer to render tree
src/lib/ink-renderer.tsx      # Lane event routing, multi-lane state
src/lib/ink-components.tsx    # Header extension (lane count)
src/commands/run.ts           # Parallel execution orchestration
src/commands/status.ts        # Parallel run status display
src/schemas/workflow.schema.json  # Execution, story_flow, epic_flow
```

### Architectural Boundaries

**Worktree Manager Boundary:**
- ONLY knows git operations. Does NOT know about agents, stories, or TUI.
- Interface: `createWorktree(epicId) → path`, `mergeWorktree(epicId) → MergeResult`, `cleanupWorktree(epicId)`

**Lane Pool Boundary:**
- Manages lane lifecycle and scheduling. Does NOT execute stories directly.
- Delegates to workflow engine instances per lane.
- Interface: `startPool(epics, maxParallel) → AsyncIterable<LaneEvent>`

**Merge Agent Boundary:**
- Wraps the dev agent with merge-specific context. Does NOT know about worktrees or lanes.
- Interface: `resolveConflict(conflicts, context) → Promise<boolean>`

**TUI Boundary:**
- Receives `LaneEvent` objects. Does NOT manage lanes or worktrees.
- Layout logic is purely presentational — responds to terminal width.

### FR to Structure Mapping

| FR Capability Area | Files |
|-------------------|-------|
| Hierarchical Flow (FR1-FR5) | `hierarchical-flow.ts`, `workflow-parser.ts`, `workflow.schema.json` |
| Parallel Execution (FR6-FR11) | `worktree-manager.ts`, `lane-pool.ts`, `run.ts` |
| Merge & Validation (FR12-FR17) | `worktree-manager.ts`, `merge-agent.ts` |
| Engine-Handled Tasks (FR18-FR21) | `workflow-engine.ts`, `telemetry-writer.ts` |
| Per-Epic Scope (FR22-FR24) | `epic-completion.ts`, `workflow-engine.ts` |
| Verify Flags (FR25-FR26) | `workflow-engine.ts` |
| Multi-Lane TUI (FR27-FR30) | `ink-lane*.tsx`, `ink-summary-bar.tsx`, `ink-merge-status.tsx` |

### Data Flow

```
Workflow YAML → hierarchical-flow parser → execution config + story_flow + epic_flow
    ↓
lane-pool → schedule epics (respecting max_parallel + dependencies)
    ↓
worktree-manager → create worktree per epic
    ↓
workflow-engine (per lane) → execute story_flow for each story in epic
    ↓
    ├→ LaneEvent stream → ink-renderer → multi-lane TUI
    ├→ telemetry-writer → .codeharness/telemetry.jsonl (per story)
    └→ epic-completion detector → triggers epic_flow
         ↓
         ├→ retro task (agent: analyst with telemetry data)
         ├→ merge (worktree-manager → git merge, serialized)
         │    ↓ on conflict → merge-agent → resolve → retry merge
         ├→ validate (run test suite on merged main)
         └→ cleanup (worktree-manager → remove worktree + branch)
```

## Architecture Validation Results

### Requirements Coverage

**Functional Requirements:** 30/30 FRs architecturally supported ✓

**Non-Functional Requirements:** 13/13 NFRs architecturally supported ✓
- NFR1 (worktree <10s): `git worktree add` is fast (shared object store)
- NFR2 (TUI 15 FPS): single Ink instance, lane state routing only
- NFR6 (crash isolation): Promise-based lanes, independent worktrees
- NFR8 (state consistency): worktree-local state, merge-time reconciliation
- NFR10 (backward compat): flat `flow:` → `story_flow` with `max_parallel: 1`

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** High

**Key Strengths:**
- Async lane pool with `Promise.race` — natural concurrent scheduling without multi-process complexity
- Git worktrees provide free isolation with zero clone overhead
- Serialized merges eliminate race conditions on main
- Backward compatible — existing workflows unchanged at `max_parallel: 1`

**First Implementation Priority:** Worktree manager + lane pool (FR6-FR9), then hierarchical flow parser (FR1-FR2), then wire into run command.
