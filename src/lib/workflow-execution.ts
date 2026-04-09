/** Referential integrity and flow validation helpers used by workflow parsing. */
import { listDrivers } from './agents/drivers/factory.js';
import { listEmbeddedAgents, resolveAgent, AgentResolveError } from './agent-resolver.js';
import type { ForEachConfig, GateConfig } from './workflow-types.js';

export type ForEachBlock = ForEachConfig;
export type GateBlock = GateConfig;
export type ForEachFlowStep = string | ForEachConfig | GateConfig;

/** Built-in epic flow step names that do not need entries in `tasks:`. */
const BUILTIN_EPIC_FLOW_TASKS = new Set(['merge', 'validate', 'story_flow']);

// --- Flow Reference Validation ---

/**
 * Validate that all task references in a flow array point to defined tasks.
 * When `allowBuiltins` is true, built-in epic flow task names are also accepted.
 */
export function validateFlowReferences(
  flow: unknown[],
  taskNames: Set<string>,
  flowLabel: string,
  errors: Array<{ path: string; message: string }>,
  allowBuiltins: boolean,
): void {
  for (let i = 0; i < flow.length; i++) {
    const step = flow[i];
    if (typeof step === 'string') {
      const isValid = taskNames.has(step) || (allowBuiltins && BUILTIN_EPIC_FLOW_TASKS.has(step));
      if (!isValid) {
        errors.push({
          path: `/${flowLabel}/${i}`,
          message: `Task "${step}" referenced in ${flowLabel} but not defined in tasks`,
        });
      }
    } else if (typeof step === 'object' && step !== null && 'loop' in step) {
      const loopBlock = step as { loop: string[] };
      for (let j = 0; j < loopBlock.loop.length; j++) {
        const ref = loopBlock.loop[j];
        const isValid = taskNames.has(ref) || (allowBuiltins && BUILTIN_EPIC_FLOW_TASKS.has(ref));
        if (!isValid) {
          errors.push({
            path: `/${flowLabel}/${i}/loop/${j}`,
            message: `Task "${ref}" referenced in loop but not defined in tasks`,
          });
        }
      }
    }
  }
}

// --- Referential Integrity Validation ---

/**
 * Validate that driver and agent references in tasks point to real registered
 * drivers and resolvable agents. Collects errors into the provided array
 * (does not throw — caller decides when to throw).
 */
export function validateReferentialIntegrity(
  data: { tasks: Record<string, Record<string, unknown>> },
  errors: Array<{ path: string; message: string }>,
): void {
  const registeredDrivers = listDrivers();
  const driverRegistryPopulated = registeredDrivers.length > 0;
  const embeddedAgents = listEmbeddedAgents();

  for (const [taskName, task] of Object.entries(data.tasks)) {
    if (task.driver !== undefined && typeof task.driver === 'string' && driverRegistryPopulated) {
      if (!registeredDrivers.includes(task.driver)) {
        errors.push({
          path: `/tasks/${taskName}/driver`,
          message: `Driver "${task.driver}" not found in task "${taskName}". Registered drivers: ${registeredDrivers.join(', ')}`,
        });
      }
    }

    if (task.agent !== undefined && task.agent !== null && typeof task.agent === 'string') {
      try {
        resolveAgent(task.agent);
      } catch (err: unknown) {
        if (err instanceof AgentResolveError && err.message.startsWith('Embedded agent not found:')) {
          const available = embeddedAgents.length > 0 ? embeddedAgents.join(', ') : '(none)';
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" not found in task "${taskName}". Available agents: ${available}`,
          });
        } else if (err instanceof AgentResolveError) {
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${err.message}`,
          });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({
            path: `/tasks/${taskName}/agent`,
            message: `Agent "${task.agent}" in task "${taskName}" failed to resolve: ${msg}`,
          });
        }
      }
    }
  }
}
