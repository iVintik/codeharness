import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted Mocks ---

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

import {
  runWorkflowActor,
  loadWorkItems,
  dispatchTask,
  parseVerdict,
  buildRetryPrompt,
  getFailedItems,
  executeLoopBlock,
  isTaskCompleted,
  isLoopTaskCompleted,
  buildCoverageDeduplicationContext,
  PER_RUN_SENTINEL,
} from '../workflow-machine.js';
import type {
  EngineConfig,
  EngineError,
  WorkItem,
  EvaluatorVerdict,
} from '../workflow-machine.js';
import type { WorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';
import type { OutputContract } from '../agents/types.js';

// --- Helpers ---

/**
 * Helper: create an async iterable that yields stream events for the driver mock.
 * Simulates what the real driver.dispatch() returns.
 */
function makeDriverStream(output: string, sessionId: string, opts?: { error?: string; errorCategory?: string }) {
  return (async function* () {
    if (output) {
      yield { type: 'text' as const, text: output };
    }
    yield {
      type: 'result' as const,
      cost: 0.05,
      sessionId,
      ...(opts?.error ? { error: opts.error, errorCategory: opts.errorCategory ?? 'UNKNOWN' } : {}),
    };
  })();
}

/**
 * Helper: create an async iterable that throws an error (for testing dispatch failures).
 */
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

/**
 * Helper: build a ResolvedWorkflow from a flat `flow` array.
 *
 * Splits the flat flow into storyFlow / epicFlow:
 *   - string tasks go into storyFlow (per-story)
 *   - loop blocks and any tasks explicitly listed in `epicTasks` go into epicFlow
 * If explicit storyFlow / epicFlow are provided, those take precedence.
 */
function makeWorkflow(partial: {
  tasks: Record<string, ResolvedTask>;
  flow: (string | { loop: string[] })[];
  storyFlow?: (string | { loop: string[] })[];
  epicFlow?: (string | { loop: string[] })[];
  /** Task names that should run at epic level (old scope=per-run). */
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

  // Auto-split: string tasks go to storyFlow, loop blocks + epicTasks go to epicFlow
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

  // Also add non-epic tasks from loop blocks to storyFlow
  // (so they appear in storyFlowTasks and are dispatched per-story in loops)
  const hasLoopBlocks = partial.flow.some(s => typeof s === 'object' && 'loop' in s);
  for (const step of partial.flow) {
    if (typeof step === 'object' && 'loop' in step) {
      for (const loopTask of step.loop) {
        if (!epicTaskSet.has(loopTask) && !storyFlow.includes(loopTask)) {
          storyFlow.push(loopTask);
        }
      }
    }
  }

  // For loop-only flows (no string tasks), remove 'story_flow' from epicFlow
  // to avoid running empty story pipeline before the loop.
  // The storyFlow tasks are only used for storyFlowTasks set, not for execution.
  const hasStringTasks = partial.flow.some(s => typeof s === 'string' && !epicTaskSet.has(s));
  if (!hasStringTasks && hasLoopBlocks) {
    // Remove the 'story_flow' ref — story pipeline has no tasks to run
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

  // By default, pass through the base prompt unchanged (no contract injection)
  mockBuildPromptWithContractContext.mockImplementation((basePrompt: string) => basePrompt);

  // By default, writeOutputContract succeeds silently
  mockWriteOutputContract.mockImplementation(() => {});

  // By default, readStateWithBody returns a default harness state
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

  // Driver mock: returns an async iterable of StreamEvents
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

  // Keep legacy mock for backward compat in any test that still references it
  mockDispatchAgent.mockResolvedValue({
    sessionId: 'sess-abc-123',
    success: true,
    durationMs: 1000,
    output: 'Done',
  });

  // Default: sprint-status.yaml exists with two stories
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

// --- Tests ---

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

  it('returns empty array when sprint-status.yaml does not exist and no issues.yaml', () => {
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
      development_status: {
        '3-1-foo': 'ready-for-dev',
      },
    });

    const items = loadWorkItems('/path/sprint-status.yaml', '/path/issues.yaml');

    expect(items).toEqual([{ key: '3-1-foo', source: 'sprint' }]);
  });

  it('loads both stories and issues when issues.yaml exists (AC #5)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('yaml');
    mockParse
      .mockReturnValueOnce({
        development_status: {
          '3-1-foo': 'ready-for-dev',
        },
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
    // sprint-status.yaml is fine
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
    // Should still have the sprint story
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
        prompt: 'Implement story 5-1-foo',
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
    // Session ID is passed through to the driver via DispatchOpts.sessionId
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'prev-sess-id',
      }),
    );
  });

  it('dispatches with cwd when source_access is true (default) (AC #10)', async () => {
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
    // State should have the new checkpoint
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

    const result = await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    // recordSessionId should NOT be called (empty string is falsy)
    expect(mockRecordSessionId).not.toHaveBeenCalled();
    // State should have a manually-created checkpoint
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

    // Cleanup should still be called
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

  it('calls buildPromptWithContractContext with previousOutputContract when provided (AC #10, story 13-2)', async () => {
    const contract = {
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
      'Implement story 5-1-foo',
      contract,
    );
    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'enriched prompt with context',
      }),
    );
  });

  it('passes null to buildPromptWithContractContext when no previousOutputContract (story 13-2)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockBuildPromptWithContractContext).toHaveBeenCalledWith(
      'Implement story 5-1-foo',
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
    const task = makeTask(); // no plugins
    const definition = makeDefinition({ plugins: ['agent-plugin'] });
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    const call = mockDriverDispatch.mock.calls[0][0];
    expect(call.plugins).toEqual(['agent-plugin']);
  });

  it('uses undefined when neither task nor agent has plugins (AC #7)', async () => {
    const task = makeTask(); // no plugins
    const definition = makeDefinition(); // no plugins
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
    // Empty array is not null/undefined, so ?? does NOT fall through to agent plugins.
    // This is intentional: explicit empty = "no plugins".
    expect(call.plugins).toEqual([]);
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

    // Two stories, flow: [implement, verify]
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig();
    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    // story_flow: implement for each story, then epic_flow: verify once per epic
    expect(callOrder).toHaveLength(3);
    expect(callOrder[0]).toBe('Implement story 3-1-foo');
    expect(callOrder[1]).toBe('Implement story 3-2-bar');
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
      development_status: {
        '3-1-foo': 'ready-for-dev',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    await runWorkflowActor(config);

    // writeWorkflowState called: initial state + after dispatch + final completed state
    expect(mockWriteWorkflowState).toHaveBeenCalledTimes(3);
  });

  it('executes loop blocks instead of skipping them', async () => {
    // Loop with retry (per-story) + verify (per-run) — verify returns pass on first try
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 1, failed: 0, unknown: 0, total: 1 },
          findings: [],
        }), 'sess-v');
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

    // Should have dispatched: retry for 1 story + verify once
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
    // Should halt after first error — only one dispatch attempted
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
  });

  it('continues on UNKNOWN errors for per-story tasks (AC #13)', async () => {
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

    // Both stories attempted
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.errors).toHaveLength(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('sets phase to error on dispatch failure', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('fail', 'UNKNOWN', 'dev', new Error('inner')),
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

    await runWorkflowActor(config);

    // Find the write call that sets phase to "error"
    const errorWrite = mockWriteWorkflowState.mock.calls.find(
      (call: unknown[]) => (call[0] as WorkflowState).phase === 'error',
    );
    expect(errorWrite).toBeDefined();
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

  it('initializes workflow state with phase=executing at start', async () => {
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

    const firstWrite = mockWriteWorkflowState.mock.calls[0];
    expect((firstWrite[0] as WorkflowState).phase).toBe('executing');
  });

  it('invokes source isolation for per-run task with source_access false', async () => {
    const mockWorkspace = {
      dir: '/tmp/test',
      storyFilesDir: '/tmp/test/story-files',
      verdictDir: '/tmp/test/verdict',
      toDispatchOptions: () => ({ cwd: '/tmp/test' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateIsolatedWorkspace.mockResolvedValue(mockWorkspace);

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          verify: makeTask({ source_access: false }),
        },
        flow: ['verify'],
      epicTasks: ['verify'],
      }),
    });

    await runWorkflowActor(config);

    expect(mockCreateIsolatedWorkspace).toHaveBeenCalled();
    expect(mockWorkspace.cleanup).toHaveBeenCalled();
  });

  it('does NOT invoke source isolation for source_access true tasks', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask({ source_access: true }) },
        flow: ['implement'],
      }),
    });

    await runWorkflowActor(config);

    expect(mockCreateIsolatedWorkspace).not.toHaveBeenCalled();
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
        tasksCompleted: 3, // 2 per-story + 1 per-run
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
      agents: {}, // no agents
    });

    const result = await runWorkflowActor(config);

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('agent'));
    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
  });

  it('records error checkpoint in state on dispatch failure (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('fail', 'UNKNOWN', 'dev', new Error('inner')),
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

    await runWorkflowActor(config);

    // Find the write call with the error checkpoint
    const errorWrite = mockWriteWorkflowState.mock.calls.find(
      (call: unknown[]) => {
        const st = call[0] as WorkflowState;
        return st.phase === 'error' && st.tasks_completed.length > 0;
      },
    );
    expect(errorWrite).toBeDefined();
    const errorState = errorWrite![0] as WorkflowState;
    expect(errorState.tasks_completed[0].task_name).toBe('implement');
    expect(errorState.tasks_completed[0].story_key).toBe('3-1-foo');
  });

  it('halts per-story RATE_LIMIT errors across flow steps (not just inner loop)', async () => {
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
          implement: makeTask(),
          verify: makeTask(),
        },
        flow: ['implement', 'verify'],
      epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    // Should halt after implement fails — verify should NOT run
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].taskName).toBe('implement');
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
    // implement should still run
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('halts on NETWORK dispatch errors for per-run tasks', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDriverDispatch.mockImplementation(() => makeDriverStreamError(
      new DispatchError('network fail', 'NETWORK', 'dev', new Error('inner')),
    ));

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          implement: makeTask(),
          verify: makeTask(),
        },
        flow: ['verify', 'implement'],
      epicTasks: ['verify'],
      }),
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    // Should halt after verify fails — implement never runs
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
  });
});

// --- Loop Block Tests (Story 5-2) ---

describe('parseVerdict (re-exported from verdict-parser)', () => {
  it('parses valid verdict JSON', () => {
    const verdict = parseVerdict(JSON.stringify({
      verdict: 'pass',
      score: { passed: 3, failed: 0, unknown: 0, total: 3 },
      findings: [],
    }));

    expect(verdict).toBeDefined();
    expect(verdict.verdict).toBe('pass');
    expect(verdict.score.passed).toBe(3);
  });

  it('parses verdict with findings', () => {
    const input = {
      verdict: 'fail',
      score: { passed: 1, failed: 1, unknown: 1, total: 3 },
      findings: [{
        ac: 1,
        description: 'Test AC',
        status: 'fail',
        evidence: {
          commands_run: ['npm test'],
          output_observed: 'FAIL',
          reasoning: 'Tests failed',
        },
      }],
    };

    const verdict = parseVerdict(JSON.stringify(input));
    expect(verdict).toBeDefined();
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].ac).toBe(1);
  });

  it('throws VerdictParseError for invalid JSON', () => {
    expect(() => parseVerdict('not json')).toThrow();
  });

  it('throws VerdictParseError for missing verdict field', () => {
    expect(() => parseVerdict(JSON.stringify({
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      findings: [],
    }))).toThrow();
  });

  it('throws VerdictParseError for invalid verdict value', () => {
    expect(() => parseVerdict(JSON.stringify({
      verdict: 'maybe',
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      findings: [],
    }))).toThrow();
  });

  it('throws VerdictParseError for missing score field', () => {
    expect(() => parseVerdict(JSON.stringify({
      verdict: 'pass',
      findings: [],
    }))).toThrow();
  });

  it('throws VerdictParseError for missing findings field', () => {
    expect(() => parseVerdict(JSON.stringify({
      verdict: 'pass',
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
    }))).toThrow();
  });

  it('throws VerdictParseError for non-object input', () => {
    expect(() => parseVerdict('"just a string"')).toThrow();
    expect(() => parseVerdict('42')).toThrow();
    expect(() => parseVerdict('null')).toThrow();
  });

  it('throws VerdictParseError when score fields are not numbers', () => {
    expect(() => parseVerdict(JSON.stringify({
      verdict: 'pass',
      score: { passed: 'one', failed: 0, unknown: 0, total: 1 },
      findings: [],
    }))).toThrow();
  });
});

describe('buildRetryPrompt', () => {
  it('builds prompt with failed findings', () => {
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
    expect(prompt).not.toContain('AC #2'); // passed — should be excluded
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
});

describe('getFailedItems', () => {
  const items: WorkItem[] = [
    { key: '3-1-foo', source: 'sprint' },
    { key: '3-2-bar', source: 'sprint' },
  ];

  it('returns all items when verdict is null', () => {
    expect(getFailedItems(null, items)).toEqual(items);
  });

  it('returns empty array when verdict is pass', () => {
    const verdict: EvaluatorVerdict = {
      verdict: 'pass',
      score: { passed: 2, failed: 0, unknown: 0, total: 2 },
      findings: [],
    };
    expect(getFailedItems(verdict, items)).toEqual([]);
  });

  it('returns all items when verdict is fail (conservative)', () => {
    const verdict: EvaluatorVerdict = {
      verdict: 'fail',
      score: { passed: 1, failed: 1, unknown: 0, total: 2 },
      findings: [],
    };
    expect(getFailedItems(verdict, items)).toEqual(items);
  });
});

describe('loop block execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  function makePassVerdict(): string {
    return JSON.stringify({
      verdict: 'pass',
      score: { passed: 2, failed: 0, unknown: 0, total: 2 },
      findings: [],
    });
  }

  function makeFailVerdict(): string {
    return JSON.stringify({
      verdict: 'fail',
      score: { passed: 1, failed: 1, unknown: 0, total: 2 },
      findings: [
        {
          ac: 1,
          description: 'Tests pass',
          status: 'fail',
          evidence: { commands_run: ['npm test'], output_observed: 'FAIL', reasoning: 'Test suite failed' },
        },
        {
          ac: 2,
          description: 'Build succeeds',
          status: 'pass',
          evidence: { commands_run: ['npm run build'], output_observed: 'OK', reasoning: 'Build fine' },
        },
      ],
    });
  }

  /**
   * Make a fail verdict with a custom passed count, used to simulate progress
   * across iterations so the circuit breaker does not trigger stagnation.
   */
  function makeProgressingFailVerdict(passed: number): string {
    const total = Math.max(passed + 1, 2); // always at least 1 failure
    return JSON.stringify({
      verdict: 'fail',
      score: { passed, failed: total - passed, unknown: 0, total },
      findings: [],
    });
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
    expect(result.tasksCompleted).toBe(2); // 1 retry + 1 verify
  });

  it('terminates loop when maxIterations reached (AC #3)', async () => {
    // Verify always fails but with increasing passed count to avoid circuit breaker
    let iterCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
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
    // 3 iterations × 2 tasks per iteration = 6
    expect(mockDriverDispatch).toHaveBeenCalledTimes(6);

    // State should have phase=max-iterations
    const lastWriteCall = mockWriteWorkflowState.mock.calls[mockWriteWorkflowState.mock.calls.length - 1];
    const finalState = lastWriteCall[0] as WorkflowState;
    expect(finalState.phase).toBe('max-iterations');
  });

  it('terminates loop when evaluateProgress detects stagnation (AC #4)', async () => {
    let dispatchCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      dispatchCount++;
      if (opts.prompt.includes('Verify the epic')) {
        // Return the same fail verdict every time → stagnation (passed=1 each iteration)
        return makeDriverStream(makeFailVerdict(), 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    // Track the state written by the engine to verify circuit breaker fields
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
    // story_flow dispatches retry once, then epic loop: iter1 (retry+verify), iter2 (retry+verify) → circuit breaker
    expect(dispatchCount).toBe(5);

    // Verify circuit breaker was set via evaluateProgress, not mock mutation
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
        // First verify: fail, second verify: pass
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

    // Second retry prompt (iteration 2) should contain findings
    const secondRetryPrompt = dispatches[2]; // [0]=retry, [1]=verify, [2]=retry(with findings)
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

    // Check that evaluator_scores were recorded in state
    const stateWrites = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    const stateWithScore = stateWrites.find((s) => s.evaluator_scores.length > 0);
    expect(stateWithScore).toBeDefined();
    expect(stateWithScore!.evaluator_scores[0].passed).toBe(2);
    expect(stateWithScore!.evaluator_scores[0].failed).toBe(0);
  });

  it('records all-UNKNOWN score when verdict parsing fails (AC #6)', async () => {
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        // Return non-JSON output
        return makeDriverStream('not a json verdict', 'sess-v');
      }
      return makeDriverStream('ok', 'sess-r');
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
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
      maxIterations: 1,
    });

    await runWorkflowActor(config);

    // Check for all-UNKNOWN score
    const stateWrites = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    const stateWithScore = stateWrites.find((s) => s.evaluator_scores.length > 0);
    expect(stateWithScore).toBeDefined();
    expect(stateWithScore!.evaluator_scores[0].passed).toBe(0);
    expect(stateWithScore!.evaluator_scores[0].failed).toBe(0);
    expect(stateWithScore!.evaluator_scores[0].unknown).toBe(2); // 2 work items
    expect(stateWithScore!.evaluator_scores[0].total).toBe(2);
  });

  it('increments iteration and persists each loop pass (AC #7)', async () => {
    let callCount = 0;
    let evalCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      callCount++;
      if (opts.prompt.includes('Verify the epic')) {
        evalCount++;
        // Fail twice with increasing passed count (avoid circuit breaker), pass on third
        if (callCount <= 5) { // story_flow retry + iter1 (retry+verify) + iter2 (retry+verify)
          return makeDriverStream(makeProgressingFailVerdict(evalCount), 'sess-v');
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

    // Find all writes with different iteration values
    const iterations = mockWriteWorkflowState.mock.calls
      .map((c: unknown[]) => (c[0] as WorkflowState).iteration)
      .filter((v: number, i: number, arr: number[]) => i === 0 || v !== arr[i - 1]);

    // Should have iterations 0 (initial), 1, 2, 3
    expect(iterations).toContain(1);
    expect(iterations).toContain(2);
    expect(iterations).toContain(3);
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
    // Only one dispatch attempted before halt
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
  });

  it('empty loop block terminates immediately', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          retry: makeTask(),
        },
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
      if (opts.prompt.includes('Verify the epic')) {
        evalCount++;
        // Increasing passed count to avoid circuit breaker stagnation detection
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
      // maxIterations not set — should default to 5
    });

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    // 5 iterations × 2 dispatches = 10
    expect(mockDriverDispatch).toHaveBeenCalledTimes(10);
  });

  it('records multiple evaluator scores across iterations', async () => {
    let callCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      callCount++;
      if (opts.prompt.includes('Verify the epic')) {
        // Fail first, pass second
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

    // Find final state with evaluator scores
    const allWrites = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    const statesWithScores = allWrites.filter((s) => s.evaluator_scores.length >= 2);
    expect(statesWithScores.length).toBeGreaterThan(0);

    const finalScored = statesWithScores[statesWithScores.length - 1];
    expect(finalScored.evaluator_scores).toHaveLength(2);
    expect(finalScored.evaluator_scores[0].failed).toBe(1); // first: fail
    expect(finalScored.evaluator_scores[1].passed).toBe(2); // second: pass
  });

  it('halt error in per-run verify task terminates loop', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');

    let callCount = 0;
    mockDriverDispatch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // retry succeeds
        return makeDriverStream('ok', 'sess-r');
      }
      // verify throws RATE_LIMIT
      return makeDriverStreamError(new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')));
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
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('RATE_LIMIT');
    expect(result.errors[0].taskName).toBe('verify');
  });

  it('clears stale verdict after non-halt per-run error so next iteration retries all items', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;

    mockDriverDispatch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First retry succeeds (iteration 1)
        return makeDriverStream('ok', 'sess-r');
      }
      if (callCount === 2) {
        // First verify throws non-halt UNKNOWN error (iteration 1)
        return makeDriverStreamError(new DispatchError('unknown err', 'UNKNOWN', 'dev', new Error('inner')));
      }
      if (callCount === 3) {
        // Verify re-dispatched (iteration 1 — error checkpoint doesn't count as completion,
        // so the loop stays on iteration 1 and re-dispatches verify)
        return makeDriverStream(makeFailVerdict(), 'sess-v');
      }
      if (callCount === 4) {
        // Second retry (iteration 2 — all items retried since stale verdict cleared)
        return makeDriverStream('ok', 'sess-r');
      }
      // Second verify passes (iteration 2)
      return makeDriverStream(makePassVerdict(), 'sess-v');
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

    // Loop should eventually succeed (pass verdict on iteration 2 verify)
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN');
    // 5 dispatches: retry1 + verify1(error) + verify1-retry(ok) + retry2 + verify2(pass)
    expect(mockDriverDispatch).toHaveBeenCalledTimes(5);
  });

  it('non-halt per-run error records error and continues to next iteration', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;

    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      callCount++;
      if (opts.prompt.includes('Verify the epic')) {
        if (callCount <= 2) {
          // First verify: non-halt error
          return makeDriverStreamError(new DispatchError('bad response', 'UNKNOWN', 'dev', new Error('inner')));
        }
        // Second verify: pass
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

    // Error from first verify recorded, but loop continued and eventually passed
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN');
  });
});

// ============================================================
// Story 5-3: Crash Recovery & Resume Tests
// ============================================================

describe('isTaskCompleted', () => {
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

  it('returns false when storyKey matches but taskName does not (AC #7)', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    // ("implement", "3-1-foo") does NOT cause ("verify", "3-1-foo") to be skipped
    expect(isTaskCompleted(state, 'verify', '3-1-foo')).toBe(false);
  });

  it('returns false when tasks_completed is empty (AC #5)', () => {
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
});

describe('crash recovery & resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('skips completed sequential per-story task (AC #1)', async () => {
    // Pre-populate: implement for 5-1-foo already done, 5-2-bar not done
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

    // Only 5-2-bar should have been dispatched (5-1-foo skipped)
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('does NOT skip per-story task when no checkpoint exists (AC #5)', async () => {
    // Fresh state — no checkpoints
    mockReadWorkflowState.mockReturnValue(makeDefaultState());

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    // Both 5-1-foo and 5-2-bar should be dispatched
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('skips completed per-run task (AC #3)', async () => {
    // Pre-populate: verify per-run already done
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
    // 5 stories, 3 already completed
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

    // Only 2 dispatches for 5-4-d and 5-5-e
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('skips all per-story tasks and proceeds to per-run verify (AC #3)', async () => {
    // All per-story implement tasks done, verify not done
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

    // Only 1 dispatch for verify (implement skipped for both stories)
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
    // Should not dispatch anything or write state
    expect(mockDriverDispatch).not.toHaveBeenCalled();
    expect(mockWriteWorkflowState).not.toHaveBeenCalled();
  });

  it('tuple matching: ("implement", "3-1-foo") does NOT skip ("verify", "3-1-foo") (AC #7)', async () => {
    // Only implement for 5-1-foo is done. verify for 5-1-foo should still execute.
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

    // implement skipped, verify dispatched
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('corrupted state triggers fresh start (AC #9)', async () => {
    // readWorkflowState already handles corruption by returning defaults
    // This test verifies the engine works correctly with default state
    mockReadWorkflowState.mockReturnValue(makeDefaultState());

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    const result = await runWorkflowActor(config);

    // Should execute all tasks from scratch
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
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

    // 2 per-story + 1 per-run = 3 dispatches
    expect(mockDriverDispatch).toHaveBeenCalledTimes(3);
    expect(result.tasksCompleted).toBe(3);
  });

  it('tasks_completed growth is proportional to actual task count only (AC #8)', async () => {
    mockReadWorkflowState.mockReturnValue(makeDefaultState());

    mockParse.mockReturnValue({
      development_status: {
        '5-1-a': 'ready-for-dev',
        '5-2-b': 'ready-for-dev',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    await runWorkflowActor(config);

    // Check that state writes contain tasks_completed arrays that only grow by 1 per dispatch
    const writes = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    let prevLength = 0;
    for (const ws of writes) {
      const len = ws.tasks_completed.length;
      // Each write should grow by at most 1 checkpoint
      expect(len - prevLength).toBeLessThanOrEqual(1);
      prevLength = len;
    }
  });

  it('loop block resumes from current iteration, skipping completed tasks (AC #4)', async () => {
    // Simulate crash mid-iteration 2:
    // - Iteration 1: retry(3-1-foo) and verify(__run__) both done (2 checkpoints each)
    // Wait, iteration 1 means 1 checkpoint each.
    // - Iteration 1 fully done: retry(3-1-foo) x1, verify(__run__) x1
    // - Iteration 2 partially done: retry(3-1-foo) x2 done, verify(__run__) not done for iter 2
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        iteration: 2, // currently on iteration 2
        tasks_completed: [
          // Iteration 1 checkpoints
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
          { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:01:00Z' },
          // Iteration 2 partial: retry done, verify NOT done
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:02:00Z' },
        ],
      }),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    // verify returns pass so loop terminates
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 2, failed: 0, unknown: 0, total: 2 },
          findings: [],
        }), 'sess-v');
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

    // Only verify should be dispatched (retry already done for iteration 2)
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
    // retry should have been skipped
    expect(mockWarn).toHaveBeenCalledWith(
      'workflow-machine: skipping completed task retry for 3-1-foo',
    );
  });

  it('loop iteration counter is preserved — not reset to 0 (AC #4)', async () => {
    // Resume at iteration 2 (fully completed), should advance to 3
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        iteration: 2,
        tasks_completed: [
          // Both iterations fully done
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
          { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:01:00Z' },
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:02:00Z' },
          { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:03:00Z' },
        ],
      }),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    // Pass on next verify
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 2, failed: 0, unknown: 0, total: 2 },
          findings: [],
        }), 'sess-v');
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

    await runWorkflowActor(config);

    // Check that iteration was advanced to 3 (not reset to 0 or 1)
    const writes = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    const iterationValues = writes.map((s) => s.iteration);
    // Should contain 3 (the next iteration after 2)
    expect(iterationValues).toContain(3);
    // Should NOT contain 0 or 1
    expect(iterationValues).not.toContain(0);
    expect(iterationValues).not.toContain(1);
  });

  it('error checkpoints do NOT cause task to be skipped on resume (error!=completion)', async () => {
    // A previous run errored on implement for 5-1-foo — error checkpoint recorded.
    // On resume, the task should NOT be skipped because error checkpoints are not completions.
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

    // Both stories should be dispatched (error checkpoint should not skip 5-1-foo)
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('isTaskCompleted returns false for error checkpoints', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z', error: true },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '3-1-foo')).toBe(false);
  });

  it('isLoopTaskCompleted excludes error checkpoints from count', () => {
    const state = makeDefaultState({
      tasks_completed: [
        // 1 success + 1 error for retry/3-1-foo
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:01:00Z', error: true },
      ],
    });
    // Only 1 successful checkpoint, so iteration 2 should NOT be considered complete
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(false);
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(true);
  });

  it('resumes from error phase and continues execution', async () => {
    // Previous run ended in error phase. On resume, engine should continue.
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

    // 5-1-foo was successfully completed (no error flag), so it should be skipped.
    // Only 5-2-bar should be dispatched.
    expect(mockDriverDispatch).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('loop block: non-halt per-story error continues to next story (branch coverage)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;

    mockDriverDispatch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First per-story dispatch: non-halt error
        return makeDriverStreamError(new DispatchError('bad', 'UNKNOWN', 'dev', new Error('inner')));
      }
      if (callCount === 2) {
        // Second per-story dispatch succeeds
        return makeDriverStream('ok', 'sess-r');
      }
      // Verify passes
      return makeDriverStream(JSON.stringify({
        verdict: 'pass',
        score: { passed: 2, failed: 0, unknown: 0, total: 2 },
        findings: [],
      }), 'sess-v');
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
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

    // 3 dispatches: retry(3-1-foo, error) + retry(3-2-bar, ok) + verify(pass)
    expect(mockDriverDispatch).toHaveBeenCalledTimes(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].storyKey).toBe('3-1-foo');
  });

  it('loop block: skips completed per-run task on resume (branch coverage)', async () => {
    // Resume mid-loop: iteration 1, retry done, verify done for iteration 1
    // This should advance to iteration 2 and dispatch tasks
    mockReadWorkflowState.mockReturnValue(
      makeDefaultState({
        phase: 'executing',
        started: '2026-04-03T00:00:00Z',
        iteration: 1,
        tasks_completed: [
          { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
          { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:01:00Z' },
        ],
        evaluator_scores: [{
          iteration: 1, passed: 0, failed: 1, unknown: 0, total: 1, timestamp: '2026-04-03T00:01:00Z',
        }],
      }),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 1, failed: 0, unknown: 0, total: 1 },
          findings: [],
        }), 'sess-v');
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

    // Should advance to iteration 2, dispatch retry + verify
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
  });

  it('loop block: missing agent in loop task is skipped gracefully', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    // verify task uses 'evaluator' agent which is NOT in config.agents
    mockDriverDispatch.mockImplementation(() => {
      return makeDriverStream(JSON.stringify({
        verdict: 'pass',
        score: { passed: 1, failed: 0, unknown: 0, total: 1 },
        findings: [],
      }), 'sess-v');
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          retry: makeTask(),
          verify: makeTask({ agent: 'evaluator' }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      epicTasks: ['verify'],
      }),
      agents: {
        dev: makeDefinition(),
        // 'evaluator' agent is NOT provided
      },
      maxIterations: 1,
    });

    await runWorkflowActor(config);

    // verify task should be skipped because agent 'evaluator' is missing
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('agent "evaluator" not found'),
    );
  });
});

// --- Driver Integration Tests (Story 10-5) ---

describe('driver integration (story 10-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('calls getDriver with "claude-code" when task has no driver field (AC #1, #2)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockGetDriver).toHaveBeenCalledWith('claude-code');
  });

  it('calls getDriver with task.driver when present (forward-compat)', async () => {
    const task = { ...makeTask(), driver: 'opencode' } as ResolvedTask & { driver: string };
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockGetDriver).toHaveBeenCalledWith('opencode');
  });

  it('calls driver.dispatch() with properly constructed DispatchOpts (AC #7)', async () => {
    const task = makeTask({ source_access: true });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig({ projectDir: '/my-project' });

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Implement story 5-1-foo',
        model: 'claude-sonnet-4-20250514',
        cwd: '/my-project',
        sourceAccess: true,
      }),
    );
  });

  it('calls resolveModel with (task, agentModelSource, driver) (AC #4)', async () => {
    const task = makeTask();
    const definition = makeDefinition({ model: 'claude-haiku-35' });
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockResolveModel).toHaveBeenCalledWith(
      task,
      { model: 'claude-haiku-35' },
      expect.objectContaining({ name: 'claude-code', defaultModel: 'claude-sonnet-4-20250514' }),
    );
  });

  it('consumes AsyncIterable<StreamEvent> and extracts result data (AC #3)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield { type: 'text', text: 'Hello ' };
        yield { type: 'text', text: 'World' };
        yield { type: 'result', cost: 0.12, sessionId: 'sess-driver-1' };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    // Session ID was extracted from result event and recorded
    expect(mockRecordSessionId).toHaveBeenCalledWith(
      { taskName: 'implement', storyKey: '5-1-foo' },
      'sess-driver-1',
      state,
    );
  });

  it('maps error result events to DispatchError (AC #5)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield { type: 'text', text: 'partial output' };
        yield {
          type: 'result',
          cost: 0,
          sessionId: 'sess-err',
          error: 'Rate limit exceeded',
          errorCategory: 'RATE_LIMIT',
        };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await expect(
      dispatchTask(task, 'implement', '5-1-foo', definition, state, config),
    ).rejects.toThrow('Rate limit exceeded');

    // Error should be a DispatchError with RATE_LIMIT code
    try {
      await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('RATE_LIMIT');
    }
  });

  it('maps AUTH/TIMEOUT errorCategory to UNKNOWN DispatchErrorCode (AC #5)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield {
          type: 'result',
          cost: 0,
          sessionId: 'sess-err',
          error: 'Authentication failed',
          errorCategory: 'AUTH',
        };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    try {
      await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      // AUTH maps to UNKNOWN since DispatchErrorCode doesn't have AUTH
      expect((err as { code: string }).code).toBe('UNKNOWN');
    }
  });

  it('maps SDK_INIT errorCategory to SDK_INIT DispatchErrorCode (halt-critical)', async () => {
    mockDriverDispatch.mockImplementation(() => {
      return (async function* () {
        yield {
          type: 'result',
          cost: 0,
          sessionId: 'sess-err',
          error: 'Binary not found',
          errorCategory: 'SDK_INIT',
        };
      })();
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    try {
      await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe('SDK_INIT');
    }
  });

  it('passes sessionId through DispatchOpts when resolved', async () => {
    mockResolveSessionId.mockReturnValue('prev-session-123');

    const task = makeTask({ session: 'continue' });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'prev-session-123',
      }),
    );
  });

  it('does not include sessionId in DispatchOpts when not resolved', async () => {
    mockResolveSessionId.mockReturnValue(undefined);

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    const callArgs = mockDriverDispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.sessionId).toBeUndefined();
  });

  it('passes appendSystemPrompt through DispatchOpts with trace prompt', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: '[TRACE] trace_id=ch-run-001-0-implement',
      }),
    );
  });

  it('does not map max_budget_usd to timeout — they have different semantics (AC #6)', async () => {
    const task = makeTask({ max_budget_usd: 5.0 });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    // max_budget_usd is a dollar cost cap, timeout is milliseconds — never mapped
    const callArgs = mockDriverDispatch.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.timeout).toBeUndefined();
  });

  it('passes sourceAccess=false when task.source_access is false (AC #7)', async () => {
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

    expect(mockDriverDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAccess: false,
        cwd: '/tmp/codeharness-verify-run-001',
      }),
    );
  });

  it('does not import or call dispatchAgent (AC #8)', async () => {
    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    // dispatchAgent should NOT be called — dispatch goes through driver
    expect(mockDispatchAgent).not.toHaveBeenCalled();
    // getDriver + driver.dispatch should be used instead
    expect(mockGetDriver).toHaveBeenCalled();
    expect(mockDriverDispatch).toHaveBeenCalled();
  });

  it('loop block dispatches through driver identically to sequential tasks (AC #9)', async () => {
    const dispatches: string[] = [];
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      dispatches.push(opts.prompt);
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 1, failed: 0, unknown: 0, total: 1 },
          findings: [],
        }), 'sess-v');
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

    // Both retry and verify should go through driver.dispatch
    // +1 for health check (deduped to 1 call for claude-code default)
    expect(mockGetDriver).toHaveBeenCalledTimes(3);
    expect(mockDriverDispatch).toHaveBeenCalledTimes(2);
    // Verify prompts are correct
    expect(dispatches[0]).toContain('retry');
    expect(dispatches[1]).toContain('Verify the epic');
  });

  it('retry prompts from evaluator findings pass through DispatchOpts.prompt (AC #9)', async () => {
    let callCount = 0;
    const dispatches: string[] = [];

    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      callCount++;
      dispatches.push(opts.prompt);
      if (opts.prompt.includes('Verify the epic')) {
        if (callCount <= 2) {
          return makeDriverStream(JSON.stringify({
            verdict: 'fail',
            score: { passed: 1, failed: 1, unknown: 0, total: 2 },
            findings: [
              {
                ac: 1,
                description: 'Test suite failed',
                status: 'fail',
                evidence: { commands_run: ['npm run build'], output_observed: 'ERR', reasoning: 'Build broken' },
              },
              {
                ac: 2,
                description: 'Coverage met',
                status: 'pass',
                evidence: { commands_run: ['npm run test'], output_observed: 'OK', reasoning: 'Coverage fine' },
              },
            ],
          }), 'sess-v');
        }
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 2, failed: 0, unknown: 0, total: 2 },
          findings: [],
        }), 'sess-v');
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

    // Second retry prompt should contain findings from the failed verify
    const secondRetryPrompt = dispatches[2]; // [0]=retry, [1]=verify(fail), [2]=retry(with findings)
    expect(secondRetryPrompt).toContain('Retry story 3-1-foo');
    expect(secondRetryPrompt).toContain('AC #1 (FAIL)');
    expect(secondRetryPrompt).toContain('Test suite failed');
  });
});

// --- Story 13-3: Cross-Framework Workflow Execution ---

describe('output contract writing (story 13-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  /**
   * Helper: create a driver stream that includes tool events for Write/Edit.
   */
  function makeDriverStreamWithTools(output: string, sessionId: string, tools?: Array<{ name: string; input: string }>) {
    return (async function* () {
      if (tools) {
        for (const tool of tools) {
          yield { type: 'tool-start' as const, name: tool.name, id: `tool-${tool.name}` };
          yield { type: 'tool-input' as const, partial: tool.input };
          yield { type: 'tool-complete' as const };
        }
      }
      if (output) {
        yield { type: 'text' as const, text: output };
      }
      yield {
        type: 'result' as const,
        cost: 0.05,
        sessionId,
      };
    })();
  }

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
      { name: 'Read', input: '{"file_path": "/src/baz.ts"}' }, // not a write tool
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

  it('write failure is caught and logged, contract is null (AC #8)', async () => {
    mockWriteOutputContract.mockImplementation(() => {
      throw new Error('disk full');
    });

    const task = makeTask();
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    // Should not throw
    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('failed to write output contract'),
    );
  });

  it('sequential flow passes contract from task N to task N+1 via previousOutputContract (AC #2, #3)', async () => {
    // Track calls to buildPromptWithContractContext
    const contractCalls: Array<OutputContract | null> = [];
    mockBuildPromptWithContractContext.mockImplementation((basePrompt: string, contract: OutputContract | null) => {
      contractCalls.push(contract);
      return basePrompt;
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
      },
    });

    // Flow: [create-story, implement] — both per-story
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

    // First task (create-story) gets null contract
    expect(contractCalls[0]).toBeNull();
    // Second task (implement) gets the contract from create-story
    expect(contractCalls[1]).not.toBeNull();
    expect(contractCalls[1]?.taskName).toBe('create-story');
  });

  it('first task in flow gets null as previousOutputContract (AC #6)', async () => {
    const contractCalls: Array<OutputContract | null> = [];
    mockBuildPromptWithContractContext.mockImplementation((basePrompt: string, contract: OutputContract | null) => {
      contractCalls.push(contract);
      return basePrompt;
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
      },
    });

    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      }),
    });

    await runWorkflowActor(config);

    expect(contractCalls[0]).toBeNull();
  });

  it('loop block passes contract between tasks within an iteration (AC #4)', async () => {
    const contractCalls: Array<{ prompt: string; contract: OutputContract | null }> = [];
    mockBuildPromptWithContractContext.mockImplementation((basePrompt: string, contract: OutputContract | null) => {
      contractCalls.push({ prompt: basePrompt, contract });
      return basePrompt;
    });

    // First verify call: pass verdict so loop exits
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 1, failed: 0, unknown: 0, total: 1 },
          findings: [],
        }), 'sess-v');
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

    // retry is first in loop — gets null (or initial contract)
    // verify should get the contract from retry
    expect(contractCalls.length).toBeGreaterThanOrEqual(2);
    // verify's contract should be from retry task
    const verifyCall = contractCalls.find((c) => c.prompt.includes('Verify the epic'));
    expect(verifyCall).toBeDefined();
    expect(verifyCall!.contract).not.toBeNull();
    expect(verifyCall!.contract?.taskName).toBe('retry');
  });

  it('loop block carries contract across iterations (AC #4)', async () => {
    const contractCalls: Array<{ prompt: string; contract: OutputContract | null }> = [];
    mockBuildPromptWithContractContext.mockImplementation((basePrompt: string, contract: OutputContract | null) => {
      contractCalls.push({ prompt: basePrompt, contract });
      return basePrompt;
    });

    let verifyCallCount = 0;
    mockDriverDispatch.mockImplementation((opts: { prompt: string }) => {
      if (opts.prompt.includes('Verify the epic')) {
        verifyCallCount++;
        if (verifyCallCount === 1) {
          return makeDriverStream(JSON.stringify({
            verdict: 'fail',
            score: { passed: 0, failed: 1, unknown: 0, total: 1 },
            findings: [{ ac: 1, description: 'Test', status: 'fail', evidence: { commands_run: [], output_observed: '', reasoning: 'failed' } }],
          }), 'sess-v');
        }
        return makeDriverStream(JSON.stringify({
          verdict: 'pass',
          score: { passed: 1, failed: 0, unknown: 0, total: 1 },
          findings: [],
        }), 'sess-v');
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

    // Iteration 2, retry task should receive the contract from iteration 1's verify task
    // Calls: [retry(null), verify(retry-contract), retry(verify-contract), verify(retry2-contract)]
    expect(contractCalls.length).toBeGreaterThanOrEqual(4);
    // Third call is iteration 2's retry — should have contract from verify
    const iter2RetryCall = contractCalls[2];
    expect(iter2RetryCall.contract).not.toBeNull();
    expect(iter2RetryCall.contract?.taskName).toBe('verify');
  });

  it('write failure still allows next task to get null contract (graceful degradation, AC #8)', async () => {
    mockWriteOutputContract.mockImplementation(() => {
      throw new Error('disk full');
    });

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

    const result = await runWorkflowActor(config);

    // Workflow still completes despite contract write failure
    expect(result.success).toBe(true);
    // Second task gets null because write failed
    expect(contractCalls[1]).toBeNull();
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

  it('3-step sequential flow passes contracts through all steps (AC #3)', async () => {
    const contractCalls: Array<{ prompt: string; contract: OutputContract | null }> = [];
    mockBuildPromptWithContractContext.mockImplementation((basePrompt: string, contract: OutputContract | null) => {
      contractCalls.push({ prompt: basePrompt, contract });
      return basePrompt;
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    // Flow: [create-story, implement, verify] — create-story and implement per-story, verify per-run
    const config = makeConfig({
      workflow: makeWorkflow({
        tasks: {
          'create-story': makeTask(),
          implement: makeTask(),
          verify: makeTask(),
        },
        flow: ['create-story', 'implement', 'verify'],
      epicTasks: ['verify'],
      }),
    });

    await runWorkflowActor(config);

    // create-story gets null (first task)
    expect(contractCalls[0].contract).toBeNull();
    // implement gets contract from create-story
    expect(contractCalls[1].contract).not.toBeNull();
    expect(contractCalls[1].contract?.taskName).toBe('create-story');
    // verify gets contract from implement
    expect(contractCalls[2].contract).not.toBeNull();
    expect(contractCalls[2].contract?.taskName).toBe('implement');
  });
});

// --- Story 16-4: Verify Flag Propagation ---

describe('propagateVerifyFlags (story 16-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  function makeContract(overrides?: Partial<OutputContract>): OutputContract {
    return {
      version: 1,
      taskName: 'implement',
      storyId: '5-1-foo',
      driver: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      timestamp: '2026-04-03T00:00:00.000Z',
      cost_usd: 0.05,
      duration_ms: 1000,
      changedFiles: [],
      testResults: null,
      output: 'Done',
      acceptanceCriteria: [],
      ...overrides,
    };
  }

  /**
   * Helper: set up the driver to return a stream whose output contract
   * will have a specific taskName (via the engine's internal contract builder).
   * The propagation function reads from the contract built by the engine,
   * which always has testResults: null — but we override readStateWithBody
   * to verify that propagateVerifyFlags is called correctly.
   *
   * Since the engine builds contracts with testResults: null, we need to
   * intercept the writeOutputContract call to inject testResults into the
   * contract that gets returned from dispatchTaskWithResult.
   */

  it('AC#1: implement task with null testResults does not trigger propagation', async () => {
    // Override writeOutputContract to capture and inject testResults
    let capturedContract: OutputContract | null = null;
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      capturedContract = contract;
    });

    // The engine builds contracts with testResults: null.
    // propagateVerifyFlags reads the contract returned by dispatchTaskWithResult.
    // Since testResults is always null in engine-built contracts, we need to
    // test propagateVerifyFlags through dispatchTask by making the engine
    // actually produce a contract with testResults.
    //
    // But the engine hardcodes testResults: null. The propagation logic
    // operates on whatever contract the engine builds. So for now, the
    // production path won't trigger until testResults parsing is added.
    //
    // Test strategy: call dispatchTask with task named 'implement',
    // verify that writeState is NOT called (since testResults is null).
    // Then test the actual propagation logic by directly testing state writes
    // when the mock returns contracts with testResults.

    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    // Engine-built contracts have testResults: null, so no propagation should occur
    expect(mockWriteState).not.toHaveBeenCalled();
  });

  it('AC#3: implement task with testResults: null does not change any flags', async () => {
    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    // testResults is null in engine-built contracts → no state writes
    expect(mockWriteState).not.toHaveBeenCalled();
  });

  it('AC#7: non-implement task does not trigger flag propagation', async () => {
    await dispatchTask(
      makeTask({ source_access: false }),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockWriteState).not.toHaveBeenCalled();
  });

  // --- Direct propagation logic tests via runWorkflowActor with mocked contracts ---
  // These tests verify the propagation logic by intercepting the contract construction

  it('AC#1,#2: sets both tests_passed and coverage_met when both conditions met', async () => {
    // Intercept writeOutputContract to inject testResults into the contract
    // We modify the contract object in-place so propagateVerifyFlags sees it
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      // Mutate the contract to add testResults (the engine builds mutable objects
      // despite the readonly interface — the object literal is not frozen)
      (contract as Record<string, unknown>).testResults = {
        passed: 10,
        failed: 0,
        coverage: 95,
      };
    });

    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    // propagateVerifyFlags should have been called with the mutated contract
    expect(mockReadStateWithBody).toHaveBeenCalledWith('/project');
    expect(mockWriteState).toHaveBeenCalledTimes(1);

    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    expect(writtenState.session_flags.coverage_met).toBe(true);
  });

  it('AC#4: implement task with failed > 0 does NOT set tests_passed', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 8,
        failed: 2,
        coverage: 95,
      };
    });

    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(false);
    expect(writtenState.session_flags.coverage_met).toBe(true);
  });

  it('AC#5: implement task with coverage < target does NOT set coverage_met', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 10,
        failed: 0,
        coverage: 50,
      };
    });

    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    expect(writtenState.session_flags.coverage_met).toBe(false);
  });

  it('AC#8: testResults.coverage = null does not set coverage_met', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 10,
        failed: 0,
        coverage: null,
      };
    });

    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    expect(writtenState.session_flags.coverage_met).toBe(false);
  });

  it('AC#7b: verify task with testResults still does not trigger flag propagation', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 10,
        failed: 0,
        coverage: 95,
      };
    });

    await dispatchTask(
      makeTask({ source_access: false }),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    // verify task should NOT trigger flag propagation regardless of contract contents
    expect(mockWriteState).not.toHaveBeenCalled();
  });

  it('AC#1,#2: both flags set in single state write when both conditions met', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 15,
        failed: 0,
        coverage: 80, // exactly meets target
      };
    });

    await dispatchTask(
      makeTask(),
      'implement',
      '5-1-foo',
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    // Single write with both flags
    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    expect(writtenState.session_flags.coverage_met).toBe(true);
  });

  it('gracefully handles state file not found', async () => {
    mockReadStateWithBody.mockImplementation(() => {
      throw new Error('State file not found');
    });

    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 10,
        failed: 0,
        coverage: 95,
      };
    });

    // Should not throw — flag propagation is best-effort
    await expect(
      dispatchTask(
        makeTask(),
        'implement',
        '5-1-foo',
        makeDefinition(),
        makeDefaultState(),
        makeConfig(),
      ),
    ).resolves.not.toThrow();

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('flag propagation failed'),
    );
  });
});

// --- Story 16-5: Coverage Deduplication ---

describe('buildCoverageDeduplicationContext (story 16-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeContract(overrides?: Partial<OutputContract>): OutputContract {
    return {
      version: 1,
      taskName: 'implement',
      storyId: '5-1-foo',
      driver: 'claude-code',
      model: 'claude-sonnet-4-20250514',
      timestamp: '2026-04-03T00:00:00.000Z',
      cost_usd: 0.05,
      duration_ms: 1000,
      changedFiles: [],
      testResults: null,
      output: 'Done',
      acceptanceCriteria: [],
      ...overrides,
    };
  }

  it('AC#1: returns coverage context string when coverage_met is true and contract has coverage', () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        session_flags: { coverage_met: true, tests_passed: true, logs_queried: false, verification_run: false },
        coverage: { target: 90, baseline: null, current: 95, tool: 'c8' },
      },
      body: '',
    });

    const contract = makeContract({
      testResults: { passed: 10, failed: 0, coverage: 95 },
    });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBe('Coverage already verified by engine: 95% (target: 90%). No re-run needed.');
  });

  it('AC#2: returns null when coverage_met is false', () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        session_flags: { coverage_met: false, tests_passed: true, logs_queried: false, verification_run: false },
        coverage: { target: 90, baseline: null, current: 80, tool: 'c8' },
      },
      body: '',
    });

    const contract = makeContract({
      testResults: { passed: 10, failed: 0, coverage: 80 },
    });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBeNull();
  });

  it('AC#3: returns null when contract has testResults: null', () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        session_flags: { coverage_met: true, tests_passed: true, logs_queried: false, verification_run: false },
        coverage: { target: 90, baseline: null, current: 95, tool: 'c8' },
      },
      body: '',
    });

    const contract = makeContract({ testResults: null });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBeNull();
  });

  it('AC#3: returns null when contract is null', () => {
    const result = buildCoverageDeduplicationContext(null, '/project');
    expect(result).toBeNull();
    // readStateWithBody should not even be called
    expect(mockReadStateWithBody).not.toHaveBeenCalled();
  });

  it('AC#4: returns null when coverage_met is false even with valid contract coverage', () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        session_flags: { coverage_met: false, tests_passed: true, logs_queried: false, verification_run: false },
        coverage: { target: 90, baseline: null, current: 50, tool: 'c8' },
      },
      body: '',
    });

    const contract = makeContract({
      testResults: { passed: 10, failed: 0, coverage: 50 },
    });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBeNull();
  });

  it('returns null when testResults.coverage is null', () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        session_flags: { coverage_met: true, tests_passed: true, logs_queried: false, verification_run: false },
        coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      },
      body: '',
    });

    const contract = makeContract({
      testResults: { passed: 10, failed: 0, coverage: null },
    });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBeNull();
  });

  it('gracefully returns null when state is unreadable', () => {
    mockReadStateWithBody.mockImplementation(() => {
      throw new Error('State file not found');
    });

    const contract = makeContract({
      testResults: { passed: 10, failed: 0, coverage: 95 },
    });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBeNull();
  });

  it('uses default target of 90 when state.coverage.target is null', () => {
    mockReadStateWithBody.mockReturnValue({
      state: {
        session_flags: { coverage_met: true, tests_passed: true, logs_queried: false, verification_run: false },
        coverage: { target: null, baseline: null, current: 95, tool: 'c8' },
      },
      body: '',
    });

    const contract = makeContract({
      testResults: { passed: 10, failed: 0, coverage: 95 },
    });

    const result = buildCoverageDeduplicationContext(contract, '/project');
    expect(result).toBe('Coverage already verified by engine: 95% (target: 90%). No re-run needed.');
  });
});

describe('coverage deduplication in dispatchTask (story 16-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('AC#1,#6: appends coverage context to prompt when coverage_met is true', async () => {
    // Make state have coverage_met = true
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

    // Contract with test results
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

    // The driver should have been called with a prompt that includes the coverage context
    const driverDispatchCalls = mockGetDriver().dispatch.mock?.calls;
    expect(driverDispatchCalls).toBeDefined();
    expect(driverDispatchCalls!.length).toBeGreaterThan(0);
    const opts = driverDispatchCalls![0][0];
    expect(opts.prompt).toContain('Coverage already verified by engine: 95% (target: 90%). No re-run needed.');
  });

  it('AC#2: does NOT append coverage context when coverage_met is false', async () => {
    // Default mocks have coverage_met = false
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

    // The driver prompt should NOT contain coverage dedup context
    const driverDispatchCalls = mockGetDriver().dispatch.mock?.calls;
    expect(driverDispatchCalls).toBeDefined();
    expect(driverDispatchCalls!.length).toBeGreaterThan(0);
    const opts = driverDispatchCalls![0][0];
    expect(opts.prompt).not.toContain('Coverage already verified by engine');
  });
});
