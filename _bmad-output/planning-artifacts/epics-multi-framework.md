---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - prd.md (multi-framework orchestration PRD, 2026-04-03)
  - architecture-multi-framework.md (multi-framework architecture, 2026-04-03)
---

# codeharness - Epic Breakdown (Multi-Framework Orchestration)

## Overview

This document provides the complete epic and story breakdown for codeharness multi-framework orchestration, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: System can register and resolve agent drivers by name (claude-code, codex, opencode)
- FR2: System can detect whether a driver's CLI binary is installed and accessible on the system PATH
- FR3: System can verify a driver's authentication status before task dispatch
- FR4: System can report missing or unauthenticated drivers with install/auth instructions at workflow start
- FR5: System can spawn an agent process via the appropriate driver's CLI invocation
- FR6: System can terminate a running driver process on task timeout, cancellation, or circuit breaker
- FR7: Each driver can parse its framework's CLI output into the common StreamEvent protocol
- FR8: System can capture cost information from driver output and normalize to cost_usd
- FR9: System can classify driver errors into standard categories (RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN)
- FR10: System can detect and report when a driver's output format is unparseable
- FR11: User can specify a driver field per task in workflow YAML (optional, defaults to claude-code)
- FR12: User can specify a model field per task in workflow YAML (optional, overrides agent default)
- FR13: System can resolve the effective model for a task via the resolution chain: task model → agent model → driver default
- FR14: System can validate workflow YAML referential integrity — all referenced drivers exist, all referenced agents exist
- FR15: System can load existing workflows without driver/model fields with full backward compatibility
- FR16: System can execute a workflow where consecutive tasks use different drivers
- FR17: System can serialize a task's output contract to a structured JSON file after task completion
- FR18: System can load a previous task's output contract and inject it as context into the next task's prompt
- FR19: System can pass acceptance criteria, changed file lists, and test results across framework boundaries via output contracts
- FR20: System can execute verification tasks on a different framework than implementation tasks within the same story
- FR21: User can configure gstack skills to load within claude-code driver sessions via workflow or agent config
- FR22: User can configure omo agents to load within opencode driver sessions via workflow or agent config
- FR23: System can pass plugin-specific configuration to the driver's CLI invocation
- FR24: System can render a schematic workflow graph in the Ink TUI showing all tasks as nodes with directional flow
- FR25: System can highlight the currently executing task node in the workflow graph
- FR26: System can display the driver name (framework label) under each task node in the workflow graph
- FR27: System can display accumulated cost and elapsed time per completed task node
- FR28: System can render loop blocks in the workflow graph with visual grouping and iteration counter
- FR29: System can update the workflow graph position within 500ms of a task transition
- FR30: System can show task completion status (checkmark, spinner, pending) per node in the workflow graph
- FR31: System can display stream events from any driver in the activity section
- FR32: System can display the active driver name alongside tool activity
- FR33: System can display per-story cost breakdown by driver in the story breakdown section
- FR34: System can accumulate cost per driver across a workflow run
- FR35: System can display total cost per driver in the TUI
- FR36: System can suggest a cheaper driver for tasks that don't require the capabilities of the configured driver
- FR37: System can document each driver's capabilities in a queryable format
- FR38: System can warn at workflow start if a task's requirements conflict with the driver's capabilities

### Non-Functional Requirements

- NFR1: Driver spawn (CLI cold start to first output) must complete within 3 seconds
- NFR2: TUI workflow graph position update must render within 500ms of task transition
- NFR3: Stream event parsing must keep up with driver output rate — no dropped events
- NFR4: Output contract serialization/deserialization must complete within 1 second for contracts up to 1MB
- NFR5: TUI render loop must maintain 15 FPS maximum without CPU spikes
- NFR6: Driver health check (all drivers in workflow) must complete within 5 seconds at workflow start
- NFR7: Codex driver must work with Codex CLI versions pinned in package.json
- NFR8: OpenCode driver must work with OpenCode CLI versions pinned in package.json
- NFR9: Claude Code driver must maintain compatibility with Agent SDK pinned version
- NFR10: Output contract JSON format must be stable across driver versions
- NFR11: Workflow YAML schema changes must be backward compatible
- NFR12: Plugin ecosystem integration must not require modifications to the plugins themselves
- NFR13: If a driver process crashes mid-task, the engine must detect it within 5 seconds
- NFR14: If a driver's CLI output format is unparseable, the engine must surface the raw output for debugging
- NFR15: Output contract files must survive engine crashes — written atomically
- NFR16: Driver timeout must be configurable per task (default: 30 minutes)
- NFR17: TUI must remain responsive during driver failures
- NFR18: Workflow engine must be idempotent for re-runs — resume from last completed task

### Additional Requirements (from Architecture)

- Existing AgentDriver interface must be refactored to use AsyncIterable<StreamEvent> instead of spawn()/AgentProcess
- Claude Code driver refactored from existing agent-dispatch.ts into driver class
- Driver factory pattern with explicit registration (no auto-discovery)
- Output contracts stored in .codeharness/contracts/{taskName}-{storyId}.json with atomic writes
- Model resolution chain: task → agent → driver default (3-level cascade)
- WorkflowGraph Ink component inserted between Header and StoryBreakdown
- Plugin pass-through via plugins array in workflow YAML task definition
- All drivers must follow identical class structure per architecture implementation patterns
- Fixture-based testing required for all drivers (real CLI output samples)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 1 | Register and resolve drivers by name |
| FR2 | Epic 3 | Detect CLI binary on PATH |
| FR3 | Epic 3 | Verify driver auth status |
| FR4 | Epic 3 | Report missing drivers with install instructions |
| FR5 | Epic 1, 3 | Spawn agent process via driver CLI |
| FR6 | Epic 1 | Terminate driver on timeout/cancellation |
| FR7 | Epic 1, 3 | Parse CLI output to StreamEvent |
| FR8 | Epic 1, 3 | Capture and normalize cost_usd |
| FR9 | Epic 1, 3 | Classify driver errors into standard categories |
| FR10 | Epic 1, 3 | Detect and report unparseable output |
| FR11 | Epic 2 | Per-task driver field in workflow YAML |
| FR12 | Epic 2 | Per-task model field in workflow YAML |
| FR13 | Epic 1, 2 | Model resolution chain |
| FR14 | Epic 2 | Workflow YAML referential integrity |
| FR15 | Epic 1, 2 | Backward compatibility for old workflows |
| FR16 | Epic 4 | Execute workflow with different drivers per task |
| FR17 | Epic 4 | Serialize output contract to JSON |
| FR18 | Epic 4 | Load and inject output contract into next task |
| FR19 | Epic 4 | Pass ACs, files, tests across framework boundaries |
| FR20 | Epic 4 | Verification on different framework than implementation |
| FR21 | Epic 6 | Configure gstack skills in claude-code sessions |
| FR22 | Epic 6 | Configure omo agents in opencode sessions |
| FR23 | Epic 6 | Pass plugin config to driver CLI invocation |
| FR24 | Epic 5 | Render workflow graph in TUI |
| FR25 | Epic 5 | Highlight current task node |
| FR26 | Epic 5 | Display driver name under each node |
| FR27 | Epic 5 | Display cost/time per completed node |
| FR28 | Epic 5 | Render loop blocks with iteration counter |
| FR29 | Epic 5 | Update position within 500ms |
| FR30 | Epic 5 | Show completion status per node |
| FR31 | Epic 5 | Display stream events from any driver |
| FR32 | Epic 5 | Display active driver name in activity |
| FR33 | Epic 5 | Per-story cost breakdown by driver |
| FR34 | Epic 6 | Accumulate cost per driver |
| FR35 | Epic 6 | Display total cost per driver in TUI |
| FR36 | Epic 6 | Suggest cheaper driver (routing hint) |
| FR37 | Epic 6 | Driver capabilities in queryable format |
| FR38 | Epic 6 | Warn on task/driver capability conflicts |

## Epic List

### Epic 1: Driver Interface & Claude Code Refactor
Users can run workflows using the formalized driver abstraction, with the existing Claude Code Agent SDK refactored into a proper driver class. Everything works exactly as before, but through the new AgentDriver interface.
**FRs covered:** FR1, FR5, FR6, FR7, FR8, FR9, FR10, FR13, FR15

### Epic 2: Workflow Schema & Model Resolution
Users can configure driver and model per task in workflow YAML. The workflow engine resolves models via the 3-level cascade and validates referential integrity. Backward compatible.
**FRs covered:** FR11, FR12, FR13, FR14, FR15

### Epic 3: Codex & OpenCode Drivers
Users can dispatch tasks to Codex CLI and OpenCode CLI. Both drivers implement AgentDriver, parse CLI output to StreamEvent, and handle health checks.
**FRs covered:** FR2, FR3, FR4, FR5, FR7, FR8, FR9, FR10

### Epic 4: Cross-Framework Execution & Output Contracts
Users can run workflows where consecutive tasks use different frameworks, with output contracts passing context between them. Cross-framework verification works end-to-end.
**FRs covered:** FR16, FR17, FR18, FR19, FR20

### Epic 5: TUI Workflow Visualization
Users can see the workflow graph in the TUI with current position, driver labels, cost/time per node, and loop counters. Activity display shows which driver is active.
**FRs covered:** FR24, FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33

### Epic 6: Plugin Ecosystem & Cost Intelligence
Users can configure gstack/omo plugins per task, see cost breakdowns per driver, and get routing hints for cheaper alternatives. Driver capability matrix warns about conflicts.
**FRs covered:** FR21, FR22, FR23, FR34, FR35, FR36, FR37, FR38

## Epic 1: Driver Interface & Claude Code Refactor

Users can run workflows using the formalized driver abstraction, with the existing Claude Code Agent SDK refactored into a proper driver class.

### Story 1.1: AgentDriver Interface & Types

As a developer,
I want a formalized AgentDriver interface with DriverHealth, DispatchOpts, and StreamEvent types,
So that all drivers implement a consistent contract.

**Acceptance Criteria:**

**Given** the existing `src/lib/agents/types.ts`
**When** the interface is refactored
**Then** `AgentDriver` has `name`, `defaultModel`, `capabilities`, `healthCheck()`, `dispatch()`, `getLastCost()` methods
**And** `DispatchOpts` includes `prompt`, `model`, `cwd`, `sourceAccess`, `plugins`, `timeout`, `outputContract`
**And** `DriverHealth` includes `available`, `authenticated`, `version`, `error`
**And** `dispatch()` returns `AsyncIterable<StreamEvent>`
**And** all existing StreamEvent types are preserved

### Story 1.2: Driver Factory & Registry

As a developer,
I want a driver factory that registers and resolves drivers by name,
So that the workflow engine can get any driver without knowing its implementation.

**Acceptance Criteria:**

**Given** a new `src/lib/agents/drivers/factory.ts`
**When** `getDriver('claude-code')` is called
**Then** it returns the registered ClaudeCodeDriver instance
**And** `getDriver('unknown')` throws a descriptive error
**And** `listDrivers()` returns all registered driver names
**And** drivers are registered explicitly (no auto-discovery)

### Story 1.3: Claude Code Driver Extraction

As a developer,
I want the existing Agent SDK dispatch logic extracted into a ClaudeCodeDriver class,
So that Claude Code works through the same driver interface as future drivers.

**Acceptance Criteria:**

**Given** the existing `agent-dispatch.ts` dispatch logic
**When** refactored into `src/lib/agents/drivers/claude-code.ts`
**Then** `ClaudeCodeDriver` implements `AgentDriver` interface
**And** `dispatch()` calls Agent SDK `query()` and yields `StreamEvent` objects
**And** `healthCheck()` returns `{ available: true, authenticated: true }`
**And** `getLastCost()` returns cost from the last Agent SDK dispatch
**And** error classification maps Agent SDK errors to RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN
**And** existing workflow execution produces identical results through the driver

### Story 1.4: Model Resolution Module

As a developer,
I want a model resolver that cascades task → agent → driver defaults,
So that the effective model for any task dispatch is deterministic.

**Acceptance Criteria:**

**Given** a new `src/lib/agents/model-resolver.ts`
**When** `resolveModel(task, agent, driver)` is called
**Then** task-level model takes highest priority
**And** agent-level model is used if task has no model
**And** driver default model is used if neither task nor agent specify one
**And** the resolved model is returned as a string
**And** backward compatible with existing workflows that have no model field

### Story 1.5: Workflow Engine Driver Integration

As a developer,
I want the workflow engine to dispatch tasks through the driver factory,
So that switching drivers is a configuration change, not a code change.

**Acceptance Criteria:**

**Given** the existing `workflow-engine.ts`
**When** executing a workflow task
**Then** the engine resolves the driver from the factory (defaulting to `claude-code`)
**And** the engine calls `driver.dispatch(opts)` instead of `dispatchAgent()` directly
**And** the engine consumes `AsyncIterable<StreamEvent>` from the driver
**And** existing workflows without `driver` field work identically
**And** driver process termination works on timeout/cancellation

## Epic 2: Workflow Schema & Model Resolution

Users can configure driver and model per task in workflow YAML with backward compatibility.

### Story 2.1: Workflow Schema Extension

As a user,
I want to specify `driver` and `model` per task in my workflow YAML,
So that I can control which framework and model each task uses.

**Acceptance Criteria:**

**Given** `src/schemas/workflow.schema.json`
**When** updated with `driver`, `model`, and `plugins` fields on task definition
**Then** `driver` is optional with default `claude-code`
**And** `model` is optional with no default (falls through to resolution chain)
**And** `plugins` is optional array of strings
**And** existing workflows without these fields validate successfully
**And** `workflow-parser.ts` parses the new fields from YAML

### Story 2.2: Workflow Referential Integrity Validation

As a user,
I want the workflow parser to validate that all referenced drivers and agents exist,
So that I get clear errors before execution if my config is wrong.

**Acceptance Criteria:**

**Given** a workflow YAML with `driver: codex` on a task
**When** the workflow is parsed and validated
**Then** the parser checks that `codex` is a registered driver name
**And** the parser checks that all referenced agent names exist in agent templates
**And** validation errors include the specific field, task name, and suggested fix
**And** validation runs at parse time before any task dispatch

## Epic 3: Codex & OpenCode Drivers

Users can dispatch tasks to Codex CLI and OpenCode CLI with full health checking.

### Story 3.1: Codex Driver Implementation

As a user,
I want to run tasks on OpenAI Codex by setting `driver: codex`,
So that I can use Codex models for implementation or verification.

**Acceptance Criteria:**

**Given** a new `src/lib/agents/drivers/codex.ts`
**When** `dispatch()` is called
**Then** the driver spawns `codex` CLI via `child_process.spawn`
**And** stdout is parsed line-by-line into `StreamEvent` objects
**And** unparseable lines are logged at debug level and skipped
**And** a `result` event is always yielded at the end (even on error)
**And** cost is captured from CLI output or set to `null`
**And** `healthCheck()` checks `which codex`, version, and auth status
**And** missing binary returns `{ available: false, error: "codex CLI not found. Install: npm install -g @openai/codex" }`
**And** fixture-based tests exist in `test/fixtures/drivers/codex/`

### Story 3.2: OpenCode Driver Implementation

As a user,
I want to run tasks on OpenCode by setting `driver: opencode`,
So that I can use OpenCode's multi-model support for any task.

**Acceptance Criteria:**

**Given** a new `src/lib/agents/drivers/opencode.ts`
**When** `dispatch()` is called
**Then** the driver spawns `opencode` CLI via `child_process.spawn`
**And** stdout is parsed line-by-line into `StreamEvent` objects
**And** unparseable lines are logged at debug level and skipped
**And** a `result` event is always yielded at the end (even on error)
**And** cost is captured from CLI output or set to `null`
**And** `healthCheck()` checks `which opencode`, version, and auth status
**And** missing binary returns `{ available: false, error: "opencode not found. Install: https://opencode.ai" }`
**And** fixture-based tests exist in `test/fixtures/drivers/opencode/`

### Story 3.3: Driver Health Check at Workflow Start

As a user,
I want all referenced drivers health-checked before any task executes,
So that I get immediate feedback if a CLI is missing or unauthenticated.

**Acceptance Criteria:**

**Given** a workflow referencing drivers `claude-code` and `codex`
**When** `codeharness run` starts
**Then** the engine calls `healthCheck()` on every unique driver in the workflow
**And** all health checks complete within 5 seconds total (NFR6)
**And** if any driver is unavailable, the run aborts with a clear error listing all failing drivers
**And** if all drivers are healthy, the run proceeds normally

## Epic 4: Cross-Framework Execution & Output Contracts

Users can run workflows where consecutive tasks use different frameworks with data passing between them.

### Story 4.1: Output Contract Schema & Serialization

As a developer,
I want output contracts serialized as JSON files with atomic writes,
So that task results survive crashes and can be read by the next task.

**Acceptance Criteria:**

**Given** a new `src/lib/agents/output-contract.ts` and `src/schemas/output-contract.schema.json`
**When** a task completes
**Then** the engine writes a contract to `.codeharness/contracts/{taskName}-{storyId}.json`
**And** the write is atomic (write to `.tmp`, then rename)
**And** the contract includes version, taskName, storyId, driver, model, timestamp, cost_usd, duration_ms, changedFiles, testResults, output, acceptanceCriteria
**And** fields that aren't available are set to `null`
**And** serialization/deserialization completes within 1 second for contracts up to 1MB (NFR4)

### Story 4.2: Output Contract Prompt Injection

As a developer,
I want the previous task's output contract injected into the next task's prompt,
So that cross-framework tasks have context from the previous step.

**Acceptance Criteria:**

**Given** a completed task with a written output contract
**When** the next task in the workflow starts
**Then** the engine reads the previous contract and formats it as structured prompt context
**And** the prompt includes changed files, test results, output summary, AC statuses
**And** the injection is framework-agnostic
**And** if no previous contract exists (first task), no injection occurs

### Story 4.3: Cross-Framework Workflow Execution

As a user,
I want to run a workflow where implement uses claude-code and verify uses codex,
So that verification is structurally independent from implementation.

**Acceptance Criteria:**

**Given** a workflow with `implement: { driver: claude-code }` and `verify: { driver: codex }`
**When** `codeharness run` executes
**Then** the implement task runs via Claude Code driver
**And** on completion, an output contract is written
**And** the verify task starts via Codex driver with the output contract injected
**And** loop blocks correctly alternate between drivers
**And** the workflow engine resumes from the last completed task on re-run (NFR18)

## Epic 5: TUI Workflow Visualization

Users can see the workflow graph in the TUI with current position, driver labels, cost/time, and loop counters.

### Story 5.1: WorkflowGraph Component

As a user,
I want to see a schematic workflow graph in the TUI,
So that I can see all tasks, their order, and loop blocks at a glance.

**Acceptance Criteria:**

**Given** a new `src/lib/ink-workflow.tsx`
**When** a workflow is running
**Then** the TUI renders a workflow graph between Header and StoryBreakdown
**And** each task is shown as a node with its name
**And** nodes are connected with `→` arrows
**And** loop blocks are rendered as `loop(N)[ task1 → task2 ]` with iteration count
**And** the component receives `flow`, `currentTask`, and `taskStates` as props

### Story 5.2: Task Status & Driver Labels

As a user,
I want each workflow node to show its status, driver, and cost,
So that I can see what's running, on which framework, and what it costs.

**Acceptance Criteria:**

**Given** the WorkflowGraph component
**When** a task is pending → dim text
**And** when active → cyan + spinner
**And** when done → green ✓
**And** when failed → red ✗
**And** the driver name is displayed dimmed below each node
**And** cost and elapsed time are displayed below driver name for completed nodes
**And** the graph updates within 500ms of task transition (NFR2)

### Story 5.3: Activity Display Driver Integration

As a user,
I want to see which driver is active in the tool activity section,
So that I know which framework is executing the current tool call.

**Acceptance Criteria:**

**Given** the existing activity display components
**When** stream events arrive from any driver
**Then** the active driver name is shown alongside tool activity
**And** per-story cost breakdown shows cost by driver
**And** the TUI remains responsive during driver failures (NFR17)

## Epic 6: Plugin Ecosystem & Cost Intelligence

Users can configure gstack/omo plugins, track costs per driver, and get capability warnings.

### Story 6.1: Plugin Pass-Through Configuration

As a user,
I want to specify plugins per task in workflow YAML,
So that gstack skills load in Claude Code sessions and omo agents load in OpenCode sessions.

**Acceptance Criteria:**

**Given** a workflow task with `plugins: ['gstack']` on a claude-code driver
**When** the driver dispatches the task
**Then** the driver translates the plugin config to framework-specific CLI flags
**And** codex driver warns and ignores unsupported plugins
**And** plugin configuration does not require modifying the plugins themselves (NFR12)

### Story 6.2: Cost Tracking Per Driver

As a user,
I want to see accumulated cost per driver across a workflow run,
So that I can compare framework costs and optimize.

**Acceptance Criteria:**

**Given** a multi-driver workflow run
**When** tasks complete on different drivers
**Then** the engine accumulates cost per driver
**And** total cost per driver is displayed in the TUI
**And** drivers that don't report cost show `null` (not $0)

### Story 6.3: Driver Capability Matrix & Routing Hints

As a user,
I want the system to warn me about capability conflicts and suggest cheaper alternatives,
So that I avoid misconfigurations and optimize costs.

**Acceptance Criteria:**

**Given** driver capabilities defined in `factory.ts`
**When** a workflow starts
**Then** the engine warns if a task's requirements conflict with the driver's capabilities
**And** `codeharness drivers` CLI command outputs capabilities as structured JSON
**And** when a task's driver costs >2x the cheapest capable alternative, an advisory message is displayed
