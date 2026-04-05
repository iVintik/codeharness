import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveHierarchicalFlow,
  HierarchicalFlowError,
  BUILTIN_EPIC_FLOW_TASKS,
  EXECUTION_DEFAULTS,
  parseWorkflow,
  WorkflowParseError,
  type ExecutionConfig,
  type ResolvedWorkflow,
  type ResolvedTask,
} from '../workflow-parser.js';
import { validateWorkflowSchema } from '../schema-validate.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-hflow-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeYaml(filename: string, content: string): string {
  const filePath = join(testDir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function makeTask(overrides?: Partial<ResolvedTask>): ResolvedTask {
  return {
    agent: 'dev',
    session: 'fresh',
    source_access: true,
    ...overrides,
  };
}

// --- Schema validation tests (AC #1, #2, #3, #10, #11) ---

describe('workflow.schema.json — hierarchical extensions', () => {
  describe('execution section (AC #1)', () => {
    it('accepts a valid execution section with all properties', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' } },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
        execution: {
          max_parallel: 4,
          isolation: 'worktree',
          merge_strategy: 'rebase',
          epic_strategy: 'parallel',
          story_strategy: 'parallel',
        },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts execution with partial properties (defaults apply)', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' } },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
        execution: { max_parallel: 2 },
      });
      expect(result.valid).toBe(true);
    });

    it('accepts empty execution object', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' } },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
        execution: {},
      });
      expect(result.valid).toBe(true);
    });

    it('rejects invalid isolation value', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' } },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
        execution: { isolation: 'docker' },
      });
      expect(result.valid).toBe(false);
    });

    it('rejects invalid epic_strategy value', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' } },
        story_flow: ['implement'],
        epic_flow: ['story_flow'],
        execution: { epic_strategy: 'random' },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('story_flow section (AC #2)', () => {
    it('accepts story_flow with task ref strings', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' }, verify: { agent: 'qa' } },
        story_flow: ['implement', 'verify'],
        epic_flow: ['story_flow'],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts story_flow with loop blocks', () => {
      const result = validateWorkflowSchema({
        tasks: { implement: { agent: 'dev' }, retry: { agent: 'dev' } },
        story_flow: ['implement', { loop: ['retry'] }],
        epic_flow: ['story_flow'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('epic_flow section (AC #3)', () => {
    it('accepts epic_flow with task ref strings', () => {
      const result = validateWorkflowSchema({
        tasks: { plan: { agent: 'pm' } },
        story_flow: ['plan'],
        epic_flow: ['plan', 'merge', 'validate'],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts epic_flow with loop blocks', () => {
      const result = validateWorkflowSchema({
        tasks: { check: { agent: 'qa' } },
        story_flow: ['check'],
        epic_flow: [{ loop: ['check', 'merge'] }],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('agent: null (AC #10)', () => {
    it('accepts agent: null in task definition', () => {
      const result = validateWorkflowSchema({
        tasks: { merge: { agent: null } },
        story_flow: ['merge'],
        epic_flow: ['story_flow'],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('task definition without scope (AC #11)', () => {
    it('accepts task without scope field', () => {
      const result = validateWorkflowSchema({
        tasks: { plan: { agent: 'pm' } },
        story_flow: ['plan'],
        epic_flow: ['story_flow'],
      });
      expect(result.valid).toBe(true);
    });
  });
});

// --- resolveHierarchicalFlow tests (AC #5, #9) ---

describe('resolveHierarchicalFlow', () => {
  it('resolves story_flow and epic_flow (AC #5)', () => {
    const tasks = { implement: makeTask(), verify: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' }, verify: { agent: 'dev' } },
      story_flow: ['implement', 'verify'],
      epic_flow: ['story_flow'],
    };

    const result = resolveHierarchicalFlow(parsed, tasks);

    expect(result.storyFlow).toEqual(['implement', 'verify']);
    expect(result.epicFlow).toEqual(['story_flow']);
    expect(result.tasks).toBe(tasks);
  });

  it('uses story_flow directly when present (AC #5)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
    };

    const result = resolveHierarchicalFlow(parsed, tasks);

    expect(result.storyFlow).toEqual(['implement']);
  });

  it('applies default execution config when absent (AC #5)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
    };

    const result = resolveHierarchicalFlow(parsed, tasks);

    expect(result.execution).toEqual(EXECUTION_DEFAULTS);
  });

  it('merges partial execution config with defaults', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { max_parallel: 4, isolation: 'worktree' as const },
    };

    const result = resolveHierarchicalFlow(parsed, tasks);

    expect(result.execution.max_parallel).toBe(4);
    expect(result.execution.isolation).toBe('worktree');
    expect(result.execution.merge_strategy).toBe('merge-commit');
    expect(result.execution.epic_strategy).toBe('sequential');
    expect(result.execution.story_strategy).toBe('sequential');
  });

  it('resolves epic_flow with additional tasks', () => {
    const tasks = { plan: makeTask() };
    const parsed = {
      tasks: { plan: { agent: 'pm' } },
      story_flow: ['plan'],
      epic_flow: ['plan', 'story_flow', 'merge', 'validate'],
    };

    const result = resolveHierarchicalFlow(parsed, tasks);

    expect(result.epicFlow).toEqual(['plan', 'story_flow', 'merge', 'validate']);
  });

  it('normalizes story_flow with loop blocks correctly', () => {
    const tasks = { implement: makeTask(), retry: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' }, retry: { agent: 'dev' } },
      story_flow: ['implement', { loop: ['retry', 'implement'] }],
      epic_flow: ['story_flow'],
    };

    const result = resolveHierarchicalFlow(parsed, tasks);

    expect(result.storyFlow).toEqual(['implement', { loop: ['retry', 'implement'] }]);
  });

  it('rejects missing story_flow', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      epic_flow: ['story_flow'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/story_flow/);
  });

  it('rejects missing epic_flow', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/epic_flow/);
  });

  it('rejects epic_flow without story_flow reference', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['implement'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/story_flow/);
  });

  it('rejects invalid max_parallel (non-integer)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { max_parallel: 2.5 },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/max_parallel/);
  });

  it('rejects invalid max_parallel (zero)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { max_parallel: 0 },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
  });

  it('rejects invalid max_parallel (string)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { max_parallel: 'many' },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
  });

  it('rejects invalid isolation value', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { isolation: 'docker' },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/isolation/);
  });

  it('rejects invalid merge_strategy value', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { merge_strategy: 'squash' },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/merge_strategy/);
  });

  it('rejects invalid epic_strategy value', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { epic_strategy: 'random' },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/epic_strategy/);
  });

  it('rejects invalid story_strategy value', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: { story_strategy: 'random' },
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/story_strategy/);
  });

  it('rejects non-array story_flow value', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: 'implement',
      epic_flow: ['story_flow'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/array/);
  });

  it('rejects invalid story_flow step (number)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement', 42],
      epic_flow: ['story_flow'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/flow step/);
  });

  it('rejects loop block with non-array loop value', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement', { loop: 'not-an-array' }],
      epic_flow: ['story_flow'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/loop.*array of strings/);
  });

  it('rejects loop block with non-string entries', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement', { loop: [42] }],
      epic_flow: ['story_flow'],
    };

    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(HierarchicalFlowError);
    expect(() => resolveHierarchicalFlow(parsed, tasks)).toThrow(/loop.*array of strings/);
  });

  it('handles non-object execution gracefully (uses defaults)', () => {
    const tasks = { implement: makeTask() };
    const parsed = {
      tasks: { implement: { agent: 'dev' } },
      story_flow: ['implement'],
      epic_flow: ['story_flow'],
      execution: 'invalid',
    };

    const result = resolveHierarchicalFlow(parsed, tasks);
    expect(result.execution).toEqual(EXECUTION_DEFAULTS);
  });
});

// --- Integration: parseWorkflow with hierarchical flow ---

describe('parseWorkflow — hierarchical flow integration', () => {
  describe('backward compatibility (AC #4)', () => {
    it('parses existing workflow with story_flow and epic_flow', () => {
      const filePath = writeYaml('legacy.yaml', `
tasks:
  implement:
    agent: dev
  verify:
    agent: evaluator
story_flow:
  - implement
  - verify
epic_flow:
  - story_flow
`);
      const result = parseWorkflow(filePath);

      // flow field populated from storyFlow for backward compat
      expect(result.flow).toEqual(['implement', 'verify']);
      // New hierarchical fields
      expect(result.storyFlow).toEqual(['implement', 'verify']);
      expect(result.epicFlow).toEqual(['story_flow']);
      expect(result.execution).toEqual(EXECUTION_DEFAULTS);
    });
  });

  describe('hierarchical workflow (AC #6)', () => {
    it('parses workflow with execution + story_flow + epic_flow', () => {
      const filePath = writeYaml('hierarchical.yaml', `
tasks:
  implement:
    agent: dev
  verify:
    agent: evaluator
  plan:
    agent: pm
execution:
  max_parallel: 4
  isolation: worktree
  merge_strategy: rebase
  epic_strategy: parallel
  story_strategy: parallel
story_flow:
  - implement
  - verify
epic_flow:
  - plan
  - story_flow
  - merge
  - validate
`);
      const result = parseWorkflow(filePath);

      expect(result.execution).toEqual({
        max_parallel: 4,
        isolation: 'worktree',
        merge_strategy: 'rebase',
        epic_strategy: 'parallel',
        story_strategy: 'parallel',
      });
      expect(result.storyFlow).toEqual(['implement', 'verify']);
      expect(result.epicFlow).toEqual(['plan', 'story_flow', 'merge', 'validate']);
      // flow is populated from storyFlow for backward compat
      expect(result.flow).toEqual(['implement', 'verify']);
    });
  });

  describe('story_flow task reference validation (AC #7)', () => {
    it('rejects story_flow referencing undefined task', () => {
      const filePath = writeYaml('bad-story-ref.yaml', `
tasks:
  implement:
    agent: dev
story_flow:
  - implement
  - nonexistent_task
epic_flow:
  - story_flow
`);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      expect(() => parseWorkflow(filePath)).toThrow(/nonexistent_task/);
    });

    it('rejects story_flow loop block referencing undefined task', () => {
      const filePath = writeYaml('bad-story-loop-ref.yaml', `
tasks:
  implement:
    agent: dev
story_flow:
  - implement
  - loop:
      - missing_loop_task
epic_flow:
  - story_flow
`);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      expect(() => parseWorkflow(filePath)).toThrow(/missing_loop_task/);
    });
  });

  describe('epic_flow task reference validation (AC #8)', () => {
    it('rejects epic_flow referencing undefined non-built-in task', () => {
      const filePath = writeYaml('bad-epic-ref.yaml', `
tasks:
  implement:
    agent: dev
story_flow:
  - implement
epic_flow:
  - story_flow
  - merge
  - unknown_epic_task
`);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      expect(() => parseWorkflow(filePath)).toThrow(/unknown_epic_task/);
    });

    it('rejects epic_flow loop block referencing undefined non-built-in task', () => {
      const filePath = writeYaml('bad-epic-loop-ref.yaml', `
tasks:
  implement:
    agent: dev
story_flow:
  - implement
epic_flow:
  - story_flow
  - merge
  - loop:
      - unknown_loop_task
`);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      expect(() => parseWorkflow(filePath)).toThrow(/unknown_loop_task/);
    });

    it('accepts epic_flow with built-in merge and validate (AC #8)', () => {
      const filePath = writeYaml('epic-builtins.yaml', `
tasks:
  implement:
    agent: dev
story_flow:
  - implement
epic_flow:
  - story_flow
  - merge
  - validate
`);
      const result = parseWorkflow(filePath);
      expect(result.epicFlow).toEqual(['story_flow', 'merge', 'validate']);
    });
  });

  describe('flow + story_flow coexistence (AC #9)', () => {
    it('accepts workflow with both flow: and story_flow: (flow is legacy/ignored)', () => {
      const filePath = writeYaml('both-flows.yaml', `
tasks:
  implement:
    agent: dev
flow:
  - implement
story_flow:
  - implement
epic_flow:
  - story_flow
`);
      const result = parseWorkflow(filePath);
      // story_flow takes precedence; flow is legacy
      expect(result.storyFlow).toEqual(['implement']);
    });
  });

  describe('agent: null (AC #10)', () => {
    it('parses task with agent: null', () => {
      const filePath = writeYaml('null-agent.yaml', `
tasks:
  merge_step:
    agent: null
story_flow:
  - merge_step
epic_flow:
  - story_flow
`);
      const result = parseWorkflow(filePath);
      expect(result.tasks.merge_step.agent).toBeNull();
    });
  });

  describe('task without scope (AC #11)', () => {
    it('parses task without scope field', () => {
      const filePath = writeYaml('no-scope.yaml', `
tasks:
  plan:
    agent: pm
story_flow:
  - plan
epic_flow:
  - story_flow
`);
      const result = parseWorkflow(filePath);
      expect(result.tasks.plan.agent).toBe('pm');
    });
  });

  describe('default execution values (AC #1)', () => {
    it('applies default execution values when execution section absent', () => {
      const filePath = writeYaml('no-execution.yaml', `
tasks:
  implement:
    agent: dev
story_flow:
  - implement
epic_flow:
  - story_flow
`);
      const result = parseWorkflow(filePath);

      expect(result.execution.max_parallel).toBe(1);
      expect(result.execution.isolation).toBe('none');
      expect(result.execution.merge_strategy).toBe('merge-commit');
      expect(result.execution.epic_strategy).toBe('sequential');
      expect(result.execution.story_strategy).toBe('sequential');
    });
  });
});

// --- BUILTIN_EPIC_FLOW_TASKS constant ---

describe('BUILTIN_EPIC_FLOW_TASKS', () => {
  it('contains merge and validate', () => {
    expect(BUILTIN_EPIC_FLOW_TASKS.has('merge')).toBe(true);
    expect(BUILTIN_EPIC_FLOW_TASKS.has('validate')).toBe(true);
  });

  it('does not contain arbitrary names', () => {
    expect(BUILTIN_EPIC_FLOW_TASKS.has('implement')).toBe(false);
    expect(BUILTIN_EPIC_FLOW_TASKS.has('deploy')).toBe(false);
  });
});
