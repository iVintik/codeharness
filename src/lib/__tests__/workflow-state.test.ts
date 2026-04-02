import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeWorkflowState,
  readWorkflowState,
  getDefaultWorkflowState,
  type WorkflowState,
  type TaskCheckpoint,
  type EvaluatorScore,
  type CircuitBreakerState,
} from '../workflow-state.js';

vi.mock('../output.js', () => ({
  warn: vi.fn(),
}));

import { warn } from '../output.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-wfstate-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function buildFullState(): WorkflowState {
  return {
    workflow_name: 'default',
    started: '2026-04-02T14:30:00.000Z',
    iteration: 2,
    phase: 'verify',
    tasks_completed: [
      {
        task_name: 'implement',
        story_key: '1-3-workflow-state-module',
        completed_at: '2026-04-02T14:31:00.000Z',
        session_id: 'sess_abc123',
      },
      {
        task_name: 'verify',
        story_key: '1-3-workflow-state-module',
        completed_at: '2026-04-02T14:35:00.000Z',
      },
    ],
    evaluator_scores: [
      {
        iteration: 1,
        passed: 3,
        failed: 1,
        unknown: 0,
        total: 4,
        timestamp: '2026-04-02T14:35:00.000Z',
      },
    ],
    circuit_breaker: {
      triggered: false,
      reason: null,
      score_history: [0.75],
    },
  };
}

describe('getDefaultWorkflowState', () => {
  it('returns correct default shape and types', () => {
    const state = getDefaultWorkflowState();
    expect(state.workflow_name).toBe('');
    expect(state.started).toBe('');
    expect(state.iteration).toBe(0);
    expect(state.phase).toBe('idle');
    expect(state.tasks_completed).toEqual([]);
    expect(state.evaluator_scores).toEqual([]);
    expect(state.circuit_breaker).toEqual({
      triggered: false,
      reason: null,
      score_history: [],
    });
  });

  it('returns a new object each call (no shared references)', () => {
    const a = getDefaultWorkflowState();
    const b = getDefaultWorkflowState();
    expect(a).not.toBe(b);
    expect(a.tasks_completed).not.toBe(b.tasks_completed);
    expect(a.circuit_breaker).not.toBe(b.circuit_breaker);
  });
});

describe('writeWorkflowState', () => {
  it('creates .codeharness/ directory if missing', () => {
    const state = getDefaultWorkflowState();
    writeWorkflowState(state, testDir);
    expect(existsSync(join(testDir, '.codeharness'))).toBe(true);
    expect(existsSync(join(testDir, '.codeharness', 'workflow-state.yaml'))).toBe(true);
  });

  it('writes valid YAML that can be parsed', () => {
    const state = buildFullState();
    writeWorkflowState(state, testDir);
    const raw = readFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), 'utf-8');
    expect(raw).toContain('workflow_name: default');
    expect(raw).toContain('phase: verify');
    expect(raw).toContain('iteration: 2');
  });

  it('overwrites existing file completely', () => {
    const state1 = buildFullState();
    state1.phase = 'first';
    writeWorkflowState(state1, testDir);

    const state2 = getDefaultWorkflowState();
    state2.phase = 'second';
    writeWorkflowState(state2, testDir);

    const raw = readFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), 'utf-8');
    expect(raw).toContain('phase: second');
    expect(raw).not.toContain('phase: first');
  });

  it('handles nested .codeharness directory already existing', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const state = getDefaultWorkflowState();
    writeWorkflowState(state, testDir);
    expect(existsSync(join(testDir, '.codeharness', 'workflow-state.yaml'))).toBe(true);
  });
});

describe('readWorkflowState', () => {
  it('returns default state when file does not exist', () => {
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
  });

  it('does not warn when file simply does not exist', () => {
    readWorkflowState(testDir);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns default state and warns on corrupted YAML', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), '{{{{not yaml at all', 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid YAML'));
  });

  it('returns default state and warns on empty file', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), '', 'utf-8');
    // Empty string parses to null in yaml, which fails shape check
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('returns default state and warns on invalid shape (missing fields)', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    writeFileSync(
      join(testDir, '.codeharness', 'workflow-state.yaml'),
      'workflow_name: test\niteration: 1\n',
      'utf-8',
    );
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('returns default state and warns when file exists but is unreadable (e.g. directory)', () => {
    mkdirSync(join(testDir, '.codeharness', 'workflow-state.yaml'), { recursive: true });
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
  });

  it('returns default state and warns when circuit_breaker is missing', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const partial = `workflow_name: test
started: "2026-01-01T00:00:00Z"
iteration: 1
phase: idle
tasks_completed: []
evaluator_scores: []
`;
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), partial, 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalled();
  });
});

describe('round-trip fidelity', () => {
  it('write then read preserves all fields', () => {
    const original = buildFullState();
    writeWorkflowState(original, testDir);
    const restored = readWorkflowState(testDir);
    expect(restored).toEqual(original);
  });

  it('preserves tasks_completed with optional session_id', () => {
    const state = getDefaultWorkflowState();
    state.tasks_completed = [
      { task_name: 'a', story_key: 'k', completed_at: '2026-01-01T00:00:00Z', session_id: 's1' },
      { task_name: 'b', story_key: 'k', completed_at: '2026-01-01T00:00:00Z' },
    ];
    writeWorkflowState(state, testDir);
    const restored = readWorkflowState(testDir);
    expect(restored.tasks_completed).toHaveLength(2);
    expect(restored.tasks_completed[0].session_id).toBe('s1');
    expect(restored.tasks_completed[1].session_id).toBeUndefined();
  });

  it('preserves circuit_breaker.reason as null', () => {
    const state = getDefaultWorkflowState();
    state.circuit_breaker.reason = null;
    writeWorkflowState(state, testDir);
    const restored = readWorkflowState(testDir);
    expect(restored.circuit_breaker.reason).toBeNull();
  });

  it('preserves circuit_breaker.reason as string', () => {
    const state = getDefaultWorkflowState();
    state.circuit_breaker.reason = 'score too low';
    state.circuit_breaker.triggered = true;
    writeWorkflowState(state, testDir);
    const restored = readWorkflowState(testDir);
    expect(restored.circuit_breaker.reason).toBe('score too low');
    expect(restored.circuit_breaker.triggered).toBe(true);
  });
});

describe('cross-process persistence', () => {
  it('state survives write in one scope and read in another', () => {
    const original = buildFullState();

    // Simulate "process 1" writing
    writeWorkflowState(original, testDir);

    // Simulate "process 2" reading (new function scope, fresh call)
    const restored = readWorkflowState(testDir);
    expect(restored).toEqual(original);
  });
});

describe('array element validation', () => {
  it('rejects tasks_completed with invalid element types', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const yaml = `workflow_name: test
started: "2026-01-01T00:00:00Z"
iteration: 1
phase: idle
tasks_completed:
  - 42
  - "garbage"
evaluator_scores: []
circuit_breaker:
  triggered: false
  reason: null
  score_history: []
`;
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), yaml, 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('rejects tasks_completed with missing required fields', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const yaml = `workflow_name: test
started: "2026-01-01T00:00:00Z"
iteration: 1
phase: idle
tasks_completed:
  - task_name: implement
evaluator_scores: []
circuit_breaker:
  triggered: false
  reason: null
  score_history: []
`;
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), yaml, 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('rejects evaluator_scores with invalid element types', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const yaml = `workflow_name: test
started: "2026-01-01T00:00:00Z"
iteration: 1
phase: idle
tasks_completed: []
evaluator_scores:
  - "not an object"
circuit_breaker:
  triggered: false
  reason: null
  score_history: []
`;
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), yaml, 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('rejects evaluator_scores with missing required number fields', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const yaml = `workflow_name: test
started: "2026-01-01T00:00:00Z"
iteration: 1
phase: idle
tasks_completed: []
evaluator_scores:
  - iteration: 1
    passed: "not a number"
    failed: 0
    unknown: 0
    total: 1
    timestamp: "2026-01-01T00:00:00Z"
circuit_breaker:
  triggered: false
  reason: null
  score_history: []
`;
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), yaml, 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('rejects score_history with non-number elements', () => {
    mkdirSync(join(testDir, '.codeharness'), { recursive: true });
    const yaml = `workflow_name: test
started: "2026-01-01T00:00:00Z"
iteration: 1
phase: idle
tasks_completed: []
evaluator_scores: []
circuit_breaker:
  triggered: false
  reason: null
  score_history:
    - "not a number"
    - 0.75
`;
    writeFileSync(join(testDir, '.codeharness', 'workflow-state.yaml'), yaml, 'utf-8');
    const state = readWorkflowState(testDir);
    expect(state).toEqual(getDefaultWorkflowState());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid shape'));
  });

  it('accepts valid tasks_completed and evaluator_scores elements', () => {
    const state = buildFullState();
    writeWorkflowState(state, testDir);
    const restored = readWorkflowState(testDir);
    expect(restored.tasks_completed).toHaveLength(2);
    expect(restored.evaluator_scores).toHaveLength(1);
  });
});

describe('concurrent/sequential writes', () => {
  it('last write wins with rapid sequential writes', () => {
    const state1: WorkflowState = { ...getDefaultWorkflowState(), phase: 'first' };
    const state2: WorkflowState = { ...getDefaultWorkflowState(), phase: 'second' };
    const state3: WorkflowState = { ...getDefaultWorkflowState(), phase: 'third' };

    writeWorkflowState(state1, testDir);
    writeWorkflowState(state2, testDir);
    writeWorkflowState(state3, testDir);

    const result = readWorkflowState(testDir);
    expect(result.phase).toBe('third');
  });

  it('file always contains complete valid YAML after sequential writes', () => {
    for (let i = 0; i < 10; i++) {
      const state = getDefaultWorkflowState();
      state.iteration = i;
      state.phase = `phase-${i}`;
      writeWorkflowState(state, testDir);
    }
    const result = readWorkflowState(testDir);
    expect(result.iteration).toBe(9);
    expect(result.phase).toBe('phase-9');
  });
});
