/**
 * Unit tests for multi-lane event routing in ink-renderer.
 *
 * @see Story 20-3: Lane Event Routing & Activity Display
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { startRenderer } from '../ink-renderer.js';
import type { RendererHandle, LaneActivityState } from '../ink-renderer.js';
import type { StreamEvent } from '../agents/stream-parser.js';
import type { LaneEvent } from '../lane-pool.js';
import type { MergeState } from '../ink-merge-status.js';

// --- Helpers ---

function createRenderer(): RendererHandle {
  return startRenderer({ _forceTTY: true });
}

function toolStart(name: string): StreamEvent {
  return { type: 'tool-start', name, id: `tool-${name}` };
}

function toolComplete(): StreamEvent {
  return { type: 'tool-complete' };
}

function textEvent(text: string): StreamEvent {
  return { type: 'text', text };
}

function retryEvent(attempt: number, delay: number): StreamEvent {
  return { type: 'retry', attempt, delay };
}

function resultEvent(cost: number): StreamEvent {
  return { type: 'result', cost, sessionId: 'sess-1' };
}

function laneStarted(epicId: string, laneIndex: number): LaneEvent {
  return { type: 'lane-started', epicId, laneIndex, timestamp: new Date().toISOString() };
}

function laneCompleted(epicId: string, laneIndex: number): LaneEvent {
  return {
    type: 'lane-completed', epicId, laneIndex, timestamp: new Date().toISOString(),
    result: { success: true, tasksCompleted: 3, storiesProcessed: 3, errors: [], durationMs: 60000 },
  };
}

function laneFailed(epicId: string, laneIndex: number, error: string): LaneEvent {
  return { type: 'lane-failed', epicId, laneIndex, timestamp: new Date().toISOString(), error };
}

function epicQueued(epicId: string): LaneEvent {
  return { type: 'epic-queued', epicId, laneIndex: -1, timestamp: new Date().toISOString() };
}

// --- Tests ---

describe('Multi-lane event routing (Task 1, AC #1)', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('routes events with laneId to per-lane state', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.update(toolStart('Read'), 'claude-code', 'epic-10');
    renderer.update(toolComplete(), 'claude-code', 'epic-10');
    renderer.update(textEvent('thinking about files'), 'claude-code', 'epic-10');

    const state = renderer._getState!();
    expect(state.activeLaneId).toBe('epic-10');
    // Should have the tool in completedTools (copied from lane state)
    expect(state.completedTools.length).toBe(1);
    expect(state.completedTools[0].name).toBe('Read');
    expect(state.lastThought).toBe('thinking about files');
  });

  it('single-lane mode (no laneId) behaves identically to pre-20-3 (AC #6)', () => {
    renderer = createRenderer();
    // No laneId — single-lane mode
    renderer.update(toolStart('Read'), 'claude-code');
    renderer.update(toolComplete(), 'claude-code');
    renderer.update(textEvent('single lane thought'));

    const state = renderer._getState!();
    expect(state.activeLaneId).toBeNull();
    expect(state.completedTools.length).toBe(1);
    expect(state.completedTools[0].name).toBe('Read');
    expect(state.lastThought).toBe('single lane thought');
    // laneCount should be 0 in single-lane mode
    expect(state.laneCount).toBe(0);
  });

  it('no lane indicator data when laneCount <= 1 (AC #6)', () => {
    renderer = createRenderer();
    renderer.update(toolStart('Read'), 'claude-code');
    const state = renderer._getState!();
    expect(state.laneCount).toBe(0);
    expect(state.activeLaneId).toBeNull();
  });
});

describe('Activity display shows most recently active lane (Task 4, AC #2, #3)', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('shows events from most recently active lane only (AC #2)', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));

    // Send events to lane 10
    renderer.update(toolStart('Read'), 'claude-code', 'epic-10');
    renderer.update(toolComplete(), 'claude-code', 'epic-10');
    renderer.update(textEvent('lane 10 thought'), 'claude-code', 'epic-10');

    // Send events to lane 14
    renderer.update(toolStart('Write'), 'claude-code', 'epic-14');
    renderer.update(textEvent('lane 14 thought'), 'claude-code', 'epic-14');

    const state = renderer._getState!();
    // Should show lane 14's events (most recently active)
    expect(state.activeLaneId).toBe('epic-14');
    expect(state.activeTool?.name).toBe('Write');
    expect(state.lastThought).toBe('lane 14 thought');
  });

  it('auto-switches to new lane when event arrives from different lane (AC #3)', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));

    // Initially lane 10 is active (first lane started)
    renderer.update(textEvent('lane 10'), 'claude-code', 'epic-10');
    expect(renderer._getState!().activeLaneId).toBe('epic-10');

    // Lane 14 produces an event — should auto-switch
    renderer.update(textEvent('lane 14'), 'claude-code', 'epic-14');
    expect(renderer._getState!().activeLaneId).toBe('epic-14');
    expect(renderer._getState!().lastThought).toBe('lane 14');
  });
});

describe('processLaneEvent (Task 2, AC #7, #8, #9, #10)', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('lane-started creates lane state and sets activeLaneId if first (AC #7)', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));

    const state = renderer._getState!();
    expect(state.activeLaneId).toBe('epic-10');
    expect(state.laneCount).toBe(1);

    const laneStates = renderer._getLaneStates!();
    expect(laneStates.has('epic-10')).toBe(true);
    expect(laneStates.get('epic-10')!.status).toBe('active');
  });

  it('lane-started does not override activeLaneId for subsequent lanes', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));

    const state = renderer._getState!();
    // First lane stays active
    expect(state.activeLaneId).toBe('epic-10');
    expect(state.laneCount).toBe(2);
  });

  it('lane-completed marks lane as completed, updates summaryBar (AC #8, #10)', () => {
    renderer = createRenderer();
    // Set up summaryBar
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: ['epic-10', 'epic-14'],
    };

    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneCompleted('epic-10', 0));

    const laneStates = renderer._getLaneStates!();
    expect(laneStates.get('epic-10')!.status).toBe('completed');

    const state = renderer._getState!();
    // epic-10 should move to doneStories and be removed from pendingEpics
    expect(state.summaryBar!.doneStories).toContain('epic-10');
    expect(state.summaryBar!.pendingEpics).not.toContain('epic-10');
    expect(state.summaryBar!.pendingEpics).toContain('epic-14');
  });

  it('lane-failed marks lane as failed, does not freeze TUI (AC #9)', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));

    // Send some events to epic-10 to make it the displayed lane
    renderer.update(textEvent('working'), 'claude-code', 'epic-10');
    expect(renderer._getState!().activeLaneId).toBe('epic-10');

    // Fail epic-10
    renderer.processLaneEvent(laneFailed('epic-10', 0, 'build failed'));

    const laneStates = renderer._getLaneStates!();
    expect(laneStates.get('epic-10')!.status).toBe('failed');

    // Should auto-switch to next active lane (epic-14)
    const state = renderer._getState!();
    expect(state.activeLaneId).toBe('epic-14');
  });

  it('lane-failed for unknown laneId creates state defensively', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneFailed('epic-unknown', 0, 'crash'));

    const laneStates = renderer._getLaneStates!();
    expect(laneStates.has('epic-unknown')).toBe(true);
    expect(laneStates.get('epic-unknown')!.status).toBe('failed');
  });

  it('epic-queued updates summaryBar pendingEpics', () => {
    renderer = createRenderer();
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: [],
    };

    renderer.processLaneEvent(epicQueued('epic-10'));
    renderer.processLaneEvent(epicQueued('epic-14'));

    const state = renderer._getState!();
    expect(state.summaryBar!.pendingEpics).toEqual(['epic-10', 'epic-14']);
  });

  it('epic-queued does not add duplicates', () => {
    renderer = createRenderer();
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: ['epic-10'],
    };

    renderer.processLaneEvent(epicQueued('epic-10'));

    const state = renderer._getState!();
    expect(state.summaryBar!.pendingEpics).toEqual(['epic-10']);
  });
});

describe('updateMergeState (Task 3, AC #11)', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('updates mergeState on RendererState', () => {
    renderer = createRenderer();
    const mergeState: MergeState = {
      epicId: 'epic-10',
      outcome: 'clean',
      conflictCount: 0,
    };

    renderer.updateMergeState(mergeState);

    const state = renderer._getState!();
    expect(state.mergeState).toEqual(mergeState);
  });

  it('updates summaryBar mergingEpic', () => {
    renderer = createRenderer();
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: ['epic-10'],
    };

    renderer.updateMergeState({
      epicId: 'epic-10',
      outcome: 'in-progress',
    });

    const state = renderer._getState!();
    expect(state.summaryBar!.mergingEpic).toEqual({
      epicId: 'epic-10',
      status: 'in-progress',
      conflictCount: undefined,
    });
  });

  it('sets mergingEpic status to complete for clean merges', () => {
    renderer = createRenderer();
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: [],
    };

    renderer.updateMergeState({
      epicId: 'epic-10',
      outcome: 'clean',
      conflictCount: 0,
    });

    const state = renderer._getState!();
    expect(state.summaryBar!.mergingEpic!.status).toBe('complete');
  });

  it('sets mergingEpic status to complete for resolved merges', () => {
    renderer = createRenderer();
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: [],
    };

    renderer.updateMergeState({
      epicId: 'epic-10',
      outcome: 'resolved',
      conflictCount: 3,
      conflicts: ['file1.ts', 'file2.ts', 'file3.ts'],
    });

    const state = renderer._getState!();
    expect(state.summaryBar!.mergingEpic!.status).toBe('complete');
    expect(state.summaryBar!.mergingEpic!.conflictCount).toBe(3);
  });

  it('clears mergeState when null is passed', () => {
    renderer = createRenderer();
    renderer.updateMergeState({ epicId: 'epic-10', outcome: 'clean' });
    expect(renderer._getState!().mergeState).toBeTruthy();

    renderer.updateMergeState(null);
    expect(renderer._getState!().mergeState).toBeNull();
  });

  it('clears summaryBar.mergingEpic when mergeState set to null', () => {
    renderer = createRenderer();
    renderer._getState!().summaryBar = {
      doneStories: [],
      mergingEpic: null,
      pendingEpics: [],
    };

    renderer.updateMergeState({ epicId: 'epic-10', outcome: 'in-progress' });
    expect(renderer._getState!().summaryBar!.mergingEpic).toBeTruthy();

    renderer.updateMergeState(null);
    expect(renderer._getState!().summaryBar!.mergingEpic).toBeNull();
  });
});

describe('Ctrl+L cycling and pinned lane (Task 5, AC #4)', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('cycleLane cycles to next active lane', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));

    expect(renderer._getState!().activeLaneId).toBe('epic-10');

    renderer._cycleLane!();
    expect(renderer._getState!().activeLaneId).toBe('epic-14');

    renderer._cycleLane!();
    expect(renderer._getState!().activeLaneId).toBe('epic-10'); // wraps around
  });

  it('cycleLane is a no-op with only 1 active lane', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));

    renderer._cycleLane!();
    expect(renderer._getState!().activeLaneId).toBe('epic-10');
  });

  it('pinned lane suppresses auto-switch until new lane event from different lane (AC #4)', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));

    // Send event to epic-10 to make it active
    renderer.update(textEvent('working'), 'claude-code', 'epic-10');
    expect(renderer._getState!().activeLaneId).toBe('epic-10');

    // Cycle to epic-14 (pins it)
    renderer._cycleLane!();
    expect(renderer._getState!().activeLaneId).toBe('epic-14');

    // Event from epic-10 should NOT auto-switch (pinned)
    renderer.update(textEvent('still working'), 'claude-code', 'epic-10');
    expect(renderer._getState!().activeLaneId).toBe('epic-14');

    // But the pin should now be reset (event from different lane arrived)
    // Next event from epic-10 SHOULD auto-switch
    renderer.update(textEvent('more work'), 'claude-code', 'epic-10');
    expect(renderer._getState!().activeLaneId).toBe('epic-10');
  });

  it('cycleLane skips completed/failed lanes', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.processLaneEvent(laneStarted('epic-14', 1));
    renderer.processLaneEvent(laneStarted('epic-18', 2));

    // Complete epic-14
    renderer.processLaneEvent(laneCompleted('epic-14', 1));

    // Cycling from epic-10 should skip completed epic-14 and go to epic-18
    renderer._cycleLane!();
    expect(renderer._getState!().activeLaneId).toBe('epic-18');
  });
});

describe('Lane routing with retry events', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('routes retry events to per-lane state', () => {
    renderer = createRenderer();
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.update(retryEvent(2, 5000), 'claude-code', 'epic-10');

    const state = renderer._getState!();
    expect(state.retryInfo).toEqual({ attempt: 2, delay: 5000 });
  });
});

describe('Per-lane cost tracking', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('accumulates result costs from lane events', () => {
    renderer = createRenderer();
    renderer.updateSprintState({
      storyKey: '10-1',
      phase: 'dev',
      done: 0,
      total: 5,
    });
    renderer.processLaneEvent(laneStarted('epic-10', 0));
    renderer.update(resultEvent(1.50), 'claude-code', 'epic-10');

    const state = renderer._getState!();
    expect(state.sprintInfo!.totalCost).toBe(1.50);
    expect(state.driverCosts['claude-code']).toBe(1.50);
  });
});

describe('Performance (Task 11, AC #12)', () => {
  let renderer: RendererHandle;

  afterEach(() => {
    renderer?.cleanup();
  });

  it('routing 4 lanes of events completes within acceptable time', () => {
    renderer = createRenderer();

    // Set up 4 lanes
    for (let i = 0; i < 4; i++) {
      renderer.processLaneEvent(laneStarted(`epic-${i}`, i));
    }

    const start = performance.now();
    const eventCount = 100;

    // Send 100 events across 4 lanes
    for (let i = 0; i < eventCount; i++) {
      const laneId = `epic-${i % 4}`;
      renderer.update(toolStart(`Tool${i}`), 'codex', laneId);
      renderer.update(toolComplete(), 'codex', laneId);
    }

    const elapsed = performance.now() - start;
    // Total time for 200 events should be under 10 seconds
    // (50ms per event is very generous — actual overhead is <1ms per event,
    // but Ink re-rendering adds latency in test environment)
    expect(elapsed).toBeLessThan(10000);
  });
});
