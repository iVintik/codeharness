---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - product-brief-bmad-orchestrator-2026-03-14.md
  - research/technical-bmad-orchestrator-implementation-research-2026-03-14.md
  - docs/exec-plans/tech-debt-tracker.md
  - session-retro-2026-03-17.md
date: 2026-03-17
author: BMad
---

# Product Brief: codeharness — Architecture Overhaul

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

codeharness is a Claude Code plugin that applies Harness Engineering to autonomous development. The original vision (Mar 14) is proven — black-box verification works, observability enforcement works, the two-gate model (review + verify) catches orthogonal bug classes.

But after 5 days of building codeharness with codeharness, the product can't verify itself. 17/65 stories done. 62 unresolved action items. Timeouts that burn 30 min and produce nothing. Retry logic split across bash and markdown that doesn't agree on counts. Docker infra that conflicts with itself. A 719-line init.ts that does everything. Patches that are disconnected checklists nobody follows.

The architecture overhaul restructures codeharness around **team roles** — clear modules with single responsibilities, clean boundaries, and the stability required for overnight unattended operation. The release gate: codeharness validates its own codebase end to end.

---

## Core Vision

### Problem Statement

The harness works in pieces but fails as a system. Individual capabilities are proven (black-box verification, observability stack, proof parsing, sprint execution). But the system is too fragile for unattended operation:

1. **Instability kills throughput.** A 30-min timeout produces 0 bytes of output, wastes $5, and teaches the system nothing. On a slow process, every wasted iteration costs 30 min. Three timeouts = 90 min of zero progress. Stability is the multiplier on everything else.

2. **No clear ownership.** init.ts does stack detection, dependency management, Docker setup, BMAD installation, documentation scaffolding, state management, and OTLP configuration. harness-run.md is a 500-line markdown file that does sprint management, story selection, dev orchestration, code review, verification, retry tracking, and retrospectives. When something breaks, there's no obvious place to fix it.

3. **Split brain state management.** Ralph tracks retries in `.story_retries` (bash, space-delimited). Harness-run tracks attempts in memory (markdown instruction). The verify parser tracks proof quality in code. Sprint status lives in YAML. These systems don't agree, don't communicate, and produce contradictory state.

4. **Patches are disconnected from reality.** BMAD workflow patches are generic checklists written before the verification pipeline existed. They don't reference the actual proof format, the actual verdict markers, or the actual failure modes discovered in 5 days of operation. The agent ignores them because they contain no actionable specifics.

5. **Infrastructure fights itself.** Shared stack at `~/.codeharness/stack/` vs per-project compose files. The harness-init skill generates local compose files that conflict with the shared stack ports. `codeharness status --check-docker` checks the wrong containers. Stale verification containers from prior sessions block new ones.

### Problem Impact

- **Can't run overnight.** The system crashes, times out, or enters infinite retry loops within 2-4 hours.
- **Action item debt.** 62 items after 5 days, growing faster than resolved. The retro finds problems, but the system can't fix them autonomously.
- **Self-validation failure.** A verification harness that can't verify itself has zero credibility. This is the blocking issue for any public release.

### Why the Current Architecture Falls Short

The codebase grew organically from epics, each adding capability without restructuring what came before:
- Epic 0: Sprint execution skill (harness-run.md — grew to 500 lines)
- Epic 1: CLI scaffolding (init.ts — grew to 719 lines)
- Epic 2: Observability (Docker, OTLP — bolted onto init.ts)
- Epic 13: Black-box verification (verifier-session.ts, verify-prompt.ts — correct but isolated)
- Epic 15: Pipeline fixes (retry unification, non-sequential selection — patched onto harness-run.md)

Each epic solved its problem but left the system more tangled. No epic restructured the whole.

### Proposed Solution

Restructure codeharness around **team roles** — each module owns one responsibility completely:

| Role | Module | Owns | Current State |
|------|--------|------|---------------|
| **DevOps** | `infra/` | Docker, observability stack, container lifecycle, port management | Scattered across docker.ts, init.ts, stack-path.ts |
| **Dev** | `dev/` | Story implementation orchestration, code generation | Part of harness-run.md |
| **Reviewer** | `review/` | Code review orchestration, quality gates | Part of harness-run.md |
| **QA** | `verify/` | Black-box verification, proof generation, proof parsing, verdict detection | verify.ts, verifier-session.ts, verify-parser.ts (closest to clean) |
| **SM** | `sprint/` | Story selection, state management, retry tracking, progress reporting | Split across harness-run.md and ralph.sh |
| **Patches** | `patches/{role}/` | Per-role enforcement, connected to actual failure modes | Currently generic checklists in patches/ |

Each module:
- Has its own state that it owns completely
- Exposes a clean interface to other modules
- Has its own patches directory with enforcement rules learned from operation
- Can be tested independently
- Can fail without crashing the whole system

### Key Differentiators

- **Self-validating.** The release gate is: codeharness verifies its own codebase overnight. No other harness tool holds itself to this standard.
- **Stability over speed.** A 25-min verification that always completes beats a 5-min one that times out half the time. Every module must handle failure gracefully — no `set -e`, no silent crashes, no 0-byte outputs.
- **Team-role architecture.** Not a monolith, not microservices — modules organized by responsibility, like people on a team. Clear ownership means clear accountability when something breaks.
- **Patches that learn.** Enforcement rules come from real operational failures, not generic best practices. When verification discovers a new failure mode, the relevant role's patch is updated.

## Target Users

### Primary User: The Autonomous Development Operator

**Profile:** Technical lead or solo developer who runs codeharness overnight on their codebase. They set it running, go to sleep, and check results in the morning. They are NOT watching the terminal — the system must be self-sufficient.

**Two operating modes:**

**Mode 1: Morning Check**
- Opens terminal, runs `codeharness status` or reads a report file
- Needs to see in 10 seconds: what completed, what failed, what's blocked
- Completed stories with proof links. Failed stories with specific error (not "timeout"). Blocked stories with why.
- Does NOT want: 62 action items, scattered retro files, ralph logs to grep through
- Success: "12 stories verified overnight, 3 returned to dev with bug reports, 2 blocked on Docker timeout — here's exactly what happened"

**Mode 2: Debug**
- A story failed or the system stalled. Needs to understand why and fix it.
- Needs: the exact error, the exact command that failed, the context (which AC, which story, what was attempted)
- Does NOT want: 0-byte output files, "exit code 124" with no explanation, retry counters that don't match between systems
- Success: "Story 2-3 verification failed at AC 4: `docker exec codeharness-verify codeharness status --check-docker` returned exit 1 — the status command checks project-level containers but the shared stack uses different names. See proof at verification/2-3-proof.md#ac-4"

### What They Don't Get Today

| Need | Current State | Required State |
|------|--------------|----------------|
| Single status view | Sprint-status.yaml + ralph/status.json + .story_retries + .flagged_stories + session-retro-*.md | One command, one report |
| Error context | "exit code 124, 0 bytes" | Exact failure with story, AC, command, and output |
| Overnight stability | Crashes after 2-4 hours (set -e, permission hangs, port conflicts) | Runs 8+ hours unattended |
| Progress tracking | Must diff sprint-status.yaml before/after | Clear "N done, M failed, K blocked" summary |
| Actionable failures | 62 action items in retro files | Per-story error with suggested fix |

### User Journey

1. **Evening:** `codeharness run` — starts overnight execution
2. **Morning:** `codeharness status` — sees clean report of what happened
3. **If issues:** Reads per-story error reports, fixes the specific problem, re-runs
4. **If clean:** Reviews completed proofs, merges, moves on

## Success Metrics

### The Gate Metric

**Self-validation:** codeharness runs `codeharness run` against its own repository overnight. All 65 stories reach `done` with valid proofs, or have specific actionable blockers explaining why. This is the v1.0 release gate. No exceptions.

### Operational Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Overnight completion rate | ~0% | 80%+ | % of `codeharness run` sessions completing a full sprint pass without human intervention |
| Wasted iteration rate | ~50% | <5% | % of ralph iterations producing 0 useful output (timeouts, crashes, hangs) |
| Morning clarity | No | Yes | Can operator understand overnight results in <60s from `codeharness status` |
| Error actionability | "exit code 124" | Story + AC + command + output + fix | Every failure includes full context |
| Stories self-validated | 17/65 (26%) | 65/65 (100%) | All stories done or with specific blockers |

### Business Objectives

- **v1.0 release:** Self-validation gate passes. Product can credibly claim it works because it verified itself.
- **3-month:** Stable enough for other developers to run overnight on their projects
- **6-month:** Public release with community adoption

### Key Performance Indicators

| KPI | Target | Why It Matters |
|-----|--------|----------------|
| Hours of unattended operation | 8+ | Overnight = ~8 hours. Must survive the full window. |
| Cost per verified story | <$10 | Current: $3-7 when it works, infinite when it times out. Stability fixes this. |
| Time from failure to understanding | <2 min | Operator reads error report, knows what to fix. No log spelunking. |
| Action items resolved vs created | >1.0 ratio | Debt must shrink, not grow. Currently growing at ~12/day. |

### Design Constraint: Project-Agnostic

codeharness must work for ANY project type without rejecting or limiting itself based on project category. The current system sometimes refuses verification for CLIs, plugins, or non-web projects — this is wrong.

Every project has a development process, verification needs, and some form of observable behavior. The harness adapts HOW it verifies (Docker exec for CLIs, browser for web, API calls for services) but never WHETHER it verifies.

| Project Type | Verification Approach | Observability Approach |
|-------------|----------------------|----------------------|
| Web app | Browser (agent-browser) + API calls | Full OTLP stack (logs, metrics, traces) |
| CLI tool | `docker exec` + stdout capture | OTLP for instrumented CLIs, stdout/stderr for others |
| Claude plugin | `claude --print` inside Docker | Session output capture, hook execution logs |
| Library/SDK | Test runner output + import verification | Test telemetry |
| API service | HTTP calls + response validation | Full OTLP stack |
| Any other | Adapt to what's available | Adapt to what's available |

**The harness never says "this project type isn't supported."** It says "here's how I'll verify this type of project."

## MVP Scope

### Core Features (Must Have — Blocks Overnight Operation)

1. **Unified state management** — One source of truth for story status, attempts, errors. SM module owns all state. Kill the split between `ralph/.story_retries`, harness-run memory variables, and `sprint-status.yaml`. Single state file, single format, read/written by one module.

2. **Error capture on timeout** — When `--output-format json` produces 0 bytes on timeout, capture what's available (git diff since iteration start, sprint-status delta, partial stderr). Never lose 30 min of work silently. Every iteration produces a report, even failed ones.

3. **Morning report** — `codeharness status` produces a single clear output: stories done/failed/blocked/in-progress with per-story error details. One command, 10 seconds to understand the overnight run. Replaces reading sprint-status.yaml + ralph/status.json + .story_retries + .flagged_stories + session-retro-*.md.

4. **Graceful failure per module** — Each module (infra, dev, review, verify, sprint) handles its own failures. Infra fails? Log it, skip verification, move to next story. Verification times out? Save partial proof, increment attempts, move on. No module crash kills the system. No `set -e`, no silent 0-byte exits.

5. **Project-agnostic verification** — Remove any code or heuristic that refuses or limits verification based on project type. CLI tools, Claude plugins, libraries, web apps — all get verified. The harness adapts approach, never rejects.

6. **OpenSearch observability backend** — Support external OpenSearch as an alternative to VictoriaMetrics for logs, metrics, and traces. Flag: `--opensearch-url <url>`. OTel Collector exports to OpenSearch. Query layer reads from OpenSearch API instead of Victoria*. Verifier uses OpenSearch queries for runtime evidence. Does not require local Docker stack when using remote OpenSearch.

7. **Agent-browser verification** — For web apps and projects with UI, use agent-browser (Vercel, Rust-native, AI-optimized) for real browser-based verification. Navigate pages, interact via accessibility-tree refs, capture annotated screenshots, diff before/after state. Integrates as a verification approach alongside Docker exec and observability queries.

8. **Module restructuring** — Extract `init.ts` (719 lines) into `infra/` module. Split `harness-run.md` (500 lines) into `sprint/`, `dev/`, `review/`, `verify/` modules. Each module owns its state, patches, and failure handling. Clean interfaces between modules.

### Should Have (Improves Quality)

9. **Patches per role** — Each module has its own `patches/{role}/` directory with enforcement rules connected to real operational failure modes, not generic checklists.

10. **Docker infra cleanup** — Shared stack only. Remove per-project compose generation. Stale container cleanup before verification runs. `codeharness status --check-docker` checks the correct (shared) containers.

11. **Retry state persistence across sessions** — Ralph and harness-run share the same attempt counter. No more split-brain where ralph says 3 retries and harness-run says 0.

### Out of Scope

- DB MCP verification — existing Docker exec + observability queries + agent-browser are sufficient
- Multi-project parallel execution
- Dashboard / UI / web interface
- Notification system (Slack, email)
- Configurable enforcement levels

### MVP Success Criteria

1. **Self-validation passes.** `codeharness run` against its own repo, all 65 stories reach `done` or have specific actionable blockers.
2. **8-hour overnight run.** No crashes, no silent failures, no 0-byte outputs.
3. **Morning clarity.** `codeharness status` shows full overnight results in <60 seconds.
4. **Wasted iteration rate <5%.** Nearly every ralph iteration produces useful output.
5. **OpenSearch backend functional.** At least one project verified using remote OpenSearch for observability.
6. **Agent-browser functional.** At least one web project verified using real browser interaction.

### Future Vision

After the overhaul:
- **Community release** — The self-validated product is credible enough for public release
- **Multi-methodology** — Works with any task list, any loop, any framework
- **Ecosystem** — Custom verification adapters, observability backends, enforcement plugins
- **Enterprise** — Team dashboards, cost tracking, multi-project orchestration
