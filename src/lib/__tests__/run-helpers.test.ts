import { describe, it, expect } from 'vitest';
import {
  formatElapsed,
  mapSprintStatus,
  mapSprintStatuses,
  parseRalphMessage,
  parseIterationMessage,
  countStories,
  buildSpawnArgs,
} from '../run-helpers.js';

describe('formatElapsed', () => {
  it('formats 0ms as "0m"', () => {
    expect(formatElapsed(0)).toBe('0m');
  });

  it('formats sub-minute as "0m"', () => {
    expect(formatElapsed(30_000)).toBe('0m');
  });

  it('formats 1 minute', () => {
    expect(formatElapsed(60_000)).toBe('1m');
  });

  it('formats 47 minutes', () => {
    expect(formatElapsed(47 * 60_000)).toBe('47m');
  });

  it('formats 60 minutes as "1h0m"', () => {
    expect(formatElapsed(60 * 60_000)).toBe('1h0m');
  });

  it('formats 2h14m', () => {
    expect(formatElapsed((2 * 60 + 14) * 60_000)).toBe('2h14m');
  });

  it('handles negative values as "0m"', () => {
    expect(formatElapsed(-5000)).toBe('0m');
  });

  it('truncates fractional minutes (rounds down)', () => {
    // 1m 59s → still 1m
    expect(formatElapsed(119_000)).toBe('1m');
  });
});

describe('mapSprintStatus', () => {
  it('maps done to done', () => {
    expect(mapSprintStatus('done')).toBe('done');
  });

  it('maps in-progress to in-progress', () => {
    expect(mapSprintStatus('in-progress')).toBe('in-progress');
  });

  it('maps review to in-progress', () => {
    expect(mapSprintStatus('review')).toBe('in-progress');
  });

  it('maps verifying to in-progress', () => {
    expect(mapSprintStatus('verifying')).toBe('in-progress');
  });

  it('maps backlog to pending', () => {
    expect(mapSprintStatus('backlog')).toBe('pending');
  });

  it('maps ready-for-dev to pending', () => {
    expect(mapSprintStatus('ready-for-dev')).toBe('pending');
  });

  it('maps failed to failed', () => {
    expect(mapSprintStatus('failed')).toBe('failed');
  });

  it('maps blocked to blocked', () => {
    expect(mapSprintStatus('blocked')).toBe('blocked');
  });

  it('maps exhausted to blocked', () => {
    expect(mapSprintStatus('exhausted')).toBe('blocked');
  });

  it('maps unknown statuses to pending', () => {
    expect(mapSprintStatus('some-unknown')).toBe('pending');
  });
});

describe('mapSprintStatuses', () => {
  it('converts sprint-status entries to StoryStatusEntry[]', () => {
    const entries = mapSprintStatuses({
      'epic-1': 'done',
      '1-1-story-a': 'done',
      '1-2-story-b': 'in-progress',
      '1-3-story-c': 'backlog',
      'epic-1-retrospective': 'optional',
    });
    expect(entries).toEqual([
      { key: '1-1-story-a', status: 'done' },
      { key: '1-2-story-b', status: 'in-progress' },
      { key: '1-3-story-c', status: 'pending' },
    ]);
  });

  it('filters out epic keys and optional entries', () => {
    const entries = mapSprintStatuses({
      'epic-5': 'in-progress',
      '5-1-foo': 'review',
      'epic-5-retrospective': 'optional',
    });
    expect(entries).toEqual([
      { key: '5-1-foo', status: 'in-progress' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(mapSprintStatuses({})).toEqual([]);
  });

  it('handles all status types', () => {
    const entries = mapSprintStatuses({
      '1-1-a': 'done',
      '1-2-b': 'failed',
      '1-3-c': 'blocked',
      '1-4-d': 'exhausted',
      '1-5-e': 'verifying',
    });
    expect(entries).toEqual([
      { key: '1-1-a', status: 'done' },
      { key: '1-2-b', status: 'failed' },
      { key: '1-3-c', status: 'blocked' },
      { key: '1-4-d', status: 'blocked' },
      { key: '1-5-e', status: 'in-progress' },
    ]);
  });
});

describe('parseRalphMessage', () => {
  it('parses [SUCCESS] Story completion', () => {
    const msg = parseRalphMessage('[SUCCESS] Story 1-1-foo: DONE — title here');
    expect(msg).toEqual({
      type: 'ok',
      key: '1-1-foo',
      message: 'DONE — title here',
    });
  });

  it('parses [SUCCESS] Story completion without details', () => {
    const msg = parseRalphMessage('[SUCCESS] Story 2-3-bar: DONE');
    expect(msg).toEqual({
      type: 'ok',
      key: '2-3-bar',
      message: 'DONE',
    });
  });

  it('parses [SUCCESS] with timestamp prefix', () => {
    const msg = parseRalphMessage('[2025-01-15 10:30:45] [SUCCESS] Story 1-1-foo: DONE — verified');
    expect(msg).toEqual({
      type: 'ok',
      key: '1-1-foo',
      message: 'DONE — verified',
    });
  });

  it('parses [WARN] retry exceeded', () => {
    const msg = parseRalphMessage('[WARN] Story 3-2-baz exceeded retry limit');
    expect(msg).toEqual({
      type: 'fail',
      key: '3-2-baz',
      message: 'exceeded retry limit',
    });
  });

  it('parses [WARN] retry N/M', () => {
    const msg = parseRalphMessage('[WARN] Story 1-1-foo — retry 2/5');
    expect(msg).toEqual({
      type: 'warn',
      key: '1-1-foo',
      message: 'retry 2/5',
    });
  });

  it('parses [ERROR] with story key', () => {
    const msg = parseRalphMessage('[ERROR] Story 1-1-foo failed to verify');
    expect(msg).toEqual({
      type: 'fail',
      key: '1-1-foo',
      message: 'Story 1-1-foo failed to verify',
    });
  });

  it('returns null for [ERROR] without story key', () => {
    const msg = parseRalphMessage('[ERROR] Connection timeout');
    expect(msg).toBeNull();
  });

  it('returns null for unrecognized lines', () => {
    expect(parseRalphMessage('[INFO] Starting iteration 5')).toBeNull();
    expect(parseRalphMessage('[DEBUG] some debug info')).toBeNull();
    expect(parseRalphMessage('')).toBeNull();
    expect(parseRalphMessage('   ')).toBeNull();
  });

  it('strips ANSI color codes', () => {
    const msg = parseRalphMessage('\x1b[32m[SUCCESS] Story 1-1-foo: DONE\x1b[0m');
    expect(msg).toEqual({
      type: 'ok',
      key: '1-1-foo',
      message: 'DONE',
    });
  });

  it('handles retry exceeded before retry N/M (order matters)', () => {
    // "exceeded retry limit" should match retry exceeded, not retry N/M
    const msg = parseRalphMessage('[WARN] Story 1-1-foo exceeded retry limit...flagging');
    expect(msg?.type).toBe('fail');
    expect(msg?.message).toBe('exceeded retry limit');
  });
});

describe('countStories', () => {
  it('counts stories by status correctly', () => {
    const counts = countStories({
      'epic-5': 'in-progress',
      '5-1-ralph-loop': 'ready-for-dev',
      '5-2-verification': 'backlog',
      '5-3-tracking': 'done',
      '5-4-another': 'in-progress',
      'epic-5-retrospective': 'optional',
    });
    expect(counts).toEqual({ total: 4, ready: 2, done: 1, inProgress: 1, verified: 0 });
  });

  it('ignores epic keys and retrospective keys', () => {
    const counts = countStories({
      'epic-1': 'done', 'epic-1-retrospective': 'done',
      '1-1-story-one': 'done', '1-2-story-two': 'done',
    });
    expect(counts.total).toBe(2);
    expect(counts.done).toBe(2);
  });

  it('returns zeros for empty statuses', () => {
    expect(countStories({})).toEqual({ total: 0, ready: 0, done: 0, inProgress: 0, verified: 0 });
  });

  it('counts review status as inProgress', () => {
    expect(countStories({ '1-1-story': 'review' }).inProgress).toBe(1);
  });

  it('counts verifying status separately', () => {
    const counts = countStories({
      '1-1-story': 'verifying',
      '1-2-story': 'verifying',
      '1-3-story': 'done',
    });
    expect(counts).toEqual({ total: 3, ready: 0, done: 1, inProgress: 0, verified: 2 });
  });
});

describe('buildSpawnArgs', () => {
  const baseOpts = {
    ralphPath: '/path/to/ralph.sh',
    pluginDir: '/path/to/.claude',
    promptFile: '/path/to/prompt.md',
    maxIterations: 50,
    timeout: 14400,
    iterationTimeout: 15,
    calls: 100,
    quiet: false,
  };

  it('builds basic argument array', () => {
    const args = buildSpawnArgs(baseOpts);
    expect(args).toContain('/path/to/ralph.sh');
    expect(args).toContain('--plugin-dir');
    expect(args).toContain('50');
  });

  it('includes --live flag when not quiet', () => {
    expect(buildSpawnArgs(baseOpts)).toContain('--live');
  });

  it('does not include --live flag when quiet', () => {
    expect(buildSpawnArgs({ ...baseOpts, quiet: true })).not.toContain('--live');
  });

  it('includes --max-story-retries when provided', () => {
    const args = buildSpawnArgs({ ...baseOpts, maxStoryRetries: 5 });
    expect(args).toContain('--max-story-retries');
    expect(args).toContain('5');
  });

  it('does not include --max-story-retries when undefined', () => {
    expect(buildSpawnArgs(baseOpts)).not.toContain('--max-story-retries');
  });

  it('includes --reset when provided', () => {
    const args = buildSpawnArgs({ ...baseOpts, reset: true });
    expect(args).toContain('--reset');
  });

  it('does not include --reset when false', () => {
    expect(buildSpawnArgs({ ...baseOpts, reset: false })).not.toContain('--reset');
  });
});

describe('parseIterationMessage', () => {
  it('parses [LOOP] iteration N', () => {
    expect(parseIterationMessage('[LOOP] iteration 3')).toBe(3);
  });

  it('parses [LOOP] iteration 1', () => {
    expect(parseIterationMessage('[LOOP] iteration 1')).toBe(1);
  });

  it('parses with timestamp prefix', () => {
    expect(parseIterationMessage('[2025-01-15 10:30:45] [LOOP] iteration 5')).toBe(5);
  });

  it('strips ANSI color codes', () => {
    expect(parseIterationMessage('\x1b[33m[LOOP] iteration 7\x1b[0m')).toBe(7);
  });

  it('returns null for non-LOOP lines', () => {
    expect(parseIterationMessage('[SUCCESS] Story 1-1-foo: DONE')).toBeNull();
    expect(parseIterationMessage('[INFO] Starting loop')).toBeNull();
    expect(parseIterationMessage('')).toBeNull();
    expect(parseIterationMessage('   ')).toBeNull();
  });

  it('returns null for LOOP without iteration number', () => {
    expect(parseIterationMessage('[LOOP] starting')).toBeNull();
  });
});
