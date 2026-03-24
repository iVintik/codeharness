/**
 * RalphDriver — AgentDriver implementation for the Ralph autonomous loop.
 *
 * Wraps ralph.sh invocation behind the AgentDriver interface defined in types.ts.
 * Migrates ralph-specific parsing and spawning logic from run-helpers.ts.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentDriver, SpawnOpts, AgentProcess, AgentEvent } from './types.js';
import { parseStreamLine } from './stream-parser.js';

// --- Regex constants (migrated from run-helpers.ts) ---

/** Strip ANSI color codes */
const ANSI_ESCAPE = /\x1b\[[0-9;]*m/g;

/** Strip timestamp prefix from ralph output lines */
const TIMESTAMP_PREFIX = /^\[[\d-]+\s[\d:]+\]\s*/;

/** Matches: [SUCCESS] Story {key}: DONE ... */
const SUCCESS_STORY = /\[SUCCESS\]\s+Story\s+([\w-]+):\s+DONE(.*)/;

/** Matches: [WARN] Story {key} exceeded retry limit ... flagging */
const WARN_STORY_RETRY = /\[WARN\]\s+Story\s+([\w-]+)\s+exceeded retry limit/;

/** Matches: [WARN] Story {key} ... retry N/M */
const WARN_STORY_RETRYING = /\[WARN\]\s+Story\s+([\w-]+)\s+.*retry\s+(\d+)\/(\d+)/;

/** Matches: [LOOP] iteration N */
const LOOP_ITERATION = /\[LOOP\]\s+iteration\s+(\d+)/;

/** Matches: [ERROR] ... */
const ERROR_LINE = /\[ERROR\]\s+(.+)/;

// --- StoryMessage type (local, replaces import from ink-components) ---

interface StoryMessage {
  type: 'ok' | 'fail' | 'warn';
  key: string;
  message: string;
}

// --- Migrated functions ---

/**
 * Parse a ralph output line and return a StoryMessage if it matches
 * a story completion, failure, or warning pattern.
 * Returns null for non-matching lines.
 */
export function parseRalphMessage(rawLine: string): StoryMessage | null {
  const clean = rawLine.replace(ANSI_ESCAPE, '').replace(TIMESTAMP_PREFIX, '').trim();
  if (clean.length === 0) return null;

  // [SUCCESS] Story {key}: DONE ...
  const success = SUCCESS_STORY.exec(clean);
  if (success) {
    const key = success[1];
    const rest = success[2].trim().replace(/^—\s*/, '');
    return {
      type: 'ok',
      key,
      message: rest ? `DONE — ${rest}` : 'DONE',
    };
  }

  // [WARN] Story {key} exceeded retry limit
  const retryExceeded = WARN_STORY_RETRY.exec(clean);
  if (retryExceeded) {
    return {
      type: 'fail',
      key: retryExceeded[1],
      message: 'exceeded retry limit',
    };
  }

  // [WARN] Story {key} — retry N/M
  const retrying = WARN_STORY_RETRYING.exec(clean);
  if (retrying) {
    return {
      type: 'warn',
      key: retrying[1],
      message: `retry ${retrying[2]}/${retrying[3]}`,
    };
  }

  // [ERROR] ... — surface as a generic error message
  const errorMatch = ERROR_LINE.exec(clean);
  if (errorMatch) {
    // Try to extract story key from error message
    const keyMatch = errorMatch[1].match(/Story\s+([\w-]+)/);
    if (keyMatch) {
      return {
        type: 'fail',
        key: keyMatch[1],
        message: errorMatch[1].trim(),
      };
    }
    // Generic error without a story key — skip (no key to associate)
    return null;
  }

  return null;
}

/**
 * Parse a ralph stderr line for [LOOP] iteration messages.
 * Returns the iteration number if found, or null otherwise.
 */
export function parseIterationMessage(rawLine: string): number | null {
  const clean = rawLine.replace(ANSI_ESCAPE, '').replace(TIMESTAMP_PREFIX, '').trim();
  if (clean.length === 0) return null;
  const match = LOOP_ITERATION.exec(clean);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Builds the argument array for spawning Ralph.
 */
export function buildSpawnArgs(opts: {
  ralphPath: string;
  pluginDir: string;
  promptFile: string;
  maxIterations: number;
  timeout: number;
  iterationTimeout: number;
  calls: number;
  quiet: boolean;
  maxStoryRetries?: number;
  reset?: boolean;
}): string[] {
  const args = [
    opts.ralphPath,
    '--plugin-dir', opts.pluginDir,
    '--max-iterations', String(opts.maxIterations),
    '--timeout', String(opts.timeout),
    '--iteration-timeout', String(opts.iterationTimeout),
    '--calls', String(opts.calls),
    '--prompt', opts.promptFile,
  ];

  // When not quiet, pass --live so ralph tees Claude's stream-json to stdout.
  if (!opts.quiet) {
    args.push('--live');
  }

  if (opts.maxStoryRetries !== undefined) {
    args.push('--max-story-retries', String(opts.maxStoryRetries));
  }

  if (opts.reset) {
    args.push('--reset');
  }

  return args;
}

/** Resolves the path to ralph/ralph.sh relative to the package root. */
export function resolveRalphPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // currentDir is src/lib/agents (or dist/lib/agents)
  let root = dirname(dirname(currentDir));
  if (root.endsWith('/src') || root.endsWith('\\src')) {
    root = dirname(root);
  }
  return join(root, 'ralph', 'ralph.sh');
}

// --- RalphConfig for constructor-time configuration ---

/**
 * Ralph-specific configuration passed at construction time.
 * Keeps SpawnOpts agent-agnostic while allowing RalphDriver
 * to accept all ralph.sh flags.
 */
export interface RalphConfig {
  pluginDir: string;
  maxIterations?: number;
  iterationTimeout?: number;
  calls?: number;
  quiet?: boolean;
  maxStoryRetries?: number;
  reset?: boolean;
}

// --- RalphDriver class ---

export class RalphDriver implements AgentDriver {
  readonly name = 'ralph';
  private readonly config: RalphConfig;

  constructor(config?: RalphConfig) {
    this.config = config ?? { pluginDir: join(process.cwd(), '.claude') };
  }

  spawn(opts: SpawnOpts): AgentProcess {
    const ralphPath = resolveRalphPath();
    if (!existsSync(ralphPath)) {
      throw new Error(`Ralph loop not found at ${ralphPath} — reinstall codeharness`);
    }

    const args = buildSpawnArgs({
      ralphPath,
      pluginDir: this.config.pluginDir,
      promptFile: opts.prompt,
      maxIterations: this.config.maxIterations ?? 50,
      timeout: opts.timeout,
      iterationTimeout: this.config.iterationTimeout ?? 30,
      calls: this.config.calls ?? 100,
      quiet: this.config.quiet ?? false,
      maxStoryRetries: this.config.maxStoryRetries,
      reset: this.config.reset,
    });

    const quiet = this.config.quiet ?? false;
    const child = spawn('bash', args, {
      cwd: opts.workDir,
      env: { ...process.env, ...opts.env },
      stdio: quiet ? 'ignore' : ['inherit', 'pipe', 'pipe'],
    });

    return child as unknown as AgentProcess;
  }

  parseOutput(line: string): AgentEvent | null {
    // 1. Try ralph stderr patterns
    const iteration = parseIterationMessage(line);
    if (iteration !== null) {
      return { type: 'iteration', count: iteration };
    }

    const msg = parseRalphMessage(line);
    if (msg) {
      switch (msg.type) {
        case 'ok':
          return { type: 'story-complete', key: msg.key, details: msg.message };
        case 'fail':
          return { type: 'story-failed', key: msg.key, reason: msg.message };
        case 'warn': {
          // Parse retry N/M from message
          const retryMatch = msg.message.match(/retry\s+(\d+)\/(\d+)/);
          if (retryMatch) {
            return {
              type: 'retry',
              attempt: parseInt(retryMatch[1], 10),
              delay: 0,
            };
          }
          // Fallback: treat as story-failed
          return { type: 'story-failed', key: msg.key, reason: msg.message };
        }
      }
    }

    // 2. Fall back to stream-json parser
    const streamEvent = parseStreamLine(line);
    if (streamEvent) {
      switch (streamEvent.type) {
        case 'tool-start':
          return { type: 'tool-start', name: streamEvent.name };
        case 'tool-complete':
          return { type: 'tool-complete' };
        case 'text':
          return { type: 'text', text: streamEvent.text };
        case 'retry':
          return { type: 'retry', attempt: streamEvent.attempt, delay: streamEvent.delay };
        case 'result':
          return { type: 'result', cost: streamEvent.cost, sessionId: streamEvent.sessionId };
        case 'tool-input':
          // tool-input deltas are not mapped to AgentEvent
          return null;
      }
    }

    return null;
  }

  getStatusFile(): string {
    return 'ralph/status.json';
  }
}
