/** XState v5 epic machine: iterates stories, then runs epic-level steps. */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assign, createActor, fromPromise, setup, waitFor } from 'xstate';
import { DispatchError } from './agent-dispatch.js';
import { getStoryFilePath } from './bmad.js';
import { evaluateProgress } from './circuit-breaker.js';
import { warn } from './output.js';
import { extractTag, parseVerdict } from './verdict-parser.js';
import { dispatchTaskCore, nullTaskCore } from './workflow-actors.js';
import { handleDispatchError } from './workflow-error-utils.js';
import { buildRetryPrompt, DEFAULT_MAX_ITERATIONS, HALT_ERROR_CODES, isLoopTaskCompleted, isTaskCompleted, recordErrorInState } from './workflow-compiler.js';
import { BUILTIN_EPIC_FLOW_TASKS } from './workflow-parser.js';
import { gateMachine, type GateOutput } from './workflow-gate-machine.js';
import { writeWorkflowState } from './workflow-state.js';
import { storyMachine } from './workflow-story-machine.js';
import { isEngineError, isGateConfig, isLoopBlock } from './workflow-types.js';
import type { DispatchOutput, EngineError, EpicContext, GateContext, StoryFlowInput, StoryFlowOutput, WorkItem } from './workflow-types.js';
import { normalizeExecutionTarget } from './workflow-target.js';

export type EpicOutput = Pick<EpicContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>;

function toEpicError(err: unknown, taskName: string, storyKey: string): EngineError {
  return isEngineError(err) ? err : handleDispatchError(err, taskName, storyKey);
}

function collectGuideFiles(items: WorkItem[], epicSentinel: string, projectDir: string): string[] {
  const guidesDir = join(projectDir, '.codeharness', 'verify-guides');
  const guideFiles: string[] = [];
  try { mkdirSync(guidesDir, { recursive: true }); } catch { /* IGNORE: guide dir creation is best effort */ return guideFiles; }
  for (const item of items) {
    try {
      const contractPath = join(projectDir, '.codeharness', 'contracts', `document-${item.key}.json`);
      if (!existsSync(contractPath)) continue;
      const output = JSON.parse(readFileSync(contractPath, 'utf-8')) as { output?: string };
      const docs = output.output ? extractTag(output.output, 'user-docs') ?? output.output : null;
      if (!docs) continue;
      const guidePath = join(guidesDir, `${item.key}-guide.md`);
      writeFileSync(guidePath, docs, 'utf-8');
      guideFiles.push(guidePath);
    } catch { /* IGNORE: individual guide extraction is best effort */ }
  }
  return guideFiles;
}

function collectEpicStoryFiles(items: WorkItem[]): string[] {
  return items.map((item) => getStoryFilePath(item.key));
}

function cleanupGuideFiles(projectDir: string): void {
  try { rmSync(join(projectDir, '.codeharness', 'verify-guides'), { recursive: true, force: true }); } catch { /* IGNORE: cleanup is best effort */ }
}

async function runEpicLoop(ctx: EpicContext, loop: string[], epicSentinel: string, projectDir: string, signal?: AbortSignal): Promise<EpicContext> {
  if (loop.length === 0) return ctx;
  let workflowState = { ...ctx.workflowState, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } };
  let { tasksCompleted, lastContract, accumulatedCostUsd } = ctx;
  const errors = [...ctx.errors];
  const storiesProcessed = new Set(ctx.storiesProcessed);
  const maxIterations = ctx.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const lastAgentTask = [...loop].reverse().find((name) => ctx.config.workflow.tasks[name]?.agent !== null) ?? loop[loop.length - 1];
  let verdict: ReturnType<typeof parseVerdict> | null = null;
  let halted = false;

  while (!halted && workflowState.iteration < maxIterations && !workflowState.circuit_breaker.triggered && verdict?.verdict !== 'pass') {
    if (signal?.aborted) throw Object.assign(new Error('Epic loop interrupted'), { name: 'AbortError' });
    workflowState = { ...workflowState, iteration: workflowState.iteration + 1 };
    writeWorkflowState(workflowState, projectDir);
    for (const taskName of loop) {
      if (signal?.aborted) throw Object.assign(new Error('Epic loop interrupted'), { name: 'AbortError' });
      const task = ctx.config.workflow.tasks[taskName];
      if (!task) { warn(`epic-machine: task "${taskName}" not found in workflow tasks, skipping`); continue; }
      const items = ctx.storyFlowTasks.has(taskName) ? ctx.epicItems : [{ key: epicSentinel, source: 'sprint' as const }];
      for (const item of items) {
        if (isLoopTaskCompleted(workflowState, taskName, item.key, workflowState.iteration)) { warn(`epic-machine: skipping completed task ${taskName} for ${item.key}`); continue; }
        const customPrompt = (ctx.storyFlowTasks.has(taskName) && verdict !== null) ? buildRetryPrompt(item.key, verdict.findings) : undefined;
        try {
          const out = task.agent === null
            ? await nullTaskCore({ task, taskName, storyKey: item.key, target: normalizeExecutionTarget(item.key), config: ctx.config, workflowState, previousContract: lastContract, accumulatedCostUsd })
            : await dispatchTaskCore({ task, taskName, storyKey: item.key, target: normalizeExecutionTarget(item.key), definition: ctx.config.agents[task.agent], config: ctx.config, workflowState, previousContract: lastContract, accumulatedCostUsd, customPrompt });
          workflowState = { ...out.updatedState, iteration: workflowState.iteration, evaluator_scores: workflowState.evaluator_scores, circuit_breaker: workflowState.circuit_breaker };
          lastContract = out.contract;
          accumulatedCostUsd += out.cost;
          tasksCompleted += 1;
          if (ctx.storyFlowTasks.has(taskName)) storiesProcessed.add(item.key);
          if (taskName === lastAgentTask && task.agent !== null) {
            verdict = parseVerdict(out.output);
            workflowState = { ...workflowState, evaluator_scores: [...workflowState.evaluator_scores, { iteration: workflowState.iteration, passed: verdict.score.passed, failed: verdict.score.failed, unknown: verdict.score.unknown, total: verdict.score.total, timestamp: new Date().toISOString() }] };
            const breaker = evaluateProgress(workflowState.evaluator_scores);
            if (breaker.halt) workflowState = { ...workflowState, circuit_breaker: { triggered: true, reason: breaker.reason, score_history: breaker.scoreHistory } };
            writeWorkflowState(workflowState, projectDir);
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') throw err;
          const engineError = toEpicError(err, taskName, item.key);
          errors.push(engineError);
          workflowState = recordErrorInState(workflowState, taskName, item.key, engineError);
          writeWorkflowState(workflowState, projectDir);
          if (task.agent !== null && err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) halted = true;
        }
        if (halted) break;
      }
      if (halted) break;
    }
  }

  if (!halted && verdict?.verdict !== 'pass') {
    const phase = workflowState.circuit_breaker.triggered ? 'circuit-breaker' : 'max-iterations';
    workflowState = { ...workflowState, phase };
    writeWorkflowState(workflowState, projectDir);
    halted = true;
  }

  return { ...ctx, workflowState, errors, tasksCompleted, lastContract, accumulatedCostUsd, storiesProcessed, halted };
}

const epicStoryActor = fromPromise(async ({ input, signal }: { input: EpicContext; signal: AbortSignal }): Promise<EpicContext> => {
  if (signal.aborted) throw Object.assign(new Error('Epic story interrupted'), { name: 'AbortError' });
  const item = input.epicItems[input.currentStoryIndex];
  const storyInput: StoryFlowInput = {
    item,
    config: input.config,
    workflowState: input.workflowState,
    lastContract: input.lastContract,
    accumulatedCostUsd: input.accumulatedCostUsd,
    storyFlowTasks: input.storyFlowTasks,
    completedTasks: input.completedTasks ?? new Set<string>(),
  };
  const actor = createActor(storyMachine, { input: storyInput });

  // Wire XState's abort signal into the child story machine so INTERRUPT
  // cancels in-flight story work rather than only changing state on the parent.
  const onAbort = () => actor.send({ type: 'INTERRUPT' });
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === 'done');
    const out = snap.output as StoryFlowOutput;
    const storiesProcessed = new Set(input.storiesProcessed);
    if (!out.halted) storiesProcessed.add(item.key);
    return { ...input, workflowState: out.workflowState, errors: [...input.errors, ...out.errors], tasksCompleted: input.tasksCompleted + out.tasksCompleted, lastContract: out.lastContract, accumulatedCostUsd: out.accumulatedCostUsd, halted: out.halted, storiesProcessed };
  } catch (err: unknown) { // IGNORE: timeout or actor error — skip this story, continue to next
    const msg = err instanceof Error ? err.message : String(err);
    warn(`workflow-epic-machine: story ${item.key} failed (${msg}) — skipping to next story`);
    return { ...input, errors: [...input.errors, { taskName: 'story-flow', storyKey: item.key, code: 'TIMEOUT', message: msg }] };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
});

const epicStepActor = fromPromise(async ({ input, signal }: { input: EpicContext; signal: AbortSignal }): Promise<EpicContext> => {
  if (signal.aborted) throw Object.assign(new Error('Epic step interrupted'), { name: 'AbortError' });
  const ctx = { ...input };
  const epicSentinel = `__epic_${ctx.epicId}__`;
  const projectDir = ctx.config.projectDir ?? process.cwd();
  const step = ctx.config.workflow.epicFlow[ctx.currentStepIndex];
  if (!step) return ctx;

  if (isGateConfig(step)) {
    if (signal.aborted) throw Object.assign(new Error('Epic step interrupted'), { name: 'AbortError' });
    const gateCtx: GateContext = {
      gate: step,
      config: ctx.config,
      workflowState: { ...ctx.workflowState, iteration: 0, evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] } },
      errors: [],
      tasksCompleted: 0,
      halted: false,
      lastContract: ctx.lastContract,
      accumulatedCostUsd: ctx.accumulatedCostUsd,
      verdicts: {},
      parentItemKey: epicSentinel,
    };
    const gateActor = createActor(gateMachine, { input: gateCtx });

    // Wire abort signal into gate child machine
    const onAbort = () => gateActor.send({ type: 'INTERRUPT' });
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      gateActor.start();
      const gateSnap = await waitFor(gateActor, (s) => s.status === 'done', {});
      const gateOut = gateSnap.output as GateOutput;
      return { ...ctx, workflowState: gateOut.workflowState, errors: [...ctx.errors, ...gateOut.errors], tasksCompleted: ctx.tasksCompleted + gateOut.tasksCompleted, lastContract: gateOut.lastContract, accumulatedCostUsd: gateOut.accumulatedCostUsd, halted: gateOut.halted };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  if (isLoopBlock(step)) {
    return runEpicLoop(ctx, step.loop, epicSentinel, projectDir, signal);
  }

  if (typeof step !== 'string') return ctx;
  if (step === 'story_flow') {
    if (!BUILTIN_EPIC_FLOW_TASKS.has(step)) return ctx;
    if (isTaskCompleted(ctx.workflowState, step, epicSentinel)) return ctx;
    const workflowState = {
      ...ctx.workflowState,
      tasks_completed: [
        ...ctx.workflowState.tasks_completed,
        { task_name: step, story_key: epicSentinel, completed_at: new Date().toISOString() },
      ],
    };
    writeWorkflowState(workflowState, projectDir);
    if (ctx.config.onEvent) {
      ctx.config.onEvent({ type: 'dispatch-end', taskName: step, storyKey: epicSentinel, elapsedMs: 0, costUsd: 0, targetScope: 'epic' });
    }
    return { ...ctx, workflowState };
  }
  const task = ctx.config.workflow.tasks[step];
  if (!task) { warn(`epic-machine: task "${step}" not found in workflow tasks, skipping`); return ctx; }
  if (isTaskCompleted(ctx.workflowState, step, epicSentinel)) return ctx;

  if (signal.aborted) throw Object.assign(new Error('Epic step interrupted'), { name: 'AbortError' });

  try {
    let out: DispatchOutput;
    if (task.agent === null) {
      out = await nullTaskCore({ task, taskName: step, storyKey: epicSentinel, target: { scope: 'epic', key: epicSentinel }, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
    } else {
      const definition = ctx.config.agents[task.agent];
      if (!definition) { warn(`epic-machine: agent "${task.agent}" not found for "${step}", skipping`); return ctx; }
      const guideFiles = task.source_access === false ? collectGuideFiles(ctx.epicItems, epicSentinel, projectDir) : [];
      const acStoryFiles = task.source_access === false ? collectEpicStoryFiles(ctx.epicItems) : undefined;
      try {
        out = await dispatchTaskCore({ task, taskName: step, storyKey: epicSentinel, target: { scope: 'epic', key: epicSentinel }, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd, storyFiles: guideFiles, acStoryFiles });
      } finally {
        if (guideFiles.length > 0) cleanupGuideFiles(projectDir);
      }
    }
    return { ...ctx, workflowState: out.updatedState, lastContract: out.contract, tasksCompleted: ctx.tasksCompleted + 1, accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) throw err;
    const engineError = toEpicError(err, step, epicSentinel);
    const workflowState = recordErrorInState(ctx.workflowState, step, epicSentinel, engineError);
    writeWorkflowState(workflowState, projectDir);
    if (ctx.config.onEvent) ctx.config.onEvent({ type: 'dispatch-error', taskName: step, storyKey: epicSentinel, error: { code: engineError.code, message: engineError.message } });
    return { ...ctx, workflowState, errors: [...ctx.errors, engineError] };
  }
});

export const epicMachine = setup({
  types: {} as { context: EpicContext; input: EpicContext; output: EpicOutput },
  actors: { epicStoryActor, epicStepActor },
  guards: {
    hasMoreStories: ({ context }) => context.currentStoryIndex < context.epicItems.length,
    hasMoreEpicSteps: ({ context }) => context.currentStepIndex < context.config.workflow.epicFlow.length,
    isHalted: ({ context }) => context.halted,
    isAbortError: ({ event }) => { const err = (event as { error?: unknown }).error; return err instanceof Error && err.name === 'AbortError'; },
    isHaltError: ({ event }) => { const err = (event as { error?: unknown }).error; return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code); },
  },
}).createMachine({
  id: 'epic',
  context: ({ input }) => ({ ...input }),
  output: ({ context }) => ({ workflowState: context.workflowState, errors: context.errors, tasksCompleted: context.tasksCompleted, storiesProcessed: context.storiesProcessed, lastContract: context.lastContract, accumulatedCostUsd: context.accumulatedCostUsd, halted: context.halted }),
  on: { INTERRUPT: '.interrupted' },
  initial: 'iteratingStories',
  states: {
    iteratingStories: {
      initial: 'processStory',
      states: {
        processStory: {
          always: [{ guard: 'isHalted', target: '#epic.halted' }, { guard: ({ context }) => context.currentStoryIndex >= context.epicItems.length, target: 'done' }],
          invoke: {
            src: 'epicStoryActor',
            input: ({ context }) => context,
            onDone: { target: 'checkNextStory', actions: assign(({ event }) => ({ workflowState: event.output.workflowState, errors: event.output.errors, tasksCompleted: event.output.tasksCompleted, lastContract: event.output.lastContract, accumulatedCostUsd: event.output.accumulatedCostUsd, halted: event.output.halted, storiesProcessed: event.output.storiesProcessed })) },
            onError: [
              { guard: 'isAbortError', target: '#epic.interrupted' },
              { guard: 'isHaltError', target: '#epic.halted', actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError((event as { error?: unknown }).error, 'story-iteration', `__epic_${context.epicId}__`)] })) },
              { target: '#epic.halted', actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError((event as { error?: unknown }).error, 'story-iteration', `__epic_${context.epicId}__`)] })) },
            ],
          },
        },
        checkNextStory: {
          always: [
            { guard: 'isHalted', target: '#epic.halted' },
            { guard: 'hasMoreStories', target: 'processStory', actions: assign(({ context }) => ({ currentStoryIndex: context.currentStoryIndex + 1 })) },
            { target: 'done' },
          ],
        },
        done: { type: 'final' },
      },
      onDone: 'processingEpicSteps',
    },
    processingEpicSteps: {
      initial: 'processStep',
      states: {
        processStep: {
          always: [{ guard: 'isHalted', target: '#epic.halted' }, { guard: ({ context }) => context.currentStepIndex >= context.config.workflow.epicFlow.length, target: 'done' }],
          invoke: {
            src: 'epicStepActor',
            input: ({ context }) => context,
            onDone: { target: 'checkNextStep', actions: assign(({ context, event }) => ({ workflowState: event.output.workflowState, errors: event.output.errors, tasksCompleted: event.output.tasksCompleted, lastContract: event.output.lastContract, accumulatedCostUsd: event.output.accumulatedCostUsd, halted: event.output.halted, storiesProcessed: event.output.storiesProcessed, currentStepIndex: context.currentStepIndex + 1 })) },
            onError: [
              { guard: 'isAbortError', target: '#epic.interrupted' },
              { guard: 'isHaltError', target: '#epic.halted', actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError((event as { error?: unknown }).error, 'epic-step', `__epic_${context.epicId}__`)] })) },
              { target: '#epic.halted', actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toEpicError((event as { error?: unknown }).error, 'epic-step', `__epic_${context.epicId}__`)] })) },
            ],
          },
        },
        checkNextStep: {
          always: [{ guard: 'isHalted', target: '#epic.halted' }, { guard: 'hasMoreEpicSteps', target: 'processStep' }, { target: 'done' }],
        },
        done: { type: 'final' },
      },
      onDone: 'done',
    },
    done: { type: 'final' },
    halted: { type: 'final', entry: assign({ halted: true }) },
    interrupted: { type: 'final', entry: assign({ halted: true }) },
  },
});
