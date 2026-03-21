/**
 * Infra module — project initialization, stack management, observability.
 */

import type { Result } from '../../types/result.js';
import type { ObservabilityBackend } from '../../types/observability.js';
import type { InitOptions, InitResult, StackStatus, CleanupResult } from './types.js';
import { initProject as initProjectImpl } from './init-project.js';
import { ensureStack as ensureStackImpl, detectRunningStack, detectPortConflicts } from './stack-management.js';
import { cleanupContainers as cleanupContainersImpl } from './container-cleanup.js';
import { createObservabilityBackend } from './observability.js';

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

// Dockerfile validation (Story 4.1)
export { validateDockerfile, loadRules } from './dockerfile-validator.js';
export type { DockerfileValidationResult, DockerfileGap } from './dockerfile-validator.js';

// Dockerfile template generation (Story 4.2)
export { generateDockerfileTemplate } from './dockerfile-template.js';
export type { DockerfileTemplateResult } from './dockerfile-template.js';

export function getObservabilityBackend(config?: {
  opensearchUrl?: string;
  opensearch?: { logsIndex?: string; metricsIndex?: string; tracesIndex?: string };
  victoria?: { logsUrl?: string; metricsUrl?: string; tracesUrl?: string };
}): ObservabilityBackend {
  return createObservabilityBackend(config);
}
