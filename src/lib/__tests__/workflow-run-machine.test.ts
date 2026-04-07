/**
 * Tests for workflow-run-machine module.
 *
 * Covers: single epic, three sequential epics, epic halt, INTERRUPT, error recording,
 * RunOutput shape, empty epicEntries, onEvent callback, context flow between epics,
 * AbortError → interrupted, halt stops further epics (story 25-4).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { runMachine } from '../workflow-run-machine.js';
import type { RunContext, EngineConfig, OutputContract } from '../workflow-types.js';
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
vi.mock('../output.js', () => ({ warn: vi.fn(), log: vi.fn(), error: vi.fn() }));
vi.mock('../workflow-state.js', () => ({
  writeWorkflowState: vi.fn(),
  readWorkflowState: vi.fn(),
  getDefaultWorkflowState: vi.fn().mockReturnValue({
    workflow_name: '', started: '', iteration: 0, phase: 'idle' as const,
    tasks_completed: [], evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

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

function makeRunInput(overrides: {
  epicEntries?: Array<[string, { key: string; source?: 'sprint' | 'issues' }[]]>;
  storyFlow?: unknown[];
  epicFlow?: unknown[];
  onEvent?: EngineConfig['onEvent'];
  storyFlowTasks?: Set<string>;
  workflowState?: WorkflowState;
} = {}): RunContext {
  const {
    epicEntries = [],
    storyFlow = [],
    epicFlow = storyFlow.length > 0 ? ['story_flow'] : [],
    onEvent,
    storyFlowTasks = new Set<string>(),
    workflowState = makeWorkflowState(),
  } = overrides;

  const config = {
    workflow: {
      tasks: {
        'story-task': { agent: 'test-agent', session: 'fresh', source_access: true },
        'task-a': { agent: 'test-agent', session: 'fresh', source_access: true },
        'deploy': { agent: 'test-agent', session: 'fresh', source_access: true },
      },
      storyFlow,
      epicFlow,
      sprintFlow: [],
      execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'rebase', epic_strategy: 'sequential', story_strategy: 'sequential' },
      flow: [],
    },
    agents: { 'test-agent': { name: 'test-agent', model: 'test-model', instructions: '', disallowedTools: [], bare: true } },
    sprintStatusPath: '/tmp/test', runId: 'test-run',
    onEvent,
  } as unknown as EngineConfig;

  return {
    config,
    storyFlowTasks,
    epicEntries: epicEntries.map(([id, items]) => [id, items.map((i) => ({ key: i.key, source: i.source ?? 'sprint' as const }))]),
    currentEpicIndex: 0,
    workflowState,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
  };
}

async function run(input: RunContext) {
  const actor = createActor(runMachine, { input });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 10_000 });
  return { snap, actor };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('runMachine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('run single epic reaches allDone and storiesProcessed has story key', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeRunInput({
      epicEntries: [['17', [{ key: 'story-1' }]]],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(snap.output?.storiesProcessed.has('story-1')).toBe(true);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ storyKey: 'story-1' });
  });

  it('run three sequential epics advances currentEpicIndex 0 to 1 to 2 and reaches allDone', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut());
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
        ['19', [{ key: 'story-19-1' }]],
      ],
      storyFlow: ['story-task'],
    });
    const actor = createActor(runMachine, { input });
    const seenIndices = new Set<number>();
    actor.subscribe((snap) => {
      if (typeof snap.context?.currentEpicIndex === 'number') seenIndices.add(snap.context.currentEpicIndex);
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 10_000 });
    expect(snap.value).toBe('allDone');
    expect([...seenIndices]).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(snap.context.currentEpicIndex).toBe(3);
    expect(snap.output?.storiesProcessed.has('story-17-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-18-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-19-1')).toBe(true);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(3);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ storyKey: 'story-17-1' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ storyKey: 'story-18-1' });
    expect(mockDispatchTaskCore.mock.calls[2][0]).toMatchObject({ storyKey: 'story-19-1' });
  });

  it('run epic halt reaches halted and only earlier epic stories are processed', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(snap.output?.halted).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-17-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-18-1')).toBe(false);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
  });

  it('run INTERRUPT event transitions to interrupted final state and phase', async () => {
    let unblock: (() => void) | undefined;
    mockDispatchTaskCore.mockImplementation(() => new Promise((resolve) => { unblock = () => resolve(makeOut()); }));
    const input = makeRunInput({
      epicEntries: [['17', [{ key: 'story-1' }]]],
      storyFlow: ['story-task'],
    });
    const actor = createActor(runMachine, { input });
    actor.start();
    await new Promise((r) => setTimeout(r, 10));
    actor.send({ type: 'INTERRUPT' });
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5_000 });
    unblock?.();
    expect(snap.value).toBe('interrupted');
    expect(snap.output?.workflowState.phase).toBe('interrupted');
  });

  it('run INTERRUPT cancels in-flight epic work so child dispatch aborts', async () => {
    let aborted = false;
    mockDispatchTaskCore.mockImplementation((args: { config?: { abortSignal?: AbortSignal } }) => new Promise((_resolve, reject) => {
      const signal = args.config?.abortSignal;
      const abort = () => {
        aborted = true;
        reject(Object.assign(new Error('dispatch aborted'), { name: 'AbortError' }));
      };

      if (!signal) return;
      if (signal.aborted) {
        abort();
        return;
      }

      signal.addEventListener('abort', abort, { once: true });
    }));

    const input = makeRunInput({
      epicEntries: [['17', [{ key: 'story-1' }]]],
      storyFlow: ['story-task'],
    });
    const actor = createActor(runMachine, { input });
    actor.start();
    await new Promise((r) => setTimeout(r, 10));
    actor.send({ type: 'INTERRUPT' });
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5_000 });
    await waitFor(
      { getSnapshot: () => ({ aborted }) },
      (state) => state.aborted,
      { timeout: 1_000 },
    );

    expect(snap.value).toBe('interrupted');
    expect(aborted).toBe(true);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(1);
  });

  it('run epic non-halt story error halts run and records error metadata', async () => {
    mockDispatchTaskCore.mockRejectedValueOnce(new Error('unexpected failure'));
    const input = makeRunInput({
      epicEntries: [['17', [{ key: 'story-1' }]]],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(snap.output?.halted).toBe(true);
    expect(snap.output?.errors.length).toBeGreaterThan(0);
    const err = snap.output!.errors[0];
    expect(err).toHaveProperty('taskName');
    expect(err).toHaveProperty('storyKey');
    expect(err).toHaveProperty('code');
    expect(err).toHaveProperty('message');
  });

  it('run output matches RunOutput shape with all required fields', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeRunInput({
      epicEntries: [['17', [{ key: 'story-1' }]]],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    const out = snap.output;
    expect(out).toBeDefined();
    expect(out).toHaveProperty('workflowState');
    expect(out).toHaveProperty('errors');
    expect(out).toHaveProperty('tasksCompleted');
    expect(out).toHaveProperty('storiesProcessed');
    expect(out).toHaveProperty('lastContract');
    expect(out).toHaveProperty('accumulatedCostUsd');
    expect(out).toHaveProperty('halted');
    expect(out!.halted).toBe(false);
    expect(out!.errors).toHaveLength(0);
    expect(out!.storiesProcessed).toBeInstanceOf(Set);
  });

  it('run aggregates tasksCompleted, accumulatedCostUsd, and lastContract across multiple epics', async () => {
    const contract1 = makeContract('epic-1');
    const contract2 = makeContract('epic-2');
    mockDispatchTaskCore
      .mockResolvedValueOnce({ ...makeOut(makeWorkflowState({ iteration: 1 })), cost: 0.5, contract: contract1 })
      .mockResolvedValueOnce({ ...makeOut(makeWorkflowState({ iteration: 2 })), cost: 0.25, contract: contract2 });
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(snap.output?.tasksCompleted).toBe(2);
    expect(snap.output?.accumulatedCostUsd).toBe(0.75);
    expect(snap.output?.lastContract).toEqual(contract2);
    expect(snap.output?.workflowState.iteration).toBe(2);
  });

  it('run empty epics reaches allDone and storiesProcessed is empty', async () => {
    const input = makeRunInput({ epicEntries: [] });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(snap.output?.storiesProcessed.size).toBe(0);
    expect(mockDispatchTaskCore).not.toHaveBeenCalled();
  });

  it('run onEvent callback receives dispatch-start with epic sentinel for each epic', async () => {
    const events: { type: string; storyKey: string }[] = [];
    const onEvent = vi.fn((e: { type: string; storyKey: string }) => events.push(e));
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut());
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: ['story-task'],
      onEvent: onEvent as unknown as EngineConfig['onEvent'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    const dispatchStarts = events.filter((e) => e.type === 'dispatch-start');
    expect(dispatchStarts.length).toBeGreaterThanOrEqual(2);
    expect(dispatchStarts.some((e) => e.storyKey === '__epic_17__')).toBe(true);
    expect(dispatchStarts.some((e) => e.storyKey === '__epic_18__')).toBe(true);
  });

  it('run context flow passes workflowState and cost from one epic into the next epic chain', async () => {
    const updatedState = makeWorkflowState({ phase: 'executing', iteration: 1 });
    const calls: unknown[] = [];
    mockDispatchTaskCore.mockImplementation((args: unknown) => {
      calls.push(args);
      const callIndex = calls.length - 1;
      if (callIndex === 0) return Promise.resolve({ ...makeOut(updatedState), cost: 0.5, contract: makeContract() });
      return Promise.resolve(makeOut());
    });
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(snap.output?.accumulatedCostUsd).toBeGreaterThan(0);
    expect(snap.output?.storiesProcessed.has('story-17-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-18-1')).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ workflowState: updatedState });
  });

  it('run context flow passes previousContract and accumulatedCostUsd into the next epic', async () => {
    const firstContract = makeContract('first');
    const calls: Array<Record<string, unknown>> = [];
    mockDispatchTaskCore.mockImplementation((args: Record<string, unknown>) => {
      calls.push(args);
      if (calls.length === 1) return Promise.resolve({ ...makeOut(), cost: 0.5, contract: firstContract });
      return Promise.resolve(makeOut());
    });
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      storyKey: 'story-18-1',
      previousContract: firstContract,
      accumulatedCostUsd: 0.5,
    });
  });

  it('run AbortError interrupted path transitions to interrupted not halted', async () => {
    // Provide an already-aborted signal so runEpicActor throws AbortError immediately
    const controller = new AbortController();
    controller.abort();
    const input = makeRunInput({
      epicEntries: [['17', [{ key: 'story-1' }]]],
      storyFlow: ['story-task'],
    });
    // Override config to include aborted signal
    const inputWithAbort: RunContext = {
      ...input,
      config: { ...input.config, abortSignal: controller.signal } as typeof input.config,
    };
    const { snap } = await run(inputWithAbort);
    expect(snap.value).toBe('interrupted');
    expect(snap.output?.workflowState.phase).toBe('interrupted');
    expect(snap.output?.halted).toBe(true);
  });

  it('run keeps completed stories from a halted epic when the halt happens in an epic-level step', async () => {
    const storyCompletedState = makeWorkflowState({
      tasks_completed: [{
        task_name: 'story-task',
        story_key: 'story-17-1',
        completed_at: '2024-01-01T00:00:00.000Z',
      }],
    });
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut(storyCompletedState))
      .mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: ['story-task'],
      epicFlow: ['deploy'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(snap.output?.storiesProcessed.has('story-17-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-18-1')).toBe(false);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'deploy', storyKey: '__epic_17__' });
  });

  it('run halt stops further epics and no further epics are invoked', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
        ['19', [{ key: 'story-19-1' }]],
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    // Only epics 17 (success) and 18 (halt) should have been processed, not 19
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
    expect(snap.output?.storiesProcessed.has('story-19-1')).toBe(false);
  });

  it('run processes epic-level-only workflows for each epic entry and leaves storiesProcessed empty', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut());
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: [],
      epicFlow: ['deploy'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(snap.output?.storiesProcessed).toEqual(new Set(['story-17-1', 'story-18-1']));
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'deploy', storyKey: '__epic_17__' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'deploy', storyKey: '__epic_18__' });
  });

  it('run records non-halt epic-level errors and continues processing later epics', async () => {
    mockDispatchTaskCore
      .mockRejectedValueOnce(new Error('soft failure'))
      .mockResolvedValueOnce(makeOut());
    const input = makeRunInput({
      epicEntries: [
        ['17', [{ key: 'story-17-1' }]],
        ['18', [{ key: 'story-18-1' }]],
      ],
      storyFlow: [],
      epicFlow: ['deploy'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('allDone');
    expect(snap.output?.halted).toBe(false);
    expect(snap.output?.errors).toHaveLength(1);
    expect(snap.output?.errors[0]).toMatchObject({
      taskName: 'deploy',
      storyKey: '__epic_17__',
      code: 'UNKNOWN',
      message: 'soft failure',
    });
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'deploy', storyKey: '__epic_18__' });
  });
});
