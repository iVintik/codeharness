<!-- DO NOT EDIT MANUALLY -- managed by codeharness -->
# Exec Plan: 3-1-audit-coordinator-dimensions

Status: completed
Created: 2026-03-20T12:46:00Z
Completed: 2026-03-20T09:08:59.157Z

## Acceptance Criteria

1. `codeharness audit` shows status for each dimension using [OK]/[FAIL]/[WARN] prefix format
2. Each dimension produces status (pass/fail/warn) and metric (% or grade)
3. Audit runs in <30 seconds for a 100K LOC project
4. `--json` flag outputs structured JSON with dimension results (status, metric, gaps)
5. Gaps have specific description and suggested fix in human-readable mode
6. Missing Semgrep or unreachable backend reports warn with skip reason, not hard failure
7. Missing harness state file exits with [FAIL] Harness not initialized message

## Task Checklist

- [x] Task 1: Define audit types in src/modules/audit/types.ts
- [x] Task 2: Implement dimension checkers in src/modules/audit/dimensions.ts
- [x] Task 3: Implement audit coordinator in src/modules/audit/index.ts
- [x] Task 4: Implement report formatter in src/modules/audit/report.ts
- [x] Task 5: Register CLI command in src/commands/audit.ts
- [x] Task 6: Write unit tests
- [x] Task 7: Integration verification
