# Story 11.2: Workflow Referential Integrity Validation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the workflow parser to validate that all referenced drivers and agents exist,
so that I get clear errors before execution if my workflow configuration is wrong.

## Acceptance Criteria

1. **Given** a workflow YAML with `driver: codex` on a task
   **When** the workflow is parsed via `parseWorkflow()` or `resolveWorkflow()`
   **Then** the parser checks that `codex` is a registered driver name via the driver registry
   **And** if the driver is not registered, a `WorkflowParseError` is thrown listing the invalid driver name, the task name, and the set of registered drivers as a suggested fix
   <!-- verification: test-provable -->

2. **Given** a workflow YAML with `agent: dev` on a task
   **When** the workflow is parsed via `parseWorkflow()` or `resolveWorkflow()`
   **Then** the parser checks that `dev` exists as an embedded agent template (file `templates/agents/dev.yaml` exists)
   **And** if the agent template does not exist, a `WorkflowParseError` is thrown listing the invalid agent name, the task name, and available agent templates as a suggested fix
   <!-- verification: test-provable -->

3. **Given** a workflow YAML with multiple tasks, where one has `driver: nonexistent` and another has `agent: fake-agent`
   **When** the workflow is parsed
   **Then** all referential integrity errors are collected and reported in a single `WorkflowParseError` (not fail-fast on the first error)
   **And** each error includes the field name (`driver` or `agent`), the task name, and the invalid value
   <!-- verification: test-provable -->

4. **Given** a workflow YAML with `driver: claude-code` on a task (a valid registered driver)
   **When** the workflow is parsed
   **Then** validation passes without error for that task's driver field
   <!-- verification: test-provable -->

5. **Given** a workflow YAML where no tasks specify a `driver` field
   **When** the workflow is parsed
   **Then** validation passes (driver field is optional; the engine defaults to `claude-code` at dispatch time)
   **And** no referential integrity check is performed for absent driver fields
   <!-- verification: test-provable -->

6. **Given** a workflow YAML where a task specifies an agent that exists as a project-level or user-level override (not just embedded)
   **When** the workflow is parsed
   **Then** the agent validation accepts it if the agent can be resolved via `resolveAgent()` (embedded, user-level, or project-level)
   <!-- verification: test-provable -->

7. **Given** referential integrity validation
   **When** it runs
   **Then** it executes at parse time, after schema validation but before the `ResolvedWorkflow` is returned
   **And** the existing flow-to-task referential integrity check (dangling task refs in flow) still runs
   **And** both check types (flow refs + driver/agent refs) report errors in the same `WorkflowParseError` if both fail
   <!-- verification: test-provable -->

8. **Given** `npm run build` is executed after all changes
   **When** the build completes
   **Then** it succeeds with zero TypeScript errors
   **And** `npm run test:unit` passes with no regressions in existing test suites
   <!-- verification: test-provable -->

9. **Given** unit tests for the referential integrity validation
   **When** `npm run test:unit` is executed
   **Then** tests cover: valid driver passes, invalid driver fails with helpful error, valid agent passes, invalid agent fails with helpful error, multiple errors collected, absent driver/agent fields skip validation, backward compatibility with existing workflows
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Add `listEmbeddedAgents()` utility to `agent-resolver.ts` (AC: #2, #6)
  - [x] Add `export function listEmbeddedAgents(): string[]` that reads `templates/agents/` directory and returns agent names (filenames without `.yaml` extension)
  - [x] This provides the "available agents" list for error messages without importing a hardcoded list
  - [x] Uses `readdirSync` on TEMPLATES_DIR, filters .yaml files, returns sorted names. Falls back to empty array on error.

- [x] Task 2: Add `validateReferentialIntegrity()` function in `workflow-parser.ts` (AC: #1, #2, #3, #7)
  - [x] Create a new internal function `validateReferentialIntegrity(data, taskNames, errors)` called after schema validation and after the existing flow-ref check
  - [x] For each task: if `driver` is defined and registry is populated, check `listDrivers()` from `factory.ts` — if not found, collect error
  - [x] For each task: if `agent` is defined, try `resolveAgent(agent)` — if not found, collect error with available agents list
  - [x] Combine all collected errors with any existing dangling-ref errors
  - [x] Throw single `WorkflowParseError` if any errors exist

- [x] Task 3: Integrate validation into `validateAndResolve()` (AC: #4, #5, #7)
  - [x] Call `validateReferentialIntegrity()` after the existing flow-ref block but before building resolved tasks
  - [x] Merge dangling-ref errors and integrity errors into one error list before throwing
  - [x] Ensure absent `driver`/`agent` fields are skipped (only validate if present)

- [x] Task 4: Handle driver registry initialization concern (AC: #1, #4)
  - [x] Option A implemented: validate only when `listDrivers().length > 0`, skip driver check if registry is empty
  - [x] Parse can be called independently of engine startup without false positives

- [x] Task 5: Write unit tests (AC: #8, #9)
  - [x] Test: workflow with `driver: claude-code` and registered driver passes validation
  - [x] Test: workflow with `driver: nonexistent` throws `WorkflowParseError` with driver name, task name, and registered drivers
  - [x] Test: workflow with `agent: dev` (valid embedded agent) passes validation
  - [x] Test: workflow with `agent: nonexistent-agent` throws `WorkflowParseError` with agent name, task name, and available agents
  - [x] Test: workflow with multiple invalid refs collects all errors in one throw
  - [x] Test: workflow with no `driver` field on any task passes (optional field)
  - [x] Test: existing flow-ref checks still work (regression guard)
  - [x] Test: backward compatibility — existing test workflows parse without errors
  - [x] 12 new tests added, all passing. 4350 total tests pass.

## Dev Notes

### Architecture Compliance

This story implements Epic 2 (mapped to sprint Epic 11), Story 2.2 "Workflow Referential Integrity Validation" from `epics-multi-framework.md`. It covers FR14 (workflow YAML referential integrity: all referenced drivers exist, all referenced agents exist).

Key architecture decisions honored:
- **Decision 1 (Driver Interface):** `driver` field names match `AgentDriver.name` values registered in the factory. This story validates that contract at parse time.
- **Architecture Boundary:** The workflow parser boundary is extended to validate cross-module references (drivers via factory, agents via resolver) without importing driver internals.

### Current State of the Codebase

- **`workflow-parser.ts`** already has flow-to-task referential integrity checking (lines 73-103). The new validation follows the same pattern: collect errors, throw once.
- **`factory.ts`** exports `listDrivers(): string[]` which returns registered driver names. Currently only `claude-code` is registered (by `workflow-engine.ts` at startup). The registry may be empty at standalone parse time.
- **`agent-resolver.ts`** exports `loadEmbeddedAgent(name)` which throws `AgentResolveError` if the agent doesn't exist. No listing function exists yet — must be added.
- **Embedded agent templates** live in `templates/agents/`: `dev`, `qa`, `architect`, `pm`, `sm`, `analyst`, `ux-designer`, `tech-writer`, `evaluator`.
- **`ResolvedTask`** already includes optional `driver?: string` and `model?: string` and `plugins?: string[]` from story 11-1.
- **`WorkflowParseError`** already carries structured errors as `Array<{ path: string; message: string }>` — the new validation produces errors in the same format.

### What NOT to Do

- Do NOT validate `model` field values — model resolution happens at dispatch time via `model-resolver.ts` and depends on runtime context (driver defaults, agent configs)
- Do NOT validate `plugins` values — plugin availability depends on the driver and runtime environment
- Do NOT modify `factory.ts` or any driver files — only consume `listDrivers()`
- Do NOT modify the JSON schema — the schema validates structure, this story validates semantic references
- Do NOT make driver validation fail when the registry is empty — parse can be called independently of engine startup (test scenarios, CLI validation commands)
- Do NOT import driver classes directly — use the registry API only

### Import Strategy

The `validateAndResolve()` function in `workflow-parser.ts` will need new imports:
- `import { listDrivers } from './agents/drivers/factory.js';` — for driver name validation
- A new `listEmbeddedAgents` function or `resolveAgent` from `./agent-resolver.js` — for agent name validation

Keep imports minimal. Prefer checking file existence over loading/parsing full agent configs.

### Error Message Format

Follow the existing pattern from `factory.ts` `getDriver()`:
```
Driver 'codex' not found. Registered drivers: claude-code
```

For agents:
```
Agent 'fake-agent' not found in task 'implement'. Available agents: dev, qa, architect, pm, sm, analyst, ux-designer, tech-writer, evaluator
```

### Previous Story Intelligence

From story 11-1 (Workflow Schema Extension):
- `driver`, `model`, and `plugins` fields were added to both `workflow.schema.json` and `ResolvedTask` interface
- Forward-compat type casts in `workflow-engine.ts` were cleaned up
- The parser already populates `resolved.driver`, `resolved.model`, `resolved.plugins` from parsed YAML
- Story 11-1 explicitly deferred referential integrity to this story (11-2): "Do NOT add referential integrity checks for `driver` values (that's story 11-2)"
- Test patterns: write YAML to temp dir via `writeYaml()` helper, call `parseWorkflow()`, assert on `ResolvedTask` fields or expect `WorkflowParseError`

### Git Intelligence

Recent commits (all in current sprint):
- `a4bf7e6` — story 11-1: workflow schema extension (driver/model/plugins on tasks)
- `f128064` — story 10-5: workflow engine driver integration
- `3717741` — story 10-4: model resolution module
- `bd3f35d` — story 10-3: ClaudeCodeDriver extraction
- `48d0524` — story 10-2: driver factory & registry

All recent work is in the driver/workflow area. The codebase patterns are fresh and consistent.

### Project Structure Notes

Files to modify:
- `src/lib/workflow-parser.ts` — add `validateReferentialIntegrity()`, integrate into `validateAndResolve()`
- `src/lib/agent-resolver.ts` — add `listEmbeddedAgents()` utility
- `src/lib/__tests__/workflow-parser.test.ts` — new test cases for referential integrity

Files NOT to modify:
- `src/lib/agents/drivers/factory.ts` — consume only, don't change
- `src/schemas/workflow.schema.json` — schema validates structure, not semantic refs
- `src/lib/agents/drivers/types.ts` — unchanged
- `src/lib/agents/model-resolver.ts` — unchanged
- `src/lib/workflow-engine.ts` — unchanged (it registers drivers before parsing)

### Testing Patterns

- Follow existing patterns in `workflow-parser.test.ts`: write YAML to temp dir, call `parseWorkflow()`, assert on result
- Use existing `writeYaml()` helper
- For validation failures, expect `WorkflowParseError` to be thrown with specific error messages
- For driver registry tests: call `registerDriver()` with mock drivers before parsing, call `resetDrivers()` in afterEach
- For agent tests: rely on embedded templates existing at known paths (they do in test environment)
- Verify backward compatibility: all existing tests must continue to pass

### References

- [Source: _bmad-output/planning-artifacts/epics-multi-framework.md#Story 2.2: Workflow Referential Integrity Validation]
- [Source: _bmad-output/planning-artifacts/architecture-multi-framework.md#Decision 1: Driver Interface Design]
- [Source: src/lib/workflow-parser.ts — validateAndResolve(), existing flow-ref integrity check]
- [Source: src/lib/agents/drivers/factory.ts — listDrivers(), getDriver()]
- [Source: src/lib/agent-resolver.ts — loadEmbeddedAgent(), TEMPLATES_DIR]
- [Source: _bmad-output/implementation-artifacts/11-1-workflow-schema-extension.md — previous story context]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/11-2-workflow-referential-integrity-validation-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/11-2-workflow-referential-integrity-validation.md

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

- All 5 tasks completed
- 12 new unit tests added covering all ACs
- 8 existing tests updated for new unified error message format and valid agent names
- Build: zero TypeScript errors
- Tests: 4350 passed, 0 failed (164 test files)
- Option A chosen for driver registry concern: skip validation when registry empty

### File List

- `src/lib/agent-resolver.ts` — added `listEmbeddedAgents()` export, added `readdirSync` import
- `src/lib/workflow-parser.ts` — added `validateReferentialIntegrity()` function, integrated into `validateAndResolve()`, added imports for `listDrivers`, `listEmbeddedAgents`, `resolveAgent`
- `src/lib/__tests__/workflow-parser.test.ts` — 12 new tests in "referential integrity validation" describe block, 8 existing tests updated for new error message format and valid agent names
