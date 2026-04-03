/**
 * Model Resolution Module (Story 10-4).
 *
 * Resolves the effective model for a task dispatch using a 3-level cascade:
 *   1. Task-level model (highest priority)
 *   2. Agent-level model
 *   3. Driver default model (lowest priority, must be valid)
 *
 * Architecture reference: Decision 4 in architecture-multi-framework.md.
 */

/**
 * Resolves the effective model string using a task → agent → driver cascade.
 *
 * Empty strings, whitespace-only strings, `null`, and `undefined` are all
 * treated as "not set" and fall through to the next level. Model strings are
 * trimmed before use. The driver's `defaultModel` is the final fallback and
 * must be a non-empty string — if it is falsy and no task/agent model is set,
 * an error is thrown. If task or agent provides a valid model, the driver
 * default is never validated (per architecture Decision 4 nullish-coalescing).
 *
 * @param task   - Object with an optional `model` field (e.g. workflow task)
 * @param agent  - Object with an optional `model` field (e.g. resolved agent config)
 * @param driver - Object with a required `defaultModel` field (e.g. AgentDriver)
 * @returns The resolved model string
 * @throws {Error} If `driver.defaultModel` is empty or falsy
 */
export function resolveModel(
  task: { model?: string | null },
  agent: { model?: string | null },
  driver: { defaultModel: string },
): string {
  const taskModel = task.model?.trim() || undefined;
  const agentModel = agent.model?.trim() || undefined;

  if (taskModel) {
    return taskModel;
  }

  if (agentModel) {
    return agentModel;
  }

  if (!driver.defaultModel?.trim()) {
    throw new Error(
      'Driver has no default model: driver.defaultModel must be a non-empty string',
    );
  }

  return driver.defaultModel;
}
