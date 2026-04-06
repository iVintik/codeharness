/**
 * Tests for workflow-epic-machine module.
 *
 * Covers: single story, three sequential stories, story halt, epic-level task,
 * epic-level gate, INTERRUPT, mixed epic steps, halt error, null task, output
 * shape, empty epicItems, onEvent callback (story 25-3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { epicMachine } from '../workflow-epic-machine.js';
import type { EpicContext, EngineConfig, OutputContract, GateConfig } from '../workflow-types.js';
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

function makeGate(overrides: Partial<GateConfig> = {}): GateConfig {
  return { gate: 'g1', check: ['check-task'], fix: ['fix-task'], pass_when: 'all_pass', max_retries: 3, circuit_breaker: 'default', ...overrides };
}

const PASS = '<verdict>pass</verdict>';

function makeEpicInput(overrides: {
  epicItems?: { key: string; source?: 'sprint' | 'issues'; title?: string }[];
  storyFlow?: unknown[];
  epicFlow?: unknown[];
  onEvent?: EngineConfig['onEvent'];
  storyFlowTasks?: Set<string>;
  maxIterations?: number;
} = {}): EpicContext {
  const {
    epicItems = [{ key: 'story-1', source: 'sprint' as const }],
    storyFlow = [],
    epicFlow = [],
    onEvent,
    storyFlowTasks = new Set<string>(),
    maxIterations,
  } = overrides;

  const config = {
    workflow: {
      tasks: {
        'task-a': { agent: 'test-agent', session: 'fresh', source_access: true },
        'task-b': { agent: 'test-agent', session: 'fresh', source_access: true },
        'task-c': { agent: 'test-agent', session: 'fresh', source_access: true },
        'deploy': { agent: 'test-agent', session: 'fresh', source_access: true },
        'retro': { agent: 'test-agent', session: 'fresh', source_access: true },
        'null-task': { agent: null, session: 'fresh', source_access: true },
        'check-task': { agent: 'test-agent', session: 'fresh', source_access: true },
        'fix-task': { agent: 'test-agent', session: 'fresh', source_access: true },
        'story-task': { agent: 'test-agent', session: 'fresh', source_access: true },
      },
      storyFlow,
      epicFlow,
      execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'rebase', epic_strategy: 'sequential', story_strategy: 'sequential' },
      flow: [],
    },
    agents: { 'test-agent': { name: 'test-agent', model: 'test-model', instructions: '', disallowedTools: [], bare: true } },
    sprintStatusPath: '/tmp/test', runId: 'test-run',
    onEvent,
    maxIterations,
  } as unknown as EngineConfig;

  return {
    epicId: '17',
    epicItems: epicItems.map((i) => ({ key: i.key, source: i.source ?? 'sprint', title: i.title })),
    config,
    storyFlowTasks,
    currentStoryIndex: 0,
    currentStepIndex: 0,
    workflowState: makeWorkflowState(),
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
  };
}

async function run(input: EpicContext) {
  const actor = createActor(epicMachine, { input });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 10_000 });
  return { snap, actor };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('epicMachine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('epic with single story item: story machine invoked, epic reaches done, storiesProcessed has key', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [{ key: 'story-1', source: 'sprint' }],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(snap.output?.storiesProcessed.has('story-1')).toBe(true);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'story-task', storyKey: 'story-1' });
  });

  it('epic with three sequential stories: all invoked in order, all keys in storiesProcessed', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [
        { key: 'story-1', source: 'sprint' },
        { key: 'story-2', source: 'sprint' },
        { key: 'story-3', source: 'sprint' },
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(snap.output?.storiesProcessed.has('story-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-2')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-3')).toBe(true);
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(3);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ storyKey: 'story-1' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ storyKey: 'story-2' });
    expect(mockDispatchTaskCore.mock.calls[2][0]).toMatchObject({ storyKey: 'story-3' });
  });

  it('epic with three sequential stories advances currentStoryIndex through 0 to 1 to 2', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut())
      .mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [
        { key: 'story-1', source: 'sprint' },
        { key: 'story-2', source: 'sprint' },
        { key: 'story-3', source: 'sprint' },
      ],
      storyFlow: ['story-task'],
    });
    const actor = createActor(epicMachine, { input });
    const seenIndices = new Set<number>();
    actor.subscribe((snap) => {
      if (typeof snap.context?.currentStoryIndex === 'number') seenIndices.add(snap.context.currentStoryIndex);
    });
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 10_000 });
    expect(snap.value).toBe('done');
    expect([...seenIndices]).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(snap.context.currentStoryIndex).toBe(3);
  });

  it('epic with story halt: first story completes, second story halts, epic reaches halted', async () => {
    // story-1 passes, story-2 halts via halt error from its task
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut()) // story-1 task passes
      .mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {})); // story-2 halts
    const input = makeEpicInput({
      epicItems: [
        { key: 'story-1', source: 'sprint' },
        { key: 'story-2', source: 'sprint' },
      ],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(snap.output?.halted).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-1')).toBe(true);
    expect(snap.output?.storiesProcessed.has('story-2')).toBe(false);
  });

  it('epic with no stories and epic-level plain task deploy: task dispatched after story iteration, epic done', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: ['deploy'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'deploy', storyKey: '__epic_17__' });
  });

  it('epic with stories and epic-level task: stories processed first, then deploy task dispatched', async () => {
    const calls: string[] = [];
    mockDispatchTaskCore.mockImplementation((args: { storyKey: string }) => {
      calls.push(args.storyKey);
      return Promise.resolve(makeOut());
    });
    const input = makeEpicInput({
      epicItems: [{ key: 'story-1', source: 'sprint' }],
      storyFlow: ['story-task'],
      epicFlow: ['deploy'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(calls[0]).toBe('story-1');
    expect(calls[1]).toBe('__epic_17__');
  });

  it('epic with epic-level gate after stories: gate invoked, output merged, epic reaches done', async () => {
    // story-task passes, then gate check-task passes
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut()) // story-task
      .mockResolvedValueOnce({ ...makeOut(), output: PASS, contract: makeContract(PASS) }); // gate check-task
    const input = makeEpicInput({
      epicItems: [{ key: 'story-1', source: 'sprint' }],
      storyFlow: ['story-task'],
      epicFlow: [makeGate()],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(snap.output?.tasksCompleted).toBe(2); // story-task + check-task
  });

  it('INTERRUPT event transitions epic to interrupted final state', async () => {
    let unblock: (() => void) | undefined;
    mockDispatchTaskCore.mockImplementation(() => new Promise((resolve) => { unblock = () => resolve(makeOut()); }));
    const input = makeEpicInput({
      epicItems: [{ key: 'story-1', source: 'sprint' }],
      storyFlow: ['story-task'],
    });
    const actor = createActor(epicMachine, { input });
    actor.start();
    // Small delay to let the machine enter the invoke state
    await new Promise((r) => setTimeout(r, 10));
    actor.send({ type: 'INTERRUPT' });
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5000 });
    unblock?.();
    expect(snap.value).toBe('interrupted');
  });

  it('epic with mixed epic-level steps task → gate → task: processed in order, context flows', async () => {
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut()) // task-a (epic-level)
      .mockResolvedValueOnce({ ...makeOut(), output: PASS, contract: makeContract(PASS) }) // gate check-task
      .mockResolvedValueOnce(makeOut()); // task-b (epic-level)
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: ['task-a', makeGate(), 'task-b'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(snap.output?.tasksCompleted).toBe(3); // task-a + check-task + task-b
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'task-a' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'check-task' });
    expect(mockDispatchTaskCore.mock.calls[2][0]).toMatchObject({ taskName: 'task-b' });
  });

  it('epic mixed epic-level steps pass previousContract and accumulatedCostUsd between steps', async () => {
    const taskAContract = makeContract('task-a');
    const gateContract = makeContract(PASS);
    const finalContract = makeContract('task-b');
    mockDispatchTaskCore
      .mockResolvedValueOnce({ ...makeOut(), cost: 0.4, contract: taskAContract })
      .mockResolvedValueOnce({ ...makeOut(), output: PASS, cost: 0.2, contract: gateContract })
      .mockResolvedValueOnce({ ...makeOut(), contract: finalContract });
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: ['task-a', makeGate(), 'task-b'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({
      taskName: 'check-task',
      previousContract: taskAContract,
      accumulatedCostUsd: 0.4,
    });
    expect(mockDispatchTaskCore.mock.calls[2][0]).toMatchObject({
      taskName: 'task-b',
      previousContract: gateContract,
      accumulatedCostUsd: expect.closeTo(0.6, 10),
    });
    expect(snap.output?.accumulatedCostUsd).toBeCloseTo(0.61, 10);
    expect(snap.output?.lastContract).toEqual(finalContract);
  });

  it('epic with epic-level halt error from task dispatch: epic reaches halted, error recorded', async () => {
    mockDispatchTaskCore.mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: ['deploy'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(snap.output?.halted).toBe(true);
    expect(snap.output?.errors.length).toBeGreaterThan(0);
  });

  it('epic-level loop block executes contained story tasks for each story instead of only marking them processed', async () => {
    mockDispatchTaskCore.mockResolvedValue({ ...makeOut(), output: '<verdict>fail</verdict>', contract: makeContract('<verdict>fail</verdict>') });
    const input = makeEpicInput({
      epicItems: [
        { key: 'story-1', source: 'sprint' },
        { key: 'story-2', source: 'sprint' },
      ],
      epicFlow: [{ loop: ['story-task'] }],
      storyFlowTasks: new Set(['story-task']),
      maxIterations: 1,
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(mockDispatchTaskCore.mock.calls.length).toBeGreaterThan(0);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'story-task', storyKey: 'story-1' });
    expect(snap.output?.storiesProcessed).toEqual(new Set(['story-1', 'story-2']));
  });

  it('non-halt epic-level task errors are recorded and execution continues to later steps', async () => {
    mockDispatchTaskCore
      .mockImplementationOnce(() => Promise.reject(new Error('soft failure')))
      .mockImplementationOnce(() => Promise.resolve(makeOut()));
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: ['deploy', 'retro'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(snap.output?.halted).toBe(false);
    expect(snap.output?.errors).toHaveLength(1);
    expect(snap.output?.errors[0]?.storyKey).toBe('__epic_17__');
    expect(snap.output?.errors[0]?.code).toBe('UNKNOWN');
    expect(snap.output?.errors[0]?.message).toBe('soft failure');
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'deploy', storyKey: '__epic_17__' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'retro', storyKey: '__epic_17__' });
  });

  it('epic with null task at epic level: uses nullTaskCore path, not dispatchTaskCore', async () => {
    mockNullTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: ['null-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(mockNullTaskCore).toHaveBeenCalledTimes(1);
    expect(mockNullTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'null-task', storyKey: '__epic_17__' });
    expect(mockDispatchTaskCore).not.toHaveBeenCalled();
  });

  it('epic machine output matches EpicOutput shape with all required fields', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [{ key: 'story-1', source: 'sprint' }],
      storyFlow: ['story-task'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    const out = snap.output;
    expect(out).toBeDefined();
    expect(out).toHaveProperty('workflowState');
    expect(out).toHaveProperty('errors');
    expect(out).toHaveProperty('tasksCompleted');
    expect(out).toHaveProperty('storiesProcessed');
    expect(out).toHaveProperty('lastContract');
    expect(out).toHaveProperty('accumulatedCostUsd');
    expect(out).toHaveProperty('halted');
    expect(out!.tasksCompleted).toBe(1);
    expect(out!.halted).toBe(false);
    expect(out!.errors).toHaveLength(0);
    expect(out!.storiesProcessed).toBeInstanceOf(Set);
  });

  it('epic with empty epicItems: skips story iteration, proceeds to epic steps, reaches done', async () => {
    const input = makeEpicInput({
      epicItems: [],
      epicFlow: [],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    expect(snap.output?.storiesProcessed.size).toBe(0);
    expect(mockDispatchTaskCore).not.toHaveBeenCalled();
  });

  it('epic onEvent callback receives story-done event with correct storyKey on successful story completion', async () => {
    const events: { type: string; storyKey: string }[] = [];
    const onEvent = vi.fn((e: { type: string; storyKey: string }) => events.push(e));
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut());
    const input = makeEpicInput({
      epicItems: [{ key: 'story-abc', source: 'sprint' }],
      storyFlow: ['story-task'],
      onEvent: onEvent as unknown as EngineConfig['onEvent'],
    });
    const { snap } = await run(input);
    expect(snap.value).toBe('done');
    const storyDoneEvents = events.filter((e) => e.type === 'story-done');
    expect(storyDoneEvents.length).toBe(1);
    expect(storyDoneEvents[0].storyKey).toBe('story-abc');
  });
});
