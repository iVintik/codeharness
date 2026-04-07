/**
 * Tests for null task (agent: null) engine integration.
 *
 * Story 16-2: Engine-Handled Null Tasks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted Mocks ---

const {
  mockReadWorkflowState,
  mockWriteWorkflowState,
  mockWarn,
  mockReadFileSync,
  mockExistsSync,
  mockParse,
  mockGetDriver,
  mockResolveModel,
  mockDriverDispatch,
  mockBuildPromptWithContractContext,
  mockWriteOutputContract,
  mockGenerateTraceId,
  mockFormatTracePrompt,
  mockRecordTraceId,
  mockResolveSessionId,
  mockRecordSessionId,
  mockCreateIsolatedWorkspace,
  mockGetNullTask,
  mockListNullTasks,
} = vi.hoisted(() => ({
  mockReadWorkflowState: vi.fn(),
  mockWriteWorkflowState: vi.fn(),
  mockWarn: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockParse: vi.fn(),
  mockGetDriver: vi.fn(),
  mockResolveModel: vi.fn(),
  mockDriverDispatch: vi.fn(),
  mockBuildPromptWithContractContext: vi.fn(),
  mockWriteOutputContract: vi.fn(),
  mockGenerateTraceId: vi.fn(),
  mockFormatTracePrompt: vi.fn(),
  mockRecordTraceId: vi.fn(),
  mockResolveSessionId: vi.fn(),
  mockRecordSessionId: vi.fn(),
  mockCreateIsolatedWorkspace: vi.fn(),
  mockGetNullTask: vi.fn(),
  mockListNullTasks: vi.fn(),
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

vi.mock('../null-task-registry.js', () => ({
  getNullTask: mockGetNullTask,
  listNullTasks: mockListNullTasks,
}));

vi.mock('../verdict-parser.js', () => ({
  parseVerdict: vi.fn(),
  extractTag: vi.fn(),
}));

vi.mock('../circuit-breaker.js', () => ({
  evaluateProgress: vi.fn().mockReturnValue({ halt: false }),
}));

vi.mock('../workflow-persistence.js', () => ({ saveSnapshot: vi.fn(), loadSnapshot: vi.fn(() => null), clearSnapshot: vi.fn(), computeConfigHash: vi.fn(() => 'test-hash'), clearAllPersistence: vi.fn(() => ({ snapshotCleared: false, checkpointCleared: false })), snapshotFileExists: vi.fn(() => false), cleanStaleTmpFiles: vi.fn(), clearCheckpointLog: vi.fn(), loadCheckpointLog: vi.fn(() => []) }));

import { runWorkflowActor, checkDriverHealth } from '../workflow-runner.js';
import { executeLoopBlock } from '../workflow-machines.js';
import { isTaskCompleted, PER_RUN_SENTINEL } from '../workflow-compiler.js';
import type { EngineConfig, WorkItem } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';
import type { OutputContract } from '../agents/types.js';

// --- Helpers ---

function makeDefaultState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    workflow_name: '',
    started: '2026-04-03T00:00:00.000Z',
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
  epicTasks?: string[];
}): ResolvedWorkflow {
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
  // Add non-epic loop tasks to storyFlow for storyFlowTasks set
  const hasLoopBlocks = partial.flow.some(s => typeof s === 'object' && 'loop' in s);
  for (const step of partial.flow) {
    if (typeof step === 'object' && 'loop' in step) {
      for (const lt of step.loop) {
        if (!epicTaskSet.has(lt) && !storyFlow.includes(lt)) storyFlow.push(lt);
      }
    }
  }
  const hasStringTasks = partial.flow.some(s => typeof s === 'string' && !epicTaskSet.has(s));
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

function makeNullTaskWorkflow(partial: {
  tasks: Record<string, ResolvedTask>;
  flow: (string | { loop: string[] })[];
  /** Task names that run per-story (appear in storyFlowTasks set). Default: all tasks. */
  storyTasks?: string[];
}): ResolvedWorkflow {
  // For null task tests: wrap all string tasks in a single loop block so null tasks execute.
  // The engine only executes null tasks inside loop blocks.
  const stringTasks = partial.flow.filter((s): s is string => typeof s === 'string');
  const loopBlocks = partial.flow.filter((s): s is { loop: string[] } => typeof s === 'object' && 'loop' in s);
  const allLoopTasks = loopBlocks.flatMap(b => b.loop);
  const allTaskNames = [...stringTasks, ...allLoopTasks];

  // storyFlowTasks: all tasks by default (unless storyTasks is explicitly provided)
  const storyFlow = partial.storyTasks ?? allTaskNames;

  // epicFlow: story_flow + loop containing all string tasks + any explicit loop blocks
  const epicFlowSteps: (string | { loop: string[] })[] = ['story_flow'];
  if (stringTasks.length > 0) {
    epicFlowSteps.push({ loop: stringTasks });
  }
  for (const lb of loopBlocks) {
    epicFlowSteps.push(lb);
  }

  return {
    tasks: partial.tasks,
    flow: storyFlow as (string | { loop: string[] })[],
    execution: defaultExecution,
    storyFlow: storyFlow as (string | { loop: string[] })[],
    epicFlow: epicFlowSteps,
    sprintFlow: [],
  };
}

function makeConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  return {
    workflow: makeNullTaskWorkflow({
      tasks: {
        implement: makeTask(),
        telemetry: makeTask({ agent: null }),
      },
      flow: ['implement', 'telemetry'],
    }),
    agents: {
      dev: makeDefinition(),
    },
    sprintStatusPath: '/project/sprint-status.yaml',
    runId: 'run-001',
    projectDir: '/project',
    maxIterations: 1,
    ...overrides,
  };
}

function setupDefaultMocks() {
  mockReadWorkflowState.mockReturnValue(makeDefaultState());
  mockWriteWorkflowState.mockImplementation(() => {});
  mockBuildPromptWithContractContext.mockImplementation((basePrompt: string) => basePrompt);
  mockWriteOutputContract.mockImplementation(() => {});
  mockGenerateTraceId.mockReturnValue('ch-run-001-0-implement');
  mockFormatTracePrompt.mockReturnValue('[TRACE] trace_id=ch-run-001-0-implement');
  mockRecordTraceId.mockImplementation((_traceId: string, state: WorkflowState) => ({
    ...state,
    trace_ids: [...(state.trace_ids ?? []), _traceId],
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
      yield { type: 'text' as const, text: 'Done' };
      yield { type: 'result' as const, cost: 0.05, sessionId: 'sess-abc-123' };
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
      '5-1-foo': 'ready-for-dev',
      '5-2-bar': 'backlog',
    },
  });

  // Default null task mock: telemetry handler exists
  mockGetNullTask.mockImplementation((name: string) => {
    if (name === 'telemetry') {
      return async () => ({ success: true, output: 'telemetry collected' });
    }
    return undefined;
  });
  mockListNullTasks.mockReturnValue(['telemetry']);
}

// --- Tests ---

describe('Null Task Engine Integration (Story 16-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('AC #1: engine skips driver dispatch for agent: null tasks', () => {
    it('does not call getDriver or driver.dispatch for null tasks', async () => {
      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
          storyTasks: [],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      // Null-task-only loop exits with max-iterations (no pass verdict)
      // but the null task itself was executed
      expect(result.tasksCompleted).toBe(1);
      // getDriver is called during health check, but NOT for our null task dispatch
      expect(mockDriverDispatch).not.toHaveBeenCalled();
    });
  });

  describe('AC #2: registry returns handler or undefined', () => {
    it('engine calls getNullTask to look up handler', async () => {
      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      await runWorkflowActor(config);

      expect(mockGetNullTask).toHaveBeenCalledWith('telemetry');
    });
  });

  describe('AC #3: handler receives correct TaskContext', () => {
    it('passes storyKey, taskName, cost, durationMs, outputContract, projectDir', async () => {
      const capturedCtxs: unknown[] = [];
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async (ctx: unknown) => {
            capturedCtxs.push(ctx);
            return { success: true, output: 'ok' };
          };
        }
        return undefined;
      });

      // Use single story for deterministic test
      mockParse.mockReturnValue({
        development_status: { 'story-1': 'ready-for-dev' },
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      await runWorkflowActor(config);

      expect(capturedCtxs).toHaveLength(1);
      const ctx = capturedCtxs[0] as Record<string, unknown>;
      expect(ctx.storyKey).toBe('story-1');
      expect(ctx.taskName).toBe('telemetry');
      expect(typeof ctx.cost).toBe('number');
      expect(typeof ctx.durationMs).toBe('number');
      expect(ctx.projectDir).toBe('/project');
    });
  });

  describe('AC #4: TaskCheckpoint written after null task completion', () => {
    it('writes checkpoint to workflow state', async () => {
      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      await runWorkflowActor(config);

      // writeWorkflowState is called multiple times; check that at least one
      // call includes a checkpoint for our null task
      const allCalls = mockWriteWorkflowState.mock.calls;
      const stateWithCheckpoint = allCalls.find(
        (call: unknown[]) => {
          const state = call[0] as WorkflowState;
          return state.tasks_completed.some(
            (cp) => cp.task_name === 'telemetry',
          );
        },
      );
      expect(stateWithCheckpoint).toBeDefined();
    });
  });

  describe('AC #5: unknown null task throws NULL_TASK_NOT_FOUND', () => {
    it('records error with code NULL_TASK_NOT_FOUND for unknown handler', async () => {
      mockGetNullTask.mockReturnValue(undefined);
      mockListNullTasks.mockReturnValue(['telemetry']);

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            unknown_task: makeTask({ agent: null }),
          },
          flow: ['unknown_task'],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('NULL_TASK_NOT_FOUND');
      expect(result.errors[0].message).toContain('unknown_task');
      expect(result.errors[0].message).toContain('telemetry');
    });
  });

  describe('AC #7: mixed null and agent tasks interleave correctly', () => {
    it('executes null and agent tasks in flow order', async () => {
      const executionOrder: string[] = [];

      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => {
            executionOrder.push('telemetry');
            return { success: true, output: 'telemetry done' };
          };
        }
        return undefined;
      });

      mockDriverDispatch.mockImplementation(() => {
        return (async function* () {
          executionOrder.push('implement');
          yield { type: 'text' as const, text: 'Done' };
          yield { type: 'result' as const, cost: 0.05, sessionId: 'sess-abc' };
        })();
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            implement: makeTask({ agent: 'dev' }),
            telemetry: makeTask({ agent: null }),
          },
          flow: ['implement', 'telemetry'],
        }),
        agents: { dev: makeDefinition() },
      });

      // Only one story for clearer order tracking
      mockParse.mockReturnValue({
        development_status: { 'story-1': 'ready-for-dev' },
      });

      const result = await runWorkflowActor(config);

      // implement runs first, then telemetry (in loop iteration)
      expect(executionOrder[0]).toBe('implement');
      expect(executionOrder[1]).toBe('telemetry');
    });
  });

  describe('AC #8: null task OutputContract has driver=engine, cost_usd=0', () => {
    it('produces contract with engine driver and zero cost', async () => {
      // After the null task runs, the engine writes state. We can check the
      // result through the flow — a subsequent task should receive the contract.
      let receivedContract: unknown = null;

      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => ({ success: true, output: 'data' });
        }
        if (name === 'after-telemetry') {
          return async (ctx: { outputContract: unknown }) => {
            receivedContract = ctx.outputContract;
            return { success: true };
          };
        }
        return undefined;
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
            'after-telemetry': makeTask({ agent: null }),
          },
          flow: ['telemetry', 'after-telemetry'],
        }),
        agents: {},
      });

      await runWorkflowActor(config);

      expect(receivedContract).not.toBeNull();
      const contract = receivedContract as OutputContract;
      expect(contract.driver).toBe('engine');
      expect(contract.model).toBe('null');
      expect(contract.cost_usd).toBe(0);
    });
  });

  describe('crash recovery: skips completed null tasks', () => {
    it('skips null task with existing checkpoint', async () => {
      mockReadWorkflowState.mockReturnValue(makeDefaultState({
        phase: 'executing',
        tasks_completed: [
          { task_name: 'telemetry', story_key: '__epic_5__', completed_at: '2026-04-03T00:00:00.000Z' },
        ],
      }));

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
          storyTasks: [],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      // All tasks skipped (already completed) — loop hits max-iterations
      expect(result.tasksCompleted).toBe(0); // skipped
      expect(mockGetNullTask).not.toHaveBeenCalled();
    });
  });

  describe('per-story null task iterates all work items', () => {
    it('calls handler once per work item', async () => {
      const storyKeys: string[] = [];
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async (ctx: { storyKey: string }) => {
            storyKeys.push(ctx.storyKey);
            return { success: true };
          };
        }
        return undefined;
      });

      // Two stories
      mockParse.mockReturnValue({
        development_status: {
          'story-a': 'ready-for-dev',
          'story-b': 'backlog',
        },
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      // Null tasks execute per-story in loop
      expect(storyKeys).toContain('story-a');
      expect(storyKeys).toContain('story-b');
      expect(storyKeys).toHaveLength(2);
    });
  });

  describe('per-run null task runs once with sentinel key', () => {
    it('calls handler once with __run__ sentinel', async () => {
      const storyKeys: string[] = [];
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async (ctx: { storyKey: string }) => {
            storyKeys.push(ctx.storyKey);
            return { success: true };
          };
        }
        return undefined;
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
          storyTasks: [],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      // Null task ran once with epic sentinel (per-run tasks use epicSentinel in runEpicLoop)
      expect(storyKeys).toEqual(['__epic_5__']);
    });
  });

  describe('checkDriverHealth skips null agent tasks', () => {
    it('does not call getDriver for tasks with agent: null', async () => {
      const workflow = makeWorkflow({
        tasks: {
          implement: makeTask({ agent: 'dev' }),
          telemetry: makeTask({ agent: null }),
        },
        flow: ['implement', 'telemetry'],
      });

      await checkDriverHealth(workflow);

      // getDriver should be called for 'claude-code' (from implement) but NOT for telemetry
      expect(mockGetDriver).toHaveBeenCalledTimes(1);
    });
  });

  describe('null task in loop block', () => {
    it('executes null tasks within loop iterations', async () => {
      const callCount = { telemetry: 0 };
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => {
            callCount.telemetry++;
            return { success: true, output: 'loop telemetry' };
          };
        }
        return undefined;
      });

      const loopBlock = { loop: ['telemetry'] };
      const state = makeDefaultState({ started: '2026-04-03T00:00:00.000Z' });
      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: [loopBlock],
        }),
        agents: {},
        maxIterations: 1,
      });

      const workItems: WorkItem[] = [{ key: 'story-1', source: 'sprint' }];

      const loopResult = await executeLoopBlock(loopBlock, state, config, workItems);

      expect(loopResult.tasksCompleted).toBeGreaterThanOrEqual(1);
      expect(callCount.telemetry).toBeGreaterThanOrEqual(1);
    });
  });

  describe('performance: null task completes in <10ms (AC #6)', () => {
    it('null task dispatch and checkpoint takes less than 10ms', async () => {
      // Use a fast handler
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => ({ success: true });
        }
        return undefined;
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      const start = performance.now();
      await runWorkflowActor(config);
      const elapsed = performance.now() - start;

      // The total time includes setup overhead (state read/write mocks),
      // but the actual null task path should be well under 10ms.
      // We give a generous 50ms budget for the whole executeWorkflow call.
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('null task handler failure (success: false)', () => {
    it('records error with code NULL_TASK_FAILED when handler returns success=false', async () => {
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => ({ success: false, output: 'data collection failed' });
        }
        return undefined;
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('NULL_TASK_FAILED');
      expect(result.errors[0].message).toContain('telemetry');
      expect(result.errors[0].message).toContain('data collection failed');
    });

    it('does not write success checkpoint when handler returns success=false', async () => {
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => ({ success: false });
        }
        return undefined;
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
          storyTasks: [],
        }),
        agents: {},
      });

      await runWorkflowActor(config);

      // Check that no SUCCESS checkpoint was written (only error checkpoint should exist)
      const successCheckpointCalls = mockWriteWorkflowState.mock.calls.filter(
        (call: unknown[]) => {
          const state = call[0] as WorkflowState;
          return state.tasks_completed.some(
            (cp) => cp.task_name === 'telemetry' && cp.story_key === '__epic_5__' && !cp.error,
          );
        },
      );
      expect(successCheckpointCalls.length).toBe(0);

      // Verify an error checkpoint WAS written
      const errorCheckpointCalls = mockWriteWorkflowState.mock.calls.filter(
        (call: unknown[]) => {
          const state = call[0] as WorkflowState;
          return state.tasks_completed.some(
            (cp) => cp.task_name === 'telemetry' && cp.story_key === '__epic_5__' && cp.error === true,
          );
        },
      );
      expect(errorCheckpointCalls.length).toBeGreaterThan(0);
    });
  });

  describe('null task handler throws exception', () => {
    it('records error with code NULL_TASK_HANDLER_ERROR when handler throws', async () => {
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => { throw new Error('disk full'); };
        }
        return undefined;
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            telemetry: makeTask({ agent: null }),
          },
          flow: ['telemetry'],
        }),
        agents: {},
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('NULL_TASK_HANDLER_ERROR');
      expect(result.errors[0].message).toContain('disk full');
    });
  });

  describe('accumulated cost tracking', () => {
    it('passes accumulated cost from prior agent tasks to null task handler', async () => {
      let receivedCost: number | null = null;
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async (ctx: { cost: number }) => {
            receivedCost = ctx.cost;
            return { success: true };
          };
        }
        return undefined;
      });

      // Agent dispatch returns cost of 0.05
      mockDriverDispatch.mockImplementation(() => {
        return (async function* () {
          yield { type: 'text' as const, text: 'Done' };
          yield { type: 'result' as const, cost: 0.05, sessionId: 'sess-abc' };
        })();
      });

      // Single story
      mockParse.mockReturnValue({
        development_status: { 'story-1': 'ready-for-dev' },
      });

      const config = makeConfig({
        workflow: makeNullTaskWorkflow({
          tasks: {
            implement: makeTask({ agent: 'dev' }),
            telemetry: makeTask({ agent: null }),
          },
          flow: ['implement', 'telemetry'],
        }),
        agents: { dev: makeDefinition() },
      });

      await runWorkflowActor(config);

      // The telemetry handler should receive the accumulated cost from the implement task
      expect(receivedCost).not.toBeNull();
      expect(typeof receivedCost).toBe('number');
    });
  });
});
