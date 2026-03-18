/**
 * Infra module — project initialization, stack management, observability.
 */

import { fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type { ObservabilityBackend } from '../../types/observability.js';
import type { InitOptions, InitResult, StackStatus } from './types.js';

export type { InitOptions, InitResult, StackStatus };

export function initProject(_opts: InitOptions): Result<InitResult> {
  return fail('not implemented');
}

export function ensureStack(): Result<StackStatus> {
  return fail('not implemented');
}

export function cleanupContainers(): Result<void> {
  return fail('not implemented');
}

export function getObservabilityBackend(): ObservabilityBackend {
  throw new Error('not implemented');
}
