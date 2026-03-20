/**
 * Types for audit fix story generation.
 *
 * FR15 (audit --fix generates stories for gaps),
 * NFR6 (generated stories follow BMAD format).
 */

import type { AuditGap } from './types.js';

/** Result of generating (or skipping) a single fix story */
export interface FixStoryResult {
  /** Deterministic key derived from dimension + index */
  readonly key: string;
  /** Absolute path to the generated story file */
  readonly filePath: string;
  /** The audit gap this story addresses */
  readonly gap: AuditGap;
  /** Whether generation was skipped (file already exists) */
  readonly skipped: boolean;
  /** Reason for skipping, if skipped */
  readonly skipReason?: string;
}

/** Aggregated result of generating fix stories for all gaps */
export interface FixGenerationResult {
  /** All story results (created + skipped) */
  readonly stories: FixStoryResult[];
  /** Number of stories actually created */
  readonly created: number;
  /** Number of stories skipped (already existed) */
  readonly skipped: number;
}
