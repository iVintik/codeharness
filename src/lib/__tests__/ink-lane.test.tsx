import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Lane, formatLaneCost, formatLaneElapsed } from '../ink-lane.js';
import type { LaneProps, StoryProgressEntry } from '../ink-lane.js';

function makeLaneProps(overrides?: Partial<LaneProps>): LaneProps {
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
      { key: '10-4', status: 'pending' },
      { key: '10-5', status: 'pending' },
    ],
    driver: 'claude-code',
    cost: 4.20,
    elapsedTime: 1080000, // 18m
    ...overrides,
  };
}

describe('Lane component', () => {
  it('renders epic title', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps()} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Epic 10');
    expect(frame).toContain('Driver Interface');
  });

  it('renders current story and phase', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps()} />);
    const frame = lastFrame()!;
    expect(frame).toContain('10-3');
    expect(frame).toContain('dev');
  });

  it('renders AC progress', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps()} />);
    const frame = lastFrame()!;
    expect(frame).toContain('AC 4/9');
  });

  it('renders story progress bar with correct symbols', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps()} />);
    const frame = lastFrame()!;
    // Done stories get ✓
    expect(frame).toContain('✓ 10-1');
    expect(frame).toContain('✓ 10-2');
    // In-progress gets ◆
    expect(frame).toContain('◆ 10-3');
    // Pending gets ○
    expect(frame).toContain('○ 10-4');
    expect(frame).toContain('○ 10-5');
  });

  it('renders driver name, cost, and elapsed time', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps()} />);
    const frame = lastFrame()!;
    expect(frame).toContain('claude-code');
    expect(frame).toContain('$4.20');
    expect(frame).toContain('18m');
  });

  it('renders lane index when provided', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps({ laneIndex: 1 })} />);
    const frame = lastFrame()!;
    expect(frame).toContain('Lane 1:');
  });

  it('omits lane index when not provided', () => {
    const { lastFrame } = render(<Lane {...makeLaneProps()} />);
    const frame = lastFrame()!;
    expect(frame).not.toContain('Lane ');
  });

  it('handles null currentStory and phase gracefully', () => {
    const { lastFrame } = render(
      <Lane {...makeLaneProps({ currentStory: null, phase: null, acProgress: null })} />
    );
    const frame = lastFrame()!;
    // Should still render epic title
    expect(frame).toContain('Epic 10');
    expect(frame).toContain('Driver Interface');
  });

  it('handles null cost and elapsedTime', () => {
    const { lastFrame } = render(
      <Lane {...makeLaneProps({ cost: null, elapsedTime: null })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('--');
  });

  it('handles zero cost', () => {
    const { lastFrame } = render(
      <Lane {...makeLaneProps({ cost: 0 })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$0.00');
  });

  it('handles empty story progress entries', () => {
    const { lastFrame } = render(
      <Lane {...makeLaneProps({ storyProgressEntries: [] })} />
    );
    const frame = lastFrame()!;
    // Should not crash, should still show title
    expect(frame).toContain('Epic 10');
  });

  it('exports Lane component and type interfaces', () => {
    // Verify exports exist
    expect(Lane).toBeDefined();
    expect(typeof Lane).toBe('function');
  });
});

describe('formatLaneCost', () => {
  it('formats positive cost as $X.XX', () => {
    expect(formatLaneCost(4.20)).toBe('$4.20');
    expect(formatLaneCost(0)).toBe('$0.00');
    expect(formatLaneCost(12.345)).toBe('$12.35');
  });

  it('returns -- for null', () => {
    expect(formatLaneCost(null)).toBe('--');
  });
});

describe('formatLaneElapsed', () => {
  it('formats seconds < 60 as Xs', () => {
    expect(formatLaneElapsed(5000)).toBe('5s');
    expect(formatLaneElapsed(45000)).toBe('45s');
  });

  it('formats minutes < 60 as Xm', () => {
    expect(formatLaneElapsed(60000)).toBe('1m');
    expect(formatLaneElapsed(1080000)).toBe('18m');
  });

  it('formats >= 60 minutes as Xh Xm', () => {
    expect(formatLaneElapsed(3600000)).toBe('1h 0m');
    expect(formatLaneElapsed(4320000)).toBe('1h 12m');
    expect(formatLaneElapsed(7200000)).toBe('2h 0m');
  });

  it('returns -- for null', () => {
    expect(formatLaneElapsed(null)).toBe('--');
  });

  it('returns 0s for 0ms', () => {
    expect(formatLaneElapsed(0)).toBe('0s');
  });
});
