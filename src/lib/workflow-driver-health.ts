/**
 * Driver health check — verifies all required agent drivers are available
 * before a workflow run begins. Aggregates results and throws on any failure.
 */

import { getDriver } from './agents/drivers/factory.js';
import { checkCapabilityConflicts } from './agents/capability-check.js';
import type { ResolvedWorkflow } from './workflow-parser.js';
import type { DriverHealth } from './workflow-types.js';

export async function checkDriverHealth(workflow: ResolvedWorkflow, timeoutMs?: number): Promise<void> {
  const driverNames = new Set<string>(
    Object.values(workflow.tasks).filter(t => t.agent !== null).map(t => t.driver ?? 'claude-code'),
  );
  const drivers = new Map<string, ReturnType<typeof getDriver>>();
  for (const name of driverNames) drivers.set(name, getDriver(name));
  interface HealthResult { name: string; health: DriverHealth }
  const responded = new Set<string>();
  const healthChecks = Promise.all([...drivers.entries()].map(async ([name, driver]): Promise<HealthResult> => {
    const health = await driver.healthCheck();
    responded.add(name);
    return { name, health };
  }));
  const effectiveTimeout = timeoutMs ?? 5000;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), effectiveTimeout); });
  const result = await Promise.race([healthChecks, timeoutPromise]);
  if (result === 'timeout') {
    const pending = [...driverNames].filter((n) => !responded.has(n));
    throw new Error(`Driver health check timed out after ${effectiveTimeout}ms. Drivers: ${(pending.length > 0 ? pending : [...driverNames]).join(', ')}`);
  }
  clearTimeout(timer!);
  const failures = result.filter((r) => !r.health.available);
  if (failures.length > 0) throw new Error(`Driver health check failed: ${failures.map((f) => `${f.name}: ${f.health.error ?? 'unavailable'}`).join('; ')}`);
}

export { checkCapabilityConflicts };
