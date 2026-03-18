import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Mock migration so index tests are isolated from real project files
vi.mock('../migration.js', () => ({
  migrateFromOldFormat: vi.fn(() => ({
    success: false,
    error: 'No old format files found for migration',
  })),
}));

const {
  getNextStory,
  updateStoryStatus,
  getSprintState,
  generateReport,
} = await import('../index.js');

const STATE_FILE = join(process.cwd(), 'sprint-state.json');
const TMP_FILE = join(process.cwd(), '.sprint-state.json.tmp');

function cleanup(): void {
  for (const f of [STATE_FILE, TMP_FILE]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe('sprint module', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('getNextStory returns fail("not implemented")', () => {
    const result = getNextStory();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });

  it('getSprintState returns ok with default state when no file exists', () => {
    const result = getSprintState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.stories).toEqual({});
    }
  });

  it('updateStoryStatus writes state successfully', () => {
    const result = updateStoryStatus('1.1', 'in-progress');
    expect(result.success).toBe(true);
  });

  it('updateStoryStatus with detail writes state successfully', () => {
    const result = updateStoryStatus('1.1', 'failed', { error: 'boom' });
    expect(result.success).toBe(true);
  });

  it('generateReport returns fail("not implemented")', () => {
    const result = generateReport();
    expect(result).toEqual({ success: false, error: 'not implemented' });
  });
});
