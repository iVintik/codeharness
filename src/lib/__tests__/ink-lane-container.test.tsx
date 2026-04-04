import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { LaneContainer, CollapsedLanes, getLayoutMode } from '../ink-lane-container.js';
import type { LaneData, CollapsedLaneData } from '../ink-lane-container.js';

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

describe('getLayoutMode', () => {
  it('returns side-by-side for width >= 120', () => {
    expect(getLayoutMode(120)).toBe('side-by-side');
    expect(getLayoutMode(200)).toBe('side-by-side');
  });

  it('returns stacked for width 80-119', () => {
    expect(getLayoutMode(80)).toBe('stacked');
    expect(getLayoutMode(100)).toBe('stacked');
    expect(getLayoutMode(119)).toBe('stacked');
  });

  it('returns single for width < 80', () => {
    expect(getLayoutMode(79)).toBe('single');
    expect(getLayoutMode(40)).toBe('single');
    expect(getLayoutMode(1)).toBe('single');
  });
});

describe('LaneContainer component', () => {
  it('exports LaneContainer and related types', () => {
    expect(LaneContainer).toBeDefined();
    expect(typeof LaneContainer).toBe('function');
  });

  it('returns null for empty lanes array', () => {
    const { lastFrame } = render(
      <LaneContainer lanes={[]} terminalWidth={120} />
    );
    expect(lastFrame()).toBe('');
  });

  it('renders side-by-side layout when terminalWidth >= 120 and 2 lanes', () => {
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'Driver Interface' }),
      makeLane({ epicId: '14', epicTitle: 'Workflow Schema', currentStory: '14-1' }),
    ];
    const { lastFrame } = render(
      <LaneContainer lanes={lanes} terminalWidth={120} />
    );
    const frame = lastFrame()!;
    // Both lanes should be visible
    expect(frame).toContain('Epic 10');
    expect(frame).toContain('Epic 14');
    expect(frame).toContain('Driver Interface');
    expect(frame).toContain('Workflow Schema');
    // Should show lane indices
    expect(frame).toContain('Lane 1:');
    expect(frame).toContain('Lane 2:');
  });

  it('renders stacked layout when terminalWidth 80-119 and 2 lanes', () => {
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'Driver Interface' }),
      makeLane({ epicId: '14', epicTitle: 'Workflow Schema' }),
    ];
    const { lastFrame } = render(
      <LaneContainer lanes={lanes} terminalWidth={100} />
    );
    const frame = lastFrame()!;
    // Both lanes should still be visible
    expect(frame).toContain('Epic 10');
    expect(frame).toContain('Epic 14');
    expect(frame).toContain('Lane 1:');
    expect(frame).toContain('Lane 2:');
  });

  it('renders single-lane layout when terminalWidth < 80', () => {
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'Driver Interface', lastActivityTime: 100 }),
      makeLane({ epicId: '14', epicTitle: 'Workflow Schema', lastActivityTime: 200 }),
    ];
    const { lastFrame } = render(
      <LaneContainer lanes={lanes} terminalWidth={60} />
    );
    const frame = lastFrame()!;
    // Most recently active lane (14) should be fully rendered
    expect(frame).toContain('Epic 14');
    expect(frame).toContain('Workflow Schema');
    // Other lane should be collapsed (single-line summary)
    // The collapsed lane for epic 10 appears as a dim line
    expect(frame).toContain('Driver Interface');
  });

  it('collapses lanes 3+ to one-line summaries at >= 120 cols', () => {
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'Driver Interface' }),
      makeLane({ epicId: '14', epicTitle: 'Workflow Schema' }),
      makeLane({ epicId: '11', epicTitle: 'Event Router', currentStory: '11-1', phase: 'dev', cost: 0.40, elapsedTime: 120000 }),
    ];
    const { lastFrame } = render(
      <LaneContainer lanes={lanes} terminalWidth={140} />
    );
    const frame = lastFrame()!;
    // First two rendered in full
    expect(frame).toContain('Lane 1:');
    expect(frame).toContain('Lane 2:');
    // Third collapsed
    expect(frame).toContain('Lane 3:');
    expect(frame).toContain('Event Router');
    expect(frame).toContain('$0.40');
  });

  it('renders single lane without lane index (single lane mode)', () => {
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'Driver Interface' }),
    ];
    const { lastFrame } = render(
      <LaneContainer lanes={lanes} terminalWidth={120} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Epic 10');
    expect(frame).toContain('Driver Interface');
    // Single lane should show Lane 1 index since there's only 1 and it's in side-by-side mode
    // but with only 1 lane, no collapsed lanes
    expect(frame).not.toContain('Lane 2:');
  });

  it('re-evaluates layout when terminalWidth changes', () => {
    // First render at wide width
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'Driver Interface' }),
      makeLane({ epicId: '14', epicTitle: 'Workflow Schema' }),
    ];
    const { lastFrame: frame1 } = render(
      <LaneContainer lanes={lanes} terminalWidth={140} />
    );
    // Should be side-by-side
    expect(frame1()!).toContain('Lane 1:');
    expect(frame1()!).toContain('Lane 2:');

    // Second render at narrow width — separate render call simulates resize
    const { lastFrame: frame2 } = render(
      <LaneContainer lanes={lanes} terminalWidth={60} />
    );
    // Should be single mode — only one full lane (most recently active wins tie-break)
    const f2 = frame2()!;
    // In single mode, the full lane doesn't get a lane index
    // With no lastActivityTime set, tie-break picks the last lane (Epic 14)
    expect(f2).toContain('Epic 14'); // at least one is fully rendered
  });

  it('handles 4 lanes with first 2 full and rest collapsed', () => {
    const lanes = [
      makeLane({ epicId: '10', epicTitle: 'A' }),
      makeLane({ epicId: '11', epicTitle: 'B' }),
      makeLane({ epicId: '12', epicTitle: 'C', currentStory: '12-1', phase: 'verify', cost: 1.00, elapsedTime: 300000 }),
      makeLane({ epicId: '13', epicTitle: 'D', currentStory: '13-2', phase: 'dev', cost: 2.50, elapsedTime: 600000 }),
    ];
    const { lastFrame } = render(
      <LaneContainer lanes={lanes} terminalWidth={140} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Lane 3:');
    expect(frame).toContain('Lane 4:');
    expect(frame).toContain('$1.00');
    expect(frame).toContain('$2.50');
  });
});

describe('CollapsedLanes component', () => {
  it('renders nothing for empty array', () => {
    const { lastFrame } = render(<CollapsedLanes lanes={[]} />);
    expect(lastFrame()).toBe('');
  });

  it('renders collapsed lane format with pipe separators', () => {
    const lanes: CollapsedLaneData[] = [
      {
        laneIndex: 3,
        epicTitle: 'Workflow Schema',
        currentStory: '11-1',
        phase: 'dev',
        cost: 0.40,
        elapsedTime: 120000,
      },
    ];
    const { lastFrame } = render(<CollapsedLanes lanes={lanes} />);
    const frame = lastFrame()!;
    // Format: Lane N: Epic Title │ story ◆ phase │ $cost / time
    expect(frame).toContain('Lane 3:');
    expect(frame).toContain('Workflow Schema');
    expect(frame).toContain('11-1');
    expect(frame).toContain('dev');
    expect(frame).toContain('$0.40');
    expect(frame).toContain('2m');
    // Pipe separators
    expect(frame).toContain('\u2502'); // │ character
  });

  it('renders multiple collapsed lanes', () => {
    const lanes: CollapsedLaneData[] = [
      {
        laneIndex: 3,
        epicTitle: 'Schema',
        currentStory: '11-1',
        phase: 'dev',
        cost: 0.40,
        elapsedTime: 120000,
      },
      {
        laneIndex: 4,
        epicTitle: 'Router',
        currentStory: '12-2',
        phase: 'verify',
        cost: 1.10,
        elapsedTime: 300000,
      },
    ];
    const { lastFrame } = render(<CollapsedLanes lanes={lanes} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Lane 3:');
    expect(frame).toContain('Lane 4:');
    expect(frame).toContain('Schema');
    expect(frame).toContain('Router');
  });

  it('handles null story and phase in collapsed format', () => {
    const lanes: CollapsedLaneData[] = [
      {
        laneIndex: 3,
        epicTitle: 'Test',
        currentStory: null,
        phase: null,
        cost: null,
        elapsedTime: null,
      },
    ];
    const { lastFrame } = render(<CollapsedLanes lanes={lanes} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Lane 3:');
    expect(frame).toContain('Test');
    expect(frame).toContain('--');
  });
});
