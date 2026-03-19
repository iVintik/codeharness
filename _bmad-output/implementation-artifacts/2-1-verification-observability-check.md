# Story 2.1: Verification Observability Check

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a verifier,
I want to check that every docker exec command produces log events in the observability stack,
so that silent code paths are detected during verification.

## Acceptance Criteria

1. **Given** the verify-prompt.ts template, **When** the verifier runs a `docker exec` command, **Then** it queries the observability backend for log events from the last 30 seconds. <!-- verification: integration-required -->
2. **Given** a command produced zero log events, **When** the verifier writes the proof, **Then** it includes `[OBSERVABILITY GAP] No log events detected for this user interaction` in the AC section. <!-- verification: cli-verifiable -->
3. **Given** a proof with observability gaps, **When** `codeharness verify` parses it, **Then** observability gaps are counted and reported separately from functional failures. <!-- verification: cli-verifiable -->
4. **Given** 10 ACs verified and 7 produced log events, **When** runtime coverage is computed, **Then** runtime coverage = 70%. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Add runtime coverage types to `src/modules/observability/types.ts` (AC: #3, #4)
  - [x] 1.1: Add `RuntimeCoverageEntry` interface with fields: `acId: string`, `logEventsDetected: boolean`, `logEventCount: number`, `gapNote?: string`
  - [x] 1.2: Add `RuntimeCoverageResult` interface with fields: `entries: RuntimeCoverageEntry[]`, `totalACs: number`, `acsWithLogs: number`, `coveragePercent: number`
  - [x] 1.3: Add `RuntimeCoverageState` interface with fields: `coveragePercent: number`, `lastValidationTimestamp: string`, `modulesWithTelemetry: number`, `totalModules: number`, `telemetryDetected: boolean` -- aligned with architecture Decision 2
  - [x] 1.4: Extend `ObservabilityCoverageState` to include optional `runtime?: RuntimeCoverageState` section (additive, does not break Story 1.3)
  - [x] 1.5: Extend `CoverageTargets` to include optional `runtimeTarget?: number` (default 60)

- [x] Task 2: Update verify-prompt.ts template with observability check instructions (AC: #1)
  - [x] 2.1: Add an observability check section after the "Verify Each AC" step instructing the verifier to query the observability backend after each `docker exec` command
  - [x] 2.2: Include the specific query template: `curl '${victoriaLogs}/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'`
  - [x] 2.3: Include the `[OBSERVABILITY GAP]` tag format for zero-event results
  - [x] 2.4: Update `VerifyPromptConfig` if any new config fields are needed
  - [x] 2.5: Update existing verify-prompt tests to cover the new template section

- [x] Task 3: Implement observability gap parser in `src/modules/verify/parser.ts` (AC: #2, #3)
  - [x] 3.1: Add `parseObservabilityGaps(proofContent: string): ObservabilityGapResult` function that scans proof text for `[OBSERVABILITY GAP]` tags
  - [x] 3.2: Return per-AC observability gap presence (which ACs have the gap tag)
  - [x] 3.3: Ensure gap count is separate from functional pass/fail count in `ProofQuality`

- [x] Task 4: Implement runtime coverage computation in `src/modules/observability/runtime-coverage.ts` (AC: #4)
  - [x] 4.1: Implement `computeRuntimeCoverage(gapResults: ObservabilityGapResult): RuntimeCoverageResult` -- takes parsed gap data, computes coverage = acsWithLogs / totalACs * 100
  - [x] 4.2: Implement `saveRuntimeCoverage(projectDir: string, result: RuntimeCoverageResult): Result<void>` -- persists to `sprint-state.json` under `observability.runtime`
  - [x] 4.3: Follow same atomic write pattern as `coverage.ts` (read-modify-write, temp+rename)
  - [x] 4.4: Keep file under 150 lines

- [x] Task 5: Wire gap parsing into verify orchestrator (AC: #3)
  - [x] 5.1: After proof is written and parsed, call `parseObservabilityGaps` on proof content
  - [x] 5.2: Include observability gap count in `VerifyResult` -- add `observabilityGapCount: number` and `runtimeCoveragePercent: number` fields
  - [x] 5.3: Report observability gaps separately in verification output (not mixed with functional failures)

- [x] Task 6: Export new types and functions from module barrels (AC: all)
  - [x] 6.1: Add new type exports to `src/modules/observability/index.ts`: `RuntimeCoverageEntry`, `RuntimeCoverageResult`, `RuntimeCoverageState`
  - [x] 6.2: Add new function exports: `computeRuntimeCoverage`, `saveRuntimeCoverage`
  - [x] 6.3: Add `parseObservabilityGaps` export to `src/modules/verify/index.ts`

- [x] Task 7: Write unit tests (AC: all)
  - [x] 7.1: Create `src/modules/observability/__tests__/runtime-coverage.test.ts`:
    - Test `computeRuntimeCoverage` with 10 ACs and 7 with logs = 70%
    - Test `computeRuntimeCoverage` with 0 ACs (edge case, no division by zero)
    - Test `computeRuntimeCoverage` with all ACs having logs = 100%
    - Test `computeRuntimeCoverage` with no ACs having logs = 0%
    - Test `saveRuntimeCoverage` writes to sprint-state.json correctly
    - Test `saveRuntimeCoverage` preserves existing static coverage data
  - [x] 7.2: Create or extend `src/modules/verify/__tests__/parser-observability.test.ts`:
    - Test `parseObservabilityGaps` detects `[OBSERVABILITY GAP]` in proof markdown
    - Test `parseObservabilityGaps` returns correct per-AC gap presence
    - Test `parseObservabilityGaps` handles proof with no gaps (all clean)
    - Test `parseObservabilityGaps` handles proof with all gaps
  - [x] 7.3: Update `src/modules/verify/__tests__/verify-prompt.test.ts`:
    - Test that generated prompt includes observability check instructions
    - Test that observability endpoint URLs are included in query template
  - [x] 7.4: Mock all filesystem operations -- no real I/O in unit tests
  - [x] 7.5: Target 100% coverage on all new files

- [x] Task 8: Integration verification (AC: all)
  - [x] 8.1: Run `npm run build` -- verify tsup compiles new modules
  - [x] 8.2: Run `npm run test:unit` -- all tests pass
  - [x] 8.3: Verify module boundaries: only barrel index.ts exports public API
  - [x] 8.4: Verify no file exceeds 300 lines (NFR9)

## Dev Agent Record

### Implementation Plan

- Task 1: Added `RuntimeCoverageEntry`, `RuntimeCoverageResult`, `RuntimeCoverageState` interfaces to observability types. Extended `ObservabilityCoverageState` with optional `runtime` and `CoverageTargets` with optional `runtimeTarget`.
- Task 2: Added "Step 3.5: Observability Check After Each Command" section to verify-prompt.ts template with VictoriaLogs query and `[OBSERVABILITY GAP]` tag instructions.
- Task 3: Implemented `parseObservabilityGaps()` in parser.ts that scans proof markdown for `## AC N:` headings and `[OBSERVABILITY GAP]` tags. Added `ObservabilityGapResult` and `ObservabilityGapEntry` types to verify types.
- Task 4: Created `runtime-coverage.ts` with `computeRuntimeCoverage()` and `saveRuntimeCoverage()`. Follows same atomic write pattern as coverage.ts. File is 112 lines.
- Task 5: Added `observabilityGapCount` and `runtimeCoveragePercent` fields to `VerifyResult`. Wired `parseObservabilityGaps` into `verifyStory()` in index.ts. Updated all existing VerifyResult constructions in verify.ts, verifier-session.ts, and verify.test.ts.
- Task 6: Updated both barrel files with new type and function exports.
- Task 7: Created runtime-coverage.test.ts (21 tests), parser-observability.test.ts (11 tests), added 3 tests to verify-prompt.test.ts. All filesystem ops mocked.
- Task 8: Build passes, all 2510 tests pass, module boundaries clean, all files under 300 lines.

### Debug Log

- Import boundary violation: `runtime-coverage.ts` initially imported from `../verify/types.js` (internal file). Fixed to import from `../verify/index.js` (barrel).

### Completion Notes

All 8 tasks and all subtasks implemented. 35 new tests added across 3 test files. Build and full regression suite pass (2510/2510). Runtime coverage types follow architecture Decision 2 (separate metrics). No new dependencies added.

## File List

- src/modules/observability/types.ts (modified) -- added RuntimeCoverageEntry, RuntimeCoverageResult, RuntimeCoverageState; extended ObservabilityCoverageState and CoverageTargets
- src/modules/observability/runtime-coverage.ts (new) -- computeRuntimeCoverage, saveRuntimeCoverage
- src/modules/observability/index.ts (modified) -- added new type and function exports
- src/modules/observability/__tests__/runtime-coverage.test.ts (new) -- 21 unit tests
- src/modules/verify/types.ts (modified) -- added ObservabilityGapEntry, ObservabilityGapResult, extended VerifyResult
- src/modules/verify/parser.ts (modified) -- added parseObservabilityGaps function
- src/modules/verify/index.ts (modified) -- added parseObservabilityGaps export and new type exports
- src/modules/verify/__tests__/parser-observability.test.ts (new) -- 11 unit tests
- src/modules/verify/__tests__/verify-prompt.test.ts (modified) -- added 3 observability check tests
- src/modules/verify/__tests__/verify.test.ts (modified) -- updated VerifyResult constructions with new fields
- src/templates/verify-prompt.ts (modified) -- added Step 3.5 observability check section
- src/commands/verify.ts (modified) -- added new VerifyResult fields
- src/lib/verifier-session.ts (modified) -- added new VerifyResult fields

## Change Log

- 2026-03-19: Implemented Story 2.1 -- runtime observability coverage types, verify-prompt observability check instructions, proof gap parser, runtime coverage computation/persistence, verify orchestrator wiring, barrel exports, and comprehensive unit tests.

## Dev Notes

### Architecture References

This story implements architecture Decision 3 (Runtime Validation — Verification IS the Runtime Check). The verifier already runs `docker exec` commands for each AC. This story adds an observability query after each command to detect silent code paths.

Architecture Decision 2 (Separate Metrics) applies: runtime coverage is stored separately from static coverage. The `ObservabilityCoverageState` type from Story 1.3 is extended with a `runtime` section.

### Key Implementation Details

**verify-prompt.ts changes:** The template at `src/templates/verify-prompt.ts` already has observability endpoint configuration (`victoriaLogs`, `victoriaMetrics`, `victoriaTraces`). The change is to add explicit instructions for the verifier to query logs after each docker exec, and to use the `[OBSERVABILITY GAP]` tag when zero events are found.

**Parser changes:** The `src/modules/verify/parser.ts` already classifies evidence commands (see `EvidenceCommandType` including `'observability'`). This story adds detection of the `[OBSERVABILITY GAP]` tag in proof text, counting gaps per AC.

**Runtime coverage module:** New file `src/modules/observability/runtime-coverage.ts` implements the coverage computation. This is separate from `coverage.ts` (which handles static coverage) per the separation of concerns principle.

**State persistence:** The `observability` section in `sprint-state.json` currently has `static` and `targets` (from Story 1.3). This story adds `runtime` alongside, following the architecture Decision 2 shape.

### Target State Shape in sprint-state.json

After this story, the `observability` section becomes:

```json
{
  "observability": {
    "static": {
      "coveragePercent": 75,
      "lastScanTimestamp": "2026-03-19T14:30:00Z",
      "history": [...]
    },
    "runtime": {
      "coveragePercent": 70,
      "lastValidationTimestamp": "2026-03-19T15:00:00Z",
      "modulesWithTelemetry": 7,
      "totalModules": 10,
      "telemetryDetected": true
    },
    "targets": {
      "staticTarget": 80,
      "runtimeTarget": 60
    }
  }
}
```

### Observability Query Approach

Per architecture Decision 3, the verifier queries VictoriaLogs after each `docker exec`:

```
curl '${victoriaLogs}/select/logsql/query?query=_stream_id:*&start=-30s&limit=100'
```

If the response contains zero log entries, the verifier tags the AC section with `[OBSERVABILITY GAP]`. The proof parser then counts these tags.

### What This Story Does NOT Include

- No hook enforcement blocking commits on low runtime coverage -- that's Story 2.2
- No standalone runtime check outside verification -- that's Story 2.3
- No audit command integration -- that's Epic 3
- No code review integration -- that's Story 5.1
- No combined static+runtime metric -- metrics are always reported separately (Decision 2)

### Dependencies

- **Depends on:** Story 1.3 (coverage state types and persistence) -- DONE
- **Depends on:** Story 1.2 (analyzer module types) -- DONE
- **Depended on by:** Story 2.2 (hook enforcement reads runtime coverage), Story 2.3 (standalone runtime check reuses runtime coverage computation), Story 5.2 (verification runtime integration)

### File Size Constraint

Each new file must be under 300 lines per NFR9. `runtime-coverage.ts` should be ~100 lines. Parser additions should be ~50 lines within existing file.

### Existing Relevant Code

- `src/templates/verify-prompt.ts` -- template to modify (currently 174 lines)
- `src/modules/verify/parser.ts` -- parser to extend
- `src/modules/verify/types.ts` -- `ProofQuality` and `EvidenceCommandType` already exist
- `src/modules/observability/coverage.ts` -- static coverage persistence (pattern to follow)
- `src/modules/observability/types.ts` -- types to extend with runtime types
- `src/modules/observability/index.ts` -- barrel to update

### References

- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 2] -- Separate Metrics, ObservabilityCoverage interface
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 3] -- Runtime Validation approach
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 6] -- Module structure
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 2.1] -- Acceptance criteria and user story
- [Source: src/templates/verify-prompt.ts] -- Verification prompt template
- [Source: src/modules/verify/types.ts] -- ProofQuality, EvidenceCommandType
- [Source: src/modules/observability/coverage.ts] -- Static coverage persistence pattern

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/2-1-verification-observability-check.proof.md`)
- [ ] All acceptance criteria verified with real-world evidence
- [ ] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [ ] Relevant AGENTS.md files updated (src/modules/observability/AGENTS.md, src/modules/verify/AGENTS.md)
- [ ] Exec-plan created in `docs/exec-plans/active/2-1-verification-observability-check.md`

## Testing Requirements

- [ ] Unit tests written for all new/changed code
- [ ] Filesystem operations mocked (no real I/O in unit tests)
- [ ] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->
