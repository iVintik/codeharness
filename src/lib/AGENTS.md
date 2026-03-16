# src/lib — Shared Libraries

Pure library modules consumed by CLI commands (`src/commands/`) and by each other. No CLI entry points, no side effects on import.

## State & Output

| File | Purpose | Key Exports |
|------|---------|-------------|
| state.ts | YAML front-matter state persistence in `.claude/codeharness.local.md` | `readState`, `writeState`, `readStateWithBody`, `getStatePath`, `HarnessState` |
| output.ts | Structured `[OK]/[FAIL]/[WARN]/[INFO]` CLI output with JSON mode | `ok`, `fail`, `warn`, `info`, `jsonOutput` |

## Stack & Environment

| File | Purpose | Key Exports |
|------|---------|-------------|
| stack-detect.ts | Detects project language (nodejs/python) and app type | `detectStack`, `detectAppType`, `AppType` |
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
| coverage.ts | Coverage tool detection (Vitest/c8/coverage.py), execution, evaluation, per-file floors | `detectCoverageTool`, `runCoverage`, `checkOnlyCoverage`, `evaluateCoverage`, `checkPerFileCoverage`, `getTestCommand` |

## Verification Pipeline

| File | Purpose | Key Exports |
|------|---------|-------------|
| verify-parser.ts | Parses story ACs with type classification (ui/api/db/general) | `parseStoryACs`, `classifyAC`, `ParsedAC` |
| verify.ts | Verification orchestrator — preconditions, proof quality validation, Showboat, state | `checkPreconditions`, `validateProofQuality`, `ProofQuality`, `createProofDocument`, `runShowboatVerify`, `closeBeadsIssue`, `proofHasContent` (deprecated) |
| verify-env.ts | Black-box verification environment — Docker image build (npm pack/pip install), clean workspace prep, env check, cleanup | `buildVerifyImage`, `prepareVerifyWorkspace`, `checkVerifyEnv`, `cleanupVerifyEnv`, `computeDistHash`, `isValidStoryKey` |
| verifier-session.ts | Black-box verifier session spawner — runs `claude --print` in clean workspace, copies proof back to project | `spawnVerifierSession`, `copyProofToProject`, `VerifierSessionResult` |

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

## Dependency Management

| File | Purpose | Key Exports |
|------|---------|-------------|
| deps.ts | Auto-install external tools (Showboat, beads) with fallback chains | `DEPENDENCY_REGISTRY`, `installAllDependencies`, `CriticalDependencyError` |

**Total: 24 library files across 10 categories.**
