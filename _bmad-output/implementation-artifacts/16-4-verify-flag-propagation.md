# Story 16.4: Verify Flag Propagation

Status: verifying

## Story

As a developer,
I want the engine to set `tests_passed` and `coverage_met` from the dev task's output contract,
so that verification doesn't fail on missing flags set by subagents.

## Acceptance Criteria

1. **Given** the implement task completes with an output contract containing `testResults`, **when** `testResults.failed === 0`, **then** the engine sets `session_flags.tests_passed = true` in the harness state file (`.codeharness/state.yaml`). <!-- verification: test-provable -->

2. **Given** the implement task completes with an output contract containing `testResults`, **when** `testResults.coverage >= coverage.target` from the harness state, **then** the engine sets `session_flags.coverage_met = true` in the harness state file. <!-- verification: test-provable -->

3. **Given** the implement task completes with an output contract that has no `testResults` (null), **when** the engine processes the output contract, **then** neither `tests_passed` nor `coverage_met` is changed — existing behavior is preserved. <!-- verification: test-provable -->

4. **Given** the implement task completes with `testResults.failed > 0`, **when** the engine processes the output contract, **then** `tests_passed` remains `false` (the engine does NOT set it). <!-- verification: test-provable -->

5. **Given** the implement task completes with `testResults.coverage < coverage.target`, **when** the engine processes the output contract, **then** `coverage_met` remains `false`. <!-- verification: test-provable -->

6. **Given** flag propagation runs after the implement task, **when** the verify task subsequently starts, **then** it reads `tests_passed = true` and `coverage_met = true` from state and its precondition check passes without re-running coverage. <!-- verification: test-provable -->

7. **Given** the engine's flag propagation logic, **when** the task name is NOT `implement` (e.g., `verify`, `telemetry`, `retry`), **then** no flag propagation occurs — only the implement task triggers flag writes. <!-- verification: test-provable -->

8. **Given** the output contract has `testResults.coverage = null`, **when** flag propagation runs, **then** `coverage_met` is not changed (null coverage is not >= any target). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add flag propagation logic to `workflow-engine.ts` (AC: #1, #2, #3, #4, #5, #7, #8)
  - [x] Import `readStateWithBody` and `writeState` from `../state.js` (harness state, not workflow state)
  - [x] After `dispatchTaskWithResult` completes for a task named `implement`, check if the returned output contract has `testResults`
  - [x] If `testResults.failed === 0`, read harness state, set `session_flags.tests_passed = true`, write state
  - [x] If `testResults.coverage !== null && testResults.coverage >= state.coverage.target`, set `session_flags.coverage_met = true`
  - [x] Write state once (read, set both flags, write) to avoid double I/O
  - [x] Guard: only run for `taskName === 'implement'` — skip for all other task names
  - [x] Guard: skip entirely if `outputContract?.testResults` is null/undefined

- [x] Task 2: Extract flag propagation into a helper function (AC: #1-#8)
  - [x] Create `propagateVerifyFlags(taskName: string, contract: OutputContract | null, projectDir: string): void`
  - [x] Function is pure side-effect (writes to state file) — returns void
  - [x] Keep it inside `workflow-engine.ts` as a private function (not exported) — it's engine-internal logic
  - [x] Call from both the sequential dispatch path and the loop block dispatch path

- [x] Task 3: Write unit tests (AC: #1-#8)
  - [x] Test: implement task with `failed === 0` sets `tests_passed = true`
  - [x] Test: implement task with `coverage >= target` sets `coverage_met = true`
  - [x] Test: implement task with `failed > 0` does NOT set `tests_passed`
  - [x] Test: implement task with `coverage < target` does NOT set `coverage_met`
  - [x] Test: implement task with `testResults: null` does not change any flags
  - [x] Test: non-implement task (e.g., `verify`) does not trigger flag propagation
  - [x] Test: `testResults.coverage = null` does not set `coverage_met`
  - [x] Test: both flags set in single state write when both conditions met

- [x] Task 4: Verify integration with existing verify module (AC: #6)
  - [x] Confirm `checkPreconditions()` in `src/modules/verify/orchestrator.ts` reads the flags that the engine now sets
  - [x] No changes needed to the verify module — it already reads `session_flags.tests_passed` and `session_flags.coverage_met`

## Dev Notes

### Architecture Constraints

- **Modified file:** `src/lib/workflow-engine.ts` — add flag propagation after implement task dispatch.
- **Imported module:** `src/lib/state.ts` — the harness state module that manages `.codeharness/state.yaml`. Use `readStateWithBody()` and `writeState()`.
- **No new files.** The logic is engine-internal and belongs in `workflow-engine.ts`.
- **No new dependencies.** Only uses existing `state.ts` imports.

### Architecture Decision Reference

Architecture Decision 7 (architecture-parallel-execution.md) specifies:

```typescript
// After implement task completes:
if (taskName === 'implement' && outputContract?.testResults) {
  const { passed, failed, coverage } = outputContract.testResults;
  if (failed === 0) await setState('tests_passed', true);
  if (coverage >= state.coverage.target) await setState('coverage_met', true);
}
```

This pseudocode must be adapted to the actual API: `readStateWithBody()` returns `{ state, body }`, and `writeState(state, dir, body)` writes back.

### Current Flag Setting Mechanism

Today, `tests_passed` and `coverage_met` are set by `src/lib/coverage/evaluator.ts` (line 48-49) in `updateState()`:
```typescript
state.session_flags.tests_passed = result.testsPassed;
state.session_flags.coverage_met = evaluation.met;
```

This runs when coverage is explicitly evaluated. The problem: in the workflow engine flow, the implement task's output contract already contains test results, but the flags aren't set until the verify/coverage step runs. If the verify step can't set them (e.g., subagent context issues), verification fails.

Story 16-4 adds a second path: the engine sets these flags immediately after the implement task, before verify runs. The coverage evaluator's path remains unchanged — it will overwrite with the same values or correct values if re-running coverage.

### Integration Points

1. **`dispatchTaskWithResult()`** — the function that runs a regular (non-null) task dispatch. After it returns, check the output contract.
2. **Loop block dispatch** — tasks inside `loop:` blocks also call `dispatchTaskWithResult()`. The implement task can appear inside a loop (retry pattern). Flag propagation must run after each dispatch in the loop too.
3. **`readStateWithBody()` / `writeState()`** — from `src/lib/state.ts`. The harness state file is at `{projectDir}/.codeharness/state.yaml`.

### Where to Insert the Call

The engine has multiple dispatch call sites. The flag propagation helper should be called after every `dispatchTaskWithResult` return. Look for all call sites of `dispatchTaskWithResult` in the engine and insert the call after each one. The helper itself checks `taskName === 'implement'` so it's safe to call unconditionally.

Key call sites in `workflow-engine.ts`:
- Sequential flow dispatch (~line 1215)
- Per-item flow dispatch (~line 1247)
- Loop block regular dispatch (~line 809)
- Loop block evaluator dispatch (~line 841) — this is for evaluator tasks, skip flag propagation (evaluators are not implement tasks)

### Edge Cases

- **`testResults.coverage` is `null`:** The dev agent may not report coverage. `null >= 80` is `false` in JS, so `coverage_met` won't be set. This is correct behavior.
- **Multiple implement dispatches (retry loop):** Each successful retry will re-set the flags. This is idempotent — setting `true` multiple times is fine.
- **`projectDir` resolution:** The engine's `EngineConfig` does not currently carry `projectDir`. Use `process.cwd()` or extract from the sprint status path. Check how the engine resolves the project directory.

### Testing Strategy

- Tests go in `src/lib/__tests__/workflow-engine.test.ts` (existing test file).
- Mock `readStateWithBody` and `writeState` from `state.ts`.
- Create an output contract with various `testResults` configurations.
- Assert that state writes happen with correct flag values.
- Verify no state writes for non-implement tasks.

### Project Structure Notes

- Source: `src/lib/workflow-engine.ts`
- Tests: `src/lib/__tests__/workflow-engine.test.ts`
- Build: TypeScript compiled to `dist/`
- Test runner: vitest
- ESM module — use `.js` extensions in imports

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 16.4]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 7 — Verify Flag Propagation]
- [Source: src/lib/state.ts — readStateWithBody, writeState, HarnessState interface]
- [Source: src/lib/coverage/evaluator.ts — current flag setting mechanism (lines 48-49)]
- [Source: src/modules/verify/orchestrator.ts — checkPreconditions reads tests_passed/coverage_met]
- [Source: src/lib/agents/types.ts — OutputContract, TestResults interfaces]
- [Source: src/lib/workflow-engine.ts — dispatchTaskWithResult, executeNullTask]
- [Source: _bmad-output/implementation-artifacts/16-3-telemetry-writer.md — previous story context]

### Previous Story (16-3) Intelligence

- Telemetry writer implemented successfully. `writeTelemetryEntry` registered as real handler in `null-task-registry.ts`.
- `TaskContext` includes `outputContract` — the output contract from the previous task. This is how data flows between tasks.
- All 4676+ tests pass. Do not break existing tests.
- Code review caught: duplicate type definitions, missing `projectDir` parameter, misleading JSDoc. Be precise in imports and types.
- Commit pattern: `feat: story 16-4 — verify flag propagation`

### Git Intelligence

Recent commits:
- `1831a88 feat: story 16-3 — telemetry writer module`
- `07e94a2 feat: story 16-2 — engine-handled null tasks`
- `e3c4761 feat: story 16-1 — hierarchical flow schema & parser`
- Pattern: feature commits use `feat: story {N}-{M} — {title}`

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-4-verify-flag-propagation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-4-verify-flag-propagation.md

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

- Added `propagateVerifyFlags()` private function to `workflow-engine.ts` — reads harness state, sets `tests_passed` and `coverage_met` flags, writes state back in a single I/O operation.
- Inserted `propagateVerifyFlags()` calls after all 6 `dispatchTaskWithResult` call sites (dispatchTask wrapper, loop per-story, loop per-run, loop retry, sequential per-run, sequential per-story).
- The function guards on `taskName === 'implement'` and `contract?.testResults` being non-null, so it's safe to call unconditionally after every dispatch.
- Currently the engine builds output contracts with `testResults: null` (hardcoded). Flag propagation will activate when the engine gains test result parsing from agent output (likely a future story). The logic is tested via contract mutation in `writeOutputContract` mock.
- Added 8 unit tests covering all acceptance criteria.
- Confirmed `checkPreconditions()` in `src/modules/verify/orchestrator.ts` already reads the exact flags set by this feature — no changes needed.
- All 4747 tests pass with zero regressions.

### File List

- `src/lib/workflow-engine.ts` — added import for `readStateWithBody`/`writeState`, added `propagateVerifyFlags()` function, inserted calls at all dispatch sites
- `src/lib/__tests__/workflow-engine.test.ts` — added mocks for `state.js`, added 8 tests for flag propagation
- `_bmad-output/implementation-artifacts/16-4-verify-flag-propagation.md` — updated status to review, marked tasks complete
