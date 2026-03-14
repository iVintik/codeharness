# Node.js OTLP Auto-Instrumentation

## Packages to Install

```bash
npm install --save-dev \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/exporter-logs-otlp-http \
  @opentelemetry/exporter-trace-otlp-http
```

## Start Script Modification

Add `--require @opentelemetry/auto-instrumentations-node/register` to the project's start script in `package.json`.

Before:
```json
"scripts": {
  "start": "node dist/index.js"
}
```

After:
```json
"scripts": {
  "start": "node --require @opentelemetry/auto-instrumentations-node/register dist/index.js"
}
```

## Environment Variables

Set these in the project's environment or `.env` file:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME={project_name}
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
```

## Verification

After starting the application, verify instrumentation:

```bash
# Check logs are flowing
curl 'localhost:9428/select/logsql/query?query=*&limit=5'

# Check metrics are flowing
curl 'localhost:8428/api/v1/query?query=up'
```
