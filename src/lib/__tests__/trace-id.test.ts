import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateTraceId,
  sanitizeSegment,
  formatTracePrompt,
  recordTraceId,
} from '../trace-id.js';
import {
  getDefaultWorkflowState,
  writeWorkflowState,
  readWorkflowState,
  type WorkflowState,
} from '../workflow-state.js';

vi.mock('../output.js', () => ({
  warn: vi.fn(),
}));

// --- Helpers ---

function makeState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    ...getDefaultWorkflowState(),
    ...overrides,
  };
}

// --- Tests ---

describe('trace-id', () => {
  describe('sanitizeSegment', () => {
    it('passes through alphanumeric strings unchanged', () => {
      expect(sanitizeSegment('abc123')).toBe('abc123');
    });

    it('replaces spaces with hyphens', () => {
      expect(sanitizeSegment('run with spaces')).toBe('run-with-spaces');
    });

    it('replaces slashes and backslashes', () => {
      expect(sanitizeSegment('a/b\\c')).toBe('a-b-c');
    });

    it('replaces dots', () => {
      expect(sanitizeSegment('d.e')).toBe('d-e');
    });

    it('collapses consecutive hyphens', () => {
      expect(sanitizeSegment('a--b---c')).toBe('a-b-c');
    });

    it('trims leading and trailing hyphens', () => {
      expect(sanitizeSegment('-abc-')).toBe('abc');
    });

    it('handles unicode characters', () => {
      expect(sanitizeSegment('héllo wörld')).toBe('h-llo-w-rld');
    });

    it('returns empty string for empty input', () => {
      expect(sanitizeSegment('')).toBe('');
    });

    it('returns empty string for all-special-character input', () => {
      expect(sanitizeSegment('///...')).toBe('');
    });
  });

  describe('generateTraceId', () => {
    it('produces correct format for simple inputs', () => {
      expect(generateTraceId('abc123', 2, 'verify')).toBe('ch-abc123-2-verify');
    });

    it('sanitizes runId with spaces', () => {
      expect(generateTraceId('run with spaces', 1, 'implement')).toBe(
        'ch-run-with-spaces-1-implement',
      );
    });

    it('sanitizes slashes, backslashes, and dots', () => {
      expect(generateTraceId('a/b\\c', 0, 'd.e')).toBe('ch-a-b-c-0-d-e');
    });

    it('handles empty runId gracefully', () => {
      const result = generateTraceId('', 1, 'verify');
      expect(result).toBe('ch--1-verify');
    });

    it('handles empty taskName gracefully', () => {
      const result = generateTraceId('abc', 1, '');
      expect(result).toBe('ch-abc-1-');
    });

    it('handles zero iteration', () => {
      expect(generateTraceId('run1', 0, 'init')).toBe('ch-run1-0-init');
    });

    it('handles large iteration numbers', () => {
      expect(generateTraceId('run1', 999, 'retry')).toBe('ch-run1-999-retry');
    });

    it('throws on negative iteration', () => {
      expect(() => generateTraceId('abc', -1, 'test')).toThrow(
        'generateTraceId: iteration must be a non-negative integer',
      );
    });

    it('throws on NaN iteration', () => {
      expect(() => generateTraceId('abc', NaN, 'test')).toThrow(
        'generateTraceId: iteration must be a non-negative integer',
      );
    });

    it('throws on Infinity iteration', () => {
      expect(() => generateTraceId('abc', Infinity, 'test')).toThrow(
        'generateTraceId: iteration must be a non-negative integer',
      );
    });

    it('throws on float iteration', () => {
      expect(() => generateTraceId('abc', 1.5, 'test')).toThrow(
        'generateTraceId: iteration must be a non-negative integer',
      );
    });

    it('truncates very long runId segments', () => {
      const result = generateTraceId('a'.repeat(200), 0, 'test');
      // 'ch-' + 128 chars + '-0-test' = 138
      expect(result.length).toBeLessThanOrEqual(138);
      expect(result).toMatch(/^ch-a{128}-0-test$/);
    });

    it('truncates very long taskName segments', () => {
      const result = generateTraceId('run', 0, 'b'.repeat(200));
      expect(result).toMatch(/^ch-run-0-b{128}$/);
    });
  });

  describe('formatTracePrompt', () => {
    it('returns string containing trace_id=<value>', () => {
      const result = formatTracePrompt('ch-abc-1-dev');
      expect(result).toContain('trace_id=ch-abc-1-dev');
    });

    it('starts with [TRACE] marker', () => {
      const result = formatTracePrompt('ch-abc-1-dev');
      expect(result).toMatch(/^\[TRACE\]/);
    });

    it('includes instruction text about including trace ID in logs', () => {
      const result = formatTracePrompt('ch-abc-1-dev');
      expect(result).toContain('Include this trace ID');
      expect(result).toContain('log output');
      expect(result).toContain('metric labels');
      expect(result).toContain('trace spans');
    });

    it('throws on empty traceId', () => {
      expect(() => formatTracePrompt('')).toThrow(
        'formatTracePrompt: traceId must be a non-empty string',
      );
    });
  });

  describe('recordTraceId', () => {
    it('appends trace ID to trace_ids array', () => {
      const state = makeState();
      const newState = recordTraceId('ch-abc-1-dev', state);
      expect(newState.trace_ids).toEqual(['ch-abc-1-dev']);
    });

    it('does not mutate the input state', () => {
      const state = makeState({ trace_ids: ['ch-existing'] });
      const originalIds = state.trace_ids;

      recordTraceId('ch-new', state);

      expect(state.trace_ids).toBe(originalIds);
      expect(state.trace_ids).toEqual(['ch-existing']);
    });

    it('appends to existing trace_ids', () => {
      const state = makeState({ trace_ids: ['ch-first'] });
      const newState = recordTraceId('ch-second', state);
      expect(newState.trace_ids).toEqual(['ch-first', 'ch-second']);
    });

    it('handles state with undefined trace_ids', () => {
      const state = makeState();
      delete (state as unknown as Record<string, unknown>).trace_ids;
      const newState = recordTraceId('ch-abc-1-dev', state);
      expect(newState.trace_ids).toEqual(['ch-abc-1-dev']);
    });

    it('throws on empty traceId', () => {
      const state = makeState();
      expect(() => recordTraceId('', state)).toThrow(
        'recordTraceId: traceId must be a non-empty string',
      );
    });

    it('preserves other state fields', () => {
      const state = makeState({
        workflow_name: 'test-workflow',
        iteration: 5,
        phase: 'execute',
      });

      const newState = recordTraceId('ch-abc-1-dev', state);

      expect(newState.workflow_name).toBe('test-workflow');
      expect(newState.iteration).toBe(5);
      expect(newState.phase).toBe('execute');
    });

    it('accumulates trace IDs in order across multiple calls', () => {
      let state = makeState();
      state = recordTraceId('ch-run1-0-init', state);
      state = recordTraceId('ch-run1-1-implement', state);
      state = recordTraceId('ch-run1-2-verify', state);

      expect(state.trace_ids).toEqual([
        'ch-run1-0-init',
        'ch-run1-1-implement',
        'ch-run1-2-verify',
      ]);
    });
  });

  describe('round-trip persistence', () => {
    let testDir: string;

    beforeEach(() => {
      testDir = mkdtempSync(join(tmpdir(), 'ch-traceid-test-'));
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('write state with trace_ids, read it back, array matches', () => {
      const state = makeState({
        workflow_name: 'round-trip-test',
        started: '2026-04-03T00:00:00.000Z',
        trace_ids: ['ch-abc-0-init', 'ch-abc-1-implement', 'ch-abc-2-verify'],
      });

      writeWorkflowState(state, testDir);
      const restored = readWorkflowState(testDir);

      expect(restored.trace_ids).toEqual([
        'ch-abc-0-init',
        'ch-abc-1-implement',
        'ch-abc-2-verify',
      ]);
    });

    it('persists empty trace_ids array', () => {
      const state = makeState({ trace_ids: [] });
      writeWorkflowState(state, testDir);
      const restored = readWorkflowState(testDir);
      expect(restored.trace_ids).toEqual([]);
    });

    it('multiple recordTraceId calls persist correctly', () => {
      let state = makeState({
        workflow_name: 'multi-iter-test',
        started: '2026-04-03T00:00:00.000Z',
      });

      state = recordTraceId('ch-run1-0-init', state);
      state = recordTraceId('ch-run1-1-implement', state);
      state = recordTraceId('ch-run1-2-verify', state);

      writeWorkflowState(state, testDir);
      const restored = readWorkflowState(testDir);

      expect(restored.trace_ids).toEqual([
        'ch-run1-0-init',
        'ch-run1-1-implement',
        'ch-run1-2-verify',
      ]);
    });
  });
});
