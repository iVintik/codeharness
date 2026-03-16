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
Executes the autonomous coding loop by spawning the Ralph shell script. Resolves ralph.sh path, reads sprint status to find ready stories, generates Ralph prompt, and launches Ralph with configurable iteration limits, timeouts, and retry counts.
- **Key deps:** `lib/beads-sync` (sprint status), `lib/output`, `templates/ralph-prompt` (prompt generation)
- **Exports:** `resolveRalphPath()`, `resolvePluginDir()`, `countStoriesByStatus()`, `registerRunCommand(program)`
- **Subcommands:** none (single action with many options)

### verify.ts
Runs the verification pipeline on completed work. Two modes: (1) story verification via `--story <id>` — parses acceptance criteria, checks preconditions, validates proof quality (rejects proofs with PENDING ACs), creates proof document, runs Showboat verify, updates state, closes Beads issue, moves exec-plan to completed; (2) retrospective verification via `--retro --epic <n>` — checks that `epic-N-retrospective.md` exists, marks it done in sprint-status.yaml. JSON output includes `proofQuality` metrics.
- **Key deps:** `lib/verify-parser`, `lib/verify` (`validateProofQuality`), `lib/doc-health` (exec-plan completion), `lib/beads-sync` (sprint status for retro)
- **Flags:** `--story <id>` (story mode), `--retro` + `--epic <n>` (retro mode), `--json`

### status.ts
Displays current harness status and health. Shows version, stack, enforcement settings, Docker/observability state (mode-aware: local-shared, remote-direct, remote-routed), Beads summary, onboarding progress, session flags, coverage, and verification log. Supports `--check` for pass/fail health checks.
- **Key deps:** `lib/docker`, `lib/state`, `lib/beads`, `lib/onboard-checks`, `lib/stack-path`
- **Subcommands:** none; supports `--check-docker`, `--check`

### onboard.ts
Onboards an existing codebase into the harness. Scans modules, analyzes coverage/observability gaps, audits documentation, generates an onboarding epic, and imports approved stories into Beads and sprint-status.yaml. Tracks shared state across phases.
- **Key deps:** `lib/scanner`, `lib/epic-generator`, `lib/beads`, `lib/onboard-checks`, `lib/scan-cache`, `lib/beads-sync`, `lib/output`
- **Exports:** `getLastScanResult()`, `getLastCoverageResult()`, `getLastAuditResult()`, `registerOnboardCommand(program)`
- **Subcommands:** `scan`, `coverage`, `audit`, `epic` (runs all when invoked without subcommand)

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

### retro-import.ts
Imports retrospective action items as beads issues. Parses `epic-N-retrospective.md` for action item tables, classifies each item (harness/tool/project), derives priority, creates or deduplicates beads issues using gap-ids.
- **Key deps:** `lib/retro-parser` (parsing, classification, priority), `lib/beads` (createOrFindIssue, buildGapId), `lib/output`
- **Subcommands:** none; requires `--epic <n>`, supports `--json`

### github-import.ts
Imports GitHub issues labeled for sprint planning into beads. Queries GitHub via `gh` CLI for issues with a specified label (default: `sprint-candidate`), maps GitHub labels to beads type (bug/story/task) and priority, creates or deduplicates beads issues using gap-ids with format `[source:github:owner/repo#N]`.
- **Key deps:** `lib/github` (isGhAvailable, ghIssueSearch, getRepoFromRemote), `lib/beads` (createOrFindIssue, buildGapId), `lib/output`
- **Subcommands:** none; supports `--repo <owner/repo>`, `--label <label>`, `--json`

### query.ts
Queries observability data (logs, metrics, traces) scoped to the current project. Automatically injects service_name filtering into LogsQL and PromQL queries. Resolves endpoints from state (local or remote).
- **Key deps:** `lib/state` (service name, endpoint resolution)
- **Subcommands:** `logs <filter>`, `metrics <promql>`, `traces`

## Adding a New Command

1. Create `src/commands/<name>.ts` exporting `register<Name>Command(program: Command): void`
2. Register in `src/index.ts`, add tests in `src/commands/__tests__/`
3. Support `--json` output via `cmd.optsWithGlobals().json` and `jsonOutput()` from `lib/output`
