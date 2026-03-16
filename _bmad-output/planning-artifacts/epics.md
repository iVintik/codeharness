---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - prd.md (v2)
  - architecture.md (v2)
  - ux-design-specification.md (v2)
---

# codeharness - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for codeharness, decomposing 69 FRs, 28 NFRs, and architectural requirements into implementable stories for a Node.js CLI + Claude Code plugin.

## Requirements Inventory

### Functional Requirements

- FR1: User can install codeharness as a global npm package
- FR2: User can initialize the harness via `codeharness init`
- FR3: System can detect project stack (Node.js, Python)
- FR4: System can install BMAD Method and apply harness patches
- FR5: System can detect existing BMAD/bmalph, preserve artifacts, apply patches
- FR6: User can configure enforcement levels (frontend, database, API, observability)
- FR7: System can persist config in `.claude/codeharness.local.md`
- FR8: System can auto-install dependencies (Showboat, agent-browser, beads, OTLP)
- FR9: System can check Docker only when observability enabled
- FR10: User can re-run init idempotently
- FR11: User can teardown via `codeharness teardown`
- FR12: System can generate Docker Compose from embedded templates
- FR13: System can start/stop VictoriaMetrics stack
- FR14: System can install OTLP for Node.js (--require flag)
- FR15: System can install OTLP for Python (opentelemetry-instrument wrapper)
- FR16: System can configure OTLP environment variables
- FR17: Agent can query VictoriaLogs via LogQL
- FR18: Agent can query VictoriaMetrics via PromQL
- FR19: Agent can trace request flows via VictoriaTraces
- FR20: Agent can verify UI via agent-browser
- FR21: Agent can verify APIs via real HTTP calls
- FR22: Agent can verify DB state via Database MCP
- FR23: Agent can capture evidence in Showboat proof documents
- FR24: Agent can re-verify via `showboat verify`
- FR25: User can trigger verification via `codeharness verify`
- FR26: System can enforce per-commit quality gates via PreToolUse hook
- FR27: System can block commits without quality gate pass
- FR28: System can inject verification prompts via PostToolUse hook
- FR29: System can verify harness health on session start
- FR30: System can update session flags after tests/coverage/verification
- FR31: Hooks can create beads issues when problems detected
- FR32: System can install and configure beads during init
- FR33: System can import BMAD stories into beads via bridge
- FR34: Agent can create beads issues for discovered bugs
- FR35: System can create beads issues from onboard findings
- FR36: System can create beads issues from hook-detected problems
- FR37: Sprint planning can triage beads issues via `bd ready`
- FR38: System can sync beads status with story file status
- FR39: System can resolve beads git hook conflicts during init
- FR40: System can read BMAD epics and stories
- FR41: System can parse story ACs and map to verification steps
- FR42: System can patch BMAD story templates
- FR43: System can patch BMAD dev-story workflow
- FR44: System can patch BMAD code-review workflow
- FR45: System can patch BMAD retrospective workflow
- FR46: System can patch BMAD sprint-planning workflow
- FR47: System can run vendored Ralph loop with fresh context
- FR48: System can feed Ralph from beads via `bd ready --json`
- FR49: System can enforce verification gates in Ralph loop
- FR50: System can handle loop termination
- FR51: System can track iteration count and verification state
- FR52: System can enforce 100% test coverage as quality gate
- FR53: System can run all tests as per-commit quality gates
- FR54: System can detect coverage tool per stack
- FR55: System can report coverage delta per story
- FR56: System can generate root AGENTS.md during init
- FR57: System can generate docs/ scaffold
- FR58: System can scan for stale documentation
- FR59: System can generate and manage exec-plan files
- FR60: System can enforce doc freshness during verification
- FR61: User can onboard existing project via `codeharness onboard`
- FR62: System can scan codebase with configurable module threshold
- FR63: System can run coverage analysis and produce gap report
- FR64: System can audit documentation and produce quality report
- FR65: System can generate onboarding epic as beads issues
- FR66: User can review and approve onboarding plan
- FR67: User can view status via `codeharness status`
- FR68: System can generate verification summary per story
- FR69: System can maintain verification log across sprint

### Non-Functional Requirements

- NFR1: Hook execution <500ms
- NFR2: VictoriaLogs queries <2s
- NFR3: showboat verify <5min per story
- NFR4: Docker stack start <30s
- NFR5: codeharness init <5min
- NFR6: OTLP overhead <5% latency
- NFR7: codeharness bridge <10s for 50 stories
- NFR8: bd ready --json <1s
- NFR9: Plugin coexists with other Claude Code plugins
- NFR10: Works with Claude Code plugin system March 2026
- NFR11: Pinned Docker image versions
- NFR12: Pinned tool versions in package.json
- NFR13: BMAD v6+ compatibility
- NFR14: Beads hooks coexist with codeharness hooks
- NFR15: Teardown doesn't modify project source
- NFR16: Detect/report VictoriaMetrics crash
- NFR17: Graceful fallback if agent-browser unavailable
- NFR18: Clear hook error messages
- NFR19: State file recoverable if corrupted
- NFR20: BMAD patches idempotent
- NFR21: Ralph crash recovery
- NFR22: Init idempotent
- NFR23: Doc-gardener scan <60s
- NFR24: AGENTS.md <100 lines
- NFR25: docs/index.md references by relative path
- NFR26: Generated docs have DO NOT EDIT headers
- NFR27: Module detection threshold configurable (default 3)
- NFR28: CLI test suite <5min

### Additional Requirements (from Architecture)

- Starter: TypeScript + tsup + Commander.js + Vitest + BATS
- CLI entry point: src/index.ts with Commander.js program
- 7 command modules in src/commands/ + state utility command
- 8 lib modules in src/lib/
- 5 embedded template modules in src/templates/
- Plugin scaffold in plugin/ directory, copied to project during init
- Vendored Ralph in ralph/ directory
- State file read via bash sed/grep, written via CLI state set
- All templates embedded as TypeScript — no external file dependencies
- [OK]/[FAIL]/[WARN]/[INFO] output prefixes
- --json flag on all commands
- Exit codes: 0 success, 1 error, 2 invalid usage

### FR Coverage Map

FR1: Epic 1 — npm global install
FR2: Epic 1 — codeharness init command
FR3: Epic 1 — stack detection (Node.js, Python)
FR4: Epic 3 — BMAD Method install
FR5: Epic 3 — detect existing BMAD/bmalph
FR6: Epic 1 — enforcement level configuration
FR7: Epic 1 — state file persistence
FR8: Epic 2 — dependency auto-install
FR9: Epic 1 — Docker check conditional on observability
FR10: Epic 1 — idempotent init
FR11: Epic 7 — teardown command
FR12: Epic 2 — Docker Compose generation
FR13: Epic 2 — VictoriaMetrics stack start/stop
FR14: Epic 2 — OTLP for Node.js
FR15: Epic 2 — OTLP for Python
FR16: Epic 2 — OTLP environment variables
FR17: Epic 2 — VictoriaLogs querying (LogQL)
FR18: Epic 2 — VictoriaMetrics querying (PromQL)
FR19: Epic 2 — VictoriaTraces
FR20: Epic 4 — UI verification via agent-browser
FR21: Epic 4 — API verification via HTTP calls
FR22: Epic 4 — DB verification via Database MCP
FR23: Epic 4 — Showboat proof capture
FR24: Epic 4 — Showboat re-verification
FR25: Epic 4 — manual verification trigger
FR26: Epic 4 — per-commit quality gates (PreToolUse)
FR27: Epic 4 — commit blocking
FR28: Epic 4 — post-write verification prompts (PostToolUse)
FR29: Epic 4 — session start health check
FR30: Epic 4 — session flag updates
FR31: Epic 4 — hook-created beads issues
FR32: Epic 3 — beads install and configure
FR33: Epic 3 — BMAD→beads bridge import
FR34: Epic 3 — agent-created beads issues
FR35: Epic 3 — onboard-created beads issues
FR36: Epic 3 — hook-created beads issues
FR37: Epic 3 — sprint planning via bd ready
FR38: Epic 3 — beads↔story file sync
FR39: Epic 3 — beads hook conflict resolution
FR40: Epic 3 — read BMAD epics/stories
FR41: Epic 3 — parse ACs for verification mapping
FR42: Epic 3 — patch BMAD story template
FR43: Epic 3 — patch BMAD dev-story workflow
FR44: Epic 3 — patch BMAD code-review workflow
FR45: Epic 3 — patch BMAD retrospective workflow
FR46: Epic 3 — patch BMAD sprint-planning workflow
FR47: Epic 5 — vendored Ralph loop
FR48: Epic 5 — Ralph reads from beads
FR49: Epic 5 — verification gates in loop
FR50: Epic 5 — loop termination handling
FR51: Epic 5 — iteration tracking
FR52: Epic 4 — 100% coverage enforcement
FR53: Epic 4 — per-commit test running
FR54: Epic 4 — coverage tool detection per stack
FR55: Epic 4 — coverage delta per story
FR56: Epic 1 — AGENTS.md generation
FR57: Epic 1 — docs/ scaffold generation
FR58: Epic 4 — stale doc scanning
FR59: Epic 4 — exec-plan management
FR60: Epic 4 — doc freshness enforcement
FR61: Epic 6 — codeharness onboard command
FR62: Epic 6 — codebase scan with module threshold
FR63: Epic 6 — coverage gap report
FR64: Epic 6 — doc quality audit
FR65: Epic 6 — onboarding epic generation as beads issues
FR66: Epic 6 — user review/approval of onboarding plan
FR67: Epic 7 — codeharness status command
FR68: Epic 7 — per-story verification summary
FR69: Epic 7 — sprint verification log
FR70: Epic 0 — in-session sprint execution via `/harness-run` skill
FR71: Epic 11 — retro findings → beads issues + GitHub issues
FR72: Epic 11 — GitHub issues → beads import
FR73: Epic 11 — cross-project harness issue creation from retro
FR74: Epic 11 — sprint planning consumes retro + GitHub issues
FR75: Epic 12 — verify CLI rejects proofs with unverified ACs
FR76: Epic 12 — verifier agent uses showboat exec for real evidence
FR77: Epic 12 — harness-run validates proof content, not agent text
FR78: Epic 12 — harness-run owns commits and status updates
FR79: Epic 12 — unverifiable AC detection and escalation

## Epic List

### Epic 0: In-Session Sprint Execution Skill
User can run `/harness-run` to autonomously execute one complete sprint in the current Claude Code session. The skill reads sprint-status.yaml, iterates through stories in the current epic using BMAD workflows (create-story → dev-story → code-review), updates status after each story, and handles basic retry logic. Runs entirely in-session using the Agent tool for fresh context per story — no external processes, no CLI, no beads. This skill is the SINGLE source of sprint execution logic. All loop-related requirements from Epics 4-5 are implemented as progressive enhancements to this skill.
**FRs covered:** FR70
**Integration contract:** Future enhancements add gates to this skill's story-completion flow rather than implementing standalone loop logic. Epic 4 stories add quality gates (coverage, verification, doc health) to the skill. Epic 5 makes Ralph a session-management wrapper that invokes this skill.

### Epic 1: CLI Foundation & Project Initialization
User can install codeharness globally and initialize it in any project. The CLI detects the stack, creates the state file, configures enforcement levels, and scaffolds documentation. Idempotent — safe to re-run.
**FRs covered:** FR1, FR2, FR3, FR6, FR7, FR9, FR10, FR56, FR57

### Epic 2: Dependency Management & Observability Stack
CLI auto-installs all external dependencies with correct commands and fallback chains. When observability is enabled, manages the Docker-based VictoriaMetrics stack. Agent can query logs, metrics, and traces programmatically during development.
**FRs covered:** FR8, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19

### Epic 3: BMAD Integration & Story Bridge
CLI installs BMAD Method, applies harness patches to all 5 workflow files, and bridges BMAD stories into beads issues. Installs and configures beads. Two-layer model maintains sync between beads status and story file content. Hooks can create beads issues.
**FRs covered:** FR4, FR5, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR46

### Epic 4: Verification Pipeline & Quality Enforcement
Agent can verify features through real-world interaction (agent-browser, HTTP calls, DB MCP) and produce Showboat proof documents. Hooks mechanically enforce quality gates — commits blocked without tests passing, coverage met, and verification run. Testing, coverage, and doc health are integral quality gates.
**FRs covered:** FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR52, FR53, FR54, FR55, FR58, FR59, FR60
**Integration note:** All quality gate and verification requirements in this epic are implemented as enhancements to the sprint execution skill (`/harness-run` from Epic 0), not as standalone loop logic. Hooks (FR26-29) are orthogonal — they fire automatically during agent execution inside the skill.

### Epic 5: Autonomous Execution Loop (Ralph Wrapper)
Ralph provides multi-session, unattended sprint execution by spawning fresh Claude Code instances that invoke the `/harness-run` skill. Ralph handles concerns the in-session skill cannot: rate limiting, circuit breaker, crash recovery across sessions, and timeout management. Ralph does NOT implement its own task-picking or verification logic — the sprint skill owns that.
**FRs covered:** FR47, FR48, FR49, FR50, FR51
**Integration note:** Ralph's prompt tells Claude to run `/harness-run`. Task-picking (get_current_task, progress.json) is removed — the skill reads sprint-status.yaml. Ralph keeps: session spawning, rate limiting, circuit breaker, crash recovery, timeout. verify_gates.sh moves into the skill's story-completion flow.

### Epic 6: Brownfield Onboarding
User can onboard existing projects. CLI scans codebase with configurable module threshold, runs coverage analysis, audits documentation, generates an onboarding epic with stories imported as beads issues. User reviews and approves before execution.
**FRs covered:** FR61, FR62, FR63, FR64, FR65, FR66

### Epic 7: Status, Reporting & Lifecycle Management
User can view complete harness status (enforcement config, Docker state, beads summary, session flags, verification history) in one screen. Can cleanly teardown the harness without affecting project code or beads data. Verification summaries and sprint-level logging.
**FRs covered:** FR11, FR67, FR68, FR69

## Epic 0: In-Session Sprint Execution Skill

User can run `/harness-run` to autonomously execute one complete sprint in the current Claude Code session. This skill is the single source of sprint execution logic — progressively enhanced by Epic 4 (quality gates) and wrapped by Epic 5 (Ralph for multi-session).

### Story 0.1: Sprint Execution Skill — Autonomous In-Session Loop

As a developer,
I want to run `/harness-run` to autonomously execute stories in the current sprint,
So that I can develop features without manual story-by-story invocation.

**Acceptance Criteria:**

**Given** a sprint-status.yaml exists with stories in `backlog` status
**When** the developer runs `/harness-run`
**Then** the skill reads sprint-status.yaml to find the current epic (first non-done epic)
**And** identifies the next `backlog` story in that epic

**Given** the next story is identified
**When** the skill processes it
**Then** it invokes the create-story workflow (via Agent tool) to generate the story file
**And** updates sprint-status.yaml story status to `ready-for-dev`
**Then** it invokes the dev-story workflow (via Agent tool, fresh context) to implement
**And** updates sprint-status.yaml story status to `in-progress`
**Then** it invokes the code-review workflow (via Agent tool, fresh context)
**And** updates sprint-status.yaml story status to `done`

**Given** a story completes (status → done)
**When** there are more stories in the current epic
**Then** the skill proceeds to the next story automatically

**Given** all stories in an epic are done
**When** the epic-N-retrospective entry exists
**Then** the skill runs the retrospective workflow
**And** updates epic status to `done`
**And** proceeds to the next epic if stories remain

**Given** the skill encounters a failure
**When** the dev-story or code-review workflow fails
**Then** the skill retries the current story (max 3 attempts)
**And** if max retries exceeded, halts with status report

**Given** the skill completes or halts
**When** execution ends
**Then** sprint-status.yaml reflects the current state of all stories
**And** a summary is printed: stories completed, stories remaining, any failures

**Technical notes:**
- Each workflow invocation uses the Agent tool for context isolation
- sprint-status.yaml is the ONLY task source — no beads, no progress.json
- Status updates happen immediately after each workflow completes
- The skill is a Claude Code plugin skill/command, not a CLI command
- This is the minimal loop skeleton — quality gates added by Epic 4 stories

---

## Epic 1: CLI Foundation & Project Initialization

User can install codeharness globally and initialize it in any project. The CLI detects the stack, creates the state file, configures enforcement levels, and scaffolds documentation. Idempotent — safe to re-run.

### Story 1.1: Project Scaffold & CLI Entry Point

As a developer,
I want to install codeharness as a global npm package,
So that I can run `codeharness` commands in any project directory.

**Acceptance Criteria:**

**Given** a developer runs `npm install -g codeharness`
**When** the installation completes
**Then** the `codeharness` binary is available in PATH
**And** `codeharness --version` prints the current version
**And** `codeharness --help` lists all available commands

**Given** the CLI is installed
**When** a developer runs `codeharness --help`
**Then** all 7 commands are listed: init, bridge, run, verify, status, onboard, teardown
**And** the hidden `state` utility command is not shown in help but is callable

**Given** any command is invoked
**When** it produces output
**Then** each line uses `[OK]`, `[FAIL]`, `[WARN]`, or `[INFO]` status prefixes
**And** the `--json` flag is accepted and produces machine-readable JSON output

**Given** a developer runs any stub command (bridge, run, verify, status, onboard, teardown)
**When** the command executes
**Then** it exits with code 1 and prints `[FAIL] Not yet implemented. Coming in Epic N.`

**Given** the project structure
**When** built with `npm run build`
**Then** tsup compiles TypeScript from `src/index.ts` to `dist/index.js`
**And** `vitest` runs unit tests successfully
**And** exit codes follow convention: 0 success, 1 error, 2 invalid usage

### Story 1.2: Core Libraries — State, Stack Detection, Templates

As a developer,
I want the CLI to have reliable state management and stack detection,
So that init and all future commands can build on solid foundations.

**Acceptance Criteria:**

**Given** a project directory with no `.claude/codeharness.local.md`
**When** `state.ts` `writeState()` is called with a config object
**Then** it creates the file with YAML frontmatter using `snake_case` field names
**And** boolean values are YAML native `true`/`false` (not strings)
**And** null values are YAML `null` (not empty string)

**Given** an existing `.claude/codeharness.local.md` with valid YAML
**When** `state.ts` `readState()` is called
**Then** it parses the YAML frontmatter and returns a typed config object
**And** the markdown body below the frontmatter is preserved on subsequent writes

**Given** a corrupted `.claude/codeharness.local.md` (invalid YAML)
**When** `state.ts` `readState()` is called
**Then** it logs `[WARN] State file corrupted — recreating from detected config`
**And** recreates the state file from detected project state (NFR19)

**Given** a project directory with `package.json`
**When** `stack-detect.ts` `detectStack()` is called
**Then** it returns `"nodejs"`

**Given** a project directory with `requirements.txt` or `pyproject.toml`
**When** `stack-detect.ts` `detectStack()` is called
**Then** it returns `"python"`

**Given** a project directory with no recognized indicator files
**When** `stack-detect.ts` `detectStack()` is called
**Then** it returns `null` and logs `[WARN] No recognized stack detected`

**Given** an embedded template definition
**When** `templates.ts` `generateFile()` is called with a config object
**Then** it writes the file to the target path with template variables interpolated
**And** templates are TypeScript string literals — no external file reads

**Given** all three library modules
**When** unit tests are run via `vitest`
**Then** all tests pass with 100% coverage of state.ts, stack-detect.ts, and templates.ts

### Story 1.3: Init Command — Full Harness Initialization

As a developer,
I want to run `codeharness init` in my project directory,
So that the harness is configured with stack detection, enforcement levels, state file, and documentation scaffold — ready for development.

**Acceptance Criteria:**

**Given** a developer runs `codeharness init` in a Node.js project
**When** init completes
**Then** stack is detected as `"nodejs"` and printed as `[INFO] Stack detected: Node.js (package.json)`
**And** enforcement levels are prompted with max-enforcement defaults (all ON)
**And** the state file `.claude/codeharness.local.md` is created with the canonical structure from Architecture Decision 2

**Given** a developer answers enforcement prompts
**When** observability is set to OFF
**Then** Docker availability is NOT checked (FR9)
**And** the state file records `observability: false`

**Given** a developer answers enforcement prompts
**When** observability is set to ON
**Then** Docker availability IS checked
**And** if Docker is not installed, init prints `[FAIL] Docker not installed` with actionable remedy and exits 1

**Given** init creates the state file
**When** the file is written
**Then** it contains: `harness_version`, `initialized: true`, `stack`, `enforcement` block, `coverage` block with `target: 100`, `session_flags` block (all false), empty `verification_log` array

**Given** init runs in a project with no `AGENTS.md`
**When** documentation scaffold step executes
**Then** root `AGENTS.md` is generated with project structure, build/test commands, and conventions
**And** `AGENTS.md` does not exceed 100 lines (NFR24)
**And** `docs/` directory is created with `index.md`, `exec-plans/`, `quality/`, `generated/`
**And** `docs/index.md` references artifacts by relative path, never copies content (NFR25)
**And** `docs/generated/` and `docs/quality/` files include `DO NOT EDIT MANUALLY` headers (NFR26)

**Given** a developer runs `codeharness init` a second time in the same project
**When** init detects existing state file and documentation
**Then** existing configuration is preserved (not overwritten)
**And** existing AGENTS.md and docs/ are not regenerated
**And** init prints `[INFO] Harness already initialized — verifying configuration`
**And** init completes successfully (NFR22)

**Given** a developer runs `codeharness init --json`
**When** init completes
**Then** output is valid JSON with `status`, `stack`, `enforcement`, and `documentation` fields

**Given** any init execution
**When** measured from start to completion
**Then** init completes within 5 minutes (NFR5)

## Epic 2: Dependency Management & Observability Stack

CLI auto-installs all external dependencies with correct commands and fallback chains. When observability is enabled, manages the Docker-based VictoriaMetrics stack. Agent can query logs, metrics, and traces programmatically during development.

### Story 2.1: Dependency Auto-Install & OTLP Instrumentation

As a developer,
I want `codeharness init` to automatically install all external dependencies with correct commands,
So that I don't have to manually install Showboat, agent-browser, beads, or OTLP packages.

**Acceptance Criteria:**

**Given** a developer runs `codeharness init` in a Node.js project with observability ON
**When** the dependency install step executes
**Then** Showboat is installed via `pip install showboat` with fallback to `pipx install showboat`
**And** agent-browser is installed via `npm install -g @anthropic/agent-browser`
**And** beads is installed via `pip install beads` with fallback to `pipx install beads`
**And** each successful install prints `[OK] <tool>: installed (v<version>)`
**And** all versions are pinned in package.json (NFR12)

**Given** a Node.js project with observability ON
**When** OTLP instrumentation is configured
**Then** `@opentelemetry/auto-instrumentations-node` is installed as a project dependency
**And** the start script is updated with `--require @opentelemetry/auto-instrumentations-node`
**And** OTLP environment variables are set pointing to local OTel Collector (`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`)
**And** instrumentation adds <5% latency overhead (NFR6)

**Given** a Python project with observability ON
**When** OTLP instrumentation is configured
**Then** `opentelemetry-distro` and `opentelemetry-exporter-otlp` are installed
**And** the run command is wrapped with `opentelemetry-instrument`
**And** OTLP environment variables are configured

**Given** a dependency install fails (tool not found, network error)
**When** the primary install command fails
**Then** the fallback chain is attempted
**And** if all fallbacks fail, `[FAIL] <tool>: install failed` is printed with actionable remedy
**And** init continues for non-critical dependencies (agent-browser) but halts for critical ones (beads)

**Given** a developer runs `codeharness init` with `--no-observability`
**When** the dependency install step executes
**Then** OTLP packages are NOT installed
**And** agent-browser is still installed (used for verification, not observability)

**Given** `codeharness init --json` is used
**When** dependency install completes
**Then** JSON output includes `dependencies` object with each tool's install status and version

### Story 2.2: Docker Compose & VictoriaMetrics Stack Management

As a developer,
I want codeharness to manage an ephemeral VictoriaMetrics observability stack,
So that the agent has runtime visibility into my application during development.

**Acceptance Criteria:**

**Given** observability enforcement is ON and Docker is available
**When** `codeharness init` runs the Docker setup step
**Then** `docker-compose.harness.yml` is generated from embedded TypeScript templates (not copied from external files)
**And** the compose file includes: VictoriaLogs, VictoriaMetrics, OTel Collector
**And** all Docker image tags are pinned versions, never `latest` (NFR11)

**Given** a generated Docker Compose file
**When** the VictoriaMetrics stack is started
**Then** all services start within 30 seconds (NFR4)
**And** init prints port mappings: `[OK] VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)`

**Given** the VictoriaMetrics stack is running
**When** `codeharness init` is run again (idempotent)
**Then** the existing stack is detected and not restarted
**And** init prints `[INFO] VictoriaMetrics stack: already running`

**Given** the VictoriaMetrics stack crashes during development
**When** a health check is performed (via hook or `codeharness status --check-docker`)
**Then** the crash is detected and reported: `[FAIL] VictoriaMetrics stack: not running`
**And** actionable remedy is shown: `→ Restart: docker compose -f docker-compose.harness.yml up -d` (NFR16)

**Given** observability enforcement is OFF
**When** `codeharness init` runs
**Then** no Docker Compose file is generated
**And** no Docker commands are executed
**And** init prints `[INFO] Observability: disabled, skipping Docker stack`

**Given** Docker is not installed and observability is ON
**When** `codeharness init` runs
**Then** init prints `[FAIL] Docker not installed` with install link and `--no-observability` alternative
**And** init exits with code 1

### Story 2.3: Observability Querying — Agent Visibility into Runtime

As an autonomous agent,
I want to query application logs, metrics, and traces programmatically,
So that I can diagnose issues using real runtime data instead of guessing.

**Acceptance Criteria:**

**Given** the VictoriaMetrics stack is running and the application is instrumented
**When** the agent queries VictoriaLogs via `curl 'localhost:9428/select/logsql/query?query=level:error'`
**Then** application log entries matching the query are returned
**And** results return within 2 seconds (NFR2)

**Given** the VictoriaMetrics stack is running
**When** the agent queries VictoriaMetrics via PromQL (`curl 'localhost:8428/api/v1/query?query=...'`)
**Then** application metrics are returned in Prometheus format

**Given** the VictoriaMetrics stack is running with tracing enabled
**When** the agent queries VictoriaTraces
**Then** request trace data is returned showing the full request flow

**Given** the plugin is installed
**When** the agent needs to query observability data
**Then** the `knowledge/victoria-querying.md` file provides LogQL/PromQL query patterns
**And** the `skills/visibility-enforcement/` skill teaches the agent when and how to query

**Given** the OTel Collector is configured
**When** the instrumented application sends telemetry
**Then** logs are routed to VictoriaLogs
**And** metrics are routed to VictoriaMetrics
**And** traces are routed to VictoriaTraces (when enabled)
**And** the OTel Collector config is generated from embedded templates

## Epic 3: BMAD Integration & Story Bridge

CLI installs BMAD Method, applies harness patches to all 5 workflow files, and bridges BMAD stories into beads issues. Installs and configures beads. Two-layer model maintains sync between beads status and story file content.

### Story 3.1: Beads Installation & CLI Wrapper

As a developer,
I want codeharness to install beads and provide a reliable programmatic interface to it,
So that all task management flows through a unified, git-native issue tracker.

**Acceptance Criteria:**

**Given** a developer runs `codeharness init`
**When** the beads installation step executes
**Then** beads is installed via `pip install beads` with fallback to `pipx install beads`
**And** `bd init` is run if `.beads/` doesn't exist
**And** init prints `[OK] Beads: installed (v<version>)`

**Given** beads is installed
**When** `src/lib/beads.ts` wraps `bd` commands
**Then** `createIssue(title, opts)` calls `bd create` with `--json` flag
**And** `getReady()` calls `bd ready --json` and returns parsed issues
**And** `closeIssue(id)` calls `bd close <id>`
**And** `updateIssue(id, opts)` calls `bd update <id>` with provided options
**And** all `bd` calls use `--json` flag for programmatic consumption
**And** `bd ready --json` returns results in under 1 second (NFR8)

**Given** a `bd` command fails
**When** the error is caught by beads.ts
**Then** the error is wrapped with context: `"Beads failed: <original error>. Command: bd <args>"`
**And** the wrapped error is thrown (never swallowed silently)

**Given** the project has existing beads git hooks in `.beads/hooks/`
**When** `codeharness init` runs
**Then** beads git hooks (prepare-commit-msg, post-checkout) are detected
**And** Claude Code hooks (hooks.json) and git hooks are identified as separate systems — no conflict by default
**And** if both systems modify git hooks, CLI chains them in a harness-managed hooks directory
**And** init prints `[INFO] Beads hooks detected — coexistence configured` (NFR14)

**Given** the agent discovers a bug during development
**When** it runs `bd create "Bug description" --type bug --priority 1`
**Then** a beads issue is created with `discovered-from:<story-id>` link
**And** the issue appears in `bd ready` output when dependencies are met

**Given** a hook detects a problem
**When** the hook script calls `bd create` with type=bug and priority=1
**Then** a beads issue is created for the detected problem
**And** the hook continues with its allow/block decision

### Story 3.2: BMAD Installation & Workflow Patching

As a developer,
I want codeharness to install BMAD and patch its workflows with harness requirements,
So that every BMAD workflow enforces verification, testing, observability, and documentation.

**Acceptance Criteria:**

**Given** a project with no `_bmad/` directory
**When** `codeharness init` runs the BMAD installation step
**Then** BMAD Method is installed via `npx bmad-method init`
**And** harness patches are applied to all 5 workflow files
**And** init prints `[OK] BMAD: installed (v<version>), harness patches applied`

**Given** a project with existing `_bmad/` directory
**When** `codeharness init` runs
**Then** the existing BMAD installation is detected and preserved
**And** harness patches are applied (or updated if already present)
**And** init prints `[INFO] BMAD: existing installation detected, patches applied`
**And** BMAD v6+ artifact format is supported (NFR13)

**Given** a project with bmalph artifacts (`.ralph/.ralphrc`, bmalph CLI config)
**When** `codeharness init` runs
**Then** bmalph-specific files are identified and noted in onboard findings
**And** existing BMAD artifacts are preserved
**And** init prints `[WARN] bmalph detected — superseded files noted for cleanup`

**Given** the story template patch (`story-verification`)
**When** applied to BMAD story template
**Then** verification requirements, documentation requirements, and testing requirements are added
**And** patch uses markers: `<!-- CODEHARNESS-PATCH-START:story-verification -->` / `<!-- CODEHARNESS-PATCH-END:story-verification -->`

**Given** the dev-story workflow patch (`dev-enforcement`)
**When** applied to BMAD dev-story workflow
**Then** observability checks, docs updates, and test enforcement are added

**Given** the code-review workflow patch (`review-enforcement`)
**When** applied to BMAD code-review workflow
**Then** Showboat proof check, AGENTS.md freshness check, and coverage check are added

**Given** the retrospective workflow patch (`retro-enforcement`)
**When** applied to BMAD retrospective workflow
**Then** verification effectiveness, doc health, and test quality sections are added

**Given** the sprint-planning workflow patch (`sprint-beads`)
**When** applied to BMAD sprint-planning workflow
**Then** `bd ready` integration for backlog is added

**Given** any patch is applied twice
**When** the markers already exist in the target file
**Then** the content between markers is replaced (updated), not duplicated
**And** the result is identical to applying the patch once (NFR20)

**Given** patch templates
**When** they are stored
**Then** they are embedded in `src/templates/bmad-patches.ts` as TypeScript string literals
**And** patch names use kebab-case: `story-verification`, `dev-enforcement`, `review-enforcement`, `retro-enforcement`, `sprint-beads`

### Story 3.3: BMAD Parser & Story Bridge Command

As a developer,
I want to run `codeharness bridge --epics epics.md` to convert BMAD stories into beads tasks,
So that the autonomous loop can pick up stories from a unified task store.

**Acceptance Criteria:**

**Given** a developer runs `codeharness bridge --epics _bmad-output/planning-artifacts/epics.md`
**When** the bridge parses the epics file
**Then** all epics and stories are extracted from the markdown structure
**And** story titles, user stories, and acceptance criteria are parsed
**And** bridge prints per-epic summary: `[OK] Epic 1: <title> — <N> stories`

**Given** parsed stories
**When** the bridge imports them into beads
**Then** each story is created via `bd create` with `type=story`
**And** priority is set from sprint order (first story = highest priority)
**And** description contains the path to the story file
**And** dependencies between stories are set based on epic order
**And** bridge prints `[OK] Bridge: <N> stories imported into beads`

**Given** a 50-story epic file
**When** `codeharness bridge` processes it
**Then** parsing and import completes in under 10 seconds (NFR7)

**Given** `codeharness bridge --dry-run` is used
**When** the bridge parses stories
**Then** it prints what would be imported without actually calling `bd create`
**And** exits with code 0

**Given** `codeharness bridge` is run a second time on the same epics file
**When** existing beads issues match imported stories
**Then** duplicates are not created
**And** bridge prints `[INFO] Story already exists in beads: <title>`

**Given** the two-layer model
**When** a story is imported
**Then** beads issue holds: status, priority, dependencies, path to story file
**And** story file holds: ACs, dev notes, tasks/subtasks, verification requirements
**And** bridge creates the link: beads description → story file path

**Given** `codeharness bridge --json`
**When** bridge completes
**Then** JSON output includes array of imported stories with beads IDs and story file paths

### Story 3.4: Beads Sync & Issue Lifecycle

As a developer,
I want beads status and story file status to stay in sync,
So that I have a single source of truth regardless of whether I check beads or story files.

**Acceptance Criteria:**

**Given** Ralph completes a story and calls `bd close <id>`
**When** the close is processed by the CLI
**Then** the linked story file status is also updated to "done"
**And** both beads and story file reflect the same state

**Given** a story's status changes in beads (e.g., `bd update <id> --status in_progress`)
**When** the CLI processes the update
**Then** the linked story file status is updated to match
**And** sync is bidirectional: story file status changes also update beads

**Given** `codeharness onboard` generates findings
**When** findings are created
**Then** they are imported as beads issues with `type=task` and priority from severity
**And** each issue links to the relevant finding details

**Given** sprint planning workflow runs
**When** the team triages the backlog
**Then** `bd ready` shows the next unblocked tasks in priority order
**And** the sprint-beads patch integrates this into the BMAD sprint planning workflow

## Epic 4: Verification Pipeline & Quality Enforcement

Agent can verify features through real-world interaction (agent-browser, HTTP calls, DB MCP) and produce Showboat proof documents. Hooks mechanically enforce quality gates — commits blocked without tests passing, coverage met, and verification run. Testing, coverage, and doc health are integral quality gates.

### Story 4.1: Verification Pipeline & Showboat Integration

> **Sprint skill integration:** Implement verification as a step in the sprint execution skill's story-completion flow. When verification is available, the skill calls it between dev-story completion and marking status `done`.

As a developer,
I want to run `codeharness verify --story <id>` to produce real-world proof that a story works,
So that verified stories are backed by reproducible evidence, not just test results.

**Acceptance Criteria:**

**Given** a developer or agent runs `codeharness verify --story <story-id>`
**When** the verification pipeline starts
**Then** the story file is read and acceptance criteria are extracted
**And** preconditions are checked: `tests_passed` and `coverage_met` flags must be `true`
**And** if preconditions fail, `[FAIL] Preconditions not met` is printed with which flags are false

**Given** verification is running for a story with UI acceptance criteria
**When** the agent executes UI verification steps
**Then** agent-browser is used to interact with the application (navigate, fill forms, click, screenshot)
**And** annotated screenshots are captured via `showboat image`
**And** if agent-browser is unavailable, verification falls back gracefully with `[WARN] agent-browser unavailable — skipping UI verification` (NFR17)

**Given** verification is running for a story with API acceptance criteria
**When** the agent executes API verification steps
**Then** real HTTP calls are made (`curl` or equivalent) and response bodies inspected
**And** side effects are verified (e.g., DB state after POST)
**And** command output is captured via `showboat exec`

**Given** verification is running for a story with database acceptance criteria
**When** the agent needs to check DB state
**Then** Database MCP is used for read-only queries
**And** query results are captured as verification evidence

**Given** all verification steps complete
**When** evidence is captured
**Then** a Showboat proof document is created at `verification/<story-id>-proof.md`
**And** screenshots are stored at `verification/screenshots/<story-id>-<ac>-<desc>.png`
**And** proof document follows canonical structure: story header → AC sections with `showboat exec` blocks → verification summary
**And** verification summary includes: total ACs, verified count, failed count, showboat verify status

**Given** a proof document exists
**When** `showboat verify` is run against it
**Then** all captured commands are re-executed and outputs compared
**And** verification completes within 5 minutes for a typical story (NFR3)
**And** pass/fail result is reported

**Given** verification completes successfully
**When** all ACs are verified
**Then** CLI updates state: `codeharness state set verification_run true`
**And** beads issue is updated: `bd close <story-id>`
**And** `[OK] Story <id>: verified — proof at verification/<id>-proof.md` is printed

**Given** `codeharness verify --story <id> --json`
**When** verification completes
**Then** JSON output includes per-AC pass/fail, evidence paths, and showboat verify status

### Story 4.2: Hook Architecture & Enforcement

> **Sprint skill integration:** Hooks are orthogonal — they fire automatically during agent execution inside the sprint skill. No changes to the skill needed. Hooks enhance the skill's behavior without the skill knowing about them.

As a developer,
I want mechanical enforcement hooks that make skipping verification architecturally impossible,
So that the agent cannot commit code without passing quality gates.

**Acceptance Criteria:**

**Given** a Claude Code session starts
**When** the `session-start.sh` SessionStart hook fires
**Then** all session flags are reset to `false` via `codeharness state set`
**And** Docker stack health is checked (if observability ON) via `codeharness status --check-docker`
**And** agent-browser availability is checked
**And** beads readiness is checked (`bd ready` returns tasks)
**And** hook outputs JSON: `{"message": "Harness health: OK\n  Docker: running\n  Beads: N tasks ready\n  Session flags: reset"}`
**And** hook completes within 500ms (NFR1)

**Given** an agent attempts a git commit via the Bash tool
**When** the `pre-commit-gate.sh` PreToolUse hook fires
**Then** hook reads session flags from state file via `get_state()` bash function
**And** if `tests_passed`, `coverage_met`, or `verification_run` is `false`, commit is blocked
**And** block response includes which flags failed and remediation: `{"decision": "block", "reason": "Quality gates not met.\n\n  tests_passed: false\n  coverage_met: true\n\n→ Run tests before committing."}`
**And** if all flags are `true`, commit is allowed: `{"decision": "allow"}`
**And** hook exits 0 for allow, 2 for block (never exit 1)
**And** hook completes within 500ms (NFR1)

**Given** an agent writes code via the Write or Edit tool
**When** the `post-write-check.sh` PostToolUse hook fires
**Then** hook injects a verification prompt: `{"message": "New code written. Verify OTLP instrumentation is present.\n→ Check that new endpoints emit traces and structured logs."}`
**And** the prompt is specific and actionable, not a generic reminder
**And** hook completes within 500ms (NFR1)

**Given** an agent runs tests
**When** the `post-test-verify.sh` PostToolUse hook fires
**Then** hook prompts the agent to query logs: `{"message": "Tests complete. Query VictoriaLogs for errors:\n→ curl 'localhost:9428/select/logsql/query?query=level:error'"}`
**And** hook can create beads issues via `bd create` if problems are detected

**Given** the state file is missing when a hook fires
**When** the hook tries to read state
**Then** hook fails open: `{"decision": "allow"}` with exit 0
**And** `[WARN]` is written to stderr

**Given** a hook failure occurs (script error)
**When** the error is caught
**Then** clear error message is produced, not a silent block (NFR18)
**And** hook always outputs valid JSON regardless of internal errors

**Given** the plugin hook registration
**When** `hooks.json` is configured
**Then** all 4 hooks are registered with correct event types (SessionStart, PreToolUse, PostToolUse)
**And** hooks coexist with other Claude Code plugins without conflicts (NFR9)
**And** hooks work with Claude Code plugin system as of March 2026 (NFR10)

### Story 4.3: Testing, Coverage & Quality Gates

> **Sprint skill integration:** Implement coverage gate as an enhancement to the sprint execution skill. The skill checks tests pass and coverage is met before marking a story `done`. Gate is added to the skill's story-completion flow.

As a developer,
I want the harness to enforce 100% test coverage as a quality gate,
So that no blind spots accumulate across stories.

**Acceptance Criteria:**

**Given** a Node.js project
**When** `src/lib/coverage.ts` detects the coverage tool
**Then** c8 is identified as the coverage tool (from Vitest config or package.json)
**And** detection is automatic — no manual configuration required

**Given** a Python project
**When** `src/lib/coverage.ts` detects the coverage tool
**Then** coverage.py is identified as the coverage tool
**And** detection is automatic

**Given** the pre-commit quality gate
**When** tests need to run as part of the gate
**Then** `coverage.ts` runs the project's test suite with coverage enabled
**And** test results are captured: pass count, fail count, coverage percentage
**And** if tests fail, `codeharness state set tests_passed false` is called
**And** if tests pass, `codeharness state set tests_passed true` is called

**Given** tests pass with coverage data
**When** coverage is evaluated against the 100% target
**Then** if coverage >= 100%, `codeharness state set coverage_met true`
**And** if coverage < 100%, `codeharness state set coverage_met false`
**And** coverage percentage is printed: `[OK] Coverage: 100%` or `[FAIL] Coverage: 87% (target: 100%)`

**Given** a story is being completed
**When** coverage delta is calculated
**Then** the change in coverage from before the story to after is reported
**And** delta is printed: `[INFO] Coverage delta: +4% (96% → 100%)`

**Given** the state file has `coverage.baseline` as null (first run)
**When** coverage is measured
**Then** baseline is set to the current coverage value
**And** subsequent runs compare against baseline for delta

### Story 4.4: Documentation Health & Freshness Enforcement

> **Sprint skill integration:** Implement doc freshness check as an enhancement to the sprint execution skill. The skill verifies AGENTS.md and exec-plans are current before marking a story `done`. Gate is added to the skill's story-completion flow.

As a developer,
I want the harness to enforce documentation freshness during verification,
So that documentation stays current with the code it describes.

**Acceptance Criteria:**

**Given** the doc-gardener agent or `src/lib/scanner.ts` scans for stale documentation
**When** the scan runs
**Then** all AGENTS.md files, exec-plans, and docs/ content are checked for staleness
**And** a quality grade is produced per document (fresh/stale/missing)
**And** scan completes within 60 seconds (NFR23)

**Given** a story modifies code in a module
**When** verification runs for that story
**Then** the AGENTS.md for the changed module is checked for freshness
**And** if AGENTS.md doesn't reflect current code, verification prints `[FAIL] AGENTS.md stale for module: <name>`
**And** the story cannot be marked verified until AGENTS.md is updated

**Given** an active story is being implemented
**When** the exec-plan system is used
**Then** `docs/exec-plans/<story-id>.md` is generated for the active story
**And** upon verification passing, the exec-plan is moved to `docs/exec-plans/completed/`

**Given** generated documentation in `docs/generated/` or `docs/quality/`
**When** the files are created or updated
**Then** they include `DO NOT EDIT MANUALLY` headers (NFR26)

**Given** `docs/index.md` references BMAD artifacts
**When** the index is generated or updated
**Then** references use relative paths — content is never copied into the index (NFR25)

## Epic 5: Autonomous Execution Loop

User can start the full autonomous development loop. Vendored Ralph reads tasks from beads, spawns fresh Claude Code instances per iteration, enforces verification gates per story, handles termination and crash recovery.

### Story 5.1: Ralph Loop Integration & Beads Task Source

> **Sprint skill integration:** Ralph's prompt tells Claude to run `/harness-run`. Task-picking (get_current_task, progress.json) is removed — the skill reads sprint-status.yaml. Ralph keeps: session spawning, rate limiting, circuit breaker, crash recovery, timeout.

As a developer,
I want to run `codeharness run` to start autonomous development,
So that the agent implements stories from beads with fresh context per iteration.

**Acceptance Criteria:**

**Given** a developer runs `codeharness run`
**When** the run command starts
**Then** vendored Ralph is invoked via `child_process.spawn('bash', ['ralph/ralph.sh', ...])`
**And** `--plugin-dir` points to the installed plugin directory
**And** `--task-source beads` is passed to configure Ralph for beads
**And** `[INFO] Starting autonomous execution — <N> stories ready` is printed

**Given** Ralph is running with beads task source
**When** it needs the next task
**Then** `bd ready --json` is called to get the next unblocked task
**And** the task includes the path to the linked story file
**And** Ralph reads the story file for ACs, dev notes, and requirements

**Given** Ralph starts a new iteration
**When** a story is picked up
**Then** a fresh Claude Code instance is spawned with `claude --plugin-dir <path>`
**And** the previous iteration's context is NOT carried over
**And** `bd update <id> --status in_progress` marks the story as active
**And** `[INFO] Iteration <N>: Story <id> — <title>` is printed

**Given** Ralph spawns a Claude Code instance
**When** the agent starts working
**Then** the SessionStart hook fires (session flags reset, health check)
**And** the plugin provides all skills, knowledge, and hooks
**And** the agent has access to the full story file with ACs

**Given** `codeharness run --json`
**When** the loop runs
**Then** each iteration outputs JSON with story ID, status, and timing

### Story 5.2: Verification Gates, Termination & Tracking

> **Sprint skill integration:** Verification gates move into the sprint skill (Epic 4 enhancements). verify_gates.sh is removed. Ralph detects completion by checking sprint-status.yaml after each session — if all stories done, loop ends.

As a developer,
I want the autonomous loop to enforce verification before closing stories and handle termination gracefully,
So that no story is marked done without proof and the loop doesn't run forever.

**Acceptance Criteria:**

**Given** an agent completes implementation of a story
**When** the iteration reaches the verification gate
**Then** `codeharness verify --story <id>` is invoked
**And** if verification passes, `bd close <id>` marks the story done
**And** if verification fails, the agent iterates on the same story
**And** `[OK] Story <id>: DONE (bd close <beads-id>)` is printed on success

**Given** a story fails verification
**When** the agent retries
**Then** the same story is re-attempted in the next iteration
**And** iteration count for the story is tracked
**And** if the story exceeds a configurable retry limit, it's flagged and the loop moves on

**Given** all stories are completed
**When** `bd ready --json` returns no tasks
**Then** the loop terminates normally
**And** `[OK] All stories complete. <N> stories verified in <M> iterations.` is printed

**Given** `codeharness run --max-iterations <N>`
**When** the iteration count reaches N
**Then** the loop terminates with `[INFO] Max iterations (<N>) reached. <done>/<total> stories complete.`

**Given** the user sends a cancellation signal (SIGINT/Ctrl+C)
**When** the signal is received
**Then** the current iteration is allowed to complete (or cleanly interrupted)
**And** the loop exits with a summary of progress

**Given** the circuit breaker detects stagnation
**When** multiple consecutive iterations fail to make progress (no story state changes)
**Then** the loop terminates with `[WARN] Circuit breaker: no progress in <N> iterations`
**And** the current state is preserved for manual intervention

**Given** the Ralph loop crashes mid-iteration
**When** `codeharness run` is restarted
**Then** the loop resumes from the last completed story (NFR21)
**And** beads state reflects the true progress (completed stories remain closed)
**And** `[INFO] Resuming from last completed story` is printed

**Given** the loop runs across multiple stories
**When** progress is tracked
**Then** iteration count, stories completed, stories remaining, and elapsed time are maintained
**And** periodic progress summaries are printed: `[INFO] Progress: <done>/<total> stories complete (iterations: <N>, elapsed: <time>)`

## Epic 6: Brownfield Onboarding

User can onboard existing projects. CLI scans codebase with configurable module threshold, runs coverage analysis, audits documentation, generates an onboarding epic with stories imported as beads issues. User reviews and approves before execution.

### Story 6.1: Codebase Scan & Gap Analysis

As a developer with an existing project,
I want to run `codeharness onboard` to understand what my project needs to reach full harness compliance,
So that I get a clear picture of gaps before committing to the onboarding process.

**Acceptance Criteria:**

**Given** a developer runs `codeharness onboard` in an existing project
**When** the scan phase executes
**Then** source files are discovered and modules are identified
**And** module detection uses a configurable minimum threshold (default: 3 files to count as a module, NFR27)
**And** subdirectories below the threshold are grouped with their parent module
**And** `[INFO] Scan: <N> source files across <M> modules` is printed

**Given** `codeharness onboard --min-module-size <N>` is specified
**When** modules are detected
**Then** the custom threshold is used instead of the default 3

**Given** the scan completes module detection
**When** coverage analysis runs
**Then** `src/lib/coverage.ts` detects the coverage tool and runs coverage
**And** a gap report is produced showing: per-module coverage percentage, uncovered files count, overall project coverage
**And** `[INFO] Coverage: <X>% overall (<N> files uncovered)` is printed

**Given** the scan completes coverage analysis
**When** documentation audit runs
**Then** existing documentation is checked: README.md, AGENTS.md, ARCHITECTURE.md, docs/ directory
**And** each document gets a quality grade: present/stale/missing
**And** `[INFO] Docs: README(present) AGENTS.md(missing) ARCHITECTURE.md(missing)` is printed

**Given** the scan detects bmalph artifacts
**When** `.ralph/.ralphrc` or bmalph CLI config files are found
**Then** they are flagged as superseded files for cleanup
**And** existing BMAD artifacts (`_bmad/`) are preserved

**Given** `codeharness onboard scan --json`
**When** the scan completes
**Then** JSON output includes modules array, coverage data, doc audit results, and detected artifacts

**Given** subcommands are available
**When** the developer wants to run individual phases
**Then** `codeharness onboard scan` runs only module detection
**And** `codeharness onboard coverage` runs only coverage analysis
**And** `codeharness onboard audit` runs only documentation audit

### Story 6.2: Onboarding Epic Generation & Approval

As a developer with an existing project,
I want codeharness to generate an onboarding plan from scan findings and let me approve it,
So that I can review what will be done before the autonomous loop starts working on my project.

**Acceptance Criteria:**

**Given** scan findings are complete (modules, coverage gaps, doc audit)
**When** `codeharness onboard epic` generates the onboarding plan
**Then** an onboarding epic is created with stories based on findings:
**And** one coverage story per module below 100% coverage
**And** one story for AGENTS.md generation (per module needing it)
**And** one story for ARCHITECTURE.md if missing
**And** one story for doc freshness if stale docs detected
**And** one story for bmalph cleanup if bmalph artifacts found
**And** the epic is written to `ralph/onboarding-epic.md`

**Given** the onboarding epic is generated
**When** it is presented to the developer
**Then** the plan summary shows: total stories, coverage stories count, doc stories count
**And** each story has clear scope and acceptance criteria
**And** the developer is prompted: `Review the onboarding plan. Approve? [Y/n]`

**Given** the developer approves the plan
**When** approval is confirmed
**Then** all onboarding stories are imported into beads via `codeharness bridge --epics ralph/onboarding-epic.md`
**And** each finding becomes a beads issue with `type=task` and priority from severity
**And** `[OK] Onboarding: <N> stories imported into beads` is printed
**And** `Ready to run: codeharness run` is displayed

**Given** the developer rejects or wants to modify the plan
**When** they respond with `n` or provide feedback
**Then** the plan is not imported into beads
**And** the epic file remains at `ralph/onboarding-epic.md` for manual editing
**And** `[INFO] Plan saved to ralph/onboarding-epic.md — edit and re-run when ready` is printed

**Given** `codeharness onboard --json`
**When** the full onboard pipeline completes
**Then** JSON output includes scan results, generated stories, and import status

## Epic 7: Status, Reporting & Lifecycle Management

User can view complete harness status (enforcement config, Docker state, beads summary, session flags, verification history) in one screen. Can cleanly teardown the harness without affecting project code or beads data. Verification summaries and sprint-level logging.

### Story 7.1: Status Command & Reporting

As a developer,
I want to run `codeharness status` to see the complete harness state at a glance,
So that I know what's running, what's done, and what needs attention.

**Acceptance Criteria:**

**Given** a developer runs `codeharness status`
**When** the harness is initialized
**Then** output shows in one screen:
**And** harness version and stack: `Harness: codeharness v<version>` / `Stack: nodejs`
**And** enforcement config: `Enforcement: front:ON db:ON api:ON obs:ON`
**And** Docker state per service: running/stopped with ports (if observability ON)
**And** beads summary: total issues by type, ready/in-progress/done counts
**And** session flags: current values of `tests_passed`, `coverage_met`, `verification_run`, `logs_queried`
**And** coverage: current percentage and target

**Given** `codeharness status --check` is run
**When** health checks execute
**Then** Docker stack health is verified (if observability ON)
**And** beads availability is verified
**And** state file integrity is verified
**And** exit code 0 if all healthy, exit code 1 if any check fails

**Given** `codeharness status --check-docker` is run
**When** Docker health is checked
**Then** each VictoriaMetrics service is checked for running state
**And** if any service is down: `[FAIL] <service>: not running`
**And** actionable remedy is shown

**Given** stories have been verified during a sprint
**When** status reports verification history
**Then** per-story verification summary is shown: story ID, pass/fail, AC count, proof path
**And** sprint-level verification log is maintained across iterations

**Given** `codeharness status --json`
**When** status is queried
**Then** JSON output includes all status fields: version, stack, enforcement, docker, beads, session_flags, coverage, verification_log

### Story 7.2: Clean Teardown

As a developer,
I want to run `codeharness teardown` to remove all harness artifacts,
So that I can cleanly uninstall the harness without losing my project code or task history.

**Acceptance Criteria:**

**Given** a developer runs `codeharness teardown`
**When** teardown executes
**Then** Docker stack is stopped: `docker compose -f docker-compose.harness.yml down -v`
**And** `docker-compose.harness.yml` is removed
**And** Plugin directory artifacts are removed
**And** State file `.claude/codeharness.local.md` is removed
**And** BMAD harness patches are removed (content between markers deleted, markers deleted)
**And** OTLP instrumentation configuration is removed
**And** `[OK] Harness teardown complete` is printed

**Given** teardown runs
**When** project files are evaluated
**Then** project source code is NOT modified (NFR15)
**And** beads data (`.beads/`) is NOT removed (preserved by default)
**And** BMAD artifacts (`_bmad/`) are NOT removed (only harness patches within them)
**And** `docs/` content created by the developer is NOT removed
**And** verification proof documents are NOT removed

**Given** `codeharness teardown --keep-docker`
**When** teardown executes
**Then** Docker stack is left running
**And** `docker-compose.harness.yml` is preserved
**And** all other artifacts are removed

**Given** `codeharness teardown --keep-beads`
**When** teardown executes
**Then** beads data is explicitly preserved (this is the default, flag is for clarity)

**Given** Docker is not running at teardown time
**When** teardown tries to stop Docker
**Then** `[INFO] Docker stack: not running, skipping` is printed
**And** teardown continues without error

**Given** `codeharness teardown --json`
**When** teardown completes
**Then** JSON output includes list of removed artifacts and preserved items

---

## Epic 8: Onboarding Hardening & Issue Deduplication

**Goal:** Make `codeharness onboard` state-aware, incremental by default, and fix issue deduplication across the entire pipeline so the same gap is never tracked twice regardless of how it was created.

### Story 8.1: Stable Issue Identity & Beads-Level Deduplication

**As a** developer running onboard or bridge multiple times,
**I want** the system to never create duplicate beads issues for the same gap,
**So that** my issue list stays clean and I don't waste time on already-tracked work.

**Scope:** Create a `gap-id` tagging system embedded in beads issue descriptions. All code paths that create beads issues (bridge, onboard epic, hooks) use the same dedup function that checks open beads issues by gap-id before creating.

#### Acceptance Criteria

**Given** a gap like "coverage below 80% in src/lib/scanner.ts"
**When** any code path creates a beads issue for it
**Then** the issue description contains a tag like `[gap:coverage:src/lib/scanner.ts]`

**Given** a beads issue already exists with tag `[gap:coverage:src/lib/scanner.ts]` and status `open`
**When** onboard or bridge tries to create another issue for the same gap
**Then** the existing issue is returned, no duplicate is created
**And** `[INFO] Already tracked: <title> (ISSUE-NNN)` is printed

**Given** the `bridge` command imports stories from BMAD epics
**When** importing, each story gets a deterministic gap-id based on epic number + story number
**Then** re-running `bridge` with the same epics file creates no duplicates

**Given** the `post-test-verify` hook creates a beads issue for a test failure
**When** the same test fails again in the next iteration
**Then** no duplicate issue is created

#### Technical Notes

- New function `findExistingByGapId(gapId: string, beadsFns)` in `src/lib/beads.ts`
- Gap-id format: `[gap:<category>:<identifier>]` embedded in issue description
- Categories: `coverage`, `docs`, `verification`, `bridge`, `test-failure`
- All callers of `createIssue` should go through a new `createOrFindIssue` wrapper
- Dedup only checks open issues (closed issue handling is a separate future concern)

---

### Story 8.2: Onboard Precondition Checks & State Awareness

**As a** developer running `codeharness onboard` on an existing project,
**I want** the command to check prerequisites and understand what's already set up,
**So that** it doesn't suggest work that's already done or fail silently due to missing setup.

**Scope:** Add precondition checks to `onboard` and make it read existing state before scanning.

#### Acceptance Criteria

**Given** `codeharness init` has NOT been run
**When** I run `codeharness onboard`
**Then** `[FAIL] Harness not initialized — run codeharness init first` is printed
**And** exit code is 1

**Given** BMAD is not installed
**When** I run `codeharness onboard`
**Then** `[WARN] BMAD not installed — generated stories won't be executable until init completes` is printed
**And** onboard continues (non-blocking)

**Given** enforcement hooks are not registered
**When** I run `codeharness onboard`
**Then** `[WARN] Hooks not registered — enforcement won't be active` is printed

**Given** I previously ran onboard and fixed 3 of 5 gaps
**When** I run `codeharness onboard` again
**Then** only the 2 remaining unfixed gaps are surfaced
**And** the output shows `[INFO] 3 previously tracked gaps already in beads`

**Given** `--full` flag is passed
**When** I run `codeharness onboard --full`
**Then** all gaps are shown regardless of existing beads issues (full re-scan mode)

---

### Story 8.3: Extended Gap Detection — Verification, Per-File Coverage, Observability

**As a** developer onboarding an existing project,
**I want** the scanner to detect all types of gaps (not just test coverage and docs),
**So that** the generated onboarding epic covers everything needed for full harness compliance.

**Scope:** Extend the gap detector to cover verification coverage, per-file coverage floor, and observability readiness.

#### Acceptance Criteria

**Given** stories exist in sprint-status.yaml with status `done`
**When** those stories have no proof document in `docs/exec-plans/completed/`
**Then** a gap `[gap:verification:<story-key>]` is created for each
**And** the onboarding epic includes "Create verification proof for <story>" stories

**Given** the coverage report shows files below 80% statement coverage
**When** onboard runs coverage analysis
**Then** `checkPerFileCoverage(80)` is used instead of the per-module `analyzeCoverageGaps`
**And** each violating file generates a gap `[gap:coverage:<file-path>]`

**Given** observability is enabled in state but OTLP env vars are not configured
**When** onboard runs
**Then** a gap `[gap:observability:otlp-config]` is surfaced
**And** the epic includes "Configure OTLP instrumentation" story

**Given** observability is enabled but Docker stack is not running
**When** onboard runs
**Then** a gap `[gap:observability:docker-stack]` is surfaced

**Given** observability is disabled in state (`enforcement.observability: false`)
**When** onboard runs
**Then** no observability gaps are generated

---

### Story 8.4: Scan Persistence & Onboarding Progress Tracking

**As a** developer going through onboarding over multiple sessions,
**I want** scan results to persist and progress to be visible,
**So that** I can see how far along the onboarding is without re-scanning every time.

**Scope:** Persist scan results to a file, add progress reporting.

#### Acceptance Criteria

**Given** `codeharness onboard scan` completes
**When** results are ready
**Then** they are saved to `.harness/last-onboard-scan.json`

**Given** a saved scan exists and is less than 24 hours old
**When** `codeharness onboard coverage` or `onboard epic` runs
**Then** the saved scan is reused instead of re-scanning
**And** `[INFO] Using cached scan from <timestamp>` is printed

**Given** a saved scan exists but is older than 24 hours
**When** any onboard subcommand runs
**Then** a fresh scan is performed
**And** the cache is updated

**Given** `--force-scan` flag is passed
**When** onboard runs
**Then** cache is ignored and a fresh scan is performed

**Given** onboarding has generated 7 gaps and 3 are fixed (closed in beads)
**When** I run `codeharness onboard` or `codeharness status`
**Then** `[INFO] Onboarding progress: 3/7 gaps resolved (4 remaining)` is printed

**Given** all onboarding gaps are resolved
**When** I run `codeharness onboard`
**Then** `[OK] Onboarding complete — all gaps resolved` is printed
**And** exit code is 0

---

## Epic 9: Observability Rearchitecture — Shared Stack, Universal Instrumentation, Mandatory Telemetry

**Goal:** Replace the per-project local Docker stack with a shared per-machine installation that all harness projects reuse, support remote backends, make observability mandatory (no opt-out), add instrumentation for all app types (web, CLI, agents), and enforce data isolation via `service.name`.

### Story 9.1: Shared Machine-Level Observability Stack

**As a** developer working on multiple harness projects on the same machine,
**I want** a single shared VictoriaMetrics/Logs/Traces stack that all projects use,
**So that** I don't waste resources running duplicate Docker containers per project and can view all project telemetry from one place.

**Scope:** Move the Docker Compose stack from per-project to a machine-level location (`~/.codeharness/stack/`). Add stack discovery so `codeharness init` finds an already-running stack instead of creating a new one. Add a `codeharness stack` command for explicit stack management.

#### Acceptance Criteria

**Given** no shared stack is running on the machine
**When** I run `codeharness init` in any project
**Then** the shared stack is started at `~/.codeharness/stack/`
**And** `docker-compose.harness.yml` and `otel-collector-config.yaml` are written to `~/.codeharness/stack/`
**And** `[OK] Observability stack: started (shared at ~/.codeharness/stack/)` is printed

**Given** the shared stack is already running (started by another project)
**When** I run `codeharness init` in a new project
**Then** the existing stack is discovered via Docker container labels or compose project name
**And** no new containers are started
**And** `[OK] Observability stack: already running (shared)` is printed

**Given** project A and project B both use the shared stack
**When** I run `codeharness teardown` in project A
**Then** the shared stack is NOT stopped (project B still uses it)
**And** only project A's local config is cleaned up

**Given** I want to explicitly manage the shared stack
**When** I run `codeharness stack stop`
**Then** the shared Docker stack is stopped
**And** `[WARN] Stopping shared stack — all harness projects will lose observability` is printed

**Given** I run `codeharness stack start`
**When** the stack was previously stopped
**Then** containers resume with existing data volumes preserved

**Given** I run `codeharness stack status`
**When** the stack is running
**Then** all service health statuses are shown with endpoint URLs

#### Technical Notes

- Stack location: `~/.codeharness/stack/` (XDG-aware: `$XDG_DATA_HOME/codeharness/stack/` if set)
- Docker Compose project name: `codeharness-shared` (fixed, not per-project)
- Port range: fixed (9428, 8428, 16686, 4317, 4318) — document in init output
- Discovery: check for running containers with label `com.codeharness.stack=shared` or `docker compose -p codeharness-shared ps`
- Remove per-project `docker-compose.harness.yml` generation from init
- The `otel-collector-config.yaml` stays the same — it just lives at the machine level now
- Stack lifecycle is independent of any single project

---

### Story 9.2: Remote Backend Support

**As a** developer on a team with shared infrastructure,
**I want** to connect my harness project to a remote VictoriaMetrics/Logs/Traces instance instead of a local Docker stack,
**So that** I can use existing company infrastructure and share telemetry with my team.

**Scope:** Add remote endpoint configuration to `codeharness init` and state. When remote endpoints are configured, skip Docker stack entirely and point OTel Collector (or direct OTLP export) to remote URLs.

#### Acceptance Criteria

**Given** I run `codeharness init --otel-endpoint https://otel.mycompany.com:4318`
**When** init configures OTLP
**Then** the OTel endpoint is set to the provided URL (no local Docker started)
**And** state file contains `otlp.endpoint: https://otel.mycompany.com:4318`

**Given** I run `codeharness init --logs-url https://logs.mycompany.com --metrics-url https://metrics.mycompany.com --traces-url https://traces.mycompany.com`
**When** init configures observability
**Then** a local OTel Collector config is generated that routes to these remote backends
**And** the local OTel Collector container is started (but NOT VictoriaMetrics/Logs/Jaeger — they're remote)

**Given** no endpoint flags are passed
**When** I run `codeharness init`
**Then** local shared stack behavior is used (Story 9.1)

**Given** remote endpoints are configured
**When** I run `codeharness status --check-docker`
**Then** Docker health check is skipped for remote backends
**And** connectivity to remote endpoints is verified via HTTP health check instead

**Given** remote endpoints are configured
**When** the knowledge file `observability-querying.md` is used by the agent
**Then** query URLs use the remote endpoints from state, not hardcoded localhost

#### Technical Notes

- Endpoint config stored in state file under `otlp` section
- Three modes: `local-shared` (default), `remote-direct` (OTLP endpoint only), `remote-routed` (local OTel Collector → remote backends)
- `remote-direct` = no local containers at all, app sends OTLP directly to remote
- `remote-routed` = local OTel Collector for buffering/retry, backends are remote
- Query URLs in knowledge file should be templated from state, not hardcoded

---

### Story 9.3: Mandatory Observability & Remove Opt-Out

**As a** harness maintainer,
**I want** observability to be mandatory for every harness project,
**So that** runtime behavior is always visible and the agent always has access to logs/metrics/traces during development.

**Scope:** Remove `--no-observability` flag and `enforcement.observability` toggle. Make observability always-on. Update all code paths that check for observability being disabled.

#### Acceptance Criteria

**Given** `codeharness init` is run
**When** init configures the project
**Then** observability is always enabled — no `--no-observability` flag exists
**And** `enforcement.observability` is removed from state (or always `true`)

**Given** Docker is not available on the machine
**When** init runs and needs the observability stack
**Then** `[WARN] Docker not available — observability will use remote mode` is printed
**And** init prompts for remote endpoint OR prints instructions for installing Docker
**And** init does NOT fail — it configures the project for remote-when-available

**Given** a project initialized with an older version that had `observability: false`
**When** `codeharness init` is re-run (idempotent)
**Then** observability is enabled and configured
**And** `[INFO] Observability upgraded from disabled to enabled` is printed

**Given** hooks previously had `if observability OFF → skip` logic
**When** any hook runs
**Then** observability checks are always performed (hooks simplified)

#### Technical Notes

- Remove `--no-observability`, `--no-frontend`, `--no-database`, `--no-api` flags entirely OR keep `--no-frontend/database/api` but remove `--no-observability`
- Remove `if (state.enforcement.observability === false)` branches throughout codebase
- Update `session-start.sh`, `post-write-check.sh`, `post-test-verify.sh` to remove observability-off bypass
- Migration path: existing projects with `observability: false` get auto-upgraded on next `init`

---

### Story 9.4: Universal Instrumentation — Web, CLI, Agent Support

**As a** developer building any type of application,
**I want** codeharness to instrument my project regardless of whether it's a web app, CLI tool, or AI agent,
**So that** I get observability for all project types, not just long-running Node.js/Python servers.

**Scope:** Extend OTLP instrumentation to handle short-lived processes (CLIs), browser-side telemetry (web apps), and LLM call tracing (agents).

#### Acceptance Criteria

**Given** a Node.js CLI project (no `start` script, has `bin` in package.json)
**When** `codeharness init` detects the CLI stack type
**Then** OTLP is configured with `OTEL_BSP_SCHEDULE_DELAY=100` (flush quickly for short-lived processes)
**And** a wrapper script or `NODE_OPTIONS` env var is configured for CLI execution
**And** the state records `app_type: cli`

**Given** a web application (has `index.html` or frontend framework detected)
**When** `codeharness init` detects the web stack type
**Then** a browser OTLP setup is configured (OTel Web SDK snippet or package)
**And** the OTel Collector is configured to accept browser telemetry on HTTP endpoint
**And** CORS headers are configured on the OTel Collector for localhost origins

**Given** a Python or Node.js agent project (imports `anthropic`, `openai`, `langchain`, etc.)
**When** `codeharness init` detects the agent stack type
**Then** LLM call tracing is configured (OpenLLMetry / Traceloop or similar)
**And** token usage, latency, and prompt/completion lengths are captured as metrics
**And** the state records `app_type: agent`

**Given** any app type
**When** telemetry is emitted
**Then** `service.name` is always set to the project name
**And** `service.instance.id` is set to a unique value per process
**And** data from different projects is separable in queries

**Given** stack detection cannot determine the app type
**When** `codeharness init` runs
**Then** `[INFO] App type: generic (manual OTLP setup may be needed)` is printed
**And** basic OTLP env vars are still configured (endpoint, service name)
**And** the knowledge file provides manual instrumentation guidance

#### Technical Notes

- Extend `detectStack()` to return app type: `server`, `cli`, `web`, `agent`, `generic`
- CLI instrumentation: `OTEL_BSP_SCHEDULE_DELAY=100`, `OTEL_TRACES_SAMPLER=always_on`, flush-on-exit
- Web instrumentation: `@opentelemetry/sdk-trace-web`, `@opentelemetry/instrumentation-fetch`
- Agent instrumentation: OpenLLMetry (`traceloop-sdk`) or manual span wrapping
- Data isolation: `service.name` resource attribute set via `OTEL_SERVICE_NAME` env var
- `service.instance.id` via `OTEL_RESOURCE_ATTRIBUTES="service.instance.id=$(hostname)-$$"`
- Update all query patterns in knowledge files to include `service.name` filter

---

### Story 9.5: Data Isolation & Multi-Project Query Patterns

**As a** developer running multiple harness projects against the same observability stack,
**I want** each project's data to be cleanly separated and queryable independently,
**So that** logs/metrics/traces from project A don't pollute project B's dashboards and queries.

**Scope:** Enforce `service.name` on all telemetry, update all query patterns to filter by it, and add project-scoped query helpers to the CLI.

#### Acceptance Criteria

**Given** project "my-api" and project "my-worker" both send telemetry to the shared stack
**When** I query logs for "my-api"
**Then** only logs with `service.name=my-api` are returned
**And** "my-worker" logs are excluded

**Given** `codeharness init` sets up OTLP
**When** the project emits telemetry
**Then** `OTEL_SERVICE_NAME` env var is set to the project name
**And** all OTel SDKs pick it up automatically (no manual code needed)

**Given** `codeharness status` shows endpoints
**When** endpoint URLs are displayed
**Then** they include the `service.name` query filter pre-applied
**Example:** `logs: http://localhost:9428/select/logsql/query?query={service_name="my-api"}`

**Given** the agent queries observability data during development
**When** it uses patterns from `knowledge/observability-querying.md`
**Then** all example queries include `service.name` filter
**And** the knowledge file references the project name from state

**Given** the OTel Collector receives telemetry without `service.name`
**When** the telemetry is processed
**Then** it is tagged with a default `service.name=unknown-<timestamp>` to prevent untagged pollution

#### Technical Notes

- `OTEL_SERVICE_NAME` is the standard env var — all OTel SDKs read it
- Set in `.env`, `package.json` scripts, or state file during init
- OTel Collector processor: add `resource/default` processor that injects `service.name` if missing
- Update `knowledge/observability-querying.md`: all LogQL, PromQL, and Jaeger queries must include `service.name` filter
- Update `status.ts` endpoint display to include service-scoped query URLs
- Consider adding `codeharness query logs "error"` shorthand that auto-applies service.name filter

---

### Epic 11: Retrospective Integration & GitHub Issue Loop

Retrospective findings become actionable work items through beads and GitHub issues. Retro action items are classified (project/harness/tool), imported to beads with dedup gap-ids, and optionally pushed to GitHub repos. GitHub issues with `sprint-candidate` labels can be imported back into beads for sprint planning triage. Sprint planning consumes both retro findings and GitHub issues through the existing `bd ready` pipeline.

**FRs covered:** FR71, FR72, FR73, FR74

**Stories:**
- 11-1: Fix retro status lifecycle
- 11-2: Retro finding classification & beads import
- 11-3: GitHub issue creation from retro findings
- 11-4: GitHub issue import to beads
- 11-5: Sprint planning retro & issue integration

## Epic 11: Retrospective Integration & GitHub Issue Loop

### Story 11.1: Fix Retro Status Lifecycle

**As a** developer using codeharness,
**I want** retrospective status to update from `optional` to `done` when a retro is completed,
**So that** sprint-status.yaml accurately reflects which epics have had retrospectives.

**Scope:** Fix harness-run Step 5 to explicitly update retro status. Add `--retro` flag to `codeharness verify` to mark a retro complete. Patch sprint-planning to read previous retro action items.

#### Acceptance Criteria

**Given** all stories in an epic are `done`
**When** the harness-run skill executes Step 5 (epic completion)
**Then** the retrospective agent is invoked
**And** `epic-N-retrospective` status is updated to `done` in sprint-status.yaml by the harness-run skill itself (not delegated to the retro agent)

**Given** a user runs `codeharness verify --retro --epic N`
**When** `epic-N-retrospective.md` exists in implementation-artifacts
**Then** the status is updated to `done` in sprint-status.yaml
**And** the CLI prints `[OK] Epic N retrospective: marked done`

**Given** sprint planning is invoked for a new sprint
**When** previous epics have completed retrospectives
**Then** unresolved action items from those retros are surfaced during planning

#### Technical Notes

- harness-run.md already has the structure in Step 5 — the fix is making the status update explicit (Edit tool, not relying on retro agent)
- `verify.ts` needs a new `--retro` + `--epic` flag branch
- Sprint planning patch reads `epic-N-retrospective.md` files, extracts action items table

---

### Story 11.2: Retro Finding Classification & Beads Import

**As a** developer,
**I want** retro findings to automatically become beads issues,
**So that** action items don't get lost between sprints.

**Scope:** New CLI command `codeharness retro-import --epic N`. Parses retro markdown, extracts action items, classifies each, creates beads issues with dedup gap-ids.

#### Acceptance Criteria

**Given** `epic-N-retrospective.md` exists with an "Action Items" table
**When** the user runs `codeharness retro-import --epic N`
**Then** each action item is parsed: number, description, target epic, owner
**And** each is classified as `project` | `harness` | `tool:<name>` based on content analysis

**Given** action items are classified
**When** beads issues are created
**Then** each has gap-id `[gap:retro:epic-N-item-M]` for dedup
**And** type is `task`, priority derived from action item urgency
**And** description includes the original retro context

**Given** `retro-import` is run twice for the same epic
**When** issues with matching gap-ids already exist in beads
**Then** no duplicate issues are created
**And** CLI prints `[INFO] Skipping existing: {title}`

**Given** the `--json` flag is passed
**When** the command completes
**Then** output is JSON: `{"imported": N, "skipped": M, "issues": [...]}`

#### Technical Notes

- New file: `src/commands/retro-import.ts` — Commander.js registration
- New file: `src/lib/retro-parser.ts` — markdown parsing, action item extraction, classification
- Uses existing `beads.ts` `createOrFindIssue()` with gap-ids
- Classification heuristics: "harness" or "codeharness" in text → `harness`; tool names (showboat, ralph, beads) → `tool:<name>`; everything else → `project`

---

### Story 11.3: GitHub Issue Creation from Retro Findings

**As a** developer,
**I want** retro findings to create GitHub issues on the appropriate repos,
**So that** findings are tracked in the project's issue tracker and visible to collaborators.

**Scope:** After beads import, create GitHub issues via `gh issue create`. Project findings → project repo. Harness findings → codeharness repo. Configurable via `retro_issue_targets` in state file.

#### Acceptance Criteria

**Given** retro findings have been imported to beads (Story 11.2 completed)
**When** `codeharness retro-import --epic N` runs with `retro_issue_targets` configured
**Then** project-classified findings create issues on the project repo (auto-detected from git remote)
**And** harness-classified findings create issues on `iVintik/codeharness` repo
**And** each issue body includes the retro context, epic number, and source project name

**Given** a GitHub issue with the same gap-id already exists on the target repo
**When** `retro-import` runs
**Then** no duplicate issue is created
**And** CLI prints `[INFO] GitHub issue exists: owner/repo#N`

**Given** `gh` CLI is not installed or not authenticated
**When** `retro-import` attempts GitHub issue creation
**Then** beads import still succeeds
**And** GitHub creation is skipped with `[WARN] gh CLI not available — skipping GitHub issue creation`

**Given** `retro_issue_targets` is not configured in state file
**When** `retro-import` runs
**Then** only beads import happens (no GitHub issues)
**And** CLI prints `[INFO] No retro_issue_targets configured — skipping GitHub issues`

#### Technical Notes

- New file: `src/lib/github.ts` — wraps `gh issue create`, `gh issue list`, `gh issue search`
- Uses `execFileSync('gh', [...])` pattern matching `beads.ts`
- Idempotency: search existing issues with `gh issue list --search "gap:retro:epic-N-item-M"` before creating
- `retro_issue_targets` config lives in `codeharness.local.md` YAML frontmatter
- Labels auto-created if user has write access (try `gh label create`, ignore failure)

---

### Story 11.4: GitHub Issue Import to Beads

**As a** developer,
**I want** to import GitHub issues labeled `sprint-candidate` into beads,
**So that** external issues appear in my sprint planning backlog.

**Scope:** New CLI command `codeharness github-import [--repo owner/repo] [--label sprint-candidate]`. Queries GitHub, creates beads issues with dedup.

#### Acceptance Criteria

**Given** GitHub issues exist with label `sprint-candidate` on the project repo
**When** the user runs `codeharness github-import`
**Then** each issue is imported as a beads issue
**And** each has gap-id `[source:github:owner/repo#N]` for dedup
**And** GitHub labels are mapped to beads type: `bug` label → type=bug, `enhancement` → type=story, default → type=task

**Given** a beads issue with matching gap-id already exists
**When** `github-import` runs
**Then** no duplicate is created
**And** CLI prints `[INFO] Skipping existing: owner/repo#N — {title}`

**Given** `--repo` is not specified
**When** the command runs
**Then** the repo is auto-detected from `git remote get-url origin`

**Given** `gh` CLI is not installed
**When** the command runs
**Then** it fails with `[FAIL] gh CLI not found. Install: https://cli.github.com/`

**Given** the `--json` flag is passed
**When** the command completes
**Then** output is JSON: `{"imported": N, "skipped": M, "issues": [...]}`

#### Technical Notes

- New file: `src/commands/github-import.ts` — Commander.js registration
- Uses `src/lib/github.ts` for `gh` CLI interaction
- Uses existing `beads.ts` `createOrFindIssue()` with `[source:github:...]` gap-ids
- Priority mapping: GitHub `priority:high` label → priority 1, `priority:low` → priority 3, default → priority 2
- Auto-detect repo: `git remote get-url origin` → parse `owner/repo` from URL

---

### Story 11.5: Sprint Planning Retro & Issue Integration

**As a** developer starting a new sprint,
**I want** sprint planning to show retro action items and GitHub issues alongside existing beads backlog,
**So that** I have a complete picture of available work during triage.

**Scope:** Patch BMAD sprint-planning workflow to: read latest retro action items, run `codeharness github-import`, present combined backlog via `bd ready`.

#### Acceptance Criteria

**Given** previous epics have retrospectives with unresolved action items
**When** sprint planning is invoked
**Then** the planning workflow reads all `epic-N-retrospective.md` files
**And** surfaces action items that haven't been addressed in subsequent epics

**Given** the project has `retro_issue_targets` configured
**When** sprint planning runs
**Then** it executes `codeharness github-import` to pull labeled issues
**And** newly imported issues appear in the `bd ready` backlog

**Given** both retro findings and GitHub issues exist in beads
**When** the planner presents the backlog
**Then** issues are shown with their source (retro vs GitHub vs manual)
**And** the planner can triage all sources uniformly

#### Technical Notes

- New BMAD patch: `templates/bmad-patches/sprint-planning-retro-patch.md`
- Patch adds steps before existing `bd ready` triage:
  1. Scan `_bmad-output/implementation-artifacts/epic-*-retrospective.md` for unresolved items
  2. Run `codeharness retro-import` for any retros not yet imported
  3. Run `codeharness github-import` to pull latest labeled issues
  4. Present combined `bd ready` output
- Uses marker-based patching per Architecture Decision 7

---

### Epic 12: Verification Pipeline Integrity & Sprint Infrastructure

The verification pipeline is broken at three independent layers — verifier agent, CLI verify, and harness-run all fail to catch empty proofs. All Epic 11 stories were marked `done` with skeleton proof documents containing zero evidence. Additionally, sprint infrastructure has gaps: implementation artifacts untracked by git, subagent commits fragmented with misleading messages, AGENTS.md staleness creates false-positive blocks.

**Critical rule established:** Unit test output is NEVER valid AC evidence. All ACs must be verified by simulating how a user or consuming system sees it — run the actual binary, check real output, inspect real file changes.

**FRs covered:** FR75, FR76, FR77, FR78, FR79

**GitHub issues addressed:** #1, #2, #3, #4, #5, #6, #7, #8

**Stories:**
- 12-1: Fix verification pipeline (all three layers)
- 12-2: Sprint execution ownership (commits, tracking, staleness)
- 12-3: Unverifiable AC detection & escalation

## Epic 12: Verification Pipeline Integrity & Sprint Infrastructure

### Story 12.1: Fix Verification Pipeline

**As a** developer using codeharness,
**I want** the verification pipeline to reject empty or fake proof documents at every layer,
**So that** stories marked `done` actually have real, reproducible evidence.

**Scope:** Fix three layers: (1) `codeharness verify` CLI rejects proofs with PENDING ACs, (2) verifier agent uses `showboat exec` for real user-facing evidence, (3) harness-run validates proof content after verifier completes. Establish rule: unit test output is never valid AC evidence.

#### Acceptance Criteria

**Given** a proof file with all ACs showing `PENDING` and `<!-- No evidence captured yet -->`
**When** `codeharness verify --story <id>` runs
**Then** it exits 1 with `[FAIL] Proof quality check failed: 0/N ACs verified`
**And** does NOT mark the story as verified

**Given** a proof file where all ACs have `showboat exec` evidence blocks
**When** `codeharness verify --story <id>` runs
**Then** it passes the proof quality check
**And** proceeds to showboat verify and state update

**Given** the verifier agent is spawned for a story
**When** it produces evidence for each AC
**Then** each AC has a `showboat exec bash "..."` block running real CLI commands (e.g., `codeharness verify --retro --epic 1`, `cat .claude/codeharness.local.md | grep key`)
**And** NO AC uses unit test output (`npm run test:unit`) as its primary evidence

**Given** the verifier agent completes
**When** harness-run Step 3d checks the proof
**Then** it parses the proof file and counts AC statuses
**And** if any AC is PENDING, it rejects and re-spawns the verifier (up to max_retries)
**And** it runs `showboat verify` in the main session and checks exit code (not agent's claim)

**Given** `--json` flag on `codeharness verify`
**When** proof quality is checked
**Then** output includes `"proofQuality": {"verified": N, "pending": M, "total": K}`

#### Technical Notes

- Modify `src/lib/verify.ts`: replace `proofHasContent()` with `validateProofQuality()` — regex parse AC sections, count PENDING vs verified
- Modify verifier agent spec: explicit instruction that `showboat exec` is mandatory, unit test output is forbidden as AC evidence
- Modify `commands/harness-run.md` Step 3d: add proof parsing between "verifier completes" and "run codeharness verify"
- Valid evidence examples: `codeharness <command>` output, `cat <file> | grep <expected>`, `showboat verify` exit code
- Invalid evidence: `npm run test:unit`, `vitest` output, test count assertions

---

### Story 12.2: Sprint Execution Ownership

**As a** developer using codeharness,
**I want** harness-run to own git commits and sprint-status updates,
**So that** git history is coherent and implementation artifacts are tracked.

**Scope:** (1) Remove `_bmad-output/` from `.gitignore` or add selective tracking for implementation artifacts, (2) harness-run commits after each story transition with structured messages, (3) subagent prompts instruct agents NOT to commit or update sprint-status.yaml, (4) fix AGENTS.md staleness to check content completeness not mtimes.

#### Acceptance Criteria

**Given** `_bmad-output/implementation-artifacts/` contains sprint-status.yaml, story files, and retros
**When** `git status` runs
**Then** these files are trackable (not ignored)

**Given** harness-run completes a story (status → `done`)
**When** it proceeds to the next story
**Then** it commits all changes with message `feat: story {key} — {short title}`
**And** the commit includes source code, tests, story file, sprint-status.yaml, and proof

**Given** a subagent (dev-story, code-review, verifier) runs
**When** it makes changes
**Then** it does NOT run `git commit` or `git add`
**And** it does NOT update sprint-status.yaml directly

**Given** AGENTS.md lists all source files in a module
**When** `codeharness verify` checks staleness
**Then** it passes regardless of file modification timestamps
**And** it only fails if a source file exists in the directory but is not mentioned in AGENTS.md

**Given** AGENTS.md is missing a reference to a newly added source file
**When** `codeharness verify` runs
**Then** it reports `[FAIL] AGENTS.md stale for module: {module} — missing: {filename}`

#### Technical Notes

- `.gitignore`: change `_bmad-output/` to `_bmad-output/planning-artifacts/research/` (or whatever should stay ignored) — keep tracking implementation artifacts
- `commands/harness-run.md`: add commit step after Step 3d (story done), Step 5 (epic done)
- Subagent prompts: add `Do NOT run git commit. Do NOT modify sprint-status.yaml.` to all Agent tool invocations
- `src/lib/doc-health.ts`: change staleness from mtime comparison to content completeness — list source files, check each is mentioned in AGENTS.md

---

### Story 12.3: Unverifiable AC Detection & Escalation

**As a** developer using codeharness,
**I want** stories with ACs that cannot be verified in the current session to be detected and escalated,
**So that** the verifier fails explicitly instead of producing fake evidence.

**Scope:** (1) classify ACs during create-story as `cli-verifiable` (can run command and check output) vs `integration-required` (needs real session, real infrastructure, or multi-system interaction), (2) verifier detects when it can't produce real evidence and fails with actionable message, (3) harness-run handles escalation — halts with instructions instead of accepting empty proofs.

#### Acceptance Criteria

**Given** a story with an AC like "sprint planning surfaces retro action items"
**When** the verifier attempts to verify it
**Then** it recognizes it cannot run sprint-planning in a subprocess
**And** it marks the AC as `[ESCALATE] Requires integration test — cannot verify in current session`
**And** the proof file shows the AC as unverified with escalation reason

**Given** the verifier produces a proof with escalated ACs
**When** harness-run Step 3d parses the proof
**Then** it halts with `[WARN] Story {key} has {N} ACs requiring integration verification`
**And** prints instructions: "Run these ACs manually or in a dedicated verification session"
**And** does NOT mark the story as `done`

**Given** create-story generates a story file
**When** ACs reference workflows, multi-step user journeys, or external system interactions
**Then** those ACs are tagged with `<!-- verification: integration-required -->` in the story file

**Given** all ACs in a story are `cli-verifiable`
**When** the verifier runs
**Then** it proceeds normally without escalation

#### Technical Notes

- Verifier agent prompt: add heuristic — if AC mentions "sprint planning", "workflow", "run /command", or "user session", it's integration-required
- Story file format: add optional `<!-- verification: cli-verifiable|integration-required -->` tag per AC
- Proof file format: add `[ESCALATE]` status alongside `PENDING` and verified
- harness-run: distinguish between PENDING (verifier failed) and ESCALATE (verifier correctly identified it can't verify) — different handling for each
