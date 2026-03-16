# Story 10-41: Add Test Coverage for src/commands/query.ts

## User Story
As a developer, I want at least 80% statement coverage on `src/commands/query.ts` so the coverage floor is met.

## Acceptance Criteria
- [x] AC1: Statement coverage for `src/commands/query.ts` >= 80%
- [x] AC2: New tests cover real behavior (non-JSON failure paths, remote mode endpoint resolution, success paths)
- [x] AC3: All tests pass

## Resolution
Added 14 new test cases to `src/commands/__tests__/query.test.ts` covering:
- Non-JSON failure paths for logs, metrics, and traces (with mocked fetch returning HTTP errors)
- Non-JSON success paths for logs, metrics, and traces (with mocked fetch returning 200)
- Remote-routed endpoint resolution (logs, metrics, traces use remote URLs from state)
- Remote-direct endpoint resolution (all queries use OTLP endpoint)
- Traces with --operation and --min-duration options
- Metrics --raw --json skipping service_name injection
- Missing service_name for metrics and traces subcommands

Coverage: 72.07% -> 97.29% statement coverage.

## Story Type
test-coverage

## Epic
Epic 10 — Onboarding

## Status
done
