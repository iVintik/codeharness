import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reviewStory } from '../index.js';

// Mock the orchestrator module
vi.mock('../orchestrator.js', () => ({
  invokeBmadCodeReview: vi.fn(),
}));

import { invokeBmadCodeReview } from '../orchestrator.js';

const mockedInvoke = vi.mocked(invokeBmadCodeReview);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reviewStory', () => {
  it('delegates to invokeBmadCodeReview and returns ok(ReviewResult)', () => {
    const mockResult = {
      success: true as const,
      data: {
        key: '5-1-test',
        approved: true,
        comments: [],
        duration: 5000,
        output: 'LGTM',
      },
    };
    mockedInvoke.mockReturnValueOnce(mockResult);

    const result = reviewStory('5-1-test');

    expect(mockedInvoke).toHaveBeenCalledWith('5-1-test', undefined);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.key).toBe('5-1-test');
    expect(result.data.approved).toBe(true);
    expect(result.data.comments).toEqual([]);
    expect(result.data.duration).toBe(5000);
    expect(result.data.output).toBe('LGTM');
  });

  it('delegates to invokeBmadCodeReview and returns fail() on error', () => {
    const mockResult = {
      success: false as const,
      error: 'review workflow failed with exit code 1 for story bad-key: error',
    };
    mockedInvoke.mockReturnValueOnce(mockResult);

    const result = reviewStory('bad-key');

    expect(mockedInvoke).toHaveBeenCalledWith('bad-key', undefined);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('bad-key');
  });

  it('passes timeout option through to orchestrator', () => {
    const mockResult = {
      success: true as const,
      data: {
        key: 'k',
        approved: true,
        comments: [],
        duration: 100,
        output: '',
      },
    };
    mockedInvoke.mockReturnValueOnce(mockResult);

    reviewStory('k', { timeoutMs: 30_000 });

    expect(mockedInvoke).toHaveBeenCalledWith('k', { timeoutMs: 30_000 });
  });

  it('returns Result shape — has success discriminant', () => {
    mockedInvoke.mockReturnValueOnce({
      success: true as const,
      data: {
        key: 'x',
        approved: true,
        comments: [],
        duration: 0,
        output: '',
      },
    });

    const result = reviewStory('x');
    expect('success' in result).toBe(true);
    expect(typeof result.success).toBe('boolean');
  });

  it('no longer returns fail("not implemented")', () => {
    mockedInvoke.mockReturnValueOnce({
      success: true as const,
      data: {
        key: 'test',
        approved: true,
        comments: [],
        duration: 0,
        output: '',
      },
    });

    const result = reviewStory('test');
    expect(result.success).toBe(true);
    if (!result.success) return;
    // The old stub returned fail('not implemented') — verify that's gone
    expect(result.data.key).toBe('test');
  });
});
