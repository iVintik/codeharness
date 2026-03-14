# Ralph Fix Plan

## Stories to Implement

### Plugin Foundation & Harness Init
> Goal: User can install codeharness with one command and initialize a complete harness in any project — stack detected, observability configured, hooks installed, BMAD set up, documentation scaffolded, enforcement configured.

- [ ] Story 1.1: Plugin Scaffold & Manifest
  > As a developer
  > I want to create the codeharness plugin directory structure and manifest
  > So that Claude Code recognizes codeharness as an installable plugin.
  > AC: Given the codeharness repository is initialized, When the plugin scaffold is created, Then `.claude-plugin/plugin.json` exists with name, version, description, And all component directories exist: `commands/`, `skills/`, `hooks/`, `agents/`, `knowledge/`, `templates/`, `ralph/`, And `claude --plugin-dir ./codeharness` loads without errors, And the plugin appears in Claude Code's plugin list
  > Spec: specs/planning-artifacts/epics.md#story-1-1
- [ ] Story 1.2: Stack Detection & Enforcement Config
  > As a developer
  > I want `/harness-init` to detect my project's technology stack and ask me what to enforce
  > So that the harness is configured correctly for my project without manual setup.
  > AC: Given a project with `package.json` exists, When the user runs `/harness-init`, Then the system detects "Node.js" as the stack, And prompts "Frontend? (y/n)", "Database? (y/n)", "APIs? (y/n)", And persists enforcement config to `.claude/codeharness.local.md` with YAML frontmatter, And output follows UX-DR4: `[INFO] Stack detected: Node.js`
  > AC: Given a project with `requirements.txt` or `pyproject.toml`, When the user runs `/harness-init`, Then the system detects "Python" as the stack
  > AC: Given no recognized stack files exist, When the user runs `/harness-init`, Then the system asks the user to specify the stack
  > Spec: specs/planning-artifacts/epics.md#story-1-2
- [ ] Story 1.3: Dependency Check & Auto-Install
  > As a developer
  > I want `/harness-init` to check for and auto-install required dependencies
  > So that I don't have to manually install Docker, Showboat, agent-browser, or OTLP packages.
  > AC: Given Docker is not installed, When `/harness-init` runs dependency checks, Then output shows `[FAIL] Docker not installed` with fix instructions and halts, And message follows UX-DR5 error pattern: What → Why → Fix → Alternative
  > AC: Given Docker is installed but Showboat is not, When `/harness-init` runs dependency checks, Then Showboat is auto-installed via `uvx showboat`, And output shows `[OK] Showboat: installed`
  > AC: Given all dependencies are present, When `/harness-init` runs dependency checks, Then each dependency shows `[OK]` status line
  > Spec: specs/planning-artifacts/epics.md#story-1-3
- [ ] Story 1.4: BMAD Installation & Harness Patches
  > As a developer
  > I want `/harness-init` to install BMAD and apply harness patches
  > So that BMAD workflows enforce verification, documentation, and testing requirements.
  > AC: Given no `_bmad/` directory exists, When `/harness-init` runs, Then BMAD is installed via `npx bmad-method init`, And harness patches are applied to story template, dev workflow, code review, and retro workflows, And output shows `[OK] BMAD: installed (v6.x), harness patches applied`, And BMAD installation completes within 60 seconds (NFR18), And patches are idempotent — running init twice produces same result (NFR19)
  > AC: Given `_bmad/` already exists (existing BMAD), When `/harness-init` runs, Then existing artifacts are preserved, And harness patches are applied without overwriting user content, And output shows `[OK] BMAD: existing installation detected, harness patches applied`
  > AC: Given bmalph is detected (existing bmalph installation), When `/harness-init` runs, Then bmalph artifacts are preserved, And codeharness takes over execution, And output shows `[OK] BMAD: migrated from bmalph, harness patches applied`
  > Spec: specs/planning-artifacts/epics.md#story-1-4
- [ ] Story 1.5: Documentation Scaffold & AGENTS.md
  > As a developer
  > I want `/harness-init` to generate AGENTS.md and the docs/ structure
  > So that the project has a proper documentation foundation from day one.
  > AC: Given `/harness-init` has detected the stack and configured enforcement, When documentation scaffolding runs, Then root `AGENTS.md` is generated with ~100 lines (NFR24) containing: build/test commands, architecture overview, conventions, security notes, pointers to `_bmad-output/planning-artifacts/`, And `docs/index.md` is created referencing BMAD artifacts by relative path (NFR25), And `docs/exec-plans/active/` and `docs/exec-plans/completed/` directories are created, And `docs/quality/` and `docs/generated/` directories are created, And generated docs have "DO NOT EDIT MANUALLY" headers (NFR27)
  > Spec: specs/planning-artifacts/epics.md#story-1-5
- [ ] Story 1.6: State File & Hook Installation
  > As a developer
  > I want `/harness-init` to create the state file and install all hooks
  > So that enforcement is active immediately after initialization.
  > AC: Given all previous init steps completed, When state file and hooks are installed, Then `.claude/codeharness.local.md` is created with canonical YAML structure (harness_version, initialized, enforcement, stack, coverage, session_flags), And `hooks.json` registers all hooks (session-start, pre-commit-gate, post-write-check, post-test-verify), And hook bash scripts are executable and POSIX-compatible, And output shows `[OK] Hooks: 4 registered`
  > Spec: specs/planning-artifacts/epics.md#story-1-6
- [ ] Story 1.7: Init Report & Idempotency
  > As a developer
  > I want `/harness-init` to produce a clear summary report and be safe to re-run
  > So that I know exactly what was configured and can re-init without fear.
  > AC: Given all init steps complete successfully, When init finishes, Then output shows complete init report following UX-DR4 format with per-component `[OK]`/`[FAIL]` lines, final summary, and `→ Run /harness-run to start autonomous execution`
  > AC: Given init was already run successfully, When user runs `/harness-init` again, Then existing config is detected and preserved, And components show `[OK] Already configured: {component}` where appropriate, And no data is lost or overwritten
  > Spec: specs/planning-artifacts/epics.md#story-1-7
- [ ] Story 1.8: Harness Teardown
  > As a developer
  > I want `/harness-teardown` to cleanly remove all harness artifacts without touching my project code
  > So that I can remove the harness if needed without risk.
  > AC: Given the harness is initialized and running, When user runs `/harness-teardown`, Then Docker stack is stopped and removed, And hooks are unregistered, And `.claude/codeharness.local.md` is removed, And project source code is NOT modified (NFR13), And `_bmad/` directory is NOT removed (BMAD artifacts preserved), And `docs/` directory is NOT removed (documentation preserved), And output shows per-component teardown status
  > Spec: specs/planning-artifacts/epics.md#story-1-8
### Observability — Give the Agent Eyes
> Goal: The agent has full runtime visibility into the developed project — logs, metrics, traces — queryable via LogQL/PromQL during development. The user knows the agent isn't guessing.

- [ ] Story 2.1: Docker Compose Generation & VictoriaMetrics Stack
  > As a developer
  > I want `/harness-init` to generate and start a VictoriaMetrics observability stack
  > So that my project has logs, metrics, and traces infrastructure running locally.
  > AC: Given Docker is running and enforcement includes observability, When `/harness-init` generates the Docker Compose, Then `docker-compose.harness.yml` is generated based on enforcement config, And services include: `victoria-logs`, `victoria-metrics`, `otel-collector` on network `codeharness-net`, And `victoria-traces` is included only if tracing enforcement is enabled, And all Docker images use pinned versions (NFR8), And stack starts within 30 seconds (NFR4), And output shows `[OK] VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)`
  > AC: Given observability enforcement is disabled (simple tool mode), When `/harness-init` runs, Then no Docker Compose is generated, no stack started, And output shows `[INFO] Observability: disabled (simple tool mode)`
  > Spec: specs/planning-artifacts/epics.md#story-2-1
- [ ] Story 2.2: OTLP Auto-Instrumentation
  > As a developer
  > I want the harness to auto-instrument my project with OpenTelemetry
  > So that my application emits logs, metrics, and traces without code changes.
  > AC: Given a Node.js project detected, When OTLP instrumentation runs, Then `@opentelemetry/auto-instrumentations-node` is installed, And the project's start script is modified to include `--require @opentelemetry/auto-instrumentations-node/register`, And OTLP environment variables are set: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, exporters for traces/metrics/logs, And instrumentation adds <5% latency overhead (NFR5)
  > AC: Given a Python project detected, When OTLP instrumentation runs, Then `opentelemetry-distro` and `opentelemetry-exporter-otlp` are installed, And `opentelemetry-bootstrap -a install` runs for auto-instrumentation, And start script wrapped with `opentelemetry-instrument`, And OTLP environment variables are set
  > Spec: specs/planning-artifacts/epics.md#story-2-2
- [ ] Story 2.3: Agent Observability Querying
  > As an agent
  > I want to query VictoriaLogs via LogQL and VictoriaMetrics via PromQL during development
  > So that I can see what my code is doing at runtime instead of guessing.
  > AC: Given the VictoriaMetrics stack is running and the application is instrumented, When the agent queries VictoriaLogs (`curl localhost:9428/select/logsql/query?query=level:error`), Then results return within 2 seconds (NFR2), And log entries include structured fields from OTLP instrumentation, When the agent queries VictoriaMetrics (`curl localhost:8428/api/v1/query?query=http_requests_total`), Then metric results return within 2 seconds, When the agent traces a request via VictoriaTraces, Then the full request flow is visible with span hierarchy
  > Spec: specs/planning-artifacts/epics.md#story-2-3
- [ ] Story 2.4: Observability Health Check
  > As a developer
  > I want the harness to verify the observability stack is running at session start
  > So that the agent never operates blind without being warned.
  > AC: Given a Claude Code session starts with codeharness installed, When the SessionStart hook fires, Then it checks VictoriaLogs, VictoriaMetrics, and OTel Collector are responding, And if all healthy: silent (no output), And if any unhealthy: `[FAIL] VictoriaMetrics stack not responding` with fix instructions (NFR14), And hook completes within 500ms (NFR1)
  > AC: Given the VictoriaMetrics stack crashes during a session, When the agent tries to query logs, Then the failure is detected and reported, not silently swallowed
  > Spec: specs/planning-artifacts/epics.md#story-2-4
### Verification & Proof
> Goal: The agent verifies features by actually using them — browser interaction, real API calls, DB state checks, log queries — and produces reproducible Showboat proof documents the user can trust. Commits blocked without verification.

- [ ] Story 3.1: Verifier Subagent & Showboat Proof Template
  > As a developer
  > I want a verification subagent that produces structured Showboat proof documents
  > So that verification runs in isolated context and produces reproducible evidence.
  > AC: Given a story has been implemented and quality gates passed, When `/harness-verify` is triggered (or automatically during loop), Then a verifier subagent spawns with isolated context, And it reads the story's acceptance criteria, And it produces a proof doc at `verification/{story-id}-proof.md` following Hybrid Direction C: summary table at top, per-AC evidence below, And proof doc has YAML frontmatter with story ID, timestamp, pass/fail counts (UX-DR12)
  > Spec: specs/planning-artifacts/epics.md#story-3-1
- [ ] Story 3.2: UI Verification via agent-browser
  > As an agent
  > I want to verify UI features by navigating, interacting, and screenshotting via agent-browser
  > So that UI verification uses real browser interaction, not test stubs.
  > AC: Given frontend enforcement is enabled and agent-browser is configured, When a UI acceptance criterion needs verification, Then the verifier navigates to the feature URL via agent-browser, And interacts using accessibility-tree refs (click, fill, wait), And captures annotated screenshots via `showboat image`, And can diff before/after states via agent-browser's snapshot diffing, And each interaction is wrapped in `showboat exec` for reproducibility
  > AC: Given agent-browser is unavailable, When UI verification is attempted, Then UI verification is skipped with `[WARN] agent-browser unavailable, UI verification skipped` (NFR15), And proof doc notes the skip
  > Spec: specs/planning-artifacts/epics.md#story-3-2
- [ ] Story 3.3: API & Database Verification
  > As an agent
  > I want to verify API endpoints with real HTTP calls and database state via DB MCP
  > So that I confirm side effects actually happened, not just that a 200 was returned.
  > AC: Given API enforcement is enabled, When an API acceptance criterion needs verification, Then the verifier makes real HTTP calls (curl) and inspects response body AND status, And captures output via `showboat exec`, And proof doc shows: command, expected result, actual result
  > AC: Given database enforcement is enabled and DB MCP is configured, When a database acceptance criterion needs verification, Then the verifier queries the database via DB MCP (read-only), And confirms expected state (rows exist, values match), And DB MCP supports PostgreSQL, MySQL, and SQLite (NFR11)
  > Spec: specs/planning-artifacts/epics.md#story-3-3
- [ ] Story 3.4: Log & Trace Verification
  > As an agent
  > I want to verify runtime behavior by querying VictoriaLogs for expected entries
  > So that I can confirm the application did what it should internally, not just externally.
  > AC: Given observability enforcement is enabled, When a runtime behavior criterion needs verification, Then the verifier queries VictoriaLogs via LogQL for expected log entries, And confirms trace IDs, event names, or error absence, And captures query and results via `showboat exec`
  > Spec: specs/planning-artifacts/epics.md#story-3-4
- [ ] Story 3.5: Showboat Verify & Re-run
  > As a developer
  > I want to re-verify proof documents via `showboat verify`
  > So that I can confirm the evidence is reproducible, not stale or fabricated.
  > AC: Given a proof doc exists at `verification/{story-id}-proof.md`, When `showboat verify` runs, Then all `showboat exec` blocks are re-executed, And outputs are compared to originals, And result is PASS (all match) or FAIL (mismatches listed), And re-run completes within 5 minutes for 10-15 steps (NFR3)
  > Spec: specs/planning-artifacts/epics.md#story-3-5
- [ ] Story 3.6: Quality Gates & Commit Blocking
  > As a developer
  > I want the harness to block commits without quality gates passing and stories without proof
  > So that nothing ships without verification.
  > AC: Given the agent attempts to commit code, When the pre-commit-gate hook fires, Then it checks: tests pass, lint pass, typecheck pass, And if any fail: `[BLOCKED] Commit blocked` with specific failures listed and fix commands, And if all pass: silent allow
  > AC: Given the agent attempts to mark a story as complete, When story completion is checked, Then it verifies a Showboat proof doc exists for the story, And `showboat verify` passes, And if no proof: `[BLOCKED] Story completion blocked — no Showboat proof` with `→ Run /harness-verify`
  > Spec: specs/planning-artifacts/epics.md#story-3-6
### Enforcement & Quality Gates
> Goal: The harness mechanically enforces that the agent queries observability, writes tests (100% coverage), maintains doc freshness, and verifies before committing. The agent can't skip steps.

- [ ] Story 4.1: Post-Write Enforcement Hooks
  > As a developer
  > I want hooks to prompt the agent to verify OTLP instrumentation and query logs after code changes
  > So that the agent maintains observability awareness throughout development.
  > AC: Given the agent writes or edits a file, When the post-write-check PostToolUse hook fires, Then it checks if the changed file should have OTLP instrumentation, And if instrumentation missing: prompts `{"message": "Verify OTLP instrumentation in new code"}`, And hook completes within 500ms (NFR1)
  > AC: Given the agent runs tests, When the post-test-verify PostToolUse hook fires, Then it prompts the agent to query VictoriaLogs for errors: `{"message": "Query VictoriaLogs for errors: curl localhost:9428/select/logsql/query?query=level:error"}`
  > Spec: specs/planning-artifacts/epics.md#story-4-1
- [ ] Story 4.2: Testing Enforcement — 100% Coverage Gate
  > As a developer
  > I want the harness to enforce 100% project-wide test coverage before story completion
  > So that no code ships without test coverage.
  > AC: Given the agent attempts to commit, When the pre-commit-gate checks test coverage, Then it runs the stack's coverage tool (c8/istanbul for Node.js, coverage.py for Python — NFR22), And if coverage < 100%: `[BLOCKED] Commit blocked — project-wide test coverage at {X}% (required: 100%)` with uncovered file list and line numbers (UX-DR6), And if coverage = 100%: silent allow
  > AC: Given the agent is implementing a story, When it writes new code, Then it must write tests for the new code after implementation, before verification, And it must also write tests for any existing uncovered code discovered in the same files
  > Spec: specs/planning-artifacts/epics.md#story-4-2
- [ ] Story 4.3: Testing Enforcement — All Tests Must Pass
  > As a developer
  > I want all project tests to pass as a per-commit quality gate
  > So that no broken code is committed.
  > AC: Given the agent attempts to commit, When the pre-commit-gate runs the test suite, Then all tests must pass, And if any fail: `[BLOCKED] Commit blocked — {N} tests failing` with specific test names (UX-DR7), And test suite completes within 5 minutes (NFR21), And hook failure messages are clear, not silent blocks (NFR16)
  > Spec: specs/planning-artifacts/epics.md#story-4-3
- [ ] Story 4.4: Coverage Delta Reporting
  > As a developer
  > I want to see how each story affected test coverage
  > So that I can track coverage trends across the sprint.
  > AC: Given a story is being verified, When coverage is measured, Then the system records coverage before and after the story, And reports the delta: `Coverage: 94% → 100% (+6% from this story)`, And the delta is stored in the state file for sprint reporting
  > Spec: specs/planning-artifacts/epics.md#story-4-4
- [ ] Story 4.5: Doc Freshness Enforcement
  > As a developer
  > I want the harness to block commits when AGENTS.md files are stale for changed modules
  > So that documentation stays current with code changes.
  > AC: Given the agent modified files in a module that has an AGENTS.md, When the pre-commit-gate checks doc freshness, Then it compares AGENTS.md modification timestamp against git log for changed source files (NFR26), And if AGENTS.md is stale: `[BLOCKED] Commit blocked — AGENTS.md stale for changed module` with file names and timestamps (UX-DR8), And if no AGENTS.md exists for a new module: `[WARN] New module created without AGENTS.md` with module path and suggested content (UX-DR9)
  > Spec: specs/planning-artifacts/epics.md#story-4-5
- [ ] Story 4.6: Verification State Tracking
  > As a developer
  > I want the harness to track what's been verified per story across the session
  > So that hooks can make informed decisions about what's required.
  > AC: Given the harness is active, When verification events occur (logs queried, tests pass, coverage met, proof created), Then session flags are updated in `.claude/codeharness.local.md`: `logs_queried`, `tests_passed`, `coverage_met`, `verification_run`, And session flags reset on each new session (SessionStart hook), And the Stop hook can read verification state to decide continue/terminate
  > Spec: specs/planning-artifacts/epics.md#story-4-6
### BMAD Ownership & Integration
> Goal: codeharness IS the BMAD distribution — installs BMAD, applies harness patches to all workflows (story, dev, code review, retro, sprint planning), maps stories to verification tasks. Every BMAD workflow enforces harness requirements for verification, documentation, and testing.

- [ ] Story 5.1: BMAD Sprint Plan Reading & Story Mapping
  > As a developer
  > I want codeharness to read BMAD sprint plans and map stories to verification tasks
  > So that every BMAD story automatically gets harness verification requirements.
  > AC: Given a BMAD sprint plan exists at `_bmad-output/planning-artifacts/`, When the system reads the sprint plan, Then it extracts all stories with their IDs, titles, and acceptance criteria, And maps each AC to a verification type (UI, API, DB, log) based on content analysis, And produces per-story verification task lists, And works with BMAD Method v6+ artifact format (NFR12)
  > Spec: specs/planning-artifacts/epics.md#story-5-1
- [ ] Story 5.2: BMAD Story Template Patch
  > As a developer
  > I want BMAD story templates patched with harness requirements
  > So that every story created through BMAD includes verification, documentation, and testing criteria.
  > AC: Given BMAD is installed with harness patches, When a new story is created using BMAD, Then the story template includes: verification requirements section, documentation requirements (which AGENTS.md to update, exec-plan to create), testing requirements (coverage target), And acceptance criteria include doc and test deliverables, And patches are idempotent (NFR19)
  > Spec: specs/planning-artifacts/epics.md#story-5-2
- [ ] Story 5.3: BMAD Dev Story Workflow Patch
  > As an agent
  > I want the BMAD dev story workflow to enforce observability, documentation, and testing during implementation
  > So that I follow the harness process automatically.
  > AC: Given the agent is executing a story via BMAD dev workflow, When the patched workflow runs, Then it enforces: update/create per-subsystem AGENTS.md for new modules, update exec-plan with progress, ensure inline code documentation, And it enforces: tests written after implementation, 100% coverage before verification, all tests pass, And it enforces: observability queries during development
  > Spec: specs/planning-artifacts/epics.md#story-5-3
- [ ] Story 5.4: BMAD Code Review Workflow Patch
  > As a developer
  > I want the BMAD code review workflow to verify documentation, tests, and proof exist
  > So that code review catches missing harness requirements.
  > AC: Given a code review is triggered via BMAD workflow, When the patched code review runs, Then it verifies: AGENTS.md freshness for changed modules, exec-plan updated, And it verifies: tests exist for all new code, coverage is 100%, no skipped/disabled tests, And it verifies: Showboat proof document exists for the story, And it verifies: test coverage report is present
  > Spec: specs/planning-artifacts/epics.md#story-5-4
- [ ] Story 5.5: BMAD Retrospective Workflow Patch
  > As a developer
  > I want the BMAD retrospective workflow to analyze verification effectiveness, documentation health, and test quality
  > So that each sprint produces actionable improvements.
  > AC: Given a sprint is complete and retro triggers, When the patched retro workflow runs, Then it analyzes: verification pass rates, iteration counts, common failure patterns, And it analyzes: doc health — stale doc count, quality grades, doc-gardener findings, documentation debt trends, And it analyzes: test effectiveness — tests that caught real bugs vs. never-failed tests, coverage trends, flaky test detection, And retro report includes all three analysis sections (UX-DR16)
  > Spec: specs/planning-artifacts/epics.md#story-5-5
- [ ] Story 5.6: Showboat Proof with BMAD Identifiers & Sprint Status
  > As a developer
  > I want Showboat proof documents to match BMAD story identifiers and sprint status to update automatically
  > So that there's a clear link between BMAD planning and harness verification.
  > AC: Given a story is verified via the harness, When the Showboat proof document is generated, Then the proof doc filename uses the BMAD story ID: `verification/{story-id}-proof.md`, And BMAD sprint status is updated to reflect the story's verification state, And the verification summary per story includes pass/fail per AC with evidence links (FR60)
  > Spec: specs/planning-artifacts/epics.md#story-5-6
- [ ] Story 5.7: BMAD Sprint Planning Patch
  > As a developer
  > I want the BMAD sprint planning workflow to verify planning docs are complete and harness infrastructure is ready
  > So that sprints don't start without proper foundation.
  > AC: Given sprint planning is initiated via BMAD, When the patched sprint planning runs, Then it verifies: planning docs complete (PRD, architecture, epics current), And it verifies: ARCHITECTURE.md is current and reflects latest decisions, And it verifies: test infrastructure ready (coverage tool configured, baseline recorded), And it verifies: harness is initialized and healthy
  > Spec: specs/planning-artifacts/epics.md#story-5-7
### Autonomous Execution
> Goal: User runs `/harness-run` and walks away. The vendored Ralph loop executes stories autonomously with verification gates per story — fresh context per iteration, crash recovery, progress tracking.

- [ ] Story 6.1: Ralph Loop Vendoring & Driver
  > As a developer
  > I want codeharness to include a vendored Ralph loop that spawns fresh Claude Code instances
  > So that autonomous execution has fresh context per iteration with crash recovery.
  > AC: Given Ralph's core loop (~500 lines bash) is vendored into `ralph/ralph.sh`, When `/harness-run` is executed, Then `ralph.sh` starts the external loop process, And each iteration spawns a fresh `claude --plugin-dir ./codeharness` instance, And the Claude Code driver at `ralph/drivers/claude-code.sh` handles instance lifecycle, And the loop supports: max iterations, timeout, crash recovery, rate limiting
  > Spec: specs/planning-artifacts/epics.md#story-6-1
- [ ] Story 6.2: BMAD→Ralph Task Bridge
  > As a developer
  > I want codeharness to bridge BMAD stories to Ralph execution tasks with verification requirements
  > So that the Ralph loop knows what to build and what to verify for each story.
  > AC: Given a BMAD sprint plan with stories exists, When `ralph/bridge.sh` converts stories to tasks, Then each task includes: story ID, title, acceptance criteria, verification requirements, Showboat proof expectations, observability setup requirements, And tasks are ordered according to story sequence in the sprint plan, And the bridge produces `ralph/progress.txt` for tracking
  > Spec: specs/planning-artifacts/epics.md#story-6-2
- [ ] Story 6.3: Verification Gates in Loop
  > As a developer
  > I want the Ralph loop to enforce verification gates per story
  > So that stories aren't marked done without Showboat proof.
  > AC: Given the Ralph loop is executing a story, When the agent signals story completion, Then the Stop hook checks: Showboat proof exists, `showboat verify` passes, tests pass, coverage 100%, And if all gates pass: story marked done, loop picks next task, And if gates fail: agent iterates (fix → re-verify), iteration count incremented, And verification state tracked across iterations (FR47)
  > Spec: specs/planning-artifacts/epics.md#story-6-3
- [ ] Story 6.4: Loop Termination & Progress
  > As a developer
  > I want the Ralph loop to terminate gracefully and report progress
  > So that I know when the sprint is done or why it stopped.
  > AC: Given the Ralph loop is running, When all stories are done, Then the loop terminates with success summary: stories completed, total iterations, verification pass rates, When max iterations reached, Then the loop terminates with progress report: completed stories, remaining stories, current story state, When the user cancels, Then the loop terminates cleanly, preserving current progress in state file, And in all cases, progress is readable via `/harness-status`
  > Spec: specs/planning-artifacts/epics.md#story-6-4
### Documentation System
> Goal: Project documentation follows the OpenAI harness pattern — per-subsystem AGENTS.md files, exec-plans tracking story lifecycle (active→completed), doc-gardener subagent keeping everything fresh with quality grades.

- [ ] Story 7.1: Per-Subsystem AGENTS.md Generation
  > As an agent
  > I want to create per-subsystem AGENTS.md files when creating new modules
  > So that future agents have local, minimal context for each part of the codebase.
  > AC: Given the agent creates a new module or subsystem directory, When the module contains source files, Then the agent creates `{module}/AGENTS.md` with: module purpose, key exports, dependencies, conventions, And the AGENTS.md does not exceed 100 lines (NFR24), And content beyond 100 lines is placed in referenced docs (progressive disclosure), And the knowledge file `knowledge/documentation-patterns.md` teaches the agent the AGENTS.md format
  > Spec: specs/planning-artifacts/epics.md#story-7-1
- [ ] Story 7.2: Exec-Plan Lifecycle
  > As a developer
  > I want exec-plan files to track each story from active to completed
  > So that there's a clear record of what was worked on and what was verified.
  > AC: Given a sprint starts with BMAD stories, When exec-plans are generated, Then one file per story is created in `docs/exec-plans/active/{story-id}.md` derived from the BMAD story definition, And each exec-plan contains: story summary, ACs, progress log section, verification status
  > AC: Given a story passes verification, When the story is marked complete, Then the exec-plan is moved from `active/` to `completed/`, And verification summary and Showboat proof link are appended (UX-DR18)
  > Spec: specs/planning-artifacts/epics.md#story-7-2
- [ ] Story 7.3: Doc-Gardener Subagent
  > As a developer
  > I want a doc-gardener subagent that scans for stale documentation
  > So that docs stay fresh without manual oversight.
  > AC: Given the doc-gardener is triggered (during retro or on-demand), When it scans the project, Then it finds: AGENTS.md files referencing deleted functions/modules, docs not updated since corresponding code changed, missing AGENTS.md for modules above complexity threshold, stale exec-plans in `active/` for completed stories, And it opens fix-up tasks for each finding, And scan completes within 60 seconds (NFR23)
  > Spec: specs/planning-artifacts/epics.md#story-7-3
- [ ] Story 7.4: Quality Score & Tech Debt Tracker
  > As a developer
  > I want the doc-gardener to produce quality grades and track documentation debt
  > So that I can see doc health at a glance and prioritize fixes.
  > AC: Given the doc-gardener has completed a scan, When it generates reports, Then `docs/quality/quality-score.md` is created/updated with per-area grades (e.g., "auth: A, routes: C, utils: F"), And `docs/exec-plans/tech-debt-tracker.md` is updated with new documentation debt items, And both files have "DO NOT EDIT MANUALLY" headers (NFR27), And reports reference BMAD planning artifacts by relative path, not copies (NFR25)
  > Spec: specs/planning-artifacts/epics.md#story-7-4
- [ ] Story 7.5: Design-Doc Validation at Epic Completion
  > As a developer
  > I want the harness to validate architectural documentation when an epic completes
  > So that architecture docs stay current as the codebase evolves.
  > AC: Given all stories in an epic are verified, When epic completion is checked, Then the system validates: ARCHITECTURE.md reflects decisions made during the epic, And any new architectural decisions are documented in the architecture doc, And if validation fails: epic cannot be marked complete until docs are updated
  > Spec: specs/planning-artifacts/epics.md#story-7-5
- [ ] Story 7.6: DB Schema Generation
  > As a developer
  > I want the harness to auto-generate a database schema document
  > So that agents always have current schema reference without manual maintenance.
  > AC: Given database enforcement is enabled and DB MCP is configured, When schema generation runs (during init or on-demand), Then `docs/generated/db-schema.md` is created from DB MCP queries, And contains table names, columns, types, relationships, And file has "DO NOT EDIT MANUALLY" header (NFR27), And schema is refreshable by re-running generation
  > Spec: specs/planning-artifacts/epics.md#story-7-6
### Sprint Lifecycle & Reporting
> Goal: Sprints have full lifecycle — mandatory retrospectives analyzing verification effectiveness, test trends, and doc health. `/harness-status` shows everything at a glance. Retro produces actionable follow-up stories.

- [ ] Story 8.1: Harness Status Command
  > As a developer
  > I want `/harness-status` to show harness health, sprint progress, and verification state at a glance
  > So that I always know where things stand without digging through files.
  > AC: Given the harness is initialized, When user runs `/harness-status`, Then output follows the `git status` model (UX-DR10): health line → enforcement config → sprint progress table → next action hint, And health line shows: stack status, Docker status, Victoria health, And enforcement line shows: `frontend:ON database:ON api:ON observability:ON`, And sprint progress shows per-story `[PASS]`/`[    ]` with story titles, And next action hint shows: current story or `→ Run /harness-run`, And status lines stay under 100 characters (UX-DR14)
  > Spec: specs/planning-artifacts/epics.md#story-8-1
- [ ] Story 8.2: Verification Log
  > As a developer
  > I want the harness to maintain a verification log across the sprint
  > So that I can see the full history of what was verified and how many iterations it took.
  > AC: Given stories are being verified during a sprint, When verification events occur, Then each event is appended to the verification log in state file: story ID, timestamp, pass/fail, iteration count, And the log persists across sessions, And `/harness-status` summarizes the log (total verified, pass rate, avg iterations)
  > Spec: specs/planning-artifacts/epics.md#story-8-2
- [ ] Story 8.3: Mandatory Retrospective Trigger
  > As a developer
  > I want the harness to automatically trigger a retrospective after sprint completion
  > So that every sprint produces improvement insights.
  > AC: Given all stories in a sprint are verified (or max iterations reached), When the sprint completes, Then a mandatory retrospective is triggered automatically, And the retro has access to: verification log, coverage data, doc-gardener output, And retro cannot be skipped — it's part of sprint completion
  > Spec: specs/planning-artifacts/epics.md#story-8-3
- [ ] Story 8.4: Retro Report Generation
  > As a developer
  > I want the retrospective to produce a structured report with verification, testing, and doc analysis
  > So that I have actionable insights for the next sprint.
  > AC: Given the retrospective is triggered with sprint data, When the retro report is generated, Then it includes: sprint summary (stories completed, iterations, duration), And verification effectiveness section (pass rates, common failure patterns, iteration counts per story), And test analysis section (coverage trends per story, flaky tests detected, tests that never failed), And doc health section (quality grades, stale doc count, doc-gardener findings) (UX-DR16), And report completes within 30 seconds (NFR20)
  > Spec: specs/planning-artifacts/epics.md#story-8-4
- [ ] Story 8.5: Test Coverage Report
  > As a developer
  > I want a per-sprint test coverage report with trends and deltas
  > So that I can see how coverage evolved across the sprint.
  > AC: Given a sprint has completed, When the coverage report is generated, Then `docs/quality/test-coverage.md` is created/updated, And it shows: baseline coverage at sprint start, final coverage, per-story deltas, And file has "DO NOT EDIT MANUALLY" header (NFR27)
  > Spec: specs/planning-artifacts/epics.md#story-8-5
- [ ] Story 8.6: Retro Follow-up Story Generation
  > As a developer
  > I want the retrospective to convert findings into actionable follow-up stories
  > So that improvements are tracked and don't get lost.
  > AC: Given the retro report identifies issues, When findings are converted to follow-up items, Then each finding becomes: a new story for code/test issues, a BMAD workflow patch for process improvements, an enforcement update for verification gaps, And user can review and approve items before they enter the next sprint backlog, And approved items are added to the BMAD sprint plan
  > Spec: specs/planning-artifacts/epics.md#story-8-6
### Brownfield Onboarding
> Goal: User can bring an existing project to full harness compliance. `/harness-onboard` scans the project, generates an onboarding epic, and executes it through the normal Ralph loop — the harness bootstraps itself.

- [ ] Story 9.1: Codebase Scan & Analysis
  > As a developer
  > I want `/harness-onboard` to scan my existing project and produce an analysis report
  > So that I understand the gap between current state and full harness compliance.
  > AC: Given the harness is initialized in an existing project, When user runs `/harness-onboard`, Then the onboarder subagent scans: project structure, modules/subsystems, dependencies, And detects: source file count per module, existing test files, existing documentation (README, ARCHITECTURE.md, inline docs), And output shows project scan results following UX-DR15 format
  > Spec: specs/planning-artifacts/epics.md#story-9-1
- [ ] Story 9.2: Coverage Gap Analysis
  > As a developer
  > I want the onboarding to analyze test coverage gaps and estimate effort
  > So that I know how much work is needed to reach 100% coverage.
  > AC: Given the onboarder has scanned the codebase, When coverage analysis runs, Then it runs the stack's coverage tool and identifies: uncovered files with line counts, partially covered files with uncovered line ranges, And estimates effort per module (lines to cover), And prioritizes by risk (core business logic first, utilities last), And output shows: `[INFO] Coverage: {X}% (target: 100%)` with per-file breakdown
  > Spec: specs/planning-artifacts/epics.md#story-9-2
- [ ] Story 9.3: Documentation Audit
  > As a developer
  > I want the onboarding to audit existing documentation quality and freshness
  > So that I know what docs need updating or creating.
  > AC: Given the onboarder has scanned the codebase, When doc audit runs, Then it assesses: README existence and freshness, ARCHITECTURE.md existence, per-module AGENTS.md existence (0/N modules), inline doc coverage (JSDoc/docstrings as % of exports), And produces a doc quality report with freshness assessment per file, And identifies: stale docs (last updated > N days before code changed), missing docs
  > Spec: specs/planning-artifacts/epics.md#story-9-3
- [ ] Story 9.4: AGENTS.md & Architecture Generation
  > As a developer
  > I want the onboarding to generate AGENTS.md files and ARCHITECTURE.md from actual code
  > So that the project has documentation infrastructure without me writing it manually.
  > AC: Given the onboarder has analyzed the codebase, When documentation generation runs, Then root `AGENTS.md` is generated from actual project structure (not template — reflects real modules, real build commands), And if no ARCHITECTURE.md exists: a draft is generated from code analysis (module dependencies, data flow, key patterns detected), And if ARCHITECTURE.md exists: freshness is validated, And `docs/` structure is scaffolded with `index.md` mapping to existing project docs
  > Spec: specs/planning-artifacts/epics.md#story-9-4
- [ ] Story 9.5: Onboarding Epic Generation
  > As a developer
  > I want the onboarding to produce an epic with stories for reaching full compliance
  > So that I have a clear, executable plan instead of a vague todo list.
  > AC: Given the onboarder has completed analysis, coverage gap, and doc audit, When the onboarding epic is generated, Then it contains: one coverage story per uncovered module (grouped by module, ordered by risk), architecture doc story (if missing/stale), per-module AGENTS.md story, doc freshness/inline docs story, And each story has acceptance criteria in Given/When/Then format, And stories are sized for single agent sessions, And the epic is written in BMAD format compatible with the Ralph bridge
  > Spec: specs/planning-artifacts/epics.md#story-9-5
- [ ] Story 9.6: Onboarding Plan Review & Approval
  > As a developer
  > I want to review and approve the onboarding plan before execution
  > So that I control what gets done and in what order.
  > AC: Given the onboarding epic has been generated, When the plan is presented to the user, Then it shows: total stories, estimated effort, module-by-module breakdown, And user can: approve as-is, reorder stories, remove stories, add stories, And only after explicit approval does the plan become executable
  > Spec: specs/planning-artifacts/epics.md#story-9-6
- [ ] Story 9.7: Onboarding Execution & Compliance Tracking
  > As a developer
  > I want the approved onboarding plan to execute through the normal Ralph loop with compliance tracking
  > So that the onboarding is verified the same way as any sprint.
  > AC: Given the user has approved the onboarding plan, When `/harness-run` executes the onboarding sprint, Then each onboarding story runs through the normal pipeline: implement → tests → coverage → verify → proof, And `/harness-status` shows onboarding compliance percentage: coverage %, docs coverage (N/M modules with AGENTS.md), ARCHITECTURE.md status, And when all stories complete: `[OK] Project fully harnessed` with 100% compliance
  > Spec: specs/planning-artifacts/epics.md#story-9-7
### Standalone Mode
> Goal: Users without BMAD can use codeharness with any task list — markdown checklist, JSON, or plain text. Verification works the same, any methodology benefits from the harness.

- [ ] Story 10.1: Standalone Task List Support
  > As a developer
  > I want to use codeharness without BMAD by providing my own task list
  > So that the harness works with any methodology, not just BMAD.
  > AC: Given no `_bmad/` directory exists and BMAD is not installed, When user provides a task list as markdown checklist, JSON task list, or plain text (one task per line), Then the system parses the task list into verification-trackable tasks, And each task can be verified via `/harness-verify`, And `/harness-status` shows task progress
  > AC: Given BMAD is not installed, When user runs `/harness-init`, Then BMAD installation is skipped (no error), And harness components (Victoria, hooks, docs/) still set up, And output shows `[INFO] BMAD: not installed (standalone mode)`
  > Spec: specs/planning-artifacts/epics.md#story-10-1
- [ ] Story 10.2: Manual Verification Trigger
  > As a developer
  > I want to trigger verification manually via `/harness-verify` for any development work
  > So that I can use the verification pipeline outside of autonomous loops.
  > AC: Given the harness is initialized (with or without BMAD), When user runs `/harness-verify`, Then the verifier subagent spawns and runs the full verification pipeline, And it asks the user what to verify (or reads from current task context), And produces a Showboat proof document, And runs `showboat verify` to confirm reproducibility, And works identically whether BMAD is installed or not
  > Spec: specs/planning-artifacts/epics.md#story-10-2

## Completed

## Notes
- Follow TDD methodology (red-green-refactor)
- One story per Ralph loop iteration
- Update this file after completing each story
