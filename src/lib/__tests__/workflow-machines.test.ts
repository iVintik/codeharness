/**
 * Tests for workflow-machines module.
 *
 * Covers: dispatchTask, plugin resolution cascade (story 15-1),
 * loop block execution, output contract writing (story 13-3),
 * coverage deduplication in dispatchTask (story 16-5).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWorkflowActor } from '../workflow-runner.js';
import { dispatchTask } from '../workflow-machines.js';
import { PER_RUN_SENTINEL } from '../workflow-compiler.js';
import type { EngineConfig, WorkItem } from '../workflow-types.js';
import type { EvaluatorVerdict } from '../verdict-parser.js';
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

vi.mock('../workflow-persistence.js', () => ({ saveSnapshot: vi.fn(), loadSnapshot: vi.fn(() => null), clearSnapshot: vi.fn(), computeConfigHash: vi.fn(() => 'test-hash'), clearAllPersistence: vi.fn(() => ({ snapshotCleared: false, checkpointCleared: false })), cleanStaleTmpFiles: vi.fn(), clearCheckpointLog: vi.fn(), loadCheckpointLog: vi.fn(() => []) }));

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

function makeDriverStreamWithTools(output: string, sessionId: string, tools?: Array<{ name: string; input: string }>) {
  return (async function* () {
    if (tools) {
      for (const tool of tools) {
        yield { type: 'tool-start' as const, name: tool.name, id: `tool-${tool.name}` };
        yield { type: 'tool-input' as const, partial: tool.input };
        yield { type: 'tool-complete' as const };
      }
    }
    if (output) yield { type: 'text' as const, text: output };
    yield { type: 'result' as const, cost: 0.05, sessionId };
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
      sprintFlow: [],
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
    sprintFlow: [],
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

describe('dispatchTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('generates trace ID and injects trace prompt per dispatch (AC #11)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockGenerateTraceId).toHaveBeenCalledWith('run-001', 0, 'implement');
    expect(mockFormatTracePrompt).toHaveBeenCalledWith('ch-run-001-0-implement');
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Implement story 5-1-foo'),
        appendSystemPrompt: '[TRACE] trace_id=ch-run-001-0-implement',
      }),
    );
  });

  it('resolves session ID for continue boundary (AC #12)', async () => {
    const task = makeTask({ session: 'continue' });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    mockResolveSessionId.mockReturnValue('prev-sess-id');

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockResolveSessionId).toHaveBeenCalledWith(
      'continue',
      { taskName: 'implement', storyKey: '5-1-foo' },
      state,
    );
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'prev-sess-id' }),
    );
  });

  it('dispatches with cwd when source_access is true (AC #10)', async () => {
    const task = makeTask({ source_access: true });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig({ projectDir: '/my-project' });

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockCreateIsolatedWorkspace).not.toHaveBeenCalled();
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/my-project' }),
    );
  });

  it('creates isolated workspace when source_access is false (AC #9)', async () => {
    const mockWorkspace = {
      dir: '/tmp/codeharness-verify-run-001',
      storyFilesDir: '/tmp/codeharness-verify-run-001/story-files',
      verdictDir: '/tmp/codeharness-verify-run-001/verdict',
      toDispatchOptions: () => ({ cwd: '/tmp/codeharness-verify-run-001' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateIsolatedWorkspace.mockResolvedValue(mockWorkspace);

    const task = makeTask({ source_access: false });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'verify', '__run__', definition, state, config);

    expect(mockCreateIsolatedWorkspace).toHaveBeenCalledWith({
      runId: 'run-001',
      storyFiles: [],
    });
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/tmp/codeharness-verify-run-001' }),
    );
    expect(mockWorkspace.cleanup).toHaveBeenCalled();
  });

  it('writes state to disk after each dispatch (AC #4)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockWriteWorkflowState).toHaveBeenCalled();
    const writtenState = mockWriteWorkflowState.mock.calls[0][0] as WorkflowState;
    expect(writtenState.trace_ids).toContain('ch-run-001-0-implement');
  });

  it('records trace ID in workflow state (AC #11)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockRecordTraceId).toHaveBeenCalledWith('ch-run-001-0-implement', expect.any(Object));
  });

  it('records session ID after successful dispatch', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockRecordSessionId).toHaveBeenCalledWith(
      { taskName: 'implement', storyKey: '5-1-foo' },
      'sess-abc-123',
      expect.any(Object),
    );
  });

  it('appends checkpoint manually when dispatch returns no sessionId', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStream('ok', ''));

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockRecordSessionId).not.toHaveBeenCalled();
    const writtenState = mockWriteWorkflowState.mock.calls[0][0] as WorkflowState;
    expect(writtenState.tasks_completed).toHaveLength(1);
    expect(writtenState.tasks_completed[0].task_name).toBe('implement');
    expect(writtenState.tasks_completed[0].story_key).toBe('5-1-foo');
  });

  it('cleans up workspace on dispatch error when source_access is false', async () => {
    const mockWorkspace = {
      dir: '/tmp/test',
      storyFilesDir: '/tmp/test/story-files',
      verdictDir: '/tmp/test/verdict',
      toDispatchOptions: () => ({ cwd: '/tmp/test' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateIsolatedWorkspace.mockResolvedValue(mockWorkspace);
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(new Error('dispatch failed')));

    const task = makeTask({ source_access: false });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await expect(
      dispatchTask(task, 'verify', '__run__', definition, state, config),
    ).rejects.toThrow('dispatch failed');

    expect(mockWorkspace.cleanup).toHaveBeenCalled();
  });

  it('constructs per-run prompt for sentinel key', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'verify', '__run__', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Verify the epic'),
      }),
    );
  });

  it('calls buildPromptWithContractContext with previousOutputContract when provided', async () => {
    const contract: OutputContract = {
      version: 1,
      taskName: 'implement',
      storyId: '13-1',
      driver: 'claude-code',
      model: 'opus-4',
      timestamp: '2026-04-03T12:00:00Z',
      cost_usd: 0.42,
      duration_ms: 12345,
      changedFiles: ['src/lib/agents/output-contract.ts'],
      testResults: { passed: 10, failed: 0, coverage: 95.5 },
      output: 'All tasks complete.',
      acceptanceCriteria: [
        { id: 'AC1', description: 'Module exports write/read', status: 'passed' },
      ],
    };
    mockBuildPromptWithContractContext.mockReturnValue('enriched prompt with context');

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config, undefined, contract);

    expect(mockBuildPromptWithContractContext).toHaveBeenCalledWith(
      expect.stringContaining('Implement story 5-1-foo'),
      contract,
    );
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'enriched prompt with context' }),
    );
  });

  it('passes null to buildPromptWithContractContext when no previousOutputContract', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockBuildPromptWithContractContext).toHaveBeenCalledWith(
      expect.stringContaining('Implement story 5-1-foo'),
      null,
    );
  });
});

describe('plugin resolution cascade (story 15-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('uses task.plugins when task specifies plugins (AC #1, #6)', async () => {
    const task = makeTask({ plugins: ['gstack'] });
    const definition = makeDefinition({ plugins: ['agent-plugin'] });
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    const call = mockDriverDispatch.mock.calls[0][0];
    expect(call.plugins).toEqual(['gstack']);
  });

  it('falls back to agent plugins when task has no plugins (AC #5)', async () => {
    const task = makeTask();
    const definition = makeDefinition({ plugins: ['agent-plugin'] });
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    const call = mockDriverDispatch.mock.calls[0][0];
    expect(call.plugins).toEqual(['agent-plugin']);
  });

  it('uses undefined when neither task nor agent has plugins (AC #7)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    const call = mockDriverDispatch.mock.calls[0][0];
    expect(call.plugins).toBeUndefined();
  });

  it('task plugins override agent plugins — no merging (AC #6)', async () => {
    const task = makeTask({ plugins: ['task-plugin'] });
    const definition = makeDefinition({ plugins: ['agent-plugin'] });
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    const call = mockDriverDispatch.mock.calls[0][0];
    expect(call.plugins).toEqual(['task-plugin']);
    expect(call.plugins).not.toContain('agent-plugin');
  });

  it('explicit empty task.plugins=[] overrides agent plugins via ?? semantics', async () => {
    const task = makeTask({ plugins: [] });
    const definition = makeDefinition({ plugins: ['agent-plugin'] });
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    const call = mockDriverDispatch.mock.calls[0][0];
    expect(call.plugins).toEqual([]);
  });
});

describe('loop block execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  function makePassVerdict(): string {
    return '<evidence ac="1" status="pass">all tests pass</evidence> <evidence ac="2" status="pass">build OK</evidence> <verdict>pass</verdict>';
  }

  function makeFailVerdict(): string {
    return '<evidence ac="1" status="fail">Test suite failed</evidence> <evidence ac="2" status="pass">Build fine</evidence> <verdict>fail</verdict>';
  }

  function makeProgressingFailVerdict(passed: number): string {
    const parts: string[] = [];
    for (let i = 1; i <= passed; i++) {
      parts.push(`<evidence ac="${i}" status="pass">AC ${i} ok</evidence>`);
    }
    parts.push(`<evidence ac="${passed + 1}" status="fail">AC ${passed + 1} failed</evidence>`);
    parts.push('<verdict>fail</verdict>');
    return parts.join(' ');
  }

  it('terminates loop when verdict is pass (AC #2)', async () => {
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(makePassVerdict(), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(2);
  });

  it('terminates loop when maxIterations reached (AC #3)', async () => {
    let iterCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic') || opts.prompt.includes('__run__')) {
        iterCount++;
        return makeDriverStream(makeProgressingFailVerdict(iterCount), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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
      maxIterations: 3,
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    expect(mockDriverDispatch).toHaveBeenCalledTimes(6);

    const lastWriteCall = mockWriteWorkflowState.mock.calls[mockWriteWorkflowState.mock.calls.length - 1];
    const finalState = lastWriteCall[0] as WorkflowState;
    expect(finalState.phase).toBe('max-iterations');
  });

  it('terminates loop when evaluateProgress detects stagnation (AC #4)', async () => {
    let dispatchCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      dispatchCount++;
      if (opts.prompt.includes('Verify the epic') || opts.prompt.includes('__run__')) {
        return makeDriverStream(makeFailVerdict(), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    let lastWrittenState: WorkflowState | null = null;
    mockWriteWorkflowState.mockImplementation((state: WorkflowState) => {
      lastWrittenState = state;
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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

    expect(result.success).toBe(false);
    expect(dispatchCount).toBe(4);

    expect(lastWrittenState).not.toBeNull();
    expect(lastWrittenState!.circuit_breaker.triggered).toBe(true);
    expect(lastWrittenState!.circuit_breaker.reason).toBe('score-stagnation');
    expect(lastWrittenState!.circuit_breaker.score_history).toEqual([1, 1]);
    expect(lastWrittenState!.phase).toBe('circuit-breaker');
  });

  it('injects findings into retry prompt for failed stories (AC #5)', async () => {
    const dispatches: string[] = [];
    let callCount = 0;

    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      callCount++;
      dispatches.push(opts.prompt);

      if (opts.prompt.includes('Verify the epic')) {
        if (callCount <= 2) {
          return makeDriverStream(makeFailVerdict(), 'sess-v');
        }
        return makeDriverStream(makePassVerdict(), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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

    await runWorkflowActor(config);

    const secondRetryPrompt = dispatches[2];
    expect(secondRetryPrompt).toContain('Retry story 3-1-foo');
    expect(secondRetryPrompt).toContain('AC #1 (FAIL)');
    expect(secondRetryPrompt).toContain('Test suite failed');
  });

  it('parses verdict from DispatchResult.output (AC #6)', async () => {
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(makePassVerdict(), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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

    await runWorkflowActor(config);

    const stateWrites = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    const stateWithScore = stateWrites.find((s) => s.evaluator_scores.length > 0);
    expect(stateWithScore).toBeDefined();
    expect(stateWithScore!.evaluator_scores[0].passed).toBe(2);
    expect(stateWithScore!.evaluator_scores[0].failed).toBe(0);
  });

  it('halt error (RATE_LIMIT) terminates loop immediately (AC #8)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')),
    ));

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('RATE_LIMIT');
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
  });

  it('empty loop block terminates immediately', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask() },
        flow: [{ loop: [] }],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(mockDriverDispatch).not.toHaveBeenCalled();
  });

  it('uses default maxIterations of 5 when not specified', async () => {
    let evalCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic') || opts.prompt.includes('__run__')) {
        evalCount++;
        return makeDriverStream(makeProgressingFailVerdict(evalCount), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
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

    expect(result.success).toBe(false);
    expect(mockDriverDispatch).toHaveBeenCalledTimes(10);
  });
});

describe('output contract writing (story 13-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('dispatchTaskWithResult writes output contract to .codeharness/contracts/ (AC #1)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockWriteOutputContract).toHaveBeenCalledTimes(1);
    const [contract, contractDir] = mockWriteOutputContract.mock.calls[0] as [OutputContract, string];
    expect(contractDir).toBe('/project/.codeharness/contracts');
    expect(contract.taskName).toBe('implement');
    expect(contract.storyId).toBe('5-1-foo');
    expect(contract.version).toBe(1);
    expect(contract.driver).toBe('claude-code');
    expect(contract.model).toBe('claude-sonnet-4-20250514');
  });

  it('contract output field contains accumulated text events (AC #5)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield { type: 'text', text: 'Hello ' };
        yield { type: 'text', text: 'World' };
        yield { type: 'result', cost: 0.10, sessionId: 'sess-1' };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.output).toBe('Hello World');
  });

  it('contract cost_usd is populated from result event cost (AC #5)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield { type: 'text', text: 'ok' };
        yield { type: 'result', cost: 0.42, sessionId: 'sess-1' };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.cost_usd).toBe(0.42);
  });

  it('contract cost_usd is null when cost is 0 (AC #5)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield { type: 'result', cost: 0, sessionId: 'sess-1' };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.cost_usd).toBeNull();
  });

  it('contract changedFiles is populated from tool-complete events for Write/Edit (AC #5)', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStreamWithTools('done', 'sess-1', [
      { name: 'Write', input: '{"file_path": "/src/foo.ts"}' },
      { name: 'Edit', input: '{"file_path": "/src/bar.ts"}' },
      { name: 'Read', input: '{"file_path": "/src/baz.ts"}' },
    ]));

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.changedFiles).toEqual(['/src/foo.ts', '/src/bar.ts']);
  });

  it('contract testResults is null and acceptanceCriteria is empty (AC #5)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.testResults).toBeNull();
    expect(contract.acceptanceCriteria).toEqual([]);
  });

  it('contract acceptanceCriteria is populated from the story file when available', async () => {
    mockExistsSync.mockImplementation((path: string) => path === '/project/_bmad-output/implementation-artifacts/5-1-foo.md' || path === '/project/sprint-status.yaml');
    mockReadFileSync.mockImplementation((path: string) => {
      if (path === '/project/_bmad-output/implementation-artifacts/5-1-foo.md') {
        return '# Story 5-1\n\n## Acceptance Criteria\n\n1. First AC.\n2. Second AC.\n';
      }
      return 'dummy yaml';
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.acceptanceCriteria).toEqual([
      { id: 'AC1', description: 'First AC.', status: 'pending' },
      { id: 'AC2', description: 'Second AC.', status: 'pending' },
    ]);
  });

  it('contract duration_ms is populated (AC #1, #5)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(typeof contract.duration_ms).toBe('number');
    expect(contract.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('write failure is caught and logged (AC #8)', async () => {
    mockWriteOutputContract.mockImplementation(() => {
      throw new Error('disk full');
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('failed to write output contract'),
    );
  });

  it('sequential flow passes contract from task N to task N+1 via previousOutputContract (AC #2, #3)', async () => {
    const contractCalls: Array<OutputContract | null> = [];
    mockBuildPromptWithContractContext.mockImplementation((basePrompt: string, contract: OutputContract | null) => {
      contractCalls.push(contract);
      return basePrompt;
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          'create-story': makeTask(),
          implement: makeTask(),
        },
        flow: ['create-story', 'implement'],
      }),
    });

    await runWorkflowActor(config);

    expect(contractCalls[0]).toBeNull();
    expect(contractCalls[1]).not.toBeNull();
    expect(contractCalls[1]?.taskName).toBe('create-story');
  });

  it('contract directory path uses .codeharness/contracts/ under projectDir (AC #9)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig({ projectDir: '/my-custom-project' });

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [, contractDir] = mockWriteOutputContract.mock.calls[0] as [OutputContract, string];
    expect(contractDir).toBe('/my-custom-project/.codeharness/contracts');
  });

  it('changedFiles handles tools with "path" field instead of "file_path"', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStreamWithTools('done', 'sess-1', [
      { name: 'write_to_file', input: '{"path": "/src/new.ts"}' },
    ]));

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.changedFiles).toEqual(['/src/new.ts']);
  });

  it('changedFiles is empty when no Write/Edit tools are used', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStreamWithTools('done', 'sess-1', [
      { name: 'Read', input: '{"file_path": "/src/foo.ts"}' },
      { name: 'Bash', input: '{"command": "npm test"}' },
    ]));

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.changedFiles).toEqual([]);
  });

  it('changedFiles handles malformed tool input gracefully', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStreamWithTools('done', 'sess-1', [
      { name: 'Write', input: 'not valid json' },
    ]));

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.changedFiles).toEqual([]);
  });

  it('changedFiles deduplicates repeated file paths', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStreamWithTools('done', 'sess-1', [
      { name: 'Write', input: '{"file_path": "/src/foo.ts"}' },
      { name: 'Edit', input: '{"file_path": "/src/foo.ts"}' },
      { name: 'Write', input: '{"file_path": "/src/bar.ts"}' },
    ]));

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const [contract] = mockWriteOutputContract.mock.calls[0] as [OutputContract];
    expect(contract.changedFiles).toEqual(['/src/foo.ts', '/src/bar.ts']);
  });
});

describe('coverage deduplication in dispatchTask (story 16-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('AC#1,#6: appends coverage context to prompt when coverage_met is true', async () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        harness_version: '0.1.0',
        initialized: true,
        stack: 'node',
        stacks: ['node'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: 90, baseline: null, current: 95, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: true, coverage_met: true, verification_run: false },
        verification_log: [],
      },
      body: '\n# Codeharness State\n',
    });

    const previousContract: OutputContract = {
      version: 1,
      taskName: 'implement',
      storyId: '5-1-foo',
      driver: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      timestamp: '2026-04-03T00:00:00.000Z',
      cost_usd: 0.05,
      duration_ms: 1000,
      changedFiles: [],
      testResults: { passed: 10, failed: 0, coverage: 95 },
      output: 'Done',
      acceptanceCriteria: [],
    };

    await dispatchTask(
      makeTask({ source_access: false }),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
      undefined,
      previousContract,
    );

    const driverDispatchCalls = mockGetDriver().dispatch.mock?.calls;
    expect(driverDispatchCalls).toBeDefined();
    expect(driverDispatchCalls!.length).toBeGreaterThan(0);
    const opts = driverDispatchCalls![0][0];
    expect(opts.prompt).toContain('Coverage already verified by engine: 95% (target: 90%). No re-run needed.');
  });

  it('AC#2: does NOT append coverage context when coverage_met is false', async () => {
    const previousContract: OutputContract = {
      version: 1,
      taskName: 'implement',
      storyId: '5-1-foo',
      driver: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      timestamp: '2026-04-03T00:00:00.000Z',
      cost_usd: 0.05,
      duration_ms: 1000,
      changedFiles: [],
      testResults: { passed: 10, failed: 0, coverage: 50 },
      output: 'Done',
      acceptanceCriteria: [],
    };

    await dispatchTask(
      makeTask({ source_access: false }),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
      undefined,
      previousContract,
    );

    const driverDispatchCalls = mockGetDriver().dispatch.mock?.calls;
    expect(driverDispatchCalls).toBeDefined();
    expect(driverDispatchCalls!.length).toBeGreaterThan(0);
    const opts = driverDispatchCalls![0][0];
    expect(opts.prompt).not.toContain('Coverage already verified by engine');
  });

  it('uses the default target of 90 when the state target is null', async () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        harness_version: '0.1.0',
        initialized: true,
        stack: 'node',
        stacks: ['node'],
        enforcement: { frontend: true, database: true, api: true },
        coverage: { target: null, baseline: null, current: 95, tool: 'c8' },
        session_flags: { logs_queried: false, tests_passed: true, coverage_met: true, verification_run: false },
        verification_log: [],
      },
      body: '\n# Codeharness State\n',
    });

    await dispatchTask(
      makeTask({ source_access: false }),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
      undefined,
      {
        version: 1,
        taskName: 'implement',
        storyId: '5-1-foo',
        driver: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        timestamp: '2026-04-03T00:00:00.000Z',
        cost_usd: 0.05,
        duration_ms: 1000,
        changedFiles: [],
        testResults: { passed: 10, failed: 0, coverage: 95 },
        output: 'Done',
        acceptanceCriteria: [],
      },
    );

    expect((mockDriverDispatch.mock.calls[0][0] as { prompt: string }).prompt).toContain('(target: 90%)');
  });
});

describe('dispatchTask driver integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('calls getDriver with task.driver when present', async () => {
    const task = { ...makeTask(), driver: 'opencode' } as ResolvedTask & { driver: string };
    await dispatchTask(task, 'implement', '5-1-foo', makeDefinition(), makeDefaultState(), makeConfig());
    expect(mockGetDriver).toHaveBeenCalledWith('opencode');
  });

  it('maps AUTH/TIMEOUT categories to UNKNOWN dispatch errors', async () => {
    mockDriverDispatch.mockImplementation(() => makeDriverStream('', 'sess-err', {
      error: 'Authentication failed',
      errorCategory: 'AUTH',
    }));

    await expect(
      dispatchTask(makeTask(), 'implement', '5-1-foo', makeDefinition(), makeDefaultState(), makeConfig()),
    ).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('passes appendSystemPrompt through dispatch options', async () => {
    await dispatchTask(makeTask(), 'implement', '5-1-foo', makeDefinition(), makeDefaultState(), makeConfig());
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ appendSystemPrompt: '[TRACE] trace_id=ch-run-001-0-implement' }),
    );
  });

  it('does not map max_budget_usd to a timeout option', async () => {
    await dispatchTask(
      makeTask({ max_budget_usd: 5 }),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect((mockDriverDispatch.mock.calls[0][0] as Record<string, unknown>).timeout).toBe(1800000);
  });

  it('passes sourceAccess=false when task.source_access is false', async () => {
    const workspace = {
      dir: '/tmp/codeharness-verify-run-001',
      storyFilesDir: '/tmp/codeharness-verify-run-001/story-files',
      verdictDir: '/tmp/codeharness-verify-run-001/verdict',
      toDispatchOptions: () => ({ cwd: '/tmp/codeharness-verify-run-001' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateIsolatedWorkspace.mockResolvedValue(workspace);

    await dispatchTask(
      makeTask({ source_access: false }),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAccess: false,
        cwd: '/tmp/codeharness-verify-run-001',
      }),
    );
  });

  it('propagates retry prompts from evaluator findings into dispatch opts', async () => {
    const prompts: string[] = [];
    let callCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      prompts.push(opts.prompt);
      callCount++;
      if (opts.prompt.includes('Verify the epic')) {
        if (callCount <= 2) {
          return makeDriverStream('<evidence ac="1" status="fail">Build broken</evidence><verdict>fail</verdict>', 'sess-v');
        }
        return makeDriverStream('<evidence ac="1" status="pass">ok</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: {
          retry: makeTask(),
          verify: makeTask({ source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    expect(prompts[2]).toContain('Retry story 3-1-foo');
  });
});

describe('loop block execution coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('increments iteration and persists each loop pass', async () => {
    let verifyCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic') || opts.prompt.includes('__run__')) {
        verifyCount++;
        return verifyCount < 3
          ? makeDriverStream(`<evidence ac="${verifyCount}" status="fail">not yet</evidence><verdict>fail</verdict>`, 'sess-v')
          : makeDriverStream('<evidence ac="1" status="pass">done</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask(), verify: makeTask({ source_access: false }) },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    const iterations = mockWriteWorkflowState.mock.calls.map((c) => (c[0] as WorkflowState).iteration);
    expect(iterations).toContain(1);
    expect(iterations).toContain(2);
    expect(iterations.filter((iteration) => iteration === 2).length).toBeGreaterThan(0);
  });

  it('records multiple evaluator scores across iterations', async () => {
    let verifyCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic') || opts.prompt.includes('__run__')) {
        verifyCount++;
        return verifyCount === 1
          ? makeDriverStream('<evidence ac="1" status="fail">bad</evidence><verdict>fail</verdict>', 'sess-v')
          : makeDriverStream('<evidence ac="1" status="pass">good</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask(), verify: makeTask({ source_access: false }) },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    const finalState = [...mockWriteWorkflowState.mock.calls]
      .map((call) => call[0] as WorkflowState)
      .findLast((state) => state.evaluator_scores.length >= 2);
    expect(finalState?.evaluator_scores).toHaveLength(2);
  });

  it('halt error in per-run verify task terminates the loop', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;
    mockDriverDispatch.mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? makeDriverStream('ok', 'sess-r')
        : makeDriverStreamError(new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')));
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask(), verify: makeTask({ source_access: false }) },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    expect(result.errors[0].taskName).toBe('verify');
  });

  it('non-halt per-run errors are recorded without crashing the process', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        callCount++;
        return callCount === 1
          ? makeDriverStreamError(new DispatchError('temporary failure', 'UNKNOWN', 'dev', new Error('inner')))
          : makeDriverStream('<evidence ac="1" status="pass">done</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask(), verify: makeTask({ source_access: false }) },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    expect(result.errors).toHaveLength(1);
  });
});

describe('output contract flow propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('first task in a flow receives null previousOutputContract', async () => {
    const contracts: Array<OutputContract | null> = [];
    mockBuildPromptWithContractContext.mockImplementation((prompt: string, contract: OutputContract | null) => {
      contracts.push(contract);
      return prompt;
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    }));

    expect(contracts[0]).toBeNull();
  });

  it('passes contracts between loop tasks within an iteration', async () => {
    const contracts: Array<{ prompt: string; contract: OutputContract | null }> = [];
    mockBuildPromptWithContractContext.mockImplementation((prompt: string, contract: OutputContract | null) => {
      contracts.push({ prompt, contract });
      return prompt;
    });
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream('<evidence ac="1" status="pass">done</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask(), verify: makeTask({ source_access: false }) },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    const verifyCall = contracts.find((entry) => entry.prompt.includes('Verify the epic'));
    expect(verifyCall?.contract?.taskName).toBe('retry');
  });

  it('carries contracts across loop iterations', async () => {
    const contracts: Array<OutputContract | null> = [];
    mockBuildPromptWithContractContext.mockImplementation((prompt: string, contract: OutputContract | null) => {
      contracts.push(contract);
      return prompt;
    });
    let verifyCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        verifyCount++;
        return verifyCount === 1
          ? makeDriverStream('<evidence ac="1" status="fail">bad</evidence><verdict>fail</verdict>', 'sess-v')
          : makeDriverStream('<evidence ac="1" status="pass">done</evidence><verdict>pass</verdict>', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { retry: makeTask(), verify: makeTask({ source_access: false }) },
        flow: [{ loop: ['retry', 'verify'] }],
        epicTasks: ['verify'],
      }),
    }));

    expect(contracts[2]?.taskName).toBe('verify');
  });

  it('write failure still allows the next task to receive null contract', async () => {
    const contracts: Array<OutputContract | null> = [];
    mockWriteOutputContract.mockImplementation(() => {
      throw new Error('disk full');
    });
    mockBuildPromptWithContractContext.mockImplementation((prompt: string, contract: OutputContract | null) => {
      contracts.push(contract);
      return prompt;
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    const result = await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: { 'create-story': makeTask(), implement: makeTask() },
        flow: ['create-story', 'implement'],
      }),
    }));

    expect(result.success).toBe(true);
    expect(contracts[1]).toBeNull();
  });

  it('passes contracts through a 3-step sequential flow', async () => {
    const contracts: Array<OutputContract | null> = [];
    mockBuildPromptWithContractContext.mockImplementation((prompt: string, contract: OutputContract | null) => {
      contracts.push(contract);
      return prompt;
    });
    mockParse.mockReturnValue({ development_status: { '3-1-foo': 'ready-for-dev' } });

    await runWorkflowActor(makeConfig({
      workflow: makeWorkflow({
        tasks: {
          'create-story': makeTask(),
          implement: makeTask(),
          verify: makeTask(),
        },
        flow: ['create-story', 'implement', 'verify'],
        epicTasks: ['verify'],
      }),
    }));

    expect(contracts[0]).toBeNull();
    expect(contracts[1]?.taskName).toBe('create-story');
    expect(contracts[2]?.taskName).toBe('implement');
  });
});
