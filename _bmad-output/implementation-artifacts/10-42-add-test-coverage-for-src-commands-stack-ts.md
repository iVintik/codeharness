# Story 10-42: Add Test Coverage for src/commands/stack.ts

## User Story
As a developer, I want at least 80% statement coverage on `src/commands/stack.ts` so the coverage floor is met.

## Acceptance Criteria
- [x] AC1: Statement coverage for `src/commands/stack.ts` >= 80%
- [x] AC2: New tests cover real behavior (remote mode JSON outputs, edge cases, error paths)
- [x] AC3: All tests pass

## Resolution
Added 17 new test cases to `src/commands/__tests__/stack.test.ts` covering:
- Remote-direct JSON output for start, stop, and status
- Remote-direct unreachable endpoint (JSON and text)
- Remote-direct status with missing otlp endpoint (uses "unknown")
- Remote-routed collector already running (JSON and text)
- Remote-routed collector start failure (JSON, text, and without error detail)
- Remote-routed collector start success (JSON)
- Remote-routed missing remote endpoints (JSON and text)
- Remote-routed stop failure (JSON and text)
- Remote-routed stop success (JSON)
- Remote-routed status unhealthy (JSON and text)
- Remote-routed status healthy (JSON)
- Local-shared start failure without error detail
- Local-shared stop failure with non-Error thrown value

Coverage: 79.38% -> 100% statement coverage.

## Story Type
test-coverage

## Epic
Epic 10 — Onboarding

## Status
done
