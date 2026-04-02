import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseWorkflow, type ResolvedWorkflow, type LoopBlock } from '../workflow-parser.js';

const defaultWorkflowPath = resolve(__dirname, '../../../templates/workflows/default.yaml');

describe('default embedded workflow', () => {
  describe('file existence (AC #1)', () => {
    it('templates/workflows/default.yaml exists on disk', () => {
      expect(existsSync(defaultWorkflowPath)).toBe(true);
    });

    it('contains tasks and flow top-level keys', () => {
      const raw = readFileSync(defaultWorkflowPath, 'utf-8');
      expect(raw).toContain('tasks:');
      expect(raw).toContain('flow:');
    });
  });

  describe('schema validation via parseWorkflow (AC #4)', () => {
    it('passes schema validation and returns a ResolvedWorkflow', () => {
      const result = parseWorkflow(defaultWorkflowPath);
      expect(result).toBeDefined();
      expect(result.tasks).toBeDefined();
      expect(result.flow).toBeDefined();
    });
  });

  describe('task definitions (AC #2)', () => {
    let workflow: ResolvedWorkflow;

    beforeAll(() => {
      workflow = parseWorkflow(defaultWorkflowPath);
    });

    it('defines exactly three tasks: implement, verify, and retry', () => {
      const taskNames = Object.keys(workflow.tasks);
      expect(taskNames).toHaveLength(3);
      expect(taskNames).toContain('implement');
      expect(taskNames).toContain('verify');
      expect(taskNames).toContain('retry');
    });

    it('implement task has correct properties', () => {
      const task = workflow.tasks.implement;
      expect(task.agent).toBe('dev');
      expect(task.scope).toBe('per-story');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
    });

    it('verify task has source_access false and scope per-run (AC #5)', () => {
      const task = workflow.tasks.verify;
      expect(task.agent).toBe('evaluator');
      expect(task.scope).toBe('per-run');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(false);
    });

    it('retry task has source_access true and scope per-story (AC #6)', () => {
      const task = workflow.tasks.retry;
      expect(task.agent).toBe('dev');
      expect(task.scope).toBe('per-story');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
    });
  });

  describe('flow structure (AC #3)', () => {
    it('flow order is implement, verify, then loop:[retry, verify]', () => {
      const workflow = parseWorkflow(defaultWorkflowPath);
      expect(workflow.flow).toHaveLength(3);
      expect(workflow.flow[0]).toBe('implement');
      expect(workflow.flow[1]).toBe('verify');

      const loopStep = workflow.flow[2] as LoopBlock;
      expect(loopStep).toHaveProperty('loop');
      expect(loopStep.loop).toEqual(['retry', 'verify']);
    });
  });

  describe('npm distribution (AC #7)', () => {
    it('templates/workflows/ is included in package.json files array', () => {
      const pkgPath = resolve(__dirname, '../../../package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      expect(pkg.files).toContain('templates/workflows/');
    });
  });
});
