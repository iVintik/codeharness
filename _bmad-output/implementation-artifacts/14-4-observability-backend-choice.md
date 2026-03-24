# Story 14-4: Observability Backend Choice (Victoria vs ELK vs Remote)

## Status: backlog

## Story

As a developer initializing codeharness,
I want to choose my observability backend and provide remote endpoints,
So that I'm not locked into VictoriaMetrics with hardcoded ports.

## Acceptance Criteria

- [ ] AC1: Given `codeharness init --observability-backend elk`, when init runs, then state stores `otlp.backend: 'elk'` and ELK compose is used <!-- verification: cli-verifiable -->
- [ ] AC2: Given `codeharness init --otel-endpoint https://remote:4318 --logs-url https://remote:9200`, when init runs, then no local Docker stack is started and state stores remote endpoints <!-- verification: cli-verifiable -->
- [ ] AC3: Given `otlp.backend` is `'elk'`, when `codeharness status --check-docker` runs, then it checks ELK containers (not Victoria) <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 5 (Observability Backend Choice).** Currently VictoriaMetrics is hardcoded everywhere with hardcoded ports.

### State Schema

Add to `codeharness.local.md` YAML frontmatter (managed by `src/lib/state.ts`):

```typescript
interface OtlpConfig {
  enabled: boolean;
  backend: 'victoria' | 'elk' | 'none';
  mode: 'local-shared' | 'remote';
  endpoints: {
    otel: string;     // OTLP collector (default: http://localhost:4318)
    logs: string;     // Log query API (Victoria: :9428, ELK: :9200)
    metrics: string;  // Metric query API (Victoria: :8428, ELK: :9200)
    traces: string;   // Trace query API (Victoria: :16686)
  };
  service_name: string;
}
```

### ObservabilityBackend Interface

From architecture-v3.md:
```typescript
interface ObservabilityBackend {
  buildLogQuery(service: string, timeRange: string): string;
  buildMetricQuery(service: string, metric: string): string;
  buildTraceQuery(service: string, limit: number): string;
  getComposeFile(): string;
  getHealthCheck(): HealthCheckResult;
}
```

Two implementations: `VictoriaBackend` (existing, extract from current code) and `ElkBackend` (new). These live in `src/lib/observability/backends.ts` (after Epic 12) or `src/modules/infra/` for now.

Existing implementations: `src/modules/infra/victoria-backend.ts` and `src/modules/infra/opensearch-backend.ts` already exist. Refactor to implement the unified `ObservabilityBackend` interface.

### Init Flow Changes

Modify `src/commands/init.ts` and `src/modules/infra/init-project.ts`:
- Add `--observability-backend <victoria|elk|none>` CLI option
- Add `--otel-endpoint`, `--logs-url`, `--metrics-url`, `--traces-url` for remote mode
- If remote endpoints provided, set `mode: 'remote'`, skip Docker compose
- Store selection in state

### Docker Health Dispatch

Modify `src/commands/status.ts` (or `src/modules/status/` after Epic 12) to dispatch health checks based on `state.otlp.backend`:
- `victoria` -> check VictoriaMetrics containers
- `elk` -> check Elasticsearch + Kibana containers
- `none` -> skip Docker checks
- Remote mode -> ping endpoints instead of checking containers

### Compose Templates

`templates/compose/victoria.yml` and `templates/compose/elk.yml` should be selected based on backend choice. Currently only Victoria compose exists.

## Files to Change

- `src/lib/state.ts` — Update `OtlpConfig` type to include `backend`, `mode`, `endpoints` fields
- `src/types/state.ts` — Add `ObservabilityBackend` interface type
- `src/modules/infra/victoria-backend.ts` — Refactor to implement `ObservabilityBackend` interface
- `src/modules/infra/opensearch-backend.ts` — Refactor to implement `ObservabilityBackend` interface as ELK backend
- `src/commands/init.ts` — Add `--observability-backend`, `--otel-endpoint`, `--logs-url` options
- `src/modules/infra/init-project.ts` — Handle backend selection and remote endpoint storage
- `src/modules/infra/docker-setup.ts` — Select compose file based on backend choice
- `src/commands/status.ts` — Dispatch Docker health checks based on `state.otlp.backend`
- `templates/compose/elk.yml` — Create. ELK stack Docker Compose configuration
