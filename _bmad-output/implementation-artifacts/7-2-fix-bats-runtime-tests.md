# Story 7.2: Fix BATS Runtime Tests

Status: verifying

## Story

As an operator onboarding a project with codeharness,
I want BATS installed automatically and the BATS test suite passing cleanly,
so that `npm test` succeeds and `codeharness audit` runtime validation does not fail with "bats: command not found".

## Goal

Close the compliance gap where `codeharness audit` reports "Runtime validation failed: sh: bats: command not found". Add BATS to the dependency registry so it is installed alongside other tools during `codeharness init`. Fix or remove the 14 permanently-skipped tests in `tests/onboard.bats` that have been broken since story 3-3 refactored `onboard.sh` to delegate to the TypeScript CLI. Verify end-to-end that `npm test` passes and the audit observability runtime dimension no longer reports a bats-related failure.

## Context

The `npm test` script in `package.json` runs `bats tests/`. The runtime validator in `src/modules/observability/runtime-validator.ts` calls `npm test` via `execSync`, catches failures, and reports them through the audit observability dimension in `src/modules/audit/dimensions.ts`. When BATS is missing from PATH, the runtime validator returns `fail('Test command failed: ...')` and the audit reports "Runtime validation failed: sh: bats: command not found".

BATS is already installed in CI (`.github/workflows/ci.yml` and `release.yml` clone `bats-core` from GitHub). The gap is host-side: BATS is not in the `DEPENDENCY_REGISTRY` in `src/lib/deps.ts`, so `codeharness init` does not install it.

Additionally, `tests/onboard.bats` has 14 tests permanently marked `skip "broken: ..."` since story 3-3 refactored `onboard.sh` to delegate to the TypeScript CLI. These tests reference subcommands (scan, audit, coverage, epic) that now require full harness initialization, which the BATS test fixture does not provide. These dead tests add noise and should be either fixed to work with the new CLI delegation pattern or removed/replaced with tests that validate the actual CLI behavior.

The `DEPENDENCY_REGISTRY` pattern from `src/lib/deps.ts` handles auto-installation via fallback chains. BATS can be installed via `brew install bats-core` (macOS), `npm install -g bats` (cross-platform fallback), or cloned from GitHub (as CI does). The check command is `bats --version`.

## Acceptance Criteria

1. **Given** the `DEPENDENCY_REGISTRY` in `src/lib/deps.ts`, **When** a developer reads the registry, **Then** BATS is listed with `brew install bats-core` as the primary install command (macOS) and `npm install -g bats` as cross-platform fallback, with `checkCommand: { cmd: 'bats', args: ['--version'] }` and `critical: false`. <!-- verification: cli-verifiable -->

2. **Given** a fresh environment without BATS, **When** `installAllDependencies()` runs (via `codeharness init`), **Then** BATS is installed (or reports a non-fatal failure if neither brew nor npm is available). <!-- verification: integration-required -->

3. **Given** BATS is installed on the host, **When** `npm test` runs, **Then** all BATS test files in `tests/*.bats` execute without "command not found" errors and the exit code is 0. <!-- verification: cli-verifiable -->

4. **Given** the 14 skipped tests in `tests/onboard.bats` that reference subcommands delegated to the TypeScript CLI, **When** the test file is reviewed, **Then** dead/permanently-skipped tests are either (a) rewritten to validate the actual CLI delegation behavior (e.g., `onboard.sh scan` calls the TS CLI and exits non-zero when `--project-dir` is missing) or (b) removed with a comment explaining they were replaced by TypeScript unit tests. No test may remain with `skip "broken: ..."`. <!-- verification: cli-verifiable -->

5. **Given** the existing unit tests in `src/lib/__tests__/deps.test.ts`, **When** the BATS registry entry is added, **Then** tests cover the new entry: check-installed, install-success, and install-failure paths — maintaining 100% coverage on changed code. <!-- verification: cli-verifiable -->

6. **Given** BATS is installed and all tests pass, **When** `codeharness audit` runs against the codeharness project, **Then** the observability dimension does not report "Runtime validation failed: sh: bats: command not found" — it either reports actual runtime results or skips with a backend-related reason (not a bats-related reason). <!-- verification: cli-verifiable -->

7. **Given** the CI workflows in `.github/workflows/ci.yml` and `.github/workflows/release.yml`, **When** the BATS dependency registry entry exists, **Then** CI continues to work — the existing manual BATS install step in CI is either kept (belt-and-suspenders) or removed with a note that BATS is now in the dependency registry. No CI breakage. <!-- verification: integration-required -->

## Tasks / Subtasks

- [x] Task 1: Add BATS to DEPENDENCY_REGISTRY (AC: #1)
  - [x]Add entry to `src/lib/deps.ts` `DEPENDENCY_REGISTRY` array
  - [x]Use `brew` (via `brew install bats-core`) as primary for macOS, `npm install -g bats` as fallback
  - [x]Set `critical: false` — BATS is optional, audit degrades gracefully
- [x] Task 2: Fix broken onboard.bats tests (AC: #4)
  - [x]Audit all 14 skipped tests in `tests/onboard.bats`
  - [x]Rewrite tests to validate CLI delegation (argument parsing, error exits, help text) OR remove with explanation
  - [x]Ensure no `skip "broken: ..."` remains
- [x] Task 3: Update unit tests (AC: #5)
  - [x]Add test cases in `src/lib/__tests__/deps.test.ts` for BATS registry entry
  - [x]Verify DEPENDENCY_REGISTRY length increased by 1
  - [x]Test check-installed, install-success, install-failure for BATS entry
- [x] Task 4: Verify npm test passes (AC: #3)
  - [x]Run `bats tests/` and confirm all test files pass
  - [x]Confirm exit code is 0
- [x] Task 5: Verify audit integration (AC: #6)
  - [x]Run `codeharness audit` or inspect audit dimension code to confirm bats error is resolved
- [x] Task 6: Review CI impact (AC: #7)
  - [x]Check `.github/workflows/ci.yml` and `release.yml` for BATS install step
  - [x]Decide: keep manual install (safe) or remove (cleaner). Document decision.

## Dev Notes

### Existing Code to Modify

- **`src/lib/deps.ts`** — Add BATS entry to `DEPENDENCY_REGISTRY`. Follow exact pattern of existing entries (showboat, agent-browser, beads, semgrep).
- **`src/lib/__tests__/deps.test.ts`** — Add test coverage for new entry.
- **`tests/onboard.bats`** — Fix or remove 14 skipped tests. The core issue is `onboard.sh` now delegates to the TS CLI which requires `dist/index.js` and full project init.

### DO NOT Modify

- `src/modules/observability/runtime-validator.ts` — Already handles test command correctly. The fix is installing BATS, not changing the validator.
- `src/modules/audit/dimensions.ts` — Already reports skip/pass correctly. No changes needed.
- `ralph/onboard.sh` — The delegation pattern is correct (story 3-3). Tests should adapt to it, not revert it.

### Architecture Compliance

- **Result<T> pattern**: Not applicable — deps.ts uses its own DependencyResult type (pre-existing pattern).
- **<300 lines**: `deps.ts` is 165 lines, adding ~10 lines for registry entry. Well under limit.
- **Index exports**: deps.ts exports are already consumed directly, no index.ts wrapper needed (pre-existing pattern).
- **Test coverage**: 100% target on new/changed code.

### BATS Install Approach

On macOS, `brew install bats-core` is the standard approach. For cross-platform (Linux CI), `npm install -g bats` works. The `brew` command will fail gracefully on Linux (not found), falling through to `npm`. This mirrors how CI currently handles it (git clone + install.sh) but uses the dependency registry pattern.

Note: `brew` install commands use a different pattern than pip/pipx. The install command is `{ cmd: 'brew', args: ['install', 'bats-core'] }`. The binary name is `bats` (not `bats-core`), so `checkCommand` uses `bats`.

### Previous Story Intelligence

This is the second story in Epic 7. Story 7-1 added Semgrep to the dependency registry using the same pattern. Key learnings:
- Follow the exact DEPENDENCY_REGISTRY entry format.
- Update test count assertions when adding a new registry entry.
- The `critical: false` flag ensures audit degrades gracefully if install fails.

### References

- [Source: src/lib/deps.ts] — DEPENDENCY_REGISTRY, installDependency(), installAllDependencies()
- [Source: src/lib/__tests__/deps.test.ts] — Existing test patterns for registry entries
- [Source: tests/onboard.bats] — 14 skipped tests to fix/remove
- [Source: tests/test_helper.bash] — BATS test helper with setup_test_dir/teardown_test_dir
- [Source: ralph/onboard.sh] — Thin wrapper delegating to TypeScript CLI
- [Source: package.json#scripts.test] — `bats tests/` is the npm test command
- [Source: src/modules/observability/runtime-validator.ts] — Calls `npm test` for runtime validation
- [Source: src/modules/audit/dimensions.ts#checkObservability] — Reports runtime validation status
- [Source: .github/workflows/ci.yml#L37-43] — CI BATS install step
- [Source: .github/workflows/release.yml#L44-50] — Release BATS install step

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`verification/7-2-fix-bats-runtime-tests-proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] `src/lib/AGENTS.md` updated to include BATS in deps module description (if needed)

## Testing Requirements

- [ ] Unit tests written for BATS registry entry in deps.test.ts
- [ ] All BATS test files pass (`bats tests/`)
- [ ] No permanently-skipped broken tests remain in onboard.bats
- [ ] Coverage target: 100% on changed files
<!-- CODEHARNESS-PATCH-END:story-verification -->
