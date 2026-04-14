import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateFlowWorkflow,
  extractEpicId,
  groupByEpic,
  sanitize,
  type GeneratedWorkflow,
} from '../workflow-generator.js';
import type { ResolvedWorkflow, WorkItem, GateConfig, ForEachConfig } from '../workflow-types.js';

// Mock loadWorkItems to avoid filesystem dependency
vi.mock('../workflow-work-items.js', () => ({
  loadWorkItems: vi.fn(() => []),
}));

import { loadWorkItems } from '../workflow-work-items.js';
const mockLoadWorkItems = vi.mocked(loadWorkItems);

// ── Helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<{ agent: string | null; timeout_minutes: number; driver: string; model: string }> = {}) {
  return {
    agent: 'dev',
    session: 'fresh' as const,
    source_access: true,
    driver: 'opencode',
    model: 'gpt-5.4',
    ...overrides,
  };
}

function makeGate(overrides: Partial<GateConfig> = {}): GateConfig {
  return {
    gate: 'quality',
    check: ['check', 'review'],
    fix: ['retry'],
    pass_when: 'consensus',
    max_retries: 5,
    circuit_breaker: 'stagnation',
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<ResolvedWorkflow> = {}): ResolvedWorkflow {
  return {
    tasks: {
      'create-story': makeTask({ agent: null }),
      implement: makeTask(),
      check: makeTask({ agent: 'checker' }),
      review: makeTask({ agent: 'reviewer' }),
      retry: makeTask(),
      document: makeTask(),
      deploy: makeTask(),
      verify: makeTask({ agent: 'evaluator' }),
      retro: makeTask({ agent: null }),
    },
    storyFlow: [
      'create-story',
      'implement',
      makeGate(),
      'document',
    ],
    epicFlow: ['story_flow', 'retro'],
    sprintFlow: ['deploy', makeGate({ gate: 'verification', check: ['verify'], fix: ['retry', 'document', 'deploy'], max_retries: 3 })],
    execution: {
      max_parallel: 1,
      isolation: 'none',
      merge_strategy: 'merge-commit',
      epic_strategy: 'sequential',
      story_strategy: 'sequential',
    },
    ...overrides,
  };
}

const defaultOpts = {
  sprintStatusPath: '/fake/sprint-status.yaml',
  runId: 'test-run-1',
  projectDir: '/fake/project',
  workflowName: 'default',
};

// ── Tests ────────────────────────────────────────────────────────────

describe('workflow-generator', () => {
  beforeEach(() => {
    mockLoadWorkItems.mockReset();
  });

  describe('extractEpicId', () => {
    it('extracts numeric prefix from story key', () => {
      expect(extractEpicId('17-1-auth-login')).toBe('17');
      expect(extractEpicId('3-42-fix-bug')).toBe('3');
    });

    it('returns key as-is when no numeric prefix', () => {
      expect(extractEpicId('some-key')).toBe('some-key');
    });
  });

  describe('groupByEpic', () => {
    it('groups work items by epic ID', () => {
      const items: WorkItem[] = [
        { key: '17-1-foo', source: 'sprint' },
        { key: '17-2-bar', source: 'sprint' },
        { key: '18-1-baz', source: 'sprint' },
      ];
      const groups = groupByEpic(items);
      expect(groups.size).toBe(2);
      expect(groups.get('17')!.length).toBe(2);
      expect(groups.get('18')!.length).toBe(1);
    });
  });

  describe('sanitize', () => {
    it('replaces non-alphanumeric chars with dashes', () => {
      expect(sanitize('17-1-foo')).toBe('17-1-foo');
      expect(sanitize('hello world!')).toBe('hello-world');
    });

    it('collapses multiple dashes', () => {
      expect(sanitize('a---b')).toBe('a-b');
    });
  });

  describe('generateFlowWorkflow', () => {
    it('produces only sprint-level steps when no work items', () => {
      mockLoadWorkItems.mockReturnValue([]);
      const workflow = makeWorkflow();
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      expect(result.name).toBe('codeharness-default');
      // No stories → only sprint steps (deploy + verification gate)
      expect(result.steps.length).toBe(2);
      expect(result.steps[0].name).toBe('deploy');
      expect(result.steps[1].name).toBe('gate-verification');
    });

    it('returns noop when no work items and no sprint flow', () => {
      mockLoadWorkItems.mockReturnValue([]);
      const workflow = makeWorkflow({ sprintFlow: [] });
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      expect(result.steps.length).toBe(1);
      expect(result.steps[0].name).toBe('noop');
    });

    it('expands story flow for each story in each epic', () => {
      mockLoadWorkItems.mockReturnValue([
        { key: '17-1-foo', source: 'sprint' },
        { key: '17-2-bar', source: 'sprint' },
      ]);
      const workflow = makeWorkflow();
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      // Expected: 2 stories × 4 steps (create-story, implement, gate, document) + 1 retro + 2 sprint steps
      // = 8 + 1 + 2 = 11
      expect(result.steps.length).toBe(11);

      // First story: task steps are native `agent:` steps
      expect(result.steps[0].name).toBe('e17-17-1-foo-create-story');
      expect(result.steps[0].agent).toBeDefined();
      expect(result.steps[0].agent?.provider).toBe('opencode');
      expect(result.steps[0].agent?.prompt).toContain('17-1-foo');

      expect(result.steps[1].name).toBe('e17-17-1-foo-implement');
      expect(result.steps[1].agent?.provider).toBe('opencode');

      // Gate still uses `run:` shell invocation
      expect(result.steps[2].name).toBe('e17-17-1-foo-gate-quality');
      expect(result.steps[2].run).toContain('codeharness gate --name quality --key 17-1-foo');
      expect(result.steps[2].retry).toBe(5);

      expect(result.steps[3].name).toBe('e17-17-1-foo-document');
      expect(result.steps[3].agent).toBeDefined();

      // Second story steps
      expect(result.steps[4].name).toBe('e17-17-2-bar-create-story');
      expect(result.steps[7].name).toBe('e17-17-2-bar-document');

      // Epic retro — agent step targeting sentinel __epic_17__
      expect(result.steps[8].name).toBe('e17-retro');
      expect(result.steps[8].agent).toBeDefined();
      expect(result.steps[8].agent?.prompt).toContain('17');

      // Sprint steps
      expect(result.steps[9].name).toBe('deploy');
      expect(result.steps[9].agent).toBeDefined();
      expect(result.steps[10].name).toBe('gate-verification');
      expect(result.steps[10].run).toContain('--key __sprint__');
      expect(result.steps[10].retry).toBe(3);
    });

    it('handles multiple epics', () => {
      mockLoadWorkItems.mockReturnValue([
        { key: '17-1-foo', source: 'sprint' },
        { key: '18-1-bar', source: 'sprint' },
      ]);
      const workflow = makeWorkflow();
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      // 2 epics × (1 story × 4 steps + 1 retro) + 2 sprint = 12
      expect(result.steps.length).toBe(12);
      // Epic 17 steps come first
      expect(result.steps[0].name).toContain('e17');
      // Epic 18 steps follow
      expect(result.steps[5].name).toContain('e18');
    });

    it('passes run-id and project-dir through gate shell commands', () => {
      mockLoadWorkItems.mockReturnValue([{ key: '1-1-x', source: 'sprint' }]);
      const workflow = makeWorkflow();
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      // Find a gate step — only gates are run: commands in the new architecture
      const gateStep = result.steps.find((s) => s.name.includes('gate'));
      expect(gateStep).toBeDefined();
      expect(gateStep!.run).toContain('--run-id test-run-1');
      expect(gateStep!.run).toContain('--project-dir /fake/project');
      expect(gateStep!.run).toContain('--workflow default');
    });

    it('includes timeout from task config', () => {
      mockLoadWorkItems.mockReturnValue([{ key: '1-1-x', source: 'sprint' }]);
      const workflow = makeWorkflow({
        tasks: {
          ...makeWorkflow().tasks,
          implement: makeTask({ timeout_minutes: 45 }),
        },
      });
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      const implementStep = result.steps.find(s => s.name.includes('implement'));
      expect(implementStep).toBeDefined();
      expect(implementStep!.timeout).toBe('45m');
    });

    it('sets retry_delay on gate steps', () => {
      mockLoadWorkItems.mockReturnValue([{ key: '1-1-x', source: 'sprint' }]);
      const workflow = makeWorkflow();
      const result = generateFlowWorkflow({ workflow, ...defaultOpts });

      const gateStep = result.steps.find(s => s.name.includes('gate-quality'));
      expect(gateStep).toBeDefined();
      expect(gateStep!.retry_delay).toBe('1s');
    });

    it('handles hierarchical workflow format (for_each blocks)', () => {
      mockLoadWorkItems.mockReturnValue([
        { key: '17-1-foo', source: 'sprint' },
      ]);

      const hierarchicalWorkflow = makeWorkflow({
        workflow: {
          for_each: 'epic',
          steps: [
            {
              for_each: 'story',
              steps: ['create-story', 'implement', makeGate(), 'document'],
            } as unknown as string,
            'retro',
          ],
        } as ForEachConfig,
      });

      const result = generateFlowWorkflow({ workflow: hierarchicalWorkflow, ...defaultOpts });

      // 1 story × 4 steps + 1 retro + 2 sprint = 7
      expect(result.steps.length).toBe(7);
      expect(result.steps[0].name).toBe('e17-17-1-foo-create-story');
      expect(result.steps[4].name).toBe('e17-retro');
    });
  });
});
