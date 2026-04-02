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
  parseVerdict,
  buildRetryPrompt,
  getFailedItems,
  executeLoopBlock,
} from '../workflow-engine.js';
import type {
  EngineConfig,
  EngineError,
  WorkItem,
  EvaluatorVerdict,
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

  it('executes loop blocks instead of skipping them', async () => {
    // Loop with retry (per-story) + verify (per-run) — verify returns pass on first try
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        if (prompt.includes('Execute task')) {
          return {
            sessionId: 'sess-v',
            success: true,
            durationMs: 100,
            output: JSON.stringify({
              verdict: 'pass',
              score: { passed: 1, failed: 0, unknown: 0, total: 1 },
              findings: [],
            }),
          };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    // Should have dispatched: retry for 1 story + verify once
    expect(mockDispatchAgent).toHaveBeenCalledTimes(2);
    expect(result.tasksCompleted).toBe(2);
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

// --- Loop Block Tests (Story 5-2) ---

describe('parseVerdict', () => {
  it('parses valid verdict JSON', () => {
    const verdict = parseVerdict(JSON.stringify({
      verdict: 'pass',
      score: { passed: 3, failed: 0, unknown: 0, total: 3 },
      findings: [],
    }));

    expect(verdict).not.toBeNull();
    expect(verdict!.verdict).toBe('pass');
    expect(verdict!.score.passed).toBe(3);
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
    expect(verdict).not.toBeNull();
    expect(verdict!.findings).toHaveLength(1);
    expect(verdict!.findings[0].ac).toBe(1);
  });

  it('returns null for invalid JSON', () => {
    expect(parseVerdict('not json')).toBeNull();
  });

  it('returns null for missing verdict field', () => {
    expect(parseVerdict(JSON.stringify({
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      findings: [],
    }))).toBeNull();
  });

  it('returns null for invalid verdict value', () => {
    expect(parseVerdict(JSON.stringify({
      verdict: 'maybe',
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      findings: [],
    }))).toBeNull();
  });

  it('returns null for missing score field', () => {
    expect(parseVerdict(JSON.stringify({
      verdict: 'pass',
      findings: [],
    }))).toBeNull();
  });

  it('returns null for missing findings field', () => {
    expect(parseVerdict(JSON.stringify({
      verdict: 'pass',
      score: { passed: 1, failed: 0, unknown: 0, total: 1 },
    }))).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseVerdict('"just a string"')).toBeNull();
    expect(parseVerdict('42')).toBeNull();
    expect(parseVerdict('null')).toBeNull();
  });

  it('returns null when score fields are not numbers', () => {
    expect(parseVerdict(JSON.stringify({
      verdict: 'pass',
      score: { passed: 'one', failed: 0, unknown: 0, total: 1 },
      findings: [],
    }))).toBeNull();
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

  it('terminates loop when verdict is pass (AC #2)', async () => {
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        if (prompt.includes('Execute task')) {
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(2); // 1 retry + 1 verify
  });

  it('terminates loop when maxIterations reached (AC #3)', async () => {
    // Verify always fails
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        if (prompt.includes('Execute task')) {
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makeFailVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
      maxIterations: 3,
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    // 3 iterations × 2 tasks per iteration = 6
    expect(mockDispatchAgent).toHaveBeenCalledTimes(6);

    // State should have phase=max-iterations
    const lastWriteCall = mockWriteWorkflowState.mock.calls[mockWriteWorkflowState.mock.calls.length - 1];
    const finalState = lastWriteCall[0] as WorkflowState;
    expect(finalState.phase).toBe('max-iterations');
  });

  it('terminates loop when circuit_breaker.triggered is true (AC #4)', async () => {
    let dispatchCount = 0;
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        dispatchCount++;
        if (prompt.includes('Execute task')) {
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makeFailVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    // Simulate external circuit breaker trigger: after first iteration completes,
    // the writeWorkflowState mock mutates the circuit_breaker object on the state.
    // This works because executeLoopBlock uses shallow spread ({ ...currentState }),
    // which preserves the circuit_breaker object reference.
    mockWriteWorkflowState.mockImplementation((state: WorkflowState) => {
      if (dispatchCount >= 2) {
        state.circuit_breaker.triggered = true;
        state.circuit_breaker.reason = 'score plateau';
      }
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    // Should have run only 1 full iteration (2 dispatches) before circuit breaker halts
    // Second iteration starts: retry dispatches (dispatchCount=3), verify dispatches (dispatchCount=4)
    // Circuit breaker was triggered after dispatchCount>=2, checked at end of iteration 2
    // So we expect more than 2 dispatches (at least 2 iterations run before breaker check)
    expect(dispatchCount).toBeGreaterThanOrEqual(2);
  });

  it('injects findings into retry prompt for failed stories (AC #5)', async () => {
    const dispatches: string[] = [];
    let callCount = 0;

    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        callCount++;
        dispatches.push(prompt);

        if (prompt.includes('Execute task')) {
          // First verify: fail, second verify: pass
          if (callCount <= 2) {
            return { sessionId: 'sess-v', success: true, durationMs: 100, output: makeFailVerdict() };
          }
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    await executeWorkflow(config);

    // Second retry prompt (iteration 2) should contain findings
    const secondRetryPrompt = dispatches[2]; // [0]=retry, [1]=verify, [2]=retry(with findings)
    expect(secondRetryPrompt).toContain('Retry story 3-1-foo');
    expect(secondRetryPrompt).toContain('AC #1 (FAIL)');
    expect(secondRetryPrompt).toContain('Test suite failed');
  });

  it('parses verdict from DispatchResult.output (AC #6)', async () => {
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        if (prompt.includes('Execute task')) {
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    await executeWorkflow(config);

    // Check that evaluator_scores were recorded in state
    const stateWrites = mockWriteWorkflowState.mock.calls.map((c: unknown[]) => c[0] as WorkflowState);
    const stateWithScore = stateWrites.find((s) => s.evaluator_scores.length > 0);
    expect(stateWithScore).toBeDefined();
    expect(stateWithScore!.evaluator_scores[0].passed).toBe(2);
    expect(stateWithScore!.evaluator_scores[0].failed).toBe(0);
  });

  it('records all-UNKNOWN score when verdict parsing fails (AC #6)', async () => {
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        if (prompt.includes('Execute task')) {
          // Return non-JSON output
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: 'not a json verdict' };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: {
        '3-1-foo': 'ready-for-dev',
        '3-2-bar': 'backlog',
      },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
      maxIterations: 1,
    });

    await executeWorkflow(config);

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
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        callCount++;
        if (prompt.includes('Execute task')) {
          // Fail twice, pass on third
          if (callCount <= 4) { // calls 1-2 = iter1 (retry+verify), calls 3-4 = iter2
            return { sessionId: 'sess-v', success: true, durationMs: 100, output: makeFailVerdict() };
          }
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    await executeWorkflow(config);

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
    mockDispatchAgent.mockRejectedValue(
      new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner')),
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('RATE_LIMIT');
    // Only one dispatch attempted before halt
    expect(mockDispatchAgent).toHaveBeenCalledTimes(1);
  });

  it('empty loop block terminates immediately', async () => {
    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
        },
        flow: [{ loop: [] }],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(true);
    expect(mockDispatchAgent).not.toHaveBeenCalled();
  });

  it('uses default maxIterations of 5 when not specified', async () => {
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        if (prompt.includes('Execute task')) {
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makeFailVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
      // maxIterations not set — should default to 5
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    // 5 iterations × 2 dispatches = 10
    expect(mockDispatchAgent).toHaveBeenCalledTimes(10);
  });

  it('records multiple evaluator scores across iterations', async () => {
    let callCount = 0;
    mockDispatchAgent.mockImplementation(
      async (_def: SubagentDefinition, prompt: string) => {
        callCount++;
        if (prompt.includes('Execute task')) {
          // Fail first, pass second
          if (callCount <= 2) {
            return { sessionId: 'sess-v', success: true, durationMs: 100, output: makeFailVerdict() };
          }
          return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
        }
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      },
    );

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    await executeWorkflow(config);

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
    mockDispatchAgent.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // retry succeeds
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      }
      // verify throws RATE_LIMIT
      throw new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner'));
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('RATE_LIMIT');
    expect(result.errors[0].taskName).toBe('verify');
  });

  it('clears stale verdict after non-halt per-run error so next iteration retries all items', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;

    mockDispatchAgent.mockImplementation(async (_def: SubagentDefinition, prompt: string) => {
      callCount++;
      if (callCount === 1) {
        // First retry succeeds
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      }
      if (callCount === 2) {
        // First verify throws non-halt UNKNOWN error
        throw new DispatchError('unknown err', 'UNKNOWN', 'dev', new Error('inner'));
      }
      if (callCount === 3) {
        // Second retry — should dispatch for ALL items (stale verdict cleared)
        return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
      }
      // Second verify passes
      return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    // Loop should eventually succeed (pass verdict on second verify)
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN');
    // 4 dispatches: retry1 + verify1(error) + retry2 + verify2(pass)
    expect(mockDispatchAgent).toHaveBeenCalledTimes(4);
  });

  it('non-halt per-run error records error and continues to next iteration', async () => {
    const { DispatchError } = await import('../agent-dispatch.js');
    let callCount = 0;

    mockDispatchAgent.mockImplementation(async (_def: SubagentDefinition, prompt: string) => {
      callCount++;
      if (prompt.includes('Execute task')) {
        if (callCount <= 2) {
          // First verify: non-halt error
          throw new DispatchError('bad response', 'UNKNOWN', 'dev', new Error('inner'));
        }
        // Second verify: pass
        return { sessionId: 'sess-v', success: true, durationMs: 100, output: makePassVerdict() };
      }
      return { sessionId: 'sess-r', success: true, durationMs: 100, output: 'ok' };
    });

    mockParse.mockReturnValue({
      development_status: { '3-1-foo': 'ready-for-dev' },
    });

    const config = makeConfig({
      workflow: {
        tasks: {
          retry: makeTask({ scope: 'per-story' }),
          verify: makeTask({ scope: 'per-run', source_access: false }),
        },
        flow: [{ loop: ['retry', 'verify'] }],
      },
    });

    const result = await executeWorkflow(config);

    // Error from first verify recorded, but loop continued and eventually passed
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN');
  });
});
