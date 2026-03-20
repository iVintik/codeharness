# Audit Module

Compliance audit coordinator. Checks all dimensions (observability, testing, documentation, verification, infrastructure) and reports project health. Supports `--fix` to generate BMAD-format fix stories for audit gaps (FR15).

## Files

- `types.ts` — DimensionStatus, DimensionResult, AuditGap, AuditResult type definitions
- `dimensions.ts` — Per-dimension checkers: checkObservability, checkTesting, checkDocumentation, checkVerification, checkInfrastructure
- `index.ts` — Barrel exports + runAudit coordinator that calls all dimension checkers
- `report.ts` — formatAuditHuman (UX prefix format) and formatAuditJson (structured output)
- `fix-types.ts` — FixStoryResult, FixGenerationResult type definitions for fix story generation
- `fix-generator.ts` — generateFixStories (creates BMAD markdown for each gap), addFixStoriesToState (adds to sprint-state.json), buildStoryKey, buildStoryMarkdown

## Key Patterns

- Coordinator pattern: runAudit calls 5 dimension checkers, collects results, computes overall status
- Each dimension checker wraps an existing module function and maps output to DimensionResult
- Result<T> discriminated union for error handling — never throws
- Graceful degradation: each checker catches its own errors, returns warn/fail instead of crashing
- Barrel imports only: consumers import from index.ts
- Fix story generation: iterates all gaps, writes BMAD-format markdown, skips existing files (idempotent)
- Sprint state integration: atomic read-modify-write via writeStateAtomic(), creates default state if missing
