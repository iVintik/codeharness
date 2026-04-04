/**
 * Pre-flight capability conflict detection.
 *
 * Pure query functions — no side effects, no thrown errors.
 * Called during workflow startup to warn about misconfigurations.
 *
 * @see architecture-multi-framework.md — FR36, FR37, FR38
 */

import type { ResolvedWorkflow } from '../workflow-parser.js';
import type { CapabilityWarning } from './types.js';
import { getDriver } from './drivers/factory.js';

/**
 * Check all tasks in a workflow for capability conflicts.
 *
 * Returns an array of CapabilityWarning objects. Each warning is advisory —
 * the caller decides whether to log, display, or ignore them.
 *
 * Conflict detection:
 * - task.plugins.length > 0 && !driver.capabilities.supportsPlugins → warning
 *
 * @param workflow - The resolved workflow to check.
 * @returns Array of capability warnings (empty if no issues found).
 */
export function checkCapabilityConflicts(workflow: ResolvedWorkflow): CapabilityWarning[] {
  const warnings: CapabilityWarning[] = [];

  for (const [taskName, task] of Object.entries(workflow.tasks)) {
    const driverName = task.driver ?? 'claude-code';

    let driver;
    try {
      driver = getDriver(driverName);
    } catch { // IGNORE: driver not found — skip (health check catches this separately)
      continue;
    }

    // Check: plugins required but driver doesn't support them
    const hasPlugins = task.plugins && task.plugins.length > 0;
    if (hasPlugins && !driver.capabilities.supportsPlugins) {
      warnings.push({
        taskName,
        driverName,
        capability: 'supportsPlugins',
        message: `Task "${taskName}" requires plugins but driver "${driverName}" does not support plugins (supportsPlugins: false)`,
      });
    }
  }

  return warnings;
}
