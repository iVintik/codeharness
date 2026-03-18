import { describe, it, expect } from 'vitest';
import { developStory } from '../index.js';

describe('dev module stubs', () => {
  it('developStory returns fail("not implemented")', () => {
    const result = developStory('1.1');
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });
});
