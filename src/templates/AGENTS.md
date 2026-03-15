# src/templates/ — Embedded Template Strings

## Purpose

This module contains TypeScript functions that return string templates.
Templates are compiled into `dist/` by tsup and imported as regular
ES modules by commands and libraries. They generate configuration
files, prompt text, proof documents, and BMAD workflow patches at
runtime.

Architecture Decision 6 mandates that all templates live as TypeScript
string literals (no external template files loaded at runtime).

## Files

### bmad-patches.ts

BMAD workflow patch content. Each function returns a markdown snippet
injected into BMAD workflow files by the patch engine
(`src/lib/patch-engine.ts`). Six patches covering story, dev-story,
code-review, retrospective, and sprint-planning (beads + retro action
items) workflows. Exports `PATCH_TEMPLATES` map (6 entries) consumed
by `src/lib/bmad.ts`.

Patch functions:
- `storyVerificationPatch()` — verification/docs/testing requirements for story template
- `devEnforcementPatch()` — observability, docs, test enforcement for dev-story checklist
- `reviewEnforcementPatch()` — Showboat proof, AGENTS.md freshness, coverage for code-review
- `retroEnforcementPatch()` — verification effectiveness, doc health, test quality for retrospective
- `sprintBeadsPatch()` — beads issue status and sprint readiness for sprint-planning checklist
- `sprintPlanningRetroPatch()` — surfaces unresolved retrospective action items in sprint-planning instructions

### docker-compose.ts

Docker Compose YAML for the observability stack.
`dockerComposeCollectorOnlyTemplate()` generates a collector-only
stack; `dockerComposeTemplate()` generates the full shared stack
(VictoriaLogs, VictoriaMetrics, Jaeger, OTel Collector).
Used by `src/lib/docker.ts`.

### otel-config.ts

OpenTelemetry Collector configuration YAML.
`otelCollectorConfigTemplate()` targets local containers;
`otelCollectorConfigWithCors()` adds CORS for browser instrumentation;
`otelCollectorRemoteTemplate()` targets remote backend URLs.
Used by `src/lib/docker.ts`.

### ralph-prompt.ts

Prompt text for the Ralph autonomous loop. `generateRalphPrompt()`
interpolates project directory, sprint-status path, retry context,
and flagged-story lists into a prompt that instructs Claude Code to
run `/harness-run`. Used by `src/commands/run.ts`.

### showboat-template.ts

Showboat verification proof document generator. Builds a markdown
proof file from a `ShowboatProofConfig` containing story metadata
and acceptance criteria with evidence items (`exec` commands or
`image` paths). Also exports `verificationSummaryBlock()` for the
pass/fail summary table. Used by `src/lib/verify.ts`.

## Test Coverage

Each template file has a corresponding test in `__tests__/`:
`bmad-patches.test.ts`, `docker-compose.test.ts`,
`otel-config.test.ts`, `ralph-prompt.test.ts`,
`showboat-template.test.ts`.
