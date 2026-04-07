import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted Mocks ---

const {
  mockGetDriver,
  mockReadWorkflowState,
  mockWriteWorkflowState,
  mockWarn,
  mockReadFileSync,
  mockExistsSync,
  mockParse,
  mockResolveModel,
  mockDriverDispatch,
  mockDispatchAgent,
  mockCreateIsolatedWorkspace,
  mockGenerateTraceId,
  mockFormatTracePrompt,
  mockRecordTraceId,
  mockResolveSessionId,
  mockRecordSessionId,
} = vi.hoisted(() => ({
  mockGetDriver: vi.fn(),
  mockReadWorkflowState: vi.fn(),
  mockWriteWorkflowState: vi.fn(),
  mockWarn: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockParse: vi.fn(),
  mockResolveModel: vi.fn(),
  mockDriverDispatch: vi.fn(),
  mockDispatchAgent: vi.fn(),
  mockCreateIsolatedWorkspace: vi.fn(),
  mockGenerateTraceId: vi.fn(),
  mockFormatTracePrompt: vi.fn(),
  mockRecordTraceId: vi.fn(),
  mockResolveSessionId: vi.fn(),
  mockRecordSessionId: vi.fn(),
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

vi.mock('../workflow-persistence.js', () => ({ saveSnapshot: vi.fn(), loadSnapshot: vi.fn(() => null), clearSnapshot: vi.fn(), computeConfigHash: vi.fn(() => 'test-hash'), clearAllPersistence: vi.fn(() => ({ snapshotCleared: false, checkpointCleared: false })), cleanStaleTmpFiles: vi.fn(), clearCheckpointLog: vi.fn(), loadCheckpointLog: vi.fn(() => []) }));

vi.mock('../output.js', () => ({
  warn: mockWarn,
  info: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

vi.mock('yaml', () => ({
  parse: mockParse,
}));

import { checkDriverHealth, runWorkflowActor } from '../workflow-runner.js';
import type { EngineConfig } from '../workflow-types.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { DriverHealth } from '../agents/types.js';

// --- Helpers ---

const defaultExecution: ExecutionConfig = {
  max_parallel: 1,
  isolation: 'none',
  merge_strategy: 'merge-commit',
  epic_strategy: 'sequential',
  story_strategy: 'sequential',
};

function makeWorkflow(partial: { tasks: Record<string, ResolvedTask>; flow: (string | { loop: string[] })[] }): ResolvedWorkflow {
  return {
    ...partial,
    execution: defaultExecution,
    storyFlow: partial.flow,
    epicFlow: ['story_flow'],
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

function makeMockDriver(name: string, health: DriverHealth) {
  return {
    name,
    defaultModel: 'test-model',
    capabilities: { supportsPlugins: false, supportsStreaming: true, costReporting: true, costTier: 1 },
    healthCheck: vi.fn().mockResolvedValue(health),
    dispatch: vi.fn(),
    getLastCost: vi.fn().mockReturnValue(null),
  };
}

function makeHealthy(): DriverHealth {
  return { available: true, authenticated: true, version: '1.0.0' };
}

function makeUnhealthy(error: string): DriverHealth {
  return { available: false, authenticated: false, version: null, error };
}

// --- Tests ---

describe('checkDriverHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds when a single driver passes health check', async () => {
    const workflow = makeWorkflow({
      tasks: { implement: makeTask({ driver: 'claude-code' }) },
      flow: ['implement'],
    });

    const driver = makeMockDriver('claude-code', makeHealthy());
    mockGetDriver.mockReturnValue(driver);

    await expect(checkDriverHealth(workflow)).resolves.toBeUndefined();
    expect(driver.healthCheck).toHaveBeenCalledOnce();
  });

  it('succeeds when multiple unique drivers all pass', async () => {
    const workflow = makeWorkflow({
      tasks: {
        implement: makeTask({ driver: 'claude-code' }),
        codexTask: makeTask({ driver: 'codex' }),
      },
      flow: ['implement', 'codexTask'],
    });

    const claudeDriver = makeMockDriver('claude-code', makeHealthy());
    const codexDriver = makeMockDriver('codex', makeHealthy());
    mockGetDriver.mockImplementation((name: string) => {
      if (name === 'claude-code') return claudeDriver;
      if (name === 'codex') return codexDriver;
      throw new Error(`Unknown driver: ${name}`);
    });

    await expect(checkDriverHealth(workflow)).resolves.toBeUndefined();
    expect(claudeDriver.healthCheck).toHaveBeenCalledOnce();
    expect(codexDriver.healthCheck).toHaveBeenCalledOnce();
  });

  it('deduplicates drivers — healthCheck called once per unique driver', async () => {
    const workflow = makeWorkflow({
      tasks: {
        task1: makeTask({ driver: 'claude-code' }),
        task2: makeTask({ driver: 'claude-code' }),
        task3: makeTask({ driver: 'claude-code' }),
      },
      flow: ['task1', 'task2', 'task3'],
    });

    const driver = makeMockDriver('claude-code', makeHealthy());
    mockGetDriver.mockReturnValue(driver);

    await expect(checkDriverHealth(workflow)).resolves.toBeUndefined();
    expect(mockGetDriver).toHaveBeenCalledTimes(1);
    expect(driver.healthCheck).toHaveBeenCalledOnce();
  });

  it('throws when one driver fails, listing the failing driver and error', async () => {
    const workflow = makeWorkflow({
      tasks: {
        implement: makeTask({ driver: 'claude-code' }),
        codexTask: makeTask({ driver: 'codex' }),
      },
      flow: ['implement', 'codexTask'],
    });

    const claudeDriver = makeMockDriver('claude-code', makeHealthy());
    const codexDriver = makeMockDriver('codex', makeUnhealthy('codex CLI not found'));
    mockGetDriver.mockImplementation((name: string) => {
      if (name === 'claude-code') return claudeDriver;
      if (name === 'codex') return codexDriver;
      throw new Error(`Unknown driver: ${name}`);
    });

    const err = await checkDriverHealth(workflow).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('Driver health check failed');
    expect((err as Error).message).toContain('codex: codex CLI not found');
  });

  it('throws listing ALL failing drivers when multiple fail', async () => {
    const workflow = makeWorkflow({
      tasks: {
        task1: makeTask({ driver: 'claude-code' }),
        task2: makeTask({ driver: 'codex' }),
        task3: makeTask({ driver: 'opencode' }),
      },
      flow: ['task1', 'task2', 'task3'],
    });

    const claudeDriver = makeMockDriver('claude-code', makeUnhealthy('claude not found'));
    const codexDriver = makeMockDriver('codex', makeUnhealthy('codex not found'));
    const opencodeDriver = makeMockDriver('opencode', makeHealthy());
    mockGetDriver.mockImplementation((name: string) => {
      if (name === 'claude-code') return claudeDriver;
      if (name === 'codex') return codexDriver;
      if (name === 'opencode') return opencodeDriver;
      throw new Error(`Unknown driver: ${name}`);
    });

    try {
      await checkDriverHealth(workflow);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      const message = (err as Error).message;
      expect(message).toContain('claude-code: claude not found');
      expect(message).toContain('codex: codex not found');
    }
  });

  it('defaults to claude-code when task has no driver field', async () => {
    const workflow = makeWorkflow({
      tasks: {
        task1: makeTask(), // no driver field — defaults to claude-code
        task2: makeTask(), // also no driver field
      },
      flow: ['task1', 'task2'],
    });

    const driver = makeMockDriver('claude-code', makeHealthy());
    mockGetDriver.mockReturnValue(driver);

    await expect(checkDriverHealth(workflow)).resolves.toBeUndefined();
    expect(mockGetDriver).toHaveBeenCalledTimes(1);
    expect(mockGetDriver).toHaveBeenCalledWith('claude-code');
    expect(driver.healthCheck).toHaveBeenCalledOnce();
  });

  it('throws on timeout when health check hangs', async () => {
    const workflow = makeWorkflow({
      tasks: { implement: makeTask({ driver: 'claude-code' }) },
      flow: ['implement'],
    });

    const hangingDriver = {
      name: 'claude-code',
      defaultModel: 'test-model',
      capabilities: { supportsPlugins: false, supportsStreaming: true, costReporting: true, costTier: 1 },
      // Resolves after 200ms — longer than the 50ms timeout we'll pass
      healthCheck: vi.fn().mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(makeHealthy()), 200);
      })),
      dispatch: vi.fn(),
      getLastCost: vi.fn().mockReturnValue(null),
    };
    mockGetDriver.mockReturnValue(hangingDriver);

    // Use a very short timeout (50ms) to test the timeout path without fake timers.
    // 4x margin (200ms vs 50ms) provides reliable assertion even under CI load.
    await expect(checkDriverHealth(workflow, 50)).rejects.toThrow('Driver health check timed out');
  });

  it('timeout error reports only drivers that did not respond', async () => {
    const workflow = makeWorkflow({
      tasks: {
        task1: makeTask({ driver: 'fast-driver' }),
        task2: makeTask({ driver: 'slow-driver' }),
      },
      flow: ['task1', 'task2'],
    });

    // fast-driver resolves instantly; slow-driver hangs
    const fastDriver = {
      name: 'fast-driver',
      defaultModel: 'test-model',
      capabilities: { supportsPlugins: false, supportsStreaming: true, costReporting: true, costTier: 1 },
      healthCheck: vi.fn().mockResolvedValue(makeHealthy()),
      dispatch: vi.fn(),
      getLastCost: vi.fn().mockReturnValue(null),
    };
    const slowDriver = {
      name: 'slow-driver',
      defaultModel: 'test-model',
      capabilities: { supportsPlugins: false, supportsStreaming: true, costReporting: true, costTier: 1 },
      healthCheck: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
      dispatch: vi.fn(),
      getLastCost: vi.fn().mockReturnValue(null),
    };

    mockGetDriver.mockImplementation((name: string) => {
      if (name === 'fast-driver') return fastDriver;
      if (name === 'slow-driver') return slowDriver;
      throw new Error(`Unknown driver: ${name}`);
    });

    const err = await checkDriverHealth(workflow, 50).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    // Should mention the slow driver that didn't respond
    expect((err as Error).message).toContain('slow-driver');
  });
});

describe('runWorkflowActor — health check integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('skips health checks for completed workflows', async () => {
    mockReadWorkflowState.mockReturnValue({
      workflow_name: '',
      started: '',
      iteration: 0,
      phase: 'completed',
      tasks_completed: [],
      evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    });

    const config: EngineConfig = {
      workflow: makeWorkflow({
        tasks: { implement: makeTask({ driver: 'claude-code' }) },
        flow: ['implement'],
      }),
      agents: { dev: { name: 'dev', model: 'test', instructions: '', disallowedTools: [], bare: true } },
      sprintStatusPath: '/tmp/sprint-status.yaml',
      runId: 'test-run',
      projectDir: '/tmp/test',
    };

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(true);
    expect(result.tasksCompleted).toBe(0);
    // getDriver should NOT have been called (no health check)
    expect(mockGetDriver).not.toHaveBeenCalled();
  });

  it('aborts with success=false when health check fails', async () => {
    mockReadWorkflowState.mockReturnValue({
      workflow_name: '',
      started: '',
      iteration: 0,
      phase: 'idle',
      tasks_completed: [],
      evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    });

    const failingDriver = makeMockDriver('claude-code', makeUnhealthy('CLI not found'));
    mockGetDriver.mockReturnValue(failingDriver);

    const config: EngineConfig = {
      workflow: makeWorkflow({
        tasks: { implement: makeTask({ driver: 'claude-code' }) },
        flow: ['implement'],
      }),
      agents: { dev: { name: 'dev', model: 'test', instructions: '', disallowedTools: [], bare: true } },
      sprintStatusPath: '/tmp/sprint-status.yaml',
      runId: 'test-run',
      projectDir: '/tmp/test',
    };

    const result = await runWorkflowActor(config);

    expect(result.success).toBe(false);
    expect(result.tasksCompleted).toBe(0);
    expect(result.storiesProcessed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('HEALTH_CHECK');
    expect(result.errors[0].message).toContain('CLI not found');

    // Verify state was written as 'failed'
    const writeStateCalls = mockWriteWorkflowState.mock.calls;
    const lastState = writeStateCalls[writeStateCalls.length - 1][0];
    expect(lastState.phase).toBe('failed');
  });

  it('proceeds normally when all health checks pass', async () => {
    mockReadWorkflowState.mockReturnValue({
      workflow_name: '',
      started: '',
      iteration: 0,
      phase: 'idle',
      tasks_completed: [],
      evaluator_scores: [],
      circuit_breaker: { triggered: false, reason: null, score_history: [] },
      trace_ids: [],
    });

    const healthyDriver = makeMockDriver('claude-code', makeHealthy());
    // Make dispatch return a valid stream for actual task execution
    healthyDriver.dispatch.mockReturnValue((async function* () {
      yield { type: 'text' as const, text: 'done' };
      yield { type: 'result' as const, cost: 0.01, sessionId: 'sess-1' };
    })());
    mockGetDriver.mockReturnValue(healthyDriver);
    mockResolveModel.mockReturnValue('test-model');
    mockGenerateTraceId.mockReturnValue('trace-1');
    mockFormatTracePrompt.mockReturnValue('');
    mockResolveSessionId.mockReturnValue(null);
    mockRecordTraceId.mockImplementation((_, s) => s);
    mockRecordSessionId.mockImplementation((_, __, s) => s);

    // Provide a story so the epic loop has something to process
    mockExistsSync.mockReturnValue(true);
    mockParse.mockReturnValue({ development_status: { '1-1-test': 'backlog' } });

    const config: EngineConfig = {
      workflow: {
        tasks: { implement: makeTask({ driver: 'claude-code' }) },
        flow: ['implement'],
        execution: defaultExecution,
        storyFlow: ['implement'],
        epicFlow: ['story_flow'],
      },
      agents: { dev: { name: 'dev', model: 'test', instructions: '', disallowedTools: [], bare: true } },
      sprintStatusPath: '/tmp/sprint-status.yaml',
      runId: 'test-run',
      projectDir: '/tmp/test',
    };

    const result = await runWorkflowActor(config);

    // Health check should have been called
    expect(healthyDriver.healthCheck).toHaveBeenCalledOnce();
    // Workflow should have proceeded (dispatch was called for epic-level task)
    expect(healthyDriver.dispatch).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
