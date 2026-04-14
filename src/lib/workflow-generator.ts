/**
 * Workflow Generator — translates codeharness workflow DSL + sprint work items
 * into a flow-compatible workflow with native `agent:` steps.
 *
 * This is the bridge between codeharness's domain model (epics, stories, gates,
 * agent tasks) and flow's execution model (YAML steps of type `agent`/`run`/`gate`).
 *
 * Flow agent step shape (what we emit):
 *   {
 *     name: string,
 *     agent: {
 *       provider: 'opencode' | 'claude-code',
 *       prompt: string,
 *       model?: string,
 *       session?: 'fresh' | 'continue',
 *       source_access?: boolean,
 *       plugins?: string[],
 *       allow_tools?: string[],
 *       append_system_prompt?: string,
 *     },
 *     timeout?: string,
 *   }
 *
 * Gates are emitted as `run:` shell steps that invoke `codeharness gate` with
 * flow's native retry handling wrapped around them.
 */

import { isGateConfig, isForEachConfig } from './workflow-types.js';
import { loadWorkItems } from './workflow-work-items.js';
import { normalizeExecutionTarget } from './workflow-target.js';
import { buildTaskPrompt } from './workflow-constants.js';
import { resolveAgent, compileSubagentDefinition } from './agent-resolver.js';
import type { ResolvedWorkflow, FlowStep, GateConfig, ForEachConfig, WorkItem, ResolvedTask } from './workflow-types.js';
import type { SubagentDefinition } from './agent-resolver.js';

/** Native flow agent step specification. */
export interface FlowAgentSpec {
  provider: 'opencode' | 'claude-code';
  prompt: string;
  model?: string;
  session?: 'fresh' | 'continue';
  source_access?: boolean;
  plugins?: string[];
  allow_tools?: string[];
  append_system_prompt?: string;
}

/** A step in the generated flow workflow. */
export interface GeneratedStep {
  name: string;
  /** Either a shell command (for gates) or an agent spec (for task dispatch). */
  run?: string;
  agent?: FlowAgentSpec;
  retry?: number;
  retry_delay?: string;
  timeout?: string;
}

/** The generated flow-compatible workflow object. */
export interface GeneratedWorkflow {
  name: string;
  version?: string;
  steps: GeneratedStep[];
}

/** Options for workflow generation. */
export interface GenerateOptions {
  workflow: ResolvedWorkflow;
  sprintStatusPath: string;
  issuesPath?: string;
  runId: string;
  projectDir: string;
  workflowName?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractEpicId(storyKey: string): string {
  const match = storyKey.match(/^(\d+)-/);
  return match ? match[1] : storyKey;
}

function groupByEpic(items: WorkItem[]): Map<string, WorkItem[]> {
  const epicMap = new Map<string, WorkItem[]>();
  for (const item of items) {
    const epicId = extractEpicId(item.key);
    if (!epicMap.has(epicId)) epicMap.set(epicId, []);
    epicMap.get(epicId)!.push(item);
  }
  return epicMap;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function taskTimeoutStr(task: ResolvedTask): string | undefined {
  if (!task.timeout_minutes) return undefined;
  return `${task.timeout_minutes}m`;
}

// ─── Agent resolution (cached per generation run) ──────────────────

/** Lookup cache so each agent is resolved once per generation. */
class AgentCache {
  private cache = new Map<string, SubagentDefinition | null>();
  constructor(private projectDir: string) {}

  get(agentName: string | null): SubagentDefinition | null {
    if (agentName === null) return null;
    if (this.cache.has(agentName)) return this.cache.get(agentName) ?? null;
    try {
      const resolved = resolveAgent(agentName, { cwd: this.projectDir });
      const compiled = compileSubagentDefinition(resolved);
      this.cache.set(agentName, compiled);
      return compiled;
    } catch { // IGNORE: agent may be missing or malformed — emit step without system prompt
      this.cache.set(agentName, null);
      return null;
    }
  }
}

// ─── Agent spec builders ───────────────────────────────────────────

/**
 * Build a native flow agent spec from a codeharness task definition.
 * Validates that the provider is supported and that at least one prompt can
 * be constructed. Throws on unsupported providers.
 */
function buildAgentSpec(
  task: ResolvedTask,
  taskName: string,
  storyKey: string,
  agents: AgentCache,
): FlowAgentSpec {
  const provider = task.driver ?? 'opencode';
  if (provider !== 'opencode' && provider !== 'claude-code') {
    throw new Error(`Unsupported agent provider "${provider}" for task "${taskName}". Flow supports: opencode, claude-code.`);
  }

  const target = normalizeExecutionTarget(storyKey);
  const prompt = buildTaskPrompt(taskName, target);
  const definition = agents.get(task.agent);

  const spec: FlowAgentSpec = {
    provider,
    prompt,
    session: task.session ?? 'fresh',
  };

  if (task.model) spec.model = task.model;
  if (task.source_access !== undefined) spec.source_access = task.source_access;

  // Provider-specific plugin/tool mapping
  if (task.plugins && task.plugins.length > 0) {
    if (provider === 'opencode') spec.plugins = [...task.plugins];
    else spec.allow_tools = [...task.plugins];
  }

  // Append the compiled agent instructions as system prompt (claude-code supports
  // it directly; opencode ignores but flow records it).
  if (definition?.instructions) {
    spec.append_system_prompt = definition.instructions;
  }

  return spec;
}

/** Build a flow step that invokes `codeharness gate` with flow's retry. */
function buildGateStep(
  name: string,
  gate: GateConfig,
  storyKey: string,
  runId: string,
  projectDir: string,
  workflowName: string,
): GeneratedStep {
  return {
    name,
    run: `codeharness gate --name ${gate.gate} --key ${storyKey} --run-id ${runId} --project-dir ${projectDir} --workflow ${workflowName}`,
    retry: gate.max_retries,
    retry_delay: '1s',
  };
}

/** Build a flow step that dispatches a task via native agent. */
function buildTaskStep(
  name: string,
  taskName: string,
  task: ResolvedTask,
  storyKey: string,
  agents: AgentCache,
): GeneratedStep {
  const step: GeneratedStep = {
    name,
    agent: buildAgentSpec(task, taskName, storyKey, agents),
  };
  const timeout = taskTimeoutStr(task);
  if (timeout) step.timeout = timeout;
  return step;
}

// ─── Flow expansion ────────────────────────────────────────────────

/** Expand a story flow for a single story key into concrete agent/gate steps. */
function expandStoryFlow(
  storyFlow: FlowStep[],
  storyKey: string,
  epicId: string,
  workflow: ResolvedWorkflow,
  agents: AgentCache,
  runId: string,
  projectDir: string,
  workflowName: string,
): GeneratedStep[] {
  const steps: GeneratedStep[] = [];
  const prefix = `e${sanitize(epicId)}-${sanitize(storyKey)}`;

  for (const step of storyFlow) {
    if (typeof step === 'string') {
      const task = workflow.tasks[step];
      if (!task) throw new Error(`Story flow references unknown task "${step}"`);
      steps.push(buildTaskStep(`${prefix}-${step}`, step, task, storyKey, agents));
    } else if (isGateConfig(step)) {
      steps.push(buildGateStep(
        `${prefix}-gate-${sanitize(step.gate)}`,
        step, storyKey, runId, projectDir, workflowName,
      ));
    }
  }

  return steps;
}

/** Expand an epic flow (with story_flow references) for a single epic's stories. */
function expandEpicFlow(
  epicFlow: FlowStep[],
  storyFlow: FlowStep[],
  epicId: string,
  stories: WorkItem[],
  workflow: ResolvedWorkflow,
  agents: AgentCache,
  runId: string,
  projectDir: string,
  workflowName: string,
): GeneratedStep[] {
  const steps: GeneratedStep[] = [];
  const epicKey = `__epic_${epicId}__`;

  for (const step of epicFlow) {
    if (typeof step === 'string') {
      if (step === 'story_flow') {
        for (const story of stories) {
          steps.push(...expandStoryFlow(storyFlow, story.key, epicId, workflow, agents, runId, projectDir, workflowName));
        }
      } else {
        const task = workflow.tasks[step];
        if (!task) throw new Error(`Epic flow references unknown task "${step}"`);
        steps.push(buildTaskStep(`e${sanitize(epicId)}-${step}`, step, task, epicKey, agents));
      }
    } else if (isGateConfig(step)) {
      steps.push(buildGateStep(
        `e${sanitize(epicId)}-gate-${sanitize(step.gate)}`,
        step, epicKey, runId, projectDir, workflowName,
      ));
    }
  }

  return steps;
}

/** Expand sprint-level flow steps (runs once after all epics complete). */
function expandSprintFlow(
  sprintFlow: FlowStep[],
  workflow: ResolvedWorkflow,
  agents: AgentCache,
  runId: string,
  projectDir: string,
  workflowName: string,
): GeneratedStep[] {
  const steps: GeneratedStep[] = [];
  const sprintKey = '__sprint__';

  for (const step of sprintFlow) {
    if (typeof step === 'string') {
      const task = workflow.tasks[step];
      if (!task) throw new Error(`Sprint flow references unknown task "${step}"`);
      steps.push(buildTaskStep(step, step, task, sprintKey, agents));
    } else if (isGateConfig(step)) {
      steps.push(buildGateStep(
        `gate-${sanitize(step.gate)}`,
        step, sprintKey, runId, projectDir, workflowName,
      ));
    }
  }

  return steps;
}

/** Expand a hierarchical workflow block (for_each: epic > for_each: story). */
function expandHierarchical(
  workflowBlock: ForEachConfig,
  workflow: ResolvedWorkflow,
  epicGroups: Map<string, WorkItem[]>,
  agents: AgentCache,
  runId: string,
  projectDir: string,
  workflowName: string,
): GeneratedStep[] {
  const steps: GeneratedStep[] = [];

  for (const [epicId, stories] of epicGroups) {
    const epicKey = `__epic_${epicId}__`;

    for (const step of workflowBlock.steps) {
      if (typeof step === 'string') {
        const task = workflow.tasks[step];
        if (!task) throw new Error(`Hierarchical workflow references unknown task "${step}"`);
        steps.push(buildTaskStep(`e${sanitize(epicId)}-${step}`, step, task, epicKey, agents));
      } else if (isGateConfig(step)) {
        steps.push(buildGateStep(
          `e${sanitize(epicId)}-gate-${sanitize(step.gate)}`,
          step, epicKey, runId, projectDir, workflowName,
        ));
      } else if (isForEachConfig(step)) {
        // Nested for_each: story
        for (const story of stories) {
          const sPrefix = `e${sanitize(epicId)}-${sanitize(story.key)}`;
          for (const storyStep of step.steps) {
            if (typeof storyStep === 'string') {
              const task = workflow.tasks[storyStep];
              if (!task) throw new Error(`Story loop references unknown task "${storyStep}"`);
              steps.push(buildTaskStep(`${sPrefix}-${storyStep}`, storyStep, task, story.key, agents));
            } else if (isGateConfig(storyStep)) {
              steps.push(buildGateStep(
                `${sPrefix}-gate-${sanitize(storyStep.gate)}`,
                storyStep, story.key, runId, projectDir, workflowName,
              ));
            }
          }
        }
      }
    }
  }

  return steps;
}

// ─── Public entry point ────────────────────────────────────────────

/**
 * Generate a flow-compatible workflow from a codeharness workflow definition
 * and sprint work items. Uses native `agent:` step type for task dispatch and
 * `run: codeharness gate` for multi-checker consensus gates.
 */
export function generateFlowWorkflow(options: GenerateOptions): GeneratedWorkflow {
  const {
    workflow,
    sprintStatusPath,
    issuesPath,
    runId,
    projectDir,
    workflowName = 'default',
  } = options;

  const workItems = loadWorkItems(sprintStatusPath, issuesPath);
  const epicGroups = groupByEpic(workItems);
  const agents = new AgentCache(projectDir);

  let steps: GeneratedStep[] = [];

  if (workflow.workflow) {
    // Hierarchical format: workflow.steps with for_each blocks
    steps = expandHierarchical(workflow.workflow, workflow, epicGroups, agents, runId, projectDir, workflowName);
    if (workflow.sprintFlow.length > 0) {
      steps.push(...expandSprintFlow(workflow.sprintFlow, workflow, agents, runId, projectDir, workflowName));
    }
  } else {
    // Flat format: storyFlow + epicFlow + sprintFlow
    for (const [epicId, stories] of epicGroups) {
      steps.push(...expandEpicFlow(
        workflow.epicFlow, workflow.storyFlow, epicId, stories,
        workflow, agents, runId, projectDir, workflowName,
      ));
    }
    if (workflow.sprintFlow.length > 0) {
      steps.push(...expandSprintFlow(workflow.sprintFlow, workflow, agents, runId, projectDir, workflowName));
    }
  }

  if (steps.length === 0) {
    steps.push({ name: 'noop', run: 'echo "No work items found"' });
  }

  return {
    name: `codeharness-${workflowName}`,
    version: '1.0',
    steps,
  };
}

/** Re-export for testing. */
export { extractEpicId, groupByEpic, sanitize };
