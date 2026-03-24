---
stepsCompleted: [1]
inputDocuments:
  - architecture-operational-excellence.md
  - architecture-overhaul.md
  - architecture.md
  - tech-spec-retro-pipeline-harness-fixes.md
  - tech-spec-rust-stack-support.md
  - tech-spec-multi-stack-support.md
  - session-retro-2026-03-23.md
  - session-retro-2026-03-24.md
  - .session-issues.md
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-03-24'
---

# Architecture Decision Document — v3 (Clean Rewrite)

_Replaces architecture.md, architecture-overhaul.md, and architecture-operational-excellence.md. This is the single authoritative architecture document for codeharness going forward._

## Why a Rewrite

The current architecture accumulated across 3 documents and 9 epics. It was never consolidated. The result:
- 12 files exceed the 300-line limit (worst: 832 lines)
- 5 state files with no sync mechanism
- 41 stack conditionals across 8 files (no abstraction)
- 28 files coupled to Ralph with no interface
- 53 bare `catch {}` blocks swallowing errors
- 155 `Record<string, unknown>` casts eroding type safety
- Two parallel template systems
- Command files containing business logic

This document defines the target architecture. Migration from current to target is incremental — not a big-bang rewrite.

---

## Project Context

### What Codeharness Is

A CLI tool + Claude Code plugin that provides autonomous sprint execution for software projects. It detects the project's tech stack, sets up observability, executes stories through a create→dev→review→verify pipeline, and enforces quality gates.

### Distribution Channels

1. **Claude Code plugin** — installed via `claude plugin install`. Ships: `commands/`, `hooks/`, `skills/`, `knowledge/`
2. **npm package** — installed via `npm install -g codeharness`. Ships: `dist/`, `templates/`, `ralph/`

Both channels must version-sync. CI enforces `plugin.json` ↔ `package.json` version match.

### Supported Stacks

Node.js, Python, Rust. Future: Go, Java. Architecture must make adding a stack a single-file operation.

---

## Core Architectural Decisions

### Decision 1: Unified State — One File, Versioned Schema

**Problem:** 5+ state files (`sprint-state.json`, `sprint-status.yaml`, `codeharness.local.md`, `.story_retries`, `.flagged_stories`) with no sync mechanism. Every session has desync bugs. State readers and writers are scattered across 15+ files.

**Decision:** Consolidate into **two** state files with clear ownership:

| File | Purpose | Format | Owner |
|------|---------|--------|-------|
| `.claude/codeharness.local.md` | **Project config** — stack, enforcement, OTLP, coverage targets | YAML frontmatter + markdown | `src/lib/state.ts` |
| `sprint-state.json` | **Sprint runtime** — story statuses, retries, flags, run progress, observability coverage | JSON | `src/modules/sprint/state.ts` |

**What gets consolidated INTO sprint-state.json:**
- `sprint-status.yaml` → `sprint-state.json` field `stories: Record<string, StoryState>` (sprint-status.yaml becomes a derived view, generated from sprint-state.json for human readability)
- `.story_retries` → `sprint-state.json` field `retries: Record<string, number>`
- `.flagged_stories` → `sprint-state.json` field `flagged: string[]`
- `ralph/status.json` → `sprint-state.json` field `session: { ... }`

**What stays in codeharness.local.md:**
- Stack detection results (stacks, app types)
- Enforcement flags (frontend, database, api)
- OTLP config (backend, endpoint, service name)
- Coverage config (target, baseline)
- Docker config

**Schema versioning:**
```typescript
interface SprintState {
  version: 2;  // Increment on schema changes
  stories: Record<string, StoryState>;
  retries: Record<string, number>;
  flagged: string[];
  epics: Record<string, EpicState>;
  session: SessionState;
  observability: ObservabilityState;
  run: RunProgress;
}
```

**Migration:** `readSprintState()` checks `version` field. If missing or < current, runs migration chain. Old files (`.story_retries`, `.flagged_stories`) are read during migration, then deleted.

**Derived views:**
- `sprint-status.yaml` is GENERATED from `sprint-state.json` after each write. It's a human-readable view, not a source of truth. `readSprintStatus()` becomes `generateSprintStatusYaml()`.
- The Ink renderer reads `sprint-state.json` directly (no more polling sprint-status.yaml).

**Atomic writes:** All state writes use `writeFileSync` to a temp file + `renameSync` (atomic on POSIX). Already established in sprint module — now enforced everywhere.

---

### Decision 2: Stack Provider Pattern — Add a Language = Add One File

**Problem:** 41 if/else branches on `stack === 'nodejs' | 'python' | 'rust'` across 8 files. Adding Go means touching 8+ files. No abstraction.

**Decision:** Create a `StackProvider` interface. Each language implements it in one file. A registry maps stack names to providers.

```typescript
// src/lib/stacks/types.ts
interface StackProvider {
  readonly name: StackName;
  readonly markers: string[];           // Files that identify this stack (e.g., ['package.json'])
  readonly displayName: string;         // 'Node.js (package.json)'

  detectAppType(dir: string): AppType;
  getCoverageTool(): CoverageToolName;
  detectCoverageConfig(dir: string): CoverageToolInfo;
  getOtlpPackages(): string[];
  installOtlp(dir: string): OtlpResult;
  patchStartScript?(dir: string): boolean;
  getDockerfileTemplate(): string;
  getDockerBuildStage(): string;
  getRuntimeCopyDirectives(): string;
  getBuildCommands(): string[];
  getTestCommands(): string[];
  getSemgrepLanguages(): string[];
  parseTestOutput(output: string): TestCounts;
  parseCoverageReport(dir: string): number;
  getProjectName(dir: string): string | null;
}
```

**File structure:**
```
src/lib/stacks/
├── types.ts          # StackProvider interface, StackName type, AppType
├── registry.ts       # Map<StackName, StackProvider>, detectStacks(), detectStack()
├── nodejs.ts         # NodejsProvider implements StackProvider
├── python.ts         # PythonProvider implements StackProvider
├── rust.ts           # RustProvider implements StackProvider
└── __tests__/
```

**Adding Go:**
1. Create `src/lib/stacks/go.ts` implementing `StackProvider`
2. Register it in `registry.ts`: `registry.set('go', new GoProvider())`
3. Create `patches/observability/go-*.yaml` Semgrep rules
4. Create `templates/Dockerfile.verify.go`
5. Done. Zero changes to coverage.ts, otlp.ts, docs-scaffold.ts, etc.

**Consumers change from:**
```typescript
if (stack === 'nodejs') { ... }
else if (stack === 'python') { ... }
else if (stack === 'rust') { ... }
```
**To:**
```typescript
const provider = getStackProvider(stack);
provider.detectCoverageConfig(dir);
```

**Multi-stack:** `detectStacks()` stays in `registry.ts`. Returns `StackDetection[]`. Each detection carries a reference to its provider.

---

### Decision 3: Agent Abstraction — Ralph Becomes One Implementation

**Problem:** 28 files reference Ralph directly. State files are written by bash, read by TypeScript. No versioned contract. If Ralph is replaced, 28 files break.

**Decision:** Create an `AgentDriver` interface. Ralph becomes one implementation. Future drivers (direct Claude API, other LLM CLIs) can be added.

```typescript
// src/lib/agents/types.ts
interface AgentDriver {
  readonly name: string;
  spawn(opts: SpawnOpts): AgentProcess;
  parseOutput(line: string): AgentEvent | null;
  getStatusFile(): string;
}

interface AgentProcess {
  stdout: Readable;
  stderr: Readable;
  on(event: 'close', handler: (code: number) => void): void;
  kill(signal?: string): void;
}

type AgentEvent =
  | { type: 'tool-start'; name: string }
  | { type: 'tool-complete'; name: string; args: string }
  | { type: 'text'; text: string }
  | { type: 'story-complete'; key: string; details: string }
  | { type: 'story-failed'; key: string; reason: string }
  | { type: 'iteration'; count: number }
  | { type: 'retry'; attempt: number; delay: number }
  | { type: 'result'; cost: number; sessionId: string };
```

**File structure:**
```
src/lib/agents/
├── types.ts          # AgentDriver, AgentProcess, AgentEvent interfaces
├── ralph.ts          # RalphDriver implements AgentDriver (wraps ralph.sh)
├── stream-parser.ts  # Moved from src/lib/ — parses Claude stream-json
└── __tests__/
```

**What changes:**
- `run.ts` imports `AgentDriver` instead of directly spawning ralph
- `run-helpers.ts` merges into `ralph.ts` (ralph-specific parsing)
- `ralph-prompt.ts` moves into `ralph.ts`
- State files (`.story_retries`, `.flagged_stories`) are managed by TypeScript, not bash

**What ralph.sh keeps:**
- Loop execution (iteration management)
- Claude Code CLI invocation
- Timeout handling
- But it reads/writes state through a JSON protocol, not raw files

---

### Decision 4: lib/ Restructuring — Subdirectories with Facades

**Problem:** `src/lib/` is a flat directory with 20+ files. No internal structure. Everything imports from everything. Coverage (617 lines), Docker (378 lines), OTLP (422 lines), beads (590 lines) — all monolithic.

**Decision:** Restructure `src/lib/` into domain subdirectories with index.ts facades.

```
src/lib/
├── stacks/           # Decision 2 — stack providers
│   ├── index.ts      # Re-exports: detectStack, detectStacks, getProvider
│   ├── types.ts
│   ├── registry.ts
│   ├── nodejs.ts
│   ├── python.ts
│   └── rust.ts
├── agents/           # Decision 3 — agent drivers
│   ├── index.ts
│   ├── types.ts
│   ├── ralph.ts
│   └── stream-parser.ts
├── coverage/         # Split from 617-line coverage.ts
│   ├── index.ts      # Re-exports: detectCoverageTool, runCoverage, evaluateCoverage
│   ├── types.ts      # CoverageToolInfo, CoverageResult, CoverageEvaluation
│   ├── runner.ts     # runCoverage, checkOnlyCoverage
│   ├── evaluator.ts  # evaluateCoverage, updateCoverageState
│   └── parser.ts     # parseTestCounts, parseCoverageReport (delegates to stack provider)
├── docker/           # Split from 378-line docker.ts
│   ├── index.ts
│   ├── compose.ts    # startStack, stopStack, startSharedStack
│   ├── health.ts     # getStackHealth, checkDocker
│   └── cleanup.ts    # cleanupOrphanedContainers, cleanupVerifyEnv
├── observability/    # OTLP config (not the observability module)
│   ├── index.ts
│   ├── instrument.ts # instrumentProject (delegates to stack provider)
│   ├── config.ts     # configureOtlpEnvVars, ensureServiceNameEnvVar
│   └── backends.ts   # Backend-specific query builders (Victoria, ELK)
├── sync/             # Split from 590-line beads-sync.ts
│   ├── index.ts
│   ├── beads.ts      # bdCommand, BeadsNotInstalledError
│   ├── sprint-yaml.ts # readSprintStatus (now generates from sprint-state.json)
│   └── story-files.ts # readStoryFileStatus, updateStoryFile
├── state.ts          # Project config (codeharness.local.md) — stays flat, <200 lines
├── output.ts         # CLI output helpers — stays flat, <50 lines
├── templates.ts      # Template file generation — stays flat, <50 lines
└── __tests__/        # Shared test utilities, fixtures
    ├── fixtures/     # Reusable test data (Cargo.toml variants, state files)
    └── helpers.ts    # Mock factories, state builders
```

**Import rules:**
- External consumers import from `src/lib/{domain}/index.ts` only
- Within a domain, files can import from siblings
- No cross-domain internal imports (e.g., `coverage/runner.ts` cannot import from `docker/compose.ts` directly — go through `docker/index.ts`)
- `src/lib/state.ts` and `src/lib/output.ts` are shared utilities — any file can import them

**Enforcement:** Add ESLint rule or boundary test that flags internal cross-domain imports.

---

### Decision 5: Observability Backend Choice — Victoria vs ELK vs Remote

**Problem:** VictoriaMetrics hardcoded everywhere. Ports hardcoded. No way to use ELK or a remote endpoint.

**Decision:** `codeharness init` asks for backend choice. Stored in state. All query builders and health checks dispatch on backend type.

```typescript
// In codeharness.local.md state
interface OtlpConfig {
  enabled: boolean;
  backend: 'victoria' | 'elk' | 'none';
  mode: 'local-shared' | 'remote';
  endpoints: {
    otel: string;     // OTLP collector (default: http://localhost:4318)
    logs: string;     // Log query API (Victoria: :9428, ELK: :9200)
    metrics: string;  // Metric query API (Victoria: :8428, ELK: :9200)
    traces: string;   // Trace query API (Victoria: :16686, Jaeger/Zipkin)
  };
  service_name: string;
}
```

**Backend-specific logic lives in `src/lib/observability/backends.ts`:**
```typescript
interface ObservabilityBackend {
  buildLogQuery(service: string, timeRange: string): string;
  buildMetricQuery(service: string, metric: string): string;
  buildTraceQuery(service: string, limit: number): string;
  getComposeFile(): string;
  getHealthCheck(): HealthCheckResult;
}
```

Two implementations: `VictoriaBackend`, `ElkBackend`. Selected by `state.otlp.backend`.

**Remote mode:** If `mode === 'remote'`, skip Docker compose entirely. Use provided endpoints. Health check pings the endpoints instead of checking containers.

**Init flow:**
```
codeharness init
  → Stack detected: Node.js + Rust
  → Observability backend: [victoria] elk none
  → Mode: [local] remote
  → (if remote) Endpoints: otel=..., logs=..., metrics=..., traces=...
```

---

### Decision 6: Retro-to-Sprint Pipeline — Tech Debt as First-Class Work

**Problem:** Session retros produce action items that never get actioned. Tech debt accumulates silently. No mechanism to feed retro findings back into the sprint.

**Decision:** Three mechanisms embedded in the sprint cycle:

**6a. Persistent epic-TD:**
- `epic-TD` in sprint-state.json is never marked `done`
- New stories append to it from any source (retro, audit, manual)
- harness-run Step 5 skips epic completion for `epic-TD`

**6b. Retro auto-creates stories (Step 8b):**
- After session retro writes the markdown file, harness-run parses `## 6. Action Items`
- `### Fix Now` and `### Fix Soon` items become `TD-N-slug: backlog` stories
- Deduplication: normalize text, compare against existing TD story titles (80% word overlap = skip)
- `### Backlog` items go to `tech-debt-backlog.md` for tracking only

**6c. Tech debt gate (Step 2 priority):**
- Before selecting ANY Tier D (backlog) story from a feature epic, check if `epic-TD` has pending work
- If yes, process TD stories first
- This ensures accumulated debt gets addressed before new features start

---

### Decision 7: Error Handling — No More Silent Swallowing

**Problem:** 53 bare `catch {}` blocks. Errors are logged as comments but not propagated. Debugging is impossible because stack traces are lost.

**Decision:** Three error strategies, no fourth:

1. **Result\<T\>** for all module-level functions that can fail expectably (file not found, parse error, subprocess failure). Already established — enforce it.

2. **Typed errors** for domain-specific failures:
```typescript
class BeadsNotInstalledError extends Error { ... }
class DockerNotAvailableError extends Error { ... }
class StateCorruptedError extends Error { ... }
class StackNotSupportedError extends Error { ... }
```

3. **Explicit ignore with reason** for truly non-fatal cases:
```typescript
try { ... }
catch {
  // IGNORE: cleanup failure is non-fatal — container may already be removed
}
```

**Banned:** `catch { }`, `catch { return null }`, `catch { /* fallthrough */ }` without an `// IGNORE:` comment explaining why.

**Enforcement:** ESLint rule `no-empty-catch` + custom rule requiring `// IGNORE:` comment in catch blocks that don't rethrow or return Result.fail().

---

### Decision 8: Command Structure — Thin Commands, Fat Modules

**Problem:** `status.ts` is 744 lines. Commands contain business logic (URL builders, formatters, story drill-down). Not testable without command wiring.

**Decision:** Commands are <100 lines. They parse CLI args, call a module function, format output. All business logic lives in modules.

```typescript
// src/commands/status.ts — THIN (< 100 lines)
export function registerStatusCommand(program: Command): void {
  program.command('status')
    .option('--check-docker', '...')
    .option('--story <key>', '...')
    .action(async (options) => {
      const result = await statusModule.getStatus(options);
      if (isOk(result)) {
        statusModule.formatOutput(result.data, options);
      } else {
        fail(result.error);
      }
    });
}
```

**Business logic moves to:**
```
src/modules/status/
├── index.ts        # getStatus, formatOutput
├── formatters.ts   # Human-readable + JSON formatting
├── endpoints.ts    # URL builders (moved from status.ts)
└── drill-down.ts   # Story detail logic (moved from status.ts)
```

**Same pattern for all commands >100 lines.** The command file is glue code. The module is testable independently.

---

### Decision 9: Template Unification — One System

**Problem:** Two parallel template systems: TypeScript generators in `src/templates/` and static files in `templates/`. Unclear when to use which.

**Decision:** All templates are static files in `templates/`. TypeScript code reads and interpolates them. No more generated-in-code templates.

```
templates/
├── dockerfiles/
│   ├── Dockerfile.nodejs         # Was nodejsTemplate() in TS
│   ├── Dockerfile.python
│   ├── Dockerfile.rust
│   ├── Dockerfile.generic
│   ├── Dockerfile.verify         # Node.js verification
│   ├── Dockerfile.verify.rust
│   └── Dockerfile.multi-stage.tmpl  # Template with {STAGES} and {COPIES} placeholders
├── otlp/
│   ├── nodejs.md
│   ├── python.md
│   └── rust.md
├── compose/
│   ├── victoria.yml
│   ├── elk.yml
│   └── otel-collector-config.yaml
├── prompts/
│   ├── ralph-prompt.md           # Was ralph-prompt.ts
│   ├── verify-prompt.md          # Was verify-prompt.ts
│   └── showboat-template.md
└── docs/
    ├── readme.md.tmpl            # Was readme.ts
    └── agents.md.tmpl            # Was generateAgentsMdContent()
```

**Interpolation:** A single `renderTemplate(path, vars)` function in `src/lib/templates.ts`. Variables use `{{var}}` syntax. No complex logic in templates — if logic is needed, the caller computes the value and passes it as a variable.

**Multi-stage Dockerfile:** The `Dockerfile.multi-stage.tmpl` has `{{BUILD_STAGES}}` and `{{COPY_DIRECTIVES}}` placeholders. The caller composes build stages from per-stack templates and passes them.

---

### Decision 10: Verification Environment — Stack-Aware Provisioning

**Problem:** Docker verify container under-provisioned for every project. Missing Rust version, system libs, clippy, tarpaulin. Fixed manually EVERY verification. PATH not inherited.

**Decision:** Verification Dockerfile is generated per-project based on detected stacks, not selected from a static template.

```typescript
// src/modules/verify/env.ts
function generateVerifyDockerfile(stacks: StackDetection[]): string {
  const sections: string[] = [];

  // Base image
  sections.push('FROM ubuntu:22.04');
  sections.push('ENV PATH="/root/.cargo/bin:/usr/local/bin:$PATH"');

  // Common tools
  sections.push('RUN apt-get update && apt-get install -y curl jq git python3 pipx');
  sections.push('RUN pipx install semgrep showboat');

  // Per-stack tooling
  for (const detection of stacks) {
    const provider = getStackProvider(detection.stack);
    sections.push(provider.getVerifyDockerfileSection());
  }

  // OTLP config
  sections.push('ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4318');

  return sections.join('\n\n');
}
```

Each `StackProvider` provides its verify Dockerfile section:
- **Rust:** Install rustup + stable toolchain + cargo-tarpaulin + clippy + system libs
- **Node.js:** Install Node.js + npm
- **Python:** Install pip + coverage

The Dockerfile is generated at `verify-env build` time, not selected from a static file. This ensures it always matches the project's needs.

---

### Decision 11: Process Enforcement — Embedded Quality Gates

**Problem:** Docker pre-check missing (wastes 30-min sessions). Subagents don't update status (reported 7+ times). Time budget ignored (3 sessions failed at verification). Architecture docs too large (>10k tokens).

**Decision:** Five embedded gates in harness-run:

| Gate | Where | What |
|------|-------|------|
| **Docker pre-check** | Step 1 pre-flight | `docker info` — fail fast if Docker not running |
| **Orphan cleanup** | Step 1 pre-flight | Remove leftover `codeharness-verify` containers |
| **State reconciliation** | Step 1 pre-flight | Rebuild sprint-state.json from sprint-status.yaml |
| **Time budget check** | Before each phase (3b, 3c, 3d) | Defer if remaining < estimated phase duration |
| **Status ownership** | After each subagent | Orchestrator owns all status writes — verify and fix |

**Subagent status enforcement:** Remove all instructions that tell subagents to update sprint-status.yaml. Subagents are read-only on state. The orchestrator reads the subagent's output, determines the status transition, and writes it. This is the only reliable pattern.

**Time budget awareness:**
```
Phase estimates:
  create-story: 5 min
  dev-story: 15 min
  code-review: 10 min
  verification: 20 min
  retro: 5 min

Before each phase: if remaining_time < phase_estimate, defer.
```

---

### Decision 12: File Size Enforcement — CI Gate

**Problem:** 12 files exceed 300 lines. Worst: 832 lines. The rule exists but nobody enforces it.

**Decision:** Add a CI check that fails the build if any `.ts` file in `src/` exceeds 300 lines.

```bash
# In CI pipeline, after build
find src -name '*.ts' -not -path '*__tests__*' -exec awk 'END{if(NR>300)print FILENAME": "NR" lines"}' {} \; | tee /dev/stderr | grep -q . && exit 1
```

**Existing violations get a migration path:** Each over-limit file gets a story in epic-TD to split it. The CI gate starts as a warning, becomes a hard failure after all files are under 300 lines.

**Current violators and their target split:**

| File | Lines | Split Into |
|------|-------|-----------|
| `doc-health.ts` | 832 | `doc-health/scanner.ts`, `doc-health/staleness.ts`, `doc-health/report.ts` |
| `status.ts` (command) | 744 | Move logic to `modules/status/` |
| `coverage.ts` | 617 | `coverage/runner.ts`, `coverage/evaluator.ts`, `coverage/parser.ts` |
| `beads-sync.ts` | 590 | `sync/beads.ts`, `sync/sprint-yaml.ts`, `sync/story-files.ts` |
| `bmad.ts` | 522 | `sync/bmad-bridge.ts`, `sync/epic-generator.ts` |
| `scanner.ts` | 447 | `scanner/file-scanner.ts`, `scanner/coverage-scanner.ts` |
| `otlp.ts` | 422 | `observability/instrument.ts`, `observability/config.ts` |

---

## Module Structure (Target)

```
src/
├── commands/           # Thin command wiring (<100 lines each)
│   ├── init.ts
│   ├── run.ts
│   ├── status.ts
│   ├── audit.ts
│   ├── verify.ts
│   ├── coverage.ts
│   ├── stack.ts
│   └── ...
├── lib/                # Shared utilities (domain subdirectories)
│   ├── stacks/         # Stack provider pattern (Decision 2)
│   ├── agents/         # Agent driver pattern (Decision 3)
│   ├── coverage/       # Coverage detection, execution, parsing
│   ├── docker/         # Docker compose, health, cleanup
│   ├── observability/  # OTLP instrumentation, backend queries
│   ├── sync/           # Beads, sprint YAML, story files
│   ├── state.ts        # Project config (codeharness.local.md)
│   ├── output.ts       # CLI output helpers
│   └── templates.ts    # Template interpolation
├── modules/            # Business logic modules
│   ├── sprint/         # Sprint state, story selection, progress
│   │   ├── index.ts
│   │   ├── state.ts    # Unified sprint-state.json read/write
│   │   ├── selector.ts # Story prioritization (Tier A/B/C/D)
│   │   └── progress.ts # Live progress updates
│   ├── verify/         # Verification orchestration
│   │   ├── index.ts
│   │   ├── env.ts      # Generated Dockerfile, container lifecycle
│   │   ├── runner.ts   # Verification session management
│   │   └── proof.ts    # Proof parsing and validation
│   ├── audit/          # Compliance checking
│   │   ├── index.ts
│   │   ├── dimensions.ts
│   │   └── report.ts
│   ├── observability/  # Static analysis, runtime validation
│   │   ├── index.ts
│   │   ├── analyzer.ts
│   │   ├── runtime.ts
│   │   └── types.ts
│   ├── infra/          # Init, docs scaffold, Docker setup
│   │   ├── index.ts
│   │   ├── init-project.ts
│   │   ├── docs-scaffold.ts
│   │   └── dockerfile-template.ts
│   ├── review/         # Code review enforcement
│   └── status/         # Status display logic (moved from command)
│       ├── index.ts
│       ├── formatters.ts
│       ├── endpoints.ts
│       └── drill-down.ts
├── types/              # Shared types
│   └── result.ts       # Result<T> pattern
└── index.ts            # CLI entry point, command registration

templates/              # All templates (static files, interpolated at runtime)
├── dockerfiles/
├── otlp/
├── compose/
├── prompts/
└── docs/

ralph/                  # Agent execution loop (bash)
├── ralph.sh
├── drivers/
└── lib/

patches/                # Enforcement rules
├── observability/      # Semgrep rules (per-language)
└── infra/              # Dockerfile rules

hooks/                  # Claude Code plugin hooks
commands/               # Claude Code plugin commands (markdown)
skills/                 # Claude Code plugin skills
knowledge/              # Claude Code plugin knowledge
```

---

## Implementation Patterns

### Result\<T\> — Mandatory for All Module Functions

```typescript
import { ok, fail, isOk } from '../types/result.js';
import type { Result } from '../types/result.js';

function doThing(): Result<Data> {
  if (bad) return fail('reason');
  return ok(data);
}
```

No exceptions for module-level public functions. Commands catch Result.fail and format errors.

### Typed Errors — For Domain-Specific Failures

```typescript
class BeadsNotInstalledError extends Error { name = 'BeadsNotInstalledError'; }
class DockerNotAvailableError extends Error { name = 'DockerNotAvailableError'; }
```

Callers catch specific types, not bare `catch`.

### Stack Provider — Polymorphic Dispatch

```typescript
const provider = getStackProvider(stack);
const coverage = provider.detectCoverageConfig(dir);
const dockerfile = provider.getDockerfileTemplate();
```

Never `if (stack === 'nodejs')` in consumer code.

### Atomic State Writes

```typescript
function writeStateAtomic(path: string, data: unknown): void {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}
```

All state files. No partial writes.

### Template Interpolation

```typescript
function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let content = readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}
```

Simple. No template engine dependency.

---

## NFRs (Enforced, Not Aspirational)

| NFR | Rule | Enforcement |
|-----|------|-------------|
| NFR1 | No file >300 lines (excluding tests) | CI gate |
| NFR2 | Result\<T\> for all module public functions | Code review checklist |
| NFR3 | No bare `catch {}` without `// IGNORE:` comment | ESLint rule |
| NFR4 | No direct stack conditionals outside `src/lib/stacks/` | Boundary test |
| NFR5 | Commands <100 lines | CI gate |
| NFR6 | Module imports only through index.ts | Boundary test |
| NFR7 | Atomic writes for all state files | Code review checklist |
| NFR8 | All templates in `templates/` directory (not generated in TS) | Convention |
| NFR9 | Test coverage ≥90% | CI gate |

---

## Migration Strategy

This is NOT a big-bang rewrite. Migration is epic-by-epic:

**Phase 1: Foundation (Epic 10)**
- Create `src/lib/stacks/` with provider pattern
- Migrate Node.js, Python, Rust to providers
- Delete 41 if/else branches across 8 files

**Phase 2: State Consolidation (Epic 11)**
- Unify sprint-state.json schema
- Migrate `.story_retries` and `.flagged_stories` into it
- Make sprint-status.yaml a derived view
- Add schema versioning

**Phase 3: lib/ Restructuring (Epic 12)**
- Split oversized files into domain subdirectories
- Move business logic from commands to modules
- Add boundary tests

**Phase 4: Agent Abstraction (Epic 13)**
- Create AgentDriver interface
- Wrap Ralph behind it
- Move ralph-specific parsing into ralph driver

**Phase 5: Process Fixes (Epic 14)**
- Retro-to-sprint pipeline
- Tech debt gate
- Docker pre-check, time budget, subagent enforcement
- Observability backend choice
- Verification environment generation

**Phase 6: Enforcement (Epic 15)**
- CI file size gate
- ESLint no-empty-catch rule
- Boundary test for stack conditionals
- Template migration

Each phase produces working software. No phase depends on all other phases being complete. The order is: foundations → state → structure → abstraction → process → enforcement.

---

## Validation

### Current Architecture Gaps Addressed

| Gap | Decision |
|-----|----------|
| 5+ state files, no sync | Decision 1 (Unified State) |
| 41 stack conditionals | Decision 2 (Stack Provider) |
| 28 files coupled to Ralph | Decision 3 (Agent Abstraction) |
| lib/ is a flat dumping ground | Decision 4 (lib/ Restructuring) |
| Hardcoded VictoriaMetrics | Decision 5 (Backend Choice) |
| Retro items never actioned | Decision 6 (Retro-to-Sprint Pipeline) |
| 53 bare catch blocks | Decision 7 (Error Handling) |
| Commands contain business logic | Decision 8 (Thin Commands) |
| Two template systems | Decision 9 (Template Unification) |
| Under-provisioned verify containers | Decision 10 (Stack-Aware Provisioning) |
| Missing process gates | Decision 11 (Process Enforcement) |
| 12 files over 300 lines | Decision 12 (File Size CI Gate) |

### Readiness: YES — with phased migration
