import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock all lib modules
vi.mock('../../../lib/stacks/index.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../lib/stacks/index.js')>();
  return { ...orig, detectStacks: vi.fn(orig.detectStacks), detectAppType: vi.fn(orig.detectAppType) };
});

vi.mock('../docs-scaffold.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../docs-scaffold.js')>();
  return { ...orig, getCoverageTool: vi.fn(orig.getCoverageTool), getStackLabel: vi.fn(orig.getStackLabel) };
});

vi.mock('../../../lib/stack-path.js', () => ({
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  ensureStackDir: vi.fn(),
}));

vi.mock('../../../lib/docker/index.js', () => ({
  isDockerAvailable: vi.fn(() => true),
  isSharedStackRunning: vi.fn(() => false),
  startSharedStack: vi.fn(() => ({
    started: true,
    services: [{ name: 'otel-collector', status: 'running', port: '4317,4318' }],
  })),
  startCollectorOnly: vi.fn(() => ({
    started: true,
    services: [{ name: 'otel-collector', status: 'running', port: '4317,4318' }],
  })),
}));

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
  CriticalDependencyError: class extends Error {
    constructor(d: string, r: string) { super(`Critical dependency '${d}' failed: ${r}`); this.name = 'CriticalDependencyError'; }
  },
}));

vi.mock('../../../lib/beads.js', () => ({
  isBeadsInitialized: vi.fn(() => false),
  initBeads: vi.fn(),
  detectBeadsHooks: vi.fn(() => ({ hasHooks: false, hookTypes: [] })),
  configureHookCoexistence: vi.fn(),
  BeadsError: class extends Error {
    constructor(c: string, m: string) { super(`Beads failed: ${m}`); this.name = 'BeadsError'; }
  },
}));

vi.mock('../../../lib/bmad.js', () => ({
  isBmadInstalled: vi.fn(() => false),
  installBmad: vi.fn(() => ({ status: 'installed', version: '6.0.0', patches_applied: [] })),
  applyAllPatches: vi.fn(() => []),
  detectBmadVersion: vi.fn(() => '6.0.0'),
  detectBmalph: vi.fn(() => ({ detected: false, files: [] })),
  BmadError: class extends Error {
    constructor(c: string, m: string) { super(`BMAD failed: ${m}`); this.name = 'BmadError'; }
  },
}));

vi.mock('../../../lib/observability/index.js', () => ({
  instrumentProject: vi.fn(() => ({
    status: 'configured',
    packages_installed: true,
    start_script_patched: true,
    env_vars_configured: true,
  })),
  configureOtlpEnvVars: vi.fn(),
}));

vi.mock('../../../lib/templates.js', () => ({
  generateFile: vi.fn(),
}));

vi.mock('../../../templates/readme.js', () => ({
  readmeTemplate: vi.fn(() => '# README'),
}));

import { isDockerAvailable } from '../../../lib/docker/index.js';
import { installAllDependencies, CriticalDependencyError } from '../../../lib/deps.js';
import { isBeadsInitialized, BeadsError } from '../../../lib/beads.js';
import { readState, writeState, getDefaultState } from '../../../lib/state.js';
import { detectStacks, detectAppType } from '../../../lib/stacks/index.js';
import { instrumentProject } from '../../../lib/observability/index.js';
import { getCoverageTool } from '../docs-scaffold.js';
import { initProject } from '../init-project.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockInstallAll = vi.mocked(installAllDependencies);
const mockIsBeadsInitialized = vi.mocked(isBeadsInitialized);
const mockDetectStacks = vi.mocked(detectStacks);
const mockInstrumentProject = vi.mocked(instrumentProject);
const mockGetCoverageTool = vi.mocked(getCoverageTool);

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-init-project-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  process.exitCode = undefined;
  // Reset mocks to default implementations
  mockIsDockerAvailable.mockReturnValue(true);
  mockInstallAll.mockReturnValue([
    { name: 'showboat', displayName: 'Showboat', status: 'already-installed', version: '0.6.1' },
  ]);
  mockIsBeadsInitialized.mockReturnValue(false);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('initProject — fresh init', () => {
  it('returns ok result with correct structure', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('ok');
      expect(result.data.stack).toBe('nodejs');
      expect(result.data.enforcement).toEqual({ frontend: true, database: true, api: true });
    }
  });

  it('creates state file', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    const state = readState(testDir);
    expect(state.initialized).toBe(true);
    expect(state.stack).toBe('nodejs');
  });

  it('includes beads result', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    if (result.success) {
      expect(result.data.beads).toBeDefined();
      expect(result.data.beads!.status).toBe('initialized');
    }
  });

  it('includes bmad result', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    if (result.success) {
      expect(result.data.bmad).toBeDefined();
      expect(result.data.bmad!.status).toBe('installed');
    }
  });

  it('includes dependencies result', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    if (result.success) {
      expect(result.data.dependencies).toBeDefined();
      expect(result.data.dependencies!.length).toBeGreaterThan(0);
    }
  });
});

describe('initProject — idempotent re-run', () => {
  it('detects already initialized and returns early', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    // First init
    await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    // Second init (re-run)
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documentation.agents_md).toBe('exists');
    }
  });
});

describe('initProject — critical failures', () => {
  it('returns ok with fail status when Docker missing and observability on', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.error).toBe('Docker not installed');
    }
    expect(process.exitCode).toBe(1);
  });

  it('returns ok with fail status on critical dep failure', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAll.mockImplementation(() => {
      throw new CriticalDependencyError('git', 'not found');
    });
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
    }
    expect(process.exitCode).toBe(1);
  });
});

describe('initProject — non-critical failures', () => {
  it('continues when beads fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockImplementation(() => {
      throw new BeadsError('init', 'network error');
    });
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('ok');
      expect(result.data.beads!.status).toBe('failed');
    }
  });
});

describe('initProject — URL validation', () => {
  it('rejects invalid URL', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: true,
      otelEndpoint: 'not-a-url',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.error).toContain('Invalid URL');
    }
  });

  it('rejects combining otel-endpoint with backend URLs', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: true,
      otelEndpoint: 'http://remote:4318',
      logsUrl: 'http://logs:9428',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.error).toContain('Cannot combine');
    }
  });

  it('requires all three backend URLs', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: true,
      logsUrl: 'http://logs:9428',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('fail');
      expect(result.data.error).toContain('all three are required');
    }
  });
});

describe('initProject — observability modes', () => {
  it('skips OTLP when observability off', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.otlp!.status).toBe('skipped');
      expect(result.data.docker).toBeNull();
    }
  });
});

describe('initProject — unexpected errors', () => {
  it('returns fail instead of throwing on unexpected error', async () => {
    // Force an unexpected error by making detectStacks throw
    mockDetectStacks.mockImplementation(() => { throw new Error('kaboom'); });
    writeFileSync(join(testDir, 'package.json'), '{}');
    const result = await initProject({
      projectDir: testDir,
      frontend: true,
      database: true,
      api: true,
      observability: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('kaboom');
    }
  });
});

describe('initProject — multi-stack orchestration', () => {
  const defaultOpts = {
    projectDir: '', // set in beforeEach via testDir
    frontend: true,
    database: true,
    api: true,
    observability: true,
  };

  function makeOpts(overrides: Partial<typeof defaultOpts> = {}) {
    return { ...defaultOpts, projectDir: testDir, ...overrides };
  }

  it('calls getCoverageTool() once per detected stack and stores tools map (Task 6)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "test"');
    mockDetectStacks.mockReturnValue([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: '.' },
    ]);
    mockGetCoverageTool.mockClear();

    await initProject(makeOpts({ observability: false }));

    // getCoverageTool called for each stack in the loop + once for primary stack backward compat
    const calls = mockGetCoverageTool.mock.calls.map(c => c[0]);
    expect(calls).toContain('nodejs');
    expect(calls).toContain('rust');

    // Verify per-stack tools map is persisted in state
    const state = readState(testDir);
    expect(state.coverage.tools).toBeDefined();
    expect(state.coverage.tools!['nodejs']).toBe('c8');
    expect(state.coverage.tools!['rust']).toBe('cargo-tarpaulin');
  });

  it('calls instrumentProject() once per detected stack with correct dir (Task 7)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "test"');
    mockDetectStacks.mockReturnValue([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: 'services/backend' },
    ]);
    mockInstrumentProject.mockClear();

    await initProject(makeOpts({ observability: true }));

    expect(mockInstrumentProject).toHaveBeenCalledTimes(2);
    // First call: nodejs at project root
    expect(mockInstrumentProject.mock.calls[0][0]).toBe(testDir);
    expect(mockInstrumentProject.mock.calls[0][1]).toBe('nodejs');
    // Second call: rust at subdirectory
    expect(mockInstrumentProject.mock.calls[1][0]).toBe(join(testDir, 'services/backend'));
    expect(mockInstrumentProject.mock.calls[1][1]).toBe('rust');
  });

  it('info output includes all detected stacks label (Task 8)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "test"');
    mockDetectStacks.mockReturnValue([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: '.' },
    ]);

    await initProject(makeOpts({ observability: false }));

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0])
    );
    const stackLine = logCalls.find((l: string) => l.includes('Stack detected:'));
    expect(stackLine).toBeDefined();
    expect(stackLine).toContain('Node.js (package.json)');
    expect(stackLine).toContain('Rust (Cargo.toml)');
  });

  it('state file has stacks array and app_type from primary stack (Task 9)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "test"');
    mockDetectStacks.mockReturnValue([
      { stack: 'nodejs', dir: '.' },
      { stack: 'rust', dir: '.' },
    ]);

    await initProject(makeOpts({ observability: false }));

    const state = readState(testDir);
    expect(state.stacks).toEqual(['nodejs', 'rust']);
    expect(state.app_type).toBeDefined();
    // Primary stack coverage tool should be set for backward compat
    expect(state.coverage.tool).toBe('c8'); // nodejs primary
  });

  it('single-stack backward compat — single-stack project still works identically (Task 10)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockDetectStacks.mockReturnValue([{ stack: 'nodejs', dir: '.' }]);
    mockInstrumentProject.mockClear();

    const result = await initProject(makeOpts({ observability: true }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stack).toBe('nodejs');
      expect(result.data.stacks).toEqual(['nodejs']);
    }

    const state = readState(testDir);
    expect(state.stack).toBe('nodejs');
    expect(state.stacks).toEqual(['nodejs']);
    expect(state.coverage.tool).toBe('c8');

    // instrumentProject called exactly once for single stack
    expect(mockInstrumentProject).toHaveBeenCalledTimes(1);
    expect(mockInstrumentProject.mock.calls[0][1]).toBe('nodejs');
  });

  it('OTLP result.otlp comes from root detection, not first matching stack name', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    // Subdirectory detection appears first but root detection appears second
    mockDetectStacks.mockReturnValue([
      { stack: 'nodejs', dir: 'packages/app' },
      { stack: 'nodejs', dir: '.' },
    ]);
    const rootOtlp = { status: 'configured' as const, packages_installed: true, start_script_patched: true, env_vars_configured: true };
    const subOtlp = { status: 'configured' as const, packages_installed: false, start_script_patched: false, env_vars_configured: false };
    mockInstrumentProject.mockClear();
    mockInstrumentProject.mockReturnValueOnce(subOtlp).mockReturnValueOnce(rootOtlp);

    const result = await initProject(makeOpts({ observability: true }));

    expect(result.success).toBe(true);
    if (result.success) {
      // result.otlp should be from the root detection (dir === '.'), not the subdirectory
      expect(result.data.otlp).toEqual(rootOtlp);
    }
  });
});
