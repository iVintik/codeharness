# src/modules/verify -- Story Verification Module

Handles story verification, proof document parsing, and black-box verifier agent orchestration.

## Module Structure

| File | Purpose | Key Exports |
|------|---------|-------------|
| index.ts | Module entry point with stub exports | `verifyStory`, `parseProof` |
| types.ts | Shared types for verify domain | `VerifyResult`, `ProofQuality` |

## Tests (`__tests__/`)

| File | Tests For | Source Location |
|------|-----------|-----------------|
| index.test.ts | Module stub exports | `./index.ts` |
| verify.test.ts | Core verify orchestration | `src/lib/verify.ts` |
| verify-blackbox.test.ts | Black-box enforcement logic | `src/lib/verify.ts` |
| verify-prompt.test.ts | Verifier prompt generation | `src/templates/verify-prompt.ts` |
| verify-env.test.ts | Environment checks (Docker, workspace) | `src/lib/verify-env.ts` |
| verify-parser.test.ts | Story AC parsing, classification | `src/lib/verify-parser.ts` |
| verifier-session.test.ts | Verifier session management | `src/lib/verifier-session.ts` |

## Architecture Notes

- Tests were migrated from `src/lib/__tests__/` in story 1.3.
- Implementation code remains in `src/lib/` until the full module extraction (future epics).
- Tests import source from `../../../lib/` and `../../../templates/` relative paths.
- Module stubs return `fail("not implemented")` pending wiring in future stories.
