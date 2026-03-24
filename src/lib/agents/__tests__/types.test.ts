import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type {
  AgentDriver,
  AgentProcess,
  AgentEvent,
  SpawnOpts,
} from '../types.js';
import type {
  AgentDriver as BarrelAgentDriver,
  AgentProcess as BarrelAgentProcess,
  AgentEvent as BarrelAgentEvent,
  SpawnOpts as BarrelSpawnOpts,
} from '../index.js';

/** Creates a minimal mock AgentProcess for testing. */
function createMockProcess(): AgentProcess {
  const handlers: Record<string, Function> = {};
  return {
    stdout: new Readable({ read() {} }),
    stderr: new Readable({ read() {} }),
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    kill() {},
  };
}

describe('agents/types exports', () => {
  describe('SpawnOpts', () => {
    it('defines required fields: storyKey, prompt, workDir, timeout', () => {
      const opts: SpawnOpts = {
        storyKey: '13-1-agent-driver',
        prompt: 'implement the story',
        workDir: '/tmp/work',
        timeout: 60000,
      };
      expect(opts.storyKey).toBe('13-1-agent-driver');
      expect(opts.prompt).toBe('implement the story');
      expect(opts.workDir).toBe('/tmp/work');
      expect(opts.timeout).toBe(60000);
    });

    it('accepts optional env field', () => {
      const opts: SpawnOpts = {
        storyKey: 'x',
        prompt: 'p',
        workDir: '/w',
        timeout: 1000,
        env: { FOO: 'bar' },
      };
      expect(opts.env).toEqual({ FOO: 'bar' });
    });

    it('allows env to be undefined', () => {
      const opts: SpawnOpts = {
        storyKey: 'x',
        prompt: 'p',
        workDir: '/w',
        timeout: 1000,
      };
      expect(opts.env).toBeUndefined();
    });
  });

  describe('AgentProcess', () => {
    it('satisfies interface with mock implementation', () => {
      const proc = createMockProcess();
      expect(proc.stdout).toBeDefined();
      expect(proc.stderr).toBeDefined();
      expect(typeof proc.on).toBe('function');
      expect(typeof proc.kill).toBe('function');
    });

    it('supports on close handler', () => {
      const proc = createMockProcess();
      let closeCalled = false;
      proc.on('close', (_code: number) => {
        closeCalled = true;
      });
      // Type-level: this compiles, proving the overload exists
      expect(closeCalled).toBe(false);
    });

    it('supports on error handler', () => {
      const proc = createMockProcess();
      let errorCalled = false;
      proc.on('error', (_err: Error) => {
        errorCalled = true;
      });
      // Type-level: this compiles, proving the error overload exists
      expect(errorCalled).toBe(false);
    });

    it('kill accepts optional signal', () => {
      const proc = createMockProcess();
      // No-arg call
      proc.kill();
      // With signal
      proc.kill('SIGTERM');
      expect(typeof proc.kill).toBe('function');
    });
  });

  describe('AgentEvent discriminated union', () => {
    const ALL_EVENT_TYPES = [
      'tool-start',
      'tool-complete',
      'text',
      'story-complete',
      'story-failed',
      'iteration',
      'retry',
      'result',
    ] as const;

    it('covers all 8 event types', () => {
      expect(ALL_EVENT_TYPES).toHaveLength(8);
    });

    it('accepts tool-start event', () => {
      const event: AgentEvent = { type: 'tool-start', name: 'Read' };
      expect(event.type).toBe('tool-start');
    });

    it('accepts tool-complete event', () => {
      const event: AgentEvent = {
        type: 'tool-complete',
        name: 'Write',
        args: '{"path": "/tmp/f"}',
      };
      expect(event.type).toBe('tool-complete');
    });

    it('accepts text event', () => {
      const event: AgentEvent = { type: 'text', text: 'hello' };
      expect(event.type).toBe('text');
    });

    it('accepts story-complete event', () => {
      const event: AgentEvent = {
        type: 'story-complete',
        key: '13-1',
        details: 'done',
      };
      expect(event.type).toBe('story-complete');
    });

    it('accepts story-failed event', () => {
      const event: AgentEvent = {
        type: 'story-failed',
        key: '13-1',
        reason: 'timeout',
      };
      expect(event.type).toBe('story-failed');
    });

    it('accepts iteration event', () => {
      const event: AgentEvent = { type: 'iteration', count: 3 };
      expect(event.type).toBe('iteration');
    });

    it('accepts retry event', () => {
      const event: AgentEvent = { type: 'retry', attempt: 2, delay: 5000 };
      expect(event.type).toBe('retry');
    });

    it('accepts result event', () => {
      const event: AgentEvent = {
        type: 'result',
        cost: 0.42,
        sessionId: 'abc-123',
      };
      expect(event.type).toBe('result');
    });

    it('narrows type correctly via discriminant', () => {
      const event: AgentEvent = { type: 'retry', attempt: 1, delay: 2000 };
      if (event.type === 'retry') {
        // TypeScript narrows to { type: 'retry'; attempt: number; delay: number }
        expect(event.attempt).toBe(1);
        expect(event.delay).toBe(2000);
      }
    });

    it('covers every event type with a valid instance', () => {
      const events: AgentEvent[] = [
        { type: 'tool-start', name: 'a' },
        { type: 'tool-complete', name: 'b', args: 'c' },
        { type: 'text', text: 'd' },
        { type: 'story-complete', key: 'e', details: 'f' },
        { type: 'story-failed', key: 'g', reason: 'h' },
        { type: 'iteration', count: 1 },
        { type: 'retry', attempt: 1, delay: 1 },
        { type: 'result', cost: 0, sessionId: 'i' },
      ];
      const types = events.map((e) => e.type);
      expect(types).toEqual([...ALL_EVENT_TYPES]);
    });
  });

  describe('AgentDriver interface', () => {
    it('satisfies interface with mock implementation', () => {
      const driver: AgentDriver = {
        name: 'test-driver',
        spawn(_opts: SpawnOpts): AgentProcess {
          return createMockProcess();
        },
        parseOutput(_line: string): AgentEvent | null {
          return null;
        },
        getStatusFile(): string {
          return '/tmp/status.json';
        },
      };
      expect(driver.name).toBe('test-driver');
      expect(typeof driver.spawn).toBe('function');
      expect(typeof driver.parseOutput).toBe('function');
      expect(typeof driver.getStatusFile).toBe('function');
    });

    it('has readonly name property', () => {
      const driver: AgentDriver = {
        name: 'immutable',
        spawn: () => createMockProcess(),
        parseOutput: () => null,
        getStatusFile: () => '',
      };
      // TypeScript enforces readonly at compile time; runtime check that value exists
      expect(driver.name).toBe('immutable');
    });

    it('parseOutput can return null for unrecognized lines', () => {
      const driver: AgentDriver = {
        name: 'null-parser',
        spawn: () => createMockProcess(),
        parseOutput: () => null,
        getStatusFile: () => '',
      };
      expect(driver.parseOutput('random garbage')).toBeNull();
    });

    it('parseOutput can return a typed AgentEvent', () => {
      const prefix = 'TEXT: ';
      const driver: AgentDriver = {
        name: 'event-parser',
        spawn: () => createMockProcess(),
        parseOutput: (line: string) => {
          if (line.startsWith(prefix)) {
            return { type: 'text', text: line.slice(prefix.length) };
          }
          return null;
        },
        getStatusFile: () => '/tmp/status.json',
      };
      const event = driver.parseOutput('TEXT: hello');
      expect(event).toEqual({ type: 'text', text: 'hello' });
      expect(driver.parseOutput('unknown')).toBeNull();
    });
  });

  describe('barrel re-exports from index.ts', () => {
    it('re-exports all types from types.ts', () => {
      // Type-level test: if these imports compile, the barrel re-exports work.
      // Use the barrel-imported types to construct values, proving they are the same types.
      const opts: BarrelSpawnOpts = {
        storyKey: 'barrel-test',
        prompt: 'p',
        workDir: '/w',
        timeout: 1000,
      };
      const proc: BarrelAgentProcess = createMockProcess();
      const event: BarrelAgentEvent = { type: 'text', text: 'barrel' };
      const driver: BarrelAgentDriver = {
        name: 'barrel-driver',
        spawn: () => proc,
        parseOutput: () => event,
        getStatusFile: () => '',
      };

      // Runtime assertions prove the barrel types are usable
      expect(opts.storyKey).toBe('barrel-test');
      expect(proc.stdout).toBeDefined();
      expect(event.type).toBe('text');
      expect(driver.name).toBe('barrel-driver');
    });
  });
});
