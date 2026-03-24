# Story 15-1: CI File Size Gate + Fix Remaining Violations

## Status: backlog

## Story

As a developer,
I want a CI check that fails if any `.ts` file exceeds 300 lines,
So that file size debt stops accumulating.

## Acceptance Criteria

- [ ] AC1: Given CI pipeline runs, when any `.ts` file in `src/` (excluding `__tests__/`) exceeds 300 lines, then the build fails with the filename and line count <!-- verification: cli-verifiable -->
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

From architecture-v3.md, these files exceed 300 lines:
- `src/lib/doc-health.ts` — 832 lines (split in story 12-2)
- `src/commands/status.ts` — 744 lines (split in story 12-3)
- `src/lib/coverage.ts` — 617 lines (split in story 12-1)
- `src/lib/beads-sync.ts` — 590 lines (split in story 12-2)
- `src/lib/bmad.ts` — 522 lines (needs split)
- `src/lib/scanner.ts` — 447 lines (needs split)
- `src/lib/otlp.ts` — 422 lines (split in story 12-2)

Epic 12 stories handle most of these. Verify that after Epic 12, all violations are resolved. If `bmad.ts` and `scanner.ts` still exceed 300 lines, create additional TD stories.

### Phased Rollout

The gate can start as a warning (exit 0 with annotation) and become a hard failure (exit 1) after Epic 12 is complete. Use a flag or environment variable to control enforcement mode:

```bash
# Set to 'warn' during transition, 'fail' after Epic 12
FILE_SIZE_ENFORCEMENT="${FILE_SIZE_ENFORCEMENT:-fail}"
```

### Also add NFR5 check: Commands <100 lines

```bash
violations=$(find src/commands -name '*.ts' -not -path '*__tests__*' -exec awk 'END{if(NR>100)print FILENAME": "NR" lines"}' {} \;)
```

## Files to Change

- `.github/workflows/release.yml` — Add file size gate step in `test` job after build
- `.github/workflows/ci.yml` — Add file size gate if a separate CI workflow exists
- `scripts/check-file-sizes.sh` — Create. Standalone script for local development use (`npm run lint:sizes`)
- `package.json` — Add `lint:sizes` script
