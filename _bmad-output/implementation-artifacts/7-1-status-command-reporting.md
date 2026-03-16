# Story 7.1: Status Command & Reporting

Status: ready-for-dev

## Story

As a developer,
I want to run `codeharness status` to see the complete harness state at a glance,
So that I know what's running, what's done, and what needs attention.

## Acceptance Criteria

1. **Given** a developer runs `codeharness status`, **When** the harness is initialized, **Then** output shows in one screen: harness version and stack (`Harness: codeharness v<version>` / `Stack: nodejs`), enforcement config (`Enforcement: front:ON db:ON api:ON obs:ON`), Docker state per service with running/stopped and ports (if observability ON), beads summary with total issues by type and ready/in-progress/done counts, session flags with current values of `tests_passed`, `coverage_met`, `verification_run`, `logs_queried`, and coverage with current percentage and target.

2. **Given** `codeharness status --check` is run, **When** health checks execute, **Then** Docker stack health is verified (if observability ON), **And** beads availability is verified, **And** state file integrity is verified, **And** exit code 0 if all healthy, exit code 1 if any check fails.

3. **Given** `codeharness status --check-docker` is run, **When** Docker health is checked, **Then** each VictoriaMetrics service is checked for running state, **And** if any service is down: `[FAIL] <service>: not running`, **And** actionable remedy is shown. *(Already implemented — preserve existing behavior.)*

4. **Given** stories have been verified during a sprint, **When** status reports verification history, **Then** per-story verification summary is shown: story ID, pass/fail, AC count, proof path, **And** sprint-level verification log is maintained across iterations.

5. **Given** `codeharness status --json`, **When** status is queried, **Then** JSON output includes all status fields: version, stack, enforcement, docker, beads, session_flags, coverage, verification_log.

6. **Given** the harness is NOT initialized (no state file), **When** `codeharness status` is run (without `--check-docker`), **Then** `[FAIL] Harness not initialized. Run 'codeharness init' first.` is printed, **And** exit code is 1.

## Tasks / Subtasks

- [ ] Task 1: Implement full status display in `src/commands/status.ts` (AC: #1, #6)
  - [ ] 1.1: Replace the `fail('Not yet implemented. Coming in Epic 7.')` stub in the status command action with a call to a new `handleFullStatus(isJson)` function.
  - [ ] 1.2: In `handleFullStatus()`, read state via `readState()`. Catch `StateFileNotFoundError` and print `[FAIL] Harness not initialized. Run 'codeharness init' first.` with exit code 1.
  - [ ] 1.3: Read `package.json` from the codeharness package to get the version string. Use `import { readFileSync } from 'node:fs'` with `new URL('../../package.json', import.meta.url)` to locate it relative to the dist output. Print `Harness: codeharness v<version>`.
  - [ ] 1.4: Print `Stack: <state.stack>` (or `Stack: unknown` if null).
  - [ ] 1.5: Print enforcement config as a one-liner: `Enforcement: front:<ON|OFF> db:<ON|OFF> api:<ON|OFF> obs:<ON|OFF>`. Map boolean enforcement values to `ON`/`OFF` strings.
  - [ ] 1.6: If `state.enforcement.observability` is true, call `getStackHealth(composeFile)` (reuse existing compose file resolution logic from `handleDockerCheck`) and print Docker service status. Each service: `  <name>: <running|stopped>`. If all healthy, also print endpoint URLs.
  - [ ] 1.7: If `state.enforcement.observability` is false, print `Docker: skipped (observability OFF)`.
  - [ ] 1.8: Print session flags section: `Session: tests_passed=<true|false> coverage_met=<true|false> verification_run=<true|false> logs_queried=<true|false>`.
  - [ ] 1.9: Print coverage: `Coverage: <current>% / <target>% target` (use `state.coverage.current` and `state.coverage.target`). If current is null, print `Coverage: — / <target>% target`.

- [ ] Task 2: Add beads summary to status output (AC: #1)
  - [ ] 2.1: Import `listIssues` and `isBeadsInitialized` from `src/lib/beads.ts`.
  - [ ] 2.2: If beads is not initialized, print `Beads: not initialized`.
  - [ ] 2.3: If beads is initialized, call `listIssues()` to get all issues. Aggregate by type (bug, task, etc.) and by status (ready, in_progress, done). Print `Beads: <total> issues (bug:<N> task:<N>) | ready:<N> in-progress:<N> done:<N>`.
  - [ ] 2.4: Wrap `listIssues()` in a try/catch — if `bd` is not available or fails, print `Beads: unavailable (bd command failed)`.

- [ ] Task 3: Add verification history to status output (AC: #4)
  - [ ] 3.1: Read `state.verification_log` array. If empty, print `Verification: no entries`.
  - [ ] 3.2: If non-empty, print `Verification log:` header followed by each entry on its own line (entries are already formatted as `<storyId>: <pass|fail> at <timestamp>` by `updateVerificationState()` in `src/lib/verify.ts`).

- [ ] Task 4: Implement `--check` health check mode (AC: #2)
  - [ ] 4.1: Add `--check` option to the Commander.js status command definition.
  - [ ] 4.2: Create `handleHealthCheck(isJson)` function. This runs three checks and reports pass/fail for each:
    - State file integrity: try `readState()`, pass if no error.
    - Docker health (if observability ON): call `getStackHealth()`, pass if healthy.
    - Beads availability: call `isBeadsInitialized()` and try `listIssues()`, pass if both succeed.
  - [ ] 4.3: Print each check result: `[OK] State file: valid` or `[FAIL] State file: not found`. Same pattern for Docker and beads.
  - [ ] 4.4: Set exit code 0 if all checks pass, exit code 1 if any fail.

- [ ] Task 5: Implement JSON output for full status (AC: #5)
  - [ ] 5.1: When `--json` is passed to bare `codeharness status`, output a single JSON object with all fields: `{ version, stack, enforcement, docker, beads, session_flags, coverage, verification_log }`.
  - [ ] 5.2: The `docker` field should include service health data (reuse `getStackHealth()` result) and endpoints when healthy.
  - [ ] 5.3: The `beads` field should include `{ initialized, issues_by_type, issues_by_status }` or `{ initialized: false }` if not initialized.
  - [ ] 5.4: When `--json` is passed with `--check`, output `{ status: 'ok'|'fail', checks: { state_file, docker, beads } }` where each check is `{ status: 'ok'|'fail', detail: string }`.

- [ ] Task 6: Update existing tests, write new tests (AC: #1-#6)
  - [ ] 6.1: Update `src/commands/__tests__/status.test.ts`. The existing test `'prints not-yet-implemented message'` must be replaced — the stub is gone. Replace with a test that verifies full status output when state file exists.
  - [ ] 6.2: Add test: full status displays version, stack, enforcement, session flags, coverage. Mock `readState()` to return a known state object. Verify all output sections are present.
  - [ ] 6.3: Add test: when state file is missing (`StateFileNotFoundError`), output is `[FAIL] Harness not initialized` with exit code 1.
  - [ ] 6.4: Add test: Docker section is skipped when `observability: false` in enforcement config.
  - [ ] 6.5: Add test: Docker section shows service health when `observability: true`.
  - [ ] 6.6: Add test: beads summary shows issue counts when beads is initialized and `listIssues()` returns data. Mock `listIssues()`.
  - [ ] 6.7: Add test: beads summary handles `listIssues()` failure gracefully.
  - [ ] 6.8: Add test: verification log entries are displayed when `state.verification_log` has entries.
  - [ ] 6.9: Add test: `--check` flag runs health checks and sets exit code appropriately.
  - [ ] 6.10: Add test: `--json` output for full status includes all expected fields.
  - [ ] 6.11: Add test: `--json --check` output includes check results.
  - [ ] 6.12: Preserve all existing `--check-docker` tests — they must continue to pass unchanged.

- [ ] Task 7: Build and verify (AC: #1-#6)
  - [ ] 7.1: Run `npm run build` — verify tsup compiles successfully.
  - [ ] 7.2: Run `npm run test:unit` — verify all unit tests pass including updated status tests.
  - [ ] 7.3: Verify `codeharness status --help` shows `--check` and `--check-docker` options.
  - [ ] 7.4: Verify 100% test coverage is maintained — run `npm run test:coverage` and check no regressions.

## Dev Notes

### Architecture Context

The `codeharness status` command already exists in `src/commands/status.ts` with a working `--check-docker` subcommand. The bare `codeharness status` currently prints a "Not yet implemented. Coming in Epic 7." stub. This story replaces that stub with a full status display.

The state file (`.claude/codeharness.local.md`) contains all the data needed for status output: version, stack, enforcement config, session flags, coverage, verification log, and Docker config. The `readState()` function in `src/lib/state.ts` returns a typed `HarnessState` object with all these fields.

Beads summary requires calling `listIssues()` from `src/lib/beads.ts`, which runs `bd list --json`. This is an external command that may fail if `bd` is not installed. The status command must handle this gracefully.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/commands/status.ts` | Replace stub with full status display, add `--check` option |
| `src/commands/__tests__/status.test.ts` | Replace stub test, add comprehensive tests for all status modes |

### Existing Code to Leverage

- `src/lib/state.ts` — `readState()`, `HarnessState` interface, `StateFileNotFoundError`. All state data is here.
- `src/lib/docker.ts` — `getStackHealth()` for Docker service health. Already used by `--check-docker`.
- `src/lib/beads.ts` — `listIssues()` returns `BeadsIssue[]` with `id`, `title`, `status`, `type`, `priority`. `isBeadsInitialized()` checks for `.beads/` directory.
- `src/lib/output.ts` — `ok()`, `fail()`, `info()`, `jsonOutput()` for formatted CLI output.
- `src/lib/verify.ts` — `updateVerificationState()` writes verification log entries in format `<storyId>: <pass|fail> at <timestamp>`. Status command reads these entries from `state.verification_log`.

### Verification Log Format

Entries in `state.verification_log` are strings formatted as: `<storyId>: <pass|fail> at <ISO timestamp>`. Example: `4-1-test: pass at 2026-03-10T14:30:00.000Z`. The status command displays these as-is.

### Version Detection

The harness version should come from `package.json`. Since the CLI is bundled by tsup, the package.json is not directly importable as a module. Use `readFileSync` with a path relative to the dist directory, or import from the `state.harness_version` field which is set during `init`.

Given that `state.harness_version` is already populated by `init`, use that as the primary source. Fall back to reading `package.json` only if needed.

### Beads Issue Aggregation

`BeadsIssue` has `type: string` and `status: string`. Aggregate by iterating the array and using `Map<string, number>` counters for both type and status. Expected types: `bug`, `task`, `story`. Expected statuses: `ready`, `in_progress`, `done`.

### Preserving --check-docker

The existing `--check-docker` handler (`handleDockerCheck`) works correctly and has comprehensive tests. Do not modify it. The new `--check` flag is a separate, broader health check that includes Docker health as one of its checks.

The command action priority should be: `--check-docker` first (existing), then `--check` (new), then full status display (new default).
