# src/lib/docker — Docker Subsystem

Docker Compose lifecycle management, health checks, and container cleanup for the observability stack (VictoriaMetrics, OTel Collector).

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| health.ts | Docker availability checks, stack/collector health probing, remote endpoint reachability | `isDockerAvailable`, `isDockerComposeAvailable`, `getStackHealth`, `getCollectorHealth`, `checkRemoteEndpoint`, `DockerServiceStatus`, `DockerStartResult`, `DockerHealthService`, `DockerHealthResult`, `RemoteEndpointCheckResult` |
| compose.ts | Docker Compose lifecycle — start/stop shared stack, collector-only mode, running-state queries | `isStackRunning`, `isSharedStackRunning`, `startStack`, `startSharedStack`, `stopStack`, `stopSharedStack`, `startCollectorOnly`, `isCollectorRunning`, `stopCollectorOnly` |
| cleanup.ts | Container cleanup stubs (primary logic in src/modules/infra/container-cleanup.ts) | `cleanupOrphanedContainers`, `cleanupVerifyEnv` |
| index.ts | Barrel re-exports for the docker subsystem | all public API from health, compose, cleanup |
