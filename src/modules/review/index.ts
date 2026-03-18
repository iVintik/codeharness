/**
 * Review module — story review execution.
 * Public interface: only this file should be imported from outside the module.
 */

import type { Result } from '../../types/result.js';
import type { ReviewResult } from './types.js';
import { invokeBmadCodeReview } from './orchestrator.js';

export type { ReviewResult };

/**
 * Review a story by invoking the BMAD code-review workflow.
 * Returns Result<ReviewResult> — never throws.
 */
export function reviewStory(
  key: string,
  opts?: { timeoutMs?: number },
): Result<ReviewResult> {
  return invokeBmadCodeReview(key, opts);
}
