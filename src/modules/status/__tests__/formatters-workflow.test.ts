import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mocks ---
const { readWorkflowStateMock } = vi.hoisted(() => ({
  readWorkflowStateMock: vi.fn(),
}));

vi.mock('../../../lib/state.js', () => ({
  readState: vi.fn(() => ({
    harness_version: '0.0.0-dev',
    initialized: true,
    stack: 'nodejs',
    stacks: ['nodejs'],
    enforcement: { frontend: true, database: true, api: true },
    coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
    session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
    verification_log: [],
    otlp: { enabled: false, endpoint: '', service_name: 'test', mode: 'local-shared', backend: 'none' },
  })),
  StateFileNotFoundError: class extends Error {
    constructor() { super('No state file found.'); this.name = 'StateFileNotFoundError'; }
  },
}));

vi.mock('../../../lib/docker/index.js', () => ({
  getStackHealth: vi.fn(() => ({ healthy: true, services: [], remedy: undefined })),
  getCollectorHealth: vi.fn(() => ({ healthy: true, services: [], remedy: undefined })),
  checkRemoteEndpoint: vi.fn(async () => ({ reachable: true })),
}));

vi.mock('../../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getElkComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.elk.yml'),
}));

vi.mock('../../../lib/onboard-checks.js', () => ({
  getOnboardingProgress: vi.fn(() => null),
}));

vi.mock('../../sprint/index.js', () => ({
  generateReport: vi.fn(() => ({ success: false })),
}));

vi.mock('../../verify/index.js', () => ({
  getValidationProgress: vi.fn(() => ({ success: false })),
}));

vi.mock('../../../lib/workflow-state.js', () => ({
  readWorkflowState: (...args: unknown[]) => readWorkflowStateMock(...args),
}));

import { handleFullStatus, formatElapsed } from '../formatters.js';
import type { WorkflowState } from '../../../lib/workflow-state.js';

function makeDefaultState(): WorkflowState {
  return {
    workflow_name: '',
    started: '',
    iteration: 0,
    phase: 'idle',
    tasks_completed: [],
    evaluator_scores: [],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
  };
}

function makeActiveState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    workflow_name: 'implement -> verify',
    started: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    iteration: 2,
    phase: 'executing',
    tasks_completed: [
      { task_name: 'implement', story_key: '5-1-story', completed_at: new Date().toISOString() },
      { task_name: 'verify', story_key: '__run__', completed_at: new Date().toISOString() },
    ],
    evaluator_scores: [
      { iteration: 1, passed: 3, failed: 1, unknown: 0, total: 4, timestamp: new Date().toISOString() },
    ],
    circuit_breaker: { triggered: false, reason: null, score_history: [] },
    trace_ids: [],
    ...overrides,
  };
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  consoleSpy.mockRestore();
  process.exitCode = undefined;
});

function getLogOutput(): string {
  return consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
}

// --- formatElapsed tests ---

describe('formatElapsed', () => {
  it('formats seconds only', () => {
    expect(formatElapsed(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(195000)).toBe('3m15s');
  });

  it('formats hours and minutes', () => {
    expect(formatElapsed(8040000)).toBe('2h14m');
  });

  it('formats zero', () => {
    expect(formatElapsed(0)).toBe('0s');
  });
});

// --- printWorkflowState tests (via handleFullStatus) ---

describe('handleFullStatus — workflow engine section', () => {
  it('displays "No active workflow run" when no state exists', () => {
    readWorkflowStateMock.mockReturnValue(makeDefaultState());
    handleFullStatus(false);

    const output = getLogOutput();
    expect(output).toContain('No active workflow run');
  });

  it('displays workflow state fields when executing', () => {
    readWorkflowStateMock.mockReturnValue(makeActiveState());
    handleFullStatus(false);

    const output = getLogOutput();
    expect(output).toContain('Workflow Engine');
    expect(output).toContain('Phase: executing');
    expect(output).toContain('Iteration: 2');
    expect(output).toContain('Tasks completed: 2');
    expect(output).toContain('Workflow errors: 0');
    expect(output).toContain('Elapsed:');
    expect(output).toContain('Evaluator: 3/4 passed');
    expect(output).toContain('Circuit breaker: no');
  });

  it('lists workflow errors with taskName/storyKey/code', () => {
    readWorkflowStateMock.mockReturnValue(makeActiveState({
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-story', completed_at: new Date().toISOString() },
        {
          task_name: 'telemetry',
          story_key: '5-1-story',
          completed_at: new Date().toISOString(),
          error: true,
          error_code: 'NULL_TASK_NOT_FOUND',
          error_message: 'missing handler',
        },
        {
          task_name: 'verify',
          story_key: '__run__',
          completed_at: new Date().toISOString(),
          error: true,
          error_code: 'NETWORK',
          error_message: 'network down',
        },
      ],
    }));
    handleFullStatus(false);

    const output = getLogOutput();
    expect(output).toContain('Workflow errors: 2');
    expect(output).toContain('telemetry/5-1-story [NULL_TASK_NOT_FOUND]');
    expect(output).toContain('verify/__run__ [NETWORK]');
  });

  it('displays circuit breaker triggered state with reason', () => {
    readWorkflowStateMock.mockReturnValue(makeActiveState({
      phase: 'circuit-breaker',
      circuit_breaker: { triggered: true, reason: 'Score plateau detected', score_history: [50, 50, 50] },
    }));
    handleFullStatus(false);

    const output = getLogOutput();
    expect(output).toContain('Circuit breaker: TRIGGERED');
    expect(output).toContain('Score plateau detected');
  });

  it('does not show elapsed time when phase is not executing', () => {
    readWorkflowStateMock.mockReturnValue(makeActiveState({ phase: 'completed' }));
    handleFullStatus(false);

    const output = getLogOutput();
    expect(output).toContain('Phase: completed');
    expect(output).not.toContain('Elapsed:');
  });
});

// --- handleFullStatusJson — workflow state in JSON ---

describe('handleFullStatusJson — workflow state', () => {
  it('includes workflow field in JSON when state is active', () => {
    readWorkflowStateMock.mockReturnValue(makeActiveState());
    handleFullStatus(true);

    const jsonCall = consoleSpy.mock.calls[0]?.[0];
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(String(jsonCall));
    expect(parsed.workflow).toBeDefined();
    expect(parsed.workflow.phase).toBe('executing');
    expect(parsed.workflow.iteration).toBe(2);
    expect(parsed.workflow.tasks_completed).toBe(2);
    expect(parsed.workflow.errors).toEqual([]);
    expect(parsed.workflow.workflow_name).toBe('implement -> verify');
    expect(parsed.workflow.evaluator_scores).toHaveLength(1);
    expect(parsed.workflow.circuit_breaker.triggered).toBe(false);
    expect(parsed.workflow.elapsed_ms).toBeGreaterThan(0);
    expect(parsed.workflow.elapsed).toBeDefined();
  });

  it('includes detailed workflow errors in JSON', () => {
    readWorkflowStateMock.mockReturnValue(makeActiveState({
      tasks_completed: [
        {
          task_name: 'telemetry',
          story_key: '5-1-story',
          completed_at: new Date().toISOString(),
          error: true,
          error_code: 'NULL_TASK_NOT_FOUND',
          error_message: 'missing handler',
        },
      ],
    }));
    handleFullStatus(true);

    const jsonCall = consoleSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(String(jsonCall));
    expect(parsed.workflow.errors).toEqual([
      {
        taskName: 'telemetry',
        storyKey: '5-1-story',
        code: 'NULL_TASK_NOT_FOUND',
        message: 'missing handler',
      },
    ]);
  });

  it('omits workflow field in JSON when no active run', () => {
    readWorkflowStateMock.mockReturnValue(makeDefaultState());
    handleFullStatus(true);

    const jsonCall = consoleSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(String(jsonCall));
    expect(parsed.workflow).toBeUndefined();
  });
});
