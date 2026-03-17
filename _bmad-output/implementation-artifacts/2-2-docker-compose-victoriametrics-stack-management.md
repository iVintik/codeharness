# Story 2.2: Docker Compose & VictoriaMetrics Stack Management

Status: verifying

## Story

As a developer,
I want codeharness to manage an ephemeral VictoriaMetrics observability stack,
So that the agent has runtime visibility into my application during development.

## Acceptance Criteria

1. **Given** observability enforcement is ON and Docker is available, **When** `codeharness init` runs the Docker setup step, **Then** `docker-compose.harness.yml` is generated from embedded TypeScript templates (not copied from external files), the compose file includes VictoriaLogs, VictoriaMetrics, and OTel Collector services, and all Docker image tags are pinned versions, never `latest` (NFR11).

2. **Given** a generated Docker Compose file, **When** the VictoriaMetrics stack is started, **Then** all services start within 30 seconds (NFR4), and init prints port mappings: `[OK] VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)`.

3. **Given** the VictoriaMetrics stack is running, **When** `codeharness init` is run again (idempotent), **Then** the existing stack is detected and not restarted, and init prints `[INFO] VictoriaMetrics stack: already running`.

4. **Given** the VictoriaMetrics stack crashes during development, **When** a health check is performed (via hook or `codeharness status --check-docker`), **Then** the crash is detected and reported: `[FAIL] VictoriaMetrics stack: not running`, and actionable remedy is shown: `-> Restart: docker compose -f docker-compose.harness.yml up -d` (NFR16).

5. **Given** observability enforcement is OFF, **When** `codeharness init` runs, **Then** no Docker Compose file is generated, no Docker commands are executed, and init prints `[INFO] Observability: disabled, skipping Docker stack`.

6. **Given** Docker is not installed and observability is ON, **When** `codeharness init` runs, **Then** init prints `[FAIL] Docker not installed` with install link and `--no-observability` alternative, and init exits with code 1.

7. **Given** `codeharness init --json` is used with observability ON, **When** Docker setup completes, **Then** JSON output includes a `docker` object with compose file path, service statuses, and port mappings.

8. **Given** the OTel Collector is configured, **When** the instrumented application sends telemetry, **Then** the OTel Collector config routes logs to VictoriaLogs, metrics to VictoriaMetrics, and traces to VictoriaTraces.

## Tasks / Subtasks

- [ ] Task 1: Create `src/templates/docker-compose.ts` — Docker Compose template as embedded TypeScript (AC: #1, #8)
  - [ ] 1.1: Define `DockerComposeConfig` interface: `{ projectName: string, observability: boolean }`
  - [ ] 1.2: Implement `dockerComposeTemplate(config: DockerComposeConfig): string` — returns full `docker-compose.harness.yml` content as a YAML string
  - [ ] 1.3: Include VictoriaLogs service — `victoriametrics/victoria-logs:v1.15.0`, port 9428, volume for data persistence
  - [ ] 1.4: Include VictoriaMetrics service — `victoriametrics/victoria-metrics:v1.106.1`, port 8428, volume for data persistence
  - [ ] 1.5: Include VictoriaTraces service (vmagent or dedicated trace receiver) — port 14268
  - [ ] 1.6: Include OTel Collector service — `otel/opentelemetry-collector-contrib:0.96.0`, ports 4317 (gRPC) and 4318 (HTTP), depends on VictoriaLogs/VictoriaMetrics
  - [ ] 1.7: Pin ALL Docker image tags — no `latest` tags anywhere (NFR11)
  - [ ] 1.8: Define shared Docker network for inter-service communication

- [ ] Task 2: Create `src/templates/otel-config.ts` — OTel Collector configuration template (AC: #8)
  - [ ] 2.1: Define `OtelConfigTemplate` interface if needed
  - [ ] 2.2: Implement `otelCollectorConfigTemplate(): string` — returns OTel Collector YAML config
  - [ ] 2.3: Configure receivers: OTLP (gRPC port 4317, HTTP port 4318)
  - [ ] 2.4: Configure exporters: VictoriaLogs exporter (HTTP to localhost:9428), VictoriaMetrics exporter (remote write to localhost:8428), VictoriaTraces exporter (Jaeger/OTLP to traces service)
  - [ ] 2.5: Configure service pipelines: logs pipeline (OTLP receiver -> VictoriaLogs exporter), metrics pipeline (OTLP receiver -> VictoriaMetrics exporter), traces pipeline (OTLP receiver -> VictoriaTraces exporter)

- [ ] Task 3: Extend `src/lib/docker.ts` — Docker Compose lifecycle management (AC: #2, #3, #4)
  - [ ] 3.1: Implement `isDockerComposeAvailable(): boolean` — checks `docker compose version` (V2 compose plugin)
  - [ ] 3.2: Implement `isStackRunning(composeFile: string): boolean` — runs `docker compose -f <file> ps --format json`, checks if services are running
  - [ ] 3.3: Implement `startStack(composeFile: string): DockerStartResult` — runs `docker compose -f <file> up -d`, returns service statuses and port mappings, enforces 30s timeout (NFR4)
  - [ ] 3.4: Implement `stopStack(composeFile: string): void` — runs `docker compose -f <file> down -v`
  - [ ] 3.5: Implement `getStackHealth(composeFile: string): DockerHealthResult` — checks which services are running vs expected, returns structured health report
  - [ ] 3.6: Define `DockerStartResult` interface: `{ started: boolean, services: { name: string, status: string, port: string }[], error?: string }`
  - [ ] 3.7: Define `DockerHealthResult` interface: `{ healthy: boolean, services: { name: string, running: boolean }[], remedy?: string }`

- [ ] Task 4: Integrate Docker stack into `init` command (AC: #1, #2, #3, #5, #6, #7)
  - [ ] 4.1: After dependency install and state creation, add Docker stack setup step when `enforcement.observability === true`
  - [ ] 4.2: Generate `docker-compose.harness.yml` using `dockerComposeTemplate()` and `generateFile()` from `templates.ts`
  - [ ] 4.3: Generate `otel-collector-config.yaml` using `otelCollectorConfigTemplate()` and `generateFile()`
  - [ ] 4.4: Check if stack is already running (idempotent) — if yes, print `[INFO] VictoriaMetrics stack: already running` and skip
  - [ ] 4.5: Start stack via `startStack()` — print port mappings on success: `[OK] VictoriaMetrics stack: started (logs:9428, metrics:8428, traces:14268)`
  - [ ] 4.6: Handle start failure — print `[FAIL] VictoriaMetrics stack: failed to start` with error details
  - [ ] 4.7: When observability is OFF, print `[INFO] Observability: disabled, skipping Docker stack` and skip all Docker steps
  - [ ] 4.8: Extend `InitResult` with `docker?: DockerResult` object for JSON output

- [ ] Task 5: Add `--check-docker` to status command (AC: #4)
  - [ ] 5.1: Add `--check-docker` option to the `status` command registration
  - [ ] 5.2: Implement health check logic: read compose file path, call `getStackHealth()`, report status
  - [ ] 5.3: Print `[OK] VictoriaMetrics stack: running` or `[FAIL] VictoriaMetrics stack: not running` with remedy `-> Restart: docker compose -f docker-compose.harness.yml up -d`
  - [ ] 5.4: Support `--json` flag for health check output

- [ ] Task 6: Store Docker state in harness state file (AC: #3, #7)
  - [ ] 6.1: Extend `HarnessState` interface with `docker?: { compose_file: string, stack_running: boolean, ports: { logs: number, metrics: number, traces: number, otel_grpc: number, otel_http: number } }`
  - [ ] 6.2: Update state file after successful stack start with compose file path and port mappings
  - [ ] 6.3: Update `isValidState()` to handle the new optional `docker` field (backward-compatible)

- [ ] Task 7: Write unit tests for `src/templates/docker-compose.ts` (AC: #1)
  - [ ] 7.1: Create `src/templates/__tests__/docker-compose.test.ts`
  - [ ] 7.2: Test generated YAML is valid — parse with `yaml` package, verify service names
  - [ ] 7.3: Test all image tags are pinned (no `latest`, no missing tags)
  - [ ] 7.4: Test port mappings are present and correct (9428, 8428, 14268, 4317, 4318)
  - [ ] 7.5: Test OTel Collector config volume mount points to correct config file
  - [ ] 7.6: Verify 100% coverage of docker-compose.ts

- [ ] Task 8: Write unit tests for `src/templates/otel-config.ts` (AC: #8)
  - [ ] 8.1: Create `src/templates/__tests__/otel-config.test.ts`
  - [ ] 8.2: Test generated config is valid YAML
  - [ ] 8.3: Test receivers include OTLP with gRPC (4317) and HTTP (4318)
  - [ ] 8.4: Test exporters route to correct VictoriaMetrics endpoints
  - [ ] 8.5: Test service pipelines connect receivers to correct exporters
  - [ ] 8.6: Verify 100% coverage of otel-config.ts

- [ ] Task 9: Write unit tests for extended `src/lib/docker.ts` (AC: #2, #3, #4)
  - [ ] 9.1: Extend `src/lib/__tests__/docker.test.ts` with new tests
  - [ ] 9.2: Mock `child_process.execSync` / `execFileSync` for all Docker commands
  - [ ] 9.3: Test `isDockerComposeAvailable()` — success and failure cases
  - [ ] 9.4: Test `isStackRunning()` — running, stopped, compose file missing
  - [ ] 9.5: Test `startStack()` — success with port detection, failure with error capture, timeout handling
  - [ ] 9.6: Test `stopStack()` — success and failure
  - [ ] 9.7: Test `getStackHealth()` — all healthy, some down, all down
  - [ ] 9.8: Verify 100% coverage of docker.ts

- [ ] Task 10: Update init command tests (AC: #1, #2, #3, #5, #6, #7)
  - [ ] 10.1: Update `src/commands/__tests__/init.test.ts`
  - [ ] 10.2: Mock Docker module functions (`isStackRunning`, `startStack`)
  - [ ] 10.3: Test init with observability ON — verify compose file generated, stack started, port mappings printed
  - [ ] 10.4: Test init with observability OFF — verify no Docker activity, skip message printed
  - [ ] 10.5: Test init idempotent re-run — verify already-running stack detected, not restarted
  - [ ] 10.6: Test init JSON output — verify `docker` section in JSON result
  - [ ] 10.7: Test init with Docker not installed + observability ON — verify error and exit code 1

- [ ] Task 11: Build and verify (all ACs)
  - [ ] 11.1: Run `npm run build` — verify tsup compiles successfully with new template modules
  - [ ] 11.2: Run `npm run test:unit` — all tests pass including new tests
  - [ ] 11.3: Run `npm run test:coverage` — verify 100% coverage for new files
  - [ ] 11.4: Manual test: `codeharness init` with Docker available — verify compose file generation and stack start
  - [ ] 11.5: Manual test: `codeharness init --no-observability` — verify Docker skipped
  - [ ] 11.6: Manual test: `codeharness init --json` with observability ON — verify Docker section in JSON

## Dev Notes

### This Story Adds Docker Lifecycle to Init

Story 2.1 added dependency auto-install and OTLP instrumentation to init. This story extends init further to generate Docker Compose files from embedded templates and manage the VictoriaMetrics observability stack lifecycle. After this story, `codeharness init` with observability ON will produce a fully running observability stack.

### What Already Exists (from Epic 1 + Story 2.1)

- `src/commands/init.ts` — Working init command with stack detection, enforcement flags, Docker availability check, dependency install, OTLP instrumentation, state file creation, documentation scaffold, idempotent re-run, JSON output
- `src/lib/docker.ts` — `isDockerAvailable()` only (10 lines) — needs significant extension
- `src/lib/state.ts` — Full state management with `HarnessState` interface (includes `otlp?` optional field from Story 2.1)
- `src/lib/templates.ts` — `generateFile()` and `renderTemplate()` — used to write generated files to disk
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()`
- `src/lib/deps.ts` — Dependency auto-install with fallback chains
- `src/lib/otlp.ts` — OTLP package installation and env var configuration
- `src/commands/status.ts` — Stub only ("Not yet implemented. Coming in Epic 7.")
- `src/commands/teardown.ts` — Stub only ("Not yet implemented. Coming in Epic 7.")

### Architecture Decisions That Apply

- **Decision 5 (Docker Lifecycle):** CLI manages Docker Compose via `child_process.exec`. Docker required only when `enforcement.observability === true`. Skip logic: observability OFF -> skip Docker entirely. Docker not installed + observability ON -> clear error, halt. Docker not installed + observability OFF -> silently skip.
- **Decision 6 (Template Embedding):** Templates are TypeScript string literals compiled into npm package. `src/templates/docker-compose.ts` and `src/templates/otel-config.ts` return YAML strings. No external file copying.
- **Decision 1 (CLI <-> Plugin Boundary):** Docker management is CLI-only. Hooks only call `codeharness status --check-docker` to read state.
- **Decision 2 (State Management):** Docker state stored in `.claude/codeharness.local.md` YAML frontmatter.

### Docker Compose File Structure

The generated `docker-compose.harness.yml` should include these services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| victoria-logs | `victoriametrics/victoria-logs:v1.15.0` | 9428 | Log storage, LogQL queries |
| victoria-metrics | `victoriametrics/victoria-metrics:v1.106.1` | 8428 | Metrics storage, PromQL queries |
| victoria-traces | `jaegertracing/all-in-one:1.56` | 14268 (collector), 16686 (UI) | Trace storage and querying |
| otel-collector | `otel/opentelemetry-collector-contrib:0.96.0` | 4317 (gRPC), 4318 (HTTP) | Receives OTLP telemetry, routes to backends |

All images use pinned version tags (NFR11). The OTel Collector mounts `otel-collector-config.yaml` as a volume.

### OTel Collector Configuration

The OTel Collector config (`otel-collector-config.yaml`) must define:

**Receivers:**
- `otlp` with gRPC (port 4317) and HTTP (port 4318) endpoints

**Exporters:**
- Logs -> VictoriaLogs via HTTP (`http://victoria-logs:9428/insert/jsonline`)
- Metrics -> VictoriaMetrics via Prometheus remote write (`http://victoria-metrics:8428/api/v1/write`)
- Traces -> Jaeger/VictoriaTraces via OTLP (`http://victoria-traces:14268`)

**Service Pipelines:**
- `logs` pipeline: otlp receiver -> victorlogs exporter
- `metrics` pipeline: otlp receiver -> prometheusremotewrite exporter
- `traces` pipeline: otlp receiver -> otlp/traces exporter

### Docker Compose V2 (Plugin-based)

Use `docker compose` (V2, no hyphen) not `docker-compose` (V1, deprecated). V2 is built into Docker Desktop and Docker Engine as a plugin. All commands use:
```bash
docker compose -f docker-compose.harness.yml up -d
docker compose -f docker-compose.harness.yml ps --format json
docker compose -f docker-compose.harness.yml down -v
```

### Idempotent Stack Management

Before starting the stack, check if it's already running:
1. Run `docker compose -f docker-compose.harness.yml ps --format json`
2. Parse the JSON output to check service states
3. If all services are running -> skip start, print info message
4. If some or no services running -> start/restart

### Init Command Growth — Follow Retro Action A5

Epic 1 retro flagged init.ts growth. With Docker setup, the init command adds another ~30-50 lines. The Docker logic should be encapsulated in `docker.ts` functions so init.ts stays orchestration-only — calling `isStackRunning()`, `startStack()`, etc.

### Status Command Extension

The `status` command is currently a stub. This story adds `--check-docker` flag as a partial implementation. The full status command implementation is in Epic 7, but the Docker health check is needed now for hooks to call `codeharness status --check-docker`.

### Scope Boundaries

**IN SCOPE (this story):**
- `src/templates/docker-compose.ts` — Docker Compose YAML template
- `src/templates/otel-config.ts` — OTel Collector configuration template
- Extending `src/lib/docker.ts` — compose lifecycle (start, stop, health, running check)
- Extending `src/commands/init.ts` — Docker stack setup step
- Partial `src/commands/status.ts` — `--check-docker` flag only
- Extending `HarnessState` with `docker` section
- Unit tests for all new code

**OUT OF SCOPE (later stories):**
- Observability querying (LogQL, PromQL, traces) — Story 2.3
- Plugin knowledge files (`knowledge/victoria-querying.md`) — Story 2.3
- Plugin skills (`skills/visibility-enforcement/`) — Story 2.3
- Full `status` command implementation — Epic 7
- `teardown` command Docker Compose down — Epic 7
- Grafana dashboard — if needed, separate story

### What NOT To Do

- **Do NOT actually start Docker in tests** — mock all `execSync`/`execFileSync` calls.
- **Do NOT use `latest` Docker image tags** — pin every image version (NFR11).
- **Do NOT use `docker-compose` (V1 binary)** — use `docker compose` (V2 plugin).
- **Do NOT generate template files on disk** — templates are TypeScript functions that return strings.
- **Do NOT implement observability querying** — that's Story 2.3.
- **Do NOT use `console.log` directly** — use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types** — strict TypeScript.
- **Do NOT implement full `status` command** — only `--check-docker` flag.

### Dependencies

- **Depends on:** Story 2.1 (OTLP instrumentation, dependency install, `HarnessState.otlp` field) — DONE
- **Depends on:** Story 1.3 (init command, state management, Docker availability check) — DONE
- **Depended on by:** Story 2.3 (observability querying needs running stack and OTel config)

### New npm Dependencies

None. Docker commands are invoked as subprocesses via `child_process`. Templates use the existing `yaml` package for validation in tests only.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 5 (Docker Lifecycle), Decision 6 (Template Embedding)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR9, FR12, FR13, NFR4, NFR11, NFR16]
- [Source: _bmad-output/planning-artifacts/prd.md — Known Implementation Gap #4 (Docker Compose templates missing)]
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md — Action A5 (init growth)]
- [Source: _bmad-output/implementation-artifacts/2-1-dependency-auto-install-otlp-instrumentation.md — predecessor story]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-2-docker-compose-victoriametrics-stack-management.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/lib module — docker.ts, src/templates — docker-compose.ts, otel-config.ts)
- [ ] Exec-plan created in `docs/exec-plans/active/2-2-docker-compose-victoriametrics-stack-management.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Verification Findings

_Last updated: 2026-03-17T12:10:00Z_

The following ACs failed black-box verification:

### AC 6: Docker not installed behavior
**Verdict:** FAIL
**Error output:**
When Docker is absent, `codeharness init` exits with code 0 (AC requires exit code 1). Uses `[WARN] Docker not available — observability will use remote mode` instead of `[FAIL] Docker not installed`. Does not halt init — gracefully degrades instead of failing. AC requires: exit code 1, `[FAIL]` message, and halt.

### AC 7: JSON output includes docker object
**Verdict:** FAIL
**Error output:**
`codeharness init --json` output does NOT include a `docker` object. The AC requires JSON output to include a `docker` object with compose file path, service statuses, and port mappings. The field is absent entirely — should be present even when Docker is unavailable (with status indicating unavailability).

### AC 8: OTEL Collector routes telemetry correctly
**Verdict:** FAIL
**Error output:**
Trace pipeline uses gRPC `otlp/traces` exporter to Jaeger's HTTP port 14268, causing protocol mismatch error: `http2: frame too large`. Log routing works (verified end-to-end). Metric routing config is correct. Fix: use `otlphttp/traces` exporter, or target Jaeger's gRPC OTLP port on a non-conflicting mapped port.
