# src/modules/verify -- Story Verification Module

Handles story verification, proof document parsing, black-box verifier agent orchestration,
and Docker environment management for isolated verification.

## Module Structure

| File | Purpose | Key Exports |
|------|---------|-------------|
| index.ts | Public interface — delegates to internal files | `verifyStory`, `parseProof`, re-exports all public types/functions |
| orchestrator.ts | Verification pipeline orchestration | `checkPreconditions`, `createProofDocument`, `runShowboatVerify`, `updateVerificationState`, `closeBeadsIssue` |
| parser.ts | Story AC extraction and classification | `parseStoryACs`, `classifyAC`, `classifyTier`, `classifyVerifiability` (deprecated), `classifyStrategy` (deprecated), `parseVerificationTag` |
| parser-keywords.ts | Keyword arrays for AC classification (extracted from parser.ts for 300-line limit) | `UI_KEYWORDS`, `API_KEYWORDS`, `DB_KEYWORDS`, `INTEGRATION_KEYWORDS`, `ESCALATE_KEYWORDS`, `TEST_PROVABLE_KEYWORDS`, `RUNTIME_PROVABLE_KEYWORDS`, `ENVIRONMENT_PROVABLE_KEYWORDS`, `ESCALATE_TIER_KEYWORDS` |
| proof.ts | Proof quality validation + black-box enforcement | `validateProofQuality`, `proofHasContent`, `classifyEvidenceCommands`, `checkBlackBoxEnforcement` |
| dockerfile-generator.ts | Dynamic Dockerfile generation from stack providers (Architecture Decision 10). Assembles base image + common tools + per-stack sections + OTLP env vars. | `generateVerifyDockerfile` |
| env.ts | Docker image lifecycle + clean workspace + stale container cleanup. Supports nodejs, python, rust, plugin, and generic project types. Uses `generateVerifyDockerfile()` instead of static templates. | `buildVerifyImage`, `prepareVerifyWorkspace`, `checkVerifyEnv`, `cleanupVerifyEnv`, `cleanupStaleContainers`, `isValidStoryKey`, `computeDistHash`, `detectProjectType` |
| browser.ts | Agent-browser integration for UI testing in Docker | `BrowserVerifier` class with `navigate`, `screenshot`, `click`, `type`, `evaluate`, `isAvailable`, `diffScreenshots` |
| types.ts | All verify domain types | `VerifyResult`, `ProofQuality`, `ParsedAC`, `BuildOptions`, `BuildResult`, `CheckResult`, `BrowserActionResult`, `DiffResult`, etc. |
| validation-acs.ts | Validation AC registry barrel — combines all 79 ACs | `VALIDATION_ACS`, `getACsByCategory`, `getTestProvableACs`, `getEnvironmentProvableACs`, `getCliVerifiableACs` (deprecated), `getIntegrationRequiredACs` (deprecated), `getACById` |
| validation-ac-types.ts | Types for validation AC entries | `ValidationAC`, `VerificationMethod`, `AcCategory` |
| validation-ac-fr.ts | FR validation AC data (ACs 1-40) | `FR_ACS` |
| validation-ac-data.ts | NFR/UX/Regression/ActionItem AC data (ACs 41-79) | `NFR_ACS`, `UX_ACS`, `REGRESSION_ACS`, `ACTION_ITEM_ACS` |
| validation-runner.ts | Validation infrastructure: sprint init, AC execution, fix story gen, result processing | `createValidationSprint`, `executeValidationAC`, `createFixStory`, `processValidationResult` |
| validation-orchestrator.ts | Validation orchestration: cycle execution, progress tracking | `runValidationCycle`, `getValidationProgress` |
| validation-runner-types.ts | Types for validation runner | `ValidationACResult`, `ValidationSprintResult`, `ValidationCycleResult`, `ValidationProgress`, `ValidationVerdict` |

## Module Boundary

Only `index.ts` should be imported from outside this module. Internal files (`orchestrator.ts`, `parser.ts`, `proof.ts`, `env.ts`) are not part of the public API.

## Tests (`__tests__/`)

| File | Tests For | Source Location |
|------|-----------|-----------------|
| index.test.ts | Module delegation (verifyStory, parseProof) | `./index.ts` |
| verify.test.ts | Orchestrator + proof quality validation | `./orchestrator.ts`, `./proof.ts` |
| verify-blackbox.test.ts | Black-box enforcement logic | `./proof.ts` |
| verify-prompt.test.ts | Verifier prompt generation | `src/templates/verify-prompt.ts` |
| dockerfile-generator.test.ts | Dynamic Dockerfile generation from stack providers | `./dockerfile-generator.ts` |
| verify-env.test.ts | Environment checks (Docker, workspace) | `./env.ts` |
| verify-parser.test.ts | Story AC parsing, classification | `./parser.ts` |
| verifier-session.test.ts | Verifier session management | `src/lib/verifier-session.ts` |
| browser.test.ts | BrowserVerifier unit tests (mocked docker exec) | `./browser.ts` |
| validation-acs.test.ts | Validation AC registry: count, structure, distribution, helpers | `./validation-acs.ts` |
| validation-runner.test.ts | Validation runner: sprint init, AC execution, fix stories, result processing, orchestration | `./validation-runner.ts`, `./validation-orchestrator.ts` |
| verification-observability-patch.test.ts | Patch content validation + observability integration regression tests | `patches/verify/story-verification.md`, `src/templates/verify-prompt.ts`, `./parser.ts` |

## Architecture Notes

- All public functions return `Result<T>` (via `verifyStory`, `parseProof`) or throw (legacy direct exports).
- Old `src/lib/verify.ts`, `src/lib/verify-parser.ts`, `src/lib/verify-env.ts` have been deleted.
- Commands (`src/commands/verify.ts`, `src/commands/verify-env.ts`, `src/commands/validate.ts`) import only from `./index.ts`.
- The `codeharness status` command imports `getValidationProgress` from `./index.ts` for real-time validation display.
