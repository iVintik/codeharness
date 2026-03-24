import { describe, it, expect } from 'vitest';
import { selectNextStory, MAX_STORY_ATTEMPTS } from '../selector.js';
import type { SprintState, StoryState } from '../../../types/state.js';
import { buildSprintState, buildStoryEntry } from '../../../lib/__tests__/helpers.js';

/** Helper: build a SprintState with given partial stories */
function makeState(
  stories: Record<string, Partial<StoryState>>,
): SprintState {
  const full: Record<string, StoryState> = {};
  for (const [key, partial] of Object.entries(stories)) {
    full[key] = buildStoryEntry(partial);
  }
  return buildSprintState({ stories: full });
}

/** Helper: build a bad state that throws on stories access */
function makeBadState(throwValue: unknown): SprintState {
  const base = buildSprintState();
  return {
    ...base,
    get stories() { throw throwValue; },
  } as unknown as SprintState;
}

describe('selectNextStory', () => {
  it('returns ok with null selected when stories map is empty', () => {
    const result = selectNextStory(makeState({}));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected).toBeNull();
      expect(result.data.retryExhausted).toEqual([]);
    }
  });

  it('returns ok with null selected when all stories are terminal', () => {
    const state = makeState({
      'story-a': { status: 'done' },
      'story-b': { status: 'failed' },
      'story-c': { status: 'blocked' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected).toBeNull();
      expect(result.data.retryExhausted).toEqual([]);
    }
  });

  it('reports retry-exhausted stories in retryExhausted array', () => {
    const state = makeState({
      'story-a': { status: 'backlog', attempts: 10 },
      'story-b': { status: 'backlog', attempts: 15 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected).toBeNull();
      expect(result.data.retryExhausted).toHaveLength(2);
      const keys = result.data.retryExhausted.map((r) => r.key).sort();
      expect(keys).toEqual(['story-a', 'story-b']);
      for (const info of result.data.retryExhausted) {
        expect(info.reason).toBe('retry-exhausted');
      }
    }
  });

  it('retry-exhausted stories report correct attempt counts', () => {
    const state = makeState({ 'story-x': { status: 'verifying', attempts: 12 } });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retryExhausted).toHaveLength(1);
      expect(result.data.retryExhausted[0]).toEqual({
        key: 'story-x', attempts: 12, reason: 'retry-exhausted',
      });
    }
  });

  it('does not report terminal stories as retry-exhausted even with high attempts', () => {
    const state = makeState({
      'story-done': { status: 'done', attempts: 15 },
      'story-failed': { status: 'failed', attempts: 20 },
      'story-blocked': { status: 'blocked', attempts: 10 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected).toBeNull();
      expect(result.data.retryExhausted).toEqual([]);
    }
  });

  it('returns in-progress story before all others', () => {
    const state = makeState({
      'story-backlog': { status: 'backlog' },
      'story-verifying': { status: 'verifying' },
      'story-current': { status: 'in-progress', attempts: 3 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-current');
      expect(result.data.selected!.priority).toBe(0);
    }
  });

  it('returns verifying-with-proof before plain verifying', () => {
    const state = makeState({
      'story-no-proof': { status: 'verifying', proofPath: null },
      'story-has-proof': { status: 'verifying', proofPath: 'docs/proof.md' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-has-proof');
      expect(result.data.selected!.priority).toBe(1);
    }
  });

  it('returns verifying before backlog', () => {
    const state = makeState({
      'story-backlog': { status: 'backlog' },
      'story-verifying': { status: 'verifying' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-verifying');
      expect(result.data.selected!.priority).toBe(2);
    }
  });

  it('full priority ordering: in-progress > proof > verifying > backlog', () => {
    const state = makeState({
      'story-backlog': { status: 'backlog' },
      'story-verifying': { status: 'verifying' },
      'story-proof': { status: 'verifying', proofPath: 'proof.md' },
      'story-active': { status: 'in-progress' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-active');
      expect(result.data.selected!.priority).toBe(0);
    }
  });

  it('same-tier tiebreak: fewer attempts first', () => {
    const state = makeState({
      'story-a': { status: 'backlog', attempts: 5 },
      'story-b': { status: 'backlog', attempts: 2 },
      'story-c': { status: 'backlog', attempts: 8 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.key).toBe('story-b');
  });

  it('same-tier same-attempts tiebreak: lexicographic key order', () => {
    const state = makeState({
      'story-charlie': { status: 'backlog', attempts: 0 },
      'story-alpha': { status: 'backlog', attempts: 0 },
      'story-bravo': { status: 'backlog', attempts: 0 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.key).toBe('story-alpha');
  });

  it('cross-epic selection: considers stories from all epics equally', () => {
    const state = makeState({
      'epic-2-story-a': { status: 'backlog', attempts: 3 },
      'epic-3-story-b': { status: 'backlog', attempts: 1 },
      'epic-2-story-c': { status: 'verifying' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.key).toBe('epic-2-story-c');
  });

  it.each([
    ['done', 'done' as const],
    ['failed', 'failed' as const],
    ['blocked', 'blocked' as const],
  ])('excludes %s stories from selection', (_label, status) => {
    const state = makeState({
      'story-terminal': { status },
      'story-backlog': { status: 'backlog' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.key).toBe('story-backlog');
  });

  it('selects story with attempts < 10 but reports one with attempts >= 10', () => {
    const state = makeState({
      'story-exhausted': { status: 'backlog', attempts: 10 },
      'story-ok': { status: 'backlog', attempts: 9 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-ok');
      expect(result.data.retryExhausted).toHaveLength(1);
      expect(result.data.retryExhausted[0].key).toBe('story-exhausted');
    }
  });

  it('populates title from key', () => {
    const state = makeState({ 'my-cool-story': { status: 'backlog' } });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.title).toBe('My cool story');
  });

  it('handles empty key in title generation', () => {
    const state = makeState({ '': { status: 'backlog' } });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.title).toBe('');
  });

  it('returns fail() on Error throw', () => {
    const result = selectNextStory(makeBadState(new Error('corrupt state')));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Story selection failed');
      expect(result.error).toContain('corrupt state');
    }
  });

  it('returns fail() on non-Error throw', () => {
    const result = selectNextStory(makeBadState('string error'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('string error');
  });

  it('handles ready and review statuses as backlog-tier', () => {
    const state = makeState({
      'story-ready': { status: 'ready' },
      'story-review': { status: 'review', attempts: 1 },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-ready');
      expect(result.data.selected!.priority).toBe(3);
    }
  });

  it('MAX_STORY_ATTEMPTS is 10', () => {
    expect(MAX_STORY_ATTEMPTS).toBe(10);
  });

  // Tech Debt Gate — Decision 6c: TD- prefixed stories prioritized within backlog tier
  type S = Record<string, Partial<StoryState>>;
  it.each<[string, S, string]>([
    ['TD backlog before feature', { 'TD-1-fix': { status: 'backlog' }, '15-1-ci': { status: 'backlog' } }, 'TD-1-fix'],
    ['all TD done, normal resumes', { 'TD-1-fix': { status: 'done' }, 'TD-2-log': { status: 'done' }, '15-1-ci': { status: 'backlog' } }, '15-1-ci'],
    ['in-progress non-TD beats TD backlog', { 'TD-1-fix': { status: 'backlog' }, '15-1-ci': { status: 'in-progress' } }, '15-1-ci'],
    ['verifying non-TD beats TD backlog', { 'TD-1-fix': { status: 'backlog' }, '15-1-ci': { status: 'verifying' } }, '15-1-ci'],
    ['no TD, normal lex order', { '15-2-eslint': { status: 'backlog' }, '15-1-ci': { status: 'backlog' } }, '15-1-ci'],
    ['TD in-progress = Tier A', { 'TD-1-fix': { status: 'in-progress' }, '15-1-ci': { status: 'backlog' } }, 'TD-1-fix'],
    ['TD fewer attempts wins', { 'TD-1-fix': { status: 'backlog', attempts: 3 }, 'TD-2-log': { status: 'backlog', attempts: 1 } }, 'TD-2-log'],
    ['TD gate applies to ready', { 'TD-1-fix': { status: 'ready' }, '15-1-ci': { status: 'ready' } }, 'TD-1-fix'],
    ['lowercase td- not treated as TD', { 'td-1-fix': { status: 'backlog' }, '15-1-ci': { status: 'backlog' } }, '15-1-ci'],
  ])('TD gate: %s', (_label, stories, expectedKey) => {
    const result = selectNextStory(makeState(stories));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.selected!.key).toBe(expectedKey);
  });

  it('mixed scenario: selects actionable and reports exhausted', () => {
    const state = makeState({
      'story-done': { status: 'done' },
      'story-exhausted-1': { status: 'in-progress', attempts: 10 },
      'story-exhausted-2': { status: 'backlog', attempts: 11 },
      'story-good': { status: 'verifying', proofPath: 'p.md' },
      'story-blocked': { status: 'blocked' },
    });
    const result = selectNextStory(state);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.selected!.key).toBe('story-good');
      expect(result.data.selected!.priority).toBe(1);
      expect(result.data.retryExhausted).toHaveLength(2);
      const exhaustedKeys = result.data.retryExhausted.map((r) => r.key).sort();
      expect(exhaustedKeys).toEqual(['story-exhausted-1', 'story-exhausted-2']);
    }
  });
});
