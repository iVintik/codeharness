/**
 * Types for the review module.
 */

/** Result of reviewing a story */
export interface ReviewResult {
  readonly key: string;
  readonly approved: boolean;
  readonly comments: string[];
  /** Milliseconds elapsed during review workflow */
  readonly duration: number;
  /** Captured stdout/stderr summary, truncated to last 200 lines */
  readonly output: string;
}
