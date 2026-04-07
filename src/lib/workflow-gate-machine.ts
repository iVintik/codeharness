/** XState v5 gate machine: checking → evaluate → fixing cycle. */

import { setup, assign, fromPromise } from 'xstate';
import { DispatchError } from './agent-dispatch.js';
import { parseVerdict } from './verdict-parser.js';
import { dispatchTaskCore, nullTaskCore } from './workflow-actors.js';
import { HALT_ERROR_CODES, isEngineError } from './workflow-compiler.js';
import { warn } from './output.js';
import type { GateContext, EngineError, DispatchOutput } from './workflow-types.js';
import type { EvaluatorScore } from './workflow-state.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Output produced by the gate machine when it reaches a final state. */
export interface GateOutput {
  workflowState: GateContext['workflowState'];
  errors: GateContext['errors'];
  tasksCompleted: number;
  halted: boolean;
  lastContract: GateContext['lastContract'];
  accumulatedCostUsd: number;
  verdicts: GateContext['verdicts'];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toGateError(err: unknown, taskName: string, storyKey: string): EngineError {
  if (isEngineError(err)) return err;
  return { taskName, storyKey, code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) };
}

function resolveStoryKey(ctx: GateContext): string {
  return ctx.parentItemKey ? `${ctx.parentItemKey}:${ctx.gate.gate}` : ctx.gate.gate;
}

/**
 * Combine two AbortSignals so either one aborting aborts the result.
 * Uses a manual controller to avoid AbortSignal.any() compatibility issues.
 */
function mergeSignals(existing: AbortSignal | undefined, next: AbortSignal): AbortSignal {
  if (!existing) return next;
  const ctrl = new AbortController();
  if (existing.aborted || next.aborted) { ctrl.abort(); return ctrl.signal; }
  const abort = () => ctrl.abort();
  existing.addEventListener('abort', abort, { once: true });
  next.addEventListener('abort', abort, { once: true });
  return ctrl.signal;
}

/** Compute aggregate evaluator score from current verdicts map. */
function computeVerdictScore(verdicts: Record<string, string>, iteration: number): EvaluatorScore {
  let passed = 0; let failed = 0; let unknown = 0;
  for (const v of Object.values(verdicts)) {
    const p = parseVerdict(v);
    passed += p.score.passed; failed += p.score.failed; unknown += p.score.unknown;
  }
  return { iteration, passed, failed, unknown, total: (passed + failed + unknown) || 1, timestamp: new Date().toISOString() };
}

// ─── Phase Actors ────────────────────────────────────────────────────────────

/**
 * Check phase actor: runs all gate.check tasks sequentially, accumulating
 * a verdict string per task into context.verdicts. Throws on abort/halt errors;
 * non-fatal errors are accumulated into context.errors.
 */
const checkPhaseActor = fromPromise(async ({ input, signal }: { input: GateContext; signal: AbortSignal }): Promise<GateContext> => {
  let ctx = { ...input, config: { ...input.config, abortSignal: mergeSignals(input.config.abortSignal, signal) } };
  const storyKey = resolveStoryKey(ctx);
  for (const taskName of ctx.gate.check) {
    if (signal.aborted) throw Object.assign(new Error('Gate interrupted'), { name: 'AbortError' });
    const task = ctx.config.workflow.tasks[taskName];
    if (!task) { warn(`gate-machine: check task "${taskName}" not found, skipping`); continue; }
    let out: DispatchOutput;
    try {
      if (task.agent === null) {
        out = await nullTaskCore({ task, taskName, storyKey, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      } else {
        const definition = ctx.config.agents[task.agent];
        if (!definition) { warn(`gate-machine: agent "${task.agent}" not found for "${taskName}", skipping`); continue; }
        out = await dispatchTaskCore({ task, taskName, storyKey, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      }
      ctx = { ...ctx, verdicts: { ...ctx.verdicts, [taskName]: out.contract?.output ?? '' }, workflowState: out.updatedState, lastContract: out.contract, tasksCompleted: ctx.tasksCompleted + 1, accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) throw err;
      ctx = { ...ctx, errors: [...ctx.errors, toGateError(err, taskName, storyKey)] };
    }
  }
  return ctx;
});

/**
 * Fix phase actor: runs all gate.fix tasks sequentially. Resets verdicts to {}
 * so the next check phase starts fresh. Throws on abort/halt errors.
 */
const fixPhaseActor = fromPromise(async ({ input, signal }: { input: GateContext; signal: AbortSignal }): Promise<GateContext> => {
  let ctx = { ...input, verdicts: {} as Record<string, string>, config: { ...input.config, abortSignal: mergeSignals(input.config.abortSignal, signal) } };
  const storyKey = resolveStoryKey(ctx);
  for (const taskName of ctx.gate.fix) {
    if (signal.aborted) throw Object.assign(new Error('Gate interrupted'), { name: 'AbortError' });
    const task = ctx.config.workflow.tasks[taskName];
    if (!task) { warn(`gate-machine: fix task "${taskName}" not found, skipping`); continue; }
    let out: DispatchOutput;
    try {
      if (task.agent === null) {
        out = await nullTaskCore({ task, taskName, storyKey, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      } else {
        const definition = ctx.config.agents[task.agent];
        if (!definition) { warn(`gate-machine: agent "${task.agent}" not found for "${taskName}", skipping`); continue; }
        out = await dispatchTaskCore({ task, taskName, storyKey, definition, config: ctx.config, workflowState: ctx.workflowState, previousContract: ctx.lastContract, accumulatedCostUsd: ctx.accumulatedCostUsd });
      }
      ctx = { ...ctx, workflowState: out.updatedState, lastContract: out.contract, tasksCompleted: ctx.tasksCompleted + 1, accumulatedCostUsd: ctx.accumulatedCostUsd + out.cost };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DispatchError && HALT_ERROR_CODES.has(err.code)) throw err;
      ctx = { ...ctx, errors: [...ctx.errors, toGateError(err, taskName, storyKey)] };
    }
  }
  return ctx;
});

// ─── Gate Machine ─────────────────────────────────────────────────────────────

/**
 * XState v5 gate machine.
 *
 * Implements the checking → evaluate → fixing cycle defined by GateConfig.
 * Input: GateContext (gate config, engine config, initial workflow state).
 * Output: GateOutput (updated state, errors, cost, verdicts).
 *
 * Final states:
 *   passed       — all check tasks returned passing verdicts
 *   maxedOut     — iteration reached gate.max_retries
 *   halted       — circuit breaker triggered or halt error from actor
 *   interrupted  — INTERRUPT event received
 */
export const gateMachine = setup({
  types: {} as { context: GateContext; input: GateContext; output: GateOutput },
  actors: { checkPhaseActor, fixPhaseActor },
  guards: {
    /**
     * True when ALL check tasks contributed a verdict AND every verdict parses as 'pass'.
     * Returns false if verdicts is empty or if fewer verdicts were collected than
     * check tasks configured (i.e. some tasks were skipped due to missing definition
     * or missing agent — skipped tasks must not silently count as passing).
     */
    allPassed: ({ context }) => {
      const entries = Object.values(context.verdicts);
      if (entries.length === 0) return false;
      // Guard against silently-skipped tasks: every configured check task must
      // have produced a verdict entry. A missing task/agent is a config error
      // that should prevent the gate from reporting passed.
      if (entries.length < context.gate.check.length) return false;
      return entries.every((v) => parseVerdict(v).verdict === 'pass');
    },
    /** True when iteration count has reached max_retries. */
    maxRetries: ({ context }) => context.workflowState.iteration >= context.gate.max_retries,
    /** True when the actor threw an AbortError (user-initiated abort signal). */
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
  id: 'gate',
  context: ({ input }) => input,
  output: ({ context }): GateOutput => ({
    workflowState: context.workflowState,
    errors: context.errors,
    tasksCompleted: context.tasksCompleted,
    halted: context.halted,
    lastContract: context.lastContract,
    accumulatedCostUsd: context.accumulatedCostUsd,
    verdicts: context.verdicts,
  }),
  on: { INTERRUPT: '.interrupted' },
  initial: 'checking',
  states: {
    /** Run all check tasks; accumulate verdicts. */
    checking: {
      invoke: {
        src: 'checkPhaseActor',
        input: ({ context }) => context,
        onDone: { target: 'evaluate', actions: assign(({ event }) => event.output) },
        onError: [
          { guard: 'isAbortError', target: 'interrupted' },
          { guard: 'isHaltError', target: 'halted', actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toGateError((event as { error?: unknown }).error, 'check-phase', resolveStoryKey(context))] })) },
          { target: 'halted', actions: assign(({ context, event }) => ({ errors: [...context.errors, toGateError((event as { error?: unknown }).error, 'check-phase', resolveStoryKey(context))] })) },
        ],
      },
    },
    /**
     * Evaluate phase: entry action increments iteration and computes circuit-breaker
     * decision, then eventless transitions choose the next state.
     */
    evaluate: {
      entry: assign(({ context }) => {
        const newIteration = context.workflowState.iteration + 1;
        const score = computeVerdictScore(context.verdicts, newIteration);
        const newScores = [...context.workflowState.evaluator_scores, score];
        // No circuit breaker — max_retries is the only exit. Each retry gets fresh
        // findings and may approach the fix differently.
        return { workflowState: { ...context.workflowState, iteration: newIteration, evaluator_scores: newScores } };
      }),
      always: [
        { guard: 'allPassed', target: 'passed' },
        { guard: 'maxRetries', target: 'maxedOut' },
        { target: 'fixing' },
      ],
    },
    /** Run all fix tasks; verdicts are reset so next check phase starts fresh. */
    fixing: {
      invoke: {
        src: 'fixPhaseActor',
        input: ({ context }) => context,
        onDone: { target: 'checking', actions: assign(({ event }) => event.output) },
        onError: [
          { guard: 'isAbortError', target: 'interrupted' },
          { guard: 'isHaltError', target: 'halted', actions: assign(({ context, event }) => ({ halted: true, errors: [...context.errors, toGateError((event as { error?: unknown }).error, 'fix-phase', resolveStoryKey(context))] })) },
          { target: 'halted', actions: assign(({ context, event }) => ({ errors: [...context.errors, toGateError((event as { error?: unknown }).error, 'fix-phase', resolveStoryKey(context))] })) },
        ],
      },
    },
    passed: { type: 'final' },
    maxedOut: { type: 'final' },  // NOT halted — story failed, but epic continues to next story
    halted: { type: 'final', entry: assign({ halted: true }) },  // real halt (RATE_LIMIT, NETWORK)
    interrupted: { type: 'final', entry: assign({ halted: true }) },  // user interrupt
  },
});
