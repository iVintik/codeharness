# Story 5.3: Crash Recovery & Resume

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the engine to resume from last completed task after crash,
so that long-running executions don't lose progress and don't require restarting from scratch.

## Acceptance Criteria

1. **Given** `executeWorkflow()` is called and `workflow-state.yaml` contains `tasks_completed` entries from a previous run
   **When** the engine begins iterating through flow steps
   **Then** it skips any (taskName, storyKey) combination already present in `tasks_completed`
   **And** resumes execution from the first incomplete task
   <!-- verification: test-provable -->

2. **Given** `workflow-state.yaml` shows 3 of 5 per-story dispatches completed for task `implement`
   **When** `executeWorkflow()` resumes
   **Then** it dispatches `implement` only for the 2 remaining stories (not the 3 already completed)
   **And** does not re-dispatch completed stories
   <!-- verification: test-provable -->

3. **Given** `workflow-state.yaml` shows all per-story tasks completed but the per-run `verify` task is not in `tasks_completed`
   **When** `executeWorkflow()` resumes
   **Then** it skips all per-story dispatches and proceeds directly to the `verify` task
   <!-- verification: test-provable -->

4. **Given** `workflow-state.yaml` shows a loop block was mid-iteration (e.g., `iteration: 2`, loop tasks partially completed)
   **When** `executeWorkflow()` resumes with `--resume` or default behavior
   **Then** the loop block resumes from the current iteration, skipping already-completed tasks within that iteration
   **And** the iteration counter is NOT reset to 0
   <!-- verification: test-provable -->

5. **Given** `workflow-state.yaml` does not exist or has `phase: idle` (fresh start)
   **When** `executeWorkflow()` is called
   **Then** it executes all tasks from the beginning with no skip logic applied
   **And** behavior is identical to current (pre-crash-recovery) implementation
   <!-- verification: test-provable -->

6. **Given** `workflow-state.yaml` has `phase: completed`
   **When** `executeWorkflow()` is called without an explicit `--force` or fresh-run signal
   **Then** it returns immediately with `success: true` and `tasksCompleted: 0`
   **And** does not re-execute any tasks
   <!-- verification: test-provable -->

7. **Given** a task checkpoint in `tasks_completed` with `task_name: "implement"` and `story_key: "3-1-foo"`
   **When** the engine evaluates whether to dispatch `implement` for story `3-1-foo`
   **Then** it matches on the (task_name, story_key) tuple — both fields must match to skip
   **And** a checkpoint for `("implement", "3-1-foo")` does NOT cause `("verify", "3-1-foo")` to be skipped
   <!-- verification: test-provable -->

8. **Given** the engine is running a 4+ hour execution with many task dispatches
   **When** observed over the full run duration
   **Then** memory usage does not grow unboundedly (no leaked closures, event listeners, or accumulated temporary data structures beyond state)
   **And** the `tasks_completed` array growth is proportional to actual task count only
   <!-- verification: test-provable -->

9. **Given** `workflow-state.yaml` is corrupted or has an invalid shape (e.g., `tasks_completed` is not an array)
   **When** `readWorkflowState()` is called during resume
   **Then** it returns default state (existing behavior from `workflow-state.ts`)
   **And** the engine starts a fresh run rather than crashing
   <!-- verification: test-provable -->

10. **Given** unit tests for crash recovery and resume logic
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for resume-related code paths covering: skip completed sequential tasks, skip completed per-story tasks, resume mid-loop, fresh start with no state, completed run early exit, tuple matching (task_name + story_key), corrupted state fallback, and all existing tests pass with zero regressions
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add `isTaskCompleted()` helper to `workflow-engine.ts` (AC: #1, #7)
  - [x] Implement `isTaskCompleted(state: WorkflowState, taskName: string, storyKey: string): boolean`
  - [x] Match on `(task_name, story_key)` tuple — both fields must match
  - [x] Return `true` if any checkpoint in `state.tasks_completed` matches both fields

- [x] Task 2: Add early exit for already-completed workflows (AC: #6)
  - [x] At the top of `executeWorkflow()`, after reading state, check if `state.phase === 'completed'`
  - [x] If completed, return `EngineResult` with `success: true`, `tasksCompleted: 0`, `storiesProcessed: 0`, `errors: []`, `durationMs: 0`
  - [x] Do not modify state or write to disk

- [x] Task 3: Add skip logic for sequential per-story tasks (AC: #1, #2, #7)
  - [x] In the per-story dispatch loop inside `executeWorkflow()`, before calling `dispatchTask()`
  - [x] Call `isTaskCompleted(state, taskName, item.key)` — if true, skip dispatch and continue to next item
  - [x] Log a skip message via `warn()` for observability: `"workflow-engine: skipping completed task {taskName} for {storyKey}"`

- [x] Task 4: Add skip logic for sequential per-run tasks (AC: #3)
  - [x] In the per-run dispatch branch of `executeWorkflow()`, before calling `dispatchTask()`
  - [x] Call `isTaskCompleted(state, taskName, PER_RUN_SENTINEL)` — if true, skip dispatch
  - [x] Log a skip message via `warn()`

- [x] Task 5: Add skip logic inside `executeLoopBlock()` (AC: #4)
  - [x] Inside the loop task iteration, before dispatching each task
  - [x] For per-story tasks: skip items where `isTaskCompleted(state, taskName, item.key)` with current iteration context
  - [x] For per-run tasks: skip if `isTaskCompleted(state, taskName, PER_RUN_SENTINEL)` for the current iteration
  - [x] Ensure `state.iteration` is NOT reset — preserve from loaded state
  - [x] If all tasks in a loop pass are already completed, proceed to the next iteration or termination check

- [x] Task 6: Ensure fresh start works unchanged (AC: #5, #9)
  - [x] Verify `getDefaultWorkflowState()` returns empty `tasks_completed: []`
  - [x] Verify `isTaskCompleted()` returns false for all tasks when `tasks_completed` is empty
  - [x] Verify corrupted state falls through to default (already handled by `readWorkflowState()`)

- [x] Task 7: Write unit tests (AC: #10)
  - [x] Test: sequential per-story task skipped when checkpoint exists
  - [x] Test: sequential per-story task NOT skipped when no checkpoint
  - [x] Test: per-run task skipped when checkpoint exists
  - [x] Test: resume mid-story (3 of 5 done, dispatches only remaining 2)
  - [x] Test: resume skips to per-run verify when all per-story tasks done
  - [x] Test: loop block resumes from current iteration, skipping completed tasks
  - [x] Test: loop iteration counter preserved (not reset to 0)
  - [x] Test: fresh start (no state) executes everything — no skips
  - [x] Test: `phase: completed` returns early with `tasksCompleted: 0`
  - [x] Test: tuple matching — `("implement", "3-1-foo")` does NOT skip `("verify", "3-1-foo")`
  - [x] Test: corrupted state triggers fresh start
  - [x] Test: all existing story 5-1 and 5-2 tests pass (regression check is implicit)
  - [x] Verify 80%+ coverage on resume-related code paths

## Dev Notes

### Module Design

This story modifies `workflow-engine.ts` — the same file from stories 5-1 and 5-2. The crash recovery logic is woven into the existing execution paths (sequential and loop). No new files are created; this is purely additive.

The key insight: `workflow-state.yaml` already persists `tasks_completed` after every dispatch (implemented in stories 5-1 and 5-2). This story adds the **read side** — checking those checkpoints before dispatching, and skipping tasks that are already recorded as complete.

### Integration Points

- `WorkflowState.tasks_completed` — the checkpoint array is already populated by `dispatchTaskWithResult()` (story 5-1)
- `WorkflowState.phase` — used for early exit detection (`completed`) and fresh start detection (`idle`)
- `WorkflowState.iteration` — must be preserved on resume, not reset to 0
- `readWorkflowState()` — already handles corrupted/missing files by returning defaults (story 1-3)
- `writeWorkflowState()` — already called after every dispatch (no changes needed)

### Resume Algorithm

```
executeWorkflow(config):
  state = readWorkflowState(projectDir)
  
  # Early exit: already completed
  if state.phase === 'completed':
    return { success: true, tasksCompleted: 0, ... }
  
  # Set phase to executing (preserves existing started, iteration, tasks_completed)
  state = { ...state, phase: 'executing', started: state.started || now() }
  
  for step in flow:
    if isLoopBlock(step):
      # Loop resume: iteration is already set from loaded state
      # executeLoopBlock skips completed tasks within each iteration
      executeLoopBlock(step, state, config, workItems)
    else:
      taskName = step
      if task.scope === 'per-run':
        if isTaskCompleted(state, taskName, '__run__'): skip
        else: dispatchTask(...)
      else: # per-story
        for item in workItems:
          if isTaskCompleted(state, taskName, item.key): skip
          else: dispatchTask(...)
```

### Loop Block Resume Considerations

The tricky part is loop block resume. The `iteration` field is already persisted. On resume:

1. `executeLoopBlock()` reads `state.iteration` from the loaded state (e.g., 2)
2. It increments to 3 at the start of each new pass
3. Within a pass, it checks `isTaskCompleted()` for each (taskName, storyKey) pair
4. Completed tasks within the current iteration are skipped
5. Once all tasks in the pass are dispatched (or skipped), termination conditions are checked

**Edge case:** If the crash happened mid-loop-pass (e.g., iteration 2, retry task done but verify not done), the engine must:
- NOT increment iteration again (it was already incremented at the start of pass 2)
- Skip the completed retry tasks
- Execute the incomplete verify task

This means `executeLoopBlock()` needs to check if it's resuming a partially-completed iteration vs starting a fresh one. The simplest approach: always check `isTaskCompleted()` before dispatch. If all tasks in the current iteration are already done, the loop naturally advances to the next iteration.

**Important:** The iteration increment at the start of each loop pass must be guarded — only increment if the current iteration's tasks are not all already complete. Otherwise, a resume after a crash between iteration increment and first task dispatch would skip an iteration.

### What NOT To Change

- `dispatchTaskWithResult()` — already writes checkpoints; no modification needed
- `writeWorkflowState()` — already writes after every dispatch; no modification needed
- `readWorkflowState()` — already handles corrupted files; no modification needed
- `loadWorkItems()` — work item discovery is unrelated to crash recovery
- `parseVerdict()`, `buildRetryPrompt()`, `getFailedItems()` — loop internals are unchanged

### Memory / Long-Running Considerations (AC #8)

The engine uses immutable state updates (`{ ...state, tasks_completed: [...state.tasks_completed, checkpoint] }`). This means each dispatch creates a new array copy. For a run with N dispatches, this is O(N^2) total allocations but O(N) live memory — old arrays are eligible for GC.

For a 4+ hour run with ~100 dispatches (realistic upper bound: 20 stories x 5 iterations), the `tasks_completed` array stays small. No special memory management is needed.

The `isTaskCompleted()` function does a linear scan of `tasks_completed` for each dispatch decision. With ~100 checkpoints max, this is negligible.

No event listeners are registered. No closures accumulate across iterations. The only growing data structure is `tasks_completed` in state, which is proportional to actual work done.

### Anti-Patterns to Avoid

- **Do NOT clear `tasks_completed` on resume** — that defeats the purpose of crash recovery
- **Do NOT reset `iteration` to 0 on resume** — loop state must be preserved
- **Do NOT add a separate "resume mode" flag** — the presence of existing checkpoints IS the resume signal
- **Do NOT change the checkpoint recording in `dispatchTaskWithResult()`** — the write side is correct
- **Do NOT add file locking or atomic writes** — single-process, single-writer, YAML is sufficient
- **Do NOT implement `--force` or `--fresh` flags** — that's story 5-4 (CLI commands)

### Testing Strategy

Same mocking approach as stories 5-1 and 5-2. Tests pre-populate `WorkflowState.tasks_completed` with checkpoints, then verify that `executeWorkflow()` skips those tasks and dispatches only the remaining ones.

Key mock patterns:
- `readWorkflowState` returns state with pre-populated `tasks_completed`
- `dispatchAgent` mock tracks which (taskName, storyKey) pairs were actually dispatched
- Assert dispatched set equals expected (total - completed)

### Previous Story Intelligence

From story 5-2:
- `executeLoopBlock()` increments `state.iteration` at the start of each loop pass
- `dispatchTaskWithResult()` returns `{ updatedState, output }` — used by both sequential and loop paths
- `parseVerdict()` is called after per-run tasks in loops — resume must not re-parse already-scored verdicts
- `evaluator_scores` are appended per iteration — on resume, scores from previous iterations are preserved

From story 5-1:
- `dispatchTask()` delegates to `dispatchTaskWithResult()` which records checkpoints
- `PER_RUN_SENTINEL = '__run__'` is the story key for per-run tasks
- `HALT_ERROR_CODES` set determines which errors stop execution
- State is written to disk after every dispatch via `writeWorkflowState()`

From architecture-v2.md:
- "State writes: After EVERY task completion. Never batch. Never defer. Crash recovery guarantee."
- `workflow-state.ts` is responsible for crash recovery (NFR6-8)
- Write-after-task pattern is already implemented — this story adds the read-before-task pattern

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 5.3: Crash Recovery & Resume]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Cross-Cutting Concerns — crash recovery]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Process Patterns — state writes]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR21 — Ralph loop must recover from crash]
- [Source: src/lib/workflow-engine.ts — executeWorkflow(), executeLoopBlock(), dispatchTaskWithResult()]
- [Source: src/lib/workflow-state.ts — WorkflowState, TaskCheckpoint, readWorkflowState(), writeWorkflowState()]
- [Source: _bmad-output/implementation-artifacts/5-2-flow-execution-loop-blocks.md — predecessor story]
- [Source: _bmad-output/implementation-artifacts/5-1-flow-execution-sequential-steps.md — foundation story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/5-3-crash-recovery-resume-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/5-3-crash-recovery-resume.md

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

- Added `isTaskCompleted()` for sequential task skip logic (tuple match on task_name + story_key)
- Added `isLoopTaskCompleted()` for loop-aware skip logic (counts checkpoint occurrences vs iteration number)
- Added early exit when `phase === 'completed'` returns immediately with zero work
- Sequential per-story and per-run tasks check `isTaskCompleted()` before dispatching
- Loop block tasks check `isLoopTaskCompleted()` before dispatching
- Loop iteration counter preserved on resume (not reset to 0)
- Loop iteration increment guarded: only advances when current iteration is fully complete
- 20 new tests covering all ACs; 88 total tests pass; 0 regressions across 4012 tests
- Coverage: 95.66% statements, 97.32% lines, 100% functions, 89.13% branches

### File List

- `src/lib/workflow-engine.ts` — crash recovery skip logic, `isTaskCompleted()`, `isLoopTaskCompleted()`, early exit
- `src/lib/workflow-state.ts` — added `error?: boolean` field to `TaskCheckpoint` interface
- `src/lib/__tests__/workflow-engine.test.ts` — 20 new crash recovery tests + 7 review-fix tests (95 total)
