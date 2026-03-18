import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/beads.js', () => ({
  isBeadsInitialized: vi.fn(() => false),
  initBeads: vi.fn(),
  detectBeadsHooks: vi.fn(() => ({ hasHooks: false, hookTypes: [] })),
  configureHookCoexistence: vi.fn(),
  BeadsError: class BeadsError extends Error {
    command: string;
    originalMessage: string;
    constructor(command: string, originalMessage: string) {
      super(`Beads failed: ${originalMessage}. Command: ${command}`);
      this.name = 'BeadsError';
      this.command = command;
      this.originalMessage = originalMessage;
    }
  },
}));

import {
  isBeadsInitialized,
  initBeads,
  detectBeadsHooks,
  configureHookCoexistence,
  BeadsError,
} from '../../../lib/beads.js';
import { initializeBeads } from '../beads-init.js';

const mockIsBeadsInitialized = vi.mocked(isBeadsInitialized);
const mockInitBeads = vi.mocked(initBeads);
const mockDetectBeadsHooks = vi.mocked(detectBeadsHooks);
const mockConfigureHookCoexistence = vi.mocked(configureHookCoexistence);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockIsBeadsInitialized.mockReturnValue(false);
  mockInitBeads.mockImplementation(() => {});
  mockDetectBeadsHooks.mockReturnValue({ hasHooks: false, hookTypes: [] });
});

describe('initializeBeads', () => {
  it('initializes beads when not already initialized', () => {
    const result = initializeBeads('/tmp/test', false);
    expect(result.status).toBe('initialized');
    expect(mockInitBeads).toHaveBeenCalledWith('/tmp/test');
  });

  it('skips when already initialized', () => {
    mockIsBeadsInitialized.mockReturnValue(true);
    const result = initializeBeads('/tmp/test', false);
    expect(result.status).toBe('already-initialized');
    expect(mockInitBeads).not.toHaveBeenCalled();
  });

  it('detects hooks and configures coexistence', () => {
    mockDetectBeadsHooks.mockReturnValue({ hasHooks: true, hookTypes: ['pre-commit'] });
    const result = initializeBeads('/tmp/test', false);
    expect(result.hooks_detected).toBe(true);
    expect(mockConfigureHookCoexistence).toHaveBeenCalledWith('/tmp/test');
  });

  it('returns failed status on BeadsError', () => {
    mockIsBeadsInitialized.mockImplementation(() => {
      throw new BeadsError('init', 'network error');
    });
    const result = initializeBeads('/tmp/test', false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('network error');
  });

  it('catches non-BeadsError and returns failed result', () => {
    mockIsBeadsInitialized.mockImplementation(() => {
      throw new TypeError('unexpected');
    });
    const result = initializeBeads('/tmp/test', false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('unexpected');
  });

  it('suppresses console output in json mode', () => {
    const spy = vi.spyOn(console, 'log');
    initializeBeads('/tmp/test', true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports hooks_detected false when no hooks', () => {
    const result = initializeBeads('/tmp/test', false);
    expect(result.hooks_detected).toBe(false);
    expect(mockConfigureHookCoexistence).not.toHaveBeenCalled();
  });
});
