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

    it('contains tasks and story_flow/epic_flow top-level keys', () => {
      const raw = readFileSync(defaultWorkflowPath, 'utf-8');
      expect(raw).toContain('tasks:');
      expect(raw).toContain('story_flow:');
      expect(raw).toContain('epic_flow:');
    });
  });

  describe('schema validation via parseWorkflow (AC #4)', () => {
    it('passes schema validation and returns a ResolvedWorkflow', () => {
      const result = parseWorkflow(defaultWorkflowPath);
      expect(result).toBeDefined();
      expect(result.tasks).toBeDefined();
      expect(result.storyFlow).toBeDefined();
      expect(result.epicFlow).toBeDefined();
    });
  });

  describe('task definitions (AC #2)', () => {
    let workflow: ResolvedWorkflow;

    beforeAll(() => {
      workflow = parseWorkflow(defaultWorkflowPath);
    });

    it('defines nine tasks: create-story, implement, check, review, document, deploy, verify, retry, and retro', () => {
      const taskNames = Object.keys(workflow.tasks);
      expect(taskNames).toHaveLength(9);
      expect(taskNames).toContain('create-story');
      expect(taskNames).toContain('implement');
      expect(taskNames).toContain('check');
      expect(taskNames).toContain('review');
      expect(taskNames).toContain('document');
      expect(taskNames).toContain('deploy');
      expect(taskNames).toContain('verify');
      expect(taskNames).toContain('retry');
      expect(taskNames).toContain('retro');
    });

    it('create-story task uses opus model', () => {
      const task = workflow.tasks['create-story'];
      expect(task.agent).toBe('story-creator');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-opus-4-6');
    });

    it('implement task uses sonnet model', () => {
      const task = workflow.tasks.implement;
      expect(task.agent).toBe('dev');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-sonnet-4-6');
    });

    it('check task uses checker agent with codex driver', () => {
      const task = workflow.tasks.check;
      expect(task.agent).toBe('checker');
      expect(task.source_access).toBe(true);
      expect(task.driver).toBe('codex');
    });

    it('review task uses reviewer agent with codex driver', () => {
      const task = workflow.tasks.review;
      expect(task.agent).toBe('reviewer');
      expect(task.source_access).toBe(true);
      expect(task.driver).toBe('codex');
    });

    it('verify task has source_access false', () => {
      const task = workflow.tasks.verify;
      expect(task.agent).toBe('evaluator');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(false);
      expect(task.driver).toBe('codex');
    });

    it('retry task uses sonnet model', () => {
      const task = workflow.tasks.retry;
      expect(task.agent).toBe('dev');
      expect(task.session).toBe('fresh');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-sonnet-4-6');
    });

    it('retro task uses opus model', () => {
      const task = workflow.tasks.retro;
      expect(task.agent).toBe('retro');
      expect(task.source_access).toBe(true);
      expect(task.model).toBe('claude-opus-4-6');
    });
  });

  describe('flow structure (AC #3)', () => {
    it('storyFlow: create-story, negotiate-acs, loop, implement, check, review, loop, document', () => {
      const workflow = parseWorkflow(defaultWorkflowPath);
      expect(workflow.storyFlow).toHaveLength(6);
      expect(workflow.storyFlow[0]).toBe('create-story');
      expect(workflow.storyFlow[1]).toBe('implement');
      expect(workflow.storyFlow[2]).toBe('check');
      expect(workflow.storyFlow[3]).toBe('review');

      const storyLoop = workflow.storyFlow[4] as LoopBlock;
      expect(storyLoop).toHaveProperty('loop');
      expect(storyLoop.loop).toEqual(['retry', 'check', 'review']);

      expect(workflow.storyFlow[5]).toBe('document');
    });

    it('epicFlow: story_flow, deploy, verify, loop:[retry, document, deploy, verify], retro', () => {
      const workflow = parseWorkflow(defaultWorkflowPath);
      expect(workflow.epicFlow).toHaveLength(5);
      expect(workflow.epicFlow[0]).toBe('story_flow');
      expect(workflow.epicFlow[1]).toBe('deploy');
      expect(workflow.epicFlow[2]).toBe('verify');

      const loopStep = workflow.epicFlow[3] as LoopBlock;
      expect(loopStep).toHaveProperty('loop');
      expect(loopStep.loop).toEqual(['retry', 'document', 'deploy', 'verify']);

      expect(workflow.epicFlow[4]).toBe('retro');
    });

    it('flow (deprecated compat) equals storyFlow', () => {
      const workflow = parseWorkflow(defaultWorkflowPath);
      expect(workflow.flow).toEqual(workflow.storyFlow);
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
