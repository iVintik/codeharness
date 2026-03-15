---
description: Reference pointer to the observability querying knowledge file.
---

# Observability Querying Reference

Full query patterns, endpoint formats, and debugging workflows are maintained in the canonical knowledge file:

**See: `knowledge/observability-querying.md`**

This avoids duplication. The knowledge file contains:
- Port reference table (logs 9428, metrics 8428, traces 16686, otel 4317/4318)
- VictoriaLogs LogQL query patterns and endpoint format
- VictoriaMetrics PromQL query patterns and endpoint format
- VictoriaTraces (Jaeger) API query patterns and endpoint format
- OTel Collector health check
- Common debugging workflows (after test failure, after API error, check metrics)
- Behavior when observability is OFF
