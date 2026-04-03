# Story 16.2: Engine-Handled Null Tasks

Status: verifying

## Story

As a developer,
I want tasks with `agent: null` to execute directly in the engine without LLM dispatch,
so that telemetry collection and state bookkeeping cost zero tokens.

## Acceptance Criteria

1. **Given** a task definition with `agent: null` in workflow YAML, **when** the workflow engine reaches this task in the flow, **then** the engine skips driver dispatch entirely (no `getDriver()`, no `driver.dispatch()`, no stream events) and instead calls the null task handler registry. <!-- verification: test-provable -->

2. **Given** the null task handler registry (`src/lib/null-task-registry.ts`), **when** a null task name is looked up, **then** the registry returns the registered handler function or `undefined` if no handler is registered. <!-- verification: test-provable -->

3. **Given** a registered null task handler, **when** called, **then** it receives a `TaskContext` object containing: `storyKey` (string), `taskName` (string), `cost` (total cost so far from previous tasks), `durationMs` (elapsed time so far), `outputContract` (previous task's output contract or null), and `projectDir` (project root path). <!-- verification: test-provable -->

4. **Given** a null task handler completes, **when** the engine records its result, **then** a `TaskCheckpoint` is written to workflow state just like a normal task (enabling crash recovery skip on resume). <!-- verification: test-provable -->

5. **Given** an unknown null task name (no handler registered), **when** the engine looks it up, **then** it throws an `EngineError` with code `NULL_TASK_NOT_FOUND` and a message listing the task name and all registered handler names. <!-- verification: test-provable -->

6. **Given** a null task handler, **when** it performs a data collection operation (e.g., reading state + writing one NDJSON line), **then** it completes in <10ms. <!-- verification: test-provable -->

7. **Given** a workflow with mixed null and agent-dispatched tasks in the flow (e.g., `[implement, verify, telemetry]` where `telemetry` has `agent: null`), **when** the engine executes the flow, **then** null tasks and agent tasks interleave correctly — each task type follows the same per-story/per-run scope rules and crash recovery logic. <!-- verification: test-provable -->

8. **Given** a null task handler completes, **when** the engine continues to the next flow step, **then** the null task's result is available as `previousOutputContract` context to the next task (null tasks produce an `OutputContract` with `driver: "engine"`, `model: "null"`, `cost_usd: 0`). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create null task handler registry (AC: #2, #5)
  - [x] Create `src/lib/null-task-registry.ts`
  - [x] Define `TaskContext` interface: `{ storyKey, taskName, cost, durationMs, outputContract, projectDir }`
  - [x] Define `NullTaskHandler` type: `(ctx: TaskContext) => Promise<NullTaskResult>`
  - [x] Define `NullTaskResult` interface: `{ success: boolean, output?: string }`
  - [x] Implement `registerNullTask(name, handler)` function
  - [x] Implement `getNullTask(name)` function returning handler or undefined
  - [x] Implement `listNullTasks()` returning all registered names (for error messages)
  - [x] Register a no-op `telemetry` handler as placeholder (real implementation in story 16-3)

- [x] Task 2: Add null task dispatch path in workflow engine (AC: #1, #4, #7, #8)
  - [x] In `dispatchTaskWithResult` (or a new sibling function), detect `task.agent === null`
  - [x] When null: look up handler via `getNullTask(taskName)`
  - [x] If handler found: build `TaskContext`, call handler, build `OutputContract` from result
  - [x] If handler not found: throw error with code `NULL_TASK_NOT_FOUND`
  - [x] Write `TaskCheckpoint` to state after handler completes (same as agent dispatch)
  - [x] Ensure `previousOutputContract` chain works across null→agent and agent→null transitions
  - [x] Per-story scope: iterate work items and call handler per item (same as agent dispatch)
  - [x] Per-run scope: call handler once with sentinel key (same as agent dispatch)
  - [x] Crash recovery: skip null tasks that have completed checkpoints (same logic)

- [x] Task 3: Update `run.ts` agent resolution to skip null agents (AC: #1)
  - [x] Verify the existing `if (task.agent != null)` guard in `run.ts` line 141 correctly skips null agents
  - [x] If already correct (from 16-1), no changes needed — just verify with a test

- [x] Task 4: Write unit tests (AC: #1-#8)
  - [x] Test: null task registry register/get/list
  - [x] Test: unknown null task returns undefined from registry, engine throws `NULL_TASK_NOT_FOUND`
  - [x] Test: engine skips driver dispatch for `agent: null` tasks
  - [x] Test: null task handler receives correct `TaskContext`
  - [x] Test: `TaskCheckpoint` written after null task completion
  - [x] Test: `OutputContract` produced by null task has `driver: "engine"`, `cost_usd: 0`
  - [x] Test: mixed flow with null + agent tasks executes in order
  - [x] Test: crash recovery skips completed null tasks
  - [x] Test: null task completes in <10ms (performance assertion)
  - [x] Test: per-story null task iterates all work items
  - [x] Test: per-run null task runs once with sentinel key

## Dev Notes

### Architecture Constraints

- **New file:** `src/lib/null-task-registry.ts` — pure registry with no side effects. Handlers are registered at module initialization time.
- **Modified file:** `src/lib/workflow-engine.ts` — add null task detection branch in the flow execution path. The key insertion point is inside the `executeWorkflow` function where it currently does `const definition = config.agents[task.agent]` (line ~985). For `agent: null`, skip agent lookup and call the null task handler instead.
- **Modified file (verify only):** `src/commands/run.ts` — the `if (task.agent != null)` guard at line 141 already skips null agents (added in 16-1). Verify this works correctly.
- **Pattern to follow:** The existing `dispatchTaskWithResult()` returns `{ updatedState, contract }`. The null task path should produce the same shape so the caller doesn't need branching.

### Key Design Decisions

1. **Registry pattern (not switch/case):** Use a handler registry so story 16-3 (telemetry) can register its handler without modifying the engine. This follows the driver factory pattern from epic 10.

2. **OutputContract for null tasks:** Null tasks produce a minimal `OutputContract` with `driver: "engine"`, `model: "null"`, `cost_usd: 0`, `duration_ms: <actual>`. This keeps the contract chain intact for downstream tasks that may read `previousOutputContract`.

3. **Same scope rules:** Null tasks respect `per-story` and `per-run` scope. A `per-story` null task runs once per work item. This matters for telemetry (story 16-3) which runs per-story.

4. **No driver health check:** Null tasks bypass the driver health check in `checkDriverHealth()`. The health check iterates `workflow.tasks` and calls `getDriver(task.driver)` — it must skip tasks where `agent === null`.

### TaskContext Interface

```typescript
export interface TaskContext {
  storyKey: string;       // e.g., "16-2-engine-handled-null-tasks" or "__per_run__"
  taskName: string;       // e.g., "telemetry"
  cost: number;           // accumulated cost from previous tasks (USD)
  durationMs: number;     // elapsed time since workflow start
  outputContract: OutputContract | null;  // previous task's output contract
  projectDir: string;     // project root directory
}

export interface NullTaskResult {
  success: boolean;
  output?: string;        // optional text output for logging
}

export type NullTaskHandler = (ctx: TaskContext) => Promise<NullTaskResult>;
```

### Integration Points in workflow-engine.ts

The engine's main execution loop (line ~948-1054) needs a null-task branch at two points:

1. **Per-run tasks** (line ~991-1018): Before `dispatchTaskWithResult()`, check `task.agent === null`. If so, call `executeNullTask()` instead.
2. **Per-story tasks** (line ~1019-1053): Same check inside the work items loop.

Create a helper `executeNullTask(task, taskName, storyKey, state, config, previousContract)` that:
- Looks up handler via `getNullTask(taskName)`
- Builds `TaskContext`
- Calls handler
- Writes checkpoint
- Returns `{ updatedState, contract }` matching `dispatchTaskWithResult` return shape

### Driver Health Check Fix

The `checkDriverHealth()` function in `workflow-engine.ts` iterates all tasks and checks driver health. It must skip `agent: null` tasks. Look for the function (around line ~850) and add `if (task.agent === null) continue;`.

### Previous Story (16-1) Intelligence

- `hierarchical-flow.ts` was created with `resolveHierarchicalFlow()` — pure parser, no side effects
- `workflow-parser.ts` now exposes `execution`, `storyFlow`, `epicFlow` on `ResolvedWorkflow`
- Schema already accepts `agent: null` in task definitions (`oneOf: [string, null]`)
- `run.ts` already skips agent resolution for `agent: null` tasks
- The engine currently uses `config.workflow.flow` (line 948) for step iteration, NOT `storyFlow` — story 16-6 will switch to `storyFlow`. For now, null tasks work in the existing `flow` execution path.
- All 4676 tests pass (1 pre-existing failure in `stats.test.ts` unrelated)

### Project Structure Notes

- Source files: TypeScript in `src/lib/`, compiled to `dist/`
- Tests: `src/lib/__tests__/*.test.ts` (vitest)
- Schemas: `src/schemas/*.schema.json`
- ESM module (`import.meta.url`, `.js` extensions in imports)
- Test runner: vitest for `.test.ts`, BATS for `.bats` integration tests

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 16.2]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 4 — engine-handled tasks]
- [Source: src/lib/workflow-engine.ts — executeWorkflow(), dispatchTaskWithResult()]
- [Source: src/lib/workflow-parser.ts — ResolvedTask interface, agent: string | null]
- [Source: src/lib/hierarchical-flow.ts — BUILTIN_EPIC_FLOW_TASKS pattern for registry approach]
- [Source: src/lib/agents/types.ts — OutputContract interface]
- [Source: src/lib/workflow-state.ts — TaskCheckpoint, WorkflowState]
- [Source: _bmad-output/implementation-artifacts/16-1-hierarchical-flow-schema-parser.md — previous story dev notes]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-2-engine-handled-null-tasks-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-2-engine-handled-null-tasks.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

### Change Log

- Implemented null task handler registry (`src/lib/null-task-registry.ts`)
- Added `executeNullTask()` helper and null task branches in `executeWorkflow()` and `executeLoopBlock()`
- Fixed `checkDriverHealth()` to skip `agent: null` tasks
- Verified `run.ts` line 141 guard already handles null agents (from 16-1)
- Added 21 unit tests across 2 test files (8 registry tests + 13 engine integration tests)
- [Code Review] Fixed: handler `success: false` now throws `NULL_TASK_FAILED` error instead of being silently ignored
- [Code Review] Fixed: handler exceptions now caught and wrapped as `NULL_TASK_HANDLER_ERROR` EngineError
- [Code Review] Fixed: `cost` in TaskContext now uses accumulated cost tracker instead of previous task's cost_usd
- [Code Review] Added `clearNullTaskRegistry()` for test isolation
- [Code Review] Added 5 new tests (handler failure, handler throw, no success checkpoint on failure, accumulated cost tracking, registry clear)

### File List

- `src/lib/null-task-registry.ts` (new) — registry, interfaces, built-in telemetry handler
- `src/lib/workflow-engine.ts` (modified) — null task dispatch path, health check fix
- `src/lib/__tests__/null-task-registry.test.ts` (new) — 8 registry unit tests
- `src/lib/__tests__/null-task-engine.test.ts` (new) — 13 engine integration tests
