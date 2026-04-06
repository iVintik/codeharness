/** workflow-compiler.ts — pure helpers, no IO, no side effects. Compiler turns YAML configs into XState state configs. */

import { assign } from 'xstate';
import type { WorkflowState, TaskCheckpoint } from './workflow-state.js';
import { DispatchError } from './agent-dispatch.js';
import { WorkflowError, isEngineError, isGateConfig, isForEachConfig } from './workflow-types.js';
import type { EvaluatorVerdict, WorkItem, EngineError, ResolvedTask, StoryContext, DispatchInput, NullTaskInput, DispatchOutput, GateConfig, GateContext, ForEachConfig, FlowStep, IterationContext, CompiledInvokeState, CompiledGateState, CompiledForEachState } from './workflow-types.js';
export { isEngineError, isLoopBlock } from './workflow-types.js';
export type { OutputContract, DriverHealth, WorkItem, EngineError, EngineResult, LoopBlockResult } from './workflow-types.js';

export const HALT_ERROR_CODES = new Set(['RATE_LIMIT', 'NETWORK', 'SDK_INIT']);
export const DEFAULT_MAX_ITERATIONS = 5;
export const PER_RUN_SENTINEL = '__run__';
const DONE_STATE = { type: 'final' } as const;

const stepOnDoneAssign = assign(({ context, event }: { context: StoryContext; event: { output: DispatchOutput } }) => {
  const out = event.output;
  return {
    workflowState: out.updatedState,
    lastContract: out.contract,
    tasksCompleted: context.tasksCompleted + 1,
    accumulatedCostUsd: context.accumulatedCostUsd + out.cost,
    errors: context.errors,
  };
});
const foreachAdvanceAssign = assign(({ context }: { context: IterationContext }) => ({ currentIndex: context.currentIndex + 1, item: context.items[context.currentIndex + 1] }));
const stepInputCache = new WeakMap<ResolvedTask, Map<string, ((args: { context: StoryContext }) => DispatchInput | NullTaskInput)>>();
const gateInputCache = new WeakMap<ResolvedTask, Map<string, ((args: { context: GateContext }) => DispatchInput | NullTaskInput)>>();
const stepHaltErrorAssignCache = new Map<string, ReturnType<typeof assign>>();
const stepFallbackErrorAssignCache = new Map<string, ReturnType<typeof assign>>();
const gateOnDoneAssignCache = new Map<string, ReturnType<typeof assign>>();
const gateErrorAssignCache = new Map<string, ReturnType<typeof assign>>();

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = create();
  map.set(key, created);
  return created;
}

function getCachedStepInput(task: ResolvedTask, step: string): (args: { context: StoryContext }) => DispatchInput | NullTaskInput {
  let byStep = stepInputCache.get(task);
  if (!byStep) stepInputCache.set(task, (byStep = new Map()));
  return getOrCreate(byStep, step, () => task.agent === null
    ? ({ context }: { context: StoryContext }): NullTaskInput => ({ task, taskName: step, storyKey: context.item.key, config: context.config, workflowState: context.workflowState, previousContract: context.lastContract, accumulatedCostUsd: context.accumulatedCostUsd })
    : ({ context }: { context: StoryContext }): DispatchInput => ({ task, taskName: step, storyKey: context.item.key, definition: context.config.agents[task.agent as string], config: context.config, workflowState: context.workflowState, previousContract: context.lastContract, accumulatedCostUsd: context.accumulatedCostUsd }));
}

function getCachedGateInput(task: ResolvedTask, taskName: string): (args: { context: GateContext }) => DispatchInput | NullTaskInput {
  let byStep = gateInputCache.get(task);
  if (!byStep) gateInputCache.set(task, (byStep = new Map()));
  return getOrCreate(byStep, taskName, () => task.agent === null
    ? ({ context }: { context: GateContext }): NullTaskInput => ({ task, taskName, storyKey: context.parentItemKey ? `${context.parentItemKey}:${context.gate.gate}` : context.gate.gate, config: context.config, workflowState: context.workflowState, previousContract: context.lastContract, accumulatedCostUsd: context.accumulatedCostUsd })
    : ({ context }: { context: GateContext }): DispatchInput => ({ task, taskName, storyKey: context.parentItemKey ? `${context.parentItemKey}:${context.gate.gate}` : context.gate.gate, definition: context.config.agents[task.agent as string], config: context.config, workflowState: context.workflowState, previousContract: context.lastContract, accumulatedCostUsd: context.accumulatedCostUsd }));
}

function getStepHaltErrorAssign(step: string) {
  return getOrCreate(stepHaltErrorAssignCache, step, () => assign(({ context, event }: { context: StoryContext; event: { error: unknown } }) => ({ errors: [...context.errors, toEngineError(event.error, step, context.item.key)], halted: true })));
}

function getStepFallbackErrorAssign(step: string) {
  return getOrCreate(stepFallbackErrorAssignCache, step, () => assign(({ context, event }: { context: StoryContext; event: { error: unknown } }) => ({ errors: [...context.errors, toEngineError(event.error, step, context.item.key)] })));
}

function getGateOnDoneAssign(taskName: string) {
  return getOrCreate(gateOnDoneAssignCache, taskName, () => assign(({ context, event }: { context: GateContext; event: { output: DispatchOutput } }) => ({ verdicts: { ...context.verdicts, [taskName]: event.output.contract?.output ?? '' }, workflowState: event.output.updatedState, lastContract: event.output.contract, tasksCompleted: context.tasksCompleted + 1, accumulatedCostUsd: context.accumulatedCostUsd + event.output.cost })));
}

function getGateErrorAssign(taskName: string) {
  return getOrCreate(gateErrorAssignCache, taskName, () => assign(({ context, event }: { context: GateContext; event: { error: unknown } }) => ({ errors: [...context.errors, toEngineError(event.error, taskName, context.gate.gate)] })));
}

export function isTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
): boolean {
  return state.tasks_completed.some(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  );
}

export function isLoopTaskCompleted(
  state: WorkflowState,
  taskName: string,
  storyKey: string,
  iteration: number,
): boolean {
  const count = state.tasks_completed.filter(
    (cp) => cp.task_name === taskName && cp.story_key === storyKey && !cp.error,
  ).length;
  return count >= iteration;
}

export function buildRetryPrompt(storyKey: string, findings: EvaluatorVerdict['findings']): string {
  const failedFindings = findings.filter((f) => f.status === 'fail' || f.status === 'unknown');
  if (failedFindings.length === 0) return `Implement story ${storyKey}`;
  const formatted = failedFindings
    .map((f) => {
      let entry = `AC #${f.ac} (${f.status.toUpperCase()}): ${f.description}`;
      if (f.evidence?.reasoning) entry += `\n  Evidence: ${f.evidence.reasoning}`;
      return entry;
    })
    .join('\n\n');
  return `Retry story ${storyKey}. Previous evaluator findings:\n\n${formatted}\n\nFocus on fixing the failed criteria above. BEFORE finishing: run \`npx eslint src/ --fix\` to auto-fix lint issues, then run \`npx eslint src/\` to verify zero warnings. If warnings remain, fix them manually. Also run \`npm run build\` and \`npx vitest run\` to verify no regressions.`;
}

export function buildAllUnknownVerdict(
  workItems: WorkItem[],
  reasoning: string,
): EvaluatorVerdict {
  const findings = workItems.map((_, index) => ({
    ac: index + 1,
    description: `AC #${index + 1}`,
    status: 'unknown' as const,
    evidence: { commands_run: [] as string[], output_observed: '', reasoning },
  }));
  return { verdict: 'fail', score: { passed: 0, failed: 0, unknown: findings.length, total: findings.length }, findings };
}

export function getFailedItems(verdict: EvaluatorVerdict | null, allItems: WorkItem[]): WorkItem[] {
  if (!verdict) return allItems;
  if (verdict.verdict === 'pass') return [];
  return allItems;
}

export function recordErrorInState(state: WorkflowState, taskName: string, storyKey: string, error: EngineError): WorkflowState {
  const errorCheckpoint: TaskCheckpoint = {
    task_name: taskName, story_key: storyKey, completed_at: new Date().toISOString(),
    error: true, error_message: error.message, error_code: error.code,
  };
  return { ...state, phase: 'error', tasks_completed: [...state.tasks_completed, errorCheckpoint] };
}

export function handleDispatchError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (err instanceof WorkflowError) return err;
  if (err instanceof DispatchError) return new WorkflowError(err.message, err.code, taskName, storyKey);
  const message = err instanceof Error ? err.message : String(err);
  return new WorkflowError(message, 'UNKNOWN', taskName, storyKey);
}

export function compileStep(
  step: string,
  tasks: Record<string, ResolvedTask>,
  nextState: string,
): CompiledInvokeState {
  const task = tasks[step];
  if (!task) {
    throw new Error(`compileStep: task "${step}" not found in workflow tasks map`);
  }

  const isNullTask = task.agent === null;
  const src = isNullTask ? 'nullTaskActor' : 'dispatchActor';

  return {
    invoke: {
      src,
      input: getCachedStepInput(task, step),
      onDone: {
        target: nextState,
        actions: stepOnDoneAssign,
      },
      onError: [
        { guard: 'isAbortError', target: 'interrupted' },
        { guard: 'isHaltError', target: 'halted', actions: getStepHaltErrorAssign(step) },
        { actions: getStepFallbackErrorAssign(step) },
      ],
    },
  };
}

/** Coerces an unknown thrown value to an EngineError shape. */
function toEngineError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (isEngineError(err)) return err;
  return {
    taskName,
    storyKey,
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : String(err),
  };
}

export function compileGate(gate: GateConfig, tasks: Record<string, ResolvedTask>): CompiledGateState {
  for (const t of gate.check) if (!tasks[t]) throw new Error(`compileGate: gate "${gate.gate}" references unknown check task "${t}"`);
  for (const t of gate.fix) if (!tasks[t]) throw new Error(`compileGate: gate "${gate.gate}" references unknown fix task "${t}"`);
  const buildPhaseStates = (names: string[]): Record<string, unknown> => {
    const states: Record<string, unknown> = {};
    names.forEach((taskName, i) => {
      const task = tasks[taskName]!;
      const isNull = task.agent === null;
      const next = i < names.length - 1 ? `step_${i + 1}` : 'done';
      states[`step_${i}`] = {
        invoke: {
          src: isNull ? 'nullTaskActor' : 'dispatchActor',
          input: getCachedGateInput(task, taskName),
          onDone: { target: next, actions: getGateOnDoneAssign(taskName) },
          onError: [
            { guard: 'isAbortError', target: 'interrupted' },
            { guard: 'isHaltError', target: 'halted' },
            { actions: getGateErrorAssign(taskName) },
          ],
        },
      };
    });
    states['done'] = DONE_STATE;
    return states;
  };
  return {
    initial: 'checking',
    states: {
      checking: { initial: 'step_0', onDone: { target: 'evaluate' }, states: buildPhaseStates(gate.check) },
      evaluate: {
        always: [
          { guard: 'allPassed', target: 'passed' },
          { guard: 'maxRetries', target: 'maxedOut' },
          { guard: 'circuitBreaker', target: 'halted' },
          { target: 'fixing' },
        ],
      },
      fixing: { initial: gate.fix.length > 0 ? 'step_0' : 'done', onDone: { target: 'checking' }, states: buildPhaseStates(gate.fix) },
      passed: { type: 'final' }, maxedOut: { type: 'final' }, halted: { type: 'final' }, interrupted: { type: 'final' },
    },
  };
}

export function compileForEach(config: ForEachConfig, tasks: Record<string, ResolvedTask>): CompiledForEachState {
  if (config.steps.length === 0) throw new Error(`compileForEach: "${config.for_each}" has empty steps array`);
  const itemStates = compileSteps(config.steps, tasks);
  return {
    initial: 'processItem',
    states: {
      processItem: { initial: 'step_0', onDone: { target: 'checkNext' }, states: itemStates },
      checkNext: {
        always: [
          { guard: 'hasMoreItems', target: 'processItem', actions: foreachAdvanceAssign },
          { target: 'done' },
        ],
      },
      done: DONE_STATE,
    },
    meta: { scope: config.for_each },
  };
}
/** Chains FlowStep[] into sequential states ending with done:{type:'final'}, throws on unknown step types. */
function compileSteps(steps: FlowStep[], tasks: Record<string, ResolvedTask>): Record<string, unknown> {
  return steps.reduce((states, step, i) => {
    const next = i < steps.length - 1 ? `step_${i + 1}` : 'done';
    if (typeof step === 'string') states[`step_${i}`] = compileStep(step, tasks, next);
    else if (isGateConfig(step)) states[`step_${i}`] = { ...compileGate(step, tasks), onDone: { target: next } };
    else if (isForEachConfig(step)) states[`step_${i}`] = { ...compileForEach(step, tasks), onDone: { target: next } };
    else throw new Error('compileFlow: unsupported step type (legacy LoopBlock? migrate to for_each + gate format)');
    return states;
  }, { done: DONE_STATE } as Record<string, unknown>);
}
/** Compiles FlowStep[] into a sequential machine config: step_0→…→done. Empty → {initial:'done'}. */
export function compileFlow(steps: FlowStep[], tasks: Record<string, ResolvedTask>): { initial: string; states: Record<string, unknown> } {
  return steps.length === 0 ? { initial: 'done', states: { done: DONE_STATE } } : { initial: 'step_0', states: compileSteps(steps, tasks) };
}
