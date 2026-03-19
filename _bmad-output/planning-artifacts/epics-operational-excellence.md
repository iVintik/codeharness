---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics']
inputDocuments:
  - prd-operational-excellence.md
  - architecture-operational-excellence.md
  - research/technical-observability-coverage-static-analysis-research-2026-03-19.md
---

# codeharness Operational Excellence - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the codeharness operational excellence sprint, covering observability enforcement, comprehensive audit, and infrastructure development guidelines.

## Requirements Inventory

### Functional Requirements

FR1: Scan project source files and count log/trace/metric statements per function
FR2: Identify error handlers without log statements and flag as gaps
FR3: Classify log statements by level and report distribution
FR4: Compute observability coverage: functions with logs / total functions × 100
FR5: Configurable observability coverage target (default 80%)
FR6: During verification, query observability backend after each docker exec for log events
FR7: Flag [OBSERVABILITY GAP] in proof when user interaction produces zero logs
FR8: Runtime coverage = ACs with log events / total ACs × 100
FR9: Standalone runtime check via tests with OTLP enabled
FR10: Report static and runtime coverage as separate numbers
FR11: Enforce observability coverage target via hooks
FR12: Track observability coverage trend in state file
FR13: `codeharness audit` full compliance report
FR14: Each audit dimension produces status + metric
FR15: `audit --fix` generates stories for gaps
FR16: `onboard` becomes alias for `audit`
FR17: Audit checks Dockerfile exists and builds
FR18: Audit checks Docker stack health
FR19: Audit checks test coverage
FR20: Audit checks documentation freshness
FR21: Audit reports all results structured (human + JSON)
FR22: Dockerfile template based on project type
FR23: Formalized Dockerfile rules
FR24: Audit validates Dockerfile against rules
FR25: Dev workflow prompts Dockerfile update on new deps
FR26: Code review includes static analysis results
FR27: Verification includes runtime observability validation
FR28: Patches updated with observability enforcement

### NonFunctional Requirements

NFR1: Audit <30 seconds for 100K LOC
NFR2: Static analysis supports TS/JS and Python
NFR3: Runtime validation works with Victoria and OpenSearch
NFR4: Coverage stored in state file
NFR5: Audit output follows UX spec format
NFR6: Generated stories follow BMAD format
NFR7: Infrastructure rules in patches/infra/
NFR8: 100% test coverage on new code
NFR9: No file >300 lines

### Additional Requirements (from Architecture)

- Semgrep as default static analyzer (configurable, not hardcoded)
- Analyzer interface for tool flexibility (gap report format)
- Semgrep rules as YAML in patches/observability/
- Audit is coordinator pattern calling existing modules
- Dockerfile rules as markdown in patches/infra/
- Runtime validation integrated into verification flow
- Separate metrics, not combined

### FR Coverage Map

FR-LIVE: Epic 0 — Live progress dashboard (UX spec requirement)
FR1-5: Epic 1 — Static analysis and coverage
FR6-9: Epic 2 — Runtime validation in verification
FR10-12: Epic 2 — Coverage metrics and enforcement
FR13-21: Epic 3 — Audit command
FR22-25: Epic 4 — Infrastructure guidelines
FR26-28: Epic 5 — Workflow integration

## Epic List

### Epic 0: Live Progress Dashboard
Real-time visibility into what's happening during `codeharness run`. Rolling status showing current story, phase, progress, done/blocked counts. Without this, every subsequent epic runs blind.
**FRs covered:** UX spec (run command output), FR from overhaul PRD (FR27-31 reporting)

## Epic 0: Live Progress Dashboard

Real-time visibility into what's happening during `codeharness run`. The operator sees current story, phase, progress, and results — not silence for 30 minutes.

### Story 0.1: Sprint State Live Updates from Claude Session

As an operator, I want the Claude session to write progress to sprint-state.json as it works, So that external tools can read what's happening inside the session.

**Acceptance Criteria:**

1. **Given** harness-run.md processes a story, **When** it starts dev/review/verify on a story, **Then** it updates `sprint-state.json` with `run.currentStory`, `run.currentPhase`, and `run.lastAction`.
2. **Given** harness-run.md completes an AC during verification, **When** the AC result is known, **Then** `sprint-state.json` is updated with per-AC progress (e.g., `run.acProgress: "4/12"`).
3. **Given** a story completes or fails, **When** the status changes, **Then** `sprint-state.json` is updated immediately — not at session end.
4. **Given** `sprint-state.json` is written during a session, **When** another process reads it, **Then** it sees current progress (atomic writes, no partial state).

### Story 0.2: Ralph Progress Display

As an operator, I want ralph to show a rolling status between iterations, So that I see what completed, what's next, and overall progress without reading files.

**Acceptance Criteria:**

1. **Given** ralph polls `sprint-state.json` while Claude runs, **When** progress changes, **Then** ralph prints a structured update line: `[INFO] Story {key}: {phase} ({detail})`.
2. **Given** an iteration completes, **When** ralph processes the result, **Then** it prints: completed stories (✓), failed stories (✗), blocked stories (✕), and next story.
3. **Given** ralph is between iterations, **When** it prints progress, **Then** it shows: iteration count, elapsed time, cost, stories done/total.
4. **Given** ralph startup, **When** it prints initial status, **Then** it suppresses internal config lines (Platform driver, Plugin path, etc.) and shows only the sprint summary.

### Story 0.3: Run Command Dashboard Output

As an operator, I want `codeharness run` to show a clean dashboard during execution, So that I see structured progress instead of raw ralph logs.

**Acceptance Criteria:**

1. **Given** `codeharness run` starts, **When** output is displayed, **Then** it shows: sprint summary (done/remaining), current story, phase — not raw ralph debug/info lines.
2. **Given** ralph prints a story completion line, **When** the dashboard displays it, **Then** format is: `✓ Story {key}: DONE ({duration}, ${cost})`.
3. **Given** ralph prints a failure, **When** displayed, **Then** format is: `✗ Story {key}: FAIL at AC {n} — {one-line error}`.
4. **Given** `--quiet` flag, **When** run starts, **Then** all output is suppressed (background mode).
5. **Given** no `--quiet` flag, **When** ralph is running Claude, **Then** dashboard shows: `◆ {story_key} — {phase} (elapsed {time})` updating every 10 seconds.

---

### Epic 1: Observability Static Analysis
Scan project source for log coverage using configurable static analysis (Semgrep). Report observability coverage %. Ship default rules, let users customize.
**FRs covered:** FR1, FR2, FR3, FR4, FR5

### Epic 2: Runtime Observability & Coverage Metrics
Validate that user interactions produce telemetry during verification. Track static and runtime coverage as separate metrics. Enforce via hooks.
**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12

### Epic 3: Audit Command
Comprehensive compliance check replacing onboard. Checks all dimensions. Generates fix stories. Runs anytime.
**FRs covered:** FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21

### Epic 4: Infrastructure Guidelines & Validation
Formalized Dockerfile rules. Template as starting point. Audit validates compliance. Agent maintains during development.
**FRs covered:** FR22, FR23, FR24, FR25

### Epic 5: Workflow Integration
Static analysis in code review. Runtime validation in verification. Patches updated with observability enforcement.
**FRs covered:** FR26, FR27, FR28

## Epic 1: Observability Static Analysis

Scan project source for log coverage using configurable static analysis. Default: Semgrep with YAML rules. Users can customize rules or swap tools.

### Story 1.1: Semgrep Rules for Observability

As a developer, I want default Semgrep rules that detect missing logging in error handlers and key functions, So that observability gaps are caught by static analysis.

**Acceptance Criteria:**

1. **Given** `patches/observability/catch-without-logging.yaml` exists, **When** Semgrep runs against code with a catch block missing `console.error`/`logger.error`, **Then** it reports a warning with file, line, and description.
2. **Given** `patches/observability/function-no-debug-log.yaml` exists, **When** Semgrep runs against a function with no debug-level logging, **Then** it reports an info-level gap.
3. **Given** `patches/observability/error-path-no-log.yaml` exists, **When** Semgrep runs against an error path without logging, **Then** it reports a warning.
4. **Given** a project using `winston` instead of `console`, **When** the user edits the YAML rules to add `logger.error(...)` patterns, **Then** Semgrep detects the custom logging patterns.
5. **Given** rules are YAML files in `patches/observability/`, **When** a rule is deleted, **Then** that check is skipped — no rebuild required.

### Story 1.2: Analyzer Module & Interface

As a developer, I want an analyzer module that runs Semgrep and produces a standardized gap report, So that the tool can be swapped without changing the harness.

**Acceptance Criteria:**

1. **Given** `src/modules/observability/analyzer.ts` exists, **When** `analyze(projectDir)` is called, **Then** it returns `Result<AnalyzerResult>` with gaps, summary, and coverage %.
2. **Given** Semgrep is installed, **When** the analyzer runs, **Then** it spawns `semgrep scan --config patches/observability/ --json` and parses the output into `ObservabilityGap[]`.
3. **Given** Semgrep is NOT installed, **When** the analyzer runs, **Then** it returns a warning "static analysis skipped — install semgrep" — not a hard failure.
4. **Given** the `AnalyzerResult` interface, **When** a different tool produces the same format, **Then** it can be used as a drop-in replacement.
5. **Given** a project with 20 functions and 15 with log statements, **When** coverage is computed, **Then** static coverage = 75%.

### Story 1.3: Observability Coverage State Tracking

As an operator, I want observability coverage tracked in state over time, So that I can see if coverage is improving or degrading.

**Acceptance Criteria:**

1. **Given** static analysis completes, **When** results are saved, **Then** `sprint-state.json` stores `observability.static.coveragePercent` and `lastScanTimestamp`.
2. **Given** a configurable target (default 80%), **When** coverage is below target, **Then** audit reports it as a gap.
3. **Given** coverage was 70% yesterday and 75% today, **When** state is read, **Then** the trend is visible (both values stored with timestamps).

## Epic 2: Runtime Observability & Coverage Metrics

Validate that user interactions produce telemetry during verification. Every docker exec command should leave at least one log entry.

### Story 2.1: Verification Observability Check

As a verifier, I want to check that every docker exec command produces log events in the observability stack, So that silent code paths are detected during verification.

**Acceptance Criteria:**

1. **Given** the verify-prompt.ts template, **When** the verifier runs a `docker exec` command, **Then** it queries the observability backend for log events from the last 30 seconds.
2. **Given** a command produced zero log events, **When** the verifier writes the proof, **Then** it includes `[OBSERVABILITY GAP] No log events detected for this user interaction` in the AC section.
3. **Given** a proof with observability gaps, **When** `codeharness verify` parses it, **Then** observability gaps are counted and reported separately from functional failures.
4. **Given** 10 ACs verified and 7 produced log events, **When** runtime coverage is computed, **Then** runtime coverage = 70%.

### Story 2.2: Observability Hook Enforcement

As an operator, I want observability coverage enforced via hooks, So that commits below target are blocked.

**Acceptance Criteria:**

1. **Given** static coverage target is 80%, **When** current static coverage is 72%, **Then** pre-commit hook blocks with message showing current vs target.
2. **Given** both static and runtime coverage pass targets, **When** commit is attempted, **Then** hook allows it.
3. **Given** hook blocks, **When** the message is displayed, **Then** it includes specific files/functions missing logging and how to fix.

### Story 2.3: Standalone Runtime Check (Audit Mode)

As an operator, I want runtime observability checked outside of verification, So that `codeharness audit` can validate telemetry without full Docker verification.

**Acceptance Criteria:**

1. **Given** `codeharness audit` runs, **When** OTLP is enabled and tests run, **Then** observability backend is queried for telemetry events during test window.
2. **Given** 8 modules in the project and 5 emitted telemetry, **When** reported, **Then** runtime coverage = 62.5% with the 3 silent modules listed.
3. **Given** observability stack is not running, **When** runtime check runs, **Then** it reports "runtime validation skipped — observability stack not available" as a warning.

## Epic 3: Audit Command

Comprehensive compliance check replacing onboard. Coordinator pattern — calls existing modules plus new observability module.

### Story 3.1: Audit Coordinator & Dimensions

As an operator, I want `codeharness audit` to check all compliance dimensions in one command, So that I see full project health instantly.

**Acceptance Criteria:**

1. **Given** `codeharness audit` is run, **When** it completes, **Then** output shows status for: observability (static + runtime), testing, documentation, verification, infrastructure.
2. **Given** each dimension, **When** checked, **Then** it produces a status (pass/fail/warn) and a metric (% or grade).
3. **Given** audit completes, **When** measured, **Then** it runs in <30 seconds.
4. **Given** `--json` flag, **When** audit runs, **Then** output is structured JSON with all dimension results.
5. **Given** gaps found, **When** displayed, **Then** each gap has a specific description and suggested fix.

### Story 3.2: Audit Fix Story Generation

As an operator, I want `codeharness audit --fix` to generate stories for every gap, So that compliance issues become actionable work.

**Acceptance Criteria:**

1. **Given** audit found 3 gaps, **When** `--fix` is passed, **Then** 3 stories are generated with Given/When/Then ACs.
2. **Given** generated stories, **When** saved, **Then** they're added to sprint-state.json as backlog stories.
3. **Given** a gap about missing logging in `src/lib/docker.ts`, **When** the story is generated, **Then** the AC references the specific file and function.

### Story 3.3: Onboard Alias

As an operator, I want `codeharness onboard` to work the same as `codeharness audit`, So that existing scripts and docs don't break.

**Acceptance Criteria:**

1. **Given** `codeharness onboard` is run, **When** it executes, **Then** it produces identical output to `codeharness audit`.
2. **Given** `codeharness onboard --fix`, **When** run, **Then** it generates the same stories as `codeharness audit --fix`.
3. **Given** `codeharness onboard scan`, **When** run, **Then** it maps to the equivalent audit subcommand.

## Epic 4: Infrastructure Guidelines & Validation

Formalized Dockerfile rules. Template as starting point. Validated by audit.

### Story 4.1: Dockerfile Rules & Validation

As a developer, I want formalized rules for verification Dockerfiles validated by audit, So that "container missing binary" never happens.

**Acceptance Criteria:**

1. **Given** `patches/infra/dockerfile-rules.md` exists, **When** read, **Then** it lists required elements: pinned FROM, project binary on PATH, verification tools, no source code, non-root user, cache cleanup.
2. **Given** a Dockerfile without the project binary installed, **When** `infra.validateDockerfile()` runs, **Then** it reports a gap: "project binary not installed."
3. **Given** a Dockerfile with `FROM node:latest`, **When** validated, **Then** it reports: "unpinned base image — use specific version."
4. **Given** a Dockerfile that passes all rules, **When** validated, **Then** audit reports infrastructure status: pass.

### Story 4.2: Dockerfile Template & Dev Integration

As a developer, I want a Dockerfile template generated at init and maintained during development, So that the Dockerfile stays correct as the project evolves.

**Acceptance Criteria:**

1. **Given** `codeharness init` detects Node.js, **When** no Dockerfile exists, **Then** a template is generated with node base, npm pack + install, verification tools.
2. **Given** a story adds a new npm dependency, **When** the dev workflow runs, **Then** the patch prompts: "Update Dockerfile if new runtime dependency was added."
3. **Given** the generated Dockerfile, **When** committed to git, **Then** it's a project artifact that the developer owns and maintains.

## Epic 5: Workflow Integration

Wire observability enforcement into existing dev/review/verification workflows.

### Story 5.1: Code Review Observability Check

As a reviewer, I want static analysis results included in code review, So that missing log statements are caught before verification.

**Acceptance Criteria:**

1. **Given** `patches/review/review-enforcement.md` is updated, **When** code review runs, **Then** it includes: "Run `semgrep scan --config patches/observability/` and report gaps."
2. **Given** static analysis finds 3 missing log statements, **When** review processes results, **Then** they're listed as review issues with file, line, and description.
3. **Given** no observability gaps found, **When** review completes, **Then** observability check passes silently.

### Story 5.2: Verification Runtime Integration

As a verifier, I want observability gaps automatically detected during verification, So that proof documents include observability evidence.

**Acceptance Criteria:**

1. **Given** `patches/verify/story-verification.md` is updated, **When** verification runs, **Then** each AC section includes observability check results.
2. **Given** `verify-prompt.ts` is updated, **When** verifier runs docker exec commands, **Then** it queries observability backend after each command.
3. **Given** a proof with 2 observability gaps out of 8 ACs, **When** proof quality is assessed, **Then** runtime observability coverage (75%) is reported alongside functional results.

---

**Summary:** 5 epics, 12 stories, all 28 FRs covered, all 9 NFRs addressed.
