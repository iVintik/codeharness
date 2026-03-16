# Story 10-44: Start Docker Observability Stack

Status: done

## Story

As a developer,
I want the Docker observability stack to be running,
So that telemetry data has a functioning backend to be collected into.

## Acceptance Criteria

1. **Given** `docker-compose.harness.yml` exists, **When** I run `docker compose -f docker-compose.harness.yml ps`, **Then** all services (victoria-logs, victoria-metrics, otel-collector) are listed.
2. **Given** the stack is running, **When** I check service health, **Then** victoria-logs and victoria-metrics report healthy status.
3. **Given** the stack is running, **When** I check ports, **Then** 9428 (logs), 8428 (metrics), 4317 (OTLP gRPC), 4318 (OTLP HTTP) are exposed.

## Verification

All acceptance criteria are met — stack is running and healthy. See proof document for evidence.
