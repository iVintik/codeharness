import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorkflowGraph } from '../ink-workflow.js';
import type { TaskNodeState } from '../ink-components.js';
import type { FlowStep } from '../workflow-parser.js';

describe('WorkflowGraph component', () => {
  it('renders sequential flow as task1 → task2 → task3', () => {
    const flow: FlowStep[] = ['create-story', 'implement', 'verify'];
    const taskStates: Record<string, TaskNodeState> = {
      'create-story': 'done',
      'implement': 'active',
      'verify': 'pending',
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask="implement" taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('create-story');
    expect(frame).toContain('→');
    expect(frame).toContain('implement');
    expect(frame).toContain('verify');
  });

  it('renders loop block as loop(N)[ task1 → task2 ]', () => {
    const flow: FlowStep[] = ['create-story', { loop: ['implement', 'verify'] }];
    const taskStates: Record<string, TaskNodeState> = {
      'create-story': 'done',
      'implement': 'active',
      'verify': 'pending',
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask="implement" taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('loop(');
    expect(frame).toContain('[ ');
    expect(frame).toContain('implement');
    expect(frame).toContain('verify');
    expect(frame).toContain(' ]');
  });

  it('renders pending tasks with dim text', () => {
    const flow: FlowStep[] = ['task1'];
    const taskStates: Record<string, TaskNodeState> = { 'task1': 'pending' };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    // Dim text in Ink renders the text without color markers
    expect(frame).toContain('task1');
    // Pending should NOT have status symbols
    expect(frame).not.toContain('✓');
    expect(frame).not.toContain('✗');
    expect(frame).not.toContain('◆');
  });

  it('renders active task with ◆ marker', () => {
    const flow: FlowStep[] = ['task1'];
    const taskStates: Record<string, TaskNodeState> = { 'task1': 'active' };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask="task1" taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('◆');
    expect(frame).toContain('task1');
  });

  it('renders completed task with ✓', () => {
    const flow: FlowStep[] = ['task1'];
    const taskStates: Record<string, TaskNodeState> = { 'task1': 'done' };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('✓');
    expect(frame).toContain('task1');
  });

  it('renders failed task with ✗', () => {
    const flow: FlowStep[] = ['task1'];
    const taskStates: Record<string, TaskNodeState> = { 'task1': 'failed' };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('✗');
    expect(frame).toContain('task1');
  });

  it('returns null for empty flow', () => {
    const { lastFrame } = render(
      <WorkflowGraph flow={[]} currentTask={null} taskStates={{ task1: 'pending' }} />
    );
    expect(lastFrame()).toBe('');
  });

  it('returns null for empty taskStates', () => {
    const { lastFrame } = render(
      <WorkflowGraph flow={['task1']} currentTask={null} taskStates={{}} />
    );
    expect(lastFrame()).toBe('');
  });

  it('renders loop block with iteration 0 when all tasks are pending', () => {
    const flow: FlowStep[] = [{ loop: ['implement', 'verify'] }];
    const taskStates: Record<string, TaskNodeState> = {
      'implement': 'pending',
      'verify': 'pending',
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('loop(0)');
    expect(frame).toContain('implement');
    expect(frame).toContain('verify');
  });

  it('renders loop block with iteration 1 when a task is done', () => {
    const flow: FlowStep[] = [{ loop: ['implement', 'verify'] }];
    const taskStates: Record<string, TaskNodeState> = {
      'implement': 'done',
      'verify': 'pending',
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('loop(1)');
  });

  it('renders loop block with iteration 1 when a task has failed', () => {
    const flow: FlowStep[] = [{ loop: ['implement', 'verify'] }];
    const taskStates: Record<string, TaskNodeState> = {
      'implement': 'failed',
      'verify': 'pending',
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('loop(1)');
  });

  it('renders mixed flow with sequential and loop steps', () => {
    const flow: FlowStep[] = ['create-story', { loop: ['implement', 'verify'] }, 'deploy'];
    const taskStates: Record<string, TaskNodeState> = {
      'create-story': 'done',
      'implement': 'done',
      'verify': 'active',
      'deploy': 'pending',
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask="verify" taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('create-story');
    expect(frame).toContain('✓');
    expect(frame).toContain('loop(');
    expect(frame).toContain('implement');
    expect(frame).toContain('verify');
    expect(frame).toContain('deploy');
    // Separator lines
    expect(frame).toContain('━');
  });
});
