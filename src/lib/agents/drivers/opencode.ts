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
export function parseLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch { // IGNORE: malformed JSON in CLI output — skip unparseable lines
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const type = parsed.type as string | undefined;

  if (type === 'tool_call') {
    const name = parsed.name;
    const callId = parsed.call_id;
    if (typeof name === 'string' && typeof callId === 'string') {
      return { type: 'tool-start', name, id: callId };
    }
    return null;
  }

  if (type === 'tool_input') {
    const input = parsed.input;
    if (typeof input === 'string') {
      return { type: 'tool-input', partial: input };
    }
    return null;
  }

  if (type === 'tool_result') {
    return { type: 'tool-complete' };
  }

  if (type === 'message') {
    const content = parsed.content;
    if (typeof content === 'string') {
      return { type: 'text', text: content };
    }
    return null;
  }

  if (type === 'retry') {
    const attempt = parsed.attempt;
    const delay = parsed.delay_ms;
    if (typeof attempt === 'number' && typeof delay === 'number') {
      return { type: 'retry', attempt, delay };
    }
    return null;
  }

  if (type === 'result') {
    const costUsd = parsed.cost_usd;
    const sessionId = parsed.session_id;
    return {
      type: 'result',
      cost: typeof costUsd === 'number' ? costUsd : 0,
      sessionId: typeof sessionId === 'string' ? sessionId : '',
      cost_usd: typeof costUsd === 'number' ? costUsd : null,
    };
  }

  return null;
}

// --- Driver Implementation ---

/**
 * OpenCodeDriver — CLI-wrapped AgentDriver for OpenCode.
 *
 * Spawns `opencode` CLI via child_process.spawn, parses stdout line-by-line
 * into StreamEvent objects. Stateless between dispatches except `lastCost`.
 *
 * Key differences from CodexDriver:
 * - Supports plugins via `--plugin` flags (CodexDriver warns and ignores)
 * - Default model is 'default' (inherits from OpenCode's own config)
 * - Install instructions point to https://opencode.ai
 */
export class OpenCodeDriver implements AgentDriver {
  readonly name = 'opencode' as const;
  readonly defaultModel = 'default' as const;
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

    // Check auth status
    let authenticated = false;
    try {
      await execFileAsync('opencode', ['auth', 'status']);
      authenticated = true;
    } catch { // IGNORE: auth check failed or command not supported — treat as unauthenticated
      // noop
    }

    return { available: true, authenticated, version };
  }

  async *dispatch(opts: DispatchOpts): AsyncGenerator<StreamEvent> {
    this.lastCost = null;

    // Build CLI args
    const args: string[] = [];
    if (opts.model) {
      args.push('--model', opts.model);
    }
    if (opts.cwd) {
      args.push('--cwd', opts.cwd);
    }

    // Pass plugins via --plugin flags (OpenCode supports plugins natively)
    if (opts.plugins && opts.plugins.length > 0) {
      for (const plugin of opts.plugins) {
        args.push('--plugin', plugin);
      }
    }

    args.push(opts.prompt);

    let yieldedResult = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    let abortListener: (() => void) | undefined;

    const proc = spawn('opencode', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
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
        const event = parseLine(line);
        if (event) {
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
        } else {
          // Unparseable line — log at debug level and skip
          console.debug('[OpenCodeDriver] Skipping unparseable line:', line);
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
