---
title: 'XML Output Protocol for All Agents'
slug: 'xml-output-protocol'
created: '2026-04-04'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Node.js']
files_to_modify:
  - 'templates/agents/negotiator.yaml'
  - 'templates/agents/reviewer.yaml'
  - 'templates/agents/checker.yaml'
  - 'templates/agents/deployer.yaml'
  - 'templates/agents/evaluator.yaml'
  - 'templates/agents/documenter.yaml'
  - 'templates/agents/story-creator.yaml'
  - 'templates/agents/dev.yaml'
  - 'templates/agents/retro.yaml'
  - 'src/lib/verdict-parser.ts'
  - 'src/lib/workflow-engine.ts'
code_patterns: []
test_patterns: []
---

# Tech-Spec: XML Output Protocol for All Agents

## Overview

### Problem

Agents ignore JSON output format instructions. They wrap JSON in markdown code blocks, use wrong field names (`overall_verdict` vs `verdict`), or skip the verdict entirely. The parser uses fragile regex with fallbacks and workarounds.

### Solution

Define strict XML tags for all structured output. Every agent that produces machine-readable output uses the same tags. The parser extracts content between tags — no fallbacks, no loose matching.

## Protocol

### Verdict (negotiator, reviewer, checker, evaluator)

```
<verdict>pass</verdict>
```
or
```
<verdict>fail</verdict>
<issues>
AC 1: reason and suggested fix
AC 3: reason and suggested fix
</issues>
```

### Deploy Report (deployer)

```
<deploy-report>
status: running
containers: container-name (healthy, port 8000)
urls: http://localhost:8000
credentials: db_url=postgresql://...
</deploy-report>
```

### Quality Scores (evaluator only)

```
<quality-scores>
architecture: 4
originality: 3
craft: 4
functionality: 5
</quality-scores>
```

### Evidence (evaluator, per AC)

```
<evidence ac="1" status="pass">
command: docker exec surf-backend curl localhost:8000/health
output: {"status": "ok"}
reasoning: Health endpoint returns 200 with ok status
</evidence>
```

### User Docs (documenter)

```
<user-docs>
... full user documentation content ...
</user-docs>
```

### Story Spec (story-creator)

```
<story-spec>
... full story markdown ...
</story-spec>
```

## Implementation Plan

### Task 1: Rewrite parseSimpleVerdict → parseVerdictTag

- File: `src/lib/verdict-parser.ts`
- Delete `parseSimpleVerdict()` and all its fallback strategies
- New function: `parseVerdictTag(output: string): { verdict: 'pass' | 'fail' } | null`
- Implementation: `/<verdict>(pass|fail)<\/verdict>/i` — one regex, no fallbacks
- Also extract `<issues>` content if present: `/<issues>([\s\S]*?)<\/issues>/`
- Update export and import in workflow-engine.ts

### Task 2: Update executeLoopBlock to use parseVerdictTag

- File: `src/lib/workflow-engine.ts`
- Replace `parseSimpleVerdict` call with `parseVerdictTag`
- Keep full `parseVerdict()` for evaluator (it still uses JSON for full findings)
- Or: update evaluator to also use `<verdict>` tag and rewrite `parseVerdict` entirely

### Task 3: Update all agent prompts with XML tags

For each agent, add explicit tag instructions:

**negotiator.yaml**: 
- "End your response with `<verdict>pass</verdict>` or `<verdict>fail</verdict>` followed by `<issues>...</issues>`"

**reviewer.yaml**:
- "End your response with `<verdict>pass</verdict>` or `<verdict>fail</verdict>` followed by `<issues>...</issues>`"

**checker.yaml**:
- "End your response with `<verdict>pass</verdict>` or `<verdict>fail</verdict>`"

**deployer.yaml**:
- "Include a `<deploy-report>...</deploy-report>` block with status, containers, urls, credentials"

**evaluator.yaml**:
- "For each AC, include `<evidence ac=\"N\" status=\"pass|fail|unknown\">...</evidence>`"
- "Include `<verdict>pass</verdict>` or `<verdict>fail</verdict>`"
- "Include `<quality-scores>...</quality-scores>`"

**documenter.yaml**:
- "Wrap your documentation in `<user-docs>...</user-docs>`"

**story-creator.yaml**:
- "Wrap your story spec in `<story-spec>...</story-spec>`"

### Task 4: Update engine to extract tagged content

- File: `src/lib/workflow-engine.ts`
- When storing contracts, extract content from tags for specific tasks:
  - `document` task: extract `<user-docs>` content for verify workspace guides
  - `deploy` task: extract `<deploy-report>` content for verify workspace
  - `verify` task: extract `<evidence>` blocks and `<quality-scores>` for TUI display
- Generic helper: `extractTag(output: string, tag: string): string | null`

### Task 5: Update dispatch prompts

- File: `src/lib/workflow-engine.ts`, TASK_PROMPTS map
- Add XML tag instructions to each dispatch prompt:
  - negotiate-acs: "...End with `<verdict>pass</verdict>` or `<verdict>fail</verdict>`"
  - review: "...End with `<verdict>pass</verdict>` or `<verdict>fail</verdict>`"  
  - deploy: "...Include `<deploy-report>...</deploy-report>`"
  - document: "...Wrap documentation in `<user-docs>...</user-docs>`"
  - verify: "...Include `<verdict>`, `<evidence>`, `<quality-scores>` tags"

### Task 6: Update tests

- verdict-parser tests: test `parseVerdictTag` with XML tags
- Remove all `parseSimpleVerdict` tests
- Engine tests: update verdict expectations to XML format

## Acceptance Criteria

- AC 1: `parseVerdictTag('<verdict>pass</verdict>')` returns `{ verdict: 'pass' }`
- AC 2: `parseVerdictTag('lots of prose... <verdict>fail</verdict> <issues>AC 1: bad</issues>')` returns `{ verdict: 'fail' }` and extracts issues
- AC 3: `parseVerdictTag('no tags here')` returns `null`
- AC 4: All agent prompts include explicit XML tag instructions
- AC 5: Engine extracts `<user-docs>` from document contracts for verify workspace
- AC 6: Engine extracts `<deploy-report>` from deploy contracts for verify workspace
- AC 7: Zero regex fallbacks or workarounds in verdict parsing
