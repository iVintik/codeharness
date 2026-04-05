<story-spec>

# Story 22-1: Parse `for_each` blocks in workflow YAML

Status: draft

## Story

As a workflow author,
I want to define nested iteration levels using `for_each: epic` and `for_each: story` in my workflow YAML,
So that my workflow naturally expresses multi-level execution without the old `story_flow` / `epic_flow` split.

## Context

**Epic 22: Flow Configuration Format & Parser** — this is the first of 3 stories that migrate the workflow YAML from the legacy `story_flow` / `epic_flow` / `loop:` format to the new `for_each` + `gate` format defined in the XState engine architecture.

The current parser (`src/lib/workflow-parser.ts`) requires `story_flow` and `epic_flow` keys. This story extends it to also accept a `workflow:` key containing `for_each` blocks. The old format must continue working (backward compat) — both formats coexist until story 22-3 migrates the default template.

**Target YAML structure:**
```yaml
tasks:
  create-story: { agent: story-creator, ... }
  implement: { agent: dev, ... }

workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - create-story
        - implement
    - retro
```

**Key architectural decisions (from architecture-xstate-engine.md):**
- `for_each` is the nesting primitive. Hierarchy IS the YAML structure. Arbitrary depth.
- Iteration source is implicit from scope (epics from sprint state, stories from epic).
- Empty `for_each` scope with no steps = parse error (nothing to iterate).
- No `ForEachBlock` type exists yet in the codebase — it must be introduced.

**Current test baseline:** 4960 tests passing across 192 test files.

## Acceptance Criteria

1. **Given** a YAML file containing a `workflow:` key with `for_each: epic` and nested `steps`, **When** the file is parsed via `codeharness validate <file>`, **Then** the command exits 0 with no errors printed to stderr.
   <!-- verification: create test YAML with `workflow: { for_each: epic, steps: [retro] }`, run `codeharness validate <file>`, expect exit 0 -->

2. **Given** a YAML file with `workflow: { for_each: epic, steps: [{ for_each: story, steps: [create-story, implement] }, retro] }`, **When** parsed via `codeharness validate <file>`, **Then** the command exits 0, confirming nested `for_each` blocks are accepted.
   <!-- verification: create nested YAML, run `codeharness validate <file>`, expect exit 0 -->

3. **Given** a YAML file with a `for_each` block that has no `steps` key (e.g., `workflow: { for_each: epic }`), **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "steps".
   <!-- verification: create YAML missing steps, run `codeharness validate <file>`, expect non-zero exit and stderr contains "steps" -->

4. **Given** a YAML file with a `for_each` block that has an empty `steps: []` array, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message about empty steps.
   <!-- verification: create YAML with empty steps, run `codeharness validate <file>`, expect non-zero exit and stderr mentions "empty" or "steps" -->

5. **Given** a YAML file where a `for_each` block is missing the scope value (e.g., `workflow: { for_each: , steps: [...] }`), **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr contains an error message mentioning "scope" or "for_each".
   <!-- verification: create YAML with missing scope, run `codeharness validate <file>`, expect non-zero exit and message about scope -->

6. **Given** a YAML file with a `for_each` step that references a task name not defined in `tasks:`, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr reports the unknown task name.
   <!-- verification: create YAML referencing undefined task `ghost-task`, run `codeharness validate <file>`, expect non-zero exit and stderr contains "ghost-task" -->

7. **Given** a YAML file using the old `story_flow` / `epic_flow` format (no `workflow:` key), **When** parsed via `codeharness validate <file>`, **Then** the command still exits 0 — backward compatibility is preserved.
   <!-- verification: run `codeharness validate` against the existing `templates/workflows/default.yaml`, expect exit 0 -->

8. **Given** the project is built via `npm run build`, **When** the build completes, **Then** it exits 0 with no errors.
   <!-- verification: `npm run build` exits 0 -->

9. **Given** the full test suite is run via `npx vitest run`, **When** all tests complete, **Then** 4960+ tests pass with zero failures — no regressions from the parser extension.
   <!-- verification: `npx vitest run` exits 0; pass count >= 4960 -->

10. **Given** the new parser code is linted via `npx eslint src/lib/workflow-parser.ts`, **When** linting completes, **Then** it exits 0 with zero errors.
    <!-- verification: `npx eslint src/lib/workflow-parser.ts` exits 0 -->

11. **Given** a YAML file with 3 levels of nesting (e.g., `for_each: epic` → `for_each: story` → `for_each: substory`), **When** parsed via `codeharness validate <file>`, **Then** the command exits 0 — arbitrary nesting depth is supported.
    <!-- verification: create 3-level YAML, run `codeharness validate <file>`, expect exit 0 -->

12. **Given** a YAML file that contains BOTH `workflow:` and `story_flow:` keys, **When** parsed via `codeharness validate <file>`, **Then** the command exits non-zero and stderr reports that only one format is allowed.
    <!-- verification: create YAML with both keys, run `codeharness validate <file>`, expect non-zero exit -->

## Tasks / Subtasks

- [ ] Task 1: Define `ForEachBlock` type and parser types (AC: 8, 10)
  - [ ] 1.1: Add `ForEachBlock` interface to `workflow-parser.ts` (or `workflow-types.ts` if it exists): `{ for_each: string; steps: ForEachFlowStep[] }`
  - [ ] 1.2: Define `ForEachFlowStep` union type: `string | ForEachBlock` (plain task name or nested for_each)
  - [ ] 1.3: Export new types from the parser module

- [ ] Task 2: Extend `parseWorkflowData()` to accept `workflow:` key (AC: 1, 2, 7, 12)
  - [ ] 2.1: Detect `workflow:` key presence alongside existing `story_flow`/`epic_flow` detection
  - [ ] 2.2: If both `workflow:` and `story_flow:`/`epic_flow:` present, throw `WorkflowParseError` (mutual exclusion)
  - [ ] 2.3: If `workflow:` key is present, route to new `parseForEachFlow()` function instead of legacy path
  - [ ] 2.4: Keep legacy path unchanged for backward compat

- [ ] Task 3: Implement `parseForEachFlow()` recursive parser (AC: 1, 2, 3, 4, 5, 6, 11)
  - [ ] 3.1: Validate `for_each` has a non-empty string scope value → error if missing/empty
  - [ ] 3.2: Validate `steps` key exists and is a non-empty array → error if missing or empty
  - [ ] 3.3: For each step in `steps[]`:
    - If string → validate it exists in `tasks:` map → error if unknown
    - If object with `for_each` key → recurse into `parseForEachFlow()`
    - Otherwise → throw `WorkflowParseError` with "invalid step" message
  - [ ] 3.4: Return `ForEachBlock` with validated scope and parsed steps
  - [ ] 3.5: Support arbitrary nesting depth (recursion handles this naturally)

- [ ] Task 4: Wire parsed `ForEachBlock` into `ResolvedWorkflow` return (AC: 1, 2, 8)
  - [ ] 4.1: Extend `ResolvedWorkflow` interface with optional `workflow?: ForEachBlock` field
  - [ ] 4.2: When `workflow:` key is used, populate the new field and derive `storyFlow`/`epicFlow` for backward compat (or set them to empty arrays if the new format is consumed directly by the XState compiler in later stories)
  - [ ] 4.3: Ensure `parseWorkflow()` file-reading path works with both formats

- [ ] Task 5: Update JSON schema validation (AC: 1, 3, 5, 8)
  - [ ] 5.1: Extend `schema-validate.ts` (or equivalent) to accept `workflow:` as a valid top-level key
  - [ ] 5.2: Add schema definition for `for_each` block: requires `for_each` (string) and `steps` (array)
  - [ ] 5.3: Allow `steps` items to be either strings or `for_each` objects (recursive schema ref)
  - [ ] 5.4: Relax the existing requirement that `story_flow` is mandatory — make it one of `story_flow` OR `workflow`

- [ ] Task 6: Write tests (AC: 1-12)
  - [ ] 6.1: Test: single-level `for_each: epic` with plain task steps parses successfully
  - [ ] 6.2: Test: nested `for_each: epic` → `for_each: story` parses successfully
  - [ ] 6.3: Test: 3-level nesting parses successfully
  - [ ] 6.4: Test: missing `steps` key throws `WorkflowParseError`
  - [ ] 6.5: Test: empty `steps: []` throws `WorkflowParseError`
  - [ ] 6.6: Test: missing/empty scope throws `WorkflowParseError`
  - [ ] 6.7: Test: unknown task reference throws `WorkflowParseError` with task name in message
  - [ ] 6.8: Test: old `story_flow`/`epic_flow` format still parses (backward compat)
  - [ ] 6.9: Test: both `workflow:` and `story_flow:` present throws error
  - [ ] 6.10: Test: `npm run build` still succeeds
  - [ ] 6.11: Test: full test suite still passes with >= 4960 tests

- [ ] Task 7: Update `codeharness validate` command if needed (AC: 1-7, 12)
  - [ ] 7.1: Verify `codeharness validate` already calls `parseWorkflow()` — if so, no changes needed
  - [ ] 7.2: If validate command has separate schema logic, update it to support `workflow:` key
  - [ ] 7.3: Ensure error messages are printed to stderr on validation failure

## Dev Notes

- **No gate parsing in this story.** `gate:` blocks within steps should be treated as errors or ignored in this story — story 22-2 handles gate parsing.
- **`for_each` scope values are arbitrary strings** (e.g., `epic`, `story`, `substory`, `module`). The parser does not validate scope values against a fixed enum — that's the runtime's job. The parser only validates the scope is a non-empty string.
- **Backward compat is critical.** The entire existing test suite (4960 tests) relies on the old format. The parser must accept both `story_flow`/`epic_flow` and `workflow:` as valid entry points, but not simultaneously in the same file.
- **Schema validation comes before referential integrity.** The JSON schema should validate structure first (`for_each` must have `steps`, etc.), then a second pass validates task name references exist in `tasks:`.
- **Existing `FlowStep` type** is `string | { loop: FlowStep[] }`. The new `ForEachFlowStep` is separate — don't try to unify them yet. The old types stay for backward compat.
- **`codeharness validate`** is the CLI command that end users run. All ACs are testable through it. If the test infrastructure uses `parseWorkflow()` directly, that's fine for unit tests, but the ACs are written for the CLI surface.
- **Error messages should be actionable.** "Missing scope in for_each block at workflow.steps[1]" is better than "parse error". Include the path to the offending block.

## Verification Requirements

Before this story can be marked complete, the following must be verified:

- [ ] All acceptance criteria verified via Docker-based blind verification
- [ ] Proof document at `verification/22-1-parse-for-each-blocks-proof.md`
- [ ] Evidence is reproducible

## Documentation Requirements

- [ ] Per-subsystem AGENTS.md updated for any new/changed modules
- [ ] Exec-plan created at `docs/exec-plans/active/22-1-parse-for-each-blocks.md`
- [ ] Inline code documentation for new public APIs

## Testing Requirements

- [ ] Tests written for all new code
- [ ] Project-wide test coverage at 100%
- [ ] All tests passing

</story-spec>
