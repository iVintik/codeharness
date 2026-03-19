# Story 7.1: ObservabilityBackend Interface & Victoria Implementation

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the ObservabilityBackend interface implemented with VictoriaMetrics as the default backend,
so that existing observability behavior is preserved and verification can query logs, metrics, and traces through a typed, backend-agnostic API.

## Acceptance Criteria

1. **Given** no OpenSearch configuration in sprint state or init options, **When** `getObservabilityBackend()` is called from `src/modules/infra/index.ts`, **Then** it returns a `VictoriaBackend` instance with `type: 'victoria'`. <!-- verification: cli-verifiable -->
2. **Given** a `VictoriaBackend` instance, **When** `queryLogs(params)` is called with a `LogQuery`, **Then** it sends an HTTP request to Victoria Logs at `http://localhost:9428/select/logsql/query` with the query string and time range, and returns `Result<LogResult>` with parsed log entries. <!-- verification: integration-required -->
3. **Given** a `VictoriaBackend` instance, **When** `queryMetrics(params)` is called with a `MetricQuery`, **Then** it sends an HTTP request to Victoria Metrics at `http://localhost:8428/api/v1/query_range` with PromQL query, start, end, and step, and returns `Result<MetricResult>` with parsed time series data. <!-- verification: integration-required -->
4. **Given** a `VictoriaBackend` instance, **When** `queryTraces(params)` is called with a `TraceQuery`, **Then** it sends an HTTP request to Jaeger at `http://localhost:16686/api/traces` with service name, operation, and time range, and returns `Result<TraceResult>` with parsed spans. <!-- verification: integration-required -->
5. **Given** a `VictoriaBackend` instance, **When** `healthCheck()` is called, **Then** it checks all three services (victoria-logs :9428, victoria-metrics :8428, jaeger :16686) and returns `Result<HealthStatus>` with `healthy: true` only if all respond, and `latencyMs` reflecting the slowest service. <!-- verification: integration-required -->
6. **Given** any query method on `VictoriaBackend` fails (network error, timeout, non-2xx response), **When** the error is caught, **Then** it returns `fail(errorMessage, { endpoint, statusCode? })` — never throws. <!-- verification: cli-verifiable -->
7. **Given** `src/modules/infra/observability.ts` exists as a backend factory, **When** `createObservabilityBackend(config)` is called with no opensearch URL, **Then** it returns a `VictoriaBackend`. When called with an opensearch URL, it returns a stub that returns `fail('not implemented')` (story 7-2 scope). <!-- verification: cli-verifiable -->
8. **Given** the `getObservabilityBackend()` function in `src/modules/infra/index.ts`, **When** called, **Then** it delegates to `createObservabilityBackend()` from `observability.ts` instead of throwing `'not implemented'`. <!-- verification: cli-verifiable -->
9. **Given** `src/modules/infra/victoria-backend.ts` exists, **When** reviewed, **Then** it does not exceed 300 lines (NFR18) and implements all four methods of the `ObservabilityBackend` interface. <!-- verification: cli-verifiable -->
10. **Given** all new code in `victoria-backend.ts` and `observability.ts`, **When** unit tests run, **Then** 100% coverage is achieved on new/changed code, with HTTP calls mocked via `vi.mock` or equivalent. <!-- verification: cli-verifiable -->
11. **Given** `VictoriaBackend` is constructed, **When** base URLs are provided via constructor config, **Then** each service URL is configurable (defaults: `http://localhost:9428`, `http://localhost:8428`, `http://localhost:16686`) so tests and non-default deployments can override endpoints. <!-- verification: cli-verifiable -->
12. **Given** the `ObservabilityBackend` interface in `src/types/observability.ts`, **When** reviewed, **Then** it remains unchanged — the Victoria implementation conforms to the existing interface with no modifications needed. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Create `src/modules/infra/victoria-backend.ts` (AC: #1, #2, #3, #4, #5, #6, #9, #11)
  - [x] Implement `VictoriaBackend` class implementing `ObservabilityBackend`
  - [x] Constructor accepts optional `VictoriaConfig` with `logsUrl`, `metricsUrl`, `tracesUrl` defaults
  - [x] Implement `queryLogs()` — HTTP GET to Victoria Logs `/select/logsql/query`
  - [x] Implement `queryMetrics()` — HTTP GET to Victoria Metrics `/api/v1/query_range`
  - [x] Implement `queryTraces()` — HTTP GET to Jaeger `/api/traces`
  - [x] Implement `healthCheck()` — parallel health probes to all three services
  - [x] All methods return `Result<T>`, catch all errors, never throw
  - [x] Use Node.js built-in `fetch` (no external HTTP dependencies)
- [x] Task 2: Create `src/modules/infra/observability.ts` backend factory (AC: #7)
  - [x] Export `createObservabilityBackend(config?)` factory function
  - [x] Return `VictoriaBackend` when no opensearch URL configured
  - [x] Return stub backend with `fail('not implemented')` for opensearch (story 7-2)
- [x] Task 3: Wire `getObservabilityBackend()` in `src/modules/infra/index.ts` (AC: #8)
  - [x] Replace `throw new Error('not implemented')` with delegation to `createObservabilityBackend()`
  - [x] Import and re-export relevant types
- [x] Task 4: Create `src/modules/infra/__tests__/victoria-backend.test.ts` (AC: #10)
  - [x] Mock `fetch` globally for all HTTP tests
  - [x] Test `queryLogs()` — request URL construction, response parsing, error handling
  - [x] Test `queryMetrics()` — PromQL query encoding, time range, step parameter
  - [x] Test `queryTraces()` — Jaeger API format, span parsing
  - [x] Test `healthCheck()` — all healthy, partial failure, total failure
  - [x] Test network error handling (fetch throws)
  - [x] Test non-2xx response handling
  - [x] Test custom URL configuration
- [x] Task 5: Create `src/modules/infra/__tests__/observability.test.ts` (AC: #7, #10)
  - [x] Test factory returns VictoriaBackend by default
  - [x] Test factory returns stub for opensearch config
- [x] Task 6: Verify existing `src/types/observability.ts` needs no changes (AC: #12)
- [x] Task 7: Run `npm run build` — verify no compilation errors
- [x] Task 8: Run `npm test` — verify all tests pass, no regressions
- [x] Task 9: Verify no file exceeds 300 lines (NFR18)

## Dev Notes

### Architecture Constraints

- **Result<T> pattern** — every public function returns `Result<T>`, never throws. Import `ok`, `fail` from `../../types/result.js`. [Source: architecture-overhaul.md#Decision 1]
- **ObservabilityBackend interface** — already defined in `src/types/observability.ts`. Do NOT modify it. Implement it as-is. [Source: architecture-overhaul.md#Decision 4]
- **Module boundary** — only `index.ts` is the public interface. Internal files (`victoria-backend.ts`, `observability.ts`) are private to infra module. [Source: architecture-overhaul.md#Decision 3]
- **ES modules** — all imports use `.js` extension.
- **Strict TypeScript** — `strict: true`, no `any` types (NFR19).
- **File size limit** — no file exceeds 300 lines (NFR18).
- **100% test coverage** on new code (NFR14).
- **No external HTTP libraries** — use Node.js built-in `fetch` (available since Node 18+).

### Existing Code to Reuse

- **`src/types/observability.ts`** — The interface, query types (`LogQuery`, `MetricQuery`, `TraceQuery`), and result types (`LogResult`, `MetricResult`, `TraceResult`, `HealthStatus`) are already fully defined. Do NOT recreate or duplicate them.
- **`src/types/result.ts`** — `ok()`, `fail()`, `isOk()`, `isFail()` — use these, do not reinvent.
- **`src/modules/infra/index.ts`** — Already has `getObservabilityBackend()` stub that throws. Replace the throw with the factory call.
- **`src/modules/infra/types.ts`** — `DEFAULT_PORTS` constant has the port numbers: logs=9428, metrics=8428, traces=16686.

### Victoria Stack Endpoints (from Docker Compose)

The shared Docker stack runs three Victoria-compatible services:

| Service | Image | Port | Query API |
|---------|-------|------|-----------|
| victoria-logs | `victoriametrics/victoria-logs:v1.15.0-victorialogs` | 9428 | `GET /select/logsql/query?query=...&start=...&end=...` |
| victoria-metrics | `victoriametrics/victoria-metrics:v1.106.1` | 8428 | `GET /api/v1/query_range?query=...&start=...&end=...&step=...` |
| victoria-traces (Jaeger) | `jaegertracing/all-in-one:1.56` | 16686 | `GET /api/traces?service=...&operation=...&start=...&end=...` |

**Victoria Logs query API:** LogsQL syntax. Endpoint: `/select/logsql/query`. Params: `query` (LogsQL string), `start` (RFC3339 or Unix timestamp), `end` (RFC3339 or Unix timestamp), `limit` (max entries).

**Victoria Metrics query API:** PromQL-compatible. Endpoint: `/api/v1/query_range`. Params: `query` (PromQL string), `start` (Unix timestamp), `end` (Unix timestamp), `step` (duration like `60s`). Response follows Prometheus API format.

**Jaeger trace API:** REST. Endpoint: `/api/traces`. Params: `service` (service name), `operation` (optional), `start` (microseconds since epoch), `end` (microseconds since epoch), `limit` (max traces).

### VictoriaBackend Constructor Pattern

```typescript
export interface VictoriaConfig {
  logsUrl?: string;    // default: http://localhost:9428
  metricsUrl?: string; // default: http://localhost:8428
  tracesUrl?: string;  // default: http://localhost:16686
}

export class VictoriaBackend implements ObservabilityBackend {
  readonly type = 'victoria' as const;
  private readonly logsUrl: string;
  private readonly metricsUrl: string;
  private readonly tracesUrl: string;

  constructor(config?: VictoriaConfig) { ... }
}
```

### File Placement

Per architecture-overhaul.md project tree:

- `src/modules/infra/victoria-backend.ts` — VictoriaBackend class
- `src/modules/infra/observability.ts` — backend factory
- `src/modules/infra/__tests__/victoria-backend.test.ts` — unit tests
- `src/modules/infra/__tests__/observability.test.ts` — factory tests

Do NOT create `src/modules/infra/opensearch-backend.ts` — that is story 7-2 scope.

### What This Unblocks

- **Story 7-2** (OpenSearch Implementation) — will add `OpenSearchBackend` implementing the same interface
- **Verification module** (FR15) — `verify/` can query observability via the backend interface
- **Status reporting** — future stories can show observability health in `codeharness status`

### Previous Story Intelligence

Story 6-3 (non-interactive BMAD install) established patterns for this module:
- Module wrapper functions in infra that delegate to internal implementations
- Result<T> pattern for all return values — `ok()` for success, `fail()` for errors, never throw
- Comprehensive mocked unit tests in `__tests__/` directory
- Integration with `initProject()` orchestrator
- JSON mode awareness (though less relevant for this story)

Recent commits show the dev/review/verify module extraction patterns are well-established. The infra module already has the index.ts re-export pattern in place.

### Project Structure Notes

- All new files go in `src/modules/infra/` — consistent with architecture-overhaul.md project tree
- No changes needed to `src/types/` — the interface is already defined
- The `getObservabilityBackend()` in `index.ts` is the only existing code that changes (stub replacement)
- No changes to CLI commands — this is internal module work

### References

- [Source: _bmad-output/planning-artifacts/architecture-overhaul.md#Decision 4 — ObservabilityBackend interface]
- [Source: _bmad-output/planning-artifacts/epics-overhaul.md#Story 7.1]
- [Source: src/types/observability.ts — interface and all query/result types]
- [Source: src/modules/infra/index.ts — getObservabilityBackend() stub]
- [Source: src/modules/infra/types.ts — DEFAULT_PORTS]
- [Source: src/templates/docker-compose.ts — Victoria service definitions and ports]
- [Source: src/templates/otel-config.ts — OTEL collector endpoints for Victoria]

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/7-1-observability-backend-interface-victoria-implementation.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100%)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (list modules touched)
- [ ] Exec-plan created in `docs/exec-plans/active/7-1-observability-backend-interface-victoria-implementation.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Integration tests for cross-module interactions
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

N/A

### Completion Notes List

- VictoriaBackend implements all 4 ObservabilityBackend methods (queryLogs, queryMetrics, queryTraces, healthCheck)
- All methods return Result<T>, never throw — network errors and non-2xx responses caught and returned as fail()
- Uses Node.js built-in fetch, zero external HTTP dependencies
- Victoria Logs: newline-delimited JSON parsing with flexible field name mapping
- Victoria Metrics: Prometheus-compatible query_range API with PromQL
- Jaeger traces: REST API with CHILD_OF reference parsing for parent spans
- Health check runs all 3 probes in parallel via Promise.allSettled
- Factory returns VictoriaBackend by default, opensearch stub for story 7-2
- 100% coverage (statements, branches, functions, lines) on all new code
- victoria-backend.ts: 261 lines (under 300 NFR18 limit)
- observability.ts: 39 lines
- 2168 total tests passing, zero regressions
- src/types/observability.ts unchanged (AC#12 verified)

### File List

- src/modules/infra/victoria-backend.ts (new — VictoriaBackend class)
- src/modules/infra/observability.ts (new — backend factory)
- src/modules/infra/index.ts (modified — wired getObservabilityBackend)
- src/modules/infra/__tests__/victoria-backend.test.ts (new — 49 tests)
- src/modules/infra/__tests__/observability.test.ts (new — 5 tests)
- src/modules/infra/__tests__/index.test.ts (modified — updated test for AC#8)
