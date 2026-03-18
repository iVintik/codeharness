/**
 * Types for the dev module.
 */

/** Result of developing a story */
export interface DevResult {
  readonly key: string;
  readonly filesChanged: string[];
  readonly testsAdded: number;
  /** Milliseconds elapsed during dev workflow */
  readonly duration: number;
  /** Captured stdout/stderr summary, truncated to last 200 lines */
  readonly output: string;
}
