---
description: Enforces that the agent queries observability tools (VictoriaLogs, VictoriaMetrics, VictoriaTraces) during development instead of guessing at runtime behavior. Triggers when the agent is debugging, investigating errors, or verifying runtime behavior.
---

# Visibility Enforcement

## Principle

The agent must SEE what the code does at runtime. No guessing. Query logs, metrics, and traces.

## When to Query Observability

Query observability endpoints in these situations:

- **After running tests:** Check VictoriaLogs for unexpected errors or warnings in the application logs
- **After seeing HTTP errors:** Trace the request through VictoriaTraces, cross-reference with logs
- **When debugging unexpected behavior:** Search logs for error context instead of guessing at root cause
- **During verification:** Confirm expected log entries and trace spans exist before marking work complete

## Query Decision Flow

Before querying, follow this decision flow:

1. **Check if Docker stack is healthy:**
   ```bash
   codeharness status --check-docker
   ```
   If unhealthy, the agent cannot query. Start the stack first:
   ```bash
   codeharness stack start
   ```

2. **Query the appropriate endpoint:**
   - Errors/warnings in logs: VictoriaLogs at `localhost:9428`
   - Metrics/rates/counters: VictoriaMetrics at `localhost:8428`
   - Request traces: VictoriaTraces at `localhost:16686`

   See `knowledge/observability-querying.md` for full query patterns and endpoint formats.

## Post-Query Actions

After querying, act on results:

- **Errors found in logs:** Diagnose the root cause from log context, fix the code, re-run tests
- **Metrics show anomalies:** Investigate — high error rates or latency spikes indicate a regression
- **Traces show failures:** Follow the trace spans to find where the request broke down
- **No issues found:** Good — the runtime matches expectations

## State Tracking

After querying logs, record that the query happened:

```bash
codeharness state set session_flags.logs_queried true
```

This session flag is checked by quality gates before commits. It resets to `false` at the start of each session (via `session-start.sh` hook).

## When Observability Endpoints Are Unreachable

Observability is always enabled (mandatory). If endpoints are unreachable:
- The Docker stack may not be running — start it with `codeharness stack start`
- Or use remote endpoints: `codeharness init --otel-endpoint <url>`
- Check current mode: `codeharness status --check-docker`

## References

- Query patterns and endpoints: `knowledge/observability-querying.md`
- OTLP instrumentation setup: `knowledge/otlp-instrumentation.md`
