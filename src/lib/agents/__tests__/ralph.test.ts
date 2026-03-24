import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RalphDriver,
  parseRalphMessage,
  parseIterationMessage,
  buildSpawnArgs,
  resolveRalphPath,
} from '../ralph.js';
import type { AgentEvent, AgentDriver, SpawnOpts } from '../types.js';

// Mock child_process.spawn for spawn() tests
const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('RalphDriver', () => {
  const driver = new RalphDriver();

  describe('name', () => {
    it('equals "ralph"', () => {
      expect(driver.name).toBe('ralph');
    });
  });

  describe('getStatusFile', () => {
    it('returns "ralph/status.json"', () => {
      expect(driver.getStatusFile()).toBe('ralph/status.json');
    });
  });

  describe('implements AgentDriver', () => {
    it('satisfies the AgentDriver interface', () => {
      const d: AgentDriver = driver;
      expect(d.name).toBe('ralph');
      expect(typeof d.spawn).toBe('function');
      expect(typeof d.parseOutput).toBe('function');
      expect(typeof d.getStatusFile).toBe('function');
    });
  });

  describe('spawn', () => {
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
    };

    beforeEach(() => {
      spawnMock.mockReset();
      spawnMock.mockReturnValue(mockChild);
    });

    it('calls spawn with bash and ralph.sh path', () => {
      const opts: SpawnOpts = {
        storyKey: '1-1-test',
        prompt: '/tmp/prompt.md',
        workDir: '/tmp/project',
        timeout: 14400,
      };
      driver.spawn(opts);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [cmd, args, spawnOpts] = spawnMock.mock.calls[0];
      expect(cmd).toBe('bash');
      expect(args[0]).toMatch(/ralph\.sh$/);
      expect(spawnOpts.cwd).toBe('/tmp/project');
      expect(spawnOpts.stdio).toEqual(['inherit', 'pipe', 'pipe']);
    });

    it('passes prompt file via --prompt arg', () => {
      const opts: SpawnOpts = {
        storyKey: '1-1-test',
        prompt: '/tmp/my-prompt.md',
        workDir: '/tmp/project',
        timeout: 14400,
      };
      driver.spawn(opts);
      const args: string[] = spawnMock.mock.calls[0][1];
      const promptIdx = args.indexOf('--prompt');
      expect(promptIdx).toBeGreaterThan(-1);
      expect(args[promptIdx + 1]).toBe('/tmp/my-prompt.md');
    });

    it('passes timeout via --timeout arg', () => {
      const opts: SpawnOpts = {
        storyKey: '1-1-test',
        prompt: '/tmp/prompt.md',
        workDir: '/tmp/project',
        timeout: 7200,
      };
      driver.spawn(opts);
      const args: string[] = spawnMock.mock.calls[0][1];
      const timeoutIdx = args.indexOf('--timeout');
      expect(timeoutIdx).toBeGreaterThan(-1);
      expect(args[timeoutIdx + 1]).toBe('7200');
    });

    it('merges env variables', () => {
      const opts: SpawnOpts = {
        storyKey: '1-1-test',
        prompt: '/tmp/prompt.md',
        workDir: '/tmp/project',
        timeout: 14400,
        env: { CUSTOM_VAR: 'value' },
      };
      driver.spawn(opts);
      const spawnOpts = spawnMock.mock.calls[0][2];
      expect(spawnOpts.env.CUSTOM_VAR).toBe('value');
    });

    it('returns the child process as AgentProcess', () => {
      const opts: SpawnOpts = {
        storyKey: '1-1-test',
        prompt: '/tmp/prompt.md',
        workDir: '/tmp/project',
        timeout: 14400,
      };
      const result = driver.spawn(opts);
      expect(result).toBe(mockChild);
    });
  });

  describe('parseOutput', () => {
    describe('story-complete events', () => {
      it('parses [SUCCESS] Story completion', () => {
        const event = driver.parseOutput('[SUCCESS] Story 1-1-foo: DONE — title here');
        expect(event).toEqual({
          type: 'story-complete',
          key: '1-1-foo',
          details: 'DONE — title here',
        });
      });

      it('parses [SUCCESS] Story completion without details', () => {
        const event = driver.parseOutput('[SUCCESS] Story 2-3-bar: DONE');
        expect(event).toEqual({
          type: 'story-complete',
          key: '2-3-bar',
          details: 'DONE',
        });
      });

      it('parses [SUCCESS] with timestamp prefix', () => {
        const event = driver.parseOutput('[2025-01-15 10:30:45] [SUCCESS] Story 1-1-foo: DONE — verified');
        expect(event).toEqual({
          type: 'story-complete',
          key: '1-1-foo',
          details: 'DONE — verified',
        });
      });

      it('strips ANSI color codes', () => {
        const event = driver.parseOutput('\x1b[32m[SUCCESS] Story 1-1-foo: DONE\x1b[0m');
        expect(event).toEqual({
          type: 'story-complete',
          key: '1-1-foo',
          details: 'DONE',
        });
      });
    });

    describe('story-failed events', () => {
      it('parses [WARN] retry exceeded', () => {
        const event = driver.parseOutput('[WARN] Story 3-2-baz exceeded retry limit');
        expect(event).toEqual({
          type: 'story-failed',
          key: '3-2-baz',
          reason: 'exceeded retry limit',
        });
      });

      it('parses [ERROR] with story key', () => {
        const event = driver.parseOutput('[ERROR] Story 1-1-foo failed to verify');
        expect(event).toEqual({
          type: 'story-failed',
          key: '1-1-foo',
          reason: 'Story 1-1-foo failed to verify',
        });
      });
    });

    describe('retry events', () => {
      it('parses [WARN] retry N/M', () => {
        const event = driver.parseOutput('[WARN] Story 1-1-foo — retry 2/5');
        expect(event).toEqual({
          type: 'retry',
          attempt: 2,
          delay: 0,
        });
      });
    });

    describe('iteration events', () => {
      it('parses [LOOP] iteration N', () => {
        const event = driver.parseOutput('[LOOP] iteration 3');
        expect(event).toEqual({
          type: 'iteration',
          count: 3,
        });
      });

      it('parses [LOOP] iteration 1', () => {
        const event = driver.parseOutput('[LOOP] iteration 1');
        expect(event).toEqual({
          type: 'iteration',
          count: 1,
        });
      });

      it('parses with timestamp prefix', () => {
        const event = driver.parseOutput('[2025-01-15 10:30:45] [LOOP] iteration 5');
        expect(event).toEqual({
          type: 'iteration',
          count: 5,
        });
      });

      it('strips ANSI color codes', () => {
        const event = driver.parseOutput('\x1b[33m[LOOP] iteration 7\x1b[0m');
        expect(event).toEqual({
          type: 'iteration',
          count: 7,
        });
      });
    });

    describe('stream-json delegation', () => {
      it('delegates tool-start events from stream-json', () => {
        const line = JSON.stringify({
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            content_block: { type: 'tool_use', name: 'Bash', id: 'toolu_abc123' },
          },
        });
        const event = driver.parseOutput(line);
        expect(event).toEqual({
          type: 'tool-start',
          name: 'Bash',
        });
      });

      it('delegates text events from stream-json', () => {
        const line = JSON.stringify({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'hello world' },
          },
        });
        const event = driver.parseOutput(line);
        expect(event).toEqual({
          type: 'text',
          text: 'hello world',
        });
      });

      it('delegates result events from stream-json', () => {
        const line = JSON.stringify({
          type: 'result',
          cost_usd: 4.2,
          session_id: 'sess_abc123',
          result: 'done',
        });
        const event = driver.parseOutput(line);
        expect(event).toEqual({
          type: 'result',
          cost: 4.2,
          sessionId: 'sess_abc123',
        });
      });

      it('delegates retry events from stream-json', () => {
        const line = JSON.stringify({
          type: 'system',
          subtype: 'api_retry',
          attempt: 2,
          retry_delay_ms: 3000,
        });
        const event = driver.parseOutput(line);
        expect(event).toEqual({
          type: 'retry',
          attempt: 2,
          delay: 3000,
        });
      });

      it('delegates tool-complete events from stream-json without name/args', () => {
        const line = JSON.stringify({
          type: 'stream_event',
          event: { type: 'content_block_stop' },
        });
        const event = driver.parseOutput(line);
        expect(event).toEqual({ type: 'tool-complete' });
        // name and args should not be present (stateless parser cannot provide them)
        expect(event).not.toHaveProperty('name');
        expect(event).not.toHaveProperty('args');
      });

      it('returns null for tool-input deltas', () => {
        const line = JSON.stringify({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{}' },
          },
        });
        expect(driver.parseOutput(line)).toBeNull();
      });
    });

    describe('unrecognized lines', () => {
      it('returns null for non-matching lines', () => {
        expect(driver.parseOutput('[INFO] Starting iteration 5')).toBeNull();
        expect(driver.parseOutput('[DEBUG] some debug info')).toBeNull();
        expect(driver.parseOutput('')).toBeNull();
        expect(driver.parseOutput('   ')).toBeNull();
        expect(driver.parseOutput('random garbage')).toBeNull();
      });

      it('returns null for [ERROR] without story key', () => {
        expect(driver.parseOutput('[ERROR] Connection timeout')).toBeNull();
      });
    });
  });
});

describe('parseRalphMessage (migrated)', () => {
  it('parses [SUCCESS] Story completion', () => {
    const msg = parseRalphMessage('[SUCCESS] Story 1-1-foo: DONE — title here');
    expect(msg).toEqual({
      type: 'ok',
      key: '1-1-foo',
      message: 'DONE — title here',
    });
  });

  it('parses [SUCCESS] Story completion without details', () => {
    const msg = parseRalphMessage('[SUCCESS] Story 2-3-bar: DONE');
    expect(msg).toEqual({
      type: 'ok',
      key: '2-3-bar',
      message: 'DONE',
    });
  });

  it('parses [WARN] retry exceeded', () => {
    const msg = parseRalphMessage('[WARN] Story 3-2-baz exceeded retry limit');
    expect(msg).toEqual({
      type: 'fail',
      key: '3-2-baz',
      message: 'exceeded retry limit',
    });
  });

  it('parses [WARN] retry N/M', () => {
    const msg = parseRalphMessage('[WARN] Story 1-1-foo — retry 2/5');
    expect(msg).toEqual({
      type: 'warn',
      key: '1-1-foo',
      message: 'retry 2/5',
    });
  });

  it('returns null for unrecognized lines', () => {
    expect(parseRalphMessage('')).toBeNull();
    expect(parseRalphMessage('   ')).toBeNull();
    expect(parseRalphMessage('[INFO] Starting iteration 5')).toBeNull();
  });
});

describe('parseIterationMessage (migrated)', () => {
  it('parses [LOOP] iteration N', () => {
    expect(parseIterationMessage('[LOOP] iteration 3')).toBe(3);
  });

  it('returns null for non-LOOP lines', () => {
    expect(parseIterationMessage('[SUCCESS] Story 1-1-foo: DONE')).toBeNull();
    expect(parseIterationMessage('')).toBeNull();
  });
});

describe('buildSpawnArgs (migrated)', () => {
  const baseOpts = {
    ralphPath: '/path/to/ralph.sh',
    pluginDir: '/path/to/.claude',
    promptFile: '/path/to/prompt.md',
    maxIterations: 50,
    timeout: 14400,
    iterationTimeout: 15,
    calls: 100,
    quiet: false,
  };

  it('builds basic argument array', () => {
    const args = buildSpawnArgs(baseOpts);
    expect(args).toContain('/path/to/ralph.sh');
    expect(args).toContain('--plugin-dir');
    expect(args).toContain('50');
  });

  it('includes --live flag when not quiet', () => {
    expect(buildSpawnArgs(baseOpts)).toContain('--live');
  });

  it('does not include --live flag when quiet', () => {
    expect(buildSpawnArgs({ ...baseOpts, quiet: true })).not.toContain('--live');
  });

  it('includes --max-story-retries when provided', () => {
    const args = buildSpawnArgs({ ...baseOpts, maxStoryRetries: 5 });
    expect(args).toContain('--max-story-retries');
    expect(args).toContain('5');
  });

  it('does not include --max-story-retries when undefined', () => {
    expect(buildSpawnArgs(baseOpts)).not.toContain('--max-story-retries');
  });

  it('includes --reset when provided', () => {
    const args = buildSpawnArgs({ ...baseOpts, reset: true });
    expect(args).toContain('--reset');
  });

  it('does not include --reset when false', () => {
    expect(buildSpawnArgs({ ...baseOpts, reset: false })).not.toContain('--reset');
  });
});
