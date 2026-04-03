/**
 * Stream Event Parser — converts Claude stream-json NDJSON lines into typed events.
 *
 * Stateless per-line: accepts one NDJSON line, returns one typed event or null.
 * Accumulation (e.g., building full tool input from deltas) is the caller's responsibility.
 *
 * Event format reference:
 * - Wrapper type "stream_event" contains API events (content_block_start, etc.)
 * - Wrapper type "system" contains Claude Code events (api_retry, etc.)
 * - Wrapper type "result" is the final event with session_id, cost, result text
 */

// --- Event Types ---

export interface ToolStartEvent {
  readonly type: 'tool-start';
  readonly name: string;
  readonly id: string;
}

export interface ToolInputEvent {
  readonly type: 'tool-input';
  readonly partial: string;
}

export interface ToolCompleteEvent {
  readonly type: 'tool-complete';
}

export interface TextEvent {
  readonly type: 'text';
  readonly text: string;
}

export interface RetryEvent {
  readonly type: 'retry';
  readonly attempt: number;
  readonly delay: number;
}

export interface ResultEvent {
  readonly type: 'result';
  readonly cost: number;
  readonly sessionId: string;
  /** Normalized cost in USD for multi-driver comparison. */
  readonly cost_usd?: number | null;
  /** Error message when the dispatch failed. Absent on success. */
  readonly error?: string;
  /** Classified error category. Present only when `error` is set. */
  readonly errorCategory?: import('../agents/types.js').ErrorCategory;
}

/** Discriminated union of all stream events the parser can emit. */
export type StreamEvent =
  | ToolStartEvent
  | ToolInputEvent
  | ToolCompleteEvent
  | TextEvent
  | RetryEvent
  | ResultEvent;

// --- Parser ---

/**
 * Parse a single NDJSON line from Claude's stream-json output.
 *
 * Returns a typed StreamEvent for recognized events, or null for:
 * - Invalid JSON
 * - Empty/whitespace lines
 * - Unrecognized or irrelevant event types (message_start, message_stop, etc.)
 */
export function parseStreamLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // IGNORE: malformed JSON in stream output, skip line
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const wrapperType = parsed.type;

  if (wrapperType === 'stream_event') {
    return parseStreamEvent(parsed);
  }

  if (wrapperType === 'system') {
    return parseSystemEvent(parsed);
  }

  if (wrapperType === 'result') {
    return parseResultEvent(parsed);
  }

  return null;
}

// --- Internal Parsers ---

function parseStreamEvent(parsed: Record<string, unknown>): StreamEvent | null {
  const event = parsed.event as Record<string, unknown> | undefined;
  if (!event || typeof event !== 'object') {
    return null;
  }

  const eventType = event.type as string | undefined;

  if (eventType === 'content_block_start') {
    return parseContentBlockStart(event);
  }

  if (eventType === 'content_block_delta') {
    return parseContentBlockDelta(event);
  }

  if (eventType === 'content_block_stop') {
    // NOTE: content_block_stop fires for both tool_use and text blocks.
    // The parser is stateless and cannot distinguish them. The consumer
    // (renderer) must track whether the preceding block was a tool_use.
    return { type: 'tool-complete' };
  }

  // message_start, message_stop, message_delta — skip
  return null;
}

function parseContentBlockStart(event: Record<string, unknown>): StreamEvent | null {
  const contentBlock = event.content_block as Record<string, unknown> | undefined;
  if (!contentBlock || typeof contentBlock !== 'object') {
    return null;
  }

  if (contentBlock.type === 'tool_use') {
    const name = contentBlock.name;
    const id = contentBlock.id;
    if (typeof name === 'string' && typeof id === 'string') {
      return { type: 'tool-start', name, id };
    }
  }

  // content_block_start with type "text" — skip (the actual text comes via deltas)
  return null;
}

function parseContentBlockDelta(event: Record<string, unknown>): StreamEvent | null {
  const delta = event.delta as Record<string, unknown> | undefined;
  if (!delta || typeof delta !== 'object') {
    return null;
  }

  if (delta.type === 'input_json_delta') {
    const partialJson = delta.partial_json;
    if (typeof partialJson === 'string') {
      return { type: 'tool-input', partial: partialJson };
    }
    return null;
  }

  if (delta.type === 'text_delta') {
    const text = delta.text;
    if (typeof text === 'string') {
      return { type: 'text', text };
    }
    return null;
  }

  return null;
}

function parseSystemEvent(parsed: Record<string, unknown>): StreamEvent | null {
  const subtype = parsed.subtype as string | undefined;
  if (subtype === 'api_retry') {
    const attempt = parsed.attempt;
    const delay = parsed.retry_delay_ms;
    if (typeof attempt === 'number' && typeof delay === 'number') {
      return { type: 'retry', attempt, delay };
    }
    return null;
  }

  return null;
}

function parseResultEvent(parsed: Record<string, unknown>): StreamEvent | null {
  const costUsd = parsed.cost_usd;
  const sessionId = parsed.session_id;
  if (typeof costUsd === 'number' && typeof sessionId === 'string') {
    return { type: 'result', cost: costUsd, sessionId };
  }
  return null;
}
