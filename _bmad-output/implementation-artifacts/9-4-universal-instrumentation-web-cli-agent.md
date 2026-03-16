# Story 9.4: Universal Instrumentation — Web, CLI, Agent Support

Status: ready-for-dev

## Story

As a developer building any type of application,
I want codeharness to instrument my project regardless of whether it's a web app, CLI tool, or AI agent,
So that I get observability for all project types, not just long-running Node.js/Python servers.

## Acceptance Criteria

1. **Given** a Node.js CLI project (no `start` script, has `bin` in package.json), **When** `codeharness init` detects the CLI stack type, **Then** OTLP is configured with `OTEL_BSP_SCHEDULE_DELAY=100` (flush quickly for short-lived processes), **And** a wrapper script or `NODE_OPTIONS` env var is configured for CLI execution, **And** the state records `app_type: cli`.

2. **Given** a web application (has `index.html` or frontend framework detected), **When** `codeharness init` detects the web stack type, **Then** a browser OTLP setup is configured (OTel Web SDK snippet or package), **And** the OTel Collector is configured to accept browser telemetry on HTTP endpoint, **And** CORS headers are configured on the OTel Collector for localhost origins.

3. **Given** a Python or Node.js agent project (imports `anthropic`, `openai`, `langchain`, etc.), **When** `codeharness init` detects the agent stack type, **Then** LLM call tracing is configured (OpenLLMetry / Traceloop or similar), **And** token usage, latency, and prompt/completion lengths are captured as metrics, **And** the state records `app_type: agent`.

4. **Given** any app type, **When** telemetry is emitted, **Then** `service.name` is always set to the project name, **And** `service.instance.id` is set to a unique value per process, **And** data from different projects is separable in queries.

5. **Given** stack detection cannot determine the app type, **When** `codeharness init` runs, **Then** `[INFO] App type: generic (manual OTLP setup may be needed)` is printed, **And** basic OTLP env vars are still configured (endpoint, service name), **And** the knowledge file provides manual instrumentation guidance.

## Tasks / Subtasks

- [ ] Task 1: Extend `detectStack()` to detect app type (AC: #1, #2, #3, #5)
  - [ ] 1.1: In `src/lib/stack-detect.ts`, add a new exported type `AppType = 'server' | 'cli' | 'web' | 'agent' | 'generic'`.
  - [ ] 1.2: Add a new exported function `detectAppType(dir: string, stack: string | null): AppType` that determines the application type based on project files and dependencies.
  - [ ] 1.3: CLI detection (Node.js): Check `package.json` for `bin` field. If `bin` is present and there is no `start` script, return `'cli'`.
  - [ ] 1.4: Web detection (Node.js): Check for `index.html` in project root or `public/` or `src/`. Check `package.json` dependencies for `react`, `vue`, `svelte`, `angular`, `next`, `nuxt`, `vite`, `webpack`. If any match, return `'web'`.
  - [ ] 1.5: Agent detection (Node.js): Check `package.json` dependencies and devDependencies for `anthropic`, `@anthropic-ai/sdk`, `openai`, `langchain`, `@langchain/core`, `llamaindex`. If any match, return `'agent'`.
  - [ ] 1.6: Agent detection (Python): Check `requirements.txt`, `pyproject.toml`, or `setup.py` for `anthropic`, `openai`, `langchain`, `llama-index`, `traceloop-sdk`. If any match, return `'agent'`.
  - [ ] 1.7: Web detection (Python): Check dependencies for `flask`, `django`, `fastapi`, `streamlit` with templates/static files. If the project has `templates/` or `static/` dirs alongside these deps, return `'web'`. Note: bare Flask/Django/FastAPI without templates is `'server'`.
  - [ ] 1.8: Server detection: If stack is `'nodejs'` and `package.json` has a `start` script but doesn't match CLI/web/agent, return `'server'`. Same for Python with typical entry points.
  - [ ] 1.9: Fallback: If none of the above match, return `'generic'`.

- [ ] Task 2: Extend state types to include `app_type` (AC: #1, #2, #3, #5)
  - [ ] 2.1: In `src/lib/state.ts`, add `app_type?: 'server' | 'cli' | 'web' | 'agent' | 'generic'` to the `HarnessState` interface as a top-level optional field (alongside `stack`).
  - [ ] 2.2: Update `getDefaultState()` to not include `app_type` (it's set during init after detection).
  - [ ] 2.3: `isValidState()` does not need changes — `app_type` is optional.

- [ ] Task 3: Configure CLI instrumentation (AC: #1)
  - [ ] 3.1: Create a new function `configureCli(projectDir: string): void` in `src/lib/otlp.ts` that configures OTLP for short-lived CLI processes.
  - [ ] 3.2: CLI-specific env vars: Set `OTEL_BSP_SCHEDULE_DELAY=100` (batch span processor delay — flush quickly before process exits), `OTEL_TRACES_SAMPLER=always_on` (capture every CLI invocation), and `OTEL_BLRP_SCHEDULE_DELAY=100` (batch log record processor delay) in the state's OTLP section as `cli_env_vars`.
  - [ ] 3.3: In `configureOtlpEnvVars()`, when `app_type` is `'cli'` (passed via opts or read from state), add the CLI-specific env vars to the state under `otlp.cli_env_vars: Record<string, string>`.
  - [ ] 3.4: Update the Node.js start script patching in `patchNodeStartScript()`: for CLI projects, look for `bin` entries in package.json instead of `start`/`dev` scripts. If `bin` points to a JS file, note the `NODE_OPTIONS` env var needed (same `--require` flag). Do NOT modify the bin script itself — instead store the CLI wrapper guidance in state for the knowledge file.

- [ ] Task 4: Configure web instrumentation (AC: #2)
  - [ ] 4.1: Create a new function `configureWeb(projectDir: string, stack: string | null): void` in `src/lib/otlp.ts` that configures OTLP for browser-side telemetry.
  - [ ] 4.2: For Node.js web projects: add `@opentelemetry/sdk-trace-web` and `@opentelemetry/instrumentation-fetch` to the list of packages to install (in addition to the server-side packages). Store these in a new constant `WEB_OTLP_PACKAGES`.
  - [ ] 4.3: Generate an OTLP web initialization snippet and store it in state under `otlp.web_snippet_path`. The snippet should be a small JS file (`otel-web-init.js`) written to the project that initializes the OTel Web SDK with `FetchInstrumentation` and `XMLHttpRequestInstrumentation`, pointing to the OTel Collector HTTP endpoint.
  - [ ] 4.4: Create a new function `otelCollectorConfigWithCors(): string` in `src/templates/otel-config.ts` that extends the base OTel Collector config with CORS headers on the HTTP receiver:
    ```yaml
    receivers:
      otlp:
        protocols:
          http:
            endpoint: 0.0.0.0:4318
            cors:
              allowed_origins:
                - "http://localhost:*"
                - "http://127.0.0.1:*"
              allowed_headers:
                - "*"
    ```
  - [ ] 4.5: When app_type is `'web'`, use `otelCollectorConfigWithCors()` instead of `otelCollectorConfigTemplate()` when writing the OTel Collector config to the shared stack directory.

- [ ] Task 5: Configure agent/LLM instrumentation (AC: #3)
  - [ ] 5.1: Create a new function `configureAgent(projectDir: string, stack: string | null): void` in `src/lib/otlp.ts` that configures LLM call tracing.
  - [ ] 5.2: For Node.js agent projects: add `traceloop-sdk` (OpenLLMetry) to install packages. Store in a new constant `AGENT_OTLP_PACKAGES_NODE = ['@traceloop/node-server-sdk']`.
  - [ ] 5.3: For Python agent projects: add `traceloop-sdk` to install packages. Store in a new constant `AGENT_OTLP_PACKAGES_PYTHON = ['traceloop-sdk']`.
  - [ ] 5.4: Install the appropriate agent packages using the existing `execFileSync` pattern from `installNodeOtlp()` / `installPythonOtlp()`. Create `installAgentOtlp(projectDir: string, stack: string): OtlpResult`.
  - [ ] 5.5: Store agent instrumentation state: `otlp.agent_sdk: 'traceloop'` in state, so the knowledge file and status command can reference it.

- [ ] Task 6: Configure resource attributes for all app types (AC: #4)
  - [ ] 6.1: In `configureOtlpEnvVars()`, always set `OTEL_SERVICE_NAME` to the project name (already done via `service_name` in state — verify it's used as env var).
  - [ ] 6.2: Add `OTEL_RESOURCE_ATTRIBUTES` to state under `otlp.resource_attributes`. Set `service.instance.id` to `${hostname}-${pid}` pattern. Store the env var template string so it can be interpolated at runtime: `"service.instance.id=$(hostname)-$$"`.
  - [ ] 6.3: Update the OTLP knowledge file (`knowledge/otlp-instrumentation.md`) to document the resource attributes and explain that `service.name` enables per-project query isolation.

- [ ] Task 7: Update `instrumentProject()` to dispatch by app type (AC: #1, #2, #3, #5)
  - [ ] 7.1: In `src/lib/otlp.ts`, update `instrumentProject()` to accept an optional `appType: AppType` parameter.
  - [ ] 7.2: After base instrumentation (existing Node.js/Python package install), dispatch to type-specific configuration:
    - `'cli'` -> call `configureCli(projectDir)`
    - `'web'` -> call `configureWeb(projectDir, stack)`
    - `'agent'` -> call `configureAgent(projectDir, stack)`
    - `'server'` -> no additional config (current behavior)
    - `'generic'` -> no additional config, print info message
  - [ ] 7.3: For `'generic'` app type, print `info('App type: generic (manual OTLP setup may be needed)')` in non-JSON mode.

- [ ] Task 8: Update `src/commands/init.ts` to use app type detection (AC: #1, #2, #3, #5)
  - [ ] 8.1: After stack detection, call `detectAppType(projectDir, stack)` and store result.
  - [ ] 8.2: Set `state.app_type` to the detected app type.
  - [ ] 8.3: Pass `appType` to `instrumentProject()`.
  - [ ] 8.4: Print detected app type: `info('App type: <type>')` in non-JSON mode.
  - [ ] 8.5: Include `app_type` in `InitResult` and JSON output.
  - [ ] 8.6: When app_type is `'web'`, use the CORS-enabled OTel Collector config for shared stack setup. Call `otelCollectorConfigWithCors()` and write to the stack directory before starting. If stack is already running, print `info('Web app detected — verify OTel Collector has CORS enabled')`.

- [ ] Task 9: Update knowledge files (AC: #5)
  - [ ] 9.1: Update `knowledge/otlp-instrumentation.md` to add sections for CLI, Web, and Agent instrumentation patterns.
  - [ ] 9.2: Add CLI section: document `OTEL_BSP_SCHEDULE_DELAY=100`, explain flush-before-exit behavior, show `NODE_OPTIONS` usage for CLI binaries.
  - [ ] 9.3: Add Web section: document `@opentelemetry/sdk-trace-web` setup, explain CORS requirements, show `otel-web-init.js` usage pattern.
  - [ ] 9.4: Add Agent section: document `traceloop-sdk` / OpenLLMetry setup, show how LLM calls appear as spans, explain token usage metrics.
  - [ ] 9.5: Add Generic section: document manual OTLP setup for unsupported stacks, show minimum env var configuration.
  - [ ] 9.6: Add Resource Attributes section: document `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` with `service.instance.id`.

- [ ] Task 10: Update `src/commands/status.ts` for app type display (AC: #1, #2, #3, #5)
  - [ ] 10.1: In `handleFullStatus()`, display the detected app type from state: `info('App type: <type>')`.
  - [ ] 10.2: In `handleFullStatusJson()`, include `app_type` in the JSON output.
  - [ ] 10.3: When app_type is `'agent'`, include `agent_sdk` from state in the status display.

- [ ] Task 11: Write unit tests (AC: #1-#5)
  - [ ] 11.1: Add tests in `src/lib/__tests__/stack-detect.test.ts` for `detectAppType()`:
    - CLI detection: `package.json` with `bin` and no `start` script -> `'cli'`
    - Web detection: `package.json` with `react` dep -> `'web'`
    - Web detection: `index.html` in project root -> `'web'`
    - Agent detection: `package.json` with `openai` dep -> `'agent'`
    - Agent detection: `requirements.txt` with `anthropic` -> `'agent'`
    - Server detection: `package.json` with `start` script, no framework deps -> `'server'`
    - Generic fallback: empty project -> `'generic'`
  - [ ] 11.2: Add tests in `src/lib/__tests__/otlp.test.ts` for app-type-specific configuration:
    - `configureCli()`: verify `cli_env_vars` include `OTEL_BSP_SCHEDULE_DELAY=100`
    - `configureWeb()`: verify web packages are installed
    - `configureAgent()`: verify agent SDK packages are installed
    - `instrumentProject()` with `appType` parameter dispatches correctly
  - [ ] 11.3: Add tests in `src/templates/__tests__/otel-config.test.ts` for `otelCollectorConfigWithCors()`:
    - Verify CORS headers are present in output
    - Verify `allowed_origins` includes `http://localhost:*`
  - [ ] 11.4: Add tests in `src/commands/__tests__/init.test.ts`:
    - Verify `app_type` is set in state after init
    - Verify CLI app type triggers CLI-specific OTLP config
    - Verify web app type triggers CORS-enabled OTel config
    - Verify agent app type triggers agent SDK install
    - Verify generic app type prints info message
  - [ ] 11.5: Add tests in `src/commands/__tests__/status.test.ts`:
    - Verify app type appears in full status output
    - Verify app type appears in JSON status output
  - [ ] 11.6: Update existing tests that mock `detectStack()` to also handle `detectAppType()` where needed.

- [ ] Task 12: Build and verify (AC: #1-#5)
  - [ ] 12.1: Run `npm run build` — verify tsup compiles successfully with all new types and functions.
  - [ ] 12.2: Run `npm run test:unit` — verify all unit tests pass including new app type detection and instrumentation tests.
  - [ ] 12.3: Run `npm run test:coverage` — verify test coverage target is maintained.

## Dev Notes

### Architecture Context

Stories 9.1-9.3 established a shared observability stack, remote backend support, and mandatory observability. The current OTLP instrumentation (`src/lib/otlp.ts`) only handles two cases: Node.js servers (auto-instrumentation via `--require` flag) and Python servers (`opentelemetry-instrument` wrapper). This works for long-running server processes but misses three common project types:

1. **CLI tools** — Short-lived processes that exit before the default batch span processor flushes (5-second delay). Telemetry is lost unless `OTEL_BSP_SCHEDULE_DELAY` is reduced.
2. **Web apps** — Browser-side telemetry needs the OTel Web SDK, and the collector must accept cross-origin requests (CORS).
3. **AI agents** — LLM API calls need specialized instrumentation (OpenLLMetry/Traceloop) to capture token usage, latencies, and prompt/completion metadata.

This story extends `detectStack()` with app type classification and adds type-specific instrumentation paths while keeping the existing server instrumentation intact.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/lib/stack-detect.ts` | Add `AppType` type and `detectAppType()` function |
| `src/lib/state.ts` | Add optional `app_type` field to `HarnessState` |
| `src/lib/otlp.ts` | Add `configureCli()`, `configureWeb()`, `configureAgent()`, update `instrumentProject()` |
| `src/templates/otel-config.ts` | Add `otelCollectorConfigWithCors()` for web app support |
| `src/commands/init.ts` | Call `detectAppType()`, pass to instrumentation, set in state |
| `src/commands/status.ts` | Display `app_type` in status output |
| `knowledge/otlp-instrumentation.md` | Add CLI, Web, Agent, Generic instrumentation sections |

### Existing Code to Leverage

- `src/lib/stack-detect.ts` — `detectStack()` already reads `package.json`, `requirements.txt`, etc. `detectAppType()` builds on the same file-reading pattern but digs deeper into deps.
- `src/lib/otlp.ts` — `installNodeOtlp()` and `installPythonOtlp()` show the pattern for installing OTLP packages. Agent packages follow the same `execFileSync(npm/pip, ['install', ...])` pattern.
- `src/lib/otlp.ts` — `configureOtlpEnvVars()` writes to state. CLI/web/agent config functions follow the same `readStateWithBody()` / `writeState()` pattern.
- `src/templates/otel-config.ts` — `otelCollectorConfigTemplate()` is the base. The CORS variant adds a `cors` block to the HTTP receiver only.
- `src/commands/init.ts` — The instrumentation block (line ~451) calls `instrumentProject()`. This is the insertion point for app type detection and dispatch.

### App Type Detection Priority

When multiple signals are present (e.g., a project has both `bin` and `openai` as a dependency), detection priority is:
1. **Agent** (highest — if LLM deps found, it's an agent regardless of other signals)
2. **Web** (frontend framework or `index.html`)
3. **CLI** (has `bin`, no `start` script)
4. **Server** (has `start` script or typical server entry point)
5. **Generic** (fallback)

This priority ensures that an "AI-powered CLI tool" gets agent instrumentation (which includes CLI flush settings), and a "web dashboard for an AI agent" gets both web and agent instrumentation.

### OTel Collector CORS

The CORS config is only needed on the HTTP receiver (`0.0.0.0:4318`). The gRPC receiver doesn't need CORS because browsers don't use gRPC directly. The `allowed_origins` pattern `http://localhost:*` matches any port, covering `localhost:3000`, `localhost:5173`, etc.

If the shared stack is already running with a non-CORS config and a web project is detected, the story should print a warning rather than restarting the stack (to avoid disrupting other projects). The user can run `codeharness stack stop && codeharness stack start` to pick up the new config.

### CLI Flush-on-Exit

The key insight for CLI instrumentation is `OTEL_BSP_SCHEDULE_DELAY=100` (100ms instead of default 5000ms). This makes the batch span processor flush 50x faster, ensuring spans are exported before a short-lived CLI process exits. Combined with `OTEL_TRACES_SAMPLER=always_on`, every CLI invocation produces a trace (appropriate since CLIs run infrequently compared to servers).

### Agent Instrumentation: OpenLLMetry

OpenLLMetry (by Traceloop) auto-instruments popular LLM libraries:
- Node.js: `@traceloop/node-server-sdk` — wraps `openai`, `anthropic`, `langchain`, etc.
- Python: `traceloop-sdk` — wraps `openai`, `anthropic`, `langchain`, `llama-index`, etc.

It produces standard OTel spans with LLM-specific attributes: `llm.token.usage`, `llm.request.model`, `llm.response.model`, completion latency. These flow through the existing OTel Collector pipeline to VictoriaTraces without any collector-side changes.

### Backward Compatibility

- Existing projects without `app_type` in state default to current behavior (server instrumentation). `app_type` is optional.
- `detectAppType()` is additive — it never changes the result of `detectStack()`.
- The OTel Collector CORS config is a superset of the base config — it only adds the `cors` block, everything else stays the same.

## File List

- src/lib/stack-detect.ts
- src/lib/state.ts
- src/lib/otlp.ts
- src/templates/otel-config.ts
- src/commands/init.ts
- src/commands/status.ts
- knowledge/otlp-instrumentation.md
- src/lib/__tests__/stack-detect.test.ts
- src/lib/__tests__/otlp.test.ts
- src/templates/__tests__/otel-config.test.ts
- src/commands/__tests__/init.test.ts
- src/commands/__tests__/status.test.ts

## Change Log

- 2026-03-15: Story created -- ready for dev.
