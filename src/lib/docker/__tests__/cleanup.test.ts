import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import { cleanupOrphanedContainers, cleanupVerifyEnv } from '../cleanup.js';

const mockExecFileSync = vi.mocked(execFileSync);

describe('cleanupOrphanedContainers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when docker is available (placeholder behavior)', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('Docker version 20.10.0'));
    const result = cleanupOrphanedContainers();
    expect(result).toBe(0);
  });

  it('returns 0 when docker is not available', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('docker not found');
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
