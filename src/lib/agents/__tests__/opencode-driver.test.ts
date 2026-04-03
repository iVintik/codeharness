import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter, Readable } from 'node:stream';

// --- Mock child_process ---

const mockSpawn = vi.fn();
const mockExecFile = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import { OpenCodeDriver, parseLine, classifyError } from '../drivers/opencode.js';
import type { DispatchOpts } from '../types.js';
import type { StreamEvent, ResultEvent } from '../stream-parser.js';

// --- Helpers ---

function makeOpts(overrides?: Partial<DispatchOpts>): DispatchOpts {
  return {
    prompt: 'Do the thing',
    model: 'default',
    cwd: '/tmp/test',
    sourceAccess: true,
    ...overrides,
  };
}

async function collectEvents(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

/**
 * Create a mock child process that emits given stdout lines and exits with given code.
 */
function createMockProcess(stdoutLines: string[], exitCode = 0, stderrData = ''): {
  proc: EventEmitter & {
    stdout: Readable;
    stderr: EventEmitter & { on: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
} {
  const stdout = new Readable({ read() {} });
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: EventEmitter & { on: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = stdout;
  proc.stderr = stderr as EventEmitter & { on: ReturnType<typeof vi.fn> };
  proc.kill = vi.fn(() => {
    // When killed, close the process
    setTimeout(() => {
      stdout.push(null);
      proc.emit('close', 1);
    }, 5);
  });

  // Push stderr data
  if (stderrData) {
    setTimeout(() => {
      stderr.emit('data', Buffer.from(stderrData));
    }, 1);
  }

  // Push lines to stdout, then close
  setTimeout(() => {
    for (const line of stdoutLines) {
      stdout.push(line + '\n');
    }
    stdout.push(null);

    // Emit close after stdout is consumed
    setTimeout(() => {
      proc.emit('close', exitCode);
    }, 10);
  }, 1);

  return { proc };
}

// --- Fixtures as inline data ---

const SUCCESS_LINES = [
  '{"type":"tool_call","name":"read_file","call_id":"oc_call_001"}',
  '{"type":"tool_input","call_id":"oc_call_001","input":"{\\"path\\":\\"/src/main.go\\"}"}',
  '{"type":"tool_result","call_id":"oc_call_001","output":"package main\\nfunc main() {}"}',
  '{"type":"message","content":"I\'ve read the file. Let me update it now."}',
  '{"type":"tool_call","name":"write_file","call_id":"oc_call_002"}',
  '{"type":"tool_input","call_id":"oc_call_002","input":"{\\"path\\":\\"/src/main.go\\",\\"content\\":\\"updated\\"}"}',
  '{"type":"tool_result","call_id":"oc_call_002","output":"File written successfully."}',
  '{"type":"message","content":"Done. The file has been updated with the print statement."}',
  '{"type":"result","status":"completed","cost_usd":0.0021,"session_id":"opencode-sess-xyz789"}',
];

const UNPARSEABLE_LINES = [
  'Starting opencode v0.5.0...',
  'Connecting to API endpoint...',
  '[progress] Analyzing codebase...',
  'not valid json {{{',
];

// --- Tests ---

describe('OpenCodeDriver', () => {
  let driver: OpenCodeDriver;

  beforeEach(() => {
    vi.clearAllMocks();
    driver = new OpenCodeDriver();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('class properties (AC #1)', () => {
    it('has name "opencode"', () => {
      expect(driver.name).toBe('opencode');
    });

    it('has defaultModel "default"', () => {
      expect(driver.defaultModel).toBe('default');
    });

    it('has correct capabilities', () => {
      expect(driver.capabilities).toEqual({
        supportsPlugins: true,
        supportsStreaming: true,
        costReporting: true,
      });
    });
  });

  describe('parseLine (AC #2)', () => {
    it('parses tool_call to tool-start event', () => {
      const event = parseLine('{"type":"tool_call","name":"read_file","call_id":"oc_001"}');
      expect(event).toEqual({ type: 'tool-start', name: 'read_file', id: 'oc_001' });
    });

    it('parses tool_input to tool-input event', () => {
      const event = parseLine('{"type":"tool_input","call_id":"c1","input":"{\\"path\\":\\"/a\\"}"}');
      expect(event).toEqual({ type: 'tool-input', partial: '{"path":"/a"}' });
    });

    it('parses tool_result to tool-complete event', () => {
      const event = parseLine('{"type":"tool_result","call_id":"c1","output":"ok"}');
      expect(event).toEqual({ type: 'tool-complete' });
    });

    it('parses message to text event', () => {
      const event = parseLine('{"type":"message","content":"Hello"}');
      expect(event).toEqual({ type: 'text', text: 'Hello' });
    });

    it('parses retry to retry event', () => {
      const event = parseLine('{"type":"retry","attempt":2,"delay_ms":5000}');
      expect(event).toEqual({ type: 'retry', attempt: 2, delay: 5000 });
    });

    it('parses result with cost', () => {
      const event = parseLine('{"type":"result","cost_usd":0.0021,"session_id":"sess-123"}');
      expect(event).toEqual({
        type: 'result',
        cost: 0.0021,
        sessionId: 'sess-123',
        cost_usd: 0.0021,
      });
    });

    it('parses result without cost (cost_usd is null)', () => {
      const event = parseLine('{"type":"result","status":"completed","session_id":"sess-123"}');
      expect(event).toEqual({
        type: 'result',
        cost: 0,
        sessionId: 'sess-123',
        cost_usd: null,
      });
    });

    it('returns null for empty lines', () => {
      expect(parseLine('')).toBeNull();
      expect(parseLine('   ')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(parseLine('not valid json {{{')).toBeNull();
    });

    it('returns null for unrecognized type', () => {
      expect(parseLine('{"type":"unknown_event","data":"foo"}')).toBeNull();
    });

    it('returns null for arrays', () => {
      expect(parseLine('[1,2,3]')).toBeNull();
    });

    it('returns null for primitives', () => {
      expect(parseLine('"hello"')).toBeNull();
      expect(parseLine('42')).toBeNull();
    });

    it('returns null for tool_call missing name', () => {
      expect(parseLine('{"type":"tool_call","call_id":"c1"}')).toBeNull();
    });

    it('returns null for tool_call missing call_id', () => {
      expect(parseLine('{"type":"tool_call","name":"read_file"}')).toBeNull();
    });

    it('returns null for tool_input with non-string input', () => {
      expect(parseLine('{"type":"tool_input","call_id":"c1","input":42}')).toBeNull();
    });

    it('returns null for message with non-string content', () => {
      expect(parseLine('{"type":"message","content":42}')).toBeNull();
    });

    it('returns null for message with missing content', () => {
      expect(parseLine('{"type":"message"}')).toBeNull();
    });

    it('returns null for retry with non-number attempt', () => {
      expect(parseLine('{"type":"retry","attempt":"two","delay_ms":5000}')).toBeNull();
    });

    it('returns null for retry with non-number delay', () => {
      expect(parseLine('{"type":"retry","attempt":2,"delay_ms":"slow"}')).toBeNull();
    });
  });

  describe('classifyError (AC #4)', () => {
    it('classifies 429 status as RATE_LIMIT', () => {
      const err = Object.assign(new Error('Rate limit'), { status: 429 });
      expect(classifyError(err)).toBe('RATE_LIMIT');
    });

    it('classifies "rate limit" in message as RATE_LIMIT', () => {
      expect(classifyError('You have exceeded your rate limit')).toBe('RATE_LIMIT');
    });

    it('classifies ECONNREFUSED code as NETWORK', () => {
      const err = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
      expect(classifyError(err)).toBe('NETWORK');
    });

    it('classifies ECONNREFUSED in message string as NETWORK (via fetch match)', () => {
      expect(classifyError('fetch failed: connect ECONNREFUSED 127.0.0.1:443')).toBe('NETWORK');
    });

    it('classifies ECONNREFUSED in message string as NETWORK (via code regex)', () => {
      expect(classifyError('connect ECONNREFUSED 127.0.0.1:443')).toBe('NETWORK');
    });

    it('classifies ETIMEDOUT code as NETWORK', () => {
      const err = Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
      expect(classifyError(err)).toBe('NETWORK');
    });

    it('classifies fetch failure message as NETWORK', () => {
      expect(classifyError('fetch failed: DNS resolution error')).toBe('NETWORK');
    });

    it('classifies 401 status as AUTH', () => {
      const err = Object.assign(new Error('Unauthorized'), { status: 401 });
      expect(classifyError(err)).toBe('AUTH');
    });

    it('classifies 403 status as AUTH', () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      expect(classifyError(err)).toBe('AUTH');
    });

    it('classifies "unauthorized" in message as AUTH', () => {
      expect(classifyError('Unauthorized. Please check your API key')).toBe('AUTH');
    });

    it('classifies timeout in message as TIMEOUT', () => {
      expect(classifyError('operation timed out')).toBe('TIMEOUT');
    });

    it('classifies unknown errors as UNKNOWN', () => {
      expect(classifyError('Something unexpected happened')).toBe('UNKNOWN');
    });

    it('follows priority order: rate limit before network', () => {
      const err = Object.assign(new Error('rate limit reached'), { code: 'ECONNRESET' });
      expect(classifyError(err)).toBe('RATE_LIMIT');
    });

    it('follows priority order: network before auth', () => {
      const err = Object.assign(new Error('forbidden'), { code: 'ECONNREFUSED' });
      expect(classifyError(err)).toBe('NETWORK');
    });
  });

  describe('dispatch — successful flow (AC #2, #3, #8)', () => {
    it('produces correct StreamEvent sequence from fixture lines', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const types = events.map((e) => e.type);

      expect(types).toEqual([
        'tool-start',
        'tool-input',
        'tool-complete',
        'text',
        'tool-start',
        'tool-input',
        'tool-complete',
        'text',
        'result',
      ]);
    });

    it('result event is always the last event', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      expect(events[events.length - 1].type).toBe('result');
    });

    it('captures cost from CLI output', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;
      expect(resultEvent.cost_usd).toBe(0.0021);
      expect(resultEvent.cost).toBe(0.0021);
    });

    it('getLastCost returns cost after dispatch', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBe(0.0021);
    });
  });

  describe('dispatch — cost handling (AC #3)', () => {
    it('cost_usd is null when CLI does not report cost', async () => {
      const lines = [
        '{"type":"message","content":"Done."}',
        '{"type":"result","status":"completed","session_id":"sess-no-cost"}',
      ];
      const { proc } = createMockProcess(lines, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;
      expect(resultEvent.cost_usd).toBeNull();
    });

    it('getLastCost returns null before any dispatch', () => {
      expect(driver.getLastCost()).toBeNull();
    });

    it('getLastCost resets on new dispatch', async () => {
      // First dispatch with cost
      const { proc: proc1 } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc1);
      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBe(0.0021);

      // Second dispatch without cost
      const lines = ['{"type":"result","status":"completed","session_id":"s"}'];
      const { proc: proc2 } = createMockProcess(lines, 0);
      mockSpawn.mockReturnValue(proc2);
      await collectEvents(driver.dispatch(makeOpts()));
      expect(driver.getLastCost()).toBeNull();
    });
  });

  describe('dispatch — error handling (AC #4)', () => {
    it('yields result with RATE_LIMIT on rate limit stderr', async () => {
      const { proc } = createMockProcess(
        [],
        1,
        'Error: Request failed with status 429: You have exceeded your rate limit.',
      );
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;
      expect(resultEvent.errorCategory).toBe('RATE_LIMIT');
    });

    it('yields result with AUTH on auth failure stderr', async () => {
      const { proc } = createMockProcess(
        [],
        1,
        'Error: Request failed with status 401: Unauthorized.',
      );
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;
      expect(resultEvent.errorCategory).toBe('AUTH');
    });

    it('yields result with NETWORK on network failure stderr', async () => {
      const { proc } = createMockProcess(
        [],
        1,
        'Error: fetch failed: connect ECONNREFUSED 127.0.0.1:443',
      );
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;
      expect(resultEvent.errorCategory).toBe('NETWORK');
    });

    it('yields result with UNKNOWN on unrecognized error', async () => {
      const { proc } = createMockProcess([], 1, 'Something went wrong');
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;
      expect(resultEvent.errorCategory).toBe('UNKNOWN');
    });

    it('always yields exactly one result event on error', async () => {
      const { proc } = createMockProcess([], 1, 'kaboom');
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });
  });

  describe('dispatch — result guarantee (AC #2)', () => {
    it('yields result even when stdout is empty and exit code is 0', async () => {
      const { proc } = createMockProcess([], 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });

    it('yields exactly one result from normal flow', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });
  });

  describe('dispatch — timeout (AC #6)', () => {
    it('kills process on timeout and yields TIMEOUT result', async () => {
      // Create a process that never completes on its own
      const stdout = new Readable({ read() {} });
      const stderr = new EventEmitter();
      const proc = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      proc.stdout = stdout;
      proc.stderr = stderr;
      proc.kill = vi.fn(() => {
        // When killed, end the streams and emit close
        setTimeout(() => {
          stdout.push(null);
          proc.emit('close', 1);
        }, 5);
      });

      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts({ timeout: 50 })));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;

      expect(proc.kill).toHaveBeenCalled();
      expect(resultEvent).toBeDefined();
      expect(resultEvent.errorCategory).toBe('TIMEOUT');
    });
  });

  describe('dispatch — plugins pass-through (AC #7)', () => {
    it('passes plugins as --plugin flags to CLI', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      await collectEvents(
        driver.dispatch(makeOpts({ plugins: ['plugin-a', 'plugin-b'] })),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--plugin', 'plugin-a', '--plugin', 'plugin-b']),
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });

    it('does not add --plugin flags when plugins is empty', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      await collectEvents(driver.dispatch(makeOpts({ plugins: [] })));

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--plugin');
    });

    it('does not add --plugin flags when plugins is undefined', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      await collectEvents(driver.dispatch(makeOpts({ plugins: undefined })));

      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--plugin');
    });

    it('proceeds normally with plugins', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(
        driver.dispatch(makeOpts({ plugins: ['some-plugin'] })),
      );
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].type).toBe('result');
    });
  });

  describe('dispatch — unparseable lines (AC #2)', () => {
    it('skips unparseable lines and logs them at debug level', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const lines = [
        ...UNPARSEABLE_LINES,
        '{"type":"result","cost_usd":0.01,"session_id":"s1"}',
      ];
      const { proc } = createMockProcess(lines, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));

      // Only the result event should be yielded
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('result');

      // All 4 unparseable lines should be debug-logged
      expect(debugSpy).toHaveBeenCalledTimes(4);
      debugSpy.mockRestore();
    });
  });

  describe('dispatch — event ordering (AC #8)', () => {
    it('events follow tool-start -> tool-input -> tool-complete, text, result ordering', async () => {
      const { proc } = createMockProcess(SUCCESS_LINES, 0);
      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const types = events.map((e) => e.type);

      // Verify no result event before the end
      const resultIndex = types.indexOf('result');
      expect(resultIndex).toBe(types.length - 1);

      // Verify tool sequences are ordered correctly
      // First tool use: tool-start, tool-input, tool-complete
      expect(types[0]).toBe('tool-start');
      expect(types[1]).toBe('tool-input');
      expect(types[2]).toBe('tool-complete');
      // Then text
      expect(types[3]).toBe('text');
    });
  });

  describe('healthCheck (AC #5)', () => {
    it('returns available: true when binary is found', async () => {
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
          if (cmd === 'which') {
            cb(null, { stdout: '/usr/local/bin/opencode\n' });
          } else if (args[0] === '--version') {
            cb(null, { stdout: '0.5.0\n' });
          } else if (args[0] === 'auth') {
            cb(null, { stdout: 'authenticated\n' });
          }
        },
      );

      const health = await driver.healthCheck();
      expect(health.available).toBe(true);
      expect(health.version).toBe('0.5.0');
      expect(health.authenticated).toBe(true);
    });

    it('returns available: false when binary is not found', async () => {
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
          cb(new Error('not found'));
        },
      );

      const health = await driver.healthCheck();
      expect(health.available).toBe(false);
      expect(health.authenticated).toBe(false);
      expect(health.version).toBeNull();
      expect(health.error).toBe('opencode not found. Install: https://opencode.ai');
    });

    it('returns authenticated: false when auth check fails', async () => {
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], cb: (err: Error | null, result?: { stdout: string }) => void) => {
          if (cmd === 'which') {
            cb(null, { stdout: '/usr/local/bin/opencode\n' });
          } else if (args[0] === '--version') {
            cb(null, { stdout: '0.5.0\n' });
          } else if (args[0] === 'auth') {
            cb(new Error('not authenticated'));
          }
        },
      );

      const health = await driver.healthCheck();
      expect(health.available).toBe(true);
      expect(health.authenticated).toBe(false);
    });
  });

  describe('dispatch — CLI args', () => {
    it('passes model, cwd, and prompt to spawn', async () => {
      const { proc } = createMockProcess(
        ['{"type":"result","cost_usd":0.01,"session_id":"s"}'],
        0,
      );
      mockSpawn.mockReturnValue(proc);

      await collectEvents(
        driver.dispatch(makeOpts({ model: 'gpt-4o', cwd: '/my/project', prompt: 'hello' })),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['--model', 'gpt-4o', '--cwd', '/my/project', 'hello'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });
  });

  describe('dispatch — exception during readline (catch block)', () => {
    it('yields result with error when readline throws', async () => {
      const stdout = new Readable({
        read() {
          // Emit an error instead of data to trigger the catch block
          process.nextTick(() => this.destroy(new Error('stream exploded')));
        },
      });
      const stderr = new EventEmitter();
      const proc = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      proc.stdout = stdout;
      proc.stderr = stderr;
      proc.kill = vi.fn();

      // Need to emit close after the error
      stdout.on('error', () => {
        setTimeout(() => proc.emit('close', 1), 5);
      });

      mockSpawn.mockReturnValue(proc);

      const events = await collectEvents(driver.dispatch(makeOpts()));
      const resultEvent = events.find((e) => e.type === 'result') as ResultEvent;

      expect(resultEvent).toBeDefined();
      expect(resultEvent.error).toContain('stream exploded');
      expect(resultEvent.errorCategory).toBe('UNKNOWN');
    });
  });

  describe('dispatch — no model or cwd in opts', () => {
    it('does not pass --model or --cwd when opts omit them', async () => {
      const { proc } = createMockProcess(
        ['{"type":"result","cost_usd":0.01,"session_id":"s"}'],
        0,
      );
      mockSpawn.mockReturnValue(proc);

      await collectEvents(
        driver.dispatch({ prompt: 'hello', model: '', cwd: '', sourceAccess: true }),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['hello'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });
  });

  describe('barrel export (AC #9)', () => {
    it('OpenCodeDriver is re-exported from drivers/index.ts', async () => {
      const mod = await import('../drivers/index.js');
      expect(mod.OpenCodeDriver).toBe(OpenCodeDriver);
    });
  });
});
