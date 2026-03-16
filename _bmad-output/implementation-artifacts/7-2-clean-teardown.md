# Story 7.2: Clean Teardown

Status: ready-for-dev

## Story

As a developer,
I want to run `codeharness teardown` to remove all harness artifacts,
So that I can cleanly uninstall the harness without losing my project code or task history.

## Acceptance Criteria

1. **Given** a developer runs `codeharness teardown`, **When** teardown executes, **Then** Docker stack is stopped via `docker compose -f docker-compose.harness.yml down -v`, **And** `docker-compose.harness.yml` is removed, **And** `otel-collector-config.yaml` is removed, **And** state file `.claude/codeharness.local.md` is removed, **And** BMAD harness patches are removed (content between markers deleted, markers deleted), **And** OTLP instrumentation configuration is removed (`:instrumented` script key from package.json, OTLP state from state file), **And** `[OK] Harness teardown complete` is printed.

2. **Given** teardown runs, **When** project files are evaluated, **Then** project source code is NOT modified (NFR15), **And** beads data (`.beads/`) is NOT removed (preserved by default), **And** BMAD artifacts (`_bmad/`) are NOT removed (only harness patches within them), **And** `docs/` content created by the developer is NOT removed, **And** verification proof documents are NOT removed.

3. **Given** `codeharness teardown --keep-docker`, **When** teardown executes, **Then** Docker stack is left running, **And** `docker-compose.harness.yml` is preserved, **And** `otel-collector-config.yaml` is preserved, **And** all other artifacts are removed.

4. **Given** `codeharness teardown --keep-beads`, **When** teardown executes, **Then** beads data is explicitly preserved (this is the default, flag is for clarity/documentation).

5. **Given** Docker is not running at teardown time, **When** teardown tries to stop Docker, **Then** `[INFO] Docker stack: not running, skipping` is printed, **And** teardown continues without error.

6. **Given** the harness is NOT initialized (no state file), **When** `codeharness teardown` is run, **Then** `[FAIL] Harness not initialized. Nothing to tear down.` is printed, **And** exit code is 1.

7. **Given** `codeharness teardown --json`, **When** teardown completes, **Then** JSON output includes list of removed artifacts and preserved items.

## Tasks / Subtasks

- [ ] Task 1: Implement teardown command action in `src/commands/teardown.ts` (AC: #1, #6)
  - [ ] 1.1: Replace the `fail('Not yet implemented. Coming in Epic 7.')` stub with a full teardown handler. Add options: `--keep-docker`, `--keep-beads`, and inherit `--json` from global options.
  - [ ] 1.2: Read state via `readState()`. Catch `StateFileNotFoundError` and print `[FAIL] Harness not initialized. Nothing to tear down.` with exit code 1. Return early.
  - [ ] 1.3: Build a `TeardownResult` object to track what was removed and what was preserved for both human-readable and JSON output.

- [ ] Task 2: Stop and remove Docker artifacts (AC: #1, #3, #5)
  - [ ] 2.1: If `--keep-docker` is NOT set: check if Docker stack is running via `isStackRunning(composeFile)` where `composeFile` comes from `state.docker?.compose_file ?? 'docker-compose.harness.yml'`.
  - [ ] 2.2: If stack is running, call `stopStack(composeFile)`. Print `[OK] Docker stack: stopped`. If `stopStack` throws, catch the error, print `[WARN] Docker stack: failed to stop (<message>)`, and continue teardown.
  - [ ] 2.3: If stack is NOT running, print `[INFO] Docker stack: not running, skipping`.
  - [ ] 2.4: Remove `docker-compose.harness.yml` file using `unlinkSync`. Print `[OK] Removed: docker-compose.harness.yml`.
  - [ ] 2.5: Remove `otel-collector-config.yaml` file using `unlinkSync`. Print `[OK] Removed: otel-collector-config.yaml`.
  - [ ] 2.6: If either file does not exist, skip silently (no error).
  - [ ] 2.7: If `--keep-docker` IS set, print `[INFO] Docker stack: kept (--keep-docker)` and skip all Docker teardown steps.

- [ ] Task 3: Remove BMAD harness patches (AC: #1, #2)
  - [ ] 3.1: Import `PATCH_TARGETS` from `src/lib/bmad.ts` and `removePatch` from `src/lib/patch-engine.ts`.
  - [ ] 3.2: Iterate over all entries in `PATCH_TARGETS`. For each patch name and relative path, resolve the full file path as `join(projectDir, '_bmad', relativePath)`.
  - [ ] 3.3: If the target file exists, call `removePatch(filePath, patchName)`. If it returns `true`, record the patch as removed. If `false`, the patch wasn't present — skip silently.
  - [ ] 3.4: If the target file does not exist, skip silently.
  - [ ] 3.5: Print summary: `[OK] BMAD patches: removed <N> patches` or `[INFO] BMAD patches: none found`.

- [ ] Task 4: Remove OTLP instrumentation (AC: #1)
  - [ ] 4.1: If `state.otlp?.enabled` is true and `state.stack === 'nodejs'`, check the project's `package.json` for any `:instrumented` script keys (e.g., `start:instrumented`, `dev:instrumented`) that contain the `NODE_REQUIRE_FLAG` (`--require @opentelemetry/auto-instrumentations-node/register`).
  - [ ] 4.2: Remove those script entries from `package.json` and write the file back. Print `[OK] OTLP: removed instrumented scripts from package.json`.
  - [ ] 4.3: If no instrumented scripts found, print `[INFO] OTLP: no instrumented scripts found`.
  - [ ] 4.4: Note: Do NOT uninstall OTLP npm packages — that could break the project if it uses them independently. Only remove codeharness-added configuration.

- [ ] Task 5: Remove state file (AC: #1)
  - [ ] 5.1: Remove `.claude/codeharness.local.md` using `unlinkSync`. Print `[OK] Removed: .claude/codeharness.local.md`.
  - [ ] 5.2: This must be the LAST removal step, since earlier steps read state to determine what to clean up.

- [ ] Task 6: Print summary and preserved items (AC: #1, #2)
  - [ ] 6.1: Print `[OK] Harness teardown complete`.
  - [ ] 6.2: Print preserved items: `[INFO] Preserved: .beads/ (task history)`, `[INFO] Preserved: _bmad/ (BMAD artifacts, patches removed)`, `[INFO] Preserved: docs/ (documentation)`.

- [ ] Task 7: Implement JSON output (AC: #7)
  - [ ] 7.1: When `--json` is passed, suppress all human-readable output and instead collect all actions into a `TeardownResult` object.
  - [ ] 7.2: Output JSON with structure: `{ status: 'ok'|'fail', removed: string[], preserved: string[], docker: { stopped: boolean, kept: boolean }, patches_removed: number, otlp_cleaned: boolean, error?: string }`.

- [ ] Task 8: Update tests (AC: #1-#7)
  - [ ] 8.1: Remove teardown from `src/commands/__tests__/stubs.test.ts` — it's no longer a stub. If the stubs array becomes empty, delete the file.
  - [ ] 8.2: Create `src/commands/__tests__/teardown.test.ts` with comprehensive tests.
  - [ ] 8.3: Test: successful teardown removes state file, docker files, patches, and OTLP config. Mock `readState()`, `stopStack()`, `isStackRunning()`, `removePatch()`, and file system operations.
  - [ ] 8.4: Test: state file not found prints error message and sets exit code 1.
  - [ ] 8.5: Test: `--keep-docker` flag skips Docker stop and preserves compose files.
  - [ ] 8.6: Test: Docker not running prints info message and continues.
  - [ ] 8.7: Test: Docker stop failure prints warning and continues (non-fatal).
  - [ ] 8.8: Test: BMAD patches are removed from existing files, missing files skipped.
  - [ ] 8.9: Test: OTLP instrumented scripts removed from package.json.
  - [ ] 8.10: Test: `--json` flag produces correct JSON output structure.
  - [ ] 8.11: Test: beads data is never touched during teardown.
  - [ ] 8.12: Test: `--keep-beads` flag works (no-op since beads is preserved by default, but flag is accepted).

- [ ] Task 9: Build and verify (AC: #1-#7)
  - [ ] 9.1: Run `npm run build` — verify tsup compiles successfully.
  - [ ] 9.2: Run `npm run test:unit` — verify all unit tests pass including new teardown tests and that the stubs test no longer references teardown.
  - [ ] 9.3: Verify `codeharness teardown --help` shows `--keep-docker`, `--keep-beads` options.
  - [ ] 9.4: Verify 100% test coverage is maintained — run `npm run test:coverage` and check no regressions.

## Dev Notes

### Architecture Context

The `codeharness teardown` command currently exists in `src/commands/teardown.ts` as a stub printing "Not yet implemented. Coming in Epic 7." This story replaces that stub with a full teardown implementation.

Teardown is the inverse of `init`. It must undo what `init` created without touching anything the developer created or anything that belongs to external tools (beads, BMAD core files, project source code).

### What Init Creates (and Teardown Must Remove)

| Artifact | Created By | Teardown Action |
|----------|-----------|-----------------|
| `.claude/codeharness.local.md` | State file write | Delete file |
| `docker-compose.harness.yml` | Template generation | Delete file |
| `otel-collector-config.yaml` | Template generation | Delete file |
| Docker containers (VictoriaMetrics stack) | `docker compose up -d` | `docker compose down -v` |
| BMAD patches (5 workflow files) | `applyPatch()` via patch-engine | `removePatch()` via patch-engine |
| OTLP `:instrumented` scripts in package.json | `patchNodeStartScript()` | Remove `:instrumented` keys |
| OTLP state in state file | `configureOtlpEnvVars()` | Removed with state file deletion |

### What Teardown Must NOT Touch

| Artifact | Reason |
|----------|--------|
| `.beads/` | Task history — user data |
| `_bmad/` (core files) | BMAD installation — only patches within files are removed |
| `docs/` | Developer-created documentation |
| `AGENTS.md` | May have been customized by developer |
| Project source code | NFR15 — never modify project source |
| OTLP npm packages | May be used independently by the project |
| Showboat proof documents | Verification evidence |

### Key Files to Modify

| File | Change |
|------|--------|
| `src/commands/teardown.ts` | Replace stub with full teardown implementation |
| `src/commands/__tests__/stubs.test.ts` | Remove teardown entry (file may become empty — delete if so) |
| `src/commands/__tests__/teardown.test.ts` | New file — comprehensive teardown tests |

### Existing Code to Leverage

- `src/lib/state.ts` — `readState()`, `getStatePath()`, `StateFileNotFoundError`. Read state to determine what to clean.
- `src/lib/docker.ts` — `stopStack(composeFile)` stops Docker stack with `down -v`. `isStackRunning(composeFile)` checks if stack is running.
- `src/lib/patch-engine.ts` — `removePatch(filePath, patchName)` removes content between markers including markers. Returns boolean.
- `src/lib/bmad.ts` — `PATCH_TARGETS` maps patch names to relative file paths under `_bmad/`.
- `src/lib/output.ts` — `ok()`, `fail()`, `info()`, `warn()`, `jsonOutput()` for formatted CLI output.
- `src/lib/otlp.ts` — `NODE_REQUIRE_FLAG` constant (not exported — redefine or import). The `:instrumented` script pattern to look for.

### OTLP Cleanup Details

The `patchNodeStartScript()` function in `src/lib/otlp.ts` adds a key like `start:instrumented` or `dev:instrumented` to package.json scripts. The value contains `NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register'`. During teardown, find any script key ending with `:instrumented` whose value contains the require flag, and delete that key.

The `NODE_REQUIRE_FLAG` constant is not exported from otlp.ts. Either export it or inline the string `--require @opentelemetry/auto-instrumentations-node/register` in the teardown code. Exporting is preferred for consistency.

### Docker Teardown Ordering

1. Stop Docker stack first (while compose file still exists)
2. Then remove compose file and otel config
3. If `--keep-docker`, skip both steps entirely

### Stubs Test Cleanup

The `src/commands/__tests__/stubs.test.ts` file currently only contains teardown. Once teardown is removed from the stubs array, the array will be empty and the file serves no purpose. Delete the entire file.

### Error Handling Philosophy

Teardown should be maximally tolerant of partial state. If some artifacts are missing (e.g., compose file was manually deleted), teardown should skip those gracefully and continue. Only the state file check at the start is a hard gate — if there's no state file, we have nothing to tear down.
