# Story 3.1: Audit Coordinator & Dimensions

Status: verifying

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an operator,
I want `codeharness audit` to check all compliance dimensions in one command,
so that I see full project health instantly.

## Acceptance Criteria

1. **Given** `codeharness audit` is run, **When** it completes, **Then** output shows status for each dimension: observability (static + runtime), testing, documentation, verification, infrastructure -- using UX prefix format (`[OK]`/`[FAIL]`/`[WARN]`). <!-- verification: cli-verifiable -->
2. **Given** each dimension, **When** checked, **Then** it produces a status (pass/fail/warn) and a metric (% or grade). <!-- verification: cli-verifiable -->
3. **Given** audit completes, **When** measured, **Then** it runs in <30 seconds for a 100K LOC project. <!-- verification: cli-verifiable -->
4. **Given** `--json` flag, **When** audit runs, **Then** output is structured JSON with all dimension results, each containing `status`, `metric`, and `gaps` arrays. <!-- verification: cli-verifiable -->
5. **Given** gaps found, **When** displayed in human-readable mode, **Then** each gap has a specific description and suggested fix, printed as `[WARN] dimension: description -- fix: remedy`. <!-- verification: cli-verifiable -->
6. **Given** `codeharness audit` runs, **When** the observability stack is not available or Semgrep is not installed, **Then** those dimensions report `warn` with a skip reason -- not a hard failure that blocks the entire audit. <!-- verification: cli-verifiable -->
7. **Given** `codeharness audit` runs with no project initialized, **When** the harness state file is missing, **Then** it exits with `[FAIL] Harness not initialized -- run codeharness init first`. <!-- verification: cli-verifiable -->

## Tasks / Subtasks

- [x] Task 1: Define audit types in `src/modules/audit/types.ts` (AC: #1, #2, #4)
  - [x] 1.1: Define `DimensionStatus = 'pass' | 'fail' | 'warn'`
  - [x] 1.2: Define `DimensionResult` interface: `{ name: string; status: DimensionStatus; metric: string; gaps: AuditGap[]; }`
  - [x] 1.3: Define `AuditGap` interface: `{ dimension: string; description: string; suggestedFix: string; }`
  - [x] 1.4: Define `AuditResult` interface: `{ dimensions: Record<string, DimensionResult>; overallStatus: DimensionStatus; gapCount: number; durationMs: number; }`

- [x] Task 2: Implement dimension checkers in `src/modules/audit/dimensions.ts` (AC: #1, #2, #5, #6)
  - [x] 2.1: `checkObservability(projectDir: string): Result<DimensionResult>` -- calls `analyze()` from `observability/index.ts` for static coverage and `validateRuntime()` for runtime coverage. If Semgrep not installed or backend unreachable, return `warn` status with skip reason.
  - [x] 2.2: `checkTesting(projectDir: string): Result<DimensionResult>` -- calls `checkOnlyCoverage()` or `evaluateCoverage()` from `lib/coverage.ts`. Reports test coverage % as metric.
  - [x] 2.3: `checkDocumentation(projectDir: string): Result<DimensionResult>` -- calls `scanDocHealth()` from `lib/doc-health.ts`. Reports doc freshness status.
  - [x] 2.4: `checkVerification(projectDir: string): Result<DimensionResult>` -- calls `parseProof()` from `verify/index.ts` or reads verification state from sprint-state.json. Reports verified story count.
  - [x] 2.5: `checkInfrastructure(projectDir: string): Result<DimensionResult>` -- checks if Dockerfile exists, basic structural validation (pinned FROM, no :latest). Full Dockerfile validation is Story 4.1; here just check existence and basic rules.
  - [x] 2.6: Each checker catches its own errors and returns `warn`/`fail` DimensionResult -- never throws (AC #6).

- [x] Task 3: Implement audit coordinator in `src/modules/audit/index.ts` (AC: #1, #2, #3, #6)
  - [x] 3.1: `runAudit(projectDir: string): Result<AuditResult>` -- calls all 5 dimension checkers, collects results, computes `overallStatus` (fail if any fail, warn if any warn, pass if all pass), counts total gaps.
  - [x] 3.2: Wrap audit execution with `performance.now()` timing to populate `durationMs` (AC #3).
  - [x] 3.3: Export `runAudit` from barrel.

- [x] Task 4: Implement report formatter in `src/modules/audit/report.ts` (AC: #4, #5)
  - [x] 4.1: `formatAuditHuman(result: AuditResult): string[]` -- formats each dimension as `[OK] dimension: metric` or `[FAIL] dimension: metric` with gaps listed below as `  [WARN] description -- fix: remedy`.
  - [x] 4.2: `formatAuditJson(result: AuditResult): object` -- returns structured JSON matching the AuditResult shape for `--json` output.

- [x] Task 5: Register CLI command in `src/commands/audit.ts` (AC: #1, #4, #7)
  - [x] 5.1: Create `registerAuditCommand(program: Command)` with `codeharness audit` command.
  - [x] 5.2: Add `--json` option for machine-readable output.
  - [x] 5.3: Run preconditions check -- if not initialized, exit with fail message (AC #7).
  - [x] 5.4: Call `runAudit(process.cwd())`, then format output based on `--json` flag.
  - [x] 5.5: Register command in `src/cli.ts` (or wherever commands are registered).

- [x] Task 6: Write unit tests (AC: all)
  - [x] 6.1: Create `src/modules/audit/__tests__/dimensions.test.ts`:
    - Test each dimension checker returns `DimensionResult` with correct status and metric
    - Test observability checker returns `warn` when Semgrep not installed
    - Test observability checker returns `warn` when backend unreachable
    - Test infrastructure checker returns `fail` when no Dockerfile
    - Test infrastructure checker returns `warn` for unpinned base image
  - [x] 6.2: Create `src/modules/audit/__tests__/index.test.ts`:
    - Test `runAudit` calls all 5 dimensions
    - Test `overallStatus` = fail when any dimension fails
    - Test `overallStatus` = warn when any dimension warns (and none fail)
    - Test `overallStatus` = pass when all pass
    - Test gapCount aggregation
    - Test durationMs is populated
  - [x] 6.3: Create `src/modules/audit/__tests__/report.test.ts`:
    - Test human format includes `[OK]`/`[FAIL]`/`[WARN]` prefixes
    - Test human format lists gaps with suggested fixes
    - Test JSON format matches AuditResult structure
  - [x] 6.4: Create `src/commands/__tests__/audit.test.ts`:
    - Test command registration
    - Test `--json` produces valid JSON
    - Test exit with fail message when not initialized
  - [x] 6.5: Mock all I/O: filesystem, subprocess (Semgrep), HTTP (observability backend)
  - [x] 6.6: Target 100% coverage on new files

- [x] Task 7: Integration verification (AC: all)
  - [x] 7.1: `npm run build` -- verify tsup compiles new module
  - [x] 7.2: `npm run test:unit` -- all tests pass, no regressions
  - [x] 7.3: Verify module boundaries: only barrel `index.ts` exports public API
  - [x] 7.4: Verify no file exceeds 300 lines (NFR9)
  - [x] 7.5: Verify audit runs on codeharness itself and produces output

## Dev Notes

### Architecture References

This story implements FR13 (full compliance report), FR14 (per-dimension status + metric), FR21 (structured output), and partially FR17-FR20 (dimension checks). It is Architecture Decision 4: Coordinator Pattern.

The audit module is a coordinator that calls existing modules + the new observability module. It does NOT reimplement any dimension logic -- it delegates to existing functions and standardizes the output.

### Key Implementation Details

**Coordinator pattern (Decision 4):** `runAudit()` calls 5 dimension checkers sequentially. Each checker wraps an existing module function and maps its output to `DimensionResult`. The coordinator collects all results and computes an overall status.

**Dimension checkers call existing code:**
- Observability: `analyze()` from `src/modules/observability/index.ts` (static) + `validateRuntime()` (runtime)
- Testing: `checkOnlyCoverage()` from `src/lib/coverage.ts` (reads last coverage report without re-running tests)
- Documentation: `scanDocHealth()` from `src/lib/doc-health.ts`
- Verification: read from sprint-state.json or call `parseProof()` from `verify/index.ts`
- Infrastructure: basic Dockerfile existence + format check (full validation is Story 4.1)

**Graceful degradation (AC #6):** Each dimension checker catches its own errors. If Semgrep is not installed, the observability static check returns `warn` with skip reason. If the observability backend is unreachable, runtime check returns `warn`. If no Dockerfile exists, infrastructure returns `fail` with "no Dockerfile found -- run codeharness init". The audit never crashes due to one dimension failing.

**Performance (AC #3, NFR1):** Audit must complete in <30 seconds. Since all dimension checks read cached state or do lightweight scans (no test execution, no Docker builds), this should be achievable. `checkOnlyCoverage` reads the last coverage report. `scanDocHealth` scans file metadata. `analyze` runs Semgrep which typically finishes in <10 seconds. `validateRuntime` checks backend health (3s timeout) and may skip.

**Output format (AC #5, NFR5):** Follow the UX spec prefix format: `[OK]`, `[FAIL]`, `[WARN]`. Use the existing `ok()`, `fail()`, `warn()`, `info()` helpers from `src/lib/output.ts`. For `--json`, use `jsonOutput()`.

**`onboard` alias is NOT this story.** Story 3.3 makes `onboard` an alias for `audit`. This story creates the new `audit` command only.

**`--fix` is NOT this story.** Story 3.2 implements `audit --fix` story generation. This story only does the audit reporting.

### Existing Code to Reuse

- `src/modules/observability/index.ts` -- `analyze()`, `validateRuntime()`, `readCoverageState()` for observability dimension
- `src/lib/coverage.ts` -- `checkOnlyCoverage()`, `evaluateCoverage()` for testing dimension
- `src/lib/doc-health.ts` -- `scanDocHealth()` for documentation dimension
- `src/modules/verify/index.ts` -- `parseProof()` for verification dimension
- `src/lib/output.ts` -- `ok()`, `fail()`, `warn()`, `info()`, `jsonOutput()` for output formatting
- `src/types/result.ts` -- `Result<T>`, `ok()`, `fail()`, `isOk()`, `isFail()` for return types
- `src/commands/onboard.ts` -- reference for command registration pattern and precondition checks (`runPreconditions()` from `src/lib/onboard-checks.ts`)
- `src/lib/state.ts` -- state file reading for verification status

### What This Story Does NOT Include

- No `--fix` flag or story generation -- that's Story 3.2
- No `onboard` alias -- that's Story 3.3
- No full Dockerfile validation against rules -- that's Story 4.1 (here just check existence + basic structural validation)
- No static analysis rule authoring -- that's Epic 1 (done)
- No runtime observability during verification -- that's Story 2.1 (done)
- No hook enforcement -- that's Story 2.2 (done)
- No OpenSearch backend support -- VictoriaLogs only; OpenSearch is future

### Dependencies

- **Depends on:** Story 1.2 (analyzer module, `analyze()`) -- DONE
- **Depends on:** Story 1.3 (coverage state tracking, `readCoverageState()`) -- DONE
- **Depends on:** Story 2.3 (standalone runtime validator, `validateRuntime()`) -- DONE
- **Depended on by:** Story 3.2 (audit --fix, calls `runAudit()`)
- **Depended on by:** Story 3.3 (onboard alias, delegates to audit command)

### File Size Constraint

Each new file must be under 300 lines per NFR9.
- `src/modules/audit/types.ts` -- ~40-50 lines
- `src/modules/audit/dimensions.ts` -- ~150-200 lines (5 checkers)
- `src/modules/audit/index.ts` -- ~60-80 lines (coordinator + barrel)
- `src/modules/audit/report.ts` -- ~80-100 lines (human + JSON formatters)
- `src/commands/audit.ts` -- ~50-70 lines (command registration)

### Previous Story Intelligence (Story 2.3)

- **`validateRuntime()` returns `RuntimeValidationResult`** whose shape includes `coveragePercent`, `skipped`, `skipReason`, and `entries: ModuleTelemetryEntry[]`. The audit coordinator must handle the `skipped: true` case by mapping to `warn` status.
- **Barrel imports only.** Import from `../observability/index.js`, never from internal files like `../observability/runtime-validator.js`.
- **Mock all I/O in tests.** All filesystem, HTTP, and subprocess operations mocked. No real calls.
- **Atomic write pattern** for any state file updates (read-modify-write with temp+rename).
- **`checkBackendHealth` has 3-second timeout.** Audit won't hang waiting for an unreachable backend.
- **`types.ts` is 293 lines.** Near the 300-line NFR9 limit. Do NOT add audit types there -- put them in `src/modules/audit/types.ts`.
- **Story 2.3 explicitly says:** "No CLI command in this story -- the audit command will orchestrate calling this." That's us. We call `validateRuntime()`.

### Git Intelligence

Recent commits show Epic 0.5 (stream-json live activity display) and Epic 2 (runtime observability) completed. The project uses:
- Commander for CLI commands
- `Result<T>` discriminated union for error handling
- tsup for building
- Vitest for testing (2656+ tests as of story 2.3)
- Barrel exports (`index.ts`) for module boundaries

### References

- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 4] -- Audit coordinator pattern
- [Source: _bmad-output/planning-artifacts/architecture-operational-excellence.md#Decision 6] -- Module structure (audit/ directory)
- [Source: _bmad-output/planning-artifacts/epics-operational-excellence.md#Story 3.1] -- Acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd-operational-excellence.md#Audit Command] -- FR13, FR14, FR17-FR21
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Output Patterns] -- Status prefix format
- [Source: src/modules/observability/index.ts] -- analyze(), validateRuntime() exports
- [Source: src/lib/coverage.ts] -- checkOnlyCoverage(), evaluateCoverage()
- [Source: src/lib/doc-health.ts] -- scanDocHealth()
- [Source: src/modules/verify/index.ts] -- parseProof()
- [Source: src/commands/onboard.ts] -- Command registration pattern reference
- [Source: src/lib/onboard-checks.ts] -- runPreconditions() for init check

### Project Structure Notes

- New module: `src/modules/audit/` with `types.ts`, `dimensions.ts`, `index.ts`, `report.ts`, `__tests__/`
- New command: `src/commands/audit.ts`
- No patches created in this story (workflow patches are Epic 5)
- Module follows existing conventions: barrel exports, Result<T> returns, <300 line files

<!-- CODEHARNESS-PATCH-START:story-verification -->
## Verification Requirements

- [ ] Showboat proof document created (`docs/exec-plans/active/3-1-audit-coordinator-dimensions.proof.md`)
- [x] All acceptance criteria verified with real-world evidence
- [x] Test coverage meets target (100% of all new code in src/)

## Documentation Requirements

- [x] Relevant AGENTS.md files updated (src/modules/audit/AGENTS.md)
- [x] Exec-plan created in `docs/exec-plans/active/3-1-audit-coordinator-dimensions.md`

## Testing Requirements

- [x] Unit tests written for all new/changed code
- [x] All I/O mocked (filesystem, subprocess, HTTP)
- [x] Coverage target: 100%
<!-- CODEHARNESS-PATCH-END:story-verification -->

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Implemented audit coordinator module with 5 dimension checkers (observability, testing, documentation, verification, infrastructure)
- Each dimension checker wraps an existing module function and maps output to DimensionResult
- Coordinator uses Promise.all for parallel execution of dimension checkers with performance.now() timing
- Human output uses [OK]/[FAIL]/[WARN] prefix format per UX spec; --json returns structured AuditResult
- Graceful degradation: each checker catches its own errors, returns warn/fail instead of crashing
- CLI command registered as `codeharness audit` with --json option and precondition check for initialization
- 47 new tests across 4 test files, all I/O mocked (filesystem, subprocess, HTTP)
- Build passes, 2769 total tests pass (0 regressions), all files under 300-line NFR9 limit
- Updated cli.test.ts command count from 22 to 23 to include new audit command
- dimensions.ts initially 428 lines; refactored to 197 lines using helper functions to stay under NFR9

### Change Log

- 2026-03-20: Story 3.1 implementation complete — audit coordinator, dimensions, report formatter, CLI command, tests
- 2026-03-20: Senior Developer Review (AI) — adversarial review found 10 issues (2 HIGH, 5 MEDIUM, 3 LOW). Fixed all HIGH and MEDIUM: added 10 new tests covering error paths, catch branches, runtime low-coverage, readdirSafe failure, runAudit failure CLI paths, dimension checker failure handling. Simplified formatAuditJson. 57 tests total, 100% line coverage on all files, 96.71% overall, all files above 80% floor. 2779 total tests, 0 regressions.

### File List

- src/modules/audit/types.ts (new, 43 lines)
- src/modules/audit/dimensions.ts (new, 197 lines)
- src/modules/audit/index.ts (new, 85 lines)
- src/modules/audit/report.ts (new, 62 lines)
- src/modules/audit/AGENTS.md (new)
- src/commands/audit.ts (new, 66 lines)
- src/index.ts (modified — added registerAuditCommand import and registration)
- src/__tests__/cli.test.ts (modified — updated command count from 22 to 23, added 'audit' to expected list)
- src/modules/audit/__tests__/dimensions.test.ts (new, 24 tests)
- src/modules/audit/__tests__/index.test.ts (new, 7 tests)
- src/modules/audit/__tests__/report.test.ts (new, 10 tests)
- src/commands/__tests__/audit.test.ts (new, 6 tests)
- docs/exec-plans/active/3-1-audit-coordinator-dimensions.md (new)
