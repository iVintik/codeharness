/**
 * Dev module — story development execution.
 * Public interface: only this file should be imported from outside the module.
 */

import type { Result } from '../../types/result.js';
import type { DevResult } from './types.js';
import { invokeBmadDevStory } from './orchestrator.js';

export type { DevResult };

/**
 * Develop a story by invoking the BMAD dev-story workflow.
 * Returns Result<DevResult> — never throws.
 */
export function developStory(
  key: string,
  opts?: { timeoutMs?: number },
): Result<DevResult> {
  return invokeBmadDevStory(key, opts);
}
