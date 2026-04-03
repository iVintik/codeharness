/**
 * Driver Factory & Registry.
 *
 * Module-singleton registry for AgentDriver instances.
 * Drivers are registered explicitly via registerDriver() — no auto-discovery,
 * no filesystem scanning, no dynamic imports.
 *
 * @see architecture-multi-framework.md — "Register in factory.ts — never auto-discover"
 */

import type { AgentDriver, DriverCapabilities } from '../types.js';

const registry = new Map<string, AgentDriver>();

/**
 * Register an AgentDriver by its `name` property.
 * Throws if a driver with the same name is already registered.
 */
export function registerDriver(driver: AgentDriver): void {
  if (!driver || typeof driver.name !== 'string') {
    throw new Error('registerDriver requires a valid AgentDriver with a string name property.');
  }
  if (!driver.name) {
    throw new Error('Driver name must be a non-empty string.');
  }
  if (registry.has(driver.name)) {
    throw new Error(
      `Driver '${driver.name}' is already registered. Each driver name must be unique.`,
    );
  }
  registry.set(driver.name, driver);
}

/**
 * Retrieve a registered AgentDriver by name.
 * Throws with a helpful message listing all registered drivers if not found.
 */
export function getDriver(name: string): AgentDriver {
  if (!name || typeof name !== 'string') {
    throw new Error('getDriver requires a non-empty string name.');
  }
  const driver = registry.get(name);
  if (!driver) {
    const registered = [...registry.keys()];
    const list =
      registered.length > 0 ? registered.join(', ') : '(none)';
    throw new Error(
      `Driver '${name}' not found. Registered drivers: ${list}`,
    );
  }
  return driver;
}

/**
 * List all registered driver names.
 * Returns a copy — mutating the returned array does not affect the registry.
 */
export function listDrivers(): string[] {
  return [...registry.keys()];
}

/**
 * Clear all registered drivers. Exported for test isolation.
 */
export function resetDrivers(): void {
  registry.clear();
}

/**
 * Suggest a cheaper registered driver whose capabilities satisfy the required capabilities.
 *
 * Returns the name of the cheapest capable driver if it is cheaper than the current driver,
 * or `null` if the current driver is already the cheapest capable option.
 *
 * @param driverName - The current driver name.
 * @param requiredCaps - Partial capability flags the task requires (only boolean fields checked).
 * @returns The cheaper driver name or null.
 */
export function suggestCheaperDriver(
  driverName: string,
  requiredCaps: Partial<DriverCapabilities>,
): string | null {
  const current = registry.get(driverName);
  if (!current) return null;

  let cheapestName: string | null = null;
  let cheapestTier = Infinity;

  for (const [name, driver] of registry) {
    // Check that this driver satisfies all required boolean capabilities
    let satisfies = true;
    for (const [key, value] of Object.entries(requiredCaps)) {
      if (typeof value === 'boolean' && value === true) {
        if (!(driver.capabilities as Record<string, unknown>)[key]) {
          satisfies = false;
          break;
        }
      }
    }
    if (satisfies && driver.capabilities.costTier < cheapestTier) {
      cheapestTier = driver.capabilities.costTier;
      cheapestName = name;
    }
  }

  if (cheapestName && cheapestTier < current.capabilities.costTier) {
    return cheapestName;
  }
  return null;
}
