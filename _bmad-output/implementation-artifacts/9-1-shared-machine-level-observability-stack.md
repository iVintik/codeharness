# Story 9.1: Shared Machine-Level Observability Stack

Status: ready-for-dev

## Story

As a developer working on multiple harness projects on the same machine,
I want a single shared VictoriaMetrics/Logs/Traces stack that all projects use,
So that I don't waste resources running duplicate Docker containers per project and can view all project telemetry from one place.

## Acceptance Criteria

1. **Given** no shared stack is running on the machine, **When** I run `codeharness init` in any project, **Then** the shared stack is started at `~/.codeharness/stack/`, **And** `docker-compose.harness.yml` and `otel-collector-config.yaml` are written to `~/.codeharness/stack/`, **And** `[OK] Observability stack: started (shared at ~/.codeharness/stack/)` is printed.

2. **Given** the shared stack is already running (started by another project), **When** I run `codeharness init` in a new project, **Then** the existing stack is discovered via Docker Compose project name `codeharness-shared`, **And** no new containers are started, **And** `[OK] Observability stack: already running (shared)` is printed.

3. **Given** project A and project B both use the shared stack, **When** I run `codeharness teardown` in project A, **Then** the shared stack is NOT stopped (project B still uses it), **And** only project A's local config is cleaned up.

4. **Given** I want to explicitly manage the shared stack, **When** I run `codeharness stack stop`, **Then** the shared Docker stack is stopped, **And** `[WARN] Stopping shared stack — all harness projects will lose observability` is printed.

5. **Given** I run `codeharness stack start`, **When** the stack was previously stopped, **Then** containers resume with existing data volumes preserved.

6. **Given** I run `codeharness stack status`, **When** the stack is running, **Then** all service health statuses are shown with endpoint URLs.

## Tasks / Subtasks

- [ ] Task 1: Create shared stack directory utilities in `src/lib/stack-path.ts` (AC: #1)
  - [ ] 1.1: Create a new module `src/lib/stack-path.ts`. Export a function `getStackDir(): string` that returns the shared stack directory path. Use `$XDG_DATA_HOME/codeharness/stack/` if `XDG_DATA_HOME` is set, otherwise `~/.codeharness/stack/`. Use `os.homedir()` for `~`.
  - [ ] 1.2: Export a function `getComposeFilePath(): string` that returns `path.join(getStackDir(), 'docker-compose.harness.yml')`.
  - [ ] 1.3: Export a function `getOtelConfigPath(): string` that returns `path.join(getStackDir(), 'otel-collector-config.yaml')`.
  - [ ] 1.4: Export a function `ensureStackDir(): void` that creates the stack directory recursively (`mkdirSync({ recursive: true })`) if it doesn't exist.

- [ ] Task 2: Update `src/templates/docker-compose.ts` for shared stack (AC: #1, #2)
  - [ ] 2.1: Change the `DockerComposeConfig` interface: remove `projectName` field, add `shared: boolean` flag. When `shared` is true, use fixed project name `codeharness-shared` and network name `codeharness-shared-net`.
  - [ ] 2.2: Add Docker label `com.codeharness.stack=shared` to all services in the shared compose template, enabling discovery by label.
  - [ ] 2.3: Remove the `sanitizeProjectName` function (no longer needed — project name is fixed for shared stack).

- [ ] Task 3: Add shared stack discovery to `src/lib/docker.ts` (AC: #2)
  - [ ] 3.1: Add a new function `isSharedStackRunning(): boolean` that checks if the shared stack is running by executing `docker compose -p codeharness-shared ps --format json` and verifying all expected services are in `running` state. Use the compose file at `getComposeFilePath()`.
  - [ ] 3.2: Update `getStackHealth()` to accept an optional `projectName` parameter. When called with `'codeharness-shared'`, use `-p codeharness-shared` flag instead of `-f <composefile>` to address containers by project name.
  - [ ] 3.3: Add a new function `startSharedStack(): DockerStartResult` that: calls `ensureStackDir()`, writes the compose template and otel config to the stack directory, then runs `docker compose -p codeharness-shared -f <compose-path> up -d`.
  - [ ] 3.4: Add a new function `stopSharedStack(): void` that runs `docker compose -p codeharness-shared -f <compose-path> down` (without `-v` to preserve volumes).

- [ ] Task 4: Update `src/commands/init.ts` to use shared stack (AC: #1, #2)
  - [ ] 4.1: Remove the per-project `docker-compose.harness.yml` and `otel-collector-config.yaml` generation from the Docker stack setup section (lines ~419-499).
  - [ ] 4.2: Replace with shared stack logic: call `isSharedStackRunning()` first. If running, print `ok('Observability stack: already running (shared)')` and skip startup. If not running, call `startSharedStack()` and print `ok('Observability stack: started (shared at ~/.codeharness/stack/)')`.
  - [ ] 4.3: Update the state file's `docker` section: set `compose_file` to the shared stack path (`getComposeFilePath()` result), remove per-project compose file references.
  - [ ] 4.4: Remove the `isDockerComposeAvailable()` check that was specific to per-project compose — the shared stack startup in `startSharedStack()` handles this internally.

- [ ] Task 5: Update `src/commands/teardown.ts` to not stop shared stack (AC: #3)
  - [ ] 5.1: In the Docker teardown section, replace the `isStackRunning()` / `stopStack()` logic with a check: if the compose file points to the shared stack directory (`getStackDir()`), skip stopping. Print `info('Shared stack: kept running (other projects may use it)')`.
  - [ ] 5.2: Remove the per-project `docker-compose.harness.yml` and `otel-collector-config.yaml` file deletion — these files no longer exist in the project directory.
  - [ ] 5.3: Keep the `--keep-docker` flag but make it a no-op for shared stacks (since they're never stopped by teardown anyway). Print `info('Docker stack: shared (not managed per-project)')`.

- [ ] Task 6: Add `codeharness stack` command in `src/commands/stack.ts` (AC: #4, #5, #6)
  - [ ] 6.1: Create `src/commands/stack.ts` with a `registerStackCommand(program: Command)` export. Register three subcommands: `stack start`, `stack stop`, `stack status`.
  - [ ] 6.2: `stack start`: call `startSharedStack()`. If already running, print `info('Shared stack: already running')`. If started successfully, print `ok('Shared stack: started')` with endpoint URLs.
  - [ ] 6.3: `stack stop`: call `stopSharedStack()`. Before stopping, print `warn('Stopping shared stack — all harness projects will lose observability')`. After stopping, print `ok('Shared stack: stopped')`.
  - [ ] 6.4: `stack status`: call `getStackHealth()` with the shared compose file. Print each service's status (running/stopped). If healthy, print endpoint URLs (logs:9428, metrics:8428, traces:16686, otel_grpc:4317, otel_http:4318).
  - [ ] 6.5: All three subcommands support `--json` output via `globalOpts.json`.

- [ ] Task 7: Register the stack command in CLI entry point (AC: #4, #5, #6)
  - [ ] 7.1: Import `registerStackCommand` in `src/cli.ts` (or wherever commands are registered) and call it to register the `stack` subcommand group.

- [ ] Task 8: Update `src/commands/status.ts` for shared stack awareness (AC: #6)
  - [ ] 8.1: In `handleFullStatus`, detect whether the stack is shared (compose file path under `~/.codeharness/`) and adjust the Docker status display accordingly: print `Docker: shared stack at ~/.codeharness/stack/` instead of per-project path.
  - [ ] 8.2: In `handleDockerCheck`, use `isSharedStackRunning()` when the state indicates a shared stack.

- [ ] Task 9: Write unit tests (AC: #1-#6)
  - [ ] 9.1: Add tests in `src/lib/__tests__/stack-path.test.ts` for `getStackDir` — verify XDG_DATA_HOME override, verify default `~/.codeharness/stack/` path.
  - [ ] 9.2: Add tests in `src/lib/__tests__/docker.test.ts` for `isSharedStackRunning` — mock `execFileSync` to simulate running/stopped states.
  - [ ] 9.3: Add tests in `src/lib/__tests__/docker.test.ts` for `startSharedStack` — verify compose template and otel config are written to the correct path, verify `docker compose up -d` is called with `-p codeharness-shared`.
  - [ ] 9.4: Add tests in `src/lib/__tests__/docker.test.ts` for `stopSharedStack` — verify `docker compose down` is called without `-v` (preserving volumes).
  - [ ] 9.5: Add tests for `src/commands/__tests__/stack.test.ts` — test `start`, `stop`, `status` subcommands in both human and JSON output modes.
  - [ ] 9.6: Update tests in `src/commands/__tests__/init.test.ts` — verify init uses shared stack instead of per-project compose generation.
  - [ ] 9.7: Update tests in `src/commands/__tests__/teardown.test.ts` — verify teardown does NOT stop the shared stack.

- [ ] Task 10: Build and verify (AC: #1-#6)
  - [ ] 10.1: Run `npm run build` — verify tsup compiles successfully with the new `stack-path.ts` and `stack.ts` modules.
  - [ ] 10.2: Run `npm run test:unit` — verify all unit tests pass including new shared stack tests.
  - [ ] 10.3: Run `npm run test:coverage` — verify test coverage target is maintained.

## Dev Notes

### Architecture Context

Currently, each project gets its own Docker Compose stack: `codeharness init` generates `docker-compose.harness.yml` and `otel-collector-config.yaml` in the project root, starts containers with a per-project name (`<project>-harness`), and `codeharness teardown` stops and removes them. This wastes resources when multiple projects are active — each runs its own VictoriaMetrics, VictoriaLogs, Jaeger, and OTel Collector.

This story moves the stack to a machine-level shared location (`~/.codeharness/stack/`). All projects point their OTLP to the same collector endpoint (localhost:4317/4318). The stack is started once and shared. Individual project teardowns never stop it — only `codeharness stack stop` does.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/stack-path.ts` | **NEW** — shared stack directory resolution (XDG-aware) |
| `src/lib/docker.ts` | Add `isSharedStackRunning()`, `startSharedStack()`, `stopSharedStack()` |
| `src/templates/docker-compose.ts` | Fixed project name `codeharness-shared`, add container labels |
| `src/templates/otel-config.ts` | No changes needed — config is the same, just lives in a different directory |
| `src/commands/init.ts` | Replace per-project compose generation with shared stack discovery/startup |
| `src/commands/teardown.ts` | Remove per-project stack stop, never stop shared stack |
| `src/commands/status.ts` | Shared stack awareness in health display |
| `src/commands/stack.ts` | **NEW** — `codeharness stack start/stop/status` command |
| `src/cli.ts` | Register the new `stack` command |
| `src/lib/state.ts` | Update `docker.compose_file` to point to shared path |

### Existing Code to Leverage

- `src/lib/docker.ts` — `isStackRunning()`, `startStack()`, `stopStack()`, `getStackHealth()` all use `execFileSync` with `docker compose` commands. The new shared-stack functions follow the same pattern but use `-p codeharness-shared` for project-based addressing instead of `-f <file>`.
- `src/templates/docker-compose.ts` — `dockerComposeTemplate()` currently takes `projectName` for per-project naming. This changes to a fixed `codeharness-shared` name.
- `src/templates/otel-config.ts` — `otelCollectorConfigTemplate()` is stack-agnostic — it just generates the OTel Collector config YAML. No changes needed; it just gets written to a different path.
- `src/commands/init.ts` — The Docker stack setup block (lines ~419-499) is the main section to rework. The OTLP instrumentation block above it stays the same — it already sets `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` regardless of where the collector lives.

### Volume Preservation

`stopSharedStack()` must use `docker compose down` **without** `-v` flag. The current `stopStack()` uses `down -v` which removes volumes — that's fine for per-project teardown but would destroy shared data. The shared stack should preserve `victoria-logs-data` and `victoria-metrics-data` volumes across stop/start cycles. Only `codeharness stack purge` (future story) should remove volumes.

### Port Conflict Considerations

Ports (9428, 8428, 16686, 4317, 4318) are fixed and documented. If a port is already in use (e.g., by a manually-running VictoriaMetrics), `startSharedStack()` will fail with a Docker error. The error message should be surfaced clearly so the user can resolve the conflict.

### Backward Compatibility

Projects initialized with the old per-project stack model will have `docker.compose_file: 'docker-compose.harness.yml'` (relative path in project dir) in their state. When `codeharness init` is re-run (idempotent), it should:
1. Stop the old per-project stack if running
2. Remove per-project compose files
3. Switch to the shared stack
4. Update the state file to point to the shared compose path

This migration path should be handled in Task 4 as part of the idempotent re-run logic.
