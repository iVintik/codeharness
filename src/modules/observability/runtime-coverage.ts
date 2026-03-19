/**
 * Runtime coverage computation — tracks observability coverage from verification proofs.
 *
 * Implements Story 2.1: computes runtime coverage from parsed observability gaps
 * and persists results to sprint-state.json under `observability.runtime`.
 * Separate from `coverage.ts` (static coverage) per architecture Decision 2.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { RuntimeCoverageResult, RuntimeCoverageEntry } from './types.js';
import type { ObservabilityGapResult } from '../verify/index.js';

const STATE_FILE = 'sprint-state.json';
const TMP_FILE = '.sprint-state.json.tmp';

/**
 * Compute runtime coverage from parsed observability gap results.
 *
 * Coverage = acsWithLogs / totalACs * 100.
 * Returns 0% coverage when totalACs is 0 (avoids division by zero).
 */
export function computeRuntimeCoverage(
  gapResults: ObservabilityGapResult,
): RuntimeCoverageResult {
  const entries: RuntimeCoverageEntry[] = gapResults.entries.map(entry => ({
    acId: entry.acId,
    logEventsDetected: !entry.hasGap,
    logEventCount: entry.hasGap ? 0 : 1, // Binary: gap means 0, no gap means at least 1
    gapNote: entry.gapNote,
  }));

  const totalACs = gapResults.totalACs;
  const acsWithLogs = gapResults.coveredCount;
  const coveragePercent = totalACs === 0 ? 0 : (acsWithLogs / totalACs) * 100;

  return { entries, totalACs, acsWithLogs, coveragePercent };
}

/**
 * Persist runtime coverage results to sprint-state.json under `observability.runtime`.
 *
 * Uses atomic write (write to temp, then rename) to prevent corruption.
 * Preserves all existing state fields including static coverage data.
 */
export function saveRuntimeCoverage(
  projectDir: string,
  result: RuntimeCoverageResult,
): Result<void> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  // Read existing state
  const fp = join(projectDir, STATE_FILE);
  let state: Record<string, unknown> = {};

  if (existsSync(fp)) {
    try {
      const raw = readFileSync(fp, 'utf-8');
      state = JSON.parse(raw) as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Failed to read ${STATE_FILE}: ${msg}`);
    }
  }

  // Preserve existing observability section
  const existingObs = (state.observability as Record<string, unknown>) ?? {};

  const runtimeState = {
    coveragePercent: result.coveragePercent,
    lastValidationTimestamp: new Date().toISOString(),
    modulesWithTelemetry: result.acsWithLogs,
    totalModules: result.totalACs,
    telemetryDetected: result.acsWithLogs > 0,
  };

  // Preserve existing targets and add runtimeTarget default if missing
  const existingTargets = (existingObs.targets as Record<string, unknown>) ?? {};
  const targets = {
    ...existingTargets,
    runtimeTarget:
      typeof existingTargets.runtimeTarget === 'number'
        ? existingTargets.runtimeTarget
        : 60,
  };

  const updatedState = {
    ...state,
    observability: {
      ...existingObs,
      runtime: runtimeState,
      targets,
    },
  };

  // Atomic write
  try {
    const data = JSON.stringify(updatedState, null, 2) + '\n';
    const tmp = join(projectDir, TMP_FILE);
    const finalPath = join(projectDir, STATE_FILE);
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, finalPath);
    return ok(undefined);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to write ${STATE_FILE}: ${msg}`);
  }
}
