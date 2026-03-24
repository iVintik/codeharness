/**
 * Public API for the coverage subsystem.
 */

// Types
export type {
  CoverageToolInfo,
  CoverageResult,
  CoverageEvaluation,
  FileCoverageEntry,
  PerFileCoverageResult,
} from './types.js';

// Parser
export { parseTestCounts, parseCoverageReport } from './parser.js';

// Runner
export {
  detectCoverageTool,
  getTestCommand,
  runCoverage,
  checkOnlyCoverage,
} from './runner.js';

// Evaluator
export {
  evaluateCoverage,
  updateCoverageState,
  checkPerFileCoverage,
  formatCoverageOutput,
  printCoverageOutput,
} from './evaluator.js';
