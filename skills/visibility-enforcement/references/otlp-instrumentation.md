---
description: How to set up and verify OTLP auto-instrumentation per technology stack. Used when writing or reviewing instrumented code.
---

# OTLP Instrumentation Guide

## When to Apply

OTLP auto-instrumentation should be set up during `/harness-init` when observability enforcement is enabled. The instrumentation is zero-code — it auto-instruments HTTP requests, database queries, and framework operations.

## Per-Stack Setup

### Node.js

Install packages:
```bash
npm install --save-dev @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-metrics-otlp-http @opentelemetry/exporter-logs-otlp-http @opentelemetry/exporter-trace-otlp-http
```

Add to start script in package.json:
```
node --require @opentelemetry/auto-instrumentations-node/register
```

### Python

Install packages:
```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install
```

Wrap start command:
```bash
opentelemetry-instrument python -m myapp
```

## Environment Variables (Both Stacks)

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME={project_name}
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
```

## Verifying Instrumentation

After application starts:

```bash
# Check logs
curl 'localhost:9428/select/logsql/query?query=*&limit=5'

# Check metrics
curl 'localhost:8428/api/v1/query?query=up'

# Check traces (if enabled)
curl 'localhost:16686/api/traces?service={project_name}&limit=5'
```

## Performance

OTLP auto-instrumentation must add <5% latency overhead (NFR5). If overhead is higher, check:
- Batch processor settings in otel-collector-config.yaml
- Disable specific instrumentations that aren't needed
