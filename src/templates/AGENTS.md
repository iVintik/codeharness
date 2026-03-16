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
- `sprintBeadsPatch()` — beads issue status, pre-triage import verification, multi-source visibility for sprint-planning checklist
- `sprintPlanningRetroPatch()` — retro-import, github-import, bd ready combined backlog, source-aware presentation for sprint-planning instructions

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

### readme.ts

README.md template for project documentation. `readmeTemplate()` accepts
a `ReadmeTemplateConfig` (projectName, stack, cliHelpOutput) and generates
a README with Quick Start, Installation, Usage, and CLI Reference sections.
Install command varies by stack (npm for nodejs/null, pip for python).
Used by `src/commands/init.ts`.

### verify-prompt.ts

Verification prompt template for the black-box verifier session.
`verifyPromptTemplate()` generates the prompt passed to `claude --print`
in the clean workspace. Includes: story ACs, Docker container name,
observability endpoints (VictoriaLogs/Metrics/Traces), README.md usage
instructions, and the rule that ALL CLI commands must use `docker exec`.
Used by `src/lib/verifier-session.ts`.

### verify-dockerfile.ts

Dockerfile template for black-box verification environment.
`verifyDockerfileTemplate()` generates a Dockerfile that installs the
project as a user would (`npm install -g` from tarball for Node.js,
`pip install` from dist for Python), includes `curl`, `jq`, `showboat`,
sets OTEL environment variables pointing to `host.docker.internal:4318`,
and contains NO source code. Used by `src/lib/verify-env.ts`.

## Test Coverage

Each template file has a corresponding test in `__tests__/`:
`bmad-patches.test.ts`, `docker-compose.test.ts`,
`otel-config.test.ts`, `ralph-prompt.test.ts`,
`readme.test.ts`, `showboat-template.test.ts`,
`verify-dockerfile.test.ts`, `verify-prompt.test.ts`.
