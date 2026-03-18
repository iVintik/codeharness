/**
 * Verify module — story verification and proof parsing.
 */

import { fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { VerifyResult, ProofQuality } from './types.js';

export type { VerifyResult, ProofQuality };

export function verifyStory(_key: string): Result<VerifyResult> {
  return fail('not implemented');
}

export function parseProof(_path: string): Result<ProofQuality> {
  return fail('not implemented');
}
