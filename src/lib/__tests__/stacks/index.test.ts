import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests that exercise the barrel file (stacks/index.ts) to ensure
 * auto-registration side effects and re-exports work correctly.
 */

describe('stacks/index.ts — barrel re-exports and auto-registration', () => {
  // Import everything through the barrel to exercise its side effects
  let barrel: typeof import('../../stacks/index.js');

  beforeEach(async () => {
    barrel = await import('../../stacks/index.js');
  });

  it('re-exports registerProvider', () => {
    expect(typeof barrel.registerProvider).toBe('function');
  });

  it('re-exports getStackProvider', () => {
    expect(typeof barrel.getStackProvider).toBe('function');
  });

  it('re-exports detectStack', () => {
    expect(typeof barrel.detectStack).toBe('function');
  });

  it('re-exports detectStacks', () => {
    expect(typeof barrel.detectStacks).toBe('function');
  });

  it('re-exports _resetRegistry', () => {
    expect(typeof barrel._resetRegistry).toBe('function');
  });

  it('auto-registers NodejsProvider on import', () => {
    // The barrel auto-registers NodejsProvider, so getStackProvider should find it
    const provider = barrel.getStackProvider('nodejs');
    expect(provider).toBeDefined();
    expect(provider!.name).toBe('nodejs');
    expect(provider!.markers).toEqual(['package.json']);
    expect(provider!.displayName).toBe('Node.js (package.json)');
  });
});
