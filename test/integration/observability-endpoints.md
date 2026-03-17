# Integration Test: Observability Endpoint Availability

Requires Docker. These are manual integration test procedures for verifying
that the VictoriaMetrics observability stack accepts and returns telemetry data.

## Prerequisites

- Docker and Docker Compose installed
- Codeharness initialized in a test project: `codeharness init`
- Docker stack running: `codeharness stack start`
- All four services healthy: `codeharness status --check-docker`

## Step 1: Verify OTel Collector Health

```bash
curl -s http://localhost:4318/
```

**Expected:** Any HTTP response (2xx or 4xx). Connection refused = collector down.

## Step 2: Send Test Telemetry via OTel Collector (OTLP HTTP)

### Send a test log

```bash
curl -X POST http://localhost:4318/v1/logs \
  -H 'Content-Type: application/json' \
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "integration-test"}}]
      },
      "scopeLogs": [{
        "logRecords": [{
          "timeUnixNano": "'$(date +%s)000000000'",
          "severityText": "ERROR",
          "body": {"stringValue": "integration-test-error-marker"}
        }]
      }]
    }]
  }'
```

**Expected:** HTTP 200 with empty JSON body `{}`.

### Send a test metric

```bash
curl -X POST http://localhost:4318/v1/metrics \
  -H 'Content-Type: application/json' \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "integration-test"}}]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "integration_test_counter",
          "sum": {
            "dataPoints": [{
              "asInt": "42",
              "startTimeUnixNano": "'$(date +%s)000000000'",
              "timeUnixNano": "'$(date +%s)000000000'"
            }],
            "isMonotonic": true,
            "aggregationTemporality": 2
          }
        }]
      }]
    }]
  }'
```

**Expected:** HTTP 200 with empty JSON body `{}`.

### Send a test trace

```bash
TRACE_ID=$(openssl rand -hex 16)
SPAN_ID=$(openssl rand -hex 8)
curl -X POST http://localhost:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "integration-test"}}]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "'$TRACE_ID'",
          "spanId": "'$SPAN_ID'",
          "name": "integration-test-span",
          "kind": 1,
          "startTimeUnixNano": "'$(date +%s)000000000'",
          "endTimeUnixNano": "'$(($(date +%s) + 1))000000000'"
        }]
      }]
    }]
  }'
```

**Expected:** HTTP 200 with empty JSON body `{}`.

## Step 3: Query VictoriaLogs for Test Log

Wait 2-3 seconds for ingestion, then:

```bash
curl 'http://localhost:9428/select/logsql/query?query=integration-test-error-marker&start=5m'
```

**Expected:** JSON response containing the test log entry with `severityText: ERROR`
and `body: integration-test-error-marker`. Must return within 2 seconds (NFR2).

## Step 4: Query VictoriaMetrics for Test Metric

```bash
curl 'http://localhost:8428/api/v1/query?query=integration_test_counter'
```

**Expected:** Prometheus-format JSON response with `status: success` and the metric
value `42` in the result data.

## Step 5: Query VictoriaTraces for Test Trace

```bash
curl 'http://localhost:16686/api/traces?service=integration-test&limit=5'
```

**Expected:** Jaeger-format JSON response containing the test trace with span name
`integration-test-span`.

## Step 6: Verify OTel Collector Routing

Confirm that all three signal types arrived at their respective backends:

1. Logs arrived at VictoriaLogs (Step 3 passed)
2. Metrics arrived at VictoriaMetrics (Step 4 passed)
3. Traces arrived at VictoriaTraces (Step 5 passed)

This confirms the OTel Collector is correctly routing OTLP signals to the
VictoriaMetrics stack backends as configured in `otel-collector-config.yaml`.

## Step 7: Verify `codeharness status --check-docker` Endpoint Summary

```bash
codeharness status --check-docker
```

**Expected output includes:**
```
[OK] VictoriaMetrics stack: running
[INFO] Endpoints: logs=http://localhost:9428 metrics=http://localhost:8428 traces=http://localhost:16686
```

```bash
codeharness status --check-docker --json
```

**Expected JSON includes:**
```json
{
  "status": "ok",
  "docker": { "healthy": true, "services": [...] },
  "endpoints": {
    "logs": "http://localhost:9428",
    "metrics": "http://localhost:8428",
    "traces": "http://localhost:16686",
    "otel_http": "http://localhost:4318"
  }
}
```

## Cleanup

```bash
codeharness stack stop
```
