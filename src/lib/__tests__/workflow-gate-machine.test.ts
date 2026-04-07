/**
 * Tests for workflow-gate-machine module.
 *
 * Covers: passed/maxedOut/halted/interrupted final states, fix-and-retry cycle,
 * multi-task verdicts, null task path, machine output shape, circuit breaker (story 25-1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActor, waitFor } from 'xstate';
import { gateMachine } from '../workflow-gate-machine.js';
import type { GateContext, EngineConfig, GateConfig, OutputContract } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';

// ─── Hoisted Mocks ───────────────────────────────────────────────────

const { mockDispatchTaskCore, mockNullTaskCore, MockDispatchError } = vi.hoisted(() => {
  class MockDispatchError extends Error {
    public readonly code: string;
    public readonly agentName: string;
    public readonly cause: unknown;
    constructor(message: string, code: string, agentName: string, cause: unknown) {
      super(message); this.name = 'DispatchError'; this.code = code; this.agentName = agentName; this.cause = cause;
    }
  }
  return { mockDispatchTaskCore: vi.fn(), mockNullTaskCore: vi.fn(), MockDispatchError };
});

vi.mock('../agent-dispatch.js', () => ({ DispatchError: MockDispatchError }));
vi.mock('../workflow-actors.js', () => ({
  dispatchTaskCore: mockDispatchTaskCore,
  nullTaskCore: mockNullTaskCore,
  dispatchActor: undefined,
  nullTaskActor: undefined,
  nullTaskDispatchActor: undefined,
  buildCoverageDeduplicationContext: vi.fn().mockReturnValue(null),
}));
vi.mock('../output.js', () => ({ warn: vi.fn(), log: vi.fn(), error: vi.fn() }));

// ─── Helpers ────────────────────────────────────────────────────────

function makeWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    workflow_name: 'test', started: '2024-01-01T00:00:00.000Z',
    iteration: 0, phase: 'executing', tasks_completed: [],
    evaluator_scores: [], circuit_breaker: { triggered: false, reason: null, score_history: [] },
    ...overrides,
  };
}

function makeContract(output: string): OutputContract {
  return {
    version: 1, taskName: 'test', storyId: 'gate-1', driver: 'test', model: 'test',
    timestamp: '2024-01-01T00:00:00.000Z', cost_usd: 0.01, duration_ms: 50,
    changedFiles: [], testResults: null, output, acceptanceCriteria: [],
  };
}

function makeOut(verdictText: string, state?: WorkflowState) {
  const ws = state ?? makeWorkflowState();
  return { output: verdictText, cost: 0.01, changedFiles: [], sessionId: 's', contract: makeContract(verdictText), updatedState: ws };
}

const PASS = '<verdict>pass</verdict>';
const FAIL = '<verdict>fail</verdict>';

function makeInput(overrides: Partial<GateContext> = {}): GateContext {
  const gate: GateConfig = { gate: 'g1', check: ['check-task'], fix: ['fix-task'], pass_when: 'all_pass', max_retries: 3, circuit_breaker: 'default' };
  const config = {
    workflow: {
      tasks: {
        'check-task': { agent: 'test-agent', session: 'fresh', source_access: true },
        'fix-task': { agent: 'test-agent', session: 'fresh', source_access: true },
      },
      storyFlow: [], epicFlow: [], sprintFlow: [], execution: { max_parallel: 1, isolation: 'none', merge_strategy: 'rebase', epic_strategy: 'sequential', story_strategy: 'sequential' }, flow: [],
    },
    agents: { 'test-agent': { name: 'test-agent', model: 'test-model', instructions: '', disallowedTools: [], bare: true } },
    sprintStatusPath: '/tmp/test', runId: 'test-run',
  } as unknown as EngineConfig;
  return { gate, config, workflowState: makeWorkflowState(), errors: [], tasksCompleted: 0, halted: false, lastContract: null, accumulatedCostUsd: 0, verdicts: {}, ...overrides };
}

async function run(input: GateContext) {
  const actor = createActor(gateMachine, { input });
  actor.start();
  const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5000 });
  return { snap, actor };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('gateMachine', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('gate with all-pass verdicts reaches passed final state', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut(PASS));
    const { snap } = await run(makeInput());
    expect(snap.value).toBe('passed');
  });

  it('gate hitting max_retries reaches maxedOut final state', async () => {
    // max_retries=1: after first cycle iteration=1 >= 1 → maxedOut
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut(FAIL));
    const { snap } = await run(makeInput({ gate: { gate: 'g1', check: ['check-task'], fix: ['fix-task'], pass_when: 'all_pass', max_retries: 1, circuit_breaker: 'default' } }));
    expect(snap.value).toBe('maxedOut');
  });

  it('gate with circuit breaker triggered reaches halted final state', async () => {
    // max_retries=5 so we don't hit that; two fail cycles triggers stagnation
    // Must pass through input.workflowState so iteration accumulates across cycles
    const input = makeInput({ gate: { gate: 'g1', check: ['check-task'], fix: ['fix-task'], pass_when: 'all_pass', max_retries: 5, circuit_breaker: 'default' } });
    mockDispatchTaskCore
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut(FAIL, i.workflowState)))
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut('ok', i.workflowState)))
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut(FAIL, i.workflowState)));
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
  });

  it('INTERRUPT event transitions to interrupted final state', async () => {
    let unblock: (() => void) | undefined;
    mockDispatchTaskCore.mockImplementationOnce(() => new Promise((resolve) => { unblock = () => resolve(makeOut(PASS)); }));
    const actor = createActor(gateMachine, { input: makeInput() });
    actor.start();
    actor.send({ type: 'INTERRUPT' });
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5000 });
    unblock?.();
    expect(snap.value).toBe('interrupted');
  });

  it('check-fail → evaluate → fix → check-pass cycle reaches passed', async () => {
    // Pass through input.workflowState so iteration accumulates correctly
    mockDispatchTaskCore
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut(FAIL, i.workflowState)))
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut('ok', i.workflowState)))
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut(PASS, i.workflowState)));
    const { snap } = await run(makeInput());
    expect(snap.value).toBe('passed');
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(3);
  });

  it('two check tasks produce sequential verdicts in context', async () => {
    const input = makeInput({
      gate: { gate: 'g1', check: ['check-a', 'check-b'], fix: [], pass_when: 'all_pass', max_retries: 3, circuit_breaker: 'default' },
    });
    (input.config as unknown as { workflow: { tasks: Record<string, unknown> } }).workflow.tasks['check-a'] = { agent: 'test-agent', session: 'fresh', source_access: true };
    (input.config as unknown as { workflow: { tasks: Record<string, unknown> } }).workflow.tasks['check-b'] = { agent: 'test-agent', session: 'fresh', source_access: true };
    const outA = makeOut(PASS); const outB = makeOut(PASS);
    outA.contract = makeContract(PASS); outB.contract = makeContract(PASS);
    mockDispatchTaskCore.mockResolvedValueOnce(outA).mockResolvedValueOnce(outB);
    const { snap } = await run(input);
    expect(snap.value).toBe('passed');
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(2);
    // Both tasks called sequentially
    expect(mockDispatchTaskCore.mock.calls[0][0]).toMatchObject({ taskName: 'check-a' });
    expect(mockDispatchTaskCore.mock.calls[1][0]).toMatchObject({ taskName: 'check-b' });
  });

  it('halt error from check actor transitions to halted state', async () => {
    mockDispatchTaskCore.mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const { snap } = await run(makeInput());
    expect(snap.value).toBe('halted');
    expect(snap.context.halted).toBe(true);
  });

  it('null task check uses nullTaskCore path, not dispatchTaskCore', async () => {
    const input = makeInput({
      gate: { gate: 'g1', check: ['null-check'], fix: [], pass_when: 'all_pass', max_retries: 3, circuit_breaker: 'default' },
    });
    (input.config as unknown as { workflow: { tasks: Record<string, unknown> } }).workflow.tasks['null-check'] = { agent: null, session: 'fresh', source_access: true };
    mockNullTaskCore.mockResolvedValueOnce(makeOut(PASS));
    const { snap } = await run(input);
    expect(snap.value).toBe('passed');
    expect(mockNullTaskCore).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskCore).not.toHaveBeenCalled();
  });

  it('machine output includes workflowState, errors, tasksCompleted, accumulatedCostUsd', async () => {
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut(PASS));
    const { snap } = await run(makeInput());
    expect(snap.value).toBe('passed');
    const out = snap.output;
    expect(out).toBeDefined();
    expect(out).toHaveProperty('workflowState');
    expect(out).toHaveProperty('errors');
    expect(out).toHaveProperty('tasksCompleted');
    expect(out).toHaveProperty('accumulatedCostUsd');
    expect(out).toHaveProperty('verdicts');
    expect(out!.tasksCompleted).toBe(1);
    expect(out!.accumulatedCostUsd).toBeCloseTo(0.01);
  });

  it('allPassed guard: returns false when verdicts is empty', async () => {
    // With empty check list, allPassed returns false → tries maxRetries
    const input = makeInput({ gate: { gate: 'g1', check: [], fix: [], pass_when: 'all_pass', max_retries: 1, circuit_breaker: 'default' } });
    const { snap } = await run(input);
    // No check tasks → verdicts empty → allPassed false → maxRetries (iteration=1 >= 1) → maxedOut
    expect(snap.value).toBe('maxedOut');
  });

  it('maxRetries guard: allows fix cycles below limit before maxedOut', async () => {
    // max_retries=2: fail at cycle 1 → fix → fail at cycle 2 → maxedOut
    // Pass through input.workflowState so iteration accumulates: 0 → 1 → 2 >= 2 → maxedOut
    const input = makeInput({ gate: { gate: 'g1', check: ['check-task'], fix: ['fix-task'], pass_when: 'all_pass', max_retries: 2, circuit_breaker: 'default' } });
    mockDispatchTaskCore
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut(FAIL, i.workflowState)))
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut('ok', i.workflowState)))
      .mockImplementationOnce((i: { workflowState: WorkflowState }) => Promise.resolve(makeOut(FAIL, i.workflowState)));
    const { snap } = await run(input);
    expect(snap.value).toBe('maxedOut');
    expect(mockDispatchTaskCore).toHaveBeenCalledTimes(3);
  });

  it('nested gate: halt error uses compound storyKey when parentItemKey is set', async () => {
    const input = makeInput({ parentItemKey: 'parent-story' });
    mockDispatchTaskCore.mockRejectedValueOnce(new MockDispatchError('rate limited', 'RATE_LIMIT', 'test-agent', {}));
    const { snap } = await run(input);
    expect(snap.value).toBe('halted');
    expect(snap.context.halted).toBe(true);
    // Error storyKey must be the compound key, not just the gate name
    expect(snap.context.errors.length).toBeGreaterThan(0);
    expect(snap.context.errors[0].storyKey).toBe('parent-story:g1');
  });

  it('allPassed guard: returns false when fewer verdicts collected than check tasks (skipped task does not count as pass)', async () => {
    // Two check tasks: check-a passes, check-b is missing from config → skipped, no verdict.
    // allPassed must return false because only 1/2 verdicts were collected.
    // With max_retries=1, after one cycle: allPassed=false, maxRetries(1>=1)=true → maxedOut.
    const input = makeInput({
      gate: { gate: 'g1', check: ['check-a', 'check-b'], fix: [], pass_when: 'all_pass', max_retries: 1, circuit_breaker: 'default' },
    });
    // Only check-a is in the workflow tasks; check-b is intentionally missing.
    (input.config as unknown as { workflow: { tasks: Record<string, unknown> } }).workflow.tasks['check-a'] = { agent: 'test-agent', session: 'fresh', source_access: true };
    // check-b is absent from tasks — it will be silently skipped in checkPhaseActor.
    mockDispatchTaskCore.mockResolvedValueOnce(makeOut(PASS)); // check-a passes
    const { snap } = await run(input);
    // Must NOT be 'passed' — only 1 of 2 check tasks produced a verdict.
    expect(snap.value).toBe('maxedOut');
    expect(snap.context.verdicts['check-a']).toBe(PASS);
    expect(snap.context.verdicts['check-b']).toBeUndefined();
  });

  it('INTERRUPT mid-loop: signal.aborted check prevents processing subsequent tasks', async () => {
    // Two check tasks; first completes, second is blocked.
    // INTERRUPT fires while second task is waiting → machine reaches interrupted.
    const input = makeInput({
      gate: { gate: 'g1', check: ['check-a', 'check-b'], fix: [], pass_when: 'all_pass', max_retries: 3, circuit_breaker: 'default' },
    });
    (input.config as unknown as { workflow: { tasks: Record<string, unknown> } }).workflow.tasks['check-a'] = { agent: 'test-agent', session: 'fresh', source_access: true };
    (input.config as unknown as { workflow: { tasks: Record<string, unknown> } }).workflow.tasks['check-b'] = { agent: 'test-agent', session: 'fresh', source_access: true };
    let unblockB: (() => void) | undefined;
    mockDispatchTaskCore
      .mockResolvedValueOnce(makeOut(PASS)) // check-a completes immediately
      .mockImplementationOnce(() => new Promise((resolve) => { unblockB = () => resolve(makeOut(PASS)); })); // check-b blocks
    const actor = createActor(gateMachine, { input });
    actor.start();
    // Let check-a finish, then interrupt
    await new Promise((r) => setTimeout(r, 10));
    actor.send({ type: 'INTERRUPT' });
    const snap = await waitFor(actor, (s) => s.status === 'done', { timeout: 5000 });
    unblockB?.();
    expect(snap.value).toBe('interrupted');
  });
});
