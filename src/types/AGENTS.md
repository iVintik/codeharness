# src/types/ — Shared Type Definitions

Shared TypeScript type definitions consumed across commands, lib, and modules. No runtime code — types only.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| index.ts | Barrel re-exports for all shared types | re-exports from result, state, observability |
| result.ts | Discriminated union `Result<T>` type for consistent error handling | `Ok<T>`, `Err`, `Result<T>`, `ok()`, `err()` |
| state.ts | Sprint state types matching architecture decision 2 | `StoryStatus`, `SprintState`, `RunProgress` |
| observability.ts | Backend-agnostic observability types from architecture decision 4 | `ObservabilityBackendType`, `ObservabilityQuery`, `ObservabilityResult` |
