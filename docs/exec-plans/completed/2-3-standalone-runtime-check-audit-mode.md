# Exec Plan: 2-3 Standalone Runtime Check (Audit Mode)

## Overview

Implements FR9 — standalone runtime check via `validateRuntime()` that runs tests with OTLP enabled, queries VictoriaLogs for telemetry events, and reports per-module coverage. This is the audit-mode alternative to Docker verification runtime coverage.

## Implementation Approach

1. Added type definitions (`RuntimeValidationConfig`, `ModuleTelemetryEntry`, `RuntimeValidationResult`, `TelemetryEvent`) to `types.ts`
2. Created `runtime-validator.ts` with four exported functions:
   - `validateRuntime()` — orchestrator: health check, run tests, query backend, compute coverage
   - `checkBackendHealth()` — HTTP GET to `/health` with 3s timeout
   - `queryTelemetryEvents()` — VictoriaLogs query for events in time window
   - `mapEventsToModules()` — maps events to project modules by source/message matching
3. Module discovery scans top-level directories under `src/`
4. Results compatible with existing `RuntimeCoverageState` shape for state persistence
5. Exported all new types and functions from barrel `index.ts`

## Key Decisions

- Backend health check before test execution prevents wasted test runs when the observability stack is down
- Graceful skip with warning message (not hard failure) when backend is unreachable
- Module matching uses both `source` and `message` fields for broader coverage
- VictoriaLogs ndjson parsing reuses the same pattern as `victoria-backend.ts`

## Files Changed

- `src/modules/observability/types.ts` — added 4 new interfaces
- `src/modules/observability/runtime-validator.ts` — new file (200 lines)
- `src/modules/observability/index.ts` — added new exports
- `src/modules/observability/AGENTS.md` — updated with new file documentation
- `src/modules/observability/__tests__/runtime-validator.test.ts` — new file (31 tests)
