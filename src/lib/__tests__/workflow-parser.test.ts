import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseWorkflow,
  WorkflowParseError,
  type ResolvedWorkflow,
  type ResolvedTask,
  type LoopBlock,
  type FlowStep,
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
