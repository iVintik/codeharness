---
description: Enforces that the agent queries observability tools (VictoriaLogs, VictoriaMetrics) during development instead of guessing at runtime behavior. Triggers when the agent is debugging, investigating errors, or verifying runtime behavior.
---

# Visibility Enforcement

## Principle

The agent must SEE what the code does at runtime. No guessing. Query logs, metrics, and traces.

## When to Query

- **After writing code:** Check VictoriaLogs for errors from the new code path
- **After running tests:** Query for unexpected errors or warnings
- **During debugging:** Search logs for error context instead of guessing
- **During verification:** Confirm expected log entries and trace spans exist

## How to Query

### Logs (VictoriaLogs)
```bash
# Errors in last 5 minutes
curl 'localhost:9428/select/logsql/query?query=level:error&start=5m'

# Specific service errors
curl 'localhost:9428/select/logsql/query?query=level:error AND service_name:{name}&start=5m'

# Search by message
curl 'localhost:9428/select/logsql/query?query=_msg:*keyword*&start=10m'
```

### Metrics (VictoriaMetrics)
```bash
# Request count
curl 'localhost:8428/api/v1/query?query=http_requests_total'

# Error rate
curl 'localhost:8428/api/v1/query?query=rate(http_requests_total{status_code=~"5.."}[5m])'
```

## State Tracking

After querying logs, update the state file:
```yaml
session_flags:
  logs_queried: true
```
