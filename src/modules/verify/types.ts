/**
 * Types for the verify module.
 */

import type { AcResult } from '../../types/state.js';

/** Result of story verification */
export interface VerifyResult {
  readonly passed: boolean;
  readonly acResults: ReadonlyArray<AcResult>;
  readonly proofPath: string | null;
}

/** Quality assessment of a proof document */
export interface ProofQuality {
  readonly valid: boolean;
  readonly completeness: number;
  readonly issues: readonly string[];
}
