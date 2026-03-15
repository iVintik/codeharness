# Integration Test: Observability Endpoint Availability

These are manual integration test steps requiring a running Docker stack.
They verify that VictoriaLogs, VictoriaMetrics, VictoriaTraces, and OTel Collector
are reachable and processing telemetry end-to-end.

## Prerequisites

- Docker running
- Harness initialized: `codeharness init`
- Stack started: `docker compose -f docker-compose.harness.yml up -d`
- All four services healthy: `codeharness status --check-docker`

## Step 1: Verify OTel Collector is receiving

```bash
curl -s http://localhost:4318/
# Expected: any response (not "connection refused")
```

## Step 2: Send test log via OTLP HTTP

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
# Expected: HTTP 200
```

## Step 3: Query VictoriaLogs for the test log

Wait 2-3 seconds for ingestion, then:

```bash
curl 'http://localhost:9428/select/logsql/query?query=_msg:integration-test-error-marker&start=5m'
# Expected: JSON with the log entry containing "integration-test-error-marker"
```

## Step 4: Send test metric via OTLP HTTP

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
              "timeUnixNano": "'$(date +%s)000000000'",
              "startTimeUnixNano": "'$(( $(date +%s) - 60 ))000000000'"
            }],
            "isMonotonic": true,
            "aggregationTemporality": 2
          }
        }]
      }]
    }]
  }'
# Expected: HTTP 200
```

## Step 5: Query VictoriaMetrics for the test metric

Wait 2-3 seconds for ingestion, then:

```bash
curl 'http://localhost:8428/api/v1/query?query=integration_test_counter'
# Expected: JSON with result containing the metric value
```

## Step 6: Send test trace via OTLP HTTP

```bash
curl -X POST http://localhost:4318/v1/traces \
  -H 'Content-Type: application/json' \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "integration-test"}}]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "0af7651916cd43dd8448eb211c80319c",
          "spanId": "b7ad6b7169203331",
          "name": "integration-test-span",
          "kind": 1,
          "startTimeUnixNano": "'$(date +%s)000000000'",
          "endTimeUnixNano": "'$(( $(date +%s) + 1 ))000000000'"
        }]
      }]
    }]
  }'
# Expected: HTTP 200
```

## Step 7: Query VictoriaTraces for the test trace

Wait 2-3 seconds for ingestion, then:

```bash
curl 'http://localhost:16686/api/traces?service=integration-test&limit=5'
# Expected: JSON with trace data containing "integration-test-span"
```

## Step 8: Verify OTel Collector routing

All three signals should have arrived at their respective backends:
- Logs at VictoriaLogs (Step 3)
- Metrics at VictoriaMetrics (Step 5)
- Traces at VictoriaTraces (Step 7)

If any step fails, check:
1. `docker compose -f docker-compose.harness.yml logs otel-collector` for routing errors
2. Individual service logs for ingestion errors
