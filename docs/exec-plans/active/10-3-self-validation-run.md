# Exec Plan: 10-3-self-validation-run

## Objective

Create the `codeharness validate` CLI command that ties together the validation AC registry (10-1) and validation infrastructure (10-2) into a user-facing release gate.

## Approach

1. Create `src/commands/validate.ts` as a thin wrapper (<100 lines per FR40) calling verify module functions
2. Wire command registration in `src/index.ts`
3. Loop `runValidationCycle()` until no actionable ACs remain, count adaptation cycles
4. Format report from `getValidationProgress()` with total/passed/failed/blocked/cycles
5. Output "RELEASE GATE: PASS -- v1.0 ready" when all non-blocked ACs pass
6. Support `--ci` (minimal output, exit codes) and `--json` (machine-readable)
7. Add validation progress to `codeharness status` output
8. Comprehensive unit tests with mocked verify module

## Key Decisions

- Command delegates entirely to verify module; no business logic in the command file
- CI mode outputs only the summary line and sets exit code (0=pass, 1=fail)
- Blocked ACs are expected (integration-required) and do not fail the release gate
- Status command calls `getValidationProgress()` and shows a one-line summary when validation stories exist
- Helper functions (`reportError`, `getFailures`, `outputJson`, `outputCi`, `outputHuman`) keep the file under 100 lines

## Files Changed

- `src/commands/validate.ts` (new) - CLI command, 87 lines
- `src/commands/__tests__/validate.test.ts` (new) - 11 unit tests
- `src/index.ts` (modified) - register validate command
- `src/commands/status.ts` (modified) - add validation progress display
- `src/__tests__/cli.test.ts` (modified) - update command count 19 -> 20
- `src/commands/AGENTS.md` (modified) - document validate command
- `src/modules/verify/AGENTS.md` (modified) - note status integration
