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
Executes the autonomous coding loop. Pre-flight checks: plugin directory, state reconciliation, Docker availability (`isDockerAvailable()`), and orphan container cleanup (`cleanupContainers()`). Then reads sprint status, generates Ralph prompt, and spawns the agent driver with configurable iteration limits, timeouts, and retry counts. Pipes agent stdout/stderr through `driver.parseOutput()` into the Ink renderer.
- **Key deps:** `lib/docker` (isDockerAvailable), `modules/infra` (cleanupContainers), `modules/sprint` (readSprintStatusFromState, reconcileState, getSprintState), `lib/agents` (getDriver), `lib/ink-renderer` (startRenderer), `lib/output`
- **Exports:** `resolvePluginDir()`, `countStories` (re-export from run-helpers), `registerRunCommand(program)`
- **Subcommands:** none (single action with many options)

### verify.ts
Runs the verification pipeline on completed work. Two modes: (1) story verification via `--story <id>` — parses acceptance criteria, checks preconditions, validates proof quality (rejects proofs with PENDING ACs), creates proof document, runs Showboat verify, updates state, closes Beads issue, moves exec-plan to completed; (2) retrospective verification via `--retro --epic <n>` — checks that `epic-N-retrospective.md` exists, marks it done in sprint-status.yaml. JSON output includes `proofQuality` metrics.
- **Key deps:** `modules/verify` (parseStoryACs, validateProofQuality, checkPreconditions, etc.), `lib/doc-health` (exec-plan completion), `lib/beads-sync` (sprint status for retro)
- **Flags:** `--story <id>` (story mode), `--retro` + `--epic <n>` (retro mode), `--json`

### status.ts
Displays current harness status and health. Shows version, stack, enforcement settings, Docker/observability state (mode-aware: local-shared, remote-direct, remote-routed), Beads summary, onboarding progress, session flags, coverage, and verification log. Supports `--check` for pass/fail health checks.
- **Key deps:** `lib/docker`, `lib/state`, `lib/beads`, `lib/onboard-checks`, `lib/stack-path`
- **Subcommands:** none; supports `--check-docker`, `--check`

### onboard.ts
Alias for `audit` (FR16). Delegates all behavior to the shared `audit-action.ts` handler, ensuring identical output. Provides a deprecated `scan` subcommand that prints a warning before running audit.
- **Key deps:** `audit-action` (executeAudit), `lib/output` (warn)
- **Exports:** `registerOnboardCommand(program)`
- **Subcommands:** `scan` (deprecated, prints warning then runs audit)

### audit-action.ts
Shared audit action handler used by both `audit.ts` and `onboard.ts`. Contains the full audit execution logic: precondition checks, `runAudit()`, `--fix` handling (generateFixStories, addFixStoriesToState), and output formatting (human and JSON).
- **Key deps:** `modules/audit` (runAudit, generateFixStories, addFixStoriesToState), `modules/audit/report` (formatAuditHuman, formatAuditJson), `lib/onboard-checks` (runPreconditions), `lib/output`
- **Exports:** `executeAudit(opts: { isJson: boolean; isFix: boolean })`

### teardown.ts
Removes the harness from a project. Stops Docker containers (mode-aware), cleans OTLP instrumented scripts from package.json, deletes state file and .harness/ cache. Preserves _bmad/ and docs/ by default.
- **Key deps:** `lib/state`, `lib/observability`, `lib/docker`, `lib/stack-path`
- **Subcommands:** none; supports `--keep-docker`

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

### retry.ts
Manages retry state for stories. Shows retry counts and flagged-story status, resets counters per-story or globally. Validates story keys against path traversal.
- **Key deps:** `lib/retry-state` (readRetries, readFlaggedStories, resetRetry), `lib/output`
- **Subcommands:** none; supports `--reset`, `--story <key>`, `--status`, `--json`

### validate.ts
Parent command for the `codeharness validate` group. Registers subcommands `schema` (from `validate-schema.ts`) and `self` (from `validate-self.ts`).
- **Key deps:** `validate-schema` (registerValidateSchemaCommand), `validate-self` (registerValidateSelfCommand)
- **Subcommands:** `schema` (validate YAML against JSON schemas), `self` (self-validation cycle)

### validate-schema.ts
CLI subcommand: `codeharness validate schema`. Validates workflow YAML files against JSON schemas using `parseWorkflow()`. Accepts a path or directory, validates each `.yaml`/`.yml` file, and reports results.
- **Key deps:** `lib/workflow-parser` (parseWorkflow, WorkflowParseError), `lib/output`
- **Exports:** `registerValidateSchemaCommand(parent)`

### validate-self.ts
CLI subcommand: `codeharness validate self`. Runs self-validation cycle and produces a release gate report. Initializes a validation sprint, loops through `runValidationCycle()` until no actionable ACs remain, then outputs a summary. Outputs "RELEASE GATE: PASS -- v1.0 ready" when all non-blocked ACs pass.
- **Key deps:** `modules/verify` (createValidationSprint, runValidationCycle, getValidationProgress, getACById), `lib/output`
- **Exports:** `registerValidateSelfCommand(parent)`

### validate-state.ts
Validates sprint-state.json consistency against sprint-status.yaml. Thin CLI wrapper that delegates to the sprint module's `validateStateConsistency`.
- **Key deps:** `modules/sprint` (validateStateConsistency), `lib/output`
- **Subcommands:** none; supports `--state <path>`, `--sprint-status <path>`

### timeout-report.ts
Captures diagnostic data from a timed-out iteration. Called by ralph.sh on exit code 124 to preserve git diff, state delta, and partial stderr in a structured markdown report.
- **Key deps:** `modules/sprint` (captureTimeoutReport), `lib/output`
- **Subcommands:** none; requires `--story <key>`, `--iteration <n>`, `--duration <minutes>`, `--output-file <path>`, `--state-snapshot <path>`; supports `--json`

### query.ts
Queries observability data (logs, metrics, traces) scoped to the current project. Automatically injects service_name filtering into LogsQL and PromQL queries. Resolves endpoints from state (local or remote).
- **Key deps:** `lib/state` (service name, endpoint resolution)
- **Subcommands:** `logs <filter>`, `metrics <promql>`, `traces`

### progress.ts
Updates live run progress in sprint-state.json. Used by harness-run to show real-time story/phase progress during autonomous execution.
- **Key deps:** `modules/sprint` (updateRunProgress, clearRunProgress), `lib/output`
- **Subcommands:** none; supports `--story <key>`, `--phase <phase>`, `--action <text>`, `--ac-progress <text>`, `--clear`, `--json`

### observability-gate.ts
Checks observability coverage against targets for commit gating. Reads cached static and runtime coverage from sprint-state.json, compares against configurable targets (default: 80% static, 60% runtime). Used by the pre-commit hook to block commits below target.
- **Key deps:** `modules/observability` (checkObservabilityCoverageGate), `lib/output`
- **Subcommands:** none; supports `--json`, `--min-static <percent>`, `--min-runtime <percent>`

### audit.ts
Thin CLI wrapper that registers the `audit` command and delegates to the shared `audit-action.ts` handler. Supports `--json` and `--fix` flags.
- **Key deps:** `audit-action` (executeAudit)
- **Subcommands:** none; supports `--json`, `--fix`

### stats.ts
Analyzes token consumption and cost from ralph session logs. Parses JSONL log files for streaming API events, aggregates by phase (create-story, dev-story, code-review, verify, retro), story, tool, and date. Computes API-equivalent cost using Opus 4.6 pricing. Formats human-readable markdown report.
- **Key deps:** `lib/output` (info, ok, fail, jsonOutput), node:fs, commander
- **Subcommands:** none; supports `--save` (write report to cost-report.md), `--json`

### verify-env.ts
Manages the verification environment for black-box story verification. Builds a Docker image from project artifacts (no source code), prepares clean temp workspaces with only story docs, validates the environment, and cleans up.
- **Key deps:** `modules/verify` (buildVerifyImage, prepareVerifyWorkspace, checkVerifyEnv, cleanupVerifyEnv), `lib/output`
- **Subcommands:** `build` (build Docker image, supports `--json`), `prepare --story <key>` (create clean workspace), `check` (validate image/CLI/otel), `cleanup --story <key>` (remove workspace and container)

## Adding a New Command

1. Create `src/commands/<name>.ts` exporting `register<Name>Command(program: Command): void`
2. Register in `src/index.ts`, add tests in `src/commands/__tests__/`
3. Support `--json` output via `cmd.optsWithGlobals().json` and `jsonOutput()` from `lib/output`
