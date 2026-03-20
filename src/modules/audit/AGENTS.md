# Audit Module

Compliance audit coordinator. Checks all dimensions (observability, testing, documentation, verification, infrastructure) and reports project health.

## Files

- `types.ts` — DimensionStatus, DimensionResult, AuditGap, AuditResult type definitions
- `dimensions.ts` — Per-dimension checkers: checkObservability, checkTesting, checkDocumentation, checkVerification, checkInfrastructure
- `index.ts` — Barrel exports + runAudit coordinator that calls all dimension checkers
- `report.ts` — formatAuditHuman (UX prefix format) and formatAuditJson (structured output)

## Key Patterns

- Coordinator pattern: runAudit calls 5 dimension checkers, collects results, computes overall status
- Each dimension checker wraps an existing module function and maps output to DimensionResult
- Result<T> discriminated union for error handling — never throws
- Graceful degradation: each checker catches its own errors, returns warn/fail instead of crashing
- Barrel imports only: consumers import from index.ts
