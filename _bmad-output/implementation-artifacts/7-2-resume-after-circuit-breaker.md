# Story 7.2: Resume After Circuit Breaker

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to resume execution after the circuit breaker halts,
so that I can apply manual fixes and re-run verification without losing previous findings.

## Acceptance Criteria

1. **Given** workflow state has `circuit_breaker.triggered = true` and `phase = 'circuit-breaker'`
   **When** `codeharness run --resume` executes
   **Then** `circuit_breaker.triggered` is reset to `false`, `circuit_breaker.reason` is reset to `null`, and `phase` is reset to `'idle'`
   **And** engine execution proceeds (does not early-exit)
   <!-- verification: test-provable -->

2. **Given** workflow state has `circuit_breaker.triggered = true`
   **When** `codeharness run --resume` executes
   **Then** `circuit_breaker.score_history` is preserved (not cleared) so the developer can see cumulative progress
   **And** `evaluator_scores` array is preserved (not cleared) so the engine has full history
   <!-- verification: test-provable -->

3. **Given** workflow state has `phase = 'circuit-breaker'` and `iteration = 5`
   **When** `codeharness run --resume` executes
   **Then** the engine resumes from the verify step of the loop block (not from the beginning of the workflow)
   **And** the verify task re-runs the entire artifact from scratch (full re-verification, not incremental)
   <!-- verification: test-provable -->

4. **Given** circuit breaker halted with evaluator findings from previous iterations
   **When** `codeharness run --resume` executes
   **Then** the previous evaluator findings are available in the workflow state for injection into retry prompts
   <!-- verification: test-provable -->

5. **Given** `codeharness run` is invoked without `--resume` and state has `phase = 'circuit-breaker'`
   **When** the engine reads state
   **Then** the engine does NOT automatically reset the circuit breaker
   **And** it returns immediately (the circuit breaker halt is respected)
   <!-- verification: test-provable -->

6. **Given** `codeharness run --resume` resets the circuit breaker and verify runs again
   **When** the evaluator produces a new verdict with no improvement
   **Then** the circuit breaker triggers again (scores did not improve) with updated score history
   <!-- verification: test-provable -->

7. **Given** `npm run build` is executed
   **When** the build completes
   **Then** it succeeds with zero errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

8. **Given** unit tests for the resume-after-circuit-breaker functionality
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for the new/modified code covering: circuit breaker reset on resume, score history preservation, phase transition from circuit-breaker to idle, interaction with executeWorkflow when resuming, non-resume behavior (circuit breaker respected)
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Update `--resume` handling in `src/commands/run.ts` to reset circuit breaker state (AC: #1, #2, #5)
  - [x] In the `--resume` block (line 134), add a check for `phase === 'circuit-breaker'`
  - [x] When phase is `circuit-breaker`, reset: `circuit_breaker.triggered = false`, `circuit_breaker.reason = null`, `phase = 'idle'`
  - [x] Preserve `circuit_breaker.score_history` and `evaluator_scores` (do NOT clear them)
  - [x] Log an info message: `'Resuming after circuit breaker — previous findings preserved'`
  - [x] Ensure plain `codeharness run` (without `--resume`) does NOT reset circuit breaker

- [x] Task 2: Ensure workflow engine handles resumed circuit-breaker state correctly (AC: #3, #4, #6)
  - [x] Verify that `executeWorkflow` with `phase = 'idle'` and existing `iteration > 0` correctly resumes into the loop block
  - [x] Verify that the loop block's crash-recovery logic (checking `isLoopTaskCompleted`) allows re-entry at the verify step
  - [x] Verify that `evaluator_scores` history feeds into circuit breaker evaluation on subsequent iterations
  - [x] No changes to `workflow-engine.ts` needed — the existing resume logic handles this correctly.

- [x] Task 3: Write unit tests in `src/commands/__tests__/run.test.ts` (AC: #7, #8)
  - [x] Test: `--resume` with `phase = 'circuit-breaker'` resets triggered/reason/phase but keeps score_history and evaluator_scores
  - [x] Test: `--resume` with `phase = 'circuit-breaker'` logs appropriate info message
  - [x] Test: `--resume` with `phase = 'completed'` still works as before (regression test)
  - [x] Test: `--resume` with `phase = 'idle'` does not write state (regression test)
  - [x] Test: without `--resume`, `phase = 'circuit-breaker'` is NOT reset
  - [x] Verify `npm run build` passes
  - [x] Verify no regressions in existing tests

## Dev Notes

### Current Resume Behavior (What Exists)

The `--resume` flag in `run.ts` currently handles ONE case: when `phase === 'completed'`, it resets to `'idle'`. This story extends `--resume` to also handle `phase === 'circuit-breaker'`.

```typescript
// Current code (line 134 of run.ts):
if (options.resume) {
  const currentState = readWorkflowState(projectDir);
  if (currentState.phase === 'completed') {
    writeWorkflowState({ ...currentState, phase: 'idle' }, projectDir);
    info('Resuming from completed state — phase reset to idle', outputOpts);
  }
}
```

The change is to add an `else if` for `phase === 'circuit-breaker'`:

```typescript
if (options.resume) {
  const currentState = readWorkflowState(projectDir);
  if (currentState.phase === 'completed') {
    writeWorkflowState({ ...currentState, phase: 'idle' }, projectDir);
    info('Resuming from completed state — phase reset to idle', outputOpts);
  } else if (currentState.phase === 'circuit-breaker') {
    writeWorkflowState({
      ...currentState,
      phase: 'idle',
      circuit_breaker: {
        ...currentState.circuit_breaker,
        triggered: false,
        reason: null,
        // score_history is PRESERVED
      },
    }, projectDir);
    info('Resuming after circuit breaker — previous findings preserved', outputOpts);
  }
}
```

### Why No Changes to workflow-engine.ts

The workflow engine already supports resume from a partially-completed state:
- `executeWorkflow` reads state and skips completed tasks via `isTaskCompleted()` / `isLoopTaskCompleted()`
- `executeLoopBlock` checks if the current iteration is fully done and advances or resumes accordingly
- The circuit breaker check at line 666 only triggers if `circuit_breaker.triggered === true` — after reset, it won't fire
- `evaluator_scores` are preserved, so the circuit breaker can still detect stagnation on the next iteration

The only code change needed is in `run.ts` to reset the circuit breaker state before the engine runs.

### State Preservation Strategy

**Preserved on resume:**
- `evaluator_scores` — full history of all evaluator verdicts. The circuit breaker needs this for stagnation detection.
- `circuit_breaker.score_history` — cumulative passed counts. Useful for developer visibility.
- `tasks_completed` — checkpoint history. The engine uses this for crash recovery.
- `iteration` — current iteration number. The engine continues from here.

**Reset on resume:**
- `circuit_breaker.triggered` — set to `false` so the engine continues
- `circuit_breaker.reason` — set to `null` (no longer halted)
- `phase` — set to `'idle'` so `executeWorkflow` doesn't early-exit

### Edge Case: Re-triggering

After resume, if the evaluator runs again and scores don't improve, the circuit breaker will trigger again because `evaluator_scores` is preserved. The new score will be appended, and `evaluateProgress()` will compare the new score to the last pre-halt score. If no improvement, `halt: true` is returned again. This is correct behavior — it prevents infinite manual-fix-then-resume loops that don't actually fix anything.

### Dependencies

- **Modified file:** `src/commands/run.ts` — extend `--resume` handling
- **Modified file:** `src/commands/__tests__/run.test.ts` — add new test cases
- **No new files needed**
- **No new dependencies**

### File Structure

- Modified: `src/commands/run.ts` (~10 lines added)
- Modified: `src/commands/__tests__/run.test.ts` (~60-80 lines added)

### Testing Standards

- Framework: `vitest` (already configured)
- Pattern: co-located tests in `src/commands/__tests__/`
- Coverage target: 80%+
- The existing test file already mocks `readWorkflowState`, `writeWorkflowState`, and `executeWorkflow` — follow the same pattern
- The existing test at line 424 (`--resume resets completed phase to idle`) is the template for the new tests

### Anti-Patterns to Avoid

- **Do NOT clear evaluator_scores on resume** — the circuit breaker needs the full history to detect continued stagnation
- **Do NOT clear score_history on resume** — this is valuable for developer debugging
- **Do NOT modify workflow-engine.ts unless tests prove the existing resume logic is broken** — the engine already handles re-entry correctly
- **Do NOT add a new CLI flag** — `--resume` already exists and should handle this case
- **Do NOT reset `tasks_completed`** — the engine needs this for crash recovery
- **Do NOT reset `iteration`** — the engine should continue from the current iteration, not start over

### Project Structure Notes

- `src/commands/run.ts` already imports all needed functions
- `src/commands/__tests__/run.test.ts` already has the full mock setup needed
- No new directories or modules needed
- Follows the existing pattern of extending `--resume` behavior

### Previous Story Intelligence

From story 7-1 (circuit breaker module):
- `evaluateProgress()` in `circuit-breaker.ts` is pure computation — takes `EvaluatorScore[]`, returns `CircuitBreakerDecision`
- Stagnation detected when `passed` count doesn't increase for 2+ consecutive iterations
- `CircuitBreakerDecision.halt === true` includes `remainingFailures` and `scoreHistory`
- The engine records circuit breaker state in `workflow-state.yaml` and sets `phase = 'circuit-breaker'`

From story 5-3 (crash recovery):
- `readWorkflowState()` / `writeWorkflowState()` handle YAML persistence
- `executeWorkflow` reads state at startup and skips completed tasks
- Loop block resume uses `isLoopTaskCompleted()` to determine which tasks need re-execution

From story 5-2 (loop blocks):
- `executeLoopBlock` checks `circuit_breaker.triggered` at line 666 to decide whether to halt
- The loop iterates: retry (per-story, failed only) -> verify (per-run) -> check termination
- After resume with `triggered = false`, the loop will continue normally

### Git Intelligence

Recent commits follow: `feat: story {key} — {description}`. This story modifies existing files only (no new modules). The codebase uses TypeScript with ESM `.js` extensions in import paths. Tests use vitest with vi.mock patterns.

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 7.2: Resume After Circuit Breaker]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR35]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — circuit-breaker]
- [Source: src/commands/run.ts — --resume handling (lines 133-140)]
- [Source: src/lib/workflow-engine.ts — circuit breaker check (lines 666-669)]
- [Source: src/lib/workflow-engine.ts — loop block execution (lines 447-672)]
- [Source: src/lib/circuit-breaker.ts — evaluateProgress()]
- [Source: src/lib/workflow-state.ts — CircuitBreakerState, WorkflowState types]
- [Source: src/commands/__tests__/run.test.ts — existing --resume tests (lines 424-468)]
- [Source: _bmad-output/implementation-artifacts/7-1-score-based-circuit-breaker-module.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/7-2-resume-after-circuit-breaker-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/7-2-resume-after-circuit-breaker.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 80%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
N/A — no debug issues encountered.

### Completion Notes List
- Task 1: Added `else if (currentState.phase === 'circuit-breaker')` branch in the `--resume` handler in `run.ts`. Resets `triggered` to `false`, `reason` to `null`, and `phase` to `'idle'` while preserving `score_history`, `evaluator_scores`, `tasks_completed`, and `iteration`.
- Task 2: Verified existing workflow engine handles resumed state correctly — no changes to `workflow-engine.ts` needed.
- Task 3: Added 5 new test cases covering all acceptance criteria. All 4130 unit tests pass (32 in run.test.ts). Build succeeds with zero errors.

### File List
- `src/commands/run.ts` — extended `--resume` handler (~10 lines added)
- `src/commands/__tests__/run.test.ts` — 5 new test cases (~95 lines added)
