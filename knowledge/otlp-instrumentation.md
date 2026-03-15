---
description: How to set up and verify OTLP auto-instrumentation per technology stack and app type. Used when writing or reviewing instrumented code.
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

## Resource Attributes

Every instrumented project sets these resource attributes for per-project query isolation:

- `OTEL_SERVICE_NAME` — set to the project directory name. This is the primary key for filtering telemetry in dashboards and queries.
- `OTEL_RESOURCE_ATTRIBUTES` — includes `service.instance.id=$(hostname)-$$` which provides a unique identifier per process. This ensures data from multiple instances of the same service is distinguishable.

Example:
```bash
export OTEL_SERVICE_NAME=my-api
export OTEL_RESOURCE_ATTRIBUTES="service.instance.id=$(hostname)-$$"
```

## App-Type-Specific Instrumentation

### CLI Instrumentation

Short-lived CLI processes exit before the default batch span processor flushes (5-second delay). CLI instrumentation configures fast flush:

```bash
# Set in environment or .env file
OTEL_BSP_SCHEDULE_DELAY=100        # Batch span processor delay (100ms instead of 5000ms)
OTEL_BLRP_SCHEDULE_DELAY=100       # Batch log record processor delay
OTEL_TRACES_SAMPLER=always_on      # Capture every CLI invocation
```

For Node.js CLI tools with `bin` entries in package.json, use `NODE_OPTIONS` to enable auto-instrumentation:

```bash
NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' npx my-cli-tool
```

These env vars are stored in `otlp.cli_env_vars` in the harness state file.

### Web Instrumentation

Browser-side telemetry requires the OTel Web SDK and CORS headers on the OTel Collector.

**Packages:**
```bash
npm install @opentelemetry/sdk-trace-web @opentelemetry/instrumentation-fetch @opentelemetry/instrumentation-xml-http-request
```

**Usage:** Import the generated `otel-web-init.js` file at the top of your application entry point:

```javascript
import './otel-web-init.js';
```

This initializes the OTel Web SDK with `FetchInstrumentation` and `XMLHttpRequestInstrumentation`, sending traces to the OTel Collector HTTP endpoint at `http://localhost:4318/v1/traces`.

**CORS:** The OTel Collector must accept cross-origin requests from the browser. When a web app is detected, codeharness configures CORS on the HTTP receiver:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - "http://localhost:*"
            - "http://127.0.0.1:*"
          allowed_headers:
            - "*"
```

If the shared stack is already running, restart it to pick up CORS config:
```bash
codeharness stack stop && codeharness stack start
```

### Agent/LLM Instrumentation

LLM API calls need specialized instrumentation to capture token usage, latencies, and prompt/completion metadata. Codeharness uses OpenLLMetry (by Traceloop) for this.

**Node.js:**
```bash
npm install @traceloop/node-server-sdk
```

**Python:**
```bash
pip install traceloop-sdk
```

OpenLLMetry auto-instruments popular LLM libraries (`openai`, `anthropic`, `langchain`, `llama-index`) and produces standard OTel spans with LLM-specific attributes:
- `llm.token.usage` — input/output token counts
- `llm.request.model` — model name used
- `llm.response.model` — model that responded
- Completion latency as span duration

These flow through the existing OTel Collector pipeline to VictoriaTraces without any collector-side changes.

The agent SDK type is stored in `otlp.agent_sdk` in the harness state file (currently always `traceloop`).

### Generic / Unsupported Stacks

When codeharness cannot determine the app type, it falls back to `generic` with basic OTLP env vars configured (endpoint, service name). For manual instrumentation:

1. Install the OpenTelemetry SDK for your language
2. Configure the OTLP exporter to point to `http://localhost:4318`
3. Set `OTEL_SERVICE_NAME` to your project name
4. Set `OTEL_RESOURCE_ATTRIBUTES="service.instance.id=$(hostname)-$$"`

Refer to the [OpenTelemetry documentation](https://opentelemetry.io/docs/) for language-specific setup guides.

## Verifying Instrumentation

After application starts:

```bash
# Check logs
curl 'localhost:9428/select/logsql/query?query=*&limit=5'

# Check metrics
curl 'localhost:8428/api/v1/query?query=up'

# Check traces (if enabled)
curl 'localhost:14268/api/traces?service={project_name}&limit=5'
```

## Performance

OTLP auto-instrumentation must add <5% latency overhead (NFR5). If overhead is higher, check:
- Batch processor settings in otel-collector-config.yaml
- Disable specific instrumentations that aren't needed
