import { describe, it, expect } from 'vitest';
import {
  initProject,
  ensureStack,
  cleanupContainers,
  getObservabilityBackend,
} from '../index.js';

describe('infra module stubs', () => {
  it('initProject returns fail("not implemented")', () => {
    const result = initProject({ projectDir: '/tmp/test' });
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('ensureStack returns fail("not implemented")', () => {
    const result = ensureStack();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('cleanupContainers returns fail("not implemented")', () => {
    const result = cleanupContainers();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('getObservabilityBackend throws "not implemented"', () => {
    expect(() => getObservabilityBackend()).toThrow('not implemented');
  });
});
