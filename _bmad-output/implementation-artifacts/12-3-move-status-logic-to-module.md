# Story 12-3: Move Business Logic from status.ts Command to Status Module

## Status: verifying

## Story

As a developer,
I want `src/commands/status.ts` under 100 lines with logic in `src/modules/status/`,
So that status logic is testable without command wiring.

## Acceptance Criteria

- [x] AC1: Given `src/modules/status/` with `index.ts`, `formatters.ts`, `endpoints.ts`, `drill-down.ts`, when `src/commands/status.ts` is inspected, then it's under 100 lines -- just arg parsing, module call, output formatting <!-- verification: cli-verifiable -->
- [x] AC2: Given `src/modules/status/endpoints.ts`, when `buildScopedEndpoints()` is called, then it produces the same URLs as the current `status.ts` implementation <!-- verification: cli-verifiable -->

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

## Tasks/Subtasks

- [x] Task 1: Create `src/modules/status/endpoints.ts` with `buildScopedEndpoints()`, `resolveEndpoints()`, `DEFAULT_ENDPOINTS`, and types (`EndpointUrls`, `ScopedEndpointUrls`)
- [x] Task 2: Create `src/modules/status/formatters.ts` with `handleFullStatus()`, `handleDockerCheck()`, `handleHealthCheck()`, and all supporting helpers (sprint state, beads, onboarding, validation)
- [x] Task 3: Create `src/modules/status/drill-down.ts` with `handleStoryDrillDown()` for story detail presentation (human + JSON)
- [x] Task 4: Create `src/modules/status/index.ts` as the module public API, re-exporting from endpoints, formatters, and drill-down
- [x] Task 5: Rewrite `src/commands/status.ts` as thin command (<100 lines) that delegates to the module, with backward-compatible re-exports
- [x] Task 6: Create `src/modules/status/__tests__/endpoints.test.ts` with comparison tests verifying identical URL generation
- [x] Task 7: Add `'status'` to `MODULE_NAMES` in `src/modules/__tests__/import-boundaries.test.ts`
- [x] Task 8: Run full test suite — all 3493 tests pass, zero regressions

## Files to Change

- `src/modules/status/index.ts` — Create. `getStatus()` reads sprint-state.json and aggregates, `formatOutput()` dispatches to formatters
- `src/modules/status/formatters.ts` — Create. Table and tree formatting for human-readable output, JSON formatting
- `src/modules/status/endpoints.ts` — Create. `buildScopedEndpoints()` URL builders for Victoria/ELK/remote endpoints
- `src/modules/status/drill-down.ts` — Create. Story detail view with AC status, retry history, timeline
- `src/commands/status.ts` — Gut to <100 lines: arg parsing, call status module, format output
- `src/modules/status/__tests__/endpoints.test.ts` — Create. Verify URL generation matches current implementation

## File List

- `src/modules/status/endpoints.ts` — Created. EndpointUrls, ScopedEndpointUrls types; DEFAULT_ENDPOINTS constant; buildScopedEndpoints() and resolveEndpoints() functions
- `src/modules/status/formatters.ts` — Created. handleFullStatus(), handleFullStatusJson(), handleHealthCheck(), handleDockerCheck(), and all sprint/beads/onboarding/validation helpers
- `src/modules/status/drill-down.ts` — Created. handleStoryDrillDown() with human-readable and JSON formatting
- `src/modules/status/index.ts` — Created. Module public API re-exporting from endpoints, formatters, drill-down
- `src/commands/status.ts` — Modified. Reduced from 745 lines to 56 lines; delegates to status module; backward-compatible re-exports
- `src/modules/status/__tests__/endpoints.test.ts` — Created. 15 tests covering buildScopedEndpoints, resolveEndpoints, DEFAULT_ENDPOINTS with comparison test
- `src/modules/__tests__/import-boundaries.test.ts` — Modified. Added 'status' to MODULE_NAMES

## Change Log

- 2026-03-24: Extracted all business logic from `src/commands/status.ts` (745 lines) into `src/modules/status/` module (4 files). Command reduced to 56 lines. All 80 existing command tests + 15 new endpoint tests pass. Full suite: 3493 tests, 0 regressions.
- 2026-03-24: Code review — fixed 3 MEDIUM issues: removed unused imports (`isSharedStackRunning`, `DockerHealthResult`) from formatters.ts, added missing `verify` module mock to status.test.ts. Status set to verifying.

## Dev Agent Record

### Implementation Plan

Followed the "Thin Commands, Fat Modules" pattern (Decision 8, NFR5). Extracted logic into four module files:
- `endpoints.ts`: Pure functions for URL building and endpoint resolution
- `formatters.ts`: All status display logic (full status, docker check, health check) with sprint/beads/onboarding/validation helpers
- `drill-down.ts`: Story drill-down presentation layer (delegates data fetching to sprint module)
- `index.ts`: Clean public API re-exporting from submodules

The command file retains backward-compatible re-exports (`buildScopedEndpoints`, `DEFAULT_ENDPOINTS`, `EndpointUrls`, `ScopedEndpointUrls`) so existing consumers (including `src/commands/__tests__/status.test.ts`) continue to work without modification.

### Completion Notes

- `src/commands/status.ts` reduced from 745 to 56 lines (92% reduction, well under 100-line target)
- `src/modules/status/drill-down.ts` handles status-command presentation only; `src/modules/sprint/drill-down.ts` handles sprint data extraction. No overlap — clean separation.
- The endpoint comparison test explicitly verifies URL generation formula matches the original implementation across 5 test cases including special characters.
- Added 'status' to import-boundaries MODULE_NAMES to ensure boundary enforcement.

### Debug Log

No issues encountered during implementation.

## Senior Developer Review (AI)

**Date:** 2026-03-24
**Reviewer:** Adversarial code review
**Outcome:** Approved with fixes applied

### Findings

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | MEDIUM | Unused import `isSharedStackRunning` in `formatters.ts` line 8 | FIXED |
| 2 | MEDIUM | Unused type import `DockerHealthResult` in `formatters.ts` line 16 | FIXED |
| 3 | MEDIUM | Missing mock for `verify` module (`getValidationProgress`) in `status.test.ts` — fragile test setup | FIXED |

### Verification

- All 3493 tests pass (0 regressions)
- Coverage: 97.09% overall, all 150 files above 80% per-file floor
- Import boundary test passes with `status` in MODULE_NAMES
- Command file: 56 lines (well under 100-line target)
- Cross-module imports correctly use public API (`index.js`) only
