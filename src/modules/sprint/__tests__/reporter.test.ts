import { describe, it, expect } from 'vitest';
import { generateReport } from '../reporter.js';
import type { SprintState, StoryState, AcResult } from '../../../types/state.js';

const S_DEFAULTS: StoryState = {
  status: 'backlog', attempts: 0, lastAttempt: null,
  lastError: null, proofPath: null, acResults: null,
};

function s(overrides?: Partial<StoryState>): StoryState {
  return { ...S_DEFAULTS, ...overrides };
}

function makeState(overrides?: Partial<SprintState>): SprintState {
  return {
    version: 1,
    sprint: { total: 0, done: 0, failed: 0, blocked: 0, inProgress: null },
    stories: {},
    run: { active: false, startedAt: null, iteration: 0, cost: 0, completed: [], failed: [] },
    actionItems: [],
    ...overrides,
  };
}

const NOW = new Date('2026-03-18T12:00:00Z');

describe('generateReport', () => {
  it('returns valid report with zero counts for empty state', () => {
    const result = generateReport(makeState(), NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.total).toBe(0);
    expect(result.data.done).toBe(0);
    expect(result.data.failed).toBe(0);
    expect(result.data.blocked).toBe(0);
    expect(result.data.inProgress).toBeNull();
    expect(result.data.storyStatuses).toEqual([]);
    expect(result.data.epicsTotal).toBe(0);
    expect(result.data.epicsDone).toBe(0);
    expect(result.data.sprintPercent).toBe(0);
    expect(result.data.activeRun).toBeNull();
    expect(result.data.lastRun).toBeNull();
    expect(result.data.failedDetails).toEqual([]);
    expect(result.data.actionItemsLabeled).toEqual([]);
  });

  it('includes current story, iteration, cost, elapsed for active run', () => {
    const state = makeState({
      sprint: { total: 3, done: 1, failed: 0, blocked: 0, inProgress: '2-3-status' },
      stories: {
        '2-1-done': s({ status: 'done', attempts: 1 }),
        '2-2-wip': s({ status: 'in-progress', attempts: 2 }),
        '2-3-status': s(),
      },
      run: { active: true, startedAt: '2026-03-18T09:46:00Z', iteration: 7, cost: 23.40, completed: ['2-1-done'], failed: [] },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.activeRun).not.toBeNull();
    expect(result.data.activeRun!.iterations).toBe(7);
    expect(result.data.activeRun!.cost).toBe(23.40);
    expect(result.data.activeRun!.duration).toBe('2h14m');
    expect(result.data.inProgress).toBe('2-3-status');
    expect(result.data.lastRun).toBeNull();
  });

  it('includes done, failed, blocked, skipped counts for completed run', () => {
    const state = makeState({
      sprint: { total: 5, done: 2, failed: 1, blocked: 1, inProgress: null },
      stories: {
        '1-1-a': s({ status: 'done', attempts: 1 }),
        '1-2-b': s({ status: 'done', attempts: 1 }),
        '2-1-c': s({ status: 'failed', attempts: 3, lastError: 'boom', acResults: [{ id: 'AC4', verdict: 'fail' }] }),
        '2-2-d': s({ status: 'blocked', attempts: 10, lastError: 'retry-exhausted' }),
        '3-1-e': s(),
      },
      run: { active: false, startedAt: '2026-03-18T09:46:00Z', iteration: 7, cost: 23.40, completed: ['1-1-a', '1-2-b'], failed: ['2-1-c'] },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.lastRun).not.toBeNull();
    expect(result.data.lastRun!.completed).toEqual(['1-1-a', '1-2-b']);
    expect(result.data.lastRun!.failed).toEqual(['2-1-c']);
    expect(result.data.lastRun!.blocked).toEqual(['2-2-d']);
    expect(result.data.done).toBe(2);
    expect(result.data.failed).toBe(1);
    expect(result.data.blocked).toBe(1);
    expect(result.data.activeRun).toBeNull();
  });

  it('shows story key, AC number, and one-line error for failed stories', () => {
    const acResults: AcResult[] = [{ id: 'AC1', verdict: 'pass' }, { id: 'AC4', verdict: 'fail' }];
    const state = makeState({
      stories: { '2-3-status': s({ status: 'failed', attempts: 3, lastError: 'exit 1', acResults }) },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.failedDetails).toHaveLength(1);
    const fd = result.data.failedDetails[0];
    expect(fd.key).toBe('2-3-status');
    expect(fd.acNumber).toBe(4);
    expect(fd.errorLine).toBe('exit 1');
    expect(fd.attempts).toBe(3);
    expect(fd.maxAttempts).toBe(10);
  });

  it('labels action items as NEW or CARRIED', () => {
    const state = makeState({
      run: { active: false, startedAt: '2026-03-18T09:00:00Z', iteration: 3, cost: 10, completed: ['1-1-a'], failed: ['2-1-b'] },
      actionItems: [
        { id: 'ai-1', story: '1-1-a', description: 'Fix test', source: 'verification', resolved: false },
        { id: 'ai-2', story: '2-1-b', description: 'Edge case', source: 'verification', resolved: false },
        { id: 'ai-3', story: '0-1-old', description: 'Old', source: 'verification', resolved: false },
        { id: 'ai-4', story: '1-1-a', description: 'Note', source: 'manual', resolved: false },
      ],
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const labels = result.data.actionItemsLabeled;
    expect(labels).toHaveLength(4);
    expect(labels[0].label).toBe('NEW');   // verification + in run
    expect(labels[1].label).toBe('NEW');   // verification + in run
    expect(labels[2].label).toBe('CARRIED'); // verification but NOT in run
    expect(labels[3].label).toBe('CARRIED'); // manual source
  });

  it('groups stories by epic prefix and counts completed epics', () => {
    const state = makeState({
      stories: {
        '1-1-a': s({ status: 'done' }), '1-2-b': s({ status: 'done' }),
        '2-1-c': s({ status: 'done' }), '2-2-d': s({ status: 'in-progress' }),
        '3-1-e': s(),
      },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.epicsTotal).toBe(3);
    expect(result.data.epicsDone).toBe(1); // only epic 1 fully done
    expect(result.data.sprintPercent).toBe(60); // 3/5
  });

  it('returns fail() on malformed state (not throw)', () => {
    const result = generateReport(null as unknown as SprintState, NOW);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Failed to generate report');
  });

  it('handles failed story with no acResults gracefully', () => {
    const state = makeState({
      stories: { '1-1-a': s({ status: 'failed', attempts: 2, lastError: 'some error' }) },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.failedDetails).toHaveLength(1);
    expect(result.data.failedDetails[0].acNumber).toBeNull();
    expect(result.data.failedDetails[0].errorLine).toBe('some error');
  });

  it('handles failed story with no lastError', () => {
    const state = makeState({
      stories: { '1-1-a': s({ status: 'failed', attempts: 1 }) },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.failedDetails[0].errorLine).toBe('unknown error');
  });

  it('JSON output includes all fields', () => {
    const state = makeState({
      sprint: { total: 2, done: 1, failed: 0, blocked: 0, inProgress: null },
      stories: { '1-1-a': s({ status: 'done', attempts: 1 }), '2-1-b': s() },
      run: { active: false, startedAt: '2026-03-18T10:00:00Z', iteration: 3, cost: 5.50, completed: ['1-1-a'], failed: [] },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const data = result.data;
    for (const field of ['total', 'done', 'failed', 'blocked', 'inProgress', 'storyStatuses',
      'epicsTotal', 'epicsDone', 'sprintPercent', 'activeRun', 'lastRun', 'failedDetails', 'actionItemsLabeled']) {
      expect(data).toHaveProperty(field);
    }
    const json = JSON.parse(JSON.stringify(data));
    expect(json.total).toBe(2);
    expect(json.done).toBe(1);
    expect(json.lastRun.cost).toBe(5.50);
    expect(json.storyStatuses).toHaveLength(2);
  });

  it('computes duration correctly for short runs', () => {
    const state = makeState({
      run: { active: true, startedAt: '2026-03-18T11:55:00Z', iteration: 1, cost: 0.5, completed: [], failed: [] },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.activeRun!.duration).toBe('5m');
  });

  it('clamps negative elapsed duration to 0m', () => {
    const state = makeState({
      run: { active: true, startedAt: '2026-03-18T13:00:00Z', iteration: 1, cost: 0.5, completed: [], failed: [] },
    });
    // NOW is 12:00, startedAt is 13:00 — clock skew
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.activeRun!.duration).toBe('0m');
  });

  it('returns lastRun as null when no startedAt is set', () => {
    const result = generateReport(makeState(), NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.lastRun).toBeNull();
  });

  it('populates skipped with retry-exhausted blocked stories', () => {
    const state = makeState({
      stories: {
        '1-1-a': s({ status: 'blocked', attempts: 10 }),
        '1-2-b': s({ status: 'blocked', attempts: 3 }),
        '2-1-c': s({ status: 'done', attempts: 1 }),
      },
      run: { active: false, startedAt: '2026-03-18T10:00:00Z', iteration: 5, cost: 10, completed: ['2-1-c'], failed: [] },
    });
    const result = generateReport(state, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.lastRun).not.toBeNull();
    expect(result.data.lastRun!.blocked).toContain('1-1-a');
    expect(result.data.lastRun!.blocked).toContain('1-2-b');
    expect(result.data.lastRun!.skipped).toEqual(['1-1-a']);
    expect(result.data.lastRun!.skipped).not.toContain('1-2-b');
  });
});
