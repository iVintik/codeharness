import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import os from 'node:os';
import { join } from 'node:path';
import {
  parseWorkflow,
  resolveWorkflow,
  loadWorkflowPatch,
  mergeWorkflowPatch,
  WorkflowParseError,
  type ResolvedWorkflow,
  type ResolvedTask,
  type FlowStep,
  type WorkflowPatch,
  type GateBlock,
} from '../workflow-parser.js';
import { registerDriver, resetDrivers } from '../agents/drivers/factory.js';
import type { AgentDriver } from '../agents/types.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-wfparser-test-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(testDir, { recursive: true, force: true });
});

function writeYaml(filename: string, content: string): string {
  const filePath = join(testDir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// --- Helpers: YAML content ---

const minimalYaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;

const fullYaml = `
tasks:
  implement:
    agent: dev
    session: fresh
    source_access: true
    prompt_template: "Implement story {{story_key}}"
    input_contract:
      type: object
    output_contract:
      type: object
    max_budget_usd: 5.0
  verify:
    agent: evaluator
    session: continue
    source_access: false
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - verify
`;

const loopYaml = `
tasks:
  implement:
    agent: dev
  verify:
    agent: evaluator
  retry:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - verify
        - gate: retry-gate
          check: [verify]
          fix: [retry]
          pass_when: consensus
          max_retries: 5
          circuit_breaker: stagnation
`;

const emptyYaml = `
tasks: {}
workflow:
  for_each: epic
  steps: []
`;

// --- Tests ---

describe('parseWorkflow', () => {
  describe('valid workflows (AC #1)', () => {
    it('parses a minimal valid workflow and returns ResolvedWorkflow', () => {
      const filePath = writeYaml('minimal.yaml', minimalYaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks).toBeDefined();
      expect(result.storyFlow).toBeDefined();
      expect(result.tasks.implement).toBeDefined();
      expect(result.tasks.implement.agent).toBe('dev');
      expect(result.storyFlow).toEqual(['implement']);
    });

    it('parses a full workflow with all optional fields (AC #1)', () => {
      const filePath = writeYaml('full.yaml', fullYaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.agent).toBe('dev');
      expect(result.tasks.implement.session).toBe('fresh');
      expect(result.tasks.implement.source_access).toBe(true);
      expect(result.tasks.implement.prompt_template).toBe('Implement story {{story_key}}');
      expect(result.tasks.implement.input_contract).toEqual({ type: 'object' });
      expect(result.tasks.implement.output_contract).toEqual({ type: 'object' });
      expect(result.tasks.implement.max_budget_usd).toBe(5.0);

      expect(result.tasks.verify.agent).toBe('evaluator');
      expect(result.tasks.verify.session).toBe('continue');
      expect(result.tasks.verify.source_access).toBe(false);
    });

    it('applies defaults when optional fields are omitted (AC #1)', () => {
      const filePath = writeYaml('defaults.yaml', minimalYaml);
      const result = parseWorkflow(filePath);
      const task = result.tasks.implement;

      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
      expect(task.prompt_template).toBeUndefined();
      expect(task.input_contract).toBeUndefined();
      expect(task.output_contract).toBeUndefined();
      expect(task.max_budget_usd).toBeUndefined();
    });

    it('rejects empty steps in workflow for_each block', () => {
      const filePath = writeYaml('empty.yaml', emptyYaml);
      expect(() => parseWorkflow(filePath)).toThrow(/steps/i);
    });
  });

  describe('invalid YAML syntax (AC #2)', () => {
    it('throws WorkflowParseError for bad YAML', () => {
      const filePath = writeYaml('bad.yaml', '{{{{not yaml at all');

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        expect(err).toBeInstanceOf(WorkflowParseError);
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Invalid YAML syntax');
        expect(pe.errors.length).toBeGreaterThan(0);
      }
    });

    it('throws WorkflowParseError for unclosed quotes in YAML', () => {
      const badYaml = `
tasks:
  implement:
    agent: "dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('unclosed.yaml', badYaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
    });
  });

  describe('schema validation failures (AC #3)', () => {
    it('throws WorkflowParseError when tasks is missing', () => {
      const yaml = 'workflow:\n  for_each: epic\n  steps:\n    - implement\n';
      const filePath = writeYaml('no-tasks.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
        expect(pe.errors.length).toBeGreaterThan(0);
        expect(pe.errors.some((e) => e.message.includes('tasks'))).toBe(true);
      }
    });

    it('throws WorkflowParseError for empty file (null YAML)', () => {
      const filePath = writeYaml('empty-file.yaml', '');
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });

    it('throws WorkflowParseError for scalar YAML content', () => {
      const filePath = writeYaml('scalar.yaml', '42');
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });

    it('throws WorkflowParseError for unknown task field (scope removed)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    scope: per-story
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('bad-scope.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });
  });

  describe('dangling task references (AC #4)', () => {
    it('throws WorkflowParseError when workflow references non-existent task', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - nonexistent
`;
      const filePath = writeYaml('dangling.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Referential integrity errors');
        expect(pe.errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
      }
    });

    it('throws WorkflowParseError when gate references non-existent task', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - gate: quality
          check: [ghost_task]
`;
      const filePath = writeYaml('dangling-gate.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Referential integrity errors');
        expect(pe.errors.some((e) => e.message.includes('ghost_task'))).toBe(true);
      }
    });
  });

  describe('gate blocks (AC #5)', () => {
    it('resolves gate block with valid task references', () => {
      const filePath = writeYaml('loop.yaml', loopYaml);
      const result = parseWorkflow(filePath);

      expect(result.workflow).toBeDefined();
      const storyBlock = result.workflow!.steps[0] as { for_each: string; steps: unknown[] };
      expect(storyBlock.steps).toHaveLength(3);
      expect(storyBlock.steps[0]).toBe('implement');
      expect(storyBlock.steps[1]).toBe('verify');

      const gateStep = storyBlock.steps[2] as GateBlock;
      expect(gateStep).toHaveProperty('gate');
      expect(gateStep.gate).toBe('retry-gate');
      expect(gateStep.check).toEqual(['verify']);
      expect(gateStep.fix).toEqual(['retry']);
    });
  });

  describe('performance (AC #6)', () => {
    it('parses a typical workflow in under 500ms', () => {
      const filePath = writeYaml('perf.yaml', fullYaml);

      const start = performance.now();
      parseWorkflow(filePath);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('file not found (AC #7)', () => {
    it('throws WorkflowParseError for non-existent file', () => {
      const fakePath = join(testDir, 'does-not-exist.yaml');

      expect(() => parseWorkflow(fakePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(fakePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('File not found');
        expect(pe.errors.length).toBeGreaterThan(0);
      }
    });

    it('throws WorkflowParseError when path is a directory', () => {
      const dirPath = join(testDir, 'subdir');
      mkdirSync(dirPath);

      expect(() => parseWorkflow(dirPath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(dirPath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Path is a directory');
      }
    });
  });

  describe('typed interfaces (AC #8)', () => {
    it('ResolvedWorkflow has correct structure', () => {
      const filePath = writeYaml('typed.yaml', fullYaml);
      const result: ResolvedWorkflow = parseWorkflow(filePath);

      // tasks is Record<string, ResolvedTask>
      const taskKeys = Object.keys(result.tasks);
      expect(taskKeys).toContain('implement');
      expect(taskKeys).toContain('verify');

      // storyFlow and epicFlow are FlowStep[]
      expect(Array.isArray(result.storyFlow)).toBe(true);
      expect(Array.isArray(result.epicFlow)).toBe(true);

      // workflow is defined for new format
      expect(result.workflow).toBeDefined();

      // Each task has ResolvedTask properties
      const task: ResolvedTask = result.tasks.implement;
      expect(typeof task.agent).toBe('string');
      expect(typeof task.session).toBe('string');
      expect(typeof task.source_access).toBe('boolean');
    });

    it('FlowStep is a union of string | GateConfig', () => {
      const filePath = writeYaml('flow-types.yaml', loopYaml);
      const result = parseWorkflow(filePath);

      // storyFlow derived from for_each: story block
      const stringStep: FlowStep = result.storyFlow[0];
      expect(typeof stringStep).toBe('string');

      // GateConfig flow step (derived from gate block)
      const gateStep = result.storyFlow[2];
      expect(typeof gateStep).toBe('object');
      expect((gateStep as GateBlock).gate).toBeDefined();
    });
  });

  describe('driver, model, and plugins fields (Story 11-1)', () => {
    it('minimal workflow without new fields parses successfully — backward compat (AC #2)', () => {
      const filePath = writeYaml('compat.yaml', minimalYaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.driver).toBeUndefined();
      expect(result.tasks.implement.model).toBeUndefined();
      expect(result.tasks.implement.plugins).toBeUndefined();
    });

    it('task with driver: codex parses into ResolvedTask.driver === "codex" (AC #3)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    driver: codex
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('driver.yaml', yaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.driver).toBe('codex');
      expect(result.tasks.implement.model).toBeUndefined();
      expect(result.tasks.implement.plugins).toBeUndefined();
    });

    it('task with model: claude-opus-4 parses into ResolvedTask.model (AC #3)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    model: claude-opus-4
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('model.yaml', yaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.model).toBe('claude-opus-4');
      expect(result.tasks.implement.driver).toBeUndefined();
    });

    it('task with plugins: [gstack, omo] parses into ResolvedTask.plugins (AC #3)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    plugins:
      - gstack
      - omo
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('plugins.yaml', yaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.plugins).toEqual(['gstack', 'omo']);
    });

    it('task with all three new fields parses correctly (AC #3)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    driver: codex
    model: codex-mini
    plugins:
      - gstack
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('all-new.yaml', yaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.driver).toBe('codex');
      expect(result.tasks.implement.model).toBe('codex-mini');
      expect(result.tasks.implement.plugins).toEqual(['gstack']);
    });

    it('driver: 123 (wrong type) fails schema validation (AC #8)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    driver: 123
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('bad-driver.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });

    it('model: true (wrong type) fails schema validation (AC #8)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    model: true
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('bad-model.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });

    it('plugins: "not-array" (wrong type) fails schema validation (AC #8)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    plugins: not-array
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('bad-plugins.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });

    it('new fields alongside agent pass schema validation — not rejected as additionalProperties (AC #6)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    driver: codex
    model: codex-mini
    plugins:
      - gstack
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('additional-props.yaml', yaml);
      // Should NOT throw — new fields are recognized by schema
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement.agent).toBe('dev');
      expect(result.tasks.implement.driver).toBe('codex');
    });

    it('ResolvedTask type exposes optional driver, model, plugins fields (AC #4)', () => {
      const filePath = writeYaml('type-check.yaml', minimalYaml);
      const result = parseWorkflow(filePath);
      const task: ResolvedTask = result.tasks.implement;

      // TypeScript compile-time check: these fields exist on ResolvedTask
      const _driver: string | undefined = task.driver;
      const _model: string | undefined = task.model;
      const _plugins: string[] | undefined = task.plugins;

      // Runtime: they are undefined when not set
      expect(_driver).toBeUndefined();
      expect(_model).toBeUndefined();
      expect(_plugins).toBeUndefined();
    });

    it('plugins: [123] (non-string array items) fails schema validation', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    plugins:
      - 123
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('bad-plugins-items.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
      }
    });

    it('empty plugins array is valid', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    plugins: []
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('empty-plugins.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement.plugins).toEqual([]);
    });
  });

  describe('WorkflowParseError structure (AC #8)', () => {
    it('extends Error and has name and errors array', () => {
      const err = new WorkflowParseError('test error', [
        { path: '/tasks', message: 'missing' },
      ]);

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorkflowParseError');
      expect(err.message).toBe('test error');
      expect(err.errors).toHaveLength(1);
      expect(err.errors[0]).toEqual({ path: '/tasks', message: 'missing' });
    });

    it('defaults errors to empty array when not provided', () => {
      const err = new WorkflowParseError('test error');
      expect(err.errors).toEqual([]);
    });
  });
});

// --- Patch Resolution Tests ---

describe('loadWorkflowPatch', () => {
  it('returns null for non-existent file', () => {
    const result = loadWorkflowPatch(join(testDir, 'does-not-exist.patch.yaml'));
    expect(result).toBeNull();
  });

  it('throws WorkflowParseError for invalid YAML', () => {
    const filePath = writeYaml('bad.patch.yaml', '{{{{not yaml');
    expect(() => loadWorkflowPatch(filePath)).toThrow(WorkflowParseError);
    try {
      loadWorkflowPatch(filePath);
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('Invalid YAML in patch file');
      expect(pe.message).toContain(filePath);
    }
  });

  it('throws WorkflowParseError for non-object YAML (scalar)', () => {
    const filePath = writeYaml('scalar.patch.yaml', '42');
    expect(() => loadWorkflowPatch(filePath)).toThrow(WorkflowParseError);
    try {
      loadWorkflowPatch(filePath);
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('not a valid object');
    }
  });

  it('loads a valid patch file', () => {
    const patchContent = `
extends: embedded://default
overrides:
  tasks:
    implement:
      session: continue
`;
    const filePath = writeYaml('valid.patch.yaml', patchContent);
    const result = loadWorkflowPatch(filePath);
    expect(result).not.toBeNull();
    expect(result!.extends).toBe('embedded://default');
    expect(result!.overrides).toBeDefined();
    expect((result!.overrides!.tasks as Record<string, unknown>).implement).toBeDefined();
  });
});

describe('mergeWorkflowPatch', () => {
  const base: Record<string, unknown> = {
    tasks: {
      implement: { agent: 'dev', session: 'fresh', source_access: true },
      verify: { agent: 'evaluator', session: 'fresh', source_access: false },
    },
    flow: ['implement', 'verify'],
  };

  it('handles overrides-only patch (deep merge)', () => {
    const patch: WorkflowPatch = {
      overrides: {
        tasks: {
          implement: { session: 'continue', max_budget_usd: 5.0 },
        },
      },
    };
    const result = mergeWorkflowPatch(base, patch);
    const tasks = result.tasks as Record<string, Record<string, unknown>>;

    // Deep-merged: implement gets new session and max_budget_usd, keeps agent/source_access
    expect(tasks.implement.agent).toBe('dev');
    expect(tasks.implement.session).toBe('continue');
    expect(tasks.implement.max_budget_usd).toBe(5.0);
    expect(tasks.implement.source_access).toBe(true);

    // verify unchanged
    expect(tasks.verify.agent).toBe('evaluator');

    // flow unchanged
    expect(result.flow).toEqual(['implement', 'verify']);
  });

  it('handles replace-only patch (full replacement)', () => {
    const patch: WorkflowPatch = {
      replace: {
        flow: ['implement'],
      },
    };
    const result = mergeWorkflowPatch(base, patch);

    // flow fully replaced
    expect(result.flow).toEqual(['implement']);

    // tasks unchanged
    const tasks = result.tasks as Record<string, Record<string, unknown>>;
    expect(tasks.implement.agent).toBe('dev');
    expect(tasks.verify.agent).toBe('evaluator');
  });

  it('handles patch with both overrides and replace', () => {
    const patch: WorkflowPatch = {
      overrides: {
        tasks: {
          implement: { session: 'continue' },
        },
      },
      replace: {
        flow: ['implement'],
      },
    };
    const result = mergeWorkflowPatch(base, patch);
    const tasks = result.tasks as Record<string, Record<string, unknown>>;

    // overrides applied
    expect(tasks.implement.session).toBe('continue');
    expect(tasks.implement.agent).toBe('dev');

    // replace applied after overrides
    expect(result.flow).toEqual(['implement']);
  });

  it('replace overwrites even if overrides also touched the same key', () => {
    const patch: WorkflowPatch = {
      overrides: {
        flow: ['implement', 'verify', 'extra'],
      },
      replace: {
        flow: ['only-this'],
      },
    };
    const result = mergeWorkflowPatch(base, patch);
    // replace wins because it runs after overrides
    expect(result.flow).toEqual(['only-this']);
  });
});

describe('resolveWorkflow', () => {
  it('returns embedded workflow when no patches exist', () => {
    // Use a cwd with no .codeharness directory
    const result = resolveWorkflow({ cwd: testDir });

    // Should return the embedded default workflow
    expect(result.tasks).toBeDefined();
    expect(result.tasks.implement).toBeDefined();
    expect(result.tasks.implement.agent).toBe('dev');
    expect(result.tasks.verify).toBeDefined();
    expect(result.tasks.verify.agent).toBe('evaluator');
    expect(result.workflow).toBeDefined();
  });

  it('deep-merges overrides from project patch onto embedded base', () => {
    // Create project patch directory
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    const patchContent = `
extends: embedded://default
overrides:
  tasks:
    implement:
      session: continue
      max_budget_usd: 10.0
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    const result = resolveWorkflow({ cwd: testDir });

    expect(result.tasks.implement.session).toBe('continue');
    expect(result.tasks.implement.max_budget_usd).toBe(10.0);
    // Preserved from base
    expect(result.tasks.implement.agent).toBe('dev');
    expect(result.tasks.implement.source_access).toBe(true);
  });

  it('deep-merges driver, model, plugins via project patch onto embedded base (Story 11-1)', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    const patchContent = `
extends: embedded://default
overrides:
  tasks:
    implement:
      driver: codex
      model: codex-mini
      plugins:
        - gstack
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    const result = resolveWorkflow({ cwd: testDir });

    expect(result.tasks.implement.driver).toBe('codex');
    expect(result.tasks.implement.model).toBe('codex-mini');
    expect(result.tasks.implement.plugins).toEqual(['gstack']);
    // Preserved from base
    expect(result.tasks.implement.agent).toBe('dev');
  });

  it('applies replace sections as full replacement (not deep merge)', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    const patchContent = `
extends: embedded://default
replace:
  workflow:
    for_each: epic
    steps:
      - for_each: story
        steps:
          - implement
          - verify
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    const result = resolveWorkflow({ cwd: testDir });

    // workflow fully replaced — simplified structure with just 2 story steps
    const wf = result.workflow as import('../workflow-execution.js').ForEachBlock;
    expect(wf.for_each).toBe('epic');
    const storyBlock = wf.steps[0] as import('../workflow-execution.js').ForEachBlock;
    expect(storyBlock.for_each).toBe('story');
    expect(storyBlock.steps).toEqual(['implement', 'verify']);
    expect(wf.steps).toHaveLength(1);
  });

  it('applies user patch before project patch (ordering)', () => {
    const originalHome = process.env.HOME;
    const fakeHome = join(testDir, 'fake-home');
    process.env.HOME = fakeHome;

    // Create user-level patch
    const userPatchDir = join(os.homedir(), '.codeharness', 'workflows');
    const userPatchPath = join(userPatchDir, 'default.patch.yaml');
    let userPatchExisted = false;
    let originalUserPatch: string | undefined;

    try {
      originalUserPatch = readFileSync(userPatchPath, 'utf-8');
      userPatchExisted = true;
    } catch { /* no existing patch */ }

    try {
      mkdirSync(userPatchDir, { recursive: true });
      writeFileSync(userPatchPath, `
extends: embedded://default
overrides:
  tasks:
    implement:
      session: continue
      max_budget_usd: 3.0
`, 'utf-8');

      // Create project-level patch that overrides the user patch
      const projectPatchDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(projectPatchDir, { recursive: true });
      writeFileSync(join(projectPatchDir, 'default.patch.yaml'), `
extends: embedded://default
overrides:
  tasks:
    implement:
      max_budget_usd: 7.0
`, 'utf-8');

      const result = resolveWorkflow({ cwd: testDir });

      // User patch: session=continue, max_budget_usd=3.0
      // Project patch overrides: max_budget_usd=7.0
      expect(result.tasks.implement.session).toBe('continue');
      expect(result.tasks.implement.max_budget_usd).toBe(7.0);
    } finally {
      process.env.HOME = originalHome;

      // Cleanup user patch
      if (userPatchExisted && originalUserPatch !== undefined) {
        writeFileSync(userPatchPath, originalUserPatch, 'utf-8');
      } else {
        try { rmSync(userPatchPath); } catch { /* ignore */ }
      }
    }
  });

  it('throws WorkflowParseError for malformed YAML patch', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });
    writeFileSync(join(patchDir, 'default.patch.yaml'), '{{{{not yaml', 'utf-8');

    expect(() => resolveWorkflow({ cwd: testDir })).toThrow(WorkflowParseError);
    try {
      resolveWorkflow({ cwd: testDir });
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('Invalid YAML');
    }
  });

  it('throws WorkflowParseError when merged result fails schema validation', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    // Replace tasks with invalid structure (agent missing)
    const patchContent = `
extends: embedded://default
replace:
  tasks:
    broken:
      session: fresh
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    expect(() => resolveWorkflow({ cwd: testDir })).toThrow(WorkflowParseError);
    try {
      resolveWorkflow({ cwd: testDir });
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('Schema validation failed');
    }
  });

  it('throws WorkflowParseError when merged result has dangling task refs in workflow steps', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    // Replace workflow block with a step referencing a non-existent task
    const patchContent = `
extends: embedded://default
replace:
  workflow:
    for_each: epic
    steps:
      - for_each: story
        steps:
          - implement
          - nonexistent_task
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    expect(() => resolveWorkflow({ cwd: testDir })).toThrow(WorkflowParseError);
    try {
      resolveWorkflow({ cwd: testDir });
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('Referential integrity errors');
      expect(pe.errors.some((e) => e.message.includes('nonexistent_task'))).toBe(true);
    }
  });

  it('silently skips missing patch files', () => {
    // testDir has no .codeharness directory
    const result = resolveWorkflow({ cwd: testDir });
    // Should not throw, should return embedded workflow
    expect(result.tasks.implement).toBeDefined();
  });

  it('uses cwd option to find project patches', () => {
    const projectA = join(testDir, 'project-a');
    const patchDir = join(projectA, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    writeFileSync(join(patchDir, 'default.patch.yaml'), `
extends: embedded://default
overrides:
  tasks:
    implement:
      max_budget_usd: 99.0
`, 'utf-8');

    const result = resolveWorkflow({ cwd: projectA });
    expect(result.tasks.implement.max_budget_usd).toBe(99.0);
  });

  it('throws WorkflowParseError for non-existent embedded workflow name', () => {
    expect(() => resolveWorkflow({ cwd: testDir, name: 'nonexistent-workflow' })).toThrow(WorkflowParseError);
    try {
      resolveWorkflow({ cwd: testDir, name: 'nonexistent-workflow' });
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('Embedded workflow not found: nonexistent-workflow');
    }
  });

  it('loads full custom workflow at project level when no extends', () => {
    const customDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(customDir, { recursive: true });

    // Full custom workflow (not a patch)
    writeFileSync(join(customDir, 'default.yaml'), `
tasks:
  custom-task:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - custom-task
`, 'utf-8');

    const result = resolveWorkflow({ cwd: testDir });
    expect(result.tasks['custom-task']).toBeDefined();
    expect(result.tasks['custom-task'].agent).toBe('dev');
  });

  // --- Story 9.2: Custom Workflow Creation ---

  describe('custom workflow by name (Story 9.2)', () => {
    it('loads a custom workflow from .codeharness/workflows/{name}.yaml by name', () => {
      const customDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(customDir, { recursive: true });

      writeFileSync(join(customDir, 'my-workflow.yaml'), `
tasks:
  deploy:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - deploy
`, 'utf-8');

      const result = resolveWorkflow({ cwd: testDir, name: 'my-workflow' });
      expect(result.tasks.deploy).toBeDefined();
      expect(result.tasks.deploy.agent).toBe('dev');
      expect(result.storyFlow).toEqual(['deploy']);
    });

    it('custom workflow fails schema validation — throws WorkflowParseError', () => {
      const customDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(customDir, { recursive: true });

      // Missing tasks key entirely
      writeFileSync(join(customDir, 'bad-schema.yaml'), `
workflow:
  for_each: epic
  steps:
    - deploy
`, 'utf-8');

      expect(() => resolveWorkflow({ cwd: testDir, name: 'bad-schema' })).toThrow(WorkflowParseError);
      try {
        resolveWorkflow({ cwd: testDir, name: 'bad-schema' });
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
        expect(pe.errors.length).toBeGreaterThan(0);
      }
    });

    it('custom workflow passes schema but has dangling flow refs — throws WorkflowParseError', () => {
      const customDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(customDir, { recursive: true });

      writeFileSync(join(customDir, 'dangling.yaml'), `
tasks:
  deploy:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - deploy
        - nonexistent
`, 'utf-8');

      expect(() => resolveWorkflow({ cwd: testDir, name: 'dangling' })).toThrow(WorkflowParseError);
      try {
        resolveWorkflow({ cwd: testDir, name: 'dangling' });
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Referential integrity errors');
        expect(pe.errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
      }
    });

    it('resolveWorkflow({ name: "nonexistent" }) with no matching file throws clear error', () => {
      expect(() => resolveWorkflow({ cwd: testDir, name: 'nonexistent' })).toThrow(WorkflowParseError);
      try {
        resolveWorkflow({ cwd: testDir, name: 'nonexistent' });
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Embedded workflow not found: nonexistent');
      }
    });

    it('resolveWorkflow() with no name defaults to "default" — backward-compatible', () => {
      const result = resolveWorkflow({ cwd: testDir });
      // Should load embedded default without error
      expect(result.tasks).toBeDefined();
      expect(result.tasks.implement).toBeDefined();
      expect(result.workflow).toBeDefined();
    });

    it('custom workflow with extends key is NOT treated as full custom (falls to patch resolution)', () => {
      const customDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(customDir, { recursive: true });

      // This has extends, so it should be treated as a patch-like file, not a full custom workflow
      // Since the name is 'ci' and there is no embedded 'ci' template, this should throw
      writeFileSync(join(customDir, 'ci.yaml'), `
extends: embedded://default
overrides:
  tasks:
    implement:
      session: continue
`, 'utf-8');

      // With extends, it's not treated as a full custom workflow.
      // It tries to load embedded 'ci' template which doesn't exist => error
      expect(() => resolveWorkflow({ cwd: testDir, name: 'ci' })).toThrow(WorkflowParseError);
      try {
        resolveWorkflow({ cwd: testDir, name: 'ci' });
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Embedded workflow not found: ci');
      }
    });

    it('custom workflow alongside patch file: patch is ignored for full custom workflows', () => {
      const customDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(customDir, { recursive: true });

      // Full custom workflow (no extends)
      writeFileSync(join(customDir, 'ci.yaml'), `
tasks:
  build:
    agent: qa
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - build
`, 'utf-8');

      // Patch file that would change agent — should be ignored
      writeFileSync(join(customDir, 'ci.patch.yaml'), `
extends: embedded://default
overrides:
  tasks:
    build:
      agent: architect
`, 'utf-8');

      const result = resolveWorkflow({ cwd: testDir, name: 'ci' });
      expect(result.tasks.build.agent).toBe('qa'); // Not patched
    });

    it('custom workflow with valid agent names resolves agent field correctly', () => {
      const customDir = join(testDir, '.codeharness', 'workflows');
      mkdirSync(customDir, { recursive: true });

      writeFileSync(join(customDir, 'multi-agent.yaml'), `
tasks:
  build:
    agent: dev
  test:
    agent: qa
  deploy:
    agent: architect
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - build
        - test
        - deploy
`, 'utf-8');

      const result = resolveWorkflow({ cwd: testDir, name: 'multi-agent' });
      expect(result.tasks.build.agent).toBe('dev');
      expect(result.tasks.test.agent).toBe('qa');
      expect(result.tasks.deploy.agent).toBe('architect');
    });
  });
});

// --- Referential Integrity Validation Tests (Story 11-2) ---

describe('referential integrity validation', () => {
  function mockDriver(name: string): AgentDriver {
    return {
      name,
      defaultModel: 'test-model',
      capabilities: { streaming: false, tools: false, subagents: false, computerUse: false },
      async healthCheck() { return { status: 'healthy' as const, driver: name }; },
      async *dispatch() { /* empty */ },
      getLastCost() { return null; },
    };
  }

  afterEach(() => {
    resetDrivers();
  });

  describe('driver validation (AC #1, #4)', () => {
    it('workflow with driver: claude-code passes when driver is registered (AC #4)', () => {
      registerDriver(mockDriver('claude-code'));

      const yaml = `
tasks:
  implement:
    agent: dev
    driver: claude-code
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('valid-driver.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement.driver).toBe('claude-code');
    });

    it('workflow with driver: nonexistent throws WorkflowParseError with helpful message (AC #1)', () => {
      registerDriver(mockDriver('claude-code'));

      const yaml = `
tasks:
  implement:
    agent: dev
    driver: codex
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('invalid-driver.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Referential integrity errors');
        expect(pe.errors.some((e) => e.path === '/tasks/implement/driver')).toBe(true);
        expect(pe.errors.some((e) => e.message.includes('codex'))).toBe(true);
        expect(pe.errors.some((e) => e.message.includes('implement'))).toBe(true);
        expect(pe.errors.some((e) => e.message.includes('claude-code'))).toBe(true);
      }
    });

    it('driver validation is skipped when registry is empty (AC #4, Task 4)', () => {
      // No drivers registered — validation should be skipped
      const yaml = `
tasks:
  implement:
    agent: dev
    driver: any-driver-name
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('empty-registry.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement.driver).toBe('any-driver-name');
    });
  });

  describe('agent validation (AC #2, #6)', () => {
    it('workflow with agent: dev (valid embedded agent) passes validation (AC #2)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('valid-agent.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement.agent).toBe('dev');
    });

    it('workflow with agent: nonexistent-agent throws WorkflowParseError with helpful message (AC #2)', () => {
      const yaml = `
tasks:
  implement:
    agent: nonexistent-agent
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('invalid-agent.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Referential integrity errors');
        expect(pe.errors.some((e) => e.path === '/tasks/implement/agent')).toBe(true);
        expect(pe.errors.some((e) => e.message.includes('nonexistent-agent'))).toBe(true);
        expect(pe.errors.some((e) => e.message.includes('implement'))).toBe(true);
        expect(pe.errors.some((e) => e.message.includes('dev'))).toBe(true);
      }
    });

    it('all embedded agent names pass validation', () => {
      const agents = ['dev', 'qa', 'architect', 'pm', 'sm', 'analyst', 'ux-designer', 'tech-writer', 'evaluator'];
      for (const agentName of agents) {
        const yaml = `
tasks:
  task1:
    agent: ${agentName}
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - task1
`;
        const filePath = writeYaml(`agent-${agentName}.yaml`, yaml);
        const result = parseWorkflow(filePath);
        expect(result.tasks.task1.agent).toBe(agentName);
      }
    });

    it('not-found agent error includes "not found" and available agents list', () => {
      const yaml = `
tasks:
  implement:
    agent: nonexistent-agent
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
`;
      const filePath = writeYaml('notfound-msg.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        const agentError = pe.errors.find((e) => e.path === '/tasks/implement/agent');
        expect(agentError).toBeDefined();
        // "not found" path: message says "not found" and lists available agents
        expect(agentError!.message).toContain('not found');
        expect(agentError!.message).toContain('Available agents:');
        expect(agentError!.message).toContain('dev');
      }
    });
  });

  describe('multiple errors collected (AC #3)', () => {
    it('collects all referential integrity errors in a single throw', () => {
      registerDriver(mockDriver('claude-code'));

      const yaml = `
tasks:
  task1:
    agent: fake-agent
    driver: nonexistent
  task2:
    agent: another-fake
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - task1
        - task2
`;
      const filePath = writeYaml('multi-errors.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        // Should have errors for: task1/driver, task1/agent, task2/agent
        expect(pe.errors.length).toBeGreaterThanOrEqual(3);
        expect(pe.errors.some((e) => e.path === '/tasks/task1/driver')).toBe(true);
        expect(pe.errors.some((e) => e.path === '/tasks/task1/agent')).toBe(true);
        expect(pe.errors.some((e) => e.path === '/tasks/task2/agent')).toBe(true);
      }
    });

    it('combines flow-ref and driver/agent errors in a single throw (AC #7)', () => {
      registerDriver(mockDriver('claude-code'));

      const yaml = `
tasks:
  implement:
    agent: fake-agent
    driver: bad-driver
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - nonexistent-task
`;
      const filePath = writeYaml('combined-errors.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        // Flow dangling ref
        expect(pe.errors.some((e) => e.message.includes('nonexistent-task'))).toBe(true);
        // Driver ref
        expect(pe.errors.some((e) => e.path === '/tasks/implement/driver' && e.message.includes('bad-driver'))).toBe(true);
        // Agent ref
        expect(pe.errors.some((e) => e.path === '/tasks/implement/agent' && e.message.includes('fake-agent'))).toBe(true);
      }
    });
  });

  describe('absent fields skip validation (AC #5)', () => {
    it('workflow with no driver field on any task passes (AC #5)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  verify:
    agent: evaluator
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - verify
`;
      const filePath = writeYaml('no-driver.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement.driver).toBeUndefined();
      expect(result.tasks.verify.driver).toBeUndefined();
    });
  });

  describe('backward compatibility (AC #9)', () => {
    it('existing minimal workflow still parses without errors', () => {
      const filePath = writeYaml('compat-minimal.yaml', minimalYaml);
      const result = parseWorkflow(filePath);
      expect(result.tasks.implement).toBeDefined();
      expect(result.tasks.implement.agent).toBe('dev');
    });

    it('embedded default workflow resolves without errors', () => {
      const result = resolveWorkflow({ cwd: testDir });
      expect(result.tasks).toBeDefined();
      expect(result.tasks.implement).toBeDefined();
      expect(result.workflow).toBeDefined();
    });

    it('existing flow-ref checks still work (regression guard)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - ghost
`;
      const filePath = writeYaml('flow-ref-regression.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.errors.some((e) => e.message.includes('ghost'))).toBe(true);
      }
    });
  });

  // ---- Story 22-1: for_each block parsing ----

  describe('for_each workflow format (story 22-1)', () => {
    // AC 1: single-level for_each parses successfully
    it('AC1: single-level for_each with plain task steps parses (exit 0)', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - retro
`;
      const filePath = writeYaml('fe-single.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.workflow).toBeDefined();
      expect(result.workflow!.for_each).toBe('epic');
      expect(result.workflow!.steps).toHaveLength(1);
      expect(result.workflow!.steps[0]).toBe('retro');
    });

    // AC 2: nested for_each blocks parse successfully
    it('AC2: nested for_each (epic → story) parses successfully', () => {
      const yaml = `
tasks:
  create-story:
    agent: dev
  implement:
    agent: dev
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - create-story
        - implement
    - retro
`;
      const filePath = writeYaml('fe-nested.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.workflow).toBeDefined();
      expect(result.workflow!.for_each).toBe('epic');
      expect(result.workflow!.steps).toHaveLength(2);
      const inner = result.workflow!.steps[0] as { for_each: string; steps: unknown[] };
      expect(inner.for_each).toBe('story');
      expect(inner.steps).toEqual(['create-story', 'implement']);
      expect(result.workflow!.steps[1]).toBe('retro');
    });

    // AC 3: missing steps key → non-zero exit, stderr mentions "steps"
    it('AC3: for_each block without steps key throws error mentioning "steps"', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
`;
      const filePath = writeYaml('fe-no-steps.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/steps/);
      }
    });

    // AC 4: empty steps array → non-zero exit, error mentions "steps"
    it('AC4: for_each block with empty steps array throws error', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
  steps: []
`;
      const filePath = writeYaml('fe-empty-steps.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        // AJV will report minItems violation mentioning "steps"
        expect(pe.message.toLowerCase()).toMatch(/steps|items/);
      }
    });

    // AC 5: missing/null scope value → error mentions "scope" or "for_each"
    it('AC5: for_each block with null scope throws error', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: ~
  steps:
    - retro
`;
      const filePath = writeYaml('fe-null-scope.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/for_each|scope|string/);
      }
    });

    it('AC5b: for_each block with empty string scope throws error', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: ""
  steps:
    - retro
`;
      const filePath = writeYaml('fe-empty-scope.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/for_each|scope|minlength|length/);
      }
    });

    // AC 6: unknown task reference → error mentions the task name
    it('AC6: unknown task reference in steps throws error with task name', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - ghost-task
`;
      const filePath = writeYaml('fe-unknown-task.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toMatch(/ghost-task/);
      }
    });

    it('AC6b: unknown task reference in nested for_each throws error with task name', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - ghost-task
    - retro
`;
      const filePath = writeYaml('fe-unknown-nested.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toMatch(/ghost-task/);
      }
    });

    // AC 7: workflow format parses and populates storyFlow/epicFlow
    it('AC7: workflow format parses and populates storyFlow/epicFlow', () => {
      const filePath = writeYaml('fe-new-format.yaml', minimalYaml);
      const result = parseWorkflow(filePath);
      expect(result.storyFlow).toBeDefined();
      expect(result.epicFlow).toBeDefined();
      expect(result.workflow).toBeDefined();
    });

    // AC 11: 3-level nesting parses successfully
    it('AC11: 3-level nesting (epic → story → substory) parses successfully', () => {
      const yaml = `
tasks:
  leaf-task:
    agent: dev
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - for_each: substory
          steps:
            - leaf-task
    - retro
`;
      const filePath = writeYaml('fe-three-levels.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.workflow).toBeDefined();
      expect(result.workflow!.for_each).toBe('epic');
      const level1 = result.workflow!.steps[0] as { for_each: string; steps: unknown[] };
      expect(level1.for_each).toBe('story');
      const level2 = level1.steps[0] as { for_each: string; steps: unknown[] };
      expect(level2.for_each).toBe('substory');
      expect(level2.steps[0]).toBe('leaf-task');
    });

    // AC 12: missing workflow key throws error
    it('AC12: missing workflow key throws error requiring for_each format', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
`;
      const filePath = writeYaml('fe-no-workflow.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/workflow|for_each|format/);
      }
    });

    // ResolvedWorkflow shape when using workflow: format
    it('workflow: format derives storyFlow/epicFlow from the for_each block', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - retro
`;
      const filePath = writeYaml('fe-shape.yaml', yaml);
      const result = parseWorkflow(filePath);
      // storyFlow is empty — no for_each: story block present
      expect(result.storyFlow).toEqual([]);
      // epicFlow contains the single epic-level task
      expect(result.epicFlow).toEqual(['retro']);
      expect(result.tasks.retro).toBeDefined();
      expect(result.execution).toBeDefined();
    });

    // Execution config still resolved from workflow: format YAML
    it('workflow: format resolves execution config from YAML', () => {
      const yaml = `
tasks:
  retro:
    agent: dev
workflow:
  for_each: epic
  steps:
    - retro
execution:
  max_parallel: 2
  isolation: worktree
`;
      const filePath = writeYaml('fe-execution.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.execution.max_parallel).toBe(2);
      expect(result.execution.isolation).toBe('worktree');
    });
  });

  // ---- Story 22-2: gate block parsing ----

  describe('gate block parsing (story 22-2)', () => {
    // AC 1: gate with all fields parses successfully
    it('AC1: gate with all fields parses successfully and returns correct GateBlock', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    source_access: true
  check:
    agent: checker
    driver: codex
    source_access: true
  review:
    agent: reviewer
    driver: codex
    source_access: true
  retry:
    agent: dev
    source_access: true
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - gate: quality
          check: [check, review]
          fix: [retry]
          pass_when: consensus
          max_retries: 5
          circuit_breaker: stagnation
`;
      const filePath = writeYaml('gate-full.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.workflow).toBeDefined();
      const storyBlock = result.workflow!.steps[0] as { for_each: string; steps: unknown[] };
      expect(storyBlock.for_each).toBe('story');
      const gate = storyBlock.steps[1] as GateBlock;
      expect(gate.gate).toBe('quality');
      expect(gate.check).toEqual(['check', 'review']);
      expect(gate.fix).toEqual(['retry']);
      expect(gate.pass_when).toBe('consensus');
      expect(gate.max_retries).toBe(5);
      expect(gate.circuit_breaker).toBe('stagnation');
    });

    // AC 2: gate with only name + check (defaults applied)
    it('AC2: gate with only name and check list applies defaults for omitted fields', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [check]
`;
      const filePath = writeYaml('gate-minimal.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.workflow).toBeDefined();
      const gate = result.workflow!.steps[1] as GateBlock;
      expect(gate.gate).toBe('quality');
      expect(gate.check).toEqual(['check']);
      expect(gate.fix).toEqual([]);
      expect(gate.pass_when).toBe('consensus');
      expect(gate.max_retries).toBe(3);
      expect(gate.circuit_breaker).toBe('stagnation');
    });

    // AC 3: gate with no name (empty string) → error mentioning "gate" and "name" / "named"
    it('AC3: gate with empty name throws WorkflowParseError mentioning gate', () => {
      const yaml = `
tasks:
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - gate: ""
      check: [check]
`;
      const filePath = writeYaml('gate-empty-name.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/gate/);
      }
    });

    // AC 3b: gate with null name → error
    it('AC3b: gate with null name (gate: ~) throws WorkflowParseError', () => {
      const yaml = `
tasks:
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - gate: ~
      check: [check]
`;
      const filePath = writeYaml('gate-null-name.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
    });

    // AC 4: gate with empty check list → error mentioning "check"
    it('AC4: gate with empty check list throws WorkflowParseError mentioning check', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: []
`;
      const filePath = writeYaml('gate-empty-check.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/check/);
      }
    });

    // AC 5: gate with no check key at all → error mentioning "check"
    it('AC5: gate with missing check key throws WorkflowParseError mentioning check', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
`;
      const filePath = writeYaml('gate-no-check.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/check/);
      }
    });

    // AC 6: gate check references unknown task → error with task name in message
    it('AC6: gate check referencing unknown task throws error with task name', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [ghost-checker]
`;
      const filePath = writeYaml('gate-unknown-check.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toMatch(/ghost-checker/);
      }
    });

    // AC 7: gate fix references unknown task → error with task name in message
    it('AC7: gate fix referencing unknown task throws error with task name', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [check]
      fix: [ghost-fixer]
`;
      const filePath = writeYaml('gate-unknown-fix.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toMatch(/ghost-fixer/);
      }
    });

    // AC 8: gate with pass_when: majority parses successfully
    it('AC8a: gate with pass_when: majority parses successfully', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [check]
      pass_when: majority
`;
      const filePath = writeYaml('gate-majority.yaml', yaml);
      const result = parseWorkflow(filePath);
      const gate = result.workflow!.steps[1] as GateBlock;
      expect(gate.pass_when).toBe('majority');
    });

    it('AC8b: gate with pass_when: any_pass parses successfully', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [check]
      pass_when: any_pass
`;
      const filePath = writeYaml('gate-any-pass.yaml', yaml);
      const result = parseWorkflow(filePath);
      const gate = result.workflow!.steps[1] as GateBlock;
      expect(gate.pass_when).toBe('any_pass');
    });

    // AC 9: gate with invalid pass_when → error mentioning "pass_when"
    it('AC9: gate with invalid pass_when throws WorkflowParseError mentioning pass_when', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [check]
      pass_when: invalid_value
`;
      const filePath = writeYaml('gate-invalid-pass-when.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/pass_when/);
      }
    });

    // AC 10: gate with max_retries: 0 → error mentioning "max_retries"
    it('AC10: gate with max_retries: 0 throws WorkflowParseError mentioning max_retries', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: quality
      check: [check]
      max_retries: 0
`;
      const filePath = writeYaml('gate-zero-retries.yaml', yaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message.toLowerCase()).toMatch(/max_retries/);
      }
    });

    // AC 11: multiple gates at different nesting levels parse successfully
    it('AC11: gates at different nesting levels (epic and story) both parse successfully', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
  verify:
    agent: evaluator
    source_access: true
  retry:
    agent: dev
    source_access: true
workflow:
  for_each: epic
  steps:
    - for_each: story
      steps:
        - implement
        - gate: quality
          check: [check]
          fix: [retry]
    - gate: verification
      check: [verify]
`;
      const filePath = writeYaml('gate-multi-level.yaml', yaml);
      const result = parseWorkflow(filePath);
      expect(result.workflow).toBeDefined();
      // Inner gate inside for_each: story
      const storyBlock = result.workflow!.steps[0] as { for_each: string; steps: unknown[] };
      const innerGate = storyBlock.steps[1] as GateBlock;
      expect(innerGate.gate).toBe('quality');
      // Outer gate at for_each: epic level
      const outerGate = result.workflow!.steps[1] as GateBlock;
      expect(outerGate.gate).toBe('verification');
    });

    // AC 12: workflow format with gates derives storyFlow/epicFlow
    it('AC12: workflow format derives storyFlow and epicFlow correctly', () => {
      const filePath = writeYaml('gate-new-format.yaml', minimalYaml);
      const result = parseWorkflow(filePath);
      expect(result.storyFlow).toBeDefined();
      expect(result.epicFlow).toBeDefined();
      expect(result.workflow).toBeDefined();
    });

    // GateBlock is fully populated (all fields present in returned object)
    it('returned GateBlock always has all fields populated (even with defaults)', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
  check:
    agent: checker
    source_access: true
workflow:
  for_each: epic
  steps:
    - implement
    - gate: mygate
      check: [check]
`;
      const filePath = writeYaml('gate-defaults-check.yaml', yaml);
      const result = parseWorkflow(filePath);
      const gate = result.workflow!.steps[1] as GateBlock;
      // All fields must be defined (no undefined)
      expect(gate.gate).toBe('mygate');
      expect(gate.check).toEqual(['check']);
      expect(gate.fix).toEqual([]);
      expect(gate.pass_when).toBe('consensus');
      expect(gate.max_retries).toBe(3);
      expect(gate.circuit_breaker).toBe('stagnation');
    });
  });
});
