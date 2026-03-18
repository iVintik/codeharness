import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { developStory } from '../index.js';

// Mock the orchestrator module
vi.mock('../orchestrator.js', () => ({
  invokeBmadDevStory: vi.fn(),
}));

import { invokeBmadDevStory } from '../orchestrator.js';

const mockedInvoke = vi.mocked(invokeBmadDevStory);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('developStory', () => {
  it('delegates to invokeBmadDevStory and returns ok(DevResult)', () => {
    const mockResult = {
      success: true as const,
      data: {
        key: '3-2-test',
        filesChanged: ['src/foo.ts'],
        testsAdded: 1,
        duration: 5000,
        output: 'done',
      },
    };
    mockedInvoke.mockReturnValueOnce(mockResult);

    const result = developStory('3-2-test');

    expect(mockedInvoke).toHaveBeenCalledWith('3-2-test', undefined);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.key).toBe('3-2-test');
    expect(result.data.filesChanged).toEqual(['src/foo.ts']);
    expect(result.data.testsAdded).toBe(1);
    expect(result.data.duration).toBe(5000);
    expect(result.data.output).toBe('done');
  });

  it('delegates to invokeBmadDevStory and returns fail() on error', () => {
    const mockResult = {
      success: false as const,
      error: 'dev workflow failed with exit code 1 for story bad-key: error',
    };
    mockedInvoke.mockReturnValueOnce(mockResult);

    const result = developStory('bad-key');

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
        filesChanged: [],
        testsAdded: 0,
        duration: 100,
        output: '',
      },
    };
    mockedInvoke.mockReturnValueOnce(mockResult);

    developStory('k', { timeoutMs: 30_000 });

    expect(mockedInvoke).toHaveBeenCalledWith('k', { timeoutMs: 30_000 });
  });

  it('returns Result shape — has success discriminant', () => {
    mockedInvoke.mockReturnValueOnce({
      success: true as const,
      data: {
        key: 'x',
        filesChanged: [],
        testsAdded: 0,
        duration: 0,
        output: '',
      },
    });

    const result = developStory('x');
    expect('success' in result).toBe(true);
    expect(typeof result.success).toBe('boolean');
  });
});
