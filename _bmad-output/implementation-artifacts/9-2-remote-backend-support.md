# Story 9.2: Remote Backend Support

Status: done

## Story

As a developer on a team with shared infrastructure,
I want to connect my harness project to a remote VictoriaMetrics/Logs/Traces instance instead of a local Docker stack,
So that I can use existing company infrastructure and share telemetry with my team.

## Acceptance Criteria

1. **Given** I run `codeharness init --otel-endpoint https://otel.mycompany.com:4318`, **When** init configures OTLP, **Then** the OTel endpoint is set to the provided URL (no local Docker started), **And** state file contains `otlp.endpoint: https://otel.mycompany.com:4318`.

2. **Given** I run `codeharness init --logs-url https://logs.mycompany.com --metrics-url https://metrics.mycompany.com --traces-url https://traces.mycompany.com`, **When** init configures observability, **Then** a local OTel Collector config is generated that routes to these remote backends, **And** the local OTel Collector container is started (but NOT VictoriaMetrics/Logs/Jaeger — they're remote).

3. **Given** no endpoint flags are passed, **When** I run `codeharness init`, **Then** local shared stack behavior is used (Story 9.1 — no change).

4. **Given** remote endpoints are configured, **When** I run `codeharness status --check-docker`, **Then** Docker health check is skipped for remote backends, **And** connectivity to remote endpoints is verified via HTTP health check instead.

5. **Given** remote endpoints are configured, **When** the knowledge file `observability-querying.md` is used by the agent, **Then** query URLs use the remote endpoints from state, not hardcoded localhost.

## Tasks / Subtasks

- [x] Task 1: Extend state types for remote backend configuration (AC: #1, #2, #3)
  - [x] 1.1: In `src/lib/state.ts`, extend the `HarnessState` interface's `otlp` section to add a `mode` field:
    ```ts
    otlp?: {
      enabled: boolean;
      endpoint: string;
      service_name: string;
      mode: 'local-shared' | 'remote-direct' | 'remote-routed';
      node_require?: string;
      python_wrapper?: string;
    };
    ```
    `local-shared` = full local Docker stack (current behavior), `remote-direct` = app sends OTLP directly to remote endpoint (no local containers), `remote-routed` = local OTel Collector forwards to remote backends.
  - [x] 1.2: Extend the `docker` section of `HarnessState` to add optional remote endpoint URLs:
    ```ts
    docker?: {
      compose_file: string;
      stack_running: boolean;
      remote_endpoints?: {
        logs_url?: string;
        metrics_url?: string;
        traces_url?: string;
      };
      ports: {
        logs: number;
        metrics: number;
        traces: number;
        otel_grpc: number;
        otel_http: number;
      };
    };
    ```
  - [x] 1.3: Update `isValidState()` to accept the new optional fields without breaking existing state files (backward compatible — these fields are optional).

- [x] Task 2: Add `--otel-endpoint`, `--logs-url`, `--metrics-url`, `--traces-url` flags to init (AC: #1, #2, #3)
  - [x]2.1: In `src/commands/init.ts`, add four new options to the `init` command:
    ```ts
    .option('--otel-endpoint <url>', 'Remote OTLP endpoint (skips local Docker stack)')
    .option('--logs-url <url>', 'Remote VictoriaLogs URL')
    .option('--metrics-url <url>', 'Remote VictoriaMetrics URL')
    .option('--traces-url <url>', 'Remote Jaeger/VictoriaTraces URL')
    ```
  - [x]2.2: Update the `InitOptions` interface to include the four new fields:
    ```ts
    interface InitOptions {
      observability: boolean;
      frontend: boolean;
      database: boolean;
      api: boolean;
      otelEndpoint?: string;
      logsUrl?: string;
      metricsUrl?: string;
      tracesUrl?: string;
    }
    ```
  - [x]2.3: Add validation: if `--otel-endpoint` is set, `--logs-url`/`--metrics-url`/`--traces-url` must NOT be set (they are mutually exclusive modes). Print `fail('Cannot combine --otel-endpoint with --logs-url/--metrics-url/--traces-url')` and exit with code 1.
  - [x]2.4: Add validation: if any of `--logs-url`/`--metrics-url`/`--traces-url` is set, all three MUST be set. Print `fail('When using remote backends, all three are required: --logs-url, --metrics-url, --traces-url')` and exit with code 1.

- [x] Task 3: Implement remote-direct mode in init (AC: #1)
  - [x]3.1: In the Docker stack setup section of `src/commands/init.ts` (lines ~417-476), add a branch before the shared stack logic: if `options.otelEndpoint` is set, enter remote-direct mode.
  - [x]3.2: In remote-direct mode: skip all Docker operations (no `isSharedStackRunning()`, no `startSharedStack()`). Set `state.otlp.endpoint` to the provided URL. Set `state.otlp.mode` to `'remote-direct'`. Do NOT set `state.docker` at all (no Docker involved). Print `ok('OTLP: configured for remote endpoint <url>')`.
  - [x]3.3: Update `configureOtlpEnvVars()` in `src/lib/otlp.ts` to accept an optional `endpoint` parameter. When provided, use it instead of the hardcoded `'http://localhost:4318'`. The call site in init becomes `configureOtlpEnvVars(projectDir, stack, { endpoint: options.otelEndpoint })`.
  - [x]3.4: Update the `InitResult.docker` type to be optional (it won't be set in remote-direct mode).

- [x] Task 4: Implement remote-routed mode in init (AC: #2)
  - [x]4.1: In the Docker stack setup section of `src/commands/init.ts`, add a branch: if `options.logsUrl`, `options.metricsUrl`, and `options.tracesUrl` are all set, enter remote-routed mode.
  - [x]4.2: Create a new function `otelCollectorRemoteTemplate(config: { logsUrl: string; metricsUrl: string; tracesUrl: string }): string` in `src/templates/otel-config.ts`. This generates an OTel Collector config identical to the local one but with exporters pointing to the remote URLs:
    ```yaml
    exporters:
      otlphttp/logs:
        endpoint: <logsUrl>/insert/opentelemetry
      prometheusremotewrite:
        endpoint: <metricsUrl>/api/v1/write
      otlp/traces:
        endpoint: <tracesUrl>
    ```
  - [x]4.3: Create a new function `dockerComposeCollectorOnlyTemplate(): string` in `src/templates/docker-compose.ts` that generates a Docker Compose file containing ONLY the `otel-collector` service (no victoria-logs, victoria-metrics, victoria-traces). Use project name `codeharness-collector` and network name `codeharness-collector-net`.
  - [x]4.4: In remote-routed mode init: call `ensureStackDir()`, write the remote OTel Collector config to `getOtelConfigPath()`, write the collector-only compose to `getComposeFilePath()`, start with `docker compose -p codeharness-collector -f <path> up -d`. Set `state.otlp.mode` to `'remote-routed'`. Set `state.docker.remote_endpoints` with the three URLs. Print `ok('Observability: OTel Collector started (routing to remote backends)')`.
  - [x]4.5: Add a new function `startCollectorOnly(): DockerStartResult` in `src/lib/docker.ts` that starts only the collector container using the collector-only compose template. Similar to `startSharedStack()` but uses `codeharness-collector` project name and calls `dockerComposeCollectorOnlyTemplate()`.
  - [x]4.6: Add a new function `isCollectorRunning(): boolean` in `src/lib/docker.ts` that checks if the collector-only container is running via `docker compose -p codeharness-collector ps --format json`.

- [x] Task 5: Update `codeharness status --check-docker` for remote backends (AC: #4)
  - [x]5.1: In `src/commands/status.ts` `handleDockerCheck()`, detect the OTLP mode from state. If `state.otlp?.mode === 'remote-direct'`, skip Docker health check entirely. Instead, perform HTTP connectivity checks to the remote OTLP endpoint (simple fetch/curl to verify the URL responds).
  - [x]5.2: If `state.otlp?.mode === 'remote-routed'`, check only the local OTel Collector container health (not the full stack). Also verify connectivity to the three remote backend URLs.
  - [x]5.3: Create a helper function `checkRemoteEndpoint(url: string): { reachable: boolean; error?: string }` in `src/lib/docker.ts` (or a new `src/lib/remote-check.ts`). Use Node.js built-in `fetch()` (available in Node 18+) or `http.get()` to check if the URL responds within 5 seconds.
  - [x]5.4: In `handleFullStatus()`, update the Docker display section: for `remote-direct` mode print `Docker: none (remote OTLP at <endpoint>)`, for `remote-routed` mode print `Docker: OTel Collector only (backends at <urls>)`.
  - [x]5.5: Update `handleFullStatusJson()` similarly: include `mode`, `remote_endpoints`, and connectivity check results in the JSON output.

- [x] Task 6: Update `handleHealthCheck()` for remote backends (AC: #4)
  - [x]6.1: In the Docker health check section of `handleHealthCheck()`, when mode is `remote-direct`: run `checkRemoteEndpoint()` against the OTLP endpoint. Report `ok` if reachable, `fail` if not.
  - [x]6.2: When mode is `remote-routed`: check local collector health AND remote endpoint connectivity. Report individual results for each.

- [x] Task 7: Update teardown for remote modes (AC: #1, #2)
  - [x]7.1: In `src/commands/teardown.ts`, add handling for `remote-direct` mode: no Docker teardown needed at all (no containers were started). Just clean up the state file.
  - [x]7.2: For `remote-routed` mode: stop the collector-only container (not the shared stack). Add a new function `stopCollectorOnly(): void` in `src/lib/docker.ts` that runs `docker compose -p codeharness-collector down`.

- [x] Task 8: Template the knowledge file query URLs from state (AC: #5)
  - [x]8.1: Update `knowledge/observability-querying.md` to include a note at the top explaining that query URLs depend on the configured mode. Add a section:
    ```markdown
    ## Endpoint Resolution
    Check current endpoints: `codeharness state get otlp.endpoint` and `codeharness state get docker.remote_endpoints`.
    If remote endpoints are configured, replace `localhost:<port>` URLs below with the remote URLs from state.
    ```
  - [x]8.2: Update `src/commands/status.ts` `handleFullStatus()` and `handleFullStatusJson()` to always print the resolved endpoint URLs (whether local or remote) so the agent can reference them. The JSON output should include an `endpoints` object with `logs`, `metrics`, `traces`, `otel_http` keys populated from either defaults or remote config.

- [x] Task 9: Update `codeharness stack` commands for remote awareness (AC: #4)
  - [x]9.1: In `src/commands/stack.ts`, update `stack status` to detect remote mode from state. If `remote-direct`, print `info('No local stack — using remote OTLP endpoint')` and show connectivity check result. If `remote-routed`, show only the collector status plus remote endpoint connectivity.
  - [x]9.2: Update `stack start` to handle `remote-routed` mode: start only the collector container. For `remote-direct` mode: print `info('No local stack needed — remote OTLP configured')`.
  - [x]9.3: Update `stack stop` to handle `remote-routed` mode: stop only the collector. For `remote-direct` mode: print `info('No local stack to stop — remote OTLP configured')`.

- [x] Task 10: Write unit tests (AC: #1-#5)
  - [x]10.1: Add tests in `src/commands/__tests__/init.test.ts` for `--otel-endpoint` flag: verify Docker is skipped, state has `mode: 'remote-direct'`, endpoint is stored correctly.
  - [x]10.2: Add tests for mutual exclusivity validation: `--otel-endpoint` + `--logs-url` should fail.
  - [x]10.3: Add tests for `--logs-url`/`--metrics-url`/`--traces-url` requiring all three.
  - [x]10.4: Add tests in `src/templates/__tests__/otel-config.test.ts` for `otelCollectorRemoteTemplate()` — verify exporter URLs use provided remote URLs.
  - [x]10.5: Add tests in `src/templates/__tests__/docker-compose.test.ts` for `dockerComposeCollectorOnlyTemplate()` — verify only otel-collector service is present.
  - [x]10.6: Add tests in `src/commands/__tests__/status.test.ts` for Docker check behavior in remote-direct and remote-routed modes.
  - [x]10.7: Add tests for `checkRemoteEndpoint()` — mock fetch to simulate reachable/unreachable endpoints.
  - [x]10.8: Add tests in `src/commands/__tests__/teardown.test.ts` for remote-direct (no Docker cleanup) and remote-routed (collector-only stop).

- [x] Task 11: Build and verify (AC: #1-#5)
  - [x]11.1: Run `npm run build` — verify tsup compiles successfully with all new templates and modified modules.
  - [x]11.2: Run `npm run test:unit` — verify all unit tests pass including new remote backend tests.
  - [x]11.3: Run `npm run test:coverage` — verify test coverage target is maintained.

## Dev Notes

### Architecture Context

Story 9.1 moved the observability stack from per-project to a shared machine-level location (`~/.codeharness/stack/`). This story adds support for pointing to remote infrastructure instead of running anything locally. There are three modes:

| Mode | Docker containers | OTLP target | Use case |
|------|-------------------|-------------|----------|
| `local-shared` | Full stack (VM, VL, Jaeger, OTel Collector) | localhost:4318 | Solo dev, default |
| `remote-direct` | None | Remote URL | Team infra with central OTel Collector |
| `remote-routed` | OTel Collector only | localhost:4318 → remote backends | Team infra, want local buffering/retry |

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/state.ts` | Add `mode` to `otlp`, add `remote_endpoints` to `docker` |
| `src/commands/init.ts` | Add `--otel-endpoint`, `--logs-url`, `--metrics-url`, `--traces-url` flags; branch on mode |
| `src/lib/otlp.ts` | `configureOtlpEnvVars()` accepts optional endpoint override |
| `src/templates/otel-config.ts` | New `otelCollectorRemoteTemplate()` for remote backend routing |
| `src/templates/docker-compose.ts` | New `dockerComposeCollectorOnlyTemplate()` for collector-only mode |
| `src/lib/docker.ts` | New `startCollectorOnly()`, `stopCollectorOnly()`, `isCollectorRunning()`, `checkRemoteEndpoint()` |
| `src/commands/status.ts` | Remote-aware Docker health checks and display |
| `src/commands/teardown.ts` | Remote-aware teardown (no Docker for remote-direct, collector-only for remote-routed) |
| `src/commands/stack.ts` | Remote-aware stack start/stop/status |
| `knowledge/observability-querying.md` | Endpoint resolution note for remote URLs |

### Existing Code to Leverage

- `src/lib/docker.ts` already has `isSharedStackRunning()`, `startSharedStack()`, `stopSharedStack()` — the collector-only functions follow the same pattern but use `codeharness-collector` project name and a stripped-down compose file.
- `src/templates/otel-config.ts` `otelCollectorConfigTemplate()` — the remote template is identical except exporter URLs point to remote instead of Docker service names.
- `src/templates/docker-compose.ts` `dockerComposeTemplate()` — the collector-only template is a subset (just the `otel-collector` service, no backends).
- `src/commands/status.ts` already has shared-stack detection via `composeFile.startsWith(stackDir)` — extend this with mode checks from `state.otlp?.mode`.
- `src/lib/otlp.ts` `configureOtlpEnvVars()` hardcodes `endpoint: 'http://localhost:4318'` — needs to accept override.

### Mutual Exclusivity

`--otel-endpoint` and `--logs-url`/`--metrics-url`/`--traces-url` are mutually exclusive because they represent fundamentally different architectures:
- `--otel-endpoint`: App sends OTLP directly to a remote collector. No local containers. The remote side handles routing to backends.
- `--logs-url` + `--metrics-url` + `--traces-url`: A local OTel Collector runs and routes to these specific remote backends. The local collector provides buffering, retry, and protocol translation.

If neither is set, the existing `local-shared` mode from Story 9.1 is used.

### Backward Compatibility

- Existing state files without `otlp.mode` default to `'local-shared'` behavior (no change).
- The `isValidState()` check must remain backward compatible — `otlp.mode` is optional.
- The knowledge file change is additive (new section, doesn't remove existing content).

### Remote Endpoint Health Checks

For `checkRemoteEndpoint()`, use a simple HTTP GET with a 5-second timeout. Accept any response (2xx, 4xx, even 5xx) as "reachable" — the point is verifying network connectivity, not application health. Only `ECONNREFUSED`, `ENOTFOUND`, or timeout counts as "unreachable". Use Node.js built-in `fetch()` (available since Node 18) to avoid adding dependencies.

## Dev Agent Record

### Implementation Notes

- Extended `HarnessState` with `otlp.mode` (`local-shared | remote-direct | remote-routed`) and `docker.remote_endpoints` optional fields
- Added `--otel-endpoint`, `--logs-url`, `--metrics-url`, `--traces-url` CLI flags to init with mutual exclusivity validation
- Remote-direct mode: skips Docker entirely, sets OTLP endpoint directly to remote URL
- Remote-routed mode: starts only OTel Collector via `dockerComposeCollectorOnlyTemplate()` and `otelCollectorRemoteTemplate()`, routes to remote backends
- `checkRemoteEndpoint()` uses Node 18+ built-in `fetch()` with 5s AbortController timeout
- All status/health/teardown/stack commands are mode-aware: detect `state.otlp?.mode` and branch accordingly
- Knowledge file updated with endpoint resolution guidance section
- `configureOtlpEnvVars()` accepts optional `endpoint` parameter and preserves `mode` from state
- `InitResult.docker` type made nullable (null for remote-direct mode)
- All existing 1035 tests continue to pass; 62 new tests added (1097 total)

### Completion Notes

All 11 tasks and 43 subtasks completed. 1097 tests pass, build succeeds. Story covers three OTLP modes (local-shared, remote-direct, remote-routed) with full CLI support across init, status, teardown, and stack commands.

## File List

- src/lib/state.ts (modified: added `mode` to `otlp`, `remote_endpoints` to `docker`)
- src/commands/init.ts (modified: new flags, validation, remote-direct/routed init branches)
- src/lib/otlp.ts (modified: `configureOtlpEnvVars` accepts endpoint option, sets mode)
- src/templates/otel-config.ts (modified: new `otelCollectorRemoteTemplate()`)
- src/templates/docker-compose.ts (modified: new `dockerComposeCollectorOnlyTemplate()`)
- src/lib/docker.ts (modified: new `startCollectorOnly`, `isCollectorRunning`, `stopCollectorOnly`, `getCollectorHealth`, `checkRemoteEndpoint`)
- src/commands/status.ts (modified: remote-aware Docker checks, health checks, JSON output with resolved endpoints)
- src/commands/teardown.ts (modified: remote-direct skips Docker, remote-routed stops collector only)
- src/commands/stack.ts (modified: remote-aware start/stop/status for all three modes)
- knowledge/observability-querying.md (modified: added Endpoint Resolution section)
- src/commands/__tests__/init.test.ts (modified: added 12 tests for remote flags and validation)
- src/templates/__tests__/otel-config.test.ts (modified: added 8 tests for otelCollectorRemoteTemplate)
- src/templates/__tests__/docker-compose.test.ts (modified: added 9 tests for dockerComposeCollectorOnlyTemplate)
- src/commands/__tests__/status.test.ts (modified: added 8 tests for remote-direct/routed status display)
- src/lib/__tests__/docker.test.ts (modified: added 16 tests for collector functions and checkRemoteEndpoint)
- src/commands/__tests__/teardown.test.ts (modified: added 4 tests for remote teardown modes)
- src/commands/__tests__/stack.test.ts (modified: added 5 tests for remote stack commands)

## Change Log

- 2026-03-15: Implemented Story 9.2 — Remote Backend Support. Added three OTLP modes (local-shared, remote-direct, remote-routed) with CLI flags, state types, templates, health checks, and 62 new unit tests.
