# Story 16.5: Coverage Deduplication

Status: verifying

## Story

As a developer,
I want the verify phase to read coverage from the output contract instead of re-running,
so that coverage is not computed twice per story.

## Acceptance Criteria

1. **Given** the implement task's output contract contains `testResults.coverage` and `coverage_met` is already `true` in the harness state (set by engine flag propagation in 16-4), **when** the verify task starts, **then** the evaluator prompt includes the coverage result from the contract as context (e.g., "Coverage already met: 95% (target: 90%)"). <!-- verification: test-provable -->

2. **Given** `coverage_met` is `true` in the harness state, **when** the verify/evaluator runs, **then** the coverage tool (`runCoverage`/`checkOnlyCoverage`) is NOT invoked — the evaluator receives the pre-computed coverage data instead. <!-- verification: test-provable -->

3. **Given** the implement task's output contract has `testResults: null` (no coverage data), **when** the verify task starts, **then** coverage runs normally via the existing path (`runCoverage` or `checkOnlyCoverage`), as a fallback. <!-- verification: test-provable -->

4. **Given** the implement task's output contract has `testResults.coverage` but `coverage_met` is `false` (coverage below target), **when** the verify task starts, **then** coverage runs normally — deduplication only applies when coverage is already met. <!-- verification: test-provable -->

5. **Given** `coverage_met` is `true` and `tests_passed` is `true`, **when** `checkPreconditions()` runs in the verify orchestrator, **then** preconditions pass without triggering any coverage computation. <!-- verification: test-provable -->

6. **Given** the evaluator prompt includes contract coverage context, **when** the evaluator inspects coverage, **then** it can determine coverage status from the prompt context alone without running external commands. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add coverage deduplication to the evaluator prompt builder (AC: #1, #6)
  - [x] Modify `buildEvaluatorPrompt()` in `src/lib/evaluator.ts` (or the workflow engine's evaluator dispatch path) to accept optional coverage context
  - [x] When `coverage_met === true` in harness state and `testResults.coverage` exists in the output contract, append a coverage context block to the evaluator prompt
  - [x] Format: "Coverage already verified by engine: {coverage}% (target: {target}%). No re-run needed."
  - [x] When no contract coverage data or `coverage_met === false`, do not append — evaluator uses normal flow

- [x] Task 2: Add coverage skip logic to the coverage command/runner path (AC: #2, #3, #4)
  - [x] In `src/commands/coverage.ts` or the coverage evaluation entry point, check harness state for `coverage_met === true` before running `runCoverage()`
  - [x] If `coverage_met` is already true, return a synthetic `CoverageResult` with data from the output contract (or simply skip the run and log the skip)
  - [x] If `coverage_met` is false or state is unavailable, fall through to existing `runCoverage()` path
  - [x] Ensure `checkOnlyCoverage()` respects the same skip logic

- [x] Task 3: Wire output contract data through the verify dispatch path (AC: #1, #2, #3, #4)
  - [x] The workflow engine already passes `previousOutputContract` to task dispatches via `buildPromptWithContractContext()` — verify that the verify task receives the implement task's output contract
  - [x] If the verify task does NOT currently receive the output contract, wire it through
  - [x] Extract `testResults.coverage` from the contract for use in deduplication decisions

- [x] Task 4: Write unit tests (AC: #1-#6)
  - [x] Test: evaluator prompt includes coverage context when `coverage_met === true` and contract has coverage
  - [x] Test: evaluator prompt does NOT include coverage context when `coverage_met === false`
  - [x] Test: evaluator prompt does NOT include coverage context when contract has `testResults: null`
  - [x] Test: `runCoverage` is not called when `coverage_met === true`
  - [x] Test: `runCoverage` IS called when `coverage_met === false` (fallback)
  - [x] Test: `checkPreconditions()` passes when both flags are true (existing test, verify still works)

- [x] Task 5: Verify backward compatibility (AC: #3, #4)
  - [x] Confirm that workflows without output contracts (older workflows) still run coverage normally
  - [x] Confirm the `codeharness coverage` CLI command works unchanged (it doesn't go through engine flag propagation)

## Dev Notes

### Architecture Constraints

- **Architecture Decision 7** (architecture-parallel-execution.md) specifies: "The verify task receives test results via output contract. The evaluator checks the contract's `testResults` field instead of re-running coverage. If `testResults.coverage >= target`, coverage is already met — no re-run."
- The engine already sets `coverage_met` and `tests_passed` in story 16-4 via `propagateVerifyFlags()` in `workflow-engine.ts`.
- The evaluator prompt is built in `src/lib/evaluator.ts` via `buildEvaluatorPrompt()`. Currently it's a static string — it needs to accept coverage context.
- The workflow engine passes output contracts between tasks via `buildPromptWithContractContext()` in `src/lib/agents/output-contract.ts`.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/evaluator.ts` | Extend `buildEvaluatorPrompt()` to accept and include coverage context |
| `src/lib/workflow-engine.ts` | Pass coverage state info to evaluator dispatch path |
| `src/commands/coverage.ts` | Add skip logic when `coverage_met === true` (optional — depends on whether the CLI command or the engine drives coverage during verify) |
| `src/lib/coverage/evaluator.ts` | Possibly add a `skipIfMet()` check before `evaluateCoverage()` |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/modules/verify/orchestrator.ts` | `checkPreconditions()` reads `tests_passed` and `coverage_met` from state — this is the gate |
| `src/lib/agents/types.ts` | `OutputContract` and `TestResults` interfaces — `testResults.coverage` is `number \| null` |
| `src/lib/agents/output-contract.ts` | `buildPromptWithContractContext()` — how output contracts flow between tasks |
| `src/lib/coverage/runner.ts` | `runCoverage()` and `checkOnlyCoverage()` — what gets skipped |

### Architecture Decision Reference

From `architecture-parallel-execution.md`, Decision 7:

```typescript
// After implement task completes:
if (taskName === 'implement' && outputContract?.testResults) {
  const { passed, failed, coverage } = outputContract.testResults;
  if (failed === 0) await setState('tests_passed', true);
  if (coverage >= state.coverage.target) await setState('coverage_met', true);
}
```

Coverage deduplication: The verify task receives test results via output contract. The evaluator checks the contract's `testResults` field instead of re-running coverage. If `testResults.coverage >= target`, coverage is already met — no re-run.

### Current Coverage Flow (Before This Story)

1. Implement task runs, produces output contract with `testResults`
2. Engine sets `tests_passed` and `coverage_met` flags (story 16-4)
3. Verify task starts, `checkPreconditions()` reads flags — passes if both true
4. **But:** the evaluator still calls `runCoverage()` to compute coverage independently, duplicating work
5. `updateCoverageState()` writes the same flags again

### Target Coverage Flow (After This Story)

1. Implement task runs, produces output contract with `testResults`
2. Engine sets `tests_passed` and `coverage_met` flags (story 16-4)
3. Verify task starts, `checkPreconditions()` reads flags — passes
4. **New:** Engine detects `coverage_met === true`, includes coverage data in evaluator prompt
5. **New:** Coverage tool is NOT re-run — evaluator uses contract data
6. Evaluator evaluates ACs using coverage context from prompt

### Edge Cases

- **`testResults.coverage` is `null`:** Fallback to normal coverage run. `coverage_met` will be `false` (null >= N is false), so dedup won't trigger.
- **`coverage_met` set by engine but evaluator re-runs coverage anyway:** This should be prevented by the skip logic. If the evaluator independently decides to run `npx vitest --coverage`, that's outside our control — the skip only applies to the programmatic path.
- **CLI `codeharness coverage` command:** This is user-initiated and should always run coverage. The dedup skip only applies to the engine-driven verify flow.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `__tests__/` directories
- ESM modules — use `.js` extensions in imports
- Build: `npm run build` (TypeScript compilation)
- Test: `npm test` (vitest)

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 16.5]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 7 — Verify Flag Propagation]
- [Source: src/lib/evaluator.ts — buildEvaluatorPrompt(), runBlindEvaluator()]
- [Source: src/lib/workflow-engine.ts — propagateVerifyFlags(), dispatchTaskWithResult()]
- [Source: src/modules/verify/orchestrator.ts — checkPreconditions()]
- [Source: src/lib/coverage/evaluator.ts — evaluateCoverage(), updateCoverageState()]
- [Source: src/lib/coverage/runner.ts — runCoverage(), checkOnlyCoverage()]
- [Source: src/lib/agents/types.ts — OutputContract, TestResults interfaces]
- [Source: src/lib/agents/output-contract.ts — buildPromptWithContractContext()]

### Previous Story (16-4) Intelligence

- Flag propagation implemented in `workflow-engine.ts` via `propagateVerifyFlags()` — called after every `dispatchTaskWithResult()` return.
- Guards on `taskName === 'implement'` and `contract?.testResults` being non-null.
- Reads harness state via `readStateWithBody()`, sets `session_flags.tests_passed` and `session_flags.coverage_met`, writes back.
- 8 unit tests added. All 4747 tests pass.
- `checkPreconditions()` in verify orchestrator already reads these exact flags — no changes needed to preconditions.
- Code review caught: duplicate type definitions, missing `projectDir` parameter, misleading JSDoc. Be precise.
- Currently `outputContract.testResults` is always `null` (hardcoded in engine). Flag propagation will activate when engine gains test result parsing from agent output.

### Git Intelligence

Recent commits:
- `21e441c feat: story 16-4 — verify flag propagation`
- `1831a88 feat: story 16-3 — telemetry writer module`
- `07e94a2 feat: story 16-2 — engine-handled null tasks`
- `e3c4761 feat: story 16-1 — hierarchical flow schema & parser`
- Commit pattern: `feat: story {N}-{M} — {title}`

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-5-coverage-deduplication-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-5-coverage-deduplication.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None required — all tests pass locally.

### Completion Notes List

- Task 1: Extended `buildEvaluatorPrompt()` to accept optional `CoverageContext` parameter. Added `CoverageContext` interface. When provided, appends "Coverage already verified by engine" line to the evaluator prompt.
- Task 2: Added `skipIfMet` parameter to `runCoverage()` and `checkOnlyCoverage()` in coverage runner. When `skipIfMet=true` and `coverage_met=true` in state, returns synthetic `CoverageResult` without executing coverage tools. Falls through to normal path otherwise.
- Task 3: Added `buildCoverageDeduplicationContext()` to `workflow-engine.ts`. Wired into `dispatchTaskWithResult()` step 7c — appends coverage context line to the prompt when `coverage_met=true` and contract has valid coverage data. Verified `previousOutputContract` already flows through `buildPromptWithContractContext()`.
- Task 4: Added 21 new tests across 3 test files. 8 tests for `buildCoverageDeduplicationContext`, 2 integration tests for `dispatchTask` coverage dedup prompt injection, 4 tests for `buildEvaluatorPrompt` with coverage context, 7 tests for runner `skipIfMet` logic (4 for `runCoverage`, 3 for `checkOnlyCoverage`).
- Task 5: Backward compatibility verified — all 4768 tests pass. CLI `codeharness coverage` unchanged (doesn't pass `skipIfMet`). `buildEvaluatorPrompt()` without args unchanged. `runCoverage()`/`checkOnlyCoverage()` without `skipIfMet` unchanged.

### Change Log

- 2026-04-03: Story 16-5 — Coverage deduplication. Prevent double coverage computation when engine has already verified coverage via flag propagation (story 16-4).

### File List

- `src/lib/evaluator.ts` — Added `CoverageContext` interface, extended `buildEvaluatorPrompt()` to accept optional coverage context, exported the function
- `src/lib/workflow-engine.ts` — Added `buildCoverageDeduplicationContext()` function, wired coverage dedup context into `dispatchTaskWithResult()` prompt construction
- `src/lib/coverage/runner.ts` — Added `skipIfMet` parameter to `runCoverage()` and `checkOnlyCoverage()`
- `src/lib/__tests__/evaluator.test.ts` — Added 4 tests for `buildEvaluatorPrompt` coverage context
- `src/lib/__tests__/workflow-engine.test.ts` — Added 10 tests for `buildCoverageDeduplicationContext` and `dispatchTask` coverage dedup integration
- `src/lib/coverage/__tests__/runner.test.ts` — Added 7 tests for `runCoverage`/`checkOnlyCoverage` `skipIfMet` logic
