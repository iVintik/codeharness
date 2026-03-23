import { execFileSync } from 'node:child_process';
import { ok, fail as failOutput, info } from './output.js';

export interface InstallCommand {
  cmd: string;
  args: string[];
}

export interface DependencySpec {
  name: string;
  displayName: string;
  installCommands: InstallCommand[];
  checkCommand: InstallCommand;
  critical: boolean;
}

export interface DependencyResult {
  name: string;
  displayName: string;
  status: 'installed' | 'already-installed' | 'skipped' | 'failed';
  version: string | null;
  error?: string;
}

export const DEPENDENCY_REGISTRY: readonly DependencySpec[] = [
  {
    name: 'showboat',
    displayName: 'Showboat',
    installCommands: [
      { cmd: 'pip', args: ['install', 'showboat'] },
      { cmd: 'pipx', args: ['install', 'showboat'] },
    ],
    checkCommand: { cmd: 'showboat', args: ['--version'] },
    critical: false,
  },
  {
    name: 'agent-browser',
    displayName: 'agent-browser',
    installCommands: [
      { cmd: 'npm', args: ['install', '-g', '@anthropic/agent-browser'] },
    ],
    checkCommand: { cmd: 'agent-browser', args: ['--version'] },
    critical: false,
  },
  {
    name: 'beads',
    displayName: 'beads',
    installCommands: [
      { cmd: 'pip', args: ['install', 'beads'] },
      { cmd: 'pipx', args: ['install', 'beads'] },
    ],
    checkCommand: { cmd: 'bd', args: ['--version'] },
    critical: false,
  },
  {
    name: 'semgrep',
    displayName: 'Semgrep',
    installCommands: [
      { cmd: 'pipx', args: ['install', 'semgrep'] },
      { cmd: 'pip', args: ['install', 'semgrep'] },
    ],
    checkCommand: { cmd: 'semgrep', args: ['--version'] },
    critical: false,
  },
  {
    name: 'bats',
    displayName: 'BATS',
    installCommands: [
      { cmd: 'brew', args: ['install', 'bats-core'] },
      { cmd: 'npm', args: ['install', '-g', 'bats'] },
    ],
    checkCommand: { cmd: 'bats', args: ['--version'] },
    critical: false,
  },
  {
    name: 'cargo-tarpaulin',
    displayName: 'cargo-tarpaulin',
    installCommands: [{ cmd: 'cargo', args: ['install', 'cargo-tarpaulin'] }],
    checkCommand: { cmd: 'cargo', args: ['tarpaulin', '--version'] },
    critical: false,
  },
];

export function checkInstalled(spec: DependencySpec): { installed: boolean; version: string | null } {
  try {
    const output = execFileSync(spec.checkCommand.cmd, spec.checkCommand.args, { stdio: 'pipe', timeout: 15_000 }).toString().trim();
    const version = parseVersion(output);
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
}

export function parseVersion(output: string): string | null {
  const match = /(\d+\.\d+[\w.-]*)/.exec(output);
  return match ? match[1] : null;
}

export function installDependency(spec: DependencySpec): DependencyResult {
  // Check if already installed
  const check = checkInstalled(spec);
  if (check.installed) {
    return {
      name: spec.name,
      displayName: spec.displayName,
      status: 'already-installed',
      version: check.version,
    };
  }

  // Try each install command in the fallback chain
  for (const installCmd of spec.installCommands) {
    try {
      execFileSync(installCmd.cmd, installCmd.args, { stdio: 'pipe', timeout: 300_000 });

      // Verify installation succeeded by checking version
      const postCheck = checkInstalled(spec);
      if (postCheck.installed) {
        return {
          name: spec.name,
          displayName: spec.displayName,
          status: 'installed',
          version: postCheck.version,
        };
      }
    } catch {
      // Try next fallback
      continue;
    }
  }

  // All install commands failed
  const remedy = spec.installCommands.map(c => [c.cmd, ...c.args].join(' ')).join(' or ');
  return {
    name: spec.name,
    displayName: spec.displayName,
    status: 'failed',
    version: null,
    error: `Install failed. Try: ${remedy}`,
  };
}

export function installAllDependencies(opts: { json?: boolean }): DependencyResult[] {
  const results: DependencyResult[] = [];

  for (const spec of DEPENDENCY_REGISTRY) {
    const result = installDependency(spec);
    results.push(result);

    if (!opts.json) {
      if (result.status === 'installed') {
        const versionStr = result.version ? ` (v${result.version})` : '';
        ok(`${spec.displayName}: installed${versionStr}`);
      } else if (result.status === 'already-installed') {
        const versionStr = result.version ? ` (v${result.version})` : '';
        ok(`${spec.displayName}: already installed${versionStr}`);
      } else if (result.status === 'failed') {
        failOutput(`${spec.displayName}: install failed. ${result.error ?? ''}`);
        if (!spec.critical) {
          info(`${spec.displayName} is optional — continuing without it`);
        }
      }
    }

    if (result.status === 'failed' && spec.critical) {
      throw new CriticalDependencyError(spec.displayName, result.error ?? 'Install failed');
    }
  }

  return results;
}

export class CriticalDependencyError extends Error {
  constructor(
    public readonly dependencyName: string,
    public readonly reason: string,
  ) {
    super(`Critical dependency '${dependencyName}' failed to install: ${reason}`);
    this.name = 'CriticalDependencyError';
  }
}
