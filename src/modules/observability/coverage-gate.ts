/**
 * Observability coverage gate — checks if coverage meets targets for commit gating.
 *
 * Implements Story 2.2: reads cached coverage from sprint-state.json and compares
 * against targets. Does NOT re-run Semgrep — uses cached results for performance.
 * Static coverage is always required; runtime is only checked when data exists.
 */

import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import { readCoverageState } from './coverage.js';
import type {
  ObservabilityCoverageGateResult,
  CoverageTargetResult,
} from './types.js';

const DEFAULT_STATIC_TARGET = 80;
const DEFAULT_RUNTIME_TARGET = 60;

/**
 * Check observability coverage against targets for commit gating.
 *
 * Reads static and runtime coverage from sprint-state.json. Static coverage
 * is always checked. Runtime coverage is only checked when runtime data exists
 * in the state file (i.e., after at least one verification run).
 *
 * @param projectDir - Project root directory
 * @param overrides - Optional target overrides
 * @returns Gate result with pass/fail, per-dimension results, and gap summary
 */
export function checkObservabilityCoverageGate(
  projectDir: string,
  overrides?: { staticTarget?: number; runtimeTarget?: number },
): Result<ObservabilityCoverageGateResult> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const stateResult = readCoverageState(projectDir);
  if (!stateResult.success) {
    return fail(stateResult.error);
  }

  const state = stateResult.data;
  const staticTarget =
    overrides?.staticTarget ?? state.targets.staticTarget ?? DEFAULT_STATIC_TARGET;
  const runtimeTarget =
    overrides?.runtimeTarget ?? state.targets.runtimeTarget ?? DEFAULT_RUNTIME_TARGET;

  // Static coverage check (always required)
  const staticCurrent = state.static.coveragePercent;
  const staticMet = staticCurrent >= staticTarget;
  const staticResult: CoverageTargetResult = {
    met: staticMet,
    current: staticCurrent,
    target: staticTarget,
    gap: staticMet ? 0 : staticTarget - staticCurrent,
  };

  // Runtime coverage check (only when runtime data exists)
  let runtimeResult: CoverageTargetResult | null = null;
  if (state.runtime) {
    const runtimeCurrent = state.runtime.coveragePercent;
    const runtimeMet = runtimeCurrent >= runtimeTarget;
    runtimeResult = {
      met: runtimeMet,
      current: runtimeCurrent,
      target: runtimeTarget,
      gap: runtimeMet ? 0 : runtimeTarget - runtimeCurrent,
    };
  }

  // Gate passes only when all checked dimensions pass
  const passed = staticResult.met && (runtimeResult === null || runtimeResult.met);

  // Use cached gaps from the already-parsed state (no second file read)
  const gapSummary = state.static.gaps ? [...state.static.gaps] : [];

  return ok({ passed, staticResult, runtimeResult, gapSummary });
}
