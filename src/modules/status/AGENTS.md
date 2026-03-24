# src/modules/status — Status Module

Aggregates harness status from state, Docker, beads, sprint, and validation systems. Formats output for human-readable and JSON modes. Provides endpoint URL builders and story drill-down views.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| endpoints.ts | URL builders for observability dashboards — scoped endpoints, mode-aware resolution | `EndpointUrls`, `ScopedEndpointUrls`, `DEFAULT_ENDPOINTS`, `buildScopedEndpoints`, `resolveEndpoints` |
| formatters.ts | Full status display, Docker check, and health check formatting (human + JSON) | `handleFullStatus`, `handleDockerCheck`, `handleHealthCheck` |
| drill-down.ts | Story drill-down presentation — formats AC results, attempt history, proof summary | `handleStoryDrillDown` |
| index.ts | Barrel re-exports for the status module | all public API from endpoints, formatters, drill-down |
