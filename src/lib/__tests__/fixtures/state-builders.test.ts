import { describe, it, expect } from 'vitest';
import {
  buildSprintState,
  buildStoryEntry,
  buildEpicState,
  buildActionItem,
  buildSprintStateWithStory,
} from './state-builders.js';

describe('buildSprintState', () => {
  it('returns a valid SprintStateV2 with defaults', () => {
    const state = buildSprintState();
    expect(state.version).toBe(2);
    expect(state.sprint.total).toBe(0);
    expect(state.sprint.done).toBe(0);
    expect(state.sprint.failed).toBe(0);
    expect(state.sprint.blocked).toBe(0);
    expect(state.sprint.inProgress).toBeNull();
    expect(state.stories).toEqual({});
    expect(state.retries).toEqual({});
    expect(state.flagged).toEqual([]);
    expect(state.epics).toEqual({});
    expect(state.session.active).toBe(false);
    expect(state.observability.statementCoverage).toBeNull();
    expect(state.run.active).toBe(false);
    expect(state.actionItems).toEqual([]);
  });

  it('applies sprint overrides', () => {
    const state = buildSprintState({ sprint: { total: 5, done: 2, failed: 1, blocked: 0, inProgress: '1-1-test' } });
    expect(state.sprint.total).toBe(5);
    expect(state.sprint.done).toBe(2);
    expect(state.sprint.inProgress).toBe('1-1-test');
  });

  it('applies stories override', () => {
    const story = buildStoryEntry({ status: 'in-progress', attempts: 3 });
    const state = buildSprintState({ stories: { '1-1-test': story } });
    expect(state.stories['1-1-test'].status).toBe('in-progress');
    expect(state.stories['1-1-test'].attempts).toBe(3);
  });

  it('applies session override', () => {
    const state = buildSprintState({ session: { active: true, startedAt: '2026-01-01', iteration: 5, elapsedSeconds: 300 } });
    expect(state.session.active).toBe(true);
    expect(state.session.iteration).toBe(5);
  });

  it('applies run override', () => {
    const state = buildSprintState({ run: { active: true, startedAt: '2026-01-01', iteration: 2, cost: 1.5, completed: ['a'], failed: [], currentStory: 'b', currentPhase: 'dev', lastAction: 'test', acProgress: '3/5' } });
    expect(state.run.active).toBe(true);
    expect(state.run.cost).toBe(1.5);
  });

  it('applies flagged and retries', () => {
    const state = buildSprintState({ flagged: ['s1'], retries: { s1: 3 } });
    expect(state.flagged).toEqual(['s1']);
    expect(state.retries).toEqual({ s1: 3 });
  });
});

describe('buildStoryEntry', () => {
  it('returns default story state', () => {
    const story = buildStoryEntry();
    expect(story.status).toBe('backlog');
    expect(story.attempts).toBe(0);
    expect(story.lastAttempt).toBeNull();
    expect(story.lastError).toBeNull();
    expect(story.proofPath).toBeNull();
    expect(story.acResults).toBeNull();
  });

  it('applies overrides', () => {
    const story = buildStoryEntry({ status: 'done', attempts: 5 });
    expect(story.status).toBe('done');
    expect(story.attempts).toBe(5);
  });
});

describe('buildEpicState', () => {
  it('returns default epic state', () => {
    const epic = buildEpicState();
    expect(epic.status).toBe('in-progress');
    expect(epic.storiesTotal).toBe(0);
    expect(epic.storiesDone).toBe(0);
  });

  it('applies overrides', () => {
    const epic = buildEpicState({ status: 'done', storiesTotal: 10, storiesDone: 10 });
    expect(epic.status).toBe('done');
    expect(epic.storiesTotal).toBe(10);
  });
});

describe('buildActionItem', () => {
  it('returns default action item', () => {
    const item = buildActionItem();
    expect(item.id).toBe('ai-1');
    expect(item.source).toBe('manual');
    expect(item.resolved).toBe(false);
  });

  it('applies overrides', () => {
    const item = buildActionItem({ id: 'custom', source: 'verification', resolved: true });
    expect(item.id).toBe('custom');
    expect(item.source).toBe('verification');
    expect(item.resolved).toBe(true);
  });
});

describe('buildSprintStateWithStory', () => {
  it('creates state with a single story', () => {
    const state = buildSprintStateWithStory('3-3-test', { status: 'verifying', attempts: 2 });
    expect(state.sprint.total).toBe(1);
    expect(state.stories['3-3-test']).toBeDefined();
    expect(state.stories['3-3-test'].status).toBe('verifying');
    expect(state.stories['3-3-test'].attempts).toBe(2);
  });

  it('allows additional state overrides', () => {
    const state = buildSprintStateWithStory('1-1-test', undefined, { flagged: ['1-1-test'] });
    expect(state.stories['1-1-test']).toBeDefined();
    expect(state.flagged).toEqual(['1-1-test']);
  });

  it('defaults story to backlog with 0 attempts', () => {
    const state = buildSprintStateWithStory('x-y-z');
    expect(state.stories['x-y-z'].status).toBe('backlog');
    expect(state.stories['x-y-z'].attempts).toBe(0);
  });
});
