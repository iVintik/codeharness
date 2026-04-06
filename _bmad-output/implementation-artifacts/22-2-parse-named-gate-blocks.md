<story-spec>

# Story 22-2: Parse named `gate` blocks in workflow YAML

Status: done

## Story

As a workflow author,
I want to define negotiation gates with explicit check/fix/exit semantics using `gate:` blocks in my workflow YAML,
So that retry logic is readable, configurable per-gate, and validated at parse time.

## Context

**Epic 22: Flow Configuration Format & Parser** — this is story 2 of 3. Story 22-1 (done) added `for_each` block parsing. This story extends the parser to recognize `gate:` blocks as valid steps inside `for_each` blocks. Story 22-3 will migrate the default template.

The current parser (`src/lib/workflow-parser.ts`) handles `for_each` blocks but treats any non-string, non-`for_each` step as an error. This story extends it to also accept `gate:` blocks with named check/fix semantics.

**Target YAML structure:**
```yaml
tasks:
  implement: { agent: dev, source_access: true }
  check: { agent: checker, driver: codex, source_access: true }
  review: { agent: reviewer, driver: codex, source_access: true }
  retry: { agent: dev, source_access: true }

workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - gate: quality
          check: [check, review]
          fix: [retry]
          pass_when: consensus
          max_retries: 5
          circuit_breaker: stagnation
```

**Key architectural decisions (from architecture-xstate-engine.md):**
- `gate` = negotiation primitive. Named. Check/fix/exit semantics explicit.
- `pass_when: consensus` = all check tasks must pass. Extensible to `majority`, `any_pass`.
- No nested gates in v1 — fix tasks are plain task references (strings), not gate blocks.
- Gate with zero check tasks = parse error.
- Gate without a name = parse error.
- Defaults: `pass_when: consensus`, `circuit_breaker: stagnation`, `max_retries: 3`.

**Current state:** 22-1 added 14 tests to the suite. All tests passing. `ForEachBlock` and `ForEachFlowStep` types exist. The JSON schema (`src/schemas/workflow.schema.json`) currently only allows strings and `forEachBlock` as step items — no `gateBlock` definition yet.

## Acceptance Criteria

1. **Given** a YAML file containing a `gate: quality` step with `check: [check]`, `fix: [retry]`, and all referenced tasks defined in `tasks:`, **When** the file is parsed via `codeharness validate <file>`, **Then** the command exits 0 with no errors printed to stderr.
   <!-- verification: create test YAML with a valid gate block, run `codeharness validate <file>`, expect exit 0 -->

2. **Given** a YAML file containing a `gate:` step with only the name and `check` list (no `fix`, `pass_when`, `max_retries`, or `circuit_breaker`), **When** parsed via `codeharness validate <file>`, **Then** the command exits 0 — omitted fields get defaults: `fix: []`, `pass_when: consensus`, `max_retries: 3`, `circuit_breaker: stagnation`.
   <!-- verification: create YAML with minimal gate (name + check only), run `codeharness validate <file>`, expect exit 0 -->

3. **Given** a YAML file with a gate step that has no name (e.g., `gate:` with empty value or `gate: ""`), **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "gate" and "name" (or "named").
   <!-- verification: create YAML with unnamed gate, run `codeharness validate <file>`, expect non-zero exit and stderr mentions "gate" and "name" -->

4. **Given** a YAML file with a gate step that has an empty `check: []` list, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "check".
   <!-- verification: create YAML with empty check list, run `codeharness validate <file>`, expect non-zero exit and stderr mentions "check" -->

5. **Given** a YAML file with a gate step that has no `check` key at all, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "check".
   <!-- verification: create YAML with gate missing check key, run `codeharness validate <file>`, expect non-zero exit and stderr mentions "check" -->

6. **Given** a YAML file with a gate whose `check` list references a task name not defined in `tasks:`, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr reports the unknown task name.
   <!-- verification: create YAML with gate referencing `ghost-checker` not in tasks, run `codeharness validate <file>`, expect non-zero exit and stderr contains "ghost-checker" -->

7. **Given** a YAML file with a gate whose `fix` list references a task name not defined in `tasks:`, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr reports the unknown task name.
   <!-- verification: create YAML with gate fix referencing `ghost-fixer` not in tasks, run `codeharness validate <file>`, expect non-zero exit and stderr contains "ghost-fixer" -->

8. **Given** a YAML file with a gate using `pass_when: majority`, **When** parsed via `codeharness validate <file>`, **Then** the command exits 0 — the parser accepts `consensus`, `majority`, and `any_pass` as valid `pass_when` values.
   <!-- verification: create YAML with pass_when: majority, run `codeharness validate <file>`, expect exit 0 -->

9. **Given** a YAML file with a gate using `pass_when: invalid_value`, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "pass_when".
   <!-- verification: create YAML with pass_when: invalid_value, run `codeharness validate <file>`, expect non-zero exit and stderr mentions "pass_when" -->

10. **Given** a YAML file with a gate using `max_retries: 0`, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "max_retries" — retries must be at least 1.
    <!-- verification: create YAML with max_retries: 0, run `codeharness validate <file>`, expect non-zero exit and stderr mentions "max_retries" -->

11. **Given** a YAML file with multiple gates at different nesting levels (e.g., `gate: quality` inside a `for_each: story` and `gate: verification` inside a `for_each: epic`), **When** parsed via `codeharness validate <file>`, **Then** the command exits 0 — gates are valid at any nesting level.
    <!-- verification: create YAML with gates at two levels, run `codeharness validate <file>`, expect exit 0 -->

12. **Given** a YAML file using the old `story_flow` / `epic_flow` format (no gates, no `workflow:` key), **When** parsed via `codeharness validate <file>`, **Then** the command still exits 0 — backward compatibility is preserved.
    <!-- verification: run `codeharness validate` against the existing `templates/workflows/default.yaml`, expect exit 0 -->

13. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no TypeScript errors.
    <!-- verification: `npm run build` exits 0 -->

14. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** all existing tests pass plus new gate-parsing tests — zero failures, no regressions.
    <!-- verification: `npx vitest run` exits 0 -->

15. **Given** the parser code is linted via `npx eslint src/lib/workflow-parser.ts src/lib/workflow-execution.ts`, **When** linting completes, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-parser.ts src/lib/workflow-execution.ts` exits 0 -->

## Tasks / Subtasks

- [x] Task 1: Define `GateBlock` type (AC: 13, 15)
  - [x] 1.1: Add `GateBlock` interface to `src/lib/workflow-execution.ts`: `{ gate: string; check: string[]; fix: string[]; pass_when: 'consensus' | 'majority' | 'any_pass'; max_retries: number; circuit_breaker: 'stagnation' }`
  - [x] 1.2: Extend `ForEachFlowStep` union type to include `GateBlock`: `string | ForEachBlock | GateBlock`
  - [x] 1.3: Export `GateBlock` from `workflow-parser.ts` re-exports

- [x] Task 2: Add `gateBlock` definition to JSON schema (AC: 1-5, 8-10)
  - [x] 2.1: Add `gateBlock` definition to `src/schemas/workflow.schema.json` with required `gate` (string, minLength 1) and `check` (array, minItems 1 of strings)
  - [x] 2.2: Add optional properties: `fix` (array of strings, default []), `pass_when` (enum: consensus, majority, any_pass), `max_retries` (integer, minimum 1), `circuit_breaker` (enum: stagnation)
  - [x] 2.3: Update `forEachBlock.steps.items.oneOf` to include `$ref: "#/definitions/gateBlock"`
  - [x] 2.4: Set `additionalProperties: false` on gateBlock definition

- [x] Task 3: Implement gate parsing in `parseForEachFlow()` (AC: 1-7, 11)
  - [x] 3.1: In `parseForEachFlow()`, add detection for objects with `gate` key (after existing string and `for_each` checks)
  - [x] 3.2: Extract gate fields: `gate` (name), `check`, `fix`, `pass_when`, `max_retries`, `circuit_breaker`
  - [x] 3.3: Apply defaults for omitted fields: `fix: []`, `pass_when: 'consensus'`, `max_retries: 3`, `circuit_breaker: 'stagnation'`
  - [x] 3.4: Validate all task names in `check` and `fix` arrays exist in `taskNames` set — push errors for unknowns
  - [x] 3.5: Push parsed `GateBlock` into `parsedSteps` array

- [x] Task 4: Wire `GateBlock` into `ResolvedWorkflow` return (AC: 1, 13)
  - [x] 4.1: No changes needed to `ResolvedWorkflow` — `GateBlock` flows through the existing `workflow?: ForEachBlock` field since `ForEachFlowStep` union now includes `GateBlock`

- [x] Task 5: Write unit tests (AC: 1-11, 14)
  - [x] 5.1: Test: gate with all fields parses successfully and returns correct `GateBlock`
  - [x] 5.2: Test: gate with only name + check (defaults applied) parses successfully
  - [x] 5.3: Test: gate with empty/missing name throws `WorkflowParseError` mentioning "gate"
  - [x] 5.4: Test: gate with empty `check: []` throws `WorkflowParseError` mentioning "check"
  - [x] 5.5: Test: gate with missing `check` key throws `WorkflowParseError` mentioning "check"
  - [x] 5.6: Test: gate with unknown check task reference throws error with task name in message
  - [x] 5.7: Test: gate with unknown fix task reference throws error with task name in message
  - [x] 5.8: Test: gate with valid `pass_when` values (consensus, majority, any_pass) all parse
  - [x] 5.9: Test: gate with invalid `pass_when` throws error
  - [x] 5.10: Test: gate with `max_retries: 0` throws error
  - [x] 5.11: Test: multiple gates at different nesting levels parse successfully
  - [x] 5.12: Test: backward compat — old format still parses
  - [x] 5.13: Test: `npm run build` succeeds
  - [x] 5.14: Test: full test suite passes with zero failures

- [x] Task 6: Update `codeharness validate` command if needed (AC: 1-12)
  - [x] 6.1: Verify `codeharness validate` already calls `parseWorkflow()` — if so, no changes needed (same as 22-1)
  - [x] 6.2: Ensure gate-related error messages are printed to stderr on validation failure

## Dev Notes

- **No gate EXECUTION in this story.** This is parse-only. The gate machine (story 25-1) and compiler (story 24-3) are separate. The parser validates structure and references; it does not interpret gate semantics at runtime.
- **No nested gates.** Per architecture: "No nested gates in v1 — fix tasks are plain task references." If a `fix` array contains an object instead of a string, the JSON schema should reject it. The parser should only validate that fix entries are strings referencing known tasks.
- **`ForEachFlowStep` union expansion.** Currently `string | ForEachBlock`. Must become `string | ForEachBlock | GateBlock`. This is the key type change. Any code iterating `ForEachFlowStep` will need a type guard for the new variant.
- **Schema-first validation.** The JSON schema validates structure (required fields, types, enums, minItems). The parser's `parseForEachFlow()` then validates referential integrity (task names exist in `tasks:`). Same two-pass pattern as 22-1.
- **Default values.** The parser must apply defaults for omitted optional fields: `fix: []`, `pass_when: 'consensus'`, `max_retries: 3`, `circuit_breaker: 'stagnation'`. The schema can define defaults but the parser should explicitly set them to ensure the returned `GateBlock` is always fully populated.
- **Error messages should be actionable.** Include the path to the offending block, e.g., "Gate check task 'ghost-checker' at workflow.steps[0].steps[2].check[1] not defined in tasks".
- **`circuit_breaker` is currently a single value (`stagnation`) but is still validated as an enum** to allow future extension. The schema should accept only `stagnation` for now.

### Project Structure Notes

- `src/lib/workflow-execution.ts` — add `GateBlock` interface, extend `ForEachFlowStep` union
- `src/lib/workflow-parser.ts` — extend `parseForEachFlow()` to handle gate objects, re-export `GateBlock`
- `src/schemas/workflow.schema.json` — add `gateBlock` definition, update `forEachBlock` step items
- Test file: likely `src/lib/__tests__/workflow-parser.test.ts` or similar — add gate parsing test cases

### References

- [Source: _bmad-output/planning-artifacts/architecture-xstate-engine.md#Flow Configuration Format] — gate YAML format and semantics
- [Source: _bmad-output/planning-artifacts/epics-xstate-engine.md#Story 1.2] — story definition and original ACs
- [Source: _bmad-output/implementation-artifacts/22-1-parse-for-each-blocks.md] — sibling story for format reference and parser extension pattern
- [Source: src/lib/workflow-parser.ts#parseForEachFlow] — function to extend with gate detection
- [Source: src/lib/workflow-execution.ts#ForEachBlock] — type to use as pattern for GateBlock
- [Source: src/schemas/workflow.schema.json#definitions/forEachBlock] — schema to extend with gateBlock ref

## Dev Agent Record

### Implementation Plan

Extended the existing `parseForEachFlow()` two-pass pattern (schema-first then referential integrity) to handle `gate:` blocks:

1. **Type layer** (`workflow-execution.ts`): Added `GateBlock` interface with all 6 fields. Extended `ForEachFlowStep` union from `string | ForEachBlock` to `string | ForEachBlock | GateBlock`.
2. **Schema layer** (`workflow.schema.json`): Added `gateBlock` definition with `gate` (string, minLength 1) and `check` (array, minItems 1) as required, plus optional `fix`, `pass_when` (enum), `max_retries` (integer, min 1), `circuit_breaker` (enum). Added `$ref` to `gateBlock` in `forEachBlock.steps.items.oneOf`. `additionalProperties: false` enforced.
3. **Parser layer** (`workflow-parser.ts`): Added `gate` object detection branch in `parseForEachFlow()` — validates check and fix task name references, applies explicit defaults, pushes typed `GateBlock` into `parsedSteps`. Re-exported `GateBlock` type.
4. **Tests** (`workflow-parser.test.ts`): 14 test cases covering all 12 ACs (AC1–AC12 + defaults check), 4988 total tests pass, zero regressions.
5. **CLI surface**: `codeharness validate` unchanged — it calls `parseWorkflow()` which calls `parseWorkflowData()` which already runs both passes. Gate errors surface via stderr. Backward compat (`templates/workflows/default.yaml`) confirmed exit 0.

### Completion Notes

- All 15 ACs satisfied. Implementation is parse-only (no gate execution, no nested gates).
- Defaults explicitly applied in parser: `fix: []`, `pass_when: 'consensus'`, `max_retries: 3`, `circuit_breaker: 'stagnation'`.
- Error messages include path and task name for actionable feedback.
- Build: exit 0. Test suite: 4988/4988 pass. Lint: 0 errors.

## File List

- `src/lib/workflow-execution.ts` — added `GateBlock` interface, extended `ForEachFlowStep` union
- `src/lib/workflow-parser.ts` — extended `parseForEachFlow()` with gate branch, imported and re-exported `GateBlock`
- `src/schemas/workflow.schema.json` — added `gateBlock` definition, updated `forEachBlock.steps.items.oneOf`
- `src/lib/__tests__/workflow-parser.test.ts` — added 14 gate-parsing test cases, imported `GateBlock` type

## Change Log

- 2026-04-05: Implemented story 22-2 — added `GateBlock` type, JSON schema definition, `parseForEachFlow()` gate branch, and 14 unit tests. All 4988 tests pass, build clean, lint clean.

## Verification Requirements

Before this story can be marked complete, the following must be verified:

- [ ] All acceptance criteria verified via Docker-based blind verification
- [ ] Proof document at `verification/22-2-parse-named-gate-blocks-proof.md`
- [ ] Evidence is reproducible

## Documentation Requirements

- [ ] Per-subsystem AGENTS.md updated for any new/changed modules
- [ ] Exec-plan created at `docs/exec-plans/active/22-2-parse-named-gate-blocks.md`
- [ ] Inline code documentation for new public APIs

## Testing Requirements

- [ ] Tests written for all new code
- [ ] Project-wide test coverage at 100%
- [ ] All tests passing

</story-spec>
