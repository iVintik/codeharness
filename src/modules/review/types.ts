/**
 * Types for the review module.
 */

/** Result of reviewing a story */
export interface ReviewResult {
  readonly key: string;
  readonly approved: boolean;
  readonly comments: string[];
}
