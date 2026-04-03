# Story 11.1: Workflow Schema Extension

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to specify `driver`, `model`, and `plugins` per task in my workflow YAML,
so that I can control which framework and model each task uses without modifying engine code.

## Acceptance Criteria

1. **Given** the workflow schema at `src/schemas/workflow.schema.json`
   **When** updated with `driver`, `model`, and `plugins` fields on the task definition
   **Then** the `driver` field is type `string`, optional, with no schema-level default (engine defaults to `claude-code` at dispatch time)
   **And** the `model` field is type `string`, optional, with no default (falls through to model resolution chain)
   **And** the `plugins` field is type `array` of `string`, optional
   <!-- verification: test-provable -->

2. **Given** an existing workflow YAML with no `driver`, `model`, or `plugins` fields on any task
   **When** the workflow is parsed and validated via `parseWorkflow()` or `resolveWorkflow()`
   **Then** it validates successfully with zero errors
   **And** the resolved tasks have `driver`, `model`, and `plugins` as `undefined`
   <!-- verification: test-provable -->

3. **Given** a workflow YAML with `driver: codex`, `model: codex-mini`, and `plugins: ['gstack']` on a task
   **When** parsed via `parseWorkflow()`
   **Then** the `ResolvedTask` for that task has `driver === 'codex'`, `model === 'codex-mini'`, and `plugins` as `['gstack']`
   <!-- verification: test-provable -->

4. **Given** the `ResolvedTask` interface in `src/lib/workflow-parser.ts`
   **When** inspected
   **Then** it includes optional `driver?: string`, `model?: string`, and `plugins?: string[]` fields
   **And** existing fields (`agent`, `scope`, `session`, `source_access`, etc.) remain unchanged
   <!-- verification: test-provable -->

5. **Given** the `validateAndResolve()` function in `workflow-parser.ts`
   **When** it processes tasks with the new fields
   **Then** it populates `driver`, `model`, and `plugins` on `ResolvedTask` from the parsed YAML
   **And** omits them (leaves as `undefined`) when not present in the source YAML
   <!-- verification: test-provable -->

6. **Given** the `additionalProperties: false` constraint on the task definition in the schema
   **When** a workflow YAML includes a task with only the new fields (`driver`, `model`, `plugins`) alongside `agent`
   **Then** schema validation passes (the new fields are recognized, not rejected as additional properties)
   <!-- verification: test-provable -->

7. **Given** `npm run build` is executed
   **When** the build completes
   **Then** it succeeds with zero TypeScript errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

8. **Given** unit tests for the schema extension
   **When** `npm run test:unit` is executed
   **Then** tests verify that tasks with `driver`, `model`, and `plugins` parse correctly
   **And** tests verify backward compatibility with existing workflows (no new fields present)
   **And** tests verify that invalid types for the new fields (e.g., `driver: 123`) are rejected by schema validation
   **And** tests verify the `ResolvedTask` type exposes the new optional fields
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Extend `workflow.schema.json` with new fields (AC: #1, #6)
  - [x] Add `driver` property: `{ "type": "string", "description": "Agent driver framework (e.g., claude-code, codex, opencode)" }` to task definition
  - [x] Add `model` property: `{ "type": "string", "description": "Model override for this task (falls through to resolution chain if omitted)" }` to task definition
  - [x] Add `plugins` property: `{ "type": "array", "items": { "type": "string" }, "description": "Plugin names to load in the driver session" }` to task definition
  - [x] Verify `additionalProperties: false` still works — new fields are in the schema so they won't be rejected

- [x] Task 2: Extend `ResolvedTask` interface (AC: #4)
  - [x] Add `driver?: string` to `ResolvedTask`
  - [x] Add `model?: string` to `ResolvedTask`
  - [x] Add `plugins?: string[]` to `ResolvedTask`

- [x] Task 3: Update `validateAndResolve()` to populate new fields (AC: #2, #3, #5)
  - [x] In the task resolution loop, add: `if (task.driver !== undefined) resolved.driver = task.driver as string;`
  - [x] Add: `if (task.model !== undefined) resolved.model = task.model as string;`
  - [x] Add: `if (task.plugins !== undefined) resolved.plugins = task.plugins as string[];`
  - [x] Do NOT set defaults for these fields — they remain `undefined` when absent

- [x] Task 4: Write unit tests (AC: #7, #8)
  - [x] Test: minimal workflow (no new fields) parses successfully — backward compat
  - [x] Test: task with `driver: codex` parses into `ResolvedTask.driver === 'codex'`
  - [x] Test: task with `model: claude-opus-4` parses into `ResolvedTask.model === 'claude-opus-4'`
  - [x] Test: task with `plugins: ['gstack', 'omo']` parses into `ResolvedTask.plugins`
  - [x] Test: task with all three new fields parses correctly
  - [x] Test: `driver: 123` (wrong type) fails schema validation
  - [x] Test: `model: true` (wrong type) fails schema validation
  - [x] Test: `plugins: "not-array"` (wrong type) fails schema validation
  - [x] Verify `npm run build` succeeds with zero errors
  - [x] Verify `npm run test:unit` passes with no regressions

- [x] Task 5: Remove forward-compat hacks in `workflow-engine.ts` (AC: #4)
  - [x] Replace `(task as { driver?: string }).driver` with `task.driver` (now a real field)
  - [x] Replace `(task as { plugins?: readonly string[] }).plugins` with `task.plugins`
  - [x] Verify TypeScript compiles without errors after this cleanup

## Dev Notes

### Architecture Compliance

This story implements Epic 2, Story 2.1 "Workflow Schema Extension" from `epics-multi-framework.md`. It covers FR11 (per-task driver field), FR12 (per-task model field), and partially FR15 (backward compatibility for existing workflows).

Key architecture decisions honored:
- **Decision 1 (Driver Interface):** `driver` field names match `AgentDriver.name` values registered in the factory
- **Decision 4 (Model Resolution):** `model` field is optional — absence means "fall through to model resolution chain" (`resolveModel(task, agent, driver)` in `model-resolver.ts`)
- **Decision 6 (Plugin Pass-Through):** `plugins` array is a list of plugin names, translated by drivers to framework-specific CLI flags

### Current State of the Codebase

- **`workflow.schema.json`** has `additionalProperties: false` on the task definition. New fields MUST be added to the schema or they will be rejected as unknown properties.
- **`ResolvedTask`** in `workflow-parser.ts` currently has: `agent`, `scope`, `session`, `source_access`, `prompt_template?`, `input_contract?`, `output_contract?`, `max_budget_usd?`. No `driver`, `model`, or `plugins` fields.
- **`validateAndResolve()`** in `workflow-parser.ts` builds `ResolvedTask` objects from parsed YAML. It applies defaults for `scope`, `session`, and `source_access`. The new fields should NOT have defaults — they are purely optional.
- **`workflow-engine.ts`** currently uses `(task as { driver?: string }).driver ?? 'claude-code'` as a forward-compat hack from story 10-5. Once `ResolvedTask` has the `driver` field, this cast can be replaced with `task.driver ?? 'claude-code'`.
- **`schema-validate.ts`** compiles the JSON schema via Ajv. Changes to `workflow.schema.json` are automatically picked up — no code change needed in the validator.
- **Existing tests** in `workflow-parser.test.ts` test minimal and full YAML parsing. New tests should follow the same patterns (write YAML to temp dir, call `parseWorkflow()`, assert on `ResolvedTask` fields).

### What NOT to Do

- Do NOT add referential integrity checks for `driver` values (that's story 11-2)
- Do NOT add referential integrity checks for `agent` values against agent templates (that's story 11-2)
- Do NOT modify `model-resolver.ts` — it already handles the resolution chain
- Do NOT modify `factory.ts` or any driver files
- Do NOT add defaults for `driver` or `model` in the schema or parser — the engine handles defaults at dispatch time
- Do NOT modify the `flow` section schema — only `task` definitions change

### Previous Story Intelligence

From story 10-5 (Workflow Engine Driver Integration):
- The engine already uses `(task as { driver?: string }).driver ?? 'claude-code'` — this is the forward-compat pattern that this story makes official
- The engine passes `(task as { plugins?: readonly string[] }).plugins` to `DispatchOpts` — same pattern
- `DispatchError` import from `agent-dispatch.ts` was kept for backward compat
- 108 tests in workflow-engine.test.ts, 4321 tests total across 164 files

### File Structure

Files to modify:
- `src/schemas/workflow.schema.json` — add `driver`, `model`, `plugins` to task definition
- `src/lib/workflow-parser.ts` — extend `ResolvedTask` interface and `validateAndResolve()` 
- `src/lib/workflow-engine.ts` — remove forward-compat type casts (cleanup)
- `src/lib/__tests__/workflow-parser.test.ts` — new test cases for the extended schema

Files NOT to modify:
- `src/lib/schema-validate.ts` — auto-picks up schema changes
- `src/lib/agents/drivers/factory.ts` — unchanged
- `src/lib/agents/model-resolver.ts` — unchanged
- `src/lib/agents/types.ts` — unchanged

### Testing Patterns

- Follow existing patterns in `workflow-parser.test.ts`: write YAML to temp dir, call `parseWorkflow()`, assert on result
- Use `writeYaml()` helper already defined in the test file
- For schema validation failures, expect `WorkflowParseError` to be thrown
- Verify backward compatibility: all existing tests must continue to pass without modification

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 2.1: Workflow Schema Extension]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 1: Driver Interface Design]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 4: Model Resolution]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 6: Plugin Ecosystem Pass-Through]
- [Source: src/schemas/workflow.schema.json — current task definition schema]
- [Source: src/lib/workflow-parser.ts — ResolvedTask interface, validateAndResolve()]
- [Source: src/lib/workflow-engine.ts — forward-compat type casts from story 10-5]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/11-1-workflow-schema-extension-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/11-1-workflow-schema-extension.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
