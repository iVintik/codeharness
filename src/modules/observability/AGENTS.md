# Observability Module

Static analysis of observability coverage (logging gaps, error handler coverage) and coverage state tracking over time.

## Files

- `index.ts` — Public API barrel: re-exports `analyze` from analyzer, `saveCoverageResult`, `readCoverageState`, `getCoverageTrend`, `checkCoverageTarget` from coverage, and all public types.
- `analyzer.ts` — Static analysis runner: `analyze(projectDir, config?)` — runs Semgrep (or skips gracefully if not installed), parses results into tool-agnostic `AnalyzerResult`. Also exports `checkSemgrepInstalled`, `runSemgrep`, `parseSemgrepOutput`, `computeSummary`.
- `coverage.ts` — Coverage state persistence: `saveCoverageResult(projectDir, result)` — writes coverage to sprint-state.json atomically, appends to history. `readCoverageState(projectDir)` — reads typed coverage state. `getCoverageTrend(projectDir)` — compares latest vs previous history entry. `checkCoverageTarget(projectDir, target?)` — checks coverage against target (default 80%).
- `types.ts` — All interfaces: `AnalyzerResult`, `AnalyzerConfig`, `AnalyzerSummary`, `ObservabilityGap`, `GapSeverity`, `SemgrepRawOutput`, `SemgrepResult`, `ObservabilityCoverageState`, `StaticCoverageState`, `CoverageTargets`, `CoverageHistoryEntry`, `CoverageTrend`, `CoverageTargetResult`.

## Patterns

- All public functions return `Result<T>` (never throw)
- Atomic writes via temp file + `renameSync` (same pattern as sprint/state.ts)
- ES module imports with `.js` extensions
- Coverage state stored in `sprint-state.json` under `observability` key
- Only `static` coverage section implemented; `runtime` deferred to Epic 2
