import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  type LoopBlock,
  type FlowStep,
  type WorkflowPatch,
} from '../workflow-parser.js';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-wfparser-test-'));
});

afterEach(() => {
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
flow:
  - implement
`;

const fullYaml = `
tasks:
  implement:
    agent: dev
    scope: per-story
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
    scope: per-run
    session: continue
    source_access: false
flow:
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
flow:
  - implement
  - verify
  - loop:
      - retry
      - verify
`;

const emptyYaml = `
tasks: {}
flow: []
`;

// --- Tests ---

describe('parseWorkflow', () => {
  describe('valid workflows (AC #1)', () => {
    it('parses a minimal valid workflow and returns ResolvedWorkflow', () => {
      const filePath = writeYaml('minimal.yaml', minimalYaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks).toBeDefined();
      expect(result.flow).toBeDefined();
      expect(result.tasks.implement).toBeDefined();
      expect(result.tasks.implement.agent).toBe('dev');
      expect(result.flow).toEqual(['implement']);
    });

    it('parses a full workflow with all optional fields (AC #1)', () => {
      const filePath = writeYaml('full.yaml', fullYaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks.implement.agent).toBe('dev');
      expect(result.tasks.implement.scope).toBe('per-story');
      expect(result.tasks.implement.session).toBe('fresh');
      expect(result.tasks.implement.source_access).toBe(true);
      expect(result.tasks.implement.prompt_template).toBe('Implement story {{story_key}}');
      expect(result.tasks.implement.input_contract).toEqual({ type: 'object' });
      expect(result.tasks.implement.output_contract).toEqual({ type: 'object' });
      expect(result.tasks.implement.max_budget_usd).toBe(5.0);

      expect(result.tasks.verify.agent).toBe('evaluator');
      expect(result.tasks.verify.scope).toBe('per-run');
      expect(result.tasks.verify.session).toBe('continue');
      expect(result.tasks.verify.source_access).toBe(false);
    });

    it('applies defaults when optional fields are omitted (AC #1)', () => {
      const filePath = writeYaml('defaults.yaml', minimalYaml);
      const result = parseWorkflow(filePath);
      const task = result.tasks.implement;

      expect(task.scope).toBe('per-story');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
      expect(task.prompt_template).toBeUndefined();
      expect(task.input_contract).toBeUndefined();
      expect(task.output_contract).toBeUndefined();
      expect(task.max_budget_usd).toBeUndefined();
    });

    it('parses empty tasks and flow as valid degenerate case', () => {
      const filePath = writeYaml('empty.yaml', emptyYaml);
      const result = parseWorkflow(filePath);

      expect(result.tasks).toEqual({});
      expect(result.flow).toEqual([]);
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
flow:
  - implement
`;
      const filePath = writeYaml('unclosed.yaml', badYaml);
      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
    });
  });

  describe('schema validation failures (AC #3)', () => {
    it('throws WorkflowParseError when tasks is missing', () => {
      const yaml = 'flow:\n  - implement\n';
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

    it('throws WorkflowParseError for invalid scope enum value', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
    scope: invalid-scope
flow:
  - implement
`;
      const filePath = writeYaml('bad-scope.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Schema validation failed');
        expect(pe.errors.some((e) => e.path.includes('scope'))).toBe(true);
      }
    });
  });

  describe('dangling task references (AC #4)', () => {
    it('throws WorkflowParseError when flow references non-existent task', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
flow:
  - implement
  - nonexistent
`;
      const filePath = writeYaml('dangling.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Dangling task references');
        expect(pe.errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
      }
    });

    it('throws WorkflowParseError when loop references non-existent task', () => {
      const yaml = `
tasks:
  implement:
    agent: dev
flow:
  - implement
  - loop:
      - ghost_task
`;
      const filePath = writeYaml('dangling-loop.yaml', yaml);

      expect(() => parseWorkflow(filePath)).toThrow(WorkflowParseError);
      try {
        parseWorkflow(filePath);
      } catch (err) {
        const pe = err as WorkflowParseError;
        expect(pe.message).toContain('Dangling task references');
        expect(pe.errors.some((e) => e.message.includes('ghost_task'))).toBe(true);
        expect(pe.errors.some((e) => e.path.includes('loop'))).toBe(true);
      }
    });
  });

  describe('loop blocks (AC #5)', () => {
    it('resolves loop block with valid task references', () => {
      const filePath = writeYaml('loop.yaml', loopYaml);
      const result = parseWorkflow(filePath);

      expect(result.flow).toHaveLength(3);
      expect(result.flow[0]).toBe('implement');
      expect(result.flow[1]).toBe('verify');

      const loopStep = result.flow[2] as LoopBlock;
      expect(loopStep).toHaveProperty('loop');
      expect(loopStep.loop).toEqual(['retry', 'verify']);
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

      // flow is FlowStep[]
      expect(Array.isArray(result.flow)).toBe(true);

      // Each task has ResolvedTask properties
      const task: ResolvedTask = result.tasks.implement;
      expect(typeof task.agent).toBe('string');
      expect(typeof task.scope).toBe('string');
      expect(typeof task.session).toBe('string');
      expect(typeof task.source_access).toBe('boolean');
    });

    it('FlowStep is a union of string | LoopBlock', () => {
      const filePath = writeYaml('flow-types.yaml', loopYaml);
      const result = parseWorkflow(filePath);

      // String flow step
      const stringStep: FlowStep = result.flow[0];
      expect(typeof stringStep).toBe('string');

      // LoopBlock flow step
      const loopStep: FlowStep = result.flow[2];
      expect(typeof loopStep).toBe('object');
      expect((loopStep as LoopBlock).loop).toBeDefined();
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
      implement: { agent: 'dev', scope: 'per-story', session: 'fresh', source_access: true },
      verify: { agent: 'evaluator', scope: 'per-run', session: 'fresh', source_access: false },
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

    // Deep-merged: implement gets new session and max_budget_usd, keeps agent/scope/source_access
    expect(tasks.implement.agent).toBe('dev');
    expect(tasks.implement.scope).toBe('per-story');
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
    expect(result.flow.length).toBeGreaterThan(0);
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
    expect(result.tasks.implement.scope).toBe('per-story');
    expect(result.tasks.implement.source_access).toBe(true);
  });

  it('applies replace sections as full replacement (not deep merge)', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    const patchContent = `
extends: embedded://default
replace:
  flow:
    - implement
    - verify
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    const result = resolveWorkflow({ cwd: testDir });

    // flow fully replaced — no loop block from embedded default
    expect(result.flow).toEqual(['implement', 'verify']);
  });

  it('applies user patch before project patch (ordering)', () => {
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
      scope: per-story
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

  it('throws WorkflowParseError when merged result has dangling task refs in flow', () => {
    const patchDir = join(testDir, '.codeharness', 'workflows');
    mkdirSync(patchDir, { recursive: true });

    // Replace flow with ref to non-existent task, but keep tasks valid
    const patchContent = `
extends: embedded://default
replace:
  flow:
    - implement
    - nonexistent_task
`;
    writeFileSync(join(patchDir, 'default.patch.yaml'), patchContent, 'utf-8');

    expect(() => resolveWorkflow({ cwd: testDir })).toThrow(WorkflowParseError);
    try {
      resolveWorkflow({ cwd: testDir });
    } catch (err) {
      const pe = err as WorkflowParseError;
      expect(pe.message).toContain('Dangling task references');
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
    agent: custom-agent
flow:
  - custom-task
`, 'utf-8');

    const result = resolveWorkflow({ cwd: testDir });
    expect(result.tasks['custom-task']).toBeDefined();
    expect(result.tasks['custom-task'].agent).toBe('custom-agent');
  });
});
