/** XState v5 story machine: processes one story through storyFlow steps. */

import { setup, assign, fromPromise, createActor, waitFor } from 'xstate';
import { DispatchError } from './agent-dispatch.js';
import { dispatchTaskCore, nullTaskCore } from './workflow-actors.js';
import { handleDispatchError } from './workflow-error-utils.js';
import { HALT_ERROR_CODES, isTaskCompleted, recordErrorInState } from './workflow-compiler.js';
import { warn, info } from './output.js';
import { appendCheckpoint } from './workflow-persistence.js';
import { writeWorkflowState } from './workflow-state.js';
import { gateMachine } from './workflow-gate-machine.js';
import type { GateOutput } from './workflow-gate-machine.js';
import { isGateConfig } from './workflow-types.js';
import type { StoryContext, StoryFlowInput, StoryFlowOutput, GateContext, DispatchOutput } from './workflow-types.js';
import { normalizeExecutionTarget } from './workflow-target.js';

// ─── Story Step Actor ─────────────────────────────────────────────────────────

/**
 * Story step actor: processes all storyFlow steps sequentially.
 * Plain tasks dispatch via dispatchTaskCore / nullTaskCore.
 * Gate steps delegate to gateMachine as a child actor.
 * Any error halts the story (no recovery at story level).
 */
const storyStepActor = fromPromise(async ({ input, signal }: { input: StoryContext; signal: AbortSignal }): Promise<StoryContext> => {
  let ctx: StoryContext = { ...input, config: { ...input.config, abortSignal: signal } };
  const storyKey = ctx.item.key;
  const hasSuccessfulGateCompletionRecord = (taskName: string): boolean =>
    ctx.workflowState.tasks_completed.some(
      (checkpoint) => checkpoint.task_name === taskName && checkpoint.story_key === storyKey && !checkpoint.error,
    );

  for (const step of ctx.config.workflow.storyFlow) {
    if (signal.aborted) throw Object.assign(new Error('Story interrupted'), { name: 'AbortError' });

    if (isGateConfig(step)) {
      // Checkpoint skip guard: skip gates completed in a previous run (config-change resume)
      const completedTasksForGate = ctx.completedTasks ?? new Set<string>();
      if (completedTasksForGate.has(`${storyKey}::${step.gate}`) && hasSuccessfulGateCompletionRecord(step.gate)) {
        info(`workflow-runner: Skipping ${step.gate} for ${storyKey} — checkpoint found`);
        continue;
      }

      // Build gate context, reset iteration/scores/cb for fresh gate
      const gateWorkflowState = {
        ...ctx.workflowState,
        iteration: 0,
        evaluator_scores: [],
        circuit_breaker: { triggered: false, reason: null, score_history: [] },
      };
      const gateCtx: GateContext = {
        gate: step,
        config: ctx.config,
        workflowState: gateWorkflowState,
        errors: [],
        tasksCompleted: 0,
        halted: false,
        lastContract: ctx.lastContract,
        accumulatedCostUsd: ctx.accumulatedCostUsd,
        verdicts: {},
        parentItemKey: storyKey,
      };

      const gateActor = createActor(gateMachine, { input: gateCtx });
      gateActor.start();
      const gateSnap = await waitFor(gateActor, (s) => s.status === 'done', {});
      const gateOut = gateSnap.output as GateOutput;
      const gatePassed = gateSnap.value === 'passed';

      // Merge gate output back into story context
      ctx = {
        ...ctx,
        workflowState: gatePassed
          ? {
            ...gateOut.workflowState,
            tasks_completed: [
              ...gateOut.workflowState.tasks_completed,
              { task_name: step.gate, story_key: storyKey, completed_at: new Date().toISOString() },
            ],
          }
          : gateOut.workflowState,
        errors: [...ctx.errors, ...gateOut.errors],
        tasksCompleted: ctx.tasksCompleted + gateOut.tasksCompleted,
        lastContract: gateOut.lastContract,
        accumulatedCostUsd: gateOut.accumulatedCostUsd,
        halted: gateOut.halted,
      };

      if (gateOut.halted) break;

      if (gatePassed) {
        try {
          const projectDir = ctx.config.projectDir ?? process.cwd();
          appendCheckpoint({ storyKey, taskName: step.gate, completedAt: new Date().toISOString() }, projectDir);
        } catch { // IGNORE: checkpoint append is best-effort
        }
      }
      continue;
    }

    if (typeof step === 'string') {
      const taskName = step;
      const task = ctx.config.workflow.tasks[taskName];
      if (!task) { warn(`story-machine: task "${taskName}" not found in workflow tasks, skipping`); continue; }
      if (isTaskCompleted(ctx.workflowState, taskName, storyKey)) { warn(`story-machine: skipping completed task ${taskName} for ${storyKey}`); continue; }

      // Checkpoint skip guard: skip tasks completed in a previous run (config-change resume)
      const completedTasks = ctx.completedTasks ?? new Set<string>();
      if (completedTasks.has(`${storyKey}::${taskName}`)) {
        info(`workflow-runner: Skipping ${taskName} for ${storyKey} — checkpoint found`);
        continue;
      }

      const projectDir = ctx.config.projectDir ?? process.cwd();
      let out: DispatchOutput;
        try {
          if (task.agent === null) {
            out = await nullTaskCore({ task, taskName, storyKey, target: normalizeExecutionTarget(storyKey), config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
          } else {
            const definition = ctx.config.agents[task.agent];
            if (!definition) { warn(`story-machine: agent "${task.agent}" not found for "${taskName}", skipping`); continue; }
            out = await dispatchTaskCore({ task, taskName, storyKey, target: normalizeExecutionTarget(storyKey), definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
          }
        // Append checkpoint entry after successful task completion
        try {
          appendCheckpoint({ storyKey, taskName, completedAt: new Date().toISOString() }, projectDir);
        } catch { // IGNORE: checkpoint append is best-effort
        }
        ctx = {
          ...ctx,
          workflowState: out.updatedState,
          lastContract: out.contract,
          tasksCompleted: ctx.tasksCompleted + 1,
          accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost,
        };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        const engineError = handleDispatchError(err, taskName, storyKey);
        const updatedState = recordErrorInState(ctx.workflowState, taskName, storyKey, engineError);
        writeWorkflowState(updatedState, projectDir);
        if (ctx.config.onEvent) ctx.config.onEvent({ type: 'dispatch-error', taskName, storyKey, error: { code: engineError.code, message: engineError.message } });
        // Any plain-task error halts the story — no retry at story level.
        ctx = { ...ctx, workflowState: updatedState, errors: [...ctx.errors, engineError], halted: true };
        break;
      }
    }
  }

  if (!ctx.halted && ctx.config.onEvent) {
    ctx.config.onEvent({ type: 'story-done', taskName: 'story_flow', storyKey });
  }

  return ctx;
});

// ─── Story Machine ─────────────────────────────────────────────────────────────

/**
 * XState v5 story machine.
 *
 * Processes one story through its storyFlow steps: plain tasks, gate steps, etc.
 * Input: StoryFlowInput. Output: StoryFlowOutput.
 *
 * Final states:
 *   done         — all steps completed without halt
 *   halted       — gate halted, halt error, or non-halt task error
 *   interrupted  — INTERRUPT event received or AbortError
 */
export const storyMachine = setup({
  types: {} as { context: StoryContext; input: StoryFlowInput; output: StoryFlowOutput },
  actors: { storyStepActor },
  guards: {
    /** True when the actor threw an AbortError (abort signal). */
    isAbortError: ({ event }) => {
      const err = (event as { error?: unknown }).error;
      return err instanceof Error && err.name === 'AbortError';
    },
    /** True when the actor threw a halt-inducing DispatchError (RATE_LIMIT/NETWORK/SDK_INIT). */
    isHaltError: ({ event }) => {
      const err = (event as { error?: unknown }).error;
      return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code);
    },
  },
}).createMachine({
  id: 'story',
  context: ({ input }) => ({
    ...input,
    errors: [],
    tasksCompleted: 0,
    halted: false,
  }),
  output: ({ context }): StoryFlowOutput => ({
    workflowState: context.workflowState,
    errors: context.errors,
    tasksCompleted: context.tasksCompleted,
    lastContract: context.lastContract,
    accumulatedCostUsd: context.accumulatedCostUsd,
    halted: context.halted,
  }),
  on: { INTERRUPT: '.interrupted' },
  initial: 'processing',
  states: {
    /** Invoke the story step actor to run all storyFlow steps sequentially. */
    processing: {
      invoke: {
        src: 'storyStepActor',
        input: ({ context }) => context,
        onDone: [
          {
            guard: ({ event }) => (event.output as StoryContext).halted,
            target: 'halted',
            actions: assign(({ event }) => {
              const out = event.output;
              return {
                workflowState: out.workflowState,
                errors: out.errors,
                tasksCompleted: out.tasksCompleted,
                lastContract: out.lastContract,
                accumulatedCostUsd: out.accumulatedCostUsd,
                halted: out.halted,
              };
            }),
          },
          {
            target: 'done',
            actions: assign(({ event }) => {
              const out = event.output;
              return {
                workflowState: out.workflowState,
                errors: out.errors,
                tasksCompleted: out.tasksCompleted,
                lastContract: out.lastContract,
                accumulatedCostUsd: out.accumulatedCostUsd,
                halted: out.halted,
              };
            }),
          },
        ],
        onError: [
          { guard: 'isAbortError', target: 'interrupted' },
          {
            guard: 'isHaltError',
            target: 'halted',
            actions: assign(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, handleDispatchError((event as { error?: unknown }).error, 'story-flow', context.item.key)],
            })),
          },
          {
            target: 'halted',
            actions: assign(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, handleDispatchError((event as { error?: unknown }).error, 'story-flow', context.item.key)],
            })),
          },
        ],
      },
    },
    done: { type: 'final' },
    halted: { type: 'final', entry: assign({ halted: true }) },
    interrupted: { type: 'final', entry: assign({ halted: true }) },
  },
});
