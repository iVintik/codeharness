# Story 2.3: Default Embedded Workflow

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a default workflow YAML shipped with codeharness at `templates/workflows/default.yaml`,
so that `codeharness run` works out of the box without requiring custom workflow configuration.

## Acceptance Criteria

1. **Given** codeharness is installed
   **When** `templates/workflows/default.yaml` is inspected
   **Then** the file exists and contains a valid YAML document with `tasks` and `flow` top-level keys
   <!-- verification: test-provable -->

2. **Given** the default workflow defines tasks
   **When** the `tasks` section is inspected
   **Then** it defines at least three tasks: `implement` (agent: dev, scope: per-story, session: fresh, source_access: true), `verify` (agent: evaluator, scope: per-run, session: fresh, source_access: false), and `retry` (agent: dev, scope: per-story, session: fresh, source_access: true)
   <!-- verification: test-provable -->

3. **Given** the default workflow defines a flow
   **When** the `flow` section is inspected
   **Then** the flow order is: `implement`, `verify`, then a `loop:` block containing `[retry, verify]`
   <!-- verification: test-provable -->

4. **Given** the default workflow YAML file
   **When** validated against the workflow JSON schema at `src/schemas/workflow.schema.json` using `parseWorkflow()`
   **Then** it passes validation with no errors and returns a typed `ResolvedWorkflow` object
   <!-- verification: test-provable -->

5. **Given** the `verify` task in the default workflow
   **When** its properties are inspected
   **Then** `source_access` is `false` and `scope` is `per-run`, enforcing blind evaluation of the final artifact
   <!-- verification: test-provable -->

6. **Given** the `retry` task in the default workflow
   **When** its properties are inspected
   **Then** it has `source_access: true` and `scope: per-story`, so the dev agent can fix only failing stories with full source access
   <!-- verification: test-provable -->

7. **Given** the `templates/workflows/` directory
   **When** `package.json` `files` array is inspected
   **Then** `templates/workflows/` is included, ensuring the default workflow ships in the npm package
   <!-- verification: test-provable -->

8. **Given** unit tests for the default embedded workflow
   **When** `npm run test:unit` is executed
   **Then** all tests pass with 80%+ coverage on the test file, covering: file existence, schema validation via `parseWorkflow()`, task property assertions, flow structure assertions
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create the default workflow YAML (AC: #1, #2, #3, #5, #6)
  - [x] Create directory `templates/workflows/`
  - [x] Create `templates/workflows/default.yaml` with `implement`, `verify`, and `retry` tasks
  - [x] Set `implement` task: `agent: dev`, `scope: per-story`, `session: fresh`, `source_access: true`
  - [x] Set `verify` task: `agent: evaluator`, `scope: per-run`, `session: fresh`, `source_access: false`
  - [x] Set `retry` task: `agent: dev`, `scope: per-story`, `session: fresh`, `source_access: true`
  - [x] Set flow: `[implement, verify, {loop: [retry, verify]}]`

- [x] Task 2: Update package.json for npm distribution (AC: #7)
  - [x] Add `"templates/workflows/"` to the `files` array in `package.json`

- [x] Task 3: Write unit tests (AC: #4, #8)
  - [x] Create `src/lib/__tests__/default-workflow.test.ts`
  - [x] Test: `templates/workflows/default.yaml` exists on disk
  - [x] Test: `parseWorkflow()` succeeds on the default workflow (schema validation + referential integrity)
  - [x] Test: returned `ResolvedWorkflow` has `implement`, `verify`, `retry` tasks with correct properties
  - [x] Test: flow structure is `[implement, verify, {loop: [retry, verify]}]`
  - [x] Test: `verify` task has `source_access: false` and `scope: per-run`
  - [x] Test: `retry` task has `source_access: true` and `scope: per-story`
  - [x] Target 80%+ coverage

## Dev Notes

### Module Location and Architecture Role

This story creates a static YAML file, not a TypeScript module. The file lives at `templates/workflows/default.yaml` per architecture AD3 (Embedded Template Storage). It is consumed by:
- `parseWorkflow()` from `src/lib/workflow-parser.ts` (story 2.2) at runtime
- `codeharness init` (story 2.4) which will copy it to `.codeharness/workflows/default.yaml` in the user's project
- `codeharness run` (story 5.1) which will load the resolved workflow for engine execution

### Default Workflow Design (from PRD and Architecture)

FR6 states: "System ships a default embedded workflow that handles standard BMAD sprint execution without user customization."

The flow is: implement -> verify -> loop: [retry, verify]. This maps directly to the BMAD sprint execution lifecycle:
1. **implement** (per-story, dev agent): Dev agent implements each story
2. **verify** (per-run, evaluator agent): Blind evaluator exercises the final artifact
3. **loop: [retry, verify]**: If evaluator fails stories, dev retries only failing ones, then evaluator re-verifies from scratch. Loop repeats until all pass or circuit breaker triggers.

The `verify` task uses `source_access: false` and `scope: per-run` — this enforces the blind evaluator pattern (AD2). The evaluator never sees source code and runs once against the entire artifact (not per-story).

### Established Patterns from Previous Stories

From story 2.2 (`workflow-parser.ts`):
- `parseWorkflow(filePath)` reads YAML, validates against schema, checks referential integrity, returns `ResolvedWorkflow`
- Import: `import { parseWorkflow } from './workflow-parser.js'`
- The parser applies defaults (`scope: 'per-story'`, `session: 'fresh'`, `source_access: true`) when fields are omitted

From story 2.1 (`workflow.schema.json`):
- Schema at `src/schemas/workflow.schema.json`
- Required top-level keys: `tasks`, `flow`
- Tasks require `agent` field; `scope`, `session`, `source_access` have defaults
- Flow items are either strings (task references) or objects with `loop:` arrays

### YAML Key Convention

All keys use `snake_case` per architecture convention: `source_access`, `prompt_template`, `max_budget_usd`, `input_contract`, `output_contract`.

### Package Distribution

The `templates/workflows/` directory must be added to `package.json` `files` array so it ships in the npm tarball. Existing pattern: `templates/dockerfiles/`, `templates/compose/`, `templates/prompts/`, `templates/docs/`, `templates/otlp/` are already in the `files` array.

### Test Approach

Tests should use `parseWorkflow()` to validate the YAML against the real schema. This provides true end-to-end validation: file exists -> YAML parses -> schema validates -> referential integrity passes -> typed result is correct. Use `path.resolve(__dirname, '../../../templates/workflows/default.yaml')` (or equivalent) to locate the file from the test directory. See `src/lib/__tests__/workflow-parser.test.ts` for patterns.

### What This Story Does NOT Do

- **Does not create the `codeharness init` command** that copies the workflow to the project (story 2.4)
- **Does not create any agent YAML files** (story 3.2)
- **Does not implement flow execution** (story 5.1)
- **Does not implement workflow patching** (story 9.1)
- **Does not add `prompt_template` fields** to tasks — those are optional and will be configured per-project or in agent YAML

### Architecture Constraints

- **File location:** `templates/workflows/default.yaml` per AD3
- **YAML key convention:** `snake_case` per architecture
- **Schema compliance:** Must pass `src/schemas/workflow.schema.json` validation
- **No TypeScript code in this file** — it's a static YAML template
- **No new npm dependencies needed**

### Downstream Consumers

- **Story 2.4 (init command):** Will copy `default.yaml` to `.codeharness/workflows/` during project initialization
- **Story 5.1 (flow execution):** Will load the workflow via `parseWorkflow()` and execute it
- **Story 9.1 (workflow patching):** Will use `default.yaml` as the base for `extends: embedded://default` patches

### Project Structure Notes

- New directory: `templates/workflows/`
- New file: `templates/workflows/default.yaml`
- New file: `src/lib/__tests__/default-workflow.test.ts`
- Modified file: `package.json` (add `templates/workflows/` to `files` array)
- No changes to existing TypeScript source files

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 2.3: Default Embedded Workflow]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD3: Embedded Template Storage]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Project Structure & Boundaries -- templates/workflows/]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR6]
- [Source: _bmad-output/implementation-artifacts/2-2-workflow-parser-module.md -- parseWorkflow API, ResolvedWorkflow types]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/2-3-default-embedded-workflow-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/2-3-default-embedded-workflow.md

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

- Created `templates/workflows/default.yaml` with three tasks (implement, verify, retry) and flow: implement -> verify -> loop:[retry, verify]
- verify task enforces blind evaluator pattern: source_access=false, scope=per-run
- retry task allows dev agent to fix failures: source_access=true, scope=per-story
- Added `templates/workflows/` to package.json files array for npm distribution
- Created 7 unit tests covering file existence, schema validation via parseWorkflow(), task property assertions, and flow structure
- All 146 test files pass (3607 tests total), zero regressions
- Lint passes clean

### Change Log

- 2026-04-02: Implemented story 2-3 — default embedded workflow YAML, package.json update, unit tests

### File List

- templates/workflows/default.yaml (new)
- src/lib/__tests__/default-workflow.test.ts (new)
- package.json (modified — added templates/workflows/ to files array)
