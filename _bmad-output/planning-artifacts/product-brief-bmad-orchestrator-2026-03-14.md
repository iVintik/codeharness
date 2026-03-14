---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments: []
date: 2026-03-14
author: Ivintik
---

# Product Brief: codeharness

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

codeharness is a Claude Code plugin that applies Harness Engineering — the discipline OpenAI used to ship 1M lines of agent-generated code — to autonomous development workflows. It works with BMAD/bmalph, Ralph loops, or any autonomous coding workflow, adding what they all lack: real-world verification, enforced development visibility, and mechanical constraints that make agents actually produce working software.

The fundamental problem: autonomous agents write code that "passes tests" but doesn't work. codeharness enforces that the agent verifies what it built by actually using it — agent-browser for UI interaction, real API calls with side-effect verification, database state inspection — with every verification step captured as reproducible proof via Showboat.

The second problem: agents are blind. codeharness applies OpenAI's Principle 4 ("Give the Agent Eyes") — spinning up an ephemeral VictoriaMetrics observability stack, instrumenting the project with OpenTelemetry, and enforcing that the agent queries logs, traces, and metrics during development. This is enforced by mechanical constraints (hooks), not documentation.

codeharness integrates natively with BMAD and bmalph but is not limited to them. Any Claude Code autonomous workflow benefits from the harness.

---

## Core Vision

### Problem Statement

Autonomous coding agents — whether running via bmalph/Ralph, Codex, or any other loop — share two unsolved problems:

1. **Verification is fake.** Quality gates are "run tests, lint, typecheck." But AI-generated tests frequently validate bugs — IEEE research shows tests that pass but confirm incorrect behavior. Anthropic's own engineering blog confirms agents mark features done prematurely. The agent never actually uses what it built. A feature can have 100% test coverage and be completely broken when a user tries it.

2. **The agent is blind.** Without proper logging, structured errors, and runtime inspection tools, the agent can't see what's happening in the project it's building. It writes code, runs tests, sees a pass/fail, and guesses. This leads to shotgun debugging, false confidence, and invisible failures (API returns 200 but does nothing).

OpenAI proved these problems are solvable. Their Harness Engineering approach — ephemeral observability stacks, browser access for agents, mechanical enforcement — enabled 1M lines of agent-generated production code in 5 months. codeharness makes these patterns available as a Claude Code plugin.

### Problem Impact

- **"Tests pass but nothing works"** — The #1 failure mode of autonomous development. Agent writes tests that validate bugs, marks tasks done, moves on. User discovers everything is broken.
- **Agent blindness** — Without runtime visibility, the agent can't debug effectively. It changes random things hoping something works. OpenAI showed that giving agents full visibility enables 6+ hour sustained autonomous runs.
- **No methodology has this built-in** — BMAD, Ralph, Vibe Kanban, Codex — none enforce real-world verification or development visibility. Every autonomous loop has this gap.
- **Fragmented approaches** — Teams hack together ad-hoc solutions (manual Playwright scripts, custom logging, one-off verification). No unified harness exists.

### Why Existing Solutions Fall Short

- **bmalph/Ralph**: Quality gates are shell commands (tests, lint). Agent never opens the browser, never makes a real API call, never checks DB state. No observability stack.
- **OpenAI's Harness Engineering**: Proves the approach works but is internal tooling, not available as a plugin. codeharness makes it accessible.
- **All autonomous loops**: None give agents eyes into the developed project's runtime behavior. None enforce observability by design.
- **ralphex**: Adds multi-agent code review but still no real-world verification or observability.

### Proposed Solution

A Claude Code plugin — **codeharness** — that adds Harness Engineering to any autonomous development workflow:

1. **One-command install** — `claude plugin install codeharness`. Works standalone or alongside bmalph/BMAD.
2. **Real-world verification via agent-browser + Showboat** — Agent verifies what it built by actually using it: agent-browser to navigate UI, interact via accessibility-tree refs, take annotated screenshots, diff before/after states. Every verification step is captured in Showboat as reproducible proof. Evidence is real, not fakeable.
3. **"Give the Agent Eyes" — Ephemeral VictoriaMetrics observability** — `/harness-init` spins up ephemeral VictoriaLogs + VictoriaMetrics + VictoriaTraces (Docker), instruments the project with OpenTelemetry (1-3 lines). Agent queries logs (LogQL), metrics (PromQL), traces during development. Observability is per-task — torn down when complete.
4. **Mechanical enforcement** — Visibility and verification enforced via Claude Code hooks (PreToolUse/PostToolUse), not instructions. Agent can't commit without querying runtime behavior. Agent can't mark done without Showboat proof. Constraints are structural.
5. **BMAD/bmalph integration** — First-class support for BMAD stories, sprint plans, and bmalph's Ralph loop. codeharness reads BMAD artifacts, adds verification per story, produces Showboat proof per story. But also works without BMAD — any task list or autonomous loop benefits.
6. **Methodology-agnostic** — Works with BMAD/bmalph, standalone Ralph loops, custom workflows, or even manual development. The harness is the value, not the methodology.

### Design Philosophy — Harness Engineering Principles

Adapted from OpenAI's Harness Engineering (1M lines, 5 months, zero hand-written code):

| Principle | OpenAI's Formulation | codeharness Implementation |
|-----------|---------------------|---------------------------|
| **What the agent can't see doesn't exist** | All context must be repo-resident | All artifacts in repo. Architectural decisions in files, not heads. |
| **Ask what capability is missing** | Don't prompt harder — fix the environment | When verification fails, add visibility tools. Fix the harness, not the prompt. |
| **Mechanical enforcement over documentation** | Structural tests + linters + CI | Claude Code hooks block commits without verification. Constraints are code, not prose. |
| **Give the agent eyes** | Ephemeral Victoria stack per worktree | Ephemeral VictoriaLogs/Metrics/Traces per task, agent-browser for UI, DB MCP for data |
| **A map, not a manual** | ARCHITECTURE.md as ~100-line map | CLAUDE.md as map to docs/, invariants as boundary statements |

**Key insight from OpenAI:** "Constraining the solution space makes agents more productive, not less."

**Key insight from LangChain:** Harness changes alone (no model change) improved Terminal Bench 2.0 from 52.8% → 66.5%, Top 30 → Top 5. The harness matters more than the model.

### Key Differentiators

- **Harness Engineering as a plugin** — Makes OpenAI's proven patterns available to any Claude Code user, not just internal teams with custom infrastructure.
- **Real-world verification with proof** — agent-browser + Showboat. Agent must use the feature and capture reproducible evidence. No other tool does this.
- **"Give the Agent Eyes" — enforced** — Ephemeral VictoriaMetrics stack. OTLP instrumentation. Agent queries logs/traces/metrics. Enforced by hooks.
- **Methodology-agnostic** — Works with BMAD/bmalph, Ralph, or any workflow. The harness is the product, not the methodology.
- **Mechanical enforcement** — Hooks block commits without verification. Constraints accelerate, not slow down.
- **Anti-cheating** — Showboat's exec→verify cycle, agent-browser's snapshot diffing, pre/post-task comparisons.

### Key Tools

| Tool | Role | Why This One |
|------|------|-------------|
| **[VictoriaMetrics Stack](https://victoriametrics.com/)** | Observability (logs, metrics, traces) | Single binaries, Docker-ready, OTLP-native. Used by OpenAI. Ephemeral per-task. Agent queries via LogQL/PromQL. |
| **[agent-browser](https://github.com/vercel-labs/agent-browser)** | Real browser verification | Rust-native, AI-optimized (accessibility tree with refs), built-in diff, handles dialogs, annotated screenshots |
| **[Showboat](https://github.com/simonw/showboat)** | Reproducible proof-of-work | Captures real command output, `verify` re-runs everything, anti-cheating by design |
| **[OpenTelemetry](https://opentelemetry.io/)** | Application instrumentation | Vendor-neutral, 1-3 lines to instrument, auto-instrumentation for all major frameworks |
| **Database MCP** (DBHub/pgEdge) | DB state verification | Read-only direct database access for side-effect verification |

### BMAD/bmalph Integration

codeharness is not a replacement for BMAD or bmalph. It's a complementary layer:

- **bmalph handles**: BMAD installation, planning workflows (Phases 1-3), Ralph loop setup, BMAD→Ralph artifact bridge
- **codeharness handles**: The harness — observability, verification, visibility, enforcement
- **Together**: bmalph orchestrates planning and execution structure. codeharness ensures the execution actually produces working software with proof.
- **Without bmalph**: codeharness works standalone with any task list, any loop, any workflow. `/harness-init` sets up the harness regardless of methodology.

## Target Users

### Primary Users

**The Technical Lead / Solo Developer**

- Experienced developer comfortable with CLI tools, CI/CD, and agent workflows
- Uses autonomous coding agents (Claude Code, BMAD/bmalph, Ralph, or custom workflows)
- **Core frustrations**: Agent says it's done, tests pass, but the feature doesn't actually work when you try to use it. Tired of re-checking everything manually.
- **Success looks like**: Kicks off autonomous work, comes back to a Showboat verification document with real evidence (screenshots, API responses, DB state, log queries) — and it all re-verifies clean

### User Journey

**With BMAD/bmalph:**
1. **Install**: `claude plugin install codeharness` (alongside existing bmalph setup)
2. **Init**: `/harness-init` — VictoriaMetrics stack started, app instrumented with OTLP, agent-browser + DB MCP configured, hooks installed
3. **Develop**: Run BMAD planning as usual → bmalph sprint execution → codeharness adds verification + visibility per story
4. **Verify**: Each story produces a Showboat proof document. `showboat verify` confirms it's real.
5. **Trust**: Features actually work when you try them.

**Standalone (no BMAD):**
1. **Install**: `claude plugin install codeharness`
2. **Init**: `/harness-init` — same harness setup
3. **Develop**: Use any workflow (Ralph loop, manual development, custom automation)
4. **Verify**: `/harness-verify` runs real-world verification with Showboat proof
5. **Trust**: Same guarantees, any methodology.

## Success Metrics

### User Success Metrics

1. **Real Verification Accuracy** — % of tasks marked "verified" that actually work when the user tries them manually (target: >95%)
2. **Sprint Autonomy Rate** — % of sprints that complete without user intervention (target: >80% for well-specified tasks)
3. **Time Savings** — Reduction in manual re-checking time (target: 70%+ reduction)
4. **Trust Score** — Does the user trust the output without manually re-checking?

### Business Objectives

- **Open source** — Build a community around harness engineering for autonomous development
- **3-month goal**: Creator can autonomously produce complex prototypes with real verification
- **6-month goal**: Plugin stable for public release; adopted by BMAD community and standalone users
- **12-month goal**: Community contributions, integrations with other methodologies, growing ecosystem

### Key Performance Indicators

| KPI | Measurement | Target |
|-----|------------|--------|
| Real verification accuracy | Tasks that actually work when user tests manually | >95% |
| Showboat verify pass rate | `showboat verify` confirms outputs match on re-run | >98% |
| Autonomous run time | Hours agent works without human intervention | >4h |
| Agent debug efficiency | Root cause identified on first attempt (with visibility) | >70% |
| Install-to-first-verification time | Time from install to first verified task | <15 min |
| Iteration cycles per task | Average implement→verify→fix loops before pass | <3 |

## MVP Scope

### Core Features

1. **One-command install** — `claude plugin install codeharness`
2. **Harness initialization** — `/harness-init` sets up: ephemeral VictoriaMetrics stack (Docker Compose), OpenTelemetry instrumentation for the project's stack, agent-browser + Database MCP in `.mcp.json`, enforcement hooks. Detects existing BMAD/bmalph and integrates.
3. **Real-world verification with Showboat proof** — `/harness-verify` or automatic during autonomous loops: implement → quality gates → verify by actually using it (agent-browser, API calls, DB inspection) → capture evidence in Showboat → `showboat verify` confirms → iterate until working.
4. **Enforced visibility** — Hooks ensure agent queries VictoriaLogs/VictoriaTraces during development, can't commit without runtime behavior verification, can't mark done without Showboat proof.
5. **BMAD/bmalph integration** — Reads BMAD sprint plans, adds per-story verification, produces per-story Showboat documents. Works seamlessly with bmalph's Ralph loop.

### Post-MVP Epics (Planned)

- **Configurable enforcement levels** — Adjust strictness of hooks per project (strict for production, relaxed for prototypes)
- **Self-correcting execution** — Retrospectives, issue surfacing, course correction built into the loop
- **Structural constraint generation** — Generate linters and structural tests that enforce architecture mechanically
- **Multi-methodology support** — Explicit integrations beyond BMAD (custom task formats, other frameworks)
- **Famdeck capability absorption** — Autonomy assessment (L0-L2), relay/handoff, consolidated into the plugin

### MVP Success Criteria

- Install with one command, init in under 5 minutes
- VictoriaMetrics stack + OTLP instrumentation + agent-browser + DB MCP configured automatically
- Agent queries logs/traces during development — enforced by hooks
- Real-world verification produces Showboat proof documents
- `showboat verify` re-runs and confirms outputs match
- Works with BMAD/bmalph out of the box AND works standalone
- When verification says "done" — the feature actually works

### Future Vision

A universal harness engineering plugin for autonomous development. Any methodology, any loop, any project — codeharness ensures the agent has eyes, verification is real, and proof is reproducible. Every feature comes with a Showboat document that anyone can re-verify. The harness matters more than the model.
