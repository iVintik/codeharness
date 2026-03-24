import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process before any imports that use it
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../../../lib/docker/index.js', () => ({
  isDockerAvailable: vi.fn(() => true),
  isSharedStackRunning: vi.fn(() => false),
  startSharedStack: vi.fn(() => ({
    started: true,
    services: [
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
      { name: 'victoria-logs', status: 'running', port: '9428' },
    ],
  })),
  getStackHealth: vi.fn(() => ({
    healthy: true,
    services: [
      { name: 'otel-collector', running: true },
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
    ],
  })),
}));

vi.mock('../../../lib/stack-path.js', () => ({
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
}));

import { execFileSync } from 'node:child_process';
import {
  isDockerAvailable,
  isSharedStackRunning,
  startSharedStack,
  getStackHealth,
} from '../../../lib/docker/index.js';
import { ensureStack, detectRunningStack, detectPortConflicts } from '../stack-management.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockIsSharedStackRunning = vi.mocked(isSharedStackRunning);
const mockStartSharedStack = vi.mocked(startSharedStack);
const mockGetStackHealth = vi.mocked(getStackHealth);
const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsDockerAvailable.mockReturnValue(true);
  mockIsSharedStackRunning.mockReturnValue(false);
  mockStartSharedStack.mockReturnValue({
    started: true,
    services: [
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
    ],
  });
  mockGetStackHealth.mockReturnValue({
    healthy: true,
    services: [
      { name: 'otel-collector', running: true },
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
    ],
  });
  // Default: lsof throws (port free)
  mockExecFileSync.mockImplementation(() => {
    throw new Error('no process');
  });
});

// ─── detectRunningStack ─────────────────────────────────────────────────────

describe('detectRunningStack', () => {
  it('returns running=false when Docker is unavailable', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    const result = detectRunningStack();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.running).toBe(false);
      expect(result.data.services).toEqual([]);
    }
  });

  it('returns running=false when shared stack is not running', () => {
    mockIsSharedStackRunning.mockReturnValue(false);
    const result = detectRunningStack();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.running).toBe(false);
      expect(result.data.projectName).toBe('codeharness-shared');
    }
  });

  it('returns running=true with services when stack is running', () => {
    mockIsSharedStackRunning.mockReturnValue(true);
    const result = detectRunningStack();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.running).toBe(true);
      expect(result.data.projectName).toBe('codeharness-shared');
      expect(result.data.services.length).toBeGreaterThan(0);
      expect(result.data.composePath).toBe('/mock/.codeharness/stack/docker-compose.harness.yml');
    }
  });

  it('returns fail on unexpected error', () => {
    mockIsDockerAvailable.mockImplementation(() => {
      throw new Error('unexpected crash');
    });
    const result = detectRunningStack();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('unexpected crash');
    }
  });
});

// ─── detectPortConflicts ────────────────────────────────────────────────────

describe('detectPortConflicts', () => {
  it('returns no conflicts when all ports are free', () => {
    const result = detectPortConflicts();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conflicts).toEqual([]);
    }
  });

  it('detects a port conflict', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'lsof' && argsArray?.[1] === ':4317') {
        return Buffer.from('12345\n');
      }
      if (cmd === 'ps') {
        return Buffer.from('node\n');
      }
      throw new Error('no process');
    });

    const result = detectPortConflicts([4317, 4318]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conflicts).toHaveLength(1);
      expect(result.data.conflicts[0]).toEqual({
        port: 4317,
        pid: 12345,
        processName: 'node',
      });
    }
  });

  it('handles ps failure gracefully (process name = unknown)', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'lsof' && argsArray?.[1] === ':9428') {
        return Buffer.from('999\n');
      }
      if (cmd === 'ps') {
        throw new Error('ps failed');
      }
      throw new Error('no process');
    });

    const result = detectPortConflicts([9428]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conflicts).toHaveLength(1);
      expect(result.data.conflicts[0].processName).toBe('unknown');
    }
  });

  it('detects multiple port conflicts', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'lsof') {
        if (argsArray?.[1] === ':4317') return Buffer.from('100\n');
        if (argsArray?.[1] === ':4318') return Buffer.from('200\n');
        throw new Error('no process');
      }
      if (cmd === 'ps') {
        return Buffer.from('someproc\n');
      }
      throw new Error('unknown');
    });

    const result = detectPortConflicts([4317, 4318, 9428]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conflicts).toHaveLength(2);
    }
  });

  it('returns fail on unexpected outer error', () => {
    // Force the ports parameter to trigger an error in the outer try
    // by passing a value that causes iteration to throw
    const badPorts = {
      [Symbol.iterator]() {
        throw new Error('iterator exploded');
      },
    } as unknown as readonly number[];

    const result = detectPortConflicts(badPorts);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Port conflict detection failed');
      expect(result.error).toContain('iterator exploded');
    }
  });
});

// ─── ensureStack ────────────────────────────────────────────────────────────

describe('ensureStack', () => {
  it('returns fail when Docker is not available (AC#6)', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    const result = ensureStack();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Docker is required');
    }
  });

  it('reuses running stack without starting a duplicate (AC#1)', () => {
    mockIsSharedStackRunning.mockReturnValue(true);
    const result = ensureStack();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.running).toBe(true);
      expect(result.data.projectName).toBe('codeharness-shared');
      expect(result.data.composePath).toBe('/mock/.codeharness/stack/docker-compose.harness.yml');
      expect(result.data.services.length).toBeGreaterThan(0);
    }
    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });

  it('detects port conflict and returns fail (AC#2)', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const argsArray = args as string[];
      if (cmd === 'lsof' && argsArray?.[1] === ':4317') {
        return Buffer.from('777\n');
      }
      if (cmd === 'ps') {
        return Buffer.from('nginx\n');
      }
      throw new Error('no process');
    });

    const result = ensureStack();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Port conflict');
      expect(result.error).toContain('4317');
      expect(result.error).toContain('nginx');
    }
    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });

  it('starts stack when not running and ports are free (AC#5)', () => {
    const result = ensureStack();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.running).toBe(true);
      expect(result.data.services.length).toBeGreaterThan(0);
    }
    expect(mockStartSharedStack).toHaveBeenCalled();
  });

  it('returns fail when start fails', () => {
    mockStartSharedStack.mockReturnValue({
      started: false,
      services: [],
      error: 'compose timeout',
    });
    const result = ensureStack();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('compose timeout');
    }
  });

  it('catches unexpected errors and returns fail', () => {
    mockIsDockerAvailable.mockReturnValue(true);
    mockIsSharedStackRunning.mockImplementation(() => {
      throw new Error('segfault');
    });
    const result = ensureStack();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('segfault');
    }
  });

});
