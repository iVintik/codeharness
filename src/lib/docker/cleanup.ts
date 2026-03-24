/**
 * Docker container cleanup utilities.
 *
 * NOTE: Primary cleanup logic lives in src/modules/infra/container-cleanup.ts.
 * These stubs exist to satisfy the domain directory structure.
 * TODO: Consolidate cleanup logic here if container-cleanup.ts is refactored.
 */

import { isDockerAvailable } from './health.js';

/**
 * Cleans up orphaned containers left behind by previous codeharness runs.
 * Returns the number of containers removed.
 */
export function cleanupOrphanedContainers(): number {
  if (!isDockerAvailable()) {
    return 0;
  }
  // Cleanup logic currently lives in src/modules/infra/container-cleanup.ts
  // This is a placeholder for future consolidation
  return 0;
}

/**
 * Cleans up Docker artifacts created during verify-env runs.
 */
export function cleanupVerifyEnv(): void {
  // Placeholder — verify-env cleanup is handled inline in the verify module
}
