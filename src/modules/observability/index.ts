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
} from './types.js';

export { analyze } from './analyzer.js';
