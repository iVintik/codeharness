---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - research/domain-harness-design-long-running-agents-research-2026-04-01.md
  - research/technical-ai-agent-verification-testing-research-2026-03-16.md
  - research/technical-workflow-engine-implementation-research-2026-04-02.md
  - product-brief-bmad-orchestrator-2026-03-14.md
  - prd.md (existing completed PRD, used as brownfield context)
documentCounts:
  briefs: 1
  research: 3
  brainstorming: 0
  projectDocs: 1
workflowType: 'prd'
classification:
  projectType: developer_tool
  domain: general
  complexity: high
  projectContext: brownfield
  designPhilosophy: declarative-first
---

# Product Requirements Document - codeharness v2

**Author:** BMad
**Date:** 2026-04-01 (updated 2026-04-02, edited 2026-04-02)

## Executive Summary

codeharness is an npm CLI and Claude Code plugin that makes autonomous coding agents produce software that actually works. Version 1 proved the concept — Ralph loop, BMAD integration, observability stack, verification hooks. But the verification architecture is fundamentally broken: the agent that writes the code also grades it. Anthropic's own research confirms this fails — "models praise their own work confidently even when quality is mediocre."

This redesign replaces the current hardcoded execution loop and self-verification theater with three things:

1. **A declarative workflow engine** that drives multi-agent execution. A YAML workflow definition specifies task states, transitions, per-task prompts, agent assignments, expected inputs/outputs, and session boundaries (fresh context vs. continuation). This replaces Ralph's 1000+ lines of bash orchestration with something configurable and clean. Execution uses the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — the official TypeScript API for programmatic Claude Code control.

2. **A single adversarial verification pass** against the final built artifact. No per-story micro-verification. No session flags. No proof document regex parsing. One blind evaluator agent — no source code access, only Docker, observability, and documentation — exercises the final artifact subjectively and produces a structured JSON verdict. The evaluator reads ACs in user language and independently figures out how to test them.

3. **A multi-level agent and workflow configuration system.** Agents and workflows exist at three levels: embedded (ships with codeharness), user-level, and project-level — with hybrid patching to customize without replacing. 9 embedded agents (8 BMAD + evaluator) and 1 default workflow ship out of the box. Agent personality uses BMAD-compatible fields as the base with optional PersonaNexus-compatible traits for fine-grained behavioral tuning.

BMAD owns planning (briefs, PRDs, architecture, stories). Codeharness owns execution and verification — taking BMAD's output and driving it to a proven-working artifact.

### What Makes This Special

- **Declarative, not imperative.** Workflow YAML defines agent dispatch, session control, and handoff contracts. No more reading bash to understand what happens next.
- **Honest verification.** One blind evaluator at the end, exercising the real artifact subjectively. The verifier can't see source, can't be fooled by passing tests, can't talk itself into approval. Structured JSON evidence required for every AC verdict.
- **Configurable everything.** Agents and workflows are configurable at embedded, user, and project levels. Patch any embedded agent or workflow without replacing it — override specific fields or append to prompts.
- **Agent-as-assignee with structured personality.** Tasks are assigned to specific agents with BMAD personas and optional quantified personality traits (warmth, rigor, directness, etc.). The evaluator is tuned for high rigor and zero leniency.
- **Aggressive legacy removal.** The 4-format proof parser, session flags, self-verification path, per-story hooks, and hardcoded Ralph logic all get deleted. Only clean code survives.

### Project Classification

- **Type:** Developer tool (CLI + Claude Code plugin)
- **Domain:** General software engineering tooling
- **Complexity:** High — workflow engine, multi-agent orchestration, session isolation, agent configuration system, observability integration, major legacy rework
- **Context:** Brownfield — significant architectural rework of working system
- **Design Philosophy:** Declarative-first — YAML workflows and agent configs drive behavior

## Success Criteria

### User Success

- User runs `codeharness run` with the default workflow — all stories execute through assigned agents without human intervention
- The blind evaluator exercises the final artifact and produces a pass/fail verdict the user trusts
- Workflow YAML is understandable in under 5 minutes
- When the evaluator rejects, the feedback is specific enough that the user (or agent on retry) knows exactly what to fix
- User can customize agent behavior and workflows via patches without editing codeharness source

### Business Success

- Personal/OSS developer tool — adoption metrics are secondary to the tool actually working
- Success = the author uses it to ship real projects autonomously with confidence in the output

### Technical Success

- **Lines of code reduction.** Net negative LOC count after the rework
- **Test coverage.** Unit test coverage for `src/lib/` rises from ~5% to 80%+
- **Workflow YAML is the single source of truth** for execution behavior
- **One verification path.** Blind evaluator session or nothing

### Measurable Outcomes

| Metric | Current | Target |
|--------|---------|--------|
| Source LOC (src/) | Measure at start | Net reduction |
| Unit test coverage (src/lib/) | ~5% | 80%+ |
| Verification code paths | 4+ | 1 (blind evaluator) |
| Ralph bash LOC | ~1000 | 0 (replaced by workflow engine) |
| Workflow definition format | Hardcoded in ralph-prompt.ts | YAML file |

## Product Scope

### MVP (Phase 1)

**MVP Approach:** Problem-solving — replace broken self-verification with adversarial evaluation. Success = "does it catch bugs that v1 missed?"

**Resource:** Solo developer + autonomous agents (codeharness eating its own dogfood).

**Must-Have Capabilities:**
1. Workflow YAML parser with JSON schema validation
2. Flow execution engine (sequential steps, `loop:` blocks, task scope resolution)
3. Agent dispatch via programmatic API with BMAD config resolution
4. Session boundary management (fresh/continue per task)
5. Blind evaluator agent — subjective verification, no source access, Docker + observability, structured JSON verdict
6. Evaluator finding injection into retry prompts
7. Score-based circuit breaker (replaces file-change counting)
8. Trace ID generation and injection per iteration
9. Multi-level agent configuration (embedded/user/project) with hybrid patching
10. Multi-level workflow configuration (embedded/user/project) with hybrid patching
11. 9 embedded agents (8 BMAD + evaluator) and 1 default embedded workflow
12. Issue tracking via `issues.yaml` — replaces beads, retro findings auto-added, engine executes issues alongside stories
13. Legacy deletion (Ralph bash, session flags, proof parsers, self-verify hooks, beads)
14. Unit tests for all new modules (80%+ coverage)

### Growth (Phase 2)

- Multiple default workflow templates (web app, CLI, library)
- Evaluator prompt tuning based on logged evaluator decisions
- Pluggable evaluator strategies (Playwright MCP for web apps, API exerciser for backends, CLI runner for tools)
- PersonaNexus-compatible trait compilation (quantified personality → prompt instructions)

### Vision (Phase 3)

- Workflow marketplace — community-contributed workflow definitions
- Agent marketplace — community-contributed agent configs
- Harness complexity audit tooling — automated detection of load-bearing vs. dead components

### Risk Mitigation

**Workflow engine complexity:** Loops could create infinite execution if the circuit breaker fails. **Mitigation:** Schema validation rejects malformed flows at parse time. Circuit breaker is the hard stop regardless of flow definition. Max iterations cap always enforced.

**Evaluator quality:** Anthropic found that "out of the box, Claude is a poor QA agent." The evaluator judges subjectively — it reads ACs and independently exercises the artifact, requiring evidence for every verdict. **Mitigation:** Structured JSON output forces evidence. Calibrate against known-broken artifacts. Log all evaluator sessions. Run multiple trials (pass^3 is the real metric). Iterate on the evaluator prompt across real projects.

**Legacy removal scope:** Deleting Ralph, hooks, and verification paths simultaneously is a big bang. **Mitigation:** Build the new engine alongside the old code. Switch over when the new engine passes the same test suite. Then delete.

**Solo developer:** One person doing engine + evaluator + config system + legacy removal + tests. **Mitigation:** The agents do the implementation work. Codeharness v2 is the first real test of codeharness v2.

## User Journeys

### Journey 1: First Run (Happy Path)

Alex has a BMAD sprint plan with 8 stories for a Node.js API. Runs `codeharness init`, then `codeharness run`. No workflow YAML to write — the default handles it.

The dev agent implements each story in a fresh session. After all 8 complete, the blind evaluator spawns — no source access, only Docker, observability endpoints, and story ACs. It independently figures out how to exercise each AC — makes real HTTP requests, checks DB state, queries traces. Verdict: 7/8 pass. Finding for AC5: "POST /users returns 201 but doesn't persist — `docker exec psql -c 'SELECT count(*) FROM users'` returns 0."

The engine feeds that finding into the dev agent's prompt for story 5 only. Dev fixes it, commits. Engine rebuilds, evaluator re-verifies the entire artifact from scratch. 8/8. Done.

### Journey 2: Evaluator Rejection Loop

Evaluator rejects three times. Scores: 4/8 → 5/8 → 5/8. Third iteration shows no score improvement — circuit breaker triggers on stagnation.

Alex sees: "Circuit breaker: evaluator score stuck at 5/8 across 2 iterations. Remaining failures: AC3 (WebSocket never connected), AC6 (rate limiter not enforced — 1000 requests all returned 200)."

Alex fixes AC3 manually, defers AC6 to next sprint, re-runs. Evaluator passes on the scoped ACs.

### Journey 3: Agent & Workflow Customization

New project — React frontend. Alex patches the default workflow and the dev agent at project level:

```yaml
# .codeharness/workflows/default.patch.yaml
extends: embedded://default
overrides:
  tasks:
    implement:
      model: opus
    verify:
      maxBudgetUsd: 10
  flow:
    replace:
      - implement
      - build
      - verify
      - loop:
        - retry
        - build
        - verify
```

```yaml
# .codeharness/agents/dev.patch.yaml
extends: embedded://dev
overrides:
  personality:
    traits:
      rigor: 0.9
prompt_patches:
  append: |
    This project uses React + Vite. Run npm run build before
    considering implementation complete.
```

No TypeScript changes, no bash editing. Patches override specific fields; everything else inherits from the embedded defaults.

### Journey 4: Broken Environment

Alex runs `codeharness init` on a machine without Docker installed. The CLI detects the missing dependency and reports: "Docker not found — required for blind evaluator verification. Install Docker Desktop and re-run init."

Alex installs Docker but has no BMAD project set up. `codeharness init` reports: "No BMAD agent configs found at `_bmad/bmm/agents/`. Run BMAD setup first, or use `--skip-bmad` to use only embedded agents."

Alex uses `--skip-bmad`. Init succeeds with embedded agents only. Later, `codeharness run` completes stories but the evaluator fails — Docker daemon isn't running. Engine reports: "Evaluator spawn failed: Docker daemon not running. Verdict: UNKNOWN for all ACs. Start Docker and resume with `codeharness run --resume`."

Alex starts Docker, runs `--resume`. Engine picks up from the verify step, evaluator exercises the artifact. Done.

### Journey 5: Retro Findings → Issues → Implementation

After a sprint, Alex runs the retrospective. The retro produces three findings:
1. "Docker timeout too aggressive — evaluator killed mid-verification" (actionable)
2. "Good: workflow YAML was easy to customize" (not actionable)
3. "Evaluator didn't test error paths — only happy path" (actionable)

The two actionable findings are automatically added to `issues.yaml`:
```yaml
issues:
  - id: issue-003
    title: Docker timeout too aggressive for evaluator
    source: retro-sprint-1
    priority: high
    status: ready-for-dev
  - id: issue-004
    title: Evaluator only tests happy paths
    source: retro-sprint-1
    priority: medium
    status: backlog
```

In the next sprint, `codeharness run` picks up issue-003 (high priority, ready-for-dev) alongside the planned stories. The dev agent gets the issue description as context, fixes the timeout handling, commits. The evaluator re-verifies the full artifact including the fix.

Alex also runs `codeharness issue create "Add rate limiter to /api/users" --priority medium` to manually log a bug found during demo. It appears in `issues.yaml` and will be picked up in a future sprint based on priority.

### Journey 6: Engine Execution Flow

Engine reads workflow YAML (resolved through embedded → user → project patches) and sprint-status.yaml:

1. For each `per-story` task in flow order: resolve agent config (embedded → user → project patches) → compile to SDK inline subagent → generate trace ID → spawn session (fresh or continue) → pass input contract → collect output
2. For each `per-run` task: spawn evaluator with all story ACs, trace IDs, observability endpoints → collect structured JSON verdict + findings
3. On loop step: filter to failed stories → spawn dev with findings injected → rebuild → re-verify entire artifact
4. Terminate on: all ACs pass OR circuit breaker (score stagnation) OR max iterations

## Developer Tool Requirements

### Technical Architecture

**Runtime:** Node.js (TypeScript). Single runtime, no multi-platform builds.

**Dependencies:** `commander`, `yaml`, `@anthropic-ai/claude-agent-sdk` (new — replaces bash `spawn`).

**Distribution:** npm registry (CLI binary) + Claude Code plugin registry (skills, hooks, commands). No additional channels.

**IDE Integration:** None. Rides on Claude Code's VS Code/JetBrains extensions.

### API Surface — Workflow YAML Schema

The workflow YAML is the primary API surface:
- Formally specified with a JSON schema
- Validatable via `codeharness validate`
- Self-documenting — the default workflow is the best documentation

Key schema elements:
- `tasks` — named task definitions with agent, scope, session, input/output, prompt
- `flow` — ordered execution steps with `loop:` blocks for feedback loops
- Task properties: `scope` (per-story/per-run), `session` (fresh/continue), `source_access` (boolean), `agent` (agent name)

### Agent Configuration Format

BMAD-compatible base fields (required) with optional PersonaNexus-compatible traits:

```yaml
name: evaluator
role:
  title: Adversarial QA Evaluator
  purpose: Exercise the built artifact and determine if it actually works
persona:
  identity: Senior QA who trusts nothing without evidence
  communication_style: Blunt, evidence-first
  principles:
    - Never give the benefit of the doubt
    - Every PASS requires evidence
# Optional: quantified personality
personality:
  traits:
    rigor: 0.98
    directness: 0.95
    warmth: 0.2
```

### Multi-Level Configuration

```
# Embedded (inside codeharness package)
templates/agents/     # 8 BMAD + evaluator
templates/workflows/  # default sprint workflow

# User-level
~/.codeharness/agents/      # personal agent customizations
~/.codeharness/workflows/   # personal workflows

# Project-level
.codeharness/agents/        # project agent patches or custom agents
.codeharness/workflows/     # project workflow patches or custom workflows
```

Resolution: embedded → user patch → project patch (sequential merge). Patches use `extends: embedded://name` with structured `overrides:` and freeform `prompt_patches:`.

### Installation & Setup

```bash
npm install -g codeharness
claude plugin install codeharness
codeharness init    # detect stack, generate default workflow
codeharness run     # execute
```

Zero-config for the happy path. `init` generates a default `workflow.yaml` that works for standard BMAD sprints.

### Migration (v1 → v2)

**Clean break.** No backward compatibility with v1 state files, Ralph configs, or proof documents.

- `codeharness init --force` regenerates everything from scratch
- Old `.claude/codeharness.local.md` state format replaced
- Ralph bash loop (`ralph/`) deleted entirely
- Old verification artifacts not migrated
- Old hooks removed

## Functional Requirements

### Workflow Definition

- FR1: User can define a workflow as a YAML file with tasks, flow order, and loop blocks
- FR2: User can specify per-task properties: agent assignment, scope (per-story/per-run), session boundary (fresh/continue), source access, input/output contracts, and prompt template
- FR3: User can define flow execution order as an ordered list of task references
- FR4: User can define loop steps in the flow using a `loop:` block containing an ordered list of tasks to repeat
- FR5: System validates workflow YAML against a JSON schema at parse time and rejects malformed definitions
- FR6: System ships a default embedded workflow that handles standard BMAD sprint execution without user customization

### Agent Configuration

- FR7: System ships 9 embedded agents: dev, qa, architect, pm, sm, analyst, ux-designer, tech-writer, evaluator
- FR8: User can create custom agents at project level (`.codeharness/agents/`) or user level (`~/.codeharness/agents/`)
- FR9: User can patch embedded or user-level agents via `extends:` with structured `overrides:` and freeform `prompt_patches:`
- FR10: Agent config supports BMAD-compatible base fields (name, role, persona with identity/communication_style/principles) and optional PersonaNexus-compatible traits (10 dimensions, 0-1 scale)
- FR11: System resolves agent config through embedded → user → project patch chain at runtime
- FR12: System compiles resolved agent config into Claude Code inline subagent definition for SDK dispatch

### Workflow Configuration

- FR13: User can create custom workflows at project level (`.codeharness/workflows/`) or user level (`~/.codeharness/workflows/`)
- FR14: User can patch embedded or user-level workflows via `extends:` with structured `overrides:`
- FR15: System resolves workflow config through embedded → user → project patch chain at runtime

### Workflow Execution

- FR16: System reads resolved workflow and sprint-status.yaml to drive execution
- FR17: System executes `per-story` tasks once for each story in the sprint
- FR18: System executes `per-run` tasks once after all stories in the current phase complete
- FR19: System dispatches agents via programmatic API with compiled subagent definitions
- FR20: System spawns fresh sessions or continues existing ones based on task session boundary config
- FR21: System passes defined input contracts to each task and collects defined outputs
- FR22: System generates a unique trace ID per iteration and injects it into agent prompts
- FR23: System enforces `source_access: false` by spawning the agent in a workspace with no source code

### Adversarial Verification

- FR24: System spawns a blind evaluator agent that independently exercises the built artifact via Docker and observability endpoints
- FR25: Evaluator reads ACs in user language and independently determines how to test each one — without access to implementation-specific test scripts, prior evaluator sessions, or source code
- FR26: Evaluator produces a structured JSON verdict with per-AC scores, status (pass/fail/unknown), evidence (commands run, output observed), and specific findings for failures
- FR27: Evaluator has access to story acceptance criteria, Docker container, and observability endpoints — but not source code
- FR28: System re-verifies the entire artifact from scratch on each verification pass (no incremental verification)

### Feedback Loop

- FR29: System injects evaluator findings (specific per-AC failure details with evidence) into the retry task's agent prompt
- FR30: System filters retry execution to only the stories the evaluator flagged as failed
- FR31: System executes flow loop steps until all ACs pass or circuit breaker triggers

### Progress & Circuit Breaker

- FR32: System tracks evaluator scores across iterations and detects score stagnation
- FR33: Circuit breaker triggers when evaluator scores stop improving across consecutive iterations
- FR34: System reports circuit breaker state with specific remaining failures and score history
- FR35: User can resume execution after circuit breaker with manual fixes applied

### Observability

- FR36: System generates and injects trace IDs that correlate across iteration → agent prompt → logs → metrics → traces
- FR37: Evaluator can query observability endpoints (VictoriaLogs, VictoriaMetrics, VictoriaTraces) during verification

### Issue Tracking

- FR38: User can create issues via `codeharness issue create "title"` with optional priority and source
- FR39: System stores issues in `issues.yaml` with id, title, source, priority, and status
- FR40: System reads both `sprint-status.yaml` (stories) and `issues.yaml` (issues) during workflow execution
- FR41: Issues use the same status values and execution path as stories — the engine treats them uniformly
- FR42: Retro workflow findings tagged as actionable are automatically added to issues.yaml

### CLI Commands

- FR43: User can run `codeharness init` to detect stack, generate default workflow, and set up the project
- FR44: User can run `codeharness run` to execute the workflow
- FR45: User can run `codeharness validate` to check workflow and agent YAML against schemas
- FR46: User can run `codeharness status` to see execution progress, evaluator scores, and circuit breaker state
- FR47: User can run `codeharness issue` to create, list, and manage issues

### Legacy Removal

- FR48: System does not contain Ralph bash loop, session flags, proof document regex parsers, self-verification hooks, multi-format proof quality validators, or beads integration
- FR49: System has exactly one verification path: blind evaluator session

## Non-Functional Requirements

### Performance

- NFR1: Workflow YAML parsing and validation completes in <500ms for any valid workflow
- NFR2: Agent config resolution (embedded → user → project) completes in <200ms
- NFR3: Agent session spawn (fresh) completes in <5s excluding model response time
- NFR4: Circuit breaker state evaluation completes in <100ms
- NFR5: `codeharness status` returns in <1s regardless of run history size

### Reliability

- NFR6: Engine state survives process crashes — on restart, execution resumes from the last completed task
- NFR7: Evaluator session timeout does not crash the engine — timeout is a scored failure, not a fatal error
- NFR8: All engine state is persisted to disk after each task completion
- NFR9: Engine handles programmatic agent dispatch API errors gracefully (API limits, network failures) with specific error reporting
- NFR10: Long-running executions (4+ hours) do not degrade in correctness or accumulate resource leaks

### Integration

- NFR11: Engine uses the official programmatic agent dispatch API — no direct CLI process spawning
- NFR12: BMAD agent configs are read-only — engine never modifies agent YAML files
- NFR13: Docker container lifecycle (start, exec, stop) is managed by the engine, not delegated to agents
- NFR14: Observability stack is optional — engine runs without it, evaluator reports reduced capability

### Code Quality

- NFR15: Unit test coverage for `src/lib/` is 80%+ on all new modules
- NFR16: Zero shell scripts in the execution path — all orchestration logic in compiled application code
- NFR17: Net negative LOC change after legacy removal
- NFR18: All public functions have explicit TypeScript types (no `any` in API surface)
