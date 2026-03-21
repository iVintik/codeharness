# Infra Module

Project initialization, stack management, and observability infrastructure.

## Files

- `index.ts` — Public API: `initProject(opts)` (delegates to init-project.ts), `ensureStack()` (delegates to stack-management.ts), `cleanupContainers()` (delegates to container-cleanup.ts), `getObservabilityBackend()` (delegates to observability.ts factory, returns `VictoriaBackend` by default). Re-exports doc helpers and stack management types for backward compatibility.
- `init-project.ts` — Orchestrator: `initProject(opts: InitOptions): Promise<Result<InitResult>>` — composes full init workflow: idempotent re-run check, URL validation, stack detection, dependency installation, beads init, BMAD setup, state file creation, documentation scaffold, OTLP instrumentation, Docker setup. Handles critical vs non-critical failures. Never throws.
- `docker-setup.ts` — Docker/observability setup: `setupDocker(opts, stack)` — handles 4 modes: local-shared, remote-direct, remote-routed, no-observability. Also exports `handleLocalShared`, `handleRemoteDirect`, `handleRemoteRouted`, `handleCollectorOnly`. Returns `Result<InitDockerResult | null>`.
- `bmad-setup.ts` — BMAD installation: `setupBmad(projectDir, json?)` — detects BMAD version, installs if missing, applies patches, detects bmalph. Returns `Result<InitBmadResult>`. Never throws.
- `deps-install.ts` — Dependency installation: `installDeps(projectDir, stack, json?)` — installs project dependencies based on detected stack. Returns `Result<DependencyResult[]>`. Never throws.
- `docs-scaffold.ts` — Documentation generation: `scaffoldDocs(projectDir, stack, enforcement, json?)` — creates AGENTS.md, docs/ scaffold, README.md. Also exports helpers: `generateAgentsMdContent`, `generateDocsIndexContent`, `getProjectName`, `getStackLabel`, `getCoverageTool`. Returns `Promise<Result<InitDocumentationResult>>`.
- `beads-init.ts` — Beads initialization: `initBeads(projectDir, json?)` — initializes beads hooks and configuration. Returns `Result<InitBeadsResult>`. Never throws.
- `stack-management.ts` — Stack lifecycle: `ensureStack(): Promise<Result<StackStatus>>` — orchestrates shared observability stack startup with port conflict detection and running stack reuse. Also exports `detectPortConflicts(ports)` and `detectRunningStack()`. Returns `Result<T>`, never throws.
- `container-cleanup.ts` — Container cleanup: `cleanupContainers(): Result<CleanupResult>` — removes stale Docker containers matching `codeharness-shared-*` or `codeharness-collector-*` patterns. Handles Docker-not-available gracefully (returns ok with 0 removed). Never throws.
- `victoria-backend.ts` — `VictoriaBackend` class implementing `ObservabilityBackend` interface. Queries Victoria Logs (`/select/logsql/query`), Victoria Metrics (`/api/v1/query_range`), and Jaeger (`/api/traces`) via HTTP. Health check probes all three services in parallel. All methods return `Result<T>`, never throw. Uses Node.js built-in `fetch` with `AbortSignal.timeout`. Constructor accepts optional `VictoriaConfig` for custom service URLs.
- `opensearch-backend.ts` — `OpenSearchBackend` class implementing `ObservabilityBackend` interface. Queries OpenSearch/Elasticsearch-compatible APIs via HTTP POST to `<url>/<index>/_search` for logs, metrics (date_histogram aggregation), and traces. Health check probes `/_cluster/health`. All methods return `Result<T>`, never throw. Uses Node.js built-in `fetch` with `AbortSignal.timeout`. Constructor accepts `OpenSearchConfig` with URL and optional custom index names (defaults: `otel-logs-*`, `otel-metrics-*`, `otel-traces-*`).
- `dockerfile-validator.ts` — Dockerfile validation: `validateDockerfile(projectDir): Result<DockerfileValidationResult>` — checks Dockerfiles against 6 rule categories (pinned FROM, binary on PATH, verification tools, no source copy, non-root USER, cache cleanup). Also exports `loadRules(projectDir)` which reads `patches/infra/dockerfile-rules.md` or falls back to hardcoded defaults with a warning. Returns structured `DockerfileGap` results for audit integration. Never throws.
- `dockerfile-template.ts` — Dockerfile template generation: `generateDockerfileTemplate(projectDir, stack): Result<DockerfileTemplateResult>` — generates stack-appropriate Dockerfiles (nodejs, python, generic) that pass all 6 validateDockerfile() rule categories. Returns `fail('Dockerfile already exists')` when Dockerfile is present. Called by init-project.ts during project initialization. Never throws.
- `observability.ts` — Backend factory: `createObservabilityBackend(config?)` returns `OpenSearchBackend` when `opensearchUrl` is provided, `VictoriaBackend` otherwise. Accepts optional index config for OpenSearch and URL config for Victoria.
- `types.ts` — Module types: `InitOptions`, `InitResult`, `InitDockerResult`, `InitBmadResult`, `InitBeadsResult`, `InitDocumentationResult`, `StackStatus`, `StackDetectionResult`, `PortConflictResult`, `CleanupResult`, `DEFAULT_PORTS`.

## Patterns

- All public functions return `Result<T>` (never throw)
- ES module imports with `.js` extensions
- Orchestrator pattern: `init-project.ts` composes sub-modules
- Non-critical failures (beads, BMAD) don't halt the workflow
- Critical failures (Docker required but unavailable) return `fail()`
- Module boundary: only `index.ts` is imported externally
