---
description: How to query VictoriaLogs (LogQL), VictoriaMetrics (PromQL), and VictoriaTraces during development. Used when debugging or verifying runtime behavior.
---

# Observability Querying

## VictoriaLogs (LogQL)

Query logs via HTTP API at `localhost:9428`.

### Common Queries

```bash
# All errors in last 5 minutes
curl 'localhost:9428/select/logsql/query?query=level:error&start=5m'

# Errors from a specific service
curl 'localhost:9428/select/logsql/query?query=level:error AND service_name:{service}&start=5m'

# Search by message content
curl 'localhost:9428/select/logsql/query?query=_msg:*connection*&start=10m'

# All logs from a specific trace
curl 'localhost:9428/select/logsql/query?query=trace_id:{trace_id}'

# Count errors by service
curl 'localhost:9428/select/logsql/query?query=level:error | stats count() by service_name'
```

### Response Time

Queries must return within 2 seconds (NFR2).

## VictoriaMetrics (PromQL)

Query metrics via HTTP API at `localhost:8428`.

### Common Queries

```bash
# Total HTTP requests
curl 'localhost:8428/api/v1/query?query=http_requests_total'

# Request rate (per second, last 5 minutes)
curl 'localhost:8428/api/v1/query?query=rate(http_requests_total[5m])'

# Error rate
curl 'localhost:8428/api/v1/query?query=rate(http_requests_total{status_code=~"5.."}[5m])'

# Response time percentiles
curl 'localhost:8428/api/v1/query?query=histogram_quantile(0.95,rate(http_request_duration_seconds_bucket[5m]))'
```

## VictoriaTraces

Query traces at `localhost:14268` (if tracing enforcement enabled).

```bash
# Recent traces for a service
curl 'localhost:14268/api/traces?service={service_name}&limit=10'

# Trace by ID
curl 'localhost:14268/api/traces/{trace_id}'
```

## When to Query

- **After tests:** Check for unexpected errors in logs
- **After API calls:** Verify the request was processed (trace exists)
- **During debugging:** Search logs for error context
- **During verification:** Confirm expected log entries exist
