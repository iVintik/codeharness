import { setup, assign, fromPromise, createActor } from 'xstate';
import { warn } from './output.js';
import { DispatchError } from './agent-dispatch.js';
import type { StreamEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedTask, LoopBlock } from './workflow-parser.js';
import { parseVerdict } from './verdict-parser.js';
import { evaluateProgress } from './circuit-breaker.js';
import { writeWorkflowState } from './workflow-state.js';
import type { WorkflowState, EvaluatorScore } from './workflow-state.js';
import { dispatchTaskCore, nullTaskCore } from './workflow-actors.js';
import type { EngineConfig, LoopMachineContext } from './workflow-types.js';
import { HALT_ERROR_CODES, DEFAULT_MAX_ITERATIONS, isLoopTaskCompleted, buildRetryPrompt, getFailedItems, recordErrorInState, isEngineError, handleDispatchError } from './workflow-compiler.js';
import type { WorkItem, LoopBlockResult, OutputContract } from './workflow-compiler.js';

const loopIterationActor = fromPromise(async ({ input }: { input: LoopMachineContext }): Promise<LoopMachineContext> => {
  const { loopBlock, config, workItems, storyFlowTasks, onStreamEvent } = input;
  const { errors } = input;
  let { currentState, tasksCompleted, lastContract, lastVerdict, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const RUN_SENTINEL = '__run__';
  const verdictTaskNames = input.verdictTaskNames ?? new Set<string>();
  const lastAgentTaskInLoop = (() => {
    const preferredTasks = verdictTaskNames.size > 0
      ? loopBlock.loop.filter((tn) => verdictTaskNames.has(tn))
      : loopBlock.loop;
    for (let i = preferredTasks.length - 1; i >= 0; i--) {
      const tn = preferredTasks[i]; const t = config.workflow.tasks[tn];
      if (t && t.agent !== null) return tn;
    }
    return preferredTasks[preferredTasks.length - 1] ?? loopBlock.loop[loopBlock.loop.length - 1];
  })();
  // NOTE: evaluator_scores, circuit_breaker, and iteration are reset by the
  // caller (storyFlowActor/epicStepActor) BEFORE invoking executeLoopBlock.
  // Each loop block starts fresh.
  const allCurrentIterationDone = currentState.iteration > 0 && loopBlock.loop.every((tn) => {
    const t = config.workflow.tasks[tn];
    return !t || (storyFlowTasks?.has(tn) ? workItems.every((i) => isLoopTaskCompleted(currentState, tn, i.key, currentState.iteration)) : isLoopTaskCompleted(currentState, tn, RUN_SENTINEL, currentState.iteration));
  });
  if (currentState.iteration === 0 || allCurrentIterationDone) {
    currentState = { ...currentState, iteration: currentState.iteration + 1 };
    writeWorkflowState(currentState, projectDir);
  }
  let haltedInLoop = false;
  for (const taskName of loopBlock.loop) {
    const task = config.workflow.tasks[taskName];
    if (!task) { warn(`workflow-machine: task "${taskName}" not found in workflow tasks, skipping`); continue; }
    if (task.agent === null) {
      const items = storyFlowTasks?.has(taskName) ? (lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems) : [{ key: RUN_SENTINEL, source: 'sprint' as const }];
      for (const item of items) {
        if (isLoopTaskCompleted(currentState, taskName, item.key, currentState.iteration)) { warn(`workflow-machine: skipping completed task ${taskName} for ${item.key}`); continue; }
        try {
          const nr = await nullTaskCore({ task, taskName, storyKey: item.key, config, workflowState: currentState, previousContract: lastContract, accumulatedCostUsd });
          currentState = nr.updatedState; lastContract = nr.contract; tasksCompleted++;
        } catch (err: unknown) { // IGNORE: null task error — record and continue
          const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, item.key);
          errors.push(engineError); currentState = recordErrorInState(currentState, taskName, item.key, engineError); writeWorkflowState(currentState, projectDir);
        }
      }
      continue;
    }
    const definition = config.agents[task.agent];
    if (!definition) { warn(`workflow-machine: agent "${task.agent}" not found for task "${taskName}", skipping`); continue; }
    const items = storyFlowTasks?.has(taskName) ? (lastVerdict ? getFailedItems(lastVerdict, workItems) : workItems) : [{ key: RUN_SENTINEL, source: 'sprint' as const }];
    for (const item of items) {
      if (isLoopTaskCompleted(currentState, taskName, item.key, currentState.iteration)) { warn(`workflow-machine: skipping completed task ${taskName} for ${item.key}`); continue; }
      const prompt = lastVerdict ? buildRetryPrompt(item.key, lastVerdict.findings) : undefined;
      try {
        const dr = await dispatchTaskCore({ task, taskName, storyKey: item.key, definition, config, workflowState: currentState, previousContract: lastContract, onStreamEvent, customPrompt: prompt });
        currentState = dr.updatedState; lastContract = dr.contract; accumulatedCostUsd += dr.contract?.cost_usd ?? 0; tasksCompleted++;
        if (taskName === lastAgentTaskInLoop) {
          // Parse verdict from XML tags. One format everywhere.
          const verdict = parseVerdict(dr.output);
          lastVerdict = verdict;
          if (verdict) {
            const score: EvaluatorScore = { iteration: currentState.iteration, passed: verdict.score.passed, failed: verdict.score.failed, unknown: verdict.score.unknown, total: verdict.score.total, timestamp: new Date().toISOString() };
            currentState = { ...currentState, evaluator_scores: [...currentState.evaluator_scores, score] };
          }
          const cbDecision = evaluateProgress(currentState.evaluator_scores);
          if (cbDecision.halt) { currentState = { ...currentState, circuit_breaker: { triggered: true, reason: cbDecision.reason, score_history: cbDecision.scoreHistory } }; }
          writeWorkflowState(currentState, projectDir);
        }
      } catch (err: unknown) {
        const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, item.key);
        errors.push(engineError); currentState = recordErrorInState(currentState, taskName, item.key, engineError); writeWorkflowState(currentState, projectDir);
        if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) { haltedInLoop = true; break; }
      }
    }
    if (haltedInLoop) break;
  }
  if (tasksCompleted === 0 && !haltedInLoop && errors.length > 0) { warn(`workflow-machine: loop iteration produced zero completions with ${errors.length} error(s) — halting to prevent infinite loop`); haltedInLoop = true; }
  return { ...input, currentState, errors, tasksCompleted, halted: haltedInLoop, lastContract, lastVerdict, accumulatedCostUsd };
});

const loopMachine = setup({
  types: {} as { context: LoopMachineContext; input: LoopMachineContext },
  actors: { loopIterationActor },
  guards: {
    halted: ({ context }) => context.halted,
    verdictPass: ({ context }) => context.lastVerdict?.verdict === 'pass',
    maxIterations: ({ context }) => context.currentState.iteration >= context.maxIterations,
    circuitBreaker: ({ context }) => context.currentState.circuit_breaker.triggered,
  },
}).createMachine({
  id: 'loopBlock',
  context: ({ input }) => input,
  initial: 'checkEmpty',
  states: {
    checkEmpty: {
      always: [
        { guard: ({ context }) => context.loopBlock.loop.length === 0, target: 'done' },
        { target: 'iterating' },
      ],
    },
    iterating: {
      invoke: {
        src: 'loopIterationActor',
        input: ({ context }) => context,
        onDone: { target: 'checkTermination', actions: assign(({ event }) => event.output) },
        onError: { target: 'halted' },
      },
    },
    checkTermination: {
      always: [
        { guard: 'halted', target: 'halted' },
        { guard: 'verdictPass', target: 'done' },
        { guard: 'maxIterations', target: 'maxIterationsReached' },
        { guard: 'circuitBreaker', target: 'circuitBreakerTriggered' },
        { target: 'iterating' },
      ],
    },
    done: { type: 'final' },
    halted: { type: 'final' },
    maxIterationsReached: {
      type: 'final',
      entry: [
        assign(({ context }) => ({ ...context, currentState: { ...context.currentState, phase: 'max-iterations' } })),
        ({ context }: { context: LoopMachineContext }) => { writeWorkflowState(context.currentState, context.config.projectDir ?? process.cwd()); },
      ],
    },
    circuitBreakerTriggered: {
      type: 'final',
      entry: [
        assign(({ context }) => ({ ...context, currentState: { ...context.currentState, phase: 'circuit-breaker' } })),
        ({ context }: { context: LoopMachineContext }) => { writeWorkflowState(context.currentState, context.config.projectDir ?? process.cwd()); },
      ],
    },
  },
});

export async function executeLoopBlock(loopBlock: LoopBlock, state: WorkflowState, config: EngineConfig, workItems: WorkItem[], initialContract?: OutputContract | null, storyFlowTasks?: Set<string>, onStreamEvent?: (event: StreamEvent, driverName?: string) => void, verdictTaskNames?: Set<string>): Promise<LoopBlockResult> {
  const input: LoopMachineContext = { loopBlock, config, workItems, storyFlowTasks, verdictTaskNames, onStreamEvent, maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS, currentState: state, errors: [], tasksCompleted: 0, halted: false, lastContract: initialContract ?? null, lastVerdict: null, accumulatedCostUsd: 0 };
  const actor = createActor(loopMachine, { input });
  return new Promise<LoopBlockResult>((resolve) => {
    actor.subscribe({ complete: () => {
      const ctx = actor.getSnapshot().context;
      resolve({ state: ctx.currentState, errors: ctx.errors, tasksCompleted: ctx.tasksCompleted, halted: ctx.halted, lastContract: ctx.lastContract });
    }});
    actor.start();
  });
}

export async function dispatchTask(task: ResolvedTask, taskName: string, storyKey: string, definition: SubagentDefinition, state: WorkflowState, config: EngineConfig, customPrompt?: string, previousOutputContract?: OutputContract): Promise<WorkflowState> {
  const result = await dispatchTaskCore({ task, taskName, storyKey, definition, config, workflowState: state, previousContract: previousOutputContract ?? null, customPrompt });
  return result.updatedState;
}

