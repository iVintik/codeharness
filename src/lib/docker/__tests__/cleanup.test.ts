import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../modules/infra/container-cleanup.js', () => ({
  cleanupContainers: vi.fn(),
}));

import { cleanupContainers } from '../../../modules/infra/container-cleanup.js';
import { cleanupOrphanedContainers, cleanupVerifyEnv } from '../cleanup.js';

const mockCleanupContainers = vi.mocked(cleanupContainers);

describe('cleanupOrphanedContainers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to infra cleanupContainers and returns count on success', () => {
    mockCleanupContainers.mockReturnValue({
      success: true,
      data: { containersRemoved: 3, names: ['a', 'b', 'c'] },
    });
    const result = cleanupOrphanedContainers();
    expect(result).toBe(3);
    expect(mockCleanupContainers).toHaveBeenCalledOnce();
  });

  it('returns 0 when infra cleanupContainers fails', () => {
    mockCleanupContainers.mockReturnValue({
      success: false,
      error: 'Docker not available',
    });
    const result = cleanupOrphanedContainers();
    expect(result).toBe(0);
  });

  it('returns 0 when no containers removed', () => {
    mockCleanupContainers.mockReturnValue({
      success: true,
      data: { containersRemoved: 0, names: [] },
    });
    const result = cleanupOrphanedContainers();
    expect(result).toBe(0);
  });
});

describe('cleanupVerifyEnv', () => {
  it('executes without error (placeholder behavior)', () => {
    expect(() => cleanupVerifyEnv()).not.toThrow();
  });
});
