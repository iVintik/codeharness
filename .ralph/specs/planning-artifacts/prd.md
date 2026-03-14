---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - product-brief-bmad-orchestrator-2026-03-14.md
  - research/technical-bmad-orchestrator-implementation-research-2026-03-14.md
documentCounts:
  briefs: 1
  research: 1
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
classification:
  projectType: developer_tool
  domain: general
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - codeharness

**Author:** Ivintik
**Date:** 2026-03-14

## Executive Summary

codeharness is a Claude Code plugin that combines the BMAD methodology, Ralph's autonomous execution loop, and Harness Engineering into a single tool that makes autonomous coding agents produce software that actually works — not software that passes tests. It replaces bmalph by providing BMAD installation (with harness-aware patches), a vendored Ralph loop (with verification gates), and mechanical enforcement of real-world verification and observability.

Two problems kill autonomous development today. First, agents write code that "passes tests" but breaks when used — UI features that don't render, APIs that return 200 but do nothing, data operations that silently fail. Second, agents are blind to runtime behavior — they can't see logs, traces, or application state, so they guess at fixes instead of diagnosing root causes.

codeharness solves both. It enforces real-world verification — the agent must use what it built (agent-browser for UI, real API calls, DB state inspection) and capture reproducible proof via Showboat. It gives the agent eyes — an ephemeral VictoriaMetrics observability stack with OpenTelemetry instrumentation, so the agent queries logs, traces, and metrics during development. Both are enforced mechanically through Claude Code hooks, not documentation the agent can ignore.

The result: when codeharness says "done," the feature actually works. The user has a Showboat proof document with real screenshots, actual API responses, and confirmed database state — re-runnable by anyone.

## What Makes This Special

- **Verification-as-proof:** Not "tests pass" but reproducible Showboat documents with real command output that anyone can re-verify
- **Agent-first observability:** Ephemeral VictoriaMetrics stack the agent queries programmatically (LogQL/PromQL) — built for agents, not dashboards
- **Anti-cheating by architecture:** Showboat's exec→verify, agent-browser's snapshot diffing, hooks that block commits without proof — the agent CAN'T skip verification
- **Validated at scale:** OpenAI's Harness Engineering (1M lines). LangChain benchmark: harness changes alone improved 52.8% → 66.5% (Top 30 → Top 5)

## Project Classification

- **Project Type:** Developer tool — Claude Code plugin with CLI commands, hooks, skills, MCP integrations
- **Domain:** General software development tooling
- **Complexity:** Medium-High — BMAD distribution + Ralph loop + harness (VictoriaMetrics, agent-browser, Showboat, OTLP, hooks, MCP) but no regulated domain
- **Project Context:** Greenfield

## Success Criteria

### User Success

- **Verification trust:** When codeharness marks a story "verified," the feature works when the user tries it. Target: >95% of verified stories hold up under manual spot-check.
- **Happy path verified via real usage:** agent-browser interaction, real API calls with side-effect checks, DB state confirmation — captured in Showboat proof
- **Edge cases verified via automated tests:** Unit tests and E2E tests cover edge cases the AC defines — in addition to real-world verification, not a replacement
- **No manual re-checking needed:** User trusts the Showboat proof document without opening the browser themselves
- **Debug efficiency:** When something fails, the agent has enough visibility (logs, traces, metrics) to identify root cause on first attempt. Target: >70%

### Business Success

- **GitHub stars:** Target: 500+ in first 6 months
- **Plugin installs:** Claude Code marketplace. Target: 100+ active in first 6 months
- **3-month goal:** Creator can produce complex prototypes autonomously with real verification
- **6-month goal:** Public release, community adoption begins
- **12-month goal:** Contributors, integrations with other methodologies, growing ecosystem

### Technical Success

- **Showboat verify pass rate:** `showboat verify` confirms outputs match on re-run. Target: >98%
- **Install-to-first-verification:** Under 15 minutes from `claude plugin install` to first verified task
- **Iteration cycles per story:** Average implement→verify→fix loops before AC pass. Target: <3
- **Sustained autonomous run time:** Agent works without human intervention. Target: >4 hours
- **Observability stack flexibility:** VictoriaMetrics for full projects. Future: OpenSearch, remote logging solutions.
- **Harness overhead:** OTLP instrumentation and verification must not noticeably slow development

### Measurable Outcomes

| Metric | Target | Method |
|--------|--------|--------|
| Verified stories that actually work | >95% | Manual spot-check by user |
| Showboat verify pass rate | >98% | Automated re-run |
| Root cause on first attempt | >70% | Agent debug logs |
| Install to first verification | <15 min | Timed |
| Iterations per story | <3 | Loop counter |
| Sustained autonomous run | >4h | Session duration |
| GitHub stars (6 months) | 500+ | GitHub |
| Plugin installs (6 months) | 100+ | Marketplace |

## User Journeys

### Journey 1: Alex — Solo Developer, New Project (Happy Path)

Alex is a senior developer building a SaaS prototype. He's used Claude Code with Ralph loops before but got burned — the agent said features were done, tests passed, but half the UI was broken and two API endpoints returned 200 with empty responses. He spent a full day manually re-testing everything.

**Opening:** Alex discovers codeharness on the Claude Code marketplace. "Harness Engineering as a plugin" catches his eye — he read the OpenAI blog post. He runs `claude plugin install codeharness`.

**Rising Action:** In his new project, he runs `/harness-init`. The harness asks: "Frontend? Database? APIs?" — yes to all. VictoriaMetrics stack starts, OTLP instrumentation is added to his Next.js app, agent-browser and Postgres MCP are configured. He kicks off a BMAD sprint with 5 stories.

**Climax:** Story 3 — user registration — completes. The Showboat proof document shows: agent-browser screenshot of the registration form filled and submitted, the success page rendered. `curl` output showing the POST response with the new user ID. A Postgres query showing the user row exists with correct email and hashed password. VictoriaLogs query showing the `user.created` log entry with trace ID. `showboat verify` re-runs everything — all outputs match.

**Resolution:** Alex reviews the Showboat docs for all 5 stories. He doesn't open the browser once. He trusts the proof. The sprint took 4 hours of autonomous execution. His day of manual re-testing is gone.

---

### Journey 2: Alex — Migrating from bmalph (Edge Case)

Alex has a project running bmalph with BMAD and Ralph. He installs codeharness and runs `/harness-init`.

**Opening:** Alex runs `claude plugin install codeharness` in the existing project. He runs `/harness-init`.

**Rising Action:** codeharness detects `_bmad/` and `.ralph/` directories. It reports: "Existing BMAD installation detected. I'll apply harness patches and take over execution. Your existing BMAD artifacts are preserved." It applies patches to story templates, dev workflow, code review, and retrospective workflows. It asks about project characteristics — Python API with Postgres, no frontend. Alex confirms: agent-browser OFF, DB MCP ON, APIs ON, VictoriaMetrics ON.

**Climax:** The next sprint runs through codeharness's vendored Ralph loop with verification gates. After each story, the verification pipeline triggers. Showboat captures: real API calls to every endpoint, response bodies showing correct data, Postgres queries confirming data was written, VictoriaLogs showing the request flow. After the sprint, a mandatory retrospective runs — analyzing verification data, surfacing issues, producing follow-up stories.

**Resolution:** Alex's existing BMAD stories now include verification requirements. The stories that previously "passed tests" but had silent failures are caught during verification. bmalph is no longer needed. The retro produced 2 follow-up stories for the next sprint.

---

### Journey 3: The Agent — Developing with the Harness (Agent-as-User)

The autonomous agent picks up story US-003: "User can reset password via email." This is the agent's journey through the harness.

**Opening:** The agent reads the story from the BMAD sprint plan. SessionStart hook fires — verifies VictoriaMetrics stack is running, OTLP is configured, agent-browser is available. The agent has eyes.

**Rising Action:** The agent implements the password reset endpoint and email sending logic. PostToolUse hook fires after each file write — the agent checks that new code includes structured logging for the reset flow. The agent starts the dev server, queries VictoriaLogs: `level:error` returns nothing. It makes a real API call: `POST /api/reset-password` with a test email. Checks VictoriaLogs for the `password.reset.requested` trace — it's there. Checks the DB via MCP — the reset token row exists.

**Climax:** The agent opens agent-browser, navigates to the reset password page, fills in the email, submits. Uses `wait --fn` until the success message appears. Takes an annotated screenshot. Then navigates to the reset link (from the DB token), enters a new password, submits. Verifies login works with the new password. Every step wrapped in `showboat exec`.

**Resolution:** The agent runs `showboat verify` — all outputs match. PreToolUse hook allows the commit. The story is marked verified. The Showboat document contains 12 verification steps with real evidence. The agent moves to the next story.

---

### Journey 4: The Agent — Debugging a Failure (Agent Edge Case)

The agent is implementing story US-005: "Admin can view all user activity." Tests pass. But during verification, the API returns 200 with an empty array — even though users exist in the database.

**Opening:** Showboat verification captures: `curl localhost:3000/api/admin/activity` returns `{"data": []}`. DB MCP query shows 15 activity records exist. Verification fails.

**Rising Action:** The agent queries VictoriaLogs: searches for the request trace. Finds the trace — the SQL query is `SELECT * FROM activity WHERE tenant_id = ?` but `tenant_id` is `null`. The agent reads the application log: "No tenant context found in request." Root cause identified on first attempt — the admin route is missing the tenant middleware.

**Climax:** The agent adds the tenant middleware to the admin route, adds a structured log entry for tenant resolution, reruns. VictoriaLogs now shows `tenant.resolved: 42`. The API returns 15 activity records. DB state matches API response.

**Resolution:** `showboat verify` passes. Without VictoriaMetrics, the agent would have guessed — maybe the query is wrong? Maybe the table is empty? Maybe the endpoint is hitting the wrong DB? With logs and traces, it found the exact issue in one iteration.

---

### Journey 5: Community Contributor

Maria finds codeharness on GitHub. She uses BMAD for her team's projects and wants to add a verification pattern for GraphQL APIs (codeharness currently handles REST).

**Opening:** She reads the plugin structure — knowledge files in `knowledge/`, verification patterns in `skills/`. She sees how REST API verification works in `verification-enforcement.md`.

**Rising Action:** She writes a `graphql-verification.md` skill that teaches the agent how to verify GraphQL queries and mutations using real `curl` calls with GraphQL payloads. She adds a knowledge file explaining GraphQL introspection for schema verification.

**Resolution:** She submits a PR. The maintainers review it, and it's merged. GraphQL projects can now use codeharness with proper API verification. The community grows.

### Journey 6: Alex — Onboarding an Existing Project (Brownfield)

Alex has a 6-month-old Node.js API with 40% test coverage, a README, some JSDoc, and no ARCHITECTURE.md. He wants the harness guarantees but can't rewrite from scratch.

**Opening:** Alex installs codeharness and runs `/harness-init` (sets up Victoria, hooks, OTLP). Then he runs `/harness-onboard`.

**Rising Action:** The onboard command scans his project: 23 source files across 5 modules, 40% coverage (12 files uncovered), README exists but is stale, no ARCHITECTURE.md, no per-module docs. It generates: root AGENTS.md from actual project structure, a draft ARCHITECTURE.md from code analysis, docs/ scaffold with index.md pointing to his existing README and planning artifacts. Then it produces a coverage gap report and an **onboarding epic** with 8 stories: 5 coverage stories (one per module), 1 architecture doc story, 1 AGENTS.md per-module story, 1 doc freshness story.

**Climax:** Alex reviews the onboarding plan, approves it, and runs `/harness-run`. The Ralph loop picks up the onboarding stories. Story 1: write tests for the `auth` module — 100% coverage for that module, Showboat proof showing all tests pass. Story 2: write tests for `routes` module. By story 5, project-wide coverage is 100%. Story 6: the agent generates ARCHITECTURE.md with accurate module descriptions. Story 7: per-module AGENTS.md files created. Story 8: README and inline docs updated.

**Resolution:** `/harness-status` shows: 100% coverage, 5/5 modules with AGENTS.md, ARCHITECTURE.md current, docs/quality-score.md all green. The project is fully harnessed. Future sprints maintain these standards — the harness won't let them degrade.

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| **Alex — New Project** | Install, init with config, VictoriaMetrics setup, OTLP instrumentation, multi-level verification, Showboat proof, BMAD integration |
| **Alex — Migrating from bmalph** | Auto-detection of existing setup, harness patch application, selective enforcement config, bmalph replacement, mandatory retro with follow-up |
| **Alex — Brownfield Onboarding** | Codebase scan, AGENTS.md generation, ARCHITECTURE.md discovery, coverage gap analysis, onboarding epic generation, self-bootstrapping through Ralph loop |
| **Agent — Happy Path** | SessionStart verification, PostToolUse hooks, VictoriaLogs querying, agent-browser interaction, Showboat evidence capture, commit gating |
| **Agent — Debug Failure** | VictoriaLogs trace querying, root cause identification via logs, iterative verification loop, structured logging validation |
| **Community Contributor** | Plugin extensibility, knowledge file patterns, skill authoring, PR workflow |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Harness Engineering as a Distributable Plugin**

OpenAI's Harness Engineering is proven at scale (1M lines, 5 months) but exists only as internal infrastructure. No one has packaged the pattern — ephemeral observability, browser access for agents, mechanical enforcement, proof-of-work verification — as an installable, reusable plugin. codeharness bridges the gap between "published blog post" and "anyone can use it." This is a new paradigm for developer tooling: productizing an engineering methodology as a plugin.

**2. Verification-as-Proof, Not Verification-as-Testing**

Traditional verification: run tests → pass/fail → trust the result. codeharness verification: run real interactions → capture evidence → produce reproducible proof document → re-verify independently. The Showboat proof document is not a test report — it's an executable artifact that anyone can re-run to confirm the outputs match.

**3. Agent-First Observability**

Observability tools (Grafana, Datadog, Kibana) are built for humans. codeharness provides observability specifically for the agent to query programmatically during development. The agent uses LogQL/PromQL to understand runtime behavior. Ephemeral per-task stacks (spun up when a story starts, torn down when complete) are a new pattern — only seen in OpenAI's internal setup before this.

**4. Anti-Cheating by Architecture**

Most autonomous loops trust the agent's self-report. codeharness makes cheating structurally difficult: Showboat's `exec` captures real command output (`verify` re-runs everything). Hooks block commits without proof. agent-browser's `diff snapshot` provides before/after structural comparison. The constraints are architectural — the agent CAN'T skip verification, not "shouldn't."

### Market Context & Competitive Landscape

- **OpenAI Harness Engineering** — Internal only, not available as a plugin. Validates the approach.
- **claude-code-harness** — Focused on code review loops, not real-world verification or observability.
- **ralphex** — Multi-agent code review, no real-world verification.
- **Vibe Kanban** — Task orchestration with visual review, no observability or proof-of-work.
- **No direct competitor** combines all four innovation areas in a single tool.

### Validation Approach

1. **Dogfooding** — Build codeharness using codeharness (from Phase 1 onward)
2. **Showboat verify reliability** — Track pass rate. Target: >98%
3. **Agent debug efficiency** — Measure root cause identification with vs. without VictoriaMetrics. Target: >70%
4. **User trust survey** — After 3 months, do users manually re-check after verification? If not, trust is established.

### Innovation Risk Mitigation

Covered in Project Scoping & Phased Development → Risk Mitigation Strategy.

## Developer Tool Specific Requirements

### Project-Type Overview

codeharness is a Claude Code plugin (markdown + bash + JSON, no build step) that harnesses projects built in Node.js or Python (MVP). The plugin itself has no language runtime — it's pure Claude Code plugin artifacts. The complexity is in orchestrating external tools (VictoriaMetrics, agent-browser, Showboat) and configuring them correctly per project stack.

### Technical Architecture Considerations

**Plugin architecture:** Commands, skills, hooks, agents, MCP config, knowledge files, templates. No compiled code. Claude Code auto-discovers all components from plugin directory structure.

**External tool dependencies (auto-installed during `/harness-init`):**
- **Docker** — Required for VictoriaMetrics stack
- **Showboat** — Python CLI, installed via `uvx showboat` (auto-install)
- **agent-browser** — Rust binary, installed via npm or direct download (auto-install)
- **OpenTelemetry packages** — Per-stack, installed into the target project

**Stack detection and auto-instrumentation (MVP):**

| Stack | Detection | Install | Run Wrapper | Auto-Instruments |
|-------|-----------|---------|-------------|-----------------|
| **Node.js** | `package.json` exists | `npm install @opentelemetry/auto-instrumentations-node` | `node --require @opentelemetry/auto-instrumentations-node/register app.js` | HTTP, Express, Fastify, pg, mysql, redis, etc. |
| **Python** | `requirements.txt` or `pyproject.toml` exists | `pip install opentelemetry-distro opentelemetry-exporter-otlp` + `opentelemetry-bootstrap -a install` | `opentelemetry-instrument python app.py` | Flask, Django, FastAPI, psycopg2, SQLAlchemy, requests, etc. |

**OTLP environment variables (set by `/harness-init`):**
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=<project-name>
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
```

Zero code changes to the application. Auto-instrumentation captures HTTP requests, DB queries, errors, and traces automatically.

### Command Surface

| Command | Purpose |
|---------|---------|
| `/harness-init` | Set up harness: detect stack, configure enforcement, start Victoria stack, install OTLP, configure MCP, install hooks |
| `/harness-verify` | Run verification pipeline: quality gates → real-world verification → Showboat proof |
| `/harness-status` | Show harness state: what's configured, what's running, verification history |
| `/harness-run` | Start autonomous Ralph loop with verification gates per story |
| `/harness-teardown` | Clean up: stop Docker stack, remove hooks (non-destructive to project code) |

### Enforcement Configuration (per-project, saved in `.claude/codeharness.local.md`)

| Setting | Default | User Confirms |
|---------|---------|---------------|
| Frontend/UI verification (agent-browser) | ON | "Does this project have a frontend?" |
| Database verification (DB MCP) | ON | "Does this project use a database?" |
| API verification (real HTTP calls) | ON | "Does this project have APIs?" |
| Full observability (VictoriaMetrics) | ON | "Is this a simple tool/utility?" → if yes, OFF |
| OTLP auto-instrumentation | ON | Automatic based on stack detection |

### Implementation Considerations

- **No build step** — Plugin is pure markdown + bash + JSON + YAML
- **Auto-install strategy** — `/harness-init` checks for each dependency, installs if missing, reports what was installed
- **Non-destructive** — `/harness-teardown` removes harness artifacts but never touches project source code
- **Idempotent init** — Running `/harness-init` twice is safe — detects existing config, updates if needed
- **BMAD detection** — If `_bmad/` exists, BMAD integration skill activates automatically

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — deliver the core harness that makes autonomous development produce verifiably working software. BMAD/bmalph integration is the primary use case. Standalone mode is available but secondary.

**Resource Requirements:** Solo developer (creator), Claude Code with codeharness (dogfooding). External dependencies: Docker, Showboat, agent-browser — all auto-installed.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Alex — New BMAD project with full harness (Journey 1)
- Alex — Existing bmalph project, add codeharness (Journey 2)
- Agent — Developing with harness, full visibility (Journey 3)
- Agent — Debugging failure using observability (Journey 4)

**Must-Have Capabilities:**

| Capability | What | Why MVP |
|-----------|------|---------|
| One-command install | `claude plugin install codeharness`. Installs BMAD (npm dep), vendors Ralph, sets up harness. Replaces bmalph. | First impression, zero friction |
| `/harness-init` | Detect stack, configure enforcement, start Victoria, install OTLP, configure MCP, install hooks | The harness setup IS the product |
| Configurable enforcement | Per-project opt-out of UI/DB/API/Victoria verification. Max by default. | Different projects need different harness levels |
| Per-commit quality gates | Tests, lint, typecheck before commit | Lightweight, always-on |
| Per-story verification | Full real-world verification: agent-browser + API calls + DB inspection + Showboat proof | The core value proposition |
| Showboat proof documents | Reproducible evidence per story, `showboat verify` re-runs | Trust through proof |
| Enforced visibility | Hooks ensure agent queries VictoriaLogs/Traces during development | "Give the agent eyes" |
| VictoriaMetrics stack | Ephemeral Docker Compose: VictoriaLogs + VictoriaMetrics + VictoriaTraces + OTel Collector | Agent-first observability |
| OTLP auto-instrumentation | Node.js and Python zero-code instrumentation | Zero friction visibility for developed project |
| BMAD ownership | Install BMAD (npm dep), apply harness patches to workflows | codeharness IS the BMAD distribution |
| BMAD patching | Patch story templates, dev workflow, code review, retro with harness requirements | Harness wired into every phase |
| Ralph loop | Vendored `snarktank/ralph` with verification-aware BMAD→task bridge | Fresh context, process control |
| bmalph migration | Detect existing bmalph, preserve artifacts, apply patches, take over | Smooth migration path |
| Mandatory retrospective | Auto-trigger retro after sprint, analyze verification data, produce actionable follow-up | Self-correcting development loop |
| Standalone mode | Works without BMAD for any task list | Secondary, but supported |
| `/harness-verify` | Manual verification trigger outside autonomous loop | For manual development or spot-checks |
| `/harness-run` | Start autonomous Ralph loop with verification gates | Autonomous execution |
| `/harness-status` | Show harness state, verification history | User visibility into harness |
| `/harness-teardown` | Stop Docker stack, remove hooks (non-destructive) | Clean exit |
| `/harness-onboard` | Scan existing project, generate AGENTS.md + docs/ + coverage gap report, produce onboarding epic with stories, execute through Ralph loop | Essential for brownfield adoption — most real projects aren't greenfield |

### Post-MVP Features

**Phase 2 (Growth):**
- Per-epic integration verification (all stories in epic work together)
- Per-PR/MR verification (verification before merge request)
- Configurable enforcement strictness (per-workflow: strict/relaxed)
- Per-retro verification (verify fixes from retrospective issues)
- Go stack support for OTLP auto-instrumentation
- Multi-platform drivers (Codex, OpenCode)

**Phase 3 (Expansion):**
- Structural constraint generation (auto-generate linters/structural tests from architecture)
- Multi-methodology support (GSD, custom task formats beyond BMAD)
- Alternative observability backends (OpenSearch, remote/cloud-hosted)
- Multi-agent verification (parallel verification via Agent Teams)
- Cross-project harness templates (pre-configured profiles per stack)
- Verification analytics (track patterns across sprints)

### Risk Mitigation Strategy

**Technical Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker not available | Can't run Victoria stack | Detect during init, clear error. Docker is a hard requirement. |
| agent-browser instability | Browser verification unreliable | Fallback to Playwright MCP. Both configured. |
| Showboat breaking changes | Proof format changes | Pin version. Monitor upstream. |
| Hook conflicts with other plugins | Multiple plugins on Stop event | Detect installed plugins, warn, offer to take over. |
| OTLP auto-instrumentation gaps | Some frameworks not covered | Knowledge files with manual instrumentation as fallback. |
| Context window pressure | Verification consumes tokens | Use subagents for verification — isolated context. |
| Harness too complex for casual users | Low adoption | Configurable enforcement — max by default, explicit opt-out for what doesn't apply |
| Showboat proof docs become bloated | Slow verification | Keep proof lean — only AC-relevant evidence, not exhaustive logs |
| VictoriaMetrics overhead on dev machines | Slow development | Simple tool mode skips Victoria. Future: remote backends. |
| Hooks slow down fast iteration | Developer friction | Per-commit gates are lightweight (tests/lint). Heavy verification is per-story, not per-commit. |

**Market Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI releases official harness plugin | Direct competition | codeharness is Claude Code-native. First-mover advantage. |
| bmalph adds verification natively | Core value absorbed | codeharness is deeper: Showboat proof + VictoriaMetrics + mechanical enforcement. |
| Low adoption | No traction | Dogfood first. Solve creator's own problem. |

**Resource Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Solo developer, limited time | Slow progress | Phased approach. Dogfooding accelerates. |
| External dependencies change | Breaking updates | Pin versions. Monitor upstream. |

## Functional Requirements

### Harness Setup & Configuration

- FR1: User can install codeharness with a single command (`claude plugin install codeharness`)
- FR2: User can initialize the harness in a project via `/harness-init`
- FR3: System can detect the project's technology stack (Node.js via `package.json`, Python via `requirements.txt`/`pyproject.toml`)
- FR4: System can install BMAD Method via `npx bmad-method init` as part of `/harness-init`
- FR5: System can detect existing BMAD/bmalph installation and migrate (preserve artifacts, apply harness patches, take over execution)
- FR6: User can configure enforcement levels during init (frontend, database, API, VictoriaMetrics) with max-enforcement defaults
- FR7: System can persist enforcement configuration per project (`.claude/codeharness.local.md`)
- FR8: System can auto-install external dependencies (Docker check, Showboat, agent-browser, OTLP packages)
- FR9: User can re-run `/harness-init` idempotently without breaking existing configuration
- FR10: User can tear down the harness via `/harness-teardown` without affecting project source code

### Observability Stack

- FR11: System can start an ephemeral VictoriaMetrics stack via Docker Compose (VictoriaLogs + VictoriaMetrics + VictoriaTraces + OTel Collector)
- FR12: System can install OTLP auto-instrumentation for Node.js projects (zero code changes)
- FR13: System can install OTLP auto-instrumentation for Python projects (zero code changes)
- FR14: System can configure OTLP environment variables pointing to the local OTel Collector
- FR15: Agent can query VictoriaLogs via LogQL to inspect application runtime logs
- FR16: Agent can query VictoriaMetrics via PromQL to inspect application metrics
- FR17: Agent can trace request flows via VictoriaTraces
- FR18: System can verify the observability stack is running (SessionStart hook)

### Real-World Verification

- FR19: Agent can verify UI features by interacting with the application via agent-browser (navigate, click, fill, screenshot)
- FR20: Agent can verify API endpoints by making real HTTP calls and inspecting response bodies AND side effects
- FR21: Agent can verify database state via Database MCP (read-only queries)
- FR22: Agent can verify runtime behavior by querying VictoriaLogs for expected log entries
- FR23: Agent can capture verification evidence in Showboat proof documents (`showboat exec`, `showboat image`)
- FR24: Agent can re-verify proof documents via `showboat verify` to confirm outputs match
- FR25: Agent can take annotated screenshots via agent-browser for visual evidence
- FR26: Agent can diff before/after states via agent-browser's snapshot diffing

### Verification Levels

- FR27: System can enforce per-commit quality gates (tests, lint, typecheck) via PreToolUse hook
- FR28: System can enforce per-story verification (full real-world verification + Showboat proof) before story completion
- FR29: System can block git commits without prior quality gate pass (PreToolUse hook)
- FR30: System can block story completion without Showboat proof document

### Enforcement & Hooks

- FR31: System can enforce that the agent queries VictoriaLogs/VictoriaTraces during development (PostToolUse hooks)
- FR32: System can inject verification prompts after code changes (PostToolUse: Write/Edit)
- FR33: System can verify OTLP instrumentation is present in new code (PostToolUse hook)
- FR34: System can control autonomous loop iteration (Stop hook: continue/terminate based on verification state)
- FR35: System can track verification state per story (what's verified, what's pending)

### BMAD Ownership

- FR36: System can read BMAD sprint plans from `_bmad-output/planning-artifacts/`
- FR37: System can map BMAD stories to verification tasks
- FR38: System can produce per-story Showboat proof documents matching BMAD story identifiers
- FR39: System can update BMAD sprint status after story verification
- FR40: System can apply harness patches to BMAD story templates (add verification requirements)
- FR41: System can apply harness patches to BMAD dev story workflow (enforce observability during development)
- FR42: System can apply harness patches to BMAD code review workflow (check Showboat proof exists)
- FR43: System can apply harness patches to BMAD retrospective workflow (review verification effectiveness, produce actionable follow-up)
- FR44: System can read BMAD acceptance criteria and map them to verification steps

### Autonomous Execution Loop

- FR45: System can run Ralph's autonomous loop (vendored `snarktank/ralph`) with fresh context per iteration
- FR46: System can bridge BMAD stories to Ralph execution tasks with verification requirements per story
- FR47: System can track iteration count, story progress, and verification state across loop iterations
- FR48: System can enforce verification gates within the Ralph loop (story not marked done without Showboat proof)
- FR49: System can handle loop termination (all stories done, max iterations reached, user cancellation)

### Sprint Retrospective & Follow-up

- FR50: System can trigger mandatory retrospective after each sprint completion
- FR51: System can analyze sprint verification data (pass rates, iteration counts, common failure patterns), documentation health (stale docs, quality grades), and test effectiveness (coverage trends, flaky tests) for retro input
- FR52: System can produce structured retro report (what worked, what didn't, verification effectiveness, debug efficiency, documentation health, test analysis)
- FR53: System can convert retro findings into actionable items: new stories for issues, BMAD workflow patches for process improvements, enforcement updates for verification gaps
- FR54: User can review and approve retro-generated items before they enter the next sprint backlog
- FR55: System can update BMAD sprint plan with approved retro follow-up items

### Standalone Mode

- FR56: User can use codeharness without BMAD installed
- FR57: User can provide a task list as a markdown checklist, JSON task list, or plain text (one task per line) for verification tracking
- FR58: User can trigger verification manually via `/harness-verify` for any development work

### Testing & Coverage

- FR62: System must enforce 100% project-wide test coverage as a quality gate before story completion
- FR63: Agent must write tests for all new code as part of story implementation (after implementation, before verification)
- FR64: Agent must write tests for any existing uncovered code discovered during story implementation
- FR65: System must block story completion if project-wide test coverage drops below 100%
- FR66: System must run all project tests as part of per-commit quality gates — all tests must pass
- FR67: System must report coverage delta per story (coverage added vs. coverage before)

### Documentation & Doc Health

- FR68: System must generate initial `AGENTS.md` during `/harness-init` as a ~100-line map with pointers to BMAD planning artifacts, project structure, build/test commands, conventions, and security notes
- FR69: Agent must create per-subsystem `AGENTS.md` files when creating new modules or subsystems (local, minimal, progressive disclosure)
- FR70: System must generate exec-plan files in `docs/exec-plans/active/` for each story at sprint start, derived from BMAD story definitions
- FR71: System must move exec-plan files from `active/` to `completed/` upon story verification, appending verification summary and Showboat proof link
- FR72: System must maintain `docs/index.md` as a map referencing BMAD planning artifacts in their native location (`_bmad-output/planning-artifacts/`) — no duplication, only pointers
- FR73: Doc-gardener subagent must scan for stale documentation (AGENTS.md referencing deleted code, docs not updated since code changed) and open fix-up tasks
- FR74: Doc-gardener subagent must generate `docs/quality/quality-score.md` with per-area documentation health grades
- FR75: Doc-gardener subagent must update `docs/exec-plans/tech-debt-tracker.md` with documentation debt items discovered during scans
- FR76: System must enforce doc freshness as part of story verification — AGENTS.md for changed modules must reflect current code
- FR77: System must enforce design-doc validation at epic completion — architectural decisions documented and ARCHITECTURE.md current
- FR78: System must generate `docs/quality/test-coverage.md` per sprint with coverage trends and per-story deltas
- FR79: System must generate `docs/generated/db-schema.md` from DB MCP queries when database enforcement is enabled
- FR80: BMAD retro workflow patch must include doc health analysis — stale doc count, quality grades, doc-gardener findings, documentation debt trends

### BMAD Workflow Documentation Integration

- FR81: BMAD dev-story workflow patch must require: update/create per-subsystem AGENTS.md for new modules, update exec-plan with progress, ensure inline code documentation
- FR82: BMAD code-review workflow patch must verify: AGENTS.md freshness for changed modules, exec-plan updated, test coverage report present
- FR83: BMAD sprint-planning workflow must verify: planning docs complete, ARCHITECTURE.md current, test infrastructure ready, coverage baseline recorded
- FR84: BMAD story template patch must include documentation requirements in acceptance criteria: which docs must be created or updated for the story

### BMAD Workflow Testing Integration

- FR85: BMAD dev-story workflow patch must enforce: tests written after implementation, 100% coverage before verification, all tests pass
- FR86: BMAD code-review workflow patch must verify: tests exist for all new code, coverage is 100%, no skipped or disabled tests
- FR87: BMAD retro workflow patch must analyze: test effectiveness (tests that caught real bugs vs. tests that never failed), coverage trends, flaky test detection

### Brownfield Project Onboarding

- FR88: User can onboard an existing project to full harness compliance via `/harness-onboard`
- FR89: System must scan existing codebase structure, detect modules/subsystems, and map dependencies during onboarding
- FR90: System must generate root `AGENTS.md` and per-subsystem `AGENTS.md` files from actual code structure during onboarding
- FR91: System must discover or generate `ARCHITECTURE.md` — if one exists, validate freshness; if not, generate from code analysis
- FR92: System must set up `docs/` structure with `index.md` mapping to existing project documentation (README, inline docs, existing specs)
- FR93: System must run coverage analysis and produce a coverage gap report: uncovered files/lines, estimated effort per module, prioritized by risk
- FR94: System must generate an onboarding epic with stories for reaching full harness compliance: coverage gap stories (per module), doc gap stories, architecture doc stories
- FR95: System must audit existing documentation (README, JSDoc/docstrings, inline comments) and produce a doc quality report with freshness assessment
- FR96: System must generate initial `docs/generated/db-schema.md` from DB MCP if database enforcement is enabled
- FR97: User can review and approve the onboarding plan (epic + stories) before execution begins
- FR98: System must execute onboarding stories through the normal Ralph loop with verification — the onboarding IS the first sprint
- FR99: System must track onboarding progress in `/harness-status` showing compliance percentage (coverage, docs, AGENTS.md files)

### Status & Reporting

- FR59: User can view harness status via `/harness-status` (configured enforcement, stack state, verification history)
- FR60: System can generate a verification summary per story (pass/fail per AC, evidence links)
- FR61: System can maintain a verification log across the sprint (which stories verified, iteration counts)

### Out of Scope (Explicitly Excluded)

- Beads issue tracker integration — evaluated during research but excluded from MVP and post-MVP scope. Sprint task tracking is handled via BMAD sprint plans or standalone task lists, not Beads.

## Non-Functional Requirements

### Performance

- NFR1: Hook execution (PreToolUse, PostToolUse) must complete within 500ms as measured by hook script timer
- NFR2: VictoriaLogs queries must return results within 2 seconds as measured by curl request round-trip time
- NFR3: `showboat verify` must complete re-run within 5 minutes for a typical story (10-15 verification steps)
- NFR4: VictoriaMetrics Docker stack must start within 30 seconds during `/harness-init`
- NFR5: OTLP auto-instrumentation must add <5% latency overhead to the developed application as measured by load test comparison with and without instrumentation enabled

### Integration

- NFR6: Plugin must coexist with other Claude Code plugins without hook conflicts (detect and warn)
- NFR7: Plugin must work with Claude Code plugin system version as of March 2026
- NFR8: VictoriaMetrics stack must use pinned Docker image versions for reproducibility
- NFR9: agent-browser and Showboat versions must be pinned and tested for compatibility
- NFR10: OTLP instrumentation must work with standard OpenTelemetry SDK versions
- NFR11: Database MCP must support PostgreSQL, MySQL, and SQLite at minimum
- NFR12: BMAD integration must work with BMAD Method v6+ artifact format
- NFR13: Plugin must not modify project source code during `/harness-teardown`

### Reliability

- NFR14: If VictoriaMetrics stack crashes, the harness must detect and report it (not silently fail)
- NFR15: If agent-browser is unavailable, the harness must fall back gracefully (skip UI verification with warning)
- NFR16: Hook failures must produce clear error messages, not silent blocks
- NFR17: State file (`.claude/codeharness.local.md`) must be recoverable if corrupted
- NFR18: BMAD installation via `npx bmad-method init` must complete within 60 seconds
- NFR19: BMAD harness patches must be idempotent — applying patches twice produces the same result
- NFR20: Retrospective report generation must complete within 30 seconds using sprint verification data

### Testing & Coverage

- NFR21: Test suite must complete execution within 5 minutes for per-commit quality gates as measured by test runner wall-clock time
- NFR22: Coverage measurement must include all application source code (excluding test files, configuration, and generated code) as reported by the stack's native coverage tool (c8/istanbul for Node.js, coverage.py for Python)

### Documentation

- NFR23: Doc-gardener subagent must complete a full documentation scan within 60 seconds as measured by subagent execution time
- NFR24: AGENTS.md files must not exceed 100 lines — content beyond that must be in referenced docs (progressive disclosure)
- NFR25: `docs/index.md` must reference BMAD planning artifacts by relative path to `_bmad-output/planning-artifacts/` — never copy content
- NFR26: Doc freshness check must compare file modification timestamps against git log for corresponding source files
- NFR27: Generated documentation (`docs/generated/`, `docs/quality/`) must be clearly marked as auto-generated with "DO NOT EDIT MANUALLY" headers
