/** XState v5 run machine: iterates epics via the AD4 for_each pattern. */

import { assign, createActor, fromPromise, setup, waitFor } from 'xstate';
import { DispatchError } from './agent-dispatch.js';
import { handleDispatchError, HALT_ERROR_CODES, isEngineError } from './workflow-compiler.js';
import type { EngineError, EpicContext, RunContext } from './workflow-types.js';
import { epicMachine, type EpicOutput } from './workflow-epic-machine.js';

export type RunOutput = Pick<RunContext, 'workflowState' | 'errors' | 'tasksCompleted' | 'storiesProcessed' | 'lastContract' | 'accumulatedCostUsd' | 'halted'>;

function toRunError(err: unknown, taskName: string, storyKey: string): EngineError {
  return isEngineError(err) ? err : handleDispatchError(err, taskName, storyKey);
}

/** Combine an external AbortSignal with XState's actor signal safely. */
function mergeSignals(existing: AbortSignal | undefined, next: AbortSignal): AbortSignal {
  if (!existing) return next;
  // Guard: existing might not be a real AbortSignal (e.g., deserialized from snapshot)
  if (typeof existing.addEventListener !== 'function') return next;

  const ctrl = new AbortController();
  if (existing.aborted || next.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }

  const abort = () => ctrl.abort();
  existing.addEventListener('abort', abort, { once: true });
  if (typeof next.addEventListener === 'function') {
    next.addEventListener('abort', abort, { once: true });
  }
  return ctrl.signal;
}

const runEpicActor = fromPromise(async ({ input, signal }: { input: RunContext; signal: AbortSignal }): Promise<RunContext> => {
  const { epicEntries, currentEpicIndex, config } = input;

  // Check abort signal before starting epic — throw AbortError so runMachine → interrupted
  if (config.abortSignal?.aborted) {
    const abortErr = new Error('Run aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  const [epicId, epicItems] = epicEntries[currentEpicIndex];

  if (config.onEvent) {
    config.onEvent({ type: 'dispatch-start', taskName: 'story_flow', storyKey: `__epic_${epicId}__` });
  }

  const epicInput: EpicContext = {
    epicId,
    epicItems,
    config: {
      ...input.config,
      abortSignal: mergeSignals(input.config.abortSignal, signal),
      workflow: {
        ...input.config.workflow,
        epicFlow: input.config.workflow.epicFlow.length > 0
          ? input.config.workflow.epicFlow
          : ['story_flow', ...input.config.workflow.epicFlow],
      },
    },
    storyFlowTasks: input.storyFlowTasks,
    currentStoryIndex: 0,
    workflowState: input.workflowState,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: input.lastContract,
    accumulatedCostUsd: input.accumulatedCostUsd,
    halted: false,
    currentStepIndex: 0,
    completedTasks: input.completedTasks ?? new Set<string>(),
  };

  const actor = createActor(epicMachine, { input: epicInput });
  const onAbort = () => actor.send({ type: 'INTERRUPT' });
  signal.addEventListener('abort', onAbort, { once: true });

  let epicOut: EpicOutput;
  try {
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === 'done', {});
    epicOut = snap.output as EpicOutput;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }

  if (epicOut.workflowState.phase === 'interrupted') {
    const abortErr = new Error('Epic interrupted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  const completedStoryKeys = new Set(
    epicOut.workflowState.tasks_completed
      .filter((checkpoint) => !checkpoint.story_key.startsWith('__epic_'))
      .filter((checkpoint) => !checkpoint.error)
      .map((checkpoint) => checkpoint.story_key),
  );
  const storiesProcessed = new Set(input.storiesProcessed);
  for (const key of epicOut.storiesProcessed) {
    if (completedStoryKeys.has(key) || (!epicOut.halted && completedStoryKeys.size === 0)) {
      storiesProcessed.add(key);
    }
  }

  return {
    ...input,
    workflowState: epicOut.workflowState,
    errors: [...input.errors, ...epicOut.errors],
    tasksCompleted: input.tasksCompleted + epicOut.tasksCompleted,
    storiesProcessed,
    lastContract: epicOut.lastContract,
    accumulatedCostUsd: epicOut.accumulatedCostUsd,
    halted: epicOut.halted,
    currentEpicIndex: currentEpicIndex + 1,
  };
});

export const runMachine = setup({
  types: {} as { context: RunContext; input: RunContext; output: RunOutput },
  actors: { runEpicActor },
  guards: {
    hasMoreEpics: ({ context }) => context.currentEpicIndex < context.epicEntries.length,
    isHalted: ({ context }) => context.halted,
    isAbortError: ({ event }) => { const err = (event as { error?: unknown }).error; return err instanceof Error && err.name === 'AbortError'; },
    isHaltError: ({ event }) => { const err = (event as { error?: unknown }).error; return err instanceof DispatchError && HALT_ERROR_CODES.has(err.code); },
  },
}).createMachine({
  id: 'run',
  context: ({ input }) => ({ ...input }),
  output: ({ context }) => ({
    workflowState: context.workflowState,
    errors: context.errors,
    tasksCompleted: context.tasksCompleted,
    storiesProcessed: context.storiesProcessed,
    lastContract: context.lastContract,
    accumulatedCostUsd: context.accumulatedCostUsd,
    halted: context.halted,
  }),
  on: { INTERRUPT: '.interrupted' },
  initial: 'processingEpic',
  states: {
    processingEpic: {
      always: [
        { guard: 'isHalted', target: '#run.halted' },
        { guard: ({ context }) => context.currentEpicIndex >= context.epicEntries.length, target: 'allDone' },
      ],
      invoke: {
        src: 'runEpicActor',
        input: ({ context }) => context,
        onDone: {
          target: 'checkNextEpic',
          actions: assign(({ event }) => ({
            workflowState: event.output.workflowState,
            errors: event.output.errors,
            tasksCompleted: event.output.tasksCompleted,
            storiesProcessed: event.output.storiesProcessed,
            lastContract: event.output.lastContract,
            accumulatedCostUsd: event.output.accumulatedCostUsd,
            halted: event.output.halted,
            currentEpicIndex: event.output.currentEpicIndex,
          })),
        },
        onError: [
          { guard: 'isAbortError', target: '#run.interrupted' },
          {
            guard: 'isHaltError',
            target: '#run.halted',
            actions: assign(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, toRunError((event as { error?: unknown }).error, 'epic-iteration', `__run__`)],
            })),
          },
          {
            target: '#run.halted',
            actions: assign(({ context, event }) => ({
              halted: true,
              errors: [...context.errors, toRunError((event as { error?: unknown }).error, 'epic-iteration', `__run__`)],
            })),
          },
        ],
      },
    },
    checkNextEpic: {
      always: [
        { guard: 'isHalted', target: '#run.halted' },
        { guard: 'hasMoreEpics', target: 'processingEpic' },
        { target: 'allDone' },
      ],
    },
    allDone: { type: 'final' },
    halted: { type: 'final', entry: assign({ halted: true }) },
    interrupted: {
      type: 'final',
      entry: assign(({ context }) => ({
        halted: true,
        workflowState: { ...context.workflowState, phase: 'interrupted' },
      })),
    },
  },
});
