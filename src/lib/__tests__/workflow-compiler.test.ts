/**
 * Tests for workflow-compiler module functions.
 *
 * Covers: PER_RUN_SENTINEL, isTaskCompleted, isLoopTaskCompleted,
 * buildRetryPrompt, buildAllUnknownVerdict, getFailedItems.
 */

import { describe, it, expect } from 'vitest';
import {
  HALT_ERROR_CODES,
  DEFAULT_MAX_ITERATIONS,
  isTaskCompleted,
  isLoopTaskCompleted,
  buildRetryPrompt,
  buildAllUnknownVerdict,
  getFailedItems,
  PER_RUN_SENTINEL,
  isLoopBlock,
  recordErrorInState,
  isEngineError,
  handleDispatchError,
  compileStep,
  compileGate,
  compileForEach,
  compileFlow,
} from '../workflow-compiler.js';
import { DispatchError } from '../agent-dispatch.js';
import { WorkflowError } from '../workflow-types.js';
import type { WorkItem } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';
import type { EvaluatorVerdict } from '../verdict-parser.js';
import type { ResolvedTask, StoryContext, EngineConfig, DispatchOutput, ForEachConfig } from '../workflow-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDefaultState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    workflow_name: '',
    started: '',
    iteration: 0,
    phase: 'idle',
    tasks_completed: [],
    evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('PER_RUN_SENTINEL', () => {
  it('should be __run__', () => {
    expect(PER_RUN_SENTINEL).toBe('__run__');
  });
});

describe('HALT_ERROR_CODES', () => {
  it('includes the halt-critical driver error codes', () => {
    expect(HALT_ERROR_CODES.has('RATE_LIMIT')).toBe(true);
    expect(HALT_ERROR_CODES.has('NETWORK')).toBe(true);
    expect(HALT_ERROR_CODES.has('SDK_INIT')).toBe(true);
  });

  it('does not include non-halting codes', () => {
    expect(HALT_ERROR_CODES.has('UNKNOWN')).toBe(false);
    expect(HALT_ERROR_CODES.has('AUTH')).toBe(false);
  });
});

describe('DEFAULT_MAX_ITERATIONS', () => {
  it('defaults to 5', () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(5);
  });
});

describe('isTaskCompleted', () => {
  it('returns true when task+story found in completed array', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(true);
  });

  it('returns false when task+story not found', () => {
    const state = makeDefaultState();
    expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(false);
  });

  it('returns false for error checkpoints', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z', error: true },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(false);
  });

  it('returns true when (taskName, storyKey) tuple matches a checkpoint', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '3-1-foo')).toBe(true);
  });

  it('returns false when taskName matches but storyKey does not', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '3-2-bar')).toBe(false);
  });

  it('returns false when storyKey matches but taskName does not', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'verify', '3-1-foo')).toBe(false);
  });

  it('returns false when tasks_completed is empty', () => {
    const state = makeDefaultState({ tasks_completed: [] });
    expect(isTaskCompleted(state, 'implement', '3-1-foo')).toBe(false);
  });

  it('returns true for per-run sentinel key', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'verify', PER_RUN_SENTINEL)).toBe(true);
  });
});

describe('isLoopTaskCompleted', () => {
  it('returns true when completion count >= iteration', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'check', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z' },
        { task_name: 'check', story_key: '1-1-foo', completed_at: '2026-01-01T00:01:00Z' },
      ],
    });
    expect(isLoopTaskCompleted(state, 'check', '1-1-foo', 2)).toBe(true);
    expect(isLoopTaskCompleted(state, 'check', '1-1-foo', 3)).toBe(false);
  });

  it('returns true when checkpoint count >= iteration', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:01:00Z' },
      ],
    });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(true);
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(true);
  });

  it('returns false when checkpoint count < iteration', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(false);
  });

  it('returns false when no checkpoints exist', () => {
    const state = makeDefaultState({ tasks_completed: [] });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(false);
  });

  it('excludes error checkpoints from count', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:01:00Z', error: true },
      ],
    });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(false);
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(true);
  });
});

describe('buildRetryPrompt', () => {
  it('includes failed findings', () => {
    const findings = [
      { ac: 1, description: 'Login works', status: 'pass' as const, evidence: { commands_run: [], output_observed: '', reasoning: '' } },
      { ac: 2, description: 'Signup fails', status: 'fail' as const, evidence: { commands_run: [], output_observed: '', reasoning: 'form broken' } },
    ];
    const prompt = buildRetryPrompt('1-1-foo', findings);
    expect(prompt).toContain('Retry story 1-1-foo');
    expect(prompt).toContain('AC #2 (FAIL): Signup fails');
    expect(prompt).toContain('form broken');
    expect(prompt).not.toContain('AC #1');
  });

  it('returns simple prompt when no failures', () => {
    const prompt = buildRetryPrompt('1-1-foo', []);
    expect(prompt).toBe('Implement story 1-1-foo');
  });

  it('builds prompt with failed and unknown findings', () => {
    const findings: EvaluatorVerdict['findings'] = [
      {
        ac: 1,
        description: 'Unit tests pass',
        status: 'fail',
        evidence: { commands_run: ['npm test'], output_observed: 'FAIL', reasoning: 'Tests failed' },
      },
      {
        ac: 2,
        description: 'Coverage above 80%',
        status: 'pass',
        evidence: { commands_run: ['npm test'], output_observed: '90%', reasoning: 'Good coverage' },
      },
      {
        ac: 3,
        description: 'Lint clean',
        status: 'unknown',
        evidence: { commands_run: [], output_observed: '', reasoning: 'Could not verify — timeout' },
      },
    ];

    const prompt = buildRetryPrompt('5-1-foo', findings);
    expect(prompt).toContain('Retry story 5-1-foo');
    expect(prompt).toContain('AC #1 (FAIL): Unit tests pass');
    expect(prompt).toContain('Evidence: Tests failed');
    expect(prompt).toContain('AC #3 (UNKNOWN): Lint clean');
    expect(prompt).not.toContain('AC #2');
    expect(prompt).toContain('Focus on fixing the failed criteria above.');
  });

  it('returns default prompt when no failed/unknown findings', () => {
    const findings: EvaluatorVerdict['findings'] = [
      {
        ac: 1,
        description: 'All good',
        status: 'pass',
        evidence: { commands_run: [], output_observed: '', reasoning: '' },
      },
    ];
    const prompt = buildRetryPrompt('5-1-foo', findings);
    expect(prompt).toBe('Implement story 5-1-foo');
  });

  it('returns default prompt for empty findings array', () => {
    const prompt = buildRetryPrompt('5-1-foo', []);
    expect(prompt).toBe('Implement story 5-1-foo');
  });

  it('includes unknown findings even when there are no failures', () => {
    const prompt = buildRetryPrompt('5-1-foo', [
      {
        ac: 1,
        description: 'Could not confirm lint',
        status: 'unknown',
        evidence: { commands_run: [], output_observed: '', reasoning: 'command timed out' },
      },
    ]);
    expect(prompt).toContain('AC #1 (UNKNOWN): Could not confirm lint');
  });
});

describe('buildAllUnknownVerdict', () => {
  it('creates all-unknown verdict', () => {
    const items: WorkItem[] = [
      { key: '1-1-foo', source: 'sprint' },
      { key: '1-2-bar', source: 'sprint' },
    ];
    const verdict = buildAllUnknownVerdict(items, 'evaluator failed');
    expect(verdict.verdict).toBe('fail');
    expect(verdict.score.unknown).toBe(2);
    expect(verdict.score.total).toBe(2);
    expect(verdict.findings).toHaveLength(2);
    expect(verdict.findings[0].status).toBe('unknown');
  });

  it('numbers acceptance criteria sequentially in descriptions', () => {
    const verdict = buildAllUnknownVerdict([{ key: '1', source: 'sprint' }, { key: '2', source: 'issues' }], 'timeout');
    expect(verdict.findings.map((finding) => finding.description)).toEqual(['AC #1', 'AC #2']);
  });

  it('copies the provided reasoning into every finding', () => {
    const verdict = buildAllUnknownVerdict([{ key: '1', source: 'sprint' }], 'evaluator unavailable');
    expect(verdict.findings[0].evidence.reasoning).toBe('evaluator unavailable');
  });
});

describe('getFailedItems', () => {
  const items: WorkItem[] = [
    { key: '1-1-foo', source: 'sprint' },
    { key: '1-2-bar', source: 'sprint' },
  ];

  it('returns all items when verdict is null', () => {
    expect(getFailedItems(null, items)).toEqual(items);
  });

  it('returns empty when verdict is pass', () => {
    const verdict: EvaluatorVerdict = { verdict: 'pass', score: { passed: 2, failed: 0, unknown: 0, total: 2 }, findings: [] };
    expect(getFailedItems(verdict, items)).toEqual([]);
  });

  it('returns all items when verdict is fail (conservative)', () => {
    const verdict: EvaluatorVerdict = { verdict: 'fail', score: { passed: 1, failed: 1, unknown: 0, total: 2 }, findings: [] };
    expect(getFailedItems(verdict, items)).toEqual(items);
  });

  it('returns an empty array unchanged when there are no work items', () => {
    const verdict: EvaluatorVerdict = { verdict: 'fail', score: { passed: 0, failed: 1, unknown: 0, total: 1 }, findings: [] };
    expect(getFailedItems(verdict, [])).toEqual([]);
  });
});

describe('isLoopBlock', () => {
  it('returns true for loop block objects', () => {
    expect(isLoopBlock({ loop: ['implement', 'verify'] })).toBe(true);
  });

  it('returns false for string flow steps', () => {
    expect(isLoopBlock('implement')).toBe(false);
  });

  it('returns false for nullish values cast as flow steps', () => {
    expect(isLoopBlock(null as never)).toBe(false);
  });

  it('returns false for plain objects without a loop property', () => {
    expect(isLoopBlock({ task: 'implement' } as never)).toBe(false);
  });
});

describe('recordErrorInState', () => {
  it('sets phase to error and appends an error checkpoint', () => {
    const state = makeDefaultState();
    const next = recordErrorInState(state, 'implement', '5-1-foo', {
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'UNKNOWN',
      message: 'boom',
    });

    expect(next.phase).toBe('error');
    expect(next.tasks_completed).toHaveLength(1);
    expect(next.tasks_completed[0]).toMatchObject({
      task_name: 'implement',
      story_key: '5-1-foo',
      error: true,
      error_code: 'UNKNOWN',
      error_message: 'boom',
    });
  });

  it('preserves existing checkpoints when appending an error checkpoint', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });

    const next = recordErrorInState(state, 'verify', PER_RUN_SENTINEL, {
      taskName: 'verify',
      storyKey: PER_RUN_SENTINEL,
      code: 'RATE_LIMIT',
      message: 'too many requests',
    });

    expect(next.tasks_completed).toHaveLength(2);
    expect(next.tasks_completed[0].task_name).toBe('implement');
    expect(next.tasks_completed[1]).toMatchObject({
      task_name: 'verify',
      story_key: PER_RUN_SENTINEL,
      error: true,
      error_code: 'RATE_LIMIT',
    });
  });

  it('keeps the original state object untouched', () => {
    const state = makeDefaultState();
    recordErrorInState(state, 'implement', '5-1-foo', {
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'UNKNOWN',
      message: 'boom',
    });
    expect(state.phase).toBe('idle');
    expect(state.tasks_completed).toEqual([]);
  });
});

describe('isEngineError', () => {
  it('returns true for valid engine error objects', () => {
    expect(isEngineError({
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'UNKNOWN',
      message: 'boom',
    })).toBe(true);
  });

  it('returns false for null and primitive values', () => {
    expect(isEngineError(null)).toBe(false);
    expect(isEngineError('boom')).toBe(false);
  });

  it('returns false when required fields are missing or wrong types', () => {
    expect(isEngineError({ taskName: 'implement', storyKey: '5-1-foo', code: 123, message: 'boom' })).toBe(false);
    expect(isEngineError({ taskName: 'implement', code: 'UNKNOWN', message: 'boom' })).toBe(false);
  });

  it('returns false when the message field is not a string', () => {
    expect(isEngineError({ taskName: 'implement', storyKey: '5-1-foo', code: 'UNKNOWN', message: 42 })).toBe(false);
  });
});

describe('handleDispatchError', () => {
  it('maps DispatchError instances to engine errors', () => {
    const err = new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner'));
    const handled = handleDispatchError(err, 'implement', '5-1-foo');
    expect(handled).toBeInstanceOf(WorkflowError);
    expect(handled).toMatchObject({
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'RATE_LIMIT',
      message: 'rate limited',
    });
  });

  it('maps generic Error instances to UNKNOWN engine errors', () => {
    const handled = handleDispatchError(new Error('kaboom'), 'verify', PER_RUN_SENTINEL);
    expect(handled).toBeInstanceOf(WorkflowError);
    expect(handled).toMatchObject({
      taskName: 'verify',
      storyKey: PER_RUN_SENTINEL,
      code: 'UNKNOWN',
      message: 'kaboom',
    });
  });

  it('stringifies non-Error throwables', () => {
    const handled = handleDispatchError('bad response', 'verify', PER_RUN_SENTINEL);
    expect(handled).toBeInstanceOf(WorkflowError);
    expect(handled).toMatchObject({
      taskName: 'verify',
      storyKey: PER_RUN_SENTINEL,
      code: 'UNKNOWN',
      message: 'bad response',
    });
  });

  it('preserves the provided task and story identifiers for generic errors', () => {
    expect(handleDispatchError(new Error('broken'), 'retry', '3-1-foo')).toMatchObject({
      taskName: 'retry',
      storyKey: '3-1-foo',
      code: 'UNKNOWN',
    });
  });
});

// ─── compileStep ─────────────────────────────────────────────────────

/** Minimal EngineConfig stub for testing compileStep input functions. */
function makeEngineConfig(agentName = 'dev'): EngineConfig {
  return {
    workflow: {
      tasks: {},
      storyFlow: [],
      epicFlow: [],
      flow: [],
      execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'rebase', epic_strategy: 'sequential', story_strategy: 'sequential' },
    },
    agents: {
      [agentName]: { name: agentName, model: 'claude-opus-4-5', instructions: '', disallowedTools: [], bare: true },
    },
    sprintStatusPath: '',
    runId: 'test-run',
  } as unknown as EngineConfig;
}

function makeStoryContext(overrides?: Partial<StoryContext>): StoryContext {
  return {
    item: { key: '1-1-test-story', source: 'sprint' },
    config: makeEngineConfig(),
    workflowState: makeDefaultState(),
    errors: [],
    tasksCompleted: 0,
    halted: false,
    lastContract: null,
    accumulatedCostUsd: 0,
    storyFlowTasks: new Set(),
    ...overrides,
  };
}

function makeAgentTask(agent = 'dev'): ResolvedTask {
  return { agent, session: 'fresh', source_access: true };
}

function makeNullTask(): ResolvedTask {
  return { agent: null, session: 'fresh', source_access: true };
}

describe('compileStep — agent task produces dispatchActor', () => {
  it('uses src dispatchActor when task has a non-null agent', () => {
    const tasks = { implement: makeAgentTask('dev') };
    const compiled = compileStep('implement', tasks, 'done');
    expect(compiled.invoke.src).toBe('dispatchActor');
  });
});

describe('compileStep — null task produces nullTaskActor', () => {
  it('uses src nullTaskActor when task has agent null', () => {
    const tasks = { sync: makeNullTask() };
    const compiled = compileStep('sync', tasks, 'done');
    expect(compiled.invoke.src).toBe('nullTaskActor');
  });
});

describe('compileStep — onDone target equals nextState', () => {
  it('sets onDone.target to the provided nextState string', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'verify');
    expect(compiled.invoke.onDone.target).toBe('verify');
  });

  it('propagates any nextState string verbatim', () => {
    const tasks = { implement: makeAgentTask() };
    expect(compileStep('implement', tasks, 'done').invoke.onDone.target).toBe('done');
    expect(compileStep('implement', tasks, 'check').invoke.onDone.target).toBe('check');
  });
});

describe('compileStep — onError guard chain abort halt fallback', () => {
  it('has isAbortError guard first targeting interrupted', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const [first] = compiled.invoke.onError;
    expect(first.guard).toBe('isAbortError');
    expect(first.target).toBe('interrupted');
  });

  it('has isHaltError guard second targeting halted', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const second = compiled.invoke.onError[1];
    expect(second.guard).toBe('isHaltError');
    expect(second.target).toBe('halted');
    expect(second.actions).toBeDefined();
  });

  it('has a fallback third entry with no guard and assign action', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const third = compiled.invoke.onError[2];
    expect(third.guard).toBeUndefined();
    expect(third.target).toBeUndefined();
    expect(third.actions).toBeDefined();
  });

  it('onError array has exactly three entries', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    expect(compiled.invoke.onError).toHaveLength(3);
  });
});

describe('compileStep — onDone assign merges context', () => {
  it('onDone.actions is an assign action object (has XState type marker)', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const actions = compiled.invoke.onDone.actions as { type: string };
    expect(actions).toBeDefined();
    expect(typeof actions.type).toBe('string');
    expect(actions.type).toContain('assign');
  });

  it('onDone assign produces updated workflowState, lastContract, tasksCompleted, cost', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const ctx = makeStoryContext({ tasksCompleted: 3, accumulatedCostUsd: 1.5 });
    const mockOutput: DispatchOutput = {
      output: 'done',
      cost: 0.25,
      changedFiles: [],
      sessionId: 'abc',
      contract: { version: 1, taskName: 'implement', storyId: '1-1-test-story', driver: 'claude-code', model: 'sonnet', timestamp: '', cost_usd: 0.25, duration_ms: 100, changedFiles: [], testResults: null, output: '', acceptanceCriteria: [] },
      updatedState: { ...makeDefaultState(), phase: 'running' },
    };

    // Extract the raw assignment function from XState's assign action object
    const assignAction = compiled.invoke.onDone.actions as { assignment: (args: { context: StoryContext; event: { output: DispatchOutput } }) => Partial<StoryContext> };
    const result = assignAction.assignment({ context: ctx, event: { output: mockOutput } });
    expect(result.workflowState).toBe(mockOutput.updatedState);
    expect(result.lastContract).toBe(mockOutput.contract);
    expect(result.tasksCompleted).toBe(4);
    expect(result.accumulatedCostUsd).toBeCloseTo(1.75);
    expect(result.errors).toBe(ctx.errors);
  });

  it('accumulates cost from DispatchOutput.cost even when contract is null', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const ctx = makeStoryContext({ accumulatedCostUsd: 1.5 });
    const assignAction = compiled.invoke.onDone.actions as { assignment: (args: { context: StoryContext; event: { output: DispatchOutput } }) => Partial<StoryContext> };

    const result = assignAction.assignment({
      context: ctx,
      event: {
        output: {
          output: 'done',
          cost: 0.4,
          changedFiles: [],
          sessionId: '',
          contract: null,
          updatedState: makeDefaultState({ phase: 'running' }),
        },
      },
    });

    expect(result.accumulatedCostUsd).toBeCloseTo(1.9);
  });
});

describe('compileStep — unknown task throws at compile time', () => {
  it('throws a descriptive Error when step is not in tasks map', () => {
    const tasks = { implement: makeAgentTask() };
    expect(() => compileStep('nonexistent', tasks, 'done')).toThrow(
      /compileStep: task "nonexistent" not found/,
    );
  });

  it('throws synchronously (before any runtime execution)', () => {
    expect(() => compileStep('missing', {}, 'done')).toThrow(Error);
  });
});

describe('compileStep — input function derives from context', () => {
  it('agent task input function maps context fields to DispatchInput shape', () => {
    const tasks = { implement: makeAgentTask('dev') };
    const compiled = compileStep('implement', tasks, 'done');
    const ctx = makeStoryContext({ accumulatedCostUsd: 2.0 });
    const input = compiled.invoke.input({ context: ctx }) as ReturnType<typeof compiled.invoke.input>;
    expect(input.taskName).toBe('implement');
    expect(input.storyKey).toBe('1-1-test-story');
    expect(input.workflowState).toBe(ctx.workflowState);
    expect(input.previousContract).toBe(ctx.lastContract);
    expect(input.accumulatedCostUsd).toBe(2.0);
    expect('definition' in input).toBe(true);
    if ('definition' in input) {
      expect(input.definition).toBe(ctx.config.agents.dev);
    }
  });

  it('null task input function maps context fields to NullTaskInput shape', () => {
    const tasks = { sync: makeNullTask() };
    const compiled = compileStep('sync', tasks, 'done');
    const ctx = makeStoryContext();
    const input = compiled.invoke.input({ context: ctx });
    expect(input.taskName).toBe('sync');
    expect(input.storyKey).toBe('1-1-test-story');
    expect(input.workflowState).toBe(ctx.workflowState);
    expect('definition' in input).toBe(false);
  });

  it('input function reads storyKey from context.item.key, not hardcoded', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileStep('implement', tasks, 'done');
    const ctx1 = makeStoryContext({ item: { key: '2-1-story-a', source: 'sprint' } });
    const ctx2 = makeStoryContext({ item: { key: '3-5-story-b', source: 'sprint' } });
    expect(compiled.invoke.input({ context: ctx1 }).storyKey).toBe('2-1-story-a');
    expect(compiled.invoke.input({ context: ctx2 }).storyKey).toBe('3-5-story-b');
  });
});

describe('compileStep — pure deterministic', () => {
  it('returns identical config object structure when called twice with same inputs', () => {
    const tasks = { implement: makeAgentTask() };
    const a = compileStep('implement', tasks, 'done');
    const b = compileStep('implement', tasks, 'done');
    expect(a.invoke.src).toBe(b.invoke.src);
    expect(a.invoke.onDone.target).toBe(b.invoke.onDone.target);
    expect(a.invoke.onError[0].guard).toBe(b.invoke.onError[0].guard);
    expect(a.invoke.onError[1].guard).toBe(b.invoke.onError[1].guard);
  });

  it('calling compileStep does not mutate the tasks map', () => {
    const tasks = { implement: makeAgentTask() };
    const before = JSON.stringify(tasks);
    compileStep('implement', tasks, 'done');
    expect(JSON.stringify(tasks)).toBe(before);
  });
});

// ─── compileGate ─────────────────────────────────────────────────────

function makeGateConfig(overrides?: Partial<{ check: string[]; fix: string[]; max_retries: number }>): import('../workflow-types.js').GateConfig {
  return {
    gate: 'quality',
    check: overrides?.check ?? ['check', 'review'],
    fix: overrides?.fix ?? ['retry'],
    pass_when: 'consensus',
    max_retries: overrides?.max_retries ?? 5,
    circuit_breaker: 'stagnation',
  };
}

function makeGateTasks(): Record<string, ResolvedTask> {
  return {
    check: makeAgentTask('dev'),
    review: makeAgentTask('dev'),
    retry: makeAgentTask('dev'),
  };
}

 
function asAny(v: unknown): any { return v; }

describe('compileGate — checking child state has sequential invoke states', () => {
  it('has a checking state with initial step_0 and onDone targeting evaluate (AC #3)', () => {
    const compiled = compileGate(makeGateConfig(), makeGateTasks());
    const checking = asAny(compiled.states).checking;
    expect(checking).toBeDefined();
    expect(checking.initial).toBe('step_0');
    expect(checking.onDone.target).toBe('evaluate');
  });

  it('each check task is a distinct invoke state within checking (AC #3)', () => {
    const compiled = compileGate(makeGateConfig({ check: ['check', 'review'] }), makeGateTasks());
    const { states } = asAny(compiled.states).checking;
    expect(states.step_0.invoke).toBeDefined();
    expect(states.step_1.invoke).toBeDefined();
    expect(states.step_0).not.toBe(states.step_1);
  });

  it('check tasks chain sequentially: step_0.onDone.target is step_1, step_1.onDone.target is done (AC #3)', () => {
    const compiled = compileGate(makeGateConfig({ check: ['check', 'review'] }), makeGateTasks());
    const { states } = asAny(compiled.states).checking;
    expect(states.step_0.invoke.onDone.target).toBe('step_1');
    expect(states.step_1.invoke.onDone.target).toBe('done');
  });
});

describe('compileGate — evaluate state with guard-based transitions', () => {
  it('has allPassed → maxRetries → circuitBreaker → fixing guard chain (AC #4)', () => {
    const compiled = compileGate(makeGateConfig(), makeGateTasks());
    const { always } = asAny(compiled.states).evaluate;
    expect(always[0]).toMatchObject({ guard: 'allPassed', target: 'passed' });
    expect(always[1]).toMatchObject({ guard: 'maxRetries', target: 'maxedOut' });
    expect(always[2]).toMatchObject({ guard: 'circuitBreaker', target: 'halted' });
    expect(always[3]).toMatchObject({ target: 'fixing' });
    expect(always[3].guard).toBeUndefined();
  });
});

describe('compileGate — fixing phase transitions back to checking', () => {
  it('fixing.onDone.target is checking (AC #5)', () => {
    const compiled = compileGate(makeGateConfig(), makeGateTasks());
    const fixing = asAny(compiled.states).fixing;
    expect(fixing.onDone.target).toBe('checking');
  });

  it('fix tasks chain sequentially within fixing (AC #5)', () => {
    const compiled = compileGate(makeGateConfig({ fix: ['retry'] }), makeGateTasks());
    const { states } = asAny(compiled.states).fixing;
    expect(states.step_0.invoke).toBeDefined();
    expect(states.step_0.invoke.onDone.target).toBe('done');
  });
});

describe('compileGate — four final states passed maxedOut halted interrupted', () => {
  it('all four terminal states have type final (AC #6)', () => {
    const compiled = compileGate(makeGateConfig(), makeGateTasks());
    const s = asAny(compiled.states);
    expect(s.passed).toEqual({ type: 'final' });
    expect(s.maxedOut).toEqual({ type: 'final' });
    expect(s.halted).toEqual({ type: 'final' });
    expect(s.interrupted).toEqual({ type: 'final' });
  });
});

describe('compileGate — verdict assign in checking phase', () => {
  it('check task onDone accumulates verdict entry in context.verdicts (AC #7)', () => {
    const compiled = compileGate(makeGateConfig({ check: ['check'] }), makeGateTasks());
    const step0 = asAny(compiled.states).checking.states.step_0;
    const assignAction = step0.invoke.onDone.actions as { assignment: (args: { context: import('../workflow-types.js').GateContext; event: { output: DispatchOutput } }) => Record<string, unknown> };
    const ctx: import('../workflow-types.js').GateContext = {
      gate: makeGateConfig({ check: ['check'] }),
      config: makeEngineConfig(),
      workflowState: makeDefaultState(),
      errors: [],
      tasksCompleted: 0,
      halted: false,
      lastContract: null,
      accumulatedCostUsd: 0,
      verdicts: {},
    };
    const mockOutput: DispatchOutput = {
      output: 'done',
      cost: 0.1,
      changedFiles: [],
      sessionId: 'x',
      contract: { version: 1, taskName: 'check', storyId: 'quality', driver: 'claude-code', model: 'sonnet', timestamp: '', cost_usd: 0.1, duration_ms: 100, changedFiles: [], testResults: null, output: 'verdict-text', acceptanceCriteria: [] },
      updatedState: makeDefaultState(),
    };
    const result = assignAction.assignment({ context: ctx, event: { output: mockOutput } });
    expect(result.verdicts).toMatchObject({ check: 'verdict-text' });
  });
});

describe('compileGate — unknown check task throws at compile time', () => {
  it('throws descriptive error when check task is not in tasks map (AC #8)', () => {
    const tasks = { retry: makeAgentTask() };
    expect(() => compileGate(makeGateConfig({ check: ['missing-check'], fix: ['retry'] }), tasks)).toThrow(
      /compileGate.*unknown check task.*missing-check/,
    );
  });
});

describe('compileGate — unknown fix task throws at compile time', () => {
  it('throws descriptive error when fix task is not in tasks map (AC #9)', () => {
    const tasks = { check: makeAgentTask() };
    expect(() => compileGate(makeGateConfig({ check: ['check'], fix: ['missing-fix'] }), tasks)).toThrow(
      /compileGate.*unknown fix task.*missing-fix/,
    );
  });
});

describe('compileGate — null agent check task uses nullTaskActor', () => {
  it('null agent check task produces nullTaskActor invoke src (AC #10)', () => {
    const tasks = { check: makeNullTask(), retry: makeAgentTask() };
    const compiled = compileGate(makeGateConfig({ check: ['check'], fix: ['retry'] }), tasks);
    const step0 = asAny(compiled.states).checking.states.step_0;
    expect(step0.invoke.src).toBe('nullTaskActor');
  });
});

describe('compileGate — pure deterministic', () => {
  it('same inputs produce structurally identical outputs (AC #11)', () => {
    const gate = makeGateConfig();
    const tasks = makeGateTasks();
    const a = compileGate(gate, tasks);
    const b = compileGate(gate, tasks);
    expect(a.initial).toBe(b.initial);
    expect(Object.keys(a.states)).toEqual(Object.keys(b.states));
    const aChecking = asAny(a.states).checking;
    const bChecking = asAny(b.states).checking;
    expect(aChecking.initial).toBe(bChecking.initial);
    expect(aChecking.onDone.target).toBe(bChecking.onDone.target);
    expect(Object.keys(aChecking.states)).toEqual(Object.keys(bChecking.states));
  });
});

describe('compileGate — single check and single fix produce one invoke each', () => {
  it('single check produces exactly one invoke state in checking, single fix in fixing (AC #14)', () => {
    const tasks = { check: makeAgentTask(), retry: makeAgentTask() };
    const compiled = compileGate(makeGateConfig({ check: ['check'], fix: ['retry'] }), tasks);
    const checkingInvokeKeys = Object.keys(asAny(compiled.states).checking.states).filter((k) => k !== 'done');
    const fixingInvokeKeys = Object.keys(asAny(compiled.states).fixing.states).filter((k) => k !== 'done');
    expect(checkingInvokeKeys).toHaveLength(1);
    expect(fixingInvokeKeys).toHaveLength(1);
  });
});

// ─── compileForEach ──────────────────────────────────────────────────

function makeForEachConfig(overrides?: Partial<ForEachConfig>): ForEachConfig {
  return { for_each: 'story', steps: ['create-story', 'implement'], ...overrides };
}

function makeForEachTasks(): Record<string, ResolvedTask> {
  return { 'create-story': makeAgentTask(), implement: makeAgentTask(), verify: makeAgentTask() };
}

describe('compileForEach — processItem child state has compiled steps (AC #3)', () => {
  it('processItem is a compound state with initial step_0 and onDone targeting checkNext', () => {
    const compiled = compileForEach(makeForEachConfig(), makeForEachTasks());
    const processItem = asAny(compiled.states).processItem;
    expect(processItem.initial).toBe('step_0');
    expect(processItem.onDone.target).toBe('checkNext');
  });

  it('processItem child states include invoke states for each nested step', () => {
    const compiled = compileForEach(makeForEachConfig({ steps: ['create-story', 'implement'] }), makeForEachTasks());
    const { states } = asAny(compiled.states).processItem;
    expect(states.step_0.invoke).toBeDefined();
    expect(states.step_1.invoke).toBeDefined();
    expect(states.done).toEqual({ type: 'final' });
  });

  it('steps chain sequentially: step_0 → step_1 → done', () => {
    const compiled = compileForEach(makeForEachConfig({ steps: ['create-story', 'implement'] }), makeForEachTasks());
    const { states } = asAny(compiled.states).processItem;
    expect(states.step_0.invoke.onDone.target).toBe('step_1');
    expect(states.step_1.invoke.onDone.target).toBe('done');
  });
});

describe('compileForEach — checkNext state with hasMoreItems guard (AC #4)', () => {
  it('checkNext has always array with hasMoreItems guard → processItem', () => {
    const compiled = compileForEach(makeForEachConfig(), makeForEachTasks());
    const checkNext = asAny(compiled.states).checkNext;
    expect(checkNext.always[0]).toMatchObject({ guard: 'hasMoreItems', target: 'processItem' });
  });

  it('checkNext default fallback targets done (AC #4)', () => {
    const compiled = compileForEach(makeForEachConfig(), makeForEachTasks());
    const checkNext = asAny(compiled.states).checkNext;
    expect(checkNext.always[1]).toMatchObject({ target: 'done' });
    expect(checkNext.always[1].guard).toBeUndefined();
  });
});

describe('compileForEach — checkNext assign increments index (AC #14)', () => {
  it('hasMoreItems transition has an assign action object', () => {
    const compiled = compileForEach(makeForEachConfig(), makeForEachTasks());
    const transition = asAny(compiled.states).checkNext.always[0];
    expect(transition.actions).toBeDefined();
    expect(typeof (transition.actions as { type: string }).type).toBe('string');
    expect((transition.actions as { type: string }).type).toContain('assign');
  });

  it('assign action increments currentIndex and rebinds item from items array', () => {
    const compiled = compileForEach(makeForEachConfig(), makeForEachTasks());
    const transition = asAny(compiled.states).checkNext.always[0];
    const items = [
      { key: 'item-0', source: 'sprint' as const },
      { key: 'item-1', source: 'sprint' as const },
      { key: 'item-2', source: 'sprint' as const },
      { key: 'item-3', source: 'sprint' as const },
    ];
    const assignAction = transition.actions as { assignment: (args: { context: { currentIndex: number; items: typeof items; item: (typeof items)[number] } }) => Record<string, unknown> };
    const result = assignAction.assignment({ context: { currentIndex: 2, items, item: items[2] } });
    expect(result.currentIndex).toBe(3);
    expect((result.item as { key: string }).key).toBe('item-3');
  });
});

describe('compileForEach — done state is final (AC #5)', () => {
  it('done child state has type final', () => {
    const compiled = compileForEach(makeForEachConfig(), makeForEachTasks());
    expect(asAny(compiled.states).done).toEqual({ type: 'final' });
  });
});

describe('compileForEach — gate block within steps delegates to compileGate (AC #6)', () => {
  it('gate step in steps compiles to compound checking/evaluate/fixing substates', () => {
    const gate = makeGateConfig({ check: ['check'], fix: ['retry'] });
    const tasks = { ...makeGateTasks(), implement: makeAgentTask() };
    const config: ForEachConfig = { for_each: 'story', steps: [gate] };
    const compiled = compileForEach(config, tasks);
    const step0 = asAny(compiled.states).processItem.states.step_0;
    // Gate compound state has initial 'checking' and onDone targeting next step
    expect(step0.initial).toBe('checking');
    expect(step0.states.checking).toBeDefined();
    expect(step0.states.evaluate).toBeDefined();
    expect(step0.states.fixing).toBeDefined();
    expect(step0.onDone.target).toBe('done');
  });
});

describe('compileGate — storyKey uses parentItemKey prefix when provided (gate naming in for_each)', () => {
  it('gate input storyKey is prefixed with parentItemKey when set in context', () => {
    const compiled = compileGate(makeGateConfig({ check: ['check'], fix: ['retry'] }), makeGateTasks());
    const step0 = asAny(compiled.states).checking.states.step_0;
    const inputFn = step0.invoke.input as (args: { context: import('../workflow-types.js').GateContext }) => { storyKey: string };
    const ctxWithItem: import('../workflow-types.js').GateContext = {
      gate: makeGateConfig({ check: ['check'], fix: ['retry'] }),
      config: makeEngineConfig(),
      workflowState: makeDefaultState(),
      errors: [],
      tasksCompleted: 0,
      halted: false,
      lastContract: null,
      accumulatedCostUsd: 0,
      verdicts: {},
      parentItemKey: '2-1-story-a',
    };
    const ctxWithoutItem: import('../workflow-types.js').GateContext = { ...ctxWithItem, parentItemKey: undefined };
    expect(inputFn({ context: ctxWithItem }).storyKey).toBe('2-1-story-a:quality');
    expect(inputFn({ context: ctxWithoutItem }).storyKey).toBe('quality');
  });
});

describe('compileForEach — nested for_each recursive (AC #7)', () => {
  it('outer for_each step_0 is itself a processItem/checkNext/done compound state', () => {
    const innerConfig: ForEachConfig = { for_each: 'story', steps: ['implement'] };
    const outerConfig: ForEachConfig = { for_each: 'epic', steps: [innerConfig] };
    const tasks = { implement: makeAgentTask() };
    const compiled = compileForEach(outerConfig, tasks);
    const outerStep0 = asAny(compiled.states).processItem.states.step_0;
    expect(outerStep0.initial).toBe('processItem');
    expect(outerStep0.states.processItem).toBeDefined();
    expect(outerStep0.states.checkNext).toBeDefined();
    expect(outerStep0.states.done).toEqual({ type: 'final' });
  });

  it('nested for_each also has processItem with step_0 invoke', () => {
    const innerConfig: ForEachConfig = { for_each: 'story', steps: ['implement'] };
    const outerConfig: ForEachConfig = { for_each: 'epic', steps: [innerConfig] };
    const tasks = { implement: makeAgentTask() };
    const compiled = compileForEach(outerConfig, tasks);
    const innerProcessItem = asAny(compiled.states).processItem.states.step_0.states.processItem;
    expect(innerProcessItem.initial).toBe('step_0');
    expect(innerProcessItem.states.step_0.invoke).toBeDefined();
  });
});

describe('compileForEach — unknown task in nested steps throws at compile time (AC #8)', () => {
  it('throws descriptive error when nested step is not in tasks map', () => {
    const tasks = { implement: makeAgentTask() };
    expect(() => compileForEach(makeForEachConfig({ steps: ['missing-task'] }), tasks)).toThrow(
      /compileStep: task "missing-task" not found/,
    );
  });

  it('throws synchronously before any runtime execution', () => {
    expect(() => compileForEach(makeForEachConfig({ steps: ['ghost'] }), {})).toThrow(Error);
  });
});

describe('compileForEach — single step optimization (AC #9)', () => {
  it('single step produces exactly one invoke in processItem (plus done)', () => {
    const tasks = { implement: makeAgentTask() };
    const compiled = compileForEach(makeForEachConfig({ steps: ['implement'] }), tasks);
    const itemStates = asAny(compiled.states).processItem.states;
    const invokeKeys = Object.keys(itemStates).filter((k) => k !== 'done');
    expect(invokeKeys).toHaveLength(1);
    expect(itemStates.step_0.invoke).toBeDefined();
    expect(itemStates.step_0.invoke.onDone.target).toBe('done');
  });
});

describe('compileForEach — pure deterministic (AC #10)', () => {
  it('same inputs produce structurally identical outputs', () => {
    const config = makeForEachConfig();
    const tasks = makeForEachTasks();
    const a = compileForEach(config, tasks);
    const b = compileForEach(config, tasks);
    expect(a.initial).toBe(b.initial);
    expect(Object.keys(a.states)).toEqual(Object.keys(b.states));
    expect(asAny(a.states).checkNext.always[0].guard).toBe(asAny(b.states).checkNext.always[0].guard);
  });

  it('calling compileForEach does not mutate the tasks map', () => {
    const tasks = makeForEachTasks();
    const before = JSON.stringify(tasks);
    compileForEach(makeForEachConfig(), tasks);
    expect(JSON.stringify(tasks)).toBe(before);
  });
});

describe('compileForEach — empty steps throws at compile time (AC #11)', () => {
  it('throws descriptive error for empty steps array', () => {
    expect(() => compileForEach(makeForEachConfig({ steps: [] }), makeForEachTasks())).toThrow(
      /compileForEach: "story" has empty steps array/,
    );
  });
});

describe('compileForEach — meta scope field carries for_each identifier', () => {
  it('compiled state has meta.scope matching the for_each string', () => {
    const compiled = compileForEach(makeForEachConfig({ for_each: 'epic' }), makeForEachTasks());
    expect(asAny(compiled).meta?.scope).toBe('epic');
  });
});

// ─── compileFlow ─────────────────────────────────────────────────────

function makeFlowTasks(): Record<string, ResolvedTask> {
  return {
    'create-story': makeAgentTask(),
    implement: makeAgentTask(),
    document: makeAgentTask(),
    check: makeAgentTask(),
    retry: makeAgentTask(),
    verify: makeAgentTask(),
  };
}

describe('compileFlow — empty steps produces done-only config (AC #6)', () => {
  it('empty flow has initial done and only a final done state', () => {
    const result = compileFlow([], makeFlowTasks());
    expect(result.initial).toBe('done');
    expect(asAny(result.states).done).toEqual({ type: 'final' });
    expect(Object.keys(result.states)).toHaveLength(1);
  });
});

describe('compileFlow — single plain task step produces step_0→done (AC #8)', () => {
  it('single step compiles to step_0 with onDone targeting done', () => {
    const result = compileFlow(['implement'], makeFlowTasks());
    expect(result.initial).toBe('step_0');
    expect(asAny(result.states).step_0.invoke).toBeDefined();
    expect(asAny(result.states).step_0.invoke.onDone.target).toBe('done');
    expect(asAny(result.states).done).toEqual({ type: 'final' });
  });
});

describe('compileFlow — mixed sequential steps chain correctly (AC #3)', () => {
  it('four steps step_0 through step_3 chained sequentially to done', () => {
    const gate = makeGateConfig({ check: ['check'], fix: ['retry'] });
    const result = compileFlow(['create-story', 'implement', gate, 'document'], makeFlowTasks());
    expect(result.initial).toBe('step_0');
    expect(asAny(result.states).step_0.invoke.onDone.target).toBe('step_1');
    expect(asAny(result.states).step_1.invoke.onDone.target).toBe('step_2');
    expect(asAny(result.states).step_2.onDone.target).toBe('step_3');
    expect(asAny(result.states).step_3.invoke.onDone.target).toBe('done');
    expect(asAny(result.states).done).toEqual({ type: 'final' });
  });
});

describe('compileFlow — gate step embedded as compound state (AC #4)', () => {
  it('gate step has checking/evaluate/fixing substates and onDone targeting next step', () => {
    const gate = makeGateConfig({ check: ['check'], fix: ['retry'] });
    const result = compileFlow([gate, 'implement'], makeFlowTasks());
    const step0 = asAny(result.states).step_0;
    expect(step0.initial).toBe('checking');
    expect(step0.states.checking).toBeDefined();
    expect(step0.states.evaluate).toBeDefined();
    expect(step0.states.fixing).toBeDefined();
    expect(step0.onDone.target).toBe('step_1');
  });
});

describe('compileFlow — for_each step embedded as compound state (AC #5)', () => {
  it('for_each step has processItem/checkNext/done substates and onDone targeting next step', () => {
    const config: ForEachConfig = { for_each: 'story', steps: ['implement'] };
    const result = compileFlow([config, 'document'], makeFlowTasks());
    const step0 = asAny(result.states).step_0;
    expect(step0.initial).toBe('processItem');
    expect(step0.states.processItem).toBeDefined();
    expect(step0.states.checkNext).toBeDefined();
    expect(step0.onDone.target).toBe('step_1');
  });
});

describe('compileFlow — unknown task throws at compile time (AC #7)', () => {
  it('throws descriptive error when plain task step is not in tasks map', () => {
    expect(() => compileFlow(['ghost-task'], makeFlowTasks())).toThrow(
      /compileStep: task "ghost-task" not found/,
    );
  });

  it('throws synchronously before any runtime execution', () => {
    expect(() => compileFlow(['missing'], {})).toThrow(Error);
  });
});

describe('compileFlow — pure deterministic (AC #9)', () => {
  it('same inputs produce deeply equal structure', () => {
    const tasks = makeFlowTasks();
    const gate = makeGateConfig({ check: ['check'], fix: ['retry'] });
    const a = compileFlow(['create-story', gate], tasks);
    const b = compileFlow(['create-story', gate], tasks);
    expect(a.initial).toBe(b.initial);
    expect(Object.keys(a.states)).toEqual(Object.keys(b.states));
    expect(asAny(a.states).step_0.invoke.src).toBe(asAny(b.states).step_0.invoke.src);
  });

  it('calling compileFlow does not mutate the tasks map', () => {
    const tasks = makeFlowTasks();
    const before = JSON.stringify(tasks);
    compileFlow(['implement'], tasks);
    expect(JSON.stringify(tasks)).toBe(before);
  });
});

describe('compileFlow — all three step types dispatched correctly (AC #10)', () => {
  it('plain task → invoke, gate → checking compound, for_each → processItem compound', () => {
    const gate = makeGateConfig({ check: ['check'], fix: ['retry'] });
    const each: ForEachConfig = { for_each: 'story', steps: ['implement'] };
    const result = compileFlow(['create-story', gate, each], makeFlowTasks());
    expect(asAny(result.states).step_0.invoke).toBeDefined();
    expect(asAny(result.states).step_0.invoke.src).toBe('dispatchActor');
    expect(asAny(result.states).step_1.initial).toBe('checking');
    expect(asAny(result.states).step_1.states.checking).toBeDefined();
    expect(asAny(result.states).step_2.initial).toBe('processItem');
    expect(asAny(result.states).step_2.states.processItem).toBeDefined();
  });
});

describe('compileFlow — recursive nested compilation works end-to-end (AC #11)', () => {
  it('for_each containing a gate compiles the gate recursively inside processItem', () => {
    const gate = makeGateConfig({ check: ['check'], fix: ['retry'] });
    const each: ForEachConfig = { for_each: 'story', steps: [gate] };
    const result = compileFlow([each], makeFlowTasks());
    const step0 = asAny(result.states).step_0;
    expect(step0.initial).toBe('processItem');
    const nestedStep0 = step0.states.processItem.states.step_0;
    expect(nestedStep0.initial).toBe('checking');
    expect(nestedStep0.states.checking).toBeDefined();
    expect(nestedStep0.states.evaluate).toBeDefined();
  });
});

describe('compileFlow — unsupported step type throws descriptive error (AC #14)', () => {
  it('legacy LoopBlock step throws compile-time error with descriptive message', () => {
    const legacyStep = { loop: ['implement', 'verify'] };
    expect(() => compileFlow([legacyStep as unknown as import('../workflow-types.js').FlowStep], makeFlowTasks())).toThrow(
      /unsupported step type.*legacy LoopBlock/,
    );
  });
});
