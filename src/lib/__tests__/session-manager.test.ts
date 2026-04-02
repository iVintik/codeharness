import { describe, it, expect } from 'vitest';
import {
  resolveSessionId,
  recordSessionId,
  getLastSessionId,
} from '../session-manager.js';
import type { SessionBoundary, SessionLookupKey } from '../session-manager.js';
import type { WorkflowState, TaskCheckpoint } from '../workflow-state.js';
import { getDefaultWorkflowState } from '../workflow-state.js';

// --- Helpers ---

function makeState(checkpoints: TaskCheckpoint[]): WorkflowState {
  return {
    ...getDefaultWorkflowState(),
    tasks_completed: checkpoints,
  };
}

function makeCheckpoint(overrides?: Partial<TaskCheckpoint>): TaskCheckpoint {
  return {
    task_name: 'implement-feature',
    story_key: '4-2-session-boundary',
    completed_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeKey(overrides?: Partial<SessionLookupKey>): SessionLookupKey {
  return {
    taskName: 'implement-feature',
    storyKey: '4-2-session-boundary',
    ...overrides,
  };
}

// --- Tests ---

describe('session-manager', () => {
  describe('resolveSessionId', () => {
    it('returns undefined for fresh boundary regardless of state', () => {
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-existing' }),
      ]);

      const result = resolveSessionId('fresh', makeKey(), state);

      expect(result).toBeUndefined();
    });

    it('returns undefined for fresh boundary with empty state', () => {
      const state = makeState([]);

      const result = resolveSessionId('fresh', makeKey(), state);

      expect(result).toBeUndefined();
    });

    it('returns undefined for continue boundary when no prior checkpoint exists', () => {
      const state = makeState([]);

      const result = resolveSessionId('continue', makeKey(), state);

      expect(result).toBeUndefined();
    });

    it('returns undefined for continue boundary when checkpoints exist but none match', () => {
      const state = makeState([
        makeCheckpoint({
          task_name: 'other-task',
          story_key: 'other-story',
          session_id: 'sess-other',
        }),
      ]);

      const result = resolveSessionId('continue', makeKey(), state);

      expect(result).toBeUndefined();
    });

    it('returns session ID from matching checkpoint for continue boundary', () => {
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-abc-123' }),
      ]);

      const result = resolveSessionId('continue', makeKey(), state);

      expect(result).toBe('sess-abc-123');
    });

    it('returns most recent session ID when multiple checkpoints exist (loop iterations)', () => {
      const state = makeState([
        makeCheckpoint({
          session_id: 'sess-iter-1',
          completed_at: '2026-04-01T00:00:00.000Z',
        }),
        makeCheckpoint({
          session_id: 'sess-iter-2',
          completed_at: '2026-04-01T01:00:00.000Z',
        }),
        makeCheckpoint({
          session_id: 'sess-iter-3',
          completed_at: '2026-04-01T02:00:00.000Z',
        }),
      ]);

      const result = resolveSessionId('continue', makeKey(), state);

      expect(result).toBe('sess-iter-3');
    });

    it('skips checkpoints with undefined session_id when looking for continue', () => {
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-first' }),
        makeCheckpoint({ session_id: undefined }),
      ]);

      const result = resolveSessionId('continue', makeKey(), state);

      // Most recent checkpoint has undefined session_id, so it's skipped
      expect(result).toBe('sess-first');
    });

    it('matches on both taskName and storyKey', () => {
      const state = makeState([
        makeCheckpoint({
          task_name: 'implement-feature',
          story_key: 'wrong-story',
          session_id: 'sess-wrong-story',
        }),
        makeCheckpoint({
          task_name: 'wrong-task',
          story_key: '4-2-session-boundary',
          session_id: 'sess-wrong-task',
        }),
        makeCheckpoint({
          task_name: 'implement-feature',
          story_key: '4-2-session-boundary',
          session_id: 'sess-correct',
        }),
      ]);

      const result = resolveSessionId('continue', makeKey(), state);

      expect(result).toBe('sess-correct');
    });

    it('defaults to fresh behavior when boundary is fresh (schema default)', () => {
      // This test verifies that the default session value (fresh) produces no resume
      const boundary: SessionBoundary = 'fresh'; // workflow schema default
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-should-not-use' }),
      ]);

      const result = resolveSessionId(boundary, makeKey(), state);

      expect(result).toBeUndefined();
    });

    it('returns undefined for unknown boundary value (defensive fallback to fresh)', () => {
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-existing' }),
      ]);

      // Force an invalid boundary value to test defensive check
      const result = resolveSessionId('invalid' as SessionBoundary, makeKey(), state);

      expect(result).toBeUndefined();
    });
  });

  describe('recordSessionId', () => {
    it('returns a new state with session_id on the checkpoint', () => {
      const originalState = makeState([]);

      const newState = recordSessionId(makeKey(), 'sess-new-123', originalState);

      expect(newState.tasks_completed).toHaveLength(1);
      expect(newState.tasks_completed[0].session_id).toBe('sess-new-123');
      expect(newState.tasks_completed[0].task_name).toBe('implement-feature');
      expect(newState.tasks_completed[0].story_key).toBe('4-2-session-boundary');
      expect(newState.tasks_completed[0].completed_at).toBeTruthy();
    });

    it('does not mutate the original state', () => {
      const originalState = makeState([]);
      const originalLength = originalState.tasks_completed.length;

      recordSessionId(makeKey(), 'sess-new', originalState);

      expect(originalState.tasks_completed.length).toBe(originalLength);
    });

    it('appends to existing checkpoints', () => {
      const existingCheckpoint = makeCheckpoint({ session_id: 'sess-existing' });
      const originalState = makeState([existingCheckpoint]);

      const newState = recordSessionId(makeKey(), 'sess-appended', originalState);

      expect(newState.tasks_completed).toHaveLength(2);
      expect(newState.tasks_completed[0].session_id).toBe('sess-existing');
      expect(newState.tasks_completed[1].session_id).toBe('sess-appended');
    });

    it('throws when sessionId is empty string', () => {
      const state = makeState([]);

      expect(() => recordSessionId(makeKey(), '', state)).toThrow(
        'recordSessionId: sessionId must be a non-empty string',
      );
    });

    it('preserves other state fields', () => {
      const originalState: WorkflowState = {
        ...getDefaultWorkflowState(),
        workflow_name: 'test-workflow',
        iteration: 5,
        phase: 'execute',
      };

      const newState = recordSessionId(makeKey(), 'sess-new', originalState);

      expect(newState.workflow_name).toBe('test-workflow');
      expect(newState.iteration).toBe(5);
      expect(newState.phase).toBe('execute');
    });
  });

  describe('getLastSessionId', () => {
    it('returns undefined when no checkpoints exist', () => {
      const state = makeState([]);

      const result = getLastSessionId(state, 'any-task', 'any-story');

      expect(result).toBeUndefined();
    });

    it('returns undefined when no matching checkpoint exists', () => {
      const state = makeState([
        makeCheckpoint({
          task_name: 'other-task',
          story_key: 'other-story',
          session_id: 'sess-other',
        }),
      ]);

      const result = getLastSessionId(state, 'my-task', 'my-story');

      expect(result).toBeUndefined();
    });

    it('returns the most recent match (reverse order)', () => {
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-old' }),
        makeCheckpoint({ session_id: 'sess-new' }),
      ]);

      const result = getLastSessionId(state, 'implement-feature', '4-2-session-boundary');

      expect(result).toBe('sess-new');
    });

    it('skips checkpoints where session_id is undefined', () => {
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-has-id' }),
        makeCheckpoint({ session_id: undefined }),
      ]);

      const result = getLastSessionId(state, 'implement-feature', '4-2-session-boundary');

      expect(result).toBe('sess-has-id');
    });

    it('returns undefined when matching checkpoints have no session_id', () => {
      const state = makeState([
        makeCheckpoint({ session_id: undefined }),
      ]);

      const result = getLastSessionId(state, 'implement-feature', '4-2-session-boundary');

      expect(result).toBeUndefined();
    });

    it('returns empty string session_id when present (does not skip it)', () => {
      // After recordSessionId validation, empty strings should never appear,
      // but getLastSessionId should not silently skip them if they do.
      const state = makeState([
        makeCheckpoint({ session_id: '' }),
      ]);

      const result = getLastSessionId(state, 'implement-feature', '4-2-session-boundary');

      // Empty string is not undefined, so it IS returned
      expect(result).toBe('');
    });
  });

  describe('crash recovery scenario', () => {
    it('session ID retrieved from deserialized state (simulating disk round-trip)', () => {
      // Simulate a state that was previously persisted and then read back from disk.
      // The workflow-engine would call readWorkflowState() which returns a WorkflowState.
      // We verify that resolveSessionId works correctly with such deserialized state.
      const deserializedState: WorkflowState = {
        workflow_name: 'harness-run',
        started: '2026-04-01T00:00:00.000Z',
        iteration: 3,
        phase: 'execute',
        tasks_completed: [
          {
            task_name: 'implement-feature',
            story_key: '4-2-session-boundary',
            completed_at: '2026-04-01T01:00:00.000Z',
            session_id: 'sess-persisted-abc',
          },
          {
            task_name: 'write-tests',
            story_key: '4-2-session-boundary',
            completed_at: '2026-04-01T02:00:00.000Z',
            session_id: 'sess-persisted-def',
          },
        ],
        evaluator_scores: [],
        circuit_breaker: {
          triggered: false,
          reason: null,
          score_history: [],
        },
      };

      // After crash recovery, the engine calls resolveSessionId with the persisted state
      const sessionId = resolveSessionId(
        'continue',
        { taskName: 'implement-feature', storyKey: '4-2-session-boundary' },
        deserializedState,
      );

      expect(sessionId).toBe('sess-persisted-abc');

      // Different task in the same story gets its own session
      const testSessionId = resolveSessionId(
        'continue',
        { taskName: 'write-tests', storyKey: '4-2-session-boundary' },
        deserializedState,
      );

      expect(testSessionId).toBe('sess-persisted-def');
    });
  });

  describe('loop iteration behavior', () => {
    it('fresh in loop: returns undefined for every iteration', () => {
      // Simulate a loop where previous iterations already recorded checkpoints
      const state = makeState([
        makeCheckpoint({ session_id: 'sess-loop-1' }),
        makeCheckpoint({ session_id: 'sess-loop-2' }),
      ]);

      // Each loop iteration with session: fresh starts a new session
      const iter3 = resolveSessionId('fresh', makeKey(), state);
      expect(iter3).toBeUndefined();
    });

    it('continue in loop: returns session ID from previous iteration', () => {
      // Simulate loop iteration 1 completed
      const stateAfterIter1 = makeState([
        makeCheckpoint({ session_id: 'sess-loop-iter-1' }),
      ]);

      // Iteration 2 should continue from iteration 1
      const iter2SessionId = resolveSessionId('continue', makeKey(), stateAfterIter1);
      expect(iter2SessionId).toBe('sess-loop-iter-1');

      // After iteration 2 completes, record its session
      const stateAfterIter2 = recordSessionId(makeKey(), 'sess-loop-iter-2', stateAfterIter1);

      // Iteration 3 should continue from iteration 2 (most recent)
      const iter3SessionId = resolveSessionId('continue', makeKey(), stateAfterIter2);
      expect(iter3SessionId).toBe('sess-loop-iter-2');
    });

    it('fresh in loop: each iteration session ID is independently recorded', () => {
      let state = makeState([]);

      // Simulate 3 loop iterations, each recording independently
      state = recordSessionId(makeKey(), 'sess-fresh-1', state);
      state = recordSessionId(makeKey(), 'sess-fresh-2', state);
      state = recordSessionId(makeKey(), 'sess-fresh-3', state);

      expect(state.tasks_completed).toHaveLength(3);
      expect(state.tasks_completed[0].session_id).toBe('sess-fresh-1');
      expect(state.tasks_completed[1].session_id).toBe('sess-fresh-2');
      expect(state.tasks_completed[2].session_id).toBe('sess-fresh-3');
    });
  });
});
