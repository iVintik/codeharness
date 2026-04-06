/**
 * Tests for workflow-runner module.
 *
 * Covers: loadWorkItems, checkDriverHealth, runWorkflowActor,
 * crash recovery & resume.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWorkflowActor, loadWorkItems, checkDriverHealth } from '../workflow-runner.js';
import type { EngineConfig, WorkItem } from '../workflow-types.js';
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
}));

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
  info: vi.fn(),
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

vi.mock('../workflow-persistence.js', () => ({ saveSnapshot: vi.fn(), loadSnapshot: vi.fn(() => null) }));

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
}): ResolvedWorkflow {
  if (partial.storyFlow || partial.epicFlow) {
    return {
      tasks: partial.tasks,
      flow: partial.storyFlow ?? partial.flow,
      execution: defaultExecution,
      storyFlow: partial.storyFlow ?? partial.flow,
      epicFlow: partial.epicFlow ?? ['story_flow'],
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

function setupDefaultMocks() {
  mockReadWorkflowState.mockReturnValue(makeDefaultState());
  mockWriteWorkflowState.mockImplementation(() => {});
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
    expect(callOrder[2]).toContain('Verify the epic');
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
      if (opts.prompt.includes('Verify the epic')) {
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

  it('returns early when phase is completed', async () => {
    mockReadWorkflowState.mockReturnValueOnce({
      ...makeDefaultState(),
      phase: 'completed',
    });

    const result = await runWorkflowActor(makeConfig());
    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(result.durationMs).toBe(0);
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

  it('phase: completed returns early with tasksCompleted: 0 (AC #6)', async () => {
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'completed',
        started: '2026-04-03T00:00:00Z',
      }),
    );

    const config = makeConfig();
    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(result.storiesProcessed).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.durationMs).toBe(0);
    expect(mockDriverDispatch).not.toHaveBeenCalled();
    expect(mockWriteWorkflowState).not.toHaveBeenCalled();
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
          { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:01:00Z' },
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:02:00Z' },
        ],
      }),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
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
});
