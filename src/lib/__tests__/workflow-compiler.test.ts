/**
 * Tests for workflow-compiler module functions.
 *
 * Covers: PER_RUN_SENTINEL, isTaskCompleted, isLoopTaskCompleted,
 * buildRetryPrompt, buildAllUnknownVerdict, getFailedItems.
 */

import { describe, it, expect } from 'vitest';
import {
  HALT_ERROR_CODES,
  DEFAULT_MAX_ITERATIONS,
  isTaskCompleted,
  isLoopTaskCompleted,
  buildRetryPrompt,
  buildAllUnknownVerdict,
  getFailedItems,
  PER_RUN_SENTINEL,
  isLoopBlock,
  recordErrorInState,
  isEngineError,
  handleDispatchError,
} from '../workflow-compiler.js';
import { DispatchError } from '../agent-dispatch.js';
import type { WorkItem } from '../workflow-types.js';
import type { WorkflowState } from '../workflow-state.js';
import type { EvaluatorVerdict } from '../verdict-parser.js';

// ─── Helpers ─────────────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('PER_RUN_SENTINEL', () => {
  it('should be __run__', () => {
    expect(PER_RUN_SENTINEL).toBe('__run__');
  });
});

describe('HALT_ERROR_CODES', () => {
  it('includes the halt-critical driver error codes', () => {
    expect(HALT_ERROR_CODES.has('RATE_LIMIT')).toBe(true);
    expect(HALT_ERROR_CODES.has('NETWORK')).toBe(true);
    expect(HALT_ERROR_CODES.has('SDK_INIT')).toBe(true);
  });

  it('does not include non-halting codes', () => {
    expect(HALT_ERROR_CODES.has('UNKNOWN')).toBe(false);
    expect(HALT_ERROR_CODES.has('AUTH')).toBe(false);
  });
});

describe('DEFAULT_MAX_ITERATIONS', () => {
  it('defaults to 5', () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(5);
  });
});

describe('isTaskCompleted', () => {
  it('returns true when task+story found in completed array', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(true);
  });

  it('returns false when task+story not found', () => {
    const state = makeDefaultState();
    expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(false);
  });

  it('returns false for error checkpoints', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z', error: true },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '1-1-foo')).toBe(false);
  });

  it('returns true when (taskName, storyKey) tuple matches a checkpoint', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '3-1-foo')).toBe(true);
  });

  it('returns false when taskName matches but storyKey does not', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'implement', '3-2-bar')).toBe(false);
  });

  it('returns false when storyKey matches but taskName does not', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'verify', '3-1-foo')).toBe(false);
  });

  it('returns false when tasks_completed is empty', () => {
    const state = makeDefaultState({ tasks_completed: [] });
    expect(isTaskCompleted(state, 'implement', '3-1-foo')).toBe(false);
  });

  it('returns true for per-run sentinel key', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'verify', story_key: '__run__', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isTaskCompleted(state, 'verify', PER_RUN_SENTINEL)).toBe(true);
  });
});

describe('isLoopTaskCompleted', () => {
  it('returns true when completion count >= iteration', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'check', story_key: '1-1-foo', completed_at: '2026-01-01T00:00:00Z' },
        { task_name: 'check', story_key: '1-1-foo', completed_at: '2026-01-01T00:01:00Z' },
      ],
    });
    expect(isLoopTaskCompleted(state, 'check', '1-1-foo', 2)).toBe(true);
    expect(isLoopTaskCompleted(state, 'check', '1-1-foo', 3)).toBe(false);
  });

  it('returns true when checkpoint count >= iteration', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:01:00Z' },
      ],
    });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(true);
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(true);
  });

  it('returns false when checkpoint count < iteration', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(false);
  });

  it('returns false when no checkpoints exist', () => {
    const state = makeDefaultState({ tasks_completed: [] });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(false);
  });

  it('excludes error checkpoints from count', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:00:00Z' },
        { task_name: 'retry', story_key: '3-1-foo', completed_at: '2026-04-03T00:01:00Z', error: true },
      ],
    });
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 2)).toBe(false);
    expect(isLoopTaskCompleted(state, 'retry', '3-1-foo', 1)).toBe(true);
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

  it('builds prompt with failed and unknown findings', () => {
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
    expect(prompt).not.toContain('AC #2');
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

  it('includes unknown findings even when there are no failures', () => {
    const prompt = buildRetryPrompt('5-1-foo', [
      {
        ac: 1,
        description: 'Could not confirm lint',
        status: 'unknown',
        evidence: { commands_run: [], output_observed: '', reasoning: 'command timed out' },
      },
    ]);
    expect(prompt).toContain('AC #1 (UNKNOWN): Could not confirm lint');
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

  it('numbers acceptance criteria sequentially in descriptions', () => {
    const verdict = buildAllUnknownVerdict([{ key: '1', source: 'sprint' }, { key: '2', source: 'issues' }], 'timeout');
    expect(verdict.findings.map((finding) => finding.description)).toEqual(['AC #1', 'AC #2']);
  });

  it('copies the provided reasoning into every finding', () => {
    const verdict = buildAllUnknownVerdict([{ key: '1', source: 'sprint' }], 'evaluator unavailable');
    expect(verdict.findings[0].evidence.reasoning).toBe('evaluator unavailable');
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

  it('returns an empty array unchanged when there are no work items', () => {
    const verdict: EvaluatorVerdict = { verdict: 'fail', score: { passed: 0, failed: 1, unknown: 0, total: 1 }, findings: [] };
    expect(getFailedItems(verdict, [])).toEqual([]);
  });
});

describe('isLoopBlock', () => {
  it('returns true for loop block objects', () => {
    expect(isLoopBlock({ loop: ['implement', 'verify'] })).toBe(true);
  });

  it('returns false for string flow steps', () => {
    expect(isLoopBlock('implement')).toBe(false);
  });

  it('returns false for nullish values cast as flow steps', () => {
    expect(isLoopBlock(null as never)).toBe(false);
  });

  it('returns false for plain objects without a loop property', () => {
    expect(isLoopBlock({ task: 'implement' } as never)).toBe(false);
  });
});

describe('recordErrorInState', () => {
  it('sets phase to error and appends an error checkpoint', () => {
    const state = makeDefaultState();
    const next = recordErrorInState(state, 'implement', '5-1-foo', {
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'UNKNOWN',
      message: 'boom',
    });

    expect(next.phase).toBe('error');
    expect(next.tasks_completed).toHaveLength(1);
    expect(next.tasks_completed[0]).toMatchObject({
      task_name: 'implement',
      story_key: '5-1-foo',
      error: true,
      error_code: 'UNKNOWN',
      error_message: 'boom',
    });
  });

  it('preserves existing checkpoints when appending an error checkpoint', () => {
    const state = makeDefaultState({
      tasks_completed: [
        { task_name: 'implement', story_key: '5-1-foo', completed_at: '2026-04-03T00:00:00Z' },
      ],
    });

    const next = recordErrorInState(state, 'verify', PER_RUN_SENTINEL, {
      taskName: 'verify',
      storyKey: PER_RUN_SENTINEL,
      code: 'RATE_LIMIT',
      message: 'too many requests',
    });

    expect(next.tasks_completed).toHaveLength(2);
    expect(next.tasks_completed[0].task_name).toBe('implement');
    expect(next.tasks_completed[1]).toMatchObject({
      task_name: 'verify',
      story_key: PER_RUN_SENTINEL,
      error: true,
      error_code: 'RATE_LIMIT',
    });
  });

  it('keeps the original state object untouched', () => {
    const state = makeDefaultState();
    recordErrorInState(state, 'implement', '5-1-foo', {
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'UNKNOWN',
      message: 'boom',
    });
    expect(state.phase).toBe('idle');
    expect(state.tasks_completed).toEqual([]);
  });
});

describe('isEngineError', () => {
  it('returns true for valid engine error objects', () => {
    expect(isEngineError({
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'UNKNOWN',
      message: 'boom',
    })).toBe(true);
  });

  it('returns false for null and primitive values', () => {
    expect(isEngineError(null)).toBe(false);
    expect(isEngineError('boom')).toBe(false);
  });

  it('returns false when required fields are missing or wrong types', () => {
    expect(isEngineError({ taskName: 'implement', storyKey: '5-1-foo', code: 123, message: 'boom' })).toBe(false);
    expect(isEngineError({ taskName: 'implement', code: 'UNKNOWN', message: 'boom' })).toBe(false);
  });

  it('returns false when the message field is not a string', () => {
    expect(isEngineError({ taskName: 'implement', storyKey: '5-1-foo', code: 'UNKNOWN', message: 42 })).toBe(false);
  });
});

describe('handleDispatchError', () => {
  it('maps DispatchError instances to engine errors', () => {
    const err = new DispatchError('rate limited', 'RATE_LIMIT', 'dev', new Error('inner'));
    expect(handleDispatchError(err, 'implement', '5-1-foo')).toEqual({
      taskName: 'implement',
      storyKey: '5-1-foo',
      code: 'RATE_LIMIT',
      message: 'rate limited',
    });
  });

  it('maps generic Error instances to UNKNOWN engine errors', () => {
    expect(handleDispatchError(new Error('kaboom'), 'verify', PER_RUN_SENTINEL)).toEqual({
      taskName: 'verify',
      storyKey: PER_RUN_SENTINEL,
      code: 'UNKNOWN',
      message: 'kaboom',
    });
  });

  it('stringifies non-Error throwables', () => {
    expect(handleDispatchError('bad response', 'verify', PER_RUN_SENTINEL)).toEqual({
      taskName: 'verify',
      storyKey: PER_RUN_SENTINEL,
      code: 'UNKNOWN',
      message: 'bad response',
    });
  });

  it('preserves the provided task and story identifiers for generic errors', () => {
    expect(handleDispatchError(new Error('broken'), 'retry', '3-1-foo')).toMatchObject({
      taskName: 'retry',
      storyKey: '3-1-foo',
      code: 'UNKNOWN',
    });
  });
});
