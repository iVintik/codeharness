/**
 * Sprint phase time budget awareness.
 * Estimates whether there is enough remaining session time
 * to complete a given phase, and defers if not.
 */

/** Phase time estimates in minutes (from architecture-v3.md). */
export const PHASE_ESTIMATES: Record<string, number> = {
  'create-story': 5,
  'dev-story': 15,
  'code-review': 10,
  'verification': 20,
  'retro': 5,
};

/** Default estimate for unknown phases. */
const DEFAULT_ESTIMATE_MINUTES = 10;

/**
 * Returns true if the phase should be deferred to the next session.
 * A phase should be deferred when the remaining session time is
 * less than the estimated time needed to complete the phase.
 *
 * @param phase - The sprint phase name (e.g. 'dev-story', 'verification')
 * @param remainingMinutes - Minutes remaining in the session budget
 * @returns true if the phase should be deferred
 */
export function shouldDeferPhase(phase: string, remainingMinutes: number): boolean {
  if (Number.isNaN(remainingMinutes)) return true;
  const estimate = PHASE_ESTIMATES[phase] ?? DEFAULT_ESTIMATE_MINUTES;
  return remainingMinutes < estimate;
}

/**
 * Get the time estimate for a given phase.
 *
 * @param phase - The sprint phase name
 * @returns Estimated minutes to complete the phase
 */
export function getPhaseEstimate(phase: string): number {
  return PHASE_ESTIMATES[phase] ?? DEFAULT_ESTIMATE_MINUTES;
}

/**
 * Compute remaining session minutes from start time and total budget.
 *
 * @param sessionStartMs - Session start time in milliseconds (Date.now())
 * @param totalBudgetMinutes - Total session budget in minutes
 * @returns Remaining minutes (floored, minimum 0)
 */
export function computeRemainingMinutes(sessionStartMs: number, totalBudgetMinutes: number): number {
  const elapsedMs = Date.now() - sessionStartMs;
  const elapsedMinutes = elapsedMs / 60_000;
  const remaining = totalBudgetMinutes - elapsedMinutes;
  return Math.max(0, Math.floor(remaining));
}
