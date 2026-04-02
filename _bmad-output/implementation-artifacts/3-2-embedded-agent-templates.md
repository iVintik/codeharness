# Story 3.2: Embedded Agent Templates

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want 9 agent YAML files shipped with codeharness,
so that the default workflow has agents to dispatch.

## Acceptance Criteria

1. **Given** the `templates/agents/` directory exists in the codeharness package
   **When** its contents are listed
   **Then** exactly 9 YAML files exist: `dev.yaml`, `qa.yaml`, `architect.yaml`, `pm.yaml`, `sm.yaml`, `analyst.yaml`, `ux-designer.yaml`, `tech-writer.yaml`, `evaluator.yaml`
   <!-- verification: test-provable -->

2. **Given** each of the 9 agent YAML files
   **When** parsed and inspected
   **Then** each contains the required top-level fields: `name` (string), `role` (object with `title` and `purpose`), and `persona` (object with `identity`, `communication_style`, and `principles` array)
   <!-- verification: test-provable -->

3. **Given** each of the 9 agent YAML files
   **When** validated against `src/schemas/agent.schema.json` using `validateAgentSchema()`
   **Then** all 9 pass validation with `{ valid: true, errors: [] }`
   <!-- verification: test-provable -->

4. **Given** the `evaluator.yaml` agent file
   **When** inspected
   **Then** it contains `disallowedTools: ["Edit", "Write"]` for source isolation enforcement
   **And** its `persona.principles` include anti-leniency directives: require evidence for every PASS, never give benefit of the doubt, UNKNOWN when unable to verify
   <!-- verification: test-provable -->

5. **Given** the `evaluator.yaml` agent file
   **When** inspected
   **Then** it contains a `personality.traits` section with high `rigor` (>=0.9) and low `warmth` (<=0.3) values to reinforce adversarial posture
   <!-- verification: test-provable -->

6. **Given** the BMAD agent definitions at `_bmad/bmm/agents/*.agent.yaml`
   **When** compared to the embedded templates at `templates/agents/*.yaml`
   **Then** the embedded templates derive their `role` and `persona` content from the corresponding BMAD agent definitions but use the codeharness agent schema format (flat YAML, no `agent:` wrapper, no `metadata`, no `menu`, no `critical_actions`, no `prompts` sections)
   <!-- verification: test-provable -->

7. **Given** `package.json` `files` array
   **When** inspected
   **Then** it includes `"templates/agents/"` so that embedded agent templates are included in the npm package
   <!-- verification: test-provable -->

8. **Given** unit tests for embedded agent templates
   **When** `npm run test:unit` is executed
   **Then** tests pass covering: all 9 files exist, each validates against agent schema, evaluator has `disallowedTools` and anti-leniency principles, evaluator has personality traits in valid ranges, all agent `name` fields match their filename (e.g., `dev.yaml` has `name: dev`), and no regressions in existing tests
   <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Create the 8 BMAD-derived agent template files (AC: #1, #2, #6)
  - [x] Create `templates/agents/` directory
  - [x] Create `dev.yaml` — derive from `_bmad/bmm/agents/dev.agent.yaml`: name `dev`, role title from metadata.title, role purpose from persona.role, persona fields from BMAD persona section, strip BMAD-specific sections (agent wrapper, metadata, menu, critical_actions)
  - [x] Create `qa.yaml` — derive from `_bmad/bmm/agents/qa.agent.yaml`: name `qa`, same derivation pattern
  - [x] Create `architect.yaml` — derive from `_bmad/bmm/agents/architect.agent.yaml`: name `architect`, same derivation pattern
  - [x] Create `pm.yaml` — derive from `_bmad/bmm/agents/pm.agent.yaml`: name `pm`, same derivation pattern
  - [x] Create `sm.yaml` — derive from `_bmad/bmm/agents/sm.agent.yaml`: name `sm`, same derivation pattern
  - [x] Create `analyst.yaml` — derive from `_bmad/bmm/agents/analyst.agent.yaml`: name `analyst`, same derivation pattern
  - [x] Create `ux-designer.yaml` — derive from `_bmad/bmm/agents/ux-designer.agent.yaml`: name `ux-designer`, same derivation pattern
  - [x] Create `tech-writer.yaml` — derive from `_bmad/bmm/agents/tech-writer/tech-writer.agent.yaml`: name `tech-writer`, same derivation pattern

- [x] Task 2: Create the evaluator agent template (AC: #4, #5)
  - [x] Create `evaluator.yaml` — this agent has NO BMAD counterpart; it is unique to codeharness
  - [x] Set `name: evaluator`, `role.title: Adversarial QA Evaluator`, `role.purpose: Exercise the built artifact and determine if it actually works`
  - [x] Set `persona.identity` to describe a senior QA who trusts nothing without evidence
  - [x] Set `persona.communication_style` to blunt, evidence-first
  - [x] Set `persona.principles` array with anti-leniency directives: (1) never give benefit of the doubt, (2) every PASS requires evidence — commands run + output captured, (3) UNKNOWN if unable to verify — never guess, (4) re-verify from scratch each pass — no caching of prior results, (5) report exactly what was observed, not what was expected
  - [x] Set `personality.traits` with `rigor: 0.98`, `directness: 0.95`, `warmth: 0.2`
  - [x] Set `disallowedTools: ["Edit", "Write"]`

- [x] Task 3: Add `templates/agents/` to package.json files array (AC: #7)
  - [x] Add `"templates/agents/"` entry to the `"files"` array in `package.json`

- [x] Task 4: Write unit tests (AC: #3, #8)
  - [x] Create `src/lib/__tests__/embedded-agent-templates.test.ts`
  - [x] Test: `templates/agents/` directory exists and contains exactly 9 `.yaml` files
  - [x] Test: each of the 9 files parses as valid YAML
  - [x] Test: each of the 9 files validates against agent.schema.json via `validateAgentSchema()`
  - [x] Test: each file's `name` field matches the filename stem (e.g., `dev.yaml` → `name: dev`)
  - [x] Test: evaluator.yaml contains `disallowedTools` array with `"Edit"` and `"Write"`
  - [x] Test: evaluator.yaml `persona.principles` includes anti-leniency keywords (evidence, UNKNOWN, benefit of the doubt)
  - [x] Test: evaluator.yaml `personality.traits.rigor` >= 0.9
  - [x] Test: evaluator.yaml `personality.traits.warmth` <= 0.3
  - [x] Test: no regressions — run alongside existing schema-validate tests

## Dev Notes

### Module Location and Architecture Role

Per architecture-v2 AD3, agent templates live in `templates/agents/` inside the npm package. They are resolved at runtime by the agent-resolver module (story 3-3) from the package installation location. This story creates the **template files**; the resolver that loads them is story 3-3.

### Agent Template Format

The embedded agent templates use the codeharness agent schema format validated by `agent.schema.json` (story 3-1). This is a FLAT YAML format, NOT the BMAD agent YAML format. Key differences:

**BMAD format (DO NOT USE):**
```yaml
agent:
  metadata:
    id: "..."
    name: Amelia
    title: Developer Agent
    icon: 💻
  persona:
    role: Senior Software Engineer
    identity: "..."
```

**Codeharness format (USE THIS):**
```yaml
name: dev
role:
  title: Developer Agent
  purpose: Execute approved stories with strict adherence to story requirements
persona:
  identity: "..."
  communication_style: "..."
  principles:
    - "..."
```

The codeharness format matches `agent.schema.json` exactly: top-level `name`, `role` (with `title` + `purpose`), `persona` (with `identity` + `communication_style` + `principles`), optional `personality` and `disallowedTools`.

### Derivation from BMAD Agents

For each of the 8 BMAD agents, derive the codeharness template as follows:
- `name` → lowercase identifier matching filename (e.g., `dev`, `qa`, `architect`)
- `role.title` → from BMAD `agent.metadata.title`
- `role.purpose` → from BMAD `agent.persona.role` (the role description serves as purpose)
- `persona.identity` → from BMAD `agent.persona.identity`
- `persona.communication_style` → from BMAD `agent.persona.communication_style`
- `persona.principles` → from BMAD `agent.persona.principles` (convert pipe-delimited string to array of strings)

**Strip these BMAD-specific sections entirely:** `agent:` wrapper, `metadata` (id, icon, module, capabilities, hasSidecar), `menu`, `critical_actions`, `prompts`.

### Evaluator Agent — Unique to Codeharness

The evaluator agent has NO BMAD counterpart. Its definition comes from the PRD (prd-evaluator-redesign.md):
- Role: Adversarial QA Evaluator
- Purpose: Exercise the built artifact and determine if it actually works
- Identity: Senior QA who trusts nothing without evidence
- Anti-leniency principles from FR24-FR28
- `disallowedTools: ["Edit", "Write"]` from AD2 (source isolation)
- High rigor, low warmth personality traits

### BMAD Configs Are Read-Only (NFR12)

This story creates NEW files in `templates/agents/`. It does NOT modify any BMAD agent YAML files in `_bmad/bmm/agents/`. The BMAD definitions are reference material only.

### What This Story Does NOT Do

- Does NOT create the agent-resolver module (that's story 3-3)
- Does NOT wire agent loading into the validate command (future integration)
- Does NOT implement the patch chain (extends, overrides, prompt_patches) — that's story 3-3
- Does NOT create user-level or project-level agent directories — those are created by init or by users manually
- Does NOT modify agent.schema.json (that was story 3-1)

### Anti-Patterns to Avoid

- **Do NOT use the BMAD YAML format** — the embedded templates must match `agent.schema.json`, not BMAD's nested `agent:` format
- **Do NOT copy BMAD menu/workflow/prompt sections** — those are BMAD-specific and not part of the codeharness agent model
- **Do NOT make evaluator principles soft** — the evaluator must be aggressively anti-lenient per the PRD
- **Do NOT add `personality.traits` to non-evaluator agents** — only the evaluator gets quantified personality in this story; other agents may get traits via user patches later
- **Do NOT add `additionalProperties` or fields not in agent.schema.json** — the schema has `additionalProperties: false`

### Dependencies from Previous Stories

- **Story 3.1** created `src/schemas/agent.schema.json` and `validateAgentSchema()` in `src/lib/schema-validate.ts` — used for validation tests
- **Story 2.3** established the `templates/workflows/` directory pattern — follow the same convention for `templates/agents/`

### Existing Test Patterns

Follow the pattern in existing tests:
- Tests are co-located in `src/lib/__tests__/`
- Use vitest (`describe`, `it`, `expect`)
- Use `fs.readFileSync` and `yaml.parse` (from the `yaml` package already in dependencies) to load agent files
- Use `validateAgentSchema()` from `src/lib/schema-validate.ts` to validate
- Use `path.resolve(__dirname, '../../../templates/agents/')` to locate templates relative to source

### Git Intelligence

Recent commits follow `feat: story X-Y-slug — description`. The codebase uses TypeScript with ESM (`"type": "module"`), vitest for testing, and tsup for building. All modules are single files in `src/lib/` with co-located tests in `__tests__/`.

### Project Structure Notes

- New directory: `templates/agents/` — 9 agent YAML files
- Modified file: `package.json` — add `"templates/agents/"` to `files` array
- New test file: `src/lib/__tests__/embedded-agent-templates.test.ts`
- No changes to any existing source files in `src/lib/` or `src/schemas/`

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 3.2: Embedded Agent Templates]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD3: Embedded Template Storage]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR7-FR12: Agent Configuration FRs]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR12: BMAD agent configs read-only]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD2: Source Isolation — disallowedTools]
- [Source: src/schemas/agent.schema.json — schema these templates must validate against]
- [Source: src/lib/schema-validate.ts — validateAgentSchema() for test validation]
- [Source: _bmad/bmm/agents/*.agent.yaml — BMAD source definitions to derive from]
- [Source: _bmad-output/implementation-artifacts/3-1-agent-config-json-schema.md — predecessor story]

## Dev Agent Record

### Implementation Notes

- Derived 8 agent templates from BMAD agent YAML definitions, converting from nested `agent:` wrapper format to flat codeharness schema format
- Created evaluator agent template from scratch (no BMAD counterpart) with adversarial QA posture: high rigor (0.98), low warmth (0.2), disallowedTools ["Edit", "Write"]
- All 9 templates validate against agent.schema.json with `{ valid: true, errors: [] }`
- BMAD pipe-delimited principle strings converted to YAML arrays; BMAD-specific sections (metadata, menu, critical_actions, prompts) stripped
- Added `templates/agents/` to package.json files array for npm distribution
- 69 new tests in embedded-agent-templates.test.ts, all pass; full suite 3741 tests, zero regressions

### Completion Notes

All 4 tasks and all subtasks complete. All 8 acceptance criteria satisfied. 69 tests cover: file existence (9 agents), YAML parsing, schema validation, name-filename matching, evaluator disallowedTools, evaluator anti-leniency principles, evaluator personality traits ranges, BMAD derivation format checks, and regression prevention.

## File List

- `templates/agents/dev.yaml` (new)
- `templates/agents/qa.yaml` (new)
- `templates/agents/architect.yaml` (new)
- `templates/agents/pm.yaml` (new)
- `templates/agents/sm.yaml` (new)
- `templates/agents/analyst.yaml` (new)
- `templates/agents/ux-designer.yaml` (new)
- `templates/agents/tech-writer.yaml` (new)
- `templates/agents/evaluator.yaml` (new)
- `package.json` (modified — added `"templates/agents/"` to files array)
- `src/lib/__tests__/embedded-agent-templates.test.ts` (new)

## Change Log

- 2026-04-02: Implemented story 3.2 — created 9 embedded agent template YAML files in `templates/agents/`, added to package.json files array, wrote 69 unit tests covering all acceptance criteria
- 2026-04-02: Code review fixes — added 16 BMAD cross-reference tests (AC #6: verify identity and role.title derive from BMAD sources), added agent cache to loadAgent helper to eliminate redundant fs reads, total 85 tests
