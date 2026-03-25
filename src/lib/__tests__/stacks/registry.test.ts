import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerProvider,
  getStackProvider,
  detectStacks,
  detectStack,
  _resetRegistry,
} from '../../stacks/registry.js';
import type { StackProvider } from '../../stacks/types.js';
import { NodejsProvider } from '../../stacks/nodejs.js';

let testDir: string;

/** Create a minimal mock provider for testing. */
function mockProvider(overrides: Partial<StackProvider> & Pick<StackProvider, 'name' | 'markers' | 'displayName'>): StackProvider {
  return {
    detectAppType: () => 'generic',
    getCoverageTool: () => 'none',
    detectCoverageConfig: () => ({ tool: 'none' }),
    getOtlpPackages: () => [],
    installOtlp: () => ({ success: true, packagesInstalled: [] }),
    getDockerfileTemplate: () => '',
    getDockerBuildStage: () => '',
    getRuntimeCopyDirectives: () => '',
    getBuildCommands: () => [],
    getTestCommands: () => [],
    getSemgrepLanguages: () => [],
    parseTestOutput: () => ({ passed: 0, failed: 0, skipped: 0, total: 0 }),
    parseCoverageReport: () => 0,
    getProjectName: () => null,
    getVerifyDockerfileSection: () => '',
    ...overrides,
  };
}

beforeEach(() => {
  _resetRegistry();
  testDir = mkdtempSync(join(tmpdir(), 'ch-registry-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('registerProvider / getStackProvider', () => {
  it('returns undefined for unregistered provider', () => {
    expect(getStackProvider('nodejs')).toBeUndefined();
  });

  it('registers and retrieves a provider', () => {
    const provider = new NodejsProvider();
    registerProvider(provider);
    expect(getStackProvider('nodejs')).toBe(provider);
  });

  it('overwrites existing provider on re-registration', () => {
    const first = new NodejsProvider();
    const second = new NodejsProvider();
    registerProvider(first);
    registerProvider(second);
    expect(getStackProvider('nodejs')).toBe(second);
  });

  it('getStackProvider("nodejs") returns NodejsProvider instance (AC3)', () => {
    registerProvider(new NodejsProvider());
    const provider = getStackProvider('nodejs');
    expect(provider).toBeInstanceOf(NodejsProvider);
    expect(provider!.name).toBe('nodejs');
    expect(provider!.markers).toEqual(['package.json']);
    expect(provider!.displayName).toBe('Node.js (package.json)');
  });
});

describe('detectStacks — marker-based detection (AC2)', () => {
  it('detects nodejs when package.json exists', () => {
    registerProvider(new NodejsProvider());
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = detectStacks(testDir);
    expect(result).toEqual([{ stack: 'nodejs', dir: '.' }]);
  });

  it('detects python when requirements.txt exists', () => {
    registerProvider(mockProvider({
      name: 'python',
      markers: ['requirements.txt', 'pyproject.toml', 'setup.py'],
      displayName: 'Python',
    }));
    writeFileSync(join(testDir, 'requirements.txt'), '');
    const result = detectStacks(testDir);
    expect(result).toEqual([{ stack: 'python', dir: '.' }]);
  });

  it('detects multiple stacks at root in priority order', () => {
    registerProvider(new NodejsProvider());
    registerProvider(mockProvider({
      name: 'rust',
      markers: ['Cargo.toml'],
      displayName: 'Rust',
    }));
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname="x"');
    const result = detectStacks(testDir);
    expect(result).toEqual([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: '.' },
    ]);
  });

  it('detects stacks in subdirectories', () => {
    registerProvider(new NodejsProvider());
    registerProvider(mockProvider({
      name: 'rust',
      markers: ['Cargo.toml'],
      displayName: 'Rust',
    }));
    mkdirSync(join(testDir, 'frontend'));
    mkdirSync(join(testDir, 'backend'));
    writeFileSync(join(testDir, 'frontend', 'package.json'), '{}');
    writeFileSync(join(testDir, 'backend', 'Cargo.toml'), '[package]\nname="api"');
    const result = detectStacks(testDir);
    expect(result).toEqual([
      { stack: 'rust', dir: 'backend' },
      { stack: 'nodejs', dir: 'frontend' },
    ]);
  });

  it('returns empty array when no providers are registered', () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = detectStacks(testDir);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty directory', () => {
    registerProvider(new NodejsProvider());
    const result = detectStacks(testDir);
    expect(result).toEqual([]);
  });

  it('skips node_modules during subdirectory scan', () => {
    registerProvider(new NodejsProvider());
    mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(testDir, 'node_modules', 'pkg', 'package.json'), '{}');
    const result = detectStacks(testDir);
    expect(result).toEqual([]);
  });

  it('skips .git directory during subdirectory scan', () => {
    registerProvider(new NodejsProvider());
    mkdirSync(join(testDir, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(testDir, '.git', 'package.json'), '{}');
    const result = detectStacks(testDir);
    expect(result).toEqual([]);
  });

  it('root stacks appear before subdirectory stacks', () => {
    registerProvider(new NodejsProvider());
    registerProvider(mockProvider({
      name: 'rust',
      markers: ['Cargo.toml'],
      displayName: 'Rust',
    }));
    writeFileSync(join(testDir, 'package.json'), '{}');
    mkdirSync(join(testDir, 'api'));
    writeFileSync(join(testDir, 'api', 'Cargo.toml'), '[package]\nname="api"');
    const result = detectStacks(testDir);
    expect(result).toEqual([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: 'api' },
    ]);
  });

  it('subdirectory stacks sorted alphabetically', () => {
    registerProvider(new NodejsProvider());
    mkdirSync(join(testDir, 'zeta'));
    mkdirSync(join(testDir, 'alpha'));
    writeFileSync(join(testDir, 'zeta', 'package.json'), '{}');
    writeFileSync(join(testDir, 'alpha', 'package.json'), '{}');
    const result = detectStacks(testDir);
    expect(result).toEqual([
      { stack: 'nodejs', dir: 'alpha' },
      { stack: 'nodejs', dir: 'zeta' },
    ]);
  });

  it('uses marker arrays from providers, not hardcoded checks', () => {
    // Register a provider with a custom marker to prove detection uses provider markers
    registerProvider(mockProvider({
      name: 'python',
      markers: ['custom-python-marker.txt'],
      displayName: 'Python (custom)',
    }));
    writeFileSync(join(testDir, 'custom-python-marker.txt'), '');
    const result = detectStacks(testDir);
    expect(result).toEqual([{ stack: 'python', dir: '.' }]);
  });
});

describe('detectStack — compat wrapper', () => {
  it('returns first root stack name', () => {
    registerProvider(new NodejsProvider());
    writeFileSync(join(testDir, 'package.json'), '{}');
    expect(detectStack(testDir)).toBe('nodejs');
  });

  it('returns null when no root stack detected', () => {
    registerProvider(new NodejsProvider());
    expect(detectStack(testDir)).toBeNull();
  });

  it('returns null when stacks only in subdirectories', () => {
    registerProvider(new NodejsProvider());
    mkdirSync(join(testDir, 'sub'));
    writeFileSync(join(testDir, 'sub', 'package.json'), '{}');
    expect(detectStack(testDir)).toBeNull();
  });
});
