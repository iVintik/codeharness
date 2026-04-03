import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type {
  AgentDriver,
  DispatchOpts,
  DriverHealth,
  DriverCapabilities,
  ErrorCategory,
  OutputContract,
  TestResults,
  ACStatus,
  // Deprecated types — must still compile
  AgentProcess,
  AgentEvent,
  SpawnOpts,
} from '../types.js';
import type { StreamEvent, ResultEvent } from '../stream-parser.js';
import type {
  // Barrel re-exports — new types
  AgentDriver as BarrelAgentDriver,
  DriverHealth as BarrelDriverHealth,
  DriverCapabilities as BarrelDriverCapabilities,
  DispatchOpts as BarrelDispatchOpts,
  ErrorCategory as BarrelErrorCategory,
  OutputContract as BarrelOutputContract,
  TestResults as BarrelTestResults,
  ACStatus as BarrelACStatus,
  // Barrel re-exports — deprecated types
  AgentProcess as BarrelAgentProcess,
  AgentEvent as BarrelAgentEvent,
  SpawnOpts as BarrelSpawnOpts,
} from '../index.js';

// --- Helpers ---

/** Creates a mock AgentDriver implementing the new interface. */
function createMockDriver(): AgentDriver {
  return {
    name: 'mock-driver',
    defaultModel: 'mock-model-v1',
    capabilities: {
      supportsPlugins: true,
      supportsStreaming: true,
      costReporting: true,
    },
    async healthCheck(): Promise<DriverHealth> {
      return { available: true, authenticated: true, version: '1.0.0' };
    },
    async *dispatch(_opts: DispatchOpts): AsyncIterable<StreamEvent> {
      yield { type: 'text', text: 'hello' };
      yield { type: 'result', cost: 0.01, sessionId: 'mock-session' };
    },
    getLastCost(): number | null {
      return 0.01;
    },
  };
}

/** Creates a minimal mock AgentProcess for deprecated type tests. */
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

// --- New Interface Tests ---

describe('agents/types — new AgentDriver interface (Epic 10)', () => {
  describe('AgentDriver interface', () => {
    it('satisfies interface with mock implementation', () => {
      const driver = createMockDriver();
      expect(driver.name).toBe('mock-driver');
      expect(driver.defaultModel).toBe('mock-model-v1');
      expect(driver.capabilities).toBeDefined();
      expect(typeof driver.healthCheck).toBe('function');
      expect(typeof driver.dispatch).toBe('function');
      expect(typeof driver.getLastCost).toBe('function');
    });

    it('has readonly name and defaultModel', () => {
      const driver = createMockDriver();
      expect(driver.name).toBe('mock-driver');
      expect(driver.defaultModel).toBe('mock-model-v1');
    });

    it('has readonly capabilities', () => {
      const driver = createMockDriver();
      expect(driver.capabilities.supportsPlugins).toBe(true);
      expect(driver.capabilities.supportsStreaming).toBe(true);
      expect(driver.capabilities.costReporting).toBe(true);
    });

    it('healthCheck returns Promise<DriverHealth>', async () => {
      const driver = createMockDriver();
      const health = await driver.healthCheck();
      expect(health.available).toBe(true);
      expect(health.authenticated).toBe(true);
      expect(health.version).toBe('1.0.0');
    });

    it('dispatch returns AsyncIterable<StreamEvent>', async () => {
      const driver = createMockDriver();
      const opts: DispatchOpts = {
        prompt: 'test',
        model: 'mock-model-v1',
        cwd: '/tmp',
        sourceAccess: true,
      };
      const events: StreamEvent[] = [];
      for await (const event of driver.dispatch(opts)) {
        events.push(event);
      }
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('text');
      expect(events[1].type).toBe('result');
    });

    it('getLastCost returns number or null', () => {
      const driver = createMockDriver();
      const cost = driver.getLastCost();
      expect(cost).toBe(0.01);
    });

    it('getLastCost can return null', () => {
      const driver: AgentDriver = {
        ...createMockDriver(),
        getLastCost: () => null,
      };
      expect(driver.getLastCost()).toBeNull();
    });
  });

  describe('DispatchOpts', () => {
    it('accepts all required fields', () => {
      const opts: DispatchOpts = {
        prompt: 'implement story',
        model: 'claude-sonnet-4-20250514',
        cwd: '/home/project',
        sourceAccess: true,
      };
      expect(opts.prompt).toBe('implement story');
      expect(opts.model).toBe('claude-sonnet-4-20250514');
      expect(opts.cwd).toBe('/home/project');
      expect(opts.sourceAccess).toBe(true);
    });

    it('accepts all optional fields', () => {
      const contract: OutputContract = {
        version: 1,
        taskName: 'implement',
        storyId: '10-1',
        driver: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        timestamp: '2026-04-03T10:00:00Z',
        cost_usd: null,
        duration_ms: 0,
        changedFiles: [],
        testResults: null,
        output: '',
        acceptanceCriteria: [],
      };
      const opts: DispatchOpts = {
        prompt: 'test',
        model: 'model',
        cwd: '/tmp',
        sourceAccess: false,
        plugins: ['plugin-a', 'plugin-b'],
        timeout: 30000,
        outputContract: contract,
      };
      expect(opts.plugins).toEqual(['plugin-a', 'plugin-b']);
      expect(opts.timeout).toBe(30000);
      expect(opts.outputContract).toBeDefined();
    });

    it('optional fields are undefined when not provided', () => {
      const opts: DispatchOpts = {
        prompt: 'x',
        model: 'm',
        cwd: '/',
        sourceAccess: false,
      };
      expect(opts.plugins).toBeUndefined();
      expect(opts.timeout).toBeUndefined();
      expect(opts.outputContract).toBeUndefined();
    });
  });

  describe('DriverHealth', () => {
    it('accepts a healthy status', () => {
      const health: DriverHealth = {
        available: true,
        authenticated: true,
        version: '2.1.0',
      };
      expect(health.available).toBe(true);
      expect(health.authenticated).toBe(true);
      expect(health.version).toBe('2.1.0');
      expect(health.error).toBeUndefined();
    });

    it('accepts an unhealthy status with error', () => {
      const health: DriverHealth = {
        available: false,
        authenticated: false,
        version: null,
        error: 'CLI not found on PATH',
      };
      expect(health.available).toBe(false);
      expect(health.version).toBeNull();
      expect(health.error).toBe('CLI not found on PATH');
    });

    it('error field is optional', () => {
      const health: DriverHealth = {
        available: true,
        authenticated: true,
        version: '1.0.0',
      };
      expect(health.error).toBeUndefined();
    });
  });

  describe('DriverCapabilities', () => {
    it('accepts capability flags', () => {
      const caps: DriverCapabilities = {
        supportsPlugins: true,
        supportsStreaming: false,
        costReporting: true,
      };
      expect(caps.supportsPlugins).toBe(true);
      expect(caps.supportsStreaming).toBe(false);
      expect(caps.costReporting).toBe(true);
    });

    it('all-false capabilities are valid', () => {
      const caps: DriverCapabilities = {
        supportsPlugins: false,
        supportsStreaming: false,
        costReporting: false,
      };
      expect(caps.supportsPlugins).toBe(false);
      expect(caps.supportsStreaming).toBe(false);
      expect(caps.costReporting).toBe(false);
    });
  });

  describe('ErrorCategory', () => {
    it('covers exactly 5 values', () => {
      const categories: ErrorCategory[] = [
        'RATE_LIMIT',
        'NETWORK',
        'AUTH',
        'TIMEOUT',
        'UNKNOWN',
      ];
      expect(categories).toHaveLength(5);
      // Verify each is a valid ErrorCategory (compile-time check)
      categories.forEach((cat) => {
        expect(typeof cat).toBe('string');
      });
    });

    it('each value is assignable to ErrorCategory', () => {
      const a: ErrorCategory = 'RATE_LIMIT';
      const b: ErrorCategory = 'NETWORK';
      const c: ErrorCategory = 'AUTH';
      const d: ErrorCategory = 'TIMEOUT';
      const e: ErrorCategory = 'UNKNOWN';
      expect([a, b, c, d, e]).toEqual([
        'RATE_LIMIT',
        'NETWORK',
        'AUTH',
        'TIMEOUT',
        'UNKNOWN',
      ]);
    });

    it('exhaustiveness check — switch covers all categories', () => {
      // Compile-time exhaustiveness: if ErrorCategory gains a 6th value,
      // the `never` default will cause a TS error
      function classifyError(cat: ErrorCategory): string {
        switch (cat) {
          case 'RATE_LIMIT': return 'retry';
          case 'NETWORK': return 'retry';
          case 'AUTH': return 'fail';
          case 'TIMEOUT': return 'fail';
          case 'UNKNOWN': return 'fail';
          default: {
            const _exhaustive: never = cat;
            return _exhaustive;
          }
        }
      }
      expect(classifyError('RATE_LIMIT')).toBe('retry');
      expect(classifyError('NETWORK')).toBe('retry');
      expect(classifyError('AUTH')).toBe('fail');
      expect(classifyError('TIMEOUT')).toBe('fail');
      expect(classifyError('UNKNOWN')).toBe('fail');
    });
  });

  describe('OutputContract, TestResults, ACStatus', () => {
    it('accepts a valid OutputContract', () => {
      const contract: OutputContract = {
        version: 1,
        taskName: 'implement-story',
        storyId: '10-1',
        driver: 'claude-code',
        model: 'claude-sonnet-4-20250514',
        timestamp: '2026-04-03T12:00:00Z',
        cost_usd: 0.42,
        duration_ms: 15000,
        changedFiles: ['src/lib/agents/types.ts'],
        testResults: { passed: 10, failed: 0, coverage: 95.5 },
        output: 'Implementation complete',
        acceptanceCriteria: [
          { id: 'AC-1', description: 'Interface refactored', status: 'passed' },
        ],
      };
      expect(contract.version).toBe(1);
      expect(contract.cost_usd).toBe(0.42);
      expect(contract.testResults?.passed).toBe(10);
      expect(contract.acceptanceCriteria).toHaveLength(1);
    });

    it('accepts null cost_usd and testResults', () => {
      const contract: OutputContract = {
        version: 1,
        taskName: 'task',
        storyId: 'x',
        driver: 'd',
        model: 'm',
        timestamp: 't',
        cost_usd: null,
        duration_ms: 0,
        changedFiles: [],
        testResults: null,
        output: '',
        acceptanceCriteria: [],
      };
      expect(contract.cost_usd).toBeNull();
      expect(contract.testResults).toBeNull();
    });

    it('TestResults accepts valid values', () => {
      const results: TestResults = {
        passed: 5,
        failed: 2,
        coverage: 87.3,
      };
      expect(results.passed).toBe(5);
      expect(results.failed).toBe(2);
      expect(results.coverage).toBe(87.3);
    });

    it('TestResults coverage can be null', () => {
      const results: TestResults = {
        passed: 3,
        failed: 0,
        coverage: null,
      };
      expect(results.coverage).toBeNull();
    });

    it('ACStatus accepts valid values', () => {
      const ac: ACStatus = {
        id: 'AC-1',
        description: 'Driver interface refactored',
        status: 'passed',
      };
      expect(ac.id).toBe('AC-1');
      expect(ac.description).toBe('Driver interface refactored');
      expect(ac.status).toBe('passed');
    });
  });

  describe('StreamEvent — ResultEvent cost_usd extension', () => {
    it('ResultEvent accepts optional cost_usd field', () => {
      const event: ResultEvent = {
        type: 'result',
        cost: 0.05,
        sessionId: 'sess-1',
        cost_usd: 0.05,
      };
      expect(event.cost_usd).toBe(0.05);
    });

    it('ResultEvent cost_usd can be null', () => {
      const event: ResultEvent = {
        type: 'result',
        cost: 0.05,
        sessionId: 'sess-1',
        cost_usd: null,
      };
      expect(event.cost_usd).toBeNull();
    });

    it('ResultEvent cost_usd is optional (backward compat)', () => {
      const event: ResultEvent = {
        type: 'result',
        cost: 0.05,
        sessionId: 'sess-1',
      };
      expect(event.cost_usd).toBeUndefined();
    });
  });

  describe('dispatch returns AsyncIterable<StreamEvent>', () => {
    it('can be consumed with for-await-of', async () => {
      const driver = createMockDriver();
      const opts: DispatchOpts = {
        prompt: 'test',
        model: 'mock',
        cwd: '/tmp',
        sourceAccess: true,
      };
      const types: string[] = [];
      for await (const event of driver.dispatch(opts)) {
        types.push(event.type);
      }
      expect(types).toEqual(['text', 'result']);
    });
  });
});

// --- Deprecated Types Tests (backward compatibility) ---

describe('agents/types — deprecated types (backward compat)', () => {
  describe('SpawnOpts (deprecated)', () => {
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
  });

  describe('AgentProcess (deprecated)', () => {
    it('satisfies interface with mock implementation', () => {
      const proc = createMockProcess();
      expect(proc.stdout).toBeDefined();
      expect(proc.stderr).toBeDefined();
      expect(typeof proc.on).toBe('function');
      expect(typeof proc.kill).toBe('function');
    });
  });

  describe('AgentEvent discriminated union (deprecated)', () => {
    it('covers all 9 event variants', () => {
      const events: AgentEvent[] = [
        { type: 'tool-start', name: 'a' },
        { type: 'tool-input', partial: 'b' },
        { type: 'tool-complete', name: 'c', args: 'd' },
        { type: 'text', text: 'e' },
        { type: 'story-complete', key: 'f', details: 'g' },
        { type: 'story-failed', key: 'h', reason: 'i' },
        { type: 'iteration', count: 1 },
        { type: 'retry', attempt: 1, delay: 1 },
        { type: 'result', cost: 0, sessionId: 'j' },
      ];
      expect(events).toHaveLength(9);
    });
  });

  describe('barrel re-exports from index.ts', () => {
    it('re-exports new types', () => {
      // Type-level: these compile, proving barrel exports work
      const health: BarrelDriverHealth = {
        available: true,
        authenticated: true,
        version: '1.0',
      };
      const caps: BarrelDriverCapabilities = {
        supportsPlugins: true,
        supportsStreaming: true,
        costReporting: true,
      };
      const cat: BarrelErrorCategory = 'RATE_LIMIT';
      const tr: BarrelTestResults = { passed: 1, failed: 0, coverage: null };
      const ac: BarrelACStatus = {
        id: '1',
        description: 'd',
        status: 'passed',
      };
      const contract: BarrelOutputContract = {
        version: 1,
        taskName: 't',
        storyId: 's',
        driver: 'd',
        model: 'm',
        timestamp: 'ts',
        cost_usd: null,
        duration_ms: 0,
        changedFiles: [],
        testResults: tr,
        output: '',
        acceptanceCriteria: [ac],
      };
      const opts: BarrelDispatchOpts = {
        prompt: 'p',
        model: 'm',
        cwd: '/',
        sourceAccess: true,
        outputContract: contract,
      };
      const driver: BarrelAgentDriver = {
        name: 'barrel',
        defaultModel: 'model',
        capabilities: caps,
        async healthCheck() {
          return health;
        },
        async *dispatch(_o: BarrelDispatchOpts) {
          yield { type: 'result' as const, cost: 0, sessionId: '' };
        },
        getLastCost: () => null,
      };

      expect(health.available).toBe(true);
      expect(caps.supportsPlugins).toBe(true);
      expect(cat).toBe('RATE_LIMIT');
      expect(opts.prompt).toBe('p');
      expect(contract.version).toBe(1);
      expect(driver.name).toBe('barrel');
    });

    it('re-exports deprecated types', () => {
      const opts: BarrelSpawnOpts = {
        storyKey: 'x',
        prompt: 'p',
        workDir: '/w',
        timeout: 1000,
      };
      const proc: BarrelAgentProcess = createMockProcess();
      const event: BarrelAgentEvent = { type: 'text', text: 'barrel' };

      expect(opts.storyKey).toBe('x');
      expect(proc.stdout).toBeDefined();
      expect(event.type).toBe('text');
    });
  });
});
