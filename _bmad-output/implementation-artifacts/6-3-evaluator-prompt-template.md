# Story 6.3: Evaluator Prompt Template

Status: verifying

## Story

As a developer,
I want the evaluator agent YAML to include anti-leniency instructions and a structured prompt template,
so that the evaluator requires evidence for every verdict and produces reliable, schema-compliant JSON output.

## Acceptance Criteria

1. **Given** `templates/agents/evaluator.yaml` exists
   **When** inspected
   **Then** it contains a `prompt_template` field with a multi-line string instructing the evaluator to: read ACs from `./story-files/`, independently determine how to test each AC, require evidence (commands run + output captured) for every PASS, score UNKNOWN if unable to verify, never give benefit of the doubt, and re-verify from scratch (no caching of prior results)
   <!-- verification: test-provable -->

2. **Given** the evaluator prompt template in `evaluator.yaml`
   **When** inspected
   **Then** it includes explicit anti-leniency instructions: "Assume code is broken until demonstrated otherwise", "Never give benefit of the doubt", "Every PASS requires commands_run evidence — if you cannot run a command to verify, score UNKNOWN"
   <!-- verification: test-provable -->

3. **Given** the evaluator prompt template
   **When** inspected
   **Then** it instructs the evaluator to output a JSON object matching the `EvaluatorVerdict` schema defined in `src/schemas/verdict.schema.json` — including `verdict`, `score`, `findings` array with per-AC `status`, `evidence.commands_run`, `evidence.output_observed`, and `evidence.reasoning`
   <!-- verification: test-provable -->

4. **Given** the evaluator prompt template
   **When** inspected
   **Then** it instructs the evaluator that it has access to Docker (`docker exec`, `docker logs`, `docker ps`) and observability query endpoints, but NOT to source code — and it must use these tools to gather evidence
   <!-- verification: test-provable -->

5. **Given** the `ResolvedAgent` interface in `agent-resolver.ts`
   **When** `evaluator.yaml` is loaded via `resolveAgent('evaluator')`
   **Then** the resolved agent includes the `prompt_template` field value from the YAML
   **And** `compileSubagentDefinition()` incorporates the `prompt_template` into the compiled `instructions` string
   <!-- verification: test-provable -->

6. **Given** `compileSubagentDefinition()` in `agent-resolver.ts`
   **When** a `ResolvedAgent` has a `prompt_template` field
   **Then** the `prompt_template` content is appended to the `instructions` string in the compiled `SubagentDefinition`
   **And** when no `prompt_template` is present, the compiled output is unchanged from the current behavior
   <!-- verification: test-provable -->

7. **Given** the `EVALUATOR_PROMPT` constant in `evaluator.ts`
   **When** `runEvaluator()` dispatches the evaluator
   **Then** the prompt passed to `dispatchAgent()` is replaced with a call that uses the prompt template from the compiled `SubagentDefinition.instructions` (or a dedicated prompt builder function) instead of the hardcoded one-liner
   **And** the prompt includes the story file paths and verdict output path (`./verdict/`)
   <!-- verification: test-provable -->

8. **Given** `agent.schema.json` in `src/schemas/`
   **When** inspected
   **Then** it allows an optional `prompt_template` field of type `string` on agent definitions
   <!-- verification: test-provable -->

9. **Given** unit tests for the prompt template integration
   **When** `npm run test:unit` is executed
   **Then** tests pass at 80%+ coverage for the changed code covering: evaluator.yaml loads with prompt_template, compileSubagentDefinition includes prompt_template in instructions, evaluator dispatch uses the structured prompt, prompt contains anti-leniency keywords, prompt references verdict JSON schema structure
   <!-- verification: test-provable -->

10. **Given** `npm run build` is executed
    **When** the build completes
    **Then** it succeeds with zero errors
    **And** `npm run test:unit` passes with no regressions in existing test suites
    <!-- verification: test-provable -->

## Tasks / Subtasks

- [x] Task 1: Update agent JSON schema to allow prompt_template (AC: #8)
  - [x] Add optional `prompt_template` field (type: string) to `src/schemas/agent.schema.json`
  - [x] Verify existing agent YAMLs still validate

- [x] Task 2: Update ResolvedAgent interface and compileSubagentDefinition (AC: #5, #6)
  - [x] Add optional `prompt_template?: string` to `ResolvedAgent` interface in `agent-resolver.ts`
  - [x] In `compileSubagentDefinition()`, append `prompt_template` content to `instructions` after `prompt_patches`
  - [x] Ensure backward compatibility: agents without `prompt_template` produce identical output

- [x] Task 3: Write the evaluator prompt template in evaluator.yaml (AC: #1, #2, #3, #4)
  - [x] Add `prompt_template` field to `templates/agents/evaluator.yaml` with structured multi-line prompt
  - [x] Include anti-leniency instructions: assume broken, no benefit of doubt, UNKNOWN if can't verify
  - [x] Include verdict JSON schema structure reference (verdict, score, findings array)
  - [x] Include tool access instructions: Docker commands available, observability endpoints available, no source code
  - [x] Include output instructions: write JSON to `./verdict/` directory, one finding per AC

- [x] Task 4: Update evaluator.ts to use prompt template (AC: #7)
  - [x] Remove or deprecate the hardcoded `EVALUATOR_PROMPT` constant
  - [x] Build the dispatch prompt from the evaluator's compiled instructions and story file context
  - [x] Ensure the prompt includes story file paths available in `./story-files/`
  - [x] Ensure the prompt references `./verdict/` as the output directory

- [x] Task 5: Write unit tests (AC: #9, #10)
  - [x] Test: `evaluator.yaml` resolves with `prompt_template` field present
  - [x] Test: `compileSubagentDefinition()` includes `prompt_template` in instructions when present
  - [x] Test: `compileSubagentDefinition()` output unchanged when `prompt_template` absent
  - [x] Test: evaluator dispatch prompt contains anti-leniency keywords ("broken", "benefit of the doubt", "UNKNOWN")
  - [x] Test: evaluator dispatch prompt references verdict JSON structure
  - [x] Test: evaluator dispatch prompt includes story file paths
  - [x] Test: `agent.schema.json` accepts agent config with `prompt_template`
  - [x] Test: `agent.schema.json` accepts agent config without `prompt_template`
  - [x] Test: existing agent-resolver tests pass without regression
  - [x] Test: existing evaluator tests pass without regression
  - [x] Verify `npm run build` succeeds with zero errors
  - [x] Verify 80%+ coverage on changed files

## Dev Notes

### Module Design

This story bridges two existing modules:
1. **evaluator.yaml** (agent template) — gains a `prompt_template` with structured anti-leniency instructions
2. **agent-resolver.ts** — gains `prompt_template` support in `ResolvedAgent` and `compileSubagentDefinition()`
3. **evaluator.ts** — replaces the hardcoded one-liner prompt with one built from the compiled agent instructions

The prompt template is stored in the agent YAML (not hardcoded in TypeScript) so that users can patch it via the `extends` mechanism. This is consistent with how `prompt_patches.append` already works, but `prompt_template` provides the full base prompt rather than an append-only patch.

### Integration Points

- `templates/agents/evaluator.yaml` — the evaluator agent definition (add `prompt_template`)
- `src/schemas/agent.schema.json` — agent JSON schema (add optional `prompt_template`)
- `src/lib/agent-resolver.ts` — `ResolvedAgent` interface and `compileSubagentDefinition()` function
- `src/lib/evaluator.ts` — `EVALUATOR_PROMPT` constant and `runEvaluator()` dispatch call
- `src/schemas/verdict.schema.json` — referenced in prompt template (not modified)
- `src/lib/verdict-parser.ts` — downstream consumer of evaluator output (not modified)

### Data Flow

```
evaluator.yaml (with prompt_template)
  → resolveAgent('evaluator') → ResolvedAgent (with prompt_template)
  → compileSubagentDefinition(resolved) → SubagentDefinition (instructions include prompt_template)
  → runEvaluator(options) → dispatchAgent(definition, prompt, options)
  → evaluator agent executes in isolated workspace
  → reads ./story-files/, runs Docker commands, writes JSON verdict
  → parseVerdict(output) → EvaluatorVerdict (story 6-2, unchanged)
```

### Prompt Template Content (Draft)

The prompt template should include these sections:

1. **Role context** — "You are verifying acceptance criteria for a software story"
2. **Input** — "Read acceptance criteria from ./story-files/. Each file contains the ACs to verify."
3. **Anti-leniency rules** — "Assume the code is broken until proven otherwise. Never give benefit of the doubt. If you cannot run a command to verify an AC, score it UNKNOWN — never PASS without evidence."
4. **Tool access** — "You have access to Docker (docker exec, docker logs, docker ps) and observability query endpoints. You do NOT have access to source code."
5. **Evidence requirements** — "Every PASS verdict MUST include: commands_run (the exact commands you ran), output_observed (the actual terminal output), and reasoning (why this proves the AC passes)."
6. **Output format** — "Output a single JSON object matching this structure: { verdict: 'pass'|'fail', score: { passed, failed, unknown, total }, findings: [{ ac, description, status, evidence: { commands_run, output_observed, reasoning } }] }"
7. **Output location** — "Write your verdict JSON to ./verdict/"
8. **Re-verification** — "Re-verify everything from scratch. Do not assume prior results. Do not cache."

### Existing EVALUATOR_PROMPT

The current hardcoded prompt in `evaluator.ts` (line 47-48):
```typescript
const EVALUATOR_PROMPT =
  'Read the acceptance criteria in ./story-files/. For each AC, determine if it passes by running commands and checking output. Report your findings as JSON.';
```

This is intentionally minimal (per story 6-1 dev notes: "The full prompt template with anti-leniency instructions and structured output enforcement is story 6-3"). This story replaces it with the full template.

### prompt_template vs prompt_patches

- `prompt_patches.append` — additional instructions appended to the compiled instructions (existing mechanism)
- `prompt_template` — the full base prompt for what the agent should DO when dispatched (new field)

These are different concerns:
- `instructions` = who you are (identity, principles, communication style) + patches
- `prompt_template` = what you should do (task-specific instructions)

In `compileSubagentDefinition()`, the order should be:
1. Identity and persona (existing)
2. Principles (existing)
3. prompt_patches.append (existing)
4. prompt_template (new — appended last as the task instructions)

### Schema Change

`agent.schema.json` needs:
```json
"prompt_template": {
  "type": "string",
  "description": "Task-specific prompt template included in compiled instructions"
}
```

### Anti-Patterns to Avoid

- **Do NOT hardcode the prompt in evaluator.ts** — it lives in evaluator.yaml so users can patch it
- **Do NOT modify verdict-parser.ts** — prompt template affects input, not output parsing
- **Do NOT modify workflow-engine.ts** — prompt construction happens before the engine dispatches
- **Do NOT add runtime template variable substitution** (e.g., `{{story_key}}`) — the prompt template is a static string included in instructions; dynamic context (story files, trace ID) is provided via the dispatch prompt argument
- **Do NOT change the EvaluatorVerdict schema** — the prompt references it, doesn't modify it
- **Do NOT remove `disallowedTools` from evaluator.yaml** — the prompt template is additive

### Project Structure Notes

- Modified file: `templates/agents/evaluator.yaml` — add `prompt_template` field
- Modified file: `src/schemas/agent.schema.json` — add optional `prompt_template` property
- Modified file: `src/lib/agent-resolver.ts` — add `prompt_template` to `ResolvedAgent`, update `compileSubagentDefinition()`
- Modified file: `src/lib/evaluator.ts` — replace hardcoded `EVALUATOR_PROMPT` with prompt from compiled definition
- Modified test file: `src/lib/__tests__/agent-resolver.test.ts` — add prompt_template tests
- Modified test file: `src/lib/__tests__/evaluator.test.ts` — update prompt assertions
- No new files expected

### Previous Story Intelligence

From story 6-1 (evaluator module):
- `EVALUATOR_PROMPT` is a simple one-liner at line 47-48 of `evaluator.ts`
- `runEvaluator()` passes `EVALUATOR_PROMPT` to `dispatchAgent()` at line 128-132
- `buildUnknownOutput()` generates fallback JSON matching EvaluatorVerdict shape — the prompt template must reference this same shape
- The evaluator agent definition is passed in via `options.agentDefinition` (pre-compiled `SubagentDefinition`)

From story 6-2 (verdict schema & parsing):
- `verdict.schema.json` defines the exact JSON structure the prompt must instruct the evaluator to produce
- `parseVerdict()` enforces PASS-evidence invariant — the prompt should tell the evaluator to always include evidence to avoid downgrades
- `VerdictParseError` with retry semantics means the prompt should emphasize outputting valid JSON

From story 3-2 (embedded agent templates):
- `resolveAgent()` loads YAML from `templates/agents/`, applies patches, returns `ResolvedAgent`
- `compileSubagentDefinition()` converts `ResolvedAgent` to `SubagentDefinition` with `instructions` string
- Agent YAML schema validated by `agent.schema.json` — new fields must be added there

From story 3-3 (agent resolver):
- `resolveAgent()` → `loadAgentFile()` → `applyAgentPatch()` → `ResolvedAgent`
- `prompt_patches.append` is applied in `compileSubagentDefinition()` at line 339-341
- New `prompt_template` follows the same pattern but is a separate field

### References

- [Source: _bmad-output/planning-artifacts/epics-v2.md#Story 6.3: Evaluator Prompt Template]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#AD5: Evaluator Verdict Schema]
- [Source: _bmad-output/planning-artifacts/architecture-v2.md#Format Patterns — Evaluator verdict]
- [Source: src/lib/evaluator.ts#EVALUATOR_PROMPT (line 47-48)]
- [Source: src/lib/evaluator.ts#runEvaluator() — dispatchAgent call (line 128-132)]
- [Source: src/lib/agent-resolver.ts#ResolvedAgent interface (line 17-35)]
- [Source: src/lib/agent-resolver.ts#compileSubagentDefinition() (line 328-350)]
- [Source: src/schemas/agent.schema.json — agent definition schema]
- [Source: src/schemas/verdict.schema.json — verdict output schema (referenced in prompt)]
- [Source: src/lib/verdict-parser.ts — downstream consumer, not modified]
- [Source: templates/agents/evaluator.yaml — evaluator agent definition]
- [Source: _bmad-output/implementation-artifacts/6-1-evaluator-module-workspace-spawn.md — predecessor story]
- [Source: _bmad-output/implementation-artifacts/6-2-evaluator-verdict-json-schema-parsing.md — predecessor story]
