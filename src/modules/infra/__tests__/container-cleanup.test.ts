import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../../../lib/docker.js', () => ({
  isDockerAvailable: vi.fn(() => true),
}));

import { execFileSync } from 'node:child_process';
import { isDockerAvailable } from '../../../lib/docker.js';
import { cleanupContainers } from '../container-cleanup.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDockerAvailable.mockReturnValue(true);
  // Default: docker ps returns nothing (no stale containers)
  mockExecFileSync.mockReturnValue(Buffer.from(''));
});

describe('cleanupContainers', () => {
  it('returns ok with 0 removed when Docker is unavailable (AC#7)', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    const result = cleanupContainers();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containersRemoved).toBe(0);
      expect(result.data.names).toEqual([]);
    }
  });

  it('returns ok with 0 when no stale containers exist', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = cleanupContainers();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containersRemoved).toBe(0);
      expect(result.data.names).toEqual([]);
    }
  });

  it('removes stale shared containers (AC#3)', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      // docker ps for shared pattern
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-shared-')) {
        return Buffer.from('codeharness-shared-otel-1\ncodeharness-shared-victoria-1\n');
      }
      // docker ps for collector pattern
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-collector-')) {
        return Buffer.from('');
      }
      // docker rm
      if (cmd === 'docker' && argsArray?.[0] === 'rm') {
        return Buffer.from('');
      }
      return Buffer.from('');
    });

    const result = cleanupContainers();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containersRemoved).toBe(2);
      expect(result.data.names).toContain('codeharness-shared-otel-1');
      expect(result.data.names).toContain('codeharness-shared-victoria-1');
    }
  });

  it('removes stale collector containers', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-shared-')) {
        return Buffer.from('');
      }
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-collector-')) {
        return Buffer.from('codeharness-collector-otel-1\n');
      }
      if (cmd === 'docker' && argsArray?.[0] === 'rm') {
        return Buffer.from('');
      }
      return Buffer.from('');
    });

    const result = cleanupContainers();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containersRemoved).toBe(1);
      expect(result.data.names).toContain('codeharness-collector-otel-1');
    }
  });

  it('continues if individual container removal fails', () => {
    let rmCallCount = 0;
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-shared-')) {
        return Buffer.from('container-a\ncontainer-b\n');
      }
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-collector-')) {
        return Buffer.from('');
      }
      if (cmd === 'docker' && argsArray?.[0] === 'rm') {
        rmCallCount++;
        if (rmCallCount === 1) {
          throw new Error('removal failed');
        }
        return Buffer.from('');
      }
      return Buffer.from('');
    });

    const result = cleanupContainers();
    expect(result.success).toBe(true);
    if (result.success) {
      // Only the second one succeeded
      expect(result.data.containersRemoved).toBe(1);
      expect(result.data.names).toContain('container-b');
    }
  });

  it('handles docker ps failure gracefully for a pattern', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-shared-')) {
        throw new Error('docker ps failed');
      }
      if (cmd === 'docker' && argsArray?.[0] === 'ps' && argsArray?.includes('name=codeharness-collector-')) {
        return Buffer.from('codeharness-collector-otel-1\n');
      }
      if (cmd === 'docker' && argsArray?.[0] === 'rm') {
        return Buffer.from('');
      }
      return Buffer.from('');
    });

    const result = cleanupContainers();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.containersRemoved).toBe(1);
    }
  });
});
