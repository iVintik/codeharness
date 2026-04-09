/**
 * OpenCode Driver — CLI-wrapped driver for OpenCode.
 *
 * Spawns the `opencode` CLI binary via child_process.spawn and parses
 * its NDJSON stdout into StreamEvent objects.
 *
 * @see architecture-multi-framework.md — Decision 1: Driver Interface Design
 * @see architecture-multi-framework.md — Decision 2: CLI-Wrapping Strategy
 * @see architecture-multi-framework.md — Decision 6: Plugin Ecosystem Pass-Through
 */

import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type {
  AgentDriver,
  DispatchOpts,
  DriverHealth,
  DriverCapabilities,
  ErrorCategory,
} from '../types.js';
import type { StreamEvent, ResultEvent } from '../stream-parser.js';

const execFileAsync = promisify(execFile);

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
 * Classify an error string or Error into a standard ErrorCategory.
 *
 * Priority order:
 * 1. HTTP 429 or "rate limit" -> RATE_LIMIT
 * 2. Known network error codes -> NETWORK
 * 3. HTTP 401/403 or "unauthorized"/"forbidden" -> AUTH
 * 4. Timeout -> TIMEOUT
 * 5. Everything else -> UNKNOWN
 */
export function classifyError(err: unknown): ErrorCategory {
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
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ENETUNREACH|ECONNRESET|EPIPE/i.test(message)) {
    return 'NETWORK';
  }

  // Auth errors: HTTP 401/403 or auth-related messages
  if (status === 401 || status === 403 || /unauthorized|forbidden/i.test(message)) {
    return 'AUTH';
  }

  // Timeout
  if (/timeout|timed.?out|aborted/i.test(message)) {
    return 'TIMEOUT';
  }

  return 'UNKNOWN';
}

// --- Line Parser ---

/**
 * Parse a single line of OpenCode CLI NDJSON output into a StreamEvent.
 * Returns null for unrecognized or unparseable lines.
 */
export function parseLine(line: string): StreamEvent[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch { // IGNORE: malformed JSON in CLI output — skip unparseable lines
    return [{ type: 'log', text: trimmed }];
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [];
  }

  const type = parsed.type as string | undefined;
  const events: StreamEvent[] = [];

  if (type === 'tool_call') {
    const name = parsed.name;
    const callId = parsed.call_id;
    if (typeof name === 'string' && typeof callId === 'string') {
      return [{ type: 'tool-start', name, id: callId }];
    }
    return [];
  }

  if (type === 'tool_input') {
    const input = parsed.input;
    if (typeof input === 'string') {
      return [{ type: 'tool-input', partial: input }];
    }
    return [];
  }

  if (type === 'tool_result') {
    return [{ type: 'tool-complete' }];
  }

  if (type === 'message') {
    const content = parsed.content;
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    return [];
  }

  if (type === 'text') {
    const part = parsed.part as Record<string, unknown> | undefined;
    const text = part?.text;
    if (typeof text === 'string' && text.length > 0) {
      return [{ type: 'text', text }];
    }
    return [];
  }

  if (type === 'tool_use') {
    const part = parsed.part as Record<string, unknown> | undefined;
    const tool = part?.tool;
    const callId = part?.callID;
    const state = part?.state as Record<string, unknown> | undefined;
    if (typeof tool === 'string' && typeof callId === 'string') {
      events.push({ type: 'tool-start', name: tool, id: callId });
      const input = state?.input;
      if (typeof input === 'string') {
        events.push({ type: 'tool-input', partial: input });
      } else if (input && typeof input === 'object') {
        events.push({ type: 'tool-input', partial: JSON.stringify(input) });
      }
      if (state?.status === 'completed') {
        events.push({ type: 'tool-complete' });
      }
    }
    return events;
  }

  if (type === 'retry') {
    const attempt = parsed.attempt;
    const delay = parsed.delay_ms;
    if (typeof attempt === 'number' && typeof delay === 'number') {
      return [{ type: 'retry', attempt, delay }];
    }
    return [];
  }

  if (type === 'step_finish') {
    const part = parsed.part as Record<string, unknown> | undefined;
    const reason = part?.reason;
    const sessionId = firstString(part?.sessionID, parsed.sessionID, parsed.session_id);
    const cost = firstNumber(part?.cost, parsed.cost_usd, parsed.total_cost_usd);
    if (reason === 'stop') {
      return [{
        type: 'result',
        cost: cost ?? 0,
        sessionId: sessionId ?? '',
        cost_usd: cost ?? null,
      }];
    }
    return [];
  }

  if (type === 'error') {
    const error = parsed.error as Record<string, unknown> | undefined;
    const data = error?.data as Record<string, unknown> | undefined;
    const sessionId = firstString(parsed.sessionID, parsed.session_id);
    const message = firstString(data?.message, error?.message, error?.name) ?? 'OpenCode error';
    return [{
      type: 'result',
      cost: 0,
      sessionId: sessionId ?? '',
      cost_usd: null,
      error: message,
      errorCategory: classifyError(message),
    }];
  }

  if (type === 'result') {
    const costUsd = firstNumber(parsed.cost_usd, parsed.total_cost_usd);
    const sessionId = firstString(parsed.session_id, parsed.sessionID);
    return [{
      type: 'result',
      cost: typeof costUsd === 'number' ? costUsd : 0,
      sessionId: typeof sessionId === 'string' ? sessionId : '',
      cost_usd: typeof costUsd === 'number' ? costUsd : null,
    }];
  }

  return [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

// --- Driver Implementation ---

/**
 * OpenCodeDriver — CLI-wrapped AgentDriver for OpenCode.
 *
 * Spawns `opencode` CLI via child_process.spawn, parses stdout line-by-line
 * into StreamEvent objects. Stateless between dispatches except `lastCost`.
 *
 * Key features:
 * - Supports plugins via `--plugin` flags
 * - Default model is 'gpt-5.4' (OpenCode's GPT-5.4 model)
 * - Install instructions point to https://opencode.ai
 */
export class OpenCodeDriver implements AgentDriver {
  readonly name = 'opencode' as const;
  readonly defaultModel = 'gpt-5.4' as const;
  readonly capabilities: DriverCapabilities = {
    supportsPlugins: true,
    supportsStreaming: true,
    costReporting: true,
    costTier: 2,
  };

  private lastCost: number | null = null;

  async healthCheck(): Promise<DriverHealth> {
    // Check if opencode binary is on PATH
    try {
      await execFileAsync('which', ['opencode']);
    } catch { // IGNORE: binary not on PATH — expected condition for health check
      return {
        available: false,
        authenticated: false,
        version: null,
        error: 'opencode not found. Install: https://opencode.ai',
      };
    }

    // Get version
    let version: string | null = null;
    try {
      const { stdout } = await execFileAsync('opencode', ['--version']);
      version = stdout.trim() || null;
    } catch { // IGNORE: version check failed — binary exists but version unknown
      // noop
    }

    // Auth is checked lazily at dispatch time (opencode run is too slow for health check)
    return { available: true, authenticated: true, version };
  }

  async *dispatch(opts: DispatchOpts): AsyncGenerator<StreamEvent> {
    this.lastCost = null;

    // Build CLI args for 'opencode run --format json'
    const args: string[] = ['run', '--format', 'json'];

    // Only pass model if it's not the driver's default sentinel
    if (opts.model && opts.model !== this.defaultModel) {
      args.push('--model', opts.model);
    }

    // Handle session continuation - OpenCode uses --continue flag
    if (opts.sessionId) {
      args.push('--continue', opts.sessionId);
    }

    // Pass plugins via --plugin flags if supported
    if (opts.plugins && opts.plugins.length > 0) {
      for (const plugin of opts.plugins) {
        args.push('--plugin', plugin);
      }
    }

    // Handle system prompt injection by prepending to prompt
    let prompt = opts.prompt;
    if (opts.appendSystemPrompt) {
      prompt = `${opts.appendSystemPrompt}\n\n${prompt}`;
    }

    args.push(prompt);

    let yieldedResult = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    let abortListener: (() => void) | undefined;

    // Use spawn with cwd option instead of --cwd flag
    const proc = spawn('opencode', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts.cwd,
    });

    if (opts.abortSignal) {
      abortListener = () => {
        aborted = true;
        proc.kill('SIGINT');
      };
      if (opts.abortSignal.aborted) {
        abortListener();
      } else {
        opts.abortSignal.addEventListener('abort', abortListener, { once: true });
      }
    }

    // Timeout handling
    if (opts.timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, opts.timeout);
    }

    // Collect stderr for error classification
    let stderrData = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    // Parse stdout line-by-line
    const rl = createInterface({ input: proc.stdout });

    // Capture close promise BEFORE iterating — close may fire during readline iteration
    const closePromise = new Promise<number | null>((resolve) => {
      proc.on('close', (code: number | null) => resolve(code));
    });

    try {
      for await (const line of rl) {
        const events = parseLine(line);
        if (events.length > 0) {
          for (const event of events) {
            // Capture cost from result events
            if (event.type === 'result') {
              const resultEvent = event as ResultEvent;
              if (typeof resultEvent.cost_usd === 'number') {
                this.lastCost = resultEvent.cost_usd;
              }
              yield event;
              yieldedResult = true;
            } else {
              yield event;
            }
          }
        }
      }

      // Wait for process to close (promise was registered before readline started)
      const exitCode = await closePromise;

      if (aborted && !timedOut) {
        const abortError = new Error('Dispatch aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      // Handle non-zero exit
      if (exitCode !== null && exitCode !== 0 && !yieldedResult) {
        const errorText = stderrData || `opencode exited with code ${exitCode}`;
        const category = timedOut ? 'TIMEOUT' : classifyError(errorText);

        yield {
          type: 'result',
          cost: this.lastCost ?? 0,
          sessionId: '',
          cost_usd: this.lastCost,
          error: errorText,
          errorCategory: category,
        } as ResultEvent;
        yieldedResult = true;
      }
    } catch (err: unknown) {
      if ((aborted && !timedOut) || (err instanceof Error && err.name === 'AbortError')) {
        const abortError = err instanceof Error ? err : new Error('Dispatch aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const category = timedOut ? 'TIMEOUT' : classifyError(err);

      yield {
        type: 'result',
        cost: this.lastCost ?? 0,
        sessionId: '',
        cost_usd: this.lastCost,
        error: errorMessage,
        errorCategory: category,
      } as ResultEvent;
      yieldedResult = true;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortListener && opts.abortSignal) {
        opts.abortSignal.removeEventListener('abort', abortListener);
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
