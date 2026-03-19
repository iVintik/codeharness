# src/modules/verify -- Story Verification Module

Handles story verification, proof document parsing, black-box verifier agent orchestration,
and Docker environment management for isolated verification.

## Module Structure

| File | Purpose | Key Exports |
|------|---------|-------------|
| index.ts | Public interface — delegates to internal files | `verifyStory`, `parseProof`, re-exports all public types/functions |
| orchestrator.ts | Verification pipeline orchestration | `checkPreconditions`, `createProofDocument`, `runShowboatVerify`, `updateVerificationState`, `closeBeadsIssue` |
| parser.ts | Story AC extraction and classification | `parseStoryACs`, `classifyAC`, `classifyVerifiability`, `classifyStrategy`, `parseVerificationTag` |
| proof.ts | Proof quality validation + black-box enforcement | `validateProofQuality`, `proofHasContent`, `classifyEvidenceCommands`, `checkBlackBoxEnforcement` |
| env.ts | Docker image lifecycle + clean workspace + stale container cleanup | `buildVerifyImage`, `prepareVerifyWorkspace`, `checkVerifyEnv`, `cleanupVerifyEnv`, `cleanupStaleContainers`, `isValidStoryKey`, `computeDistHash` |
| browser.ts | Agent-browser integration for UI testing in Docker | `BrowserVerifier` class with `navigate`, `screenshot`, `click`, `type`, `evaluate`, `isAvailable`, `diffScreenshots` |
| types.ts | All verify domain types | `VerifyResult`, `ProofQuality`, `ParsedAC`, `BuildOptions`, `BuildResult`, `CheckResult`, `BrowserActionResult`, `DiffResult`, etc. |

## Module Boundary

Only `index.ts` should be imported from outside this module. Internal files (`orchestrator.ts`, `parser.ts`, `proof.ts`, `env.ts`) are not part of the public API.

## Tests (`__tests__/`)

| File | Tests For | Source Location |
|------|-----------|-----------------|
| index.test.ts | Module delegation (verifyStory, parseProof) | `./index.ts` |
| verify.test.ts | Orchestrator + proof quality validation | `./orchestrator.ts`, `./proof.ts` |
| verify-blackbox.test.ts | Black-box enforcement logic | `./proof.ts` |
| verify-prompt.test.ts | Verifier prompt generation | `src/templates/verify-prompt.ts` |
| verify-env.test.ts | Environment checks (Docker, workspace) | `./env.ts` |
| verify-parser.test.ts | Story AC parsing, classification | `./parser.ts` |
| verifier-session.test.ts | Verifier session management | `src/lib/verifier-session.ts` |
| browser.test.ts | BrowserVerifier unit tests (mocked docker exec) | `./browser.ts` |

## Architecture Notes

- All public functions return `Result<T>` (via `verifyStory`, `parseProof`) or throw (legacy direct exports).
- Old `src/lib/verify.ts`, `src/lib/verify-parser.ts`, `src/lib/verify-env.ts` have been deleted.
- Commands (`src/commands/verify.ts`, `src/commands/verify-env.ts`) import only from `./index.ts`.
