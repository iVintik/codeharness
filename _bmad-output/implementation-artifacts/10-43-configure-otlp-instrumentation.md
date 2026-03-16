# Story 10-43: Configure OTLP Instrumentation

Status: done

## Story

As a developer,
I want OTLP instrumentation to be configured in the codeharness project,
So that telemetry data (traces, metrics, logs) is collected and exported to the observability stack.

## Acceptance Criteria

1. **Given** the codeharness project, **When** I check for OTLP configuration, **Then** `src/lib/otlp.ts` exists with instrumentation logic for Node.js and Python projects.
2. **Given** the codeharness project, **When** I check `package.json`, **Then** `@opentelemetry/*` packages are listed in devDependencies.
3. **Given** the codeharness project, **When** I check for collector config, **Then** `otel-collector-config.yaml` exists with OTLP receivers, processors, and exporters configured.
4. **Given** the Docker compose file, **When** I check the otel-collector service, **Then** it mounts `otel-collector-config.yaml` and exposes ports 4317 (gRPC) and 4318 (HTTP).

## Verification

All acceptance criteria are met by existing implementation. See proof document for evidence.
