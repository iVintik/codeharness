/**
 * Observability analyzer module — public API.
 *
 * All consumers should import from this barrel file only.
 * Internal implementation details are not re-exported.
 */

export type {
  AnalyzerResult,
  AnalyzerConfig,
  AnalyzerSummary,
  ObservabilityGap,
  GapSeverity,
  ObservabilityCoverageState,
  CoverageHistoryEntry,
  StaticCoverageState,
  CoverageTargets,
  CoverageTrend,
  CoverageTargetResult,
  RuntimeCoverageEntry,
  RuntimeCoverageResult,
  RuntimeCoverageState,
} from './types.js';

export { analyze } from './analyzer.js';

export {
  saveCoverageResult,
  readCoverageState,
  getCoverageTrend,
  checkCoverageTarget,
} from './coverage.js';

export {
  computeRuntimeCoverage,
  saveRuntimeCoverage,
} from './runtime-coverage.js';
