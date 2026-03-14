# knowledge/

Plugin knowledge files loaded into the agent's context. Each file teaches the agent a specific capability or pattern.

## Key Files

| File | Purpose |
|------|---------|
| documentation-patterns.md | AGENTS.md format guide and creation rules |
| verification-patterns.md | How to verify stories (UI, API, DB, logs) |
| observability-querying.md | LogQL/PromQL query patterns for VictoriaMetrics |
| otlp-instrumentation.md | Auto-instrumentation setup for Node.js/Python |

## Conventions

- Knowledge files are markdown, no frontmatter needed
- Each file covers one topic — keep focused
- Files are loaded automatically by the plugin system
- Max recommended size: ~3KB per file (keeps context manageable)
