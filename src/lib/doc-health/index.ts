/**
 * Public API for the doc-health subsystem.
 */

// Types
export type { DocHealthResult, DocHealthReport } from './types.js';

// Shared utilities (used by scanner and staleness)
export { getExtension, isTestFile, getNewestSourceMtime } from './types.js';

// Scanner
export { findModules, scanDocHealth } from './scanner.js';

// Staleness
export {
  isDocStale,
  getSourceFilesInModule,
  getMentionedFilesInAgentsMd,
  checkAgentsMdCompleteness,
  checkAgentsMdForModule,
  checkDoNotEditHeaders,
  checkStoryDocFreshness,
} from './staleness.js';

// Report
export {
  formatDocHealthOutput,
  printDocHealthOutput,
  createExecPlan,
  completeExecPlan,
  getExecPlanStatus,
} from './report.js';
