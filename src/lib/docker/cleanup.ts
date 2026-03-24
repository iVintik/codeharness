/**
 * Docker container cleanup utilities.
 *
 * NOTE: Primary cleanup logic lives in src/modules/infra/container-cleanup.ts.
 * These stubs exist to satisfy the domain directory structure.
 * TODO: Consolidate cleanup logic here if container-cleanup.ts is refactored.
 */

import { cleanupContainers } from '../../modules/infra/container-cleanup.js';

/**
 * Cleans up orphaned containers left behind by previous codeharness runs.
 * Delegates to the infra module's cleanupContainers().
 * Returns the number of containers removed.
 */
export function cleanupOrphanedContainers(): number {
  const result = cleanupContainers();
  return result.success ? result.data.containersRemoved : 0;
}

/**
 * Cleans up Docker artifacts created during verify-env runs.
 */
export function cleanupVerifyEnv(): void {
  // Placeholder — verify-env cleanup is handled inline in the verify module
}
