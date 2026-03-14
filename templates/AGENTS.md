# templates/

Template files used during harness initialization and document generation.

## Key Files

| File | Purpose |
|------|---------|
| showboat-template.md | Showboat proof document template |
| docker-compose.harness.yml | VictoriaMetrics Docker Compose template |
| docs-index.md | Scaffold for project docs/index.md |
| otel-collector-config.yaml | OpenTelemetry Collector configuration |
| bmad-patches/ | BMAD workflow patch templates |
| otlp/ | OTLP instrumentation config templates |

## Conventions

- Templates are copied/adapted during `/harness-init`
- BMAD patches in `bmad-patches/` are idempotent (NFR19)
- Docker images use pinned versions (NFR8)
