/**
 * Tests for the XState workflow machine module.
 *
 * Covers: compiler, dispatch actor, guards, story machine, epic machine,
 * loop handling, circuit breaker, interrupt, and the runWorkflowActor wrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runWorkflowActor,
  loadWorkItems,
  isTaskCompleted,
  isLoopTaskCompleted,
  buildRetryPrompt,
  buildAllUnknownVerdict,
  getFailedItems,
  checkDriverHealth,
  buildCoverageDeduplicationContext,
  PER_RUN_SENTINEL,
} from '../workflow-machine.js';
import type {
  EngineConfig,
  EngineResult,
  EngineError,
  EngineEvent,
  WorkItem,
} from '../workflow-machine.js';
import type { WorkflowState, TaskCheckpoint, EvaluatorScore } from '../workflow-state.js';
import { getDefaultWorkflowState } from '../workflow-state.js';
import type { ResolvedWorkflow, ResolvedTask } from '../workflow-parser.js';
import type { SubagentDefinition } from '../agent-resolver.js';
import type { EvaluatorVerdict } from '../verdict-parser.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../workflow-state.js', () => ({
  readWorkflowState: vi.fn(() => ({
    workflow_name: '',
    started: '',
    iteration: 0,
    phase: 'idle',
    tasks_completed: [],
    evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
  })),
  writeWorkflowState: vi.fn(),
  getDefaultWorkflowState: vi.fn(() => ({
    workflow_name: '',
    started: '',
    iteration: 0,
    phase: 'idle',
    tasks_completed: [],
    evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
  })),
}));

vi.mock('../workflow-persistence.js', () => ({
  saveSnapshot: vi.fn(),
  loadSnapshot: vi.fn(() => null),
}));

vi.mock('../agents/drivers/factory.js', () => ({
  getDriver: vi.fn(() => ({
    dispatch: vi.fn(async function* () {
      yield { type: 'text' as const, text: 'output' };
      yield { type: 'result' as const, cost: 0.01, sessionId: 'sess-1' };
    }),
    healthCheck: vi.fn(async () => ({ available: true })),
  })),
}));

vi.mock('../agent-dispatch.js', () => ({
  DispatchError: class DispatchError extends Error {
    code: string;
    constructor(msg: string, code: string) { super(msg); this.code = code; this.name = 'DispatchError'; }
  },
}));

vi.mock('../agents/model-resolver.js', () => ({
  resolveModel: vi.fn(() => 'claude-sonnet-4-6'),
}));

vi.mock('../agents/capability-check.js', () => ({
  checkCapabilityConflicts: vi.fn(() => []),
}));

vi.mock('../source-isolation.js', () => ({
  createIsolatedWorkspace: vi.fn(async () => ({
    toDispatchOptions: () => ({ cwd: '/tmp/workspace' }),
    cleanup: vi.fn(async () => {}),
  })),
}));

vi.mock('../trace-id.js', () => ({
  generateTraceId: vi.fn(() => 'trace-123'),
  formatTracePrompt: vi.fn(() => 'trace prompt'),
  recordTraceId: vi.fn((id: string, state: WorkflowState) => state),
}));

vi.mock('../session-manager.js', () => ({
  resolveSessionId: vi.fn(() => null),
  recordSessionId: vi.fn((key: unknown, sid: string, state: WorkflowState) => ({
    ...state,
    tasks_completed: [
      ...state.tasks_completed,
      { task_name: 'test', story_key: 'test', completed_at: new Date().toISOString() },
    ],
  })),
}));

vi.mock('../verdict-parser.js', () => ({
  parseVerdict: vi.fn(() => null),
  parseVerdictTag: vi.fn(() => null),
  extractTag: vi.fn(() => null),
  VerdictParseError: class VerdictParseError extends Error {
    retryable = false;
    constructor(msg: string) { super(msg); }
  },
}));

vi.mock('../circuit-breaker.js', () => ({
  evaluateProgress: vi.fn(() => ({ halt: false })),
}));

vi.mock('../null-task-registry.js', () => ({
  getNullTask: vi.fn(() => null),
  listNullTasks: vi.fn(() => []),
}));

vi.mock('../agents/output-contract.js', () => ({
  buildPromptWithContractContext: vi.fn((prompt: string) => prompt),
  writeOutputContract: vi.fn(),
}));

vi.mock('../state.js', () => ({
  readStateWithBody: vi.fn(() => ({
    state: { session_flags: { tests_passed: false, coverage_met: false }, coverage: { target: 90 } },
    body: '',
  })),
  writeState: vi.fn(),
}));

vi.mock('../evaluator.js', () => ({
  formatCoverageContextMessage: vi.fn(() => 'coverage context'),
}));

vi.mock('../output.js', () => ({
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────

function makeWorkflow(overrides?: Partial<ResolvedWorkflow>): ResolvedWorkflow {
  return {
    tasks: {
      'create-story': { agent: 'story-creator', session: 'fresh', source_access: true },
      'implement': { agent: 'dev', session: 'fresh', source_access: true },
      'check': { agent: 'checker', session: 'fresh', source_access: true },
    },
    storyFlow: ['create-story', 'implement', 'check'],
    epicFlow: ['story_flow'],
    execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'merge-commit', epic_strategy: 'sequential', story_strategy: 'sequential' },
    flow: [],
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  return {
    workflow: makeWorkflow(),
    agents: {
      'story-creator': { name: 'story-creator', prompt: 'create', model: 'claude-sonnet-4-6' } as SubagentDefinition,
      'dev': { name: 'dev', prompt: 'implement', model: 'claude-sonnet-4-6' } as SubagentDefinition,
      'checker': { name: 'checker', prompt: 'check', model: 'claude-sonnet-4-6' } as SubagentDefinition,
    },
    sprintStatusPath: '/tmp/sprint-status.yaml',
    runId: 'run-test',
    projectDir: '/tmp/project',
    maxIterations: 5,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('workflow-machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PER_RUN_SENTINEL', () => {
    it('should be __run__', () => {
      expect(PER_RUN_SENTINEL).toBe('__run__');
    });
  });

  describe('isTaskCompleted', () => {
    it('returns true when task+story found in completed array', () => {
      const state: WorkflowState = {
        ...getDefaultWorkflowState(),
        tasks_completed: [
          { task_name: 'implement', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z' },
        ],
      };
      expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(true);
    });

    it('returns false when task+story not found', () => {
      const state = getDefaultWorkflowState();
      expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(false);
    });

    it('returns false for error checkpoints', () => {
      const state: WorkflowState = {
        ...getDefaultWorkflowState(),
        tasks_completed: [
          { task_name: 'implement', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z', error: true },
        ],
      };
      expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(false);
    });
  });

  describe('isLoopTaskCompleted', () => {
    it('returns true when completion count >= iteration', () => {
      const state: WorkflowState = {
        ...getDefaultWorkflowState(),
        tasks_completed: [
          { task_name: 'check', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z' },
          { task_name: 'check', story_key: '1-1-foo', completed_at: '2026-01-01T00:01:00Z' },
        ],
      };
      expect(isLoopTaskCompleted(state, 'check', '1-1-foo', 2)).toBe(true);
      expect(isLoopTaskCompleted(state, 'check', '1-1-foo', 3)).toBe(false);
    });
  });

  describe('buildRetryPrompt', () => {
    it('includes failed findings', () => {
      const findings = [
        { ac: 1, description: 'Login works', status: 'pass' as const, evidence: { commands_run: [], output_observed: '', reasoning: '' } },
        { ac: 2, description: 'Signup fails', status: 'fail' as const, evidence: { commands_run: [], output_observed: '', reasoning: 'form broken' } },
      ];
      const prompt = buildRetryPrompt('1-1-foo', findings);
      expect(prompt).toContain('Retry story 1-1-foo');
      expect(prompt).toContain('AC #2 (FAIL): Signup fails');
      expect(prompt).toContain('form broken');
      expect(prompt).not.toContain('AC #1');
    });

    it('returns simple prompt when no failures', () => {
      const prompt = buildRetryPrompt('1-1-foo', []);
      expect(prompt).toBe('Implement story 1-1-foo');
    });
  });

  describe('buildAllUnknownVerdict', () => {
    it('creates all-unknown verdict', () => {
      const items: WorkItem[] = [
        { key: '1-1-foo', source: 'sprint' },
        { key: '1-2-bar', source: 'sprint' },
      ];
      const verdict = buildAllUnknownVerdict(items, 'evaluator failed');
      expect(verdict.verdict).toBe('fail');
      expect(verdict.score.unknown).toBe(2);
      expect(verdict.score.total).toBe(2);
      expect(verdict.findings).toHaveLength(2);
      expect(verdict.findings[0].status).toBe('unknown');
    });
  });

  describe('getFailedItems', () => {
    const items: WorkItem[] = [
      { key: '1-1-foo', source: 'sprint' },
      { key: '1-2-bar', source: 'sprint' },
    ];

    it('returns all items when verdict is null', () => {
      expect(getFailedItems(null, items)).toEqual(items);
    });

    it('returns empty when verdict is pass', () => {
      const verdict: EvaluatorVerdict = { verdict: 'pass', score: { passed: 2, failed: 0, unknown: 0, total: 2 }, findings: [] };
      expect(getFailedItems(verdict, items)).toEqual([]);
    });

    it('returns all items when verdict is fail (conservative)', () => {
      const verdict: EvaluatorVerdict = { verdict: 'fail', score: { passed: 1, failed: 1, unknown: 0, total: 2 }, findings: [] };
      expect(getFailedItems(verdict, items)).toEqual(items);
    });
  });

  describe('loadWorkItems', () => {
    it('returns empty when file does not exist', () => {
      const items = loadWorkItems('/nonexistent/path');
      expect(items).toEqual([]);
    });
  });

  describe('runWorkflowActor', () => {
    it('returns early when phase is completed', async () => {
      const { readWorkflowState } = await import('../workflow-state.js');
      vi.mocked(readWorkflowState).mockReturnValueOnce({
        ...getDefaultWorkflowState(),
        phase: 'completed',
      });

      const result = await runWorkflowActor(makeConfig());
      expect(result.success).toBe(true);
      expect(result.tasksCompleted).toBe(0);
      expect(result.durationMs).toBe(0);
    });

    it('fails fast on health check failure', async () => {
      const { readWorkflowState } = await import('../workflow-state.js');
      vi.mocked(readWorkflowState).mockReturnValueOnce(getDefaultWorkflowState());

      const { getDriver } = await import('../agents/drivers/factory.js');
      vi.mocked(getDriver).mockReturnValueOnce({
        dispatch: vi.fn(),
        healthCheck: vi.fn(async () => ({ available: false, error: 'no driver' })),
      } as any);

      const result = await runWorkflowActor(makeConfig());
      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('HEALTH_CHECK');
    });
  });
});
