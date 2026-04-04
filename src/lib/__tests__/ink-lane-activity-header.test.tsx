/**
 * Integration tests for LaneActivityHeader in ink-app.tsx.
 *
 * @see Story 20-3, Task 10: Lane indicator renders correctly.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { LaneActivityHeader } from '../ink-app.js';
import { App } from '../ink-app.js';
import type { RendererState } from '../ink-components.js';
import type { LaneData } from '../ink-lane-container.js';

function makeState(overrides?: Partial<RendererState>): RendererState {
  return {
    sprintInfo: null,
    stories: [],
    messages: [],
    completedTools: [],
    activeTool: null,
    activeToolArgs: '',
    lastThought: null,
    retryInfo: null,
    workflowFlow: [],
    currentTaskName: null,
    taskStates: {},
    taskMeta: {},
    activeDriverName: null,
    driverCosts: {},
    ...overrides,
  };
}

function makeLane(overrides?: Partial<LaneData>): LaneData {
  return {
    epicId: '10',
    epicTitle: 'Driver Interface',
    currentStory: '10-3',
    phase: 'dev',
    acProgress: '4/9',
    storyProgressEntries: [
      { key: '10-1', status: 'done' },
      { key: '10-2', status: 'done' },
      { key: '10-3', status: 'in-progress' },
    ],
    driver: 'claude-code',
    cost: 4.20,
    elapsedTime: 1080000,
    ...overrides,
  };
}

describe('LaneActivityHeader component', () => {
  it('renders lane indicator when laneCount > 1 (AC #5)', () => {
    const { lastFrame } = render(<LaneActivityHeader activeLaneId="epic-10" laneCount={3} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[Lane epic-10');
    expect(frame).toContain('\u25B8');
  });

  it('does not render when laneCount <= 1 (AC #6)', () => {
    const { lastFrame } = render(<LaneActivityHeader activeLaneId="epic-10" laneCount={1} />);
    expect(lastFrame()).toBe('');
  });

  it('does not render when laneCount is 0 (AC #6)', () => {
    const { lastFrame } = render(<LaneActivityHeader activeLaneId="epic-10" laneCount={0} />);
    expect(lastFrame()).toBe('');
  });

  it('does not render when activeLaneId is null', () => {
    const { lastFrame } = render(<LaneActivityHeader activeLaneId={null} laneCount={3} />);
    expect(lastFrame()).toBe('');
  });
});

describe('App with lane indicator (Task 10, AC #5)', () => {
  it('shows lane indicator in activity section when laneCount > 1 and activeLaneId set', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
      },
      lanes: [
        makeLane({ epicId: '10' }),
        makeLane({ epicId: '14' }),
      ],
      activeLaneId: 'epic-10',
      laneCount: 2,
      completedTools: [{ name: 'Read', args: 'file.ts' }],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('[Lane epic-10');
    expect(frame).toContain('\u25B8');
  });

  it('does not show lane indicator when laneCount <= 1 (AC #6)', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
      },
      lanes: [makeLane()],
      activeLaneId: null,
      laneCount: 0,
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).not.toContain('[Lane');
    expect(frame).not.toContain('\u25B8');
  });
});
