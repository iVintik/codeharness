---
name: bmad-integration
description: Integrates codeharness with BMAD methodology — reads sprint plans, maps stories to verification tasks, enforces harness requirements in all BMAD workflows. Triggers when working with BMAD artifacts, sprint plans, or story files.
---

# BMAD Integration

## Sprint Plan Reading

When a BMAD sprint plan exists at `_bmad-output/planning-artifacts/`:

1. Extract all stories with IDs, titles, and acceptance criteria
2. Map each AC to a verification type based on content analysis:
   - AC mentions "UI", "page", "screen", "button", "display" → UI verification
   - AC mentions "API", "endpoint", "request", "response", "HTTP" → API verification
   - AC mentions "database", "table", "row", "query", "persist" → DB verification
   - AC mentions "log", "trace", "event", "emit" → Log verification
3. Produce per-story verification task lists
4. Works with BMAD Method v6+ artifact format (NFR12)

## BMAD Workflow Patches

codeharness patches these BMAD workflows (see `templates/bmad-patches/`):

1. **Story template** — adds verification, documentation, testing requirements
2. **Dev story workflow** — enforces observability, docs, tests during implementation
3. **Code review workflow** — verifies AGENTS.md freshness, coverage
4. **Retrospective workflow** — analyzes verification effectiveness, doc health, test quality
5. **Sprint planning workflow** — verifies planning docs complete, test infra ready

Patches use idempotent markers (NFR19):
```
<!-- CODEHARNESS-PATCH-START:{name} -->
...
<!-- CODEHARNESS-PATCH-END:{name} -->
```

## Codex And Non-BMAD IDEs

When BMAD is installed for Codex or another runtime without first-party BMAD tool integration:

1. Install BMAD with `npx bmad-method install --yes --directory . --modules bmm --tools none`
2. Treat `_bmad/` as the workflow artifact source of truth
3. Use this repo's `AGENTS.md`, `commands/`, and `skills/` files as the runnable agent-facing surface
