# src/lib/doc-health — Documentation Health Subsystem

Scans the codebase for stale, missing, or incomplete documentation. Checks AGENTS.md completeness, staleness against source code, exec-plan lifecycle, and generated-doc headers.

## Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| types.ts | Shared types and utilities for doc-health (avoids circular deps between scanner and staleness) | `DocHealthResult`, `DocHealthReport`, `getExtension`, `isTestFile`, `getNewestSourceMtime` |
| scanner.ts | Module detection and full doc-health scan orchestrator | `findModules`, `scanDocHealth` |
| staleness.ts | Staleness checks, AGENTS.md completeness validation, DO NOT EDIT header checks, story-scoped freshness | `isDocStale`, `getSourceFilesInModule`, `getMentionedFilesInAgentsMd`, `checkAgentsMdCompleteness`, `checkAgentsMdForModule`, `checkDoNotEditHeaders`, `checkStoryDocFreshness` |
| report.ts | Output formatting (OK/FAIL lines) and exec-plan lifecycle (create/complete/status) | `formatDocHealthOutput`, `printDocHealthOutput`, `createExecPlan`, `completeExecPlan`, `getExecPlanStatus` |
| index.ts | Barrel re-exports for the doc-health subsystem | all public API from types, scanner, staleness, report |
