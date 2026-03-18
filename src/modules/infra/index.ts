/**
 * Infra module — project initialization, stack management, observability.
 */

import type { Result } from '../../types/result.js';
import type { ObservabilityBackend } from '../../types/observability.js';
import type { InitOptions, InitResult, StackStatus, CleanupResult } from './types.js';
import { initProject as initProjectImpl } from './init-project.js';
import { ensureStack as ensureStackImpl, detectRunningStack, detectPortConflicts } from './stack-management.js';
import { cleanupContainers as cleanupContainersImpl } from './container-cleanup.js';

export type { InitOptions, InitResult, StackStatus };
export type { InitDockerResult, InitBmadResult, InitBeadsResult, InitDocumentationResult } from './types.js';
export type { StackDetectionResult, PortConflictResult, CleanupResult } from './types.js';
// Re-export doc helpers for backward compatibility
export {
  generateAgentsMdContent,
  generateDocsIndexContent,
  getCoverageTool,
  getStackLabel,
  getProjectName,
} from './docs-scaffold.js';

export async function initProject(opts: InitOptions): Promise<Result<InitResult>> {
  return initProjectImpl(opts);
}

export function ensureStack(): Result<StackStatus> {
  return ensureStackImpl();
}

export function cleanupContainers(): Result<CleanupResult> {
  return cleanupContainersImpl();
}

export { detectRunningStack, detectPortConflicts };

export function getObservabilityBackend(): ObservabilityBackend {
  throw new Error('not implemented');
}
