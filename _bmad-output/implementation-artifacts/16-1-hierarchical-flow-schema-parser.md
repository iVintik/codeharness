# Story 16.1: Hierarchical Flow Schema & Parser

Status: verifying

## Story

As a user,
I want to define `execution`, `story_flow`, and `epic_flow` sections in workflow YAML,
so that I can configure sprint-level, epic-level, and story-level behavior separately.

## Acceptance Criteria

1. **Given** `src/schemas/workflow.schema.json`, **when** updated, **then** it defines an `execution` object with properties: `max_parallel` (integer, default 1), `isolation` (enum: `worktree`|`none`, default `none`), `merge_strategy` (enum: `rebase`|`merge-commit`, default `merge-commit`), `epic_strategy` (enum: `parallel`|`sequential`, default `sequential`), `story_strategy` (enum: `sequential`|`parallel`, default `sequential`). <!-- verification: test-provable -->

2. **Given** the updated schema, **when** a workflow YAML contains a `story_flow` array, **then** it accepts the same format as the existing `flow` field (task ref strings and `{ loop: [...] }` blocks). <!-- verification: test-provable -->

3. **Given** the updated schema, **when** a workflow YAML contains an `epic_flow` array, **then** it accepts task ref strings including the built-in names `merge` and `validate` (which do not need to be defined in `tasks:`). <!-- verification: test-provable -->

4. **Given** an existing workflow YAML with only `flow:` (no `story_flow`, no `epic_flow`, no `execution`), **when** parsed, **then** it produces identical behavior to the current parser -- `flow` is treated as `story_flow`, and default `execution` values are applied (`max_parallel: 1`, `epic_strategy: sequential`). <!-- verification: test-provable -->

5. **Given** `src/lib/hierarchical-flow.ts` is created, **when** `resolveHierarchicalFlow(parsed)` is called with a raw parsed YAML object, **then** it returns a `HierarchicalFlow` containing `execution`, `storyFlow`, `epicFlow`, and `tasks` -- normalizing flat `flow:` into `storyFlow` when no `story_flow` is present. <!-- verification: test-provable -->

6. **Given** `workflow-parser.ts`, **when** parsing a workflow with hierarchical sections, **then** it delegates to `hierarchical-flow.ts` for resolution and the returned `ResolvedWorkflow` exposes the hierarchical structure (execution config, story_flow, epic_flow) alongside existing fields. <!-- verification: test-provable -->

7. **Given** a `story_flow` that references a task name not defined in `tasks:`, **when** validated, **then** the parser rejects it with a `WorkflowParseError` listing the dangling reference. <!-- verification: test-provable -->

8. **Given** an `epic_flow` that references a task name that is neither defined in `tasks:` nor a built-in name (`merge`, `validate`), **when** validated, **then** the parser rejects it with a `WorkflowParseError`. <!-- verification: test-provable -->

9. **Given** a workflow with both `flow:` and `story_flow:`, **when** parsed, **then** the parser rejects it with a `WorkflowParseError` explaining that both cannot coexist. <!-- verification: test-provable -->

10. **Given** the `task` definition in the schema, **when** a task has `agent: null`, **then** the schema accepts it (agent field allows `null` in addition to string). <!-- verification: test-provable -->

11. **Given** the `task` definition in the schema, **when** a task has `scope: per-epic`, **then** the schema accepts it (scope enum extended to include `per-epic`). <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Extend `workflow.schema.json` (AC: #1, #2, #3, #10, #11)
  - [x] Add `execution` object definition with all five properties plus defaults
  - [x] Add `story_flow` array definition (same shape as current `flow`)
  - [x] Add `epic_flow` array definition (same shape, but allows built-in refs)
  - [x] Change `required` from `["tasks", "flow"]` to allow either `flow` or `story_flow`
  - [x] Allow `agent` field in task definition to accept `null` (oneOf: string | null)
  - [x] Extend `scope` enum to include `per-epic`
  - [x] Remove top-level `additionalProperties: false` or add new top-level keys

- [x] Task 2: Create `src/lib/hierarchical-flow.ts` (AC: #5, #9)
  - [x] Define `HierarchicalFlow` interface: `{ execution: ExecutionConfig, storyFlow: FlowStep[], epicFlow: FlowStep[], tasks: Record<string, ResolvedTask> }`
  - [x] Define `ExecutionConfig` interface with all five fields plus defaults
  - [x] Implement `resolveHierarchicalFlow(parsed)` function
  - [x] Handle normalization: if `flow` present and no `story_flow`, copy `flow` to `storyFlow`
  - [x] Reject if both `flow` and `story_flow` are present
  - [x] Apply execution defaults when `execution` section is absent

- [x] Task 3: Integrate into `workflow-parser.ts` (AC: #6, #7, #8)
  - [x] Import and call `resolveHierarchicalFlow` in `validateAndResolve`
  - [x] Extend `ResolvedWorkflow` interface to include `execution`, `storyFlow`, `epicFlow` fields
  - [x] Validate `story_flow` task references against `tasks:` section (same as current flow validation)
  - [x] Validate `epic_flow` task references: check against `tasks:` plus built-in set `{ merge, validate }`
  - [x] Maintain backward compat: `flow` field still populated for consumers that use it

- [x] Task 4: Update `schema-validate.ts` if needed (AC: #1)
  - [x] Verify Ajv compiles the updated schema without errors
  - [x] Ensure `additionalProperties` rules don't block new top-level keys

- [x] Task 5: Write unit tests (AC: #1-#11)
  - [x] Test: valid workflow with `execution` + `story_flow` + `epic_flow` parses successfully
  - [x] Test: valid workflow with only `flow:` still parses (backward compat)
  - [x] Test: `flow:` + `story_flow:` coexistence rejected
  - [x] Test: `story_flow` referencing undefined task rejected
  - [x] Test: `epic_flow` referencing undefined non-built-in task rejected
  - [x] Test: `epic_flow` with built-in `merge` and `validate` accepted
  - [x] Test: `agent: null` accepted in task definition
  - [x] Test: `scope: per-epic` accepted in task definition
  - [x] Test: default execution values applied when `execution` section absent
  - [x] Test: `resolveHierarchicalFlow` normalizes `flow` to `storyFlow`

## Dev Notes

### Architecture Constraints

- **New file:** `src/lib/hierarchical-flow.ts` -- pure parsing/normalization logic, no side effects.
- **Modified files:** `src/schemas/workflow.schema.json`, `src/lib/workflow-parser.ts`, possibly `src/lib/schema-validate.ts`.
- **Pattern to follow:** The existing `workflow-parser.ts` uses `validateAndResolve()` as the central validation+resolution pipeline. The hierarchical flow resolver should integrate there, not bypass it.
- **JSON Schema approach:** Use `oneOf` at the top level to allow either `{ tasks, flow }` (legacy) or `{ tasks, story_flow, ... }` (hierarchical). Alternatively, make both `flow` and `story_flow` optional and enforce mutual exclusivity in code.
- **Ajv version:** The project uses `ajv` for JSON Schema draft-07 validation. Ensure the updated schema remains draft-07 compatible.

### Key Interfaces to Define

```typescript
// In hierarchical-flow.ts
export interface ExecutionConfig {
  max_parallel: number;       // default: 1
  isolation: 'worktree' | 'none';  // default: 'none'
  merge_strategy: 'rebase' | 'merge-commit';  // default: 'merge-commit'
  epic_strategy: 'parallel' | 'sequential';   // default: 'sequential'
  story_strategy: 'sequential' | 'parallel';  // default: 'sequential'
}

export interface HierarchicalFlow {
  execution: ExecutionConfig;
  storyFlow: FlowStep[];
  epicFlow: FlowStep[];
  tasks: Record<string, ResolvedTask>;
}
```

### Schema Change Details

The current schema has `"required": ["tasks", "flow"]` and `"additionalProperties": false`. Both must change:
- `required` becomes `["tasks"]` -- either `flow` or `story_flow` must be present (enforced in code or via `oneOf`)
- `additionalProperties` must allow `execution`, `story_flow`, `epic_flow`
- The `agent` property in the task definition currently requires `type: "string"`. It needs to become `oneOf: [{ type: "string" }, { type: "null" }]` to support `agent: null`.
- The `scope` enum `["per-story", "per-run"]` must be extended to `["per-story", "per-run", "per-epic"]`.

### Built-in Epic Flow Tasks

`merge` and `validate` are engine-handled built-in names that do NOT need entries in `tasks:`. The `epic_flow` validation must whitelist these names when checking referential integrity. The whitelist should be a constant (e.g., `BUILTIN_EPIC_FLOW_TASKS = new Set(['merge', 'validate'])`) for extensibility.

### Backward Compatibility

This is the most critical constraint. Existing workflows that look like:

```yaml
tasks:
  implement: { agent: dev }
  verify: { agent: evaluator, scope: per-run }
flow:
  - implement
  - verify
```

Must parse identically to today. The resolved `storyFlow` should equal what `flow` currently produces. The `execution` config should be all defaults. No `epicFlow` is generated.

### Referential Integrity

The existing `validateAndResolve()` already validates `flow` task references. The new code must:
1. Apply the same validation to `story_flow` task references
2. Apply similar validation to `epic_flow` but with the built-in whitelist
3. Not double-validate when `flow` is normalized to `storyFlow`

### Project Structure Notes

- Source files: TypeScript in `src/lib/`, compiled to `dist/`
- Tests: `src/lib/__tests__/*.test.ts` (vitest)
- Schemas: `src/schemas/*.schema.json`
- The module uses ESM (`import.meta.url`, `.js` extensions in imports)
- Test runner: vitest for `.test.ts`, BATS for `.bats` integration tests

### References

- [Source: _bmad-output/planning-artifacts/epics-parallel-execution.md#Epic 16, Story 16.1]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 4]
- [Source: _bmad-output/planning-artifacts/architecture-parallel-execution.md#Decision 5]
- [Source: src/schemas/workflow.schema.json — current schema, entire file]
- [Source: src/lib/workflow-parser.ts — current parser with validateAndResolve()]
- [Source: src/lib/schema-validate.ts — Ajv setup]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/16-1-hierarchical-flow-schema-parser-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/16-1-hierarchical-flow-schema-parser.md

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

- Task 1: Extended `workflow.schema.json` — extracted `flowArray` definition for reuse by `flow`, `story_flow`, and `epic_flow`. Added `execution` object definition with 5 properties. Changed `agent` to `oneOf: [string, null]`. Extended `scope` enum with `per-epic`. Changed `required` from `["tasks", "flow"]` to `["tasks"]` (mutual exclusivity enforced in parser).
- Task 2: Created `src/lib/hierarchical-flow.ts` with `ExecutionConfig`, `HierarchicalFlow` interfaces, `BUILTIN_EPIC_FLOW_TASKS` constant, `EXECUTION_DEFAULTS`, and `resolveHierarchicalFlow()` function. Pure normalization logic, no side effects.
- Task 3: Integrated hierarchical flow into `workflow-parser.ts`. Extended `ResolvedWorkflow` with `execution`, `storyFlow`, `epicFlow`. Added `validateFlowReferences()` helper for flow-to-task referential integrity with built-in whitelist support. Updated `validateAndResolve()` to handle both legacy and hierarchical workflows. Maintained full backward compat — `flow` field is always populated.
- Task 4: Schema compiles without errors under Ajv draft-07. `additionalProperties` still blocks unknown top-level keys. Added `execution`, `story_flow`, `epic_flow` as allowed properties.
- Task 5: Wrote 28 unit tests covering all 11 acceptance criteria. Updated 3 existing test files (`driver-health-check.test.ts`, `workflow-engine.test.ts`, `schema-validate.test.ts`) for compatibility with new `ResolvedWorkflow` interface. All 4676 tests pass (1 pre-existing failure in `stats.test.ts` unrelated to changes).
- Also fixed `src/commands/run.ts` to handle `agent: null` tasks (skip agent resolution for engine-handled tasks).

### Change Log

- 2026-04-03: Implemented story 16.1 — hierarchical flow schema & parser

### File List

- src/schemas/workflow.schema.json (modified)
- src/lib/hierarchical-flow.ts (new)
- src/lib/workflow-parser.ts (modified)
- src/commands/run.ts (modified)
- src/lib/__tests__/hierarchical-flow.test.ts (new)
- src/lib/__tests__/driver-health-check.test.ts (modified)
- src/lib/__tests__/workflow-engine.test.ts (modified)
- src/lib/__tests__/schema-validate.test.ts (modified)
