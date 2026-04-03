/**
 * Claude Code Driver — in-process driver using the Agent SDK.
 *
 * Unlike CLI-wrapped drivers (Codex, OpenCode), this driver calls the
 * Agent SDK `query()` function directly. No process spawning needed.
 *
 * @see architecture-multi-framework.md — Decision 1: Driver Interface Design
 * @see architecture-multi-framework.md — Decision 2: CLI-Wrapping Strategy (in-process variant)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentDriver,
  DispatchOpts,
  DriverHealth,
  DriverCapabilities,
  ErrorCategory,
} from '../types.js';
import type { StreamEvent, ResultEvent } from '../stream-parser.js';

// --- Error Classification ---

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'ECONNRESET',
  'EPIPE',
]);

/**
 * Classify an error into a standard ErrorCategory.
 *
 * Priority order:
 * 1. HTTP 429 or "rate limit" -> RATE_LIMIT
 * 2. Known network error codes -> NETWORK
 * 3. HTTP 401/403 or "unauthorized"/"forbidden" -> AUTH
 * 4. Timeout -> TIMEOUT
 * 5. Everything else -> UNKNOWN
 */
function classifyError(err: unknown): ErrorCategory {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  const status = (err as { status?: number })?.status;

  // Rate limit: HTTP 429 or message containing "rate limit"
  if (status === 429 || /rate.?limit/i.test(message)) {
    return 'RATE_LIMIT';
  }

  // Network errors: known error codes
  if (code && NETWORK_CODES.has(code)) {
    return 'NETWORK';
  }
  if (/fetch|network|dns/i.test(message) && /fail|error|timeout/i.test(message)) {
    return 'NETWORK';
  }

  // Auth errors: HTTP 401/403 or auth-related messages
  if (status === 401 || status === 403 || /unauthorized|forbidden/i.test(message)) {
    return 'AUTH';
  }

  // Timeout: AbortError or timeout-related messages
  if (
    (err instanceof Error && err.name === 'AbortError') ||
    /timeout|timed.?out|aborted/i.test(message)
  ) {
    return 'TIMEOUT';
  }

  return 'UNKNOWN';
}

// --- SDK Message to StreamEvent mapping ---

/**
 * Map an SDK message object to a StreamEvent, or return null if unrecognized.
 */
function mapSdkMessage(message: Record<string, unknown>): StreamEvent | null {
  const type = message.type as string | undefined;

  if (type === 'stream_event') {
    const event = message.event as Record<string, unknown> | undefined;
    if (!event || typeof event !== 'object') return null;

    const eventType = event.type as string | undefined;

    if (eventType === 'content_block_start') {
      const contentBlock = event.content_block as Record<string, unknown> | undefined;
      if (contentBlock?.type === 'tool_use') {
        const name = contentBlock.name;
        const id = contentBlock.id;
        if (typeof name === 'string' && typeof id === 'string') {
          return { type: 'tool-start', name, id };
        }
      }
      return null;
    }

    if (eventType === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (!delta) return null;

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

    if (eventType === 'content_block_stop') {
      return { type: 'tool-complete' };
    }

    return null;
  }

  if (type === 'system') {
    const subtype = message.subtype as string | undefined;
    if (subtype === 'api_retry') {
      const attempt = message.attempt;
      const delay = message.retry_delay_ms;
      if (typeof attempt === 'number' && typeof delay === 'number') {
        return { type: 'retry', attempt, delay };
      }
    }
    return null;
  }

  // 'result' type is handled separately in dispatch() to capture cost
  return null;
}

// --- Driver Implementation ---

/**
 * ClaudeCodeDriver — in-process AgentDriver using the Agent SDK query() API.
 *
 * This driver is always available (in-process dependency). Auth is checked
 * lazily on first API call, not eagerly.
 */
export class ClaudeCodeDriver implements AgentDriver {
  readonly name = 'claude-code' as const;
  readonly defaultModel = 'claude-sonnet-4-20250514' as const;
  readonly capabilities: DriverCapabilities = {
    supportsPlugins: true,
    supportsStreaming: true,
    costReporting: true,
    costTier: 3,
  };

  private lastCost: number | null = null;

  async healthCheck(): Promise<DriverHealth> {
    return { available: true, authenticated: true, version: null };
  }

  async *dispatch(opts: DispatchOpts): AsyncGenerator<StreamEvent> {
    this.lastCost = null;

    // Build query options
    const queryOptions: Record<string, unknown> = {
      model: opts.model,
      cwd: opts.cwd,
      permissionMode: opts.sourceAccess ? 'bypassPermissions' : 'default',
      ...(opts.sourceAccess ? { allowDangerouslySkipPermissions: true } : {}),
      ...(opts.sessionId ? { resume: opts.sessionId } : {}),
      ...(opts.appendSystemPrompt ? { appendSystemPrompt: opts.appendSystemPrompt } : {}),
    };

    // Plugin pass-through
    if (opts.plugins && opts.plugins.length > 0) {
      queryOptions.plugins = [...opts.plugins];
    }

    // Timeout handling via AbortController
    let abortController: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (opts.timeout) {
      abortController = new AbortController();
      timeoutId = setTimeout(() => {
        abortController!.abort();
      }, opts.timeout);
    }

    let yieldedResult = false;

    try {
      const queryGenerator = query({
        prompt: opts.prompt,
        options: queryOptions,
        ...(abortController ? { abortController } : {}),
      });

      for await (const message of queryGenerator) {
        const msg = message as Record<string, unknown>;

        // Handle result message specially to capture cost
        if (msg.type === 'result') {
          const costUsd = msg.total_cost_usd;
          const sessionId = msg.session_id;

          if (typeof costUsd === 'number') {
            this.lastCost = costUsd;
          }

          const resultEvent: ResultEvent = {
            type: 'result',
            cost: typeof costUsd === 'number' ? costUsd : 0,
            sessionId: typeof sessionId === 'string' ? sessionId : '',
            cost_usd: typeof costUsd === 'number' ? costUsd : null,
          };
          yield resultEvent;
          yieldedResult = true;
          continue;
        }

        // Map other SDK messages to StreamEvents
        const streamEvent = mapSdkMessage(msg);
        if (streamEvent) {
          yield streamEvent;
        }
      }
    } catch (err: unknown) {
      const category = classifyError(err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // If abort was triggered by our timeout, classify as TIMEOUT
      const finalCategory =
        abortController?.signal.aborted && category !== 'RATE_LIMIT'
          ? 'TIMEOUT'
          : category;

      const resultEvent: ResultEvent = {
        type: 'result',
        cost: this.lastCost ?? 0,
        sessionId: '',
        cost_usd: this.lastCost,
      };

      yield {
        ...resultEvent,
        error: errorMessage,
        errorCategory: finalCategory,
      };
      yieldedResult = true;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    // Guarantee a result event is always yielded
    if (!yieldedResult) {
      yield {
        type: 'result',
        cost: this.lastCost ?? 0,
        sessionId: '',
        cost_usd: this.lastCost,
      } as ResultEvent;
    }
  }

  getLastCost(): number | null {
    return this.lastCost;
  }
}
