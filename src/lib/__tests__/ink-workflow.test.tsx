import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorkflowGraph, formatCost, formatElapsed } from '../ink-workflow.js';
import type { TaskNodeState, TaskNodeMeta } from '../ink-components.js';
import type { FlowStep } from '../workflow-parser.js';

/** Spinner frames used by TaskNode for active state. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

  it('renders pending tasks with dim text (no status symbols)', () => {
    const flow: FlowStep[] = ['task1'];
    const taskStates: Record<string, TaskNodeState> = { 'task1': 'pending' };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('task1');
    // Pending should NOT have status symbols
    expect(frame).not.toContain('✓');
    expect(frame).not.toContain('✗');
    // Should not contain any spinner frame
    for (const sf of SPINNER_FRAMES) {
      expect(frame).not.toContain(sf);
    }
  });

  it('renders active task with spinner indicator in cyan', () => {
    const flow: FlowStep[] = ['task1'];
    const taskStates: Record<string, TaskNodeState> = { 'task1': 'active' };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask="task1" taskStates={taskStates} />
    );
    const frame = lastFrame()!;
    // Should contain one of the spinner frames
    const hasSpinner = SPINNER_FRAMES.some(sf => frame.includes(sf));
    expect(hasSpinner).toBe(true);
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
    // No separator lines (removed in layout redesign)
    expect(frame).not.toContain('━');
  });

  // --- Driver/cost rows removed (layout redesign) ---

  it('does not render driver or cost rows (removed for compact layout)', () => {
    const flow: FlowStep[] = ['implement', 'verify'];
    const taskStates: Record<string, TaskNodeState> = {
      'implement': 'done',
      'verify': 'active',
    };
    const taskMeta: Record<string, TaskNodeMeta> = {
      'implement': { driver: 'claude-code', costUsd: 0.42, elapsedMs: 240000 },
      'verify': { driver: 'codex' },
    };
    const { lastFrame } = render(
      <WorkflowGraph flow={flow} currentTask="verify" taskStates={taskStates} taskMeta={taskMeta} />
    );
    const frame = lastFrame()!;
    // Task names present
    expect(frame).toContain('implement');
    expect(frame).toContain('verify');
    // Driver and cost rows NOT rendered
    expect(frame).not.toContain('claude-code');
    expect(frame).not.toContain('codex');
    expect(frame).not.toContain('$0.42');
    expect(frame).not.toContain('4m');
  });

  // --- Backward compatibility: no taskMeta renders identically to single-line ---

  it('renders single-line format when taskMeta is empty', () => {
    const flow: FlowStep[] = ['implement', 'verify'];
    const taskStates: Record<string, TaskNodeState> = {
      'implement': 'done',
      'verify': 'pending',
    };
    const { lastFrame: withoutMeta } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} />
    );
    const { lastFrame: withEmptyMeta } = render(
      <WorkflowGraph flow={flow} currentTask={null} taskStates={taskStates} taskMeta={{}} />
    );
    expect(withoutMeta()).toBe(withEmptyMeta());
  });
});

// --- Format helper tests ---

describe('formatCost', () => {
  it('formats positive cost as $X.XX', () => {
    expect(formatCost(0.42)).toBe('$0.42');
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(12.345)).toBe('$12.35');
  });

  it('returns ... for null', () => {
    expect(formatCost(null)).toBe('...');
  });

  it('returns ... for undefined', () => {
    expect(formatCost(undefined)).toBe('...');
  });
});

describe('formatElapsed', () => {
  it('formats seconds < 60 as Xs', () => {
    expect(formatElapsed(5000)).toBe('5s');
    expect(formatElapsed(45000)).toBe('45s');
    expect(formatElapsed(59000)).toBe('59s');
  });

  it('formats seconds >= 60 as Xm', () => {
    expect(formatElapsed(60000)).toBe('1m');
    expect(formatElapsed(120000)).toBe('2m');
    expect(formatElapsed(240000)).toBe('4m');
  });

  it('returns ... for null', () => {
    expect(formatElapsed(null)).toBe('...');
  });

  it('returns ... for undefined', () => {
    expect(formatElapsed(undefined)).toBe('...');
  });

  it('rounds to nearest second', () => {
    expect(formatElapsed(1500)).toBe('2s');
    expect(formatElapsed(500)).toBe('1s');
  });

  it('floors minutes for fractional values', () => {
    // 90s = 1.5m → should show 1m not 2m
    expect(formatElapsed(90000)).toBe('1m');
    // 150s = 2.5m → should show 2m not 3m
    expect(formatElapsed(150000)).toBe('2m');
    // 89.999s rounds to 90s → 1m
    expect(formatElapsed(89999)).toBe('1m');
  });

  it('returns 0s for 0ms', () => {
    expect(formatElapsed(0)).toBe('0s');
  });
});
