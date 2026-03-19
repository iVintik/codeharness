# Story 7.2: OpenSearch Implementation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want `--opensearch-url` to configure OpenSearch as the observability backend,
so that I can use a remote OpenSearch cluster for logs, metrics, and traces without running a local Docker observability stack.

## Acceptance Criteria

1. **Given** `--opensearch-url https://opensearch.example.com:9200` is passed to `codeharness init`, **When** init completes, **Then** the sprint state records `opensearch` as the observability backend type and stores the URL for later use by `getObservabilityBackend()`. <!-- verification: cli-verifiable -->
2. **Given** an `OpenSearchBackend` instance, **When** `queryLogs(params)` is called with a `LogQuery`, **Then** it sends an HTTP POST to `<opensearchUrl>/<index>/_search` with an Elasticsearch-compatible query body containing the query string, time range filter, and limit, and returns `Result<LogResult>` with parsed log entries. <!-- verification: integration-required -->
3. **Given** an `OpenSearchBackend` instance, **When** `queryMetrics(params)` is called with a `MetricQuery`, **Then** it sends an HTTP POST to `<opensearchUrl>/<index>/_search` with a date histogram aggregation over the time range and returns `Result<MetricResult>` with parsed time series data. <!-- verification: integration-required -->
4. **Given** an `OpenSearchBackend` instance, **When** `queryTraces(params)` is called with a `TraceQuery`, **Then** it sends an HTTP POST to `<opensearchUrl>/<index>/_search` with service name, operation, and time range filters, and returns `Result<TraceResult>` with parsed trace spans. <!-- verification: integration-required -->
5. **Given** an `OpenSearchBackend` instance, **When** `healthCheck()` is called, **Then** it sends a GET request to `<opensearchUrl>/_cluster/health` and returns `Result<HealthStatus>` with `healthy: true` when cluster status is `green` or `yellow`, and `healthy: false` when `red` or unreachable, including `latencyMs`. <!-- verification: integration-required -->
6. **Given** any query method on `OpenSearchBackend` fails (network error, timeout, non-2xx response, malformed JSON), **When** the error is caught, **Then** it returns `fail(errorMessage, { endpoint, statusCode? })` -- never throws. <!-- verification: cli-verifiable -->
7. **Given** `createObservabilityBackend(config)` in `observability.ts` is called with an `opensearchUrl`, **When** the factory executes, **Then** it returns an `OpenSearchBackend` instance (replacing the current stub) with `type: 'opensearch'`. <!-- verification: cli-verifiable -->
8. **Given** OpenSearch is configured as the backend, **When** the verifier runs observability queries during story verification, **Then** the proof document shows OpenSearch `_search` API queries as evidence instead of Victoria endpoints. <!-- verification: integration-required -->
9. **Given** OpenSearch is configured via `--opensearch-url`, **When** `codeharness init` runs, **Then** no local Docker observability stack is started (no Victoria Logs, Victoria Metrics, or Jaeger containers). <!-- verification: cli-verifiable -->
10. **Given** `src/modules/infra/opensearch-backend.ts` exists, **When** reviewed, **Then** it does not exceed 300 lines (NFR18) and implements all four methods of the `ObservabilityBackend` interface. <!-- verification: cli-verifiable -->
11. **Given** all new code in `opensearch-backend.ts` and updated `observability.ts`, **When** unit tests run, **Then** 100% coverage is achieved on new/changed code, with HTTP calls mocked via `vi.mock` or equivalent. <!-- verification: cli-verifiable -->
12. **Given** the `ObservabilityBackend` interface in `src/types/observability.ts`, **When** reviewed, **Then** it remains unchanged -- the OpenSearch implementation conforms to the existing interface with no modifications needed. <!-- verification: cli-verifiable -->
13. **Given** `OpenSearchBackend` is constructed, **When** the base URL and optional index names are provided via constructor config, **Then** each is configurable (defaults: base URL from `opensearchUrl`, log index `otel-logs-*`, metric index `otel-metrics-*`, trace index `otel-traces-*`) so tests and custom deployments can override. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/infra/opensearch-backend.ts` (AC: #2, #3, #4, #5, #6, #10, #13)
  - [x]Implement `OpenSearchBackend` class implementing `ObservabilityBackend`
  - [x]Constructor accepts `OpenSearchConfig` with `url`, `logsIndex?`, `metricsIndex?`, `tracesIndex?`
  - [x]Implement `queryLogs()` -- HTTP POST to `<url>/<logsIndex>/_search` with query_string + range filter
  - [x]Implement `queryMetrics()` -- HTTP POST to `<url>/<metricsIndex>/_search` with date_histogram aggregation
  - [x]Implement `queryTraces()` -- HTTP POST to `<url>/<tracesIndex>/_search` with service/operation filters
  - [x]Implement `healthCheck()` -- HTTP GET to `<url>/_cluster/health`, green/yellow = healthy
  - [x]All methods return `Result<T>`, catch all errors, never throw
  - [x]Use Node.js built-in `fetch` (no external HTTP dependencies)
- [x] Task 2: Update `src/modules/infra/observability.ts` factory (AC: #7)
  - [x]Replace `createOpenSearchStub()` with `new OpenSearchBackend(config)` instantiation
  - [x]Import `OpenSearchBackend` from `./opensearch-backend.js`
  - [x]Pass `opensearchUrl` and any index config through to constructor
- [x] Task 3: Wire `--opensearch-url` through init pipeline (AC: #1, #9)
  - [x]Add `opensearchUrl` option to `InitOptions` in `types.ts`
  - [x]Update `init-project.ts` to skip Docker stack when `opensearchUrl` is provided
  - [x]Store backend type and URL in harness state file
  - [x]Ensure `getObservabilityBackend()` in `index.ts` reads config from state
- [x] Task 4: Update CLI command registration (AC: #1)
  - [x]Add `--opensearch-url <url>` option to the `init` command in `src/commands/init.ts`
  - [x]Pass value through to `initProject(opts)`
- [x] Task 5: Create `src/modules/infra/__tests__/opensearch-backend.test.ts` (AC: #11)
  - [x]Mock `fetch` globally for all HTTP tests
  - [x]Test `queryLogs()` -- request URL and body construction, response parsing, error handling
  - [x]Test `queryMetrics()` -- aggregation query construction, time range, step mapping
  - [x]Test `queryTraces()` -- service/operation filters, span parsing from hits
  - [x]Test `healthCheck()` -- green/yellow (healthy), red (unhealthy), unreachable
  - [x]Test network error handling (fetch throws)
  - [x]Test non-2xx response handling
  - [x]Test custom index name configuration
- [x] Task 6: Update `src/modules/infra/__tests__/observability.test.ts` (AC: #7, #11)
  - [x]Replace stub tests with `OpenSearchBackend` instance tests
  - [x]Verify factory returns `OpenSearchBackend` when opensearch URL provided
- [x] Task 7: Verify `src/types/observability.ts` needs no changes (AC: #12)
- [x] Task 8: Run `npm run build` -- verify no compilation errors
- [x] Task 9: Run `npm test` -- verify all tests pass, no regressions
- [x] Task 10: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** -- every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ObservabilityBackend interface** -- already defined in `src/types/observability.ts`. Do NOT modify it. Implement it as-is. [Source: architecture-overhaul.md#Decision 4]
- **Module boundary** -- only `index.ts` is the public interface. Internal files (`opensearch-backend.ts`, `observability.ts`) are private to infra module. [Source: architecture-overhaul.md#Decision 3]
- **ES modules** -- all imports use `.js` extension.
- **Strict TypeScript** -- `strict: true`, no `any` types (NFR19).
- **File size limit** -- no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **No external HTTP libraries** -- use Node.js built-in `fetch` (available since Node 18+).

### Existing Code to Reuse

- **`src/types/observability.ts`** -- The interface, query types (`LogQuery`, `MetricQuery`, `TraceQuery`), and result types (`LogResult`, `MetricResult`, `TraceResult`, `HealthStatus`) are already fully defined. Do NOT recreate or duplicate them.
- **`src/types/result.ts`** -- `ok()`, `fail()`, `isOk()`, `isFail()` -- use these, do not reinvent.
- **`src/modules/infra/observability.ts`** -- The factory currently returns a stub for opensearch. Replace the stub with real `OpenSearchBackend` instantiation.
- **`src/modules/infra/victoria-backend.ts`** -- Reference implementation. Follow the same patterns: constructor with config, timeout constants, error handling, response parsing helpers.
- **`src/modules/infra/types.ts`** -- `InitOptions` will need `opensearchUrl?: string` added.
- **`src/modules/infra/init-project.ts`** -- Orchestrator that calls Docker setup. Needs conditional skip when opensearch URL is configured.

### OpenSearch API Endpoints

The OpenSearch implementation targets standard OpenSearch/Elasticsearch-compatible APIs:

| Operation | Method | Endpoint | Body |
|-----------|--------|----------|------|
| Log query | POST | `/<logsIndex>/_search` | `{ query: { bool: { must: [query_string, range] } }, size: limit }` |
| Metric query | POST | `/<metricsIndex>/_search` | `{ query: { bool: { must: [query_string, range] } }, aggs: { date_histogram } }` |
| Trace query | POST | `/<tracesIndex>/_search` | `{ query: { bool: { must: [term(service), term(operation), range] } }, size: limit }` |
| Health check | GET | `/_cluster/health` | none |

**Default index patterns:** `otel-logs-*`, `otel-metrics-*`, `otel-traces-*` (matching OpenTelemetry Collector's default OpenSearch exporter index naming).

### OpenSearchBackend Constructor Pattern

```typescript
export interface OpenSearchConfig {
  url: string;             // e.g., 'https://opensearch.example.com:9200'
  logsIndex?: string;      // default: 'otel-logs-*'
  metricsIndex?: string;   // default: 'otel-metrics-*'
  tracesIndex?: string;    // default: 'otel-traces-*'
}

export class OpenSearchBackend implements ObservabilityBackend {
  readonly type = 'opensearch' as const;
  private readonly url: string;
  private readonly logsIndex: string;
  private readonly metricsIndex: string;
  private readonly tracesIndex: string;

  constructor(config: OpenSearchConfig) { ... }
}
```

### Docker Skip Logic (AC #9)

When `opensearchUrl` is provided to `initProject()`, the Docker setup step should be skipped entirely. The operator is using a remote observability backend, so no local Victoria/Jaeger containers are needed. The init flow should:
1. Skip `setupDocker()` call
2. Still run BMAD, beads, deps, docs, state, OTLP steps
3. Store `opensearchUrl` in the state file so `getObservabilityBackend()` can read it later
4. Report in the init result that Docker was skipped due to remote backend

### File Placement

Per architecture-overhaul.md project tree:

- `src/modules/infra/opensearch-backend.ts` -- OpenSearchBackend class (NEW)
- `src/modules/infra/observability.ts` -- update factory (MODIFY)
- `src/modules/infra/types.ts` -- add `opensearchUrl` to `InitOptions` (MODIFY)
- `src/modules/infra/init-project.ts` -- skip Docker when opensearch configured (MODIFY)
- `src/modules/infra/index.ts` -- update `getObservabilityBackend()` to pass config (MODIFY)
- `src/commands/init.ts` -- add `--opensearch-url` CLI option (MODIFY)
- `src/modules/infra/__tests__/opensearch-backend.test.ts` -- unit tests (NEW)
- `src/modules/infra/__tests__/observability.test.ts` -- update factory tests (MODIFY)

### What This Unblocks

- **FR3** (OpenSearch backend configuration) -- fully satisfied
- **FR32** (OpenSearch log/metric/trace queries) -- fully satisfied
- **Verification module** (FR15) -- verify/ can now query either backend transparently
- **Remote observability** -- operators can use managed OpenSearch without Docker

### Previous Story Intelligence

Story 7-1 (ObservabilityBackend Interface & Victoria Implementation) established:
- `ObservabilityBackend` interface in `src/types/observability.ts` (unchanged)
- `VictoriaBackend` as the reference implementation pattern (constructor, config, error handling)
- Backend factory in `observability.ts` with the opensearch stub to replace
- `getObservabilityBackend()` in `index.ts` delegating to the factory
- Test patterns with mocked `fetch` in `victoria-backend.test.ts`

The OpenSearch implementation should mirror the Victoria patterns exactly: same constructor config style, same timeout constants, same error message format in `fail()` calls, same test structure.

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 4 -- ObservabilityBackend interface]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 7.2]
- [Source: src/types/observability.ts -- interface and all query/result types]
- [Source: src/modules/infra/observability.ts -- current factory with opensearch stub]
- [Source: src/modules/infra/victoria-backend.ts -- reference implementation]
- [Source: src/modules/infra/types.ts -- InitOptions, DEFAULT_PORTS]
- [Source: _bmad-output/implementation-artifacts/7-1-observability-backend-interface-victoria-implementation.md -- predecessor story]
