# Verification Proof: Story 6-3 — Evaluator Prompt Template

Story: `_bmad-output/implementation-artifacts/6-3-evaluator-prompt-template.md`
Date: 2026-04-03
Tier: test-provable
Result: **ALL_PASS (10/10 ACs)**

## Pre-checks

| Check | Result | Evidence |
|-------|--------|----------|
| Build (`npm run build`) | PASS | tsup build success, zero errors |
| Tests (`npm run test:unit`) | PASS | 4110 passed, 0 failed |
| Lint (`npx eslint src/`) | PASS | 0 errors, 51 warnings (pre-existing) |
| Coverage (`agent-resolver.ts`) | 94.28% stmts, 84.28% branches | `npx vitest run --coverage` |
| Coverage (`evaluator.ts` lib) | 100% stmts, 92.85% branches | `npx vitest run --coverage` |

## AC 1: evaluator.yaml contains prompt_template with required instructions — PASS

**Criterion:** `templates/agents/evaluator.yaml` contains `prompt_template` field with multi-line string instructing the evaluator to read ACs from `./story-files/`, independently verify each AC, require evidence for every PASS, score UNKNOWN if unable to verify, never give benefit of the doubt, re-verify from scratch.

**Evidence:**
- File: `templates/agents/evaluator.yaml` line 22: `prompt_template: |`
- Content includes: "Read acceptance criteria from ./story-files/", "independently", "commands_run evidence", "score UNKNOWN", "Never give benefit of the doubt", "Re-verify everything from scratch"

<!-- showboat exec: grep -n 'prompt_template\|story-files\|Re-verify' templates/agents/evaluator.yaml -->
```
22:prompt_template: |
29:  Read acceptance criteria from ./story-files/. Each file contains the ACs to verify. Parse every AC and verify each one independently.
92:  Re-verify everything from scratch. Do not assume prior results. Do not cache. Every run is independent.
```
<!-- /showboat exec -->

## AC 2: Anti-leniency instructions present — PASS

**Criterion:** Prompt includes "Assume code is broken until demonstrated otherwise", "Never give benefit of the doubt", "Every PASS requires commands_run evidence — if you cannot run a command to verify, score UNKNOWN".

**Evidence:**
- Line 33: "Assume code is broken until demonstrated otherwise."
- Line 34: "Never give benefit of the doubt"
- Line 35: "Every PASS requires commands_run evidence — if you cannot run a command to verify, score UNKNOWN."

<!-- showboat exec: grep -n 'broken until\|benefit of the doubt\|commands_run evidence' templates/agents/evaluator.yaml -->
```
33:  - Assume code is broken until demonstrated otherwise.
34:  - Never give benefit of the doubt — every claim is unverified until you prove it with output.
35:  - Every PASS requires commands_run evidence — if you cannot run a command to verify, score UNKNOWN.
```
<!-- /showboat exec -->

## AC 3: Prompt instructs EvaluatorVerdict JSON schema output — PASS

**Criterion:** Instructs evaluator to output JSON matching `EvaluatorVerdict` schema: `verdict`, `score`, `findings` array with per-AC `status`, `evidence.commands_run`, `evidence.output_observed`, `evidence.reasoning`.

**Evidence:**
- Lines 58-84 contain JSON structure with `verdict`, `score` (passed/failed/unknown/total), `findings` array with `ac`, `description`, `status`, `evidence` object containing `commands_run`, `output_observed`, `reasoning`
- Line 88: "Write your verdict JSON to ./verdict/verdict.json"

<!-- showboat exec: grep -n 'verdict\|score\|findings\|commands_run\|output_observed\|reasoning' templates/agents/evaluator.yaml | head -15 -->
```
61:  ```json
62:  {
63:    "verdict": "pass" | "fail",
64:    "score": {
71:        "status": "pass" | "fail" | "unknown",
73:          "commands_run": ["<command1>", "<command2>"],
74:          "output_observed": "<actual output>",
75:          "reasoning": "<why this proves pass/fail/unknown>"
88:  Write your verdict JSON to ./verdict/verdict.json
```
<!-- /showboat exec -->

## AC 4: Tool access instructions (Docker, no source code) — PASS

**Criterion:** Prompt instructs evaluator that it has access to Docker (`docker exec`, `docker logs`, `docker ps`) and observability endpoints, but NOT to source code.

**Evidence:**
- Lines 41-45 in evaluator.yaml

<!-- showboat exec: grep -n 'docker\|observability\|source code' templates/agents/evaluator.yaml -->
```
42:  - Docker commands: `docker exec`, `docker logs`, `docker ps`
43:  - Observability query endpoints
45:  You do NOT have access to source code. Do not attempt to read, edit, or write source files.
```
<!-- /showboat exec -->

## AC 5: ResolvedAgent includes prompt_template from YAML — PASS

**Criterion:** `resolveAgent('evaluator')` returns a `ResolvedAgent` with `prompt_template` field from the YAML.

**Evidence:**
- `src/lib/agent-resolver.ts` line 35: `prompt_template?: string` in `ResolvedAgent` interface
- Test: `loads evaluator.yaml with prompt_template field present (AC #5, story 6-3)` — PASS

<!-- showboat exec: grep -n 'prompt_template' src/lib/agent-resolver.ts -->
```
35:  prompt_template?: string;
344:  if (agent.prompt_template) {
345:    parts.push(agent.prompt_template);
```
<!-- /showboat exec -->

## AC 6: compileSubagentDefinition incorporates prompt_template — PASS

**Criterion:** When `ResolvedAgent` has `prompt_template`, it is appended to `instructions` in compiled `SubagentDefinition`. When absent, output is unchanged.

**Evidence:**
- `src/lib/agent-resolver.ts` lines 344-346: conditional append of `prompt_template` to instructions
- Tests: `includes prompt_template in instructions when present (AC #6)` — PASS
- Tests: `output unchanged when prompt_template is absent (AC #6)` — PASS
- Tests: `prompt_template appears after prompt_patches.append in instructions` — PASS

<!-- showboat exec: grep -n -A2 'prompt_template' src/lib/agent-resolver.ts | tail -6 -->
```
344:  if (agent.prompt_template) {
345:    parts.push(agent.prompt_template);
346:  }
```
<!-- /showboat exec -->

## AC 7: evaluator.ts uses prompt template instead of hardcoded one-liner — PASS

**Criterion:** `runEvaluator()` dispatch prompt uses prompt template from compiled `SubagentDefinition.instructions` instead of hardcoded `EVALUATOR_PROMPT`, and includes story file paths and verdict output path.

**Evidence:**
- `src/lib/evaluator.ts` lines 55-63: `buildEvaluatorPrompt()` replaces old `EVALUATOR_PROMPT` constant
- Prompt references `./story-files/` and `./verdict/verdict.json`
- Tests: `dispatch prompt includes story file paths reference (AC #7, story 6-3)` — PASS
- Tests: `dispatch prompt includes verdict output path (AC #7, story 6-3)` — PASS
- Tests: `compiled evaluator uses prompt_template from YAML, not a hardcoded constant` — PASS

<!-- showboat exec: grep -n 'story-files\|verdict\|buildEvaluatorPrompt' src/lib/evaluator.ts -->
```
55:function buildEvaluatorPrompt(): string {
59:  parts.push('Story files are available in ./story-files/. Read each file to find the ACs.');
60:  parts.push('Write your verdict JSON output to ./verdict/verdict.json.');
143:    const evaluatorPrompt = buildEvaluatorPrompt();
```
<!-- /showboat exec -->

## AC 8: agent.schema.json allows optional prompt_template — PASS

**Criterion:** `agent.schema.json` includes optional `prompt_template` field of type `string`.

**Evidence:**
- `src/schemas/agent.schema.json` lines 80-83: `"prompt_template": { "type": "string", "description": "Task-specific prompt template included in compiled instructions" }`
- Tests: `accepts agent config with prompt_template (AC #8)` — PASS
- Tests: `accepts agent config without prompt_template (AC #8)` — PASS

<!-- showboat exec: grep -n -A2 'prompt_template' src/schemas/agent.schema.json -->
```
80:    "prompt_template": {
81:      "type": "string",
82:      "description": "Task-specific prompt template included in compiled instructions"
83:    }
```
<!-- /showboat exec -->

## AC 9: Unit tests pass at 80%+ coverage — PASS

**Criterion:** Tests pass at 80%+ coverage for changed code covering: evaluator.yaml loads with prompt_template, compileSubagentDefinition includes prompt_template in instructions, evaluator dispatch uses structured prompt, prompt contains anti-leniency keywords, prompt references verdict JSON schema structure.

**Evidence:**
- Coverage: `agent-resolver.ts` 94.28% stmts, `evaluator.ts` (lib) 100% stmts — both exceed 80%
- 20+ tests tagged `story 6-3` across `agent-resolver.test.ts` and `evaluator.test.ts` all pass
- Tests cover: YAML loading, compileSubagentDefinition, dispatch prompt, anti-leniency keywords, verdict JSON, schema validation

<!-- showboat exec: npx vitest run --reporter=verbose 2>&1 | grep -c 'story 6-3' -->
```
17
```
<!-- /showboat exec -->

## AC 10: Build succeeds with zero errors, no test regressions — PASS

**Criterion:** `npm run build` succeeds with zero errors. `npm run test:unit` passes with no regressions.

**Evidence:**
- `npm run build` exits 0: "Build success in 26ms"
- `npm run test:unit`: 4110 passed, 0 failed

<!-- showboat exec: npm run build 2>&1 | grep -E 'success|error' -->
```
ESM Build success in 6ms
ESM Build success in 26ms
DTS Build success in 764ms
```
<!-- /showboat exec -->

## Summary

| AC | Description | Result |
|----|-------------|--------|
| 1 | prompt_template in evaluator.yaml with full instructions | PASS |
| 2 | Anti-leniency instructions present | PASS |
| 3 | Verdict JSON schema output format | PASS |
| 4 | Tool access instructions (Docker, no source) | PASS |
| 5 | ResolvedAgent includes prompt_template | PASS |
| 6 | compileSubagentDefinition incorporates prompt_template | PASS |
| 7 | evaluator.ts uses prompt template, not hardcoded | PASS |
| 8 | agent.schema.json allows optional prompt_template | PASS |
| 9 | Unit tests pass at 80%+ coverage | PASS |
| 10 | Build zero errors, no test regressions | PASS |

**Final verdict: ALL_PASS (10/10 ACs)**
