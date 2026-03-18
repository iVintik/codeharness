---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - product-brief-bmad-orchestrator-2026-03-14.md
  - product-brief-codeharness-arch-overhaul-2026-03-17.md
  - research/technical-bmad-orchestrator-implementation-research-2026-03-14.md
  - prd.md (original complete PRD, used as context)
  - session-retro-2026-03-17.md
documentCounts:
  briefs: 2
  research: 1
  brainstorming: 0
  projectDocs: 13
workflowType: 'prd'
classification:
  projectType: developer_tool
  domain: general
  complexity: medium-high
  projectContext: brownfield
  designPhilosophy: executable-first
openActionItems:
  infra: [A56, A61, A62, W12, W13, B26]
  sprint: [A8, A18, A20, A59]
  verify: [A9, A57]
  process: [A30, A54, A60]
  operational: [A12, A13, A58]
---

# Product Requirements Document - codeharness Architecture Overhaul

**Author:** BMad
**Date:** 2026-03-17

## Executive Summary

codeharness is an npm CLI and Claude Code plugin that makes autonomous coding agents produce software that actually works — verified by the system actually using what it built, not by trusting tests. After 5 days of building codeharness with codeharness, the core verification capabilities are proven: black-box verification catches bugs that code review misses (wrong CLI commands, message mismatches, broken install flows), observability enforcement gives the agent runtime visibility, and the two-gate model (review + verify) catches orthogonal bug classes.

The system can't run overnight. It crashes after 2-4 hours. Timeouts produce 0-byte output files. Retry logic is split across bash and markdown that disagree on counts. Docker infrastructure conflicts with itself. A 719-line init.ts does everything. 62 action items accumulate faster than they're resolved. The verification harness cannot verify itself — which is the only credible proof that it works.

This overhaul restructures codeharness around **team-role modules** — infra, dev, review, verify, sprint — each owning one responsibility completely. It adds OpenSearch as a remote observability backend and agent-browser for real browser verification. The release gate: codeharness verifies its own 65-story codebase overnight, unattended. When it passes, the product is credible. Until then, it isn't.

### What Makes This Special

- **Self-validating release gate.** v1.0 ships when codeharness verifies itself. No other harness tool holds itself to its own standard.
- **Stability is the feature.** Not new capabilities — reliable operation of proven capabilities. A 25-min verification that always completes beats a 5-min one that times out half the time.
- **Team-role architecture.** Modules organized like people on a team. Infra sets up the environment. Dev writes code. Review checks it. QA verifies it. SM manages the sprint. Each can fail without killing the others.
- **Project-agnostic.** CLIs, plugins, web apps, libraries, APIs — all get verified. The harness adapts HOW (docker exec, agent-browser, API calls) but never refuses.
- **Patches that learn.** Enforcement rules come from real failures discovered in operation, not generic checklists.
- **Morning report.** One command, 10 seconds, full overnight results. Not 5 files to read.

## Project Classification

- **Project Type:** Developer tool — npm CLI package + Claude Code plugin
- **Domain:** General software development tooling
- **Complexity:** Medium-High — orchestrates Docker, VictoriaMetrics/OpenSearch, agent-browser, OTel, autonomous loops
- **Project Context:** Brownfield — 17/65 stories done, 5/16 epics complete, significant restructuring of existing working code
- **Design Philosophy:** Executable-first — every capability is a CLI command, not markdown

## Open Action Items (from 5 days of operation)

### Infra Module (6 items)
| ID | Action |
|----|--------|
| A56 | `status --check-docker` reports wrong containers (project-level vs shared) |
| A61 | Observability enforcement missing from post-test-verify.sh hook |
| A62 | Automated stale Docker container cleanup before verification |
| W12 | Stale containers need manual cleanup |
| W13 | Architecture says observability mandatory but enforcement is missing |
| B26 | status --check-docker checks wrong container names |

### Sprint Module (4 items)
| ID | Action |
|----|--------|
| A8 | Early-exit heuristic for repeated identical failures |
| A18 | Clear/reset retry counts across sessions |
| A20 | Retro action verification in ralph pre-flight |
| A59 | Use local binary path or npm install -g in ralph pre-flight |

### Verify Module (2 items)
| ID | Action |
|----|--------|
| A9 | Parallel verification containers |
| A57 | Increase verifier timeout for large stories (7+ ACs) |

### Process (3 items)
| ID | Action |
|----|--------|
| A30 | Create debt register |
| A54 | Consolidate all action items |
| A60 | Batch releases per session |

### Operational (3 items — ralph handles on next run)
| ID | Action |
|----|--------|
| A12 | Regenerate proofs for 2-2 and 2-3 |
| A13 | Reset .story_retries for 2-1 |
| A58 | Split 2-3 verification or increase timeout |

## Success Criteria

### User Success

- **Morning clarity.** Operator understands full overnight results in <60 seconds from `codeharness status`. Not 5 files, not grep through logs. One command.
- **Error actionability.** Every failure includes: story ID, AC number, exact command that failed, actual output, and suggested fix. Time from failure to understanding: <2 minutes.
- **Overnight confidence.** System runs 8+ hours unattended without crashes, silent failures, or 0-byte outputs. Operator trusts they can sleep.
- **Project-agnostic trust.** The harness never refuses a project type. CLIs, plugins, libraries, web apps — operator never hears "this isn't supported."

### Business Success

- **v1.0 gate:** Self-validation passes — all 65 stories verified or with specific actionable blockers.
- **3-month:** Stable enough for other developers to use on their own projects overnight.
- **6-month:** Public npm release with community adoption.

### Technical Success

- **Wasted iteration rate <5%.** Down from ~50%. Nearly every ralph iteration produces useful output.
- **Cost per verified story <$10.** Currently $3-7 when working, infinite on timeout.
- **Action item ratio >1.0** (resolved vs created). Debt shrinks, not grows.
- **Module isolation.** Any module (infra, dev, review, verify, sprint) can fail without crashing the system. Verified by fault injection tests.
- **100% test coverage maintained.** Currently ~95%. Every module independently testable.

### Measurable Outcomes

| Metric | Current | Target |
|--------|---------|--------|
| Overnight completion rate | ~0% | 80%+ |
| Wasted iterations | ~50% | <5% |
| Stories self-validated | 17/65 (26%) | 65/65 (100%) |
| Hours unattended | 2-4 (then crash) | 8+ |
| Open action items | 62 (growing) | Shrinking |
| Time to understand failure | 10+ min (log spelunking) | <2 min |

## Product Scope

### MVP — Architecture Overhaul

1. **Unified state management** — Single source of truth. SM module owns all state.
2. **Error capture on timeout** — Every iteration produces a report, even failed ones.
3. **Morning report** — `codeharness status` shows full overnight results.
4. **Graceful failure per module** — No module crash kills the system.
5. **Project-agnostic verification** — Never refuses a project type.
6. **OpenSearch observability backend** — Remote OpenSearch as alternative to VictoriaMetrics.
7. **Agent-browser verification** — Real browser verification for web projects.
8. **Module restructuring** — Extract init.ts, split harness-run.md into role-based modules.
9. **All 18 open action items resolved** — Infra (6), Sprint (4), Verify (2), Process (3), Operational (3).

### Growth Features (Post-MVP)

- Parallel verification containers (A9)
- Multi-project orchestration
- Custom verification adapters (community-contributed)
- Configurable enforcement levels per project

### Vision (Future)

- Community plugin ecosystem for verification patterns
- Enterprise: team dashboards, cost tracking, multi-repo
- Marketplace of observability backend adapters
- Self-improving patches: system automatically updates enforcement rules based on failure patterns

## User Journeys

### Journey 1: The Overnight Run (Primary — Success Path)

**Alex, solo developer, 9 PM.** Has 48 stories at `verifying` status after a week of development on a web app. Trusts that codeharness has the infra, the verification pipeline, and the stability to handle this overnight.

**Evening setup:**
```
$ codeharness run
[INFO] Starting autonomous execution — 6 ready, 0 in progress, 42 verifying, 17/65 done
[INFO] Observability stack: running (shared at ~/.codeharness/stack/)
[INFO] Verification container: ready (codeharness-verify)
[INFO] Estimated: ~12 hours for 48 stories at ~15 min/story
```

Alex closes the laptop and goes to sleep.

**Morning, 7 AM:**
```
$ codeharness status
Sprint: 58/65 done (+41 overnight)
  Verified: 38 stories
  Fixed & re-verified: 3 stories (bugs found, dev loop, re-verified)
  Failed: 4 stories (specific errors below)
  Blocked: 3 stories (Docker timeout — container OOM on stress test ACs)

Failed stories:
  5-2: AC 3 — `docker exec codeharness-verify codeharness status` returned exit 1
       Output: "[FAIL] Shared stack not detected"
       Suggested fix: status command checks project-level containers, not shared stack
  ...

Cost: $187.40 | Duration: 9h12m | Iterations: 52
```

Alex reads the 4 failures, each with exact error + suggestion. Fixes take 20 minutes. Re-runs verification on just those 4. Done by 7:30 AM.

**Climax:** The morning status command. 10 seconds to understand 9 hours of work.

### Journey 2: The Debug Session (Primary — Edge Case)

**Alex, 7:15 AM.** Status shows story 5-2 failed. Needs to understand why.

```
$ codeharness status --story 5-2
Story: 5-2-verification-gates-termination-tracking
Status: failed (attempt 3/10)
Last attempt: 2026-03-18T03:42:15Z

AC 3: [FAIL]
  Command: docker exec codeharness-verify codeharness status --check-docker
  Expected: exit 0
  Actual: exit 1
  Output: "[FAIL] VictoriaMetrics stack: not running"

  Root cause: `status --check-docker` checks for project-level containers
  (codeharness-victoria-logs-1) but shared stack uses different names
  (codeharness-shared-victoria-logs-1).

Proof: verification/5-2-proof.md (partial — 5/7 ACs pass, 2 fail)
Attempts: 3 (verify failed → dev fix → verify failed → dev fix → verify failed)
```

Alex opens `src/commands/status.ts`, fixes the container name check, runs `codeharness verify --story 5-2`. Passes. Total debug time: 8 minutes.

**Climax:** The error report told him exactly what file to open and what to fix. No log spelunking.

### Journey 3: The New Project Onboard

**Sam, developer, new project.** Has a Python web app. Wants to add codeharness.

```
$ npm install -g codeharness
$ codeharness init
[INFO] Stack detected: Python (pyproject.toml)
[OK] Docker: running
[OK] Observability stack: already running (shared at ~/.codeharness/stack/)
[OK] BMAD: installed (v6.2.0), harness patches applied
[OK] OTLP: Python packages installed
[OK] State file created
[OK] agent-browser: installed

Ready. Run /harness-run to start autonomous execution.
```

No port conflicts. No interactive prompts. Shared stack detected and reused. Under 2 minutes.

### Journey 4: The Web App Verification (Agent-Browser Path)

**Sam, next day.** A story requires verifying that a login page works. The verifier uses agent-browser:

```
## AC 3: Login page renders and accepts credentials

docker exec codeharness-verify agent-browser navigate http://localhost:3000/login
docker exec codeharness-verify agent-browser screenshot login-page.png
docker exec codeharness-verify agent-browser click "[ref=email-input]"
docker exec codeharness-verify agent-browser type "test@example.com"
docker exec codeharness-verify agent-browser click "[ref=submit-btn]"
docker exec codeharness-verify agent-browser screenshot after-login.png
```

Annotated screenshots in the proof document. Before/after diff shows the redirect worked.

### Journey Requirements Summary

| Journey | Capabilities Required |
|---------|----------------------|
| Overnight Run | Stable 8h+ operation, morning report, graceful failure |
| Debug Session | Per-story error detail, exact command/output, suggested fix |
| New Project | Shared stack detection, non-interactive install, project-agnostic init |
| Web App Verify | Agent-browser integration, screenshot capture, accessibility-tree interaction |

## Innovation & Novel Patterns

### Detected Innovation Areas

1. **Self-validating developer tool.** The product's release gate is running itself against its own codebase. This creates a recursive credibility proof: if codeharness can verify 65 stories overnight on its own repo, it can do it on yours. No other harness/CI tool holds itself to this standard.

2. **Team-role architecture for agent orchestration.** Instead of pipeline orchestration (step→step→step), modules are organized like team members with independent failure domains. The QA module can timeout without killing Sprint Management. This is a structural answer to "autonomous agents are fragile."

3. **Operational learning loop.** Patches update from real failure modes discovered during autonomous operation. Session retros generate action items. Action items feed into patches. Patches change agent behavior. The harness gets better at verification as it discovers what fails — without model changes.

### Validation Approach

- **Self-validation is the test.** If the overnight run completes on codeharness's own repo, the architecture is validated. No external benchmark needed.
- **Failure isolation testable via fault injection.** Kill Docker mid-verification, corrupt state files, timeout the verifier — each module must survive independently.
- **Learning loop measurable via action item ratio.** If resolved > created, the loop works.

### Risk Mitigation

- **Self-validation creates circular dependency risk.** If a bug in codeharness prevents it from verifying itself, there's no external fallback. Mitigation: module isolation means one broken module doesn't block all verification. Manual override always available.
- **Team-role architecture adds coordination overhead.** Modules need clear interfaces. Mitigation: start with 5 modules (infra, dev, review, verify, sprint), expand only when proven.

## Developer Tool Specific Requirements

### Project-Type Overview

codeharness is a **dual-distribution developer tool**: npm CLI package (`codeharness`) + Claude Code plugin (`.claude-plugin/`). The CLI does all mechanical work (Docker, verification, state management). The plugin provides slash commands, hooks, and agent-facing skills that invoke the CLI.

This architecture was an explicit decision from PRD v1 — "executable-first, not markdown-as-implementation." The overhaul preserves this but restructures the CLI internals into modules.

### Technical Architecture Considerations

**Module Structure (Team Roles):**

```
src/
├── modules/
│   ├── infra/          # DevOps role
│   │   ├── docker.ts        # Container lifecycle, shared stack
│   │   ├── observability.ts # VictoriaMetrics, OpenSearch, OTel config
│   │   ├── stack.ts         # Shared stack at ~/.codeharness/stack/
│   │   └── cleanup.ts       # Stale container removal
│   ├── dev/            # Dev role
│   │   └── orchestrator.ts  # Story implementation via BMAD dev-story
│   ├── review/         # Reviewer role
│   │   └── orchestrator.ts  # Code review via BMAD code-review
│   ├── verify/         # QA role
│   │   ├── session.ts       # Verifier session spawn (claude --print)
│   │   ├── parser.ts        # Proof parsing, FAIL/ESCALATE detection
│   │   ├── prompt.ts        # Verification prompt template
│   │   ├── browser.ts       # Agent-browser verification
│   │   └── quality.ts       # Black-box enforcement checks
│   └── sprint/         # SM role
│       ├── state.ts         # Unified state (single source of truth)
│       ├── selector.ts      # Story selection (cross-epic, prioritized)
│       ├── reporter.ts      # Morning report, per-story errors
│       └── retry.ts         # Attempt tracking, flagging
├── commands/           # CLI entry points (thin wrappers calling modules)
│   ├── init.ts         # Calls infra/ modules
│   ├── run.ts          # Calls sprint/ orchestrator
│   ├── verify.ts       # Calls verify/ modules
│   └── status.ts       # Calls sprint/reporter
└── patches/            # Per-role enforcement (markdown, read at runtime)
    ├── infra/
    ├── dev/
    ├── review/
    ├── verify/
    └── sprint/
```

**Key Architectural Decisions:**

1. **Commands are thin.** `init.ts` becomes ~50 lines calling infra modules. `run.ts` calls sprint orchestrator. No business logic in commands.
2. **Modules own their state.** Sprint module owns `sprint-state.json` (replaces sprint-status.yaml + .story_retries + .flagged_stories + ralph/status.json). Verify module owns proof files. Infra module owns Docker state.
3. **Modules expose interfaces, not internals.** `verify/` exports `verifyStory(storyId): VerifyResult`. Sprint doesn't know how verification works, just that it returns pass/fail with details.
4. **Graceful failure is mandatory.** Every module function returns a result type, never throws uncaught. `{ success: false, error: "...", context: {...} }` — not `throw new Error`.

**Observability Backend Abstraction:**

```typescript
interface ObservabilityBackend {
  queryLogs(query: string): Promise<LogResult>;
  queryMetrics(query: string): Promise<MetricResult>;
  queryTraces(service: string): Promise<TraceResult>;
  healthCheck(): Promise<HealthResult>;
}

// Implementations:
class VictoriaBackend implements ObservabilityBackend { ... }
class OpenSearchBackend implements ObservabilityBackend { ... }
```

Verifier and hooks use the interface. Backend selection at init time based on `--opensearch-url` or default Victoria*.

**Agent-Browser Integration:**

```typescript
interface BrowserVerifier {
  navigate(url: string): Promise<void>;
  screenshot(path: string): Promise<string>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  diff(before: string, after: string): Promise<DiffResult>;
}
```

Used by verify module when story ACs reference UI elements. Runs inside Docker verification container.

### Implementation Considerations

- **Migration path:** Existing 17 done stories and their proofs remain valid. New module structure is internal — external CLI interface unchanged.
- **Ralph compatibility:** Ralph calls `codeharness run`. The internal restructuring is invisible to ralph.
- **Plugin compatibility:** Slash commands call CLI. Module restructuring doesn't change CLI interface.
- **State migration:** One-time migration from sprint-status.yaml + .story_retries to unified sprint-state.json. Backwards-compatible reader for old format.

## Scoping & Prioritization

### MVP Scope (Architecture Overhaul)

| # | Feature | Dependency | Rationale |
|---|---------|------------|-----------|
| 8 | Module restructuring | None | Enables all other features. Critical path. |
| 1 | Unified state management | #8 | Blocks overnight stability |
| 4 | Graceful failure per module | #8 | Blocks overnight stability (parallel with #1) |
| 2 | Error capture on timeout | #1 | Blocks morning report |
| 3 | Morning report | #1, #2 | Core user need — 10-second overnight understanding |
| 5 | Project-agnostic verification | #8 | Design constraint — never refuse a project type |
| 6 | OpenSearch backend | #8 | Remote observability without local Docker |
| 7 | Agent-browser verification | #8 | Real browser verification for web projects |
| 9 | Resolve 18 open action items | #8 | Debt blocking stability |

### Critical Path

```
#8 Module restructuring
  ├── #1 Unified state → #2 Error capture → #3 Morning report
  ├── #4 Graceful failure (parallel)
  └── #5, #6, #7 (independent, parallel)
```

### Incremental Migration Strategy

Restructure one module at a time. Order by proximity to clean:
1. **verify/** — already mostly isolated (verify.ts, verifier-session.ts, verify-parser.ts)
2. **sprint/** — extract from harness-run.md + ralph state files
3. **infra/** — extract from init.ts + docker.ts + stack-path.ts
4. **review/** — extract from harness-run.md
5. **dev/** — extract from harness-run.md

Each module migration is independently shippable. Tests pass after each move.

### Growth Features (Post-MVP)

- Parallel verification containers
- Multi-project orchestration
- Custom verification adapters (community)
- Configurable enforcement levels

### Vision (Future)

- Community plugin ecosystem
- Enterprise dashboards, cost tracking, multi-repo
- Self-improving patches (automated learning loop)

### Scope Risk

Module restructuring (#8) is the largest item. If it takes too long, nothing else ships. Mitigation: incremental migration — one module at a time, tests pass after each move. Can ship partial restructuring with value (e.g., just verify/ + sprint/ enables unified state + morning report).

## Functional Requirements

### Initialization & Infrastructure

- **FR1:** Operator can initialize codeharness on any project type (Node.js, Python, Go, Rust, or unrecognized) with a single command
- **FR2:** System can detect and reuse a shared observability stack across multiple projects without port conflicts
- **FR3:** Operator can configure OpenSearch as the observability backend via `--opensearch-url` flag
- **FR4:** System can install BMAD non-interactively without prompting for user input
- **FR5:** System can clean up stale Docker verification containers before starting new verification runs
- **FR6:** Operator can initialize a project without Docker when using remote observability endpoints

### Sprint Execution & State Management

- **FR7:** System can select the next actionable story across all epics based on priority tiers (proof-exists > in-progress > verifying > backlog)
- **FR8:** System maintains a single unified state file that tracks story status, attempt counts, errors, and blocked reasons
- **FR9:** System can run autonomously for 8+ hours without crashes, silent failures, or unrecoverable state
- **FR10:** System tracks attempt counts that persist across ralph sessions and harness-run sessions using the same counter
- **FR11:** System can skip retry-exhausted stories and continue to the next actionable story
- **FR12:** System captures useful output from every iteration, including failed/timed-out iterations (git diff, state delta, partial stderr)

### Verification

- **FR13:** System can spawn a black-box verifier session in an isolated Docker container with no source code access
- **FR14:** Verifier can run CLI commands via `docker exec` and capture output as proof evidence
- **FR15:** Verifier can query observability endpoints (VictoriaMetrics or OpenSearch) for runtime evidence
- **FR16:** Verifier can use agent-browser to navigate web UIs, interact with elements, and capture annotated screenshots as evidence
- **FR17:** System can detect `[FAIL]` verdicts in proof documents (outside code blocks) and reject the proof
- **FR18:** System can detect `[ESCALATE]` verdicts and count them separately from failures
- **FR19:** Verification adapts approach based on project type — never refuses verification for any project category
- **FR20:** Verifier session has `--allowedTools` configured so it doesn't hang on permission prompts

### Code Review

- **FR21:** System can orchestrate code review via BMAD code-review workflow
- **FR22:** System can detect when code review returns story to in-progress and re-trigger development
- **FR23:** Review module can fail independently without crashing sprint execution

### Development

- **FR24:** System can orchestrate story implementation via BMAD dev-story workflow
- **FR25:** System can detect when verification finds code bugs and return story to development with specific findings
- **FR26:** Dev module can fail independently without crashing sprint execution

### Reporting & Observability

- **FR27:** Operator can view complete overnight results with a single `codeharness status` command in under 10 seconds
- **FR28:** Status report shows: stories done, failed (with per-story error detail), blocked (with reason), and in-progress
- **FR29:** Each failed story includes: story ID, AC number, exact command that failed, actual output, and suggested fix
- **FR30:** Operator can drill into a specific story's status with `codeharness status --story <id>`
- **FR31:** System reports cost, duration, and iteration count for each run
- **FR32:** System can query OpenSearch for logs, metrics, and traces using OpenSearch API

### Enforcement & Patches

- **FR33:** System applies BMAD workflow patches that encode real verification requirements learned from operational failures
- **FR34:** Patches are stored as editable markdown files, not hardcoded strings — updatable without rebuilding
- **FR35:** Each module has its own patches directory with role-specific enforcement rules
- **FR36:** Patches include architectural context explaining WHY requirements exist

### Module Architecture

- **FR37:** Each module (infra, dev, review, verify, sprint) can fail gracefully without crashing other modules
- **FR38:** Each module exposes a typed interface — other modules depend on the interface, not internals
- **FR39:** Each module owns its own state — no shared mutable state between modules
- **FR40:** CLI commands are thin wrappers (<100 lines) that call module functions

## Non-Functional Requirements

### Stability (Highest Priority)

- **NFR1:** No module failure shall crash the overall system. Each module must return structured error results, never throw uncaught exceptions.
- **NFR2:** `codeharness run` shall survive 8+ hours of continuous operation without crashes, memory leaks, or unrecoverable state.
- **NFR3:** Every ralph iteration shall produce a report file, even on timeout or crash. Zero 0-byte output files.
- **NFR4:** State files shall be atomic-write (write to temp, rename) to prevent corruption on crashes.
- **NFR5:** No `set -e` in bash scripts. Error handling must be explicit.

### Performance

- **NFR6:** `codeharness init` shall complete in under 5 minutes on a project with Docker already running.
- **NFR7:** `codeharness status` shall return results in under 3 seconds (reads local state, no network calls).
- **NFR8:** Story verification shall complete within 30 minutes. Stories that exceed this are timed out with a captured partial report.
- **NFR9:** Morning report shall be human-readable in under 60 seconds.

### Reliability

- **NFR10:** State migration from old format (sprint-status.yaml + .story_retries) shall be automatic and backwards-compatible.
- **NFR11:** Shared observability stack shall survive project-level init/teardown cycles without data loss.
- **NFR12:** Docker port conflicts shall be detected before starting containers, not after failure.
- **NFR13:** Stale verification containers from prior sessions shall be cleaned up automatically before new runs.

### Testability

- **NFR14:** 100% test coverage on all new/changed code. Enforced as a quality gate.
- **NFR15:** Each module shall be independently testable with mocked dependencies.
- **NFR16:** Integration tests shall cover the full init→run→verify→status cycle.
- **NFR17:** Self-validation test: `codeharness run` against own repo shall be a CI gate for release.

### Maintainability

- **NFR18:** No source file shall exceed 300 lines. Current init.ts (719 lines) must be split.
- **NFR19:** Module interfaces shall be documented with TypeScript types — no `any`.
- **NFR20:** Patches shall be markdown files readable by both humans and agents, not embedded code strings.
- **NFR21:** All Docker images shall use pinned versions, no `:latest` tags.

### Compatibility

- **NFR22:** CLI interface (`codeharness init`, `run`, `verify`, `status`) shall not change. Internal restructuring only.
- **NFR23:** Existing proofs and verification results from the current 17 done stories shall remain valid.
- **NFR24:** Ralph loop integration shall continue to work — ralph calls `codeharness run`, internal changes are invisible.
- **NFR25:** Claude Code plugin commands and hooks shall continue to work without changes to the plugin interface.
