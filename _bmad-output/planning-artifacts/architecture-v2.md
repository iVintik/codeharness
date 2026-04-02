---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-02'
inputDocuments:
  - prd-evaluator-redesign.md
  - research/domain-harness-design-long-running-agents-research-2026-04-01.md
  - research/technical-ai-agent-verification-testing-research-2026-03-16.md
  - research/technical-workflow-engine-implementation-research-2026-04-02.md
  - architecture.md (v1 architecture, brownfield context)
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-04-02'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 43 FRs across 10 capability areas — Workflow Definition (6), Agent Configuration (6), Workflow Configuration (3), Workflow Execution (8), Adversarial Verification (5), Feedback Loop (3), Circuit Breaker (4), Observability (2), CLI Commands (4), Legacy Removal (2).

**Non-Functional Requirements:** 18 NFRs across Performance (5), Reliability (5), Integration (4), Code Quality (4). Architecture-critical NFRs: crash recovery via state persistence (NFR6-8), programmatic agent dispatch only (NFR11), optional observability (NFR14).

**Scale & Complexity:**
- Primary domain: Developer tooling (CLI + plugin)
- Complexity level: High
- Estimated architectural components: ~10
- Cross-cutting concerns: config resolution chain, trace ID propagation, crash recovery, evaluator isolation

### Technical Constraints & Dependencies

- Runtime: Node.js (TypeScript)
- Dependencies: `commander`, `yaml`, `@anthropic-ai/claude-agent-sdk`
- Execution substrate: Agent SDK `query()` — async generator, session management, JSON schema output
- State: Single `workflow-state.yaml` in repo (beads-level simplicity)
- Evaluator isolation: Separate workspace, no source code, Docker container for artifact
- Docker: Required for evaluator but graceful degradation if missing (Journey 5)

### Cross-Cutting Concerns

1. **Config resolution** — every agent/workflow dispatch resolves embedded → user → project patches
2. **Trace ID propagation** — generated per iteration, injected into agent prompts, correlates to observability
3. **Crash recovery** — state persisted after each task, engine resumes from last checkpoint
4. **Evaluator isolation** — separate workspace, `disallowedTools` enforcement, `source_access: false`

## Starter Template Evaluation

### Primary Technology Domain

CLI developer tool — Node.js/TypeScript. Brownfield project with established toolchain.

### Starter Options: Not Applicable (Brownfield)

Existing project toolchain is retained:

| Decision | Current (Keep) | Source |
|----------|---------------|--------|
| Language | TypeScript (strict) | Existing project |
| Build | tsup | Existing project |
| Test | vitest (unit) + BATS (integration) | Existing project |
| CLI | commander | Existing project |
| YAML | yaml package | Existing project |
| **New** | @anthropic-ai/claude-agent-sdk | Research — replaces bash spawn |

**No starter template needed.** One new dependency added. Internals reworked.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Module boundaries — what code goes where
2. Evaluator workspace isolation — how to enforce source-free verification
3. Evaluator verdict schema — the contract between evaluator and engine

**Important Decisions (Shape Architecture):**
4. Embedded template storage — where agent/workflow YAML files live in the package
5. Config resolution caching — resolve once or every dispatch

**Deferred Decisions (Post-MVP):**
- PersonaNexus trait compilation algorithm (Growth phase)
- Pluggable evaluator strategies interface (Growth phase)
- Workflow marketplace format/registry (Vision phase)

### AD1: Module Boundaries

| Module | Responsibility | Key FRs |
|--------|---------------|---------|
| `workflow-parser` | Parse YAML, validate against JSON schema, resolve patches (embedded→user→project) | FR1-6, FR13-15 |
| `agent-resolver` | Resolve agent config through patch chain, compile to SDK inline subagent definition | FR7-12 |
| `workflow-engine` | Execute flow steps, manage iterations, handle `loop:` blocks, inject evaluator findings into retries | FR16-18, FR29-31 |
| `agent-dispatch` | Call Agent SDK `query()`, manage sessions (fresh/continue), inject trace IDs | FR19-23 |
| `evaluator` | Blind evaluator workspace setup, spawn, JSON verdict parsing | FR24-28 |
| `circuit-breaker` | Score-based stagnation detection, score history tracking | FR32-35 |
| `workflow-state` | Read/write workflow-state.yaml, crash recovery (resume from last completed task) | NFR6-8 |

**Rationale:** 7 modules, each 100-200 LOC. Feedback loop (FR29-30) is part of `workflow-engine` — it's loop logic, not a separate concern. CLI commands (`init`, `run`, `validate`, `status`) are thin wrappers calling these modules. Observability (FR36-37) is a cross-cutting concern handled by trace ID injection in `agent-dispatch`, not a separate module.

### AD2: Evaluator Workspace Isolation

**Decision:** Temp directory with only story files + Docker access.

```
/tmp/codeharness-verify-{runId}/
  story-files/     # copied ACs from sprint
  verdict/         # evaluator writes JSON verdict here
```

Engine copies story files to temp dir, spawns evaluator with `cwd` set to this directory. Agent SDK options enforce isolation:
- `bare: true` — no plugins, hooks, MCP, memory
- `disallowedTools: ["Edit", "Write"]` — read-only + execute only
- `cwd: /tmp/codeharness-verify-{runId}` — no source code present

**Rationale:** Simplest approach. Source isn't there because we never put it there. No git worktree complexity, no Docker-in-Docker. The Agent SDK's `cwd` + `disallowedTools` provide sufficient isolation.

### AD3: Embedded Template Storage

**Decision:** `templates/` directory in the npm package.

```
templates/
  agents/
    dev.yaml
    qa.yaml
    architect.yaml
    pm.yaml
    sm.yaml
    analyst.yaml
    ux-designer.yaml
    tech-writer.yaml
    evaluator.yaml
  workflows/
    default.yaml
```

Included via `package.json` `files` array. Readable, editable for debugging, consistent with existing pattern (`templates/Dockerfile.verify`).

**Rationale:** Files over compiled strings. Easier to inspect, diff, and debug. The `codeharness init` command copies the default workflow to the project; embedded agents are resolved at runtime from the package location.

### AD4: Config Resolution Caching

**Decision:** Resolve all configs once at engine startup, cache in memory.

On `codeharness run`:
1. Resolve workflow: load embedded → apply user patch → apply project patch → cache
2. Resolve all referenced agents: same resolution chain → cache
3. Run engine with cached configs — no file I/O during execution

**Rationale:** Config files don't change during a run. Caching guarantees NFR2 (<200ms resolution) and eliminates repeated file system reads during long-running execution.

### AD5: Evaluator Verdict Schema

**Decision:** Structured JSON enforced by Agent SDK `jsonSchema` option.

```typescript
interface EvaluatorVerdict {
  verdict: 'pass' | 'fail';
  score: {
    passed: number;
    failed: number;
    unknown: number;
    total: number;
  };
  findings: Array<{
    ac: number;
    description: string;
    status: 'pass' | 'fail' | 'unknown';
    evidence: {
      commands_run: string[];
      output_observed: string;
      reasoning: string;
    };
  }>;
  evaluator_trace_id: string;
  duration_seconds: number;
}
```

**Rationale:** Replaces the 175-line proof document regex parser entirely. The Agent SDK validates the output against this schema — if the evaluator doesn't produce valid JSON, the SDK rejects it. Every AC verdict requires evidence (commands + output), enforcing the anti-leniency principle structurally.

### Decision Impact Analysis

**Implementation Sequence:**
1. `workflow-state` — foundation for crash recovery, needed by everything
2. `workflow-parser` — parse YAML + resolve patches, needed before execution
3. `agent-resolver` — resolve agent configs, needed before dispatch
4. `agent-dispatch` — SDK integration, needed before engine can run
5. `workflow-engine` — orchestrates everything above
6. `evaluator` — depends on dispatch + state
7. `circuit-breaker` — depends on evaluator verdicts

**Cross-Component Dependencies:**
- `workflow-engine` depends on all other modules
- `evaluator` depends on `agent-dispatch` (for SDK spawn) and `workflow-state` (for verdict recording)
- `circuit-breaker` depends on `workflow-state` (reads score history)
- `agent-dispatch` depends on `agent-resolver` (for compiled subagent definitions)

## Implementation Patterns & Consistency Rules

### Naming Patterns

**File naming:** `kebab-case.ts` for all source files. Already established (`workflow-parser.ts`, `agent-dispatch.ts`).

**Export naming:** `camelCase` for functions, `PascalCase` for types/interfaces, `UPPER_SNAKE_CASE` for constants.

**YAML keys:** `snake_case` for all workflow and agent config keys (`source_access`, `max_budget_usd`).

**Patch files:** Named `{base-name}.patch.yaml`. Always. Not `.override.yaml` or `.custom.yaml`.

### Structure Patterns

Each module in `src/lib/` is one file with co-located test:
```
src/lib/workflow-parser.ts
src/lib/__tests__/workflow-parser.test.ts
```

Embedded templates: `templates/agents/`, `templates/workflows/`.
User-level: `~/.codeharness/agents/`, `~/.codeharness/workflows/`.
Project-level: `.codeharness/agents/`, `.codeharness/workflows/`.
No alternative locations.

### Format Patterns

**Evaluator verdict:** JSON schema enforced (AD5). No alternative formats. Every AC requires `status`, `evidence.commands_run`, `evidence.output_observed`.

**Workflow state:** YAML in `.codeharness/workflow-state.yaml`. No JSON, no SQLite, no binary.

**Resolved configs:** In-memory only. Never written to disk.

### Error Handling Patterns

| Failure | Response |
|---------|----------|
| API limit | Record in state, wait and retry |
| Network failure | Record in state, retry with backoff |
| Agent timeout | Score as UNKNOWN, continue |
| Binary not found | Fatal error, halt engine |
| Missing embedded agent | Fatal error at startup |
| Malformed patch YAML | Fatal error with parse error |
| Missing user/project patch | Silently skip |
| Evaluator timeout | All UNKNOWN, counts as scored iteration |
| Invalid evaluator JSON | Retry once, then all UNKNOWN |
| Docker not running | All UNKNOWN with "Docker not available" finding |

### Process Patterns

**State writes:** After EVERY task completion. Never batch. Never defer. Crash recovery guarantee.

**Trace ID format:** `ch-{runId}-{iteration}-{taskName}` — deterministic, greppable. Example: `ch-abc123-3-verify`.

**Session boundary enforcement:** `session: fresh` = new Agent SDK query with no resume/continue. No session reuse optimization across tasks.

### Enforcement Guidelines

**All agents implementing codeharness v2 MUST:**
- Run `vitest run` before marking any module complete — 80%+ coverage
- Use Agent SDK `query()` for all agent dispatch — never `execFileSync`
- Write workflow-state.yaml after every task — never hold state only in memory
- Use `bare: true` for all programmatic agent spawns

**Anti-Patterns:**
- Caching evaluator verdicts across iterations (each is full re-verification)
- Writing resolved configs to disk (memory-only)
- Using `child_process.spawn` for Claude CLI
- Adding shell scripts to the execution path

## Project Structure & Boundaries

### Complete Project Directory Structure

```
codeharness/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .github/workflows/release.yml
│
├── src/
│   ├── index.ts                           # CLI entry point (commander)
│   │
│   ├── commands/                           # CLI command handlers
│   │   ├── init.ts                        # REWORK — add workflow generation, strip beads
│   │   ├── run.ts                         # REWORK — use workflow-engine instead of Ralph
│   │   ├── validate.ts                    # NEW — schema validation command
│   │   ├── status.ts                      # REWORK — show workflow-state, strip beads
│   │   ├── verify.ts                      # REWORK — becomes evaluator trigger only
│   │   ├── coverage.ts                    # KEEP as-is
│   │   ├── doc-health.ts                  # KEEP as-is
│   │   ├── stack.ts                       # KEEP as-is
│   │   ├── query.ts                       # KEEP as-is (observability queries)
│   │   ├── bridge.ts                      # REWORK — strip beads, keep BMAD bridge
│   │   ├── sync.ts                        # REWORK — strip beads sync
│   │   ├── onboard.ts                     # REWORK — strip beads calls
│   │   ├── teardown.ts                    # REWORK — update for new file layout
│   │   ├── state.ts                       # REWORK — point at workflow-state.yaml
│   │   ├── retro-import.ts               # REWORK — strip beads imports
│   │   ├── github-import.ts              # REWORK — strip beads imports
│   │   ├── verify-env.ts                  # REWORK — evolve into evaluator setup
│   │   └── __tests__/
│   │
│   ├── lib/                               # Core modules
│   │   │
│   │   │  # ── NEW MODULES (v2 architecture) ──
│   │   ├── workflow-parser.ts             # YAML parse, schema validate, patch resolution
│   │   ├── agent-resolver.ts             # Agent config resolution, SDK compilation
│   │   ├── workflow-engine.ts            # Flow execution, loops, finding injection
│   │   ├── agent-dispatch.ts             # Agent SDK query(), sessions, trace IDs
│   │   ├── evaluator.ts                  # Blind evaluator workspace + spawn + verdict parsing
│   │   ├── circuit-breaker.ts            # Score-based stagnation detection (TS rewrite)
│   │   ├── workflow-state.ts             # State persistence, crash recovery (replaces state.ts)
│   │   │
│   │   │  # ── KEPT MODULES (existing, no changes) ──
│   │   ├── output.ts                      # Console output utilities
│   │   ├── stack-detect.ts               # Stack detection for init
│   │   ├── stack-path.ts                 # Docker compose and OTLP config paths
│   │   ├── docker.ts                      # Docker Compose lifecycle management
│   │   ├── otlp.ts                        # OpenTelemetry instrumentation setup
│   │   ├── scanner.ts                     # Codebase scanning
│   │   ├── scan-cache.ts                 # Scan result persistence
│   │   ├── coverage.ts                    # Coverage tool detection
│   │   ├── doc-health.ts                 # Documentation freshness checking
│   │   ├── templates.ts                   # File rendering and generation
│   │   ├── github.ts                      # GitHub CLI wrapper
│   │   ├── retro-parser.ts              # Retrospective markdown parsing
│   │   │
│   │   │  # ── REWORK MODULES (strip beads, keep core logic) ──
│   │   ├── bmad.ts                        # REWORK — strip beads gap-IDs, keep BMAD install/patch
│   │   ├── epic-generator.ts             # REWORK — strip beads gap-IDs, keep epic generation
│   │   ├── onboard-checks.ts            # REWORK — strip beads calls, keep preconditions
│   │   ├── deps.ts                        # REWORK — remove showboat/beads deps
│   │   ├── verify-env.ts                 # REWORK — evolve into evaluator workspace setup
│   │   │
│   │   └── __tests__/                     # Co-located unit tests (update with source)
│   │
│   ├── templates/                         # Code-generated templates
│   │   ├── readme.ts                      # KEEP — README generator
│   │   ├── docker-compose.ts             # KEEP — observability stack template
│   │   ├── otel-config.ts               # KEEP — OpenTelemetry config
│   │   ├── bmad-patches.ts              # KEEP — BMAD workflow patch templates
│   │   └── __tests__/
│   │
│   └── schemas/                           # JSON schemas (NEW)
│       ├── workflow.schema.json
│       ├── agent.schema.json
│       └── verdict.schema.json
│
├── templates/                             # Embedded defaults (shipped in npm)
│   ├── agents/                            # 9 agent YAMLs (8 BMAD + evaluator)
│   │   ├── dev.yaml
│   │   ├── qa.yaml
│   │   ├── architect.yaml
│   │   ├── pm.yaml
│   │   ├── sm.yaml
│   │   ├── analyst.yaml
│   │   ├── ux-designer.yaml
│   │   ├── tech-writer.yaml
│   │   └── evaluator.yaml
│   └── workflows/
│       └── default.yaml                   # Default sprint execution workflow
│
├── tests/                                 # BATS integration tests (rework for v2)
│
├── .claude-plugin/
│   └── plugin.json                        # REWORK — update hooks, remove old references
│
├── skills/                                # REWORK — update for v2 architecture
│   ├── harness-run/
│   ├── harness-status/
│   └── harness-init/
│
└── dist/                                  # Build output (tsup)
```

### Complete File Migration Plan

#### DELETE (40+ files)

**Entire directories:**
- `ralph/` — 23 files (ralph.sh, drivers/, lib/, logs/, state files)
- `hooks/` — 5 files (4 bash hooks + hooks.json)

**From `src/lib/` (7 files):**
- `beads.ts` — Beads CLI wrapper (entire beads integration removed)
- `beads-sync.ts` — Beads ↔ story sync
- `verify.ts` — 175-line proof parser (replaced by evaluator.ts)
- `verify-parser.ts` — Story AC parser (simplified into evaluator)
- `verifier-session.ts` — Black-box verifier subprocess (evolved into evaluator.ts)
- `patch-engine.ts` — Marker-based patching (replaced by workflow-parser.ts)
- `retry-state.ts` — Retry counter persistence (merged into workflow-state.ts)
- `state.ts` — Old session flags state (replaced by workflow-state.ts)

**From `src/templates/` (3 files):**
- `showboat-template.ts` — Proof document format (replaced by JSON verdict)
- `verify-prompt.ts` — Black-box verifier prompt (replaced by evaluator agent YAML)
- `ralph-prompt.ts` — Ralph loop prompt (replaced by workflow engine)

**From `src/commands/` (1 file):**
- `retry.ts` — Retry command (merged into workflow-state)

**All corresponding test files for deleted sources.**

#### REWORK — Beads Cleanup (12 files)

These files import beads functions that must be surgically removed:

| File | What to Remove | What to Keep |
|------|---------------|-------------|
| `src/lib/bmad.ts` | `appendGapId`, beads issue creation | BMAD install, workflow patching |
| `src/lib/epic-generator.ts` | `appendGapId`, beads calls | Epic generation from scan |
| `src/lib/onboard-checks.ts` | Beads precondition checks | Non-beads preconditions |
| `src/lib/deps.ts` | Showboat/beads dep installation | Claude, Docker dep checks |
| `src/lib/verify-env.ts` | Old verifier workspace logic | Evolve into evaluator workspace |
| `src/commands/bridge.ts` | `createIssue`, `listIssues` imports | BMAD story bridge logic |
| `src/commands/init.ts` | Beads init, hook installation | Stack detect, workflow generation |
| `src/commands/onboard.ts` | Beads calls from epic-generator | Scanning, epic generation |
| `src/commands/status.ts` | Beads status display | Workflow-state display |
| `src/commands/sync.ts` | Beads sync operations | Sprint-status sync |
| `src/commands/teardown.ts` | Old patch-engine calls | New file layout cleanup |
| `src/commands/verify.ts` | Self-verification, proof parsing | Evaluator trigger only |

#### REWORK — Architecture Changes (5 files)

| File | Change |
|------|--------|
| `src/commands/run.ts` | Replace Ralph spawn with workflow-engine call |
| `src/commands/state.ts` | Point at workflow-state.yaml instead of old state |
| `src/commands/retro-import.ts` | Strip beads imports |
| `src/commands/github-import.ts` | Strip beads imports |
| `.claude-plugin/plugin.json` | Remove old hook references, update version |

#### REWORK — Skills (3 directories)

| Skill | Change |
|-------|--------|
| `skills/harness-run/` | Update to reference workflow-engine |
| `skills/harness-status/` | Update to reference workflow-state |
| `skills/harness-init/` | Update for new init flow |

#### NEW (20+ files)

- 7 core modules in `src/lib/` (workflow-parser, agent-resolver, workflow-engine, agent-dispatch, evaluator, circuit-breaker, workflow-state)
- 3 JSON schemas in `src/schemas/`
- 9 agent YAMLs in `templates/agents/`
- 1 workflow YAML in `templates/workflows/`
- 1 new command (`src/commands/validate.ts`)
- Co-located tests for all new modules

### FR → Module Mapping

| FR Group | Module |
|----------|--------|
| FR1-6, FR13-15 (Workflow + Config) | workflow-parser |
| FR7-12 (Agent Config) | agent-resolver |
| FR16-18, FR29-31 (Execution + Feedback) | workflow-engine |
| FR19-23 (Dispatch) | agent-dispatch |
| FR24-28 (Verification) | evaluator |
| FR32-35 (Circuit Breaker) | circuit-breaker |
| FR36-37 (Observability) | agent-dispatch (trace IDs) |
| FR38-41 (CLI) | commands/*.ts |

### Dependency Chain Breaks to Handle

| Deleted Module | Dependents That Need Cleanup |
|---------------|------------------------------|
| `beads.ts` | bmad.ts, epic-generator.ts, onboard-checks.ts, bridge, github-import, init, onboard, retro-import, status, sync, verify |
| `beads-sync.ts` | sync.ts, verify.ts, run.ts |
| `verify-parser.ts` | verify.ts |
| `verifier-session.ts` | (no external dependents — self-contained) |
| `patch-engine.ts` | bmad.ts, teardown.ts |
| `retry-state.ts` | retry.ts (deleted), run.ts |
| `state.ts` | verify.ts, status.ts, state.ts command, init.ts |
| `ralph-prompt.ts` | run.ts |
| `showboat-template.ts` | verify.ts |

### Integration Boundaries & Data Flow

```
codeharness run
  → workflow-parser: load + resolve workflow YAML
  → agent-resolver: resolve all referenced agents, cache
  → workflow-engine: execute flow steps
    → per-story tasks:
        agent-dispatch: SDK query() → agent works → returns
        workflow-state: write checkpoint
    → per-run tasks (verify):
        evaluator: setup workspace → agent-dispatch → parse verdict
        workflow-state: write checkpoint + scores
        circuit-breaker: evaluate stagnation
    → loop block: repeat with findings injected
  → workflow-state: write final status
```

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** All technology choices (Agent SDK + TypeScript + commander + yaml) are Node.js ecosystem, no conflicts. Agent SDK async generator + sequential engine execution are compatible. JSON schema validation consistent across workflow, agent, and verdict schemas.

**Pattern Consistency:** kebab-case files + camelCase exports matches existing codebase. snake_case YAML keys is standard cross-language convention. Write-after-task state pattern aligns with crash recovery requirement.

**Structure Alignment:** 7 modules in `src/lib/` with co-located tests matches existing structure. Templates in `templates/` matches existing distribution. `.codeharness/` for project config is clean separation from `.claude/`.

**No contradictions found.**

### Requirements Coverage

**43 FRs:** All mapped to specific modules. No FR unaddressed.

**18 NFRs:** All addressed — performance by caching, reliability by state persistence, integration by Agent SDK, code quality by project structure.

**Minor gap:** Verdict schema needs `infrastructure_available: boolean` for graceful degradation when Docker is unavailable (Journey 5). Resolution: add the field.

### Implementation Readiness

- 5 architectural decisions documented with rationale
- Implementation sequence defined (state → parser → resolver → dispatch → engine → evaluator → circuit-breaker)
- Full directory tree with every file specified
- Legacy deletion targets listed explicitly
- Error handling patterns cover all failure modes
- Enforcement guidelines and anti-patterns documented

### Architecture Completeness Checklist

- [x] Project context analyzed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped (config resolution, trace IDs, crash recovery, evaluator isolation)
- [x] 5 core architectural decisions documented
- [x] Technology stack specified
- [x] Naming, structure, format, error, and process patterns defined
- [x] Complete directory structure with every file classified (DELETE/REWORK/KEEP/NEW)
- [x] FR→module mapping complete
- [x] Integration boundaries and data flow documented
- [x] Beads dependency chain mapped — 12 files need surgical cleanup
- [x] All 17 existing commands accounted for (not just the 4 new/reworked ones)
- [x] All 14 kept lib modules listed with their role in v2
- [x] All 4 kept templates listed
- [x] Skills and plugin.json rework noted
- [x] Dependency chain breaks documented with specific cleanup actions

### Architecture Readiness Assessment

**Status:** READY FOR IMPLEMENTATION
**Confidence:** High

**Migration scope (revised):**
- ~40 files deleted (ralph/, hooks/, 8 lib modules, 3 templates, 1 command + tests)
- ~17 files reworked (12 beads cleanup, 5 architecture changes)
- ~14 lib files kept as-is
- ~20 new files (7 modules, 3 schemas, 10 templates, tests)

**Strengths:** Clean module boundaries, complete file migration plan, dependency chain breaks documented, official SDK replaces bash spawning, beads-level state simplicity, structural evaluator isolation.

**Key risk:** Beads cleanup touches 12 files — must be done atomically to avoid broken imports. Recommended: delete beads.ts + beads-sync.ts first, then fix all compiler errors in one pass.

### AD6: Issue Tracking (Beads Replacement)

**Problem:** Beads is removed but the underlying need remains — retro findings, bugs, and tech debt need a path from "discovered" to "scheduled" to "implemented." BMAD handles planned stories well but not unplanned issues.

**Decision:** Simple `issues.yaml` file parallel to `sprint-status.yaml`.

```yaml
# .codeharness/issues.yaml (or _bmad-output/implementation-artifacts/issues.yaml)
issues:
  - id: issue-001
    title: Docker timeout handling too aggressive
    source: retro-epic-15       # where it came from
    priority: high
    status: ready-for-dev       # same statuses as stories
  - id: issue-002
    title: Evaluator too lenient on API error codes
    source: manual
    priority: medium
    status: backlog
```

**How it works:**
- `codeharness issue create "title" --priority high --source retro-epic-15` → adds to issues.yaml
- Retro workflow tags findings as `actionable: true` → auto-added to issues.yaml
- Workflow engine reads both `sprint-status.yaml` (stories) AND `issues.yaml` (issues)
- Issues interleaved into execution based on priority
- Same statuses, same execution path, same verification — the engine doesn't distinguish stories from issues

**Rationale:** File-based, no external dependencies, beads-level simplicity. Everything goes through the workflow engine. No separate issue tracker to maintain. Retro findings get a mechanical path to implementation instead of rotting in markdown.

**Implementation Priority:**
1. Beads cleanup (unblock everything — 12 files, surgical removal)
2. Legacy deletion (ralph/, hooks/, old verify/proof modules)
3. New modules in dependency order (state → parser → resolver → dispatch → engine → evaluator → circuit-breaker)
4. Command rework (run.ts, verify.ts, init.ts, status.ts)
5. Skills and plugin.json update
6. Integration tests
