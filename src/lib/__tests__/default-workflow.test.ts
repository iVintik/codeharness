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

    it('defines six tasks: create-story, implement, review, verify, retry, and retro', () => {
      const taskNames = Object.keys(workflow.tasks);
      expect(taskNames).toHaveLength(6);
      expect(taskNames).toContain('create-story');
      expect(taskNames).toContain('implement');
      expect(taskNames).toContain('review');
      expect(taskNames).toContain('verify');
      expect(taskNames).toContain('retry');
      expect(taskNames).toContain('retro');
    });

    it('create-story task uses opus model', () => {
      const task = workflow.tasks['create-story'];
      expect(task.agent).toBe('story-creator');
      expect(task.scope).toBe('per-story');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-opus-4-6-20250514');
    });

    it('implement task uses sonnet model', () => {
      const task = workflow.tasks.implement;
      expect(task.agent).toBe('dev');
      expect(task.scope).toBe('per-story');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-sonnet-4-6-20250514');
    });

    it('review task uses codex driver', () => {
      const task = workflow.tasks.review;
      expect(task.agent).toBe('reviewer');
      expect(task.scope).toBe('per-story');
      expect(task.source_access).toBe(true);
      expect(task.driver).toBe('codex');
    });

    it('verify task has source_access false and scope per-story', () => {
      const task = workflow.tasks.verify;
      expect(task.agent).toBe('evaluator');
      expect(task.scope).toBe('per-story');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(false);
      expect(task.driver).toBe('codex');
    });

    it('retry task uses sonnet model', () => {
      const task = workflow.tasks.retry;
      expect(task.agent).toBe('dev');
      expect(task.scope).toBe('per-story');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-sonnet-4-6-20250514');
    });

    it('retro task runs per-epic with opus model', () => {
      const task = workflow.tasks.retro;
      expect(task.agent).toBe('retro');
      expect(task.scope).toBe('per-epic');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-opus-4-6-20250514');
    });
  });

  describe('flow structure (AC #3)', () => {
    it('flow: create-story, implement, review, verify, loop:[retry, review, verify], retro', () => {
      const workflow = parseWorkflow(defaultWorkflowPath);
      expect(workflow.flow).toHaveLength(6);
      expect(workflow.flow[0]).toBe('create-story');
      expect(workflow.flow[1]).toBe('implement');
      expect(workflow.flow[2]).toBe('review');
      expect(workflow.flow[3]).toBe('verify');

      const loopStep = workflow.flow[4] as LoopBlock;
      expect(loopStep).toHaveProperty('loop');
      expect(loopStep.loop).toEqual(['retry', 'review', 'verify']);

      expect(workflow.flow[5]).toBe('retro');
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
