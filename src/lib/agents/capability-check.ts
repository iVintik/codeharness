/**
 * Pre-flight capability conflict detection and routing hints.
 *
 * Pure query functions — no side effects, no thrown errors.
 * Called during workflow startup to warn about misconfigurations
 * and suggest cheaper driver alternatives.
 *
 * @see architecture-multi-framework.md — FR36, FR37, FR38
 */

import type { ResolvedWorkflow } from '../workflow-parser.js';
import type { CapabilityWarning, DriverCapabilities } from './types.js';
import { getDriver, suggestCheaperDriver } from './drivers/factory.js';

/**
 * Check all tasks in a workflow for capability conflicts and cost routing hints.
 *
 * Returns an array of CapabilityWarning objects. Each warning is advisory —
 * the caller decides whether to log, display, or ignore them.
 *
 * Conflict detection:
 * - task.plugins.length > 0 && !driver.capabilities.supportsPlugins → warning
 *
 * Cost routing:
 * - If driver.costTier > 2 * cheapestCapable.costTier → advisory
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

    // Determine required capabilities from task configuration
    const requiredCaps: Partial<DriverCapabilities> = {
      ...(hasPlugins ? { supportsPlugins: true } : {}),
    };

    // Cost routing hint
    const cheaper = suggestCheaperDriver(driverName, requiredCaps);
    if (cheaper) {
      const cheaperDriver = getDriver(cheaper);
      // Only emit advisory if current driver costs >2x the cheapest capable
      if (driver.capabilities.costTier > 2 * cheaperDriver.capabilities.costTier) {
        warnings.push({
          taskName,
          driverName,
          capability: 'costTier',
          message: `Advisory: task "${taskName}" uses ${driverName} — ${cheaper} could handle this task at lower cost`,
        });
      }
    }
  }

  return warnings;
}
