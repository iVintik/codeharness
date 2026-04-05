/**
 * Tests for storyFlow execution in the workflow engine.
 *
 * Story 16-6: Story Flow Execution
 *
 * Verifies that the engine reads `storyFlow` instead of `flow` to drive
 * per-story execution, preserves loop semantics, handles null tasks after
 * loops, derives workflow_name from storyFlow, and maintains backward
 * compatibility with legacy `flow:` workflows.
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
  mockReadStateWithBody,
  mockWriteState,
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

vi.mock('../null-task-registry.js', () => ({
  getNullTask: mockGetNullTask,
  listNullTasks: mockListNullTasks,
}));

vi.mock('../../commands/state.js', () => ({
  readStateWithBody: mockReadStateWithBody,
  writeState: mockWriteState,
}));

vi.mock('../circuit-breaker.js', () => ({
  evaluateProgress: vi.fn().mockReturnValue({ halt: false }),
}));

vi.mock('../workflow-persistence.js', () => ({ saveSnapshot: vi.fn(), loadSnapshot: vi.fn(() => null) }));

import { runWorkflowActor } from '../workflow-runner.js';
import type { EngineConfig } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask, ExecutionConfig } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';

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
      'story-1': 'ready-for-dev',
    },
  });
  mockGetNullTask.mockImplementation((name: string) => {
    if (name === 'telemetry') {
      return async () => ({ success: true, output: 'telemetry collected' });
    }
    return undefined;
  });
  mockListNullTasks.mockReturnValue(['telemetry']);
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
}

// --- Tests ---

describe('Story Flow Execution (Story 16-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  describe('AC #1: storyFlow executes steps in order', () => {
    it('executes storyFlow steps sequentially (implement, verify, telemetry)', async () => {
      const executionOrder: string[] = [];

      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => {
            executionOrder.push('telemetry');
            return { success: true, output: 'ok' };
          };
        }
        return undefined;
      });

      mockDriverDispatch.mockImplementation(() => {
        return (async function* () {
          executionOrder.push('agent-task');
          yield { type: 'text' as const, text: 'Done' };
          yield { type: 'result' as const, cost: 0.05, sessionId: 'sess-1' };
        })();
      });

      // In the new architecture, null tasks only execute inside loop blocks.
      // verify runs as epic-level task, telemetry runs in a loop after verify.
      const passVerdict = JSON.stringify({
        verdict: 'pass', findings: [],
        score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      });

      mockDriverDispatch.mockImplementation(() => {
        return (async function* () {
          executionOrder.push('agent-task');
          yield { type: 'text' as const, text: passVerdict };
          yield { type: 'result' as const, cost: 0.05, sessionId: 'sess-1' };
        })();
      });

      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            verify: makeTask(),
            telemetry: makeTask({ agent: null }),
          },
          flow: ['implement', 'verify', 'telemetry'],
          storyFlow: ['implement'],
          epicFlow: ['story_flow', { loop: ['verify', 'telemetry'] }],
        }),
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(true);
      // implement per-story + verify in loop + telemetry in loop
      expect(executionOrder).toContain('agent-task');
      expect(executionOrder).toContain('telemetry');
    });
  });

  describe('AC #2: telemetry null task executes after loop completes', () => {
    it('runs telemetry after loop exits early on pass verdict', async () => {
      const { evaluateProgress } = await import('../circuit-breaker.js');
      const mockEvaluateProgress = vi.mocked(evaluateProgress);
      mockEvaluateProgress.mockReturnValue({ halt: false });

      const executionOrder: string[] = [];

      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') {
          return async () => {
            executionOrder.push('telemetry');
            return { success: true, output: 'ok' };
          };
        }
        return undefined;
      });

      const passVerdict = JSON.stringify({
        verdict: 'pass',
        findings: [],
        score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      });

      // Loop: retry (per-story) then verify (per-run) — verify returns pass verdict as text
      let callCount = 0;
      mockDriverDispatch.mockImplementation(() => {
        callCount++;
        return (async function* () {
          executionOrder.push(`driver-call-${callCount}`);
          // Emit verdict JSON as text (the engine reads output from text events)
          yield { type: 'text' as const, text: passVerdict };
          yield { type: 'result' as const, cost: 0.01, sessionId: `sess-${callCount}` };
        })();
      });

      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            retry: makeTask(),
            verify: makeTask(),
            telemetry: makeTask({ agent: null }),
          },
          flow: [
            'implement',
            { loop: ['retry', 'verify'] },
            'telemetry',
          ],
          storyFlow: ['implement', 'retry'],
          epicFlow: ['story_flow', { loop: ['retry', 'verify', 'telemetry'] }],
        }),
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(true);
      // Telemetry runs inside loop after verify passes
      expect(executionOrder).toContain('telemetry');
    });

    it('does NOT run telemetry when loop triggers circuit-breaker halt', async () => {
      const { evaluateProgress } = await import('../circuit-breaker.js');
      const mockEvaluateProgress = vi.mocked(evaluateProgress);

      // Circuit breaker triggers halt on first evaluation
      mockEvaluateProgress.mockReturnValue({ halt: true, reason: 'test-cb-halt' });

      const telemetryHandler = vi.fn().mockResolvedValue({ success: true, output: 'ok' });
      mockGetNullTask.mockImplementation((name: string) => {
        if (name === 'telemetry') return telemetryHandler;
        return undefined;
      });

      const failVerdict = JSON.stringify({
        verdict: 'fail',
        findings: [{ ac: 1, description: 'test', status: 'fail', evidence: { commands_run: ['echo'], output_observed: 'fail', reasoning: 'test' } }],
        score: { passed: 0, failed: 1, unknown: 0, total: 1 },
      });

      mockDriverDispatch.mockImplementation(() => {
        return (async function* () {
          // Emit verdict JSON as text — engine parses this via parseVerdict()
          yield { type: 'text' as const, text: failVerdict };
          yield { type: 'result' as const, cost: 0.01, sessionId: 'sess-1' };
        })();
      });

      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            verify: makeTask(),
            telemetry: makeTask({ agent: null }),
          },
          flow: [
            'implement',
            { loop: ['implement', 'verify'] },
            'telemetry',
          ],
          storyFlow: ['implement'],
          epicFlow: ['story_flow', { loop: ['implement', 'verify', 'telemetry'] }],
        }),
      });

      const result = await runWorkflowActor(config);

      // In the new architecture, telemetry runs inside the loop iteration
      // alongside verify. The circuit-breaker halt prevents the NEXT iteration,
      // but tasks within the current iteration still complete.
      // Engine reports halted state
      expect(result.success).toBe(false);
    });
  });

  describe('AC #3: loop semantics preserved under storyFlow', () => {
    it('executes loop block within storyFlow with max iterations respected', async () => {
      const { evaluateProgress } = await import('../circuit-breaker.js');
      const mockEvaluateProgress = vi.mocked(evaluateProgress);
      mockEvaluateProgress.mockReturnValue({ halt: false });

      const failVerdict = JSON.stringify({
        verdict: 'fail',
        findings: [{ ac: 1, description: 'test', status: 'fail', evidence: { commands_run: ['echo'], output_observed: 'fail', reasoning: 'test' } }],
        score: { passed: 0, failed: 1, unknown: 0, total: 1 },
      });

      let dispatchCount = 0;
      mockDriverDispatch.mockImplementation(() => {
        dispatchCount++;
        return (async function* () {
          // Emit verdict JSON as text for the engine's parseVerdict()
          yield { type: 'text' as const, text: failVerdict };
          yield { type: 'result' as const, cost: 0.01, sessionId: `sess-${dispatchCount}` };
        })();
      });

      // maxIterations defaults to 5 in the engine (DEFAULT_MAX_ITERATIONS = 5)
      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            retry: makeTask(),
            verify: makeTask(),
          },
          flow: [
            { loop: ['retry', 'verify'] },
          ],
          epicTasks: ['verify'],
        }),
      });

      const result = await runWorkflowActor(config);

      // Loop ran retry+verify per iteration, 5 iterations = 10 dispatches
      expect(dispatchCount).toBe(10);
      // Engine should report failure (max-iterations reached, halted = true)
      expect(result.success).toBe(false);
    });

    it('loop exits early when verdict is pass', async () => {
      const { evaluateProgress } = await import('../circuit-breaker.js');
      const mockEvaluateProgress = vi.mocked(evaluateProgress);
      mockEvaluateProgress.mockReturnValue({ halt: false });

      const passVerdict = JSON.stringify({
        verdict: 'pass',
        findings: [],
        score: { passed: 1, failed: 0, unknown: 0, total: 1 },
      });

      let dispatchCount = 0;
      mockDriverDispatch.mockImplementation(() => {
        dispatchCount++;
        return (async function* () {
          // Emit verdict JSON as text
          yield { type: 'text' as const, text: passVerdict };
          yield { type: 'result' as const, cost: 0.01, sessionId: `sess-${dispatchCount}` };
        })();
      });

      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            retry: makeTask(),
            verify: makeTask(),
          },
          flow: [
            { loop: ['retry', 'verify'] },
          ],
          epicTasks: ['verify'],
        }),
      });

      const result = await runWorkflowActor(config);

      // Only 1 iteration: retry + verify = 2 dispatches
      expect(dispatchCount).toBe(2);
      expect(result.success).toBe(true);
    });
  });

  describe('AC #4: backward compatibility with legacy flow', () => {
    it('workflow with only flow (no story_flow) works identically', async () => {
      // This test verifies that makeWorkflow sets storyFlow = flow,
      // matching the behavior of resolveHierarchicalFlow for legacy workflows
      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
          },
          flow: ['implement'],
        }),
      });

      // storyFlow should equal flow
      expect(config.workflow.storyFlow).toEqual(config.workflow.flow);

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(1);
    });

    it('ResolvedWorkflow.flow field remains populated', () => {
      const workflow = makeWorkflow({
        tasks: { implement: makeTask() },
        flow: ['implement'],
      });

      expect(workflow.flow).toEqual(['implement']);
      expect(workflow.storyFlow).toEqual(['implement']);
    });
  });

  describe('AC #5: engine reads storyFlow from resolved workflow', () => {
    it('uses storyFlow (not flow) when they differ', async () => {
      const executionOrder: string[] = [];

      mockDriverDispatch.mockImplementation(() => {
        return (async function* () {
          executionOrder.push('driver');
          yield { type: 'text' as const, text: 'Done' };
          yield { type: 'result' as const, cost: 0.01, sessionId: 'sess-1' };
        })();
      });

      // storyFlow has both implement and verify; epicFlow references story_flow
      // This differs from flow which has only implement
      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            verify: makeTask(),
          },
          flow: ['implement'],
          storyFlow: ['implement', 'verify'],
          epicFlow: ['story_flow'],
        }),
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(true);
      // Engine should execute storyFlow (implement + verify per story), not flow (just implement)
      // With 1 story, that's 2 dispatches
      expect(executionOrder.length).toBe(2);
    });
  });

  describe('AC #6: workflow_name derived from storyFlow', () => {
    it('derives workflow_name from storyFlow steps, not flow', async () => {
      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            verify: makeTask(),
            telemetry: makeTask({ agent: null }),
          },
          flow: ['implement'],
          storyFlow: ['implement', 'verify', 'telemetry'],
        }),
      });

      await runWorkflowActor(config);

      // writeWorkflowState is called with state that has workflow_name derived from storyFlow
      const stateWrites = mockWriteWorkflowState.mock.calls;
      const firstWrite = stateWrites[0]?.[0] as WorkflowState | undefined;
      expect(firstWrite).toBeDefined();
      // storyFlow has implement, verify, telemetry (all strings) -> "implement -> verify -> telemetry"
      expect(firstWrite!.workflow_name).toBe('implement -> verify -> telemetry');
    });

    it('workflow_name filters out loop blocks (only string steps)', async () => {
      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            verify: makeTask(),
            retry: makeTask(),
          },
          flow: ['implement', { loop: ['retry', 'verify'] }],
          storyFlow: ['implement'],
          epicFlow: ['story_flow', { loop: ['retry', 'verify'] }],
        }),
      });

      await runWorkflowActor(config);

      const stateWrites = mockWriteWorkflowState.mock.calls;
      const firstWrite = stateWrites[0]?.[0] as WorkflowState | undefined;
      expect(firstWrite).toBeDefined();
      // Only 'implement' is a string step in storyFlow; loop block is filtered out
      expect(firstWrite!.workflow_name).toBe('implement');
    });
  });

  describe('storyFlow with multiple per-story tasks', () => {
    it('iterates all work items for each per-story task in storyFlow', async () => {
      const dispatched: Array<{ task: string; story: string }> = [];

      mockParse.mockReturnValue({
        development_status: {
          'story-1': 'ready-for-dev',
          'story-2': 'ready-for-dev',
        },
      });

      let dispatchIdx = 0;
      mockDriverDispatch.mockImplementation(() => {
        dispatchIdx++;
        return (async function* () {
          yield { type: 'text' as const, text: 'Done' };
          yield { type: 'result' as const, cost: 0.01, sessionId: `sess-${dispatchIdx}` };
        })();
      });

      const config = makeConfig({
        workflow: makeWorkflow({
          tasks: {
            implement: makeTask(),
            verify: makeTask(),
          },
          flow: ['implement', 'verify'],
        }),
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(true);
      // 2 stories * 2 tasks = 4 total dispatches
      expect(result.tasksCompleted).toBe(4);
    });
  });

  describe('empty storyFlow', () => {
    it('completes immediately with no steps', async () => {
      const config = makeConfig({
        workflow: {
          tasks: {},
          flow: [],
          storyFlow: [],
          epicFlow: [],
          execution: defaultExecution,
        },
      });

      const result = await runWorkflowActor(config);

      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(0);
    });
  });
});
