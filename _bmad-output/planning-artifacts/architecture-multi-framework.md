---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-03'
inputDocuments:
  - prd.md (multi-framework orchestration PRD, 2026-04-03)
  - architecture.md (existing v1 architecture, brownfield context)
  - prd-validation-report.md (validation report, 4.5/5 Pass)
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-04-03'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
38 FRs across 9 capability areas. The core is a driver abstraction layer (FR1-FR10) that normalizes 3 agent framework CLIs into a common `AgentDriver` interface with `StreamEvent` output. The workflow engine gains per-task `driver` and `model` fields (FR11-FR15). Cross-framework task execution uses explicit output contracts serialized as JSON (FR16-FR20). The Ink TUI gains a workflow graph component (FR24-FR30). Plugin ecosystem integration (gstack/omo) passes config to parent driver CLIs (FR21-FR23).

**Non-Functional Requirements:**
18 NFRs across performance (driver spawn <3s, TUI update <500ms, health check <5s), integration (pinned CLI versions, backward-compatible schema, no plugin modifications), and reliability (crash detection <5s, atomic contract writes, idempotent re-runs). Single-user local CLI — no scalability or availability requirements.

**Scale & Complexity:**

- Primary domain: Node.js CLI extending existing Commander.js architecture
- Complexity level: Medium — one new architectural layer (drivers) on proven foundation
- Estimated architectural components: ~8 new (3 drivers, 1 driver factory, 1 output contract module, 1 TUI workflow component, workflow schema extension, model resolver)

### Technical Constraints & Dependencies

- **Existing architecture** — 10 decisions from v1 architecture remain valid: CLI↔Plugin boundary, state management, beads integration, template embedding, verification pipeline. This PRD extends, not replaces.
- **Agent SDK** — Claude Code Agent SDK (`@anthropic-ai/claude-agent-sdk`) already in use for in-process dispatch. Stays as the claude-code driver implementation.
- **Codex CLI** — External binary (`codex`). Output format must be reverse-engineered from real CLI output. Auth via OpenAI API key or ChatGPT account.
- **OpenCode CLI** — External binary (`opencode`). Go-based. Output format must be reverse-engineered. Supports 75+ models with per-provider keys.
- **No programmatic SDK** — Neither Codex nor OpenCode expose a dispatch SDK. All integration is CLI wrapping via `child_process.spawn` with stdout/stderr parsing.
- **Ink/React TUI** — Existing TUI uses Ink 6 with React 19. New workflow graph component must fit the existing component architecture and 15 FPS render loop.
- **Workflow YAML schema** — Existing `workflow.schema.json` must be extended (not replaced) with `driver` and `model` fields. JSON Schema backward compatibility required.

### Cross-Cutting Concerns Identified

1. **Driver lifecycle management** — Spawning, monitoring, timeout, termination, crash recovery applies to all drivers. Must be uniform regardless of whether the driver is in-process (Agent SDK) or CLI-wrapped (Codex, OpenCode).
2. **Stream event normalization** — Every driver must produce `StreamEvent` objects. The TUI, cost tracker, and workflow engine all consume these. A driver that drops events or misparses output breaks everything downstream.
3. **Output contract integrity** — Cross-framework task execution depends on output contracts being complete, correctly serialized, and crash-safe. A corrupted contract means the next task gets garbage context.
4. **Model resolution cascade** — Task model → agent model → driver default must be consistent across workflow parsing, driver dispatch, and TUI display. A disagreement means the TUI shows one model while the driver uses another.

## Starter Template Evaluation

### Primary Technology Domain

Node.js CLI tool — already built and running. TypeScript + tsup + Commander.js + Vitest. Ink 6 + React 19 for TUI. Published on npm as `codeharness`.

### Starter Options Considered

**N/A — Brownfield project.** The existing technology stack is established:

- TypeScript strict mode, ESM modules
- tsup for build → `dist/`
- Commander.js for CLI parsing
- Vitest + c8 for testing/coverage
- BATS for bash integration tests
- Ink 6 + React 19 for terminal UI
- Claude Code Agent SDK for agent dispatch

### Selected Starter: Existing codebase

**Rationale:** No new project initialization needed. The multi-framework feature adds files to `src/lib/agents/drivers/`, extends `src/schemas/workflow.schema.json`, and adds Ink components to `src/lib/ink-*.tsx`. All within the established architecture.

**New modules to add:**

```
src/lib/agents/drivers/
├── claude-code.ts      # Refactor existing dispatchAgent() into driver interface
├── codex.ts            # New — wraps codex CLI
├── opencode.ts         # New — wraps opencode CLI
├── factory.ts          # New — driver registry and resolution
└── types.ts            # Existing — extend AgentDriver interface

src/lib/
├── model-resolver.ts   # New — task → agent → driver default cascade
├── output-contract.ts  # New — serialize/deserialize cross-framework contracts
└── ink-workflow.tsx     # New — TUI workflow graph component
```

**Note:** No project initialization story needed. First story is driver interface formalization.

## Core Architectural Decisions

### Decision 1: Driver Interface Design

**Decision:** Refactor `AgentDriver` interface to support both in-process (Agent SDK) and CLI-wrapped drivers uniformly. `dispatch()` returns `AsyncIterable<StreamEvent>` instead of `spawn()` returning `AgentProcess`.

**Interface:**

```typescript
export interface AgentDriver {
  readonly name: string;
  readonly defaultModel: string;
  healthCheck(): Promise<DriverHealth>;
  dispatch(opts: DispatchOpts): AsyncIterable<StreamEvent>;
  getLastCost(): number | null;
}

interface DispatchOpts {
  prompt: string;
  model: string;
  cwd: string;
  sourceAccess: boolean;
  plugins?: string[];
  timeout?: number;
  outputContract?: OutputContract;
}
```

**Rationale:** The workflow engine and TUI consume `StreamEvent` regardless of source. `AsyncIterable` unifies in-process (Agent SDK yields directly) and CLI-wrapped (stdout parsed into events) behind the same consumer interface. Adding new drivers requires implementing `dispatch()` and returning events — no engine changes.

### Decision 2: CLI-Wrapping Strategy

**Decision:** CLI drivers use `child_process.spawn` with stdout line parsing. No PTY allocation. JSON output mode preferred where available.

**Pattern:** Spawn CLI binary with `stdio: ['ignore', 'pipe', 'pipe']`. Parse stdout line-by-line. Each line parsed into `StreamEvent` or null. Yield non-null events from `dispatch()`.

**Health check:** Three-step: (1) `which <binary>` to check installation, (2) version/auth check command, (3) return `{ available, authenticated, version, error? }`.

**Crash detection:** Monitor `proc.exitCode` via Node.js `close` event. Non-zero exit yields `result` event with error classification. Meets NFR13 (<5s detection) — `close` fires immediately.

**Rationale:** No PTY avoids terminal emulation complexity. JSON output mode gives structured data. Line-by-line parsing is simple, streamable, and testable with fixture files.

### Decision 3: Output Contract Format

**Decision:** JSON files in `.codeharness/contracts/{taskName}-{storyId}.json`. Written atomically (write to `.tmp`, rename). Read by next task's prompt injection.

**Contract structure:**
```json
{
  "version": 1,
  "taskName": "implement",
  "storyId": "3-1",
  "driver": "claude-code",
  "model": "claude-opus-4",
  "timestamp": "2026-04-03T10:30:00Z",
  "cost_usd": 0.42,
  "duration_ms": 240000,
  "changedFiles": ["src/api/users.ts", "src/api/users.test.ts"],
  "testResults": { "passed": 12, "failed": 0, "coverage": 98.5 },
  "output": "Implementation complete...",
  "acceptanceCriteria": [
    { "id": "AC1", "description": "User can register", "status": "implemented" }
  ]
}
```

**Injection:** Workflow engine reads contract, appends structured summary to next task's prompt as context.

**Rationale:** JSON is universal across drivers. Atomic writes (NFR15) prevent corruption on crash. Version field allows format evolution. Contracts are debuggable — plain files on disk.

### Decision 4: Model Resolution

**Decision:** Three-level cascade resolved at dispatch time by `model-resolver.ts`.

**Resolution order:**
1. Task-level `model` in workflow YAML (highest priority)
2. Agent-level `model` in agent YAML
3. Driver default model (hard-coded per driver)

**Driver defaults:**
- `claude-code`: `claude-sonnet-4-20250514`
- `codex`: `codex-mini`
- `opencode`: inherits from OpenCode's own config

**Implementation:** `resolveModel(task, agent, driver) → task.model ?? agent.model ?? driver.defaultModel`

**Rationale:** Simple, deterministic, debuggable. Resolved model is logged and displayed in TUI. No magic, no indirection.

### Decision 5: TUI Workflow Graph Component

**Decision:** New `WorkflowGraph` Ink component inserted between Header and StoryBreakdown. Renders a single-line flow with status indicators, driver labels, and cost/time per node.

**Rendering format:**
```
━━━ Workflow: story 3-1 ━━━━━━━━━━━━━━━━━━━━━━━━━
  implement ✓  →  verify ◆  →  loop(1)[ retry → verify ]
  claude-code     codex
  $0.42 / 4m      ... / 2m
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Status indicators:** pending (dim), active (cyan + spinner), done (green ✓), failed (red ✗). Loop blocks show iteration count.

**Rationale:** Fits existing Ink component pattern. Single-line flow is readable for workflows up to ~5 tasks. Driver and cost info below each node gives full visibility at a glance.

### Decision 6: Plugin Ecosystem Pass-Through

**Decision:** Workflow YAML tasks specify a `plugins` array. Drivers translate to framework-specific CLI flags.

**YAML:** `plugins: ['gstack']` on a claude-code task. `plugins: ['omo']` on an opencode task.

**Driver translation:**
- `claude-code`: `plugins` → Agent SDK plugin options or `--plugin` flag
- `opencode`: `plugins` → `--plugin` flag
- `codex`: plugins not supported → warn and ignore

**Rationale:** Declarative config in YAML. Drivers handle translation. No framework-specific knowledge leaks into the workflow engine.

## Implementation Patterns & Consistency Rules

### Critical Conflict Points

5 areas where AI agents implementing different drivers could diverge:

1. Driver file structure and exports
2. StreamEvent production from different CLI outputs
3. Error classification from framework-specific errors
4. Output contract population from different agent outputs
5. Health check implementation per driver

### Driver Implementation Pattern

**Every driver MUST follow this structure:**

```typescript
// src/lib/agents/drivers/{name}.ts
import type { AgentDriver, DispatchOpts, StreamEvent, DriverHealth } from './types.js';

export class CodexDriver implements AgentDriver {
  readonly name = 'codex';
  readonly defaultModel = 'codex-mini';
  private lastCost: number | null = null;

  async healthCheck(): Promise<DriverHealth> { /* ... */ }
  async *dispatch(opts: DispatchOpts): AsyncIterable<StreamEvent> { /* ... */ }
  getLastCost(): number | null { return this.lastCost; }
}
```

**Rules:**
- One file per driver, named `{driver-name}.ts`
- Class name: `{DriverName}Driver` (PascalCase)
- Export the class as named export
- Register in `factory.ts` — never auto-discover
- Driver MUST be stateless between dispatches (except `lastCost`)

### StreamEvent Production Pattern

**All drivers MUST produce events in this order for a successful dispatch:**

1. Zero or more `tool-start` → `tool-input` → `tool-complete` sequences
2. Zero or more `text` events (interleaved with tool sequences)
3. Zero or more `retry` events (if API retries occur)
4. Exactly one `result` event at the end (with cost_usd and sessionId)

**If the driver cannot map a CLI output line to a StreamEvent, it MUST:**
- Log the unparseable line at debug level
- Skip it (yield nothing)
- Never yield a malformed event
- Never throw — unparseable lines are expected during format discovery

**Cost reporting:**
- If the CLI reports cost → set `result.cost_usd`
- If the CLI does not report cost → set `result.cost_usd = null` (not 0, not undefined)

### Error Classification Pattern

**All drivers MUST classify errors into exactly these categories:**

```typescript
type ErrorCategory = 'RATE_LIMIT' | 'NETWORK' | 'AUTH' | 'TIMEOUT' | 'UNKNOWN';
```

**Classification rules (in priority order):**
1. HTTP 429 or "rate limit" in message → `RATE_LIMIT`
2. ECONNREFUSED, ETIMEDOUT, ENOTFOUND → `NETWORK`
3. HTTP 401/403 or "unauthorized"/"forbidden" → `AUTH`
4. Process killed by timeout → `TIMEOUT`
5. Everything else → `UNKNOWN`

**Driver MUST NOT invent new categories.**

### Output Contract Population Pattern

**After each task dispatch, the workflow engine populates an output contract. Drivers MUST:**

- Set `changedFiles` from file modification events (tool-complete for Write/Edit tools)
- Set `testResults` from parsed test output (if detectable) or `null`
- Set `output` as the agent's final text response
- Set `cost_usd` from `getLastCost()`
- Never fabricate data — if information isn't available, set `null`

### Health Check Pattern

**All drivers MUST implement:**

```typescript
interface DriverHealth {
  available: boolean;     // CLI binary found on PATH
  authenticated: boolean; // Auth check passed (or N/A)
  version: string | null; // CLI version string
  error?: string;         // Human-readable error if !available || !authenticated
}
```

**Check sequence:** (1) `which {binary}`, (2) `{binary} --version`, (3) framework-specific auth check.

**If binary not found:** Return with `error` containing install instructions.

### Testing Pattern for Drivers

**Every driver MUST have:**
- Unit tests with real CLI output fixtures in `test/fixtures/drivers/{name}/`
- Test that `dispatch()` produces correct `StreamEvent` sequence from fixture
- Test that `healthCheck()` handles binary-not-found gracefully
- Test that error classification works for framework-specific errors

**Anti-pattern:** Never mock `child_process.spawn`. Mock at the line-reader level — feed fixture lines to `parseLine()`.

### Enforcement Guidelines

**Code review checklist for new drivers:**
1. Class implements `AgentDriver` interface? ✓
2. Registered in `factory.ts`? ✓
3. `dispatch()` yields events in correct order? ✓
4. `result` event always emitted (even on error)? ✓
5. Error classification uses standard categories? ✓
6. Fixture-based tests exist? ✓

## Project Structure & Boundaries

### New Files (Multi-Framework Extension)

```
src/lib/agents/
├── drivers/
│   ├── types.ts              # Extended AgentDriver interface, DispatchOpts, DriverHealth
│   ├── factory.ts            # NEW — driver registry, getDriver(name), listDrivers()
│   ├── claude-code.ts        # REFACTOR — extract from agent-dispatch.ts into driver class
│   ├── codex.ts              # NEW — Codex CLI wrapper driver
│   └── opencode.ts           # NEW — OpenCode CLI wrapper driver
├── model-resolver.ts         # NEW — task → agent → driver default cascade
├── output-contract.ts        # NEW — serialize/deserialize, atomic write, prompt injection
└── stream-parser.ts          # EXISTING — shared line parsing utilities

src/lib/
├── workflow-parser.ts        # MODIFY — add driver/model/plugins to task schema validation
├── workflow-engine.ts        # MODIFY — use driver factory, output contracts between tasks
├── agent-dispatch.ts         # MODIFY — delegate to driver.dispatch() instead of direct SDK
├── ink-workflow.tsx           # NEW — WorkflowGraph component
├── ink-components.tsx         # MODIFY — add WorkflowGraph to layout, extend SprintInfo
├── ink-app.tsx                # MODIFY — render WorkflowGraph between Header and StoryBreakdown
└── ink-renderer.tsx           # MODIFY — add updateWorkflowState() to RendererHandle

src/schemas/
├── workflow.schema.json       # MODIFY — add driver, model, plugins to task definition
└── output-contract.schema.json # NEW — JSON Schema for output contract format

test/
├── unit/
│   ├── drivers/
│   │   ├── claude-code.test.ts
│   │   ├── codex.test.ts
│   │   ├── opencode.test.ts
│   │   ├── factory.test.ts
│   │   └── model-resolver.test.ts
│   ├── output-contract.test.ts
│   └── ink-workflow.test.tsx
└── fixtures/
    └── drivers/
        ├── codex/             # Real captured Codex CLI output samples
        │   ├── success.jsonl
        │   ├── error-rate-limit.txt
        │   └── error-auth.txt
        └── opencode/          # Real captured OpenCode CLI output samples
            ├── success.txt
            ├── error-network.txt
            └── error-auth.txt

.codeharness/
└── contracts/                 # Runtime — output contract JSON files per task/story
```

### Architectural Boundaries

**Driver Boundary:**
- Drivers ONLY know how to spawn their CLI and parse output → `StreamEvent`
- Drivers do NOT know about workflows, stories, TUI, or other drivers
- The workflow engine consumes drivers via `AgentDriver` interface only

**Workflow Engine Boundary:**
- Engine resolves drivers from factory, resolves models, dispatches tasks
- Engine writes/reads output contracts between tasks
- Engine does NOT parse CLI output or know driver internals

**TUI Boundary:**
- TUI consumes `StreamEvent` and workflow state updates
- TUI does NOT dispatch drivers or write contracts
- `WorkflowGraph` component receives flow structure and task states as props

**Output Contract Boundary:**
- Contracts are JSON files on disk — written by engine, read by engine
- Contracts are framework-agnostic — same schema regardless of source driver
- Contracts are injected as prompt context, not as structured API calls

### FR to Structure Mapping

| FR Capability Area | Files |
|-------------------|-------|
| Driver Management (FR1-FR6) | `drivers/factory.ts`, `drivers/types.ts`, each driver file |
| Stream Normalization (FR7-FR10) | Each driver's `parseLine()`, `stream-parser.ts` |
| Workflow Config (FR11-FR15) | `workflow-parser.ts`, `workflow.schema.json` |
| Cross-Framework Execution (FR16-FR20) | `output-contract.ts`, `workflow-engine.ts` |
| Plugin Integration (FR21-FR23) | Each driver's `dispatch()` (plugins → CLI flags) |
| TUI Workflow Graph (FR24-FR30) | `ink-workflow.tsx`, `ink-app.tsx`, `ink-components.tsx` |
| TUI Activity Extension (FR31-FR33) | `ink-renderer.tsx`, `ink-activity-components.tsx` |
| Cost Tracking (FR34-FR36) | `ink-renderer.tsx`, `ink-workflow.tsx` |
| Driver Capability Matrix (FR37-FR38) | `drivers/factory.ts` (capabilities metadata per driver) |

### Data Flow

```
Workflow YAML → workflow-parser → resolved tasks with driver/model
    ↓
workflow-engine → model-resolver → resolved model per task
    ↓
driver-factory → get driver by name → driver.healthCheck()
    ↓
driver.dispatch(opts) → AsyncIterable<StreamEvent>
    ↓
    ├→ ink-renderer.update(event) → TUI renders
    ├→ workflow-engine collects events → output-contract.write()
    └→ next task: output-contract.read() → inject into prompt
```

## Architecture Validation Results

### Coherence Validation ✓

**Decision Compatibility:** All 6 decisions are internally consistent. `AsyncIterable<StreamEvent>` from Decision 1 feeds both workflow engine (Decision 3) and TUI (Decision 5). Model resolution (Decision 4) feeds `DispatchOpts.model` from Decision 1. Plugin pass-through (Decision 6) extends `DispatchOpts.plugins`. No contradictions.

**Pattern Consistency:** All drivers follow identical class structure, registration, event ordering, and error classification. Output contracts are framework-agnostic by design.

**Structure Alignment:** Project structure maps cleanly to decisions — `drivers/` for Decisions 1-2, `output-contract.ts` for Decision 3, `model-resolver.ts` for Decision 4, `ink-workflow.tsx` for Decision 5.

### Requirements Coverage ✓

**Functional Requirements:** 38/38 FRs architecturally supported. Every FR capability area maps to specific architectural decisions and source files.

**Non-Functional Requirements:** 18/18 NFRs architecturally supported. Performance NFRs met by design choices (no PTY, Ink 15 FPS, atomic writes). Reliability NFRs met by Node.js close events, debug logging, and contract versioning.

### Gap Analysis

**Critical Gaps:** 0

**Important Gaps (resolved):**
1. Added `capabilities: DriverCapabilities` to `AgentDriver` interface for FR37-FR38
2. Added `suggestCheaperDriver()` to `factory.ts` for FR36 cost routing hints

### Architecture Completeness Checklist

- [x] Project context analyzed (brownfield, 38 FRs, 18 NFRs)
- [x] 6 architectural decisions documented with rationale
- [x] Implementation patterns defined (driver structure, events, errors, contracts, health, testing)
- [x] Project structure mapped with FR traceability
- [x] Architectural boundaries defined (driver, engine, TUI, contract)
- [x] Data flow documented
- [x] All FRs and NFRs architecturally supported

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** High

**First Implementation Priority:** Formalize `AgentDriver` interface and refactor existing Agent SDK dispatch into `ClaudeCodeDriver` class.
