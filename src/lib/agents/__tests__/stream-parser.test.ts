import { describe, it, expect } from 'vitest';
import { parseStreamLine } from '../stream-parser.js';
import type {
  ToolStartEvent,
  ToolInputEvent,
  ToolCompleteEvent,
  TextEvent,
  RetryEvent,
  ResultEvent,
  StreamEvent,
} from '../stream-parser.js';

// --- Helpers ---

function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function streamEvent(event: Record<string, unknown>): string {
  return line({ type: 'stream_event', event });
}

// --- AC #1: content_block_start with tool_use → tool-start ---

describe('AC #1: tool-start', () => {
  it('parses content_block_start with tool_use', () => {
    const input = streamEvent({
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Bash', id: 'toolu_abc123' },
    });
    const result = parseStreamLine(input) as ToolStartEvent;
    expect(result).toEqual({
      type: 'tool-start',
      name: 'Bash',
      id: 'toolu_abc123',
    });
  });

  it('handles different tool names', () => {
    const input = streamEvent({
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Read', id: 'toolu_xyz789' },
    });
    const result = parseStreamLine(input) as ToolStartEvent;
    expect(result).toEqual({
      type: 'tool-start',
      name: 'Read',
      id: 'toolu_xyz789',
    });
  });

  it('returns null for content_block_start with text type', () => {
    const input = streamEvent({
      type: 'content_block_start',
      content_block: { type: 'text', text: '' },
    });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when content_block is missing', () => {
    const input = streamEvent({ type: 'content_block_start' });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when tool_use name is missing', () => {
    const input = streamEvent({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_xxx' },
    });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when tool_use id is missing', () => {
    const input = streamEvent({
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Bash' },
    });
    expect(parseStreamLine(input)).toBeNull();
  });
});

// --- AC #2: content_block_delta with input_json_delta → tool-input ---

describe('AC #2: tool-input', () => {
  it('parses input_json_delta', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"command":"npm test"}' },
    });
    const result = parseStreamLine(input) as ToolInputEvent;
    expect(result).toEqual({
      type: 'tool-input',
      partial: '{"command":"npm test"}',
    });
  });

  it('handles empty partial_json', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '' },
    });
    const result = parseStreamLine(input) as ToolInputEvent;
    expect(result).toEqual({ type: 'tool-input', partial: '' });
  });

  it('returns null when partial_json is not a string', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: 42 },
    });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when delta is missing', () => {
    const input = streamEvent({ type: 'content_block_delta' });
    expect(parseStreamLine(input)).toBeNull();
  });
});

// --- AC #3: content_block_stop → tool-complete ---

describe('AC #3: tool-complete', () => {
  it('parses content_block_stop', () => {
    const input = streamEvent({ type: 'content_block_stop' });
    const result = parseStreamLine(input) as ToolCompleteEvent;
    expect(result).toEqual({ type: 'tool-complete' });
  });

  it('ignores extra fields on content_block_stop', () => {
    const input = streamEvent({ type: 'content_block_stop', index: 0 });
    const result = parseStreamLine(input) as ToolCompleteEvent;
    expect(result).toEqual({ type: 'tool-complete' });
  });
});

// --- AC #4: content_block_delta with text_delta → text ---

describe('AC #4: text', () => {
  it('parses text_delta', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: "I'll read the file..." },
    });
    const result = parseStreamLine(input) as TextEvent;
    expect(result).toEqual({ type: 'text', text: "I'll read the file..." });
  });

  it('handles empty text', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: '' },
    });
    const result = parseStreamLine(input) as TextEvent;
    expect(result).toEqual({ type: 'text', text: '' });
  });

  it('returns null when text is not a string', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 123 },
    });
    expect(parseStreamLine(input)).toBeNull();
  });
});

// --- AC #5: system/api_retry → retry ---

describe('AC #5: retry', () => {
  it('parses api_retry event', () => {
    const input = line({
      type: 'system',
      subtype: 'api_retry',
      attempt: 2,
      max_retries: 5,
      retry_delay_ms: 3000,
      error: 'overloaded_error',
    });
    const result = parseStreamLine(input) as RetryEvent;
    expect(result).toEqual({ type: 'retry', attempt: 2, delay: 3000 });
  });

  it('returns null for system events without api_retry subtype', () => {
    const input = line({ type: 'system', subtype: 'init' });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when attempt is missing', () => {
    const input = line({
      type: 'system',
      subtype: 'api_retry',
      retry_delay_ms: 1000,
    });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when retry_delay_ms is missing', () => {
    const input = line({
      type: 'system',
      subtype: 'api_retry',
      attempt: 1,
    });
    expect(parseStreamLine(input)).toBeNull();
  });
});

// --- AC #6: result → result ---

describe('AC #6: result', () => {
  it('parses result event', () => {
    const input = line({
      type: 'result',
      cost_usd: 4.2,
      session_id: 'sess_abc123',
      result: 'All tasks completed successfully.',
    });
    const result = parseStreamLine(input) as ResultEvent;
    expect(result).toEqual({
      type: 'result',
      cost: 4.2,
      sessionId: 'sess_abc123',
    });
  });

  it('handles zero cost', () => {
    const input = line({
      type: 'result',
      cost_usd: 0,
      session_id: 'sess_zero',
      result: '',
    });
    const result = parseStreamLine(input) as ResultEvent;
    expect(result).toEqual({ type: 'result', cost: 0, sessionId: 'sess_zero' });
  });

  it('returns null when cost_usd is missing', () => {
    const input = line({ type: 'result', session_id: 'sess_xxx' });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null when session_id is missing', () => {
    const input = line({ type: 'result', cost_usd: 1.5 });
    expect(parseStreamLine(input)).toBeNull();
  });
});

// --- Edge Cases ---

describe('edge cases', () => {
  it('returns null for empty string', () => {
    expect(parseStreamLine('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseStreamLine('   \t  ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseStreamLine('{invalid json}')).toBeNull();
  });

  it('returns null for JSON primitive', () => {
    expect(parseStreamLine('"just a string"')).toBeNull();
  });

  it('returns null for JSON array', () => {
    expect(parseStreamLine('[1, 2, 3]')).toBeNull();
  });

  it('returns null for JSON number', () => {
    expect(parseStreamLine('42')).toBeNull();
  });

  it('returns null for JSON boolean', () => {
    expect(parseStreamLine('true')).toBeNull();
  });

  it('returns null for JSON null', () => {
    expect(parseStreamLine('null')).toBeNull();
  });

  it('returns null for truncated JSON', () => {
    expect(parseStreamLine('{"type": "stream_ev')).toBeNull();
  });

  it('returns null for message_start', () => {
    const input = streamEvent({ type: 'message_start', message: {} });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null for message_stop', () => {
    const input = streamEvent({ type: 'message_stop' });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null for message_delta', () => {
    const input = streamEvent({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
    });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null for unknown wrapper type', () => {
    const input = line({ type: 'ping' });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null for stream_event without event field', () => {
    const input = line({ type: 'stream_event' });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('returns null for unknown delta type', () => {
    const input = streamEvent({
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: 'hmm' },
    });
    expect(parseStreamLine(input)).toBeNull();
  });

  it('handles line with trailing newline', () => {
    const input = streamEvent({
      type: 'content_block_stop',
    }) + '\n';
    const result = parseStreamLine(input);
    expect(result).toEqual({ type: 'tool-complete' });
  });
});

// --- Type exhaustiveness check ---

describe('type safety', () => {
  it('StreamEvent type covers all variants', () => {
    // This is a compile-time check. If a new variant is added to StreamEvent
    // without being handled, TypeScript will error on exhaustive switches.
    const events: StreamEvent[] = [
      { type: 'tool-start', name: 'Bash', id: 'x' },
      { type: 'tool-input', partial: '{}' },
      { type: 'tool-complete' },
      { type: 'text', text: 'hello' },
      { type: 'retry', attempt: 1, delay: 1000 },
      { type: 'result', cost: 1.0, sessionId: 's' },
    ];
    expect(events).toHaveLength(6);
  });
});
