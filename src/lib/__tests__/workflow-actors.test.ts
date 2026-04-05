/**
 * Tests for workflow-actors module.
 *
 * Covers: propagateVerifyFlags (story 16-4), buildCoverageDeduplicationContext (story 16-5).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCoverageDeduplicationContext } from '../workflow-actors.js';
import { dispatchTask } from '../workflow-machines.js';
import { PER_RUN_SENTINEL } from '../workflow-compiler.js';
import type { EngineConfig, WorkItem } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';
import type { OutputContract } from '../agents/types.js';

// ─── Hoisted Mocks ───────────────────────────────────────────────────

const {
  mockDriverDispatch,
  mockGetDriver,
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
  mockResolveModel,
  mockBuildPromptWithContractContext,
  mockWriteOutputContract,
  mockReadStateWithBody,
  mockWriteState,
} = vi.hoisted(() => ({
  mockDriverDispatch: vi.fn(),
  mockGetDriver: vi.fn(),
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
  mockResolveModel: vi.fn(),
  mockBuildPromptWithContractContext: vi.fn(),
  mockWriteOutputContract: vi.fn(),
  mockReadStateWithBody: vi.fn(),
  mockWriteState: vi.fn(),
}));

vi.mock('../agent-dispatch.js', () => ({
  dispatchAgent: vi.fn(),
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

function makeDriverStream(output: string, sessionId: string) {
  return (async function* () {
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

describe('propagateVerifyFlags (story 16-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('AC#1: implement task with null testResults does not trigger propagation', async () => {
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

  it('AC#1,#2: sets both tests_passed and coverage_met when both conditions met', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
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

    expect(mockWriteState).not.toHaveBeenCalled();
  });

  it('AC#1,#2: both flags set in single state write when both conditions met', async () => {
    mockWriteOutputContract.mockImplementation((contract: OutputContract) => {
      (contract as Record<string, unknown>).testResults = {
        passed: 15,
        failed: 0,
        coverage: 80,
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

describe('buildCoverageDeduplicationContext (story 16-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
