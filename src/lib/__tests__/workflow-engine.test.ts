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
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

vi.mock('yaml', () => ({
  parse: mockParse,
}));

import {
  executeWorkflow,
  loadWorkItems,
  dispatchTask,
} from '../workflow-engine.js';
import type {
  EngineConfig,
  WorkItem,
} from '../workflow-engine.js';
import type { WorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';

// --- Helpers ---

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
    scope: 'per-story',
    session: 'fresh',
    source_access: true,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  return {
    workflow: {
      tasks: {
        implement: makeTask(),
        verify: makeTask({ scope: 'per-run', source_access: false }),
      },
      flow: ['implement', 'verify'],
    },
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
    expect(mockDispatchAgent).toHaveBeenCalledWith(
      definition,
      'Implement story 5-1-foo',
      expect.objectContaining({
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
    expect(mockDispatchAgent).toHaveBeenCalledWith(
      definition,
      expect.any(String),
      expect.objectContaining({ sessionId: 'prev-sess-id' }),
    );
  });

  it('dispatches with cwd when source_access is true (default) (AC #10)', async () => {
    const task = makeTask({ source_access: true });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig({ projectDir: '/my-project' });

    await dispatchTask(task, 'implement', '5-1-foo', definition, state, config);

    expect(mockCreateIsolatedWorkspace).not.toHaveBeenCalled();
    expect(mockDispatchAgent).toHaveBeenCalledWith(
      definition,
      expect.any(String),
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
    expect(mockDispatchAgent).toHaveBeenCalledWith(
      definition,
      expect.any(String),
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
    mockDispatchAgent.mockResolvedValue({
      sessionId: '',
      success: true,
      durationMs: 100,
      output: 'ok',
    });

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
    mockDispatchAgent.mockRejectedValue(new Error('dispatch failed'));

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
    const task = makeTask({ scope: 'per-run' });
    const definition = makeDefinition();
    const state = makeDefaultState();
    const config = makeConfig();

    await dispatchTask(task, 'verify', '__run__', definition, state, config);

    expect(mockDispatchAgent).toHaveBeenCalledWith(
      definition,
      'Execute task "verify" for the current run.',
      expect.any(Object),
    );
  });
});

describe('executeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('executes flow steps sequentially in order (AC #2)', async () => {
    const callOrder: string[] = [];
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        callOrder.push(prompt);
        return { sessionId: 'sess-1', success: true, durationMs: 100, output: 'ok' };
      },
    );

    // Two stories, flow: [implement, verify]
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig();
    const result = await executeWorkflow(config);

    expect(result.success).toBe(true);
    // implement dispatched for each story, then verify once
    expect(callOrder).toEqual([
      'Implement story 3-1-foo',
      'Implement story 3-2-bar',
      'Execute task "verify" for the current run.',
    ]);
  });

  it('dispatches per-story task once per story (AC #3)', async () => {
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(mockDispatchAgent).toHaveBeenCalledTimes(2);
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
      workflow: {
        tasks: { verify: makeTask({ scope: 'per-run' }) },
        flow: ['verify'],
      },
    });

    const result = await executeWorkflow(config);

    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('writes state after each task completion (AC #4)', async () => {
    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
      },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    await executeWorkflow(config);

    // writeWorkflowState called: initial state + after dispatch + final completed state
    expect(mockWriteWorkflowState).toHaveBeenCalledTimes(3);
  });

  it('skips loop blocks with warning (AC #8)', async () => {
    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement', { loop: ['implement'] }],
      },
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const result = await executeWorkflow(config);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('loop blocks are not yet implemented'),
    );
    // Only the string task should have dispatched
    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('handles DispatchError and records in result (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('rate limited', 'UNKNOWN', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN');
    expect(result.errors[0].taskName).toBe('implement');
    expect(result.errors[0].storyKey).toBe('3-1-foo');
  });

  it('halts on RATE_LIMIT dispatch errors (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    // Should halt after first error — only one dispatch attempted
    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
  });

  it('continues on UNKNOWN errors for per-story tasks (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;
    mockDispatchAgent.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new DispatchError('unknown error', 'UNKNOWN', 'dev', new Error('inner'));
      }
      return { sessionId: 'sess-1', success: true, durationMs: 100, output: 'ok' };
    });

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    const result = await executeWorkflow(config);

    // Both stories attempted
    expect(mockDispatchAgent).toHaveBeenCalledTimes(2);
    expect(result.errors).toHaveLength(1);
    expect(result.tasksCompleted).toBe(1);
  });

  it('sets phase to error on dispatch failure', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('fail', 'UNKNOWN', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    await executeWorkflow(config);

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
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    await executeWorkflow(config);

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
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    await executeWorkflow(config);

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
      workflow: {
        tasks: {
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: ['verify'],
      },
    });

    await executeWorkflow(config);

    expect(mockCreateIsolatedWorkspace).toHaveBeenCalled();
    expect(mockWorkspace.cleanup).toHaveBeenCalled();
  });

  it('does NOT invoke source isolation for source_access true tasks', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask({ source_access: true }) },
        flow: ['implement'],
      },
    });

    await executeWorkflow(config);

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
      workflow: {
        tasks: {
          implement: makeTask(),
          verify: makeTask({ scope: 'per-run' }),
        },
        flow: ['implement', 'verify'],
      },
    });

    const result = await executeWorkflow(config);

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
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    expect(result.storiesProcessed).toBe(0);
  });

  it('skips tasks with missing agent definition', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask({ agent: 'nonexistent' }) },
        flow: ['implement'],
      },
      agents: {}, // no agents
    });

    const result = await executeWorkflow(config);

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('agent'));
    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
  });

  it('records error checkpoint in state on dispatch failure (AC #13)', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('fail', 'UNKNOWN', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    await executeWorkflow(config);

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
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          implement: makeTask(),
          verify: makeTask({ scope: 'per-run' }),
        },
        flow: ['implement', 'verify'],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    // Should halt after implement fails — verify should NOT run
    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].taskName).toBe('implement');
  });

  it('handles non-DispatchError exceptions in dispatch', async () => {
    mockDispatchAgent.mockRejectedValue('string error');

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('UNKNOWN');
    expect(result.errors[0].message).toBe('string error');
  });

  it('skips tasks not found in workflow tasks definition', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: { implement: makeTask() },
        flow: ['nonexistent-task', 'implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('task "nonexistent-task" not found'),
    );
    // implement should still run
    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('halts on NETWORK dispatch errors for per-run tasks', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('network fail', 'NETWORK', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          implement: makeTask(),
          verify: makeTask({ scope: 'per-run' }),
        },
        flow: ['verify', 'implement'],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    // Should halt after verify fails — implement never runs
    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
  });
});
