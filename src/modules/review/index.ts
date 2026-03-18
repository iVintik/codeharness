/**
 * Review module — story review execution.
 */

import { fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { ReviewResult } from './types.js';

export type { ReviewResult };

export function reviewStory(_key: string): Result<ReviewResult> {
  return fail('not implemented');
}
