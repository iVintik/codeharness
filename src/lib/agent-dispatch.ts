import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SubagentDefinition } from './agent-resolver.js';

// --- Interfaces ---

/**
 * Options for dispatching an agent session.
 */
export interface DispatchOptions {
  /** Working directory for the agent session. */
  cwd?: string;
  /** Session ID for resuming an existing session (forward-compat for story 4-2). */
  sessionId?: string;
  /** Additional text appended to the system prompt (forward-compat for story 4-3 trace IDs). */
  appendSystemPrompt?: string;
}

/**
 * Result of a successful agent dispatch.
 */
export interface DispatchResult {
  /** The session ID assigned by the Agent SDK. */
  sessionId: string;
  /** Whether the session completed successfully (no errors). */
  success: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** The agent's final text response. */
  output: string;
}

// --- Error Class ---

/** Error codes for classifying dispatch failures. */
export type DispatchErrorCode = 'RATE_LIMIT' | 'NETWORK' | 'SDK_INIT' | 'UNKNOWN';

/**
 * Structured error thrown by dispatchAgent() with a classification code.
 */
export class DispatchError extends Error {
  public readonly code: DispatchErrorCode;
  public readonly agentName: string;
  public readonly cause: unknown;

  constructor(
    message: string,
    code: DispatchErrorCode,
    agentName: string,
    cause: unknown,
  ) {
    super(message);
    this.name = 'DispatchError';
    this.code = code;
    this.agentName = agentName;
    this.cause = cause;
  }
}

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
 * Classify an error from the Agent SDK into a DispatchErrorCode.
 */
function classifyError(err: unknown): DispatchErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  const status = (err as { status?: number })?.status;

  // Rate limit: HTTP 429 or message containing "rate limit"
  if (status === 429 || /rate.?limit/i.test(message)) {
    return 'RATE_LIMIT';
  }

  // Network errors: known error codes or fetch-related failures
  if (code && NETWORK_CODES.has(code)) {
    return 'NETWORK';
  }
  if (/fetch|network|dns/i.test(message) && /fail|error|timeout/i.test(message)) {
    return 'NETWORK';
  }

  // SDK init: binary not found, SDK constructor errors
  if (/not found|cannot find|no such file|ENOENT/i.test(message) && /claude|binary|executable/i.test(message)) {
    return 'SDK_INIT';
  }
  if (/sdk.*init|constructor.*fail|cannot.*initialize/i.test(message)) {
    return 'SDK_INIT';
  }

  return 'UNKNOWN';
}

// --- Main Dispatch Function ---

/**
 * Dispatch an agent session via the Agent SDK query() API.
 *
 * Starts a session with the given subagent definition and prompt,
 * consumes the async generator, and returns a DispatchResult when done.
 *
 * Uses only the SDK — no process invocation. No retry logic. No output parsing.
 */
export async function dispatchAgent(
  definition: SubagentDefinition,
  prompt: string,
  options?: DispatchOptions,
): Promise<DispatchResult> {
  const startMs = Date.now();

  // Build system prompt — use the definition instructions,
  // optionally appending the trace ID / extra context.
  let systemPrompt: string = definition.instructions;

  if (options?.appendSystemPrompt) {
    systemPrompt = `${definition.instructions}\n\n${options.appendSystemPrompt}`;
  }

  try {
    const queryGenerator = query({
      prompt,
      options: {
        model: definition.model,
        systemPrompt,
        disallowedTools: definition.disallowedTools,
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(options?.sessionId ? { resume: options.sessionId } : {}),
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    });

    // Consume the async generator to completion, capturing the result message.
    let sessionId = '';
    let output = '';
    let success = false;

    for await (const message of queryGenerator) {
      // Capture session_id from any message that has it.
      if ('session_id' in message && message.session_id) {
        sessionId = message.session_id;
      }

      // Capture the result message (final message in the stream).
      if (message.type === 'result') {
        const resultMsg = message as {
          type: 'result';
          subtype: string;
          result?: string;
          errors?: string[];
          session_id: string;
        };

        sessionId = resultMsg.session_id;
        success = resultMsg.subtype === 'success';
        output = resultMsg.result ?? '';
      }
    }

    const durationMs = Date.now() - startMs;

    return {
      sessionId,
      success,
      durationMs,
      output,
    };
  } catch (err: unknown) {
    const errorCode = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);
    throw new DispatchError(
      `Agent dispatch failed for "${definition.name}": ${message}`,
      errorCode,
      definition.name,
      err,
    );
  }
}
