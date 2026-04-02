import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks (must be before imports) ---

vi.mock('../docker/index.js', () => ({
  isDockerAvailable: vi.fn(),
}));

vi.mock('../source-isolation.js', () => ({
  createIsolatedWorkspace: vi.fn(),
}));

vi.mock('../agent-dispatch.js', () => ({
  dispatchAgent: vi.fn(),
}));

vi.mock('../trace-id.js', () => ({
  formatTracePrompt: vi.fn(),
}));

// --- Imports ---

import { runEvaluator } from '../evaluator.js';
import type { EvaluatorOptions, EvaluatorResult } from '../evaluator.js';
import { isDockerAvailable } from '../docker/index.js';
import { createIsolatedWorkspace } from '../source-isolation.js';
import { dispatchAgent } from '../agent-dispatch.js';
import { formatTracePrompt } from '../trace-id.js';
import type { SubagentDefinition } from '../agent-resolver.js';
import type { IsolatedWorkspace } from '../source-isolation.js';
import type { DispatchResult } from '../agent-dispatch.js';

// --- Helpers ---

function makeAgentDef(overrides?: Partial<SubagentDefinition>): SubagentDefinition {
  return {
    name: 'evaluator',
    model: 'claude-sonnet-4-20250514',
    instructions: 'You are the evaluator.',
    disallowedTools: ['Edit', 'Write'],
    bare: true,
    ...overrides,
  };
}

function makeMockWorkspace(): IsolatedWorkspace {
  return {
    dir: '/tmp/codeharness-verify-test-run',
    storyFilesDir: '/tmp/codeharness-verify-test-run/story-files',
    verdictDir: '/tmp/codeharness-verify-test-run/verdict',
    toDispatchOptions: vi.fn().mockReturnValue({ cwd: '/tmp/codeharness-verify-test-run' }),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

function makeOptions(overrides?: Partial<EvaluatorOptions>): EvaluatorOptions {
  return {
    runId: 'test-run',
    storyFiles: ['/path/to/story-1.md', '/path/to/story-2.md'],
    agentDefinition: makeAgentDef(),
    ...overrides,
  };
}

function makeDispatchResult(overrides?: Partial<DispatchResult>): DispatchResult {
  return {
    sessionId: 'session-123',
    success: true,
    durationMs: 5000,
    output: '{"verdict":"pass","score":{"passed":2,"failed":0,"unknown":0,"total":2},"findings":[]}',
    ...overrides,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('runEvaluator', () => {
  describe('Docker unavailable', () => {
    it('returns all-UNKNOWN result without throwing when Docker is unavailable', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(false);

      const result = await runEvaluator(makeOptions());

      expect(result.dockerAvailable).toBe(false);
      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      const parsed = JSON.parse(result.output);
      expect(parsed.verdict).toBe('fail');
      expect(parsed.score.unknown).toBe(2);
      expect(parsed.score.total).toBe(2);
      expect(parsed.findings).toHaveLength(2);
      expect(parsed.findings[0].status).toBe('unknown');
      expect(parsed.findings[0].evidence.reasoning).toContain('Docker');
    });

    it('does not create workspace when Docker is unavailable', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(false);

      await runEvaluator(makeOptions());

      expect(createIsolatedWorkspace).not.toHaveBeenCalled();
      expect(dispatchAgent).not.toHaveBeenCalled();
    });
  });

  describe('workspace creation', () => {
    it('creates workspace with correct runId and storyFiles', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      await runEvaluator(makeOptions({
        runId: 'my-run-123',
        storyFiles: ['/a.md', '/b.md'],
      }));

      expect(createIsolatedWorkspace).toHaveBeenCalledWith({
        runId: 'my-run-123',
        storyFiles: ['/a.md', '/b.md'],
      });
    });
  });

  describe('successful dispatch', () => {
    it('returns agent output and success on successful dispatch', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      const dispatchResult = makeDispatchResult({ output: '{"verdict":"pass"}', success: true });
      vi.mocked(dispatchAgent).mockResolvedValue(dispatchResult);

      const result = await runEvaluator(makeOptions());

      expect(result.success).toBe(true);
      expect(result.output).toBe('{"verdict":"pass"}');
      expect(result.dockerAvailable).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('dispatches agent with workspace cwd', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      await runEvaluator(makeOptions());

      expect(dispatchAgent).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'evaluator' }),
        expect.stringContaining('story-files'),
        expect.objectContaining({ cwd: '/tmp/codeharness-verify-test-run' }),
      );
    });
  });

  describe('trace ID injection', () => {
    it('appends trace prompt when traceId is provided', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());
      vi.mocked(formatTracePrompt).mockReturnValue('[TRACE] trace_id=ch-run-0-verify');

      await runEvaluator(makeOptions({ traceId: 'ch-run-0-verify' }));

      expect(formatTracePrompt).toHaveBeenCalledWith('ch-run-0-verify');
      expect(dispatchAgent).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          appendSystemPrompt: '[TRACE] trace_id=ch-run-0-verify',
        }),
      );
    });

    it('does not set appendSystemPrompt when no traceId', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      await runEvaluator(makeOptions({ traceId: undefined }));

      expect(formatTracePrompt).not.toHaveBeenCalled();
      const callArgs = vi.mocked(dispatchAgent).mock.calls[0][2];
      expect(callArgs?.appendSystemPrompt).toBeUndefined();
    });
  });

  describe('timeout handling', () => {
    it('returns UNKNOWN result with timedOut=true on timeout', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);

      // dispatchAgent never resolves
      vi.mocked(dispatchAgent).mockReturnValue(new Promise(() => {}));

      vi.useFakeTimers();

      const resultPromise = runEvaluator(makeOptions({ timeoutMs: 1000 }));

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(1001);

      const result = await resultPromise;

      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
      expect(result.dockerAvailable).toBe(true);

      const parsed = JSON.parse(result.output);
      expect(parsed.verdict).toBe('fail');
      expect(parsed.findings[0].status).toBe('unknown');
      expect(parsed.findings[0].evidence.reasoning).toContain('timed out');
    });

    it('uses default timeout of 300000ms when timeoutMs not specified', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockReturnValue(new Promise(() => {}));

      vi.useFakeTimers();

      const resultPromise = runEvaluator(makeOptions());

      // Should not have timed out at 299999ms
      await vi.advanceTimersByTimeAsync(299_999);
      // Verify still pending — we can't directly check, but advancing past 300000 should resolve it
      await vi.advanceTimersByTimeAsync(2);

      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('calls cleanup on successful dispatch', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      await runEvaluator(makeOptions());

      expect(mockWorkspace.cleanup).toHaveBeenCalledTimes(1);
    });

    it('calls cleanup on dispatch failure', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockRejectedValue(new Error('SDK crash'));

      await expect(runEvaluator(makeOptions())).rejects.toThrow('SDK crash');

      expect(mockWorkspace.cleanup).toHaveBeenCalledTimes(1);
    });

    it('calls cleanup on timeout', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockReturnValue(new Promise(() => {}));

      vi.useFakeTimers();

      const resultPromise = runEvaluator(makeOptions({ timeoutMs: 100 }));
      await vi.advanceTimersByTimeAsync(101);
      await resultPromise;

      expect(mockWorkspace.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('disallowedTools inherited from agent definition', () => {
    it('passes agent definition with disallowedTools to dispatchAgent', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      const agentDef = makeAgentDef({ disallowedTools: ['Edit', 'Write'] });
      await runEvaluator(makeOptions({ agentDefinition: agentDef }));

      expect(vi.mocked(dispatchAgent).mock.calls[0][0]).toEqual(
        expect.objectContaining({ disallowedTools: ['Edit', 'Write'] }),
      );
    });
  });

  describe('interface shapes', () => {
    it('EvaluatorOptions has required fields', () => {
      // Compile-time check: this would fail to compile if the interface is wrong
      const opts: EvaluatorOptions = {
        runId: 'r',
        storyFiles: [],
        agentDefinition: makeAgentDef(),
      };
      expect(opts.runId).toBe('r');
      expect(opts.storyFiles).toEqual([]);
      expect(opts.agentDefinition).toBeDefined();
      expect(opts.timeoutMs).toBeUndefined();
      expect(opts.traceId).toBeUndefined();
    });

    it('EvaluatorResult has required fields', () => {
      const result: EvaluatorResult = {
        output: '',
        success: false,
        durationMs: 0,
        dockerAvailable: false,
        timedOut: false,
      };
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('dockerAvailable');
      expect(result).toHaveProperty('timedOut');
    });
  });

  describe('Docker check happens before workspace creation', () => {
    it('checks Docker before creating workspace', async () => {
      const callOrder: string[] = [];

      vi.mocked(isDockerAvailable).mockImplementation(() => {
        callOrder.push('docker-check');
        return true;
      });

      vi.mocked(createIsolatedWorkspace).mockImplementation(async () => {
        callOrder.push('create-workspace');
        return makeMockWorkspace();
      });

      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      await runEvaluator(makeOptions());

      expect(callOrder[0]).toBe('docker-check');
      expect(callOrder[1]).toBe('create-workspace');
    });
  });

  describe('dispatch error propagation', () => {
    it('re-throws non-timeout dispatch errors', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockRejectedValue(new Error('Network failure'));

      await expect(runEvaluator(makeOptions())).rejects.toThrow('Network failure');
    });

    it('handles non-Error thrown by dispatch (string)', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockRejectedValue('string error');

      await expect(runEvaluator(makeOptions())).rejects.toBe('string error');
      expect(mockWorkspace.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('workspace creation failure', () => {
    it('does not call cleanup when workspace creation throws', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      vi.mocked(createIsolatedWorkspace).mockRejectedValue(new Error('disk full'));

      await expect(runEvaluator(makeOptions())).rejects.toThrow('disk full');
      // dispatchAgent should not have been called
      expect(dispatchAgent).not.toHaveBeenCalled();
    });
  });

  describe('timer cleanup', () => {
    it('clears timeout timer on successful dispatch to prevent process hang', async () => {
      vi.mocked(isDockerAvailable).mockReturnValue(true);
      const mockWorkspace = makeMockWorkspace();
      vi.mocked(createIsolatedWorkspace).mockResolvedValue(mockWorkspace);
      vi.mocked(dispatchAgent).mockResolvedValue(makeDispatchResult());

      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      await runEvaluator(makeOptions({ timeoutMs: 60000 }));

      // clearTimeout should have been called at least once (for the race timer)
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
