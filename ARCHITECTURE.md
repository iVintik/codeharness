# Architecture

Codeharness is a CLI tool and Claude Code plugin that makes autonomous coding agents produce software that actually works. It wraps projects with quality gates (tests, coverage, verification, observability) and drives sprint execution through an autonomous loop.

## Entry Point

`src/index.ts` creates a Commander program, registers all commands, and parses `process.argv`. Built via tsup (ESM, Node 18+ target) into `dist/index.js` with a shebang banner. The binary is exposed as `codeharness` in package.json.

## Module Map

### `src/commands/` -- CLI Commands

Each file exports a `register*Command(program)` function called from `src/index.ts`.

| Command | File | Purpose |
|---------|------|---------|
| `init` | `init.ts` | Initialize harness: detect stack, install deps, set up beads/BMAD/OTLP/Docker |
| `run` | `run.ts` | Launch the autonomous coding loop (spawns `ralph/ralph.sh`) |
| `bridge` | `bridge.ts` | Import BMAD epics/stories into beads task store |
| `verify` | `verify.ts` | Run verification pipeline on completed stories (proof docs, showboat) |
| `status` | `status.ts` | Display harness state, Docker health, beads summary, onboarding progress |
| `onboard` | `onboard.ts` | Scan codebase for gaps, generate onboarding epic (subcommands: scan, coverage, audit, epic) |
| `teardown` | `teardown.ts` | Remove harness from project (state, patches, Docker, OTLP instrumentation) |
| `state` | `state.ts` | Read/write harness state (subcommands: show, get, set, reset-session) |
| `sync` | `sync.ts` | Synchronize beads issues with story files and sprint-status.yaml |
| `coverage` | `coverage.ts` | Run tests with coverage, evaluate against targets, per-file floor checks |
| `doc-health` | `doc-health.ts` | Scan documentation freshness and quality |
| `stack` | `stack.ts` | Manage shared observability stack (start, stop, status) |
| `query` | `query.ts` | Query logs/metrics/traces scoped to current project service |

### `src/lib/` -- Core Libraries

| Module | Purpose | Used By |
|--------|---------|---------|
| `output.ts` | Structured console output (`ok`, `fail`, `warn`, `info`, `jsonOutput`) | All commands |
| `state.ts` | Read/write harness state from `.claude/codeharness.local.md` (YAML frontmatter) | Most commands |
| `stack-detect.ts` | Detect project stack (nodejs/python) and app type (server/cli/web/agent) | `init` |
| `templates.ts` | File generation utility (mkdir + write) | `init` |
| `docker.ts` | Docker Compose management: start/stop/health for shared stack and collector | `init`, `status`, `stack`, `teardown` |
| `stack-path.ts` | Resolve `~/.codeharness/stack/` paths for shared Docker stack | `init`, `status`, `stack`, `teardown` |
| `deps.ts` | Auto-install external dependencies (beads, showboat) | `init` |
| `otlp.ts` | OTLP instrumentation: inject tracing into project scripts | `init`, `teardown` |
| `beads.ts` | Wrapper around `bd` CLI for issue tracking (create, list, update, close) | `init`, `bridge`, `sync`, `status`, `onboard` |
| `beads-sync.ts` | Bidirectional sync between beads issues, story files, and sprint-status.yaml | `sync`, `run`, `onboard` |
| `bmad.ts` | BMAD installation, version detection, epic parsing, patch application | `init`, `bridge`, `teardown` |
| `patch-engine.ts` | Apply/remove marker-delimited patches in files | `bmad.ts`, `teardown` |
| `verify.ts` | Verification pipeline: preconditions, proof docs, showboat integration, state updates | `verify` |
| `verify-parser.ts` | Parse acceptance criteria from story markdown files | `verify` |
| `coverage.ts` | Coverage tool detection, execution, evaluation, per-file analysis | `coverage` |
| `doc-health.ts` | Documentation freshness scanning, exec-plan lifecycle | `doc-health`, `verify` |
| `scanner.ts` | Codebase scanning: module detection, coverage gap analysis, doc audit | `onboard` |
| `scan-cache.ts` | Persist/load scan results to `.harness/scan-cache.json` | `onboard` |
| `epic-generator.ts` | Generate onboarding epic from scan findings | `onboard` |
| `onboard-checks.ts` | Precondition checks, gap filtering, progress tracking for onboarding | `onboard`, `status` |

### `src/templates/` -- Embedded Templates

String-literal templates compiled into the bundle (no runtime file reads).

| Module | Generates |
|--------|-----------|
| `ralph-prompt.ts` | Prompt for each Ralph iteration (autonomous loop instructions) |
| `showboat-template.ts` | Verification proof document skeletons |
| `bmad-patches.ts` | Patch content for BMAD workflow files |
| `docker-compose.ts` | Docker Compose YAML for observability stack and collector |
| `otel-config.ts` | OpenTelemetry Collector configuration YAML |

### `hooks/` -- Claude Code Plugin Hooks

Shell scripts triggered by Claude Code at lifecycle events (defined in `hooks.json`).

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.sh` | SessionStart | Reset session flags, show harness status |
| `pre-commit-gate.sh` | PreToolUse (Bash) | Gate commits: require tests passed, coverage met |
| `post-write-check.sh` | PostToolUse (Write/Edit) | Check written files for quality issues |
| `post-test-verify.sh` | PostToolUse (Bash) | Detect test runs, update session flags |

### `ralph/` -- Autonomous Loop Driver

Shell scripts and support files for the Ralph autonomous execution loop. `ralph.sh` is the main loop that spawns Claude Code iterations, manages story retries, and tracks progress via `status.json`.

### `templates/` -- Static Template Files

Files copied or referenced during init/patching (BMAD patch markdown files, Docker Compose templates, OTel Collector config, showboat template).

## Dependency Graph

```
src/index.ts
  -> src/commands/*  (each command module)
       -> src/lib/output.ts  (all commands)
       -> src/lib/state.ts   (most commands)
       -> src/lib/*           (domain-specific libs)
       -> src/templates/*     (init, run, verify)

src/lib/ internal dependencies:
  state.ts -> output.ts, stack-detect.ts
  bmad.ts -> patch-engine.ts, beads.ts, output.ts
  beads-sync.ts -> output.ts, beads.ts (type)
  verify.ts -> output.ts, state.ts, beads.ts, beads-sync.ts, doc-health.ts
  onboard-checks.ts -> state.ts, bmad.ts, beads.ts, beads-sync.ts, coverage.ts, docker.ts, epic-generator.ts
  docker.ts -> stack-path.ts
  otlp.ts -> state.ts, templates.ts
```

## External Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI argument parsing and command registration |
| `yaml` | YAML parse/stringify for state files and sprint-status |

Dev-only: `tsup` (bundler), `typescript`, `vitest` (unit tests), `@vitest/coverage-v8`, OpenTelemetry packages (instrumentation).

## Build & Test

```bash
npm run build          # tsup -> dist/index.js (single ESM bundle)
npm test               # bats integration tests (tests/)
npm run test:unit      # vitest unit tests
npm run test:coverage  # vitest with v8 coverage
```
