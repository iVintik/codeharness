# Python OTLP Auto-Instrumentation

## Packages to Install

```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install
```

## Start Script Modification

Wrap the application start command with `opentelemetry-instrument`.

Before:
```bash
python -m myapp
```

After:
```bash
opentelemetry-instrument python -m myapp
```

If using a framework runner (gunicorn, uvicorn):
```bash
opentelemetry-instrument gunicorn myapp:app
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
