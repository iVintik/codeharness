# Story 4.3: Verifier Session Reliability

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system,
I want verifier sessions to never hang or produce 0 bytes,
so that every verification attempt produces usable output regardless of failures or timeouts.

## Acceptance Criteria

1. **Given** the verifier spawns `claude --print` via `spawnVerifierSession()`, **When** the session is created, **Then** the args array includes `--allowedTools` with at least `Bash`, `Read`, `Write`, `Glob`, `Grep`, `Edit`. <!-- verification: cli-verifiable -->

2. **Given** verification runs inside a Docker container via `docker exec`, **When** a nested `claude --print` is invoked inside the container, **Then** that nested invocation also includes `--allowedTools` with the same tool set. <!-- verification: integration-required -->

3. **Given** a verifier session times out (exit code 124 or ETIMEDOUT), **When** the timeout is detected, **Then** partial proof content is saved to `verification/<story-key>-proof.md` and the function returns `Result<VerifyResult>` with `success: false` and error context including duration and partial output length. <!-- verification: cli-verifiable -->

4. **Given** stale verification containers exist (matching `codeharness-verify-*` pattern), **When** a new verification session starts, **Then** stale containers are cleaned up before spawning the new session, using `docker rm -f` with a timeout guard. <!-- verification: cli-verifiable -->

5. **Given** the verifier session completes (success or failure), **When** the result is checked, **Then** `output.length > 0` — zero-byte output is never returned; if the process produced no stdout, the result includes stderr or a descriptive error message. <!-- verification: cli-verifiable -->

6. **Given** the `spawnVerifierSession()` function is called, **When** any unexpected error occurs (Docker crash, OOM kill, filesystem permission error), **Then** the function catches the error and returns `Result<VerifyResult>` with `success: false` — never throws an unhandled exception. <!-- verification: cli-verifiable -->

7. **Given** `cleanupVerifyEnv(storyKey)` is called, **When** the container does not exist, **Then** the function completes without error (idempotent). **Given** the container is running, **When** cleanup is called, **Then** the container is stopped and removed. <!-- verification: cli-verifiable -->

8. **Given** the sprint execution loop calls `verifyStory()`, **When** the verifier session hangs or the Docker daemon is unresponsive, **Then** the configured timeout fires, partial output is captured, and the sprint loop continues to the next story without crashing. <!-- verification: integration-required -->

9. **Given** new code in `src/modules/verify/` and `src/lib/verifier-session.ts`, **When** unit tests run, **Then** 100% coverage on all new/changed code (NFR14) with tests in `src/modules/verify/__tests__/`. <!-- verification: cli-verifiable -->

10. **Given** all files in `src/modules/verify/` and `src/lib/verifier-session.ts`, **When** reviewed, **Then** no file exceeds 300 lines (NFR18) and all types use strict TypeScript with no `any` (NFR19). <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Refactor `spawnVerifierSession()` to return `Result<VerifyResult>` (AC: #1, #3, #5, #6)
  - [x] Change return type from `VerifierSessionResult` to `Result<VerifyResult>` — wrap with `ok`/`fail`
  - [x] Remove all `throw` statements — catch internally and return `fail()`
  - [x] Ensure `--allowedTools` args include `Bash`, `Read`, `Write`, `Glob`, `Grep`, `Edit` (already present, verify)
  - [x] On timeout: save partial output to proof path before returning `fail()`
  - [x] Guarantee non-zero output: if stdout is empty, fall back to stderr, then to descriptive message

- [x] Task 2: Add stale container cleanup before session spawn (AC: #4, #7)
  - [x] Create `cleanupStaleContainers()` in `env.ts` — lists containers matching `codeharness-verify-*`, removes with `docker rm -f`, timeout guard of 15s
  - [x] Call `cleanupStaleContainers()` at the top of `spawnVerifierSession()` before spawning
  - [x] Ensure `cleanupVerifyEnv()` remains idempotent (already is — verify tests cover it)

- [x] Task 3: Add nested `--allowedTools` to Docker exec verification prompt (AC: #2)
  - [x] Update `verifyPromptTemplate()` to include instruction: "When invoking claude --print inside Docker, always pass --allowedTools Bash Read Write Glob Grep Edit"
  - [x] Add test verifying prompt contains nested `--allowedTools` instruction

- [x] Task 4: Partial proof capture on timeout (AC: #3, #8)
  - [x] On timeout detection, check if any partial proof file exists in workspace
  - [x] If partial proof exists, copy to `verification/<story-key>-proof.md`
  - [x] If no partial proof, write a timeout report with: story key, duration, partial stdout, error
  - [x] Return `fail()` with context `{ duration, partialOutputLength, proofSaved: boolean }`

- [x] Task 5: Write unit tests (AC: #9, #10)
  - [x] Test `spawnVerifierSession()` returns `ok()` on success with proof
  - [x] Test `spawnVerifierSession()` returns `fail()` on timeout with partial proof saved
  - [x] Test `spawnVerifierSession()` returns `fail()` on process crash — never throws
  - [x] Test `spawnVerifierSession()` always returns non-empty output
  - [x] Test `--allowedTools` present in args
  - [x] Test `cleanupStaleContainers()` removes matching containers
  - [x] Test `cleanupStaleContainers()` handles no containers gracefully
  - [x] Verify all files under 300 lines, no `any`

- [x] Task 6: Build and verify (AC: #9, #10)
  - [x] `npm run build` succeeds
  - [x] `npm test` passes all existing + new tests
  - [x] No file in `src/modules/verify/` or `src/lib/verifier-session.ts` exceeds 300 lines
  - [x] No `any` types in new code (existing `error as { status?: number; ... }` pattern is acceptable — use proper error type)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — internal files are not imported from outside the module. Only `index.ts` is the public interface.

### Key FRs & NFRs

- **FR13:** System can spawn a black-box verifier session in isolated Docker container.
- **FR14:** Verifier can run CLI commands via docker exec and capture output as proof.
- **FR20:** Verifier session has `--allowedTools` configured.
- **NFR1:** No module failure crashes the overall system — structured error results.
- **NFR3:** Every ralph iteration produces a report, even on timeout — zero 0-byte outputs.
- **NFR13:** Stale verification containers cleaned up automatically.
- **NFR14:** 100% test coverage on new/changed code.
- **NFR18:** No source file exceeds 300 lines.
- **NFR19:** Module interfaces documented with TypeScript types — no `any`.

### What Already Exists (from Stories 4.1 and 4.2)

- `src/lib/verifier-session.ts` (199 lines) — `spawnVerifierSession()` and `copyProofToProject()`. Currently uses `execFileSync` with `claude --print`. Already passes `--allowedTools` with `Bash`, `Read`, `Write`, `Glob`, `Grep`, `Edit`. **Problem:** throws on errors instead of returning `Result<T>`. Returns a plain `VerifierSessionResult` object, not `Result<T>`.
- `src/modules/verify/env.ts` (273 lines) — `cleanupVerifyEnv(storyKey)` already stops/removes a specific container. **Missing:** no function to clean up ALL stale `codeharness-verify-*` containers.
- `src/modules/verify/orchestrator.ts` (182 lines) — verification pipeline. Calls `spawnVerifierSession()` indirectly.
- `src/modules/verify/proof.ts` (288 lines, near 300 limit) — DO NOT add code to this file.
- `src/modules/verify/types.ts` (120 lines) — all verify domain types.
- `src/modules/verify/index.ts` (141 lines) — public interface re-exports.
- `src/templates/verify-prompt.ts` (133 lines) — verification prompt template. Needs nested `--allowedTools` instruction for Docker exec scenarios.

### The Specific Problems to Fix

1. **`spawnVerifierSession()` throws** — Lines 86-98 of `verifier-session.ts` throw `Error` on invalid key, missing workspace, missing story. These must return `fail()` instead.
2. **No stale container cleanup** — `cleanupVerifyEnv()` cleans ONE container by key. No function lists/removes ALL stale `codeharness-verify-*` containers.
3. **0-byte output possible** — If `execFileSync` throws and stdout/stderr are both empty, `output` could be empty string. Must guarantee non-zero output.
4. **No partial proof save on timeout** — When timeout occurs, the session returns an error but does not save whatever partial proof may exist in the workspace.

### Dependencies

- **Story 4.1 (done):** Verify module extraction — code is in `src/modules/verify/`.
- **Story 4.2 (done):** Project-agnostic verification — `detectProjectType`, `buildPluginImage`, `buildGenericImage`.
- **Epic 1 (done):** Result<T> types in `src/types/result.ts`.
- **No new npm dependencies.** Uses existing `node:child_process`, `node:fs`, `node:path`.

### Existing Patterns to Follow

- **Result<T> returns:** See `verifyStory()` in `src/modules/verify/index.ts` lines 79-129 — wraps everything in try/catch and returns `ok()`/`fail()`.
- **Container cleanup:** See `cleanupVerifyEnv()` in `src/modules/verify/env.ts` lines 194-205 — stops then removes with `-f`, catches errors silently.
- **Tests:** See `src/modules/verify/__tests__/verify-env.test.ts` — mocks `child_process.execFileSync`, tests all Result paths.
- **Error casting:** The existing pattern in `verifier-session.ts` lines 140-142 casts errors as `{ status?: number; stdout?: Buffer; stderr?: Buffer; message?: string }` — use a proper type or keep this pattern but replace `any` usage.

### Scope Boundary

**IN SCOPE:**
- Refactoring `spawnVerifierSession()` to return `Result<VerifyResult>` instead of throwing
- Adding `cleanupStaleContainers()` to remove all `codeharness-verify-*` containers
- Saving partial proof on timeout
- Guaranteeing non-zero output from every session
- Adding nested `--allowedTools` instruction to verify prompt
- Unit tests for all new behavior

**OUT OF SCOPE:**
- Agent-browser integration for web projects (Epic 8)
- OpenSearch backend (Epic 7)
- Changes to `proof.ts` (at 288 lines, near limit)
- Docker image building changes (handled by Story 4.2)

### Previous Story Intelligence (from 4.2 completion notes)

- `proof.ts` is at 299 lines after compaction — absolutely no additions to this file
- TypeScript mock objects in tests must include all required fields (e.g., `strategy` field on `ParsedAC`)
- `checkVerifyEnv()` had a bug where readonly fields were mutated — use mutable locals and construct at return time
- Module boundary enforced: no external imports to internal files — only `index.ts`
- All 1962 tests pass (73 test files) after Story 4.2 — baseline for regression checking
- `env.ts` coverage is at 93% — uncovered lines are existing error paths

### Git Intelligence

Recent commits show a pattern of:
- One commit per story with `feat: story X-Y — description` format
- Test verification is part of the story completion
- `npm run build && npm test` before committing

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 4.3 — Verifier Session Reliability]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 1 — Result Type Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Docker Interaction Pattern]
- [Source: src/lib/verifier-session.ts — session spawner with throws]
- [Source: src/modules/verify/env.ts — cleanupVerifyEnv per-story only]
- [Source: src/templates/verify-prompt.ts — needs nested --allowedTools instruction]

### Project Structure Notes

- `src/lib/verifier-session.ts` is in `lib/` not `modules/verify/` — it's used by the orchestration layer. Consider whether to move it into `modules/verify/session.ts` as the architecture doc suggests. If moved, update `index.ts` re-exports and all importers. If left in `lib/`, that's acceptable since it's cross-cutting infrastructure.
- The architecture doc (Decision 6, Phase 1) lists the target as `src/modules/verify/session.ts` but this migration is not required for this story — focus on reliability, not reorganization.

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/4-3-verifier-session-reliability.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/verify/, src/lib/)
- [ ] Exec-plan created in `docs/exec-plans/active/4-3-verifier-session-reliability.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None.

### Completion Notes List

- Refactored `spawnVerifierSession()` from throwing errors to returning `Result<VerifyResult>`. Removed the `VerifierSessionResult` type in favor of the module's `VerifyResult` wrapped in `Result<T>`.
- Replaced the untyped `error as { status?; stdout?; ... }` cast with a proper `SpawnError` interface.
- Added `cleanupStaleContainers()` to `env.ts` — lists all `codeharness-verify-*` containers via `docker ps` and removes them with `docker rm -f`, with 15s timeout guards on both operations.
- `cleanupStaleContainers()` is called at the top of `spawnVerifierSession()` before spawning.
- Added `savePartialProof()` helper that writes a timeout report to the proof path when the verifier times out, preserving any existing partial proof.
- Added `ensureNonEmptyOutput()` helper that guarantees non-zero output by falling back to stderr, then to a descriptive error message.
- Added `isTimeoutError()` helper that detects timeout via `killed`, `code === 'ETIMEDOUT'`, or message content.
- Added nested `--allowedTools` instruction to `verify-prompt.ts` for Docker exec scenarios.
- 28 tests in `verifier-session.test.ts` (up from 18), 58 tests in `verify-env.test.ts` (up from 54), 26 tests in `verify-prompt.test.ts` (up from 25).
- Coverage: `verifier-session.ts` 100% statements/functions/lines, `env.ts` 99.46%/100%/100%, `verify-prompt.ts` 100%.
- All files under 300 lines. No `any` types in new code.
- 1984 tests pass across 73 test files (up from 1982 baseline).

### File List

- src/lib/verifier-session.ts (modified — refactored to Result<T>, added helpers)
- src/modules/verify/env.ts (modified — added cleanupStaleContainers())
- src/modules/verify/index.ts (modified — re-export cleanupStaleContainers)
- src/templates/verify-prompt.ts (modified — nested --allowedTools instruction)
- src/modules/verify/__tests__/verifier-session.test.ts (modified — rewrote for Result<T> API, added 10 new tests)
- src/modules/verify/__tests__/verify-env.test.ts (modified — added 4 cleanupStaleContainers tests)
- src/modules/verify/__tests__/verify-prompt.test.ts (modified — added nested --allowedTools test)
