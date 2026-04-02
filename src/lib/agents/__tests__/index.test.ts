import { describe, it, expect } from 'vitest';
import { getDriver } from '../index.js';

describe('getDriver()', () => {
  // Ralph driver removed (Story 1.2) — getDriver now throws for all names.
  // Workflow engine driver will be added in Epic 5.

  it('throws for default driver (no drivers available)', () => {
    expect(() => getDriver()).toThrow('No agent drivers available');
  });

  it('throws for explicit ralph driver name', () => {
    expect(() => getDriver('ralph')).toThrow('No agent drivers available');
  });

  it('throws for unknown driver names', () => {
    expect(() => getDriver('unknown-agent')).toThrow('No agent drivers available');
  });

  it('includes requested driver name in error message', () => {
    expect(() => getDriver('gpt-pilot')).toThrow('gpt-pilot');
  });
});
