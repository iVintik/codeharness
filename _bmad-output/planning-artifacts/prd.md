---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - product-brief-bmad-orchestrator-2026-03-14.md
  - research/technical-bmad-orchestrator-implementation-research-2026-03-14.md
  - prd-v1 (existing completed PRD, used as context)
  - architecture.md (from .ralph/specs/planning-artifacts/)
  - audit-findings (current session gap analysis)
documentCounts:
  briefs: 1
  research: 1
  brainstorming: 0
  projectDocs: 3
workflowType: 'prd'
classification:
  projectType: developer_tool
  domain: general
  complexity: medium-high
  projectContext: brownfield
  designPhilosophy: executable-first
---

# Product Requirements Document - codeharness

**Author:** BMad
**Date:** 2026-03-14

## Executive Summary

codeharness is an npm CLI package and Claude Code plugin that makes autonomous coding agents produce software that actually works — not software that passes tests. It packages OpenAI's Harness Engineering discipline (1M lines of agent-generated production code) as an installable tool: real-world verification via Showboat proof documents, agent-first observability via an ephemeral VictoriaMetrics stack, and mechanical enforcement via Claude Code hooks that make skipping verification architecturally impossible.

Two problems kill autonomous development. First, agents write code that "passes tests" but breaks in use — UI that doesn't render, APIs that return 200 but do nothing, data operations that silently fail. Second, agents are blind to runtime behavior — they can't see logs, traces, or application state, so they guess at fixes instead of diagnosing root causes.

codeharness solves both through a Node.js CLI (`codeharness init`, `codeharness run`, `codeharness verify`) that automates the full harness lifecycle. The CLI replaces bmalph by owning BMAD installation (with harness-aware workflow patches), a vendored Ralph loop (with verification gates per story), and an executable BMAD-to-task bridge. The Claude Code plugin wraps the CLI, providing slash commands and hook-based enforcement — but all mechanical work runs in the CLI, not in markdown the agent interprets.

### What Makes This Special

- **Executable-first architecture:** Every capability is a CLI command backed by real code. PRD v1's failure was treating markdown instructions as implementation. v2 makes every "system can X" a function in the CLI, not a skill the agent reads and improvises.
- **Verification-as-proof:** Not "tests pass" but Showboat documents with real command output, screenshots, and DB state that anyone can re-verify with `showboat verify`.
- **Agent-first observability:** Ephemeral VictoriaMetrics stack the agent queries programmatically (LogQL/PromQL) during development — built for agents, not dashboards.
- **Anti-cheating by architecture:** Hooks block commits without proof. Showboat's exec→verify cycle captures real output. The agent structurally cannot skip verification.
- **BMAD distribution with harness built in:** codeharness installs BMAD, patches all workflows (story, dev, code review, retro), bridges stories to Ralph tasks, and runs the autonomous loop. One tool, not two.

### Known Implementation Gaps (from v1 audit)

The following issues were discovered during harness initialization and the full audit. This PRD must address each:

1. **Scan/coverage data contradicts itself.** `onboard.sh scan` reports "test files: 2" but then `onboard.sh coverage` says "ralph: 10 files, tests exist" while the onboarding epic generates a story for ralph test coverage. The CLI must produce consistent, non-contradictory scan results.

2. **Module detection is too aggressive.** Subdirectories with 1 file (`ralph/drivers/`) are treated as independent modules needing their own AGENTS.md and test coverage. The CLI must have a configurable minimum threshold for what counts as a module.

3. **BMAD patch templates directory doesn't exist.** `/harness-init` references `templates/bmad-patches/` but no such directory exists in the plugin. The CLI must own patch templates and apply them reliably.

4. **Docker Compose and OTLP templates missing.** `templates/docker-compose.harness.yml` and `templates/otel-collector-config.yaml` are referenced but don't exist. The CLI must generate these from embedded templates, not copy from missing files.

5. **Dependency auto-install commands are wrong.** `uvx install showboat` fails — `uvx` has no `install` subcommand. The CLI must use correct install commands (`uv tool install`, `pip install`, `npm install -g`) with proper fallback chains.

6. **Docker gating doesn't account for disabled observability.** Init halts on missing Docker even when observability is OFF. The CLI must only require Docker when the observability enforcement flag is enabled.

7. **README.md flagged as missing but never generated.** Scan and audit both flag it, but no story or init step creates one. Either generate it or stop flagging it.

8. **No executable orchestration exists.** Every `/harness-*` command is markdown the agent reads and improvises. The CLI must implement every init step, bridge operation, and verification gate as executable code.

Additionally, the full audit revealed:
- **Bridge doesn't parse BMAD stories.** `bridge.sh` accepts args but has no parsing logic. The CLI must implement real BMAD epic/story parsing.
- **Session flags are never set.** State file is created with all flags `false`, but nothing ever sets them to `true`. The CLI must update flags after test runs and verification.
- **Verifier subagent is never spawned.** Agent spec exists but nothing calls it. The CLI must orchestrate verification, not delegate to an unconnected subagent.
- **Retro never triggers.** Script exists but nothing invokes it after sprint completion. The CLI must trigger retros as part of the loop lifecycle.

## Project Classification

- **Project Type:** Developer tool — npm CLI package + Claude Code plugin
- **Domain:** General software development tooling
- **Complexity:** Medium-High — orchestration of external tools (VictoriaMetrics, agent-browser, Showboat, OTLP), BMAD integration, autonomous loop, Node.js CLI with Commander.js
- **Project Context:** Brownfield — Ralph loop vendored and working, hooks wired, bash utility scripts exist. ~40% implemented, ~60% missing (mostly the CLI layer and orchestration glue). PRD rewrite driven by implementation gap analysis.

## Success Criteria

### User Success

- **Verification trust:** When codeharness marks a story "verified," the feature works when tested manually. Target: >95% of verified stories hold up.
- **No manual re-checking:** User trusts Showboat proof documents without opening the browser themselves.
- **Debug efficiency:** With observability enabled, agent identifies root cause on first attempt. Target: >70%.
- **Zero-friction init:** `codeharness init` completes in <5 minutes. First verified story within first autonomous loop iteration.

### Business Success

- **Solve our own problem first:** Creator can autonomously produce complex features with real verification — no more "tests pass but nothing works."
- **3-month goal:** codeharness is stable enough to build real projects with. Full init→run→verify→retro cycle works end-to-end.
- **6-month goal:** Public release ready. Documentation complete, CLI published to npm.
- **12-month goal:** Community adoption begins. Contributors add verification patterns for new stacks.

### Technical Success

- **CLI completeness:** Every FR maps to a CLI command or subcommand. Zero markdown-as-implementation.
- **Showboat verify pass rate:** `showboat verify` confirms outputs match on re-run. Target: >98%.
- **Sustained autonomous run:** Agent works >4 hours without human intervention via vendored Ralph loop.
- **Iteration cycles per story:** Average implement→verify→fix loops before AC pass. Target: <3.
- **100% test coverage:** Enforced project-wide as a quality gate. No blind spots accumulate across stories.
- **All 12 known gaps resolved:** Every issue from the v1 audit is addressed by a specific FR and implemented in the CLI.

### Measurable Outcomes

| Metric | Target | Method |
|--------|--------|--------|
| Verified stories that actually work | >95% | Manual spot-check |
| Showboat verify pass rate | >98% | Automated re-run |
| Root cause on first attempt | >70% | Agent debug logs with observability |
| Init completion | <5 min | Timed CLI execution |
| Iterations per story | <3 | Loop counter via beads metadata |
| Sustained autonomous run | >4h | Session duration |
| Test coverage | 100% | Coverage tool per stack (c8, coverage.py) |
| Known gaps resolved | 12/12 | FR traceability matrix |

## User Journeys

### Journey 1: Alex — New Project with Full Harness

Alex is a senior developer building a SaaS prototype. He's used Claude Code with Ralph loops before but got burned — the agent said features were done, tests passed, but half the UI was broken and two API endpoints returned 200 with empty responses.

**Opening:** Alex runs `npm install -g codeharness`. In his new project directory, he runs `codeharness init`. The CLI detects Node.js from `package.json`, asks: "Frontend? Database? APIs? Observability?" — yes to all. It installs BMAD with harness patches, starts the VictoriaMetrics Docker stack, adds OTLP instrumentation to his start script, configures agent-browser and Postgres MCP in `.mcp.json`, writes `.claude/codeharness.local.md` with enforcement config. All automated, no markdown to read.

**Rising Action:** Alex runs BMAD planning through the Claude Code plugin — `/create-prd`, `/create-architecture`, `/create-epics-stories`. When ready, he runs `codeharness bridge --epics _bmad-output/planning-artifacts/epics.md` — the CLI parses his BMAD stories, extracts acceptance criteria, and imports them as beads issues with verification requirements per story. Then: `codeharness run`. The vendored Ralph loop starts, reading tasks from `bd ready`. Each iteration spawns a fresh Claude Code instance with the plugin loaded. Hooks enforce verification at every step.

**Climax:** Story 3 — user registration — completes. The Showboat proof document shows: agent-browser screenshot of the registration form filled and submitted, the success page rendered. `curl` output showing the POST response with the new user ID. A Postgres query via DB MCP showing the user row with correct email and hashed password. VictoriaLogs query showing the `user.created` log entry with trace ID. `showboat verify` re-runs everything — all outputs match. The CLI updates session flags and marks the story verified via `bd close`.

**Resolution:** Alex runs `codeharness status` — 5/5 stories verified, 100% test coverage, all Showboat proofs pass. He didn't open the browser once. The sprint took 4 hours of autonomous execution.

---

### Journey 2: Alex — Onboarding an Existing Project

Alex has a 6-month-old Node.js API with 40% test coverage, a stale README, and no architecture docs. He wants harness guarantees but can't start from scratch.

**Opening:** Alex runs `codeharness init` — sets up Victoria, hooks, OTLP. Then `codeharness onboard --project-dir .`.

**Rising Action:** The CLI scans his project: 23 source files across 5 modules, 40% coverage (12 files uncovered), README exists but stale, no ARCHITECTURE.md. It generates: root AGENTS.md from project structure, `docs/` scaffold with `index.md`. Then it produces a coverage gap report and an onboarding epic with 8 stories — 5 coverage stories (one per module), 1 architecture doc, 1 per-module AGENTS.md, 1 doc freshness. The CLI writes `ralph/onboarding-epic.md`.

**Climax:** Alex reviews the plan, approves it. `codeharness bridge --epics ralph/onboarding-epic.md` converts to tasks. `codeharness run` picks them up. Story 1: write tests for `auth` module — 100% coverage, Showboat proof showing all tests pass. By story 5, project-wide coverage is 100%. Stories 6-8: architecture doc and AGENTS.md files generated and verified.

**Resolution:** `codeharness status` shows: 100% coverage, 5/5 modules with AGENTS.md, ARCHITECTURE.md current. The project is fully harnessed. Future sprints maintain these standards — the harness won't let them degrade.

---

### Journey 3: The Agent — Developing with the Harness

The autonomous agent picks up story 3.2: "User can reset password via email." This is the agent's journey through the harness.

**Opening:** SessionStart hook fires — calls `codeharness status --check` to verify VictoriaMetrics stack is running, OTLP configured, agent-browser available. The agent has eyes.

**Rising Action:** The agent implements the password reset endpoint. PostToolUse hook fires after each file write — prompts the agent to verify OTLP instrumentation. The agent starts the dev server, queries VictoriaLogs: `level:error` returns nothing. Makes a real API call: `POST /api/reset-password` with a test email. Checks VictoriaLogs for the `password.reset.requested` trace — it's there. Checks DB via MCP — reset token row exists.

**Climax:** The agent opens agent-browser, navigates to the reset password page, fills in the email, submits. Takes an annotated screenshot. Navigates to the reset link (from DB token), enters new password, submits. Verifies login works with new password. Every step wrapped in `showboat exec`. The agent runs `showboat verify` — all outputs match. PreToolUse hook allows the commit because the CLI set `tests_passed`, `coverage_met`, and `verification_run` flags to `true`.

**Resolution:** The story is marked verified via `bd close`. The Showboat document contains 12 verification steps with real evidence. The agent moves to the next story.

---

### Journey 4: The Agent — Debugging a Failure

The agent is implementing story 3.5: "Admin can view all user activity." Tests pass. But during verification, the API returns 200 with an empty array — even though users exist in the database.

**Opening:** Showboat verification captures: `curl localhost:3000/api/admin/activity` returns `{"data": []}`. DB MCP query shows 15 activity records exist. Verification fails.

**Rising Action:** The agent queries VictoriaLogs — searches for the request trace. Finds it: the SQL query is `SELECT * FROM activity WHERE tenant_id = ?` but `tenant_id` is `null`. Application log: "No tenant context found in request." Root cause identified on first attempt — admin route is missing tenant middleware.

**Climax:** Agent adds tenant middleware, adds structured log for tenant resolution, reruns. VictoriaLogs now shows `tenant.resolved: 42`. API returns 15 activity records. DB state matches API response.

**Resolution:** `showboat verify` passes. Without VictoriaMetrics, the agent would have guessed — maybe the query is wrong? Maybe the table is empty? With logs and traces, it found the exact issue in one iteration.

---

### Journey 5: Community Contributor

Maria finds codeharness on GitHub. She uses BMAD for her team's projects and wants to add a verification pattern for GraphQL APIs.

**Opening:** She reads the CLI source — Commander.js commands in `src/commands/`, verification logic in `src/verify/`. She sees how REST API verification works.

**Rising Action:** She writes a GraphQL verification module that teaches the agent how to verify GraphQL queries and mutations using real `curl` calls with GraphQL payloads. She adds it to `src/verify/graphql.js` and registers it in the verification strategy registry.

**Resolution:** She submits a PR. Tests pass — she added tests for her module. The maintainers review, merge. GraphQL projects can now use codeharness with proper API verification.

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| **Alex — New Project** | CLI init with stack detection, enforcement config, Docker stack, OTLP instrumentation, BMAD install + patches, bridge, autonomous run, status reporting |
| **Alex — Brownfield Onboarding** | CLI onboard scan, coverage gap analysis, AGENTS.md generation, onboarding epic generation, self-bootstrapping through Ralph loop |
| **Agent — Happy Path** | SessionStart health check, PostToolUse hooks, VictoriaLogs querying, agent-browser interaction, Showboat evidence capture, CLI flag updates, commit gating |
| **Agent — Debug Failure** | VictoriaLogs trace querying, root cause identification via observability, iterative verification loop |
| **Community Contributor** | CLI extensibility, modular verification strategies, test infrastructure, PR workflow |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Harness Engineering as a Distributable CLI**

OpenAI's Harness Engineering is proven at scale (1M lines, 5 months) but exists only as internal infrastructure. codeharness packages the pattern — ephemeral observability, browser access for agents, mechanical enforcement, proof-of-work verification — as an npm CLI anyone can install. LangChain proved the harness matters more than the model (52.8% → 66.5% benchmark improvement from harness changes alone).

**2. CLI-Backed Plugin Architecture**

Claude Code plugins are typically pure markdown — commands, skills, and knowledge files that the agent reads and interprets. codeharness introduces a new pattern: the plugin is a thin wrapper around a Node.js CLI that does the real work. The CLI is testable, debuggable, and deterministic. The plugin provides the agent interface (hooks, slash commands) but delegates all mechanical work to CLI commands. This solves the "specification-implementation gap" that killed v1.

**3. Verification-as-Proof, Not Verification-as-Testing**

Traditional verification: run tests → pass/fail → trust. codeharness verification: run real interactions → capture evidence → produce reproducible proof document → re-verify independently. The Showboat proof document is an executable artifact, not a test report.

**4. Agent-First Observability**

Observability tools (Grafana, Datadog) are built for humans staring at dashboards. codeharness provides observability the agent queries programmatically during development via LogQL/PromQL. Ephemeral per-task stacks are a new pattern — only seen in OpenAI's internal setup before.

### Market Context & Competitive Landscape

- **OpenAI Harness Engineering** — Internal only. Validates the approach but not available as a tool.
- **bmalph** — BMAD + Ralph glue CLI. No verification, no observability, no enforcement. codeharness replaces it.
- **claude-code-harness** — Code review loops only. No real-world verification.
- **ralphex** — Multi-agent code review. No verification or observability.
- **No direct competitor** combines CLI-based harness engineering with BMAD distribution in a single npm package.

### Validation Approach

1. **Dogfooding** — Build codeharness using codeharness. The CLI builds itself.
2. **Showboat verify reliability** — Track pass rate across sprints. Target: >98%.
3. **Agent debug efficiency** — Measure root cause identification with vs. without VictoriaMetrics. Target: >70%.
4. **CLI vs. markdown comparison** — Compare v2 (CLI-backed) init success rate against v1 (markdown-only) init. Expect dramatic improvement.

### Innovation Risk Mitigation

Covered in Project Scoping & Phased Development → Risk Mitigation Strategy.

## Developer Tool Specific Requirements

### Project-Type Overview

codeharness is an npm CLI package (`codeharness`) distributed via npm, paired with a Claude Code plugin that wraps CLI commands as slash commands and hooks. The CLI is the engine; the plugin is the interface. No build step for the plugin — markdown + JSON. The CLI is standard Node.js with Commander.js.

### Technical Architecture Considerations

**CLI Architecture:**
- Node.js with Commander.js for command parsing
- Subcommands: `init`, `run`, `verify`, `bridge`, `status`, `teardown`, `onboard`
- Each subcommand maps to a module in `src/commands/`
- Shared libraries in `src/lib/` for state management, Docker orchestration, BMAD parsing, template generation
- Exit codes follow conventions: 0 success, 1 error, 2 invalid usage

**Plugin Architecture:**
- `.claude-plugin/plugin.json` manifest
- `commands/` — slash commands that invoke `codeharness <subcommand>`
- `hooks/` — bash scripts that call CLI for state checks and flag updates
- `skills/` — knowledge files for agent guidance (verification patterns, observability querying)
- `agents/` — subagent specs (verifier, doc-gardener)
- `knowledge/` — reference material (OTLP instrumentation, verification patterns)

**Target Stack Support (MVP):**

| Stack | Detection | OTLP Instrumentation | Coverage Tool |
|-------|-----------|---------------------|---------------|
| Node.js | `package.json` | `@opentelemetry/auto-instrumentations-node` via `--require` | c8 / istanbul |
| Python | `requirements.txt` / `pyproject.toml` | `opentelemetry-distro` via `opentelemetry-instrument` wrapper | coverage.py |

### Installation & Distribution

```bash
npm install -g codeharness
```

Single package, global install. The CLI bundles:
- Commander.js command structure
- Embedded templates (Docker Compose, OTLP config, BMAD patches, Showboat template)
- Vendored Ralph loop (bash, invoked by CLI)
- Plugin scaffold (generated into project during `codeharness init`)

No yarn/pnpm alternatives needed. npm is the distribution channel.

### Documentation

- **README.md** — Quick start, installation, command reference, architecture overview
- **Self-documenting** — `codeharness init` generates the project's documentation structure (`docs/`, `AGENTS.md`, `ARCHITECTURE.md`) as part of harness setup. The harness creates the documentation it enforces.
- **In-repo docs** — Plugin knowledge files serve as both agent context and developer reference

### Migration from bmalph

No formal migration command. `codeharness onboard` handles existing projects including those with bmalph:
- Detects `_bmad/` and `.ralph/` directories
- Preserves existing BMAD artifacts
- Comments on bmalph-specific files that are superseded (e.g., `.ralph/.ralphrc`, bmalph CLI config)
- Applies harness patches to existing BMAD workflows
- Generates onboarding epic that includes cleanup of bmalph-specific artifacts as a story

### Implementation Considerations

- **No build step for plugin** — Plugin artifacts are declarative (markdown, JSON, bash). Only the CLI needs compilation/testing.
- **CLI testing** — Mocha/Vitest for unit tests, BATS for bash script integration tests (Ralph loop, hooks)
- **Template embedding** — Templates compiled into CLI package, not copied from external directories. Solves the "missing templates" gap from v1.
- **Idempotent operations** — Every CLI command is safe to re-run. `init` twice = same result. `bridge` twice = same progress.json.
- **State file as contract** — `.claude/codeharness.local.md` is the single source of truth. CLI reads and writes it. Hooks read it. Plugin skills reference it.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — deliver the complete harness lifecycle (init→bridge→run→verify→status→onboard→teardown) as a working CLI with beads as the unified task store. The full cycle must work end-to-end. No partial implementations.

**Resource Requirements:** Solo developer with Claude Code (dogfooding). External dependencies: Docker, Showboat, agent-browser, beads — auto-installed by CLI.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Alex — New Project (Journey 1): full init→bridge→run→verify cycle
- Alex — Brownfield Onboarding (Journey 2): onboard→bridge→run cycle
- Agent — Developing with Harness (Journey 3): hooks + verification + observability
- Agent — Debugging a Failure (Journey 4): observability querying

**Must-Have Capabilities:**

| Capability | CLI Command | What It Does |
|-----------|-------------|--------------|
| Harness setup | `codeharness init` | Stack detection, enforcement config, dependency install (including beads), Docker stack (if observability ON), OTLP instrumentation, BMAD install + patches, state file, plugin scaffold |
| BMAD→beads bridge | `codeharness bridge` | Parse BMAD epics/stories, extract ACs, import as beads issues with type=story, link to story files, set priorities from sprint order |
| Autonomous execution | `codeharness run` | Vendored Ralph loop reading from beads (`bd ready`), fresh context per iteration, circuit breaker, crash recovery, verification gates per story |
| Verification pipeline | `codeharness verify` | Quality gates → real-world verification → Showboat proof → flag updates → `bd update` status |
| Status reporting | `codeharness status` | Harness health, sprint progress (from beads), verification state, Docker stack state |
| Brownfield onboarding | `codeharness onboard` | Codebase scan, coverage gap analysis, doc audit, findings created as beads issues, onboarding epic generation |
| Clean teardown | `codeharness teardown` | Stop Docker stack, remove harness artifacts, preserve project code and beads data |
| Issue tracking | beads (`bd`) | Unified task store for stories, bugs, tech debt, retro findings. `bd ready` feeds Ralph. `bd create` from agent/hooks/retro/onboard. Git-synced JSONL. |
| Hook enforcement | 4 hooks | Session start health check, pre-commit gate, post-write OTLP check, post-test verify prompt. Hooks can `bd create` when problems detected. |
| State management | CLI lib | Read/write `.claude/codeharness.local.md`, update session flags after tests/verification |
| BMAD patches | CLI lib | Apply harness patches to story template, dev workflow, code review, retro. Idempotent. Sprint planning patch integrates `bd ready` for backlog. |
| Stack support | CLI lib | Node.js + Python OTLP auto-instrumentation and coverage tools |

**Beads Integration Details:**

| Source | Entry Mechanism | Beads Fields |
|--------|----------------|-------------|
| BMAD stories | `codeharness bridge --import-to-beads` | type=story, priority from sprint order, description links to story file |
| Bugs during dev | Agent runs `bd create` | type=bug, priority, `discovered-from:<story-id>` |
| Onboard findings | `codeharness onboard` | type=task, priority from severity |
| Retro follow-ups | `codeharness retro` (post-MVP, created manually for MVP) | type=task, priority from severity |
| Hook findings | Hook scripts run `bd create` | type=bug, priority=1 |
| Manual | User runs `bd create` | Any type/priority |

**Two-Layer Model:**
- **Beads** = status, ordering, dependencies (which task, what priority, what's blocked)
- **Story files** = content (ACs, dev notes, tasks/subtasks, verification requirements)
- Bridge maintains the link: beads issue description contains path to story file
- Ralph does `bd ready` → gets issue → reads linked story file → implements → `bd close`

### Post-MVP Features

**Phase 2 (Growth):**
- `codeharness retro` — mandatory retrospective, auto-creates beads issues from findings
- Go stack support for OTLP auto-instrumentation
- Per-epic integration verification
- Configurable enforcement strictness (strict/relaxed)
- Multi-platform drivers (Codex, OpenCode)

**Phase 3 (Expansion):**
- Structural constraint generation from architecture
- Multi-methodology support (GSD, custom task formats)
- Alternative observability backends (OpenSearch, remote/cloud)
- Verification analytics across sprints
- Community verification patterns (pluggable per domain)

### Risk Mitigation Strategy

**Technical Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Docker unavailable | No observability stack | Observability is opt-out. CLI skips Docker when disabled. |
| agent-browser instability | Browser verification fails | Fallback to Playwright MCP. Both configurable. |
| Showboat breaking changes | Proof format breaks | Pin version in package.json. |
| Beads git hooks conflict with codeharness hooks | Double hook firing, commit issues | `codeharness init` detects beads hooks, configures coexistence. Test hook ordering. |
| Beads ↔ story file sync drift | Beads says "done" but story file says "in-progress" | Bridge maintains bidirectional sync. `bd close` triggers story file status update via CLI. |
| Ralph loop bash + Node.js CLI mismatch | Integration complexity | CLI invokes Ralph via `child_process.spawn`. Ralph reads beads via `bd ready --json`. |
| BMAD Method upstream changes | Patches break | Pin BMAD version. |

**Market Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI releases official harness tool | Direct competition | codeharness is Claude Code-native. First-mover. |
| bmalph adds verification natively | Core value absorbed | codeharness is deeper: Showboat + VictoriaMetrics + mechanical enforcement + CLI. |
| Beads abandoned upstream | Dependency dies | Beads is simple (JSONL + CLI). Fork or replace with built-in if needed. |

**Resource Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Solo developer, limited time | Slow progress | CLI-first: each command independently testable and shippable. |
| External dependency churn | Breaking updates | Pin all versions. Lock file. |

## Functional Requirements

### Harness Setup & Configuration

- FR1: User can install codeharness as a global npm package (`npm install -g codeharness`)
- FR2: User can initialize the harness in a project via `codeharness init`
- FR3: System can detect the project's technology stack (Node.js, Python) from indicator files
- FR4: System can install BMAD Method as part of init and apply harness patches to all BMAD workflows
- FR5: System can detect existing BMAD/bmalph installations, preserve artifacts, and apply harness patches
- FR6: User can configure enforcement levels during init (frontend, database, API, observability) with max-enforcement defaults
- FR7: System can persist enforcement configuration in `.claude/codeharness.local.md` with YAML frontmatter
- FR8: System can auto-install external dependencies (Showboat, agent-browser, beads, OTLP packages) with correct install commands and fallback chains
- FR9: System can check Docker availability only when observability enforcement is enabled
- FR10: User can re-run `codeharness init` idempotently without breaking existing configuration
- FR11: User can tear down the harness via `codeharness teardown` without affecting project source code or beads data

### Observability Stack

- FR12: System can generate a Docker Compose file from embedded templates based on enforcement config
- FR13: System can start/stop an ephemeral VictoriaMetrics stack (VictoriaLogs + VictoriaMetrics + VictoriaTraces + OTel Collector)
- FR14: System can install OTLP auto-instrumentation for Node.js projects (zero code changes, `--require` flag in start script)
- FR15: System can install OTLP auto-instrumentation for Python projects (zero code changes, `opentelemetry-instrument` wrapper)
- FR16: System can configure OTLP environment variables pointing to the local OTel Collector
- FR17: Agent can query VictoriaLogs via LogQL to inspect application runtime logs
- FR18: Agent can query VictoriaMetrics via PromQL to inspect application metrics
- FR19: Agent can trace request flows via VictoriaTraces

### Real-World Verification

- FR20: Agent can verify UI features by interacting with the application via agent-browser
- FR21: Agent can verify API endpoints by making real HTTP calls and inspecting response bodies and side effects
- FR22: Agent can verify database state via Database MCP (read-only queries)
- FR23: Agent can capture verification evidence in Showboat proof documents (`showboat exec`, `showboat image`)
- FR24: Agent can re-verify proof documents via `showboat verify` to confirm outputs match
- FR25: User can trigger verification manually via `codeharness verify` for any story

### Enforcement & Hooks

- FR26: System can enforce per-commit quality gates (tests pass, coverage met) via PreToolUse hook
- FR27: System can block git commits without prior quality gate pass
- FR28: System can inject verification prompts after code changes via PostToolUse hook
- FR29: System can verify harness health on session start (Docker stack, OTLP, agent-browser availability)
- FR30: System can update session flags in state file after test runs, coverage checks, and verification
- FR31: Hooks can create beads issues via `bd create` when problems are detected

### Issue Tracking (Beads Integration)

- FR32: System can install and configure beads as part of `codeharness init`
- FR33: System can import BMAD stories into beads as issues via `codeharness bridge`
- FR34: Agent can create beads issues during development for discovered bugs (`bd create` with `discovered-from` links)
- FR35: System can create beads issues from onboard scan findings
- FR36: System can create beads issues from hook-detected problems
- FR37: Sprint planning workflow can triage beads issues (`bd ready` for backlog)
- FR38: System can maintain bidirectional sync between beads issue status and story file status
- FR39: System can resolve beads git hook conflicts with codeharness hooks during init

### BMAD Integration

- FR40: System can read BMAD epics and stories from planning artifacts
- FR41: System can parse story acceptance criteria and map them to verification steps
- FR42: System can apply harness patches to BMAD story templates (add verification + documentation + testing requirements)
- FR43: System can apply harness patches to BMAD dev-story workflow (enforce observability, docs, tests)
- FR44: System can apply harness patches to BMAD code-review workflow (check Showboat proof, AGENTS.md freshness, coverage)
- FR45: System can apply harness patches to BMAD retrospective workflow (verification effectiveness, doc health, test quality)
- FR46: System can apply harness patches to BMAD sprint-planning workflow (integrate `bd ready` for backlog)

### Autonomous Execution Loop

- FR47: System can run the vendored Ralph loop with fresh context per iteration
- FR48: System can feed Ralph from beads via `bd ready --json` instead of progress.json
- FR49: System can enforce verification gates within the Ralph loop (story not done without Showboat proof)
- FR50: System can handle loop termination (all stories done, max iterations, user cancellation, circuit breaker)
- FR51: System can track iteration count, story progress, and verification state across loop iterations
- FR70: User can run `/harness-run` to execute one sprint autonomously in the current Claude Code session, iterating through stories using BMAD workflows (create-story → dev-story → code-review) and updating sprint-status.yaml. This is the single source of sprint execution logic — Ralph and all quality gates are implemented as consumers or enhancements of this skill, not as competing implementations.

### Testing & Coverage

- FR52: System can enforce 100% project-wide test coverage as a quality gate before story completion
- FR53: System can run all project tests as part of per-commit quality gates
- FR54: System can detect and use the appropriate coverage tool per stack (c8 for Node.js, coverage.py for Python)
- FR55: System can report coverage delta per story

### Documentation & Doc Health

- FR56: System can generate root AGENTS.md during init with project structure, build/test commands, and conventions
- FR57: System can generate docs/ scaffold (index.md, exec-plans/, quality/, generated/)
- FR58: System can scan for stale documentation and produce quality grades
- FR59: System can generate exec-plan files for active stories and move to completed/ upon verification
- FR60: System can enforce doc freshness as part of story verification (AGENTS.md for changed modules must reflect current code)

### Brownfield Onboarding

- FR61: User can onboard an existing project via `codeharness onboard`
- FR62: System can scan existing codebase, detect modules with configurable minimum threshold, and map dependencies
- FR63: System can run coverage analysis and produce a gap report
- FR64: System can audit existing documentation and produce a doc quality report
- FR65: System can generate an onboarding epic with stories, created as beads issues
- FR66: User can review and approve the onboarding plan before execution

### Status & Reporting

- FR67: User can view harness status via `codeharness status` (enforcement config, Docker stack state, beads summary, verification history)
- FR68: System can generate a verification summary per story (pass/fail per AC, evidence links)
- FR69: System can maintain a verification log across the sprint

### Retrospective Integration & GitHub Issue Loop

- FR71: System can auto-create beads issues and GitHub issues from retrospective findings (`codeharness retro-import --epic N`)
- FR72: System can import GitHub issues with `sprint-candidate` label into beads (`codeharness github-import`)
- FR73: System can create cross-project harness issues from retro findings (user's project repo + codeharness repo, configurable via `retro_issue_targets`)
- FR74: Sprint planning workflow consumes retro action items and GitHub-imported issues via beads (`bd ready`)

### Verification Pipeline Integrity & Sprint Infrastructure

- FR75: `codeharness verify` rejects proof files with unverified ACs — parses proof markdown, counts AC statuses, exits 1 if any are PENDING or showboat summary is FAIL
- FR76: Verifier agent captures real user-facing evidence via `showboat exec` (run binary, check output, check files) — unit test output is never valid AC evidence
- FR77: harness-run validates proof content after verification (parses proof, checks AC statuses, runs `showboat verify`) — does not trust agent text reports
- FR78: harness-run owns sprint-status.yaml updates and git commits — subagents do not commit or update sprint status
- FR79: Stories with ACs requiring integration testing (real session, real infrastructure) are detected during planning and flagged; verifier fails explicitly when it cannot produce real evidence

### Out of Scope (Explicitly Excluded)

- Go stack support (Phase 2)
- Multi-platform drivers beyond Claude Code (Phase 2)
- Structural constraint generation (Phase 3)
- Alternative observability backends (Phase 3)

## Non-Functional Requirements

### Performance

- NFR1: Hook execution (PreToolUse, PostToolUse, SessionStart) must complete within 500ms as measured by hook script timer
- NFR2: VictoriaLogs queries must return results within 2 seconds as measured by curl round-trip time
- NFR3: `showboat verify` must complete re-run within 5 minutes for a typical story (10-15 verification steps)
- NFR4: VictoriaMetrics Docker stack must start within 30 seconds during `codeharness init`
- NFR5: `codeharness init` must complete all steps within 5 minutes
- NFR6: OTLP auto-instrumentation must add <5% latency overhead to the developed application
- NFR7: `codeharness bridge` must parse a 50-story epic in under 10 seconds
- NFR8: `bd ready --json` must return results in under 1 second

### Integration

- NFR9: Plugin must coexist with other Claude Code plugins without hook conflicts (detect and warn)
- NFR10: Plugin must work with Claude Code plugin system version as of March 2026
- NFR11: VictoriaMetrics stack must use pinned Docker image versions for reproducibility
- NFR12: All external tool versions (Showboat, agent-browser, beads, OTLP packages) must be pinned in package.json
- NFR13: BMAD integration must work with BMAD Method v6+ artifact format
- NFR14: Beads git hooks must coexist with codeharness hooks without conflicts
- NFR15: Plugin must not modify project source code during `codeharness teardown`

### Reliability

- NFR16: If VictoriaMetrics stack crashes, the harness must detect and report it (not silently fail)
- NFR17: If agent-browser is unavailable, the harness must fall back gracefully (skip UI verification with warning)
- NFR18: Hook failures must produce clear error messages, not silent blocks
- NFR19: State file (`.claude/codeharness.local.md`) must be recoverable if corrupted — recreate from detected config
- NFR20: BMAD harness patches must be idempotent — applying patches twice produces the same result
- NFR21: Ralph loop must recover from crash and resume from last completed story
- NFR22: `codeharness init` must be idempotent — re-running preserves existing config and verification log
- NFR23: Doc-gardener scan must complete within 60 seconds
- NFR24: AGENTS.md files must not exceed 100 lines (progressive disclosure — details in referenced docs)
- NFR25: `docs/index.md` must reference BMAD artifacts by relative path — never copy content
- NFR26: Generated documentation (`docs/generated/`, `docs/quality/`) must have "DO NOT EDIT MANUALLY" headers
- NFR27: Module detection threshold must be configurable (default: 3 files minimum to count as a module)
- NFR28: Test suite for the CLI itself must complete within 5 minutes
- NFR29: Verification environment Docker image must build in <2 minutes

### Verification Integrity (added 2026-03-16, Sprint Change Proposal)

- FR80: System can generate per-project verification Dockerfile from embedded template — container has built artifact and docs only, no source code
- FR81: System can build and cache verification Docker image via `codeharness verify-env build`
- FR82: System can validate verification environment readiness via `codeharness verify-env check` — image exists, CLI works inside, observability reachable
- FR83: Verifier agent operates without source code access — only built artifact, user docs, and observability endpoints
- FR84: `validateProofQuality()` rejects grep-heavy proofs and requires functional CLI evidence per AC
- FR85: Verification requires README.md with working installation instructions — missing or broken docs fail verification
- FR86: Verification environment is connected to host observability stack — traces from container flow to VictoriaMetrics via OTEL
