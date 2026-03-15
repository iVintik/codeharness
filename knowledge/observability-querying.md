---
description: How to query VictoriaLogs (LogQL), VictoriaMetrics (PromQL), and VictoriaTraces (Jaeger API) during development. Used when debugging or verifying runtime behavior.
---

# Observability Querying

## Endpoint Resolution

Check current endpoints: `codeharness state get otlp.endpoint` and `codeharness state get docker.remote_endpoints`.
If remote endpoints are configured, replace `localhost:<port>` URLs below with the remote URLs from state.

The resolved endpoints depend on the configured OTLP mode (`codeharness state get otlp.mode`):
- **local-shared**: All endpoints are `localhost` (default)
- **remote-direct**: All telemetry goes to the remote OTLP endpoint directly
- **remote-routed**: Local OTel Collector at `localhost:4318`, backends are remote

Use `codeharness status --json` to see the full resolved `endpoints` and `scoped_endpoints` objects.

## Service-Scoped Queries

All queries should include a `service.name` filter to isolate per-project data. Each project has a unique service name set during `codeharness init`.

Get the current project's service name:
```bash
codeharness state get otlp.service_name
```

The `codeharness query` command automatically applies service name filtering:
```bash
# Query logs with automatic service_name scoping
codeharness query logs "level:error"

# Query metrics with automatic service_name injection
codeharness query metrics "http_requests_total"

# Query traces for the current project
codeharness query traces
```

Pre-built scoped URLs are available via `codeharness status --json` in the `scoped_endpoints` field.

In all examples below, replace `<PROJECT>` with the output of `codeharness state get otlp.service_name`.

## Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| victoria-logs | 9428 | Log queries (LogQL) |
| victoria-metrics | 8428 | Metric queries (PromQL) |
| victoria-traces (Jaeger) | 16686 | Trace UI + API |
| victoria-traces (Jaeger) | 14268 | Trace collector (receives from OTel) |
| otel-collector | 4317 | OTLP gRPC receiver |
| otel-collector | 4318 | OTLP HTTP receiver |

## VictoriaLogs (LogQL)

Query logs via HTTP API at `http://localhost:9428`.

### Endpoint Format

```
http://localhost:9428/select/logsql/query?query=<LogQL>&start=<time>&end=<time>
```

- `query` — LogQL filter expression (URL-encoded)
- `start` — relative (`5m`) or absolute RFC3339 timestamp
- `end` — optional upper bound (defaults to now)

### Common Queries

```bash
# All errors in last 5 minutes (scoped to project)
curl 'http://localhost:9428/select/logsql/query?query=level:error%20AND%20service_name:<PROJECT>&start=5m'

# Warnings in last 10 minutes (scoped to project)
curl 'http://localhost:9428/select/logsql/query?query=level:warn%20AND%20service_name:<PROJECT>&start=10m'

# Errors from the current project
curl 'http://localhost:9428/select/logsql/query?query=level:error%20AND%20service_name:<PROJECT>&start=5m'

# Full-text search in message (scoped to project)
curl 'http://localhost:9428/select/logsql/query?query=_msg:%22connection%20refused%22%20AND%20service_name:<PROJECT>&start=10m'

# All logs from a specific trace (scoped to project)
curl 'http://localhost:9428/select/logsql/query?query=trace_id:abc123def456%20AND%20service_name:<PROJECT>'

# Time range query (absolute, scoped to project)
curl 'http://localhost:9428/select/logsql/query?query=level:error%20AND%20service_name:<PROJECT>&start=2024-01-01T00:00:00Z&end=2024-01-01T01:00:00Z'

# Count errors by service
curl 'http://localhost:9428/select/logsql/query?query=level:error%20AND%20service_name:<PROJECT>%20|%20stats%20count()%20by%20service_name'
```

### Response Time

Queries must return within 2 seconds (NFR2).

## VictoriaMetrics (PromQL)

Query metrics via HTTP API at `http://localhost:8428`.

### Endpoint Format

```
# Instant query
http://localhost:8428/api/v1/query?query=<PromQL>

# Range query
http://localhost:8428/api/v1/query_range?query=<PromQL>&start=<ts>&end=<ts>&step=15s

# Label names
http://localhost:8428/api/v1/labels

# Metric names (all available metrics)
http://localhost:8428/api/v1/label/__name__/values
```

### Common Queries

```bash
# List all available metrics
curl 'http://localhost:8428/api/v1/label/__name__/values'

# List all label names
curl 'http://localhost:8428/api/v1/labels'

# Total HTTP requests (scoped to project)
curl 'http://localhost:8428/api/v1/query?query=http_requests_total{service_name="<PROJECT>"}'

# Request rate (per second, last 5 minutes, scoped to project)
curl 'http://localhost:8428/api/v1/query?query=rate(http_requests_total{service_name="<PROJECT>"}[5m])'

# Error rate (5xx responses, scoped to project)
curl 'http://localhost:8428/api/v1/query?query=rate(http_requests_total{status_code=~"5..",service_name="<PROJECT>"}[5m])'

# Response time percentiles (p95, scoped to project)
curl 'http://localhost:8428/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket{service_name="<PROJECT>"}[5m]))'

# Range query (last hour, 15s intervals, scoped to project)
curl 'http://localhost:8428/api/v1/query_range?query=rate(http_requests_total{service_name="<PROJECT>"}[5m])&start=-1h&end=now&step=15s'
```

## VictoriaTraces (Jaeger API)

Query traces via Jaeger HTTP API at `http://localhost:16686`.

### Endpoint Format

```
# List services
http://localhost:16686/api/services

# Search traces by service
http://localhost:16686/api/traces?service=<name>&limit=20

# Get a specific trace by ID
http://localhost:16686/api/traces/<traceID>

# Get operations for a service
http://localhost:16686/api/services/<name>/operations
```

### Common Queries

```bash
# List all services sending traces
curl 'http://localhost:16686/api/services'

# Recent traces for the current project (last 20)
curl 'http://localhost:16686/api/traces?service=<PROJECT>&limit=20'

# Get trace by ID
curl 'http://localhost:16686/api/traces/abc123def456789'

# Get operations for the current project
curl 'http://localhost:16686/api/services/<PROJECT>/operations'

# Filter traces by operation and min duration (1s+)
curl 'http://localhost:16686/api/traces?service=<PROJECT>&operation=GET%20/api/users&minDuration=1s&limit=10'
```

## OTel Collector Health Check

```bash
# Check if OTel Collector HTTP receiver is up
curl -s http://localhost:4318/
```

A successful response (any 2xx/4xx) means the collector is accepting telemetry. Connection refused means it's down.

## Common Debugging Workflows

### After a Test Failure

1. Query VictoriaLogs for errors produced during the test:
   ```bash
   curl 'http://localhost:9428/select/logsql/query?query=level:error%20AND%20service_name:<PROJECT>&start=5m'
   ```
2. If errors found, search for context around the error message
3. Set `logs_queried` flag: `codeharness state set session_flags.logs_queried true`

### After an API Error

1. Find the trace for the failed request:
   ```bash
   curl 'http://localhost:16686/api/traces?service=<PROJECT>&limit=5'
   ```
2. Get the full trace to see where it failed:
   ```bash
   curl 'http://localhost:16686/api/traces/<traceID>'
   ```
3. Cross-reference with logs using the trace ID:
   ```bash
   curl 'http://localhost:9428/select/logsql/query?query=trace_id:<traceID>%20AND%20service_name:<PROJECT>'
   ```

### Check Metrics for Anomalies

1. List available metrics:
   ```bash
   curl 'http://localhost:8428/api/v1/label/__name__/values'
   ```
2. Check error rates (scoped to project):
   ```bash
   curl 'http://localhost:8428/api/v1/query?query=rate(http_requests_total{status_code=~"5..",service_name="<PROJECT>"}[5m])'
   ```

## Remote-Direct Mode: OTel Collector Configuration

For `remote-direct` mode, the remote OTel Collector should be configured with a `resource/default` processor to tag unattributed telemetry:

```yaml
processors:
  resource/default:
    attributes:
      - key: service.name
        value: "unknown"
        action: insert
```

This is outside codeharness's control but is recommended to prevent untagged telemetry from polluting query results.

## When Observability Endpoints Are Unreachable

Observability is always enabled (mandatory). If queries to `localhost:9428`, `localhost:8428`, `localhost:16686`, or `localhost:4318` fail with "connection refused", the Docker stack is not running. Start it:

```bash
codeharness stack start
```

Or check the current status:
```bash
codeharness status --check-docker
```
