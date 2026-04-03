import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentDriver, DispatchOpts, DriverHealth } from '../types.js';
import type { StreamEvent } from '../stream-parser.js';
import {
  registerDriver,
  getDriver,
  listDrivers,
  resetDrivers,
  suggestCheaperDriver,
} from '../drivers/factory.js';

// --- Helpers ---

/** Creates a minimal mock AgentDriver for testing. */
function createMockDriver(
  name: string,
  opts: { supportsPlugins?: boolean; costTier?: number } = {},
): AgentDriver {
  return {
    name,
    defaultModel: 'mock-model',
    capabilities: {
      supportsPlugins: opts.supportsPlugins ?? false,
      supportsStreaming: true,
      costReporting: false,
      costTier: opts.costTier ?? 1,
    },
    async healthCheck(): Promise<DriverHealth> {
      return { available: true, authenticated: true, version: '1.0.0' };
    },
    async *dispatch(_opts: DispatchOpts): AsyncIterable<StreamEvent> {
      yield { type: 'text', text: 'mock' };
    },
    getLastCost(): number | null {
      return null;
    },
  };
}

// --- Tests ---

describe('agents/drivers/factory — Driver Factory & Registry', () => {
  beforeEach(() => {
    resetDrivers();
  });

  describe('registerDriver + getDriver', () => {
    it('registers a driver and retrieves it by name (same reference)', () => {
      const driver = createMockDriver('claude-code');
      registerDriver(driver);
      const retrieved = getDriver('claude-code');
      expect(retrieved).toBe(driver); // same reference
    });

    it('registers multiple drivers and retrieves each by name', () => {
      const d1 = createMockDriver('claude-code');
      const d2 = createMockDriver('codex');
      registerDriver(d1);
      registerDriver(d2);
      expect(getDriver('claude-code')).toBe(d1);
      expect(getDriver('codex')).toBe(d2);
    });
  });

  describe('getDriver — unknown name', () => {
    it('throws when no drivers are registered', () => {
      expect(() => getDriver('unknown')).toThrow("Driver 'unknown' not found");
    });

    it('includes the unknown name in the error message', () => {
      expect(() => getDriver('nonexistent')).toThrow('nonexistent');
    });

    it('lists registered driver names in the error message', () => {
      registerDriver(createMockDriver('claude-code'));
      registerDriver(createMockDriver('opencode'));
      expect(() => getDriver('codex')).toThrow('claude-code');
      expect(() => getDriver('codex')).toThrow('opencode');
    });

    it('shows "(none)" when no drivers are registered', () => {
      expect(() => getDriver('x')).toThrow('(none)');
    });
  });

  describe('registerDriver — input validation', () => {
    it('throws when called with null', () => {
      expect(() => registerDriver(null as unknown as AgentDriver)).toThrow(
        'registerDriver requires a valid AgentDriver',
      );
    });

    it('throws when called with undefined', () => {
      expect(() => registerDriver(undefined as unknown as AgentDriver)).toThrow(
        'registerDriver requires a valid AgentDriver',
      );
    });

    it('throws when driver has no name property', () => {
      expect(() => registerDriver({} as unknown as AgentDriver)).toThrow(
        'registerDriver requires a valid AgentDriver',
      );
    });

    it('throws when driver name is empty string', () => {
      expect(() => registerDriver(createMockDriver(''))).toThrow(
        'Driver name must be a non-empty string',
      );
    });
  });

  describe('getDriver — input validation', () => {
    it('throws when called with empty string', () => {
      expect(() => getDriver('')).toThrow('getDriver requires a non-empty string name');
    });

    it('throws when called with null', () => {
      expect(() => getDriver(null as unknown as string)).toThrow(
        'getDriver requires a non-empty string name',
      );
    });

    it('throws when called with undefined', () => {
      expect(() => getDriver(undefined as unknown as string)).toThrow(
        'getDriver requires a non-empty string name',
      );
    });
  });

  describe('registerDriver — duplicate', () => {
    it('throws when registering a driver with an already-registered name', () => {
      registerDriver(createMockDriver('claude-code'));
      expect(() => registerDriver(createMockDriver('claude-code'))).toThrow(
        "Driver 'claude-code' is already registered",
      );
    });

    it('includes the duplicate name in the error message', () => {
      registerDriver(createMockDriver('opencode'));
      expect(() => registerDriver(createMockDriver('opencode'))).toThrow(
        'opencode',
      );
    });
  });

  describe('listDrivers', () => {
    it('returns empty array when no drivers are registered', () => {
      expect(listDrivers()).toEqual([]);
    });

    it('returns all registered driver names', () => {
      registerDriver(createMockDriver('claude-code'));
      registerDriver(createMockDriver('codex'));
      registerDriver(createMockDriver('opencode'));
      expect(listDrivers()).toEqual(['claude-code', 'codex', 'opencode']);
    });

    it('returns a copy — mutating the result does not affect registry', () => {
      registerDriver(createMockDriver('claude-code'));
      const list = listDrivers();
      list.push('injected');
      expect(listDrivers()).toEqual(['claude-code']);
      expect(listDrivers()).not.toContain('injected');
    });
  });

  describe('resetDrivers', () => {
    it('clears all registered drivers', () => {
      registerDriver(createMockDriver('claude-code'));
      registerDriver(createMockDriver('codex'));
      expect(listDrivers()).toHaveLength(2);

      resetDrivers();

      expect(listDrivers()).toEqual([]);
      expect(() => getDriver('claude-code')).toThrow();
      expect(() => getDriver('codex')).toThrow();
    });
  });

  describe('no auto-discovery', () => {
    it('factory.ts source has no dynamic import(), readdir, glob, or require() calls', () => {
      const factoryPath = resolve(
        import.meta.dirname ?? __dirname,
        '..',
        'drivers',
        'factory.ts',
      );
      const source = readFileSync(factoryPath, 'utf-8');

      // Forbidden patterns that would indicate auto-discovery
      expect(source).not.toMatch(/\bimport\s*\(/);
      expect(source).not.toMatch(/\breaddir/i);
      expect(source).not.toMatch(/\bglob\b/i);
      expect(source).not.toMatch(/\brequire\s*\(/);
    });
  });

  describe('suggestCheaperDriver', () => {
    it('returns cheaper driver when one exists', () => {
      registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
      registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
      // No required caps — codex can handle it
      const result = suggestCheaperDriver('claude-code', {});
      expect(result).toBe('codex');
    });

    it('returns null when current driver is cheapest', () => {
      registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
      registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
      const result = suggestCheaperDriver('codex', {});
      expect(result).toBeNull();
    });

    it('respects required capabilities when suggesting', () => {
      registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
      registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
      registerDriver(createMockDriver('opencode', { supportsPlugins: true, costTier: 2 }));
      // Requires plugins — codex can't handle it, opencode can
      const result = suggestCheaperDriver('claude-code', { supportsPlugins: true });
      expect(result).toBe('opencode');
    });

    it('returns null when no driver satisfies required caps at lower cost', () => {
      registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
      registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
      // Requires plugins — codex can't, only claude-code can (no cheaper option)
      const result = suggestCheaperDriver('claude-code', { supportsPlugins: true });
      expect(result).toBeNull();
    });

    it('returns null for unregistered driver', () => {
      const result = suggestCheaperDriver('nonexistent', {});
      expect(result).toBeNull();
    });

    it('returns cheapest among multiple capable drivers', () => {
      registerDriver(createMockDriver('expensive', { supportsPlugins: true, costTier: 5 }));
      registerDriver(createMockDriver('mid', { supportsPlugins: true, costTier: 3 }));
      registerDriver(createMockDriver('cheap', { supportsPlugins: true, costTier: 1 }));
      const result = suggestCheaperDriver('expensive', { supportsPlugins: true });
      expect(result).toBe('cheap');
    });
  });

  describe('barrel re-exports', () => {
    it('drivers/index.ts re-exports all factory functions', async () => {
      const barrel = await import('../drivers/index.js');
      expect(typeof barrel.getDriver).toBe('function');
      expect(typeof barrel.registerDriver).toBe('function');
      expect(typeof barrel.listDrivers).toBe('function');
      expect(typeof barrel.resetDrivers).toBe('function');
    });

    it('agents/index.ts re-exports factory functions', async () => {
      const agents = await import('../index.js');
      expect(typeof agents.getDriver).toBe('function');
      expect(typeof agents.registerDriver).toBe('function');
      expect(typeof agents.listDrivers).toBe('function');
      expect(typeof agents.resetDrivers).toBe('function');
    });
  });
});
