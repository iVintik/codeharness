import { describe, it, expect } from 'vitest';
import {
  getNextStory,
  updateStoryStatus,
  getSprintState,
  generateReport,
} from '../index.js';

describe('sprint module stubs', () => {
  it('getNextStory returns fail("not implemented")', () => {
    const result = getNextStory();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('updateStoryStatus returns fail("not implemented")', () => {
    const result = updateStoryStatus('1.1', 'in-progress');
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('updateStoryStatus with detail returns fail("not implemented")', () => {
    const result = updateStoryStatus('1.1', 'failed', { error: 'boom' });
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('getSprintState returns fail("not implemented")', () => {
    const result = getSprintState();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('generateReport returns fail("not implemented")', () => {
    const result = generateReport();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });
});
