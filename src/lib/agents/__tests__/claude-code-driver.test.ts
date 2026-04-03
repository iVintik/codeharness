import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the Agent SDK ---

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

import { ClaudeCodeDriver } from '../drivers/claude-code.js';
import type { DispatchOpts } from '../types.js';
import type { StreamEvent, ResultEvent } from '../stream-parser.js';

// --- Helpers ---

function makeOpts(overrides?: Partial<DispatchOpts>): DispatchOpts {
  return {
    prompt: 'Do the thing',
    model: 'claude-sonnet-4-20250514',
    cwd: '/tmp/test',
    sourceAccess: true,
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

function makeResultMessage(overrides?: Record<string, unknown>) {
  return {
    type: 'result',
    subtype: 'success',
    result: 'Agent completed the task.',
    session_id: 'sess-abc-123',
    total_cost_usd: 0.05,
    ...overrides,
  };
}

/**
 * Collect all events from an AsyncIterable.
 */
async function collectEvents(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

// --- Tests ---

describe('ClaudeCodeDriver', () => {
  let driver: ClaudeCodeDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    driver = new ClaudeCodeDriver();
  });

  describe('class properties (AC #1)', () => {
    it('has name "claude-code"', () => {
      expect(driver.name).toBe('claude-code');
    });

    it('has defaultModel "claude-sonnet-4-20250514"', () => {
      expect(driver.defaultModel).toBe('claude-sonnet-4-20250514');
    });

    it('has correct capabilities', () => {
      expect(driver.capabilities).toEqual({
        supportsPlugins: true,
        supportsStreaming: true,
        costReporting: true,
        costTier: 3,
      });
    });
  });

  describe('healthCheck (AC #4)', () => {
    it('returns available: true, authenticated: true, version: null', async () => {
      const health = await driver.healthCheck();
      expect(health).toEqual({
        available: true,
        authenticated: true,
        version: null,
      });
    });
  });

  describe('dispatch — StreamEvent mapping (AC #2)', () => {
    it('maps tool_use content_block_start to tool-start event', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              content_block: { type: 'tool_use', name: 'Edit', id: 'tool-1' },
            },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events[0]).toEqual({ type: 'tool-start', name: 'Edit', id: 'tool-1' });
    });

    it('maps input_json_delta to tool-input event', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: { type: 'input_json_delta', partial_json: '{"file":' },
            },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events[0]).toEqual({ type: 'tool-input', partial: '{"file":' });
    });

    it('maps text_delta to text event', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Hello world' },
            },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events[0]).toEqual({ type: 'text', text: 'Hello world' });
    });

    it('maps content_block_stop to tool-complete event', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: { type: 'content_block_stop' },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events[0]).toEqual({ type: 'tool-complete' });
    });

    it('maps api_retry system event to retry event', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'system',
            subtype: 'api_retry',
            attempt: 2,
            retry_delay_ms: 5000,
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events[0]).toEqual({ type: 'retry', attempt: 2, delay: 5000 });
    });

    it('maps result message to result event with cost', async () => {
      mockQuery.mockReturnValue(
        fakeStream([makeResultMessage({ total_cost_usd: 0.123, session_id: 'sess-xyz' })]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          type: 'result',
          cost: 0.123,
          sessionId: 'sess-xyz',
        }),
      );
    });

    it('yields correct event sequence from mixed SDK messages', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              content_block: { type: 'tool_use', name: 'Read', id: 'tool-2' },
            },
          },
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: { type: 'input_json_delta', partial_json: '{"path":"/foo"}' },
            },
          },
          {
            type: 'stream_event',
            event: { type: 'content_block_stop' },
          },
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Done.' },
            },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events.map((e) => e.type)).toEqual([
        'tool-start',
        'tool-input',
        'tool-complete',
        'text',
        'result',
      ]);
    });

    it('skips unrecognized SDK messages', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          { type: 'system', subtype: 'init', tools: [] },
          { type: 'stream_event', event: { type: 'message_start' } },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      // Only the result event should be yielded
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
    });

    it('skips content_block_start with non-tool_use type (e.g., text block)', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: {
              type: 'content_block_start',
              content_block: { type: 'text' },
            },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      // Only the result event, text block start is skipped
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
    });

    it('skips content_block_delta with unrecognized delta type', async () => {
      mockQuery.mockReturnValue(
        fakeStream([
          {
            type: 'stream_event',
            event: {
              type: 'content_block_delta',
              delta: { type: 'unknown_delta_type', data: 'foo' },
            },
          },
          makeResultMessage(),
        ]),
      );

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
    });
  });

  describe('getLastCost (AC #3)', () => {
    it('returns null before any dispatch', () => {
      expect(driver.getLastCost()).toBeNull();
    });

    it('returns cost from last result message', async () => {
      mockQuery.mockReturnValue(
        fakeStream([makeResultMessage({ total_cost_usd: 0.42 })]),
      );

      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBe(0.42);
    });

    it('returns null when SDK reports no cost', async () => {
      mockQuery.mockReturnValue(
        fakeStream([makeResultMessage({ total_cost_usd: undefined })]),
      );

      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBeNull();
    });

    it('updates cost on each new dispatch', async () => {
      mockQuery.mockReturnValue(
        fakeStream([makeResultMessage({ total_cost_usd: 0.10 })]),
      );
      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBe(0.10);

      mockQuery.mockReturnValue(
        fakeStream([makeResultMessage({ total_cost_usd: 0.25 })]),
      );
      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBe(0.25);
    });

    it('resets cost to null at start of dispatch even if previous had cost', async () => {
      mockQuery.mockReturnValue(
        fakeStream([makeResultMessage({ total_cost_usd: 0.10 })]),
      );
      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBe(0.10);

      // Dispatch that errors before result
      mockQuery.mockImplementation(() => {
        throw new Error('Something broke');
      });
      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBeNull();
    });
  });

  describe('error classification (AC #5)', () => {
    it('classifies HTTP 429 as RATE_LIMIT', async () => {
      const sdkError = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
      mockQuery.mockImplementation(() => { throw sdkError; });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
      expect((events[0] as ResultEvent).errorCategory).toBe('RATE_LIMIT');
    });

    it('classifies "rate limit" in message as RATE_LIMIT', async () => {
      mockQuery.mockImplementation(() => { throw new Error('You have been rate limited'); });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('RATE_LIMIT');
    });

    it('classifies ECONNREFUSED as NETWORK', async () => {
      mockQuery.mockImplementation(() => {
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('NETWORK');
    });

    it('classifies ETIMEDOUT as NETWORK', async () => {
      mockQuery.mockImplementation(() => {
        throw Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
      });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('NETWORK');
    });

    it('classifies network fetch failure via message regex as NETWORK', async () => {
      mockQuery.mockImplementation(() => { throw new Error('fetch failed: DNS resolution error'); });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('NETWORK');
    });

    it('classifies HTTP 401 as AUTH', async () => {
      const sdkError = Object.assign(new Error('Unauthorized'), { status: 401 });
      mockQuery.mockImplementation(() => { throw sdkError; });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('AUTH');
    });

    it('classifies HTTP 403 as AUTH', async () => {
      const sdkError = Object.assign(new Error('Forbidden'), { status: 403 });
      mockQuery.mockImplementation(() => { throw sdkError; });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('AUTH');
    });

    it('classifies "unauthorized" in message as AUTH', async () => {
      mockQuery.mockImplementation(() => { throw new Error('unauthorized request'); });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('AUTH');
    });

    it('classifies timeout/abort errors as TIMEOUT', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockQuery.mockImplementation(() => { throw abortError; });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('TIMEOUT');
    });

    it('classifies unknown errors as UNKNOWN', async () => {
      mockQuery.mockImplementation(() => { throw new Error('Something completely unexpected'); });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect((events[0] as ResultEvent).errorCategory).toBe('UNKNOWN');
    });

    it('yields result event with error info instead of throwing', async () => {
      mockQuery.mockImplementation(() => { throw new Error('kaboom'); });

      // Should NOT throw
      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');
      expect((events[0] as ResultEvent).error).toBe('kaboom');
    });
  });

  describe('dispatch always yields a result event (AC #2)', () => {
    it('yields result even when SDK throws', async () => {
      mockQuery.mockImplementation(() => { throw new Error('fail'); });

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });

    it('yields result when SDK generator yields no messages', async () => {
      mockQuery.mockReturnValue(fakeStream([]));

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });

    it('yields exactly one result from normal flow', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });
  });

  describe('plugins pass-through (AC #6)', () => {
    it('passes plugins to SDK options when provided', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ plugins: ['gstack'] })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.plugins).toEqual(['gstack']);
    });

    it('does not pass plugins when opts.plugins is undefined', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ plugins: undefined })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.plugins).toBeUndefined();
    });

    it('does not pass plugins when opts.plugins is empty array', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ plugins: [] })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.plugins).toBeUndefined();
    });
  });

  describe('timeout handling (AC #7)', () => {
    it('applies timeout via AbortController when opts.timeout is set', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ timeout: 30000 })));

      // Verify AbortController was passed
      const call = mockQuery.mock.calls[0][0];
      expect(call.abortController).toBeInstanceOf(AbortController);
    });

    it('does not set AbortController when no timeout', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts()));

      const call = mockQuery.mock.calls[0][0];
      expect(call.abortController).toBeUndefined();
    });

    it('classifies abort-triggered errors as TIMEOUT when timeout was set', async () => {
      // Simulate what happens when AbortController aborts during stream
      async function* abortingStream() {
        yield { type: 'system', subtype: 'init', tools: [] };
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }

      mockQuery.mockReturnValue(abortingStream());

      const events = await collectEvents(driver.dispatch(makeOpts({ timeout: 100 })));
      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent).toBeDefined();
      expect((resultEvent as ResultEvent).errorCategory).toBe('TIMEOUT');
    });
  });

  describe('SDK call parameters', () => {
    it('passes prompt to query()', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ prompt: 'Build a widget' })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.prompt).toBe('Build a widget');
    });

    it('passes model from opts', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ model: 'claude-opus-4-20250514' })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.model).toBe('claude-opus-4-20250514');
    });

    it('passes cwd from opts', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ cwd: '/my/project' })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.cwd).toBe('/my/project');
    });

    it('sets bypassPermissions when sourceAccess is true', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ sourceAccess: true })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.permissionMode).toBe('bypassPermissions');
      expect(call.options.allowDangerouslySkipPermissions).toBe(true);
    });

    it('sets default permissionMode when sourceAccess is false', async () => {
      mockQuery.mockReturnValue(fakeStream([makeResultMessage()]));

      await collectEvents(driver.dispatch(makeOpts({ sourceAccess: false })));

      const call = mockQuery.mock.calls[0][0];
      expect(call.options.permissionMode).toBe('default');
      expect(call.options.allowDangerouslySkipPermissions).toBeUndefined();
    });
  });

  describe('error during stream consumption', () => {
    it('classifies errors thrown mid-stream and yields result', async () => {
      async function* throwingStream() {
        yield {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'partial...' },
          },
        };
        throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
      }

      mockQuery.mockReturnValue(throwingStream());

      const events = await collectEvents(driver.dispatch(makeOpts()));
      // Should have text event + result event
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('text');
      expect(events[1].type).toBe('result');
      expect((events[1] as ResultEvent).errorCategory).toBe('NETWORK');
    });
  });
});
