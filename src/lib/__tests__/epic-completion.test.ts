import { describe, it, expect } from 'vitest';

import {
  checkEpicCompletion,
  getEpicStories,
  transitionEpicState,
  EpicCompletionError,
  VALID_TRANSITIONS,
  type EpicLifecycleStatus,
} from '../epic-completion.js';

import {
  buildSprintState,
  buildStoryEntry,
  buildEpicState,
} from './fixtures/state-builders.js';

describe('epic-completion', () => {
  // --- EpicLifecycleStatus type ---

  describe('EpicLifecycleStatus', () => {
    it('includes all six values', () => {
      const allStatuses: EpicLifecycleStatus[] = [
        'in-progress',
        'completing',
        'merging',
        'validating',
        'done',
        'failed',
      ];
      // Compile-time check: if any status is missing from the type, this won't compile.
      // Runtime check: we verify the array has exactly 6 entries.
      expect(allStatuses).toHaveLength(6);
    });
  });

  // --- VALID_TRANSITIONS ---

  describe('VALID_TRANSITIONS', () => {
    it('encodes the correct state machine', () => {
      expect(VALID_TRANSITIONS).toEqual({
        'in-progress': ['completing'],
        'completing': ['merging', 'failed'],
        'merging': ['validating', 'failed'],
        'validating': ['done', 'failed'],
      });
    });

    it('does not allow transitions from done or failed', () => {
      expect(VALID_TRANSITIONS['done']).toBeUndefined();
      expect(VALID_TRANSITIONS['failed']).toBeUndefined();
    });
  });

  // --- getEpicStories ---

  describe('getEpicStories', () => {
    it('filters correctly by epic ID prefix', () => {
      const state = buildSprintState({
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'in-progress' }),
          '20-1-baz': buildStoryEntry({ status: 'backlog' }),
        },
      });

      const result = getEpicStories(state, '19');
      expect(result).toEqual(['19-1-foo', '19-2-bar']);
    });

    it('does not include stories from other epics', () => {
      const state = buildSprintState({
        stories: {
          '19-1-foo': buildStoryEntry(),
          '20-1-baz': buildStoryEntry(),
          '1-1-qux': buildStoryEntry(),
        },
      });

      const result = getEpicStories(state, '19');
      expect(result).not.toContain('20-1-baz');
      expect(result).not.toContain('1-1-qux');
    });

    it('does not match epic 1 against story 19-1-foo', () => {
      const state = buildSprintState({
        stories: {
          '19-1-foo': buildStoryEntry(),
        },
      });

      expect(getEpicStories(state, '1')).toEqual([]);
    });

    it('returns empty array when no stories exist', () => {
      const state = buildSprintState({ stories: {} });
      expect(getEpicStories(state, '19')).toEqual([]);
    });

    it('skips story keys with no dash', () => {
      const state = buildSprintState({
        stories: {
          'orphan': buildStoryEntry(),
          '19-1-foo': buildStoryEntry(),
        },
      });

      expect(getEpicStories(state, '19')).toEqual(['19-1-foo']);
    });
  });

  // --- checkEpicCompletion ---

  describe('checkEpicCompletion', () => {
    it('returns true when all stories are done', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ storiesTotal: 2 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'done' }),
        },
      });

      expect(checkEpicCompletion(state, '19')).toBe(true);
    });

    it('returns false when any story is not done', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ storiesTotal: 2 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'in-progress' }),
        },
      });

      expect(checkEpicCompletion(state, '19')).toBe(false);
    });

    it('returns false for epic with zero stories', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ storiesTotal: 0 }) },
        stories: {},
      });

      expect(checkEpicCompletion(state, '19')).toBe(false);
    });

    it('throws EpicCompletionError for non-existent epic', () => {
      const state = buildSprintState({ epics: {} });

      expect(() => checkEpicCompletion(state, '99')).toThrow(EpicCompletionError);
      expect(() => checkEpicCompletion(state, '99')).toThrow('Epic epic-99 not found in state');
    });
  });

  // --- transitionEpicState ---

  describe('transitionEpicState', () => {
    it('returns updated state with new status', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'in-progress', storiesTotal: 2 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'done' }),
        },
      });

      const result = transitionEpicState(state, '19', 'completing');
      expect(result.epics['epic-19'].status).toBe('completing');
    });

    it('updates storiesDone on completing transition', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'in-progress', storiesTotal: 3, storiesDone: 0 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'done' }),
          '19-3-baz': buildStoryEntry({ status: 'in-progress' }),
        },
      });

      const result = transitionEpicState(state, '19', 'completing');
      expect(result.epics['epic-19'].storiesDone).toBe(2);
    });

    it('does not update storiesDone on non-completing transitions', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'completing', storiesTotal: 2, storiesDone: 2 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
          '19-2-bar': buildStoryEntry({ status: 'done' }),
        },
      });

      const result = transitionEpicState(state, '19', 'merging');
      expect(result.epics['epic-19'].storiesDone).toBe(2);
    });

    it('throws on invalid transition', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'done', storiesTotal: 2 }) },
      });

      expect(() => transitionEpicState(state, '19', 'in-progress')).toThrow(EpicCompletionError);
      expect(() => transitionEpicState(state, '19', 'in-progress')).toThrow(
        'Invalid transition: done → in-progress',
      );
    });

    it('throws for non-existent epic', () => {
      const state = buildSprintState({ epics: {} });

      expect(() => transitionEpicState(state, '99', 'completing')).toThrow(EpicCompletionError);
      expect(() => transitionEpicState(state, '99', 'completing')).toThrow(
        'Epic epic-99 not found in state',
      );
    });

    it('does not mutate the original state', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'in-progress', storiesTotal: 1 }) },
        stories: {
          '19-1-foo': buildStoryEntry({ status: 'done' }),
        },
      });

      const result = transitionEpicState(state, '19', 'completing');
      expect(state.epics['epic-19'].status).toBe('in-progress');
      expect(result.epics['epic-19'].status).toBe('completing');
      expect(state).not.toBe(result);
    });

    it('allows completing → failed transition', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'completing' }) },
      });

      const result = transitionEpicState(state, '19', 'failed');
      expect(result.epics['epic-19'].status).toBe('failed');
    });

    it('allows merging → failed transition', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'merging' }) },
      });

      const result = transitionEpicState(state, '19', 'failed');
      expect(result.epics['epic-19'].status).toBe('failed');
    });

    it('allows validating → failed transition', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'validating' }) },
      });

      const result = transitionEpicState(state, '19', 'failed');
      expect(result.epics['epic-19'].status).toBe('failed');
    });

    it('throws when transitioning from failed (terminal state)', () => {
      const state = buildSprintState({
        epics: { 'epic-19': buildEpicState({ status: 'failed' }) },
      });

      expect(() => transitionEpicState(state, '19', 'in-progress')).toThrow(EpicCompletionError);
      expect(() => transitionEpicState(state, '19', 'in-progress')).toThrow(
        'Invalid transition: failed → in-progress',
      );
    });
  });

  // --- Exports ---

  describe('exports', () => {
    it('exports checkEpicCompletion, getEpicStories, transitionEpicState', () => {
      expect(typeof checkEpicCompletion).toBe('function');
      expect(typeof getEpicStories).toBe('function');
      expect(typeof transitionEpicState).toBe('function');
    });

    it('exports EpicCompletionError class', () => {
      const err = new EpicCompletionError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('EpicCompletionError');
    });

    it('exports VALID_TRANSITIONS', () => {
      expect(typeof VALID_TRANSITIONS).toBe('object');
    });
  });
});
