import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Header } from '../ink-components.js';
import type { SprintInfo } from '../ink-components.js';

function makeSprintInfo(overrides?: Partial<SprintInfo>): SprintInfo {
  return {
    storyKey: '10-3',
    phase: 'dev',
    done: 2,
    total: 5,
    elapsed: '18m',
    iterationCount: 3,
    totalCost: 4.20,
    ...overrides,
  };
}

describe('Header component', () => {
  it('returns null when info is null', () => {
    const { lastFrame } = render(<Header info={null} />);
    expect(lastFrame()).toBe('');
  });

  it('renders basic header without lane count', () => {
    const { lastFrame } = render(<Header info={makeSprintInfo()} />);
    const frame = lastFrame()!;
    expect(frame).toContain('codeharness run');
    expect(frame).toContain('18m elapsed');
    expect(frame).toContain('$4.20 spent');
    expect(frame).not.toContain('lanes');
  });

  it('shows lane count when laneCount > 1', () => {
    const { lastFrame } = render(
      <Header info={makeSprintInfo()} laneCount={2} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('2 lanes');
  });

  it('shows lane count of 3 when laneCount is 3', () => {
    const { lastFrame } = render(
      <Header info={makeSprintInfo()} laneCount={3} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('3 lanes');
  });

  it('omits lane count when laneCount is 1', () => {
    const { lastFrame } = render(
      <Header info={makeSprintInfo()} laneCount={1} />
    );
    const frame = lastFrame()!;
    expect(frame).not.toContain('lanes');
  });

  it('omits lane count when laneCount is undefined', () => {
    const { lastFrame } = render(
      <Header info={makeSprintInfo()} />
    );
    const frame = lastFrame()!;
    expect(frame).not.toContain('lanes');
  });

  it('shows total cost across lanes when in multi-lane mode', () => {
    const info = makeSprintInfo({ laneTotalCost: 18.60, totalCost: 4.20 });
    const { lastFrame } = render(
      <Header info={info} laneCount={2} />
    );
    const frame = lastFrame()!;
    // In multi-lane mode, laneTotalCost should be displayed instead of totalCost
    expect(frame).toContain('$18.60 spent');
    expect(frame).not.toContain('$4.20');
  });

  it('falls back to totalCost when laneTotalCost is not set in multi-lane mode', () => {
    const info = makeSprintInfo({ totalCost: 4.20 });
    const { lastFrame } = render(
      <Header info={info} laneCount={2} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$4.20 spent');
  });

  it('shows single-lane totalCost when laneCount is 1', () => {
    const info = makeSprintInfo({ totalCost: 5.50, laneTotalCost: 10.00 });
    const { lastFrame } = render(
      <Header info={info} laneCount={1} />
    );
    const frame = lastFrame()!;
    // When laneCount is 1 (not multi-lane), should use totalCost
    expect(frame).toContain('$5.50 spent');
  });

  it('renders header format with pipes between parts', () => {
    const info = makeSprintInfo();
    const { lastFrame } = render(
      <Header info={info} laneCount={2} />
    );
    const frame = lastFrame()!;
    // Format: codeharness run | 2 lanes | 18m elapsed | $X.XX spent  [q to quit]
    expect(frame).toContain('codeharness run | 2 lanes');
    // Iteration is no longer shown in header
    expect(frame).not.toContain('iteration');
  });

  it('does not render story key line (moved to StoryContext)', () => {
    const { lastFrame } = render(
      <Header info={makeSprintInfo({ storyKey: '14-2' })} />
    );
    const frame = lastFrame()!;
    // Story/Phase moved to StoryContext component
    expect(frame).not.toContain('Story:');
  });

  it('does not render phase and AC progress (moved to StoryContext)', () => {
    const info = makeSprintInfo({ phase: 'verify', acProgress: '7/9' });
    const { lastFrame } = render(<Header info={info} />);
    const frame = lastFrame()!;
    expect(frame).not.toContain('Phase:');
    expect(frame).not.toContain('AC 7/9');
  });
});
