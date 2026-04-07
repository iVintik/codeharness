/**
 * Tests for workflow-runner module.
 *
 * Covers: loadWorkItems, checkDriverHealth, runWorkflowActor,
 * crash recovery & resume.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as xstate from 'xstate';
import { runWorkflowActor, loadWorkItems, checkDriverHealth } from '../workflow-runner.js';
import { runMachine } from '../workflow-run-machine.js';
import type { EngineConfig, RunMachineContext, WorkItem } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';
import type { OutputContract } from '../agents/types.js';

// ─── Hoisted Mocks ───────────────────────────────────────────────────

const {
  mockDispatchAgent,
  mockReadWorkflowState,
  mockWriteWorkflowState,
  mockCreateIsolatedWorkspace,
  mockGenerateTraceId,
  mockFormatTracePrompt,
  mockRecordTraceId,
  mockResolveSessionId,
  mockRecordSessionId,
  mockWarn,
  mockInfo,
  mockReadFileSync,
  mockExistsSync,
  mockParse,
  mockGetDriver,
  mockResolveModel,
  mockDriverDispatch,
  mockBuildPromptWithContractContext,
  mockWriteOutputContract,
  mockReadStateWithBody,
  mockWriteState,
  mockLoadSnapshot,
  mockSnapshotFileExists,
  mockSaveSnapshot,
  mockClearSnapshot,
  mockComputeConfigHash,
  mockCreateActor,
  mockAppendCheckpoint,
  mockLoadCheckpointLog,
  mockClearCheckpointLog,
  mockClearAllPersistence,
  mockCleanStaleTmpFiles,
} = vi.hoisted(() => ({
  mockDispatchAgent: vi.fn(),
  mockReadWorkflowState: vi.fn(),
  mockWriteWorkflowState: vi.fn(),
  mockCreateIsolatedWorkspace: vi.fn(),
  mockGenerateTraceId: vi.fn(),
  mockFormatTracePrompt: vi.fn(),
  mockRecordTraceId: vi.fn(),
  mockResolveSessionId: vi.fn(),
  mockRecordSessionId: vi.fn(),
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockParse: vi.fn(),
  mockGetDriver: vi.fn(),
  mockResolveModel: vi.fn(),
  mockDriverDispatch: vi.fn(),
  mockBuildPromptWithContractContext: vi.fn(),
  mockWriteOutputContract: vi.fn(),
  mockReadStateWithBody: vi.fn(),
  mockWriteState: vi.fn(),
  mockLoadSnapshot: vi.fn(() => null),
  mockSnapshotFileExists: vi.fn(() => false),
  mockSaveSnapshot: vi.fn(),
  mockClearSnapshot: vi.fn(),
  mockComputeConfigHash: vi.fn(() => 'test-hash-aabbccdd'),
  mockCreateActor: vi.fn(),
  mockAppendCheckpoint: vi.fn(),
  mockLoadCheckpointLog: vi.fn(() => []),
  mockClearCheckpointLog: vi.fn(),
  mockClearAllPersistence: vi.fn(() => ({ snapshotCleared: true, checkpointCleared: true })),
  mockCleanStaleTmpFiles: vi.fn(),
}));

vi.mock('xstate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xstate')>();
  mockCreateActor.mockImplementation((...args: Parameters<typeof actual.createActor>) => actual.createActor(...args));
  return {
    ...actual,
    createActor: mockCreateActor,
  };
});

vi.mock('../agent-dispatch.js', () => ({
  dispatchAgent: mockDispatchAgent,
  DispatchError: class DispatchError extends Error {
    public readonly code: string;
    public readonly agentName: string;
    public readonly cause: unknown;
    constructor(message: string, code: string, agentName: string, cause: unknown) {
      super(message);
      this.name = 'DispatchError';
      this.code = code;
      this.agentName = agentName;
      this.cause = cause;
    }
  },
}));

vi.mock('../agents/drivers/factory.js', () => ({
  getDriver: mockGetDriver,
  suggestCheaperDriver: vi.fn().mockReturnValue(null),
  listDrivers: vi.fn().mockReturnValue([]),
}));

vi.mock('../agents/capability-check.js', () => ({
  checkCapabilityConflicts: vi.fn().mockReturnValue([]),
}));

vi.mock('../agents/model-resolver.js', () => ({
  resolveModel: mockResolveModel,
}));

vi.mock('../workflow-state.js', () => ({
  readWorkflowState: mockReadWorkflowState,
  writeWorkflowState: mockWriteWorkflowState,
  getDefaultWorkflowState: () => ({
    workflow_name: '',
    started: '',
    iteration: 0,
    phase: 'idle',
    tasks_completed: [],
    evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
  }),
}));

vi.mock('../source-isolation.js', () => ({
  createIsolatedWorkspace: mockCreateIsolatedWorkspace,
}));

vi.mock('../trace-id.js', () => ({
  generateTraceId: mockGenerateTraceId,
  formatTracePrompt: mockFormatTracePrompt,
  recordTraceId: mockRecordTraceId,
}));

vi.mock('../session-manager.js', () => ({
  resolveSessionId: mockResolveSessionId,
  recordSessionId: mockRecordSessionId,
}));

vi.mock('../output.js', () => ({
  warn: mockWarn,
  info: mockInfo,
}));

vi.mock('../agents/output-contract.js', () => ({
  buildPromptWithContractContext: mockBuildPromptWithContractContext,
  writeOutputContract: mockWriteOutputContract,
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

vi.mock('yaml', () => ({
  parse: mockParse,
}));

vi.mock('../state.js', () => ({
  readStateWithBody: mockReadStateWithBody,
  writeState: mockWriteState,
}));

vi.mock('../workflow-persistence.js', () => ({
  saveSnapshot: mockSaveSnapshot,
  loadSnapshot: mockLoadSnapshot,
  snapshotFileExists: mockSnapshotFileExists,
  clearSnapshot: mockClearSnapshot,
  computeConfigHash: mockComputeConfigHash,
  appendCheckpoint: mockAppendCheckpoint,
  loadCheckpointLog: mockLoadCheckpointLog,
  clearCheckpointLog: mockClearCheckpointLog,
  clearAllPersistence: mockClearAllPersistence,
  cleanStaleTmpFiles: mockCleanStaleTmpFiles,
}));

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDriverStream(output: string, sessionId: string, opts?: { error?: string; errorCategory?: string }) {
  return (async function* () {
    if (output) yield { type: 'text' as const, text: output };
    yield {
      type: 'result' as const,
      cost: 0.05,
      sessionId,
      ...(opts?.error ? { error: opts.error, errorCategory: opts.errorCategory ?? 'UNKNOWN' } : {}),
    };
  })();
}

function makeDriverStreamError(err: unknown) {
  // eslint-disable-next-line require-yield
  return (async function* () {
    throw err;
  })();
}

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

function makeDefinition(overrides?: Partial<SubagentDefinition>): SubagentDefinition {
  return {
    name: 'test-agent',
    model: 'claude-sonnet-4-20250514',
    instructions: 'You are a test agent.',
    disallowedTools: [],
    bare: true,
    ...overrides,
  };
}

function makeTask(overrides?: Partial<ResolvedTask>): ResolvedTask {
  return {
    agent: 'dev',
    session: 'fresh',
    source_access: true,
    ...overrides,
  };
}

const defaultExecution: ExecutionConfig = {
  max_parallel: 1,
  isolation: 'none',
  merge_strategy: 'merge-commit',
  epic_strategy: 'sequential',
  story_strategy: 'sequential',
};

function makeWorkflow(partial: {
  tasks: Record<string, ResolvedTask>;
  flow: (string | { loop: string[] })[];
  storyFlow?: (string | { loop: string[] })[];
  epicFlow?: (string | { loop: string[] })[];
  epicTasks?: string[];
  sprintFlow?: string[];
}): ResolvedWorkflow {
  if (partial.storyFlow || partial.epicFlow) {
    return {
      tasks: partial.tasks,
      flow: partial.storyFlow ?? partial.flow,
      execution: defaultExecution,
      storyFlow: partial.storyFlow ?? partial.flow,
      epicFlow: partial.epicFlow ?? ['story_flow'],
      sprintFlow: partial.sprintFlow ?? [],
    };
  }

  const epicTaskSet = new Set(partial.epicTasks ?? []);
  const storyFlow: (string | { loop: string[] })[] = [];
  const epicFlow: (string | { loop: string[] })[] = ['story_flow'];
  for (const step of partial.flow) {
    if (typeof step === 'string' && !epicTaskSet.has(step)) {
      storyFlow.push(step);
    } else {
      epicFlow.push(step);
    }
  }

  for (const step of partial.flow) {
    if (typeof step === 'object' && 'loop' in step) {
      for (const loopTask of step.loop) {
        if (!epicTaskSet.has(loopTask) && !storyFlow.includes(loopTask)) {
          storyFlow.push(loopTask);
        }
      }
    }
  }

  const hasStringTasks = partial.flow.some(s => typeof s === 'string' && !epicTaskSet.has(s));
  const hasLoopBlocks = partial.flow.some(s => typeof s === 'object' && 'loop' in s);
  if (!hasStringTasks && hasLoopBlocks) {
    const sfIdx = epicFlow.indexOf('story_flow');
    if (sfIdx !== -1) epicFlow.splice(sfIdx, 1);
  }

  return {
    tasks: partial.tasks,
    flow: storyFlow,
    execution: defaultExecution,
    storyFlow,
    epicFlow,
    sprintFlow: partial.sprintFlow ?? [],
  };
}

function makeConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  return {
    workflow: makeWorkflow({
      tasks: {
        implement: makeTask(),
        verify: makeTask({ source_access: false }),
      },
      flow: ['implement', 'verify'],
      epicTasks: ['verify'],
    }),
    agents: {
      dev: makeDefinition(),
    },
    sprintStatusPath: '/project/sprint-status.yaml',
    runId: 'run-001',
    projectDir: '/project',
    ...overrides,
  };
}

function makeRestorableSnapshot(config: EngineConfig, workflowState = makeDefaultState()) {
  const storyFlowTasks = new Set<string>();
  for (const step of config.workflow.storyFlow) {
    if (typeof step === 'string') storyFlowTasks.add(step);
    if (typeof step === 'object' && 'loop' in step) {
      for (const loopTask of step.loop) storyFlowTasks.add(loopTask);
    }
  }

  const epicEntries: [string, WorkItem[]][] = [[
    '5',
    [{ key: '5-1-foo', source: 'sprint' }],
  ]];

  const input: RunMachineContext = {
    config,
    storyFlowTasks,
    epicEntries,
    currentEpicIndex: 0,
    workflowState,
    errors: [],
    tasksCompleted: 0,
    storiesProcessed: new Set<string>(),
    lastContract: null,
    accumulatedCostUsd: 0,
    halted: false,
    completedTasks: new Set<string>(),
  };

  const actor = xstate.createActor(runMachine, { input });
  actor.start();
  const snapshot = actor.getPersistedSnapshot();
  actor.stop();
  return snapshot;
}

function setupDefaultMocks() {
  mockReadWorkflowState.mockReturnValue(makeDefaultState());
  mockWriteWorkflowState.mockImplementation(() => {});
  mockLoadSnapshot.mockReturnValue(null);
  mockSnapshotFileExists.mockReturnValue(false);
  mockLoadCheckpointLog.mockReturnValue([]);
  mockClearSnapshot.mockImplementation(() => {});
  mockClearAllPersistence.mockReturnValue({ snapshotCleared: true, checkpointCleared: true });
  mockCleanStaleTmpFiles.mockImplementation(() => {});
  mockComputeConfigHash.mockReturnValue('test-hash-aabbccdd');
  mockBuildPromptWithContractContext.mockImplementation((basePrompt: string) => basePrompt);
  mockWriteOutputContract.mockImplementation(() => {});
  mockReadStateWithBody.mockReturnValue({
    state: {
      harness_version: '0.1.0',
      initialized: true,
      stack: 'node',
      stacks: ['node'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 80, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
    },
    body: '\n# Codeharness State\n',
  });
  mockWriteState.mockImplementation(() => {});

  mockGenerateTraceId.mockReturnValue('ch-run-001-0-implement');
  mockFormatTracePrompt.mockReturnValue('[TRACE] trace_id=ch-run-001-0-implement');
  mockRecordTraceId.mockImplementation((traceId: string, state: WorkflowState) => ({
    ...state,
    trace_ids: [...(state.trace_ids ?? []), traceId],
  }));

  mockResolveSessionId.mockReturnValue(undefined);
  mockRecordSessionId.mockImplementation(
    (key: { taskName: string; storyKey: string }, sessionId: string, state: WorkflowState) => ({
      ...state,
      tasks_completed: [
        ...state.tasks_completed,
        {
          task_name: key.taskName,
          story_key: key.storyKey,
          completed_at: '2026-04-03T00:00:00.000Z',
          session_id: sessionId,
        },
      ],
    }),
  );

  mockDriverDispatch.mockImplementation(() => {
    return (async function* () {
      yield { type: 'text', text: 'Done' };
      yield { type: 'result', cost: 0.05, sessionId: 'sess-abc-123' };
    })();
  });

  mockGetDriver.mockReturnValue({
    name: 'claude-code',
    defaultModel: 'claude-sonnet-4-20250514',
    capabilities: { supportsPlugins: true, supportsStreaming: true, costReporting: true, costTier: 3 },
    healthCheck: vi.fn().mockResolvedValue({ available: true, authenticated: true, version: '1.0.0' }),
    dispatch: mockDriverDispatch,
    getLastCost: vi.fn().mockReturnValue(null),
  });

  mockResolveModel.mockReturnValue('claude-sonnet-4-20250514');

  mockDispatchAgent.mockResolvedValue({
    sessionId: 'sess-abc-123',
    success: true,
    durationMs: 1000,
    output: 'Done',
  });

  mockCreateIsolatedWorkspace.mockResolvedValue({
    toDispatchOptions: () => ({ cwd: '/isolated/workspace' }),
    cleanup: vi.fn().mockResolvedValue(undefined),
  });

  mockExistsSync.mockImplementation((path: string) => {
    if (path === '/project/sprint-status.yaml') return true;
    return false;
  });

  mockReadFileSync.mockReturnValue('dummy yaml');
  mockParse.mockReturnValue({
    development_status: {
      'epic-5': 'backlog',
      '5-1-foo': 'ready-for-dev',
      '5-2-bar': 'backlog',
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('loadWorkItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads stories from sprint-status.yaml excluding epics and retrospectives', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('yaml content');
    mockParse.mockReturnValue({
      development_status: {
        'epic-5': 'backlog',
        '5-1-foo': 'ready-for-dev',
        '5-2-bar': 'backlog',
        '5-3-baz': 'done',
        'epic-5-retrospective': 'backlog',
      },
    });

    const items = loadWorkItems('/path/sprint-status.yaml');

    expect(items).toEqual([
      { key: '5-1-foo', source: 'sprint' },
      { key: '5-2-bar', source: 'sprint' },
    ]);
  });

  it('returns empty array when sprint-status.yaml does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    const items = loadWorkItems('/nonexistent/sprint-status.yaml');
    expect(items).toEqual([]);
  });

  it('returns stories only when issues.yaml does not exist (AC #6)', () => {
    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/path/sprint-status.yaml') return true;
      return false;
    });
    mockReadFileSync.mockReturnValue('yaml');
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const items = loadWorkItems('/path/sprint-status.yaml', '/path/issues.yaml');

    expect(items).toEqual([{ key: '3-1-foo', source: 'sprint' }]);
  });

  it('loads both stories and issues when issues.yaml exists (AC #5)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('yaml');
    mockParse
      .mockReturnValueOnce({
        development_status: { '3-1-foo': 'ready-for-dev' },
      })
      .mockReturnValueOnce({
        issues: [
          { id: 'issue-001', title: 'Fix docker timeout', status: 'ready-for-dev' },
          { id: 'issue-002', title: 'Already done', status: 'done' },
        ],
      });

    const items = loadWorkItems('/path/sprint-status.yaml', '/path/issues.yaml');

    expect(items).toEqual([
      { key: '3-1-foo', source: 'sprint' },
      { key: 'issue-001', title: 'Fix docker timeout', source: 'issues' },
    ]);
  });

  it('handles invalid YAML in sprint-status.yaml gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('yaml');
    mockParse.mockImplementation(() => {
      throw new Error('bad yaml');
    });

    const items = loadWorkItems('/path/sprint-status.yaml');
    expect(items).toEqual([]);
    expect(mockWarn).toHaveBeenCalled();
  });

  it('handles unreadable sprint-status.yaml file gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const items = loadWorkItems('/path/sprint-status.yaml');
    expect(items).toEqual([]);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('could not read sprint-status.yaml'),
    );
  });

  it('handles unreadable issues.yaml file gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    let readCount = 0;
    mockReadFileSync.mockImplementation(() => {
      readCount++;
      if (readCount === 1) return 'sprint yaml';
      throw new Error('EACCES: permission denied');
    });
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const items = loadWorkItems('/path/sprint-status.yaml', '/path/issues.yaml');
    expect(items).toEqual([{ key: '3-1-foo', source: 'sprint' }]);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('could not read issues.yaml'),
    );
  });

  it('handles invalid YAML in issues.yaml gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('yaml');
    let parseCount = 0;
    mockParse.mockImplementation(() => {
      parseCount++;
      if (parseCount === 1) {
        return { development_status: { '3-1-foo': 'ready-for-dev' } };
      }
      throw new Error('bad issues yaml');
    });

    const items = loadWorkItems('/path/sprint-status.yaml', '/path/issues.yaml');
    expect(items).toEqual([{ key: '3-1-foo', source: 'sprint' }]);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('invalid YAML in issues.yaml'),
    );
  });
});

describe('checkDriverHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when all referenced drivers report available', async () => {
    const claudeHealth = vi.fn().mockResolvedValue({ available: true });
    const opencodeHealth = vi.fn().mockResolvedValue({ available: true });
    mockGetDriver.mockImplementation((name: string) => ({
      healthCheck: name === 'opencode' ? opencodeHealth : claudeHealth,
    }));

    await expect(checkDriverHealth(makeWorkflow({
      tasks: {
        implement: makeTask(),
        review: makeTask({ driver: 'opencode' }),
        noop: makeTask({ agent: null }),
      },
      flow: ['implement', 'review', 'noop'],
    }))).resolves.toBeUndefined();

    expect(mockGetDriver).toHaveBeenCalledTimes(2);
    expect(claudeHealth).toHaveBeenCalledTimes(1);
    expect(opencodeHealth).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated references to the same driver', async () => {
    const healthCheck = vi.fn().mockResolvedValue({ available: true });
    mockGetDriver.mockReturnValue({ healthCheck });

    await expect(checkDriverHealth(makeWorkflow({
      tasks: {
        implement: makeTask(),
        verify: makeTask(),
      },
      flow: ['implement', 'verify'],
    }))).resolves.toBeUndefined();

    expect(mockGetDriver).toHaveBeenCalledTimes(1);
    expect(healthCheck).toHaveBeenCalledTimes(1);
  });

  it('throws when any driver reports unavailable', async () => {
    mockGetDriver.mockImplementation((name: string) => ({
      healthCheck: vi.fn().mockResolvedValue(
        name === 'opencode' ? { available: false, error: 'no binary' } : { available: true },
      ),
    }));

    await expect(checkDriverHealth(makeWorkflow({
      tasks: {
        implement: makeTask(),
        review: makeTask({ driver: 'opencode' }),
      },
      flow: ['implement', 'review'],
    }))).rejects.toThrow('opencode: no binary');
  });

  it('throws on timeout and includes pending driver names', async () => {
    mockGetDriver.mockImplementation((name: string) => ({
      healthCheck: name === 'opencode'
        ? vi.fn(() => new Promise(() => {}))
        : vi.fn().mockResolvedValue({ available: true }),
    }));

    await expect(checkDriverHealth(makeWorkflow({
      tasks: {
        implement: makeTask(),
        review: makeTask({ driver: 'opencode' }),
      },
      flow: ['implement', 'review'],
    }), 1)).rejects.toThrow('opencode');
  });

  it('propagates thrown health-check errors', async () => {
    mockGetDriver.mockReturnValue({
      healthCheck: vi.fn().mockRejectedValue(new Error('driver crashed')),
    });

    await expect(checkDriverHealth(makeWorkflow({
      tasks: { implement: makeTask() },
      flow: ['implement'],
    }))).rejects.toThrow('driver crashed');
  });

  it('ignores tasks without agents when building the driver set', async () => {
    const healthCheck = vi.fn().mockResolvedValue({ available: true });
    mockGetDriver.mockReturnValue({ healthCheck });

    await expect(checkDriverHealth(makeWorkflow({
      tasks: {
        implement: makeTask(),
        noop: makeTask({ agent: null }),
      },
      flow: ['implement', 'noop'],
    }))).resolves.toBeUndefined();

    expect(mockGetDriver).toHaveBeenCalledTimes(1);
  });
});

describe('runWorkflowActor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('executes flow steps sequentially in order (AC #2)', async () => {
    const callOrder: string[] = [];
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      callOrder.push(opts.prompt);
      return makeDriverStream('ok', 'sess-1');
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig();
    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(callOrder).toHaveLength(3);
    expect(callOrder[0]).toContain('Implement story 3-1-foo');
    expect(callOrder[1]).toContain('Implement story 3-2-bar');
    expect(callOrder[2]).toContain('Verify the stories for epic');
  });

  it('dispatches per-story task once per story (AC #3)', async () => {
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
    expect(result.storiesProcessed).toBe(2);
  });

  it('dispatches per-run task exactly once with sentinel key (AC #7)', async () => {
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { verify: makeTask() },
        flow: ['verify'],
        epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('writes state after each task completion (AC #4)', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    await runWorkflowActor(config);

    expect(mockWriteWorkflowState).toHaveBeenCalledTimes(3);
  });

  it('executes loop blocks instead of skipping them', async () => {
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the stories for epic')) {
        return makeDriverStream('<evidence ac="1" status="pass">done</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: {
          retry: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('handles DispatchError and records in result (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('rate limited', 'UNKNOWN', 'dev', new Error('inner')),
    ));

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN');
    expect(result.errors[0].taskName).toBe('implement');
    expect(result.errors[0].storyKey).toBe('3-1-foo');
  });

  it('halts on RATE_LIMIT dispatch errors (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')),
    ));

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
  });

  it('halts on UNKNOWN errors for per-story tasks after story-machine semantics change', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;
    mockDriverDispatch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return makeDriverStreamError(new DispatchError('unknown error', 'UNKNOWN', 'dev', new Error('inner')));
      }
      return makeDriverStream('ok', 'sess-1');
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
    expect(result.tasksCompleted).toBe(0);
  });

  it('sets phase to completed when no errors occur', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    await runWorkflowActor(config);

    const lastWrite = mockWriteWorkflowState.mock.calls[
      mockWriteWorkflowState.mock.calls.length - 1
    ];
    expect((lastWrite[0] as WorkflowState).phase).toBe('completed');
  });

  it('sets phase to error on dispatch failure', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('fail', 'UNKNOWN', 'dev', new Error('inner')),
    ));
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    }));

    expect(mockWriteWorkflowState.mock.calls.some(
      (call) => (call[0] as WorkflowState).phase === 'error',
    )).toBe(true);
  });

  it('initializes workflow state with phase=executing at start', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    }));

    expect((mockWriteWorkflowState.mock.calls[0][0] as WorkflowState).phase).toBe('executing');
  });

  it('records error checkpoint in state on dispatch failure (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('fail', 'UNKNOWN', 'dev', new Error('inner')),
    ));
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    }));

    const errorWrite = mockWriteWorkflowState.mock.calls.find((call) => {
      const state = call[0] as WorkflowState;
      return state.phase === 'error' && state.tasks_completed.some(cp => cp.error);
    });
    expect(errorWrite).toBeDefined();
  });

  it('halts per-story RATE_LIMIT errors across flow steps', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')),
    ));
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: {
          implement: makeTask(),
          verify: makeTask(),
        },
        flow: ['implement', 'verify'],
        epicTasks: ['verify'],
      }),
    }));

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.errors[0].taskName).toBe('implement');
  });

  it('halts on NETWORK dispatch errors for per-run tasks', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('network down', 'NETWORK', 'dev', new Error('inner')),
    ));
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { verify: makeTask({ source_access: false }) },
        flow: ['verify'],
        epicTasks: ['verify'],
      }),
    }));

    expect(result.success).toBe(false);
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.errors[0].code).toBe('NETWORK');
  });

  it('returns correct EngineResult shape', async () => {
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          implement: makeTask(),
          verify: makeTask(),
        },
        flow: ['implement', 'verify'],
        epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        tasksCompleted: 3,
        storiesProcessed: 2,
        errors: [],
      }),
    );
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles empty work items list gracefully', async () => {
    mockExistsSync.mockReturnValue(false);

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(result.storiesProcessed).toBe(0);
  });

  it('skips tasks with missing agent definition', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask({ agent: 'nonexistent' }) },
        flow: ['implement'],
      }),
      agents: {},
    });

    const result = await runWorkflowActor(config);

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('agent'));
    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
  });

  it('skips tasks not found in workflow tasks definition', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['nonexistent-task', 'implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('task "nonexistent-task" not found'),
    );
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('handles non-DispatchError exceptions in dispatch', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError('string error'));

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('UNKNOWN');
    expect(result.errors[0].message).toBe('string error');
  });

  it('returns early when phase is completed after clearing persistence', async () => {
    mockReadWorkflowState.mockReturnValueOnce({
      ...makeDefaultState(),
      phase: 'completed',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(result.storiesProcessed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.durationMs).toBe(0);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
    expect(mockGetDriver).not.toHaveBeenCalled();
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('fails fast on health check failure', async () => {
    mockGetDriver.mockReturnValue({
      name: 'claude-code',
      dispatch: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue({ available: false, error: 'no driver' }),
    });

    const result = await runWorkflowActor(makeConfig());

    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('HEALTH_CHECK');
  });

  it('writes failed phase when health check fails', async () => {
    mockGetDriver.mockReturnValue({
      name: 'claude-code',
      dispatch: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue({ available: false, error: 'offline' }),
    });

    await runWorkflowActor(makeConfig());

    expect((mockWriteWorkflowState.mock.calls.at(-1)?.[0] as WorkflowState).phase).toBe('failed');
  });

  it('persists interrupted phase to disk when abort signal fires mid-run', async () => {
    // Pre-abort the controller so runEpicActor short-circuits immediately
    // without needing a live dispatch stream (avoids hanging the test).
    const ctrl = new AbortController();
    ctrl.abort();

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      abortSignal: ctrl.signal,
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    // The last write must record 'interrupted' — not 'executing' — so that a
    // subsequent run knows the workflow was cleanly stopped, not crashed.
    const lastPhase = (mockWriteWorkflowState.mock.calls.at(-1)?.[0] as WorkflowState).phase;
    expect(lastPhase).toBe('interrupted');
  });

  it('writes a terminal interrupted snapshot on actor completion', async () => {
    const ctrl = new AbortController();
    ctrl.abort();

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      abortSignal: ctrl.signal,
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    }));

    expect(mockSaveSnapshot).toHaveBeenCalled();
    expect(mockSaveSnapshot.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ value: 'interrupted' }),
    );
    expect(mockSaveSnapshot.mock.calls.at(-1)?.[1]).toBe('test-hash-aabbccdd');
    expect(mockSaveSnapshot.mock.calls.at(-1)?.[2]).toBe('/project');
  });
});

describe('crash recovery & resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('skips completed sequential per-story task (AC #1)', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        ],
      }),
    );

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('does NOT skip per-story task when no checkpoint exists (AC #5)', async () => {
    mockReadWorkflowState.mockReturnValue(makeDefaultState());

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('skips completed per-run task (AC #3)', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          { task_name: 'verify', story_key: '__epic_5__', completed_at: '2026-04-03T00:00:00Z' },
        ],
      }),
    );

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { verify: makeTask({ source_access: false }) },
        flow: ['verify'],
        epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).not.toHaveBeenCalled();
    expect(result.tasksCompleted).toBe(0);
  });

  it('resumes mid-story: 3 of 5 done, dispatches only remaining 2 (AC #2)', async () => {
    mockParse.mockReturnValue({
      development_status: {
        '5-1-a': 'ready-for-dev',
        '5-2-b': 'ready-for-dev',
        '5-3-c': 'ready-for-dev',
        '5-4-d': 'ready-for-dev',
        '5-5-e': 'ready-for-dev',
      },
    });

    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          { task_name: 'implement', story_key: '5-1-a', completed_at: '2026-04-03T00:00:00Z' },
          { task_name: 'implement', story_key: '5-2-b', completed_at: '2026-04-03T00:01:00Z' },
          { task_name: 'implement', story_key: '5-3-c', completed_at: '2026-04-03T00:02:00Z' },
        ],
      }),
    );

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('skips all per-story tasks and proceeds to per-run verify (AC #3)', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-03T00:00:00Z' },
          { task_name: 'implement', story_key: '5-2-bar', completed_at: '2026-04-03T00:01:00Z' },
        ],
      }),
    );

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          implement: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: ['implement', 'verify'],
        epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('phase: completed clears persistence and skips health checks and dispatch', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'completed',
        started: '2026-04-03T00:00:00Z',
      }),
    );
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });
    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.tasksCompleted).toBe(0);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
    expect(mockGetDriver).not.toHaveBeenCalled();
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('tuple matching preserves per-run tasks after per-story completion', async () => {
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        ],
      }),
    );

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: {
          implement: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: ['implement', 'verify'],
        epicTasks: ['verify'],
      }),
    }));

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('error checkpoints do NOT cause task to be skipped on resume', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'error',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          {
            task_name: 'implement',
            story_key: '5-1-foo',
            completed_at: '2026-04-03T00:00:00Z',
            error: true,
          },
        ],
      }),
    );

    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev', '5-2-bar': 'backlog' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('resumes from error phase and continues execution', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'error',
        started: '2026-04-03T00:00:00Z',
        tasks_completed: [
          { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        ],
      }),
    );

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('loop block resumes from current iteration, skipping completed tasks (AC #4)', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        iteration: 2,
        tasks_completed: [
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
          { task_name: 'verify', story_key: '__epic_3__', completed_at: '2026-04-03T00:01:00Z' },
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:02:00Z' },
        ],
      }),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the stories for epic')) {
        return makeDriverStream('<evidence ac="1" status="pass">ok</evidence> <evidence ac="2" status="pass">ok</evidence> <verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          retry: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
    expect(mockWarn).toHaveBeenCalledWith(
      'epic-machine: skipping completed task retry for 3-1-foo',
    );
  });

  it('fresh start (no state) executes everything — no skips (AC #5)', async () => {
    mockReadWorkflowState.mockReturnValue(makeDefaultState());

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          implement: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: ['implement', 'verify'],
        epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(3);
    expect(result.tasksCompleted).toBe(3);
  });

  it('skips sprint task on snapshot-resume when completion was persisted to disk before interrupt (26-1)', async () => {
    // Phase 1 — fresh run with no stories; captures a valid "allDone" XState snapshot
    // so Phase 2 can restore the actor from it (simulating a prior interrupted run).
    mockParse.mockReturnValue({});
    const sprintWorkflow = makeWorkflow({
      tasks: { deploy: makeTask() },
      flow: [],
      sprintFlow: ['deploy'],
    });

    await runWorkflowActor(makeConfig({ workflow: sprintWorkflow }));
    // Grab the real XState persisted snapshot that was handed to saveSnapshot.
    const capturedSnapshot = mockSaveSnapshot.mock.calls.at(-1)?.[0] as unknown;
    expect(capturedSnapshot).toBeDefined();

    vi.clearAllMocks();
    setupDefaultMocks();

    // Phase 2 — resume from the captured snapshot.
    // Disk state already has "deploy/__sprint__" completed (written by dispatchTaskCore
    // before the simulated interrupt).  The XState snapshot does NOT contain this because
    // sprint tasks execute outside the actor boundary.
    mockLoadSnapshot.mockReturnValue({
      snapshot: capturedSnapshot,
      configHash: 'test-hash-aabbccdd',
      savedAt: '2026-04-07T00:00:00.000Z',
    });
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-07T00:00:00Z',
        tasks_completed: [
          { task_name: 'deploy', story_key: '__sprint__', completed_at: '2026-04-07T00:00:00Z' },
        ],
      }),
    );

    const result = await runWorkflowActor(makeConfig({ workflow: sprintWorkflow }));

    // deploy was already persisted on disk — must NOT be dispatched a second time.
    expect(mockDriverDispatch).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Restored 1 post-machine completion(s) from disk'),
    );
  });
});

// ─── Story 26-2: Snapshot resume with config hash validation ─────────

describe('snapshot resume (story 26-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('starts fresh and does NOT log resume message when no snapshot exists (AC #4)', async () => {
    mockLoadSnapshot.mockReturnValue(null);
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming from snapshot'));
  });

  it('logs "Resuming from snapshot" when saved configHash matches current hash (AC #1)', async () => {
    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });
    const snapshot = makeRestorableSnapshot(config);
    mockCreateActor.mockClear();

    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(config);

    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Resuming from snapshot'),
    );
    expect(mockCreateActor).toHaveBeenCalledWith(
      runMachine,
      expect.objectContaining({ snapshot }),
    );
  });

  it('logs "config changed" and "starting fresh" when configHash mismatches (AC #2)', async () => {
    mockComputeConfigHash.mockReturnValue('currenthash1234');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'oldhash9999aaaa',
      savedAt: '2026-04-06T09:00:00.000Z',
    });
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringMatching(/config changed/),
    );
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringMatching(/checkpoint log for resume/),
    );
  });

  it('calls clearSnapshot when configHash mismatches (AC #2)', async () => {
    mockComputeConfigHash.mockReturnValue('newhash00001111');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'stale0000hash222',
      savedAt: '2026-04-06T09:00:00.000Z',
    });
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockClearSnapshot).toHaveBeenCalledWith('/project');
  });

  it('does NOT call clearSnapshot when hashes match (AC #3)', async () => {
    mockComputeConfigHash.mockReturnValue('matchinghashXXYY');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'matchinghashXXYY',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // clearSnapshot is only called on successful completion — not as a discard
    // (the success-path clear is separate from the mismatch discard)
    const clearCalls = mockClearSnapshot.mock.calls;
    // The success-path clear happens after completion, but there must be NO
    // call with the projectDir triggered by the mismatch branch
    const mismatchDiscards = clearCalls.filter((call) => {
      // Only a mismatch discard would happen BEFORE the run completes
      // We cannot distinguish timing here, so just assert warn was NOT called
      return call[0] === '/project';
    });
    expect(mockWarn).not.toHaveBeenCalledWith(expect.stringContaining('config changed'));
    // Suppress unused variable warning for mismatchDiscards (used for clarity)
    expect(mismatchDiscards).toBeDefined();
  });

  it('starts fresh without crashing when loadSnapshot returns null (corrupt file) (AC #5)', async () => {
    // loadSnapshot already returns null for corrupt files (26-1 handles this)
    mockLoadSnapshot.mockReturnValue(null);
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming'));
  });

  it('corrupt snapshot file with stale tasks_completed — re-dispatches from task 1 (AC #4)', async () => {
    // Regression for Bug 1: snapshot file exists but loadSnapshot() returns null
    // (corrupt file). If workflow-state.yaml has stale tasks_completed from the
    // previous run, those entries must NOT cause task-1 to be skipped — the run
    // must start fresh from the beginning.
    mockSnapshotFileExists.mockReturnValue(true);  // file exists (corrupt)
    mockLoadSnapshot.mockReturnValue(null);         // but is unreadable
    mockReadWorkflowState.mockReturnValue(makeDefaultState({
      phase: 'interrupted',
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-06T08:00:00.000Z' },
      ],
    }));
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // Task must NOT be skipped despite being in stale tasks_completed — fresh start required
    expect(mockDriverDispatch).toHaveBeenCalled();
  });

  it('failed phase + no snapshot file → no "Resuming from failed state" log (Bug 2)', async () => {
    // Regression: "Resuming from failed state" was logged before the snapshot check,
    // so it appeared even when config change / corrupt snapshot forced a fresh start.
    // The log must only appear when we actually resume from a valid snapshot.
    mockReadWorkflowState.mockReturnValue(makeDefaultState({
      phase: 'failed',
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-06T07:00:00.000Z', error: 'rate-limit' },
      ],
    }));
    mockLoadSnapshot.mockReturnValue(null);
    mockSnapshotFileExists.mockReturnValue(false);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // No contradictory "Resuming" message when fresh-starting after failure
    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming from failed state'));
  });

  it('failed phase + config-mismatch snapshot → no "Resuming from failed state" log (Bug 2 mismatch path)', async () => {
    // Config mismatch forces a fresh start even from a failed state — the
    // "Resuming from failed state" log must not appear when we end up fresh.
    mockReadWorkflowState.mockReturnValue(makeDefaultState({
      phase: 'failed',
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-06T07:00:00.000Z', error: 'timeout' },
      ],
    }));
    mockComputeConfigHash.mockReturnValue('new-hash-55667788');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'old-hash-11223344',
      savedAt: '2026-04-06T06:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming from failed state'));
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('config changed'));
  });

  it('warns and starts fresh when matching-hash snapshot payload is not restorable', async () => {
    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot: { context: {} },
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({
      development_status: { '5-1-foo': 'ready-for-dev' },
    });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('Snapshot payload is invalid for restore'),
    );
    expect(mockInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('Resuming from snapshot'),
    );
  });

  it('matching-hash invalid payload + checkpoint entries: task skipped via fallback (AC #5)', async () => {
    // When the snapshot payload is not restorable but config hash matched, the
    // checkpoint log is the durable fallback — completed tasks must be skipped.
    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot: { context: {} }, // invalid — no status/value
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockLoadCheckpointLog.mockReturnValue([
      { storyKey: '5-1-foo', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // Checkpoint log is loaded as fallback
    expect(mockLoadCheckpointLog).toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringMatching(/Loaded \d+ checkpoint.*invalid snapshot payload/i),
    );
    // Previously completed task is skipped — driver not dispatched
    expect(mockDriverDispatch).not.toHaveBeenCalled();
    // Checkpoint log is NOT cleared — it is the durable safety net
    expect(mockClearCheckpointLog).not.toHaveBeenCalled();
  });

  it('corrupt snapshot file (hadSnapshotFile=true, loadSnapshot=null) + checkpoint entries: task skipped via fallback', async () => {
    // When snapshot file exists but is unreadable (loadSnapshot returns null),
    // the checkpoint log must be loaded as the durable fallback, not cleared.
    mockSnapshotFileExists.mockReturnValue(true);
    mockLoadSnapshot.mockReturnValue(null);
    mockLoadCheckpointLog.mockReturnValue([
      { storyKey: '5-1-foo', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // Checkpoint log is loaded, not cleared
    expect(mockClearCheckpointLog).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringMatching(/Loaded \d+ checkpoint.*corrupt snapshot/i),
    );
    // Previously completed task is skipped — driver not dispatched
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('loadSnapshot is always called on every run', async () => {
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockLoadSnapshot).toHaveBeenCalledOnce();
  });

  it('rejects snapshot with only value key (no status/context) — guard is not just value-check', async () => {
    // Regression guard: objects with only a `value` key are NOT valid XState v5 snapshots.
    // The old guard accepted { value: 'x' } — the new guard requires status+value+context.
    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot: { value: 'running' }, // malformed — missing status and context
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Snapshot payload is invalid for restore'));
    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming from snapshot'));
  });

  it('rejects snapshot with status+context but no value key', async () => {
    // Regression guard: objects missing `value` are not valid XState v5 snapshots.
    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot: { status: 'active', context: {} }, // malformed — missing value
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Snapshot payload is invalid for restore'));
    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming from snapshot'));
  });

  it('rejects snapshot with unknown status string', async () => {
    // Regression guard: status must be a known XState v5 value ('active','done','error','stopped').
    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot: { status: 'running', value: 'someState', context: {} }, // 'running' is not a valid XState status
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Snapshot payload is invalid for restore'));
    expect(mockInfo).not.toHaveBeenCalledWith(expect.stringContaining('Resuming from snapshot'));
  });

  it('accepts well-formed XState v5 snapshot with status, value, and context', async () => {
    // A snapshot with all three required fields and a known status should be accepted.
    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });
    const snapshot = makeRestorableSnapshot(config);
    mockComputeConfigHash.mockReturnValue('abc12345deadbeef');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'abc12345deadbeef',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(config);

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Resuming from snapshot'));
  });

  it('warning includes abbreviated hashes of both saved and current configHash (AC #2)', async () => {
    mockComputeConfigHash.mockReturnValue('abcdef1234567890');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'ffff000011112222',
      savedAt: '2026-04-06T09:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('ffff0000'),
    );
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('abcdef12'),
    );
  });

  it('saveSnapshot called during resumed actor state transitions (AC #5)', async () => {
    // When a run resumes from a snapshot, the actor still emits state transitions
    // and the subscribe callback must still call saveSnapshot after each one.
    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });
    const snapshot = makeRestorableSnapshot(config);
    mockComputeConfigHash.mockReturnValue('matchhash12345678');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'matchhash12345678',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(config);

    // saveSnapshot is called from the actor.subscribe next/complete callbacks —
    // at least one call must happen during a resumed run (terminal snapshot at completion).
    expect(mockSaveSnapshot).toHaveBeenCalled();
  });

  it('clearAllPersistence called after successful resumed completion (AC #6)', async () => {
    // A resumed run that completes all remaining tasks successfully must clear
    // the snapshot file — there is nothing left to resume.
    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });
    const snapshot = makeRestorableSnapshot(config);
    mockComputeConfigHash.mockReturnValue('matchhash12345678');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'matchhash12345678',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockClearAllPersistence.mockReturnValue({ snapshotCleared: true, checkpointCleared: true });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
    expect(mockInfo).toHaveBeenCalledWith(expect.stringMatching(/Persistence cleared/i));
  });

  it('clearAllPersistence NOT called after resumed run that errors (AC #7)', async () => {
    // A resumed run that encounters an error must preserve the snapshot so the
    // operator can attempt to resume again after fixing the issue.
    const { DispatchError } = await import('../agent-dispatch.js');
    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });
    const snapshot = makeRestorableSnapshot(config);
    mockComputeConfigHash.mockReturnValue('matchhash12345678');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'matchhash12345678',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('dispatch fail', 'UNKNOWN', 'dev', new Error('inner')),
    ));
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    expect(mockClearAllPersistence).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Persistence preserved for resume'));
  });

  it('config mismatch resets stale tasks_completed — previously-completed task IS dispatched (AC #2)', async () => {
    // Regression: when config hash mismatches the runner used to pass the stale
    // workflow-state (including old tasks_completed) into runInput, causing tasks
    // to be silently skipped by isTaskCompleted(). After the fix the in-memory
    // state is reset so tasks_completed is empty and dispatch fires.
    mockComputeConfigHash.mockReturnValue('new-hash-99001122');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'old-hash-aabbccdd',
      savedAt: '2026-04-06T09:00:00.000Z',
    });
    // Simulate prior run that already recorded implement for 5-1-foo
    mockReadWorkflowState.mockReturnValue(makeDefaultState({
      phase: 'executing',
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-06T08:00:00.000Z' },
      ],
    }));
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // The task must NOT be skipped — driver dispatch should have been called.
    expect(mockDriverDispatch).toHaveBeenCalled();
    // No "skipping completed" warning — the stale entry was cleared
    expect(mockWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('skipping completed task implement'),
    );
  });

  it('phase=completed does NOT early-return — starts fresh run from task 1 (AC #3)', async () => {
    // A completed workflow is already terminal. The runner should clear stale
    // persistence and return without re-entering health checks or dispatch.
    mockReadWorkflowState.mockReturnValue(makeDefaultState({
      phase: 'completed',
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-06T08:00:00.000Z' },
      ],
    }));
    mockLoadSnapshot.mockReturnValue(null);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
    expect(mockGetDriver).not.toHaveBeenCalled();
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('loadSnapshot always called on every run — each run independently checks for latest snapshot (AC #8)', async () => {
    // AC #8 multi-interrupt resume chain: each run calls loadSnapshot independently,
    // so the second resume automatically picks up the snapshot that was updated
    // (via saveSnapshot) during the first resume run. No special handling needed —
    // the invariant is that loadSnapshot is always called once per run.
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });
    const config = makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    });

    // First run (simulate resume 1)
    const snapshot = makeRestorableSnapshot(config);
    mockComputeConfigHash.mockReturnValue('stablehash00001111');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'stablehash00001111',
      savedAt: '2026-04-06T10:00:00.000Z',
    });
    await runWorkflowActor(config);
    expect(mockLoadSnapshot).toHaveBeenCalledTimes(1);

    // Second run (simulate resume 2) — loadSnapshot called again, independently
    vi.clearAllMocks();
    setupDefaultMocks();
    mockComputeConfigHash.mockReturnValue('stablehash00001111');
    mockLoadSnapshot.mockReturnValue({
      snapshot,
      configHash: 'stablehash00001111',
      savedAt: '2026-04-06T10:05:00.000Z', // updated savedAt from previous run's save
    });
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(config);
    expect(mockLoadSnapshot).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Resuming from snapshot'));
  });
});

describe('resume with checkpoint log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('config mismatch: checkpoint log loaded for semantic skip-based resume (AC #2)', async () => {
    // Story 26-3 AC2: on config change, load checkpoint log and use it for skip-based resume.
    // The XState snapshot belongs to the old config but checkpoints are config-agnostic —
    // tasks listed in the log must be skipped so only remaining work is dispatched.
    mockComputeConfigHash.mockReturnValue('new-hash-12345678');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'old-hash-99999999',
      savedAt: '2026-04-05T00:00:00.000Z',
    });
    mockLoadCheckpointLog.mockReturnValue([
      { storyKey: '5-1-foo', taskName: 'implement', completedAt: '2026-04-05T01:00:00.000Z' },
    ]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // Checkpoint log must NOT be cleared — entries are used for semantic task skipping
    expect(mockClearCheckpointLog).not.toHaveBeenCalled();
    // Info log confirms checkpoints were loaded
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringMatching(/Loaded \d+ checkpoint/i),
    );
    // The previously completed task is skipped — driver is not dispatched
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('config mismatch + empty checkpoint log: clearCheckpointLog NOT called, no skip log (AC #2)', async () => {
    // When config changes but no checkpoints exist, the runner starts fresh.
    // clearCheckpointLog must NOT be called — there is nothing to clear and nothing to skip.
    mockComputeConfigHash.mockReturnValue('new-hash-12345678');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'old-hash-99999999',
      savedAt: '2026-04-05T00:00:00.000Z',
    });
    mockLoadCheckpointLog.mockReturnValue([]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockClearCheckpointLog).not.toHaveBeenCalled();
    expect(mockInfo).not.toHaveBeenCalledWith(
      expect.stringMatching(/Loaded \d+ checkpoint/i),
    );
  });

  it('config match, invalid payload: checkpoint log loaded as fallback (not skipped)', async () => {
    // When config hashes match but the snapshot payload is not restorable,
    // the checkpoint log is the durable fallback (AD3 safety net) and MUST be loaded.
    mockComputeConfigHash.mockReturnValue('matching-hash-1234');
    // snapshot: null fails isRestorableXStateSnapshot → goes into invalid-payload branch
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'matching-hash-1234',
      savedAt: '2026-04-05T00:00:00.000Z',
    });
    mockLoadCheckpointLog.mockReturnValue([]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // loadCheckpointLog IS called — invalid payload falls back to checkpoint log
    expect(mockLoadCheckpointLog).toHaveBeenCalled();
  });

  it('successful completion: clearAllPersistence called (not individual clear functions)', async () => {
    mockLoadSnapshot.mockReturnValue(null);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
  });
});

// ─── Story 26-4: Clear persistence on completion ─────────────────────

describe('persistence cleanup (story 26-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('successful run: clearAllPersistence called and "Persistence cleared" info logged (AC #1, #2)', async () => {
    mockLoadSnapshot.mockReturnValue(null);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });
    mockClearAllPersistence.mockReturnValue({ snapshotCleared: true, checkpointCleared: true });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringMatching(/Persistence cleared.*snapshot.*yes.*checkpoints.*yes/i),
    );
  });

  it('failed run: clearAllPersistence NOT called, "preserved" info logged (AC #8)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('dispatch fail', 'UNKNOWN', 'dev', new Error('inner')),
    ));
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(false);
    expect(mockClearAllPersistence).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Persistence preserved for resume'),
    );
  });

  it('interrupted run: clearAllPersistence NOT called, "preserved" info logged (AC #4)', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      abortSignal: ctrl.signal,
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(false);
    expect(mockClearAllPersistence).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Persistence preserved for resume'),
    );
  });

  it('loop terminated (max-iterations): clearAllPersistence NOT called, "preserved" info logged (AC #10)', async () => {
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify')) {
        return makeDriverStream('<verdict>fail</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      maxIterations: 1,
      workflow: makeWorkflow({
        tasks: {
          retry: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    expect(result.success).toBe(false);
    expect(mockClearAllPersistence).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringContaining('Persistence preserved for resume'),
    );
  });

  it('re-entry after completed phase: clearAllPersistence called before early return', async () => {
    mockReadWorkflowState.mockReturnValue(makeDefaultState({ phase: 'completed' }));
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(mockClearAllPersistence).toHaveBeenCalledWith('/project');
    expect(mockGetDriver).not.toHaveBeenCalled();
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('no snapshot + orphaned checkpoint entries: log is cleared and run starts fresh (AC #6)', async () => {
    // Story 26-4 AC6: when no snapshot exists but a checkpoint log is present,
    // the checkpoint log is orphaned stale state and must be cleared so the run
    // starts with an empty completedTasks set.
    mockLoadSnapshot.mockReturnValue(null);
    mockLoadCheckpointLog.mockReturnValue([
      { storyKey: '5-1-foo', taskName: 'implement', completedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockClearCheckpointLog).toHaveBeenCalledWith('/project');
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringMatching(/Clearing orphaned checkpoint log.*no snapshot file exists/i),
    );
    // Fresh run — stale checkpoint entries do not populate completedTasks, so the task dispatches.
    expect(mockDriverDispatch).toHaveBeenCalled();
  });

  it('no orphan warning when no snapshot and empty checkpoint log (fresh start)', async () => {
    mockLoadSnapshot.mockReturnValue(null);
    mockLoadCheckpointLog.mockReturnValue([]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockWarn).not.toHaveBeenCalledWith(
      expect.stringContaining('orphaned checkpoint'),
    );
    expect(mockClearCheckpointLog).not.toHaveBeenCalled();
  });

  it('cleanStaleTmpFiles called at run startup on every invocation (AC #7)', async () => {
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockCleanStaleTmpFiles).toHaveBeenCalledWith('/project');
  });

  it('cleanStaleTmpFiles called even on completed early-return path (AC #7)', async () => {
    mockReadWorkflowState.mockReturnValue(makeDefaultState({ phase: 'completed' }));

    await runWorkflowActor(makeConfig());

    expect(mockCleanStaleTmpFiles).toHaveBeenCalledWith('/project');
  });

  it('success: info log reflects what was actually cleared from clearAllPersistence result', async () => {
    mockLoadSnapshot.mockReturnValue(null);
    mockParse.mockReturnValue({ development_status: {} });
    mockClearAllPersistence.mockReturnValue({ snapshotCleared: false, checkpointCleared: false });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    expect(mockInfo).toHaveBeenCalledWith(
      expect.stringMatching(/snapshot: no.*checkpoints: no/i),
    );
  });
});

  it('config-change resume: tasks_completed synthesized from checkpoint log so gate skip guard can fire (bug fix)', async () => {
    // Regression: when config hash mismatches, the runner was clearing tasks_completed to [].
    // The gate skip guard in workflow-story-machine.ts requires BOTH completedTasks set AND
    // a hasSuccessfulGateCompletionRecord (checks tasks_completed). Clearing tasks_completed
    // breaks the dual-condition, so gates always re-execute on config-change resume.
    // Fix: synthesize tasks_completed from checkpoint log entries instead of clearing to [].
    mockComputeConfigHash.mockReturnValue('new-hash-12345678');
    mockLoadSnapshot.mockReturnValue({
      snapshot: null,
      configHash: 'old-hash-aabbccdd',
      savedAt: '2026-04-06T09:00:00.000Z',
    });
    mockLoadCheckpointLog.mockReturnValue([
      { storyKey: '5-1-foo', taskName: 'quality-gate', completedAt: '2026-04-06T08:00:00.000Z' },
      { storyKey: '5-1-foo', taskName: 'implement', completedAt: '2026-04-06T07:00:00.000Z' },
    ]);
    mockParse.mockReturnValue({ development_status: { '5-1-foo': 'ready-for-dev' } });
    mockCreateActor.mockClear();

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({ tasks: { implement: makeTask() }, flow: ['implement'] }),
    }));

    // runInput.workflowState.tasks_completed must contain synthesized entries from checkpoint log
    const callArgs = mockCreateActor.mock.calls[0];
    const runInput: RunMachineContext = callArgs[1].input;
    expect(runInput.workflowState.tasks_completed).toHaveLength(2);
    expect(runInput.workflowState.tasks_completed).toContainEqual(
      expect.objectContaining({ task_name: 'quality-gate', story_key: '5-1-foo' }),
    );
    expect(runInput.workflowState.tasks_completed).toContainEqual(
      expect.objectContaining({ task_name: 'implement', story_key: '5-1-foo' }),
    );
    // completedTasks set must also be populated for the first part of the AND condition
    expect(runInput.completedTasks.has('5-1-foo::quality-gate')).toBe(true);
    expect(runInput.completedTasks.has('5-1-foo::implement')).toBe(true);
  });
