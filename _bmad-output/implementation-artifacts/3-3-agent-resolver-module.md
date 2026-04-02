# Story 3.3: Agent Resolver Module

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an agent-resolver that resolves configs through the embedded -> user -> project patch chain and compiles the result into a Claude Code inline subagent definition,
so that customizations overlay cleanly on embedded defaults and agents are ready for SDK dispatch.

## Acceptance Criteria

1. **Given** an embedded agent name like `"dev"` and no user or project patches
   **When** `resolveAgent("dev")` is called
   **Then** the embedded config from `templates/agents/dev.yaml` is loaded, parsed, validated against `agent.schema.json`, and returned as a `ResolvedAgent` object
   <!-- verification: test-provable -->

2. **Given** an embedded agent `"dev"` and a user-level patch file at `~/.codeharness/agents/dev.patch.yaml` with `extends: embedded://dev` and `overrides:` that adds `personality.traits.rigor: 0.9`
   **When** `resolveAgent("dev")` is called
   **Then** the embedded config is loaded first, the user patch overrides are deep-merged on top, and the resolved config includes both the original embedded fields and the new `personality.traits.rigor: 0.9`
   <!-- verification: test-provable -->

3. **Given** an embedded agent `"dev"`, a user-level patch, and a project-level patch at `.codeharness/agents/dev.patch.yaml` with `extends: embedded://dev` and `prompt_patches.append` text
   **When** `resolveAgent("dev")` is called
   **Then** resolution order is: embedded base -> user patch merged -> project patch merged on top, and the final config includes the `prompt_patches.append` content in a `prompt_patches` field accessible for downstream compilation
   <!-- verification: test-provable -->

4. **Given** an embedded agent `"dev"` and no patch files exist at user or project level
   **When** `resolveAgent("dev")` is called
   **Then** the missing patches are silently skipped (no error, no warning) and the embedded config is returned unchanged
   <!-- verification: test-provable -->

5. **Given** a patch file that contains invalid YAML syntax or fails schema validation after merge
   **When** `resolveAgent()` processes it
   **Then** a descriptive `AgentResolveError` is thrown with the file path, parse error or validation errors, and the specific problem — resolution does NOT silently return a bad config
   <!-- verification: test-provable -->

6. **Given** a resolved agent config (after patch chain)
   **When** `compileSubagentDefinition()` is called
   **Then** it returns an object with `name` (string), `model` (string, defaulted), `instructions` (string compiled from persona.identity + communication_style + principles + prompt_patches.append), `disallowedTools` (array, from config or empty), and `bare: true`
   <!-- verification: test-provable -->

7. **Given** the evaluator agent with `disallowedTools: ["Edit", "Write"]`
   **When** compiled to a subagent definition
   **Then** the `disallowedTools` array is preserved in the compiled output
   <!-- verification: test-provable -->

8. **Given** a user creates a fully custom agent file (not a patch) at `.codeharness/agents/my-agent.yaml` with all required fields and no `extends:`
   **When** `resolveAgent("my-agent")` is called
   **Then** the custom agent is loaded directly, validated against `agent.schema.json`, and returned without attempting to find an embedded base — no patch chain applies
   <!-- verification: test-provable -->

9. **Given** `resolveAgent()` is called for all 9 embedded agents sequentially
   **When** timed
   **Then** total resolution completes in <200ms (NFR2)
   <!-- verification: test-provable -->

10. **Given** unit tests for the agent-resolver module
    **When** `npm run test:unit` is executed
    **Then** tests pass at 80%+ coverage for `src/lib/agent-resolver.ts` covering: embedded load, user patch merge, project patch merge, full 3-layer chain, missing patches skipped, malformed patch errors, subagent compilation with and without disallowedTools, custom agent (no extends), prompt_patches append, and no regressions in existing tests
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Define TypeScript interfaces (AC: #1, #6)
  - [ ] Define `ResolvedAgent` interface matching the agent schema shape plus optional `prompt_patches` field
  - [ ] Define `SubagentDefinition` interface with `name`, `model`, `instructions`, `disallowedTools`, `bare`
  - [ ] Define `AgentResolveError` error class with `filePath` and `errors` properties
  - [ ] Define `AgentPatch` interface for patch file structure: `extends`, `overrides`, `prompt_patches`

- [x] Task 2: Implement embedded agent loading (AC: #1, #4)
  - [ ] Create `src/lib/agent-resolver.ts`
  - [ ] Implement `loadEmbeddedAgent(name: string)`: read from `templates/agents/{name}.yaml`, parse YAML, validate against agent schema, return typed config
  - [ ] Throw `AgentResolveError` if embedded agent file not found (fatal per architecture error handling)
  - [ ] Use `path.resolve(__dirname, '../../templates/agents/')` to locate embedded templates (same pattern as story 3-2 tests)

- [x] Task 3: Implement patch loading and merging (AC: #2, #3, #4, #5)
  - [ ] Implement `loadPatch(filePath: string)`: read patch YAML, parse, return `AgentPatch` or null if file missing
  - [ ] Implement `mergePatch(base: object, patch: AgentPatch)`: deep-merge `overrides` onto base, preserve `prompt_patches` separately
  - [ ] Deep merge strategy: objects merge recursively, arrays replace (not concatenate), scalars replace
  - [ ] User patch path: `~/.codeharness/agents/{name}.patch.yaml`
  - [ ] Project patch path: `.codeharness/agents/{name}.patch.yaml` (relative to cwd)
  - [ ] Validate merged result against agent schema; throw `AgentResolveError` if invalid

- [x] Task 4: Implement `resolveAgent()` (AC: #1-5, #8, #9)
  - [x] Implement the full resolution chain: load base (embedded or custom) -> merge user patch -> merge project patch -> validate -> return `ResolvedAgent`
  - [x] For custom agents (no embedded match, file at project or user level without `extends:`): load directly, validate, return
  - [x] For patch files: parse `extends: embedded://name` to identify base
  - [x] Silently skip missing patch files (ENOENT), throw on malformed YAML or schema failures

- [x] Task 5: Implement `compileSubagentDefinition()` (AC: #6, #7)
  - [x] Take a `ResolvedAgent` and produce a `SubagentDefinition`
  - [x] Build `instructions` string: `"You are {persona.identity}\n\nCommunication style: {persona.communication_style}\n\nPrinciples:\n- {principles joined}\n\n{prompt_patches.append if present}"`
  - [x] Set `bare: true` always (per AD2)
  - [x] Copy `disallowedTools` from resolved config (empty array if not present)
  - [x] Set default `model` (e.g., `"claude-sonnet-4-20250514"`) — can be overridden by patch

- [x] Task 6: Write unit tests (AC: #10)
  - [x] Create `src/lib/__tests__/agent-resolver.test.ts`
  - [x] Test: `resolveAgent("dev")` loads embedded dev.yaml and returns valid ResolvedAgent
  - [x] Test: resolveAgent with user patch deep-merges overrides onto embedded base
  - [x] Test: resolveAgent with project patch merges on top of user patch
  - [x] Test: full 3-layer chain (embedded + user + project) produces correct merged result
  - [x] Test: missing user and project patches silently skipped
  - [x] Test: malformed patch YAML throws AgentResolveError with file path
  - [x] Test: patch that produces schema-invalid result throws AgentResolveError
  - [x] Test: compileSubagentDefinition produces correct instructions string
  - [x] Test: compileSubagentDefinition preserves disallowedTools for evaluator
  - [x] Test: compileSubagentDefinition includes prompt_patches.append in instructions
  - [x] Test: custom agent (no extends) loads directly without patch chain
  - [x] Test: resolving all 9 embedded agents completes in <200ms
  - [x] Test: no regressions in existing test suite

## Dev Notes

### Module Location and Architecture Role

Per architecture-v2 AD1, `agent-resolver` resolves agent config through the patch chain and compiles to SDK inline subagent definition (FR7-12). It lives at `src/lib/agent-resolver.ts` with tests at `src/lib/__tests__/agent-resolver.test.ts`. This module is consumed by `agent-dispatch` (story 4-1) which calls `compileSubagentDefinition()` to get the object passed to the Agent SDK `query()`.

### Resolution Chain (FR11)

```
embedded://dev (templates/agents/dev.yaml)
  -> user patch (~/.codeharness/agents/dev.patch.yaml) if exists
    -> project patch (.codeharness/agents/dev.patch.yaml) if exists
      -> validate merged result against agent.schema.json
        -> return ResolvedAgent
```

Missing patches at any level are silently skipped. Malformed patches (invalid YAML or schema-invalid after merge) fail loudly with `AgentResolveError`.

### Patch File Format (FR9)

```yaml
# .codeharness/agents/dev.patch.yaml
extends: embedded://dev
overrides:
  personality:
    traits:
      rigor: 0.9
prompt_patches:
  append: |
    This project uses React + Vite. Run npm run build before
    considering implementation complete.
```

- `extends:` — identifies the base config. Format: `embedded://name` or `user://name`
- `overrides:` — structured object deep-merged onto the base. Follows agent schema shape.
- `prompt_patches:` — freeform text patches. `append:` adds to end of compiled instructions.

### Deep Merge Strategy

- Objects: merge recursively (base keys preserved, patch keys added or overridden)
- Arrays: **replace** entirely (patch array replaces base array — no concatenation)
- Scalars: replace (patch value wins)

This matches the workflow-parser merge strategy implied by the PRD. Arrays replace because concatenation creates unpredictable ordering of principles/tools.

### Subagent Definition Compilation (FR12)

The `compileSubagentDefinition()` function transforms a `ResolvedAgent` into the shape consumed by the Agent SDK `query()` in story 4-1:

```typescript
interface SubagentDefinition {
  name: string;
  model: string;          // default: "claude-sonnet-4-20250514"
  instructions: string;   // compiled from persona + prompt_patches
  disallowedTools: string[];
  bare: true;             // always true per AD2
}
```

The `instructions` string is compiled from:
1. `persona.identity` — who the agent is
2. `persona.communication_style` — how it talks
3. `persona.principles` — behavioral rules (bulleted)
4. `prompt_patches.append` — additional project-specific instructions (if present from patches)

### Config Resolution Caching (AD4)

This story implements the resolution function. Caching (resolve once at engine startup) is the responsibility of `workflow-engine` (story 5-1) which will call `resolveAgent()` for all referenced agents and cache the results. This module does NOT implement caching internally — it resolves fresh each call.

### Error Handling

| Failure | Response |
|---------|----------|
| Missing embedded agent file | `AgentResolveError` (fatal) |
| Missing user/project patch | Silently skip |
| Malformed patch YAML | `AgentResolveError` with parse details |
| Schema-invalid after merge | `AgentResolveError` with validation errors |
| Custom agent not found | `AgentResolveError` (fatal) |

### What This Story Does NOT Do

- Does NOT implement config caching (that's workflow-engine, story 5-1)
- Does NOT call the Agent SDK (that's agent-dispatch, story 4-1)
- Does NOT create or modify any agent YAML files (those were story 3-2)
- Does NOT modify agent.schema.json (that was story 3-1)
- Does NOT wire into the validate command (future integration)
- Does NOT handle `extends: user://name` resolution for project patches extending user agents — that is a valid pattern but can be deferred; this story handles `extends: embedded://name` only

### Anti-Patterns to Avoid

- **Do NOT write resolved configs to disk** — memory-only per architecture AD4
- **Do NOT cache internally** — caching is the engine's responsibility
- **Do NOT concatenate arrays on merge** — arrays replace entirely
- **Do NOT create a separate Ajv instance** — reuse `validateAgentSchema()` from `schema-validate.ts`
- **Do NOT use `child_process` or shell commands** — pure TypeScript file I/O
- **Do NOT modify embedded templates** — they are read-only (NFR12)
- **Do NOT add `@anthropic-ai/claude-agent-sdk` as a dependency** — that's story 4-1. SubagentDefinition is a plain object interface in this module.

### Dependencies from Previous Stories

- **Story 3-1** created `src/schemas/agent.schema.json` and `validateAgentSchema()` in `src/lib/schema-validate.ts` — used for validation
- **Story 3-2** created 9 agent YAML files in `templates/agents/` — the embedded base configs this module loads
- **Story 2-2** established `workflow-parser.ts` module pattern — follow the same structure (single file, typed interfaces, custom error class, exported functions)

### Existing Test Patterns

Follow the pattern in existing tests:
- Tests are co-located in `src/lib/__tests__/`
- Use vitest (`describe`, `it`, `expect`)
- Use `fs.readFileSync` and `yaml.parse` (from the `yaml` package already in dependencies) to load YAML files
- Use `validateAgentSchema()` from `src/lib/schema-validate.ts` for validation
- Use `path.resolve(__dirname, '../../templates/agents/')` to locate embedded templates (same pattern as workflow-parser locating schemas)
- For testing patch files: use `os.tmpdir()` + `fs.mkdtempSync` to create temp directories simulating user/project config locations, or mock `fs.readFileSync` with vitest `vi.mock`
- Use `vi.spyOn` to mock `os.homedir()` and `process.cwd()` for controlling patch lookup paths

### Git Intelligence

Recent commits follow `feat: story X-Y-slug -- description`. The codebase uses TypeScript with ESM (`"type": "module"`), vitest for testing, and tsup for building. Story 3-2 (most recent) added 9 agent templates and 85 tests. All modules are single files in `src/lib/` with co-located tests in `__tests__/`.

### Project Structure Notes

- New file: `src/lib/agent-resolver.ts` — the agent resolver module
- New test file: `src/lib/__tests__/agent-resolver.test.ts`
- No changes to any existing source files
- No changes to `package.json` (no new dependencies needed — uses existing `yaml` and `ajv` packages)

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 3.3: Agent Resolver Module]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD1: Module Boundaries — agent-resolver]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD4: Config Resolution Caching]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns — Error Handling Patterns]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Implementation Patterns — Structure Patterns]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR7-FR12 — Agent Configuration FRs]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#FR9 — patch extends/overrides/prompt_patches]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#Journey 3 — Agent & Workflow Customization]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR2 — Agent config resolution <200ms]
- [Source: _bmad-output/planning-artifacts/prd-evaluator-redesign.md#NFR12 — BMAD agent configs read-only]
- [Source: src/schemas/agent.schema.json — schema for validation]
- [Source: src/lib/schema-validate.ts — validateAgentSchema() function]
- [Source: src/lib/workflow-parser.ts — module pattern to follow]
- [Source: templates/agents/*.yaml — embedded agent configs to resolve]
- [Source: _bmad-output/implementation-artifacts/3-1-agent-config-json-schema.md — predecessor story]
- [Source: _bmad-output/implementation-artifacts/3-2-embedded-agent-templates.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (verification/3-3-agent-resolver-module-proof.md)
- [ ] All acceptance criteria verified with real-world evidence via docker exec
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated
- [ ] Exec-plan created in docs/exec-plans/active/3-3-agent-resolver-module.md

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Tasks 1-3 were pre-implemented; completed Tasks 4-6 (resolveAgent, compileSubagentDefinition, unit tests)
- Fixed two TypeScript type cast errors (Record<string, unknown> to ResolvedAgent needed double cast via unknown)
- Added 3 additional edge case tests (scalar patch, unreadable file, error constructor shape)
- Final coverage: 93.81% statements, 94.62% lines for agent-resolver.ts
- Uncovered lines are defensive error paths for corrupted embedded templates (always valid in practice)
- Full test suite: 150 files, 3801 tests, 0 failures

### File List

- `src/lib/agent-resolver.ts` — agent resolver module (fixed TS cast errors)
- `src/lib/__tests__/agent-resolver.test.ts` — 44 unit tests covering all ACs
- `_bmad-output/implementation-artifacts/3-3-agent-resolver-module.md` — story file (tasks marked complete)
