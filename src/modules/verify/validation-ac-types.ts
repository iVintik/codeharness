/**
 * Types for the validation AC registry.
 * Shared across all AC data files.
 */

/** Verification method classification */
export type VerificationMethod = 'cli' | 'integration';

/** AC category for grouping */
export type AcCategory = 'FR' | 'NFR' | 'UX' | 'Regression' | 'ActionItem';

/** A single validation AC entry */
export interface ValidationAC {
  /** Unique AC number (1-79) */
  readonly id: number;
  /** Reference to the requirement (e.g. "FR1", "NFR2", "Regression: 1-1") */
  readonly frRef: string;
  /** Human-readable description of the acceptance criterion */
  readonly description: string;
  /** How this AC can be verified */
  readonly verificationMethod: VerificationMethod;
  /** Optional CLI command or file check that can verify this AC */
  readonly command?: string;
  /** Category for grouping and filtering */
  readonly category: AcCategory;
}
