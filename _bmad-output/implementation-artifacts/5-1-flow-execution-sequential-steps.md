# Story 5.1: Flow Execution — Sequential Steps

Status: review

## Story

As a developer,
I want the engine to execute flow steps sequentially,
so that tasks run in defined order with state checkpointed after each task.

## Acceptance Criteria

1. **Given** a `workflow-engine.ts` module at `src/lib/workflow-engine.ts`
   **When** inspected
   **Then** it exports an `executeWorkflow(config: EngineConfig): Promise<EngineResult>` function that orchestrates sequential flow execution
   <!-- verification: test-provable -->

2. **Given** a resolved workflow with `flow: [implement, verify]` where `implement` has `scope: per-story` and `verify` has `scope: per-run`
   **When** `executeWorkflow()` is called
   **Then** the `implement` task runs once for each story/issue in the sprint before the `verify` task runs
   **And** `verify` runs exactly once after all per-story tasks complete
   <!-- verification: test-provable -->

3. **Given** a sprint-status.yaml with stories `["3-1-foo", "3-2-bar"]` both in backlog/ready-for-dev status
   **When** the engine executes a `per-story` task
   **Then** it dispatches the agent once for story `3-1-foo` and once for story `3-2-bar`, in order
   <!-- verification: test-provable -->

4. **Given** the engine completes a task dispatch for a story
   **When** the dispatch returns a `DispatchResult`
   **Then** `writeWorkflowState()` is called with an updated state containing the new `TaskCheckpoint` (task_name, story_key, completed_at, session_id)
   **And** state is written to disk before the next task begins
   <!-- verification: test-provable -->

5. **Given** sprint-status.yaml exists with story entries and issues.yaml exists with issue entries
   **When** `loadWorkItems()` is called
   **Then** it returns a combined, ordered list of work items (stories and issues) ready for execution
   **And** issues are included alongside stories — the engine does not distinguish between them
   <!-- verification: test-provable -->

6. **Given** no `issues.yaml` file exists at the expected path
   **When** `loadWorkItems()` is called
   **Then** it returns only stories from sprint-status.yaml without error
   <!-- verification: test-provable -->

7. **Given** a `per-run` task (e.g., `verify`)
   **When** the engine processes it in the flow
   **Then** it dispatches the agent exactly once (not once per story)
   **And** records a single `TaskCheckpoint` with `story_key: "__run__"` or similar sentinel
   <!-- verification: test-provable -->

8. **Given** the engine encounters a `loop:` block in the flow array
   **When** it processes the flow step
   **Then** it skips the loop block without error (loop execution is story 5-2)
   **And** logs a warning that loop blocks are not yet implemented
   <!-- verification: test-provable -->

9. **Given** a task with `source_access: false`
   **When** the engine dispatches it
   **Then** it calls `createIsolatedWorkspace()` before dispatch and `cleanup()` after
   **And** passes the workspace's `toDispatchOptions()` to `dispatchAgent()`
   <!-- verification: test-provable -->

10. **Given** a task with `source_access: true` (default)
    **When** the engine dispatches it
    **Then** it dispatches with `cwd: process.cwd()` (the project directory)
    **And** does NOT create an isolated workspace
    <!-- verification: test-provable -->

11. **Given** the engine starts a workflow execution
    **When** `executeWorkflow()` is called
    **Then** it generates a trace ID via `generateTraceId()` for each task dispatch
    **And** injects the trace prompt via `formatTracePrompt()` into `DispatchOptions.appendSystemPrompt`
    **And** records the trace ID in workflow state via `recordTraceId()`
    <!-- verification: test-provable -->

12. **Given** a task with `session: continue`
    **When** the engine dispatches it
    **Then** it calls `resolveSessionId('continue', ...)` to look up the previous session ID
    **And** passes the result as `DispatchOptions.sessionId`
    <!-- verification: test-provable -->

13. **Given** `dispatchAgent()` throws a `DispatchError`
    **When** the engine catches it
    **Then** it records the failure in workflow state (phase set to `"error"`, task checkpoint with error info)
    **And** writes state to disk
    **And** re-throws or returns an `EngineResult` with `success: false` and the error details
    <!-- verification: test-provable -->

14. **Given** unit tests for the workflow engine module
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for `workflow-engine.ts` covering: sequential execution, per-story dispatch, per-run dispatch, state checkpointing, work item loading, source isolation integration, trace ID injection, session boundary resolution, error handling, and loop block skipping
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define engine interfaces and types (AC: #1)
  - [x] Create `src/lib/workflow-engine.ts`
  - [x] Define `EngineConfig` interface: `{ workflow: ResolvedWorkflow; agents: Record<string, SubagentDefinition>; sprintStatusPath: string; issuesPath?: string; runId: string; projectDir?: string }`
  - [x] Define `EngineResult` interface: `{ success: boolean; tasksCompleted: number; storiesProcessed: number; errors: EngineError[]; durationMs: number }`
  - [x] Define `EngineError` interface: `{ taskName: string; storyKey: string; code: string; message: string }`
  - [x] Define `WorkItem` interface: `{ key: string; title?: string; source: 'sprint' | 'issues' }`

- [x] Task 2: Implement work item loading (AC: #5, #6)
  - [x] Implement `loadWorkItems(sprintStatusPath: string, issuesPath?: string): WorkItem[]`
  - [x] Parse sprint-status.yaml `development_status` section — extract story keys with status `backlog` or `ready-for-dev`
  - [x] Parse issues.yaml if it exists — extract issue entries with status `backlog` or `ready-for-dev`
  - [x] If issues.yaml missing, return stories only (no error)
  - [x] Return combined list: stories first, then issues (simple ordering for now)

- [x] Task 3: Implement single task dispatch (AC: #4, #9, #10, #11, #12)
  - [x] Implement `dispatchTask(task: ResolvedTask, taskName: string, storyKey: string, definition: SubagentDefinition, state: WorkflowState, config: EngineConfig): Promise<WorkflowState>`
  - [x] If `task.source_access === false`: create isolated workspace, get dispatch options, dispatch, cleanup
  - [x] If `task.source_access === true`: dispatch with `cwd: config.projectDir ?? process.cwd()`
  - [x] Generate trace ID with `generateTraceId(config.runId, state.iteration, taskName)`
  - [x] Inject trace prompt via `formatTracePrompt()` into `appendSystemPrompt`
  - [x] Resolve session ID via `resolveSessionId(task.session, ...)`
  - [x] After dispatch: record session ID, record trace ID, append TaskCheckpoint, write state

- [x] Task 4: Implement flow execution loop (AC: #2, #3, #7, #8)
  - [x] Implement main `executeWorkflow(config: EngineConfig): Promise<EngineResult>` function
  - [x] Read or initialize workflow state; set `phase: "executing"`, `started`, `workflow_name`
  - [x] Load work items via `loadWorkItems()`
  - [x] Iterate through `config.workflow.flow` steps:
    - If step is a `string` (task name): look up task in `config.workflow.tasks`
      - If `scope: per-story`: dispatch once per work item
      - If `scope: per-run`: dispatch once with sentinel story key `"__run__"`
    - If step is a `LoopBlock`: log warning, skip (story 5-2)
  - [x] After all flow steps: set `phase: "completed"`, write final state
  - [x] Return `EngineResult`

- [x] Task 5: Implement error handling (AC: #13)
  - [x] Wrap `dispatchAgent()` calls in try/catch
  - [x] On `DispatchError`: record error in state, set `phase: "error"`, write state, collect error in result
  - [x] Continue to next story/task or halt based on error severity (RATE_LIMIT → halt, NETWORK → halt, SDK_INIT → halt, UNKNOWN → record and continue)

- [x] Task 6: Write unit tests (AC: #14)
  - [x] Create `src/lib/__tests__/workflow-engine.test.ts`
  - [x] Mock `dispatchAgent()` from `agent-dispatch.ts` — return fake `DispatchResult`
  - [x] Mock `writeWorkflowState()` and `readWorkflowState()` from `workflow-state.ts`
  - [x] Mock `createIsolatedWorkspace()` from `source-isolation.ts`
  - [x] Mock `generateTraceId()`, `formatTracePrompt()`, `recordTraceId()` from `trace-id.ts`
  - [x] Mock `resolveSessionId()`, `recordSessionId()` from `session-manager.ts`
  - [x] Test: sequential flow steps execute in order
  - [x] Test: per-story task dispatches once per story
  - [x] Test: per-run task dispatches exactly once
  - [x] Test: state written after each task completion
  - [x] Test: source isolation invoked for `source_access: false`
  - [x] Test: source isolation NOT invoked for `source_access: true`
  - [x] Test: trace ID generated and injected per dispatch
  - [x] Test: session boundary resolved per dispatch
  - [x] Test: DispatchError caught and recorded
  - [x] Test: loop blocks skipped with warning
  - [x] Test: work items loaded from sprint-status only when no issues.yaml
  - [x] Test: work items loaded from both sprint-status and issues.yaml
  - [x] Verify 80%+ coverage on `workflow-engine.ts`

## Dev Notes

### Module Design

`workflow-engine.ts` is the orchestrator module — it imports and composes all other modules built in epics 1-4. It does NOT implement loop iteration logic (story 5-2), crash recovery/resume (story 5-3), or CLI commands (story 5-4). This story creates the core sequential execution path only.

### Integration Points

The engine connects these existing modules:
- `workflow-parser.ts` — provides `ResolvedWorkflow` with tasks and flow (input to engine, resolved externally)
- `agent-resolver.ts` — provides `SubagentDefinition` (compiled agents, resolved externally and passed in via `EngineConfig.agents`)
- `agent-dispatch.ts` — `dispatchAgent()` for SDK session execution
- `workflow-state.ts` — `readWorkflowState()`, `writeWorkflowState()` for crash-safe checkpointing
- `source-isolation.ts` — `createIsolatedWorkspace()` for `source_access: false` tasks
- `trace-id.ts` — `generateTraceId()`, `formatTracePrompt()`, `recordTraceId()`
- `session-manager.ts` — `resolveSessionId()`, `recordSessionId()`

### Data Flow

```
executeWorkflow(config)
  1. readWorkflowState() — load existing state or create default
  2. loadWorkItems(sprintStatusPath, issuesPath) — get stories + issues
  3. For each flow step:
     a. If string task name:
        - per-story: for each work item → dispatchTask()
        - per-run: dispatchTask() once with sentinel key
     b. If LoopBlock: skip (story 5-2)
  4. writeWorkflowState() — final state
  5. Return EngineResult
```

### dispatchTask() Flow

```
dispatchTask(task, taskName, storyKey, definition, state, config)
  1. generateTraceId() → traceId
  2. formatTracePrompt(traceId) → tracePrompt
  3. resolveSessionId(task.session, { taskName, storyKey }, state) → sessionId
  4. If source_access === false:
       createIsolatedWorkspace({ runId, storyFiles: [...] })
       dispatchOptions = workspace.toDispatchOptions()
     Else:
       dispatchOptions = { cwd: projectDir }
  5. dispatchAgent(definition, prompt, { ...dispatchOptions, sessionId, appendSystemPrompt: tracePrompt })
  6. recordSessionId({ taskName, storyKey }, result.sessionId, state)
  7. recordTraceId(traceId, state)
  8. Append TaskCheckpoint to state
  9. writeWorkflowState(state)
  10. If source_access === false: workspace.cleanup()
```

### Sprint-Status Parsing

The engine reads `sprint-status.yaml` to find work items. Format:
```yaml
development_status:
  epic-5: backlog
  5-1-flow-execution-sequential-steps: backlog
  5-2-flow-execution-loop-blocks: backlog
```

Parsing rules:
- Skip keys matching `epic-*` (epic groupings, not stories)
- Skip keys ending in `-retrospective`
- Include entries with status `backlog` or `ready-for-dev`
- Story key format: `{epic_num}-{story_num}-{slug}`

### Issues.yaml Format

Per AD6 in architecture-v2.md:
```yaml
issues:
  - id: issue-001
    title: Docker timeout handling too aggressive
    source: retro-epic-15
    priority: high
    status: ready-for-dev
```

### What This Story Does NOT Do

- Does NOT implement `loop:` block execution — that's story 5-2
- Does NOT implement crash recovery / resume from checkpoint — that's story 5-3
- Does NOT implement the `codeharness run` CLI command — that's story 5-4
- Does NOT implement evaluator logic — that's Epic 6
- Does NOT implement circuit breaker — that's Epic 7
- Does NOT implement finding injection into retry prompts — that's story 5-2
- Does NOT parse workflow YAML — `ResolvedWorkflow` is passed in via config
- Does NOT resolve agents — `SubagentDefinition` map is passed in via config

### Anti-Patterns to Avoid

- **Do NOT import `parseWorkflow`** — the engine receives an already-resolved workflow
- **Do NOT import `resolveAgent` or `compileSubagentDefinition`** — agents are pre-compiled and passed in
- **Do NOT implement retry/loop logic** — skip `LoopBlock` flow steps with a log
- **Do NOT cache state in memory across task boundaries** — always write to disk after each task (crash recovery guarantee)
- **Do NOT use `child_process.spawn`** — agent dispatch is via `dispatchAgent()` only
- **Do NOT modify sprint-status.yaml** — the engine reads it but never writes to it (story status updates are a separate concern)

### Prompt Construction for Tasks

The engine must construct a prompt for each dispatch. For per-story tasks, the prompt should include:
- The story key and any available story context
- The task's `prompt_template` if defined (future: template rendering)
- For now, a simple prompt with the story key: `"Implement story {storyKey}"`

For per-run tasks, the prompt should reference the overall run context.

### Project Structure Notes

- New file: `src/lib/workflow-engine.ts` — core execution orchestrator
- New test file: `src/lib/__tests__/workflow-engine.test.ts`
- No modified files — this module is additive only
- Aligns with architecture: each module in `src/lib/` is one file with co-located test

### Previous Story Intelligence

From story 4-4 (source isolation):
- Source isolation is a standalone module, not part of agent-dispatch — the engine calls it directly
- `createIsolatedWorkspace()` takes `{ runId, storyFiles }`, returns `IsolatedWorkspace` with `toDispatchOptions()` and `cleanup()`
- Missing story files are warned and skipped, not thrown
- Cleanup is idempotent

From story 4-3 (trace IDs):
- `generateTraceId(runId, iteration, taskName)` — format: `ch-{runId}-{iteration}-{taskName}`
- `formatTracePrompt(traceId)` — returns string for `appendSystemPrompt`
- `recordTraceId(traceId, state)` — returns new state (immutable)

From story 4-2 (session boundaries):
- `resolveSessionId(boundary, key, state)` — returns session ID or undefined
- `recordSessionId(key, sessionId, state)` — returns new state with checkpoint (immutable)

From story 4-1 (agent dispatch):
- `dispatchAgent(definition, prompt, options?)` — returns `Promise<DispatchResult>`
- `DispatchResult` has `{ sessionId, success, durationMs, output }`
- `DispatchError` has `{ code, agentName, cause }` — codes: RATE_LIMIT, NETWORK, SDK_INIT, UNKNOWN

### Testing Strategy

Heavy mocking approach — the engine is an orchestrator, so tests verify correct composition of the underlying modules. All dependencies (`dispatchAgent`, `writeWorkflowState`, `createIsolatedWorkspace`, `generateTraceId`, etc.) are mocked via `vi.mock()`. Tests verify:
1. Correct call sequences (e.g., state written after dispatch, not before)
2. Correct arguments passed to each dependency
3. Error handling paths
4. Per-story vs per-run dispatch semantics

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 5.1: Flow Execution — Sequential Steps]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — workflow-engine]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Integration Boundaries & Data Flow]
- [Source: src/lib/workflow-parser.ts — ResolvedWorkflow, ResolvedTask, FlowStep, LoopBlock]
- [Source: src/lib/agent-dispatch.ts — dispatchAgent(), DispatchResult, DispatchError, DispatchOptions]
- [Source: src/lib/workflow-state.ts — WorkflowState, TaskCheckpoint, readWorkflowState(), writeWorkflowState()]
- [Source: src/lib/source-isolation.ts — createIsolatedWorkspace(), IsolatedWorkspace, IsolationOptions]
- [Source: src/lib/trace-id.ts — generateTraceId(), formatTracePrompt(), recordTraceId()]
- [Source: src/lib/session-manager.ts — resolveSessionId(), recordSessionId(), SessionBoundary]
- [Source: src/lib/agent-resolver.ts — SubagentDefinition]
- [Source: templates/workflows/default.yaml — default flow: implement → verify → loop]
- [Source: _bmad-output/implementation-artifacts/4-4-source-isolation-enforcement.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/5-1-flow-execution-sequential-steps-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/5-1-flow-execution-sequential-steps.md

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

- Implemented `workflow-engine.ts` as the core orchestrator module composing all Epic 1-4 modules
- Exports: `executeWorkflow()`, `dispatchTask()`, `loadWorkItems()`, plus interfaces `EngineConfig`, `EngineResult`, `EngineError`, `WorkItem`
- `loadWorkItems()` parses sprint-status.yaml and optionally issues.yaml, filtering for backlog/ready-for-dev items, excluding epics and retrospectives
- `dispatchTask()` handles trace ID generation/injection, session resolution, source isolation (for source_access: false), agent dispatch, state checkpointing, and cleanup
- `executeWorkflow()` orchestrates sequential flow execution: per-story tasks dispatch once per work item, per-run tasks dispatch once with `__run__` sentinel
- Loop blocks skipped with warning (deferred to story 5-2)
- Error handling: RATE_LIMIT/NETWORK/SDK_INIT errors halt execution; UNKNOWN errors record and continue
- 31 unit tests covering all acceptance criteria, 89.91% statement coverage, 100% function coverage
- All 3955 tests pass with zero regressions

### Change Log

- 2026-04-03: Story 5-1 implemented — workflow engine sequential execution

### File List

- src/lib/workflow-engine.ts (new)
- src/lib/__tests__/workflow-engine.test.ts (new)
