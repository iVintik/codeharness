import { describe, it, expect } from 'vitest';

/**
 * Backward compatibility tests — verify that existing imports from
 * `stack-detect.ts` continue to work after the type migration.
 */

describe('backward compatibility — re-exports from stack-detect.ts', () => {
  it('StackName is importable from stack-detect', async () => {
    const mod = await import('../../stack-detect.js');
    // StackName is a type-only export, but detectStack returns StackName values
    const result = mod.detectStack('/nonexistent-dir-abc123');
    // Just verifying the module loads and the function exists
    expect(typeof mod.detectStack).toBe('function');
    expect(typeof mod.detectStacks).toBe('function');
    expect(typeof mod.detectAppType).toBe('function');
    // result should be null for a nonexistent dir
    expect(result).toBeNull();
  });

  it('StackDetection interface is usable from stack-detect', async () => {
    const mod = await import('../../stack-detect.js');
    const results = mod.detectStacks('/nonexistent-dir-abc123');
    expect(Array.isArray(results)).toBe(true);
    expect(results).toEqual([]);
  });

  it('detectAppType is still exported from stack-detect', async () => {
    const mod = await import('../../stack-detect.js');
    expect(typeof mod.detectAppType).toBe('function');
    const result = mod.detectAppType('/tmp', null);
    expect(result).toBe('generic');
  });
});
