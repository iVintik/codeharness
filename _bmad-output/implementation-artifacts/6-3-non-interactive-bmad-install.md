# Story 6.3: Non-Interactive BMAD Install

Status: verifying

## Story

As an operator,
I want BMAD to install without prompts during `codeharness init`,
so that init works headless in CI/CD, automated pipelines, and autonomous sprint execution.

## Acceptance Criteria

1. **Given** BMAD is not installed (no `_bmad/` directory), **When** `codeharness init` runs, **Then** it invokes `npx bmad-method install --yes --tools claude-code` non-interactively — no stdin prompts, no user confirmation required — and creates the `_bmad/` directory. <!-- verification: cli-verifiable -->
2. **Given** BMAD is already installed (`_bmad/` directory exists), **When** `codeharness init` runs, **Then** it skips the install step, applies harness patches via `applyAllPatches()`, and returns a result with `status: 'already-installed'` and a list of patches applied. <!-- verification: cli-verifiable -->
3. **Given** BMAD install fails (e.g., network error, npx not found, timeout), **When** the error is caught by `setupBmad()`, **Then** it returns `ok()` with `status: 'failed'` and an `error` field containing the command string and the original error message — it never throws and never halts init. <!-- verification: cli-verifiable -->
4. **Given** `installBmad()` in `src/lib/bmad.ts` is called, **When** it executes, **Then** it uses `execFileSync` with `stdio: 'pipe'` (not `'inherit'`) to suppress all interactive output, and sets a `timeout` of 120 seconds to prevent hangs. <!-- verification: cli-verifiable -->
5. **Given** `installBmad()` succeeds but `_bmad/` was not created (silent failure from npx), **When** the post-install check runs, **Then** it throws `BmadError` with a descriptive message indicating the directory was not created despite a successful exit code. <!-- verification: cli-verifiable -->
6. **Given** BMAD is freshly installed, **When** the install completes, **Then** harness patches are applied immediately after install (in the same `setupBmad()` call) and the result includes the list of applied patch names. <!-- verification: cli-verifiable -->
7. **Given** `setupBmad()` is called in JSON output mode (`isJson: true`), **When** it executes, **Then** no console output is emitted (no `info()`, `ok()`, `warn()`, or `fail()` calls) — all information is returned in the result object only. <!-- verification: cli-verifiable -->
8. **Given** bmalph artifacts are detected (`.ralph/.ralphrc` or `.ralph/` directory), **When** `setupBmad()` runs, **Then** the result includes `bmalph_detected: true` and a warning is emitted (unless JSON mode). <!-- verification: cli-verifiable -->
9. **Given** `verifyBmadOnRerun()` is called on a project where BMAD is installed, **When** it executes, **Then** it re-applies patches, detects bmalph, and returns the current BMAD status — and if any step throws, it returns `undefined` without crashing. <!-- verification: cli-verifiable -->
10. **Given** all BMAD-related code in `src/modules/infra/bmad-setup.ts` and `src/lib/bmad.ts`, **When** tests are run, **Then** unit tests cover all paths (fresh install, already installed, install failure, post-install verification failure, bmalph detection, JSON mode, re-run path) with 100% coverage on new/changed code. <!-- verification: cli-verifiable -->
11. **Given** the infra module's `initProject()` orchestrator calls `setupBmad()`, **When** BMAD install fails, **Then** `initProject()` continues with the remaining init steps (docs, state, OTLP) and includes the BMAD failure in the final `InitResult.bmad` field — init does not abort. <!-- verification: cli-verifiable -->
12. **Given** `codeharness init` is run in an environment without network access, **When** `npx bmad-method install` fails with a network error, **Then** the error message includes the failed command and enough context for the operator to diagnose the issue (e.g., "BMAD failed: ... Command: npx bmad-method install --yes --tools claude-code"). <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Verify `src/lib/bmad.ts` `installBmad()` meets non-interactive requirements (AC: #1, #4, #5)
  - [x]Confirm `--yes` flag is passed to prevent prompts
  - [x]Confirm `stdio: 'pipe'` suppresses interactive output
  - [x]Confirm `timeout: 120_000` is set
  - [x]Confirm post-install `_bmad/` existence check throws `BmadError` on silent failure
- [x] Task 2: Verify `src/modules/infra/bmad-setup.ts` `setupBmad()` handles all paths (AC: #2, #3, #6, #7, #8)
  - [x]Fresh install path: calls `installBmad()` then `applyAllPatches()`, returns patches in result
  - [x]Already-installed path: skips install, calls `applyAllPatches()`, returns `already-installed`
  - [x]Failure path: catches `BmadError` and generic errors, returns `ok()` with `status: 'failed'`
  - [x]JSON mode: no console output when `isJson: true`
  - [x]bmalph detection: calls `detectBmalph()`, sets `bmalph_detected` in result
- [x] Task 3: Verify `verifyBmadOnRerun()` behavior (AC: #9)
  - [x]Returns BMAD status when installed
  - [x]Returns `undefined` when not installed
  - [x]Returns `undefined` on any thrown error (no crash)
- [x] Task 4: Verify integration with `initProject()` orchestrator (AC: #11)
  - [x]Confirm `setupBmad()` failure does not halt init
  - [x]Confirm BMAD result (including failure) is included in `InitResult.bmad`
- [x] Task 5: Add/update unit tests for full coverage (AC: #10)
  - [x]`src/modules/infra/__tests__/bmad-setup.test.ts` — covers all `setupBmad()` and `verifyBmadOnRerun()` paths
  - [x]Verify test for install command arguments (`--yes`, `--tools claude-code`)
  - [x]Verify test for `stdio: 'pipe'` configuration
  - [x]Verify test for timeout configuration
  - [x]Verify test for post-install directory check
  - [x]Verify test for error message format on failure
- [x] Task 6: Verify build (`npm run build`) succeeds
- [x] Task 7: Verify all tests pass (`npm test`)
- [x] Task 8: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ES modules** — all imports use `.js` extension. [Source: tsconfig.json]
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **Module boundary** — internal files are private to infra module. Only `index.ts` is the public interface.

### Current State

Story 6-1 extracted init.ts into infra module sub-components. Story 6-2 implemented stack management. The BMAD-related code is already extracted:

- **`src/lib/bmad.ts`** — Core BMAD functions: `installBmad()`, `isBmadInstalled()`, `detectBmadVersion()`, `applyAllPatches()`, `detectBmalph()`. The `installBmad()` function already uses `--yes --tools claude-code` and `stdio: 'pipe'` with a 120s timeout. It already throws `BmadError` on failure and verifies `_bmad/` creation post-install.
- **`src/modules/infra/bmad-setup.ts`** — Module wrapper: `setupBmad()` composes the lib functions with Result<T> pattern. Returns `ok()` with `status: 'failed'` on error (BMAD is non-critical). `verifyBmadOnRerun()` handles the re-run path.
- **`src/modules/infra/__tests__/bmad-setup.test.ts`** — Existing tests cover: fresh install, already-installed, bmalph detection, BmadError handling, generic error handling, JSON mode suppression, re-run paths.

### Key Observation

Much of this story's functionality is already implemented in stories 6-1 (init extraction). The `installBmad()` function in `src/lib/bmad.ts` already passes `--yes` and uses `stdio: 'pipe'`. The `setupBmad()` wrapper already handles all error cases gracefully. This story is primarily about **verification and hardening** of the existing non-interactive install path, plus ensuring test coverage is comprehensive.

### What May Need Work

1. **Test coverage gaps** — verify that existing tests in `bmad-setup.test.ts` cover 100% of branches. The existing tests look comprehensive but need verification via coverage report.
2. **Error message quality** — verify that `BmadError` includes enough context (command string + original message) for diagnosing network/timeout failures.
3. **Integration test** — AC #12 requires testing in a no-network environment, which needs integration test infrastructure.

### Dependencies

- **Story 6-1 (verifying):** Infra module structure, bmad-setup.ts, init-project.ts
- **Story 6-2 (verifying):** Stack management (no direct dependency, but same module)
- **No external dependencies needed.** All logic wraps existing `src/lib/bmad.ts` functions.

### What This Unblocks

- Headless/CI init flows where BMAD cannot prompt for input
- Autonomous sprint execution (`codeharness run`) that may need to re-init projects

### References

- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 6.3]
- [Source: _bmad-output/planning-artifacts/prd-overhaul.md — FR4]
- [Source: src/lib/bmad.ts — installBmad(), BmadError]
- [Source: src/modules/infra/bmad-setup.ts — setupBmad(), verifyBmadOnRerun()]
- [Source: src/modules/infra/__tests__/bmad-setup.test.ts — existing tests]
- [Source: src/modules/infra/init-project.ts — orchestrator calling setupBmad()]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/6-3-non-interactive-bmad-install.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/6-3-non-interactive-bmad-install.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
