import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/bmad.js', () => ({
  isBmadInstalled: vi.fn(() => false),
  installBmad: vi.fn(() => ({ status: 'installed', version: '6.0.0', patches_applied: [] })),
  applyAllPatches: vi.fn(() => [
    { patchName: 'story-verification', targetFile: 't.md', applied: true, updated: false },
  ]),
  detectBmadVersion: vi.fn(() => '6.0.0'),
  detectBmalph: vi.fn(() => ({ detected: false, files: [] })),
  BmadError: class BmadError extends Error {
    command: string;
    originalMessage: string;
    constructor(command: string, originalMessage: string) {
      super(`BMAD failed: ${originalMessage}. Command: ${command}`);
      this.name = 'BmadError';
      this.command = command;
      this.originalMessage = originalMessage;
    }
  },
}));

import {
  isBmadInstalled,
  installBmad,
  applyAllPatches,
  detectBmadVersion,
  detectBmalph,
  BmadError,
} from '../../../lib/bmad.js';
import { setupBmad, verifyBmadOnRerun } from '../bmad-setup.js';

const mockIsBmadInstalled = vi.mocked(isBmadInstalled);
const mockInstallBmad = vi.mocked(installBmad);
const mockApplyAllPatches = vi.mocked(applyAllPatches);
const mockDetectBmadVersion = vi.mocked(detectBmadVersion);
const mockDetectBmalph = vi.mocked(detectBmalph);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockIsBmadInstalled.mockReturnValue(false);
  mockInstallBmad.mockReturnValue({ status: 'installed', version: '6.0.0', patches_applied: [] });
  mockApplyAllPatches.mockReturnValue([
    { patchName: 'story-verification', targetFile: 't.md', applied: true, updated: false },
  ]);
  mockDetectBmadVersion.mockReturnValue('6.0.0');
  mockDetectBmalph.mockReturnValue({ detected: false, files: [] });
});

describe('setupBmad', () => {
  it('installs BMAD when not already installed', () => {
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('installed');
      expect(result.data.version).toBe('6.0.0');
      expect(result.data.patches_applied).toEqual(['story-verification']);
    }
  });

  it('verifies patches when already installed', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('already-installed');
    }
    expect(mockInstallBmad).not.toHaveBeenCalled();
  });

  it('detects bmalph artifacts', () => {
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['old.md'] });
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bmalph_detected).toBe(true);
    }
  });

  it('returns ok with failed status on BmadError', () => {
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('install', 'network error');
    });
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toContain('network error');
    }
  });

  it('catches non-BmadError and returns ok with failed status', () => {
    mockInstallBmad.mockImplementation(() => {
      throw new TypeError('unexpected');
    });
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toContain('unexpected');
    }
  });

  it('handles non-Error thrown value (string) in catch', () => {
    mockInstallBmad.mockImplementation(() => {
      throw 'raw string error';  
    });
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBe('raw string error');
    }
  });

  it('suppresses console output in json mode on fresh install', () => {
    const spy = vi.spyOn(console, 'log');
    setupBmad({ projectDir: '/tmp/test', isJson: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('suppresses console output in json mode when already installed', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    const spy = vi.spyOn(console, 'log');
    setupBmad({ projectDir: '/tmp/test', isJson: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('suppresses console output in json mode with bmalph detected', () => {
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['.ralph/.ralphrc'] });
    const spy = vi.spyOn(console, 'log');
    const result = setupBmad({ projectDir: '/tmp/test', isJson: true });
    expect(spy).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bmalph_detected).toBe(true);
    }
  });

  it('suppresses console output in json mode on failure', () => {
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('npx bmad-method install --yes --tools claude-code', 'timeout');
    });
    const spy = vi.spyOn(console, 'log');
    const result = setupBmad({ projectDir: '/tmp/test', isJson: true });
    expect(spy).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
    }
  });

  it('includes command and context in error message on BmadError', () => {
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('npx bmad-method install --yes --tools claude-code', 'ENOTFOUND registry.npmjs.org');
    });
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toContain('npx bmad-method install --yes --tools claude-code');
      expect(result.data.error).toContain('ENOTFOUND registry.npmjs.org');
    }
  });

  it('shows unknown version when installBmad returns null version', () => {
    mockInstallBmad.mockReturnValue({ status: 'installed', version: null, patches_applied: [] });
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('installed');
      expect(result.data.version).toBeNull();
    }
  });

  it('applies patches immediately after fresh install', () => {
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(mockInstallBmad).toHaveBeenCalledWith('/tmp/test');
    expect(mockApplyAllPatches).toHaveBeenCalledWith('/tmp/test', { silent: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.patches_applied).toEqual(['story-verification']);
    }
  });

  it('returns version and patches in already-installed path', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    mockDetectBmadVersion.mockReturnValue('6.1.0');
    mockApplyAllPatches.mockReturnValue([
      { patchName: 'story-verification', targetFile: 't.md', applied: true, updated: false },
      { patchName: 'dev-enforcement', targetFile: 'd.xml', applied: true, updated: false },
    ]);
    const result = setupBmad({ projectDir: '/tmp/test', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('already-installed');
      expect(result.data.version).toBe('6.1.0');
      expect(result.data.patches_applied).toEqual(['story-verification', 'dev-enforcement']);
    }
  });
});

describe('verifyBmadOnRerun', () => {
  it('returns undefined when BMAD not installed', () => {
    mockIsBmadInstalled.mockReturnValue(false);
    const result = verifyBmadOnRerun('/tmp/test', false);
    expect(result).toBeUndefined();
  });

  it('returns bmad result when installed', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    const result = verifyBmadOnRerun('/tmp/test', false);
    expect(result).toBeDefined();
    expect(result!.status).toBe('already-installed');
    expect(result!.version).toBe('6.0.0');
  });

  it('returns undefined when verification throws', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    mockApplyAllPatches.mockImplementation(() => { throw new Error('fail'); });
    const result = verifyBmadOnRerun('/tmp/test', false);
    expect(result).toBeUndefined();
  });

  it('detects bmalph on re-run', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['old.md'] });
    const result = verifyBmadOnRerun('/tmp/test', false);
    expect(result!.bmalph_detected).toBe(true);
  });

  it('suppresses console output in json mode on re-run', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['.ralph/'] });
    const spy = vi.spyOn(console, 'log');
    const result = verifyBmadOnRerun('/tmp/test', true);
    expect(spy).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result!.bmalph_detected).toBe(true);
  });

  it('re-applies patches and returns patch names on re-run', () => {
    mockIsBmadInstalled.mockReturnValue(true);
    mockApplyAllPatches.mockReturnValue([
      { patchName: 'story-verification', targetFile: 't.md', applied: true, updated: false },
      { patchName: 'dev-enforcement', targetFile: 'd.xml', applied: true, updated: false },
    ]);
    const result = verifyBmadOnRerun('/tmp/test', false);
    expect(result).toBeDefined();
    expect(result!.patches_applied).toEqual(['story-verification', 'dev-enforcement']);
  });
});
