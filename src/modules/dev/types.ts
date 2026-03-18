/**
 * Types for the dev module.
 */

/** Result of developing a story */
export interface DevResult {
  readonly key: string;
  readonly filesChanged: string[];
  readonly testsAdded: number;
}
