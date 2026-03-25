# Story 15-1: CI File Size Gate + Fix Remaining Violations

## Status: done

## Story

As a developer,
I want a CI check that fails if any `.ts` file exceeds 300 lines,
So that file size debt stops accumulating.

<!-- verification-tier: unit-testable -->

## Acceptance Criteria

- [x] AC1: Given CI pipeline runs, when any `.ts` file in `src/` (excluding `__tests__/`) exceeds 300 lines, then the build fails with the filename and line count <!-- verification: cli-verifiable -->
- [ ] AC2: Given all file splits from Epic 12 are complete, when CI gate is enabled, then it passes (zero violations) <!-- verification: cli-verifiable -->

## Technical Notes

**Decision 12 (File Size Enforcement)** and **NFR1** (no file >300 lines excluding tests).

### CI Gate Implementation

Add to `.github/workflows/release.yml` (or a general CI workflow) in the `test` job:

```bash
# File size gate — fail if any src .ts file exceeds 300 lines (excluding tests)
violations=$(find src -name '*.ts' -not -path '*__tests__*' -exec awk 'END{if(NR>300)print FILENAME": "NR" lines"}' {} \;)
if [ -n "$violations" ]; then
  echo "::error::File size violations (>300 lines):"
  echo "$violations"
  exit 1
fi
```

This runs after `npm run build` so it catches all source files including generated ones.

### Current Violators

As of 2026-03-25, these files exceed 300 lines:

| File | Lines | Notes |
|------|-------|-------|
| `src/modules/status/formatters.ts` | 605 | Needs split |
| `src/modules/sprint/state.ts` | 543 | Needs split |
| `src/lib/bmad.ts` | 522 | Needs split |
| `src/lib/scanner.ts` | 447 | Needs split |
| `src/lib/epic-generator.ts` | 379 | Needs split |
| `src/lib/stacks/nodejs.ts` | 358 | Needs split |
| `src/commands/run.ts` | 330 | Needs split |
| `src/commands/verify.ts` | 314 | Needs split |
| `src/lib/verifier-session.ts` | 307 | Needs split |
| `src/modules/infra/docs-scaffold.ts` | 304 | Needs split |
| `src/modules/verify/env.ts` | 304 | Needs split |

11 files currently violate the 300-line limit. These are NOT fixed in this story — this story only adds the gate script and CI step. Violations will be addressed by subsequent TD stories. The gate should start in `warn` mode so CI does not block while violations exist.

### Phased Rollout

The gate can start as a warning (exit 0 with annotation) and become a hard failure (exit 1) after violations are resolved. Use a flag or environment variable to control enforcement mode:

```bash
# Set to 'warn' during transition, 'fail' after all violations resolved
FILE_SIZE_ENFORCEMENT="${FILE_SIZE_ENFORCEMENT:-warn}"
```

### Also add NFR5 check: Commands <100 lines

```bash
violations=$(find src/commands -name '*.ts' -not -path '*__tests__*' -exec awk 'END{if(NR>100)print FILENAME": "NR" lines"}' {} \;)
```

## Tasks / Subtasks

### Task 1: Create `scripts/check-file-sizes.sh` standalone gate script
- [x] 1.1: Create `scripts/check-file-sizes.sh` with `src/` scan (exclude `__tests__/`, threshold 300 lines)
- [x] 1.2: Add NFR5 commands check (`src/commands/`, threshold 100 lines)
- [x] 1.3: Support `FILE_SIZE_ENFORCEMENT` env var (`warn` = exit 0 with annotations, `fail` = exit 1)
- [x] 1.4: Output GitHub Actions `::error::` annotations for each violation
- [x] 1.5: Make script executable (`chmod +x`)

### Task 2: Add `lint:sizes` npm script
- [x] 2.1: Add `"lint:sizes": "bash scripts/check-file-sizes.sh"` to `package.json` scripts

### Task 3: Integrate into CI workflow
- [x] 3.1: Add "File size gate" step to `.github/workflows/release.yml` `test` job after `npm run build`
- [x] 3.2: Set `FILE_SIZE_ENFORCEMENT: warn` as env var in CI step (transition mode)

### Task 4: Write tests for the gate script
- [x] 4.1: Write BATS test that runs `scripts/check-file-sizes.sh` against a temp directory with oversized files and verifies exit code / output
- [x] 4.2: Write BATS test that verifies `FILE_SIZE_ENFORCEMENT=warn` exits 0 even with violations
- [x] 4.3: Write BATS test that verifies `FILE_SIZE_ENFORCEMENT=fail` exits 1 with violations

### Task 5: Verify current state
- [x] 5.1: Run `npm run lint:sizes` locally in warn mode and confirm all violations are reported
- [x] 5.2: Document remaining violators in session output for future TD stories

## Files to Change

- `scripts/check-file-sizes.sh` — Created. Standalone gate script for CI and local use
- `.github/workflows/release.yml` — Added file size gate step in `test` job after build
- `package.json` — Added `lint:sizes` script
- `tests/check-file-sizes.bats` — Created. 18 BATS tests for the gate script (12 original + 6 added during review)

## Dev Notes

- Gate launches in `warn` mode (AC2 cannot pass yet — 11 violators exist). Switch to `fail` after subsequent TD stories resolve all violations.
- NFR5 (commands <100 lines) has 15 violators — also warn-only for now.
- This story is deliberately scoped to the gate mechanism only. File splits are separate stories.

## Dev Agent Record

### Implementation Plan

- Created `scripts/check-file-sizes.sh` as a standalone bash script with two checks: NFR1 (src files <=300 lines) and NFR5 (command files <=100 lines)
- Script uses `find + awk` to detect oversized files, emits GitHub Actions `::error::` annotations, and supports `FILE_SIZE_ENFORCEMENT` env var for warn/fail mode
- Added `SRC_DIR` env var override for testability (BATS tests use temp directories)
- Integrated into CI as a step after `npm run build` in the `test` job, set to `warn` mode during transition
- 12 BATS tests covering: no violations, NFR1 violations, NFR5 violations, boundary conditions (exact threshold), `__tests__` exclusion, enforcement modes (warn/fail/default), GitHub annotations, combined violations

### Completion Notes

- AC1 is satisfied: the gate detects and reports all violations with filenames and line counts. In `fail` mode it exits 1; in `warn` mode it exits 0 with annotations.
- AC2 is NOT satisfied yet (expected): 11 NFR1 violators and 15 NFR5 violators exist. This AC will be satisfied after subsequent TD stories split the oversized files.
- All 319 BATS tests pass (307 existing + 12 new), no regressions.

### Remaining violators for future TD stories

**NFR1 (>300 lines):** `formatters.ts` (605), `state.ts` (543), `bmad.ts` (522), `scanner.ts` (447), `epic-generator.ts` (379), `nodejs.ts` (358), `run.ts` (330), `verify.ts` (314), `verifier-session.ts` (307), `docs-scaffold.ts` (304), `env.ts` (304)

**NFR5 (>100 lines):** `stack.ts` (288), `run.ts` (330), `verify.ts` (314), `retro-import.ts` (298), `teardown.ts` (272), `query.ts` (216), `verify-env.ts` (156), `github-import.ts` (148), `coverage.ts` (139), `state.ts` (131), `bridge.ts` (128), `retry.ts` (126), `audit-action.ts` (119), `sync.ts` (119), `observability-gate.ts` (114)

## Change Log

- 2026-03-25: Created file size gate script, npm script, CI integration, and 12 BATS tests (Story 15-1)
- 2026-03-25: Code review fixes — added .tsx file support to both NFR1/NFR5 checks, added SRC_DIR sanitization (empty string, trailing slash), added violation summary counts, added 6 new BATS tests (boundary 301/101, .tsx detection, trailing slash, summary counts, combined fail counts). Total: 18 BATS tests. 325 total BATS pass, 143 unit tests pass, 96.97% coverage.
