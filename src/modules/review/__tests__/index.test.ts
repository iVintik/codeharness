import { describe, it, expect } from 'vitest';
import { reviewStory } from '../index.js';

describe('review module stubs', () => {
  it('reviewStory returns fail("not implemented")', () => {
    const result = reviewStory('1.1');
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });
});
