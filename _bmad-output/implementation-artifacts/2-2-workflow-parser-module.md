# Story 2.2: Workflow Parser Module

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a workflow-parser module that loads YAML from disk, validates it against the JSON schema, resolves task references, and returns a typed config object,
so that the workflow engine receives a fully validated, resolved workflow definition it can execute without further parsing.

## Acceptance Criteria

1. **Given** a valid workflow YAML file on disk
   **When** `parseWorkflow(filePath)` is called
   **Then** the file is read, parsed as YAML, validated against the workflow JSON schema, and a typed `ResolvedWorkflow` object is returned containing `tasks` and `flow`
   <!-- verification: test-provable -->

2. **Given** a workflow YAML file containing invalid YAML syntax (e.g., bad indentation, unclosed quotes)
   **When** `parseWorkflow(filePath)` is called
   **Then** it throws a `WorkflowParseError` with a message identifying the YAML syntax problem
   <!-- verification: test-provable -->

3. **Given** a workflow YAML file that is valid YAML but fails JSON schema validation (e.g., missing `tasks`, invalid `scope` value)
   **When** `parseWorkflow(filePath)` is called
   **Then** it throws a `WorkflowParseError` whose message includes all schema validation errors (path and message for each)
   <!-- verification: test-provable -->

4. **Given** a workflow YAML file where a `flow` step (string or `loop:` item) references a task name not defined in `tasks`
   **When** `parseWorkflow(filePath)` is called
   **Then** it throws a `WorkflowParseError` identifying each dangling task reference
   <!-- verification: test-provable -->

5. **Given** a workflow YAML file where a `loop:` block inside `flow` references task names that all exist in `tasks`
   **When** `parseWorkflow(filePath)` is called
   **Then** the `loop:` block is included in the resolved flow as a `LoopBlock` object with its task list
   <!-- verification: test-provable -->

6. **Given** a valid workflow YAML file
   **When** `parseWorkflow(filePath)` is called and the wall-clock duration is measured
   **Then** parsing completes in <500ms (NFR1)
   <!-- verification: test-provable -->

7. **Given** a file path that does not exist
   **When** `parseWorkflow(filePath)` is called
   **Then** it throws a `WorkflowParseError` with a message indicating the file was not found
   <!-- verification: test-provable -->

8. **Given** the `ResolvedWorkflow` return type
   **When** inspected
   **Then** it includes typed interfaces: `ResolvedWorkflow` (with `tasks: Record<string, ResolvedTask>` and `flow: FlowStep[]`), `ResolvedTask` (all task properties from the schema), and `FlowStep` (union of `string | LoopBlock`)
   <!-- verification: test-provable -->

9. **Given** unit tests for the workflow-parser module
   **When** `npm run test:unit` is executed
   **Then** all tests pass with 80%+ coverage on `workflow-parser.ts`
   <!-- verification: test-provable -->

10. **Given** the codebase after this story is implemented
    **When** the project is inspected
    **Then** the module exists at `src/lib/workflow-parser.ts` with co-located tests at `src/lib/__tests__/workflow-parser.test.ts`
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define TypeScript interfaces (AC: #8)
  - [x] Create `src/lib/workflow-parser.ts`
  - [x] Define `ResolvedTask` interface matching all task schema properties: `agent` (string), `scope` (enum string), `session` (enum string), `source_access` (boolean), `prompt_template?` (string), `input_contract?` (object), `output_contract?` (object), `max_budget_usd?` (number)
  - [x] Define `LoopBlock` interface: `{ loop: string[] }`
  - [x] Define `FlowStep` type: `string | LoopBlock`
  - [x] Define `ResolvedWorkflow` interface: `{ tasks: Record<string, ResolvedTask>; flow: FlowStep[] }`
  - [x] Define `WorkflowParseError` class extending `Error` with `errors` property for structured error details
  - [x] Export all types and the error class

- [x] Task 2: Implement `parseWorkflow()` function (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] Read file from disk with `readFileSync` -- throw `WorkflowParseError` if file not found
  - [x] Parse YAML using `parse()` from the `yaml` package -- catch YAML parse errors and wrap in `WorkflowParseError`
  - [x] Validate parsed data against workflow schema using `validateWorkflowSchema()` from `schema-validate.ts` -- throw `WorkflowParseError` with all schema errors if invalid
  - [x] Perform referential integrity check: collect all task name references from `flow` (both string items and `loop:` block items) and verify each exists as a key in `tasks` -- throw `WorkflowParseError` listing dangling references
  - [x] Apply defaults: `scope` defaults to `'per-story'`, `session` defaults to `'fresh'`, `source_access` defaults to `true` (matching JSON schema defaults)
  - [x] Return typed `ResolvedWorkflow` object

- [x] Task 3: Write unit tests (AC: #9, #10)
  - [x] Create `src/lib/__tests__/workflow-parser.test.ts`
  - [x] Test: valid minimal workflow (tasks + flow) returns `ResolvedWorkflow`
  - [x] Test: valid full workflow with all optional fields returns correctly typed result
  - [x] Test: defaults applied when optional fields omitted (`scope`, `session`, `source_access`)
  - [x] Test: invalid YAML syntax throws `WorkflowParseError` with YAML error info
  - [x] Test: valid YAML but fails schema (missing `tasks`) throws with schema errors
  - [x] Test: valid YAML but fails schema (invalid `scope` enum) throws with schema errors
  - [x] Test: flow references non-existent task throws with dangling reference message
  - [x] Test: loop block references non-existent task throws with dangling reference message
  - [x] Test: loop block with valid references resolves correctly
  - [x] Test: file not found throws with file-not-found message
  - [x] Test: parsing completes in <500ms for a typical workflow
  - [x] Test: empty tasks object with empty flow is valid (degenerate but schema-legal)
  - [x] Test: `WorkflowParseError` includes structured errors array
  - [x] Target 80%+ coverage

## Dev Notes

### Module Location and Architecture Role

`src/lib/workflow-parser.ts` is the second module in the 7-module dependency chain: workflow-state -> **workflow-parser** -> agent-resolver -> agent-dispatch -> workflow-engine -> evaluator -> circuit-breaker.

The parser sits between the JSON schema (story 2.1) and the workflow engine (epic 5). It is the only module that touches the filesystem for workflow YAML; all downstream consumers receive a typed `ResolvedWorkflow` object.

### Reuse `schema-validate.ts` from Story 2.1

Story 2.1 created `src/lib/schema-validate.ts` with:
- `validateWorkflowSchema(data: unknown): ValidationResult` -- validates parsed data against the workflow JSON schema
- `ValidationResult` -- `{ valid: boolean; errors: ValidationError[] }`
- `ValidationError` -- `{ path: string; message: string; keyword: string }`

Import and call `validateWorkflowSchema()` after YAML parsing. Do NOT reimplement schema validation. The schema itself lives at `src/schemas/workflow.schema.json`.

### Referential Integrity Check (Deferred from Story 2.1)

Story 2.1 explicitly deferred referential integrity validation to this story (see 2.1 AC #6: "referential integrity check -- ensuring task names in `loop` exist in `tasks` -- is deferred to the parser module in story 2.2"). This is the semantic validation layer that goes beyond JSON schema structural validation.

Collect all task name references from `flow`:
- String items are direct task references
- `loop:` blocks contain arrays of task references

Compare each reference against `Object.keys(tasks)`. Any reference not found is a dangling reference error.

### Default Value Application

The JSON schema declares defaults (`scope: "per-story"`, `session: "fresh"`, `source_access: true`), but `ajv` in its current configuration does not mutate the input to apply defaults. The parser must explicitly apply these defaults to tasks that omit them. This ensures the `ResolvedWorkflow` object always has complete task definitions.

### Error Handling Pattern

Use a custom error class (`WorkflowParseError`) to distinguish parser errors from other errors. The error should carry structured information so that downstream consumers (e.g., the `validate` command in story 2.5) can format errors with file paths and context.

```typescript
export class WorkflowParseError extends Error {
  public readonly errors: Array<{ path: string; message: string }>;
  constructor(message: string, errors?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'WorkflowParseError';
    this.errors = errors ?? [];
  }
}
```

### Established Patterns from Previous Stories

From `workflow-state.ts` (story 1.3):
- `import { parse } from 'yaml'` for YAML parsing
- `import { readFileSync, existsSync } from 'node:fs'` for file I/O
- `warn()` from `src/lib/output.ts` for non-fatal warnings
- Function naming: `camelCase` (e.g., `readWorkflowState`, `writeWorkflowState`)

From `schema-validate.ts` (story 2.1):
- `import { validateWorkflowSchema } from './schema-validate.js'`
- `ValidationResult`, `ValidationError` types already defined there

### Performance Requirement (NFR1)

NFR1 requires workflow YAML parsing and validation in <500ms. For a typical workflow file (~50 lines), this should be trivially met. The test should measure wall-clock time of `parseWorkflow()` and assert <500ms.

### What This Story Does NOT Do

- **Patch resolution** (embedded -> user -> project chain): That is story 9.1. This parser loads a single YAML file. The engine (epic 5) will call `parseWorkflow()` with the already-resolved file path.
- **Create the default workflow YAML**: That is story 2.3.
- **CLI `validate` command**: That is story 2.5, which will call `parseWorkflow()` and format errors.
- **Agent resolution**: That is story 3.3 (agent-resolver).

### Architecture Constraints

- **File location:** `src/lib/workflow-parser.ts` per architecture-v2.md
- **YAML key convention:** All keys use `snake_case` per architecture
- **Export naming:** `camelCase` for functions, `PascalCase` for types/interfaces
- **No `any` in API surface** (NFR18) -- use `unknown` for untyped input
- **Dependencies:** Only `yaml` (already installed) and `schema-validate.ts` (story 2.1). No new npm dependencies needed.

### Downstream Consumers

- **Story 2.5 (validate command):** Will call `parseWorkflow()` and catch `WorkflowParseError` for error reporting
- **Story 5.1 (flow execution):** Will call `parseWorkflow()` to get the resolved workflow for engine execution
- **Story 9.1 (workflow patch resolution):** Will extend this module with patch resolution logic

### Project Structure Notes

- New file: `src/lib/workflow-parser.ts`
- New file: `src/lib/__tests__/workflow-parser.test.ts`
- No new directories needed
- No new npm dependencies needed
- No changes to existing files except `src/lib/AGENTS.md` (add workflow-parser entry)

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 2.2: Workflow Parser Module]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries -- workflow-parser]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Project Structure & Boundaries -- src/lib/]
- [Source: _bmad-output/implementation-artifacts/2-1-workflow-yaml-json-schema.md -- schema-validate.ts API, ajv defaults behavior]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR1, FR5, NFR1]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/2-2-workflow-parser-module-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/2-2-workflow-parser-module.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 80%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 3 tasks completed: interfaces, parseWorkflow(), unit tests
- 17 tests pass, coverage: 100% statements, 94.28% branches, 100% functions, 100% lines
- No new npm dependencies added
- AGENTS.md updated with workflow-parser entry

### File List

- `src/lib/workflow-parser.ts` (new)
- `src/lib/__tests__/workflow-parser.test.ts` (new)
- `src/lib/AGENTS.md` (modified — added workflow-parser entry)
