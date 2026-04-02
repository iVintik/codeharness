# src/lib — Shared Libraries

Pure library modules consumed by CLI commands (`src/commands/`) and by each other. No CLI entry points, no side effects on import.

## State & Output

| File | Purpose | Key Exports |
|------|---------|-------------|
| state.ts | YAML front-matter state persistence in `.claude/codeharness.local.md` | `readState`, `writeState`, `readStateWithBody`, `getStatePath`, `HarnessState` |
| workflow-state.ts | Workflow execution state persistence in `.codeharness/workflow-state.yaml` — tracks task checkpoints, evaluator scores, circuit breaker | `readWorkflowState`, `writeWorkflowState`, `getDefaultWorkflowState`, `WorkflowState`, `TaskCheckpoint`, `EvaluatorScore`, `CircuitBreakerState` |
| output.ts | Structured `[OK]/[FAIL]/[WARN]/[INFO]` CLI output with JSON mode | `ok`, `fail`, `warn`, `info`, `jsonOutput` |

## Stack Provider System

| File | Purpose | Key Exports |
|------|---------|-------------|
| stacks/types.ts | Canonical stack type definitions and `StackProvider` interface | `StackProvider`, `StackName`, `AppType`, `CoverageToolName`, `CoverageToolInfo`, `OtlpResult`, `TestCounts` |
| stacks/registry.ts | Provider registry with marker-based stack detection | `registerProvider`, `getStackProvider`, `detectStacks`, `detectStack`, `StackDetection`, `_resetRegistry` |
| stacks/nodejs.ts | Full NodejsProvider — all Node.js-specific logic extracted from consumer files | `NodejsProvider` |
| stacks/python.ts | Full PythonProvider — all Python-specific logic (app type detection, coverage, OTLP, Dockerfile, pytest parsing) | `PythonProvider` |
| stacks/rust.ts | Full RustProvider — Cargo.toml parsing, tarpaulin coverage, OTLP packages, multi-stage Dockerfile, workspace test aggregation | `RustProvider` |
| stacks/utils.ts | Shared helpers for stack providers — JSON/text file reading, Node.js/Python/Cargo dependency extraction | `readJsonSafe`, `readTextSafe`, `getNodeDeps`, `getPythonDepsContent`, `hasPythonDep`, `getCargoDepsSection`, `hasCargoDep` |
| stacks/index.ts | Barrel re-exports + auto-registers NodejsProvider, PythonProvider, RustProvider on import | all public API from types.ts and registry.ts |

## Stack & Environment (Legacy)

| File | Purpose | Key Exports |
|------|---------|-------------|
| stack-detect.ts | Legacy stack detection — re-exports `StackName`, `AppType` from stacks/types.ts for backward compat | `detectStack`, `detectAppType`, `AppType` |
| stack-path.ts | XDG-compliant paths for shared observability stack | `getStackDir`, `getComposeFilePath`, `ensureStackDir` |
| templates.ts | File generation with `{{var}}` mustache-style rendering | `generateFile`, `renderTemplate` |

## Docker (src/lib/docker/)

| File | Purpose | Key Exports |
|------|---------|-------------|
| docker/index.ts | Barrel re-exports for docker subsystem | all public API from compose, health, cleanup |
| docker/compose.ts | Docker Compose lifecycle — start/stop shared stack, collector | `startStack`, `stopStack`, `startSharedStack`, `stopSharedStack`, `startCollectorOnly`, `stopCollectorOnly`, `isStackRunning`, `isSharedStackRunning`, `isCollectorRunning` |
| docker/health.ts | Docker health checks, availability, remote probing | `isDockerAvailable`, `isDockerComposeAvailable`, `getStackHealth`, `getCollectorHealth`, `checkRemoteEndpoint`, `DockerHealthResult` |
| docker/cleanup.ts | Container cleanup utilities | `cleanupOrphanedContainers`, `cleanupVerifyEnv` |

## Observability / OTLP (src/lib/observability/)

| File | Purpose | Key Exports |
|------|---------|-------------|
| observability/index.ts | Barrel re-exports for OTLP subsystem | all public API from instrument, config, backends |
| observability/instrument.ts | OTLP instrumentation — package install, script patching | `installNodeOtlp`, `installPythonOtlp`, `installRustOtlp`, `instrumentProject`, `patchNodeStartScript` |
| observability/config.ts | OTLP env var configuration for CLI/web/agent modes | `configureOtlpEnvVars`, `ensureServiceNameEnvVar`, `ensureEndpointEnvVar`, `configureCli`, `configureWeb`, `configureAgent` |
| observability/backends.ts | Observability backend interface with Victoria and ELK implementations | `ObservabilityBackend`, `VictoriaBackend`, `ElkBackend` |

## Schema Validation & Workflow Parsing

| File | Purpose | Key Exports |
|------|---------|-------------|
| schema-validate.ts | JSON Schema validation using ajv — workflow YAML structure validation with typed error reporting | `validateWorkflowSchema`, `validateAgainstSchema`, `ValidationResult`, `ValidationError` |
| workflow-parser.ts | Workflow YAML parser — reads file, validates against JSON schema, checks referential integrity, applies defaults, returns typed `ResolvedWorkflow` | `parseWorkflow`, `WorkflowParseError`, `ResolvedWorkflow`, `ResolvedTask`, `LoopBlock`, `FlowStep` |

## Agent Infrastructure (Epic 4)

| File | Purpose | Key Exports |
|------|---------|-------------|
| agent-dispatch.ts | SDK-based agent dispatching with retries, timeout, rate-limit handling | `dispatchAgent`, `DispatchOptions`, `DispatchResult`, `DispatchError`, `DispatchErrorCode` |
| agent-resolver.ts | Agent config resolution — loads embedded templates, applies patch chain, compiles subagent definitions | `resolveAgent`, `loadEmbeddedAgent`, `loadPatch`, `mergePatch`, `compileSubagentDefinition`, `ResolvedAgent`, `SubagentDefinition`, `AgentPatch`, `AgentResolveError` |
| session-manager.ts | Session boundary management — fresh/continue resolution, session ID recording and lookup | `resolveSessionId`, `recordSessionId`, `getLastSessionId`, `SessionBoundary`, `SessionLookupKey` |
| source-isolation.ts | Source isolation for black-box verification — creates isolated workspaces with dist artifacts only, no source code | `createIsolatedWorkspace`, `IsolatedWorkspace`, `IsolationOptions` |
| trace-id.ts | Trace ID generation per iteration, prompt injection formatting, state recording | `generateTraceId`, `formatTracePrompt`, `recordTraceId`, `sanitizeSegment` |

## Workflow Execution (Epic 5)

| File | Purpose | Key Exports |
|------|---------|-------------|
| workflow-engine.ts | Sequential flow execution orchestrator — composes all Epic 1-4 modules to execute workflow steps in order, dispatching agents per-story or per-run | `executeWorkflow`, `dispatchTask`, `loadWorkItems`, `EngineConfig`, `EngineResult`, `EngineError`, `WorkItem` |

## Coverage & Testing

| File | Purpose | Key Exports |
|------|---------|-------------|
| coverage.ts | Coverage tool detection (Vitest/c8/coverage.py/cargo-tarpaulin), execution, evaluation, per-file floors | `detectCoverageTool`, `runCoverage`, `checkOnlyCoverage`, `evaluateCoverage`, `checkPerFileCoverage`, `getTestCommand` |

## Verification Pipeline

| File | Purpose | Key Exports |
|------|---------|-------------|
| verify-parser.ts | Parses story ACs with type classification (ui/api/db/general) | `parseStoryACs`, `classifyAC`, `ParsedAC` |
| verify.ts | Verification orchestrator — preconditions, proof quality validation, Showboat, state | `checkPreconditions`, `validateProofQuality`, `ProofQuality`, `createProofDocument`, `runShowboatVerify`, `closeBeadsIssue`, `proofHasContent` (deprecated) |
| verify-env.ts | Black-box verification environment — Docker image build (npm pack/pip install), clean workspace prep, env check, cleanup | `buildVerifyImage`, `prepareVerifyWorkspace`, `checkVerifyEnv`, `cleanupVerifyEnv`, `computeDistHash`, `isValidStoryKey` |
| verifier-session.ts | Black-box verifier session spawner — runs `claude --print` in clean workspace, returns `Result<VerifyResult>`, copies proof back to project | `spawnVerifierSession`, `copyProofToProject` |

## Documentation Health (src/lib/doc-health/)

| File | Purpose | Key Exports |
|------|---------|-------------|
| doc-health/index.ts | Barrel re-exports for doc-health subsystem | all public API from scanner, staleness, report |
| doc-health/scanner.ts | Module detection and doc health scanning | `findModules`, `scanDocHealth`, `DocHealthResult`, `DocHealthReport` |
| doc-health/staleness.ts | Staleness checks, AGENTS.md completeness, story freshness | `isDocStale`, `getSourceFilesInModule`, `getMentionedFilesInAgentsMd`, `checkAgentsMdCompleteness`, `checkAgentsMdForModule`, `checkDoNotEditHeaders`, `checkStoryDocFreshness` |
| doc-health/report.ts | Doc health output formatting and exec-plan lifecycle | `formatDocHealthOutput`, `printDocHealthOutput`, `createExecPlan`, `completeExecPlan`, `getExecPlanStatus` |
| doc-health/types.ts | Shared types for doc-health subsystem | `DocHealthResult`, `ModuleDocHealth`, `SOURCE_EXTENSIONS` |

## Retrospective Parsing & Retro-to-Sprint Pipeline

| File | Purpose | Key Exports |
|------|---------|-------------|
| retro-parser.ts | Retro markdown parser — action item extraction, classification, priority derivation, section parsing, deduplication | `parseRetroActionItems`, `parseRetroSections`, `normalizeText`, `wordOverlap`, `isDuplicate`, `classifyFinding`, `derivePriority`, `RetroActionItem`, `RetroSectionItem`, `Classification` |
| retro-to-sprint.ts | Retro-to-sprint pipeline — processes retro action items into TD stories and backlog entries | `processRetroActionItems`, `ensureEpicTd`, `createTdStory`, `nextTdStoryNumber`, `generateSlug`, `getExistingTdTitles`, `appendToBacklogFile` |

## GitHub CLI Integration

| File | Purpose | Key Exports |
|------|---------|-------------|
| github.ts | `gh` CLI wrapper — issue create/search, label management, repo detection, dedup | `isGhAvailable`, `ghIssueCreate`, `ghIssueSearch`, `findExistingGhIssue`, `getRepoFromRemote`, `parseRepoFromUrl`, `ensureLabels`, `GitHubError`, `GhIssue`, `RetroIssueTarget` |

## Beads Integration (Issue Tracking)

| File | Purpose | Key Exports |
|------|---------|-------------|
| beads.ts | `bd` CLI wrapper — CRUD, init, hook detection, gap-id dedup | `createIssue`, `closeIssue`, `buildGapId`, `createOrFindIssue`, `BeadsError` |

## Sync (src/lib/sync/)

| File | Purpose | Key Exports |
|------|---------|-------------|
| sync/index.ts | Barrel re-exports for sync subsystem | all public API from beads, sprint-yaml, story-files |
| sync/beads.ts | Bidirectional sync between beads issues, story files, sprint YAML | `syncBeadsToStoryFile`, `syncStoryFileToBeads`, `syncClose`, `syncAll` |
| sync/sprint-yaml.ts | Sprint status YAML read/write and onboarding epic append | `readSprintStatus`, `updateSprintStatus`, `appendOnboardingEpicToSprint` |
| sync/story-files.ts | Story file path resolution and status management | `resolveStoryFilePath`, `readStoryFileStatus`, `updateStoryFileStatus`, `beadsStatusToStoryStatus`, `storyStatusToBeadsStatus` |

## BMAD Method Integration

| File | Purpose | Key Exports |
|------|---------|-------------|
| bmad.ts | BMAD install, version detect, workflow patching (6 patches incl. `sprint-retro`), epics parser | `installBmad`, `applyAllPatches`, `parseEpicsFile`, `importStoriesToBeads`, `PATCH_TARGETS` (6 entries incl. `sprint-retro`) |
| patch-engine.ts | Marker-based idempotent patching for markdown/text files | `applyPatch`, `removePatch`, `hasPatch` |

## Codebase Scanning & Onboarding

| File | Purpose | Key Exports |
|------|---------|-------------|
| scanner.ts | Module detection, source/test counting, coverage gap analysis, doc audit | `scanCodebase`, `analyzeCoverageGaps`, `auditDocumentation` |
| scan-cache.ts | Scan result cache in `.harness/last-onboard-scan.json` with 24h TTL | `saveScanCache`, `loadValidCache` |
| epic-generator.ts | Generates onboarding epic from scan findings, imports to beads | `generateOnboardingEpic`, `writeOnboardingEpic`, `formatEpicSummary`, `promptApproval`, `importOnboardingEpic` |
| onboard-checks.ts | Precondition checks and gap filtering for onboarding | `runPreconditions`, `findVerificationGaps`, `findPerFileCoverageGaps`, `findObservabilityGaps`, `getOnboardingProgress`, `filterTrackedGaps` |

## Retry State Management

| File | Purpose | Key Exports |
|------|---------|-------------|
| retry-state.ts | Persistent story retry counters and flagged-story tracking in `ralph/.story_retries` and `ralph/.flagged_stories` | `readRetries`, `writeRetries`, `getRetryCount`, `setRetryCount`, `resetRetry`, `readFlaggedStories`, `writeFlaggedStories`, `removeFlaggedStory` |

## Stream Parsing & Ink Rendering

| File | Purpose | Key Exports |
|------|---------|-------------|
| ink-components.tsx | Ink/React terminal UI components — Header, ActiveTool, CompletedTool, LastThought, RetryNotice, StoryBreakdown, StoryMessages, App | `Header`, `App`, `SprintInfo`, `StoryStatusEntry`, `StoryStatusValue`, `StoryMessage` |
| ink-renderer.tsx | Ink renderer controller — creates/manages Ink instance, exposes RendererHandle for state updates, signal cleanup | `startRenderer`, `RendererHandle`, `RendererState`, `noopHandle` |

## Run Command Helpers

| File | Purpose | Key Exports |
|------|---------|-------------|
| run-helpers.ts | Extracted helpers for `run.ts` — elapsed time formatting, sprint status mapping, story counting, line processor | `formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `countStories`, `createLineProcessor` |

## Dashboard Formatting

| File | Purpose | Key Exports |
|------|---------|-------------|
| dashboard-formatter.ts | Parses ralph's structured output lines and reformats them as a clean dashboard with icons and progress tracking | `DashboardFormatter`, `formatDashboardLine` |

## Dependency Management

| File | Purpose | Key Exports |
|------|---------|-------------|
| deps.ts | Auto-install external tools (Showboat, agent-browser, beads, Semgrep, BATS, cargo-tarpaulin) with fallback chains | `DEPENDENCY_REGISTRY`, `installAllDependencies`, `CriticalDependencyError` |

## Shared Test Utilities (src/lib/__tests__/)

| File | Purpose | Key Exports |
|------|---------|-------------|
| __tests__/helpers.ts | Single import point for test helpers, fixtures, and mock factories; `withTempDir()` utility | `withTempDir`, re-exports all fixtures |
| __tests__/fixtures/cargo-toml-variants.ts | Named Cargo.toml string constants for 8 variants (minimal, actix-web, axum, async-openai, workspace, binary, library, generic) | `CARGO_TOML_MINIMAL`, `CARGO_TOML_ACTIX_WEB`, `CARGO_TOML_AXUM`, `CARGO_TOML_ASYNC_OPENAI`, `CARGO_TOML_WORKSPACE`, `CARGO_TOML_BINARY`, `CARGO_TOML_LIBRARY`, `CARGO_TOML_GENERIC` |
| __tests__/fixtures/state-builders.ts | Builder factories for SprintStateV2 and related test data | `buildSprintState`, `buildStoryEntry`, `buildEpicState`, `buildActionItem`, `buildSprintStateWithStory` |
| __tests__/fixtures/mock-factories.ts | Mock factory functions for commonly mocked modules (fs, child_process, docker, state) | `createFsMock`, `createChildProcessMock`, `createDockerMock`, `createStateMock`, `createSprintStateMock` |

## Agent Abstraction (src/lib/agents/)

| File | Purpose | Key Exports |
|------|---------|-------------|
| agents/types.ts | AgentDriver interface and related types — SpawnOpts, AgentProcess, AgentEvent discriminated union | `AgentDriver`, `SpawnOpts`, `AgentProcess`, `AgentEvent` |
| agents/ralph.ts | RalphDriver implementation — wraps ralph.sh spawning and output parsing in AgentDriver interface | `RalphDriver`, `buildSpawnArgs`, `resolveRalphPath`, `parseRalphMessage`, `parseIterationMessage` |
| agents/stream-parser.ts | Stateless NDJSON stream parser — converts Claude API streaming events into typed `StreamEvent` objects | `parseStreamLine`, `StreamEvent`, `StreamEventType` |
| agents/ralph-prompt.ts | Ralph system prompt generator — builds the prompt template for ralph sessions | `generateRalphPrompt`, `RalphPromptConfig` |
| agents/index.ts | Barrel re-exports for agents subsystem — RalphDriver, stream parser, ralph prompt | all public API from ralph.ts, stream-parser.ts, ralph-prompt.ts, types.ts |

**Total: 61 library files + 4 shared test utility files across 25 categories (includes 5 domain subdirectories: docker/, observability/, sync/, doc-health/, agents/).**
