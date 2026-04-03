import { describe, it, expect, beforeEach } from 'vitest';
import { getDriver, registerDriver, listDrivers, resetDrivers } from '../index.js';
import type { AgentDriver, DispatchOpts, DriverHealth } from '../types.js';
import type { StreamEvent } from '../stream-parser.js';

/** Creates a minimal mock AgentDriver for testing. */
function createMockDriver(name: string): AgentDriver {
  return {
    name,
    defaultModel: 'mock-model',
    capabilities: {
      supportsPlugins: false,
      supportsStreaming: true,
      costReporting: false,
    },
    async healthCheck(): Promise<DriverHealth> {
      return { available: true, authenticated: true, version: '1.0.0' };
    },
    async *dispatch(_opts: DispatchOpts): AsyncIterable<StreamEvent> {
      yield { type: 'text', text: 'mock' };
    },
    getLastCost: () => null,
  };
}

describe('getDriver() — via agents barrel', () => {
  beforeEach(() => {
    resetDrivers();
  });

  it('throws for unknown driver names with helpful message', () => {
    expect(() => getDriver('unknown-agent')).toThrow("Driver 'unknown-agent' not found");
  });

  it('returns a registered driver by name', () => {
    const driver = createMockDriver('test-driver');
    registerDriver(driver);
    expect(getDriver('test-driver')).toBe(driver);
  });

  it('barrel exports registerDriver, listDrivers, resetDrivers', () => {
    expect(typeof registerDriver).toBe('function');
    expect(typeof listDrivers).toBe('function');
    expect(typeof resetDrivers).toBe('function');
  });
});
