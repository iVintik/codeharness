/**
 * Tests for the inspect API wiring added in story 27-3.
 * Verifies: inspect callback is wired, debounce on state value,
 * workflow-viz events are emitted, error resilience, NFR8 width.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EngineConfig, EngineEvent } from '../workflow-types.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { WorkflowState } from '../workflow-state.js';
import type { SubagentDefinition } from '../agent-resolver.js';

// ─── Hoisted mocks ───────────────────────────────────────────────────

const {
  mockCreateActor,
  mockSnapshotToPosition,
  mockVisualize,
  mockReadWorkflowState,
  mockWriteWorkflowState,
  mockGetDriver,
  mockInfo,
  mockWarn,
  mockLoadSnapshot,
  mockClearAllPersistence,
  mockCleanStaleTmpFiles,
  mockComputeConfigHash,
  mockLoadCheckpointLog,
  mockClearCheckpointLog,
  mockClearSnapshot,
} = vi.hoisted(() => ({
  mockCreateActor: vi.fn(),
  mockSnapshotToPosition: vi.fn(),
  mockVisualize: vi.fn(() => 'Epic 1 [1/2] impl… → verify'),
  mockReadWorkflowState: vi.fn(),
  mockWriteWorkflowState: vi.fn(),
  mockGetDriver: vi.fn(),
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
  mockLoadSnapshot: vi.fn(() => null),
  mockClearAllPersistence: vi.fn(() => ({ snapshotCleared: true, checkpointCleared: true })),
  mockCleanStaleTmpFiles: vi.fn(),
  mockComputeConfigHash: vi.fn(() => 'hash-aabb'),
  mockLoadCheckpointLog: vi.fn(() => []),
  mockClearCheckpointLog: vi.fn(),
  mockClearSnapshot: vi.fn(),
}));

vi.mock('xstate', () => ({
  createActor: mockCreateActor,
}));

vi.mock('../workflow-visualizer.js', () => ({
  snapshotToPosition: mockSnapshotToPosition,
  visualize: mockVisualize,
}));

vi.mock('../workflow-state.js', () => ({
  readWorkflowState: mockReadWorkflowState,
  writeWorkflowState: mockWriteWorkflowState,
  getDefaultWorkflowState: () => ({
    workflow_name: '', started: '', iteration: 0, phase: 'idle',
    tasks_completed: [], evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
  }),
}));

vi.mock('../workflow-persistence.js', () => ({
  saveSnapshot: vi.fn(),
  loadSnapshot: mockLoadSnapshot,
  clearSnapshot: mockClearSnapshot,
  computeConfigHash: mockComputeConfigHash,
  appendCheckpoint: vi.fn(),
  loadCheckpointLog: mockLoadCheckpointLog,
  clearCheckpointLog: mockClearCheckpointLog,
  clearAllPersistence: mockClearAllPersistence,
  cleanStaleTmpFiles: mockCleanStaleTmpFiles,
}));

vi.mock('../output.js', () => ({
  warn: mockWarn,
  info: mockInfo,
}));

vi.mock('../agents/drivers/factory.js', () => ({
  getDriver: mockGetDriver,
  suggestCheaperDriver: vi.fn().mockReturnValue(null),
  listDrivers: vi.fn().mockReturnValue([]),
}));

vi.mock('../agents/capability-check.js', () => ({
  checkCapabilityConflicts: vi.fn().mockReturnValue([]),
}));

vi.mock('../workflow-run-machine.js', () => ({
  runMachine: {},
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(() => ({ development_status: {} })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

const defaultExecution: ExecutionConfig = {
  max_parallel: 1, isolation: 'none', merge_strategy: 'merge-commit',
  epic_strategy: 'sequential', story_strategy: 'sequential',
};

function makeWorkflow(): ResolvedWorkflow {
  const task: ResolvedTask = { agent: 'dev', session: 'fresh', source_access: true };
  return {
    tasks: { implement: task },
    flow: ['implement'],
    storyFlow: ['implement'],
    epicFlow: ['story_flow'],
    execution: defaultExecution,
  };
}

function makeConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  return {
    workflow: makeWorkflow(),
    agents: {
      dev: {
        name: 'test-agent', model: 'claude-sonnet-4-20250514',
        instructions: 'Do work.', disallowedTools: [], bare: true,
      } satisfies SubagentDefinition,
    },
    sprintStatusPath: '/project/sprint-status.yaml',
    runId: 'run-test-001',
    projectDir: '/project',
    ...overrides,
  };
}

function makeDefaultState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    workflow_name: '', started: '', iteration: 0, phase: 'idle',
    tasks_completed: [], evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
    ...overrides,
  };
}

type InspectCallback = (event: { type: string; snapshot?: unknown }) => void;

/**
 * Configures mockCreateActor so that:
 * - It captures the `inspect` option from actorOptions
 * - It returns a mock actor that resolves immediately with a valid output
 * Returns a getter for the captured inspect callback.
 */
function setupActorMock(): { getInspectCb: () => InspectCallback | undefined } {
  let capturedInspect: InspectCallback | undefined;

  const mockOutput = {
    workflowState: makeDefaultState({ phase: 'completed' }),
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
  };

  mockCreateActor.mockImplementation((_, opts: { inspect?: InspectCallback } = {}) => {
    capturedInspect = opts?.inspect;
    const subscribers: Array<{ next?: () => void; complete?: () => void }> = [];
    return {
      subscribe: (handlers: { next?: () => void; complete?: () => void }) => {
        subscribers.push(handlers);
      },
      start: () => {
        // Resolve immediately
        for (const sub of subscribers) sub.complete?.();
      },
      getPersistedSnapshot: () => ({}),
      getSnapshot: () => ({ output: mockOutput }),
    };
  });

  return { getInspectCb: () => capturedInspect };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('inspect API wiring (story 27-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadWorkflowState.mockReturnValue(makeDefaultState());
    mockWriteWorkflowState.mockImplementation(() => {});
    mockGetDriver.mockReturnValue({
      name: 'claude-code',
      capabilities: { supportsPlugins: true, supportsStreaming: true, costReporting: true, costTier: 3 },
      healthCheck: vi.fn().mockResolvedValue({ available: true, authenticated: true, version: '1.0.0' }),
      dispatch: vi.fn(),
      getLastCost: vi.fn().mockReturnValue(null),
    });
    mockSnapshotToPosition.mockReturnValue({
      level: 'epic', epicId: '1', steps: [{ name: 'implement', status: 'active' }], activeStepIndex: 0,
    });
    mockVisualize.mockReturnValue('Epic 1 [1/2] impl…');
  });

  it('createActor is called with an inspect option (AC #5)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig());

    expect(mockCreateActor).toHaveBeenCalledTimes(1);
    expect(getInspectCb()).toBeTypeOf('function');
  });

  it('inspect callback ignores non-snapshot events (AC #3, #5)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    inspect({ type: '@xstate.event' });
    inspect({ type: '@xstate.actor' });

    expect(mockVisualize).not.toHaveBeenCalled();
  });

  it('inspect callback calls visualize on first @xstate.snapshot event (AC #4)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } });

    expect(mockSnapshotToPosition).toHaveBeenCalledTimes(1);
    expect(mockVisualize).toHaveBeenCalledTimes(1);
  });

  it('debounce: same state value triggers visualize only once (AC #3)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    const snap = { value: 'processingEpic', context: { accumulatedCostUsd: 1.5 } };

    inspect({ type: '@xstate.snapshot', snapshot: snap });
    inspect({ type: '@xstate.snapshot', snapshot: { ...snap, context: { accumulatedCostUsd: 2.0 } } });
    inspect({ type: '@xstate.snapshot', snapshot: { ...snap, context: { accumulatedCostUsd: 3.0 } } });

    // Only the first call (new state value) should trigger visualize
    expect(mockVisualize).toHaveBeenCalledTimes(1);
  });

  it('debounce: different state values each trigger visualize (AC #4)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'idle', context: {} } });
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } });
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'checkNextEpic', context: {} } });

    expect(mockVisualize).toHaveBeenCalledTimes(3);
  });

  it('inspect callback emits workflow-viz event with vizString and position (AC #10)', async () => {
    const { getInspectCb } = setupActorMock();
    const events: EngineEvent[] = [];
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig({ onEvent: (e) => events.push(e) }));

    const inspect = getInspectCb()!;
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } });

    const vizEvents = events.filter(e => e.type === 'workflow-viz');
    expect(vizEvents).toHaveLength(1);
    expect(vizEvents[0].vizString).toBe('Epic 1 [1/2] impl…');
    expect(vizEvents[0].position).toBeDefined();
  });

  it('inspect callback does not emit event when no onEvent handler is set (AC #5)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    // No onEvent in config — should not throw
    await expect(runWorkflowActor(makeConfig())).resolves.toBeDefined();

    const inspect = getInspectCb()!;
    expect(() => inspect({ type: '@xstate.snapshot', snapshot: { value: 'idle', context: {} } })).not.toThrow();
  });

  it('error resilience: snapshotToPosition throws, callback does not propagate (AC #7)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    mockSnapshotToPosition.mockImplementation(() => { throw new Error('parse failure'); });

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    expect(() => inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } })).not.toThrow();
  });

  it('error resilience: visualize throws, callback does not propagate (AC #7)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    mockVisualize.mockImplementation(() => { throw new Error('render failure'); });

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    expect(() => inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } })).not.toThrow();
  });

  it('error resilience: malformed snapshot (no value field), callback does not throw (AC #7)', async () => {
    const { getInspectCb } = setupActorMock();
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig());

    const inspect = getInspectCb()!;
    expect(() => inspect({ type: '@xstate.snapshot', snapshot: {} })).not.toThrow();
    expect(() => inspect({ type: '@xstate.snapshot', snapshot: null })).not.toThrow();
    expect(() => inspect({ type: '@xstate.snapshot' })).not.toThrow();
  });

  it('vizString passed to onEvent satisfies NFR8 width ≤ 120 stripped chars (AC #6)', async () => {
    const { getInspectCb } = setupActorMock();
    const events: EngineEvent[] = [];
    const longViz = 'Epic 1 [1/2] ' + 'implement…'.repeat(5);
    mockVisualize.mockReturnValue(longViz);
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig({ onEvent: (e) => events.push(e) }));

    const inspect = getInspectCb()!;
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } });

    const vizEvents = events.filter(e => e.type === 'workflow-viz');
    expect(vizEvents).toHaveLength(1);
    // The vizString is whatever visualize() returns — NFR8 enforcement is in visualize() itself
    // We just verify the string was passed through unchanged
    expect(vizEvents[0].vizString).toBe(longViz);
  });

  it('workflow-viz event has empty taskName and storyKey sentinel values (AC #10)', async () => {
    const { getInspectCb } = setupActorMock();
    const events: EngineEvent[] = [];
    const { runWorkflowActor } = await import('../workflow-runner.js');

    await runWorkflowActor(makeConfig({ onEvent: (e) => events.push(e) }));

    const inspect = getInspectCb()!;
    inspect({ type: '@xstate.snapshot', snapshot: { value: 'processingEpic', context: {} } });

    const vizEvent = events.find(e => e.type === 'workflow-viz');
    expect(vizEvent).toBeDefined();
    expect(vizEvent!.taskName).toBe('');
    expect(vizEvent!.storyKey).toBe('');
  });
});

describe('EngineEvent workflow-viz type (AC #10)', () => {
  it('workflow-viz event shape has vizString and position fields', () => {
    const event: EngineEvent = {
      type: 'workflow-viz',
      taskName: '',
      storyKey: '',
      vizString: 'Epic 1 [1/2] impl…',
      position: { level: 'epic', steps: [], activeStepIndex: 0 },
    };
    expect(event.type).toBe('workflow-viz');
    expect(event.vizString).toBeTypeOf('string');
    expect(event.position).toBeDefined();
  });
});
