import { describe, it, expect } from 'vitest';
import { verifyStory, parseProof } from '../index.js';

describe('verify module stubs', () => {
  it('verifyStory returns fail("not implemented")', () => {
    const result = verifyStory('1.1');
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('parseProof returns fail("not implemented")', () => {
    const result = parseProof('/path/to/proof.md');
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });
});
