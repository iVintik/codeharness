import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  checkInstalled,
  installDependency,
  installAllDependencies,
  parseVersion,
  CriticalDependencyError,
  DEPENDENCY_REGISTRY,
} from '../deps.js';
import type { DependencySpec } from '../deps.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.restoreAllMocks();
  // Suppress console output during tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('parseVersion', () => {
  it('extracts version from simple output', () => {
    expect(parseVersion('1.2.3')).toBe('1.2.3');
  });

  it('extracts version from "tool v1.2.3" format', () => {
    expect(parseVersion('showboat v0.6.1')).toBe('0.6.1');
  });

  it('extracts version from "tool version 1.2.3" format', () => {
    expect(parseVersion('bd version 2.0.0-beta.1')).toBe('2.0.0-beta.1');
  });

  it('returns null when no version found', () => {
    expect(parseVersion('no version here')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseVersion('')).toBeNull();
  });
});

describe('checkInstalled', () => {
  const spec: DependencySpec = {
    name: 'test-tool',
    displayName: 'TestTool',
    installCommands: [{ cmd: 'pip', args: ['install', 'test-tool'] }],
    checkCommand: { cmd: 'test-tool', args: ['--version'] },
    critical: false,
  };

  it('returns installed=true with version when command succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('test-tool 1.0.0'));
    const result = checkInstalled(spec);
    expect(result.installed).toBe(true);
    expect(result.version).toBe('1.0.0');
    expect(mockExecFileSync).toHaveBeenCalledWith('test-tool', ['--version'], { stdio: 'pipe', timeout: 15_000 });
  });

  it('returns installed=false when command fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found');
    });
    const result = checkInstalled(spec);
    expect(result.installed).toBe(false);
    expect(result.version).toBeNull();
  });

  it('returns installed=true with null version when output has no version', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('some output without version'));
    const result = checkInstalled(spec);
    expect(result.installed).toBe(true);
    expect(result.version).toBeNull();
  });
});

describe('installDependency', () => {
  const nonCriticalSpec: DependencySpec = {
    name: 'showboat',
    displayName: 'Showboat',
    installCommands: [
      { cmd: 'pip', args: ['install', 'showboat'] },
      { cmd: 'pipx', args: ['install', 'showboat'] },
    ],
    checkCommand: { cmd: 'showboat', args: ['--version'] },
    critical: false,
  };

  it('returns already-installed when tool is already present', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('showboat 0.6.1'));
    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('already-installed');
    expect(result.version).toBe('0.6.1');
  });

  it('installs via primary command and returns installed', () => {
    let checkCount = 0;
    mockExecFileSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      // Version check: first fails, then succeeds
      if (cmdStr === 'showboat') {
        checkCount++;
        if (checkCount === 1) throw new Error('not found');
        return Buffer.from('showboat 0.6.1');
      }
      // Install command succeeds
      return Buffer.from('');
    });

    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('installed');
    expect(result.version).toBe('0.6.1');
  });

  it('falls back to secondary command when primary fails', () => {
    let checkCount = 0;
    mockExecFileSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr === 'showboat') {
        checkCount++;
        if (checkCount === 1) throw new Error('not found');
        return Buffer.from('showboat 0.6.1');
      }
      if (cmdStr === 'pip') throw new Error('pip not found');
      // pipx install succeeds
      return Buffer.from('');
    });

    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('installed');
    expect(result.version).toBe('0.6.1');
  });

  it('returns failed when all install commands fail', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command failed');
    });

    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('failed');
    expect(result.version).toBeNull();
    expect(result.error).toContain('Install failed');
    expect(result.error).toContain('pip install showboat');
    expect(result.error).toContain('pipx install showboat');
  });

  it('returns failed when install succeeds but post-check fails', () => {
    mockExecFileSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      if (cmdStr === 'showboat') throw new Error('not found');
      // Install commands succeed but version check always fails
      return Buffer.from('');
    });

    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('failed');
  });
});

describe('installAllDependencies', () => {
  it('installs all dependencies and returns results', () => {
    // All tools already installed
    mockExecFileSync.mockReturnValue(Buffer.from('tool 1.0.0'));

    const results = installAllDependencies({});
    expect(results).toHaveLength(DEPENDENCY_REGISTRY.length);
    expect(results.every(r => r.status === 'already-installed')).toBe(true);
  });

  it('does not throw when all deps fail (none are critical)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command failed');
    });

    const results = installAllDependencies({});
    expect(results.every(r => r.status === 'failed')).toBe(true);
  });

  it('continues when non-critical dep fails', () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      const argsArr = Array.isArray(args) ? args.map(String) : [];

      // showboat check and install both fail
      if (cmdStr === 'showboat') throw new Error('not found');
      // agent-browser check and install both fail
      if (cmdStr === 'agent-browser') throw new Error('not found');
      if (cmdStr === 'npm') throw new Error('not found');
      // pip/pipx for showboat fail, for beads we don't reach (already installed)
      if ((cmdStr === 'pip' || cmdStr === 'pipx') && argsArr.some(a => a.includes('showboat'))) {
        throw new Error('not found');
      }
      // beads check succeeds
      if (cmdStr === 'bd') {
        return Buffer.from('bd 1.0.0');
      }
      throw new Error('unexpected');
    });

    // Should not throw because showboat and agent-browser are non-critical,
    // and beads is already installed
    const results = installAllDependencies({});
    const failed = results.filter(r => r.status === 'failed');
    expect(failed.length).toBeGreaterThanOrEqual(1);
    const beadsResult = results.find(r => r.name === 'beads');
    expect(beadsResult?.status).toBe('already-installed');
  });

  it('prints OK messages for installed dependencies (non-json mode)', () => {
    const logSpy = vi.spyOn(console, 'log');
    mockExecFileSync.mockReturnValue(Buffer.from('tool 1.0.0'));

    installAllDependencies({ json: false });

    const calls = logSpy.mock.calls.map(c => c[0]);
    expect(calls.some(c => typeof c === 'string' && c.includes('[OK]'))).toBe(true);
  });

  it('prints installed (not already-installed) message for freshly installed deps', () => {
    const logSpy = vi.spyOn(console, 'log');
    let showboatCheckCount = 0;
    mockExecFileSync.mockImplementation((cmd) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      // For showboat: first version check fails, install succeeds, post-check succeeds
      if (cmdStr === 'showboat') {
        showboatCheckCount++;
        if (showboatCheckCount === 1) throw new Error('not found');
        return Buffer.from('showboat 0.6.1');
      }
      if (cmdStr === 'pip') return Buffer.from('');
      // Everything else: already installed
      return Buffer.from('tool 1.0.0');
    });

    const results = installAllDependencies({ json: false });
    const showboat = results.find(r => r.name === 'showboat');
    expect(showboat?.status).toBe('installed');
    expect(showboat?.version).toBe('0.6.1');

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Showboat: installed (v0.6.1)'))).toBe(true);
  });

  it('does not print messages in json mode', () => {
    const logSpy = vi.spyOn(console, 'log');
    mockExecFileSync.mockReturnValue(Buffer.from('tool 1.0.0'));

    installAllDependencies({ json: true });

    const calls = logSpy.mock.calls.map(c => c[0]);
    expect(calls.some(c => typeof c === 'string' && c.includes('[OK]'))).toBe(false);
  });

  it('prints FAIL and info messages for non-critical failures', () => {
    const logSpy = vi.spyOn(console, 'log');

    mockExecFileSync.mockImplementation((cmd, args) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.toString();
      const argsArr = Array.isArray(args) ? args.map(String) : [];
      // showboat fails
      if (cmdStr === 'showboat') throw new Error('not found');
      if ((cmdStr === 'pip' || cmdStr === 'pipx') && argsArr.some(a => a.includes('showboat'))) throw new Error('not found');
      // agent-browser fails
      if (cmdStr === 'agent-browser' || cmdStr === 'npm') throw new Error('not found');
      // beads succeeds
      if (cmdStr === 'bd') return Buffer.from('bd 1.0.0');
      throw new Error('unexpected');
    });

    installAllDependencies({});

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('[FAIL]'))).toBe(true);
    expect(calls.some(c => c.includes('optional'))).toBe(true);
  });
});

describe('DEPENDENCY_REGISTRY', () => {
  it('contains showboat, agent-browser, and beads', () => {
    const names = DEPENDENCY_REGISTRY.map(d => d.name);
    expect(names).toContain('showboat');
    expect(names).toContain('agent-browser');
    expect(names).toContain('beads');
  });

  it('beads is not critical', () => {
    const beads = DEPENDENCY_REGISTRY.find(d => d.name === 'beads');
    expect(beads?.critical).toBe(false);
  });

  it('showboat and agent-browser are not critical', () => {
    const showboat = DEPENDENCY_REGISTRY.find(d => d.name === 'showboat');
    const agentBrowser = DEPENDENCY_REGISTRY.find(d => d.name === 'agent-browser');
    expect(showboat?.critical).toBe(false);
    expect(agentBrowser?.critical).toBe(false);
  });

  it('showboat has pip and pipx fallback', () => {
    const showboat = DEPENDENCY_REGISTRY.find(d => d.name === 'showboat');
    expect(showboat?.installCommands).toHaveLength(2);
    expect(showboat?.installCommands[0].cmd).toBe('pip');
    expect(showboat?.installCommands[1].cmd).toBe('pipx');
  });

  it('agent-browser has single npm install command', () => {
    const ab = DEPENDENCY_REGISTRY.find(d => d.name === 'agent-browser');
    expect(ab?.installCommands).toHaveLength(1);
    expect(ab?.installCommands[0].cmd).toBe('npm');
  });

  it('beads has pip and pipx fallback', () => {
    const beads = DEPENDENCY_REGISTRY.find(d => d.name === 'beads');
    expect(beads?.installCommands).toHaveLength(2);
    expect(beads?.installCommands[0].cmd).toBe('pip');
    expect(beads?.installCommands[1].cmd).toBe('pipx');
  });
});

describe('CriticalDependencyError', () => {
  it('contains dependency name and reason', () => {
    const err = new CriticalDependencyError('beads', 'not found');
    expect(err.dependencyName).toBe('beads');
    expect(err.reason).toBe('not found');
    expect(err.name).toBe('CriticalDependencyError');
    expect(err.message).toContain('beads');
  });
});
