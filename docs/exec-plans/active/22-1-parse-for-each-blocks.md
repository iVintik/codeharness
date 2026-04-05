# Exec Plan: 22-1 Parse `for_each` blocks

**Story:** 22-1-parse-for-each-blocks  
**Status:** implemented  
**Date:** 2026-04-05

## What was implemented

Extended the workflow parser to accept the new `workflow:` key containing recursive `for_each` blocks, as an alternative to the legacy `story_flow`/`epic_flow` format.

## Files changed

| File | Change |
|------|--------|
| `src/lib/workflow-execution.ts` | Added `ForEachBlock` interface, `ForEachFlowStep` type; exported `resolveExecutionConfig` |
| `src/schemas/workflow.schema.json` | Relaxed `required` to `["tasks"]`; added `workflow` property; added recursive `forEachBlock` definition |
| `src/lib/workflow-parser.ts` | Added `parseForEachFlow()` recursive parser; mutual exclusion check; `ResolvedWorkflow.workflow?` field; extracted `resolveTasksMap()` helper |
| `src/lib/__tests__/workflow-parser.test.ts` | Added 14 new tests covering all 12 ACs |

## Key design decisions

- **Mutual exclusion enforced at parser level** (before schema): if both `workflow:` and `story_flow:`/`flow:` keys are present, a `WorkflowParseError` is thrown immediately.
- **Schema validates structure; parser validates referential integrity**: ACs 3–5 (missing/empty steps, null scope) are caught by JSON Schema. AC 6 (unknown task) is caught by the second-pass parser.
- **`storyFlow`/`epicFlow`/`flow` are empty arrays** when the new `workflow:` format is used — the XState compiler (story 22-2+) will consume `ResolvedWorkflow.workflow` directly.
- **`resolveExecutionConfig` exported** from `workflow-execution.ts` so the new parser path can resolve the `execution:` block without duplicating logic.
- **Arbitrary nesting** supported naturally through recursion in `parseForEachFlow()`.

## Acceptance criteria coverage

| AC | Coverage |
|----|---------|
| AC1 | Test: single-level for_each parses, exit 0 |
| AC2 | Test: nested for_each (epic → story), exit 0 |
| AC3 | Schema: `required: ["steps"]` in forEachBlock catches missing steps |
| AC4 | Schema: `minItems: 1` catches empty steps array |
| AC5 | Schema: `type: string, minLength: 1` catches null/empty scope |
| AC6 | Parser second-pass: task name checked against `taskNames` set |
| AC7 | Existing tests unchanged; minimalYaml still passes |
| AC8 | `npm run build` must exit 0 |
| AC9 | `npx vitest run` must pass ≥ 4960 tests |
| AC10 | `npx eslint src/lib/workflow-parser.ts` must exit 0 |
| AC11 | Test: 3-level nesting (epic → story → substory) |
| AC12 | Parser: mutual exclusion check before schema validation |
