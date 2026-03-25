# Observability Module

Static analysis of observability coverage (logging gaps, error handler coverage) and coverage state tracking over time.

## Files

- `index.ts` — Public API barrel: re-exports `analyze` from analyzer, `saveCoverageResult`, `readCoverageState`, `getCoverageTrend`, `checkCoverageTarget` from coverage, and all public types.
- `analyzer.ts` — Static analysis runner: `analyze(projectDir, config?)` — runs Semgrep (or skips gracefully if not installed), parses results into tool-agnostic `AnalyzerResult`. Loads rules from primary `patches/observability/` and additional directories (default: `patches/error-handling/`); override via `config.additionalRulesDirs`. Also exports `checkSemgrepInstalled`, `runSemgrep`, `parseSemgrepOutput`, `computeSummary`.
- `coverage.ts` — Coverage state persistence: `saveCoverageResult(projectDir, result)` — writes coverage to sprint-state.json atomically, appends to history. `readCoverageState(projectDir)` — reads typed coverage state. `getCoverageTrend(projectDir)` — compares latest vs previous history entry. `checkCoverageTarget(projectDir, target?)` — checks coverage against target (default 80%).
- `coverage-gate.ts` — Commit gate check: `checkObservabilityCoverageGate(projectDir, overrides?)` — reads cached static and runtime coverage from sprint-state.json, compares against targets. Does NOT re-run Semgrep. Static is always required; runtime only checked when data exists. Returns `ObservabilityCoverageGateResult`.
- `runtime-coverage.ts` — Runtime coverage persistence: `computeRuntimeCoverage(gaps, totalACs)` — computes runtime coverage from verification observability gaps. `saveRuntimeCoverage(projectDir, result)` — writes runtime coverage to sprint-state.json atomically.
- `runtime-validator.ts` — Standalone runtime validator (Story 2.3): `validateRuntime(projectDir, config?)` — runs tests with OTLP enabled, queries VictoriaLogs for telemetry events, computes per-module coverage. `checkBackendHealth(queryEndpoint)` — checks if observability backend is reachable. `queryTelemetryEvents(queryEndpoint, start, end)` — queries VictoriaLogs for events in time window. `mapEventsToModules(events, projectDir, modules?)` — groups events by module name.
- `types.ts` — All interfaces: `AnalyzerResult`, `AnalyzerConfig`, `AnalyzerSummary`, `ObservabilityGap`, `GapSeverity`, `SemgrepRawOutput`, `SemgrepResult`, `ObservabilityCoverageState`, `StaticCoverageState`, `CoverageTargets`, `CoverageHistoryEntry`, `CoverageTrend`, `CoverageTargetResult`, `ObservabilityCoverageGateResult`, `RuntimeCoverageEntry`, `RuntimeCoverageResult`, `RuntimeCoverageState`, `RuntimeValidationConfig`, `ModuleTelemetryEntry`, `RuntimeValidationResult`, `TelemetryEvent`.

## Patterns

- All public functions return `Result<T>` (never throw)
- Atomic writes via temp file + `renameSync` (same pattern as sprint/state.ts)
- ES module imports with `.js` extensions
- Coverage state stored in `sprint-state.json` under `observability` key
- Static and runtime coverage tracked separately (architecture Decision 2)
- Gate checks use cached state only — no Semgrep re-runs in hooks for performance
- Standalone runtime validation: health-check backend first, skip gracefully if unavailable
- Module discovery: scans top-level directories under src/ to determine project modules
