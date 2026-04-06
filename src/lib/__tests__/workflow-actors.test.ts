/**
 * Tests for workflow-actors module.
 *
 * Covers: propagateVerifyFlags (story 16-4), buildCoverageDeduplicationContext (story 16-5),
 *         dispatchTaskCore dispatch events / source isolation / error classification / contract output (story 23-1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCoverageDeduplicationContext, dispatchTaskCore, nullTaskCore } from '../workflow-actors.js';
import { dispatchTask } from '../workflow-machines.js';
import { PER_RUN_SENTINEL } from '../workflow-compiler.js';
import { WorkflowError } from '../workflow-types.js';
import type { EngineConfig, WorkItem, NullTaskInput } from '../workflow-types.js';
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
  mockGetPendingAcceptanceCriteria,
  mockGetNullTask,
  mockListNullTasks,
  mockParseTestOutput,
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
  mockGetPendingAcceptanceCriteria: vi.fn().mockReturnValue([]),
  mockGetNullTask: vi.fn(),
  mockListNullTasks: vi.fn(),
  mockParseTestOutput: vi.fn(),
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

vi.mock('../workflow-persistence.js', () => ({ saveSnapshot: vi.fn(), loadSnapshot: vi.fn(() => null), clearSnapshot: vi.fn(), computeConfigHash: vi.fn(() => 'test-hash') }));

vi.mock('../workflow-contracts.js', () => ({
  getPendingAcceptanceCriteria: mockGetPendingAcceptanceCriteria,
}));

vi.mock('../null-task-registry.js', () => ({
  getNullTask: mockGetNullTask,
  listNullTasks: mockListNullTasks,
  registerNullTask: vi.fn(),
  clearNullTaskRegistry: vi.fn(),
}));

vi.mock('../cross-worktree-validator.js', () => ({
  parseTestOutput: mockParseTestOutput,
}));

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

  mockParseTestOutput.mockReturnValue({ passed: 0, failed: 0, coverage: null });

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
      makeTask(),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockWriteState).not.toHaveBeenCalled();
  });

  it('AC#1,#2: sets both tests_passed and coverage_met when both conditions met', async () => {
    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: 95 });

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
    mockParseTestOutput.mockReturnValue({ passed: 8, failed: 2, coverage: 95 });

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
    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: 50 });

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
    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: null });

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
    // parseTestOutput is only called for 'implement'; verify task skips it
    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: 95 });

    await dispatchTask(
      makeTask(),
      'verify',
      PER_RUN_SENTINEL,
      makeDefinition(),
      makeDefaultState(),
      makeConfig(),
    );

    expect(mockWriteState).not.toHaveBeenCalled();
  });

  it('AC#1,#2: both flags set in single state write when both conditions met', async () => {
    mockParseTestOutput.mockReturnValue({ passed: 15, failed: 0, coverage: 80 });

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

    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: 95 });

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

// ─── story 23-1: dispatchTaskCore ────────────────────────────────────

describe('dispatchTaskCore (story 23-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockGetPendingAcceptanceCriteria.mockReturnValue([]);
  });

  function makeDispatchInput(overrides?: object) {
    return {
      task: makeTask(),
      taskName: 'implement',
      storyKey: '5-1-foo',
      definition: makeDefinition(),
      config: makeConfig(),
      workflowState: makeDefaultState(),
      previousContract: null,
      ...overrides,
    };
  }

  // AC1: dispatch-start event contains taskName and driverName
  it('AC1: emits dispatch-start event with taskName and driverName', async () => {
    const events: object[] = [];
    const config = makeConfig({ onEvent: (e) => events.push(e) });

    await dispatchTaskCore({ ...makeDispatchInput(), config });

    const startEvent = events.find((e) => (e as { type: string }).type === 'dispatch-start');
    expect(startEvent).toBeDefined();
    expect(startEvent).toMatchObject({ type: 'dispatch-start', taskName: 'implement', driverName: 'claude-code' });
  });

  // AC2: dispatch-end event contains taskName, elapsedMs, costUsd
  it('AC2: emits dispatch-end event with taskName, elapsedMs, and costUsd', async () => {
    const events: object[] = [];
    const config = makeConfig({ onEvent: (e) => events.push(e) });

    await dispatchTaskCore({ ...makeDispatchInput(), config });

    const endEvent = events.find((e) => (e as { type: string }).type === 'dispatch-end') as Record<string, unknown> | undefined;
    expect(endEvent).toBeDefined();
    expect(endEvent?.taskName).toBe('implement');
    expect(typeof endEvent?.elapsedMs).toBe('number');
    expect(endEvent?.costUsd).toBe(0.05);
  });

  // AC3: source_access=false creates isolated workspace and cleans it up
  it('AC3: creates isolated workspace when source_access=false and cleans up after dispatch', async () => {
    const mockWorkspace = {
      toDispatchOptions: vi.fn().mockReturnValue({ cwd: '/isolated/ws-001' }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateIsolatedWorkspace.mockResolvedValue(mockWorkspace);
    mockDriverDispatch.mockImplementation(() => makeDriverStream('done', 'sess-isolated'));

    const task = makeTask({ source_access: false });
    await dispatchTaskCore({ ...makeDispatchInput(), task });

    expect(mockCreateIsolatedWorkspace).toHaveBeenCalledTimes(1);
    expect(mockWorkspace.cleanup).toHaveBeenCalledTimes(1);
  });

  // AC4: source_access=true (default) uses project root
  it('AC4: uses projectDir when source_access is true', async () => {
    const dispatchOptsSpy = vi.fn();
    mockDriverDispatch.mockImplementation((opts: { cwd?: string }) => {
      dispatchOptsSpy(opts);
      return makeDriverStream('done', 'sess-001');
    });

    await dispatchTaskCore(makeDispatchInput());

    expect(mockCreateIsolatedWorkspace).not.toHaveBeenCalled();
    expect(dispatchOptsSpy).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/project' }));
  });

  it('AC7: passes config.abortSignal through to driver dispatch', async () => {
    const dispatchOptsSpy = vi.fn();
    const abortController = new AbortController();
    mockDriverDispatch.mockImplementation((opts: { abortSignal?: AbortSignal }) => {
      dispatchOptsSpy(opts);
      return makeDriverStream('done', 'sess-001');
    });

    await dispatchTaskCore(makeDispatchInput({ config: makeConfig({ abortSignal: abortController.signal }) }));

    expect(dispatchOptsSpy).toHaveBeenCalledWith(expect.objectContaining({ abortSignal: abortController.signal }));
  });

  // AC5: contract written with all required fields
  it('AC5: writes output contract with all required fields', async () => {
    let capturedContract: Record<string, unknown> | null = null;
    mockWriteOutputContract.mockImplementation((contract: Record<string, unknown>) => {
      capturedContract = { ...contract };
    });

    await dispatchTaskCore(makeDispatchInput());

    expect(capturedContract).not.toBeNull();
    const requiredFields = ['taskName', 'storyId', 'driver', 'model', 'timestamp', 'cost_usd', 'duration_ms', 'changedFiles', 'output'];
    for (const field of requiredFields) {
      expect(capturedContract).toHaveProperty(field);
    }
    expect(capturedContract?.taskName).toBe('implement');
    expect(capturedContract?.storyId).toBe('5-1-foo');
    expect(capturedContract?.driver).toBe('claude-code');
  });

  // AC6: driver errors are classified into typed codes
  it('AC6: RATE_LIMIT category maps to RATE_LIMIT DispatchError code', async () => {
    mockDriverDispatch.mockImplementation(() =>
      (async function* () {
        yield { type: 'result' as const, cost: 0, sessionId: '', error: 'rate limited', errorCategory: 'RATE_LIMIT' };
      })(),
    );

    await expect(dispatchTaskCore(makeDispatchInput())).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('AC6: NETWORK category maps to NETWORK DispatchError code', async () => {
    mockDriverDispatch.mockImplementation(() =>
      (async function* () {
        yield { type: 'result' as const, cost: 0, sessionId: '', error: 'network error', errorCategory: 'NETWORK' };
      })(),
    );

    await expect(dispatchTaskCore(makeDispatchInput())).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('AC6: SDK_INIT category maps to SDK_INIT DispatchError code', async () => {
    mockDriverDispatch.mockImplementation(() =>
      (async function* () {
        yield { type: 'result' as const, cost: 0, sessionId: '', error: 'sdk init failed', errorCategory: 'SDK_INIT' };
      })(),
    );

    await expect(dispatchTaskCore(makeDispatchInput())).rejects.toMatchObject({ code: 'SDK_INIT' });
  });

  it('AC6: AUTH category maps to UNKNOWN DispatchError code', async () => {
    mockDriverDispatch.mockImplementation(() =>
      (async function* () {
        yield { type: 'result' as const, cost: 0, sessionId: '', error: 'auth error', errorCategory: 'AUTH' };
      })(),
    );

    await expect(dispatchTaskCore(makeDispatchInput())).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('AC6: unknown error category maps to UNKNOWN DispatchError code', async () => {
    mockDriverDispatch.mockImplementation(() =>
      (async function* () {
        yield { type: 'result' as const, cost: 0, sessionId: '', error: 'something exploded', errorCategory: undefined };
      })(),
    );

    await expect(dispatchTaskCore(makeDispatchInput())).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  // AC12: workflow state tasks_completed has entry for completed task
  it('AC12: updatedState.tasks_completed contains entry for the dispatched task', async () => {
    mockRecordSessionId.mockImplementation(
      (key: { taskName: string; storyKey: string }, sessionId: string, state: WorkflowState) => ({
        ...state,
        tasks_completed: [
          ...state.tasks_completed,
          { task_name: key.taskName, story_key: key.storyKey, completed_at: '2026-04-05T00:00:00.000Z', session_id: sessionId },
        ],
      }),
    );

    const result = await dispatchTaskCore(makeDispatchInput());

    const completedEntry = result.updatedState.tasks_completed.find((t) => t.task_name === 'implement');
    expect(completedEntry).toBeDefined();
    expect(completedEntry).toMatchObject({ task_name: 'implement', story_key: '5-1-foo' });
    expect(completedEntry?.completed_at).toBeTruthy();
  });

  // T6: XState actor wrappers export typed actors
  it('T6: dispatchActor, nullTaskActor, and nullTaskDispatchActor are exported as XState actors', async () => {
    const { dispatchActor, nullTaskActor, nullTaskDispatchActor } = await import('../workflow-actors.js');
    expect(typeof dispatchActor).toBe('object');
    expect(typeof nullTaskActor).toBe('object');
    expect(typeof nullTaskDispatchActor).toBe('object');
    // XState fromPromise actors have a .type property
    expect(dispatchActor).toHaveProperty('config');
    expect(nullTaskActor).toHaveProperty('config');
    expect(nullTaskDispatchActor).toHaveProperty('config');
    expect(nullTaskDispatchActor).toBe(nullTaskActor);
  });
});

// ─── story 23-2: nullTaskCore ─────────────────────────────────────────

describe('nullTaskCore (story 23-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockGetNullTask.mockReturnValue(undefined);
    mockListNullTasks.mockReturnValue([]);
  });

  function makeNullTaskInput(overrides?: Partial<NullTaskInput>): NullTaskInput {
    return {
      task: makeTask({ agent: null }),
      taskName: 'telemetry',
      storyKey: '5-1-foo',
      config: makeConfig(),
      workflowState: makeDefaultState({ started: new Date().toISOString() }),
      previousContract: null,
      accumulatedCostUsd: 0,
      ...overrides,
    };
  }

  // T5/AC1: no dispatch-start or dispatch-end events emitted
  it('T5/AC1: does not emit dispatch-start or dispatch-end events', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'done' }));
    const events: object[] = [];
    const config = makeConfig({ onEvent: (e) => events.push(e) });
    await nullTaskCore({ ...makeNullTaskInput(), config });

    const types = events.map((e) => (e as { type: string }).type);
    expect(types).not.toContain('dispatch-start');
    expect(types).not.toContain('dispatch-end');
  });

  // T3/AC2: contract file written with driver=engine, model=null, cost_usd=0
  it('T3/AC2: calls writeOutputContract with driver=engine, model=null, cost_usd=0', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'telemetry done' }));
    let capturedContract: Record<string, unknown> | null = null;
    mockWriteOutputContract.mockImplementation((contract: Record<string, unknown>) => {
      capturedContract = { ...contract };
    });

    await nullTaskCore(makeNullTaskInput());

    expect(mockWriteOutputContract).toHaveBeenCalledTimes(1);
    expect(capturedContract).not.toBeNull();
    expect(capturedContract?.driver).toBe('engine');
    expect(capturedContract?.model).toBe('null');
    expect(capturedContract?.cost_usd).toBe(0);
    expect(capturedContract?.changedFiles).toEqual([]);
    expect(typeof capturedContract?.duration_ms).toBe('number');
    expect(capturedContract?.taskName).toBe('telemetry');
    expect(capturedContract?.storyId).toBe('5-1-foo');
  });

  it('T3/AC2b: returns the persisted null-task contract in DispatchOutput', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'telemetry done' }));

    const result = await nullTaskCore(makeNullTaskInput());

    expect(result.contract).toMatchObject({
      taskName: 'telemetry',
      storyId: '5-1-foo',
      driver: 'engine',
      model: 'null',
      cost_usd: 0,
      output: 'telemetry done',
    });
  });

  // T4/AC3: checkpoint written to workflow state
  it('T4/AC3: writes workflow state with task checkpoint', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'done' }));

    await nullTaskCore(makeNullTaskInput());

    expect(mockWriteWorkflowState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteWorkflowState.mock.calls[0][0] as WorkflowState;
    const checkpoint = writtenState.tasks_completed.find((t) => t.task_name === 'telemetry');
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.story_key).toBe('5-1-foo');
    expect(checkpoint?.completed_at).toBeTruthy();
  });

  // T2/AC4: NULL_TASK_NOT_FOUND when handler not registered
  it('T2/AC4: throws NULL_TASK_NOT_FOUND when handler not registered', async () => {
    mockGetNullTask.mockReturnValue(undefined);
    mockListNullTasks.mockReturnValue(['telemetry', 'other-task']);

    await expect(nullTaskCore(makeNullTaskInput({ taskName: 'unknown-null-task' }))).rejects.toMatchObject({
      code: 'NULL_TASK_NOT_FOUND',
      taskName: 'unknown-null-task',
    });
  });

  it('T2/AC4: NULL_TASK_NOT_FOUND message includes registered handler names', async () => {
    mockGetNullTask.mockReturnValue(undefined);
    mockListNullTasks.mockReturnValue(['telemetry', 'bookkeeping']);

    await expect(nullTaskCore(makeNullTaskInput({ taskName: 'unknown-null-task' }))).rejects.toMatchObject({
      code: 'NULL_TASK_NOT_FOUND',
      message: expect.stringContaining('telemetry'),
    });
  });

  // T2/AC5: NULL_TASK_FAILED when handler returns success=false
  it('T2/AC5: throws NULL_TASK_FAILED when handler returns success=false', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: false, output: 'handler failed output' }));

    await expect(nullTaskCore(makeNullTaskInput())).rejects.toMatchObject({
      code: 'NULL_TASK_FAILED',
      taskName: 'telemetry',
    });
  });

  it('T2/AC5: NULL_TASK_FAILED message includes handler output when available', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: false, output: 'specific failure reason' }));

    await expect(nullTaskCore(makeNullTaskInput())).rejects.toMatchObject({
      code: 'NULL_TASK_FAILED',
      message: expect.stringContaining('specific failure reason'),
    });
  });

  // T2/AC6: NULL_TASK_HANDLER_ERROR when handler throws
  it('T2/AC6: throws NULL_TASK_HANDLER_ERROR when handler throws an exception', async () => {
    mockGetNullTask.mockReturnValue(async () => { throw new Error('handler exploded'); });

    await expect(nullTaskCore(makeNullTaskInput())).rejects.toMatchObject({
      code: 'NULL_TASK_HANDLER_ERROR',
      taskName: 'telemetry',
      message: expect.stringContaining('handler exploded'),
    });
  });

  // AC8: cost is 0 in returned DispatchOutput
  it('AC8: returns DispatchOutput with cost=0 and changedFiles=[], sessionId=""', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'done' }));

    const result = await nullTaskCore(makeNullTaskInput());

    expect(result.cost).toBe(0);
    expect(result.changedFiles).toEqual([]);
    expect(result.sessionId).toBe('');
  });

  // T5: does NOT call getDriver, resolveModel, createIsolatedWorkspace
  it('T5: does not call getDriver, resolveModel, or createIsolatedWorkspace', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'done' }));

    await nullTaskCore(makeNullTaskInput());

    expect(mockGetDriver).not.toHaveBeenCalled();
    expect(mockResolveModel).not.toHaveBeenCalled();
    expect(mockCreateIsolatedWorkspace).not.toHaveBeenCalled();
  });

  // contract chaining: previousContract passed to handler via TaskContext
  it('T6: previousContract is available in TaskContext.outputContract for contract chaining', async () => {
    const prevContract = makeContract({ taskName: 'implement', storyId: '5-1-foo' });
    let capturedCtx: unknown;
    mockGetNullTask.mockReturnValue(async (ctx: unknown) => {
      capturedCtx = ctx;
      return { success: true, output: 'done' };
    });

    await nullTaskCore(makeNullTaskInput({ previousContract: prevContract }));

    expect((capturedCtx as { outputContract: unknown }).outputContract).toEqual(prevContract);
  });

  // contract returned in DispatchOutput
  it('T3: contract returned in DispatchOutput has correct fields', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'telemetry output' }));

    const result = await nullTaskCore(makeNullTaskInput());

    expect(result.contract).not.toBeNull();
    expect(result.contract?.driver).toBe('engine');
    expect(result.contract?.model).toBe('null');
    expect(result.contract?.cost_usd).toBe(0);
    expect(result.contract?.output).toBe('telemetry output');
    expect(result.contract?.taskName).toBe('telemetry');
  });

  // error path: no checkpoint written on failure
  it('T4/AC5: does not write workflow state checkpoint on NULL_TASK_FAILED', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: false }));

    await expect(nullTaskCore(makeNullTaskInput())).rejects.toMatchObject({ code: 'NULL_TASK_FAILED' });
    expect(mockWriteWorkflowState).not.toHaveBeenCalled();
  });

  it('T4/AC6: does not write workflow state checkpoint on NULL_TASK_HANDLER_ERROR', async () => {
    mockGetNullTask.mockReturnValue(async () => { throw new Error('boom'); });

    await expect(nullTaskCore(makeNullTaskInput())).rejects.toMatchObject({ code: 'NULL_TASK_HANDLER_ERROR' });
    expect(mockWriteWorkflowState).not.toHaveBeenCalled();
  });

  // accumulatedCostUsd passed to TaskContext.cost
  it('T1: accumulatedCostUsd is passed to TaskContext.cost', async () => {
    let capturedCtx: unknown;
    mockGetNullTask.mockReturnValue(async (ctx: unknown) => {
      capturedCtx = ctx;
      return { success: true, output: 'done' };
    });

    await nullTaskCore(makeNullTaskInput({ accumulatedCostUsd: 1.23 }));

    expect((capturedCtx as { cost: number }).cost).toBe(1.23);
  });

  // story 23-4: WorkflowError instances (not plain objects)
  it('23-4: NULL_TASK_NOT_FOUND is a WorkflowError instance with stack trace', async () => {
    mockGetNullTask.mockReturnValue(undefined);
    mockListNullTasks.mockReturnValue([]);

    const rejection = await nullTaskCore(makeNullTaskInput({ taskName: 'missing-task' })).catch((e: unknown) => e);
    expect(rejection).toBeInstanceOf(WorkflowError);
    expect((rejection as WorkflowError).code).toBe('NULL_TASK_NOT_FOUND');
    expect((rejection as WorkflowError).stack).toBeTruthy();
  });

  it('23-4: NULL_TASK_FAILED is a WorkflowError instance with stack trace', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: false, output: 'failed' }));

    const rejection = await nullTaskCore(makeNullTaskInput()).catch((e: unknown) => e);
    expect(rejection).toBeInstanceOf(WorkflowError);
    expect((rejection as WorkflowError).code).toBe('NULL_TASK_FAILED');
    expect((rejection as WorkflowError).stack).toBeTruthy();
  });

  it('23-4: NULL_TASK_HANDLER_ERROR is a WorkflowError instance with stack trace', async () => {
    mockGetNullTask.mockReturnValue(async () => { throw new Error('crash'); });

    const rejection = await nullTaskCore(makeNullTaskInput()).catch((e: unknown) => e);
    expect(rejection).toBeInstanceOf(WorkflowError);
    expect((rejection as WorkflowError).code).toBe('NULL_TASK_HANDLER_ERROR');
    expect((rejection as WorkflowError).stack).toBeTruthy();
  });

  it('23-4: WorkflowError carries correct taskName and storyKey', async () => {
    mockGetNullTask.mockReturnValue(undefined);
    mockListNullTasks.mockReturnValue([]);

    const rejection = await nullTaskCore(makeNullTaskInput({ taskName: 'telemetry' })).catch((e: unknown) => e);
    expect(rejection).toBeInstanceOf(WorkflowError);
    expect((rejection as WorkflowError).taskName).toBe('telemetry');
    expect((rejection as WorkflowError).storyKey).toBe('5-1-foo');
  });
});

// ─── story 23-3: contract chaining & verify flag propagation ──────────

describe('contract chaining (story 23-3)', () => {
  function makeDispatchInput23(overrides?: object) {
    return {
      task: makeTask(),
      taskName: 'implement',
      storyKey: '5-1-foo',
      definition: makeDefinition(),
      config: makeConfig(),
      workflowState: makeDefaultState(),
      previousContract: null,
      ...overrides,
    };
  }

  function makeNullInput23(overrides?: Partial<NullTaskInput>): NullTaskInput {
    return {
      task: makeTask({ agent: null }),
      taskName: 'telemetry',
      storyKey: '5-1-foo',
      config: makeConfig(),
      workflowState: makeDefaultState({ started: new Date().toISOString() }),
      previousContract: null,
      accumulatedCostUsd: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockGetNullTask.mockReturnValue(undefined);
    mockListNullTasks.mockReturnValue([]);
  });

  // T1: sequential dispatch tasks pass previousContract from prior result
  it('T1: second dispatch task receives first task contract as previousContract', async () => {
    // First task — capture the contract it writes
    let firstContract: OutputContract | null = null;
    mockWriteOutputContract.mockImplementationOnce((contract: OutputContract) => {
      firstContract = { ...contract } as OutputContract;
    });

    const result1 = await dispatchTaskCore(makeDispatchInput23({ taskName: 'create-story' }));
    expect(result1.contract).not.toBeNull();

    // Reset call tracking for second task
    mockBuildPromptWithContractContext.mockClear();

    // Second task receives first task's contract as previousContract
    await dispatchTaskCore(makeDispatchInput23({
      taskName: 'implement',
      previousContract: result1.contract,
    }));

    expect(mockBuildPromptWithContractContext).toHaveBeenCalledWith(
      expect.any(String),
      result1.contract,
    );
    void firstContract; // used via result1.contract
  });

  // T2: null task contract chains to downstream dispatch task
  it('T2: null task contract flows to downstream dispatch task as previousContract', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'telemetry done' }));

    const nullResult = await nullTaskCore(makeNullInput23({ taskName: 'telemetry' }));

    expect(nullResult.contract).not.toBeNull();
    expect(nullResult.contract?.driver).toBe('engine');
    expect(nullResult.contract?.model).toBe('null');

    // Reset call tracking; next dispatch should receive null task contract
    mockBuildPromptWithContractContext.mockClear();

    await dispatchTaskCore(makeDispatchInput23({
      taskName: 'implement',
      previousContract: nullResult.contract,
    }));

    expect(mockBuildPromptWithContractContext).toHaveBeenCalledWith(
      expect.any(String),
      nullResult.contract,
    );
  });

  // T3: null task passes its previousContract as outputContract in TaskContext
  it('T3: null task propagates incoming previousContract to handler via TaskContext.outputContract', async () => {
    const prevContract = makeContract({ taskName: 'create-story', storyId: '5-1-foo' });
    let capturedCtx: unknown;
    mockGetNullTask.mockReturnValue(async (ctx: unknown) => {
      capturedCtx = ctx;
      return { success: true, output: 'done' };
    });

    await nullTaskCore(makeNullInput23({ previousContract: prevContract }));

    expect((capturedCtx as { outputContract: unknown }).outputContract).toEqual(prevContract);
  });

  // T7: dispatch with previousContract=null calls buildPromptWithContractContext with null
  it('T7: first task in chain calls buildPromptWithContractContext with null previousContract', async () => {
    await dispatchTaskCore(makeDispatchInput23({ previousContract: null }));

    expect(mockBuildPromptWithContractContext).toHaveBeenCalledWith(
      expect.any(String),
      null,
    );
  });

  // T8: contract timestamps are valid ISO strings for both dispatch and null tasks
  it('T8: contracts from dispatch and null tasks both have valid ISO timestamps', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'done' }));

    let dispatchTimestamp: string | undefined;
    mockWriteOutputContract.mockImplementationOnce((contract: OutputContract) => {
      dispatchTimestamp = contract.timestamp;
    });
    await dispatchTaskCore(makeDispatchInput23({ taskName: 'create-story' }));

    let nullTimestamp: string | undefined;
    mockWriteOutputContract.mockImplementationOnce((contract: OutputContract) => {
      nullTimestamp = contract.timestamp;
    });
    await nullTaskCore(makeNullInput23({ taskName: 'telemetry' }));

    expect(dispatchTimestamp).toBeDefined();
    expect(nullTimestamp).toBeDefined();
    expect(isNaN(new Date(dispatchTimestamp!).getTime())).toBe(false);
    expect(isNaN(new Date(nullTimestamp!).getTime())).toBe(false);
  });

  // T9: non-implement task does not trigger verify flag propagation
  it('T9: check task (non-implement) does not modify session_flags', async () => {
    // parseTestOutput is not called for non-implement tasks
    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: 95 });

    await dispatchTaskCore(makeDispatchInput23({ taskName: 'check' }));

    expect(mockWriteState).not.toHaveBeenCalled();
  });

  // T10: both contracts written to disk (dispatch and null)
  it('T10: writeOutputContract called once per dispatch task and once per null task', async () => {
    mockGetNullTask.mockReturnValue(async () => ({ success: true, output: 'done' }));

    await dispatchTaskCore(makeDispatchInput23({ taskName: 'create-story' }));
    await nullTaskCore(makeNullInput23({ taskName: 'telemetry' }));
    await dispatchTaskCore(makeDispatchInput23({ taskName: 'implement' }));

    expect(mockWriteOutputContract).toHaveBeenCalledTimes(3);
  });

  // AC5: implement task with passing tests sets both flags
  it('AC5: implement task with passed tests and coverage ≥ target sets tests_passed and coverage_met', async () => {
    mockParseTestOutput.mockReturnValue({ passed: 12, failed: 0, coverage: 95 });

    await dispatchTaskCore(makeDispatchInput23({ taskName: 'implement' }));

    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    expect(writtenState.session_flags.coverage_met).toBe(true);
  });

  // AC6: implement task with failed tests does NOT set tests_passed
  it('AC6: implement task with failed > 0 does not set tests_passed', async () => {
    mockParseTestOutput.mockReturnValue({ passed: 5, failed: 3, coverage: 90 });

    await dispatchTaskCore(makeDispatchInput23({ taskName: 'implement' }));

    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(false);
  });

  // AC7: implement task with null coverage does NOT set coverage_met
  it('AC7: implement task with null coverage does not set coverage_met', async () => {
    mockParseTestOutput.mockReturnValue({ passed: 10, failed: 0, coverage: null });

    await dispatchTaskCore(makeDispatchInput23({ taskName: 'implement' }));

    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    expect(writtenState.session_flags.coverage_met).toBe(false);
  });

  // AC8: non-implement task with test results does not modify session_flags
  it('AC8: check task does not modify session_flags even if parseTestOutput returns results', async () => {
    // parseTestOutput is not called for non-implement tasks, so session_flags stay untouched
    await dispatchTaskCore(makeDispatchInput23({ taskName: 'check' }));

    expect(mockWriteState).not.toHaveBeenCalled();
  });

  // AC10: tests_passed is set before verify could run
  it('AC10: implement task sets tests_passed before returning, so verify can observe it', async () => {
    mockParseTestOutput.mockReturnValue({ passed: 8, failed: 0, coverage: 85 });

    const result = await dispatchTaskCore(makeDispatchInput23({ taskName: 'implement' }));

    // Flag was written to state synchronously before dispatchTaskCore returned
    expect(mockWriteState).toHaveBeenCalledTimes(1);
    const writtenState = mockWriteState.mock.calls[0][0];
    expect(writtenState.session_flags.tests_passed).toBe(true);
    // The returned contract should also have testResults set
    expect(result.contract?.testResults).not.toBeNull();
    expect(result.contract?.testResults?.passed).toBe(8);
    expect(result.contract?.testResults?.failed).toBe(0);
  });
});
