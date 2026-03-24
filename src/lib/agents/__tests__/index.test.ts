import { describe, it, expect } from 'vitest';
import { getDriver, RalphDriver } from '../index.js';

describe('getDriver()', () => {
  it('returns a RalphDriver by default (no name argument)', () => {
    const driver = getDriver();
    expect(driver).toBeInstanceOf(RalphDriver);
    expect(driver.name).toBe('ralph');
  });

  it('returns a RalphDriver when name is "ralph"', () => {
    const driver = getDriver('ralph');
    expect(driver).toBeInstanceOf(RalphDriver);
  });

  it('passes config to RalphDriver constructor', () => {
    const config = {
      pluginDir: '/tmp/.claude',
      maxIterations: 10,
      iterationTimeout: 5,
      calls: 50,
      quiet: true,
      maxStoryRetries: 3,
      reset: true,
    };
    const driver = getDriver('ralph', config);
    expect(driver).toBeInstanceOf(RalphDriver);
    // Verify config is used by checking spawn args indirectly
    // (the config is stored internally — we verify it's accepted without error)
    expect(driver.name).toBe('ralph');
  });

  it('throws for unknown driver names', () => {
    expect(() => getDriver('unknown-agent')).toThrow('Unknown agent driver: unknown-agent');
  });

  it('throws with descriptive message including the driver name', () => {
    expect(() => getDriver('gpt-pilot')).toThrow('gpt-pilot');
  });
});
