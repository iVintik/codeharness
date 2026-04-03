# Story 18.3: Cross-Worktree Test Validation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the full test suite to run after every merge,
so that merged code is proven to work before accepting.

## Acceptance Criteria

1. **Given** a successful clean merge (no conflicts) completes in `mergeWorktree()`, **when** the test suite runs on merged main, **then** all tests must pass for the merge to be accepted — `MergeResult.success` is `true` and `MergeResult.testResults` contains pass/fail counts. <!-- verification: test-provable -->

2. **Given** the test suite fails after a clean merge (no agent resolution involved), **when** failure is detected, **then** the merge is reverted (`git reset --hard HEAD~1`) and `MergeResult` returns `{ success: false, reason: 'tests-failed' }` with the test results — the merge is NOT retried (immediate escalation for clean merges). <!-- verification: test-provable -->

3. **Given** the test suite fails after agent-resolved conflict resolution, **when** failure is detected, **then** the merge is reverted and the agent retries with the test failure output appended as context — up to 3 total attempts (this is the existing `resolveConflicts` retry loop in `merge-agent.ts`). <!-- verification: test-provable -->

4. **Given** a merge completes (clean or agent-resolved) and the test suite passes, **when** the test result is available, **then** test results (passed count, failed count, coverage percentage) are written as a telemetry entry to `.codeharness/telemetry.jsonl` via the telemetry writer. <!-- verification: test-provable -->

5. **Given** the project's workflow defines a test command in `execution.test_command` or defaults to `npm test`, **when** the test suite runs after merge, **then** it uses the configured test command and respects the existing 5-minute timeout from `runTestSuite()`. <!-- verification: test-provable -->

6. **Given** `worktree-manager.ts` already runs the test suite after a clean merge and `merge-agent.ts` runs it after agent resolution, **when** this story is complete, **then** a new `src/lib/cross-worktree-validator.ts` module exports a `validateMerge(options: ValidateMergeOptions): Promise<ValidationResult>` function that encapsulates the test-run-after-merge logic, and both `worktree-manager.ts` and `merge-agent.ts` delegate to it instead of having their own `runTestSuite` implementations. <!-- verification: test-provable -->

7. **Given** the `ValidationResult` interface, **when** inspected, **then** it includes: `valid: boolean`, `testResults: { passed: number; failed: number; coverage?: number }`, `output: string` (raw test command stdout for retry context), and `durationMs: number`. <!-- verification: test-provable -->

8. **Given** the `ValidateMergeOptions` interface, **when** inspected, **then** it includes: `testCommand: string`, `cwd: string`, `epicId: string`, `storyKey?: string`, and `writeTelemetry: boolean`. <!-- verification: test-provable -->

9. **Given** `writeTelemetry` is `true` in `ValidateMergeOptions`, **when** the test suite completes (pass or fail), **then** a telemetry entry is appended to `.codeharness/telemetry.jsonl` with the merge validation results — including `storyKey` set to `merge-{epicId}`, test results, and duration. <!-- verification: test-provable -->

10. **Given** the validator module is wired into both `worktree-manager.ts` and `merge-agent.ts`, **when** the existing test suites for those modules run, **then** all existing tests continue to pass — no regressions. <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/cross-worktree-validator.ts` (AC: #6, #7, #8)
  - [x] Define `ValidateMergeOptions` interface (testCommand, cwd, epicId, storyKey?, writeTelemetry)
  - [x] Define `ValidationResult` interface (valid, testResults, output, durationMs)
  - [x] Extract `runTestSuite` + `parseTestOutput` from worktree-manager.ts into `validateMerge()` function
  - [x] Export `validateMerge`, `ValidateMergeOptions`, `ValidationResult`

- [x] Task 2: Add telemetry integration (AC: #4, #9)
  - [x] Import `writeTelemetryEntry` from `telemetry-writer.ts`
  - [x] When `writeTelemetry: true`, write a TelemetryEntry after test suite completes
  - [x] Set `storyKey` to `merge-{epicId}`, `epicId` from options, `testResults` from suite run
  - [x] Write telemetry on both pass and fail outcomes

- [x] Task 3: Refactor `worktree-manager.ts` to use validator (AC: #1, #2, #5, #10)
  - [x] Replace the private `runTestSuite()` and `parseTestOutput()` methods with a call to `validateMerge()`
  - [x] Pass `writeTelemetry: true` so merge validation results are logged
  - [x] Preserve all existing merge behavior (clean merge revert on test failure, cleanup on success)
  - [x] Run existing worktree-manager tests — all must pass

- [x] Task 4: Refactor `merge-agent.ts` to use validator (AC: #3, #10)
  - [x] Replace the local `runTestSuite()` and `parseTestOutput()` functions with `validateMerge()`
  - [x] Pass `writeTelemetry: false` for retry attempts, `true` only for final successful validation
  - [x] Preserve retry loop behavior: revert on failure, append test output to next attempt prompt
  - [x] Run existing merge-agent tests — all must pass

- [x] Task 5: Write unit tests for `cross-worktree-validator.ts` (AC: #1-#10)
  - [x] Test: `validateMerge()` runs test command and returns `valid: true` when tests pass
  - [x] Test: `validateMerge()` returns `valid: false` with test output when tests fail
  - [x] Test: `validateMerge()` writes telemetry when `writeTelemetry: true`
  - [x] Test: `validateMerge()` skips telemetry when `writeTelemetry: false`
  - [x] Test: `validateMerge()` respects timeout (5 minutes)
  - [x] Test: `validateMerge()` parses pass/fail/coverage from test output
  - [x] Test: `ValidateMergeOptions` and `ValidationResult` have correct shapes
  - [x] Test: telemetry entry has `storyKey: 'merge-{epicId}'` format

## Dev Notes

### Architecture Constraints

- **Architecture Decision 3** (architecture-parallel-execution.md): Cross-worktree test validation runs after every merge. The test suite runs within the merge mutex — the mutex is NOT released between merge and test validation. This prevents another epic from merging while tests are still running on the previous merge.
- **Merge Safety Pattern**: "Run the full test suite after merge (not just affected tests). On test failure: revert merge (`git reset --hard HEAD~1`), retry with agent context. On 3 failures: preserve worktree, log escalation, continue with other lanes."
- **Telemetry Write Pattern**: Use append-only NDJSON. Include `version: 1` for forward compat. Write with `appendFileSync`. Never read telemetry during the run.

### What This Story Actually Does

This story is primarily a **refactoring** story. Both `worktree-manager.ts` and `merge-agent.ts` already have independent `runTestSuite` + `parseTestOutput` implementations. This story:

1. **Extracts** the duplicated test-run logic into a single `cross-worktree-validator.ts` module
2. **Adds telemetry** — merge validation results are written to the NDJSON telemetry file
3. **Wires** both existing modules to delegate to the new validator

No new merge behavior is being added — the test-after-merge logic already exists. The value is deduplication and telemetry.

### Key Files to Create

| File | Why |
|------|-----|
| `src/lib/cross-worktree-validator.ts` | New module — extracted test validation + telemetry |
| `src/lib/__tests__/cross-worktree-validator.test.ts` | Tests for all validator functionality |

### Key Files to Modify

| File | Why |
|------|-----|
| `src/lib/worktree-manager.ts` | Remove `runTestSuite()` and `parseTestOutput()`, delegate to `validateMerge()` |
| `src/lib/merge-agent.ts` | Remove `runTestSuite()` and `parseTestOutput()`, delegate to `validateMerge()` |
| `src/lib/__tests__/worktree-manager.test.ts` | Update mocks if needed after refactoring |
| `src/lib/__tests__/merge-agent.test.ts` | Update mocks if needed after refactoring |

### Key Files to Read (Do Not Modify)

| File | Why |
|------|-----|
| `src/lib/telemetry-writer.ts` | `TelemetryEntry`, `writeTelemetryEntry()` — telemetry write interface |
| `src/lib/agents/types.ts` | `TestResults` type — shape for test result reporting |
| `src/lib/null-task-registry.ts` | `TaskContext` — context shape if writing telemetry entries |

### Implementation Patterns

**Validator function (extracted from both modules):**
```typescript
export async function validateMerge(opts: ValidateMergeOptions): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const { stdout } = await execAsync(opts.testCommand, {
      cwd: opts.cwd,
      timeout: 300_000, // 5 minutes
    });
    const testResults = parseTestOutput(stdout);
    const result: ValidationResult = {
      valid: testResults.failed === 0 && testResults.passed > 0,
      testResults,
      output: stdout,
      durationMs: Date.now() - start,
    };
    if (opts.writeTelemetry) {
      writeMergeTelemetry(opts, result);
    }
    return result;
  } catch (err: unknown) {
    // Parse output from failed test command
    // ...same pattern as existing runTestSuite in worktree-manager.ts
  }
}
```

**Telemetry entry for merge validation:**
```typescript
function writeMergeTelemetry(opts: ValidateMergeOptions, result: ValidationResult): void {
  const entry: TelemetryEntry = {
    version: 1,
    timestamp: new Date().toISOString(),
    storyKey: opts.storyKey ?? `merge-${opts.epicId}`,
    epicId: opts.epicId,
    duration_ms: result.durationMs,
    cost_usd: null, // No LLM cost for test validation
    attempts: null,
    acResults: null,
    filesChanged: [],
    testResults: result.testResults,
    errors: result.valid ? [] : ['Test suite failed after merge'],
  };
  // Use telemetry-writer's appendNdjson function
}
```

**Refactoring worktree-manager.ts (conceptual diff):**
```typescript
// BEFORE (in mergeWorktree):
const testResults = await this.runTestSuite(testCommand);
if (testResults.failed > 0) { ... }

// AFTER:
const validation = await validateMerge({ testCommand, cwd: this.cwd, epicId, writeTelemetry: true });
if (!validation.valid) { ... }
```

**Refactoring merge-agent.ts (conceptual diff):**
```typescript
// BEFORE (in resolveConflicts loop):
const testResults = await runTestSuite(ctx.testCommand, ctx.cwd);
if (testResults.failed === 0 && testResults.passed > 0) { ... }

// AFTER:
const validation = await validateMerge({
  testCommand: ctx.testCommand,
  cwd: ctx.cwd,
  epicId: ctx.epicId,
  writeTelemetry: attempt === MAX_ATTEMPTS || testResults.valid, // Only on final attempt or success
});
if (validation.valid) { ... }
lastTestFailure = validation.output; // Use raw output for retry context
```

### Previous Story (18-2) Intelligence

- Story 18-2 created `merge-agent.ts` with its own `runTestSuite()` and `parseTestOutput()` — duplicates of the same functions in `worktree-manager.ts`.
- The `runTestSuite` in `merge-agent.ts` returns an extra `output: string` field (raw stdout) for retry context. The `worktree-manager.ts` version does not return raw output. The extracted validator must return raw output (the `merge-agent` needs it).
- Both modules parse test output with identical regex patterns: `/(\d+)\s+passed/`, `/(\d+)\s+failed/`, `/All files[^|]*\|\s*([\d.]+)/`.
- The merge-agent tests mock `exec` and `execSync` from `node:child_process`. The worktree-manager tests do the same. After refactoring, tests may need to mock `validateMerge` instead (or continue mocking `exec` and let the validator call through).
- Module pattern: TypeScript ESM, `.js` import extensions, vitest, vi.mock.

### Edge Cases

- **Test command produces no stdout**: Return `{ passed: 0, failed: 1 }` — same defensive behavior as existing implementations.
- **Test command times out**: The 5-minute timeout causes an error. Treat as `failed: 1`. Write telemetry with the failure.
- **Telemetry write fails** (disk full, permission error): Do not let telemetry failure break the validation. Wrap in try/catch, log warning, continue returning the validation result.
- **Both worktree-manager and merge-agent call validateMerge concurrently**: This should not happen — the merge mutex ensures only one merge at a time. But the validator itself is stateless, so concurrent calls would be safe.
- **`parseTestOutput` returns 0 passed and 0 failed**: Treat as failure (`valid: false`). A test run that produces no pass/fail output is suspicious.

### Boundary: What This Story Does NOT Include

- **Changing the retry policy** (3 attempts) in merge-agent — that stays as-is.
- **Adding new merge behaviors** — the merge flow is already complete from 18-1 and 18-2.
- **Wiring the validator into epic-completion or lane-pool** — those are Epic 19.
- **TUI display of validation progress** — Epic 20.
- **Configurable test timeout** — uses the existing 5-minute default.

### Project Structure Notes

- Source: TypeScript in `src/`, compiled to `dist/`
- Tests: vitest, colocated in `src/lib/__tests__/`
- ESM modules — use `.js` extensions in imports
- Build: `npm run build`, Test: `npm test`
- The `cross-worktree-validator.ts` should be a focused module (~80-120 lines). The logic is a simple extract-and-add-telemetry.
- Do NOT duplicate the `parseTestOutput` regex patterns. Extract once, use everywhere.

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Story 18.3]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 3 -- Merge Serialization & Agent]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Merge Safety Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Telemetry Write Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 5 -- Engine-Handled Null Tasks]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/18-3-cross-worktree-test-validation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/18-3-cross-worktree-test-validation.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Extracted duplicated `runTestSuite()` and `parseTestOutput()` from `worktree-manager.ts` and `merge-agent.ts` into `cross-worktree-validator.ts`
- Added NDJSON telemetry writes for merge validation results
- `writeMergeTelemetry` exported so merge-agent can defer telemetry to success/final-attempt
- All 124 tests pass (33 new + 66 worktree-manager + 25 merge-agent), zero regressions
- 100% statement/line/function coverage on cross-worktree-validator.ts

### File List

- `src/lib/cross-worktree-validator.ts` (created)
- `src/lib/__tests__/cross-worktree-validator.test.ts` (created)
- `src/lib/worktree-manager.ts` (modified — removed runTestSuite/parseTestOutput, delegates to validateMerge)
- `src/lib/merge-agent.ts` (modified — removed runTestSuite/parseTestOutput, delegates to validateMerge)
