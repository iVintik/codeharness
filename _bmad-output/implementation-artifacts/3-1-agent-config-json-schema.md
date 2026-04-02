# Story 3.1: Agent Config JSON Schema

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a JSON schema defining valid agent configuration,
so that malformed agent configs are caught before dispatch.

## Acceptance Criteria

1. **Given** `src/schemas/agent.schema.json` exists
   **When** inspected
   **Then** the schema requires `name` (string), `role` (object with `title` and `purpose` strings), and `persona` (object with `identity` string, `communication_style` string, and `principles` array of strings) as required fields
   <!-- verification: test-provable -->

2. **Given** an agent YAML file with all required fields (name, role, persona)
   **When** validated against the agent schema
   **Then** validation passes with `{ valid: true, errors: [] }`
   <!-- verification: test-provable -->

3. **Given** an agent YAML file missing a required field (e.g., no `role`)
   **When** validated against the agent schema
   **Then** validation fails with errors identifying the missing required property by path
   <!-- verification: test-provable -->

4. **Given** an agent YAML file with `personality.traits` where a trait value is outside 0-1 range (e.g., `rigor: 1.5`)
   **When** validated against the agent schema
   **Then** validation fails with an error identifying the out-of-range trait and its path
   <!-- verification: test-provable -->

5. **Given** an agent YAML file with `personality.traits` where all values are within 0-1 range
   **When** validated against the agent schema
   **Then** validation passes (personality is optional; when present, traits are validated)
   <!-- verification: test-provable -->

6. **Given** a `validateAgentSchema()` function exported from `src/lib/schema-validate.ts`
   **When** called with valid agent config data
   **Then** it returns `ValidationResult` with `{ valid: true, errors: [] }` using the same `validateAgainstSchema()` pattern as `validateWorkflowSchema()`
   <!-- verification: test-provable -->

7. **Given** the `codeharness validate` command (story 2-5)
   **When** agent YAML files exist in `.codeharness/agents/` or `templates/agents/`
   **Then** the validate command can validate agent files against `agent.schema.json` (integration point — actual command wiring is story 3-2 or later; this story only ensures the schema + validation function are available)
   <!-- verification: test-provable -->

8. **Given** unit tests for agent schema validation
   **When** `npm run test:unit` is executed
   **Then** tests pass covering: valid agent passes, missing required fields fail, traits outside 0-1 rejected, optional `personality` section accepted when present and valid, optional `disallowedTools` array accepted, unknown top-level properties rejected, and no regressions in existing schema-validate tests
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create the agent JSON schema (AC: #1, #4, #5)
  - [x] Create `src/schemas/agent.schema.json` following the same JSON Schema draft-07 pattern as `workflow.schema.json`
  - [x] Define required properties: `name`, `role` (with `title`, `purpose`), `persona` (with `identity`, `communication_style`, `principles`)
  - [x] Define optional `personality` section with `traits` object where each value is a number constrained to 0-1 via `minimum: 0, maximum: 1`
  - [x] Define optional `disallowedTools` as an array of strings (needed for evaluator agent)
  - [x] Set `additionalProperties: false` at top level to reject unknown fields

- [x] Task 2: Add agent schema validation function (AC: #6, #7)
  - [x] Import agent schema in `src/lib/schema-validate.ts`
  - [x] Compile the agent schema with Ajv (same pattern as workflow schema)
  - [x] Export `validateAgentSchema(data: unknown): ValidationResult` that delegates to `validateAgainstSchema()`
  - [x] Ensure the existing `validateWorkflowSchema()` and `validateAgainstSchema()` remain unchanged

- [x] Task 3: Write unit tests (AC: #2, #3, #4, #5, #8)
  - [x] Create `src/lib/__tests__/schema-validate-agent.test.ts` (or extend existing `schema-validate.test.ts`)
  - [x] Test: valid agent config with all required fields passes
  - [x] Test: valid agent config with optional `personality.traits` in 0-1 range passes
  - [x] Test: missing `name` field fails
  - [x] Test: missing `role` field fails
  - [x] Test: missing `persona` field fails
  - [x] Test: `personality.traits.rigor: 1.5` fails (above 1)
  - [x] Test: `personality.traits.warmth: -0.1` fails (below 0)
  - [x] Test: valid `disallowedTools: ["Edit", "Write"]` passes
  - [x] Test: unknown top-level property rejected
  - [x] Test: existing workflow schema validation still works (no regressions)

## Dev Notes

### Module Location and Architecture Role

Per architecture-v2 AD1, `agent-resolver` resolves agent config through patch chain and compiles to SDK inline subagent definition (FR7-12). This story creates the **schema** that `agent-resolver` (story 3-3) will use for validation. The schema lives at `src/schemas/agent.schema.json` alongside the existing `workflow.schema.json`.

The validation function lives in `src/lib/schema-validate.ts` — the module already has a generic `validateAgainstSchema()` helper and a workflow-specific `validateWorkflowSchema()`. Add `validateAgentSchema()` following the exact same pattern.

### Agent Config Shape (from PRD and Architecture)

The canonical agent config format from prd-evaluator-redesign.md:

```yaml
name: evaluator
role:
  title: Adversarial QA Evaluator
  purpose: Exercise the built artifact and determine if it actually works
persona:
  identity: Senior QA who trusts nothing without evidence
  communication_style: Blunt, evidence-first
  principles:
    - Never give the benefit of the doubt
    - Every PASS requires evidence
# Optional: quantified personality
personality:
  traits:
    rigor: 0.98
    directness: 0.95
    warmth: 0.2
```

**Required fields:**
- `name` (string) — agent identifier
- `role.title` (string) — agent's role title
- `role.purpose` (string) — what this agent does
- `persona.identity` (string) — who this agent is
- `persona.communication_style` (string) — how it communicates
- `persona.principles` (array of strings) — behavioral principles

**Optional fields:**
- `personality.traits` — object with string keys and number values constrained to 0-1 range (PersonaNexus-compatible, FR10)
- `disallowedTools` — array of strings (used by evaluator agent for source isolation, per AD2)

### JSON Schema Pattern to Follow

Follow the existing `workflow.schema.json` pattern exactly:
- `"$schema": "http://json-schema.org/draft-07/schema#"`
- `"$id": "https://codeharness.dev/schemas/agent.schema.json"`
- Use `definitions` for reusable sub-schemas if needed
- `additionalProperties: false` at all object levels

### Trait Validation Detail

PersonaNexus traits are an `additionalProperties` object where each value must be `{ "type": "number", "minimum": 0, "maximum": 1 }`. The trait names are not fixed — any string key is allowed as long as the value is 0-1. Use `additionalProperties` with a number schema inside the `traits` object.

### What This Story Does NOT Do

- Does NOT create agent YAML files (that's story 3-2)
- Does NOT implement the agent resolver module (that's story 3-3)
- Does NOT wire agent validation into the `validate` command (future integration — this story only provides the schema + validation function)
- Does NOT implement patch resolution (extends, overrides, prompt_patches) — that's the resolver in story 3-3
- Does NOT add `templates/agents/` to `package.json` `files` array (that's story 3-2)

### Anti-Patterns to Avoid

- **Do NOT create a separate Ajv instance** — reuse the existing one in `schema-validate.ts`
- **Do NOT put schema validation logic in a new file** — extend `schema-validate.ts`
- **Do NOT define trait names as an enum** — PersonaNexus traits are open-ended (any 0-1 number)
- **Do NOT make `personality` required** — it's optional per FR10 ("optional PersonaNexus-compatible traits")
- **Do NOT modify `workflow.schema.json`** — this story only adds agent schema

### Dependencies from Previous Stories

- **Story 2.1** established the `src/schemas/` directory and `workflow.schema.json` — same directory for `agent.schema.json`
- **Story 2.1** established the `schema-validate.ts` module with `validateAgainstSchema()` — the generic helper to reuse
- **Story 2.5** established the `validate` command with subcommand structure — future stories will wire agent validation into it

### Existing Test Patterns

Follow the pattern in existing tests:
- Tests are co-located in `src/lib/__tests__/`
- Use vitest (`describe`, `it`, `expect`)
- Test both valid and invalid inputs
- Assert on specific error paths and messages from `ValidationResult`

### Git Intelligence

Recent commits follow `feat: story X-Y-slug — description`. The codebase uses TypeScript with ESM (`"type": "module"`), vitest for testing, and tsup for building. All modules are single files in `src/lib/` with co-located tests in `__tests__/`.

### Project Structure Notes

- New file: `src/schemas/agent.schema.json` — the agent configuration JSON schema
- Modified file: `src/lib/schema-validate.ts` — add `validateAgentSchema()` export
- New test file: `src/lib/__tests__/schema-validate-agent.test.ts` (or extend existing test file)
- No changes to any other existing files

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 3.1: Agent Config JSON Schema]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — agent-resolver module]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD3: Embedded Template Storage — templates/agents/]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#Agent Configuration Format — canonical YAML shape]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR7-FR12 — Agent Configuration FRs]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR2 — Agent config resolution <200ms]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR12 — BMAD agent configs read-only]
- [Source: src/schemas/workflow.schema.json — pattern to follow for JSON schema structure]
- [Source: src/lib/schema-validate.ts — existing validation module to extend]
- [Source: _bmad-output/implementation-artifacts/2-5-validate-command.md — validate command structure for future integration]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/3-1-agent-config-json-schema-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/3-1-agent-config-json-schema.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- All 3 tasks completed: schema, validation function, tests
- 29 new agent schema tests pass, 28 existing workflow schema tests unaffected
- Full test suite: 3662 tests pass across 148 files

### Code Review Notes (Adversarial)

- **Fixed**: Schema accepted empty strings for all fields — added `minLength: 1` to `name`, `role.title`, `role.purpose`, `persona.identity`, `persona.communication_style`, and principles items
- **Fixed**: Schema accepted empty `principles` array — added `minItems: 1`
- **Fixed**: Schema accepted `personality: {}` without `traits` key — made `traits` required inside `personality`
- **Fixed**: Missing tests for empty string rejection, empty collection rejection, `personality` without `traits`, and non-string `disallowedTools` items
- Post-review: 39 agent schema tests pass (was 29), 28 workflow schema tests unaffected
- Coverage: 96.65% overall, all 152 files above 80% floor, `schema-validate.ts` at 100%

### File List

- `src/schemas/agent.schema.json` — new agent configuration JSON schema
- `src/lib/schema-validate.ts` — added `validateAgentSchema()` export
- `src/lib/__tests__/schema-validate-agent.test.ts` — new test file with 29 tests
