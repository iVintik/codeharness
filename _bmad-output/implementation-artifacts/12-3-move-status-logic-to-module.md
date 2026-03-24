# Story 12-3: Move Business Logic from status.ts Command to Status Module

## Status: backlog

## Story

As a developer,
I want `src/commands/status.ts` under 100 lines with logic in `src/modules/status/`,
So that status logic is testable without command wiring.

## Acceptance Criteria

- [ ] AC1: Given `src/modules/status/` with `index.ts`, `formatters.ts`, `endpoints.ts`, `drill-down.ts`, when `src/commands/status.ts` is inspected, then it's under 100 lines -- just arg parsing, module call, output formatting <!-- verification: cli-verifiable -->
- [ ] AC2: Given `src/modules/status/endpoints.ts`, when `buildScopedEndpoints()` is called, then it produces the same URLs as the current `status.ts` implementation <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 8 (Thin Commands, Fat Modules)** and **NFR5** (commands <100 lines). `src/commands/status.ts` is currently 744 lines -- the second worst violator.

Target structure (from architecture-v3.md):

```
src/modules/status/
  index.ts        — getStatus(), formatOutput() public API
  formatters.ts   — Human-readable and JSON formatting for status output
  endpoints.ts    — URL builders for observability endpoints (Victoria/ELK/remote)
  drill-down.ts   — Story detail logic (--story <key> deep dive)
```

The thin command pattern:
```typescript
// src/commands/status.ts — target: <100 lines
export function registerStatusCommand(program: Command): void {
  program.command('status')
    .option('--check-docker', '...')
    .option('--story <key>', '...')
    .action(async (options) => {
      const result = await statusModule.getStatus(options);
      if (isOk(result)) {
        statusModule.formatOutput(result.data, options);
      } else {
        fail(result.error);
      }
    });
}
```

Current `src/commands/status.ts` contains:
- CLI arg parsing (keep in command)
- Sprint state reading and aggregation (move to `index.ts`)
- URL construction for observability dashboards (move to `endpoints.ts`)
- Human-readable table/tree formatting (move to `formatters.ts`)
- Story drill-down with AC status, retry history (move to `drill-down.ts`)

Note: `src/modules/sprint/drill-down.ts` already exists. The new `src/modules/status/drill-down.ts` handles status-command-specific presentation, while `src/modules/sprint/drill-down.ts` handles sprint-level story detail. They may need to be reconciled -- check for overlap.

`buildScopedEndpoints()` must produce identical URLs to the current implementation. Write a comparison test.

## Files to Change

- `src/modules/status/index.ts` — Create. `getStatus()` reads sprint-state.json and aggregates, `formatOutput()` dispatches to formatters
- `src/modules/status/formatters.ts` — Create. Table and tree formatting for human-readable output, JSON formatting
- `src/modules/status/endpoints.ts` — Create. `buildScopedEndpoints()` URL builders for Victoria/ELK/remote endpoints
- `src/modules/status/drill-down.ts` — Create. Story detail view with AC status, retry history, timeline
- `src/commands/status.ts` — Gut to <100 lines: arg parsing, call status module, format output
- `src/modules/status/__tests__/endpoints.test.ts` — Create. Verify URL generation matches current implementation
