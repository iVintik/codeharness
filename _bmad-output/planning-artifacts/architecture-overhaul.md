---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - prd-overhaul.md
  - ux-design-specification.md (v2)
  - product-brief-codeharness-arch-overhaul-2026-03-17.md
  - architecture.md (original, reference)
  - research/technical-bmad-orchestrator-implementation-research-2026-03-14.md
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-03-17'
---

# Architecture Decision Document — codeharness Overhaul

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
40 FRs across 7 capability areas. Key architectural groupings:
- **Infrastructure (FR1-6):** Init, shared stack, OpenSearch, BMAD, Docker cleanup. Maps to `infra/` module.
- **Sprint (FR7-12):** Story selection, unified state, autonomous operation, retry persistence, error capture. Maps to `sprint/` module.
- **Verification (FR13-20):** Black-box sessions, Docker exec, observability queries, agent-browser, proof parsing. Maps to `verify/` module.
- **Review (FR21-23):** Code review orchestration, failure independence. Maps to `review/` module.
- **Development (FR24-26):** Dev orchestration, verify→dev feedback, failure independence. Maps to `dev/` module.
- **Reporting (FR27-32):** Status command, story drill-down, OpenSearch queries. Cross-cuts `sprint/` (reporter) and `verify/` (proof data).
- **Module Architecture (FR37-40):** Graceful failure, typed interfaces, owned state, thin commands. Cross-cutting constraint on all modules.

**Non-Functional Requirements:**
25 NFRs. Architecturally significant:
- **NFR1-5 (Stability):** No uncaught throws, 8-hour operation, report on every iteration, atomic writes, no set -e. → Result type pattern for all module functions.
- **NFR7 (Performance):** Status in <3 seconds from local state. → Status file must be fast to read, no network calls.
- **NFR14-17 (Testability):** 100% coverage, independent module tests, integration tests, self-validation CI. → Module isolation must be real, not just file boundaries.
- **NFR18 (Maintainability):** No file >300 lines. → Current init.ts (719) must split across infra/ modules.
- **NFR22-25 (Compatibility):** CLI interface, proofs, ralph, plugin all preserved. → External interface unchanged, internal restructuring only.

**Scale & Complexity:**
- Primary domain: Node.js CLI + Claude Code plugin
- Complexity level: Medium-High
- Estimated architectural components: 5 modules + 4 commands + 2 observability backends + 1 browser verifier + ralph integration layer

### Technical Constraints & Dependencies

- **Node.js + TypeScript + tsup** — existing build system, preserved
- **Commander.js** — CLI framework, preserved
- **Docker** — required for verification containers and observability stack
- **Claude Code plugin system** — commands, skills, hooks must use existing plugin interface
- **Ralph (bash)** — autonomous loop, calls `codeharness run`, internal changes invisible
- **BMAD** — workflows invoked by dev/review modules via Agent tool
- **VictoriaMetrics** — existing observability backend, remains default
- **OpenSearch** — new observability backend, alternative to Victoria*
- **agent-browser** — new verification tool for web projects

### Cross-Cutting Concerns

1. **Error handling** — every module returns `{ success, error?, context? }`, never throws. Affects all 5 modules.
2. **State access** — sprint module owns state, other modules read via interface. Affects sprint ↔ all modules.
3. **Docker lifecycle** — infra module manages containers, verify module uses them. Affects infra ↔ verify.
4. **Observability backend** — verify module and hooks query it. Backend selection at init. Affects infra ↔ verify ↔ hooks.
5. **Reporting** — sprint/reporter reads from sprint state AND verify proof data. Cross-cuts sprint ↔ verify.

## Starter Template Evaluation

### Primary Technology Domain

Node.js CLI tool + Claude Code plugin. Brownfield — all technology choices are established and preserved.

### Existing Technology Stack (Preserved)

| Decision | Choice | Status |
|----------|--------|--------|
| Language | TypeScript (strict) | Existing, no change |
| Runtime | Node.js (ES modules) | Existing, no change |
| CLI framework | Commander.js | Existing, no change |
| Build | tsup (ESM output) | Existing, no change |
| Test | Vitest | Existing, no change |
| Package manager | npm | Existing, no change |
| Docker | Docker Compose (shared stack) | Existing, no change |
| Plugin | Claude Code plugin system | Existing, no change |

### Starter: N/A (Brownfield Restructuring)

No starter template. The project exists. The overhaul restructures internals without changing the external interface.

**What changes:**
- Internal file organization (monoliths → modules)
- Error handling pattern (throw → result types)
- State management (scattered files → unified state)
- New capability: OpenSearch backend
- New capability: agent-browser verification

**What does NOT change:**
- `codeharness init|run|verify|status` CLI interface
- Plugin commands and hooks
- Ralph integration
- Existing proofs and verification results
- Build system and test framework

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Result type pattern — how modules report success/failure
2. Unified state format — single source of truth for sprint/story state
3. Module interface contracts — typed exports for each module
4. Observability backend interface — Victoria*/OpenSearch common API
5. Status file protocol — how ralph writes status for `codeharness status`
6. Migration strategy — incremental move without breaking running systems

**Deferred Decisions (Post-MVP):**
- Parallel verification container orchestration
- Multi-project state isolation
- Plugin marketplace distribution

### Decision 1: Result Type Pattern

Every module function returns a typed result instead of throwing:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; context?: Record<string, unknown> };
```

- **Rationale:** NFR1 mandates no uncaught throws. Current codebase mixes throws with return values. Consistent result type means every caller checks `success` before proceeding. Module failures propagate as data, not exceptions.
- **Affects:** All 5 modules, all commands. First thing to implement.
- **Pattern:** Functions that can fail return `Result<T>`. Functions that cannot fail (pure transforms) return `T` directly.

### Decision 2: Unified State Format

Replace 5 scattered files with one `sprint-state.json`:

```typescript
interface SprintState {
  version: 1;
  sprint: {
    total: number;
    done: number;
    failed: number;
    blocked: number;
    inProgress: string | null;
  };
  stories: Record<string, {
    status: 'backlog' | 'ready' | 'in-progress' | 'review' | 'verifying' | 'done' | 'failed' | 'blocked';
    attempts: number;
    lastAttempt: string | null;
    lastError: string | null;
    proofPath: string | null;
    acResults: Array<{ id: string; verdict: 'pass' | 'fail' | 'escalate' | 'pending' }> | null;
  }>;
  run: {
    active: boolean;
    startedAt: string | null;
    iteration: number;
    cost: number;
    completed: string[];
    failed: string[];
  };
  actionItems: Array<{
    id: string;
    story: string;
    description: string;
    source: 'verification' | 'retro' | 'manual';
    resolved: boolean;
  }>;
}
```

- **Rationale:** FR8 requires single source of truth. Currently ralph reads `.story_retries` (bash), harness-run reads sprint-status.yaml (YAML), status reads ralph/status.json. They disagree. One JSON file, one TypeScript interface, one owner (sprint module).
- **Replaces:** sprint-status.yaml + .story_retries + .flagged_stories + ralph/status.json + .session-issues.md (action items)
- **Migration:** Read old format on first access, write new format. Backwards-compatible reader for one release cycle.
- **Write protocol:** Atomic write (write to .tmp, rename). NFR4.

### Decision 3: Module Interface Contracts

```typescript
// infra/
export function initProject(opts: InitOptions): Result<InitResult>;
export function ensureStack(): Result<StackStatus>;
export function cleanupContainers(): Result<void>;
export function getObservabilityBackend(): ObservabilityBackend;

// sprint/
export function getNextStory(): Result<StorySelection | null>;
export function updateStoryStatus(key: string, status: StoryStatus, detail?: StoryDetail): Result<void>;
export function getSprintState(): Result<SprintState>;
export function generateReport(): Result<StatusReport>;

// verify/
export function verifyStory(key: string): Result<VerifyResult>;
export function parseProof(path: string): Result<ProofQuality>;

// dev/
export function developStory(key: string): Result<DevResult>;

// review/
export function reviewStory(key: string): Result<ReviewResult>;
```

- **Rationale:** FR38 requires typed interfaces. Modules depend on interfaces, not internals.
- **Rule:** Sprint module calls `verify.verifyStory()` — it doesn't know about Docker containers or proof parsing.
- **Affects:** All module boundaries. Enforced by TypeScript compiler.

### Decision 4: Observability Backend Interface

```typescript
interface ObservabilityBackend {
  type: 'victoria' | 'opensearch';
  queryLogs(params: LogQuery): Promise<Result<LogResult>>;
  queryMetrics(params: MetricQuery): Promise<Result<MetricResult>>;
  queryTraces(params: TraceQuery): Promise<Result<TraceResult>>;
  healthCheck(): Promise<Result<HealthStatus>>;
}

// Implementations:
class VictoriaBackend implements ObservabilityBackend { ... }
class OpenSearchBackend implements ObservabilityBackend { ... }
```

- **Rationale:** FR3 and FR32 require OpenSearch support. FR15 requires observability queries in verification. Common interface means verify module doesn't know which backend is active.
- **Selection:** At init time based on `--opensearch-url`. Stored in state. Passed to verify module.
- **Default:** VictoriaMetrics (existing, shared stack).

### Decision 5: Status File Protocol

Ralph writes `sprint-state.json` after every iteration via atomic write. `codeharness status` reads it directly (NFR7: <3 seconds, no network calls).

During a run:
- `run.active = true`
- `run.iteration`, `run.cost`, `run.completed`, `run.failed` updated each iteration
- `stories[key].lastError` updated on failures with full context

After a run:
- `run.active = false`
- Results preserved for `codeharness status` to display

No separate ralph/status.json. No .story_retries. No .flagged_stories. One file.

### Decision 6: Migration Strategy

| Phase | Module | Extract From | Dependency |
|-------|--------|-------------|------------|
| 1 | verify/ | verify.ts, verifier-session.ts, verify-parser.ts | None (already isolated) |
| 2 | sprint/ | harness-run.md + ralph state files | Phase 1 (needs verify interface) |
| 3 | infra/ | init.ts + docker.ts + stack-path.ts + otlp.ts | None (independent) |
| 4 | review/ | harness-run.md | Phase 2 (needs sprint interface) |
| 5 | dev/ | harness-run.md | Phase 2 (needs sprint interface) |
| 6 | cleanup | Delete old state files, remove backwards-compat readers | All phases complete |

- **Rule:** Tests pass after every phase. System works after every phase.
- **Rule:** Each phase is independently shippable as a release.
- **Rule:** External CLI interface never changes during migration.

### Decision Impact Analysis

**Implementation Sequence:**
1. Result type (affects everything — do first)
2. Unified state format + sprint module (Phase 2 — enables status command)
3. Verify module extraction (Phase 1 — already isolated, quick win)
4. Infra module extraction (Phase 3 — unblocks init.ts split)
5. Dev + review module extraction (Phase 4-5 — completes restructuring)
6. OpenSearch backend (after infra module exists)
7. Agent-browser integration (after verify module exists)

**Cross-Component Dependencies:**
- Sprint → Verify: calls `verifyStory()`, reads `ProofQuality`
- Sprint → Dev: calls `developStory()`
- Sprint → Review: calls `reviewStory()`
- Verify → Infra: calls `getObservabilityBackend()`, `ensureStack()`
- Commands → Modules: thin wrappers, all logic in modules
- Ralph → Sprint: writes `sprint-state.json` via sprint module API

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Files:** `kebab-case.ts` (e.g., `verify-parser.ts`). Tests: `__tests__/kebab-case.test.ts` colocated. Each module has `index.ts` re-exporting public interface.

**Functions:** `camelCase` verb-noun (e.g., `verifyStory`, `getNextStory`). Result constructors: `ok(data)` and `fail(error, context?)`.

**Types:** `PascalCase` interfaces and type aliases. No enums — use union types.

**State fields:** `camelCase` JSON keys matching TypeScript interface fields.

### Structure Patterns

**Module layout (every module):**
```
src/modules/{role}/
├── index.ts              # Re-exports public interface only
├── {primary-logic}.ts    # Main module logic
├── types.ts              # Module-specific types (if needed)
└── __tests__/
    └── {primary-logic}.test.ts
```

**Commands:** Thin wrappers in `src/commands/`, <100 lines each.

**Shared types:** `src/types/` — result.ts, state.ts, observability.ts.

**Tests:** Colocated in `__tests__/` within modules. Integration tests in `tests/integration/`.

### Error Handling Pattern

Functions that can fail return `Result<T>`, never throw. Callers always check `success` before using `data`. Pure functions (no I/O) return directly.

```typescript
// Every module function:
function verifyStory(key: string): Result<VerifyResult> {
  const proof = parseProof(proofPath);
  if (!proof.success) return fail(`Proof parsing failed: ${proof.error}`, { story: key });
  return ok({ verified: true, acResults: [...] });
}
```

### State Access Pattern

Only sprint module writes `sprint-state.json`. Other modules return results, sprint module writes state. No module writes another module's state.

### Logging Pattern

Structured prefixes: `log.ok()`, `log.fail()`, `log.warn()`, `log.info()`. Every `fail()` includes what to do about it. One line per event.

### Docker Interaction Pattern

All Docker commands go through infra module. Verify module never calls Docker directly. Uses `infra.ensureVerifyContainer()` and `infra.execInContainer()`.

### Observability Query Pattern

All queries go through `ObservabilityBackend` interface. Never hardcode Victoria* or OpenSearch URLs. `infra.getObservabilityBackend()` returns the configured implementation.

### Atomic Write Pattern

All state file writes use temp file + rename (NFR4): `writeFileSync(tmp)` → `renameSync(tmp, path)`.

### Import Pattern

Modules import from each other's `index.ts`, never from internal files.

## Project Structure & Boundaries

### Complete Project Tree

```
codeharness/
├── src/
│   ├── types/                          # Shared type definitions
│   │   ├── result.ts                   # Result<T>, ok(), fail()
│   │   ├── state.ts                    # SprintState interface
│   │   ├── observability.ts            # ObservabilityBackend interface
│   │   └── index.ts
│   ├── modules/
│   │   ├── infra/                      # DevOps role
│   │   │   ├── index.ts                # initProject, ensureStack, cleanup, getBackend
│   │   │   ├── docker.ts               # Container lifecycle, shared stack
│   │   │   ├── stack.ts                # Shared stack at ~/.codeharness/stack/
│   │   │   ├── cleanup.ts              # Stale container removal
│   │   │   ├── observability.ts        # Backend factory (Victoria/OpenSearch)
│   │   │   ├── victoria-backend.ts     # VictoriaMetrics implementation
│   │   │   ├── opensearch-backend.ts   # OpenSearch implementation
│   │   │   ├── otlp.ts                 # OTLP configuration
│   │   │   ├── bmad.ts                 # BMAD install + patches
│   │   │   ├── deps.ts                 # Dependency checking/installation
│   │   │   └── __tests__/
│   │   ├── sprint/                     # SM role
│   │   │   ├── index.ts                # getNextStory, updateStatus, getState, report
│   │   │   ├── state.ts                # Unified state read/write (atomic)
│   │   │   ├── selector.ts             # Cross-epic story selection, prioritization
│   │   │   ├── reporter.ts             # Status report generation
│   │   │   ├── retry.ts                # Attempt tracking, exhaustion
│   │   │   ├── migration.ts            # Old format → sprint-state.json
│   │   │   └── __tests__/
│   │   ├── verify/                     # QA role
│   │   │   ├── index.ts                # verifyStory, parseProof
│   │   │   ├── session.ts              # Verifier session spawn (claude --print)
│   │   │   ├── parser.ts               # Proof parsing, FAIL/ESCALATE detection
│   │   │   ├── quality.ts              # Black-box enforcement checks
│   │   │   ├── prompt.ts               # Verification prompt template
│   │   │   ├── browser.ts              # Agent-browser verification
│   │   │   └── __tests__/
│   │   ├── dev/                        # Dev role
│   │   │   ├── index.ts                # developStory
│   │   │   ├── orchestrator.ts         # BMAD dev-story invocation
│   │   │   └── __tests__/
│   │   └── review/                     # Reviewer role
│   │       ├── index.ts                # reviewStory
│   │       ├── orchestrator.ts         # BMAD code-review invocation
│   │       └── __tests__/
│   ├── commands/                       # CLI entry points (thin wrappers)
│   │   ├── init.ts                     # → infra.initProject()
│   │   ├── run.ts                      # → sprint.runSprint()
│   │   ├── verify.ts                   # → verify.verifyStory()
│   │   ├── status.ts                   # → sprint.generateReport()
│   │   ├── bridge.ts                   # → (preserved, uses bmad parser)
│   │   ├── retry.ts                    # → sprint.manageRetries()
│   │   ├── stack.ts                    # → infra.manageStack()
│   │   ├── state.ts                    # → sprint.readWriteState()
│   │   └── __tests__/
│   ├── lib/                            # Utilities (NOT module logic)
│   │   ├── output.ts                   # ok/fail/warn/info logging
│   │   ├── patch-engine.ts             # BMAD patch application
│   │   └── doc-health.ts               # Documentation freshness
│   ├── templates/
│   │   ├── docker-compose.ts
│   │   ├── otel-config.ts
│   │   ├── showboat-template.ts
│   │   └── verify-prompt.ts
│   └── index.ts                        # CLI entry (Commander setup)
├── patches/                            # Per-role enforcement (runtime)
│   ├── dev/
│   ├── review/
│   ├── verify/
│   ├── sprint/
│   └── retro/
├── ralph/                              # Autonomous loop (bash)
├── hooks/                              # Claude Code hooks
├── commands/                           # Plugin slash commands (markdown)
├── .claude-plugin/
├── tests/integration/                  # End-to-end tests
├── sprint-state.json                   # Unified state (sprint module owns)
├── package.json
└── tsup.config.ts
```

### FR → Module Mapping

| FR Range | Module | Key Files |
|----------|--------|-----------|
| FR1-6 | infra/ | docker.ts, stack.ts, observability.ts, bmad.ts, deps.ts |
| FR7-12 | sprint/ | state.ts, selector.ts, retry.ts, migration.ts |
| FR13-20 | verify/ | session.ts, parser.ts, quality.ts, browser.ts |
| FR21-23 | review/ | orchestrator.ts |
| FR24-26 | dev/ | orchestrator.ts |
| FR27-32 | sprint/ + verify/ | reporter.ts (sprint), parser.ts (verify) |
| FR33-36 | patches/ | Runtime-loaded markdown per role |
| FR37-40 | All modules | Enforced by types/result.ts + index.ts pattern |

### Module Boundaries

**Hard boundaries (enforced by imports):**
- Commands import from modules only (via index.ts)
- Modules import from types/ and from other modules' index.ts
- No module imports from commands/
- No circular imports between modules

**State ownership:**
- `sprint-state.json` — owned by sprint/, read by commands
- `verification/*-proof.md` — owned by verify/, read by sprint/reporter
- `~/.codeharness/stack/` — owned by infra/
- `.claude/codeharness.local.md` — owned by infra/ (init-time config)

### Migration: Current → New Location

| Current File | From | To |
|-------------|------|-----|
| docker.ts | src/lib/ | src/modules/infra/ |
| stack-path.ts | src/lib/ | src/modules/infra/stack.ts |
| otlp.ts | src/lib/ | src/modules/infra/otlp.ts |
| bmad.ts | src/lib/ | src/modules/infra/bmad.ts |
| deps.ts | src/lib/ | src/modules/infra/deps.ts |
| verify.ts | src/lib/ | src/modules/verify/ (split) |
| verify-parser.ts | src/lib/ | src/modules/verify/parser.ts |
| verifier-session.ts | src/lib/ | src/modules/verify/session.ts |
| beads-sync.ts | src/lib/ | src/modules/sprint/ |
| init.ts (719 lines) | src/commands/ | commands/init.ts (~50) + modules/infra/ |
| verify.ts | src/commands/ | commands/verify.ts (~30) + modules/verify/ |

## Architecture Validation

### Coherence: PASS

All decisions work together. Result type + module interfaces = consistent error handling. Unified state + status protocol = single file for ralph and status. Observability interface + verify module = backend-agnostic verification. No pattern conflicts found.

### Requirements Coverage: PASS

All 40 FRs mapped to modules. All 25 NFRs addressed by architectural patterns.

### Gaps Found & Resolved

1. **Ralph ↔ sprint module:** Ralph writes `sprint-state.json` directly via `jq` following the same schema. Sprint module (inside Claude sessions) writes the `stories` section. Ralph writes the `run` section.

2. **Harness-run.md ↔ modules:** The skill invokes `codeharness` CLI commands via Bash tool. Commands are thin wrappers to modules. Skill orchestrates, CLI executes.

3. **Agent-browser in Docker:** Update `templates/Dockerfile.verify` to install agent-browser. Verify module's `browser.ts` wraps `docker exec ... agent-browser` commands.

### Ambiguity Rule

`lib/` is for truly cross-cutting utilities only. If a function is used by only one module, it goes in that module.

### Readiness: YES

Implementation order:
1. `src/types/` with Result<T>
2. `src/modules/verify/` (move existing, already isolated)
3. `src/modules/sprint/` with unified state
4. `src/modules/infra/` (extract from init.ts)
5. `src/modules/dev/` + `src/modules/review/` (extract from harness-run.md)
6. OpenSearch backend
7. Agent-browser integration
8. Ralph sprint-state.json integration
9. Self-validation run
