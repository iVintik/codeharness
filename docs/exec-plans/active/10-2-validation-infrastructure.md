# Exec Plan: 10-2-validation-infrastructure

## Objective

Build the validation infrastructure that connects the AC registry (story 10-1) to the existing sprint/dev/verify pipeline. Enables self-healing: execute validation ACs, process results, generate fix stories for failures, and route them through the dev module.

## Approach

1. Define types in `validation-runner-types.ts` (ValidationACResult, ValidationSprintResult, ValidationCycleResult, ValidationProgress)
2. Core functions in `validation-runner.ts`: sprint initialization, AC execution (subprocess for CLI, skip for integration), fix story generation, result processing with retry tracking
3. Orchestration in `validation-orchestrator.ts`: cycle execution (select -> execute -> process -> route) and progress aggregation
4. Export through `verify/index.ts` public API
5. Comprehensive unit tests with mocked dependencies

## Key Decisions

- Split across 3 files to comply with NFR18 (300-line limit): types (63 lines), runner (296 lines), orchestrator (186 lines)
- Uses `val-{acId}` key prefix for validation stories to avoid collision with real sprint stories
- CLI execution via `execSync` with 30s timeout, captures stdout/stderr
- Integration-required ACs are immediately blocked with reason `integration-required`
- After 10 consecutive failures, ACs are blocked with reason `retry-exhausted`
- Fix stories are minimal markdown files with AC description, error output, and suggested fix
- Orchestrator prioritizes failed ACs over backlog (re-validation before new validation)
- Added `writeStateAtomic` and `computeSprintCounts` to sprint module's public API to maintain module boundary compliance

## Files Changed

- `src/modules/verify/validation-runner-types.ts` (new)
- `src/modules/verify/validation-runner.ts` (new)
- `src/modules/verify/validation-orchestrator.ts` (new)
- `src/modules/verify/__tests__/validation-runner.test.ts` (new)
- `src/modules/verify/index.ts` (modified — re-exports)
- `src/modules/verify/AGENTS.md` (updated)
- `src/modules/sprint/index.ts` (modified — added writeStateAtomic, computeSprintCounts exports)
