# src/lib — Shared Libraries

Shared library modules consumed by CLI commands (`src/commands/`) and by each other.
Every module is a pure library — no CLI entry points, no side effects on import.

## State Management

### state.ts
Harness state persistence using YAML front-matter in `.claude/codeharness.local.md`.
- **Key exports:** `HarnessState`, `readState`, `writeState`, `readStateWithBody`, `getDefaultState`, `getStatePath`, `getNestedValue`, `setNestedValue`, `parseValue`, `StateFileNotFoundError`
- **Consumers:** Nearly all commands (init, status, state, coverage, verify, teardown, stack, query); also coverage.ts, verify.ts, otlp.ts, onboard-checks.ts

### output.ts
Structured CLI output formatting with `[OK]`/`[FAIL]`/`[WARN]`/`[INFO]` prefixes and JSON mode.
- **Key exports:** `ok`, `fail`, `warn`, `info`, `jsonOutput`
- **Consumers:** Every command and most lib modules

## Stack & Environment Detection

### stack-detect.ts
Detects project language stack (nodejs/python) and app type (server/cli/web/agent/generic) from project files and dependencies.
- **Key exports:** `detectStack`, `detectAppType`, `AppType`
- **Consumers:** init command, state.ts, coverage.ts

### stack-path.ts
Resolves XDG-compliant paths for the shared observability stack directory, docker-compose file, and OTel config.
- **Key exports:** `getStackDir`, `getComposeFilePath`, `getOtelConfigPath`, `ensureStackDir`
- **Consumers:** docker.ts, init command, stack command, status command, teardown command

### templates.ts
File generation and mustache-style `{{var}}` template rendering.
- **Key exports:** `generateFile`, `renderTemplate`
- **Consumers:** init command

## Docker & Observability

### docker.ts
Docker Compose lifecycle management — availability checks, start/stop shared and collector-only stacks, health checks, remote endpoint probing.
- **Key exports:** `isDockerAvailable`, `isDockerComposeAvailable`, `isStackRunning`, `isSharedStackRunning`, `startStack`, `startSharedStack`, `stopStack`, `stopSharedStack`, `startCollectorOnly`, `stopCollectorOnly`, `isCollectorRunning`, `getStackHealth`, `getCollectorHealth`, `checkRemoteEndpoint`
- **Consumers:** init command, stack command, status command, onboard-checks.ts

### otlp.ts
OpenTelemetry instrumentation setup — installs OTLP packages (Node/Python), patches start scripts, configures env vars, dispatches to app-type-specific configs (CLI/web/agent).
- **Key exports:** `instrumentProject`, `configureOtlpEnvVars`, `installNodeOtlp`, `installPythonOtlp`, `patchNodeStartScript`, `configureCli`, `configureWeb`, `configureAgent`, `ensureServiceNameEnvVar`, `NODE_REQUIRE_FLAG`
- **Consumers:** init command, teardown command

## Coverage & Testing

### coverage.ts
Coverage tool detection (Vitest/c8/Jest/coverage.py), test execution, report parsing, per-file floor checks, coverage evaluation against targets, and state updates.
- **Key exports:** `detectCoverageTool`, `runCoverage`, `checkOnlyCoverage`, `parseCoverageReport`, `parseTestCounts`, `evaluateCoverage`, `updateCoverageState`, `checkPerFileCoverage`, `formatCoverageOutput`, `printCoverageOutput`, `getTestCommand`
- **Consumers:** coverage command, scanner.ts, onboard-checks.ts

## Verification Pipeline

### verify-parser.ts
Parses story markdown files to extract numbered acceptance criteria with type classification (ui/api/db/general) based on keyword matching.
- **Key exports:** `parseStoryACs`, `classifyAC`, `ParsedAC`
- **Consumers:** verify command, verify.ts

### verify.ts
Verification orchestrator — checks preconditions (tests passed, coverage met, docs fresh), creates proof documents, runs Showboat verification, updates state and closes beads issues.
- **Key exports:** `checkPreconditions`, `createProofDocument`, `runShowboatVerify`, `proofHasContent`, `updateVerificationState`, `closeBeadsIssue`
- **Consumers:** verify command

## Documentation Health

### doc-health.ts
Documentation freshness scanner — checks AGENTS.md files, exec-plans, generated docs for staleness and DO-NOT-EDIT headers. Also manages exec-plan lifecycle (create/complete) and story-specific freshness checks.
- **Key exports:** `scanDocHealth`, `checkStoryDocFreshness`, `findModules`, `isDocStale`, `checkAgentsMdForModule`, `checkDoNotEditHeaders`, `createExecPlan`, `completeExecPlan`, `getExecPlanStatus`, `formatDocHealthOutput`, `printDocHealthOutput`
- **Consumers:** doc-health command, verify command, verify.ts, scanner.ts

## Beads Integration (Issue Tracking)

### beads.ts
Low-level `bd` CLI wrapper — CRUD operations on beads issues, initialization, hook detection, gap-id tagging for deduplication.
- **Key exports:** `bdCommand`, `createIssue`, `listIssues`, `closeIssue`, `updateIssue`, `getReady`, `isBeadsInitialized`, `initBeads`, `detectBeadsHooks`, `configureHookCoexistence`, `buildGapId`, `findExistingByGapId`, `appendGapId`, `createOrFindIssue`, `BeadsError`
- **Consumers:** init command, bridge command, status command, onboard command, verify.ts, beads-sync.ts, bmad.ts, epic-generator.ts, onboard-checks.ts

### beads-sync.ts
Bidirectional status synchronization between beads issues, story markdown files, and sprint-status.yaml. Includes sprint-status YAML read/write and onboarding epic appending.
- **Key exports:** `syncBeadsToStoryFile`, `syncStoryFileToBeads`, `syncClose`, `syncAll`, `readSprintStatus`, `updateSprintStatus`, `appendOnboardingEpicToSprint`, `readStoryFileStatus`, `updateStoryFileStatus`
- **Consumers:** sync command, run command, verify.ts, onboard command, onboard-checks.ts

## BMAD Method Integration

### bmad.ts
BMAD installation, version detection, workflow patching, epics/stories markdown parser, and bridge import into beads.
- **Key exports:** `isBmadInstalled`, `installBmad`, `detectBmadVersion`, `applyAllPatches`, `parseEpicsFile`, `importStoriesToBeads`, `getStoryFilePath`, `PATCH_TARGETS`, `BmadError`
- **Consumers:** init command, bridge command, teardown command, epic-generator.ts, onboard-checks.ts

### patch-engine.ts
Marker-based idempotent patching for markdown/text files. Applies, updates, and removes content blocks delimited by `<!-- CODEHARNESS-PATCH-START/END:name -->` markers.
- **Key exports:** `applyPatch`, `removePatch`, `hasPatch`, `getPatchMarkers`
- **Consumers:** bmad.ts, teardown command

## Codebase Scanning & Onboarding

### scanner.ts
Codebase scanning — module detection, source/test file counting, artifact detection (BMAD), coverage gap analysis, and documentation audit.
- **Key exports:** `scanCodebase`, `analyzeCoverageGaps`, `auditDocumentation`
- **Consumers:** onboard command, scan-cache.ts

### scan-cache.ts
Scan result persistence to `.harness/last-onboard-scan.json` with TTL-based validation (24h default) so repeated onboard subcommands reuse recent scan data.
- **Key exports:** `saveScanCache`, `loadScanCache`, `isCacheValid`, `loadValidCache`
- **Consumers:** onboard command

### epic-generator.ts
Generates an onboarding epic from scan findings — maps coverage gaps, missing docs, stale docs, and observability gaps into stories. Writes epic markdown, handles interactive approval, and imports into beads.
- **Key exports:** `generateOnboardingEpic`, `writeOnboardingEpic`, `formatEpicSummary`, `promptApproval`, `importOnboardingEpic`
- **Consumers:** onboard command

### onboard-checks.ts
Onboard precondition checks (harness initialized, BMAD installed, hooks registered) and gap filtering — finds verification gaps, per-file coverage gaps, observability gaps, and filters already-tracked gaps via gap-id system.
- **Key exports:** `runPreconditions`, `findVerificationGaps`, `findPerFileCoverageGaps`, `findObservabilityGaps`, `getOnboardingProgress`, `storyToGapId`, `filterTrackedGaps`
- **Consumers:** onboard command, status command

## Dependency Management

### deps.ts
External dependency auto-installation with fallback chains (pip/pipx, npm). Registry of required tools (Showboat, agent-browser, beads) with version detection and critical/optional classification.
- **Key exports:** `DEPENDENCY_REGISTRY`, `installAllDependencies`, `installDependency`, `checkInstalled`, `parseVersion`, `CriticalDependencyError`
- **Consumers:** init command
