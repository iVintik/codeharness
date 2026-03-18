import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/deps.js', () => ({
  installAllDependencies: vi.fn(() => [
    { name: 'showboat', displayName: 'Showboat', status: 'already-installed', version: '0.6.1' },
  ]),
  checkInstalled: vi.fn(() => ({ installed: true, version: '1.0.0' })),
  DEPENDENCY_REGISTRY: [
    {
      name: 'showboat',
      displayName: 'Showboat',
      installCommands: [{ cmd: 'pip', args: ['install', 'showboat'] }],
      checkCommand: { cmd: 'showboat', args: ['--version'] },
      critical: false,
    },
  ],
  CriticalDependencyError: class CriticalDependencyError extends Error {
    dependencyName: string;
    reason: string;
    constructor(dep: string, reason: string) {
      super(`Critical dependency '${dep}' failed to install: ${reason}`);
      this.name = 'CriticalDependencyError';
      this.dependencyName = dep;
      this.reason = reason;
    }
  },
}));

import { installAllDependencies, CriticalDependencyError, checkInstalled } from '../../../lib/deps.js';
import { installDeps, verifyDeps } from '../deps-install.js';

const mockInstallAll = vi.mocked(installAllDependencies);
const mockCheckInstalled = vi.mocked(checkInstalled);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockInstallAll.mockReturnValue([
    { name: 'showboat', displayName: 'Showboat', status: 'already-installed', version: '0.6.1' },
  ]);
  mockCheckInstalled.mockReturnValue({ installed: true, version: '1.0.0' });
});

describe('installDeps', () => {
  it('returns ok with dependency results on success', () => {
    const result = installDeps({ isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('showboat');
    }
  });

  it('passes json flag to installAllDependencies', () => {
    installDeps({ isJson: true });
    expect(mockInstallAll).toHaveBeenCalledWith({ json: true });
  });

  it('returns fail for CriticalDependencyError', () => {
    mockInstallAll.mockImplementation(() => {
      throw new CriticalDependencyError('git', 'not found');
    });
    const result = installDeps({ isJson: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('git');
    }
  });

  it('catches non-CriticalDependencyError and returns fail', () => {
    mockInstallAll.mockImplementation(() => {
      throw new TypeError('unexpected');
    });
    const result = installDeps({ isJson: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('unexpected');
    }
  });
});

describe('verifyDeps', () => {
  it('returns dependency results for each registered dep', () => {
    const results = verifyDeps(false);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('already-installed');
  });

  it('reports failed status when dep not installed', () => {
    mockCheckInstalled.mockReturnValue({ installed: false, version: null });
    const results = verifyDeps(false);
    expect(results[0].status).toBe('failed');
  });

  it('suppresses console output in json mode', () => {
    const spy = vi.spyOn(console, 'log');
    verifyDeps(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
