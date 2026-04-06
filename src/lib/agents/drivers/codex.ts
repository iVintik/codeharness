/**
 * Codex Driver — CLI-wrapped driver for OpenAI Codex.
 *
 * Spawns the `codex` CLI binary via child_process.spawn and parses
 * its NDJSON stdout into StreamEvent objects.
 *
 * @see architecture-multi-framework.md — Decision 1: Driver Interface Design
 * @see architecture-multi-framework.md — Decision 2: CLI-Wrapping Strategy
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
 * Parse a single line of Codex CLI NDJSON output into a StreamEvent.
 * Returns null for unrecognized or unparseable lines.
 */
/**
 * Parse a JSONL line from `codex exec --json` into a StreamEvent.
 *
 * Codex JSONL format:
 * - item.started  { item: { type: 'command_execution', command: '...' } }
 * - item.completed { item: { type: 'command_execution' | 'agent_message', ... } }
 * - turn.completed { usage: { input_tokens, output_tokens } }
 */
/**
 * Parse a JSONL line into one or more StreamEvents.
 * Returns array because codex item.started needs to emit both tool-start and tool-input.
 */
export function parseLineMulti(line: string): StreamEvent[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch { // IGNORE: malformed JSON
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return [];

  const type = parsed.type as string | undefined;
  const item = parsed.item as Record<string, unknown> | undefined;

  if (type === 'item.started' && item) {
    const itemType = item.type as string | undefined;
    if (itemType === 'command_execution') {
      const cmd = (item.command as string) ?? '';
      return [
        { type: 'tool-start', name: 'Bash', id: (item.id as string) ?? '' },
        { type: 'tool-input', partial: cmd },
      ];
    }
    if (itemType === 'file_edit') {
      const path = (item.file_path as string) ?? (item.path as string) ?? '';
      return [
        { type: 'tool-start', name: 'Edit', id: (item.id as string) ?? '' },
        { type: 'tool-input', partial: path },
      ];
    }
    if (itemType === 'file_read') {
      const path = (item.file_path as string) ?? (item.path as string) ?? '';
      return [
        { type: 'tool-start', name: 'Read', id: (item.id as string) ?? '' },
        { type: 'tool-input', partial: path },
      ];
    }
    return [];
  }

  if (type === 'item.completed' && item) {
    const itemType = item.type as string | undefined;
    if (itemType === 'command_execution') return [{ type: 'tool-complete' }];
    if (itemType === 'agent_message') {
      const text = item.text as string | undefined;
      return text ? [{ type: 'text', text }] : [];
    }
    if (itemType === 'file_edit' || itemType === 'file_read') return [{ type: 'tool-complete' }];
    return [];
  }

  if (type === 'turn.completed') {
    const usage = parsed.usage as Record<string, unknown> | undefined;
    if (usage) {
      return [{
        type: 'result',
        cost: 0,
        sessionId: '',
        cost_usd: null,
      } as StreamEvent];
    }
    return [];
  }

  // Fall through to legacy parser for older codex formats
  const legacy = parseLine(line);
  return legacy ? [legacy] : [];
}

/** Legacy single-event parser for older codex output formats. */
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
  const item = parsed.item as Record<string, unknown> | undefined;

  // --- Codex native JSONL format (codex exec --json) ---

  if (type === 'item.started' && item) {
    const itemType = item.type as string | undefined;
    if (itemType === 'command_execution') {
      return { type: 'tool-start', name: 'Bash', id: (item.id as string) ?? '' };
    }
    if (itemType === 'file_edit') {
      return { type: 'tool-start', name: 'Edit', id: (item.id as string) ?? '' };
    }
    if (itemType === 'file_read') {
      return { type: 'tool-start', name: 'Read', id: (item.id as string) ?? '' };
    }
    return null;
  }

  if (type === 'item.completed' && item) {
    const itemType = item.type as string | undefined;
    if (itemType === 'command_execution') {
      return { type: 'tool-complete' };
    }
    if (itemType === 'agent_message') {
      const text = item.text as string | undefined;
      if (text) return { type: 'text', text };
    }
    if (itemType === 'file_edit' || itemType === 'file_read') {
      return { type: 'tool-complete' };
    }
    return null;
  }

  // --- Legacy format (pre-JSONL, kept for backward compatibility) ---

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
 * CodexDriver — CLI-wrapped AgentDriver for OpenAI Codex.
 *
 * Spawns `codex` CLI via child_process.spawn, parses stdout line-by-line
 * into StreamEvent objects. Stateless between dispatches except `lastCost`.
 */
export class CodexDriver implements AgentDriver {
  readonly name = 'codex' as const;
  readonly defaultModel = 'codex-mini' as const;
  readonly capabilities: DriverCapabilities = {
    supportsPlugins: false,
    supportsStreaming: true,
    costReporting: true,
    costTier: 1,
  };

  private lastCost: number | null = null;

  async healthCheck(): Promise<DriverHealth> {
    // Check if codex binary is on PATH
    try {
      await execFileAsync('which', ['codex']);
    } catch { // IGNORE: binary not on PATH — expected condition for health check
      return {
        available: false,
        authenticated: false,
        version: null,
        error: 'codex CLI not found. Install: npm install -g @openai/codex',
      };
    }

    // Get version
    let version: string | null = null;
    try {
      const { stdout } = await execFileAsync('codex', ['--version']);
      version = stdout.trim() || null;
    } catch { // IGNORE: version check failed — binary exists but version unknown
      // noop
    }

    // Check auth status
    let authenticated = false;
    try {
      await execFileAsync('codex', ['auth', 'status']);
      authenticated = true;
    } catch { // IGNORE: auth check failed or command not supported — treat as unauthenticated
      // noop
    }

    return { available: true, authenticated, version };
  }

  async *dispatch(opts: DispatchOpts): AsyncGenerator<StreamEvent> {
    this.lastCost = null;

    // Warn about plugins
    if (opts.plugins && opts.plugins.length > 0) {
      console.warn(
        '[CodexDriver] Codex does not support plugins. Ignoring plugins:',
        opts.plugins,
      );
    }

    // Build CLI args — sandbox policy depends on source_access:
    // source_access=true  → full access (needs to run tests, install deps, etc.)
    // source_access=false → workspace-write only (blind verification sandbox)
    const args: string[] = opts.sourceAccess
      ? ['exec', '--json', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check']
      : ['exec', '--json', '--full-auto', '--skip-git-repo-check'];
    // Only pass model if it's a codex-compatible model (not a Claude model)
    const model = opts.model && !opts.model.startsWith('claude-') ? opts.model : undefined;
    if (model) {
      args.push('--model', model);
    }
    if (opts.cwd) {
      args.push('--cd', opts.cwd);
    }
    args.push(opts.prompt);

    let yieldedResult = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    let abortListener: (() => void) | undefined;

    const proc = spawn('codex', args, {
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
        const events = parseLineMulti(line);
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

      // Wait for process to close (promise was registered before readline started)
      const exitCode = await closePromise;

      if (aborted && !timedOut) {
        const abortError = new Error('Dispatch aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      // Handle non-zero exit
      if (exitCode !== null && exitCode !== 0 && !yieldedResult) {
        const errorText = stderrData || `codex exited with code ${exitCode}`;
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
