---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-15'
inputDocuments:
  - prd.md (v2)
  - product-brief-bmad-orchestrator-2026-03-14.md
  - research/technical-bmad-orchestrator-implementation-research-2026-03-14.md
  - prd-validation-report.md (v2)
  - architecture-v1 (in-session context)
workflowType: 'architecture'
project_name: 'codeharness'
user_name: 'BMad'
date: '2026-03-14'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
69 FRs across 11 capability areas. The core is a CLI-driven harness lifecycle (init→bridge→run→verify→status→onboard→teardown) with beads as the unified task store and Claude Code hooks for mechanical enforcement. Key architectural driver: the CLI does all mechanical work — the plugin is a thin wrapper.

**Non-Functional Requirements:**
28 NFRs across performance (hooks <500ms, init <5min, bridge <10s), integration (plugin coexistence, pinned versions, beads hook compatibility), and reliability (crash recovery, state file corruption handling, idempotent operations). Single-user local development tool — no scalability, availability, or concurrency requirements.

**Scale & Complexity:**

- Primary domain: npm CLI package (Node.js) + Claude Code plugin (markdown/bash/JSON)
- Complexity level: Medium-High — dual runtime (Node.js + bash), 5 external tool integrations, beads task store, BMAD workflow patching
- Estimated architectural components: ~20 (7 CLI commands, 4 hooks, 3 skills, 2 agents, 6 lib modules, templates, vendored Ralph)

### Technical Constraints & Dependencies

- **Node.js CLI** — Commander.js for command parsing. npm for distribution. Must bundle templates, vendored Ralph, and plugin scaffold.
- **Claude Code plugin system** — Plugin auto-discovery from directory structure. Hooks registered via `hooks.json`. Commands invoked as slash commands.
- **Bash hooks** — Hook scripts are bash, must work on macOS + Linux. Call CLI for state updates. Must coexist with beads git hooks.
- **Docker** — Required only when observability enforcement is enabled. VictoriaMetrics stack runs in Docker.
- **Beads** — External dependency (`pip install beads`). Git-backed JSONL. Has its own git hooks that may conflict with codeharness hooks.
- **Vendored Ralph** — ~500 lines of bash. Invoked by CLI via `child_process.spawn`. Reads tasks from `bd ready --json`. Fresh context per iteration.
- **External tools** — Showboat (Python, pip), agent-browser (npm), OTLP packages (per-stack). All auto-installed by CLI with fallback chains.
- **State file** — `.claude/codeharness.local.md` with YAML frontmatter. Single source of truth. Read by hooks (bash), written by CLI (Node.js).

### Cross-Cutting Concerns Identified

1. **Two-runtime coordination** — Node.js CLI and bash scripts (hooks, Ralph) must share state via the `.local.md` file. Both read YAML. CLI writes, hooks read. Beads CLI (Python) is a third runtime.
2. **Beads sync** — Beads issue status and BMAD story file status must stay in sync. Bridge creates the link. `bd close` must trigger story file update. Two-layer model (beads = status, files = content).
3. **Docker lifecycle** — Start, stop, health check. Must handle: not installed (skip if observability OFF), not started, started, crashed, user stopped manually. CLI owns this.
4. **Hook coexistence** — Codeharness hooks (Claude Code `hooks.json`) + beads git hooks (`prepare-commit-msg`, `post-checkout`) + possible user git hooks. Must detect and configure coexistence during init.
5. **Template availability** — v1 failed because templates were missing files. v2 embeds templates in the npm package. CLI generates files from embedded templates, never copies from external directories.
6. **Idempotency** — Every CLI command must be safe to re-run. Init twice = same result. Bridge twice = same beads state. Patches applied twice = no duplication (marker-based).
7. **BMAD patch coordination** — 5 BMAD workflow files patched with harness requirements. Patches use markers for idempotency. Must detect BMAD version and adapt.

## Starter Template Evaluation

### Primary Technology Domain

Node.js CLI tool — npm package with Commander.js, distributed globally. No web framework, no UI, no database. The CLI orchestrates external tools and generates files.

### Starter Options Considered

**Option A: `npm init` + manual setup**
- Bare Node.js project. Add Commander.js, TypeScript, Vitest manually.
- Full control. More setup work.

**Option B: `oclif` (Salesforce CLI framework)**
- Full-featured CLI framework with plugin system, auto-generated help, TypeScript-first.
- Overkill — oclif is for complex multi-command CLIs with plugin ecosystems. codeharness has 7 commands, not 70.

**Option C: `tsup` + Commander.js**
- TypeScript bundler + Commander.js. Fast builds, ESM/CJS dual output, minimal config.
- Right-sized. TypeScript compilation, tree-shaking, single entry point.

### Selected Starter: Manual scaffold with tsup + Commander.js

**Rationale:** codeharness is a focused CLI with 7 commands. oclif adds unnecessary abstraction. Manual scaffold with tsup gives us TypeScript, fast builds, and full control over the project structure. Commander.js is battle-tested for this scale.

**Initialization:**

```bash
mkdir codeharness && cd codeharness
npm init -y
npm install commander
npm install -D typescript tsup vitest @types/node
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- TypeScript with strict mode
- Node.js >= 18 (LTS)
- ESM modules (`"type": "module"` in package.json)
- tsup for compilation → `dist/` output

**Build Tooling:**
- `tsup src/index.ts --format esm` — single entry point, tree-shaken
- `"bin": { "codeharness": "./dist/index.js" }` in package.json
- No watch mode needed — CLI is built, not served

**Testing Framework:**
- Vitest for TypeScript unit tests (`src/**/*.test.ts`)
- BATS for bash integration tests (Ralph loop, hooks)
- c8 for coverage (built into Vitest)

**Code Organization:**
```
codeharness/
├── src/
│   ├── index.ts                    # CLI entry point (Commander.js)
│   ├── commands/
│   │   ├── init.ts                 # codeharness init
│   │   ├── bridge.ts               # codeharness bridge
│   │   ├── run.ts                  # codeharness run
│   │   ├── verify.ts               # codeharness verify
│   │   ├── status.ts               # codeharness status
│   │   ├── onboard.ts              # codeharness onboard
│   │   └── teardown.ts             # codeharness teardown
│   ├── lib/
│   │   ├── state.ts                # State file read/write
│   │   ├── docker.ts               # Docker lifecycle management
│   │   ├── beads.ts                # Beads CLI wrapper
│   │   ├── bmad.ts                 # BMAD install + patching
│   │   ├── stack-detect.ts         # Stack detection (Node.js, Python)
│   │   ├── deps.ts                 # Dependency auto-install
│   │   └── templates.ts            # Template generation from embedded content
│   └── templates/                  # Embedded templates (compiled into dist/)
│       ├── docker-compose.ts       # Docker Compose template strings
│       ├── otel-config.ts          # OTel Collector config
│       ├── bmad-patches.ts         # BMAD workflow patches
│       ├── plugin-scaffold.ts      # Plugin directory structure
│       └── showboat-template.ts    # Proof document template
├── plugin/                         # Claude Code plugin (generated into project)
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/                   # Slash commands → invoke CLI
│   ├── hooks/                      # Bash hooks → call CLI for state
│   ├── skills/                     # Agent knowledge files
│   ├── agents/                     # Subagent specs
│   └── knowledge/                  # Reference material
├── ralph/                          # Vendored Ralph loop (bash)
│   ├── ralph.sh
│   ├── drivers/
│   │   └── claude-code.sh
│   └── lib/
├── test/
│   ├── unit/                       # Vitest tests for src/
│   ├── integration/                # BATS tests for bash scripts
│   └── fixtures/                   # Test data
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

**Development Workflow:**
- `npm run build` — tsup compiles TypeScript → `dist/`
- `npm test` — Vitest runs unit tests
- `npm run test:integration` — BATS runs bash tests
- `npm link` — global install for local testing
- `claude --plugin-dir ./plugin` — test plugin in Claude Code

**Note:** Project initialization is the first implementation story.

## Core Architectural Decisions

### Decision 1: CLI ↔ Plugin Boundary

**Decision:** Strict separation — CLI owns all mechanical work, plugin owns all agent interaction.

| Layer | Owns | Examples |
|-------|------|---------|
| **CLI** (`codeharness` npm) | Execution, state mutation, external tool orchestration | Stack detection, Docker start/stop, BMAD patching, beads import, template generation, state file writes |
| **Plugin** (markdown/bash/JSON) | Agent interface, knowledge, enforcement signals | Slash commands that invoke CLI, hooks that read state and block/prompt, skills that teach patterns, agents that run verification |
| **Hooks** (bash, in plugin) | Thin bridges — read state from CLI, send signals to agent | `pre-commit-gate.sh` reads `tests_passed` flag, blocks if false. Does NOT run tests itself — CLI does that. |

**Rationale:** v1 failed because the plugin tried to be both interface AND implementation via markdown. The CLI is testable, debuggable, deterministic. The plugin is declarative — it tells the agent what to do and when, but the CLI does the doing.

**Rule:** If it mutates state, generates files, or calls external tools → CLI. If it guides the agent, blocks actions, or provides knowledge → plugin.

### Decision 2: State Management

**Decision:** Single state file (`.claude/codeharness.local.md`) written exclusively by CLI, read by hooks and plugin.

**State file ownership:**
- **CLI writes** — all state mutations go through `src/lib/state.ts`
- **Hooks read** — bash hooks use `grep`/`sed` to read YAML values (fast, <500ms NFR1)
- **Plugin skills reference** — skills tell the agent what state fields mean
- **Beads is separate** — beads has its own state (`.beads/`). No duplication. CLI reads beads via `bd` commands when needed.

**Canonical state file structure:**
```yaml
---
harness_version: "0.1.0"
initialized: true
stack: "nodejs"
enforcement:
  frontend: true
  database: true
  api: true
  observability: true
coverage:
  target: 100
  baseline: null
  current: null
  tool: "c8"
session_flags:
  logs_queried: false
  tests_passed: false
  coverage_met: false
  verification_run: false
verification_log: []
---
```

**Session flag lifecycle:**
1. `session-start.sh` hook resets all flags to `false`
2. Agent runs tests → CLI command `codeharness state set tests_passed true`
3. Agent checks coverage → CLI command `codeharness state set coverage_met true`
4. Agent runs verification → CLI command `codeharness state set verification_run true`
5. `pre-commit-gate.sh` reads flags, blocks if any are `false`

**Rationale:** v1's critical failure was that flags were never set. The CLI exposes `codeharness state set <key> <value>` as a subcommand. Hooks call it. The agent calls it. No more "flags hardcoded false forever."

### Decision 3: Beads Integration

**Decision:** Beads is the unified task store. CLI wraps `bd` commands. Two-layer model: beads = status/ordering, story files = content.

**Bridge flow:**
```
codeharness bridge --epics epics.md
  ├── Parse BMAD stories (src/lib/bmad.ts)
  ├── For each story:
  │   ├── bd create "Story title" --type story --priority N
  │   ├── Set description = path to story file
  │   └── Set deps from story dependencies
  └── Report: "Imported N stories into beads"
```

**Beads ↔ story file sync:**
- Bridge creates the link (beads issue description → story file path)
- When Ralph completes a story: CLI runs `bd close <id>` AND updates story file status
- `codeharness status` reads from beads (`bd list --json`) for sprint progress

**Hook conflict resolution:**
- `codeharness init` detects `.beads/hooks/` directory
- Beads hooks are git hooks, codeharness hooks are Claude Code hooks — different systems, no conflict by default
- If both modify git hooks: CLI chains them in a harness-managed hooks directory

**Rationale:** Beads gives us dependency tracking, `bd ready` for task selection, and git-native JSONL persistence. The two-layer model keeps rich story content in files where BMAD workflows expect it, while beads handles the operational layer.

### Decision 4: Ralph Integration

**Decision:** CLI invokes vendored Ralph via `child_process.spawn`. Ralph reads from beads via `bd ready --json`.

**Invocation:**
```typescript
// src/commands/run.ts
spawn('bash', ['ralph/ralph.sh',
  '--plugin-dir', pluginPath,
  '--task-source', 'beads',
  '--max-iterations', '50'
], { stdio: 'inherit' });
```

**Ralph modifications for beads:**
- Ralph's `task_sources.sh` already has `fetch_beads_tasks()` — use it
- Remove progress.json dependency. Task state lives in beads.
- `bd ready --json` returns next unblocked task
- `bd update <id> --status in_progress` when story starts
- `bd close <id>` when verification passes

**Verification gates:**
- After each iteration, CLI runs `codeharness verify --story <id>`
- If pass → `bd close`, next story
- If fail → iterate on same story

**Rationale:** Ralph's loop is battle-tested. We configure it to read from beads instead of progress.json. The CLI handles pre/post iteration logic.

**Amendment (2026-03-15): Sprint Execution Skill as Single Execution Engine**

The sprint execution skill (`/harness-run`) is the single source of sprint execution logic. Two execution modes exist, both using the same skill:

1. **In-session** (skill directly): User runs `/harness-run` in current Claude Code session. Skill uses Agent tool for fresh context per story. Reads sprint-status.yaml. No external processes.

2. **Multi-session** (Ralph wrapper): Ralph spawns Claude Code instances. Each instance runs `/harness-run`. Ralph handles rate limiting, circuit breaker, crash recovery, timeout management. Ralph does NOT implement task-picking or verification gates.

Architecture change:
- OLD: Ralph → progress.json → custom prompt → agent improvises
- NEW: Ralph → spawns Claude → `/harness-run` skill → BMAD workflows

Ralph's removed responsibilities (moved to skill):
- Task picking (get_current_task) → skill reads sprint-status.yaml
- Verification gates (verify_gates.sh) → skill's story-completion flow
- Progress tracking → sprint-status.yaml (single source of truth)

Ralph's retained responsibilities:
- Session spawning (fresh Claude Code instances)
- Rate limiting (API call tracking)
- Circuit breaker (stagnation detection)
- Crash recovery (resume from last sprint-status.yaml state)
- Timeout management (per-session and total loop)

### Decision 5: Docker Lifecycle

**Decision:** CLI manages Docker Compose via `child_process.exec`. Docker required only when `enforcement.observability` is `true`.

**Skip logic:**
- `enforcement.observability === false` → skip Docker entirely during init
- Docker not installed + observability ON → clear error, halt init
- Docker not installed + observability OFF → silently skip

**Template generation from enforcement config:**
- Base services: VictoriaLogs + VictoriaMetrics + OTel Collector
- Optional: VictoriaTraces (if tracing needed)
- Optional: Grafana (always included when observability ON)

**Rationale:** v1 required Docker even when observability was OFF. CLI checks enforcement config first.

### Decision 6: Template Embedding

**Decision:** All templates are TypeScript string literals in `src/templates/`, compiled into the npm package. Never copies from external files.

**Template modules:**
- `src/templates/docker-compose.ts` — Docker Compose YAML
- `src/templates/otel-config.ts` — OTel Collector configuration
- `src/templates/bmad-patches.ts` — BMAD workflow patches with markers
- `src/templates/plugin-scaffold.ts` — Plugin directory and file contents
- `src/templates/showboat-template.ts` — Proof document skeleton

**Rationale:** v1's "missing templates" gap. Embedding as TypeScript means `npm install -g codeharness` includes everything.

### Decision 7: BMAD Patching

**Decision:** CLI applies patches using marker-based idempotency. Patches embedded as templates.

**Marker format:**
```markdown
<!-- CODEHARNESS-PATCH-START:{patch_name} -->
{patch content}
<!-- CODEHARNESS-PATCH-END:{patch_name} -->
```

**Patch targets:**
1. Story template — verification + documentation + testing requirements
2. Dev-story workflow — observability, docs, tests enforcement
3. Code-review workflow — Showboat proof, AGENTS.md freshness, coverage
4. Retrospective workflow — verification effectiveness, doc health, test quality
5. Sprint-planning workflow — `bd ready` for backlog

**BMAD installation:**
- `_bmad/` missing → `npx bmad-method init` → apply patches
- `_bmad/` exists → detect version → apply/update patches
- bmalph artifacts found → note in onboard findings

**Rationale:** Idempotent patches with markers. Safe to re-run. Replace-between-markers handles updates.

### Decision 8: Verification Pipeline

**Decision:** CLI orchestrates verification. Agent executes verification steps in isolated context via Agent tool.

**Flow:**
```
codeharness verify --story <story-id>
  ├── Read story file → extract ACs
  ├── Check pre-conditions (tests_passed, coverage_met)
  ├── Agent executes verification (Showboat, agent-browser, curl, DB MCP)
  ├── Check proof exists at verification/{story-id}-proof.md
  ├── Update state: verification_run = true
  └── Update beads: bd close <story-id>
```

**Rationale:** Verification consumes significant context. Isolating it prevents implementation context pollution. CLI handles bookkeeping.

### Decision 9: Brownfield Onboarding

**Decision:** Multi-phase CLI command: scan → coverage → audit → epic → beads import → Ralph execution.

**Module detection:**
- Configurable minimum file threshold (default 3, NFR27)
- Subdirectories below threshold grouped with parent

**bmalph detection:**
- `.ralph/.ralphrc` found → create beads issue for cleanup
- Preserves BMAD artifacts, flags bmalph-specific files only

**Rationale:** Onboarding is the first sprint. Flows through same pipeline as all other work.

### Decision 10: GitHub Integration & Retro Issue Loop

**Decision:** Retro findings flow through beads (universal store) with optional GitHub issue creation. GitHub issues feed back into beads for sprint planning.

**`gh` CLI dependency:** External — not bundled. Detected at runtime via `which gh`. If unavailable, GitHub operations are skipped with warning. Beads import always proceeds.

**Retro finding flow:**
```
codeharness retro-import --epic N
  ├── Read epic-N-retrospective.md
  ├── Extract action items from markdown table
  ├── Classify each: project | harness | tool:<name>
  ├── For each item:
  │   ├── bd createOrFind with [gap:retro:epic-N-item-M] dedup
  │   └── gh issue create (if retro_issue_targets configured)
  └── Report: "Imported N items, skipped M (existing)"
```

**GitHub import flow:**
```
codeharness github-import [--repo owner/repo] [--label sprint-candidate]
  ├── gh issue list --label sprint-candidate --json
  ├── For each issue:
  │   └── bd createOrFind with [source:github:owner/repo#N] dedup
  └── Report: "Imported N issues, skipped M (existing)"
```

**Config schema (codeharness.local.md frontmatter):**
```yaml
retro_issue_targets:
  - repo: auto                          # auto-detect from git remote
    labels: ["retro-finding", "sprint-candidate"]
  - repo: iVintik/codeharness           # always harness repo
    labels: ["user-retro", "auto-filed"]
```

**Rationale:** Beads remains the universal store (per Decision 3). GitHub issues are an external source/destination, not a replacement for beads. The `retro_issue_targets` config makes cross-project issue creation pluggable without hardcoding repos.

### Decision Impact Analysis

**Implementation sequence:**
1. Project scaffold (package.json, tsconfig, tsup, Commander.js)
2. Core lib: state.ts, templates.ts, stack-detect.ts
3. `codeharness init` (stack detect, deps, state file, templates)
4. `codeharness bridge` (BMAD parsing → beads import)
5. Beads integration (lib/beads.ts, hook conflict resolution)
6. BMAD patching (lib/bmad.ts, embedded patches)
7. Plugin scaffold generation
8. Hook architecture (bash → CLI state calls)
9. `codeharness verify` (verification orchestration)
10. `codeharness run` (Ralph with beads task source)
11. `codeharness onboard` (scan, coverage, audit, epic)
12. `codeharness status` + `codeharness teardown`

**Cross-component dependencies:**
- Hooks depend on state file format (D2) and CLI `state set` command
- Bridge depends on BMAD parser (D3) and beads wrapper (D3)
- Ralph depends on beads `bd ready` (D4) and verification gates (D8)
- Verification depends on state flags (D2) and Showboat proof format (D8)
- Onboard depends on beads import (D3) and module detection config (D9)

## Implementation Patterns & Consistency Rules

### Critical Conflict Points

8 areas where AI agents could make different choices when implementing codeharness components.

### State File Patterns

**YAML field naming:** `snake_case` always
```yaml
# ✅ Correct
session_flags:
  tests_passed: true
  coverage_met: false

# ❌ Wrong
sessionFlags:
  testsPassed: true
```

**Booleans:** `true`/`false` (YAML native, not strings)
**Arrays:** YAML flow style for short lists, block style for long
**Null:** `null` (not empty string, not omitted)

**State reading (canonical bash pattern):**
```bash
STATE_FILE=".claude/codeharness.local.md"

get_state() {
  local key="$1"
  sed -n '/^---$/,/^---$/p' "$STATE_FILE" | grep "^  ${key}:" | sed "s/^  ${key}: *//"
}
```

**State writing (CLI only):**
```bash
codeharness state set tests_passed true
codeharness state set coverage_met true
```

### Hook Script Patterns

**Hook JSON output (canonical format):**
```bash
# Allow action
echo '{"decision": "allow"}'
exit 0

# Block action
echo '{"decision": "block", "reason": "Tests must pass before commit. Run: codeharness state set tests_passed true"}'
exit 2

# Prompt injection (PostToolUse)
echo '{"message": "Query VictoriaLogs for errors after test run."}'
exit 0
```

**Exit code rules:**
- `exit 0` — allow / success
- `exit 2` — intentional block (hook decided to block)
- Never `exit 1` — that signals hook script failure, not intentional block

**Error handling:**
- Always check file existence before reading
- If state file missing → `echo '{"decision": "allow"}'` and exit 0 (fail open)
- All error messages must be actionable (tell the user what to do)

**Hook → CLI calls:**
```bash
# Hooks call CLI for state updates, never write state directly
codeharness state set tests_passed true
codeharness status --check-docker
```

### CLI Output Patterns

**Status prefixes:**
```
[OK]   Success message
[WARN] Warning message
[FAIL] Error message
[INFO] Informational message
```

**JSON mode:** All commands support `--json` flag for machine-readable output
```bash
codeharness status --json
# Returns: {"initialized": true, "stack": "nodejs", "docker": "running", ...}
```

**Progress reporting:** Use inline updates for long operations
```
[INFO] Installing dependencies...
[OK]   Showboat: installed (v0.6.1)
[OK]   agent-browser: installed
[WARN] Docker: not installed (observability disabled, skipping)
```

**Exit codes:**
- 0 — success
- 1 — error (something failed)
- 2 — invalid usage (bad arguments)

### Template Patterns

**Template functions:** TypeScript functions that accept a config object and return a string
```typescript
// src/templates/docker-compose.ts
export function dockerComposeTemplate(config: {
  observability: boolean;
  projectName: string;
}): string {
  return `version: '3.8'
services:
  victoria-logs:
    image: victoriametrics/victoria-logs:v1.15.0
    ...
${config.observability ? tracesService() : ''}`;
}
```

**Variable substitution:** Template literal interpolation (TypeScript native). No custom template engine.
**Pinned versions:** All Docker image tags and tool versions are constants, never `latest`.

### Beads Interaction Patterns

**CLI wrapper (src/lib/beads.ts):**
```typescript
import { execSync } from 'child_process';

function bdCommand(args: string[]): any {
  const result = execSync(`bd ${args.join(' ')} --json`, { encoding: 'utf-8' });
  return JSON.parse(result);
}

export function createIssue(title: string, opts: BeadsCreateOpts): string {
  return bdCommand(['create', `"${title}"`, ...formatOpts(opts)]);
}

export function getReady(): BeadsIssue[] {
  return bdCommand(['ready']);
}
```

**Always use `--json` flag** when calling `bd` programmatically.
**Error handling:** If `bd` command fails, throw with clear message including the failed command.

### BMAD Patch Patterns

**Marker format (never deviate):**
```markdown
<!-- CODEHARNESS-PATCH-START:{patch_name} -->
{patch content}
<!-- CODEHARNESS-PATCH-END:{patch_name} -->
```

**Patch names:** `kebab-case`, descriptive: `story-verification`, `dev-enforcement`, `review-enforcement`, `retro-enforcement`, `sprint-beads`

**Insertion logic:**
1. Check if markers exist → if yes, replace content between markers (update)
2. If no markers → find appropriate insertion point in workflow file → append with markers

### Showboat Proof Patterns

**File naming:** `verification/{story-id}-proof.md`
**Screenshots:** `verification/screenshots/{story-id}-{ac-number}-{description}.png`

**Document structure:**
```markdown
# Verification Proof: {story-id}

## Story: {story title}

## Acceptance Criteria Verification

### AC1: {criterion description}
<!-- showboat exec and image blocks -->

### AC2: {criterion description}
<!-- showboat exec and image blocks -->

## Verification Summary
- Total ACs: {count}
- Verified: {count}
- Failed: {count}
- Showboat verify: PASS/FAIL
```

**Rules:**
- One proof document per story
- One section per acceptance criterion
- `showboat verify` must pass before story completion

### Error Handling Patterns

**CLI commands:**
- Validate arguments first → exit 2 if invalid
- Check preconditions (state file exists, Docker running, beads available) → exit 1 with actionable message
- Catch external tool failures → wrap with context ("Showboat failed: {original error}. Try: pip install showboat")
- Never swallow errors silently

**Hooks:**
- Fail open if state file missing (allow action, don't block)
- Never crash — always output valid JSON
- Log errors to stderr, decisions to stdout

### Enforcement Guidelines

**All AI agents implementing codeharness MUST:**
- Use `snake_case` for all YAML fields in state file
- Use canonical hook JSON output format
- Use `[OK]`/`[FAIL]`/`[WARN]`/`[INFO]` prefixes for CLI output
- Use marker-based patches for BMAD files
- Never `exit 1` in hooks
- Always call `bd` with `--json` flag
- Pin all Docker image tags and tool versions

**Anti-Patterns:**
- ❌ Hooks writing to state file directly (use CLI `state set`)
- ❌ Custom YAML parsing in hooks (use `get_state` function)
- ❌ `console.log` style debugging in production hooks
- ❌ Hardcoded Docker image tags without version pins
- ❌ Storing state outside `.claude/codeharness.local.md`
- ❌ Template files on disk that could be missing (embed in code)

## Project Structure & Boundaries

### Complete Project Directory Structure

```
codeharness/
├── src/
│   ├── index.ts                        # CLI entry point (Commander.js program)
│   ├── commands/
│   │   ├── init.ts                     # FR1-FR11: Stack detect, deps, Docker, BMAD, state
│   │   ├── bridge.ts                   # FR33, FR40-FR41: BMAD parsing → beads import
│   │   ├── run.ts                      # FR47-FR51: Ralph invocation with beads task source
│   │   ├── verify.ts                   # FR20-FR25, FR49: Verification orchestration
│   │   ├── status.ts                   # FR67-FR69: Harness health, beads summary
│   │   ├── onboard.ts                  # FR61-FR66: Scan, coverage, audit, epic → beads
│   │   ├── teardown.ts                 # FR11: Docker down, remove artifacts, preserve code
│   │   └── state.ts                    # FR30: `codeharness state set <key> <value>`
│   ├── lib/
│   │   ├── state.ts                    # FR7, FR30: State file read/write (.local.md YAML)
│   │   ├── docker.ts                   # FR9, FR12-FR13: Docker Compose lifecycle
│   │   ├── beads.ts                    # FR32-FR39: Beads CLI wrapper (bd commands)
│   │   ├── bmad.ts                     # FR4-FR5, FR40-FR46: BMAD install + patching
│   │   ├── stack-detect.ts             # FR3: Detect Node.js/Python from indicator files
│   │   ├── deps.ts                     # FR8: Auto-install with correct commands + fallbacks
│   │   ├── templates.ts               # FR12, FR56-FR57: Generate files from embedded templates
│   │   ├── coverage.ts                # FR52-FR55: Coverage tool detection, run, report
│   │   └── scanner.ts                 # FR62-FR64: Codebase scan, module detection, gap analysis
│   └── templates/                      # Embedded templates (compiled into dist/)
│       ├── docker-compose.ts           # FR12: Docker Compose YAML generation
│       ├── otel-config.ts              # FR16: OTel Collector config
│       ├── bmad-patches.ts             # FR42-FR46: BMAD workflow patches with markers
│       ├── plugin-scaffold.ts          # Plugin directory + file contents
│       └── showboat-template.ts        # Proof document skeleton
├── plugin/                             # Claude Code plugin (copied into project by CLI)
│   ├── .claude-plugin/
│   │   └── plugin.json                 # Manifest
│   ├── commands/
│   │   ├── harness-init.md             # → codeharness init
│   │   ├── harness-run.md              # → codeharness run
│   │   ├── harness-verify.md           # → codeharness verify
│   │   ├── harness-status.md           # → codeharness status
│   │   ├── harness-onboard.md          # → codeharness onboard
│   │   └── harness-teardown.md         # → codeharness teardown
│   ├── hooks/
│   │   ├── hooks.json                  # Hook event registrations
│   │   ├── pre-commit-gate.sh          # FR26-FR27: Block commit without quality gates
│   │   ├── post-write-check.sh         # FR28: Prompt OTLP verification
│   │   ├── post-test-verify.sh         # FR31: Prompt log query after tests
│   │   └── session-start.sh            # FR29: Verify harness health
│   ├── skills/
│   │   ├── verification-enforcement/   # FR20-FR25: Verification patterns
│   │   ├── visibility-enforcement/     # FR17-FR19: Observability querying patterns
│   │   └── bmad-integration/           # FR40-FR46: BMAD workflow context
│   ├── agents/
│   │   ├── verifier.md                 # FR20-FR25: Verification subagent spec
│   │   └── doc-gardener.md             # FR58-FR60: Doc health subagent spec
│   └── knowledge/
│       ├── verification-patterns.md    # How to verify different story types
│       ├── otlp-instrumentation.md     # OTLP setup per stack
│       ├── victoria-querying.md        # LogQL/PromQL patterns
│       └── documentation-patterns.md   # AGENTS.md format, exec-plans, doc structure
├── ralph/                              # Vendored Ralph loop (bash)
│   ├── ralph.sh                        # FR47: Core loop (~500 lines)
│   ├── drivers/
│   │   └── claude-code.sh              # Claude Code driver
│   └── lib/
│       ├── task_sources.sh             # FR48: Beads task source (fetch_beads_tasks)
│       └── circuit_breaker.sh          # FR50: Stagnation detection
├── test/
│   ├── unit/                           # Vitest: src/**/*.test.ts mirrors
│   │   ├── commands/
│   │   ├── lib/
│   │   └── templates/
│   ├── integration/                    # BATS: bash script tests
│   │   ├── ralph.bats
│   │   ├── hooks.bats
│   │   └── bridge.bats
│   └── fixtures/                       # Test data (sample epics, state files, beads JSONL)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

### Architectural Boundaries

**CLI ↔ Plugin:**
- CLI: `src/` — Node.js, compiled, does work
- Plugin: `plugin/` — markdown/bash/JSON, copied into target project by `codeharness init`
- Hooks call CLI via `codeharness state set` and `codeharness status --check-docker`
- Commands are markdown that tell the agent to run `codeharness <subcommand>`

**CLI ↔ Ralph:**
- CLI spawns Ralph via `child_process.spawn('bash', ['ralph/ralph.sh', ...])`
- Ralph reads tasks from beads (`bd ready --json`)
- Ralph spawns fresh `claude --plugin-dir` instances per iteration
- CLI handles pre/post iteration logic (verification gates, state updates)

**CLI ↔ Beads:**
- CLI wraps `bd` commands via `src/lib/beads.ts`
- Bridge imports BMAD stories into beads
- Onboard creates beads issues from findings
- Status reads beads for sprint progress
- Hooks can call `bd create` for discovered issues

**CLI ↔ Docker:**
- CLI generates `docker-compose.harness.yml` from embedded templates
- CLI manages lifecycle: `docker compose up -d`, `ps`, `down -v`
- Session-start hook calls CLI to verify Docker health

**Plugin ↔ Target Project:**
- Plugin installed into target project's plugin directory
- BMAD patches modify `_bmad/` workflow files (with markers)
- OTLP setup modifies target project start scripts
- State file lives in target project's `.claude/`
- All changes non-destructive — `codeharness teardown` removes only harness artifacts

### Requirements to Structure Mapping

| FR Category | CLI Component | Plugin Component |
|------------|---------------|-----------------|
| Setup (FR1-FR11) | `src/commands/init.ts`, `src/lib/*` | `commands/harness-init.md` |
| Observability (FR12-FR19) | `src/lib/docker.ts`, `src/templates/docker-compose.ts` | `skills/visibility-enforcement/`, `knowledge/victoria-querying.md` |
| Verification (FR20-FR25) | `src/commands/verify.ts` | `agents/verifier.md`, `skills/verification-enforcement/` |
| Enforcement (FR26-FR31) | `src/commands/state.ts` | `hooks/*.sh` |
| Beads (FR32-FR39) | `src/lib/beads.ts`, `src/commands/bridge.ts` | — |
| BMAD (FR40-FR46) | `src/lib/bmad.ts`, `src/templates/bmad-patches.ts` | `skills/bmad-integration/` |
| Loop (FR47-FR51) | `src/commands/run.ts`, `ralph/` | — |
| Testing (FR52-FR55) | `src/lib/coverage.ts` | `hooks/pre-commit-gate.sh` |
| Docs (FR56-FR60) | `src/lib/templates.ts`, `src/lib/scanner.ts` | `agents/doc-gardener.md`, `knowledge/documentation-patterns.md` |
| Onboard (FR61-FR66) | `src/commands/onboard.ts`, `src/lib/scanner.ts` | `commands/harness-onboard.md` |
| Status (FR67-FR69) | `src/commands/status.ts` | `commands/harness-status.md` |

### Data Flow

```
codeharness init
├── Detect stack (src/lib/stack-detect.ts)
├── Install deps (src/lib/deps.ts) — Showboat, agent-browser, beads, OTLP
├── Install/patch BMAD (src/lib/bmad.ts)
├── Generate Docker Compose if observability ON (src/lib/docker.ts)
├── Start Docker stack if observability ON
├── Generate state file (src/lib/state.ts)
├── Copy plugin into project (src/lib/templates.ts)
├── Generate AGENTS.md + docs/ scaffold
└── Configure .mcp.json (agent-browser, DB MCP)

codeharness bridge --epics epics.md
├── Parse BMAD stories (src/lib/bmad.ts)
├── Extract ACs, dependencies, priorities
├── For each story: bd create → beads issue
└── Report: "N stories imported"

codeharness run
├── Invoke ralph/ralph.sh via child_process.spawn
├── Ralph: bd ready --json → next task
├── Ralph: spawn claude --plugin-dir → agent implements
│   ├── session-start.sh → codeharness status --check
│   ├── Agent implements story
│   │   ├── post-write-check.sh → prompt OTLP check
│   │   ├── post-test-verify.sh → prompt log query
│   │   └── Agent: codeharness state set tests_passed true
│   ├── Agent writes tests, checks coverage
│   │   └── Agent: codeharness state set coverage_met true
│   ├── Agent updates docs (AGENTS.md, exec-plan)
│   ├── codeharness verify --story <id>
│   │   ├── Check preconditions (flags)
│   │   ├── Agent: Showboat proof capture
│   │   └── codeharness state set verification_run true
│   └── pre-commit-gate.sh → reads flags, allows if all true
├── Ralph: bd close <id> → story done
├── Ralph: next iteration or complete
└── Circuit breaker monitors for stagnation
```

## Architecture Validation Results

### Coherence Validation ✓

**Decision Compatibility:** All 9 decisions compatible. CLI↔Plugin boundary (D1) cleanly separates concerns. State management (D2) provides single source of truth accessible from both runtimes. Beads integration (D3) feeds Ralph (D4) without progress.json dependency. Docker lifecycle (D5) respects enforcement config. Template embedding (D6) eliminates v1's missing-files gap. BMAD patching (D7) uses idempotent markers. Verification pipeline (D8) updates state through CLI. Onboarding (D9) creates beads issues that flow through the same pipeline.

**Pattern Consistency:** All patterns align — `snake_case` YAML, canonical hook JSON, CLI status prefixes, marker-based patches. No contradictions across decision areas.

**Structure Alignment:** Every FR maps to a specific file. CLI and plugin directories have clear boundaries. Ralph vendored separately with clean spawn interface.

### Requirements Coverage ✓

All 69 FRs mapped to architectural components. All 28 NFRs addressed. No uncovered requirements.

### Implementation Readiness ✓

9 decisions documented with rationale. 8 pattern categories with canonical examples and anti-patterns. Complete directory tree with FR-to-file mapping. All integration boundaries specified.

### Gap Analysis

**Critical Gaps:** 0

**Minor Gaps (address during implementation):**
1. `codeharness state` utility subcommand — add to Commander.js program as hidden command
2. Ralph beads integration — verify `bd ready --json` output format matches `fetch_beads_tasks()` expectations
3. Beads git hooks coexistence — verify Claude Code hooks and git hooks don't conflict (different event systems)

### Architecture Completeness Checklist

**✓ Requirements Analysis**
- [x] Project context analyzed (69 FRs, 28 NFRs, medium-high complexity)
- [x] Scale assessed — single-user local dev tool, dual runtime
- [x] Constraints identified — Node.js CLI + bash hooks + Python beads
- [x] Cross-cutting concerns mapped (7 concerns)

**✓ Architectural Decisions**
- [x] 9 core decisions documented with rationale
- [x] CLI↔Plugin boundary strictly defined
- [x] State management with session flag lifecycle
- [x] Beads as unified task store with two-layer model
- [x] Ralph integration via beads task source
- [x] Docker conditional on enforcement config
- [x] Templates embedded in npm package
- [x] BMAD patches idempotent with markers
- [x] Verification pipeline with subagent isolation
- [x] Brownfield onboarding as self-bootstrapping epic

**✓ Implementation Patterns**
- [x] State file format and read/write patterns
- [x] Hook script patterns with exit codes
- [x] CLI output format with status prefixes
- [x] Template function patterns
- [x] Beads interaction patterns
- [x] BMAD patch marker patterns
- [x] Showboat proof document patterns
- [x] Error handling patterns for CLI and hooks

**✓ Project Structure**
- [x] Complete directory tree with FR annotations
- [x] All 69 FRs mapped to files
- [x] Component boundaries documented (CLI↔Plugin↔Ralph↔Beads↔Docker)
- [x] Data flow diagram defined
- [x] Requirements-to-structure mapping table

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** High

**Key Strengths:**
- CLI-first eliminates v1's specification-implementation gap
- Beads gives unified task store with dependency tracking
- Embedded templates guarantee availability
- State flag lifecycle ensures flags actually get set
- Every FR has a concrete home in the project structure

**First Implementation Priority:**
1. Project scaffold (`npm init`, Commander.js, tsup, Vitest)
2. Core lib (`state.ts`, `templates.ts`, `stack-detect.ts`)
3. `codeharness init` command
4. `codeharness bridge` + beads integration
