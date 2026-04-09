import { DispatchError } from './agent-dispatch.js';
import { WorkflowError } from './workflow-types.js';
import type { EngineError } from './workflow-types.js';

export function handleDispatchError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (err instanceof WorkflowError) return err;
  if (err instanceof DispatchError) return new WorkflowError(err.message, err.code, taskName, storyKey);
  const message = err instanceof Error ? err.message : String(err);
  return new WorkflowError(message, 'UNKNOWN', taskName, storyKey);
}
