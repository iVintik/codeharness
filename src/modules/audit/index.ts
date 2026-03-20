/**
 * Audit coordinator module — public API.
 *
 * Calls all 5 dimension checkers, collects results, computes overall status.
 * Architecture Decision 4: Coordinator Pattern.
 *
 * All consumers should import from this barrel file only.
 */

import { ok } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { AuditResult, DimensionResult, DimensionStatus } from './types.js';
import {
  checkObservability,
  checkTesting,
  checkDocumentation,
  checkVerification,
  checkInfrastructure,
} from './dimensions.js';

// Re-export public types
export type { DimensionStatus, DimensionResult, AuditGap, AuditResult } from './types.js';

// Re-export dimension checkers for direct access
export {
  checkObservability,
  checkTesting,
  checkDocumentation,
  checkVerification,
  checkInfrastructure,
} from './dimensions.js';

// Re-export formatters
export { formatAuditHuman, formatAuditJson } from './report.js';

/**
 * Run full audit across all 5 dimensions.
 * Returns Result<AuditResult> — never throws.
 */
export async function runAudit(projectDir: string): Promise<Result<AuditResult>> {
  const start = performance.now();

  // Run all dimension checkers
  const [
    obsResult,
    testResult,
    docResult,
    verifyResult,
    infraResult,
  ] = await Promise.all([
    checkObservability(projectDir),
    Promise.resolve(checkTesting(projectDir)),
    Promise.resolve(checkDocumentation(projectDir)),
    Promise.resolve(checkVerification(projectDir)),
    Promise.resolve(checkInfrastructure(projectDir)),
  ]);

  // Collect dimension results
  const dimensions: Record<string, DimensionResult> = {};
  const allResults = [obsResult, testResult, docResult, verifyResult, infraResult];

  for (const result of allResults) {
    if (result.success) {
      dimensions[result.data.name] = result.data;
    }
  }

  // Compute overall status
  const statuses = Object.values(dimensions).map(d => d.status);
  const overallStatus = computeOverallStatus(statuses);

  // Count total gaps
  const gapCount = Object.values(dimensions)
    .reduce((sum, d) => sum + d.gaps.length, 0);

  const durationMs = Math.round(performance.now() - start);

  return ok({ dimensions, overallStatus, gapCount, durationMs });
}

function computeOverallStatus(statuses: DimensionStatus[]): DimensionStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}
