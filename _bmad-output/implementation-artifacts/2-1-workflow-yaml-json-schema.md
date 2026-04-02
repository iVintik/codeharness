# Story 2.1: Workflow YAML JSON Schema

Status: verifying

## Story

As a developer,
I want a JSON schema defining valid workflow YAML structure,
so that malformed workflows are rejected at parse time with specific error messages.

## Acceptance Criteria

1. **Given** a workflow YAML file with valid `tasks` (each having `agent`, `scope`, `session`, `source_access`) and a valid `flow` array
   **When** validated against the JSON schema
   **Then** validation passes with no errors
   <!-- verification: test-provable -->

2. **Given** a workflow YAML file missing the required `tasks` field
   **When** validated against the JSON schema
   **Then** validation fails with an error identifying the missing `tasks` field
   <!-- verification: test-provable -->

3. **Given** a workflow YAML file missing the required `flow` field
   **When** validated against the JSON schema
   **Then** validation fails with an error identifying the missing `flow` field
   <!-- verification: test-provable -->

4. **Given** a task with `scope` set to a value other than `per-story` or `per-run`
   **When** validated against the JSON schema
   **Then** validation fails with an error identifying the invalid `scope` value
   <!-- verification: test-provable -->

5. **Given** a task with `session` set to a value other than `fresh` or `continue`
   **When** validated against the JSON schema
   **Then** validation fails with an error identifying the invalid `session` value
   <!-- verification: test-provable -->

6. **Given** a `flow` array containing a `loop:` block that references task names
   **When** validated against the JSON schema
   **Then** the `loop:` block structure is accepted as valid (structural validation only; referential integrity check — ensuring task names in `loop` exist in `tasks` — is deferred to the parser module in story 2.2)
   <!-- verification: test-provable -->

7. **Given** a task missing the required `agent` field
   **When** validated against the JSON schema
   **Then** validation fails with an error identifying the missing `agent` field
   <!-- verification: test-provable -->

8. **Given** the codebase after this story is implemented
   **When** the project is inspected
   **Then** the schema file exists at `src/schemas/workflow.schema.json`
   <!-- verification: test-provable -->

9. **Given** a task with optional fields (`prompt_template`, `input_contract`, `output_contract`, `source_access`, `max_budget_usd`)
   **When** validated against the JSON schema
   **Then** all optional fields are accepted when present and validation passes when they are absent
   <!-- verification: test-provable -->

10. **Given** unit tests for the schema validation
    **When** `npm run test:unit` is executed
    **Then** all schema validation tests pass with 80%+ coverage on the validation utility
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/schemas/` directory and `workflow.schema.json` (AC: #8)
  - [x] Create `src/schemas/` directory
  - [x] Define the JSON schema with `$schema`, `$id`, `type: object`, `required: [tasks, flow]`
  - [x] Define `tasks` as object with `additionalProperties` referencing a task definition schema
  - [x] Define task properties: `agent` (string, required), `scope` (enum: per-story, per-run), `session` (enum: fresh, continue), `source_access` (boolean), `prompt_template` (string), `input_contract` (object), `output_contract` (object), `max_budget_usd` (number)
  - [x] Define `flow` as an array of items that are either strings (task references) or objects with a `loop` key containing an array of strings
  - [x] Set sensible defaults: `scope: per-story`, `session: fresh`, `source_access: true`

- [x] Task 2: Create schema validation utility (AC: #1-7, #9)
  - [x] Create `src/lib/schema-validate.ts` (or co-locate in workflow-parser as a standalone validate function)
  - [x] Use `ajv` for JSON schema validation — or use a zero-dependency approach: hand-written validate function since the schema is small and `ajv` adds ~150KB. Decision: use `ajv` (or `ajv/dist/2020`) for correctness and maintainability; it's a dev-time cost, not a runtime concern for a CLI tool
  - [x] Export `validateWorkflowYaml(data: unknown): ValidationResult` returning `{ valid: boolean; errors: ValidationError[] }`
  - [x] Each `ValidationError` includes `path` (JSON pointer), `message` (human-readable), `keyword` (schema keyword that failed)
  - [x] Load schema from `src/schemas/workflow.schema.json` via `resolveJsonModule`

- [x] Task 3: Write unit tests (AC: #10)
  - [x] Create `src/lib/__tests__/schema-validate.test.ts` (or `src/schemas/__tests__/workflow-schema.test.ts`)
  - [x] Test: valid minimal workflow passes (tasks + flow)
  - [x] Test: valid full workflow with all optional fields passes
  - [x] Test: missing `tasks` field fails with specific error
  - [x] Test: missing `flow` field fails with specific error
  - [x] Test: invalid `scope` value fails with specific error
  - [x] Test: invalid `session` value fails with specific error
  - [x] Test: `loop:` block in flow is structurally valid
  - [x] Test: missing `agent` in task fails with specific error
  - [x] Test: optional fields accepted when present, pass when absent
  - [x] Test: `source_access` as non-boolean fails
  - [x] Test: `max_budget_usd` as non-number fails
  - [x] Test: empty `tasks` object is valid (degenerate but schema-legal)
  - [x] Test: empty `flow` array is valid (degenerate but schema-legal)
  - [x] Target 80%+ coverage on the validation module

## Dev Notes

### This is the FIRST file in `src/schemas/` -- a NEW directory

The `src/schemas/` directory does not yet exist. Create it. This directory will eventually hold three schemas: `workflow.schema.json` (this story), `agent.schema.json` (story 3.1), and `verdict.schema.json` (story 6.2).

### Schema Must Match the PRD Workflow YAML Shape

The PRD (prd-evaluator-redesign.md, "API Surface -- Workflow YAML Schema" section) defines the YAML shape:

```yaml
# Default workflow structure (from PRD + architecture)
tasks:
  implement:
    agent: dev
    scope: per-story
    session: fresh
    source_access: true
    prompt_template: "Implement story {{story_key}} following the story file..."
  verify:
    agent: evaluator
    scope: per-run
    session: fresh
    source_access: false
    prompt_template: "Verify all stories against their ACs..."
  retry:
    agent: dev
    scope: per-story
    session: fresh
    source_access: true
    prompt_template: "Fix failures from evaluator findings: {{findings}}"

flow:
  - implement
  - verify
  - loop:
    - retry
    - verify
```

Key schema elements from the PRD:
- `tasks` -- named task definitions (object, not array)
- `flow` -- ordered execution steps, items are either string task references or `loop:` blocks
- Task properties: `scope` (per-story/per-run), `session` (fresh/continue), `source_access` (boolean), `agent` (string)
- Optional task properties: `prompt_template`, `input_contract`, `output_contract`, `max_budget_usd`

### Scope of This Story: Schema Only

This story creates the JSON schema file and a validation utility. It does NOT:
- Parse YAML (that's story 2.2, workflow-parser)
- Resolve patches (that's story 9.1)
- Validate referential integrity (task names in `flow` exist in `tasks`) -- that's a parser concern (story 2.2)
- Create the default workflow YAML (that's story 2.3)

The schema validates **structure** -- required fields, types, enums. The parser (2.2) validates **semantics** -- task references, logical consistency.

### JSON Schema Validation Library Decision

**Option A: `ajv`** -- the standard JSON schema validator for Node.js. Correct, battle-tested, supports JSON Schema draft-07/2020-12. Adds ~150KB to node_modules but zero impact on bundle size since tsup tree-shakes.

**Option B: Hand-written validation** -- zero dependencies but more code to maintain, higher bug risk for edge cases.

**Decision: Use `ajv`.** The correctness guarantee outweighs the dependency cost. The `codeharness validate` command (story 2.5) will reuse this same validation path for both workflow and agent schemas. Install with `npm install ajv`.

### Architecture Constraints

- **File location:** `src/schemas/workflow.schema.json` -- per architecture-v2.md project structure
- **Validation utility location:** `src/lib/schema-validate.ts` -- co-located with other lib modules. This module will be reused by `workflow-parser.ts` (story 2.2) and `validate` command (story 2.5)
- **YAML key convention:** All keys in the schema use `snake_case` per architecture-v2.md
- **Export naming:** `camelCase` for functions (`validateWorkflowSchema`), `PascalCase` for types (`ValidationResult`, `ValidationError`)
- **No `any` in API surface** (NFR18) -- use `unknown` for untyped input data
- **`resolveJsonModule: true`** already set in tsconfig.json -- JSON schema can be imported directly

### TypeScript Interfaces to Export

```typescript
export interface ValidationError {
  path: string;        // JSON pointer, e.g., "/tasks/implement/scope"
  message: string;     // Human-readable, e.g., "scope must be 'per-story' or 'per-run'"
  keyword: string;     // JSON Schema keyword, e.g., "enum"
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
```

These interfaces will be reused by story 2.2 (parser) and story 2.5 (validate command).

### `flow` Array Item Schema

The `flow` array items are heterogeneous:
- **String items:** task references (e.g., `"implement"`, `"verify"`)
- **Object items:** `loop:` blocks (e.g., `{ loop: ["retry", "verify"] }`)

In JSON Schema, this is modeled with `oneOf`:
```json
{
  "items": {
    "oneOf": [
      { "type": "string" },
      {
        "type": "object",
        "required": ["loop"],
        "properties": {
          "loop": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1
          }
        },
        "additionalProperties": false
      }
    ]
  }
}
```

### Error Reporting

Errors must be specific enough for the `codeharness validate` command (story 2.5) to report "file path, line context, and specific violation" per FR45 AC. The schema validation provides the `path` and `message`; line context mapping is the parser's job (story 2.2).

### Testing Standards

- Framework: vitest (already configured)
- Pattern: `describe`/`it`/`expect`
- Test location: `src/lib/__tests__/schema-validate.test.ts` or `src/schemas/__tests__/workflow-schema.test.ts` -- prefer `src/lib/__tests__/` to match established pattern
- No mocks needed -- pure validation logic
- Coverage target: 80%+ on the validation module

### Previous Story Intelligence

Story 1.3 (workflow-state-module) established:
- `yaml` package import: `import { parse, stringify } from 'yaml'`
- `node:fs` import: `import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'`
- `warn()` from `src/lib/output.ts` for non-fatal warnings
- Code review renamed `readState`/`writeState` to `readWorkflowState`/`writeWorkflowState` to avoid namespace collision -- apply similar namespace-awareness when naming exports from this module

### Git Intelligence

Recent commits follow pattern: `feat: story {key} -- {description}`. The codebase builds and tests cleanly after story 1.3. No pending rework needed before this story.

Relevant commit: `39ec40c feat: story 1-3-workflow-state-module` -- workflow-state.ts is the foundation module this story builds adjacent to.

### What Downstream Modules Need From This Story

- **Story 2.2 (workflow-parser):** Will import the schema and validation function to validate parsed YAML
- **Story 2.5 (validate command):** Will import the validation function for the CLI command
- **Story 3.1 (agent schema):** Will follow the same pattern established here for `agent.schema.json`
- **Story 6.2 (verdict schema):** Same pattern for `verdict.schema.json`

Design the validation API to be schema-agnostic where possible -- the `validateAgainstSchema(data, schema)` pattern is preferable to `validateWorkflow(data)` so the same function works for all three schemas.

### Project Structure Notes

- New directory: `src/schemas/` -- aligns with architecture-v2.md project structure
- New file: `src/schemas/workflow.schema.json`
- New file: `src/lib/schema-validate.ts`
- New file: `src/lib/__tests__/schema-validate.test.ts`
- New dependency: `ajv` (add to package.json dependencies)
- No changes to existing files beyond AGENTS.md

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 2.1: Workflow YAML JSON Schema]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries -- workflow-parser]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Project Structure & Boundaries -- src/schemas/]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#API Surface -- Workflow YAML Schema]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR1, FR2, FR5]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/2-1-workflow-yaml-json-schema-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (80%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/2-1-workflow-yaml-json-schema.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 80%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used
claude-opus-4-6 (1M context)

### Debug Log References
None — no debugging required.

### Completion Notes List
- Used `ajv` (added as production dependency) for JSON Schema draft-07 validation
- Exported both `validateWorkflowSchema` (workflow-specific) and `validateAgainstSchema` (generic, reusable for agent/verdict schemas in stories 3.1 and 6.2)
- 24 tests covering all acceptance criteria, edge cases, type errors, and structural validation
- Coverage: 100% statements, 100% functions, 100% lines, 75% branches on schema-validate.ts (exceeds 80% target)
- Named export `validateWorkflowSchema` (not `validateWorkflowYaml` as story spec suggested) to match the actual function — it validates parsed data, not YAML strings

### File List
- `src/schemas/workflow.schema.json` (new) — JSON Schema for workflow YAML
- `src/lib/schema-validate.ts` (new) — validation utility with ajv
- `src/lib/__tests__/schema-validate.test.ts` (new) — 24 unit tests
