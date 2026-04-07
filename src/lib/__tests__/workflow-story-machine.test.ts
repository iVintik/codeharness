/**
 * Tests for workflow-story-machine module.
 *
 * Covers: single task, sequential tasks, gate pass, gate halt, halt error,
 * INTERRUPT, null task, output shape, mixed steps, non-halt error (story 25-2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { storyMachine } from '../workflow-story-machine.js';
import type { StoryFlowInput, EngineConfig, OutputContract, GateConfig } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';

// ─── Hoisted Mocks ───────────────────────────────────────────────────

const { mockDispatchTaskCore, mockNullTaskCore, MockDispatchError } = vi.hoisted(() => {
  class MockDispatchError extends Error {
    public readonly code: string;
    public readonly agentName: string;
    public readonly cause: unknown;
    constructor(message: string, code: string, agentName: string, cause: unknown) {
      super(message); this.name = 'DispatchError'; this.code = code; this.agentName = agentName; this.cause = cause;
    }
  }
  return { mockDispatchTaskCore: vi.fn(), mockNullTaskCore: vi.fn(), MockDispatchError };
});

vi.mock('../agent-dispatch.js', () => ({ DispatchError: MockDispatchError }));
vi.mock('../workflow-actors.js', () => ({
  dispatchTaskCore: mockDispatchTaskCore,
  nullTaskCore: mockNullTaskCore,
  dispatchActor: undefined,
  nullTaskActor: undefined,
  nullTaskDispatchActor: undefined,
  buildCoverageDeduplicationContext: vi.fn().mockReturnValue(null),
}));
vi.mock('../output.js', () => ({ warn: vi.fn(), info: vi.fn(), log: vi.fn(), error: vi.fn() }));
vi.mock('../workflow-persistence.js', () => ({ appendCheckpoint: vi.fn() }));
vi.mock('../workflow-state.js', () => ({
  writeWorkflowState: vi.fn(),
  readWorkflowState: vi.fn(),
  getDefaultWorkflowState: vi.fn().mockReturnValue({
    workflow_name: '', started: '', iteration: 0, phase: 'idle' as const,
    tasks_completed: [], evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    workflow_name: 'test', started: '2024-01-01T00:00:00.000Z',
    iteration: 0, phase: 'executing', tasks_completed: [],
    evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] },
    ...overrides,
  };
}

function makeContract(output = 'done'): OutputContract {
  return {
    version: 1, taskName: 'test', storyId: 'story-1', driver: 'test', model: 'test',
    timestamp: '2024-01-01T00:00:00.000Z', cost_usd: 0.01, duration_ms: 50,
    changedFiles: [], testResults: null, output, acceptanceCriteria: [],
  };
}

function makeOut(state?: WorkflowState) {
  const ws = state ?? makeWorkflowState();
  return { output: 'done', cost: 0.01, changedFiles: [], sessionId: 's', contract: makeContract(), updatedState: ws };
}

const PASS = '<verdict>pass</verdict>';

function makeGate(overrides: Partial<GateConfig> = {}): GateConfig {
  return { gate: 'g1', check: ['check-task'], fix: ['fix-task'], pass_when: 'all_pass', max_retries: 3, circuit_breaker: 'default', ...overrides };
}

function makeInput(overrides: Partial<StoryFlowInput & { storyFlow?: unknown[] }> = {}): StoryFlowInput {
  const { storyFlow = [], ...rest } = overrides;
  const config = {
    workflow: {
      tasks: {
        'task-a': { agent: 'test-agent', session: 'fresh', source_access: true },
        'task-b': { agent: 'test-agent', session: 'fresh', source_access: true },
        'task-c': { agent: 'test-agent', session: 'fresh', source_access: true },
        'null-task': { agent: null, session: 'fresh', source_access: true },
        'check-task': { agent: 'test-agent', session: 'fresh', source_access: true },
        'fix-task': { agent: 'test-agent', session: 'fresh', source_access: true },
      },
      storyFlow,
      epicFlow: [], sprintFlow: [], execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'rebase', epic_strategy: 'sequential', story_strategy: 'sequential' }, flow: [],
    },
    agents: { 'test-agent': { name: 'test-agent', model: 'test-model', instructions: '', disallowedTools: [], bare: true } },
    sprintStatusPath: '/tmp/test', runId: 'test-run',
  } as unknown as EngineConfig;

  return {
    item: { key: 'story-1', source: 'sprint' },
    config,
    workflowState: makeWorkflowState(),
    lastContract: null,
    accumulatedCostUsd: 0,
    storyFlowTasks: new Set<string>(),
    ...rest,
  };
}

async function run(input: StoryFlowInput) {
  const actor = createActor(storyMachine, { input });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5000 });
  return { snap, actor };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('storyMachine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('single plain task reaches done final state and task dispatched once', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const { snap } = await run(makeInput({ storyFlow: ['task-a'] }));
    expect(snap.value).toBe('done');
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'task-a' });
  });

  it('three sequential tasks reach done with tasksCompleted equal to 3', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut());
    const { snap } = await run(makeInput({ storyFlow: ['task-a', 'task-b', 'task-c'] }));
    expect(snap.value).toBe('done');
    expect(snap.output?.tasksCompleted).toBe(3);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(3);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'task-a' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'task-b' });
    expect(mockDispatchTaskCore.mock.calls[2][0]).toMatchObject({ taskName: 'task-c' });
  });

  it('gate step with all-pass verdicts: gate passes, story reaches done', async () => {
    // check-task passes → gate passes → story done
    mockDispatchTaskCore.mockResolvedValueOnce({ ...makeOut(), output: PASS, contract: makeContract(PASS) });
    const { snap } = await run(makeInput({ storyFlow: [makeGate()] }));
    expect(snap.value).toBe('done');
  });

  it('gate step that maxes out (maxRetries): story completes without halt, remaining steps skipped', async () => {
    // max_retries=1: check fails → iteration=1 >= max_retries → maxedOut (NOT halted)
    // Story skips remaining steps but does NOT halt the epic
    mockDispatchTaskCore.mockResolvedValueOnce({ ...makeOut(), output: '<verdict>fail</verdict>', contract: makeContract('<verdict>fail</verdict>') });
    const gate = makeGate({ max_retries: 1 });
    const { snap } = await run(makeInput({ storyFlow: [gate] }));
    expect(snap.output?.halted).toBe(false);
  });

  it('gate step that halts via halt error: story reaches halted with gate errors merged', async () => {
    // Halt error from check task → gate reaches halted → story gets gate.halted=true → machine routes to halted
    mockDispatchTaskCore.mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const { snap } = await run(makeInput({ storyFlow: [makeGate()] }));
    expect(snap.value).toBe('halted');
    expect(snap.output?.halted).toBe(true);
    expect(snap.output?.errors.length).toBeGreaterThan(0);
  });

  it('halt error from plain task dispatch: machine transitions to halted state', async () => {
    mockDispatchTaskCore.mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const { snap } = await run(makeInput({ storyFlow: ['task-a'] }));
    expect(snap.value).toBe('halted');
  });

  it('INTERRUPT event transitions to interrupted final state', async () => {
    let unblock: (() => void) | undefined;
    mockDispatchTaskCore.mockImplementationOnce(() => new Promise((resolve) => { unblock = () => resolve(makeOut()); }));
    const input = makeInput({ storyFlow: ['task-a'] });
    const actor = createActor(storyMachine, { input });
    actor.start();
    actor.send({ type: 'INTERRUPT' });
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5000 });
    unblock?.();
    expect(snap.value).toBe('interrupted');
  });

  it('null task step uses nullTaskCore path, not dispatchTaskCore', async () => {
    mockNullTaskCore.mockResolvedValueOnce(makeOut());
    const { snap } = await run(makeInput({ storyFlow: ['null-task'] }));
    expect(snap.value).toBe('done');
    expect(mockNullTaskCore).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskCore).not.toHaveBeenCalled();
  });

  it('machine output matches StoryFlowOutput shape with all required fields', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const { snap } = await run(makeInput({ storyFlow: ['task-a'] }));
    expect(snap.value).toBe('done');
    const out = snap.output;
    expect(out).toBeDefined();
    expect(out).toHaveProperty('workflowState');
    expect(out).toHaveProperty('errors');
    expect(out).toHaveProperty('tasksCompleted');
    expect(out).toHaveProperty('lastContract');
    expect(out).toHaveProperty('accumulatedCostUsd');
    expect(out).toHaveProperty('halted');
    expect(out!.tasksCompleted).toBe(1);
    expect(out!.halted).toBe(false);
    expect(out!.errors).toHaveLength(0);
  });

  it('mixed steps: task → gate → task processed in order with context flow', async () => {
    // task-a: succeed
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut()) // task-a
      .mockResolvedValueOnce({ ...makeOut(), output: PASS, contract: makeContract(PASS) }) // gate check-task (pass)
      .mockResolvedValueOnce(makeOut()); // task-b

    const { snap } = await run(makeInput({ storyFlow: ['task-a', makeGate(), 'task-b'] }));
    expect(snap.value).toBe('done');
    // task-a + check-task + task-b = 3
    expect(snap.output?.tasksCompleted).toBe(3);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(3);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'task-a' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'check-task' });
    expect(mockDispatchTaskCore.mock.calls[2][0]).toMatchObject({ taskName: 'task-b' });
  });

  it('non-halt error from plain task: error recorded in errors array and machine transitions to halted', async () => {
    mockDispatchTaskCore.mockRejectedValueOnce(new Error('unexpected failure'));
    const { snap } = await run(makeInput({ storyFlow: ['task-a'] }));
    // Story-level errors always halt the story — no retry at story level (unlike gate-level where non-halt errors allow continuation).
    expect(snap.value).toBe('halted');
    expect(snap.output?.halted).toBe(true);
    expect(snap.context.errors.length).toBeGreaterThan(0);
    expect(snap.context.errors[0].taskName).toBe('task-a');
  });

  it('empty storyFlow reaches done with zero tasks completed', async () => {
    const { snap } = await run(makeInput({ storyFlow: [] }));
    expect(snap.value).toBe('done');
    expect(snap.output?.tasksCompleted).toBe(0);
    expect(mockDispatchTaskCore).not.toHaveBeenCalled();
  });

  describe('checkpoint skip guard', () => {
    it('task in completedTasks is skipped: no dispatch, tasksCompleted stays 0', async () => {
      const completedTasks = new Set(['story-1::task-a']);
      const { snap } = await run(makeInput({ storyFlow: ['task-a'], completedTasks }));
      expect(snap.value).toBe('done');
      expect(snap.output?.tasksCompleted).toBe(0);
      expect(mockDispatchTaskCore).not.toHaveBeenCalled();
    });

    it('task NOT in completedTasks is dispatched normally', async () => {
      mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
      const completedTasks = new Set(['story-1::task-b']);
      const { snap } = await run(makeInput({ storyFlow: ['task-a'], completedTasks }));
      expect(snap.value).toBe('done');
      expect(snap.output?.tasksCompleted).toBe(1);
      expect(mockDispatchTaskCore).toHaveBeenCalledOnce();
    });

    it('completedTasks undefined: no tasks skipped (backward compat)', async () => {
      mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
      const { snap } = await run(makeInput({ storyFlow: ['task-a'] }));
      expect(snap.value).toBe('done');
      expect(snap.output?.tasksCompleted).toBe(1);
      expect(mockDispatchTaskCore).toHaveBeenCalledOnce();
    });
  });
});
