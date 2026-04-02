---
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
completedAt: '2026-04-02'
inputDocuments:
  - prd-evaluator-redesign.md
  - architecture-v2.md
  - research/domain-harness-design-long-running-agents-research-2026-04-01.md
  - research/technical-workflow-engine-implementation-research-2026-04-02.md
---

# codeharness v2 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for codeharness v2, decomposing 49 FRs, 18 NFRs, and 6 architectural decisions into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: User can define a workflow as a YAML file with tasks, flow order, and loop blocks
- FR2: User can specify per-task properties: agent assignment, scope, session boundary, source access, input/output contracts, prompt template
- FR3: User can define flow execution order as an ordered list of task references
- FR4: User can define loop steps using a loop: block containing an ordered list of tasks to repeat
- FR5: System validates workflow YAML against a JSON schema at parse time and rejects malformed definitions
- FR6: System ships a default embedded workflow for standard BMAD sprint execution
- FR7: System ships 9 embedded agents: dev, qa, architect, pm, sm, analyst, ux-designer, tech-writer, evaluator
- FR8: User can create custom agents at project level or user level
- FR9: User can patch embedded or user-level agents via extends with structured overrides and prompt_patches
- FR10: Agent config supports BMAD-compatible base fields and optional PersonaNexus-compatible traits
- FR11: System resolves agent config through embedded → user → project patch chain at runtime
- FR12: System compiles resolved agent config into Claude Code inline subagent definition
- FR13: User can create custom workflows at project level or user level
- FR14: User can patch embedded or user-level workflows via extends with structured overrides
- FR15: System resolves workflow config through embedded → user → project patch chain at runtime
- FR16: System reads resolved workflow and sprint-status.yaml to drive execution
- FR17: System executes per-story tasks once for each story in the sprint
- FR18: System executes per-run tasks once after all stories complete
- FR19: System dispatches agents via programmatic API with compiled subagent definitions
- FR20: System spawns fresh sessions or continues existing ones based on task session boundary config
- FR21: System passes defined input contracts to each task and collects defined outputs
- FR22: System generates a unique trace ID per iteration and injects it into agent prompts
- FR23: System enforces source_access: false by spawning the agent in a workspace with no source code
- FR24: System spawns a blind evaluator agent that exercises the built artifact via Docker and observability
- FR25: Evaluator reads ACs in user language and independently determines how to test each one
- FR26: Evaluator produces a structured JSON verdict with per-AC scores, status, evidence, findings
- FR27: Evaluator has access to story ACs, Docker container, observability — but not source code
- FR28: System re-verifies the entire artifact from scratch on each verification pass
- FR29: System injects evaluator findings into the retry task's agent prompt
- FR30: System filters retry execution to only stories the evaluator flagged as failed
- FR31: System executes flow loop steps until all ACs pass or circuit breaker triggers
- FR32: System tracks evaluator scores across iterations and detects score stagnation
- FR33: Circuit breaker triggers when evaluator scores stop improving
- FR34: System reports circuit breaker state with specific failures and score history
- FR35: User can resume execution after circuit breaker with manual fixes applied
- FR36: System generates and injects trace IDs that correlate across iteration, prompt, logs, metrics, traces
- FR37: Evaluator can query observability endpoints during verification
- FR38: User can create issues via codeharness issue create with optional priority and source
- FR39: System stores issues in issues.yaml with id, title, source, priority, status
- FR40: System reads both sprint-status.yaml and issues.yaml during workflow execution
- FR41: Issues use the same status values and execution path as stories
- FR42: Retro findings tagged as actionable are automatically added to issues.yaml
- FR43: User can run codeharness init to detect stack, generate default workflow, set up project
- FR44: User can run codeharness run to execute the workflow
- FR45: User can run codeharness validate to check workflow and agent YAML against schemas
- FR46: User can run codeharness status to see progress, evaluator scores, circuit breaker state
- FR47: User can run codeharness issue to create, list, and manage issues
- FR48: System does not contain Ralph bash loop, session flags, proof parsers, self-verify hooks, beads
- FR49: System has exactly one verification path: blind evaluator session

### Non-Functional Requirements

- NFR1: Workflow YAML parsing and validation in <500ms
- NFR2: Agent config resolution in <200ms
- NFR3: Agent session spawn in <5s excluding model response
- NFR4: Circuit breaker evaluation in <100ms
- NFR5: codeharness status returns in <1s
- NFR6: Engine state survives crashes — resume from last completed task
- NFR7: Evaluator timeout is scored failure, not fatal error
- NFR8: All state persisted after each task completion
- NFR9: Engine handles agent dispatch API errors gracefully
- NFR10: 4+ hour executions do not degrade or leak
- NFR11: Official programmatic agent dispatch API — no CLI spawning
- NFR12: BMAD agent configs read-only
- NFR13: Docker lifecycle managed by engine
- NFR14: Observability stack optional — graceful degradation
- NFR15: 80%+ unit test coverage on new modules
- NFR16: Zero shell scripts in execution path
- NFR17: Net negative LOC after legacy removal
- NFR18: Explicit TypeScript types, no any in API surface

### Additional Requirements

**From Architecture:**
- 7 modules in dependency order: workflow-state → workflow-parser → agent-resolver → agent-dispatch → workflow-engine → evaluator → circuit-breaker
- Evaluator workspace: temp dir, bare: true, disallowedTools: [Edit, Write]
- Embedded templates in templates/agents/ and templates/workflows/
- Config cached at startup
- Verdict enforced by JSON schema
- issues.yaml replaces beads
- 12 files need beads import cleanup
- ~40 files deleted (ralph/, hooks/, 8 lib, 3 templates)
- 13 commands reworked, 1 deleted, 3 kept
- 3 skills reworked, plugin.json updated

**From Research:**
- Agent SDK query() as execution substrate
- loop: block syntax for flows
- BMAD → SDK inline subagent at runtime
- Evaluator judges subjectively, no contracts
- Anti-leniency: evidence per verdict

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1-6 | Epic 2 | Workflow definition, YAML schema, default workflow |
| FR7-12 | Epic 3 | Agent config, embedded agents, patching, resolution |
| FR13-15 | Epic 9 | Workflow config patching and resolution |
| FR16-18 | Epic 5 | Execution engine, per-story/per-run scope |
| FR19-23 | Epic 4 | Agent dispatch, sessions, trace IDs, source isolation |
| FR24-28 | Epic 6 | Blind evaluator, subjective verification, JSON verdict |
| FR29-31 | Epic 5 | Feedback loop, finding injection, loop execution |
| FR32-35 | Epic 7 | Circuit breaker, score stagnation, resume |
| FR36 | Epic 4 | Trace ID generation and injection |
| FR37 | Epic 6 | Evaluator observability queries |
| FR38-39, FR42 | Epic 8 | Issue create, store, retro auto-import |
| FR40-41 | Epic 5 | Engine reads issues.yaml alongside sprint-status |
| FR43 | Epic 2 | codeharness init |
| FR44 | Epic 5 | codeharness run |
| FR45 | Epic 2 | codeharness validate |
| FR46 | Epic 5 | codeharness status |
| FR47 | Epic 8 | codeharness issue |
| FR48-49 | Epic 1 | Legacy removal |

## Epic List

### Epic 1: Legacy Cleanup & Foundation
Developer has a clean codebase — beads removed, legacy files deleted, workflow-state module as foundation.
**FRs:** FR48, FR49 | **NFRs:** NFR16, NFR17

### Epic 2: Workflow Definition & Validation
Developer can author workflow YAML, validate it, and init generates a default workflow.
**FRs:** FR1-6, FR43, FR45 | **NFRs:** NFR1

### Epic 3: Agent Configuration System
9 embedded agents available. Custom agents and patches at project/user level. Config resolution chain.
**FRs:** FR7-12 | **NFRs:** NFR2, NFR12

### Epic 4: Agent Dispatch & Session Management
Engine spawns Claude Code sessions via Agent SDK with session boundaries, trace IDs, and source isolation.
**FRs:** FR19-23, FR36 | **NFRs:** NFR3, NFR11

### Epic 5: Workflow Execution Engine
`codeharness run` executes the workflow — per-story tasks, per-run tasks, loop blocks, finding injection. Reads stories and issues.
**FRs:** FR13-18, FR29-31, FR40-41, FR44, FR46 | **NFRs:** NFR6-10

### Epic 6: Blind Evaluator & Verification
Blind evaluator exercises artifact, produces JSON verdict with per-AC evidence, engine handles retry loop.
**FRs:** FR24-28, FR37 | **NFRs:** NFR7, NFR13, NFR14

### Epic 7: Circuit Breaker & Progress Detection
Score-based stagnation detection, halt on no-progress, specific failure reporting, resume after manual fixes.
**FRs:** FR32-35 | **NFRs:** NFR4

### Epic 8: Issue Tracking & Retro Integration
`codeharness issue` CLI for create/list/manage. Retro findings auto-import. Issues execute alongside stories.
**FRs:** FR38-39, FR42, FR47

### Epic 9: Workflow Configuration & Patching
Custom workflows or patches at project/user level. Changes without touching source.
**FRs:** FR13-15

---

## Epic 1: Legacy Cleanup & Foundation

Developer has a clean codebase — beads removed, legacy files deleted, workflow-state module as foundation.

### Story 1.1: Delete Beads Integration

As a developer,
I want all beads imports and calls removed from the codebase,
So that I can build new features without dead dependency chains.

**Acceptance Criteria:**

**Given** the current codebase has beads.ts and beads-sync.ts with 12+ dependent files
**When** beads.ts, beads-sync.ts, and all beads imports are removed
**Then** `npm run build` succeeds with zero beads references
**And** the 12 dependent files compile without beads imports
**And** `npm run test:unit` passes

### Story 1.2: Delete Ralph Loop & Legacy Verification

As a developer,
I want the Ralph bash loop, old hooks, and proof document system deleted,
So that only the new architecture's code paths exist.

**Acceptance Criteria:**

**Given** ralph/ directory, hooks/ directory, and legacy lib modules exist
**When** all legacy files are deleted and their imports removed
**Then** ralph/ directory no longer exists
**And** hooks/ directory no longer exists
**And** src/lib/ does not contain verify.ts, verify-parser.ts, verifier-session.ts, patch-engine.ts, retry-state.ts, or old state.ts
**And** src/templates/ does not contain showboat-template.ts, verify-prompt.ts, or ralph-prompt.ts
**And** src/commands/retry.ts is deleted
**And** `npm run build` succeeds
**And** zero shell scripts remain in the execution path

### Story 1.3: Workflow State Module

As a developer,
I want a workflow-state module that persists execution state to YAML,
So that the engine can resume from the last completed task after a crash.

**Acceptance Criteria:**

**Given** no workflow-state.yaml exists
**When** `writeState()` is called after a task completion
**Then** `.codeharness/workflow-state.yaml` is created with workflow name, started timestamp, iteration, phase, tasks_completed array, evaluator_scores array, and circuit_breaker state
**And** `readState()` returns the persisted state
**And** state survives process exit and is readable on restart
**And** unit tests cover read, write, crash recovery, and corrupted file handling at 80%+ coverage

---

## Epic 2: Workflow Definition & Validation

Developer can author workflow YAML, validate it, and init generates a default.

### Story 2.1: Workflow YAML JSON Schema

As a developer,
I want a JSON schema defining valid workflow YAML structure,
So that malformed workflows are rejected at parse time.

**Acceptance Criteria:**

**Given** a workflow YAML file
**When** validated against the JSON schema
**Then** valid workflows with tasks and flow pass validation
**And** missing required fields are rejected with specific errors
**And** invalid scope values are rejected
**And** loop: blocks with non-existent task references are rejected
**And** schema file exists at src/schemas/workflow.schema.json

### Story 2.2: Workflow Parser Module

As a developer,
I want a workflow-parser module that loads, validates, and resolves workflow YAML,
So that the engine receives a fully resolved config.

**Acceptance Criteria:**

**Given** a workflow YAML file path
**When** `parseWorkflow()` is called
**Then** YAML is parsed and validated against the JSON schema
**And** invalid YAML returns a specific parse error
**And** parsing completes in <500ms
**And** returned object contains resolved tasks and flow with typed interfaces
**And** unit tests at 80%+ coverage

### Story 2.3: Default Embedded Workflow

As a developer,
I want a default workflow YAML shipped with codeharness,
So that `codeharness run` works without custom configuration.

**Acceptance Criteria:**

**Given** codeharness is installed
**When** the default workflow is loaded from templates/workflows/default.yaml
**Then** it defines implement, verify, and retry tasks with correct properties
**And** flow is: implement → verify → loop: [retry, verify]
**And** it validates against the JSON schema

### Story 2.4: Init Command — Workflow Generation

As a developer,
I want `codeharness init` to generate a default workflow in my project,
So that I can start using codeharness without manual setup.

**Acceptance Criteria:**

**Given** a project without .codeharness/workflows/
**When** `codeharness init` runs
**Then** `.codeharness/workflows/default.yaml` is created from embedded template
**And** existing stack detection still works
**And** `--force` overwrites existing workflow files

### Story 2.5: Validate Command

As a developer,
I want `codeharness validate` to check YAML files against schemas,
So that I catch configuration errors before running.

**Acceptance Criteria:**

**Given** workflow and agent YAML files in the project
**When** `codeharness validate` runs
**Then** all YAML files are validated against their schemas
**And** errors report file path, line context, and specific violation
**And** exit code 0 on success, 1 on failure

---

## Epic 3: Agent Configuration System

9 embedded agents, custom agents, patching, config resolution chain.

### Story 3.1: Agent Config JSON Schema

As a developer,
I want a JSON schema defining valid agent configuration,
So that malformed agent configs are caught before dispatch.

**Acceptance Criteria:**

**Given** an agent YAML file
**When** validated against the schema
**Then** valid configs with name, role, persona, and optional personality.traits pass
**And** missing required fields are rejected
**And** traits outside 0-1 range are rejected
**And** schema file exists at src/schemas/agent.schema.json

### Story 3.2: Embedded Agent Templates

As a developer,
I want 9 agent YAML files shipped with codeharness,
So that the default workflow has agents to dispatch.

**Acceptance Criteria:**

**Given** codeharness is installed
**When** embedded agents are loaded from templates/agents/
**Then** 9 agents exist: dev, qa, architect, pm, sm, analyst, ux-designer, tech-writer, evaluator
**And** each has name, role, persona fields from BMAD definitions
**And** evaluator has anti-leniency principles and disallowedTools
**And** all 9 validate against the agent JSON schema
**And** BMAD agent configs are never modified

### Story 3.3: Agent Resolver Module

As a developer,
I want an agent-resolver that resolves configs through the patch chain,
So that customizations overlay cleanly on embedded defaults.

**Acceptance Criteria:**

**Given** an embedded agent and optional user/project patches
**When** `resolveAgent("dev")` is called
**Then** embedded config is loaded, user patch merged if exists, project patch merged on top
**And** resolved config is compiled into a Claude Code inline subagent definition
**And** resolution completes in <200ms
**And** missing patches silently skipped, malformed patches fail loud
**And** unit tests at 80%+ coverage

---

## Epic 4: Agent Dispatch & Session Management

Engine spawns Claude Code sessions via Agent SDK with session boundaries, trace IDs, source isolation.

### Story 4.1: Agent Dispatch Module — SDK Integration

As a developer,
I want an agent-dispatch module that spawns sessions via the Agent SDK,
So that agent execution is programmatic and reliable.

**Acceptance Criteria:**

**Given** a compiled subagent definition and a prompt
**When** `dispatchAgent()` is called
**Then** Agent SDK `query()` is invoked with bare: true
**And** function returns when session completes
**And** spawn completes in <5s excluding model response
**And** no child_process.spawn used for Claude CLI
**And** API limit, network, and binary-not-found errors handled gracefully

### Story 4.2: Session Boundary Management

As a developer,
I want session boundaries configurable per task,
So that context resets and continuity are controlled.

**Acceptance Criteria:**

**Given** a task with session: fresh
**When** dispatched
**Then** a new SDK query is created with no resume/continue
**And** given session: continue, previous session ID is passed via resume
**And** session IDs tracked in workflow-state

### Story 4.3: Trace ID Generation & Injection

As a developer,
I want trace IDs generated per iteration and injected into prompts,
So that agent activity correlates to observability data.

**Acceptance Criteria:**

**Given** an iteration starting
**When** a trace ID is generated
**Then** format is `ch-{runId}-{iteration}-{taskName}`
**And** injected into agent's system prompt via appendSystemPrompt
**And** recorded in workflow-state.yaml

### Story 4.4: Source Isolation Enforcement

As a developer,
I want source_access: false enforced via source-free workspace,
So that the evaluator cannot access implementation code.

**Acceptance Criteria:**

**Given** a task with source_access: false
**When** the agent is dispatched
**Then** temp directory created with only story files
**And** SDK cwd set to temp directory
**And** disallowedTools: [Edit, Write] set on subagent
**And** src/ not present in workspace

---

## Epic 5: Workflow Execution Engine

`codeharness run` executes workflows — per-story, per-run, loop blocks, finding injection, reads stories and issues.

### Story 5.1: Flow Execution — Sequential Steps

As a developer,
I want the engine to execute flow steps sequentially,
So that tasks run in defined order.

**Acceptance Criteria:**

**Given** a resolved workflow with flow: [implement, verify]
**When** `codeharness run` executes
**Then** per-story tasks run first (one per story/issue)
**And** per-run tasks run once after
**And** workflow-state updated after each task
**And** engine reads both sprint-status.yaml and issues.yaml

### Story 5.2: Flow Execution — Loop Blocks

As a developer,
I want loop: blocks to repeat until pass or circuit breaker,
So that retry cycles are automatic.

**Acceptance Criteria:**

**Given** flow with loop: [retry, verify]
**When** verify produces non-passing verdict
**Then** retry runs for failed stories only with findings injected
**And** verify re-runs entire artifact from scratch
**And** loop repeats until all pass or max iterations
**And** each iteration recorded in workflow-state

### Story 5.3: Crash Recovery & Resume

As a developer,
I want the engine to resume from last completed task after crash,
So that long-running executions don't lose progress.

**Acceptance Criteria:**

**Given** workflow-state shows tasks completed up to a checkpoint
**When** `codeharness run` or `--resume` starts
**Then** engine skips completed tasks, resumes from next
**And** no task executed twice
**And** 4+ hour executions don't degrade or leak

### Story 5.4: Run & Status Commands

As a developer,
I want `codeharness run` and `codeharness status` to work,
So that I can execute workflows and monitor progress.

**Acceptance Criteria:**

**Given** a project with resolved workflow and sprint-status.yaml
**When** `codeharness run` executes
**Then** workflow engine is invoked
**And** `codeharness status` shows iteration, stories, scores, circuit breaker, elapsed time
**And** status returns in <1s

---

## Epic 6: Blind Evaluator & Verification

Blind evaluator exercises artifact, produces JSON verdict, engine handles retry loop.

### Story 6.1: Evaluator Module — Workspace & Spawn

As a developer,
I want an evaluator module that sets up source-free workspace and spawns the evaluator,
So that verification is truly blind.

**Acceptance Criteria:**

**Given** all stories are implemented
**When** evaluator task runs
**Then** temp workspace created with AC files and Docker access, no source
**And** evaluator spawned via agent-dispatch with bare: true, source_access: false
**And** Docker lifecycle managed by engine
**And** if Docker not running, verdict is all UNKNOWN with finding
**And** timeout produces scored UNKNOWN, not fatal error

### Story 6.2: Evaluator Verdict JSON Schema & Parsing

As a developer,
I want the evaluator to produce structured JSON validated by schema,
So that every AC has status and evidence.

**Acceptance Criteria:**

**Given** evaluator completes its session
**When** output is parsed
**Then** conforms to verdict schema: verdict, score, findings with per-AC status and evidence
**And** invalid JSON triggers one retry, then all UNKNOWN
**And** schema at src/schemas/verdict.schema.json
**And** every PASS has non-empty evidence.commands_run

### Story 6.3: Evaluator Prompt Template

As a developer,
I want the evaluator agent YAML to include anti-leniency instructions,
So that the evaluator requires evidence for every verdict.

**Acceptance Criteria:**

**Given** evaluator loaded from templates/agents/evaluator.yaml
**When** compiled to subagent definition
**Then** prompt instructs: read ACs, independently test, evidence for every PASS, UNKNOWN if can't verify, never benefit of the doubt
**And** evaluator can query observability endpoints

---

## Epic 7: Circuit Breaker & Progress Detection

Score-based stagnation detection, halt, reporting, resume.

### Story 7.1: Score-Based Circuit Breaker Module

As a developer,
I want a circuit breaker that detects evaluator score stagnation,
So that the engine halts instead of burning tokens.

**Acceptance Criteria:**

**Given** evaluator scores across iterations
**When** `evaluateProgress()` called after each verify
**Then** stagnation detected when scores don't improve
**And** returns halt with remaining failures and score history
**And** evaluation in <100ms
**And** unit tests at 80%+ coverage

### Story 7.2: Resume After Circuit Breaker

As a developer,
I want to resume after circuit breaker halts,
So that I can apply manual fixes and re-run.

**Acceptance Criteria:**

**Given** circuit breaker has halted
**When** `codeharness run --resume` executes
**Then** engine reads state, resets circuit breaker for current iteration
**And** resumes from verify step
**And** previous findings available in state

---

## Epic 8: Issue Tracking & Retro Integration

`codeharness issue` CLI, retro auto-import, issues execute alongside stories.

### Story 8.1: Issue Tracker Module & CLI

As a developer,
I want to create, list, and manage issues via `codeharness issue`,
So that bugs and tech debt have a path to implementation.

**Acceptance Criteria:**

**Given** no issues.yaml exists
**When** `codeharness issue create "Fix Docker timeout" --priority high --source retro-sprint-1` runs
**Then** issues.yaml created with auto-generated id, title, source, priority, status: backlog
**And** `codeharness issue list` shows all issues
**And** `codeharness issue close issue-001` updates status to done
**And** same status values as sprint-status.yaml

### Story 8.2: Retro Finding Auto-Import

As a developer,
I want retro findings tagged as actionable to appear in issues.yaml,
So that action items don't rot in markdown.

**Acceptance Criteria:**

**Given** a retrospective file with actionable findings
**When** `codeharness retro-import` runs
**Then** actionable findings added to issues.yaml with retro source
**And** duplicate detection prevents re-importing
**And** non-actionable findings ignored

---

## Epic 9: Workflow Configuration & Patching

Custom workflows or patches at project/user level.

### Story 9.1: Workflow Patch Resolution

As a developer,
I want to patch the default workflow via a patch file,
So that I can customize execution without replacing the entire workflow.

**Acceptance Criteria:**

**Given** embedded default workflow and project-level patch with extends: embedded://default
**When** workflow parser resolves
**Then** structured overrides merged onto embedded base
**And** replace overrides replace entire sections
**And** missing patches silently skipped
**And** malformed patches fail loud
**And** user-level patches applied before project-level

### Story 9.2: Custom Workflow Creation

As a developer,
I want to create a custom workflow YAML in my project,
So that I can define non-standard execution flows.

**Acceptance Criteria:**

**Given** custom workflow at .codeharness/workflows/my-workflow.yaml
**When** `codeharness run --workflow my-workflow` executes
**Then** custom workflow loaded, validated, and executed
**And** must pass JSON schema validation
**And** agent references resolve through same config chain
