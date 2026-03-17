# Story 2.3: Observability Querying — Agent Visibility into Runtime

Status: verifying

## Story

As an autonomous agent,
I want to query application logs, metrics, and traces programmatically,
So that I can diagnose issues using real runtime data instead of guessing.

## Acceptance Criteria

1. **Given** the VictoriaMetrics stack is running and the application is instrumented, **When** the agent queries VictoriaLogs via `curl 'localhost:9428/select/logsql/query?query=level:error'`, **Then** application log entries matching the query are returned, and results return within 2 seconds (NFR2).

2. **Given** the VictoriaMetrics stack is running, **When** the agent queries VictoriaMetrics via PromQL (`curl 'localhost:8428/api/v1/query?query=...'`), **Then** application metrics are returned in Prometheus format.

3. **Given** the VictoriaMetrics stack is running with tracing enabled, **When** the agent queries VictoriaTraces via the Jaeger API (`curl 'localhost:16686/api/traces?service=...'`), **Then** request trace data is returned showing the full request flow.

4. **Given** the plugin is installed, **When** the agent needs to query observability data, **Then** the `knowledge/victoria-querying.md` file provides LogQL/PromQL/trace query patterns, and the `skills/visibility-enforcement/` skill teaches the agent when and how to query.

5. **Given** observability enforcement is ON and the Docker stack is running, **When** `codeharness status --check-docker` is called, **Then** the health check confirms all four services (victoria-logs, victoria-metrics, victoria-traces, otel-collector) are running, providing the agent confidence that querying endpoints are available.

6. **Given** the agent queries VictoriaLogs after a test run, **When** the `post-test-verify.sh` hook fires, **Then** the hook prompts the agent to query logs for errors, and the `logs_queried` session flag can be set via `codeharness state set logs_queried true`.

7. **Given** observability enforcement is OFF, **When** the agent attempts to query observability endpoints, **Then** the knowledge file documents that queries will fail without the stack running, and the skill guides the agent to skip observability checks.

## Tasks / Subtasks

- [x] Task 1: Create `plugin/knowledge/victoria-querying.md` — Agent knowledge file for observability querying (AC: #1, #2, #3, #4, #7)
  - [x] 1.1: Document VictoriaLogs LogQL query patterns — `curl` commands for common queries: `level:error`, `level:warn`, filtering by service name, time range queries, full-text search
  - [x] 1.2: Document VictoriaLogs endpoint format — `http://localhost:9428/select/logsql/query?query=<LogQL>&start=<time>&end=<time>`
  - [x] 1.3: Document VictoriaMetrics PromQL query patterns — `curl` commands for: instant queries, range queries, metric listing, label discovery
  - [x] 1.4: Document VictoriaMetrics endpoint format — `http://localhost:8428/api/v1/query?query=<PromQL>`, `/api/v1/query_range`, `/api/v1/labels`, `/api/v1/label/__name__/values`
  - [x] 1.5: Document VictoriaTraces (Jaeger) query patterns — `curl` commands for: searching traces by service, finding traces by trace ID, filtering by operation and duration
  - [x] 1.6: Document VictoriaTraces endpoint format — `http://localhost:16686/api/traces?service=<name>`, `http://localhost:16686/api/traces/<traceID>`
  - [x] 1.7: Document OTel Collector health check — `curl http://localhost:4318/` for HTTP receiver health
  - [x] 1.8: Document common debugging workflows — "after test failure, query logs", "after API error, trace the request", "check metrics for anomalies"
  - [x] 1.9: Document what happens when observability is OFF — queries will fail, agent should skip observability steps
  - [x] 1.10: Include port reference table: logs 9428, metrics 8428, traces (UI) 16686, traces (collector) 14268, otel-grpc 4317, otel-http 4318

- [x] Task 2: Create `plugin/skills/visibility-enforcement/` skill — Agent skill for observability workflow (AC: #4, #6)
  - [x] 2.1: Create `plugin/skills/visibility-enforcement/skill.md` (or appropriate skill file)
  - [x] 2.2: Define when the agent SHOULD query observability: after test runs, after seeing HTTP errors, when debugging unexpected behavior, during verification
  - [x] 2.3: Define the query decision flow: check if observability is ON (read state file `enforcement.observability`), check if Docker stack is healthy, then query appropriate endpoint
  - [x] 2.4: Define the post-query action: if errors found in logs, diagnose and fix; if metrics show anomalies, investigate; if traces show failures, trace the root cause
  - [x] 2.5: Reference `knowledge/victoria-querying.md` for query patterns
  - [x] 2.6: Document `logs_queried` session flag — set via `codeharness state set logs_queried true` after querying logs

- [x] Task 3: Create `plugin/hooks/post-test-verify.sh` — Hook to prompt log query after tests (AC: #6)
  - [x] 3.1: Implement PostToolUse hook script that fires after test execution
  - [x] 3.2: Read state file to check if `enforcement.observability` is true
  - [x] 3.3: If observability is ON, emit `{"message": "Query VictoriaLogs for errors after test run: curl 'http://localhost:9428/select/logsql/query?query=level:error'"}`
  - [x] 3.4: If observability is OFF, emit `{"decision": "allow"}` and exit 0 (no prompt)
  - [x] 3.5: Follow hook patterns: never `exit 1`, always output valid JSON, fail open if state file missing

- [x] Task 4: Create `plugin/hooks/hooks.json` — Hook event registrations (AC: #6)
  - [x] 4.1: Create (or extend if exists) `plugin/hooks/hooks.json` with PostToolUse hook registration for `post-test-verify.sh`
  - [x] 4.2: Register hook to fire after test tool execution (e.g., after `npm test`, `vitest`, `pytest` tool use)

- [x] Task 5: Validate observability endpoint availability via integration patterns (AC: #1, #2, #3, #5)
  - [x] 5.1: Document manual integration test steps: start Docker stack, send test telemetry via OTel Collector, query VictoriaLogs for the test log, query VictoriaMetrics for the test metric, query VictoriaTraces for the test trace
  - [x] 5.2: Document test telemetry generation: `curl -X POST http://localhost:4318/v1/logs -H 'Content-Type: application/json' -d '{...}'` (OTLP HTTP format)
  - [x] 5.3: Verify OTel Collector routing: logs arrive at VictoriaLogs, metrics at VictoriaMetrics, traces at VictoriaTraces (Jaeger)
  - [x] 5.4: Add these integration test steps to `test/integration/` as documented test procedures (not automated — Docker required)

- [x] Task 6: Extend `src/commands/status.ts` with observability endpoint summary (AC: #5)
  - [x] 6.1: When `--check-docker` runs and stack is healthy, additionally print endpoint URLs: `[INFO] Endpoints: logs=http://localhost:9428 metrics=http://localhost:8428 traces=http://localhost:16686`
  - [x] 6.2: When `--check-docker --json` runs, include `endpoints` object in JSON output with URLs for each service
  - [x] 6.3: Write unit tests for the new endpoint output — mock Docker health, verify endpoint info printed

- [x] Task 7: Build and verify (all ACs)
  - [x] 7.1: Run `npm run build` — verify tsup compiles successfully
  - [x] 7.2: Run `npm run test:unit` — all tests pass including new/updated tests
  - [x] 7.3: Run `npm run test:coverage` — verify 100% coverage for new/changed src/ files
  - [x] 7.4: Verify `plugin/knowledge/victoria-querying.md` contains accurate LogQL, PromQL, and Jaeger API patterns
  - [x] 7.5: Verify `plugin/skills/visibility-enforcement/` skill file is well-structured and references knowledge file
  - [x] 7.6: Verify `plugin/hooks/post-test-verify.sh` follows canonical hook patterns (valid JSON output, never exit 1, fail open)
  - [x] 7.7: Verify `plugin/hooks/hooks.json` is valid JSON and references the hook script correctly

## Dev Notes

### This Story Completes Epic 2 — Agent Has Eyes

Stories 2.1 (dependency install + OTLP instrumentation) and 2.2 (Docker Compose + VictoriaMetrics stack management) set up the infrastructure. This story completes the picture by giving the agent the knowledge and workflow to actually USE that infrastructure — querying logs, metrics, and traces during development.

### What Already Exists (from Epic 1 + Stories 2.1, 2.2)

- `src/commands/init.ts` — Full init with stack detection, enforcement config, dependency install, OTLP instrumentation, Docker stack start, state file, docs scaffold
- `src/commands/status.ts` — Partial implementation with `--check-docker` flag that calls `getStackHealth()`
- `src/lib/docker.ts` — Full Docker lifecycle: `isDockerAvailable()`, `isDockerComposeAvailable()`, `isStackRunning()`, `startStack()`, `stopStack()`, `getStackHealth()`
- `src/lib/state.ts` — Full state management with `HarnessState` interface (includes `otlp?` and `docker?` optional fields)
- `src/lib/otlp.ts` — OTLP package installation and environment variable configuration
- `src/templates/docker-compose.ts` — Docker Compose template with VictoriaLogs, VictoriaMetrics, VictoriaTraces (Jaeger), OTel Collector
- `src/templates/otel-config.ts` — OTel Collector config routing logs/metrics/traces to respective backends
- `src/lib/output.ts` — `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()`

### What Does NOT Exist Yet

- `plugin/` directory — no plugin scaffold has been generated yet. This story creates the first plugin artifacts.
- `plugin/knowledge/victoria-querying.md` — agent knowledge file for querying
- `plugin/skills/visibility-enforcement/` — agent skill for observability workflow
- `plugin/hooks/post-test-verify.sh` — hook to prompt log query after tests
- `plugin/hooks/hooks.json` — hook registrations

### Architecture Decisions That Apply

- **Decision 1 (CLI <-> Plugin Boundary):** The CLI owns Docker lifecycle and state mutations. The plugin owns agent knowledge (querying patterns) and enforcement signals (hooks prompting the agent to query). This story creates plugin artifacts — NOT CLI commands for querying. The agent queries directly via `curl`, guided by knowledge files.
- **Decision 2 (State Management):** The `logs_queried` session flag exists in the state file. Hooks read it, CLI sets it via `codeharness state set logs_queried true`.
- **Decision 5 (Docker Lifecycle):** Stack health is checked via `codeharness status --check-docker`. If stack is down, agent cannot query — knowledge file documents this.

### Key Design Principle: Agent Queries Directly

The agent does NOT query through the CLI. The agent queries directly via `curl` to VictoriaLogs/VictoriaMetrics/VictoriaTraces endpoints. The CLI's role is:
1. Start/stop the Docker stack (Story 2.2 — done)
2. Provide health checks (`--check-docker`) to verify endpoints are available
3. Manage session flags (`logs_queried`) to track that the agent queried

The plugin's role is:
1. Teach the agent HOW to query (knowledge file with curl patterns)
2. Teach the agent WHEN to query (skill file with decision flow)
3. Prompt the agent TO query (hook after test runs)

### VictoriaLogs LogQL Reference

VictoriaLogs uses a LogQL-like query language. Key patterns:
- `level:error` — filter by log level
- `_msg:"connection refused"` — full-text search in message
- `service:"my-app"` — filter by service name (from OTLP `service.name`)
- `_time:5m` — last 5 minutes
- `level:error AND service:"my-app"` — combine filters

Endpoint: `http://localhost:9428/select/logsql/query?query=<encoded-query>`

### VictoriaMetrics PromQL Reference

Standard PromQL. Key endpoints:
- Instant query: `http://localhost:8428/api/v1/query?query=<PromQL>`
- Range query: `http://localhost:8428/api/v1/query_range?query=<PromQL>&start=<ts>&end=<ts>&step=15s`
- Label names: `http://localhost:8428/api/v1/labels`
- Metric names: `http://localhost:8428/api/v1/label/__name__/values`

### VictoriaTraces (Jaeger) API Reference

Uses Jaeger HTTP API. Key endpoints:
- List services: `http://localhost:16686/api/services`
- Search traces: `http://localhost:16686/api/traces?service=<name>&limit=20`
- Get trace: `http://localhost:16686/api/traces/<traceID>`
- Get operations: `http://localhost:16686/api/services/<name>/operations`

### Port Reference (from docker-compose.ts)

| Service | Port | Purpose |
|---------|------|---------|
| victoria-logs | 9428 | Log queries (LogQL) |
| victoria-metrics | 8428 | Metric queries (PromQL) |
| victoria-traces (Jaeger) | 16686 | Trace UI + API |
| victoria-traces (Jaeger) | 14268 | Trace collector (receives from OTel) |
| otel-collector | 4317 | OTLP gRPC receiver |
| otel-collector | 4318 | OTLP HTTP receiver |

### Plugin Directory Structure

This story creates the first plugin artifacts. The plugin directory follows the architecture spec:

```
plugin/
├── hooks/
│   ├── hooks.json
│   └── post-test-verify.sh
├── knowledge/
│   └── victoria-querying.md
└── skills/
    └── visibility-enforcement/
        └── skill.md
```

Future stories (Epics 3, 4) will add more files to this structure. Story 4.2 adds `pre-commit-gate.sh`, `post-write-check.sh`, `session-start.sh`. Story 3.2+ adds `skills/bmad-integration/`. Story 4.1 adds `agents/verifier.md`, `skills/verification-enforcement/`.

### Hook Script Pattern — Follow Architecture Spec

The `post-test-verify.sh` hook MUST follow the canonical hook patterns from the architecture doc:
- Output valid JSON to stdout (`{"message": "..."}` or `{"decision": "allow"}`)
- Never `exit 1` — use `exit 0` for allow, `exit 2` for block
- Fail open if state file missing
- Read state via `get_state()` bash function
- Errors to stderr, decisions to stdout

### Scope Boundaries

**IN SCOPE (this story):**
- `plugin/knowledge/victoria-querying.md` — LogQL, PromQL, Jaeger API query patterns
- `plugin/skills/visibility-enforcement/skill.md` — when/how to query observability
- `plugin/hooks/post-test-verify.sh` — prompt agent to query logs after tests
- `plugin/hooks/hooks.json` — hook event registration
- Minor extension to `src/commands/status.ts` — endpoint URL output in `--check-docker`
- Unit tests for status.ts changes

**OUT OF SCOPE (later stories):**
- `pre-commit-gate.sh` — Story 4.2
- `post-write-check.sh` — Story 4.2
- `session-start.sh` — Story 4.2
- Full `status` command — Epic 7
- Verification pipeline — Epic 4
- Showboat integration — Epic 4
- Agent-browser integration — Epic 4

### What NOT To Do

- **Do NOT create CLI commands for querying observability.** The agent queries directly via `curl`. The CLI manages infrastructure; the plugin provides knowledge.
- **Do NOT implement pre-commit-gate or session-start hooks.** Those are Story 4.2.
- **Do NOT implement full `status` command.** Only extend `--check-docker` with endpoint URLs.
- **Do NOT use `console.log` directly.** Use output utilities from `src/lib/output.ts`.
- **Do NOT add `any` types.** Strict TypeScript.
- **Do NOT create `plugin/.claude-plugin/plugin.json`** — that manifest comes when the full plugin scaffold is generated (Epic 3 or later init step).

### Dependencies

- **Depends on:** Story 2.2 (Docker Compose, VictoriaMetrics stack, OTel Collector config, `--check-docker` in status) — DONE
- **Depends on:** Story 2.1 (OTLP instrumentation, dependency install) — DONE
- **Depends on:** Story 1.3 (init command, state management) — DONE
- **Depended on by:** Story 4.2 (hook architecture references observability knowledge and hook patterns from this story)
- **Depended on by:** Sprint execution skill enhancements (Epic 4 quality gates use observability queries)

### New npm Dependencies

None. Plugin artifacts are markdown, bash, and JSON — no compilation. The minor `status.ts` extension uses only existing dependencies.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Decision 1 (CLI<->Plugin Boundary), Decision 2 (State Management), Decision 5 (Docker Lifecycle)]
- [Source: _bmad-output/planning-artifacts/prd.md — FR17, FR18, FR19, NFR2]
- [Source: _bmad-output/planning-artifacts/prd.md — Journey 3 (Agent Developing with Harness), Journey 4 (Agent Debugging a Failure)]
- [Source: _bmad-output/implementation-artifacts/2-2-docker-compose-victoriametrics-stack-management.md — predecessor story, OTel Collector config, Docker Compose services]
- [Source: _bmad-output/implementation-artifacts/epic-1-retrospective.md — lessons learned]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [x] Showboat proof document created (`docs/exec-plans/active/2-3-observability-querying-agent-visibility-into-runtime.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (plugin/knowledge, plugin/skills, plugin/hooks modules)
- [x] Exec-plan created in `docs/exec-plans/active/2-3-observability-querying-agent-visibility-into-runtime.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] Integration tests for cross-module interactions
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
