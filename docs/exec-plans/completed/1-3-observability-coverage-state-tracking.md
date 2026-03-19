# Exec Plan: 1-3 Observability Coverage State Tracking

## Approach

Implement coverage state persistence in `sprint-state.json` following the existing atomic write pattern from `src/modules/sprint/state.ts`. Four public functions: save, read, trend, and target check. Types added to existing `types.ts`, implementation in new `coverage.ts`.

## Key Decisions

1. **Standalone state I/O** — `coverage.ts` reads/writes `sprint-state.json` directly rather than depending on the sprint module's `getSprintState()`, because the sprint module's function returns a typed `SprintState` that doesn't include the `observability` key. Using raw JSON read/write keeps the modules decoupled.
2. **Default target 80%** — Stored in `targets.staticTarget` within the observability section, with function parameter override.
3. **History as append-only array** — Each `saveCoverageResult` call appends to `static.history`, never replaces.

## Files

- `src/modules/observability/types.ts` — Added 7 new interfaces for coverage state
- `src/modules/observability/coverage.ts` — New file, 4 public functions
- `src/modules/observability/index.ts` — Updated barrel exports
- `src/modules/observability/__tests__/coverage.test.ts` — New test file
- `src/modules/observability/AGENTS.md` — New module documentation
