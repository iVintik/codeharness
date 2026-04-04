/**
 * Validation AC Registry — barrel export for all 79 validation acceptance criteria.
 * Data is split across validation-ac-types.ts and validation-ac-data.ts to comply with NFR18.
 *
 * Story 10-1: Validation AC Suite
 */

export type { ValidationAC, VerificationMethod, AcCategory } from './validation-ac-types.js';

import { FR_ACS, NFR_ACS, UX_ACS, REGRESSION_ACS, ACTION_ITEM_ACS } from './validation-ac-data.js';
import type { ValidationAC, AcCategory } from './validation-ac-types.js';

// Re-export category arrays for direct access
export { FR_ACS, NFR_ACS, UX_ACS, REGRESSION_ACS, ACTION_ITEM_ACS } from './validation-ac-data.js';

/**
 * Complete validation AC registry — 79 entries covering all FRs, NFRs, UX, regression, and action items.
 */
export const VALIDATION_ACS: readonly ValidationAC[] = [
  ...FR_ACS,
  ...NFR_ACS,
  ...UX_ACS,
  ...REGRESSION_ACS,
  ...ACTION_ITEM_ACS,
];

// ─── Helper Functions ────────────────────────────────────────────────────────

/** Get all ACs for a specific category */
export function getACsByCategory(category: AcCategory): readonly ValidationAC[] {
  return VALIDATION_ACS.filter(ac => ac.category === category);
}

/** Get all CLI-verifiable ACs (verificationMethod === 'cli'). */
export function getCliVerifiableACs(): readonly ValidationAC[] {
  return VALIDATION_ACS.filter(ac => ac.verificationMethod === 'cli');
}

/** Get all integration-required ACs (verificationMethod === 'integration'). */
export function getIntegrationRequiredACs(): readonly ValidationAC[] {
  return VALIDATION_ACS.filter(ac => ac.verificationMethod === 'integration');
}

/** Get a single AC by ID */
export function getACById(id: number): ValidationAC | undefined {
  return VALIDATION_ACS.find(ac => ac.id === id);
}
