---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
inputDocuments:
  - prd-overhaul.md
  - architecture-overhaul.md
  - ux-design-specification.md (v2)
---

# codeharness Architecture Overhaul - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the codeharness architecture overhaul, decomposing 40 FRs, 25 NFRs, and additional architecture/UX requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Operator can initialize codeharness on any project type with a single command
FR2: System can detect and reuse a shared observability stack without port conflicts
FR3: Operator can configure OpenSearch as the observability backend via --opensearch-url
FR4: System can install BMAD non-interactively without prompting
FR5: System can clean up stale Docker verification containers before new runs
FR6: Operator can initialize a project without Docker when using remote endpoints
FR7: System can select next actionable story across all epics based on priority tiers
FR8: System maintains a single unified state file for story status, attempts, errors, blocked reasons
FR9: System can run autonomously for 8+ hours without crashes or unrecoverable state
FR10: System tracks attempt counts that persist across ralph and harness-run sessions
FR11: System can skip retry-exhausted stories and continue to next
FR12: System captures useful output from every iteration, including failed/timed-out ones
FR13: System can spawn a black-box verifier session in isolated Docker container
FR14: Verifier can run CLI commands via docker exec and capture output as proof
FR15: Verifier can query observability endpoints (VictoriaMetrics or OpenSearch) for evidence
FR16: Verifier can use agent-browser for web UI verification with screenshots
FR17: System can detect [FAIL] verdicts in proof documents outside code blocks
FR18: System can detect [ESCALATE] verdicts and count them separately
FR19: Verification adapts approach based on project type — never refuses any category
FR20: Verifier session has --allowedTools configured
FR21: System can orchestrate code review via BMAD code-review workflow
FR22: System can detect when review returns story to in-progress and re-trigger dev
FR23: Review module can fail independently without crashing sprint execution
FR24: System can orchestrate story implementation via BMAD dev-story workflow
FR25: System can detect when verification finds code bugs and return story to dev
FR26: Dev module can fail independently without crashing sprint execution
FR27: Operator can view complete results with a single codeharness status command in <10s
FR28: Status report shows done/failed/blocked/in-progress with per-story detail
FR29: Each failed story includes story ID, AC number, command, output, suggested fix
FR30: Operator can drill into specific story with codeharness status --story <id>
FR31: System reports cost, duration, and iteration count for each run
FR32: System can query OpenSearch for logs, metrics, and traces
FR33: System applies BMAD workflow patches encoding real verification requirements
FR34: Patches stored as editable markdown, not hardcoded strings
FR35: Each module has its own patches directory with role-specific enforcement
FR36: Patches include architectural context explaining WHY
FR37: Each module can fail gracefully without crashing other modules
FR38: Each module exposes a typed interface
FR39: Each module owns its own state
FR40: CLI commands are thin wrappers (<100 lines) calling module functions

### NonFunctional Requirements

NFR1: No module failure crashes the overall system — structured error results
NFR2: codeharness run survives 8+ hours without crashes or memory leaks
NFR3: Every ralph iteration produces a report, even on timeout — zero 0-byte outputs
NFR4: State files use atomic write (temp + rename)
NFR5: No set -e in bash scripts
NFR6: codeharness init completes in <5 minutes
NFR7: codeharness status returns in <3 seconds
NFR8: Story verification completes within 30 minutes
NFR9: Status report human-readable in <60 seconds
NFR10: State migration from old format is automatic and backwards-compatible
NFR11: Shared stack survives project-level init/teardown without data loss
NFR12: Docker port conflicts detected before starting containers
NFR13: Stale verification containers cleaned up automatically
NFR14: 100% test coverage on new/changed code
NFR15: Each module independently testable with mocked dependencies
NFR16: Integration tests cover full init→run→verify→status cycle
NFR17: Self-validation: codeharness run against own repo as CI gate
NFR18: No source file exceeds 300 lines
NFR19: Module interfaces documented with TypeScript types — no any
NFR20: Patches are markdown files readable by humans and agents
NFR21: All Docker images use pinned versions
NFR22: CLI interface unchanged
NFR23: Existing proofs remain valid
NFR24: Ralph integration continues to work
NFR25: Plugin commands and hooks unchanged

### Additional Requirements

- Result<T> type pattern for all module functions (Architecture Decision 1)
- Unified sprint-state.json replacing 5 scattered files (Architecture Decision 2)
- Module interface contracts with typed exports (Architecture Decision 3)
- ObservabilityBackend interface with Victoria/OpenSearch implementations (Architecture Decision 4)
- Status file protocol — ralph writes via jq, status reads directly (Architecture Decision 5)
- Phased migration — verify first, then sprint, infra, review, dev (Architecture Decision 6)
- codeharness status one-screen format (UX)
- codeharness status --story drill-down (UX)
- codeharness run --live rolling status (UX)
- Error capture on timeout with partial proof + git diff (UX)
- Agent-browser screenshot evidence in proofs (UX)
- OpenSearch query evidence in proofs (UX)

### FR Coverage Map

FR1: Epic 6 — Init any project type
FR2: Epic 6 — Shared stack detection
FR3: Epic 7 — OpenSearch backend
FR4: Epic 6 — BMAD non-interactive
FR5: Epic 6 — Stale container cleanup
FR6: Epic 6 — Init without Docker
FR7: Epic 2 — Cross-epic story selection
FR8: Epic 2 — Unified state file
FR9: Epic 3 — 8+ hour autonomous operation
FR10: Epic 2 — Persistent attempt counts
FR11: Epic 2 — Skip retry-exhausted stories
FR12: Epic 3 — Error capture on timeout
FR13: Epic 4 — Black-box verifier session
FR14: Epic 4 — Docker exec proof evidence
FR15: Epic 7 — Observability query (Victoria/OpenSearch)
FR16: Epic 8 — Agent-browser verification
FR17: Epic 4 — FAIL verdict detection
FR18: Epic 4 — ESCALATE verdict detection
FR19: Epic 4 — Project-agnostic verification
FR20: Epic 4 — Verifier --allowedTools
FR21: Epic 5 — Code review orchestration
FR22: Epic 5 — Review→dev re-trigger
FR23: Epic 5 — Review module failure independence
FR24: Epic 3 — Dev story orchestration
FR25: Epic 3 — Verify→dev feedback loop
FR26: Epic 3 — Dev module failure independence
FR27: Epic 2 — Status command <10s
FR28: Epic 2 — Status done/failed/blocked/in-progress
FR29: Epic 2 — Failed story detail (AC, command, output, fix)
FR30: Epic 2 — Status --story drill-down
FR31: Epic 2 — Cost/duration/iteration reporting
FR32: Epic 7 — OpenSearch log/metric/trace queries
FR33: Epic 9 — BMAD patches from operational failures
FR34: Epic 9 — Markdown patches, not hardcoded
FR35: Epic 9 — Per-module patches directory
FR36: Epic 9 — Patches include WHY context
FR37: Epic 1 — Module graceful failure
FR38: Epic 1 — Typed module interfaces
FR39: Epic 1 — Module-owned state
FR40: Epic 1 — Thin CLI commands

## Epic List

### Epic 1: Foundation — Result Types & Module Skeleton
Codebase has clean module boundaries with Result<T> pattern. Every function returns predictable success/failure. Module skeleton exists with typed interfaces and index.ts re-exports.
**FRs covered:** FR37, FR38, FR39, FR40

### Epic 2: Unified State & Status Command
Operator runs `codeharness status` and sees full sprint state in one screen. Single source of truth for all story data. Story drill-down with AC-level detail.
**FRs covered:** FR7, FR8, FR10, FR11, FR27, FR28, FR29, FR30, FR31

### Epic 3: Stable Sprint Execution
System runs 8+ hours unattended. Every iteration produces output. Failures captured with context. Timeouts save partial work. Dev and verify modules fail gracefully.
**FRs covered:** FR9, FR12, FR24, FR25, FR26

### Epic 4: Verification Module
Black-box verification is reliable. No permission hangs, no 0-byte outputs. Proper FAIL/ESCALATE detection. Project-agnostic — never refuses any project type.
**FRs covered:** FR13, FR14, FR17, FR18, FR19, FR20

### Epic 5: Code Review Module
Code review orchestration isolated in its own module. Review failures don't crash sprint. Review→dev loop works reliably.
**FRs covered:** FR21, FR22, FR23

### Epic 6: Infrastructure Module
`codeharness init` is clean (<50 line command). Shared stack managed properly. Stale containers cleaned up. Port conflicts detected before failure. BMAD non-interactive.
**FRs covered:** FR1, FR2, FR4, FR5, FR6

### Epic 7: OpenSearch Backend
Operator can use OpenSearch for observability. ObservabilityBackend interface with Victoria and OpenSearch implementations. No Docker needed for remote observability.
**FRs covered:** FR3, FR15, FR32

### Epic 8: Agent-Browser Verification
Web projects get real browser verification. Navigate pages, interact with elements, capture annotated screenshots as proof evidence.
**FRs covered:** FR16

### Epic 9: Enforcement & Patches
BMAD workflow patches encode real operational learnings per module role. Patches stored as markdown, loaded at runtime, include architectural context.
**FRs covered:** FR33, FR34, FR35, FR36

### Epic 10: Self-Validation & Adaptation
Comprehensive validation AC suite covering all harness functionality. The harness validates itself, fixes what fails using its own dev→review→verify cycle, and produces a clean validation report. When this passes, v1.0 ships.
**FRs covered:** Meta — validates all 40 FRs + NFRs + UX + regression ACs from 62 action items

## Epic 1: Foundation — Result Types & Module Skeleton

Establish the module architecture pattern: Result<T> type, module skeleton with index.ts re-exports, shared types, thin command wrappers.

### Story 1.1: Result Type & Shared Types

As a developer, I want a consistent Result<T> type used by all module functions, So that error handling is predictable and no module crash kills the system.

**Acceptance Criteria:**

1. **Given** `src/types/result.ts` exists, **When** imported, **Then** it exports `Result<T>`, `ok(data)`, and `fail(error, context?)`.
2. **Given** `ok(data)` is called, **When** checked, **Then** `result.success === true` and `result.data` contains the value.
3. **Given** `fail(error)` is called, **When** checked, **Then** `result.success === false` and `result.error` contains the message.
4. **Given** `src/types/state.ts` exists, **When** imported, **Then** it exports `SprintState` interface matching architecture decision.
5. **Given** `src/types/observability.ts` exists, **When** imported, **Then** it exports `ObservabilityBackend` interface with `queryLogs`, `queryMetrics`, `queryTraces`, `healthCheck`.
6. **Given** `src/types/index.ts` exists, **When** imported, **Then** it re-exports all shared types.

### Story 1.2: Module Skeleton & Index Pattern

As a developer, I want module directories with index.ts re-exports for all 5 modules, So that module boundaries are enforced and imports follow the index-only pattern.

**Acceptance Criteria:**

1. **Given** `src/modules/{infra,sprint,verify,dev,review}/index.ts` exist, **When** imported, **Then** each exports typed function stubs returning `Result<T>`.
2. **Given** all stubs, **When** called, **Then** each returns `fail('not implemented')`.
3. **Given** CLI commands, **When** reviewed, **Then** no command file exceeds 100 lines.
4. **Given** module imports, **When** reviewed, **Then** no module imports from another module's internal files.

### Story 1.3: Migrate Existing Tests to Module Structure

As a developer, I want existing tests reorganized into module `__tests__/` directories, So that each module is independently testable.

**Acceptance Criteria:**

1. **Given** existing tests in `src/lib/__tests__/`, **When** migrated, **Then** verify-related tests move to `src/modules/verify/__tests__/`.
2. **Given** the migration, **When** all tests run, **Then** all pass with no regressions.
3. **Given** the migration, **When** coverage measured, **Then** overall coverage does not decrease.

## Epic 2: Unified State & Status Command

Single source of truth for sprint state. `codeharness status` shows everything in one screen.

### Story 2.1: Sprint State Module — Unified State File

As an operator, I want a single `sprint-state.json` replacing all scattered state files, So that all story state is in one place.

**Acceptance Criteria:**

1. **Given** `src/modules/sprint/state.ts` exists, **When** `getSprintState()` called, **Then** returns `Result<SprintState>`.
2. **Given** old format files exist, **When** first access, **Then** auto-migrates to sprint-state.json.
3. **Given** `updateStoryStatus()` called, **When** writing, **Then** uses atomic write (temp + rename).
4. **Given** sprint-state.json, **When** read, **Then** parse time <100ms.

### Story 2.2: Story Selection — Cross-Epic Prioritization

As a system, I want story selection that prioritizes by readiness across all epics, So that actionable stories are processed first.

**Acceptance Criteria:**

1. **Given** `getNextStory()` called, **Then** returns stories in priority: proof-exists > in-progress > verifying > backlog.
2. **Given** story with attempts >= 10, **When** selected, **Then** skipped with reason "retry-exhausted".
3. **Given** no actionable stories, **When** called, **Then** returns `ok(null)`.

### Story 2.3: Status Report — One Screen Overview

As an operator, I want `codeharness status` to show full state in one screen, So that I understand what happened in 10 seconds.

**Acceptance Criteria:**

1. **Given** active run, **When** `codeharness status` called, **Then** shows: current story, phase, AC progress, iteration, cost, elapsed.
2. **Given** completed run, **When** called, **Then** shows: completed, failed (with error), blocked, skipped.
3. **Given** failed story in summary, **Then** shows: story key, AC number, one-line error.
4. **Given** status called, **When** measured, **Then** returns in <3 seconds.
5. **Given** action items in state, **When** called, **Then** shows with NEW/CARRIED labels.

### Story 2.4: Status Story Drill-Down

As an operator, I want `codeharness status --story <id>` for AC-level detail, So that I can see exactly what failed.

**Acceptance Criteria:**

1. **Given** story with failures, **When** drill-down called, **Then** shows each AC with PASS/FAIL/ESCALATE.
2. **Given** FAIL verdict, **Then** shows: command, expected, actual, reason, suggested fix.
3. **Given** attempt history, **Then** shows each attempt's outcome.
4. **Given** proof exists, **Then** shows proof path and AC counts.

## Epic 3: Stable Sprint Execution

System runs 8+ hours unattended. Every iteration produces output.

### Story 3.1: Error Capture on Timeout

As an operator, I want every iteration to produce a report even on timeout, So that work is never silently lost.

**Acceptance Criteria:**

1. **Given** timeout (exit 124), **When** detected, **Then** captures: git diff, state delta, partial stderr.
2. **Given** captured data, **When** saved, **Then** written to iteration timeout report with story key and duration.
3. **Given** any iteration, **When** completes, **Then** report file exists with non-zero content.

### Story 3.2: Graceful Dev Module

As a system, I want dev module to return Result<T> and never crash the sprint, So that one story's failure doesn't halt the run.

**Acceptance Criteria:**

1. **Given** `developStory(key)` called, **Then** invokes BMAD dev-story and returns `Result<DevResult>`.
2. **Given** dev workflow fails, **Then** returns `fail(error)` — never throws.
3. **Given** dev workflow times out, **Then** preserves partial work and returns error.

### Story 3.3: Verify→Dev Feedback Loop

As a system, I want verification failures to return stories to dev with findings, So that the dev module can fix exact issues.

**Acceptance Criteria:**

1. **Given** failing ACs found, **When** processed, **Then** story status → `in-progress` with failing AC details.
2. **Given** story returned to dev, **When** dev runs, **Then** prompt includes failing ACs and output.
3. **Given** N >= 10 cycles, **When** reached, **Then** story marked `blocked`.
4. **Given** attempt count, **Then** persists in sprint-state.json across sessions.

### Story 3.4: 8-Hour Stability Test

As an operator, I want verified 8-hour unattended operation, So that I can trust overnight runs.

**Acceptance Criteria:**

1. **Given** 8-hour run against test fixture, **Then** no crashes, no memory leaks, no unrecoverable state.
2. **Given** mixed success/failure/timeout iterations, **Then** sprint-state.json consistent and status accurate.
3. **Given** Docker killed mid-verification, **Then** logged and next story attempted.

## Epic 4: Verification Module

Extract and stabilize black-box verification.

### Story 4.1: Verify Module Extraction

As a developer, I want verify code extracted into `src/modules/verify/`, So that verification is self-contained.

**Acceptance Criteria:**

1. **Given** migration to `src/modules/verify/`, **Then** all existing tests pass.
2. **Given** `verifyStory(key)` called, **Then** returns `Result<VerifyResult>` with AC-level results.
3. **Given** `parseProof(path)` called, **Then** returns `Result<ProofQuality>` with FAIL/ESCALATE detection.
4. **Given** module boundary, **Then** imports only from `verify/index.ts`.

### Story 4.2: Project-Agnostic Verification

As a developer, I want verification to never refuse a project type, So that all projects get verified.

**Acceptance Criteria:**

1. **Given** CLI project, **Then** uses docker exec + stdout capture.
2. **Given** Claude plugin, **Then** uses `docker exec ... claude --print`.
3. **Given** any project, **Then** no AC tagged `integration-required` unless genuinely needs external systems.

### Story 4.3: Verifier Session Reliability

As a system, I want verifier sessions to never hang or produce 0 bytes, So that every attempt produces output.

**Acceptance Criteria:**

1. **Given** verifier spawns `claude --print`, **Then** includes `--allowedTools`.
2. **Given** nested claude inside Docker, **Then** also includes `--allowedTools`.
3. **Given** verifier times out, **Then** partial proof saved and error returned.
4. **Given** stale containers, **Then** cleaned up before new verification.

## Epic 5: Code Review Module

### Story 5.1: Review Module Extraction

As a developer, I want code review extracted into `src/modules/review/`, So that review is isolated.

**Acceptance Criteria:**

1. **Given** `reviewStory(key)` called, **Then** returns `Result<ReviewResult>`.
2. **Given** review fails, **Then** returns Result with error — never throws.
3. **Given** review returns to in-progress, **Then** triggers dev with findings.
4. **Given** module boundary, **Then** imports only from `review/index.ts`.

## Epic 6: Infrastructure Module

### Story 6.1: Infra Module — Init Extraction

As a developer, I want init.ts split into infra module components, So that no file exceeds 300 lines.

**Acceptance Criteria:**

1. **Given** extraction, **Then** `src/commands/init.ts` is <100 lines.
2. **Given** `infra.initProject(opts)` called, **Then** handles: stack detection, deps, Docker, BMAD, state, docs.
3. **Given** no file in `src/modules/infra/` exceeds 300 lines.
4. **Given** existing init tests, **Then** all pass after migration.

### Story 6.2: Shared Stack Management

As an operator, I want shared stack properly managed, So that init works cleanly across projects.

**Acceptance Criteria:**

1. **Given** shared stack running, **When** init runs, **Then** detects and reuses.
2. **Given** port conflict, **When** detected, **Then** reports before starting containers.
3. **Given** stale containers, **When** cleanup runs, **Then** removed.
4. **Given** `status --check-docker`, **Then** reports correct shared container names.

### Story 6.3: Non-Interactive BMAD Install

As an operator, I want BMAD to install without prompts, So that init works headless.

**Acceptance Criteria:**

1. **Given** BMAD not installed, **When** init runs, **Then** `npx bmad-method install --yes --tools claude-code`.
2. **Given** BMAD installed, **When** init runs, **Then** skips install, applies patches.
3. **Given** install fails, **Then** meaningful error with command and output.

## Epic 7: OpenSearch Backend

### Story 7.1: ObservabilityBackend Interface & Victoria Implementation

As a developer, I want the backend interface with Victoria as default, So that existing behavior is preserved.

**Acceptance Criteria:**

1. **Given** no OpenSearch config, **When** `getObservabilityBackend()` called, **Then** returns `VictoriaBackend`.
2. **Given** Victoria backend, **When** query methods called, **Then** query existing Victoria endpoints.
3. **Given** Victoria backend, **When** `healthCheck()` called, **Then** checks all services running.

### Story 7.2: OpenSearch Implementation

As an operator, I want `--opensearch-url` to configure OpenSearch backend, So that I can use remote observability.

**Acceptance Criteria:**

1. **Given** `--opensearch-url` passed, **When** init completes, **Then** state records `opensearch` backend.
2. **Given** OpenSearch backend, **When** `queryLogs()` called, **Then** queries OpenSearch `_search` API.
3. **Given** OpenSearch backend, **When** `healthCheck()` called, **Then** checks cluster health.
4. **Given** OpenSearch configured, **When** verifier runs, **Then** proof shows OpenSearch queries.
5. **Given** OpenSearch configured, **When** init runs, **Then** no local Docker stack started.

## Epic 8: Agent-Browser Verification

### Story 8.1: Agent-Browser Integration

As a web developer, I want verification to use agent-browser for UI testing, So that web features are verified with real browser interaction.

**Acceptance Criteria:**

1. **Given** `verify/browser.ts` exists, **When** AC references UI elements, **Then** uses agent-browser via docker exec.
2. **Given** screenshots captured, **Then** saved to `verification/screenshots/` and referenced in proof.
3. **Given** before/after screenshots, **Then** visual diff evidence available.
4. **Given** Dockerfile.verify updated, **Then** agent-browser installed in container.

## Epic 9: Enforcement & Patches

### Story 9.1: Per-Module Patches Directory

As a developer, I want patches organized by module role, So that enforcement rules connect to responsibilities.

**Acceptance Criteria:**

1. **Given** `patches/{dev,review,verify,sprint,retro}/` exist, **Then** patch templates load from role directory.
2. **Given** patches are markdown, **Then** no rebuild required to update.
3. **Given** each patch, **Then** includes WHY section with architectural reasoning.
4. **Given** patch application, **Then** reads from `patches/{role}/` not hardcoded strings.

## Epic 10: Self-Validation & Adaptation

### Story 10.1: Validation AC Suite

As a release manager, I want comprehensive validation ACs covering all harness functionality, So that self-validation tests every capability.

**Acceptance Criteria:**

1. **Given** suite generated, **Then** includes one AC per FR (40 ACs).
2. **Given** suite generated, **Then** includes key NFR ACs (8h stability, status <3s, atomic writes, <300 line files).
3. **Given** suite generated, **Then** includes UX ACs (status format, error detail, live mode).
4. **Given** existing 32 verifying stories, **Then** their ACs imported as regression tests.
5. **Given** 62 action items, **Then** resolved items become regression ACs.

### Story 10.2: Validation Infrastructure

As a release manager, I want the harness to fix what validation finds, So that it adapts using its own pipeline.

**Acceptance Criteria:**

1. **Given** validation sprint created, **Then** contains all validation ACs as stories.
2. **Given** validation AC fails, **Then** harness creates fix story → dev → review → verify.
3. **Given** fix applied, **Then** only failing AC re-validated (not entire suite).
4. **Given** AC fails after 10 attempts, **Then** marked as specific blocker.

### Story 10.3: Self-Validation Run

As a release manager, I want `codeharness validate` to produce a clean report, So that v1.0 release gate is met.

**Acceptance Criteria:**

1. **Given** `codeharness validate` run, **Then** report shows: total ACs, passed, failed, blocked, adaptation cycles.
2. **Given** all pass, **Then** outputs "RELEASE GATE: PASS — v1.0 ready".
3. **Given** some fail, **Then** each failure has: AC description, command, output, attempts, blocker.
4. **Given** validation run, **Then** `codeharness status` shows progress in real time.
5. **Given** CI mode, **Then** `codeharness validate --ci` returns exit 0 on pass, 1 on fail.
