import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// --- Mock the Agent SDK ---

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

import {
  dispatchAgent,
  DispatchError,
} from '../agent-dispatch.js';
import type {
  DispatchOptions,
  DispatchResult,
  DispatchErrorCode,
} from '../agent-dispatch.js';
import type { SubagentDefinition } from '../agent-resolver.js';

// --- Helpers ---

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

/**
 * Create an async generator that yields the given messages.
 */
async function* fakeStream(messages: Array<Record<string, unknown>>) {
  for (const msg of messages) {
    yield msg;
  }
}

function makeSuccessResult(overrides?: Record<string, unknown>) {
  return {
    type: 'result',
    subtype: 'success',
    result: 'Agent completed the task.',
    session_id: 'sess-abc-123',
    duration_ms: 1234,
    duration_api_ms: 1000,
    is_error: false,
    num_turns: 3,
    total_cost_usd: 0.05,
    usage: { input_tokens: 100, output_tokens: 200 },
    modelUsage: {},
    permission_denials: [],
    uuid: 'uuid-123',
    ...overrides,
  };
}

function makeErrorResult(overrides?: Record<string, unknown>) {
  return {
    type: 'result',
    subtype: 'error_during_execution',
    session_id: 'sess-err-456',
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0.01,
    usage: { input_tokens: 50, output_tokens: 10 },
    modelUsage: {},
    permission_denials: [],
    errors: ['Something went wrong'],
    uuid: 'uuid-456',
    ...overrides,
  };
}

// --- Tests ---

describe('agent-dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful dispatch', () => {
    it('returns correct DispatchResult shape (AC #2)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      const result = await dispatchAgent(makeDefinition(), 'Do the thing');

      expect(result).toEqual(
        expect.objectContaining({
          sessionId: 'sess-abc-123',
          success: true,
          output: 'Agent completed the task.',
        }),
      );
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('durationMs is a positive number (AC #3)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      const result = await dispatchAgent(makeDefinition(), 'Do the thing');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.durationMs)).toBe(true);
    });

    it('returns success: false for error result subtype', async () => {
      mockQuery.mockReturnValue(fakeStream([makeErrorResult()]));

      const result = await dispatchAgent(makeDefinition(), 'Do the thing');

      expect(result.success).toBe(false);
      expect(result.sessionId).toBe('sess-err-456');
    });

    it('captures session_id from intermediate messages', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          { type: 'system', session_id: 'sess-early', tools: [] },
          makeSuccessResult({ session_id: 'sess-final' }),
        ]),
      );

      const result = await dispatchAgent(makeDefinition(), 'Do the thing');

      expect(result.sessionId).toBe('sess-final');
    });
  });

  describe('SDK call parameters', () => {
    it('passes prompt to query() (AC #1)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(makeDefinition(), 'Build a widget');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const call = mockQuery.mock.calls[0][0];
      expect(call.prompt).toBe('Build a widget');
    });

    it('passes model from definition to options (AC #1)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(
        makeDefinition({ model: 'claude-opus-4-20250514' }),
        'Do the thing',
      );

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.model).toBe('claude-opus-4-20250514');
    });

    it('passes systemPrompt from definition instructions (AC #1)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(
        makeDefinition({ instructions: 'You are an expert coder.' }),
        'Do the thing',
      );

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.systemPrompt).toBe('You are an expert coder.');
    });

    it('passes disallowedTools from definition (AC #1)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(
        makeDefinition({ disallowedTools: ['Edit', 'Write'] }),
        'Do the thing',
      );

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.disallowedTools).toEqual(['Edit', 'Write']);
    });

    it('passes cwd from options (AC #9)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(makeDefinition(), 'Do the thing', {
        cwd: '/some/path',
      });

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.cwd).toBe('/some/path');
    });

    it('does not pass cwd when not provided', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(makeDefinition(), 'Do the thing');

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.cwd).toBeUndefined();
    });

    it('passes appendSystemPrompt by appending to instructions', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(
        makeDefinition({ instructions: 'Base instructions.' }),
        'Do the thing',
        { appendSystemPrompt: 'TRACE-ID: abc-123' },
      );

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.systemPrompt).toBe(
        'Base instructions.\n\nTRACE-ID: abc-123',
      );
    });

    it('does not modify systemPrompt when appendSystemPrompt is not provided', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(
        makeDefinition({ instructions: 'Base instructions.' }),
        'Do the thing',
      );

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.systemPrompt).toBe('Base instructions.');
    });

    it('passes permissionMode bypassPermissions (bare mode, AC #1)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(makeDefinition(), 'Do the thing');

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.permissionMode).toBe('bypassPermissions');
      expect(call.options.allowDangerouslySkipPermissions).toBe(true);
    });

    it('passes resume from sessionId option (forward-compat for story 4-2)', async () => {
      mockQuery.mockReturnValue(fakeStream([makeSuccessResult()]));

      await dispatchAgent(makeDefinition(), 'Continue', {
        sessionId: 'sess-resume-789',
      });

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.resume).toBe('sess-resume-789');
    });
  });

  describe('error classification', () => {
    it('classifies HTTP 429 as RATE_LIMIT (AC #5)', async () => {
      expect.assertions(4);
      const sdkError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
      });
      mockQuery.mockImplementation(() => {
        throw sdkError;
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'rate-test' }), 'Go');
      } catch (err) {
        expect(err).toBeInstanceOf(DispatchError);
        const e = err as DispatchError;
        expect(e.code).toBe('RATE_LIMIT');
        expect(e.agentName).toBe('rate-test');
        expect(e.cause).toBe(sdkError);
      }
    });

    it('classifies "rate limit" in message as RATE_LIMIT (AC #5)', async () => {
      expect.assertions(2);
      mockQuery.mockImplementation(() => {
        throw new Error('You have been rate limited, please slow down');
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'rl-msg' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('RATE_LIMIT');
        expect(e.agentName).toBe('rl-msg');
      }
    });

    it('classifies ECONNREFUSED as NETWORK (AC #6)', async () => {
      expect.assertions(2);
      mockQuery.mockImplementation(() => {
        throw Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        });
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'net-test' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('NETWORK');
        expect(e.agentName).toBe('net-test');
      }
    });

    it('classifies ETIMEDOUT as NETWORK (AC #6)', async () => {
      expect.assertions(1);
      mockQuery.mockImplementation(() => {
        throw Object.assign(new Error('request timed out'), {
          code: 'ETIMEDOUT',
        });
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'timeout-test' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('NETWORK');
      }
    });

    it('classifies ENOTFOUND as NETWORK (AC #6)', async () => {
      expect.assertions(1);
      mockQuery.mockImplementation(() => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), {
          code: 'ENOTFOUND',
        });
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'dns-test' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('NETWORK');
      }
    });

    it('classifies fetch/network message errors as NETWORK (AC #6)', async () => {
      expect.assertions(1);
      mockQuery.mockImplementation(() => {
        throw new Error('fetch failed: network error');
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'fetch-test' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('NETWORK');
      }
    });

    it('classifies "claude binary not found" as SDK_INIT (AC #7)', async () => {
      expect.assertions(2);
      mockQuery.mockImplementation(() => {
        throw new Error('claude binary not found in PATH');
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'init-test' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('SDK_INIT');
        expect(e.agentName).toBe('init-test');
      }
    });

    it('classifies SDK constructor failure as SDK_INIT (AC #7)', async () => {
      expect.assertions(1);
      mockQuery.mockImplementation(() => {
        throw new Error('SDK initialization failed: cannot initialize runtime');
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'sdk-fail' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('SDK_INIT');
      }
    });

    it('classifies unknown errors as UNKNOWN (AC #8)', async () => {
      expect.assertions(4);
      mockQuery.mockImplementation(() => {
        throw new Error('Something completely unexpected');
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'unknown-test' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('UNKNOWN');
        expect(e.agentName).toBe('unknown-test');
        expect(e.message).toContain('Something completely unexpected');
        expect(e.cause).toBeInstanceOf(Error);
      }
    });

    it('classifies non-Error throws as UNKNOWN (AC #8)', async () => {
      expect.assertions(2);
      mockQuery.mockImplementation(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });

      try {
        await dispatchAgent(makeDefinition({ name: 'str-err' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('UNKNOWN');
        expect(e.cause).toBe('string error');
      }
    });

    it('DispatchError has correct name and structure', () => {
      const err = new DispatchError('test msg', 'NETWORK', 'my-agent', new Error('orig'));
      expect(err.name).toBe('DispatchError');
      expect(err.message).toBe('test msg');
      expect(err.code).toBe('NETWORK');
      expect(err.agentName).toBe('my-agent');
      expect(err.cause).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DispatchError);
    });
  });

  describe('no child_process usage (AC #4, NFR11)', () => {
    it('agent-dispatch.ts does not import child_process', () => {
      const sourcePath = path.resolve(__dirname, '../agent-dispatch.ts');
      const source = fs.readFileSync(sourcePath, 'utf-8');
      expect(source).not.toContain('child_process');
      expect(source).not.toContain('execFileSync');
      expect(source).not.toContain('spawn');
      expect(source).not.toContain('exec(');
    });
  });

  describe('error during stream consumption', () => {
    it('classifies errors thrown during async iteration', async () => {
      expect.assertions(2);
      async function* throwingStream() {
        yield { type: 'system', session_id: 'sess-mid', tools: [] };
        throw Object.assign(new Error('connection reset'), {
          code: 'ECONNRESET',
        });
      }

      mockQuery.mockReturnValue(throwingStream());

      try {
        await dispatchAgent(makeDefinition({ name: 'mid-err' }), 'Go');
      } catch (err) {
        const e = err as DispatchError;
        expect(e.code).toBe('NETWORK');
        expect(e.agentName).toBe('mid-err');
      }
    });
  });
});
