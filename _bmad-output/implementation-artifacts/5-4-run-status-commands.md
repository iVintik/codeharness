# Story 5.4: Run & Status Commands

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want `codeharness run` to invoke the workflow engine and `codeharness status` to display workflow-engine state (iteration, stories, scores, circuit breaker, elapsed time),
so that I can execute workflows and monitor progress from the CLI.

## Acceptance Criteria

1. **Given** a project with a valid workflow YAML in `.codeharness/workflows/` and a sprint-status.yaml with work items
   **When** `codeharness run` is invoked
   **Then** the workflow engine's `executeWorkflow()` is called with a properly constructed `EngineConfig`
   **And** the command exits 0 on success, non-zero on failure
   <!-- verification: runtime-provable -->

2. **Given** `codeharness run` is invoked
   **When** the workflow engine completes (success or failure)
   **Then** the command outputs a summary: stories processed, tasks completed, duration, and whether it succeeded or failed
   <!-- verification: runtime-provable -->

3. **Given** `codeharness run` is invoked with `--resume`
   **When** `workflow-state.yaml` contains tasks from a prior run
   **Then** the engine resumes from the last completed task (crash recovery from story 5-3 is activated)
   **And** the command does not re-execute already-completed tasks
   <!-- verification: runtime-provable -->

4. **Given** `codeharness run` is invoked with `--max-iterations <n>`
   **When** the engine processes loop blocks
   **Then** the engine's `maxIterations` config is set to `<n>`
   <!-- verification: test-provable -->

5. **Given** `codeharness status` is invoked with no flags and `workflow-state.yaml` exists
   **When** the command reads the workflow state
   **Then** it displays: current iteration number, phase (idle/executing/completed), number of tasks completed, elapsed time since `started`, and evaluator scores (if any)
   **And** it displays circuit breaker state (triggered: yes/no, reason if triggered)
   <!-- verification: runtime-provable -->

6. **Given** `codeharness status` is invoked and no `workflow-state.yaml` exists
   **When** the command reads the workflow state
   **Then** it displays "No active workflow run" (or equivalent) without crashing
   <!-- verification: runtime-provable -->

7. **Given** `codeharness status` is invoked with `--json`
   **When** the workflow state is read
   **Then** the output is valid JSON containing all workflow-state fields: workflow_name, started, iteration, phase, tasks_completed count, evaluator_scores, circuit_breaker, elapsed time
   <!-- verification: runtime-provable -->

8. **Given** `codeharness status` is invoked
   **When** the command completes
   **Then** it returns in under 1 second (NFR5: status returns in <1s)
   <!-- verification: runtime-provable -->

9. **Given** `codeharness run` is invoked
   **When** there are no backlog or ready-for-dev stories in sprint-status.yaml
   **Then** the command exits with a clear message: "No stories ready for execution" (or similar)
   **And** exit code is non-zero
   <!-- verification: runtime-provable -->

10. **Given** unit tests for the run and status command wiring and the workflow-engine integration
    **When** `npm run test:unit` is executed
    **Then** tests verify: EngineConfig construction from CLI args, run command success/failure paths, status command reads workflow state correctly, status --json output shape, status with missing state file, and all existing tests pass with zero regressions
    **And** 80%+ coverage on new code paths
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Wire `codeharness run` to workflow engine (AC: #1, #2, #3, #4, #9)
  - [x] Import workflow-parser, agent-resolver, and workflow-engine modules in `src/commands/run.ts`
  - [x] Parse the default workflow from `.codeharness/workflows/default.yaml` (or `templates/workflows/default.yaml` fallback)
  - [x] Resolve agents referenced in the workflow via agent-resolver
  - [x] Construct `EngineConfig` from parsed workflow, resolved agents, sprint-status path, run ID, and CLI options
  - [x] Call `executeWorkflow(config)` and handle the `EngineResult`
  - [x] On success: print summary and exit 0
  - [x] On failure: print errors and exit 1
  - [x] Add `--resume` flag that passes through to engine behavior (engine already resumes by default from story 5-3; flag is documentation/intent)
  - [x] Map `--max-iterations` to `EngineConfig.maxIterations`
  - [x] Remove the "temporarily unavailable" placeholder

- [x] Task 2: Add workflow-state reading to `codeharness status` (AC: #5, #6, #7, #8)
  - [x] Import `readWorkflowState` from `src/lib/workflow-state.ts` in status formatters
  - [x] Add a "Workflow Engine" section to `handleFullStatus()` that displays: phase, iteration, tasks completed count, elapsed time (now - started), evaluator scores summary, circuit breaker state
  - [x] Handle missing `workflow-state.yaml` gracefully (display "No active workflow run")
  - [x] Add workflow-state fields to `handleFullStatusJson()` output
  - [x] Compute elapsed time as `Date.now() - Date.parse(state.started)` only if phase === 'executing'
  - [x] Ensure the entire status command completes in <1s (no heavy I/O — `readWorkflowState` is a single file read)

- [x] Task 3: Write unit tests (AC: #10)
  - [x] Test: run command constructs EngineConfig correctly from CLI options
  - [x] Test: run command calls executeWorkflow with the constructed config
  - [x] Test: run command exits 0 on EngineResult.success === true
  - [x] Test: run command exits 1 on EngineResult.success === false
  - [x] Test: run command exits 1 with message when no stories ready
  - [x] Test: --max-iterations maps to EngineConfig.maxIterations
  - [x] Test: status command displays workflow state fields when state exists
  - [x] Test: status command displays "No active workflow run" when no state
  - [x] Test: status --json includes workflow state fields
  - [x] Test: all existing tests pass (regression check)

## Dev Notes

### Module Design

This story modifies two existing command files (`src/commands/run.ts` and `src/commands/status.ts`) and the status module (`src/modules/status/formatters.ts`). It wires the workflow engine (built in stories 5-1, 5-2, 5-3) to the CLI surface. No new modules are created.

The run command currently has a placeholder that says "temporarily unavailable — workflow engine pending (Epic 5)". This story replaces that placeholder with the real workflow engine call.

The status command already has a rich display via `handleFullStatus()` in `src/modules/status/formatters.ts`. This story adds a new section to that display showing workflow-engine state from `.codeharness/workflow-state.yaml`.

### Key Integration Points

- `src/lib/workflow-engine.ts` — `executeWorkflow(config: EngineConfig): Promise<EngineResult>` (built in stories 5-1/5-2/5-3)
- `src/lib/workflow-parser.ts` — `parseWorkflow(path: string): ResolvedWorkflow` (built in story 2-2)
- `src/lib/agent-resolver.ts` — `resolveAgent(name: string): SubagentDefinition` (built in story 3-3)
- `src/lib/workflow-state.ts` — `readWorkflowState(dir?: string): WorkflowState` (built in story 1-3)
- `src/modules/status/formatters.ts` — `handleFullStatus()`, `handleFullStatusJson()` (existing, modified)
- `src/commands/run.ts` — `registerRunCommand()` (existing, modified)

### Run Command Architecture

The run command follows the Decision 8 pattern (Thin Commands, Fat Modules). The command file should remain under 100 lines. The heavy lifting is done by `executeWorkflow()` which already handles:
- Sequential step execution (story 5-1)
- Loop block execution (story 5-2)
- Crash recovery and resume (story 5-3)

The command's job is:
1. Pre-flight checks (Docker, state — already implemented)
2. Parse workflow YAML
3. Resolve agents
4. Build `EngineConfig`
5. Call `executeWorkflow()`
6. Print result summary

### Status Command Architecture

The status command already delegates to `handleFullStatus()` in `src/modules/status/formatters.ts`. Adding workflow-engine state is purely additive — a new section in the output.

Workflow state to display:

| Field | Display |
|-------|---------|
| `phase` | "idle", "executing", or "completed" |
| `iteration` | Current loop iteration number |
| `tasks_completed.length` | Number of task dispatches completed |
| `started` | Compute elapsed time if phase === 'executing' |
| `evaluator_scores` | Latest score summary (passed/failed/unknown/total) |
| `circuit_breaker.triggered` | Yes/No + reason if triggered |

Elapsed time calculation: `Date.now() - Date.parse(state.started)`. Format as human-readable (e.g., "2h14m", "47m", "3m22s").

### Elapsed Time Formatting

Use a simple helper function (no external dependency):
```typescript
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}
```

### EngineConfig Construction

```typescript
const config: EngineConfig = {
  workflow: parsedWorkflow,
  agents: resolvedAgents,
  sprintStatusPath: join(projectDir, '_bmad-output/implementation-artifacts/sprint-status.yaml'),
  issuesPath: join(projectDir, '.codeharness/issues.yaml'),
  runId: `run-${Date.now()}`,
  projectDir,
  maxIterations: parseInt(options.maxIterations, 10),
};
```

The `sprintStatusPath` should resolve from the project directory. The run ID uses a timestamp for uniqueness.

### --resume Flag

The engine already resumes by default (story 5-3 — it reads `workflow-state.yaml` and skips completed tasks). The `--resume` flag is primarily for documentation/intent clarity. If `workflow-state.yaml` has `phase: completed`, the engine returns immediately with `tasksCompleted: 0` (story 5-3 AC #6). The `--resume` flag can override this by resetting phase to `idle` before calling executeWorkflow.

### What NOT To Change

- `executeWorkflow()` — already handles all execution logic (stories 5-1/5-2/5-3)
- `readWorkflowState()` / `writeWorkflowState()` — already correct
- `loadWorkItems()` — work item discovery is unchanged
- `parseWorkflow()` — workflow parsing is unchanged
- `resolveAgent()` — agent resolution is unchanged
- `handleDockerCheck()`, `handleHealthCheck()`, `handleStoryDrillDown()` — other status modes are unchanged
- `src/modules/sprint/` — sprint module is unchanged

### Anti-Patterns to Avoid

- **Do NOT put business logic in the run command file** — keep it thin (<100 lines). All execution logic is in workflow-engine.ts.
- **Do NOT duplicate state reading** — use `readWorkflowState()` from workflow-state.ts, not custom file reads.
- **Do NOT block status on workflow completion** — status reads state file synchronously, no async needed.
- **Do NOT add live/streaming mode in this story** — that's future work (UX spec shows `--live` but it's out of scope for this story).
- **Do NOT add `--stop` flag** — graceful stop is not part of this story's ACs.
- **Do NOT modify the workflow engine itself** — this story is purely CLI wiring.

### Previous Story Intelligence

From story 5-3 (crash recovery):
- `isTaskCompleted()` and `isLoopTaskCompleted()` handle resume skip logic
- `phase === 'completed'` triggers early exit with `{ success: true, tasksCompleted: 0 }`
- 95 tests total for workflow-engine, all passing
- `error?: boolean` field added to `TaskCheckpoint`

From story 5-2 (loop blocks):
- `executeLoopBlock()` manages iteration increment and termination
- `parseVerdict()` processes evaluator output
- `evaluator_scores` array grows with each loop iteration

From story 5-1 (sequential steps):
- `PER_RUN_SENTINEL = '__run__'` for per-run task checkpoints
- `dispatchTaskWithResult()` records checkpoints after every dispatch
- State is written to disk after every task completion

### Git Intelligence

Recent commits show a consistent pattern:
- Stories implement the core logic in `src/lib/` modules
- Tests go in `src/lib/__tests__/`
- Commands in `src/commands/` are thin wrappers
- No new dependencies added in Epic 5 — all stdlib and existing deps

### Testing Strategy

For run command tests:
- Mock `parseWorkflow`, `resolveAgent`, `executeWorkflow` to isolate command wiring
- Test that CLI options map correctly to `EngineConfig` fields
- Test success/failure exit codes
- Test the "no stories" early exit

For status command tests:
- Mock `readWorkflowState` to return various states (idle, executing, completed, missing)
- Test that workflow-state fields appear in output
- Test JSON output shape
- Test graceful handling of missing state file

Test files:
- `src/commands/__tests__/run.test.ts` (may need creation or extension)
- `src/modules/status/__tests__/formatters.test.ts` (extend existing)

### Project Structure Notes

- `src/commands/run.ts` — 93 lines currently, will stay under 100 after refactor
- `src/commands/status.ts` — 56 lines, thin wrapper (unchanged)
- `src/modules/status/formatters.ts` — receives the new workflow-state section
- All imports use `../lib/` paths per project conventions
- ESM imports with `.js` extensions (project uses Node.js ESM)

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 5.4: Run & Status Commands]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR44 — codeharness run]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR46 — codeharness status]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR5 — status returns in <1s]
- [Source: _bmad-output/planning-artifacts/architecture-v3.md#Decision 8 — Thin Commands, Fat Modules]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Command UX: codeharness status]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Command UX: codeharness run]
- [Source: src/lib/workflow-engine.ts — EngineConfig, EngineResult, executeWorkflow()]
- [Source: src/lib/workflow-state.ts — WorkflowState, readWorkflowState()]
- [Source: src/lib/workflow-parser.ts — parseWorkflow()]
- [Source: src/lib/agent-resolver.ts — resolveAgent()]
- [Source: src/commands/run.ts — existing run command with placeholder]
- [Source: src/modules/status/formatters.ts — handleFullStatus(), handleFullStatusJson()]
- [Source: _bmad-output/implementation-artifacts/5-3-crash-recovery-resume.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/5-4-run-status-commands-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/5-4-run-status-commands.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Replaced "temporarily unavailable" placeholder in run command with full workflow engine wiring
- Added --resume flag to run command (engine resumes by default per story 5-3)
- Added "No stories ready for execution" early exit (AC #9)
- Added Workflow Engine section to status display (human-readable and JSON)
- formatElapsed helper added in formatters.ts (per story dev notes pattern)
- All 4036 tests pass, zero regressions, 156 test files

### File List

- src/commands/run.ts — rewired to call parseWorkflow, resolveAgent, executeWorkflow; --resume flag now functional
- src/modules/status/formatters.ts — added workflow state display section
- src/commands/__tests__/run.test.ts — updated tests for workflow engine integration, added --resume tests
- src/modules/status/__tests__/formatters-workflow.test.ts — new test file for workflow state display
- src/lib/run-helpers.ts — formatElapsed and countStories used by run command (pre-existing, dependency)
