import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SummaryBar } from '../ink-summary-bar.js';
import type { SummaryBarProps, MergingEpicInfo, CompletedLaneInfo } from '../ink-summary-bar.js';

function makeProps(overrides?: Partial<SummaryBarProps>): SummaryBarProps {
  return {
    doneStories: [],
    mergingEpic: null,
    pendingEpics: [],
    ...overrides,
  };
}

describe('SummaryBar component', () => {
  it('exports SummaryBar as a function component', () => {
    expect(SummaryBar).toBeDefined();
    expect(typeof SummaryBar).toBe('function');
  });

  it('renders done stories with checkmark symbols', () => {
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ doneStories: ['10-1', '10-2', '10-3'] })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Done:');
    expect(frame).toContain('10-1 \u2713');
    expect(frame).toContain('10-2 \u2713');
    expect(frame).toContain('10-3 \u2713');
  });

  it('renders "Merging: \u2014" when no merge active', () => {
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ mergingEpic: null })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Merging:');
    expect(frame).toContain('\u2014');
  });

  it('renders merging epic with spinner when in-progress', () => {
    const mergingEpic: MergingEpicInfo = {
      epicId: 'epic-14',
      status: 'in-progress',
    };
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ mergingEpic })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Merging:');
    expect(frame).toContain('epic-14');
    expect(frame).toContain('\u2192 main');
    expect(frame).toContain('\u25CC'); // spinner indicator
  });

  it('renders resolving merge with conflict count', () => {
    const mergingEpic: MergingEpicInfo = {
      epicId: 'epic-11',
      status: 'resolving',
      conflictCount: 1,
    };
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ mergingEpic })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('epic-11');
    expect(frame).toContain('\u2192 main');
    expect(frame).toContain('resolving 1 conflict');
    expect(frame).toContain('\u25CC');
  });

  it('renders resolving merge with plural conflicts', () => {
    const mergingEpic: MergingEpicInfo = {
      epicId: 'epic-11',
      status: 'resolving',
      conflictCount: 3,
    };
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ mergingEpic })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('resolving 3 conflicts');
  });

  it('renders pending epics list', () => {
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ pendingEpics: ['epic-12', 'epic-13'] })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Pending:');
    expect(frame).toContain('epic-12, epic-13');
  });

  it('renders lane completion line', () => {
    const completedLanes: CompletedLaneInfo[] = [{
      laneIndex: 2,
      epicId: '14',
      storyCount: 3,
      cost: 4.80,
      elapsed: '22m',
    }];
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ completedLanes })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Lane 2: Epic 14 complete (3 stories, $4.80, 22m)');
  });

  it('handles empty done stories with em-dash fallback', () => {
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ doneStories: [] })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Done: \u2014');
  });

  it('handles empty pending epics with em-dash fallback', () => {
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ pendingEpics: [] })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Pending: \u2014');
  });

  it('exports correct types', () => {
    // Type-level check: ensure interfaces are importable and usable
    const props: SummaryBarProps = {
      doneStories: ['10-1'],
      mergingEpic: { epicId: 'epic-14', status: 'in-progress' },
      pendingEpics: ['epic-12'],
      completedLanes: [{ laneIndex: 1, epicId: '10', storyCount: 3, cost: 4.80, elapsed: '22m' }],
    };
    expect(props.doneStories).toHaveLength(1);
    expect(props.mergingEpic).not.toBeNull();
    expect(props.pendingEpics).toHaveLength(1);
    expect(props.completedLanes).toHaveLength(1);
  });

  it('renders complete merge status with green checkmark', () => {
    const mergingEpic: MergingEpicInfo = {
      epicId: 'epic-14',
      status: 'complete',
    };
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ mergingEpic })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('epic-14');
    expect(frame).toContain('\u2192 main');
    expect(frame).toContain('\u2713');
  });

  it('renders full summary with all sections populated', () => {
    const { lastFrame } = render(
      <SummaryBar {...makeProps({
        doneStories: ['10-1', '10-2', '14-1'],
        mergingEpic: { epicId: 'epic-14', status: 'in-progress' },
        pendingEpics: ['epic-11', 'epic-12'],
      })} />
    );
    const frame = lastFrame()!;
    // All three sections visible with pipe separators
    expect(frame).toContain('Done:');
    expect(frame).toContain('\u2502');
    expect(frame).toContain('Merging:');
    expect(frame).toContain('Pending:');
  });

  it('renders multiple lane completion lines', () => {
    const completedLanes: CompletedLaneInfo[] = [
      { laneIndex: 1, epicId: '10', storyCount: 3, cost: 4.80, elapsed: '22m' },
      { laneIndex: 2, epicId: '14', storyCount: 2, cost: 3.10, elapsed: '15m' },
    ];
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ completedLanes })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('[OK] Lane 1: Epic 10 complete');
    expect(frame).toContain('[OK] Lane 2: Epic 14 complete');
  });

  it('renders resolving merge without conflict count (omits parenthetical)', () => {
    const mergingEpic: MergingEpicInfo = {
      epicId: 'epic-11',
      status: 'resolving',
    };
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ mergingEpic })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('epic-11');
    expect(frame).toContain('\u2192 main');
    expect(frame).toContain('\u25CC');
    expect(frame).not.toContain('resolving');
  });

  it('renders $0.00 for zero cost in lane completion', () => {
    const completedLanes: CompletedLaneInfo[] = [{
      laneIndex: 1,
      epicId: '10',
      storyCount: 1,
      cost: 0,
      elapsed: '1m',
    }];
    const { lastFrame } = render(
      <SummaryBar {...makeProps({ completedLanes })} />
    );
    const frame = lastFrame()!;
    expect(frame).toContain('$0.00');
  });
});
