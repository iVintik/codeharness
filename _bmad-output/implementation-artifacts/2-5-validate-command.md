# Story 2.5: Validate Command

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want `codeharness validate` to check my workflow and agent YAML files against their JSON schemas,
so that I catch configuration errors before running.

## Acceptance Criteria

1. **Given** a project with `.codeharness/workflows/default.yaml` that is valid
   **When** `codeharness validate` runs
   **Then** the command exits 0 and reports each validated file with `[OK]` status
   <!-- verification: test-provable -->

2. **Given** a project with a malformed workflow YAML (e.g., missing required `tasks` key)
   **When** `codeharness validate` runs
   **Then** the command exits 1 and reports the file path, schema violation path, and specific error message for each violation
   <!-- verification: test-provable -->

3. **Given** a workflow YAML with a dangling task reference in `flow` (references a task not defined in `tasks`)
   **When** `codeharness validate` runs
   **Then** the command exits 1 and the error message identifies the dangling reference by name and its location in the flow array
   <!-- verification: test-provable -->

4. **Given** no `.codeharness/workflows/` directory exists in the project
   **When** `codeharness validate` runs
   **Then** the command exits 1 and reports `[FAIL] No workflow files found` (not a crash or unhandled exception)
   <!-- verification: test-provable -->

5. **Given** `codeharness validate --json` runs against a project with one valid and one invalid YAML
   **When** the output is parsed as JSON
   **Then** it contains `{ status: 'fail', files: [...] }` where each file entry has `{ path, valid, errors }` and `errors` is an array of `{ path, message }` objects
   <!-- verification: test-provable -->

6. **Given** the existing `codeharness validate` command (self-validation, story 10-3)
   **When** `codeharness validate` runs after this change
   **Then** the schema validation behavior is exposed as a subcommand (`codeharness validate schema`) OR the existing validate command is replaced, with the old self-validation functionality moved to `codeharness validate self` — choose whichever preserves backward compat better. The chosen approach must be documented in dev notes.
   <!-- verification: test-provable -->

7. **Given** the `parseWorkflow()` function from `src/lib/workflow-parser.ts`
   **When** `codeharness validate` validates a workflow file
   **Then** it reuses `parseWorkflow()` for schema + referential integrity checking (does NOT duplicate validation logic)
   <!-- verification: test-provable -->

8. **Given** unit tests for the validate command
   **When** `npm run test:unit` is executed
   **Then** tests pass covering: valid workflow reports OK, invalid workflow reports errors with file path and violation details, missing directory reports no-files-found, JSON output shape is correct, exit codes are correct (0 on success, 1 on failure), and no regressions in existing validate tests
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Decide command structure — subcommands vs replacement (AC: #6)
  - [x] Evaluate whether to add `validate schema` subcommand or restructure `validate` with `validate self` / `validate schema`
  - [x] The existing `validate` command (self-validation) has no known external consumers calling it programmatically, so either approach works. Document decision in dev notes.

- [x] Task 2: Implement the schema validation command handler (AC: #1, #2, #3, #4, #5, #7)
  - [x] Create a new command registration function (e.g., `registerValidateSchemaCommand`) or modify existing `registerValidateCommand`
  - [x] Discover `.codeharness/workflows/*.yaml` files in the project directory
  - [x] For each discovered YAML file, call `parseWorkflow(filePath)` and catch `WorkflowParseError`
  - [x] Map `WorkflowParseError.errors` to user-facing output with file path, violation path, and message
  - [x] Handle missing directory gracefully (no crash)
  - [x] Set `process.exitCode = 0` if all files valid, `process.exitCode = 1` if any invalid

- [x] Task 3: Implement JSON output mode (AC: #5)
  - [x] When `--json` is set, output `{ status: 'pass' | 'fail', files: [{ path, valid, errors }] }`
  - [x] Use `jsonOutput()` from `src/lib/output.ts`

- [x] Task 4: Restructure existing validate command if needed (AC: #6)
  - [x] If subcommand approach chosen: register as `validate schema` and rename existing to `validate self`
  - [x] If replacement approach: move self-validation to `validate self`, make `validate` default to schema validation
  - [x] Update `src/index.ts` command registration

- [x] Task 5: Write unit tests (AC: #8)
  - [x] Test: valid workflow YAML exits 0 with OK output
  - [x] Test: invalid workflow YAML exits 1 with error details including file path and violation
  - [x] Test: dangling task reference is caught and reported
  - [x] Test: missing `.codeharness/workflows/` directory exits 1 with informative message
  - [x] Test: JSON output has correct shape
  - [x] Test: no regressions in existing validate (self-validation) tests

## Dev Notes

### Module Location and Architecture Role

The architecture (AD1) states CLI commands are thin wrappers calling modules. The validate command should:
- Live at `src/commands/validate.ts` (already exists for self-validation — must restructure)
- Delegate all schema validation logic to `parseWorkflow()` from `src/lib/workflow-parser.ts`
- NOT duplicate any validation logic — the workflow parser already does schema validation + referential integrity

### Command Structure Decision

The existing `validate.ts` implements self-validation (story 10-3, release gate checking). Story 2-5 needs schema validation. Two options:

**Option A (recommended): Subcommands**
```
codeharness validate schema   # NEW: validate YAML files against schemas
codeharness validate self     # EXISTING: self-validation release gate
codeharness validate          # Default: run schema validation (most common use)
```

**Option B: Replace and move**
Move self-validation to a separate command entirely.

The dev should choose based on what preserves backward compat best. Commander.js supports subcommands via `program.command('validate').command('schema')`.

### Reusing parseWorkflow()

The `parseWorkflow()` function in `src/lib/workflow-parser.ts` already:
1. Reads the YAML file from disk
2. Parses YAML syntax
3. Validates against `workflow.schema.json` via Ajv
4. Checks referential integrity (dangling task references in `flow`)
5. Throws `WorkflowParseError` with structured `.errors` array

The validate command should simply:
1. Discover files in `.codeharness/workflows/*.yaml`
2. Call `parseWorkflow()` for each file
3. Catch `WorkflowParseError` and format the `.errors` for user output
4. Report results

Do NOT create a separate validation module or re-implement schema checking.

### File Discovery Pattern

Use `globSync` or `readdirSync` to find `*.yaml` and `*.yml` files under `.codeharness/workflows/`. The architecture specifies workflows live here (AD3). Agent YAML validation (in `templates/agents/`) will be added in Epic 3 stories — for now, only workflow files need validation.

### Output Conventions

Follow the established patterns from `src/lib/output.ts`:
- `ok('Schema: .codeharness/workflows/default.yaml valid')` — green `[OK]`
- `fail('Schema: .codeharness/workflows/custom.yaml invalid')` — red `[FAIL]`
- Error details indented below the fail line

### Exit Code Convention

- Exit 0: All discovered files are valid
- Exit 1: Any file is invalid OR no files found OR command error
- This matches the existing convention in `validate.ts` and other commands

### JSON Output Shape

```typescript
interface ValidateSchemaResult {
  status: 'pass' | 'fail';
  files: Array<{
    path: string;
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
  }>;
}
```

### What This Story Does NOT Do

- Does NOT validate agent YAML files (no `agent.schema.json` exists yet — that's story 3.1)
- Does NOT implement workflow patching or resolution (story 9.1)
- Does NOT change `parseWorkflow()` or `schema-validate.ts` — those are already complete from stories 2.1 and 2.2
- Does NOT add new schemas — only uses the existing `workflow.schema.json`

### Anti-Patterns to Avoid

- **Do NOT re-implement schema validation** — `parseWorkflow()` already does it all
- **Do NOT read YAML and call Ajv directly** — go through `parseWorkflow()` for the full check (schema + referential integrity)
- **Do NOT put business logic in the command file** — keep it thin, but note that file discovery + loop is simple enough to stay in the command
- **Do NOT break existing `validate` self-validation tests** — restructure carefully
- **Do NOT validate files outside `.codeharness/workflows/`** — that's the defined location

### Existing Test Patterns

The existing `validate.ts` tests (if any) test self-validation. For schema validation tests, follow the pattern in `src/lib/__tests__/workflow-parser.test.ts`:
- Mock `fs.readFileSync` or use temp files
- Test both valid and invalid YAML inputs
- Assert on specific error messages and paths

### Dependencies from Previous Stories

- **Story 2.1** created `src/schemas/workflow.schema.json` — the schema to validate against
- **Story 2.2** created `src/lib/workflow-parser.ts` with `parseWorkflow()` and `WorkflowParseError` — the validation engine
- **Story 2.3** created `templates/workflows/default.yaml` — a known-valid workflow for positive testing
- **Story 2.4** created the init command that copies the default workflow to `.codeharness/workflows/` — so `validate` has files to discover

### Git Intelligence

Recent commits follow the pattern `feat: story X-Y-slug — description`. Files are organized with commands in `src/commands/`, modules in `src/lib/` or `src/modules/`, tests co-located in `__tests__/` directories. All stories in this epic build on the workflow-parser module.

### Project Structure Notes

- Modified file: `src/commands/validate.ts` — restructure to support schema validation alongside existing self-validation
- Modified file: `src/index.ts` — update command registration if structure changes
- New test file: `src/commands/__tests__/validate-schema.test.ts` (or extend existing validate test file)
- No changes to `src/lib/workflow-parser.ts` or `src/lib/schema-validate.ts` — they're already complete

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 2.5: Validate Command]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Decomposition — validate.ts as thin wrapper]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD3: Embedded Template Storage — .codeharness/workflows/ location]
- [Source: src/lib/workflow-parser.ts — parseWorkflow(), WorkflowParseError, validation pipeline]
- [Source: src/lib/schema-validate.ts — validateWorkflowSchema(), Ajv integration]
- [Source: src/commands/validate.ts — existing self-validation command to restructure]
- [Source: _bmad-output/implementation-artifacts/2-4-init-command-workflow-generation.md — init copies default.yaml to .codeharness/workflows/]
- [Source: _bmad-output/implementation-artifacts/2-2-workflow-parser-module.md — parseWorkflow API, error structure]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/2-5-validate-command-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/2-5-validate-command.md

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

- **Command structure decision (Task 1):** Chose Option A — subcommands. `validate` defaults to schema validation (most common use), `validate schema` is explicit, `validate self` preserves existing self-validation. This preserves backward compat since `validate self` still works and the default behavior changes to the more commonly needed schema validation.
- Self-validation logic extracted to `validate-self.ts`, schema validation in `validate-schema.ts`, parent command in `validate.ts`.
- `runSchemaValidation()` is exported as a pure function for testability, separate from CLI concerns.
- `src/index.ts` required no changes — `registerValidateCommand` function name and signature unchanged.
- Existing validate self-validation tests updated to use `validate self` subcommand path.
- All 3632 tests pass (147 test files), zero regressions.

### File List

- `src/commands/validate.ts` — restructured as parent command with subcommands; uses shared `renderSchemaResult()` (modified)
- `src/commands/validate-schema.ts` — schema validation command handler + `runSchemaValidation()` + `renderSchemaResult()` (modified in review: extracted shared render helper, eliminated DRY violation)
- `src/commands/validate-self.ts` — extracted self-validation logic from old validate.ts
- `src/commands/__tests__/validate.test.ts` — updated for `validate self` subcommand (modified)
- `src/commands/__tests__/validate-schema.test.ts` — test file with 16 tests covering all ACs + non-WorkflowParseError edge case (modified in review)
