import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseWorkflow, type ResolvedWorkflow, type ForEachBlock, type GateBlock } from '../workflow-parser.js';

const defaultWorkflowPath = resolve(__dirname, '../../../templates/workflows/default.yaml');

describe('default embedded workflow', () => {
  describe('file existence (AC #1)', () => {
    it('templates/workflows/default.yaml exists on disk', () => {
      expect(existsSync(defaultWorkflowPath)).toBe(true);
    });

    it('contains tasks and workflow/for_each top-level keys', () => {
      const raw = readFileSync(defaultWorkflowPath, 'utf-8');
      expect(raw).toContain('tasks:');
      expect(raw).toContain('workflow:');
      expect(raw).toContain('for_each: epic');
    });

    it('does NOT contain legacy story_flow, epic_flow, or loop keys', () => {
      const raw = readFileSync(defaultWorkflowPath, 'utf-8');
      expect(raw).not.toContain('story_flow:');
      expect(raw).not.toContain('epic_flow:');
      expect(raw).not.toContain('loop:');
    });
  });

  describe('schema validation via parseWorkflow (AC #4)', () => {
    it('passes schema validation and returns a ResolvedWorkflow', () => {
      const result = parseWorkflow(defaultWorkflowPath);
      expect(result).toBeDefined();
      expect(result.tasks).toBeDefined();
      expect(result.workflow).toBeDefined();
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

  describe('workflow structure (AC #3)', () => {
    let workflow: ResolvedWorkflow;

    beforeAll(() => {
      workflow = parseWorkflow(defaultWorkflowPath);
    });

    it('top-level workflow block uses for_each: epic', () => {
      const wf = workflow.workflow as ForEachBlock;
      expect(wf.for_each).toBe('epic');
      expect(Array.isArray(wf.steps)).toBe(true);
    });

    it('first step is a for_each: story block', () => {
      const wf = workflow.workflow as ForEachBlock;
      const storyBlock = wf.steps[0] as ForEachBlock;
      expect(storyBlock.for_each).toBe('story');
      expect(Array.isArray(storyBlock.steps)).toBe(true);
    });

    it('story block steps: create-story, implement, gate: quality, document', () => {
      const wf = workflow.workflow as ForEachBlock;
      const storyBlock = wf.steps[0] as ForEachBlock;
      expect(storyBlock.steps[0]).toBe('create-story');
      expect(storyBlock.steps[1]).toBe('implement');
      const qualityGate = storyBlock.steps[2] as GateBlock;
      expect(qualityGate.gate).toBe('quality');
      expect(qualityGate.check).toEqual(['check', 'review']);
      expect(qualityGate.fix).toEqual(['retry']);
      expect(qualityGate.pass_when).toBe('consensus');
      expect(qualityGate.max_retries).toBe(5);
      expect(qualityGate.circuit_breaker).toBe('stagnation');
      expect(storyBlock.steps[3]).toBe('document');
    });

    it('epic-level steps after story block: deploy, gate: verification, retro', () => {
      const wf = workflow.workflow as ForEachBlock;
      expect(wf.steps[1]).toBe('deploy');
      const verificationGate = wf.steps[2] as GateBlock;
      expect(verificationGate.gate).toBe('verification');
      expect(verificationGate.check).toEqual(['verify']);
      expect(verificationGate.fix).toEqual(['retry', 'document', 'deploy']);
      expect(verificationGate.pass_when).toBe('consensus');
      expect(verificationGate.max_retries).toBe(3);
      expect(verificationGate.circuit_breaker).toBe('stagnation');
      expect(wf.steps[3]).toBe('retro');
    });

    it('storyFlow and epicFlow are derived from the for_each workflow block (runtime compat)', () => {
      // storyFlow: tasks inside the for_each: story block (gate converted to loop)
      expect(workflow.storyFlow).toEqual([
        'create-story',
        'implement',
        { loop: ['check', 'review', 'retry'] },
        'document',
      ]);
      // epicFlow: story_flow sentinel + epic-level tasks/gates
      expect(workflow.epicFlow).toEqual([
        'story_flow',
        'deploy',
        { loop: ['verify', 'retry', 'document', 'deploy'] },
        'retro',
      ]);
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
