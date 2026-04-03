# Story 7.1: Score-Based Circuit Breaker Module

Status: verifying

## Story

As a developer,
I want a circuit breaker that detects evaluator score stagnation,
so that the engine halts instead of burning tokens on repeated failing iterations.

## Acceptance Criteria

1. **Given** a new file `src/lib/circuit-breaker.ts` exists
   **When** inspected
   **Then** it exports an `evaluateProgress()` function that accepts an array of `EvaluatorScore` entries (from `workflow-state.ts`) and returns a `CircuitBreakerDecision` indicating whether to continue or halt
   <!-- verification: test-provable -->

2. **Given** evaluator scores across iterations where the `passed` count has not increased for 2+ consecutive iterations
   **When** `evaluateProgress()` is called
   **Then** it returns `{ halt: true, reason: 'score-stagnation', ... }` indicating stagnation was detected
   <!-- verification: test-provable -->

3. **Given** evaluator scores across iterations where the `passed` count increased in the most recent iteration
   **When** `evaluateProgress()` is called
   **Then** it returns `{ halt: false }` indicating progress is being made
   <!-- verification: test-provable -->

4. **Given** fewer than 2 evaluator scores recorded (first iteration or only one score)
   **When** `evaluateProgress()` is called
   **Then** it returns `{ halt: false }` because there is insufficient history to detect stagnation
   <!-- verification: test-provable -->

5. **Given** `evaluateProgress()` returns `{ halt: true }`
   **When** the result is inspected
   **Then** it includes `remainingFailures`: the list of AC numbers that still fail, extracted from the most recent score, and `scoreHistory`: the array of `passed` counts across all iterations
   <!-- verification: test-provable -->

6. **Given** the `CircuitBreakerDecision` type exported from `circuit-breaker.ts`
   **When** inspected
   **Then** it is a discriminated union: `{ halt: false }` or `{ halt: true; reason: string; remainingFailures: number[]; scoreHistory: number[] }`
   <!-- verification: test-provable -->

7. **Given** a score history of realistic size (up to 20 iterations)
   **When** `evaluateProgress()` is called
   **Then** it completes in under 5ms (no async operations, pure computation)
   <!-- verification: test-provable -->

8. **Given** the workflow engine in `workflow-engine.ts`
   **When** a loop iteration completes and a verdict score has been recorded
   **Then** the engine calls `evaluateProgress()` from `circuit-breaker.ts` and, if `halt: true`, sets `circuit_breaker.triggered = true`, `circuit_breaker.reason` to the returned reason, and updates `circuit_breaker.score_history` in the workflow state
   <!-- verification: test-provable -->

9. **Given** unit tests for the circuit breaker module
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for `circuit-breaker.ts` covering: stagnation detection, progress detection, insufficient history, remaining failures extraction, score history reporting, edge cases (all-unknown scores, zero-to-zero stagnation, single AC)
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/circuit-breaker.ts` with types and `evaluateProgress()` (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Define `CircuitBreakerDecision` discriminated union type
  - [x] Implement `evaluateProgress(scores: EvaluatorScore[]): CircuitBreakerDecision`
  - [x] Stagnation rule: halt when `passed` count has not increased for 2+ consecutive iterations
  - [x] Extract remaining failures from `total - passed` of the latest score
  - [x] Build `scoreHistory` as `scores.map(s => s.passed)`
  - [x] Return `{ halt: false }` for fewer than 2 scores
  - [x] Keep module pure (no I/O, no async, no state mutation)

- [x] Task 2: Integrate `evaluateProgress()` into `workflow-engine.ts` loop block (AC: #8)
  - [x] Import `evaluateProgress` from `circuit-breaker.ts`
  - [x] After recording evaluator score in the loop (around line 616), call `evaluateProgress(currentState.evaluator_scores)`
  - [x] If `halt: true`, update `currentState.circuit_breaker` with `{ triggered: true, reason, score_history: decision.scoreHistory }`
  - [x] The existing check at line 651 (`if (currentState.circuit_breaker.triggered)`) already handles the halt — no changes needed there

- [x] Task 3: Write unit tests in `src/lib/__tests__/circuit-breaker.test.ts` (AC: #9, #10)
  - [x] Test: 2+ scores with no improvement triggers halt
  - [x] Test: improving scores do not trigger halt
  - [x] Test: fewer than 2 scores returns halt: false
  - [x] Test: halt decision includes correct remainingFailures
  - [x] Test: halt decision includes correct scoreHistory
  - [x] Test: all-unknown scores (passed=0 across iterations) triggers halt
  - [x] Test: single-AC edge case (passed goes 0, 0 = stagnation)
  - [x] Test: passed goes 1, 1, 2 = no stagnation (improved on last iteration)
  - [x] Test: passed goes 1, 2, 2 = stagnation (last two identical)
  - [x] Test: performance — 20 scores evaluates in <5ms
  - [x] Verify `npm run build` passes
  - [x] Verify no regressions in existing tests

## Dev Notes

### Module Design

`circuit-breaker.ts` is a pure computation module — no file I/O, no async, no side effects. It takes evaluator score history and returns a decision. The workflow engine is responsible for calling it and updating state.

The stagnation detection algorithm is simple: compare the `passed` count of the last N iterations. If the most recent `passed` count is not greater than the one before it (for 2+ consecutive iterations), stagnation is detected. This prevents burning tokens when the dev agent keeps producing the same failing code.

### CircuitBreakerDecision Type

```typescript
export type CircuitBreakerDecision =
  | { halt: false }
  | {
      halt: true;
      reason: string;
      remainingFailures: number[];
      scoreHistory: number[];
    };
```

The `remainingFailures` field should contain AC indices that are still failing. Since `EvaluatorScore` only has aggregate counts (passed/failed/unknown), not per-AC detail, `remainingFailures` should be derived as a range `[1..total]` minus passed count — or more practically, just report the count of failures. However, the epic says "remaining failures" — check if the engine has access to the full `EvaluatorVerdict.findings` to extract specific AC numbers. If not, use the aggregate score.

**Clarification:** The `workflow-engine.ts` currently stores only the aggregate `EvaluatorScore` in state (passed/failed/unknown/total), NOT the per-AC findings. The `EvaluatorVerdict.findings` array is available at verdict parse time but is not persisted to state. For `remainingFailures`, use the aggregate: `total - passed` gives the count, and you can produce an array like `[1, 2, ..., (total-passed)]` as placeholder indices. If the engine later needs specific AC numbers, that's a future enhancement.

### Integration Point in workflow-engine.ts

The score recording happens at lines 587-616 of `workflow-engine.ts`. After the score is recorded and state is written, insert the circuit breaker evaluation:

```typescript
// After writeWorkflowState(currentState, projectDir); on line 616
const cbDecision = evaluateProgress(currentState.evaluator_scores);
if (cbDecision.halt) {
  currentState = {
    ...currentState,
    circuit_breaker: {
      triggered: true,
      reason: cbDecision.reason,
      score_history: cbDecision.scoreHistory,
    },
  };
  writeWorkflowState(currentState, projectDir);
}
```

The existing check at line 651 already handles `circuit_breaker.triggered === true` by setting phase to `'circuit-breaker'` and returning.

### Existing Types in workflow-state.ts

The module already defines the types this story needs:

```typescript
// Already exists in workflow-state.ts:
export interface EvaluatorScore {
  iteration: number;
  passed: number;
  failed: number;
  unknown: number;
  total: number;
  timestamp: string;
}

export interface CircuitBreakerState {
  triggered: boolean;
  reason: string | null;
  score_history: number[];
}
```

Import `EvaluatorScore` from `workflow-state.ts`. Do NOT redefine these types.

### Dependencies

- **Imports from:** `workflow-state.ts` (for `EvaluatorScore` type only)
- **Imported by:** `workflow-engine.ts` (calls `evaluateProgress()`)
- **No other dependencies.** This is a leaf module.

### File Structure

- New file: `src/lib/circuit-breaker.ts` — the module (~50-80 LOC)
- New file: `src/lib/__tests__/circuit-breaker.test.ts` — unit tests (~120-180 LOC)
- Modified file: `src/lib/workflow-engine.ts` — add import and call to `evaluateProgress()` after score recording

### Testing Standards

- Framework: `vitest` (already configured)
- Pattern: co-located tests in `src/lib/__tests__/`
- Coverage target: 80%+
- No mocks needed — `evaluateProgress()` is pure computation
- Performance test: use `performance.now()` to assert <5ms

### Anti-Patterns to Avoid

- **Do NOT add async to evaluateProgress()** — it's pure synchronous computation
- **Do NOT read/write workflow-state.yaml from circuit-breaker.ts** — the engine handles state persistence
- **Do NOT redefine EvaluatorScore or CircuitBreakerState** — import from workflow-state.ts
- **Do NOT modify the CircuitBreakerState interface** — the existing shape is correct
- **Do NOT cache state between calls** — each call is independent, receives full score history
- **Do NOT add the circuit breaker to the module's own state** — the engine manages `WorkflowState`
- **Do NOT import from evaluator.ts or verdict-parser.ts** — circuit-breaker only needs aggregate scores

### Project Structure Notes

- `src/lib/circuit-breaker.ts` aligns with architecture-v2.md module list (7 core modules)
- Test file `src/lib/__tests__/circuit-breaker.test.ts` follows co-located test pattern
- No new directories needed
- No new dependencies needed

### Previous Story Intelligence

From story 6-3 (evaluator prompt template):
- The evaluator agent now has a full anti-leniency prompt template in `evaluator.yaml`
- `compileSubagentDefinition()` incorporates `prompt_template` into agent instructions
- The evaluator produces `EvaluatorVerdict` JSON with per-AC scores

From story 6-2 (verdict schema & parsing):
- `parseVerdict()` in `verdict-parser.ts` returns `EvaluatorVerdict` with `score.passed`, `score.failed`, `score.unknown`, `score.total`
- `VerdictParseError` with `retryable` flag — retry semantics already in engine

From story 5-2 (loop blocks):
- Loop execution in `workflow-engine.ts` iterates until pass, max-iterations, or circuit-breaker
- The engine already checks `circuit_breaker.triggered` at line 651 — this story makes that check meaningful by actually setting `triggered: true`

From story 1-3 (workflow state):
- `WorkflowState` includes `circuit_breaker: CircuitBreakerState` with `triggered`, `reason`, `score_history`
- `EvaluatorScore` includes `iteration`, `passed`, `failed`, `unknown`, `total`, `timestamp`
- State is persisted as YAML in `.codeharness/workflow-state.yaml`

### Git Intelligence

Recent commits follow the pattern: `feat: story {key} -- {description}`. Each story adds one module file, one test file, and modifies integration points. The codebase uses TypeScript with ESM imports (`.js` extension in import paths).

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 7.1: Score-Based Circuit Breaker Module]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — circuit-breaker]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Integration Boundaries & Data Flow]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR32-35 (Progress & Circuit Breaker)]
- [Source: src/lib/workflow-state.ts — EvaluatorScore, CircuitBreakerState, WorkflowState types]
- [Source: src/lib/workflow-engine.ts — loop execution, score recording (lines 587-655)]
- [Source: src/lib/verdict-parser.ts — EvaluatorVerdict interface]
- [Source: src/lib/evaluator.ts — evaluator dispatch and result types]
- [Source: _bmad-output/implementation-artifacts/6-3-evaluator-prompt-template.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/7-1-score-based-circuit-breaker-module-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/7-1-score-based-circuit-breaker-module.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 80%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
