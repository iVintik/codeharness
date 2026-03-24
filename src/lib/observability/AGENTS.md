# src/lib/observability — OTLP Instrumentation Subsystem

Low-level OTLP configuration: package installation, env var management, start-script patching, and backend query builders. Distinct from `src/modules/observability/` which handles Semgrep-based static analysis.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| instrument.ts | OTLP package installation (Node/Python/Rust), start-script patching, full project instrumentation orchestrator | `OtlpResult`, `installNodeOtlp`, `installPythonOtlp`, `installRustOtlp`, `instrumentProject`, `patchNodeStartScript` |
| config.ts | OTLP env var configuration for CLI/web/agent modes, service name and endpoint management | `configureOtlpEnvVars`, `ensureServiceNameEnvVar`, `ensureEndpointEnvVar`, `configureCli`, `configureWeb`, `configureAgent`, `WEB_OTLP_PACKAGES`, `AGENT_OTLP_PACKAGES_NODE`, `AGENT_OTLP_PACKAGES_PYTHON`, `NODE_REQUIRE_FLAG` |
| backends.ts | Observability backend interface with Victoria and ELK query builders | `ObservabilityBackend`, `VictoriaBackend`, `ElkBackend` |
| index.ts | Barrel re-exports for the observability subsystem | all public API from instrument, config, backends |
