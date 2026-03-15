# src/commands/

CLI command implementations for the `codeharness` tool. Each file exports a `register*Command(program)` function that adds a command (or command group) to the Commander program instance. All commands are registered in `src/index.ts`.

## Commands

### init.ts
Initializes the harness in a project. Detects stack (Node.js/Python) and app type, installs dependencies, sets up Beads issue tracking, installs BMAD with patches, creates state file, scaffolds AGENTS.md and docs/, instruments OTLP, and starts the Docker observability stack.
- **Key deps:** `lib/stack-detect`, `lib/state`, `lib/deps`, `lib/beads`, `lib/bmad`, `lib/otlp`, `lib/docker`, `lib/templates`, `lib/stack-path`
- **Subcommands:** none (single action)

### bridge.ts
Bridges BMAD epics/stories into the Beads task store. Parses a BMAD epics markdown file, extracts stories with acceptance criteria, and imports them as Beads issues with deduplication.
- **Key deps:** `lib/bmad` (parser), `lib/beads` (issue creation), `lib/output`
- **Subcommands:** none; requires `--epics <path>`, supports `--dry-run`

### run.ts
Executes the autonomous coding loop by spawning the Ralph shell script. Reads sprint status to find ready stories, generates a prompt file, and launches Ralph with configurable iteration limits, timeouts, and retry counts.
- **Key deps:** `lib/beads-sync` (sprint status), `templates/ralph-prompt` (prompt generation)
- **Subcommands:** none (single action with many options)

### verify.ts
Runs the verification pipeline on a completed story. Parses acceptance criteria from the story file, checks preconditions, creates a proof document skeleton, optionally runs Showboat verification, updates state, closes the Beads issue, and moves the exec-plan to completed.
- **Key deps:** `lib/verify-parser`, `lib/verify`, `lib/doc-health` (exec-plan completion)
- **Subcommands:** none; requires `--story <id>`

### status.ts
Displays current harness status and health. Shows version, stack, enforcement settings, Docker/observability state (mode-aware: local-shared, remote-direct, remote-routed), Beads summary, onboarding progress, session flags, coverage, and verification log. Supports `--check` for pass/fail health checks.
- **Key deps:** `lib/docker`, `lib/state`, `lib/beads`, `lib/onboard-checks`, `lib/stack-path`
- **Subcommands:** none; supports `--check-docker`, `--check`

### onboard.ts
Onboards an existing codebase into the harness. Scans for modules, analyzes coverage gaps, audits documentation, generates an onboarding epic with stories, filters already-tracked gaps, and imports approved stories into Beads and sprint-status.yaml.
- **Key deps:** `lib/scanner`, `lib/epic-generator`, `lib/beads`, `lib/onboard-checks`, `lib/scan-cache`, `lib/beads-sync`
- **Subcommands:** `scan`, `coverage`, `audit`, `epic` (also runs all phases when invoked without subcommand)

### teardown.ts
Removes the harness from a project. Stops Docker containers (mode-aware), removes BMAD patches, cleans OTLP instrumented scripts from package.json, deletes state file and .harness/ cache. Preserves .beads/, _bmad/, and docs/ by default.
- **Key deps:** `lib/state`, `lib/bmad` (PATCH_TARGETS), `lib/patch-engine`, `lib/otlp`, `lib/docker`, `lib/stack-path`
- **Subcommands:** none; supports `--keep-docker`, `--keep-beads`

### state.ts
Manages harness state via subcommands. Provides read/write access to the YAML frontmatter state file using dot-notation keys.
- **Key deps:** `lib/state` (read/write/get/set), `yaml` (stringify for display)
- **Subcommands:** `show`, `get <key>`, `set <key> <value>`, `reset-session`

### sync.ts
Synchronizes Beads issue statuses with story files and sprint-status.yaml. Supports bidirectional, beads-to-files, and files-to-beads directions. Can sync a single story or all stories.
- **Key deps:** `lib/beads` (issue CRUD), `lib/beads-sync` (sync logic)
- **Subcommands:** none; supports `--direction <dir>`, `--story <key>`

### coverage.ts
Runs tests with coverage measurement and evaluates results against targets. Detects the coverage tool (c8/coverage.py), runs or checks coverage, evaluates against project target, checks per-file coverage floors, and updates state.
- **Key deps:** `lib/coverage` (detection, execution, evaluation)
- **Subcommands:** none; supports `--check-only`, `--story <id>`, `--min-file <percent>`

### doc-health.ts
Scans documentation for freshness and quality issues. Checks whether AGENTS.md files and other docs are stale relative to their associated source code. Can scope checks to modules changed by a specific story.
- **Key deps:** `lib/doc-health` (scanning, freshness checks)
- **Subcommands:** none; supports `--story <id>`, `--fix` (placeholder)

### stack.ts
Manages the shared observability stack (Docker-based). Starts, stops, and shows status of the VictoriaMetrics/OTel Collector stack. Mode-aware: handles local-shared, remote-direct, and remote-routed configurations.
- **Key deps:** `lib/docker` (stack lifecycle), `lib/state`, `lib/stack-path`
- **Subcommands:** `start`, `stop`, `status`

### query.ts
Queries observability data (logs, metrics, traces) scoped to the current project. Automatically injects service_name filtering into LogsQL and PromQL queries. Resolves endpoints from state (local or remote).
- **Key deps:** `lib/state` (service name, endpoint resolution)
- **Subcommands:** `logs <filter>`, `metrics <promql>`, `traces`

## Adding a New Command

1. Create `src/commands/<name>.ts` exporting `register<Name>Command(program: Command): void`
2. Use `program.command('<name>').description('...').action(...)` to define the command
3. Import and call the register function in `src/index.ts`
4. Support `--json` output via `cmd.optsWithGlobals().json` and the `jsonOutput()` helper from `lib/output`
5. Add tests in `src/commands/__tests__/`
6. Update this AGENTS.md with the new command entry
