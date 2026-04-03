# Story 16.6: Story Flow Execution

Status: verifying

## Story

As a developer,
I want the workflow engine to execute `story_flow` for each story within an epic,
so that the hierarchical flow model drives story-level execution.

## Acceptance Criteria

1. **Given** a workflow with `story_flow: [implement, verify, loop: [retry, verify], telemetry]`, **when** the engine processes an epic's stories, **then** each story runs through the complete story_flow pipeline in order (implement, verify, loop block, telemetry). <!-- verification: test-provable -->

2. **Given** a story_flow containing a `telemetry` null task after the loop block, **when** a story's verify passes (loop exits early) or the loop exhausts max iterations, **then** the telemetry null task still executes after the loop completes. <!-- verification: test-provable -->

3. **Given** a story_flow with `loop: [retry, verify]`, **when** the loop executes, **then** existing loop semantics are preserved: max iterations, circuit breaker evaluation, early exit on pass verdict. <!-- verification: test-provable -->

4. **Given** a workflow with only `flow:` (no `story_flow`, no `execution`), **when** the engine runs, **then** behavior is identical to current behavior (backward compat). <!-- verification: test-provable -->

5. **Given** a workflow with both `story_flow` and `execution` sections, **when** the engine initializes, **then** it reads `storyFlow` from the resolved workflow instead of `flow`, and uses the `execution` config for engine-level settings. <!-- verification: test-provable -->

6. **Given** a resolved workflow where `storyFlow` is non-empty but `flow` is the legacy fallback, **when** the engine logs the workflow name, **then** it derives the name from `storyFlow` (not `flow`). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Switch `executeWorkflow()` to use `storyFlow` instead of `flow` (AC: #1, #4, #5)
  - [x] In `executeWorkflow()` (line ~1212), change `config.workflow.flow` to `config.workflow.storyFlow`
  - [x] `storyFlow` is already populated by `resolveHierarchicalFlow()` — for legacy `flow:` workflows, `storyFlow` contains the same steps as `flow` (backward compat guaranteed by story 16-1)
  - [x] Update the `workflow_name` derivation (line ~1172) to use `storyFlow` instead of `flow`
  - [x] Verify that `ResolvedWorkflow.flow` is still populated (it is — keep it for any other consumers)

- [x] Task 2: Verify loop semantics are preserved under `storyFlow` (AC: #3)
  - [x] The `executeLoopBlock()` function already handles `LoopBlock` steps — confirm it works identically when reached via `storyFlow` iteration
  - [x] Loop max iterations, circuit breaker, and early-exit-on-pass must behave the same
  - [x] Write a test: story_flow with loop block executes the loop with max iterations respected

- [x] Task 3: Verify telemetry null task executes after loop (AC: #2)
  - [x] The telemetry task appears after the loop block in `story_flow: [implement, verify, loop: [retry, verify], telemetry]`
  - [x] After the loop block completes (pass, max-iterations, or circuit-breaker), the engine continues to the next step (`telemetry`)
  - [x] Write a test: story_flow `[implement, verify, loop: [...], telemetry]` — telemetry handler is called after loop completes
  - [x] Edge case: if loop triggers `halted = true` (circuit breaker), does the engine skip telemetry? Document and test the behavior.

- [x] Task 4: Write unit tests for storyFlow execution (AC: #1–#6)
  - [x] Test: workflow with `story_flow` executes steps in order
  - [x] Test: workflow with only `flow` (legacy) still works identically
  - [x] Test: `workflow_name` is derived from `storyFlow` steps
  - [x] Test: story_flow with loop block preserves loop semantics
  - [x] Test: story_flow with null task after loop executes the null task
  - [x] Test: story_flow with multiple per-story tasks iterates all work items for each task

- [x] Task 5: Verify backward compatibility end-to-end (AC: #4)
  - [x] Run the full test suite — all existing tests that use `flow:` must pass unchanged
  - [x] The `ResolvedWorkflow.flow` field remains populated (no removal)
  - [x] Any code that reads `workflow.flow` directly still works

## Dev Notes

### Architecture Constraints

- **Architecture Decision 4** (architecture-parallel-execution.md): Workflow YAML gains `execution`, `story_flow`, `epic_flow`. Existing flat `flow:` is syntactic sugar for `story_flow:` with default execution config. Backward compatibility is mandatory.
- **Architecture Data Flow**: `Workflow YAML -> hierarchical-flow parser -> execution config + storyFlow + epicFlow -> workflow-engine (per lane) -> execute storyFlow for each story`
- The `resolveHierarchicalFlow()` function (story 16-1) already normalizes `flow:` into `storyFlow`. The engine just needs to read `storyFlow` instead of `flow`.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/workflow-engine.ts` | Change `config.workflow.flow` to `config.workflow.storyFlow` in `executeWorkflow()`. Update `workflow_name` derivation. |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/hierarchical-flow.ts` | `resolveHierarchicalFlow()` — produces `storyFlow` from `flow:` or `story_flow:`. Already done in 16-1. |
| `src/lib/workflow-parser.ts` | `ResolvedWorkflow` interface — has both `flow` and `storyFlow` fields. |
| `src/lib/null-task-registry.ts` | Null task handler registry — telemetry handler registered at module load. |
| `src/lib/telemetry-writer.ts` | `writeTelemetryEntry()` — the telemetry null task handler. |
| `src/lib/__tests__/null-task-engine.test.ts` | Existing tests for null task execution in the engine — verify they still pass. |
| `src/lib/__tests__/workflow-engine.test.ts` | Existing engine tests — all must pass unchanged. |

### Critical Implementation Detail

The change is intentionally minimal. `resolveHierarchicalFlow()` (story 16-1) already does the heavy lifting:
- Legacy `flow:` workflows get `storyFlow = flow` (same steps)
- Hierarchical `story_flow:` workflows get `storyFlow` directly from YAML

The engine change is essentially: `for (const step of config.workflow.flow)` -> `for (const step of config.workflow.storyFlow)`.

The risk is in any code path that reads `config.workflow.flow` directly. Grep the codebase for `workflow.flow` and `\.flow\b` to find all consumers before changing.

### Previous Story (16-5) Intelligence

- 16-5 added coverage deduplication: `buildCoverageDeduplicationContext()` in `workflow-engine.ts`, wired into `dispatchTaskWithResult()`. Coverage skip logic in runner.
- 16-4 added `propagateVerifyFlags()` in `workflow-engine.ts` — called after every `dispatchTaskWithResult()`.
- 16-3 added `telemetry-writer.ts` and the `telemetry` null task handler in the registry.
- 16-2 added `executeNullTask()` in `workflow-engine.ts` and the null task registry.
- 16-1 added `hierarchical-flow.ts` with `resolveHierarchicalFlow()`, `HierarchicalFlow` interface, `ExecutionConfig`.
- Code review (16-5) caught: duplicate type definitions, missing parameters, misleading JSDoc. Be precise.
- All 4768 tests pass as of 16-5.

### Edge Cases

- **Circuit breaker halts during loop**: If the loop sets `halted = true` via circuit breaker, the `for` loop over `storyFlow` steps will `break` — telemetry after the loop will NOT run. This matches current `flow:` behavior. Document this as expected.
- **`max-iterations` phase after loop**: If loop sets `state.phase = 'max-iterations'`, the engine sets `halted = true` — again, telemetry won't run. Same as current behavior.
- **Empty `storyFlow`**: If `storyFlow` is `[]` (no steps), the engine completes immediately. This is valid and matches `resolveHierarchicalFlow()` returning `[]` for missing flows.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `__tests__/` directories
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`
- Test: `npm test`

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 16.6]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 4 — Hierarchical Flow Model]
- [Source: src/lib/hierarchical-flow.ts — resolveHierarchicalFlow(), HierarchicalFlow interface]
- [Source: src/lib/workflow-parser.ts — ResolvedWorkflow interface (flow, storyFlow, epicFlow)]
- [Source: src/lib/workflow-engine.ts — executeWorkflow(), executeLoopBlock(), executeNullTask()]
- [Source: src/lib/null-task-registry.ts — getNullTask(), registerNullTask()]
- [Source: src/lib/telemetry-writer.ts — writeTelemetryEntry()]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-6-story-flow-execution-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-6-story-flow-execution.md

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

- Task 1: Changed two references in `executeWorkflow()` from `config.workflow.flow` to `config.workflow.storyFlow` — line 1172 (workflow_name derivation) and line 1212 (step iteration loop). `ResolvedWorkflow.flow` remains populated for other consumers.
- Task 2: Confirmed `executeLoopBlock()` works identically via `storyFlow` iteration — the loop block detection (`isLoopBlock`) is step-type based, not array-source based. Added test verifying loop semantics preserved.
- Task 3: Confirmed telemetry null task executes after loop when engine is not halted. Documented and tested that circuit-breaker halt causes `halted = true` which breaks the storyFlow iteration, skipping telemetry. This matches existing `flow:` behavior.
- Task 4: Created 11 unit tests in `story-flow-execution.test.ts` covering all 6 acceptance criteria plus edge cases (empty storyFlow, multiple work items, loop block name filtering).
- Task 5: Full test suite passes — 4779 tests (4768 existing + 11 new), zero regressions. `workflow.flow` field verified populated in tests. `default-workflow.test.ts` reads `workflow.flow` directly and passes unchanged.

### Change Log

- 2026-04-03: Story 16-6 implementation — switched engine from `flow` to `storyFlow`, added 11 tests

### File List

- `src/lib/workflow-engine.ts` (modified — 2 lines changed)
- `src/lib/__tests__/story-flow-execution.test.ts` (new — 11 tests for storyFlow execution)
