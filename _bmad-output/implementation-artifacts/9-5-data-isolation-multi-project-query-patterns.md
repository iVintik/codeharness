# Story 9.5: Data Isolation & Multi-Project Query Patterns

Status: ready-for-dev

## Story

As a developer running multiple harness projects against the same observability stack,
I want each project's data to be cleanly separated and queryable independently,
So that logs/metrics/traces from project A don't pollute project B's dashboards and queries.

## Acceptance Criteria

1. **Given** project "my-api" and project "my-worker" both send telemetry to the shared stack, **When** I query logs for "my-api", **Then** only logs with `service.name=my-api` are returned, **And** "my-worker" logs are excluded.

2. **Given** `codeharness init` sets up OTLP, **When** the project emits telemetry, **Then** `OTEL_SERVICE_NAME` env var is set to the project name, **And** all OTel SDKs pick it up automatically (no manual code needed).

3. **Given** `codeharness status` shows endpoints, **When** endpoint URLs are displayed, **Then** they include the `service.name` query filter pre-applied. **Example:** `logs: http://localhost:9428/select/logsql/query?query={service_name="my-api"}`.

4. **Given** the agent queries observability data during development, **When** it uses patterns from `knowledge/observability-querying.md`, **Then** all example queries include `service.name` filter, **And** the knowledge file references the project name from state.

5. **Given** the OTel Collector receives telemetry without `service.name`, **When** the telemetry is processed, **Then** it is tagged with a default `service.name=unknown-<timestamp>` to prevent untagged pollution.

## Tasks / Subtasks

- [ ] Task 1: Verify and enforce `OTEL_SERVICE_NAME` in init (AC: #2)
  - [ ] 1.1: In `src/lib/otlp.ts` `configureOtlpEnvVars()`, verify that `service_name` is set to the project directory basename (already done via `basename(projectDir)` at line 238). Confirm this value is used as `OTEL_SERVICE_NAME` in the environment — check that the state's `otlp.service_name` is documented in the knowledge file as the env var that gets set.
  - [ ] 1.2: In `src/commands/init.ts`, verify that the `service_name` from state is also written to the project's environment. Check whether `OTEL_SERVICE_NAME` is actually set as an env var (e.g., in `.env`, `package.json` scripts, or shell profile). If it's only in state but NOT in the actual environment, add logic to write `OTEL_SERVICE_NAME=<project-name>` to a `.env` file or to the `NODE_OPTIONS` / shell config.
  - [ ] 1.3: Add a new function `ensureServiceNameEnvVar(projectDir: string, serviceName: string): void` in `src/lib/otlp.ts` that writes `OTEL_SERVICE_NAME=<serviceName>` to a `.env.codeharness` file in the project root. This file can be sourced by shell scripts or loaded by `dotenv`. If the file already exists, update the `OTEL_SERVICE_NAME` line without clobbering other entries.
  - [ ] 1.4: Call `ensureServiceNameEnvVar()` from `configureOtlpEnvVars()` after setting `state.otlp.service_name`.

- [ ] Task 2: Add OTel Collector `resource/default` processor for untagged telemetry (AC: #5)
  - [ ] 2.1: In `src/templates/otel-config.ts`, update `otelCollectorConfigTemplate()` to add a `processors` section with a `resource/default` processor that injects `service.name` when missing:
    ```yaml
    processors:
      resource/default:
        attributes:
          - key: service.name
            value: "unknown"
            action: upsert
            # Only set if not already present — OTel SDK "upsert" semantics
    ```
    Note: The standard OTel Collector `resource` processor with `action: upsert` only sets the attribute if it's absent. Verify this behavior, and if `upsert` overwrites existing values, use a `transform` processor with conditional logic instead.
  - [ ] 2.2: Wire the `resource/default` processor into all three pipelines (logs, metrics, traces) in the `service.pipelines` section of the config template.
  - [ ] 2.3: Update `otelCollectorConfigWithCors()` to include the same processor (it derives from base template, so this should be automatic if base is updated).
  - [ ] 2.4: Update `otelCollectorRemoteTemplate()` to include the same processor section, ensuring remote-routed mode also tags unattributed telemetry.

- [ ] Task 3: Update `status.ts` to show service-scoped query URLs (AC: #3)
  - [ ] 3.1: In `src/commands/status.ts` `handleFullStatus()`, update the endpoint display section. After resolving endpoints via `resolveEndpoints()`, read `state.otlp?.service_name` and append service-scoped query filters to the displayed URLs:
    - Logs: `http://localhost:9428/select/logsql/query?query=service_name:<service_name>`
    - Metrics: `http://localhost:8428/api/v1/query?query={service_name="<service_name>"}`
    - Traces: `http://localhost:16686/api/traces?service=<service_name>&limit=20`
  - [ ] 3.2: In `handleFullStatusJson()`, add a `scoped_endpoints` object to the JSON output alongside the existing `endpoints` object. The `scoped_endpoints` should contain the service-filtered URLs for logs, metrics, and traces.
  - [ ] 3.3: Update `resolveEndpoints()` to return a new `scopedEndpoints` alongside raw endpoints. The scoped URLs are computed from the base URLs + service name.
  - [ ] 3.4: In `handleFullStatus()` text output, print the scoped URLs on a separate line: `  Scoped: logs=<url> metrics=<url> traces=<url>`.

- [ ] Task 4: Update `knowledge/observability-querying.md` with service-scoped queries (AC: #4)
  - [ ] 4.1: Add a new section "## Service-Scoped Queries" near the top, after "Endpoint Resolution". Explain that all queries should include `service.name` filter to isolate per-project data. Reference `codeharness state get otlp.service_name` to get the current project name.
  - [ ] 4.2: Update all LogQL example queries to include the `service_name` filter:
    ```bash
    # All errors in last 5 minutes (scoped to project)
    curl 'http://localhost:9428/select/logsql/query?query=level:error%20AND%20service_name:<PROJECT>&start=5m'
    ```
    Use `<PROJECT>` placeholder and note to replace with value from `codeharness state get otlp.service_name`.
  - [ ] 4.3: Update all PromQL example queries to include `service_name` label matcher:
    ```bash
    # Total HTTP requests (scoped to project)
    curl 'http://localhost:8428/api/v1/query?query=http_requests_total{service_name="<PROJECT>"}'
    ```
  - [ ] 4.4: Update all Jaeger API example queries to use the project service name:
    ```bash
    # Recent traces for the current project
    curl 'http://localhost:16686/api/traces?service=<PROJECT>&limit=20'
    ```
  - [ ] 4.5: Update the "Common Debugging Workflows" section to use service-scoped queries throughout. Each workflow step should include the `service_name` filter.
  - [ ] 4.6: Add a note that `<PROJECT>` should be replaced with the output of `codeharness state get otlp.service_name`, and that `codeharness status --json` shows pre-built scoped URLs.

- [ ] Task 5: Add `codeharness query` command shorthand (AC: #1, #4)
  - [ ] 5.1: Create `src/commands/query.ts` with a `registerQueryCommand(program: Command)` export. Register three subcommands: `query logs <filter>`, `query metrics <promql>`, `query traces [--service <name>]`.
  - [ ] 5.2: `query logs <filter>`: Read `otlp.service_name` from state. Build a LogQL query that combines the user's filter with `service_name:<service_name>`. Execute `curl` against the resolved logs endpoint. Print the response. Support `--start <duration>` (default `5m`) and `--raw` (skip service_name filter).
  - [ ] 5.3: `query metrics <promql>`: Read `otlp.service_name` from state. If the PromQL expression doesn't already contain a `service_name` label matcher, inject `{service_name="<service_name>"}`. Execute against the metrics endpoint. Support `--raw`.
  - [ ] 5.4: `query traces`: Read `otlp.service_name` from state. Query the Jaeger API for recent traces filtered by service name. Support `--limit <n>` (default 20), `--operation <name>`, `--min-duration <duration>`.
  - [ ] 5.5: All subcommands support `--json` output. Human-readable mode formats the output for quick scanning (timestamps, log levels, trace IDs).
  - [ ] 5.6: Use Node.js built-in `fetch()` (Node 18+) for HTTP requests, consistent with `checkRemoteEndpoint()` in `src/lib/docker.ts`.

- [ ] Task 6: Register the query command in CLI entry point (AC: #1, #4)
  - [ ] 6.1: Import `registerQueryCommand` in `src/cli.ts` and call it to register the `query` subcommand group.

- [ ] Task 7: Update OTel Collector config for all deployment modes (AC: #5)
  - [ ] 7.1: Verify that the `resource/default` processor from Task 2 is included in the shared stack's OTel Collector config. When `startSharedStack()` writes the config, it should use the updated template.
  - [ ] 7.2: For `remote-routed` mode, verify that `otelCollectorRemoteTemplate()` also includes the `resource/default` processor. Telemetry without `service.name` should be tagged before forwarding to remote backends.
  - [ ] 7.3: For `remote-direct` mode, document in the knowledge file that the remote OTel Collector should be configured with a similar `resource/default` processor. This is outside codeharness's control but should be documented as a recommendation.

- [ ] Task 8: Write unit tests (AC: #1-#5)
  - [ ] 8.1: Add tests in `src/lib/__tests__/otlp.test.ts` for `ensureServiceNameEnvVar()`:
    - Creates `.env.codeharness` with `OTEL_SERVICE_NAME=<project>`
    - Updates existing file without clobbering other entries
    - Handles project names with special characters (spaces, hyphens)
  - [ ] 8.2: Add tests in `src/templates/__tests__/otel-config.test.ts`:
    - Verify `otelCollectorConfigTemplate()` includes `resource/default` processor
    - Verify all three pipelines reference the processor
    - Verify `otelCollectorConfigWithCors()` inherits the processor
    - Verify `otelCollectorRemoteTemplate()` includes the processor
  - [ ] 8.3: Add tests in `src/commands/__tests__/status.test.ts`:
    - Verify scoped endpoint URLs appear in text output
    - Verify `scoped_endpoints` appears in JSON output
    - Verify service name is used in scoped URLs
  - [ ] 8.4: Add tests in `src/commands/__tests__/query.test.ts`:
    - `query logs "error"` builds correct LogQL with service_name filter
    - `query logs "error" --raw` omits service_name filter
    - `query metrics "http_requests_total"` injects service_name label
    - `query traces` uses service name from state
    - `--json` output mode returns valid JSON
    - Missing state file produces helpful error message
  - [ ] 8.5: Add tests verifying that `configureOtlpEnvVars()` calls `ensureServiceNameEnvVar()`.

- [ ] Task 9: Build and verify (AC: #1-#5)
  - [ ] 9.1: Run `npm run build` — verify tsup compiles successfully with new `query.ts` module and all template changes.
  - [ ] 9.2: Run `npm run test:unit` — verify all unit tests pass including new query command and service-scoped endpoint tests.
  - [ ] 9.3: Run `npm run test:coverage` — verify test coverage target is maintained.

## Dev Notes

### Architecture Context

Stories 9.1-9.4 established the shared observability stack, remote backend support, mandatory observability, and universal instrumentation for all app types. With multiple projects sharing the same VictoriaMetrics/Logs/Traces backends, data isolation becomes critical. Without it, querying logs for "my-api" returns noise from every other project.

The key mechanism is `OTEL_SERVICE_NAME` — the standard OpenTelemetry env var that all SDKs read to tag every piece of telemetry (spans, logs, metrics) with a `service.name` resource attribute. Story 9.4 already sets `service_name` in state via `configureOtlpEnvVars()`, but two gaps remain:
1. The env var may not actually be set in the process environment (only stored in codeharness state)
2. Query patterns in the knowledge file and status command don't filter by service name

This story closes both gaps and adds a convenience `codeharness query` command.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/otlp.ts` | Add `ensureServiceNameEnvVar()`, call from `configureOtlpEnvVars()` |
| `src/templates/otel-config.ts` | Add `resource/default` processor to all config templates |
| `src/commands/status.ts` | Add service-scoped endpoint URLs to text and JSON output |
| `knowledge/observability-querying.md` | Add service-scoped queries, update all examples |
| `src/commands/query.ts` | **NEW** — `codeharness query logs/metrics/traces` command |
| `src/cli.ts` | Register the new `query` command |

### Existing Code to Leverage

- `src/lib/otlp.ts` `configureOtlpEnvVars()` (line 237): Already sets `service_name: projectName` in state. The `basename(projectDir)` call gives the project directory name as the service name. Task 1 ensures this also becomes an actual environment variable.
- `src/commands/status.ts` `resolveEndpoints()` (line 168): Already resolves endpoint URLs based on OTLP mode (local-shared, remote-direct, remote-routed). Task 3 extends this with service-scoped URLs.
- `src/commands/status.ts` `handleFullStatusJson()` (line 191): Already outputs an `endpoints` object in JSON mode. Task 3 adds a parallel `scoped_endpoints` object.
- `src/templates/otel-config.ts` `otelCollectorConfigTemplate()` (line 76): The base template currently has no `processors` section. Task 2 adds one. `otelCollectorConfigWithCors()` (line 58) derives from the base via string replacement, so it will inherit the processor section automatically.
- `src/templates/otel-config.ts` `otelCollectorRemoteTemplate()` (line 7): The remote template is independent — it needs its own processor section added explicitly.
- `src/lib/docker.ts` `checkRemoteEndpoint()`: Uses `fetch()` with AbortController timeout — same pattern for `query` command HTTP requests.

### OTEL_SERVICE_NAME Enforcement

The `OTEL_SERVICE_NAME` env var is the standard way all OTel SDKs discover the service name. It's simpler and more reliable than `OTEL_RESOURCE_ATTRIBUTES` for this one attribute. Story 9.4 already stores `service_name` in state, but there's no guarantee it reaches the process environment. The `.env.codeharness` file approach ensures it's available regardless of how the project is run:

- Node.js: Many frameworks auto-load `.env` files, and users can `source .env.codeharness` in scripts
- Python: `python-dotenv` can load it, or users can `source` it
- The `start:instrumented` script (from Story 9.4's `patchNodeStartScript()`) should also include it

### OTel Collector Resource Processor

The `resource` processor with `upsert` action sets an attribute only if it's not already present. This handles telemetry from:
- Misconfigured projects that forgot `OTEL_SERVICE_NAME`
- Third-party libraries that emit telemetry without service attribution
- Health check probes or synthetic traffic

The default value `unknown` makes untagged telemetry easily identifiable and filterable. A timestamp suffix (`unknown-<timestamp>`) was considered but adds complexity — a simple `unknown` label is sufficient for identification.

### Query Command Design

The `codeharness query` command is a thin wrapper around `curl`/`fetch` that:
1. Reads the service name and endpoints from state (no manual URL construction)
2. Auto-applies `service.name` filter (the whole point of this story)
3. Formats output for human readability

It's intentionally simple — not a full observability client. Power users can still use `curl` directly with the scoped URLs from `codeharness status`.

### Service Name in PromQL

PromQL uses label matchers: `{service_name="my-api"}`. When injecting into user-provided PromQL, the command must handle:
- Bare metric names: `http_requests_total` -> `http_requests_total{service_name="my-api"}`
- Existing selectors: `http_requests_total{status="200"}` -> `http_requests_total{status="200",service_name="my-api"}`
- Functions: `rate(http_requests_total[5m])` -> `rate(http_requests_total{service_name="my-api"}[5m])`

The `--raw` flag bypasses injection for cases where the user wants cross-project queries.

### Backward Compatibility

- Existing projects get `ensureServiceNameEnvVar()` on next `codeharness init` re-run (idempotent)
- The OTel Collector config change requires a stack restart to take effect. Print `info('OTel Collector config updated — run "codeharness stack stop && codeharness stack start" to apply')` if the stack is already running with the old config.
- The `query` command is additive — doesn't affect any existing commands.
- Knowledge file changes are backward compatible — more specific queries are a superset of the old generic ones.

## File List

- src/lib/otlp.ts
- src/templates/otel-config.ts
- src/commands/status.ts
- src/commands/query.ts (new)
- src/cli.ts
- knowledge/observability-querying.md
- src/lib/__tests__/otlp.test.ts
- src/templates/__tests__/otel-config.test.ts
- src/commands/__tests__/status.test.ts
- src/commands/__tests__/query.test.ts (new)

## Change Log

- 2026-03-15: Story created -- ready for dev.
