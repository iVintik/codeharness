# src/lib — Shared Libraries

Pure library modules consumed by CLI commands (`src/commands/`) and by each other. No CLI entry points, no side effects on import.

## State & Output

| File | Purpose | Key Exports |
|------|---------|-------------|
| state.ts | YAML front-matter state persistence in `.claude/codeharness.local.md` | `readState`, `writeState`, `readStateWithBody`, `getStatePath`, `HarnessState` |
| output.ts | Structured `[OK]/[FAIL]/[WARN]/[INFO]` CLI output with JSON mode | `ok`, `fail`, `warn`, `info`, `jsonOutput` |

## Stack Provider System

| File | Purpose | Key Exports |
|------|---------|-------------|
| stacks/types.ts | Canonical stack type definitions and `StackProvider` interface | `StackProvider`, `StackName`, `AppType`, `CoverageToolName`, `CoverageToolInfo`, `OtlpResult`, `TestCounts` |
| stacks/registry.ts | Provider registry with marker-based stack detection | `registerProvider`, `getStackProvider`, `detectStacks`, `detectStack`, `StackDetection`, `_resetRegistry` |
| stacks/nodejs.ts | Minimal NodejsProvider stub (full impl in story 10-2) | `NodejsProvider` |
| stacks/index.ts | Barrel re-exports + auto-registers NodejsProvider on import | all public API from types.ts and registry.ts |

## Stack & Environment (Legacy)

| File | Purpose | Key Exports |
|------|---------|-------------|
| stack-detect.ts | Legacy stack detection — re-exports `StackName`, `AppType` from stacks/types.ts for backward compat | `detectStack`, `detectAppType`, `AppType` |
| stack-path.ts | XDG-compliant paths for shared observability stack | `getStackDir`, `getComposeFilePath`, `ensureStackDir` |
| templates.ts | File generation with `{{var}}` mustache-style rendering | `generateFile`, `renderTemplate` |

## Docker & Observability

| File | Purpose | Key Exports |
|------|---------|-------------|
| docker.ts | Docker Compose lifecycle — start/stop, health checks, remote probing | `startSharedStack`, `stopSharedStack`, `isStackRunning`, `getStackHealth`, `checkRemoteEndpoint` |
| otlp.ts | OTLP instrumentation — package install, script patching, env vars | `instrumentProject`, `configureOtlpEnvVars`, `patchNodeStartScript` |

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

## Documentation Health

| File | Purpose | Key Exports |
|------|---------|-------------|
| doc-health.ts | AGENTS.md/exec-plan freshness scanner, exec-plan lifecycle | `scanDocHealth`, `findModules`, `isDocStale`, `createExecPlan`, `completeExecPlan` |

## Retrospective Parsing

| File | Purpose | Key Exports |
|------|---------|-------------|
| retro-parser.ts | Retro markdown parser — action item extraction, classification, priority derivation | `parseRetroActionItems`, `classifyFinding`, `derivePriority`, `RetroActionItem`, `Classification` |

## GitHub CLI Integration

| File | Purpose | Key Exports |
|------|---------|-------------|
| github.ts | `gh` CLI wrapper — issue create/search, label management, repo detection, dedup | `isGhAvailable`, `ghIssueCreate`, `ghIssueSearch`, `findExistingGhIssue`, `getRepoFromRemote`, `parseRepoFromUrl`, `ensureLabels`, `GitHubError`, `GhIssue`, `RetroIssueTarget` |

## Beads Integration (Issue Tracking)

| File | Purpose | Key Exports |
|------|---------|-------------|
| beads.ts | `bd` CLI wrapper — CRUD, init, hook detection, gap-id dedup | `createIssue`, `closeIssue`, `buildGapId`, `createOrFindIssue`, `BeadsError` |
| beads-sync.ts | Bidirectional sync between beads issues, story files, sprint YAML | `syncAll`, `readSprintStatus`, `updateSprintStatus` |

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
| stream-parser.ts | Stateless NDJSON stream parser — converts Claude API streaming events into typed `StreamEvent` objects | `parseStreamLine`, `StreamEvent`, `StreamEventType` |
| ink-components.tsx | Ink/React terminal UI components — Header, ActiveTool, CompletedTool, LastThought, RetryNotice, StoryBreakdown, StoryMessages, App | `Header`, `App`, `SprintInfo`, `StoryStatusEntry`, `StoryStatusValue`, `StoryMessage` |
| ink-renderer.tsx | Ink renderer controller — creates/manages Ink instance, exposes RendererHandle for state updates, signal cleanup | `startRenderer`, `RendererHandle`, `RendererState`, `noopHandle` |

## Run Command Helpers

| File | Purpose | Key Exports |
|------|---------|-------------|
| run-helpers.ts | Extracted helpers for `run.ts` (NFR9 compliance) — elapsed time formatting, sprint status mapping, ralph output parsing, story counting, spawn args builder | `formatElapsed`, `mapSprintStatus`, `mapSprintStatuses`, `parseRalphMessage`, `countStories`, `buildSpawnArgs` |

## Dashboard Formatting

| File | Purpose | Key Exports |
|------|---------|-------------|
| dashboard-formatter.ts | Parses ralph's structured output lines and reformats them as a clean dashboard with icons and progress tracking | `DashboardFormatter`, `formatDashboardLine` |

## Dependency Management

| File | Purpose | Key Exports |
|------|---------|-------------|
| deps.ts | Auto-install external tools (Showboat, agent-browser, beads, Semgrep, BATS, cargo-tarpaulin) with fallback chains | `DEPENDENCY_REGISTRY`, `installAllDependencies`, `CriticalDependencyError` |

**Total: 34 library files across 15 categories.**
