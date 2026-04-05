import { setup, assign, fromPromise, createActor } from 'xstate';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './output.js';
import { DispatchError } from './agent-dispatch.js';
import type { StreamEvent } from './agents/stream-parser.js';
import type { SubagentDefinition } from './agent-resolver.js';
import type { ResolvedTask } from './workflow-parser.js';
import { extractTag, parseVerdict } from './verdict-parser.js';
import { evaluateProgress } from './circuit-breaker.js';
import { writeWorkflowState } from './workflow-state.js';
import type { WorkflowState, EvaluatorScore } from './workflow-state.js';
import { dispatchTaskCore, nullTaskCore } from './workflow-actors.js';
import type { EngineConfig, LoopMachineContext, EpicMachineContext, RunMachineContext, StoryFlowInput, StoryFlowOutput } from './workflow-types.js';
import { HALT_ERROR_CODES, DEFAULT_MAX_ITERATIONS, isTaskCompleted, isLoopTaskCompleted, buildRetryPrompt, getFailedItems, isLoopBlock, recordErrorInState, isEngineError, handleDispatchError } from './workflow-compiler.js';
import type { EngineError, WorkItem, LoopBlockResult, OutputContract } from './workflow-compiler.js';

const loopIterationActor = fromPromise(async ({ input }: { input: LoopMachineContext }): Promise<LoopMachineContext> => {
  const { loopBlock, config, workItems, storyFlowTasks, onStreamEvent } = input;
  const { errors } = input;
  let { currentState, tasksCompleted, lastContract, lastVerdict, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const RUN_SENTINEL = '__run__';
  const lastAgentTaskInLoop = (() => {
    for (let i = loopBlock.loop.length - 1; i >= 0; i--) {
      const tn = loopBlock.loop[i]; const t = config.workflow.tasks[tn];
      if (t && t.agent !== null) return tn;
    }
    return loopBlock.loop[loopBlock.loop.length - 1];
  })();
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

export async function executeLoopBlock(loopBlock: LoopBlock, state: WorkflowState, config: EngineConfig, workItems: WorkItem[], initialContract?: OutputContract | null, storyFlowTasks?: Set<string>, onStreamEvent?: (event: StreamEvent, driverName?: string) => void): Promise<LoopBlockResult> {
  const input: LoopMachineContext = { loopBlock, config, workItems, storyFlowTasks, onStreamEvent, maxIterations: config.maxIterations ?? DEFAULT_MAX_ITERATIONS, currentState: state, errors: [], tasksCompleted: 0, halted: false, lastContract: initialContract ?? null, lastVerdict: null, accumulatedCostUsd: 0 };
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

function collectGuideFiles(epicItems: WorkItem[], epicSentinel: string, projectDir: string): string[] {
  const guidesDir = join(projectDir, '.codeharness', 'verify-guides');
  const guideFiles: string[] = [];
  try { mkdirSync(guidesDir, { recursive: true }); } catch { return guideFiles; } // IGNORE: can't create guides dir
  for (const item of epicItems) {
    try {
      const contractPath = join(projectDir, '.codeharness', 'contracts', `document-${item.key}.json`);
      if (existsSync(contractPath)) {
        const contractData = JSON.parse(readFileSync(contractPath, 'utf-8')) as { output?: string };
        const docs = contractData.output ? extractTag(contractData.output, 'user-docs') ?? contractData.output : null;
        if (docs) { const guidePath = join(guidesDir, `${item.key}-guide.md`); writeFileSync(guidePath, docs, 'utf-8'); guideFiles.push(guidePath); }
      }
    } catch { /* IGNORE: individual guide file failure */ }
  }
  try {
    const deployContractPath = join(projectDir, '.codeharness', 'contracts', `deploy-${epicSentinel}.json`);
    if (existsSync(deployContractPath)) {
      const deployData = JSON.parse(readFileSync(deployContractPath, 'utf-8')) as { output?: string };
      const report = deployData.output ? extractTag(deployData.output, 'deploy-report') ?? deployData.output : null;
      if (report) { const deployPath = join(guidesDir, 'deploy-info.md'); writeFileSync(deployPath, report, 'utf-8'); guideFiles.push(deployPath); }
    }
  } catch { /* IGNORE: deploy contract read failure */ }
  return guideFiles;
}

function cleanupGuideFiles(projectDir: string): void {
  const guidesDir = join(projectDir, '.codeharness', 'verify-guides');
  try { rmSync(guidesDir, { recursive: true, force: true }); } catch { /* IGNORE: cleanup is best-effort */ }
}

const storyFlowActor = fromPromise(async ({ input }: { input: StoryFlowInput }): Promise<StoryFlowOutput> => {
  const { item, config, storyFlowTasks } = input;
  let { workflowState: state, lastContract, accumulatedCostUsd } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const errors: EngineError[] = [];
  let tasksCompleted = 0;
  let halted = false;
  for (const storyStep of config.workflow.storyFlow) {
    if (halted || config.abortSignal?.aborted) { halted = true; break; }
    if (isLoopBlock(storyStep)) {
      const loopResult = await executeLoopBlock(storyStep, state, config, [item], lastContract, storyFlowTasks);
      state = loopResult.state; errors.push(...loopResult.errors); tasksCompleted += loopResult.tasksCompleted; lastContract = loopResult.lastContract;
      if (loopResult.halted) { halted = true; break; }
      if (state.phase === 'max-iterations' || state.phase === 'circuit-breaker') { state = { ...state, phase: 'executing' }; break; }
      continue;
    }
    if (typeof storyStep !== 'string') continue;
    const taskName = storyStep;
    const task = config.workflow.tasks[taskName];
    if (!task) { warn(`workflow-machine: task "${taskName}" not found in workflow tasks, skipping`); continue; }
    if (task.agent === null) {
      if (isTaskCompleted(state, taskName, item.key)) continue;
      try {
        const nr = await nullTaskCore({ task, taskName, storyKey: item.key, config, workflowState: state, previousContract: lastContract, accumulatedCostUsd });
        state = nr.updatedState; lastContract = nr.contract; tasksCompleted++;
      } catch (err: unknown) { // IGNORE: null task error — record and continue
        const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, item.key);
        errors.push(engineError); state = recordErrorInState(state, taskName, item.key, engineError); writeWorkflowState(state, projectDir); break;
      }
      continue;
    }
    const definition = config.agents[task.agent];
    if (!definition) { warn(`workflow-machine: agent "${task.agent}" not found for task "${taskName}", skipping`); continue; }
    if (isTaskCompleted(state, taskName, item.key)) continue;
    try {
      const dr = await dispatchTaskCore({ task, taskName, storyKey: item.key, definition, config, workflowState: state, previousContract: lastContract });
      state = dr.updatedState; lastContract = dr.contract; accumulatedCostUsd += dr.contract?.cost_usd ?? 0; tasksCompleted++;
    } catch (err: unknown) {
      const engineError = handleDispatchError(err, taskName, item.key);
      errors.push(engineError);
      if (config.onEvent) config.onEvent({ type: 'dispatch-error', taskName, storyKey: item.key, error: { code: engineError.code, message: engineError.message } });
      state = recordErrorInState(state, taskName, item.key, engineError); writeWorkflowState(state, projectDir);
      if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) halted = true;
      break;
    }
  }
  if (!halted && config.onEvent) config.onEvent({ type: 'story-done', taskName: 'story_flow', storyKey: item.key });
  return { workflowState: state, errors, tasksCompleted, lastContract, accumulatedCostUsd, halted };
});

const epicStepActor = fromPromise(async ({ input }: { input: EpicMachineContext }): Promise<EpicMachineContext> => {
  const { epicId, epicItems, config, storyFlowTasks } = input;
  const { errors, storiesProcessed, currentStepIndex } = input;
  let { workflowState: state, tasksCompleted, lastContract, accumulatedCostUsd, halted } = input;
  const projectDir = config.projectDir ?? process.cwd();
  const step = config.workflow.epicFlow[currentStepIndex];
  if (!step || halted || config.abortSignal?.aborted) {
    if (config.abortSignal?.aborted) { state = { ...state, phase: 'interrupted' }; writeWorkflowState(state, projectDir); }
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted: true, currentStepIndex };
  }
  if (step === 'story_flow') {
    for (const item of epicItems) {
      if (halted || config.abortSignal?.aborted) { halted = true; break; }
      storiesProcessed.add(item.key);
      const storyResult = await new Promise<StoryFlowOutput>((resolve, reject) => {
        const a = createActor(storyFlowActor, { input: { item, config, workflowState: state, lastContract, accumulatedCostUsd, storyFlowTasks } });
        a.subscribe({ complete: () => resolve(a.getSnapshot().output!), error: reject });
        a.start();
      });
      state = storyResult.workflowState; errors.push(...storyResult.errors); tasksCompleted += storyResult.tasksCompleted;
      lastContract = storyResult.lastContract; accumulatedCostUsd = storyResult.accumulatedCostUsd;
      if (storyResult.halted) { halted = true; break; }
    }
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
  }
  if (isLoopBlock(step)) {
    const loopResult = await executeLoopBlock(step, state, config, epicItems, lastContract, storyFlowTasks);
    state = loopResult.state; errors.push(...loopResult.errors); tasksCompleted += loopResult.tasksCompleted; lastContract = loopResult.lastContract;
    for (const item of epicItems) storiesProcessed.add(item.key);
    if (loopResult.halted || state.phase === 'max-iterations' || state.phase === 'circuit-breaker') halted = true;
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
  }
  const taskName = step as string;
  const task = config.workflow.tasks[taskName];
  if (!task) { warn(`workflow-machine: task "${taskName}" not found in workflow tasks, skipping`); return { ...input, currentStepIndex: currentStepIndex + 1 }; }
  const epicSentinel = `__epic_${epicId}__`;
  if (task.agent === null) {
    if (!isTaskCompleted(state, taskName, epicSentinel)) {
      try {
        const nr = await nullTaskCore({ task, taskName, storyKey: epicSentinel, config, workflowState: state, previousContract: lastContract, accumulatedCostUsd });
        state = nr.updatedState; lastContract = nr.contract; tasksCompleted++;
      } catch (err: unknown) { // IGNORE: null task error — record and continue
        const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, epicSentinel);
        errors.push(engineError); state = recordErrorInState(state, taskName, epicSentinel, engineError); writeWorkflowState(state, projectDir);
      }
    }
    return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
  }
  const definition = config.agents[task.agent];
  if (!definition) { warn(`workflow-machine: agent "${task.agent}" not found for task "${taskName}", skipping`); return { ...input, currentStepIndex: currentStepIndex + 1 }; }
  if (isTaskCompleted(state, taskName, epicSentinel)) return { ...input, currentStepIndex: currentStepIndex + 1 };
  let guideFiles: string[] = [];
  if (task.source_access === false) guideFiles = collectGuideFiles(epicItems, epicSentinel, projectDir);
  try {
    const dr = await dispatchTaskCore({ task, taskName, storyKey: epicSentinel, definition, config, workflowState: state, previousContract: lastContract, storyFiles: guideFiles });
    state = dr.updatedState; lastContract = dr.contract; accumulatedCostUsd += dr.contract?.cost_usd ?? 0; tasksCompleted++;
  } catch (err: unknown) {
    const engineError = isEngineError(err) ? err : handleDispatchError(err, taskName, epicSentinel);
    errors.push(engineError);
    if (config.onEvent) config.onEvent({ type: 'dispatch-error', taskName, storyKey: epicSentinel, error: { code: engineError.code, message: engineError.message } });
    state = recordErrorInState(state, taskName, epicSentinel, engineError); writeWorkflowState(state, projectDir);
    if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) halted = true;
  } finally {
    if (guideFiles.length > 0) cleanupGuideFiles(projectDir);
  }
  return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentStepIndex: currentStepIndex + 1 };
});

const epicMachine = setup({
  types: {} as { context: EpicMachineContext; input: EpicMachineContext },
  actors: { epicStepActor },
  guards: {
    epicDone: ({ context }) => context.halted || context.currentStepIndex >= context.config.workflow.epicFlow.length,
  },
}).createMachine({
  id: 'epic',
  context: ({ input }) => input,
  initial: 'processingStep',
  states: {
    processingStep: {
      invoke: {
        src: 'epicStepActor',
        input: ({ context }) => context,
        onDone: { target: 'checkNext', actions: assign(({ event }) => event.output) },
        onError: {
          target: 'done',
          actions: assign(({ context, event }) => ({ ...context, errors: [...context.errors, { taskName: '__epic_actor__', storyKey: context.epicId, code: 'ACTOR_ERROR', message: event.error instanceof Error ? event.error.message : String(event.error) }], halted: true })),
        },
      },
    },
    checkNext: { always: [{ guard: 'epicDone', target: 'done' }, { target: 'processingStep' }] },
    done: { type: 'final' },
  },
});

const runEpicActor = fromPromise(async ({ input }: { input: RunMachineContext }): Promise<RunMachineContext> => {
  const { config, storyFlowTasks, epicEntries, currentEpicIndex } = input;
  const { errors, storiesProcessed } = input;
  let { workflowState: state, tasksCompleted, lastContract, accumulatedCostUsd, halted } = input;
  if (currentEpicIndex >= epicEntries.length || halted || config.abortSignal?.aborted) {
    if (config.abortSignal?.aborted) { const projectDir = config.projectDir ?? process.cwd(); state = { ...state, phase: 'interrupted' }; writeWorkflowState(state, projectDir); }
    return { ...input, workflowState: state, halted: true };
  }
  const [epicId, epicItems] = epicEntries[currentEpicIndex];
  if (config.onEvent) config.onEvent({ type: 'dispatch-start', taskName: 'story_flow', storyKey: `__epic_${epicId}__` });
  const epicInput: EpicMachineContext = {
    epicId, epicItems, config, storyFlowTasks,
    currentStoryIndex: 0, workflowState: state, errors: [], tasksCompleted: 0,
    storiesProcessed: new Set<string>(), lastContract, accumulatedCostUsd, halted: false, currentStepIndex: 0,
  };
  const epicResult = await new Promise<EpicMachineContext>((resolve) => {
    const actor = createActor(epicMachine, { input: epicInput });
    actor.subscribe({ complete: () => resolve(actor.getSnapshot().context) });
    actor.start();
  });
  state = epicResult.workflowState; errors.push(...epicResult.errors); tasksCompleted += epicResult.tasksCompleted;
  for (const key of epicResult.storiesProcessed) storiesProcessed.add(key);
  lastContract = epicResult.lastContract; accumulatedCostUsd = epicResult.accumulatedCostUsd; halted = epicResult.halted;
  return { ...input, workflowState: state, errors, tasksCompleted, storiesProcessed, lastContract, accumulatedCostUsd, halted, currentEpicIndex: currentEpicIndex + 1 };
});

export const runMachine = setup({
  types: {} as { context: RunMachineContext; input: RunMachineContext },
  actors: { runEpicActor },
  guards: {
    allEpicsDone: ({ context }) => context.halted || context.currentEpicIndex >= context.epicEntries.length,
  },
}).createMachine({
  id: 'run',
  context: ({ input }) => input,
  initial: 'processingEpic',
  states: {
    processingEpic: {
      invoke: {
        src: 'runEpicActor',
        input: ({ context }) => context,
        onDone: { target: 'checkNext', actions: assign(({ event }) => event.output) },
        onError: {
          target: 'allDone',
          actions: assign(({ context, event }) => ({ ...context, errors: [...context.errors, { taskName: '__run_actor__', storyKey: '__run__', code: 'ACTOR_ERROR', message: event.error instanceof Error ? event.error.message : String(event.error) }], halted: true })),
        },
      },
    },
    checkNext: { always: [{ guard: 'allEpicsDone', target: 'allDone' }, { target: 'processingEpic' }] },
    allDone: { type: 'final' },
  },
});
