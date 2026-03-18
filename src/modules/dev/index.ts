/**
 * Dev module — story development execution.
 */

import { fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { DevResult } from './types.js';

export type { DevResult };

export function developStory(_key: string): Result<DevResult> {
  return fail('not implemented');
}
