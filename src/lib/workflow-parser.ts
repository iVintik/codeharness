import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateWorkflowSchema } from './schema-validate.js';

// --- Interfaces ---

export interface ResolvedTask {
  agent: string;
  scope: 'per-story' | 'per-run';
  session: 'fresh' | 'continue';
  source_access: boolean;
  prompt_template?: string;
  input_contract?: Record<string, unknown>;
  output_contract?: Record<string, unknown>;
  max_budget_usd?: number;
}

export interface LoopBlock {
  loop: string[];
}

export type FlowStep = string | LoopBlock;

export interface ResolvedWorkflow {
  tasks: Record<string, ResolvedTask>;
  flow: FlowStep[];
}

// --- Error Class ---

export class WorkflowParseError extends Error {
  public readonly errors: Array<{ path: string; message: string }>;

  constructor(message: string, errors?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'WorkflowParseError';
    this.errors = errors ?? [];
  }
}

// --- Parser ---

/**
 * Parse a workflow YAML file from disk, validate it against the JSON schema,
 * check referential integrity, apply defaults, and return a typed ResolvedWorkflow.
 */
export function parseWorkflow(filePath: string): ResolvedWorkflow {
  // 1. Read file
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
    const detail = code === 'ENOENT'
      ? 'File not found'
      : code === 'EACCES'
        ? 'Permission denied'
        : code === 'EISDIR'
          ? 'Path is a directory'
          : 'File not found or unreadable';
    throw new WorkflowParseError(`${detail}: ${filePath}`, [
      { path: filePath, message: detail },
    ]);
  }

  // 2. Parse YAML
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const yamlMsg = err instanceof Error ? err.message : String(err);
    throw new WorkflowParseError(`Invalid YAML syntax: ${yamlMsg}`, [
      { path: filePath, message: yamlMsg },
    ]);
  }

  // 3. Validate against JSON schema
  const result = validateWorkflowSchema(parsed);
  if (!result.valid) {
    const details = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new WorkflowParseError(
      `Schema validation failed: ${details}`,
      result.errors.map((e) => ({ path: e.path, message: e.message })),
    );
  }

  // At this point, parsed has passed schema validation — safe to cast
  const data = parsed as { tasks: Record<string, Record<string, unknown>>; flow: unknown[] };

  // 4. Referential integrity check
  const taskNames = new Set(Object.keys(data.tasks));
  const danglingRefs: Array<{ path: string; message: string }> = [];

  for (let i = 0; i < data.flow.length; i++) {
    const step = data.flow[i];
    if (typeof step === 'string') {
      if (!taskNames.has(step)) {
        danglingRefs.push({
          path: `/flow/${i}`,
          message: `Task "${step}" referenced in flow but not defined in tasks`,
        });
      }
    } else if (typeof step === 'object' && step !== null && 'loop' in step) {
      const loopBlock = step as { loop: string[] };
      for (let j = 0; j < loopBlock.loop.length; j++) {
        const ref = loopBlock.loop[j];
        if (!taskNames.has(ref)) {
          danglingRefs.push({
            path: `/flow/${i}/loop/${j}`,
            message: `Task "${ref}" referenced in loop but not defined in tasks`,
          });
        }
      }
    }
  }

  if (danglingRefs.length > 0) {
    const details = danglingRefs.map((e) => e.message).join('; ');
    throw new WorkflowParseError(`Dangling task references: ${details}`, danglingRefs);
  }

  // 5. Apply defaults and build resolved tasks
  const resolvedTasks: Record<string, ResolvedTask> = {};
  for (const [name, task] of Object.entries(data.tasks)) {
    const resolved: ResolvedTask = {
      agent: task.agent as string,
      scope: (task.scope as ResolvedTask['scope']) ?? 'per-story',
      session: (task.session as ResolvedTask['session']) ?? 'fresh',
      source_access: (task.source_access as boolean) ?? true,
    };
    if (task.prompt_template !== undefined) {
      resolved.prompt_template = task.prompt_template as string;
    }
    if (task.input_contract !== undefined) {
      resolved.input_contract = task.input_contract as Record<string, unknown>;
    }
    if (task.output_contract !== undefined) {
      resolved.output_contract = task.output_contract as Record<string, unknown>;
    }
    if (task.max_budget_usd !== undefined) {
      resolved.max_budget_usd = task.max_budget_usd as number;
    }
    resolvedTasks[name] = resolved;
  }

  // 6. Build resolved flow
  const resolvedFlow: FlowStep[] = data.flow.map((step) => {
    if (typeof step === 'string') {
      return step;
    }
    return step as LoopBlock;
  });

  return { tasks: resolvedTasks, flow: resolvedFlow };
}
