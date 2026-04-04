import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';
import {
  checkInstalled,
  installDependency,
  installAllDependencies,
  filterDepsForStacks,
  parseVersion,
  CriticalDependencyError,
  DEPENDENCY_REGISTRY,
} from '../deps.js';
import type { DependencySpec } from '../deps.js';

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.restoreAllMocks();
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
      { cmd: 'npm', args: ['install', '-g', 'showboat'] },
      { cmd: 'brew', args: ['install', 'showboat'] },
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
    mockExecFileSync.mockImplementation((cmd: string) => {
      const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
      if (cmdStr === 'showboat') {
        checkCount++;
        if (checkCount === 1) throw new Error('not found');
        return Buffer.from('showboat 0.6.1');
      }
      return Buffer.from('');
    });

    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('installed');
    expect(result.version).toBe('0.6.1');
  });

  it('falls back to secondary command when primary fails', () => {
    let checkCount = 0;
    mockExecFileSync.mockImplementation((cmd: string) => {
      const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
      if (cmdStr === 'showboat') {
        checkCount++;
        if (checkCount === 1) throw new Error('not found');
        return Buffer.from('showboat 0.6.1');
      }
      if (cmdStr === 'npm') throw new Error('npm failed');
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
    expect(result.error).toContain('npm install -g showboat');
    expect(result.error).toContain('pipx install showboat');
  });

  it('returns failed when install succeeds but post-check fails', () => {
    mockExecFileSync.mockImplementation((cmd: string) => {
      const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
      if (cmdStr === 'showboat') throw new Error('not found');
      return Buffer.from('');
    });

    const result = installDependency(nonCriticalSpec);
    expect(result.status).toBe('failed');
  });

  describe('semgrep entry', () => {
    const semgrepSpec = DEPENDENCY_REGISTRY.find(d => d.name === 'semgrep')!;

    it('returns already-installed when semgrep is present', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('1.56.0'));
      const result = installDependency(semgrepSpec);
      expect(result.status).toBe('already-installed');
      expect(result.version).toBe('1.56.0');
    });

    it('installs semgrep via pipx (primary) and returns installed', () => {
      let checkCount = 0;
      mockExecFileSync.mockImplementation((cmd: string) => {
        const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
        if (cmdStr === 'semgrep') {
          checkCount++;
          if (checkCount === 1) throw new Error('not found');
          return Buffer.from('1.56.0');
        }
        return Buffer.from('');
      });

      const result = installDependency(semgrepSpec);
      expect(result.status).toBe('installed');
      expect(result.version).toBe('1.56.0');
    });

    it('falls back to uvx when pipx fails', () => {
      let checkCount = 0;
      mockExecFileSync.mockImplementation((cmd: string) => {
        const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
        if (cmdStr === 'semgrep') {
          checkCount++;
          if (checkCount === 1) throw new Error('not found');
          return Buffer.from('1.56.0');
        }
        if (cmdStr === 'pipx') throw new Error('pipx not found');
        return Buffer.from('');
      });

      const result = installDependency(semgrepSpec);
      expect(result.status).toBe('installed');
      expect(result.version).toBe('1.56.0');
    });

    it('returns failed when all install commands fail', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });

      const result = installDependency(semgrepSpec);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('pipx install semgrep');
      expect(result.error).toContain('uvx install semgrep');
    });
  });

  describe('bats entry', () => {
    const batsSpec = DEPENDENCY_REGISTRY.find(d => d.name === 'bats')!;

    it('returns already-installed when bats is present', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('Bats 1.11.0'));
      const result = installDependency(batsSpec);
      expect(result.status).toBe('already-installed');
      expect(result.version).toBe('1.11.0');
    });

    it('installs bats via brew (primary) and returns installed', () => {
      let checkCount = 0;
      mockExecFileSync.mockImplementation((cmd: string) => {
        const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
        if (cmdStr === 'bats') {
          checkCount++;
          if (checkCount === 1) throw new Error('not found');
          return Buffer.from('Bats 1.11.0');
        }
        return Buffer.from('');
      });

      const result = installDependency(batsSpec);
      expect(result.status).toBe('installed');
      expect(result.version).toBe('1.11.0');
    });

    it('falls back to npm when brew fails', () => {
      let checkCount = 0;
      mockExecFileSync.mockImplementation((cmd: string) => {
        const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
        if (cmdStr === 'bats') {
          checkCount++;
          if (checkCount === 1) throw new Error('not found');
          return Buffer.from('Bats 1.11.0');
        }
        if (cmdStr === 'brew') throw new Error('brew not found');
        return Buffer.from('');
      });

      const result = installDependency(batsSpec);
      expect(result.status).toBe('installed');
      expect(result.version).toBe('1.11.0');
    });

    it('returns failed when both brew and npm fail', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });

      const result = installDependency(batsSpec);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('brew install bats-core');
      expect(result.error).toContain('npm install -g bats');
    });
  });

  describe('cargo-tarpaulin entry', () => {
    const cargoTarpaulinSpec = DEPENDENCY_REGISTRY.find(d => d.name === 'cargo-tarpaulin')!;

    it('returns already-installed when cargo tarpaulin --version succeeds', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('cargo-tarpaulin 0.27.3'));
      const result = installDependency(cargoTarpaulinSpec);
      expect(result.status).toBe('already-installed');
      expect(result.version).toBe('0.27.3');
    });

    it('installs via cargo install cargo-tarpaulin and returns installed', () => {
      let checkCount = 0;
      mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
        const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
        const argsArr = Array.isArray(args) ? args.map(String) : [];
        if (cmdStr === 'cargo' && argsArr[0] === 'tarpaulin') {
          checkCount++;
          if (checkCount === 1) throw new Error('not found');
          return Buffer.from('cargo-tarpaulin 0.27.3');
        }
        return Buffer.from('');
      });

      const result = installDependency(cargoTarpaulinSpec);
      expect(result.status).toBe('installed');
      expect(result.version).toBe('0.27.3');
    });

    it('returns failed when cargo command not found', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });

      const result = installDependency(cargoTarpaulinSpec);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('cargo install cargo-tarpaulin');
    });

    it('cargo-tarpaulin is not critical', () => {
      expect(cargoTarpaulinSpec.critical).toBe(false);
    });

    it('has single install command via cargo', () => {
      expect(cargoTarpaulinSpec.installCommands).toHaveLength(1);
      expect(cargoTarpaulinSpec.installCommands[0].cmd).toBe('cargo');
      expect(cargoTarpaulinSpec.installCommands[0].args).toEqual(['install', 'cargo-tarpaulin']);
    });

    it('check command is cargo tarpaulin --version', () => {
      expect(cargoTarpaulinSpec.checkCommand.cmd).toBe('cargo');
      expect(cargoTarpaulinSpec.checkCommand.args).toEqual(['tarpaulin', '--version']);
    });
  });
});

describe('installAllDependencies', () => {
  it('installs all dependencies and returns results', () => {
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

  it('throws CriticalDependencyError when a critical dep fails to install', () => {
    const registry = DEPENDENCY_REGISTRY as unknown as Array<{ critical: boolean }>;
    const originalCritical = registry[0].critical;
    registry[0].critical = true;

    try {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('command failed');
      });

      expect(() => installAllDependencies({})).toThrow(CriticalDependencyError);
      expect(() => installAllDependencies({})).toThrow(/Showboat/);
    } finally {
      registry[0].critical = originalCritical;
    }
  });

  it('continues when non-critical dep fails', () => {
    mockExecFileSync.mockImplementation((cmd: string) => {
      const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
      // bats succeeds
      if (cmdStr === 'bats') return Buffer.from('Bats 1.11.0');
      throw new Error('not found');
    });

    const results = installAllDependencies({});
    const failed = results.filter(r => r.status === 'failed');
    expect(failed.length).toBeGreaterThanOrEqual(1);
    const batsResult = results.find(r => r.name === 'bats');
    expect(batsResult?.status).toBe('already-installed');
  });

  it('prints OK messages for installed dependencies (non-json mode)', () => {
    const logSpy = vi.spyOn(console, 'log');
    mockExecFileSync.mockReturnValue(Buffer.from('tool 1.0.0'));

    installAllDependencies({ json: false });

    const calls = logSpy.mock.calls.map(c => c[0]);
    expect(calls.some(c => typeof c === 'string' && c.includes('[OK]'))).toBe(true);
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

    mockExecFileSync.mockImplementation((cmd: string) => {
      const cmdStr = typeof cmd === 'string' ? cmd : String(cmd);
      // bats succeeds, everything else fails
      if (cmdStr === 'bats') return Buffer.from('Bats 1.11.0');
      throw new Error('not found');
    });

    installAllDependencies({});

    const calls = logSpy.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('[FAIL]'))).toBe(true);
    expect(calls.some(c => c.includes('optional'))).toBe(true);
  });
});

describe('filterDepsForStacks', () => {
  it('returns all deps when no stacks filter (unconditional deps)', () => {
    const all = filterDepsForStacks([]);
    // Only unconditional deps (no stacks field)
    const unconditional = DEPENDENCY_REGISTRY.filter(d => !d.stacks);
    expect(all).toHaveLength(unconditional.length);
  });

  it('includes agent-browser for nodejs stack', () => {
    const deps = filterDepsForStacks(['nodejs']);
    expect(deps.some(d => d.name === 'agent-browser')).toBe(true);
  });

  it('includes agent-browser for python stack', () => {
    const deps = filterDepsForStacks(['python']);
    expect(deps.some(d => d.name === 'agent-browser')).toBe(true);
  });

  it('excludes agent-browser for go stack', () => {
    const deps = filterDepsForStacks(['go']);
    expect(deps.some(d => d.name === 'agent-browser')).toBe(false);
  });

  it('includes cargo-tarpaulin for rust stack', () => {
    const deps = filterDepsForStacks(['rust']);
    expect(deps.some(d => d.name === 'cargo-tarpaulin')).toBe(true);
  });

  it('excludes cargo-tarpaulin for nodejs stack', () => {
    const deps = filterDepsForStacks(['nodejs']);
    expect(deps.some(d => d.name === 'cargo-tarpaulin')).toBe(false);
  });

  it('includes both conditional deps for multi-stack project', () => {
    const deps = filterDepsForStacks(['nodejs', 'rust']);
    expect(deps.some(d => d.name === 'agent-browser')).toBe(true);
    expect(deps.some(d => d.name === 'cargo-tarpaulin')).toBe(true);
  });

  it('stacks filter works with installAllDependencies', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('tool 1.0.0'));

    const goResults = installAllDependencies({ stacks: ['go'] });
    expect(goResults.some(d => d.name === 'agent-browser')).toBe(false);
    expect(goResults.some(d => d.name === 'cargo-tarpaulin')).toBe(false);

    const rustResults = installAllDependencies({ stacks: ['rust'] });
    expect(rustResults.some(d => d.name === 'cargo-tarpaulin')).toBe(true);
  });
});

describe('DEPENDENCY_REGISTRY', () => {
  it('contains showboat, agent-browser, semgrep, bats, and cargo-tarpaulin', () => {
    const names = DEPENDENCY_REGISTRY.map(d => d.name);
    expect(names).toContain('showboat');
    expect(names).toContain('agent-browser');
    expect(names).toContain('semgrep');
    expect(names).toContain('bats');
    expect(names).toContain('cargo-tarpaulin');
  });

  it('has exactly 5 entries', () => {
    expect(DEPENDENCY_REGISTRY).toHaveLength(5);
  });

  it('showboat and agent-browser are not critical', () => {
    const showboat = DEPENDENCY_REGISTRY.find(d => d.name === 'showboat');
    const agentBrowser = DEPENDENCY_REGISTRY.find(d => d.name === 'agent-browser');
    expect(showboat?.critical).toBe(false);
    expect(agentBrowser?.critical).toBe(false);
  });

  it('showboat has npm, brew, pipx fallback chain', () => {
    const showboat = DEPENDENCY_REGISTRY.find(d => d.name === 'showboat');
    expect(showboat?.installCommands).toHaveLength(3);
    expect(showboat?.installCommands[0].cmd).toBe('npm');
    expect(showboat?.installCommands[1].cmd).toBe('brew');
    expect(showboat?.installCommands[2].cmd).toBe('pipx');
  });

  it('agent-browser has single npm install command', () => {
    const ab = DEPENDENCY_REGISTRY.find(d => d.name === 'agent-browser');
    expect(ab?.installCommands).toHaveLength(1);
    expect(ab?.installCommands[0].cmd).toBe('npm');
  });

  it('agent-browser is conditional on nodejs/python stacks', () => {
    const ab = DEPENDENCY_REGISTRY.find(d => d.name === 'agent-browser');
    expect(ab?.stacks).toEqual(['nodejs', 'python']);
  });

  it('cargo-tarpaulin is conditional on rust stack', () => {
    const ct = DEPENDENCY_REGISTRY.find(d => d.name === 'cargo-tarpaulin');
    expect(ct?.stacks).toEqual(['rust']);
  });

  it('semgrep has pipx, uvx, brew fallback chain', () => {
    const semgrep = DEPENDENCY_REGISTRY.find(d => d.name === 'semgrep');
    expect(semgrep?.installCommands).toHaveLength(3);
    expect(semgrep?.installCommands[0].cmd).toBe('pipx');
    expect(semgrep?.installCommands[1].cmd).toBe('uvx');
    expect(semgrep?.installCommands[2].cmd).toBe('brew');
  });

  it('bats has brew as primary and npm as fallback', () => {
    const bats = DEPENDENCY_REGISTRY.find(d => d.name === 'bats');
    expect(bats?.installCommands).toHaveLength(2);
    expect(bats?.installCommands[0].cmd).toBe('brew');
    expect(bats?.installCommands[0].args).toEqual(['install', 'bats-core']);
    expect(bats?.installCommands[1].cmd).toBe('npm');
    expect(bats?.installCommands[1].args).toEqual(['install', '-g', 'bats']);
  });
});

describe('CriticalDependencyError', () => {
  it('contains dependency name and reason', () => {
    const err = new CriticalDependencyError('showboat', 'not found');
    expect(err.dependencyName).toBe('showboat');
    expect(err.reason).toBe('not found');
    expect(err.name).toBe('CriticalDependencyError');
    expect(err.message).toContain('showboat');
  });
});
