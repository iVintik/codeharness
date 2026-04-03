import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentDriver, DispatchOpts, DriverHealth } from '../types.js';
import type { StreamEvent } from '../stream-parser.js';
import type { ResolvedWorkflow } from '../../workflow-parser.js';
import { registerDriver, resetDrivers } from '../drivers/factory.js';
import { checkCapabilityConflicts } from '../capability-check.js';

// --- Helpers ---

function createMockDriver(
  name: string,
  opts: { supportsPlugins?: boolean; costTier?: number } = {},
): AgentDriver {
  return {
    name,
    defaultModel: 'mock-model',
    capabilities: {
      supportsPlugins: opts.supportsPlugins ?? true,
      supportsStreaming: true,
      costReporting: true,
      costTier: opts.costTier ?? 1,
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

function makeWorkflow(
  tasks: Record<string, { driver?: string; plugins?: string[] }>,
): ResolvedWorkflow {
  const resolved: Record<string, {
    agent: string;
    scope: 'per-story' | 'per-run';
    session: 'fresh' | 'continue';
    source_access: boolean;
    driver?: string;
    plugins?: string[];
  }> = {};
  for (const [name, task] of Object.entries(tasks)) {
    resolved[name] = {
      agent: 'mock',
      scope: 'per-story',
      session: 'fresh',
      source_access: true,
      driver: task.driver,
      plugins: task.plugins,
    };
  }
  return { tasks: resolved, flow: Object.keys(tasks) };
}

// --- Tests ---

describe('capability-check — checkCapabilityConflicts', () => {
  beforeEach(() => {
    resetDrivers();
  });

  it('returns empty array when all capabilities match', () => {
    registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
    const workflow = makeWorkflow({
      implement: { driver: 'claude-code', plugins: ['gstack'] },
    });
    const warnings = checkCapabilityConflicts(workflow);
    // No conflict because claude-code supports plugins; but may have cost advisory
    const conflicts = warnings.filter(w => w.capability === 'supportsPlugins');
    expect(conflicts).toHaveLength(0);
  });

  it('warns when task uses plugins on a driver without supportsPlugins', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    const workflow = makeWorkflow({
      implement: { driver: 'codex', plugins: ['gstack'] },
    });
    const warnings = checkCapabilityConflicts(workflow);
    const conflicts = warnings.filter(w => w.capability === 'supportsPlugins');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].taskName).toBe('implement');
    expect(conflicts[0].driverName).toBe('codex');
    expect(conflicts[0].message).toContain('supportsPlugins');
  });

  it('no conflict when task has no plugins', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    const workflow = makeWorkflow({
      implement: { driver: 'codex' },
    });
    const warnings = checkCapabilityConflicts(workflow);
    expect(warnings).toHaveLength(0);
  });

  it('no conflict when task has empty plugins array', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    const workflow = makeWorkflow({
      implement: { driver: 'codex', plugins: [] },
    });
    const warnings = checkCapabilityConflicts(workflow);
    expect(warnings).toHaveLength(0);
  });

  it('generates routing hint when driver costs >2x cheapest capable', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
    // Task with no plugins — codex can handle it, and costs 3x less
    const workflow = makeWorkflow({
      implement: { driver: 'claude-code' },
    });
    const warnings = checkCapabilityConflicts(workflow);
    const advisories = warnings.filter(w => w.capability === 'costTier');
    expect(advisories).toHaveLength(1);
    expect(advisories[0].message).toContain('Advisory');
    expect(advisories[0].message).toContain('codex');
    expect(advisories[0].message).toContain('lower cost');
  });

  it('no routing hint when driver is cheapest capable', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
    const workflow = makeWorkflow({
      implement: { driver: 'codex' },
    });
    const warnings = checkCapabilityConflicts(workflow);
    const advisories = warnings.filter(w => w.capability === 'costTier');
    expect(advisories).toHaveLength(0);
  });

  it('no routing hint when cost difference is not >2x', () => {
    registerDriver(createMockDriver('opencode', { supportsPlugins: true, costTier: 2 }));
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    // opencode costTier 2, codex costTier 1: 2 > 2*1 is false
    const workflow = makeWorkflow({
      implement: { driver: 'opencode', plugins: ['gstack'] },
    });
    const warnings = checkCapabilityConflicts(workflow);
    const advisories = warnings.filter(w => w.capability === 'costTier');
    expect(advisories).toHaveLength(0);
  });

  it('returns CapabilityWarning objects with all required fields', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    const workflow = makeWorkflow({
      implement: { driver: 'codex', plugins: ['gstack'] },
    });
    const warnings = checkCapabilityConflicts(workflow);
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w).toHaveProperty('taskName');
      expect(w).toHaveProperty('driverName');
      expect(w).toHaveProperty('capability');
      expect(w).toHaveProperty('message');
      expect(typeof w.taskName).toBe('string');
      expect(typeof w.driverName).toBe('string');
      expect(typeof w.capability).toBe('string');
      expect(typeof w.message).toBe('string');
    }
  });

  it('is a pure query — does not throw', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    const workflow = makeWorkflow({
      implement: { driver: 'codex', plugins: ['gstack'] },
    });
    expect(() => checkCapabilityConflicts(workflow)).not.toThrow();
  });

  it('skips tasks with unregistered drivers (no crash)', () => {
    const workflow = makeWorkflow({
      implement: { driver: 'nonexistent', plugins: ['gstack'] },
    });
    expect(() => checkCapabilityConflicts(workflow)).not.toThrow();
    expect(checkCapabilityConflicts(workflow)).toEqual([]);
  });

  it('defaults driver to claude-code when task.driver is undefined', () => {
    registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    const workflow = makeWorkflow({
      implement: { plugins: ['gstack'] }, // no driver specified
    });
    const warnings = checkCapabilityConflicts(workflow);
    // Should not have supportsPlugins conflict (claude-code supports plugins)
    const conflicts = warnings.filter(w => w.capability === 'supportsPlugins');
    expect(conflicts).toHaveLength(0);
  });

  it('handles multiple tasks with different issues', () => {
    registerDriver(createMockDriver('codex', { supportsPlugins: false, costTier: 1 }));
    registerDriver(createMockDriver('claude-code', { supportsPlugins: true, costTier: 3 }));
    const workflow = makeWorkflow({
      task1: { driver: 'codex', plugins: ['gstack'] },
      task2: { driver: 'claude-code' },
    });
    const warnings = checkCapabilityConflicts(workflow);
    // task1: plugin conflict on codex
    // task2: cost advisory (claude-code costTier 3 > 2*1)
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some(w => w.taskName === 'task1' && w.capability === 'supportsPlugins')).toBe(true);
    expect(warnings.some(w => w.taskName === 'task2' && w.capability === 'costTier')).toBe(true);
  });
});
