# Story 6.2: Evaluator Verdict JSON Schema & Parsing

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the evaluator verdict validated against a JSON schema with robust parsing and retry,
so that every AC has a reliable status and evidence — and malformed output never silently passes.

## Acceptance Criteria

1. **Given** `src/schemas/verdict.schema.json` exists
   **When** inspected
   **Then** it defines the `EvaluatorVerdict` structure: top-level `verdict` (pass|fail), `score` object (passed, failed, unknown, total — all integers >= 0), `findings` array where each item has `ac` (integer), `description` (string), `status` (pass|fail|unknown), and `evidence` object with `commands_run` (array of strings), `output_observed` (string), and `reasoning` (string), plus optional `evaluator_trace_id` (string) and `duration_seconds` (number)
   <!-- verification: test-provable -->

2. **Given** the verdict schema exists
   **When** validated with a valid EvaluatorVerdict JSON
   **Then** validation passes with no errors
   **And** when validated with missing required fields, invalid field types, or extra `status` enum values, validation returns specific error messages identifying the violation
   <!-- verification: test-provable -->

3. **Given** `src/lib/verdict-parser.ts` exists
   **When** inspected
   **Then** it exports `parseVerdict(output: string): EvaluatorVerdict` and `validateVerdict(data: unknown): VerdictValidationResult`
   **And** `VerdictValidationResult` includes `valid: boolean`, `errors?: string[]`, and `verdict?: EvaluatorVerdict`
   <!-- verification: test-provable -->

4. **Given** an evaluator returns valid JSON matching the verdict schema
   **When** `parseVerdict(output)` is called
   **Then** it returns a fully typed `EvaluatorVerdict` object with all fields populated
   **And** every finding with `status: 'pass'` has non-empty `evidence.commands_run` (at least one command string) — if a PASS finding has empty `commands_run`, the finding is downgraded to `status: 'unknown'` with reasoning appended
   <!-- verification: test-provable -->

5. **Given** an evaluator returns malformed or non-JSON output
   **When** `parseVerdict(output)` is called the first time
   **Then** it throws a `VerdictParseError` with `retryable: true` and the raw output attached
   **And** the caller (workflow engine) re-dispatches the evaluator for one retry attempt
   <!-- verification: test-provable -->

6. **Given** the evaluator's retry also returns malformed output
   **When** `parseVerdict(output)` is called the second time
   **Then** it throws a `VerdictParseError` with `retryable: false`
   **And** the caller produces an all-UNKNOWN `EvaluatorVerdict` with `reasoning: "Evaluator failed to produce valid JSON after retry"`
   <!-- verification: test-provable -->

7. **Given** `VerdictParseError` class in `verdict-parser.ts`
   **When** inspected
   **Then** it extends `Error` and has fields: `retryable: boolean`, `rawOutput: string`, and `validationErrors?: string[]`
   <!-- verification: test-provable -->

8. **Given** the existing `parseVerdict()` and `EvaluatorVerdict` in `workflow-engine.ts`
   **When** the new `verdict-parser.ts` module is complete
   **Then** `workflow-engine.ts` imports `parseVerdict` and `EvaluatorVerdict` from `verdict-parser.ts` instead of defining them locally
   **And** the inline `parseVerdict` function and `EvaluatorVerdict` interface are removed from `workflow-engine.ts`
   **And** all existing callers of `parseVerdict` and users of `EvaluatorVerdict` continue to compile and pass tests
   <!-- verification: test-provable -->

9. **Given** unit tests for `verdict-parser.ts`
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for `verdict-parser.ts` covering: valid verdict parsing, schema validation pass/fail, PASS-without-evidence downgrade, malformed JSON error with retryable=true, second-failure error with retryable=false, VerdictParseError shape, and edge cases (empty string, partial JSON, extra fields ignored)
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create verdict JSON schema (AC: #1, #2)
  - [x] Create `src/schemas/verdict.schema.json` with full EvaluatorVerdict structure
  - [x] Define `verdict` enum: pass, fail
  - [x] Define `score` object with integer constraints (minimum: 0)
  - [x] Define `findings` array with per-AC structure: ac, description, status, evidence
  - [x] Define `evidence` object: commands_run (array of strings), output_observed (string), reasoning (string)
  - [x] Define optional fields: evaluator_trace_id, duration_seconds
  - [x] Write schema validation tests (valid cases, missing fields, wrong types, bad enum values)

- [x] Task 2: Create verdict-parser module (AC: #3, #4, #7)
  - [x] Create `src/lib/verdict-parser.ts`
  - [x] Define `VerdictValidationResult` interface
  - [x] Define `VerdictParseError` class extending Error with `retryable`, `rawOutput`, `validationErrors`
  - [x] Implement `validateVerdict(data: unknown)` — validate against JSON schema using Ajv
  - [x] Implement `parseVerdict(output: string)` — JSON.parse, validate, enforce PASS-evidence invariant
  - [x] PASS-evidence enforcement: if a finding has `status: 'pass'` and `commands_run` is empty, downgrade to `status: 'unknown'` with reasoning appended

- [x] Task 3: Implement retry semantics in parseVerdict (AC: #5, #6)
  - [x] On invalid JSON or schema validation failure, throw `VerdictParseError` with `retryable: true`
  - [x] The retry orchestration itself lives in the caller (workflow-engine) — `verdict-parser` only signals retryability
  - [x] Document that after the caller's single retry, a second `VerdictParseError` should be caught and an all-UNKNOWN verdict generated

- [x] Task 4: Migrate workflow-engine.ts (AC: #8)
  - [x] Remove inline `EvaluatorVerdict` interface from `workflow-engine.ts`
  - [x] Remove inline `parseVerdict()` function from `workflow-engine.ts`
  - [x] Add `import { parseVerdict, EvaluatorVerdict } from './verdict-parser.js'`
  - [x] Update `parseVerdict` call site: wrap in try/catch for `VerdictParseError`, implement single-retry logic
  - [x] Re-export `EvaluatorVerdict` from `workflow-engine.ts` if other modules import it from there (check `buildRetryPrompt`, `filterRetryItems`)
  - [x] Verify all existing imports still resolve

- [x] Task 5: Write unit tests (AC: #9, #10)
  - [x] Create `src/lib/__tests__/verdict-parser.test.ts`
  - [x] Test: valid verdict parses correctly
  - [x] Test: schema validation rejects missing verdict field
  - [x] Test: schema validation rejects invalid status enum
  - [x] Test: PASS finding with empty commands_run downgraded to UNKNOWN
  - [x] Test: PASS finding with non-empty commands_run stays PASS
  - [x] Test: malformed JSON throws VerdictParseError with retryable=true
  - [x] Test: empty string throws VerdictParseError with retryable=true
  - [x] Test: partial JSON throws VerdictParseError with retryable=true
  - [x] Test: extra fields in verdict are tolerated (not rejected)
  - [x] Test: VerdictParseError has correct shape (retryable, rawOutput, validationErrors)
  - [x] Test: validateVerdict returns specific error messages for each violation
  - [x] Verify existing workflow-engine tests still pass after migration
  - [x] Verify 80%+ coverage on verdict-parser.ts

## Dev Notes

### Module Design

`verdict-parser.ts` is a focused module responsible for:
1. Validating evaluator output against the verdict JSON schema
2. Enforcing the PASS-evidence invariant (no evidence = downgrade to UNKNOWN)
3. Signaling retry semantics via `VerdictParseError.retryable`

It does NOT orchestrate retries — the workflow engine decides when to re-dispatch the evaluator. The parser only says "this is invalid and retryable" or "this is invalid and not retryable."

### Integration Points

- `src/schemas/verdict.schema.json` — the schema file, loaded at module init
- `src/lib/workflow-engine.ts` — current home of `parseVerdict()` and `EvaluatorVerdict` (to be migrated)
- `src/lib/evaluator.ts` — returns raw `EvaluatorResult.output` that this module parses
- `src/lib/workflow-engine.ts` lines 568-618 — the verify task result handling that calls `parseVerdict()` and uses the verdict

### Data Flow

```
EvaluatorResult.output (raw string from story 6-1)
  → parseVerdict(output)
    → JSON.parse
    → validateVerdict (schema check via Ajv)
    → enforce PASS-evidence invariant
    → return typed EvaluatorVerdict
  OR
    → throw VerdictParseError(retryable: true) on first failure
    → caller re-dispatches evaluator
    → parseVerdict(retryOutput)
    → throw VerdictParseError(retryable: false) on second failure
    → caller generates all-UNKNOWN verdict
```

### Existing Code to Migrate

The current `parseVerdict()` in `workflow-engine.ts` (lines 373-396) does basic JSON parsing with manual field checks but:
- Does NOT validate against a JSON schema
- Does NOT enforce PASS-evidence invariant
- Returns `null` on failure instead of throwing with retry semantics
- Has no `VerdictParseError` type

The migration must preserve backward compatibility: `buildRetryPrompt()` and `filterRetryItems()` in `workflow-engine.ts` both depend on `EvaluatorVerdict` and `parseVerdict()`. After migration, re-export `EvaluatorVerdict` from `workflow-engine.ts` to avoid breaking downstream imports.

### Schema Validation Library

Use **Ajv** (Already JSON Schema Validator). Check if Ajv is already in `package.json`. If not, add `ajv` as a dependency. Use `draft-07` to match the existing schema files (`workflow.schema.json` and `agent.schema.json` both use `draft-07`).

### PASS-Evidence Invariant (FR26)

Per AD5 in architecture-v2.md: "Every PASS has non-empty evidence.commands_run." This is not just a schema constraint — it's a runtime enforcement rule. If the evaluator says PASS but provides no commands, the parser downgrades the finding to UNKNOWN. This prevents the evaluator from lying about verification.

Implementation:
```typescript
for (const finding of verdict.findings) {
  if (finding.status === 'pass' && (!finding.evidence.commands_run || finding.evidence.commands_run.length === 0)) {
    finding.status = 'unknown';
    finding.evidence.reasoning += ' [Downgraded from PASS: no commands_run evidence provided]';
  }
}
```

After downgrading, recalculate `verdict.score` counts and potentially flip `verdict.verdict` to `'fail'` if no PASSes remain.

### Retry Semantics

The parser throws `VerdictParseError` with `retryable: true` on first parse failure. The workflow engine's verify task handler (around line 578) must be updated:

```
try {
  verdict = parseVerdict(dispatchResult.output);
} catch (err) {
  if (err instanceof VerdictParseError && err.retryable) {
    // Re-dispatch evaluator (one retry)
    const retryResult = await dispatchAgent(...);
    try {
      verdict = parseVerdict(retryResult.output);
    } catch {
      // Generate all-UNKNOWN verdict
      verdict = buildAllUnknownVerdict(storyFiles, 'Evaluator failed to produce valid JSON after retry');
    }
  }
}
```

### Anti-Patterns to Avoid

- **Do NOT use regex to parse verdict JSON** — use JSON.parse + schema validation
- **Do NOT silently accept malformed verdicts** — the old `parseVerdict` returns null; the new one throws with context
- **Do NOT validate schema at every call** — compile the Ajv validator once at module load
- **Do NOT put retry orchestration in the parser** — parser signals retryability, engine orchestrates
- **Do NOT modify the `evaluator.ts` module** — it returns raw output; parsing is this module's job
- **Do NOT change the EvaluatorVerdict interface shape** — it matches AD5 and is used by workflow-engine, circuit-breaker (Epic 7) will depend on it

### Project Structure Notes

- New file: `src/schemas/verdict.schema.json` — JSON schema for evaluator verdict
- New file: `src/lib/verdict-parser.ts` — verdict parsing and validation
- New test file: `src/lib/__tests__/verdict-parser.test.ts`
- Modified file: `src/lib/workflow-engine.ts` — remove inline parseVerdict/EvaluatorVerdict, import from verdict-parser
- May need: `npm install ajv` if not already a dependency (check `package.json`)

### Previous Story Intelligence

From story 6-1 (evaluator module):
- `runEvaluator()` returns `EvaluatorResult` with `output: string` — this is the raw string we parse
- `buildUnknownOutput()` in `evaluator.ts` generates fallback JSON matching the EvaluatorVerdict shape — the schema must accept this format
- Timeout and Docker-unavailable cases already produce well-formed UNKNOWN verdicts — our parser should accept these
- `evaluator.ts` is additive-only; do NOT modify it in this story

From story 5-2 (loop blocks):
- The workflow engine's loop handler calls `parseVerdict()` and uses the result to determine retry items
- `filterRetryItems()` depends on `EvaluatorVerdict` to decide which stories need retry
- `buildRetryPrompt()` depends on `EvaluatorVerdict.findings` to inject failure context

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 6.2: Evaluator Verdict JSON Schema & Parsing]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD5: Evaluator Verdict Schema]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Format Patterns — Evaluator verdict]
- [Source: src/lib/workflow-engine.ts#EvaluatorVerdict interface (lines 43-63)]
- [Source: src/lib/workflow-engine.ts#parseVerdict function (lines 373-396)]
- [Source: src/lib/workflow-engine.ts#buildRetryPrompt (line 405)]
- [Source: src/lib/workflow-engine.ts#filterRetryItems (line 435)]
- [Source: src/lib/evaluator.ts#buildUnknownOutput (line 55) — fallback verdict format]
- [Source: src/schemas/workflow.schema.json — existing schema format reference (draft-07)]
- [Source: src/schemas/agent.schema.json — existing schema format reference (draft-07)]
- [Source: _bmad-output/implementation-artifacts/6-1-evaluator-module-workspace-spawn.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/6-2-evaluator-verdict-json-schema-parsing-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/6-2-evaluator-verdict-json-schema-parsing.md

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
- Created verdict JSON schema (draft-07) at `src/schemas/verdict.schema.json`
- Created `src/lib/verdict-parser.ts` with `parseVerdict()`, `validateVerdict()`, `VerdictParseError`, and `EvaluatorVerdict` interface
- Migrated `EvaluatorVerdict` interface and `parseVerdict()` out of `workflow-engine.ts` with re-exports for backward compatibility
- Added retry semantics in workflow-engine's verify task handler using `VerdictParseError.retryable`
- Added `buildAllUnknownVerdict()` helper for fallback after retry failure
- Updated existing workflow-engine tests to match new throw-on-failure behavior
- 28 new tests in verdict-parser.test.ts, all passing
- Coverage: 97.56% statements, 100% lines, 100% functions on verdict-parser.ts
- All 4086 tests pass, build succeeds with zero errors

### File List
- `src/schemas/verdict.schema.json` (new)
- `src/lib/verdict-parser.ts` (new)
- `src/lib/__tests__/verdict-parser.test.ts` (new)
- `src/lib/workflow-engine.ts` (modified)
- `src/lib/__tests__/workflow-engine.test.ts` (modified)
