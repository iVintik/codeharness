---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - prd-v1 (existing completed PRD, used as brownfield context)
  - docs/index.md (project documentation overview)
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 2
workflowType: 'prd'
classification:
  projectType: developer_tool
  domain: general
  complexity: high
  projectContext: brownfield
---

# Product Requirements Document - codeharness

**Author:** BMad
**Date:** 2026-04-03

## Executive Summary

codeharness is an npm CLI and Claude Code plugin that orchestrates autonomous coding agents across multiple frameworks — Claude Code, OpenAI Codex, OpenCode (with omo), and gstack — through a single workflow engine. Today, each coding agent framework is a silo: you pick one and live with its strengths and blind spots. codeharness breaks that lock-in by letting you define workflows where each task dispatches to the best framework and model for the job.

The critical use case is **cross-framework verification**: develop a feature in Claude Code with Opus, then verify it in Codex with a completely independent agent runtime. The verifier literally cannot cheat — it's a different binary, different model, different context. This architectural separation of concerns delivers trust that same-framework self-verification cannot.

The workflow engine already exists (`tasks → flow` YAML with loop blocks). This PRD extends it with per-task `driver` and `model` fields, a driver abstraction that wraps each framework's CLI, and a live TUI workflow visualization showing the current position in the execution graph.

Two problems this solves. First, **framework lock-in** — teams pick Claude Code or Codex and miss capabilities the other offers. codeharness makes them composable. Second, **invisible orchestration** — when an autonomous loop runs for hours, you can't tell where it is or what framework is executing. The TUI workflow map makes the multi-framework pipeline visible and legible in real time.

### What Makes This Special

- **Cross-framework verification by architecture** — dev and verify tasks run on different agent runtimes. Independence is structural, not policy. The verifier has no access to the developer's context, tools, or session.
- **Mix-and-match orchestration** — each workflow task specifies its own driver (claude-code, codex, opencode) and model. Use Opus for complex architecture, Sonnet for routine implementation, Codex for cost-effective batch verification.
- **Plugin ecosystem integration** — gstack skills run inside Claude Code sessions, omo agents run inside OpenCode sessions. codeharness orchestrates at the framework level; plugins orchestrate within each framework.
- **Live workflow visualization** — the existing Ink TUI gains a schematic workflow graph (`implement → verify → loop[retry, verify]`) with highlighted current position, framework label per task, and cost/time per node.
- **CLI-wrapping driver model** — all target frameworks (Claude Code Agent SDK, `codex` CLI, `opencode` CLI) are wrapped uniformly. No framework exposes a programmatic SDK for external orchestration — codeharness fills that gap by wrapping their CLIs and parsing their outputs.

## Project Classification

- **Project Type:** Developer tool — npm CLI package + Claude Code plugin
- **Domain:** General software development tooling
- **Complexity:** High — multi-framework driver abstraction, CLI output parsing across 3+ agent runtimes, TUI workflow graph rendering, per-task model routing
- **Project Context:** Brownfield — workflow engine, agent resolver, Ink TUI, and Agent SDK dispatch all exist. This PRD adds the multi-framework layer and workflow visualization on top.

## Success Criteria

### User Success

- **Verification trust uplift:** Cross-framework verified stories have higher manual spot-check pass rate than same-framework verification. Target: >98% (vs current >95% same-framework target).
- **Mix-and-match payoff:** User can configure a workflow with different drivers per task in under 5 minutes by editing workflow YAML. No code changes required.
- **Cost optimization visible:** TUI shows per-task cost by driver/model. User can see that verification on Codex costs 60-80% less than on Claude Code Opus.
- **Workflow legibility:** User can glance at TUI and immediately know: which task is executing, on which framework, where in the flow, and what's next. No log-reading required.
- **Zero lock-in anxiety:** Swapping a task from one driver to another is a one-line YAML change. If Codex is down, switch to OpenCode and re-run.

### Business Success

- **3-month goal:** All three drivers (Claude Code, Codex, OpenCode) working end-to-end with cross-framework verification producing proof documents. gstack and omo integration functional via parent drivers.
- **6-month goal:** Stable multi-framework workflows in production use. Community contributors can add new drivers.
- **Positioning:** codeharness is the only tool that orchestrates across coding agent frameworks. No competitor does cross-framework dispatch with workflow visualization.
- **Dogfooding:** codeharness development itself uses cross-framework verification — dev in Claude Code, verify in Codex.

### Technical Success

- **Driver spawn overhead:** <3s from task dispatch to first agent output for any driver (CLI cold start).
- **Output parsing fidelity:** Driver captures 100% of agent output events (tool use, text, errors) — no silent drops.
- **Driver interface parity:** All drivers implement the same `AgentDriver` interface. Adding a new driver requires implementing one file, no engine changes.
- **Context passing:** Task output contracts feed into next task's input contracts across framework boundaries. No manual copy-paste between frameworks.
- **TUI workflow render:** Workflow graph renders correctly for flows up to 10 tasks with nested loops. Updates current position within 500ms of task transition.
- **Graceful degradation:** If a driver's CLI is not installed, the engine reports the error clearly and suggests install command. No silent failures.

### Measurable Outcomes

| Metric | Target | Method |
|--------|--------|--------|
| Cross-framework verification pass rate | >98% | Manual spot-check |
| Driver spawn latency | <3s | Timed CLI execution |
| Workflow YAML config time | <5 min | User timing |
| Per-driver cost delta visible | Yes | TUI shows $/task |
| Driver interface: new driver LOC | <300 lines | Code review |
| TUI workflow position update | <500ms | Measured render |
| Same-framework vs cross-framework bug catch rate | >15% improvement | Tracked over sprint |

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — deliver cross-framework orchestration as a working end-to-end capability. All three drivers, full workflow config, TUI workflow visualization, and plugin ecosystem integration. The goal is to validate that cross-framework verification catches more bugs than same-framework, at lower cost.

**Resource Requirements:** Solo developer with Claude Code (dogfooding). External dependencies: `codex` CLI and `opencode` CLI installed on the machine.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Journey 1 (Sasha — Cross-Framework Verify): full workflow config → run → cross-framework verification
- Journey 2 (Autonomous Loop — Multi-Framework): all three frameworks in a single sprint
- Journey 3 (Sasha — TUI Watching): workflow graph visible during execution

**Must-Have Capabilities:**

| Capability | What It Does |
|-----------|--------------|
| Codex driver | Wraps `codex` CLI, spawns process, parses output to StreamEvent |
| OpenCode driver | Wraps `opencode` CLI, spawns process, parses output to StreamEvent |
| Per-task `driver` field | Workflow YAML task definition accepts `driver: codex\|claude-code\|opencode` |
| Per-task `model` field | Workflow YAML task definition accepts `model` override |
| Model resolution chain | Task model → agent model → driver default |
| Driver health check | At workflow start, verify all referenced drivers are installed and authenticated |
| TUI workflow graph | Ink component showing flow DAG with current position, framework labels |
| Per-node cost/time in TUI | Each workflow node shows accumulated cost and elapsed time |
| Loop iteration counter | TUI shows loop count on loop blocks |
| Output contract passing | Serialize task output to JSON, feed as input to next task across framework boundary |
| Backward compatibility | Workflows without `driver` field default to `claude-code` |
| gstack integration | gstack skills loaded into claude-code driver sessions via config |
| omo integration | omo agents loaded into opencode driver sessions via config |
| Driver capability matrix | Docs showing what each driver can/cannot do |
| Cost-based routing hints | Suggest cheaper driver for simple tasks |

### Post-MVP Features (Expansion)

- Dynamic driver selection based on task requirements
- Multi-framework parallel execution for independent tasks
- Community driver contributions (driver development guide)
- Workflow composition and sub-workflow imports
- Driver marketplace
- Cross-sprint driver performance analytics

### Risk Mitigation Strategy

**Technical Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Codex CLI output format undocumented or changes | Driver breaks | Integration tests with real CLI output snapshots, pin codex version |
| OpenCode CLI output format differs from expected | Driver parsing fails | Start with simplest output mode, iterate on real output |
| Cross-framework context passing loses information | Verification gets incomplete picture | Output contracts are explicit JSON — test with round-trip validation |
| Driver spawn latency too high | UX degradation | Profile first, optimize later. 3s target is generous for CLI cold start |
| Codex/OpenCode CLI auth model incompatible with headless use | Can't run in autonomous loop | Test headless auth early. Fall back to whichever driver works first |
| Framework CLIs have different permission/sandbox models | Tasks fail on one driver but not another | Driver capability matrix — document what each driver can/cannot do, fail fast with clear error |

**Market Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frameworks release native cross-framework support | Core value absorbed | Unlikely short-term — each vendor optimizes for their own models. First-mover advantage. |
| Codex or OpenCode discontinued | Driver becomes dead code | Driver interface makes swapping cheap. New frameworks appear regularly. |

**Resource Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| CLI output parsing more complex than expected | MVP delayed | Start with simplest output mode per framework |
| TUI workflow graph rendering complex for nested loops | Feature delayed | MVP: flat graph with loop notation. Expansion: nested visualization |

## User Journeys

### Journey 1: Sasha — Setting Up Cross-Framework Verification

Sasha maintains a fintech API built with codeharness. Verification has been catching most issues, but last week a story passed same-framework verification and broke in staging — the Claude Code evaluator trusted the dev agent's test setup too much. Same context, same model family, same blind spots.

**Opening:** Sasha opens `workflows/default.yaml`. Today it reads: `implement: {agent: dev}`, `verify: {agent: evaluator}` — both running on Claude Code Agent SDK. She wants verification on a completely independent runtime.

**Rising Action:** She edits the workflow:
```yaml
tasks:
  implement:
    agent: dev
    driver: claude-code
    model: claude-opus-4
  verify:
    agent: evaluator
    driver: codex
    model: codex-mini
    source_access: false
```
One file, two lines changed. She runs `codeharness run`. The TUI boots — the workflow graph at the top shows: `implement [claude-code] → verify [codex] → loop[retry [claude-code] → verify [codex]]`. The `implement` node is highlighted cyan.

**Climax:** Story 3 implements a transaction ledger. The dev agent finishes on Claude Code. The TUI workflow graph shifts — `verify` lights up, and the framework label switches to `[codex]`. Codex spins up, receives the built artifact and acceptance criteria but no source code. It finds that the ledger endpoint returns transactions in random order — the dev agent's tests didn't check sort order. Verification fails. The loop engages: retry on Claude Code fixes the ORDER BY clause, verify on Codex confirms. Two iterations, bug caught that same-framework verification missed for a week.

**Resolution:** Sasha checks the TUI — `$0.42` for implement (Opus), `$0.03` for verify (Codex mini). Cross-framework verification at 7% the cost of the dev task. The proof document shows evidence from a completely independent runtime.

---

### Journey 2: The Autonomous Loop — Multi-Framework Sprint Execution

The codeharness engine picks up a 6-story sprint. The workflow is configured with Claude Code for implementation, OpenCode for code review, and Codex for verification.

**Opening:** `codeharness run` starts. The TUI renders the workflow graph:
```
implement [claude-code/opus] → review [opencode/claude-sonnet] → verify [codex/codex-mini] → loop[retry → verify]
```
Story 1-1 begins. `implement` highlights.

**Rising Action:** The engine calls `dispatchAgent()` with the claude-code driver. Stream events flow into the TUI — tool activity, thoughts, cost ticking. Implementation completes. The engine serializes the output contract (changed files, test results) and passes it to the next task. The TUI shifts: `review` highlights, framework label shows `[opencode]`. The engine spawns `opencode` CLI with the review agent's prompt. Different binary, different output format — the OpenCode driver parses its stream and normalizes events into the same `StreamEvent` types. Review passes.

**Climax:** `verify` highlights — `[codex]`. The Codex driver spawns `codex` CLI with the evaluator's prompt, no source access. The evaluator interacts with the running application, produces a Showboat proof. Three frameworks touched one story. The TUI shows all three nodes as completed with checkmarks, cost per node, and elapsed time.

**Resolution:** After 6 stories, the TUI workflow graph shows the full run: 18 task executions across 3 frameworks, total cost $4.20 (vs estimated $8.50 single-framework). Every verification was independent.

---

### Journey 3: Sasha — Watching a Long Run via TUI

Sasha kicked off a 12-story sprint and checks in periodically. She needs to know what's happening without reading logs.

**Opening:** She opens the terminal. The TUI is persistent — no scrollback to find, no logs to parse. At the top: the workflow graph.

**Rising Action:** The workflow graph shows:
```
━━━ Workflow: story 7-2 ━━━━━━━━━━━━━━━━━━━━━━━
  implement ✓  →  review ✓  →  [verify] ◆  →  loop[ retry → verify ]
  claude-code     opencode      codex
  $0.38 / 4m      $0.05 / 1m    ... / 2m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
`verify` is highlighted cyan with the spinner. Below that, the story breakdown: 6 done, 1 in-progress, 5 pending. Below that, tool activity from the Codex driver.

**Climax:** Verification fails on story 7-2. The loop kicks in — `retry` lights up, framework switches back to `[claude-code]`. Sasha sees this happen in real time. No ambiguity about what's running where. After retry, `verify` lights up again on Codex. This time it passes. The workflow graph shows the loop executed once — a small `(1)` counter on the loop block.

**Resolution:** Sasha glances at the TUI every 30 minutes. Each time: workflow position, active framework, cost accumulating. She never opens a log file.

---

### Journey 4: Marcus — Adding a New Driver

Marcus wants to use Aider (an open-source coding agent) as a cheap implementation driver for simple stories. codeharness doesn't have an Aider driver yet.

**Opening:** Marcus looks at the existing drivers in `src/lib/agents/drivers/`. He sees `claude-code.ts`, `codex.ts`, `opencode.ts` — each implements the `AgentDriver` interface: `name`, `spawn()`, `parseOutput()`, `getStatusFile()`.

**Rising Action:** He creates `aider.ts`. The `spawn()` method shells out to `aider --yes --message "${prompt}" --model ${model}`. The `parseOutput()` method parses Aider's terminal output into `StreamEvent` objects — file edits become `tool-complete` events, thinking text becomes `text` events. He registers the driver in the driver factory.

**Climax:** Marcus edits his workflow YAML:
```yaml
implement:
  agent: dev
  driver: aider
  model: claude-sonnet-4
```
Runs `codeharness run`. The TUI shows `[aider]` in the workflow graph. Stream events render normally — the driver abstraction makes Aider look like any other framework to the TUI and engine.

**Resolution:** 280 lines of code. One file plus one registration. The driver interface kept it contained — no engine changes, no TUI changes, no schema changes.

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| **Sasha — Cross-Framework Verify** | Per-task driver/model in workflow YAML, driver abstraction, cross-framework output contract passing, TUI workflow graph with framework labels |
| **Autonomous Loop — Multi-Framework** | Driver factory, CLI spawning for each framework, stream event normalization across drivers, TUI multi-framework rendering, cost tracking per driver |
| **Sasha — TUI Watching** | Persistent workflow graph in TUI, current position highlighting, per-node cost/time, loop iteration counter, framework label per task node |
| **Marcus — New Driver** | `AgentDriver` interface, driver registration, CLI wrapping pattern, stream output parsing, <300 LOC per driver |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Cross-Framework Agent Orchestration**

No existing tool dispatches coding tasks across multiple agent frameworks in a single workflow. Claude Code, Codex, and OpenCode are designed as standalone silos. codeharness treats them as interchangeable execution backends — same workflow YAML, different `driver` field. This is the "new paradigm" signal: coding agents become composable services rather than monolithic environments.

**2. Structural Verification Independence**

Same-framework verification is fundamentally compromised — the verifier shares the agent's context window, model family, and tool capabilities. Cross-framework verification makes independence architectural: the Codex verifier cannot access the Claude Code developer's session, cannot share its blind spots, and runs on a different model with different failure modes. This is stronger than policy-based separation (e.g., "the verifier should not look at source code") because it's mechanically enforced by the framework boundary.

**3. CLI-Wrapping as Universal Agent SDK**

None of the target frameworks (Claude Code, Codex, OpenCode) expose a programmatic SDK for external orchestration. They're all CLI-first. codeharness creates a de facto agent SDK by wrapping their CLIs, normalizing their outputs into a common `StreamEvent` protocol, and exposing a uniform `AgentDriver` interface. This is an accidental SDK — built from necessity because no official one exists.

**4. Workflow-as-TUI: Live DAG Visualization**

TUI tools for coding agents show activity logs (tool calls, text output). codeharness shows the workflow graph itself — a schematic DAG with nodes, framework labels, cost/time per node, and "you are here" highlighting. This makes orchestration visible, not just activity.

### Market Context & Competitive Landscape

- **Claude Code** — Agent SDK for programmatic dispatch, but only to Claude models. No multi-framework.
- **OpenCode** — Supports 75+ models but within a single framework. No cross-framework orchestration.
- **Codex CLI** — OpenAI models only, no SDK for external dispatch.
- **gstack** — Claude Code plugin with role-based skills. Not an orchestrator.
- **omo** — OpenCode plugin with multi-agent support. Framework-internal only.
- **No tool** combines cross-framework dispatch, workflow DAG execution, and live TUI visualization.

### Validation Approach

1. **Dogfooding** — Build this feature using codeharness itself. Dev on Claude Code, verify on Codex.
2. **Cross-framework bug catch rate** — Track bugs caught by cross-framework verification that same-framework missed. Target: >15% improvement.
3. **Driver parity test** — Same story implemented via Claude Code driver and Codex driver should produce functionally equivalent results (tests pass on both).
4. **TUI usability** — User can identify current workflow position, active framework, and cost within 3 seconds of glancing at TUI.

### Innovation Risk Mitigation

See **Project Scoping & Phased Development → Risk Mitigation Strategy** for full risk analysis. Key innovation-specific risks: CLI output format instability (mitigated by pinned versions + integration tests), cross-framework context loss (mitigated by explicit output contracts), and framework permission model differences (mitigated by driver capability matrix).

## Developer Tool Specific Requirements

### Project-Type Overview

codeharness is an npm CLI package (`codeharness`) with a Claude Code plugin wrapper. This PRD adds multi-framework driver support and TUI workflow visualization to the existing architecture. All drivers are TypeScript, bundled in the main package. No separate driver packages for now.

### Technical Architecture Considerations

**Driver Architecture:**
- TypeScript driver implementations in `src/lib/agents/drivers/`
- All drivers implement the `AgentDriver` interface: `name`, `spawn()`, `parseOutput()`, `getStatusFile()`
- Drivers bundled in the main `codeharness` npm package — no separate packages
- Claude Code driver uses Agent SDK directly (existing `dispatchAgent()`)
- Codex/OpenCode drivers wrap their CLIs via `child_process.spawn`
- Stream output normalized to common `StreamEvent` protocol per driver

**Workflow Schema Extensions:**
- `driver` field added to task definition (optional, defaults to `claude-code`)
- `model` field added to task definition (optional, overrides agent default)
- Backward compatible — existing workflows without `driver` field work unchanged
- Schema validated by `workflow.schema.json`

**Model Resolution Chain:**
1. Task-level `model` in workflow YAML (highest priority)
2. Agent-level `model` in agent YAML
3. Driver default model (e.g., `claude-sonnet-4` for claude-code, `codex-mini` for codex)

**Target Drivers (MVP + Growth):**

| Driver | Binary | Output Format | Auth |
|--------|--------|--------------|------|
| claude-code | Agent SDK (in-process) | StreamEvent (native) | Anthropic API key |
| codex | `codex` CLI | stdout NDJSON | OpenAI API key / ChatGPT account |
| opencode | `opencode` CLI | stdout | Per-provider keys |
| gstack | via claude-code driver | StreamEvent (native) | Anthropic API key |
| omo | via opencode driver | stdout | Per-provider keys |

**Note:** gstack and omo are plugins within their respective frameworks — they don't need separate drivers. gstack skills activate inside Claude Code sessions (claude-code driver), omo agents activate inside OpenCode sessions (opencode driver). The workflow configures which plugins/skills load, not a separate driver.

### Installation & Distribution

```bash
npm install -g codeharness
```

Single package, all drivers bundled. External framework CLIs (`codex`, `opencode`) must be installed separately by the user. `codeharness run` checks driver availability at workflow start and reports missing CLIs with install instructions.

### Documentation

- Driver docs in `docs/drivers/` — one page per driver covering: auth setup, supported models, capability matrix, known limitations
- No YAML config files for drivers — drivers are code, not user-configurable templates
- Workflow YAML examples in `docs/workflows/` showing common multi-framework patterns

### Migration from Single-Driver

- Existing workflows without `driver` field default to `claude-code` — fully backward compatible
- Existing workflows without `model` field use agent default model — no change in behavior
- No migration command needed — just add `driver`/`model` fields when ready

### Implementation Considerations

- **Driver health check at startup** — before any task dispatches, engine verifies each referenced driver's CLI is installed and authenticated
- **Output contract serialization** — between cross-framework tasks, output contracts serialize to JSON files in `.codeharness/contracts/`. Not implicit session state.
- **Per-driver cost tracking** — each driver reports cost differently (Agent SDK returns `cost_usd`, CLIs may not). Drivers normalize to `cost_usd` or report `null` if unavailable.
- **Error normalization** — driver errors classified into same categories (RATE_LIMIT, NETWORK, AUTH, UNKNOWN) regardless of framework

## Functional Requirements

### Driver Management

- FR1: System can register and resolve agent drivers by name (claude-code, codex, opencode)
- FR2: System can detect whether a driver's CLI binary is installed and accessible on the system PATH
- FR3: System can verify a driver's authentication status before task dispatch
- FR4: System can report missing or unauthenticated drivers with install/auth instructions at workflow start
- FR5: System can spawn an agent process via the appropriate driver's CLI invocation
- FR6: System can terminate a running driver process on task timeout, cancellation, or circuit breaker

### Stream Event Normalization

- FR7: Each driver can parse its framework's CLI output into the common `StreamEvent` protocol (tool-start, tool-input, tool-complete, text, retry, result)
- FR8: System can capture cost information from driver output and normalize to `cost_usd` (or null if unavailable)
- FR9: System can classify driver errors into standard categories (RATE_LIMIT, NETWORK, AUTH, UNKNOWN) regardless of framework
- FR10: System can detect and report when a driver's output format is unparseable (format change, version mismatch)

### Workflow Configuration

- FR11: User can specify a `driver` field per task in workflow YAML (optional, defaults to `claude-code`)
- FR12: User can specify a `model` field per task in workflow YAML (optional, overrides agent default)
- FR13: System can resolve the effective model for a task via the resolution chain: task model → agent model → driver default
- FR14: System can validate workflow YAML referential integrity — all referenced drivers exist, all referenced agents exist
- FR15: System can load existing workflows without `driver`/`model` fields with full backward compatibility

### Cross-Framework Task Execution

- FR16: System can execute a workflow where consecutive tasks use different drivers (e.g., implement on claude-code, verify on codex)
- FR17: System can serialize a task's output contract to a structured JSON file after task completion
- FR18: System can load a previous task's output contract and inject it as context into the next task's prompt
- FR19: System can pass acceptance criteria, changed file lists, and test results across framework boundaries via output contracts
- FR20: System can execute verification tasks on a different framework than implementation tasks within the same story

### Plugin Ecosystem Integration

- FR21: User can configure gstack skills to load within claude-code driver sessions via workflow or agent config
- FR22: User can configure omo agents to load within opencode driver sessions via workflow or agent config
- FR23: System can pass plugin-specific configuration to the driver's CLI invocation (e.g., `--plugin`, `--agent` flags)

### TUI Workflow Visualization

- FR24: System can render a schematic workflow graph in the Ink TUI showing all tasks as nodes with directional flow
- FR25: System can highlight the currently executing task node in the workflow graph
- FR26: System can display the driver name (framework label) under each task node in the workflow graph
- FR27: System can display accumulated cost and elapsed time per completed task node
- FR28: System can render loop blocks in the workflow graph with visual grouping and iteration counter
- FR29: System can update the workflow graph position within 500ms of a task transition
- FR30: System can show task completion status (checkmark, spinner, pending) per node in the workflow graph

### TUI Activity Display (Existing — Extended)

- FR31: System can display stream events from any driver in the activity section (tool calls, thoughts, retries)
- FR32: System can display the active driver name alongside tool activity
- FR33: System can display per-story cost breakdown by driver in the story breakdown section

### Cost Tracking & Routing

- FR34: System can accumulate cost per driver across a workflow run
- FR35: System can display total cost per driver in the TUI
- FR36: System can suggest a cheaper driver for tasks that don't require the capabilities of the configured driver (routing hint — advisory, not automatic)

### Driver Capability Matrix

- FR37: System can document each driver's capabilities (source access, browser access, MCP support, tool restrictions) in a queryable format
- FR38: System can warn at workflow start if a task's requirements (e.g., source_access: false) conflict with the driver's capabilities

### Out of Scope (Explicitly Excluded from MVP)

- Dynamic driver selection (auto-pick framework based on task requirements)
- Multi-framework parallel execution (run tasks on different frameworks simultaneously)
- Driver marketplace or community driver registry
- Workflow composition and sub-workflow imports

## Non-Functional Requirements

### Performance

- NFR1: Driver spawn (CLI cold start to first output) must complete within 3 seconds for any driver
- NFR2: TUI workflow graph position update must render within 500ms of task transition
- NFR3: Stream event parsing must keep up with driver output rate — no buffering backpressure causing dropped events
- NFR4: Output contract serialization/deserialization must complete within 1 second for contracts up to 1MB
- NFR5: TUI render loop must maintain 15 FPS maximum without CPU spikes during active stream parsing
- NFR6: Driver health check (all drivers in workflow) must complete within 5 seconds at workflow start

### Integration

- NFR7: Codex driver must work with Codex CLI versions pinned in package.json — integration tests validate against real CLI output
- NFR8: OpenCode driver must work with OpenCode CLI versions pinned in package.json — integration tests validate against real CLI output
- NFR9: Claude Code driver must maintain compatibility with Agent SDK `@anthropic-ai/claude-agent-sdk` pinned version
- NFR10: Output contract JSON format must be stable across driver versions — contracts written by one driver must be readable by any other
- NFR11: Workflow YAML schema changes must be backward compatible — old workflows work without modification
- NFR12: Plugin ecosystem integration (gstack, omo) must not require modifications to the plugins themselves — configuration only

### Reliability

- NFR13: If a driver process crashes mid-task, the engine must detect it within 5 seconds, report the failure, and allow retry
- NFR14: If a driver's CLI output format is unparseable, the engine must surface the raw output for debugging — not silently drop it
- NFR15: Output contract files must survive engine crashes — written atomically (write-then-rename) so partial writes don't corrupt cross-framework state
- NFR16: Driver timeout must be configurable per task (default: 30 minutes). Exceeded timeout terminates the driver process cleanly.
- NFR17: TUI must remain responsive during driver failures — a crashed driver must not freeze the render loop
- NFR18: Workflow engine must be idempotent for re-runs — restarting a failed workflow resumes from the last completed task, not from scratch
