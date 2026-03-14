---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-03-14'
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# codeharness - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for codeharness, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can install codeharness with a single command (`claude plugin install codeharness`)
FR2: User can initialize the harness in a project via `/harness-init`
FR3: System can detect the project's technology stack (Node.js via `package.json`, Python via `requirements.txt`/`pyproject.toml`)
FR4: System can install BMAD Method via `npx bmad-method init` as part of `/harness-init`
FR5: System can detect existing BMAD/bmalph installation and migrate (preserve artifacts, apply harness patches, take over execution)
FR6: User can configure enforcement levels during init (frontend, database, API, VictoriaMetrics) with max-enforcement defaults
FR7: System can persist enforcement configuration per project (`.claude/codeharness.local.md`)
FR8: System can auto-install external dependencies (Docker check, Showboat, agent-browser, OTLP packages)
FR9: User can re-run `/harness-init` idempotently without breaking existing configuration
FR10: User can tear down the harness via `/harness-teardown` without affecting project source code
FR11: System can start an ephemeral VictoriaMetrics stack via Docker Compose (VictoriaLogs + VictoriaMetrics + VictoriaTraces + OTel Collector)
FR12: System can install OTLP auto-instrumentation for Node.js projects (zero code changes)
FR13: System can install OTLP auto-instrumentation for Python projects (zero code changes)
FR14: System can configure OTLP environment variables pointing to the local OTel Collector
FR15: Agent can query VictoriaLogs via LogQL to inspect application runtime logs
FR16: Agent can query VictoriaMetrics via PromQL to inspect application metrics
FR17: Agent can trace request flows via VictoriaTraces
FR18: System can verify the observability stack is running (SessionStart hook)
FR19: Agent can verify UI features by interacting with the application via agent-browser (navigate, click, fill, screenshot)
FR20: Agent can verify API endpoints by making real HTTP calls and inspecting response bodies AND side effects
FR21: Agent can verify database state via Database MCP (read-only queries)
FR22: Agent can verify runtime behavior by querying VictoriaLogs for expected log entries
FR23: Agent can capture verification evidence in Showboat proof documents (`showboat exec`, `showboat image`)
FR24: Agent can re-verify proof documents via `showboat verify` to confirm outputs match
FR25: Agent can take annotated screenshots via agent-browser for visual evidence
FR26: Agent can diff before/after states via agent-browser's snapshot diffing
FR27: System can enforce per-commit quality gates (tests, lint, typecheck) via PreToolUse hook
FR28: System can enforce per-story verification (full real-world verification + Showboat proof) before story completion
FR29: System can block git commits without prior quality gate pass (PreToolUse hook)
FR30: System can block story completion without Showboat proof document
FR31: System can enforce that the agent queries VictoriaLogs/VictoriaTraces during development (PostToolUse hooks)
FR32: System can inject verification prompts after code changes (PostToolUse: Write/Edit)
FR33: System can verify OTLP instrumentation is present in new code (PostToolUse hook)
FR34: System can control autonomous loop iteration (Stop hook: continue/terminate based on verification state)
FR35: System can track verification state per story (what's verified, what's pending)
FR36: System can read BMAD sprint plans from `_bmad-output/planning-artifacts/`
FR37: System can map BMAD stories to verification tasks
FR38: System can produce per-story Showboat proof documents matching BMAD story identifiers
FR39: System can update BMAD sprint status after story verification
FR40: System can apply harness patches to BMAD story templates (add verification requirements)
FR41: System can apply harness patches to BMAD dev story workflow (enforce observability during development)
FR42: System can apply harness patches to BMAD code review workflow (check Showboat proof exists)
FR43: System can apply harness patches to BMAD retrospective workflow (review verification effectiveness, produce actionable follow-up)
FR44: System can read BMAD acceptance criteria and map them to verification steps
FR45: System can run Ralph's autonomous loop (vendored `snarktank/ralph`) with fresh context per iteration
FR46: System can bridge BMAD stories to Ralph execution tasks with verification requirements per story
FR47: System can track iteration count, story progress, and verification state across loop iterations
FR48: System can enforce verification gates within the Ralph loop (story not marked done without Showboat proof)
FR49: System can handle loop termination (all stories done, max iterations reached, user cancellation)
FR50: System can trigger mandatory retrospective after each sprint completion
FR51: System can analyze sprint verification data (pass rates, iteration counts, common failure patterns), documentation health (stale docs, quality grades), and test effectiveness (coverage trends, flaky tests) for retro input
FR52: System can produce structured retro report (what worked, what didn't, verification effectiveness, debug efficiency, documentation health, test analysis)
FR53: System can convert retro findings into actionable items: new stories for issues, BMAD workflow patches for process improvements, enforcement updates for verification gaps
FR54: User can review and approve retro-generated items before they enter the next sprint backlog
FR55: System can update BMAD sprint plan with approved retro follow-up items
FR56: User can use codeharness without BMAD installed
FR57: User can provide a task list as a markdown checklist, JSON task list, or plain text (one task per line) for verification tracking
FR58: User can trigger verification manually via `/harness-verify` for any development work
FR59: User can view harness status via `/harness-status` (configured enforcement, stack state, verification history)
FR60: System can generate a verification summary per story (pass/fail per AC, evidence links)
FR61: System can maintain a verification log across the sprint (which stories verified, iteration counts)
FR62: System must enforce 100% project-wide test coverage as a quality gate before story completion
FR63: Agent must write tests for all new code as part of story implementation (after implementation, before verification)
FR64: Agent must write tests for any existing uncovered code discovered during story implementation
FR65: System must block story completion if project-wide test coverage drops below 100%
FR66: System must run all project tests as part of per-commit quality gates — all tests must pass
FR67: System must report coverage delta per story (coverage added vs. coverage before)
FR68: System must generate initial `AGENTS.md` during `/harness-init` as a ~100-line map with pointers to BMAD planning artifacts, project structure, build/test commands, conventions, and security notes
FR69: Agent must create per-subsystem `AGENTS.md` files when creating new modules or subsystems (local, minimal, progressive disclosure)
FR70: System must generate exec-plan files in `docs/exec-plans/active/` for each story at sprint start, derived from BMAD story definitions
FR71: System must move exec-plan files from `active/` to `completed/` upon story verification, appending verification summary and Showboat proof link
FR72: System must maintain `docs/index.md` as a map referencing BMAD planning artifacts in their native location (`_bmad-output/planning-artifacts/`) — no duplication, only pointers
FR73: Doc-gardener subagent must scan for stale documentation (AGENTS.md referencing deleted code, docs not updated since code changed) and open fix-up tasks
FR74: Doc-gardener subagent must generate `docs/quality/quality-score.md` with per-area documentation health grades
FR75: Doc-gardener subagent must update `docs/exec-plans/tech-debt-tracker.md` with documentation debt items discovered during scans
FR76: System must enforce doc freshness as part of story verification — AGENTS.md for changed modules must reflect current code
FR77: System must enforce design-doc validation at epic completion — architectural decisions documented and ARCHITECTURE.md current
FR78: System must generate `docs/quality/test-coverage.md` per sprint with coverage trends and per-story deltas
FR79: System must generate `docs/generated/db-schema.md` from DB MCP queries when database enforcement is enabled
FR80: BMAD retro workflow patch must include doc health analysis — stale doc count, quality grades, doc-gardener findings, documentation debt trends
FR81: BMAD dev-story workflow patch must require: update/create per-subsystem AGENTS.md for new modules, update exec-plan with progress, ensure inline code documentation
FR82: BMAD code-review workflow patch must verify: AGENTS.md freshness for changed modules, exec-plan updated, test coverage report present
FR83: BMAD sprint-planning workflow must verify: planning docs complete, ARCHITECTURE.md current, test infrastructure ready, coverage baseline recorded
FR84: BMAD story template patch must include documentation requirements in acceptance criteria: which docs must be created or updated for the story
FR85: BMAD dev-story workflow patch must enforce: tests written after implementation, 100% coverage before verification, all tests pass
FR86: BMAD code-review workflow patch must verify: tests exist for all new code, coverage is 100%, no skipped or disabled tests
FR87: BMAD retro workflow patch must analyze: test effectiveness (tests that caught real bugs vs. tests that never failed), coverage trends, flaky test detection
FR88: User can onboard an existing project to full harness compliance via `/harness-onboard`
FR89: System must scan existing codebase structure, detect modules/subsystems, and map dependencies during onboarding
FR90: System must generate root `AGENTS.md` and per-subsystem `AGENTS.md` files from actual code structure during onboarding
FR91: System must discover or generate `ARCHITECTURE.md` — if one exists, validate freshness; if not, generate from code analysis
FR92: System must set up `docs/` structure with `index.md` mapping to existing project documentation (README, inline docs, existing specs)
FR93: System must run coverage analysis and produce a coverage gap report: uncovered files/lines, estimated effort per module, prioritized by risk
FR94: System must generate an onboarding epic with stories for reaching full harness compliance: coverage gap stories (per module), doc gap stories, architecture doc stories
FR95: System must audit existing documentation (README, JSDoc/docstrings, inline comments) and produce a doc quality report with freshness assessment
FR96: System must generate initial `docs/generated/db-schema.md` from DB MCP if database enforcement is enabled
FR97: User can review and approve the onboarding plan (epic + stories) before execution begins
FR98: System must execute onboarding stories through the normal Ralph loop with verification — the onboarding IS the first sprint
FR99: System must track onboarding progress in `/harness-status` showing compliance percentage (coverage, docs, AGENTS.md files)

### NonFunctional Requirements

NFR1: Hook execution (PreToolUse, PostToolUse) must complete within 500ms as measured by hook script timer
NFR2: VictoriaLogs queries must return results within 2 seconds as measured by curl request round-trip time
NFR3: `showboat verify` must complete re-run within 5 minutes for a typical story (10-15 verification steps)
NFR4: VictoriaMetrics Docker stack must start within 30 seconds during `/harness-init`
NFR5: OTLP auto-instrumentation must add <5% latency overhead to the developed application as measured by load test comparison with and without instrumentation enabled
NFR6: Plugin must coexist with other Claude Code plugins without hook conflicts (detect and warn)
NFR7: Plugin must work with Claude Code plugin system version as of March 2026
NFR8: VictoriaMetrics stack must use pinned Docker image versions for reproducibility
NFR9: agent-browser and Showboat versions must be pinned and tested for compatibility
NFR10: OTLP instrumentation must work with standard OpenTelemetry SDK versions
NFR11: Database MCP must support PostgreSQL, MySQL, and SQLite at minimum
NFR12: BMAD integration must work with BMAD Method v6+ artifact format
NFR13: Plugin must not modify project source code during `/harness-teardown`
NFR14: If VictoriaMetrics stack crashes, the harness must detect and report it (not silently fail)
NFR15: If agent-browser is unavailable, the harness must fall back gracefully (skip UI verification with warning)
NFR16: Hook failures must produce clear error messages, not silent blocks
NFR17: State file (`.claude/codeharness.local.md`) must be recoverable if corrupted
NFR18: BMAD installation via `npx bmad-method init` must complete within 60 seconds
NFR19: BMAD harness patches must be idempotent — applying patches twice produces the same result
NFR20: Retrospective report generation must complete within 30 seconds using sprint verification data
NFR21: Test suite must complete execution within 5 minutes for per-commit quality gates as measured by test runner wall-clock time
NFR22: Coverage measurement must include all application source code (excluding test files, configuration, and generated code) as reported by the stack's native coverage tool (c8/istanbul for Node.js, coverage.py for Python)
NFR23: Doc-gardener subagent must complete a full documentation scan within 60 seconds as measured by subagent execution time
NFR24: AGENTS.md files must not exceed 100 lines — content beyond that must be in referenced docs (progressive disclosure)
NFR25: `docs/index.md` must reference BMAD planning artifacts by relative path to `_bmad-output/planning-artifacts/` — never copy content
NFR26: Doc freshness check must compare file modification timestamps against git log for corresponding source files
NFR27: Generated documentation (`docs/generated/`, `docs/quality/`) must be clearly marked as auto-generated with "DO NOT EDIT MANUALLY" headers

### Additional Requirements

- Architecture specifies manual plugin scaffold as starter (no generator CLI) — first story must create `.claude-plugin/plugin.json` + full directory structure
- 12 architectural decisions must be respected during implementation (hook state management, vendored Ralph loop, verification subagent, generated Docker Compose, direct start script OTLP modification, codeharness as BMAD distribution, deep BMAD integration, Ralph integration, testing enforcement, documentation structure, BMAD workflow integration, brownfield onboarding)
- Canonical patterns defined for: bash state reading (`get_state` function), hook JSON output (`exit 0`/`exit 2`), state file YAML format (`snake_case`), Showboat proof doc format, AGENTS.md format (~100 lines, progressive disclosure)
- Docker Compose services: `victoria-logs`, `victoria-metrics`, `victoria-traces`, `otel-collector`, `grafana` on network `codeharness-net`
- BMAD patches cover 4 workflows: story template, dev story, code review, retrospective — each patch adds harness requirements (verification, observability, documentation, testing)
- Ralph loop vendored from `snarktank/ralph` (~500 lines bash). Bridge from BMAD stories to Ralph tasks is verification-aware.
- 4 subagents: verifier (verification pipeline), observer (VictoriaLogs/Traces querying), doc-gardener (doc health scanning), onboarder (brownfield project analysis)
- Documentation structure references BMAD artifacts in native location — no duplication, only pointers via `docs/index.md`
- Per-subsystem AGENTS.md files created as codebase grows — progressive disclosure pattern
- Exec-plans lifecycle: active/ → completed/ with verification summary appended

### UX Design Requirements

UX-DR1: All command output must follow the Hybrid Direction C pattern — dense tabular summary at top for scanning, full details below for inspection
UX-DR2: All status markers must use consistent vocabulary: `[OK]`, `[FAIL]`, `[BLOCKED]`, `[WARN]`, `[PASS]`, `[INFO]`
UX-DR3: All actionable hints must use `→` prefix (e.g., `→ Run /harness-verify`)
UX-DR4: `/harness-init` output must show per-component status lines (`[OK]`/`[FAIL]`), one per operation, with final summary and next action hint
UX-DR5: Hook block messages must follow error pattern: `[BLOCKED] What failed` → `Why:` → `Fix:` → `→ Alternative action`
UX-DR6: Hook block messages for coverage must list uncovered files with line numbers
UX-DR7: Hook block messages for failing tests must list specific failing test names
UX-DR8: Hook block messages for stale docs must list stale files with last-updated vs code-changed timestamps
UX-DR9: Hook warn messages for new modules without AGENTS.md must name the module and suggest content
UX-DR10: `/harness-status` must follow `git status` model — health line, enforcement config, sprint progress table with per-story pass/fail, next action hint
UX-DR11: Showboat proof documents must have two reading modes: scan (summary table) and inspect (per-AC evidence details)
UX-DR12: All generated markdown must use YAML frontmatter with structured metadata
UX-DR13: No ANSI color codes in plugin output — semantic meaning via text markers only
UX-DR14: Status lines must stay under 100 characters for 80-column terminal readability
UX-DR15: `/harness-onboard` output must show project scan results (modules, coverage %, doc audit) and generated onboarding epic summary
UX-DR16: Retrospective report must include doc health section (quality grades, stale doc count) and test analysis section (coverage trends, flaky tests)
UX-DR17: All generated docs must have "DO NOT EDIT MANUALLY" headers
UX-DR18: Exec-plan completed entries must include Showboat proof link and verification summary

### FR Coverage Map

FR1: Epic 1 — Install codeharness
FR2: Epic 1 — Initialize harness via /harness-init
FR3: Epic 1 — Detect project technology stack
FR4: Epic 1 — Install BMAD Method
FR5: Epic 1 — Detect and migrate from existing BMAD/bmalph
FR6: Epic 1 — Configure enforcement levels
FR7: Epic 1 — Persist enforcement config
FR8: Epic 1 — Auto-install external dependencies
FR9: Epic 1 — Idempotent re-init
FR10: Epic 1 — Harness teardown
FR11: Epic 2 — Start VictoriaMetrics stack
FR12: Epic 2 — OTLP auto-instrumentation Node.js
FR13: Epic 2 — OTLP auto-instrumentation Python
FR14: Epic 2 — Configure OTLP environment variables
FR15: Epic 2 — Query VictoriaLogs via LogQL
FR16: Epic 2 — Query VictoriaMetrics via PromQL
FR17: Epic 2 — Trace request flows via VictoriaTraces
FR18: Epic 2 — Verify observability stack running
FR19: Epic 3 — Verify UI via agent-browser
FR20: Epic 3 — Verify API endpoints via real HTTP calls
FR21: Epic 3 — Verify database state via DB MCP
FR22: Epic 3 — Verify runtime behavior via VictoriaLogs
FR23: Epic 3 — Capture evidence in Showboat proof
FR24: Epic 3 — Re-verify via showboat verify
FR25: Epic 3 — Annotated screenshots via agent-browser
FR26: Epic 3 — Diff before/after states
FR27: Epic 3 — Per-commit quality gates
FR28: Epic 3 — Per-story verification enforcement
FR29: Epic 3 — Block commits without quality gate pass
FR30: Epic 3 — Block story completion without proof
FR31: Epic 4 — Enforce VictoriaLogs querying
FR32: Epic 4 — Inject verification prompts after code changes
FR33: Epic 4 — Verify OTLP instrumentation in new code
FR34: Epic 4 — Control autonomous loop iteration
FR35: Epic 4 — Track verification state per story
FR36: Epic 5 — Read BMAD sprint plans
FR37: Epic 5 — Map stories to verification tasks
FR38: Epic 5 — Produce per-story Showboat proofs with BMAD IDs
FR39: Epic 5 — Update BMAD sprint status
FR40: Epic 5 — Patch BMAD story templates
FR41: Epic 5 — Patch BMAD dev story workflow
FR42: Epic 5 — Patch BMAD code review workflow
FR43: Epic 5 — Patch BMAD retro workflow
FR44: Epic 5 — Map BMAD ACs to verification steps
FR45: Epic 6 — Run vendored Ralph loop
FR46: Epic 6 — Bridge BMAD stories to Ralph tasks
FR47: Epic 6 — Track iteration count and progress
FR48: Epic 6 — Enforce verification gates in loop
FR49: Epic 6 — Handle loop termination
FR50: Epic 8 — Trigger mandatory retrospective
FR51: Epic 8 — Analyze verification + doc health + test effectiveness
FR52: Epic 8 — Produce structured retro report
FR53: Epic 8 — Convert findings to actionable items
FR54: Epic 8 — User review/approve retro items
FR55: Epic 8 — Update BMAD sprint plan with follow-up
FR56: Epic 10 — Use without BMAD
FR57: Epic 10 — Provide task list in any format
FR58: Epic 10 — Manual /harness-verify
FR59: Epic 8 — /harness-status
FR60: Epic 3 — Verification summary per story
FR61: Epic 8 — Verification log across sprint
FR62: Epic 4 — Enforce 100% coverage
FR63: Epic 4 — Write tests for new code
FR64: Epic 4 — Write tests for uncovered code
FR65: Epic 4 — Block on coverage drop
FR66: Epic 4 — Run all tests per commit
FR67: Epic 4 — Report coverage delta
FR68: Epic 1 — Generate AGENTS.md during init
FR69: Epic 7 — Per-subsystem AGENTS.md creation
FR70: Epic 7 — Generate exec-plan files per story
FR71: Epic 7 — Move exec-plans active→completed
FR72: Epic 1 — Maintain docs/index.md
FR73: Epic 7 — Doc-gardener scan for stale docs
FR74: Epic 7 — Doc-gardener quality-score.md
FR75: Epic 7 — Doc-gardener tech-debt-tracker.md
FR76: Epic 4 — Enforce doc freshness
FR77: Epic 7 — Design-doc validation at epic completion
FR78: Epic 8 — Generate test-coverage.md per sprint
FR79: Epic 7 — Generate db-schema.md
FR80: Epic 5 — BMAD retro patch includes doc health
FR81: Epic 5 — BMAD dev-story patch includes doc requirements
FR82: Epic 5 — BMAD code-review patch includes doc/test checks
FR83: Epic 5 — BMAD sprint-planning patch includes doc/test readiness
FR84: Epic 5 — BMAD story template patch includes doc ACs
FR85: Epic 5 — BMAD dev-story patch includes test enforcement
FR86: Epic 5 — BMAD code-review patch includes test verification
FR87: Epic 5 — BMAD retro patch includes test analysis
FR88: Epic 9 — /harness-onboard command
FR89: Epic 9 — Scan codebase structure
FR90: Epic 9 — Generate AGENTS.md from existing code
FR91: Epic 9 — Discover/generate ARCHITECTURE.md
FR92: Epic 9 — Set up docs/ from existing docs
FR93: Epic 9 — Coverage gap analysis
FR94: Epic 9 — Generate onboarding epic with stories
FR95: Epic 9 — Audit existing documentation
FR96: Epic 9 — Generate db-schema.md during onboarding
FR97: Epic 9 — User review/approve onboarding plan
FR98: Epic 9 — Execute onboarding through Ralph loop
FR99: Epic 9 — Track onboarding compliance in /harness-status

## Epic List

### Epic 1: Plugin Foundation & Harness Init
User can install codeharness with one command and initialize a complete harness in any project — stack detected, observability configured, hooks installed, BMAD set up, documentation scaffolded, enforcement configured.
**FRs covered:** FR1-FR10, FR68, FR72

### Epic 2: Observability — Give the Agent Eyes
The agent has full runtime visibility into the developed project — logs, metrics, traces — queryable via LogQL/PromQL during development. The user knows the agent isn't guessing.
**FRs covered:** FR11-FR18

### Epic 3: Verification & Proof
The agent verifies features by actually using them — browser interaction, real API calls, DB state checks, log queries — and produces reproducible Showboat proof documents the user can trust. Commits blocked without verification.
**FRs covered:** FR19-FR30, FR60

### Epic 4: Enforcement & Quality Gates
The harness mechanically enforces that the agent queries observability, writes tests (100% coverage), maintains doc freshness, and verifies before committing. The agent can't skip steps.
**FRs covered:** FR31-FR35, FR62-FR67, FR76

### Epic 5: BMAD Ownership & Integration
codeharness IS the BMAD distribution — installs BMAD, applies harness patches to all workflows (story, dev, code review, retro, sprint planning), maps stories to verification tasks. Every BMAD workflow enforces harness requirements for verification, documentation, and testing.
**FRs covered:** FR36-FR44, FR80-FR87

### Epic 6: Autonomous Execution
User runs `/harness-run` and walks away. The vendored Ralph loop executes stories autonomously with verification gates per story — fresh context per iteration, crash recovery, progress tracking.
**FRs covered:** FR45-FR49

### Epic 7: Documentation System
Project documentation follows the OpenAI harness pattern — per-subsystem AGENTS.md files, exec-plans tracking story lifecycle (active→completed), doc-gardener subagent keeping everything fresh with quality grades.
**FRs covered:** FR69-FR75, FR77-FR79

### Epic 8: Sprint Lifecycle & Reporting
Sprints have full lifecycle — mandatory retrospectives analyzing verification effectiveness, test trends, and doc health. `/harness-status` shows everything at a glance. Retro produces actionable follow-up stories.
**FRs covered:** FR50-FR55, FR59, FR61, FR78

### Epic 9: Brownfield Onboarding
User can bring an existing project to full harness compliance. `/harness-onboard` scans the project, generates an onboarding epic, and executes it through the normal Ralph loop — the harness bootstraps itself.
**FRs covered:** FR88-FR99

### Epic 10: Standalone Mode
Users without BMAD can use codeharness with any task list — markdown checklist, JSON, or plain text. Verification works the same, any methodology benefits from the harness.
**FRs covered:** FR56-FR58

## Epic 1: Plugin Foundation & Harness Init

User can install codeharness with one command and initialize a complete harness in any project — stack detected, observability configured, hooks installed, BMAD set up, documentation scaffolded, enforcement configured.

### Story 1.1: Plugin Scaffold & Manifest

As a developer,
I want to create the codeharness plugin directory structure and manifest,
So that Claude Code recognizes codeharness as an installable plugin.

**Acceptance Criteria:**

**Given** the codeharness repository is initialized
**When** the plugin scaffold is created
**Then** `.claude-plugin/plugin.json` exists with name, version, description
**And** all component directories exist: `commands/`, `skills/`, `hooks/`, `agents/`, `knowledge/`, `templates/`, `ralph/`
**And** `claude --plugin-dir ./codeharness` loads without errors
**And** the plugin appears in Claude Code's plugin list

### Story 1.2: Stack Detection & Enforcement Config

As a developer,
I want `/harness-init` to detect my project's technology stack and ask me what to enforce,
So that the harness is configured correctly for my project without manual setup.

**Acceptance Criteria:**

**Given** a project with `package.json` exists
**When** the user runs `/harness-init`
**Then** the system detects "Node.js" as the stack
**And** prompts "Frontend? (y/n)", "Database? (y/n)", "APIs? (y/n)"
**And** persists enforcement config to `.claude/codeharness.local.md` with YAML frontmatter
**And** output follows UX-DR4: `[INFO] Stack detected: Node.js`

**Given** a project with `requirements.txt` or `pyproject.toml`
**When** the user runs `/harness-init`
**Then** the system detects "Python" as the stack

**Given** no recognized stack files exist
**When** the user runs `/harness-init`
**Then** the system asks the user to specify the stack

### Story 1.3: Dependency Check & Auto-Install

As a developer,
I want `/harness-init` to check for and auto-install required dependencies,
So that I don't have to manually install Docker, Showboat, agent-browser, or OTLP packages.

**Acceptance Criteria:**

**Given** Docker is not installed
**When** `/harness-init` runs dependency checks
**Then** output shows `[FAIL] Docker not installed` with fix instructions and halts
**And** message follows UX-DR5 error pattern: What → Why → Fix → Alternative

**Given** Docker is installed but Showboat is not
**When** `/harness-init` runs dependency checks
**Then** Showboat is auto-installed via `uvx showboat`
**And** output shows `[OK] Showboat: installed`

**Given** all dependencies are present
**When** `/harness-init` runs dependency checks
**Then** each dependency shows `[OK]` status line

### Story 1.4: BMAD Installation & Harness Patches

As a developer,
I want `/harness-init` to install BMAD and apply harness patches,
So that BMAD workflows enforce verification, documentation, and testing requirements.

**Acceptance Criteria:**

**Given** no `_bmad/` directory exists
**When** `/harness-init` runs
**Then** BMAD is installed via `npx bmad-method init`
**And** harness patches are applied to story template, dev workflow, code review, and retro workflows
**And** output shows `[OK] BMAD: installed (v6.x), harness patches applied`
**And** BMAD installation completes within 60 seconds (NFR18)
**And** patches are idempotent — running init twice produces same result (NFR19)

**Given** `_bmad/` already exists (existing BMAD)
**When** `/harness-init` runs
**Then** existing artifacts are preserved
**And** harness patches are applied without overwriting user content
**And** output shows `[OK] BMAD: existing installation detected, harness patches applied`

**Given** bmalph is detected (existing bmalph installation)
**When** `/harness-init` runs
**Then** bmalph artifacts are preserved
**And** codeharness takes over execution
**And** output shows `[OK] BMAD: migrated from bmalph, harness patches applied`

### Story 1.5: Documentation Scaffold & AGENTS.md

As a developer,
I want `/harness-init` to generate AGENTS.md and the docs/ structure,
So that the project has a proper documentation foundation from day one.

**Acceptance Criteria:**

**Given** `/harness-init` has detected the stack and configured enforcement
**When** documentation scaffolding runs
**Then** root `AGENTS.md` is generated with ~100 lines (NFR24) containing: build/test commands, architecture overview, conventions, security notes, pointers to `_bmad-output/planning-artifacts/`
**And** `docs/index.md` is created referencing BMAD artifacts by relative path (NFR25)
**And** `docs/exec-plans/active/` and `docs/exec-plans/completed/` directories are created
**And** `docs/quality/` and `docs/generated/` directories are created
**And** generated docs have "DO NOT EDIT MANUALLY" headers (NFR27)

### Story 1.6: State File & Hook Installation

As a developer,
I want `/harness-init` to create the state file and install all hooks,
So that enforcement is active immediately after initialization.

**Acceptance Criteria:**

**Given** all previous init steps completed
**When** state file and hooks are installed
**Then** `.claude/codeharness.local.md` is created with canonical YAML structure (harness_version, initialized, enforcement, stack, coverage, session_flags)
**And** `hooks.json` registers all hooks (session-start, pre-commit-gate, post-write-check, post-test-verify)
**And** hook bash scripts are executable and POSIX-compatible
**And** output shows `[OK] Hooks: 4 registered`

### Story 1.7: Init Report & Idempotency

As a developer,
I want `/harness-init` to produce a clear summary report and be safe to re-run,
So that I know exactly what was configured and can re-init without fear.

**Acceptance Criteria:**

**Given** all init steps complete successfully
**When** init finishes
**Then** output shows complete init report following UX-DR4 format with per-component `[OK]`/`[FAIL]` lines, final summary, and `→ Run /harness-run to start autonomous execution`

**Given** init was already run successfully
**When** user runs `/harness-init` again
**Then** existing config is detected and preserved
**And** components show `[OK] Already configured: {component}` where appropriate
**And** no data is lost or overwritten

### Story 1.8: Harness Teardown

As a developer,
I want `/harness-teardown` to cleanly remove all harness artifacts without touching my project code,
So that I can remove the harness if needed without risk.

**Acceptance Criteria:**

**Given** the harness is initialized and running
**When** user runs `/harness-teardown`
**Then** Docker stack is stopped and removed
**And** hooks are unregistered
**And** `.claude/codeharness.local.md` is removed
**And** project source code is NOT modified (NFR13)
**And** `_bmad/` directory is NOT removed (BMAD artifacts preserved)
**And** `docs/` directory is NOT removed (documentation preserved)
**And** output shows per-component teardown status

## Epic 2: Observability — Give the Agent Eyes

The agent has full runtime visibility into the developed project — logs, metrics, traces — queryable via LogQL/PromQL during development. The user knows the agent isn't guessing.

### Story 2.1: Docker Compose Generation & VictoriaMetrics Stack

As a developer,
I want `/harness-init` to generate and start a VictoriaMetrics observability stack,
So that my project has logs, metrics, and traces infrastructure running locally.

**Acceptance Criteria:**

**Given** Docker is running and enforcement includes observability
**When** `/harness-init` generates the Docker Compose
**Then** `docker-compose.harness.yml` is generated based on enforcement config
**And** services include: `victoria-logs`, `victoria-metrics`, `otel-collector` on network `codeharness-net`
**And** `victoria-traces` is included only if tracing enforcement is enabled
**And** all Docker images use pinned versions (NFR8)
**And** stack starts within 30 seconds (NFR4)
**And** output shows `[OK] VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)`

**Given** observability enforcement is disabled (simple tool mode)
**When** `/harness-init` runs
**Then** no Docker Compose is generated, no stack started
**And** output shows `[INFO] Observability: disabled (simple tool mode)`

### Story 2.2: OTLP Auto-Instrumentation

As a developer,
I want the harness to auto-instrument my project with OpenTelemetry,
So that my application emits logs, metrics, and traces without code changes.

**Acceptance Criteria:**

**Given** a Node.js project detected
**When** OTLP instrumentation runs
**Then** `@opentelemetry/auto-instrumentations-node` is installed
**And** the project's start script is modified to include `--require @opentelemetry/auto-instrumentations-node/register`
**And** OTLP environment variables are set: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, exporters for traces/metrics/logs
**And** instrumentation adds <5% latency overhead (NFR5)

**Given** a Python project detected
**When** OTLP instrumentation runs
**Then** `opentelemetry-distro` and `opentelemetry-exporter-otlp` are installed
**And** `opentelemetry-bootstrap -a install` runs for auto-instrumentation
**And** start script wrapped with `opentelemetry-instrument`
**And** OTLP environment variables are set

### Story 2.3: Agent Observability Querying

As an agent,
I want to query VictoriaLogs via LogQL and VictoriaMetrics via PromQL during development,
So that I can see what my code is doing at runtime instead of guessing.

**Acceptance Criteria:**

**Given** the VictoriaMetrics stack is running and the application is instrumented
**When** the agent queries VictoriaLogs (`curl localhost:9428/select/logsql/query?query=level:error`)
**Then** results return within 2 seconds (NFR2)
**And** log entries include structured fields from OTLP instrumentation

**When** the agent queries VictoriaMetrics (`curl localhost:8428/api/v1/query?query=http_requests_total`)
**Then** metric results return within 2 seconds

**When** the agent traces a request via VictoriaTraces
**Then** the full request flow is visible with span hierarchy

### Story 2.4: Observability Health Check

As a developer,
I want the harness to verify the observability stack is running at session start,
So that the agent never operates blind without being warned.

**Acceptance Criteria:**

**Given** a Claude Code session starts with codeharness installed
**When** the SessionStart hook fires
**Then** it checks VictoriaLogs, VictoriaMetrics, and OTel Collector are responding
**And** if all healthy: silent (no output)
**And** if any unhealthy: `[FAIL] VictoriaMetrics stack not responding` with fix instructions (NFR14)
**And** hook completes within 500ms (NFR1)

**Given** the VictoriaMetrics stack crashes during a session
**When** the agent tries to query logs
**Then** the failure is detected and reported, not silently swallowed

## Epic 3: Verification & Proof

The agent verifies features by actually using them — browser interaction, real API calls, DB state checks, log queries — and produces reproducible Showboat proof documents the user can trust. Commits blocked without verification.

### Story 3.1: Verifier Subagent & Showboat Proof Template

As a developer,
I want a verification subagent that produces structured Showboat proof documents,
So that verification runs in isolated context and produces reproducible evidence.

**Acceptance Criteria:**

**Given** a story has been implemented and quality gates passed
**When** `/harness-verify` is triggered (or automatically during loop)
**Then** a verifier subagent spawns with isolated context
**And** it reads the story's acceptance criteria
**And** it produces a proof doc at `verification/{story-id}-proof.md` following Hybrid Direction C: summary table at top, per-AC evidence below
**And** proof doc has YAML frontmatter with story ID, timestamp, pass/fail counts (UX-DR12)

### Story 3.2: UI Verification via agent-browser

As an agent,
I want to verify UI features by navigating, interacting, and screenshotting via agent-browser,
So that UI verification uses real browser interaction, not test stubs.

**Acceptance Criteria:**

**Given** frontend enforcement is enabled and agent-browser is configured
**When** a UI acceptance criterion needs verification
**Then** the verifier navigates to the feature URL via agent-browser
**And** interacts using accessibility-tree refs (click, fill, wait)
**And** captures annotated screenshots via `showboat image`
**And** can diff before/after states via agent-browser's snapshot diffing
**And** each interaction is wrapped in `showboat exec` for reproducibility

**Given** agent-browser is unavailable
**When** UI verification is attempted
**Then** UI verification is skipped with `[WARN] agent-browser unavailable, UI verification skipped` (NFR15)
**And** proof doc notes the skip

### Story 3.3: API & Database Verification

As an agent,
I want to verify API endpoints with real HTTP calls and database state via DB MCP,
So that I confirm side effects actually happened, not just that a 200 was returned.

**Acceptance Criteria:**

**Given** API enforcement is enabled
**When** an API acceptance criterion needs verification
**Then** the verifier makes real HTTP calls (curl) and inspects response body AND status
**And** captures output via `showboat exec`
**And** proof doc shows: command, expected result, actual result

**Given** database enforcement is enabled and DB MCP is configured
**When** a database acceptance criterion needs verification
**Then** the verifier queries the database via DB MCP (read-only)
**And** confirms expected state (rows exist, values match)
**And** DB MCP supports PostgreSQL, MySQL, and SQLite (NFR11)

### Story 3.4: Log & Trace Verification

As an agent,
I want to verify runtime behavior by querying VictoriaLogs for expected entries,
So that I can confirm the application did what it should internally, not just externally.

**Acceptance Criteria:**

**Given** observability enforcement is enabled
**When** a runtime behavior criterion needs verification
**Then** the verifier queries VictoriaLogs via LogQL for expected log entries
**And** confirms trace IDs, event names, or error absence
**And** captures query and results via `showboat exec`

### Story 3.5: Showboat Verify & Re-run

As a developer,
I want to re-verify proof documents via `showboat verify`,
So that I can confirm the evidence is reproducible, not stale or fabricated.

**Acceptance Criteria:**

**Given** a proof doc exists at `verification/{story-id}-proof.md`
**When** `showboat verify` runs
**Then** all `showboat exec` blocks are re-executed
**And** outputs are compared to originals
**And** result is PASS (all match) or FAIL (mismatches listed)
**And** re-run completes within 5 minutes for 10-15 steps (NFR3)

### Story 3.6: Quality Gates & Commit Blocking

As a developer,
I want the harness to block commits without quality gates passing and stories without proof,
So that nothing ships without verification.

**Acceptance Criteria:**

**Given** the agent attempts to commit code
**When** the pre-commit-gate hook fires
**Then** it checks: tests pass, lint pass, typecheck pass
**And** if any fail: `[BLOCKED] Commit blocked` with specific failures listed and fix commands
**And** if all pass: silent allow

**Given** the agent attempts to mark a story as complete
**When** story completion is checked
**Then** it verifies a Showboat proof doc exists for the story
**And** `showboat verify` passes
**And** if no proof: `[BLOCKED] Story completion blocked — no Showboat proof` with `→ Run /harness-verify`

## Epic 4: Enforcement & Quality Gates

The harness mechanically enforces that the agent queries observability, writes tests (100% coverage), maintains doc freshness, and verifies before committing. The agent can't skip steps.

### Story 4.1: Post-Write Enforcement Hooks

As a developer,
I want hooks to prompt the agent to verify OTLP instrumentation and query logs after code changes,
So that the agent maintains observability awareness throughout development.

**Acceptance Criteria:**

**Given** the agent writes or edits a file
**When** the post-write-check PostToolUse hook fires
**Then** it checks if the changed file should have OTLP instrumentation
**And** if instrumentation missing: prompts `{"message": "Verify OTLP instrumentation in new code"}`
**And** hook completes within 500ms (NFR1)

**Given** the agent runs tests
**When** the post-test-verify PostToolUse hook fires
**Then** it prompts the agent to query VictoriaLogs for errors: `{"message": "Query VictoriaLogs for errors: curl localhost:9428/select/logsql/query?query=level:error"}`

### Story 4.2: Testing Enforcement — 100% Coverage Gate

As a developer,
I want the harness to enforce 100% project-wide test coverage before story completion,
So that no code ships without test coverage.

**Acceptance Criteria:**

**Given** the agent attempts to commit
**When** the pre-commit-gate checks test coverage
**Then** it runs the stack's coverage tool (c8/istanbul for Node.js, coverage.py for Python — NFR22)
**And** if coverage < 100%: `[BLOCKED] Commit blocked — project-wide test coverage at {X}% (required: 100%)` with uncovered file list and line numbers (UX-DR6)
**And** if coverage = 100%: silent allow

**Given** the agent is implementing a story
**When** it writes new code
**Then** it must write tests for the new code after implementation, before verification
**And** it must also write tests for any existing uncovered code discovered in the same files

### Story 4.3: Testing Enforcement — All Tests Must Pass

As a developer,
I want all project tests to pass as a per-commit quality gate,
So that no broken code is committed.

**Acceptance Criteria:**

**Given** the agent attempts to commit
**When** the pre-commit-gate runs the test suite
**Then** all tests must pass
**And** if any fail: `[BLOCKED] Commit blocked — {N} tests failing` with specific test names (UX-DR7)
**And** test suite completes within 5 minutes (NFR21)
**And** hook failure messages are clear, not silent blocks (NFR16)

### Story 4.4: Coverage Delta Reporting

As a developer,
I want to see how each story affected test coverage,
So that I can track coverage trends across the sprint.

**Acceptance Criteria:**

**Given** a story is being verified
**When** coverage is measured
**Then** the system records coverage before and after the story
**And** reports the delta: `Coverage: 94% → 100% (+6% from this story)`
**And** the delta is stored in the state file for sprint reporting

### Story 4.5: Doc Freshness Enforcement

As a developer,
I want the harness to block commits when AGENTS.md files are stale for changed modules,
So that documentation stays current with code changes.

**Acceptance Criteria:**

**Given** the agent modified files in a module that has an AGENTS.md
**When** the pre-commit-gate checks doc freshness
**Then** it compares AGENTS.md modification timestamp against git log for changed source files (NFR26)
**And** if AGENTS.md is stale: `[BLOCKED] Commit blocked — AGENTS.md stale for changed module` with file names and timestamps (UX-DR8)
**And** if no AGENTS.md exists for a new module: `[WARN] New module created without AGENTS.md` with module path and suggested content (UX-DR9)

### Story 4.6: Verification State Tracking

As a developer,
I want the harness to track what's been verified per story across the session,
So that hooks can make informed decisions about what's required.

**Acceptance Criteria:**

**Given** the harness is active
**When** verification events occur (logs queried, tests pass, coverage met, proof created)
**Then** session flags are updated in `.claude/codeharness.local.md`: `logs_queried`, `tests_passed`, `coverage_met`, `verification_run`
**And** session flags reset on each new session (SessionStart hook)
**And** the Stop hook can read verification state to decide continue/terminate

## Epic 5: BMAD Ownership & Integration

codeharness IS the BMAD distribution — installs BMAD, applies harness patches to all workflows (story, dev, code review, retro, sprint planning), maps stories to verification tasks. Every BMAD workflow enforces harness requirements for verification, documentation, and testing.

### Story 5.1: BMAD Sprint Plan Reading & Story Mapping

As a developer,
I want codeharness to read BMAD sprint plans and map stories to verification tasks,
So that every BMAD story automatically gets harness verification requirements.

**Acceptance Criteria:**

**Given** a BMAD sprint plan exists at `_bmad-output/planning-artifacts/`
**When** the system reads the sprint plan
**Then** it extracts all stories with their IDs, titles, and acceptance criteria
**And** maps each AC to a verification type (UI, API, DB, log) based on content analysis
**And** produces per-story verification task lists
**And** works with BMAD Method v6+ artifact format (NFR12)

### Story 5.2: BMAD Story Template Patch

As a developer,
I want BMAD story templates patched with harness requirements,
So that every story created through BMAD includes verification, documentation, and testing criteria.

**Acceptance Criteria:**

**Given** BMAD is installed with harness patches
**When** a new story is created using BMAD
**Then** the story template includes: verification requirements section, documentation requirements (which AGENTS.md to update, exec-plan to create), testing requirements (coverage target)
**And** acceptance criteria include doc and test deliverables
**And** patches are idempotent (NFR19)

### Story 5.3: BMAD Dev Story Workflow Patch

As an agent,
I want the BMAD dev story workflow to enforce observability, documentation, and testing during implementation,
So that I follow the harness process automatically.

**Acceptance Criteria:**

**Given** the agent is executing a story via BMAD dev workflow
**When** the patched workflow runs
**Then** it enforces: update/create per-subsystem AGENTS.md for new modules, update exec-plan with progress, ensure inline code documentation
**And** it enforces: tests written after implementation, 100% coverage before verification, all tests pass
**And** it enforces: observability queries during development

### Story 5.4: BMAD Code Review Workflow Patch

As a developer,
I want the BMAD code review workflow to verify documentation, tests, and proof exist,
So that code review catches missing harness requirements.

**Acceptance Criteria:**

**Given** a code review is triggered via BMAD workflow
**When** the patched code review runs
**Then** it verifies: AGENTS.md freshness for changed modules, exec-plan updated
**And** it verifies: tests exist for all new code, coverage is 100%, no skipped/disabled tests
**And** it verifies: Showboat proof document exists for the story
**And** it verifies: test coverage report is present

### Story 5.5: BMAD Retrospective Workflow Patch

As a developer,
I want the BMAD retrospective workflow to analyze verification effectiveness, documentation health, and test quality,
So that each sprint produces actionable improvements.

**Acceptance Criteria:**

**Given** a sprint is complete and retro triggers
**When** the patched retro workflow runs
**Then** it analyzes: verification pass rates, iteration counts, common failure patterns
**And** it analyzes: doc health — stale doc count, quality grades, doc-gardener findings, documentation debt trends
**And** it analyzes: test effectiveness — tests that caught real bugs vs. never-failed tests, coverage trends, flaky test detection
**And** retro report includes all three analysis sections (UX-DR16)

### Story 5.6: Showboat Proof with BMAD Identifiers & Sprint Status

As a developer,
I want Showboat proof documents to match BMAD story identifiers and sprint status to update automatically,
So that there's a clear link between BMAD planning and harness verification.

**Acceptance Criteria:**

**Given** a story is verified via the harness
**When** the Showboat proof document is generated
**Then** the proof doc filename uses the BMAD story ID: `verification/{story-id}-proof.md`
**And** BMAD sprint status is updated to reflect the story's verification state
**And** the verification summary per story includes pass/fail per AC with evidence links (FR60)

### Story 5.7: BMAD Sprint Planning Patch

As a developer,
I want the BMAD sprint planning workflow to verify planning docs are complete and harness infrastructure is ready,
So that sprints don't start without proper foundation.

**Acceptance Criteria:**

**Given** sprint planning is initiated via BMAD
**When** the patched sprint planning runs
**Then** it verifies: planning docs complete (PRD, architecture, epics current)
**And** it verifies: ARCHITECTURE.md is current and reflects latest decisions
**And** it verifies: test infrastructure ready (coverage tool configured, baseline recorded)
**And** it verifies: harness is initialized and healthy

## Epic 6: Autonomous Execution

User runs `/harness-run` and walks away. The vendored Ralph loop executes stories autonomously with verification gates per story — fresh context per iteration, crash recovery, progress tracking.

### Story 6.1: Ralph Loop Vendoring & Driver

As a developer,
I want codeharness to include a vendored Ralph loop that spawns fresh Claude Code instances,
So that autonomous execution has fresh context per iteration with crash recovery.

**Acceptance Criteria:**

**Given** Ralph's core loop (~500 lines bash) is vendored into `ralph/ralph.sh`
**When** `/harness-run` is executed
**Then** `ralph.sh` starts the external loop process
**And** each iteration spawns a fresh `claude --plugin-dir ./codeharness` instance
**And** the Claude Code driver at `ralph/drivers/claude-code.sh` handles instance lifecycle
**And** the loop supports: max iterations, timeout, crash recovery, rate limiting

### Story 6.2: BMAD→Ralph Task Bridge

As a developer,
I want codeharness to bridge BMAD stories to Ralph execution tasks with verification requirements,
So that the Ralph loop knows what to build and what to verify for each story.

**Acceptance Criteria:**

**Given** a BMAD sprint plan with stories exists
**When** `ralph/bridge.sh` converts stories to tasks
**Then** each task includes: story ID, title, acceptance criteria, verification requirements, Showboat proof expectations, observability setup requirements
**And** tasks are ordered according to story sequence in the sprint plan
**And** the bridge produces `ralph/progress.txt` for tracking

### Story 6.3: Verification Gates in Loop

As a developer,
I want the Ralph loop to enforce verification gates per story,
So that stories aren't marked done without Showboat proof.

**Acceptance Criteria:**

**Given** the Ralph loop is executing a story
**When** the agent signals story completion
**Then** the Stop hook checks: Showboat proof exists, `showboat verify` passes, tests pass, coverage 100%
**And** if all gates pass: story marked done, loop picks next task
**And** if gates fail: agent iterates (fix → re-verify), iteration count incremented
**And** verification state tracked across iterations (FR47)

### Story 6.4: Loop Termination & Progress

As a developer,
I want the Ralph loop to terminate gracefully and report progress,
So that I know when the sprint is done or why it stopped.

**Acceptance Criteria:**

**Given** the Ralph loop is running
**When** all stories are done
**Then** the loop terminates with success summary: stories completed, total iterations, verification pass rates

**When** max iterations reached
**Then** the loop terminates with progress report: completed stories, remaining stories, current story state

**When** the user cancels
**Then** the loop terminates cleanly, preserving current progress in state file

**And** in all cases, progress is readable via `/harness-status`

## Epic 7: Documentation System

Project documentation follows the OpenAI harness pattern — per-subsystem AGENTS.md files, exec-plans tracking story lifecycle (active→completed), doc-gardener subagent keeping everything fresh with quality grades.

### Story 7.1: Per-Subsystem AGENTS.md Generation

As an agent,
I want to create per-subsystem AGENTS.md files when creating new modules,
So that future agents have local, minimal context for each part of the codebase.

**Acceptance Criteria:**

**Given** the agent creates a new module or subsystem directory
**When** the module contains source files
**Then** the agent creates `{module}/AGENTS.md` with: module purpose, key exports, dependencies, conventions
**And** the AGENTS.md does not exceed 100 lines (NFR24)
**And** content beyond 100 lines is placed in referenced docs (progressive disclosure)
**And** the knowledge file `knowledge/documentation-patterns.md` teaches the agent the AGENTS.md format

### Story 7.2: Exec-Plan Lifecycle

As a developer,
I want exec-plan files to track each story from active to completed,
So that there's a clear record of what was worked on and what was verified.

**Acceptance Criteria:**

**Given** a sprint starts with BMAD stories
**When** exec-plans are generated
**Then** one file per story is created in `docs/exec-plans/active/{story-id}.md` derived from the BMAD story definition
**And** each exec-plan contains: story summary, ACs, progress log section, verification status

**Given** a story passes verification
**When** the story is marked complete
**Then** the exec-plan is moved from `active/` to `completed/`
**And** verification summary and Showboat proof link are appended (UX-DR18)

### Story 7.3: Doc-Gardener Subagent

As a developer,
I want a doc-gardener subagent that scans for stale documentation,
So that docs stay fresh without manual oversight.

**Acceptance Criteria:**

**Given** the doc-gardener is triggered (during retro or on-demand)
**When** it scans the project
**Then** it finds: AGENTS.md files referencing deleted functions/modules, docs not updated since corresponding code changed, missing AGENTS.md for modules above complexity threshold, stale exec-plans in `active/` for completed stories
**And** it opens fix-up tasks for each finding
**And** scan completes within 60 seconds (NFR23)

### Story 7.4: Quality Score & Tech Debt Tracker

As a developer,
I want the doc-gardener to produce quality grades and track documentation debt,
So that I can see doc health at a glance and prioritize fixes.

**Acceptance Criteria:**

**Given** the doc-gardener has completed a scan
**When** it generates reports
**Then** `docs/quality/quality-score.md` is created/updated with per-area grades (e.g., "auth: A, routes: C, utils: F")
**And** `docs/exec-plans/tech-debt-tracker.md` is updated with new documentation debt items
**And** both files have "DO NOT EDIT MANUALLY" headers (NFR27)
**And** reports reference BMAD planning artifacts by relative path, not copies (NFR25)

### Story 7.5: Design-Doc Validation at Epic Completion

As a developer,
I want the harness to validate architectural documentation when an epic completes,
So that architecture docs stay current as the codebase evolves.

**Acceptance Criteria:**

**Given** all stories in an epic are verified
**When** epic completion is checked
**Then** the system validates: ARCHITECTURE.md reflects decisions made during the epic
**And** any new architectural decisions are documented in the architecture doc
**And** if validation fails: epic cannot be marked complete until docs are updated

### Story 7.6: DB Schema Generation

As a developer,
I want the harness to auto-generate a database schema document,
So that agents always have current schema reference without manual maintenance.

**Acceptance Criteria:**

**Given** database enforcement is enabled and DB MCP is configured
**When** schema generation runs (during init or on-demand)
**Then** `docs/generated/db-schema.md` is created from DB MCP queries
**And** contains table names, columns, types, relationships
**And** file has "DO NOT EDIT MANUALLY" header (NFR27)
**And** schema is refreshable by re-running generation

## Epic 8: Sprint Lifecycle & Reporting

Sprints have full lifecycle — mandatory retrospectives analyzing verification effectiveness, test trends, and doc health. `/harness-status` shows everything at a glance. Retro produces actionable follow-up stories.

### Story 8.1: Harness Status Command

As a developer,
I want `/harness-status` to show harness health, sprint progress, and verification state at a glance,
So that I always know where things stand without digging through files.

**Acceptance Criteria:**

**Given** the harness is initialized
**When** user runs `/harness-status`
**Then** output follows the `git status` model (UX-DR10): health line → enforcement config → sprint progress table → next action hint
**And** health line shows: stack status, Docker status, Victoria health
**And** enforcement line shows: `frontend:ON database:ON api:ON observability:ON`
**And** sprint progress shows per-story `[PASS]`/`[    ]` with story titles
**And** next action hint shows: current story or `→ Run /harness-run`
**And** status lines stay under 100 characters (UX-DR14)

### Story 8.2: Verification Log

As a developer,
I want the harness to maintain a verification log across the sprint,
So that I can see the full history of what was verified and how many iterations it took.

**Acceptance Criteria:**

**Given** stories are being verified during a sprint
**When** verification events occur
**Then** each event is appended to the verification log in state file: story ID, timestamp, pass/fail, iteration count
**And** the log persists across sessions
**And** `/harness-status` summarizes the log (total verified, pass rate, avg iterations)

### Story 8.3: Mandatory Retrospective Trigger

As a developer,
I want the harness to automatically trigger a retrospective after sprint completion,
So that every sprint produces improvement insights.

**Acceptance Criteria:**

**Given** all stories in a sprint are verified (or max iterations reached)
**When** the sprint completes
**Then** a mandatory retrospective is triggered automatically
**And** the retro has access to: verification log, coverage data, doc-gardener output
**And** retro cannot be skipped — it's part of sprint completion

### Story 8.4: Retro Report Generation

As a developer,
I want the retrospective to produce a structured report with verification, testing, and doc analysis,
So that I have actionable insights for the next sprint.

**Acceptance Criteria:**

**Given** the retrospective is triggered with sprint data
**When** the retro report is generated
**Then** it includes: sprint summary (stories completed, iterations, duration)
**And** verification effectiveness section (pass rates, common failure patterns, iteration counts per story)
**And** test analysis section (coverage trends per story, flaky tests detected, tests that never failed)
**And** doc health section (quality grades, stale doc count, doc-gardener findings) (UX-DR16)
**And** report completes within 30 seconds (NFR20)

### Story 8.5: Test Coverage Report

As a developer,
I want a per-sprint test coverage report with trends and deltas,
So that I can see how coverage evolved across the sprint.

**Acceptance Criteria:**

**Given** a sprint has completed
**When** the coverage report is generated
**Then** `docs/quality/test-coverage.md` is created/updated
**And** it shows: baseline coverage at sprint start, final coverage, per-story deltas
**And** file has "DO NOT EDIT MANUALLY" header (NFR27)

### Story 8.6: Retro Follow-up Story Generation

As a developer,
I want the retrospective to convert findings into actionable follow-up stories,
So that improvements are tracked and don't get lost.

**Acceptance Criteria:**

**Given** the retro report identifies issues
**When** findings are converted to follow-up items
**Then** each finding becomes: a new story for code/test issues, a BMAD workflow patch for process improvements, an enforcement update for verification gaps
**And** user can review and approve items before they enter the next sprint backlog
**And** approved items are added to the BMAD sprint plan

## Epic 9: Brownfield Onboarding

User can bring an existing project to full harness compliance. `/harness-onboard` scans the project, generates an onboarding epic, and executes it through the normal Ralph loop — the harness bootstraps itself.

### Story 9.1: Codebase Scan & Analysis

As a developer,
I want `/harness-onboard` to scan my existing project and produce an analysis report,
So that I understand the gap between current state and full harness compliance.

**Acceptance Criteria:**

**Given** the harness is initialized in an existing project
**When** user runs `/harness-onboard`
**Then** the onboarder subagent scans: project structure, modules/subsystems, dependencies
**And** detects: source file count per module, existing test files, existing documentation (README, ARCHITECTURE.md, inline docs)
**And** output shows project scan results following UX-DR15 format

### Story 9.2: Coverage Gap Analysis

As a developer,
I want the onboarding to analyze test coverage gaps and estimate effort,
So that I know how much work is needed to reach 100% coverage.

**Acceptance Criteria:**

**Given** the onboarder has scanned the codebase
**When** coverage analysis runs
**Then** it runs the stack's coverage tool and identifies: uncovered files with line counts, partially covered files with uncovered line ranges
**And** estimates effort per module (lines to cover)
**And** prioritizes by risk (core business logic first, utilities last)
**And** output shows: `[INFO] Coverage: {X}% (target: 100%)` with per-file breakdown

### Story 9.3: Documentation Audit

As a developer,
I want the onboarding to audit existing documentation quality and freshness,
So that I know what docs need updating or creating.

**Acceptance Criteria:**

**Given** the onboarder has scanned the codebase
**When** doc audit runs
**Then** it assesses: README existence and freshness, ARCHITECTURE.md existence, per-module AGENTS.md existence (0/N modules), inline doc coverage (JSDoc/docstrings as % of exports)
**And** produces a doc quality report with freshness assessment per file
**And** identifies: stale docs (last updated > N days before code changed), missing docs

### Story 9.4: AGENTS.md & Architecture Generation

As a developer,
I want the onboarding to generate AGENTS.md files and ARCHITECTURE.md from actual code,
So that the project has documentation infrastructure without me writing it manually.

**Acceptance Criteria:**

**Given** the onboarder has analyzed the codebase
**When** documentation generation runs
**Then** root `AGENTS.md` is generated from actual project structure (not template — reflects real modules, real build commands)
**And** if no ARCHITECTURE.md exists: a draft is generated from code analysis (module dependencies, data flow, key patterns detected)
**And** if ARCHITECTURE.md exists: freshness is validated
**And** `docs/` structure is scaffolded with `index.md` mapping to existing project docs

### Story 9.5: Onboarding Epic Generation

As a developer,
I want the onboarding to produce an epic with stories for reaching full compliance,
So that I have a clear, executable plan instead of a vague todo list.

**Acceptance Criteria:**

**Given** the onboarder has completed analysis, coverage gap, and doc audit
**When** the onboarding epic is generated
**Then** it contains: one coverage story per uncovered module (grouped by module, ordered by risk), architecture doc story (if missing/stale), per-module AGENTS.md story, doc freshness/inline docs story
**And** each story has acceptance criteria in Given/When/Then format
**And** stories are sized for single agent sessions
**And** the epic is written in BMAD format compatible with the Ralph bridge

### Story 9.6: Onboarding Plan Review & Approval

As a developer,
I want to review and approve the onboarding plan before execution,
So that I control what gets done and in what order.

**Acceptance Criteria:**

**Given** the onboarding epic has been generated
**When** the plan is presented to the user
**Then** it shows: total stories, estimated effort, module-by-module breakdown
**And** user can: approve as-is, reorder stories, remove stories, add stories
**And** only after explicit approval does the plan become executable

### Story 9.7: Onboarding Execution & Compliance Tracking

As a developer,
I want the approved onboarding plan to execute through the normal Ralph loop with compliance tracking,
So that the onboarding is verified the same way as any sprint.

**Acceptance Criteria:**

**Given** the user has approved the onboarding plan
**When** `/harness-run` executes the onboarding sprint
**Then** each onboarding story runs through the normal pipeline: implement → tests → coverage → verify → proof
**And** `/harness-status` shows onboarding compliance percentage: coverage %, docs coverage (N/M modules with AGENTS.md), ARCHITECTURE.md status
**And** when all stories complete: `[OK] Project fully harnessed` with 100% compliance

## Epic 10: Standalone Mode

Users without BMAD can use codeharness with any task list — markdown checklist, JSON, or plain text. Verification works the same, any methodology benefits from the harness.

### Story 10.1: Standalone Task List Support

As a developer,
I want to use codeharness without BMAD by providing my own task list,
So that the harness works with any methodology, not just BMAD.

**Acceptance Criteria:**

**Given** no `_bmad/` directory exists and BMAD is not installed
**When** user provides a task list as markdown checklist, JSON task list, or plain text (one task per line)
**Then** the system parses the task list into verification-trackable tasks
**And** each task can be verified via `/harness-verify`
**And** `/harness-status` shows task progress

**Given** BMAD is not installed
**When** user runs `/harness-init`
**Then** BMAD installation is skipped (no error)
**And** harness components (Victoria, hooks, docs/) still set up
**And** output shows `[INFO] BMAD: not installed (standalone mode)`

### Story 10.2: Manual Verification Trigger

As a developer,
I want to trigger verification manually via `/harness-verify` for any development work,
So that I can use the verification pipeline outside of autonomous loops.

**Acceptance Criteria:**

**Given** the harness is initialized (with or without BMAD)
**When** user runs `/harness-verify`
**Then** the verifier subagent spawns and runs the full verification pipeline
**And** it asks the user what to verify (or reads from current task context)
**And** produces a Showboat proof document
**And** runs `showboat verify` to confirm reproducibility
**And** works identically whether BMAD is installed or not
