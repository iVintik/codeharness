import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { App } from '../ink-app.js';
import type { RendererState } from '../ink-components.js';
import type { LaneData } from '../ink-lane-container.js';
import type { SummaryBarProps } from '../ink-summary-bar.js';
import type { MergeState } from '../ink-merge-status.js';

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
    storyContext: [],
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

describe('App component', () => {
  it('renders without crashing with minimal state', () => {
    const { lastFrame } = render(<App state={makeState()} />);
    const frame = lastFrame()!;
    // Should not crash — empty state renders something
    expect(frame).toBeDefined();
  });

  it('renders single-lane layout when no lanes provided', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
        elapsed: '18m',
        totalCost: 4.20,
      },
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // Should show header
    expect(frame).toContain('codeharness run');
    // Story/Phase no longer in header — moved to StoryContext
    expect(frame).not.toContain('Story:');
    // Should NOT show lane count
    expect(frame).not.toContain('lanes');
  });

  it('renders single-lane layout when lanes has 1 entry (AC #8 backward compat)', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
        elapsed: '18m',
        totalCost: 4.20,
      },
      lanes: [makeLane()],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // AC #8: single lane mode should be visually identical to current single-lane TUI
    expect(frame).toContain('codeharness run');
    // Story/Phase no longer in header
    expect(frame).not.toContain('Story:');
    // Should NOT render LaneContainer (no lane indices visible)
    expect(frame).not.toContain('Lane 1:');
    expect(frame).not.toContain('lanes');
  });

  it('renders LaneContainer when lanes > 1 (AC #10)', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
        elapsed: '18m',
        totalCost: 4.20,
      },
      lanes: [
        makeLane({ epicId: '10', epicTitle: 'Driver Interface' }),
        makeLane({ epicId: '14', epicTitle: 'Workflow Schema', currentStory: '14-1' }),
      ],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // AC #10: should render LaneContainer with multiple lanes
    expect(frame).toContain('Epic 10');
    expect(frame).toContain('Epic 14');
    expect(frame).toContain('Lane 1:');
    expect(frame).toContain('Lane 2:');
  });

  it('shows lane count in header when multi-lane (AC #11)', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
        elapsed: '18m',
        totalCost: 4.20,
        laneTotalCost: 18.60,
      },
      lanes: [
        makeLane({ epicId: '10' }),
        makeLane({ epicId: '14' }),
      ],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // AC #11: header shows lane count and total cost
    expect(frame).toContain('2 lanes');
    expect(frame).toContain('$18.60 spent');
  });

  it('renders empty lanes array as single-lane layout', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
      },
      lanes: [],
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // Empty lanes = single-lane layout
    expect(frame).toContain('codeharness run');
    expect(frame).not.toContain('Lane 1:');
  });

  it('renders SummaryBar and MergeStatus when laneCount > 1 (AC #11)', () => {
    const summaryBar: SummaryBarProps = {
      doneStories: ['10-1', '10-2'],
      mergingEpic: { epicId: 'epic-14', status: 'in-progress' },
      pendingEpics: ['epic-11', 'epic-12'],
    };
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      conflictCount: 0,
    };
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
      summaryBar,
      mergeState,
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // SummaryBar should be visible
    expect(frame).toContain('Done:');
    expect(frame).toContain('10-1');
    expect(frame).toContain('Merging:');
    expect(frame).toContain('epic-14');
    expect(frame).toContain('Pending:');
    // MergeStatus should be visible
    expect(frame).toContain('[OK] Merge epic-14');
  });

  it('does NOT render SummaryBar or MergeStatus when laneCount <= 1 (AC #12)', () => {
    const summaryBar: SummaryBarProps = {
      doneStories: ['10-1'],
      mergingEpic: null,
      pendingEpics: [],
    };
    const mergeState: MergeState = {
      epicId: 'epic-14',
      outcome: 'clean',
      conflictCount: 0,
    };
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
      },
      lanes: [makeLane()],
      summaryBar,
      mergeState,
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // Single-lane mode: SummaryBar and MergeStatus should NOT render
    expect(frame).not.toContain('[OK] Merge');
    // The summary bar "Done:" with checkmarks should not appear
    // (StoryBreakdown may use "Done:" in single-lane mode, but not the SummaryBar format)
    expect(frame).not.toContain('Pending:');
  });

  it('does NOT render SummaryBar or MergeStatus with no lanes (AC #12)', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
      },
      summaryBar: {
        doneStories: ['10-1'],
        mergingEpic: null,
        pendingEpics: ['epic-12'],
      },
      mergeState: {
        epicId: 'epic-14',
        outcome: 'clean',
        conflictCount: 0,
      },
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).not.toContain('[OK] Merge');
    expect(frame).not.toContain('Pending:');
  });

  it('renders separator after SummaryBar/MergeStatus in multi-lane mode even without stories', () => {
    const state = makeState({
      sprintInfo: {
        storyKey: '10-3',
        phase: 'dev',
        done: 2,
        total: 5,
      },
      stories: [],
      lanes: [
        makeLane({ epicId: '10' }),
        makeLane({ epicId: '14' }),
      ],
      summaryBar: {
        doneStories: ['10-1'],
        mergingEpic: null,
        pendingEpics: [],
      },
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    // Should have separator characters (━) after the summary section
    expect(frame).toContain('\u2501');
    expect(frame).toContain('Done:');
  });

  it('renders SummaryBar without MergeStatus when mergeState is absent', () => {
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
      summaryBar: {
        doneStories: ['10-1'],
        mergingEpic: null,
        pendingEpics: ['epic-12'],
      },
    });
    const { lastFrame } = render(<App state={state} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Done:');
    expect(frame).toContain('Pending:');
    expect(frame).not.toContain('[OK] Merge');
  });
});
