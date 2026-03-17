import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerInitCommand, generateAgentsMdContent, generateDocsIndexContent, getCoverageTool, getStackLabel, getProjectName } from '../init.js';
import { readState, writeState, getDefaultState } from '../../lib/state.js';

// Mock the stack-path module
vi.mock('../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

// Mock the docker module
vi.mock('../../lib/docker.js', () => ({
  isDockerAvailable: vi.fn(() => true),
  isSharedStackRunning: vi.fn(() => false),
  startSharedStack: vi.fn(() => ({
    started: true,
    services: [
      { name: 'victoria-logs', status: 'running', port: '9428' },
      { name: 'victoria-metrics', status: 'running', port: '8428' },
      { name: 'victoria-traces', status: 'running', port: '16686' },
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
    ],
  })),
  startCollectorOnly: vi.fn(() => ({
    started: true,
    services: [
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
    ],
  })),
}));

// Mock the deps module
vi.mock('../../lib/deps.js', () => ({
  installAllDependencies: vi.fn(() => [
    { name: 'showboat', displayName: 'Showboat', status: 'already-installed', version: '0.6.1' },
    { name: 'agent-browser', displayName: 'agent-browser', status: 'already-installed', version: '1.0.0' },
    { name: 'beads', displayName: 'beads', status: 'already-installed', version: '2.0.0' },
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
    {
      name: 'agent-browser',
      displayName: 'agent-browser',
      installCommands: [{ cmd: 'npm', args: ['install', '-g', '@anthropic/agent-browser'] }],
      checkCommand: { cmd: 'agent-browser', args: ['--version'] },
      critical: false,
    },
    {
      name: 'beads',
      displayName: 'beads',
      installCommands: [{ cmd: 'pip', args: ['install', 'beads'] }],
      checkCommand: { cmd: 'bd', args: ['--version'] },
      critical: true,
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

// Mock the beads module
vi.mock('../../lib/beads.js', () => ({
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

// Mock the bmad module
vi.mock('../../lib/bmad.js', () => ({
  isBmadInstalled: vi.fn(() => false),
  installBmad: vi.fn(() => ({
    status: 'installed',
    version: '6.0.0',
    patches_applied: [],
  })),
  applyAllPatches: vi.fn(() => [
    { patchName: 'story-verification', targetFile: 'template.md', applied: true, updated: false },
    { patchName: 'dev-enforcement', targetFile: 'checklist.md', applied: true, updated: false },
    { patchName: 'review-enforcement', targetFile: 'checklist.md', applied: true, updated: false },
    { patchName: 'retro-enforcement', targetFile: 'instructions.md', applied: true, updated: false },
    { patchName: 'sprint-beads', targetFile: 'checklist.md', applied: true, updated: false },
  ]),
  detectBmadVersion: vi.fn(() => '6.0.0'),
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

// Mock the otlp module
vi.mock('../../lib/otlp.js', () => ({
  instrumentProject: vi.fn(() => ({
    status: 'configured',
    packages_installed: true,
    start_script_patched: true,
    env_vars_configured: true,
  })),
  configureOtlpEnvVars: vi.fn(),
}));

import { isDockerAvailable, isSharedStackRunning, startSharedStack, startCollectorOnly } from '../../lib/docker.js';
import { installAllDependencies, CriticalDependencyError, checkInstalled } from '../../lib/deps.js';
import { instrumentProject } from '../../lib/otlp.js';
import { isBeadsInitialized, initBeads, detectBeadsHooks, configureHookCoexistence, BeadsError } from '../../lib/beads.js';
import { isBmadInstalled, installBmad, applyAllPatches, detectBmadVersion, BmadError } from '../../lib/bmad.js';

const mockIsBmadInstalled = vi.mocked(isBmadInstalled);
const mockInstallBmad = vi.mocked(installBmad);
const mockApplyAllPatches = vi.mocked(applyAllPatches);
const mockDetectBmadVersion = vi.mocked(detectBmadVersion);

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockIsSharedStackRunning = vi.mocked(isSharedStackRunning);
const mockStartSharedStack = vi.mocked(startSharedStack);
const mockStartCollectorOnly = vi.mocked(startCollectorOnly);
const mockInstallAllDependencies = vi.mocked(installAllDependencies);
const mockCheckInstalled = vi.mocked(checkInstalled);
const mockInstrumentProject = vi.mocked(instrumentProject);
const mockIsBeadsInitialized = vi.mocked(isBeadsInitialized);
const mockInitBeads = vi.mocked(initBeads);
const mockDetectBeadsHooks = vi.mocked(detectBeadsHooks);
const mockConfigureHookCoexistence = vi.mocked(configureHookCoexistence);

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-init-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  mockIsDockerAvailable.mockReturnValue(true);
  mockIsSharedStackRunning.mockReturnValue(false);
  mockIsBeadsInitialized.mockReturnValue(false);
  mockInitBeads.mockImplementation(() => {});
  mockDetectBeadsHooks.mockReturnValue({ hasHooks: false, hookTypes: [] });
  mockConfigureHookCoexistence.mockImplementation(() => {});
  mockIsBmadInstalled.mockReturnValue(false);
  mockInstallBmad.mockReturnValue({
    status: 'installed',
    version: '6.0.0',
    patches_applied: [],
  });
  mockApplyAllPatches.mockReturnValue([
    { patchName: 'story-verification', targetFile: 'template.md', applied: true, updated: false },
    { patchName: 'dev-enforcement', targetFile: 'checklist.md', applied: true, updated: false },
    { patchName: 'review-enforcement', targetFile: 'checklist.md', applied: true, updated: false },
    { patchName: 'retro-enforcement', targetFile: 'instructions.md', applied: true, updated: false },
    { patchName: 'sprint-beads', targetFile: 'checklist.md', applied: true, updated: false },
  ]);
  mockDetectBmadVersion.mockReturnValue('6.0.0');
  mockStartSharedStack.mockReturnValue({
    started: true,
    services: [
      { name: 'victoria-logs', status: 'running', port: '9428' },
      { name: 'victoria-metrics', status: 'running', port: '8428' },
      { name: 'victoria-traces', status: 'running', port: '16686' },
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
    ],
  });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerInitCommand(program);
  return program;
}

async function runCli(args: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const logs: string[] = [];
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  process.exitCode = undefined;

  const program = createCli();
  await program.parseAsync(['node', 'codeharness', ...args]);

  consoleSpy.mockRestore();
  const exitCode = process.exitCode;
  process.exitCode = undefined;

  return { stdout: logs.join('\n'), exitCode };
}

describe('init command — stack detection', () => {
  it('detects Node.js project', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[INFO] Stack detected: Node.js (package.json)');
  });

  it('detects Python project (requirements.txt)', async () => {
    writeFileSync(join(testDir, 'requirements.txt'), '');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[INFO] Stack detected: Python');
  });

  it('warns when no stack detected', async () => {
    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[WARN] No recognized stack detected');
  });
});

describe('init command — enforcement flags', () => {
  it('defaults all enforcement to ON', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('frontend:ON database:ON api:ON observability:ON');
  });

  it('--no-frontend disables frontend', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init', '--no-frontend']);
    expect(stdout).toContain('frontend:OFF');
  });

  it('--no-database disables database', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init', '--no-database']);
    expect(stdout).toContain('database:OFF');
  });

  it('--no-api disables api', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init', '--no-api']);
    expect(stdout).toContain('api:OFF');
  });

  it('enforcement flags are stored in state', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init', '--no-frontend']);

    const state = readState(testDir);
    expect(state.enforcement.frontend).toBe(false);
    expect(state.enforcement.database).toBe(true);
    expect(state.enforcement.api).toBe(true);
  });
});

describe('init command — Docker check', () => {
  it('degrades gracefully when Docker not installed', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { stdout, exitCode } = await runCli(['init']);
    expect(stdout).toContain('[WARN] Docker not available — observability will use remote mode');
    expect(stdout).toContain('[INFO] → Install Docker: https://docs.docker.com/engine/install/');
    expect(stdout).toContain('[INFO] → Or use remote endpoints: codeharness init --otel-endpoint <url>');
    expect(stdout).toContain('Observability: deferred');
    // Init should NOT fail
    expect(exitCode).toBeUndefined();
  });

  it('succeeds when Docker is available', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(true);

    const { stdout, exitCode } = await runCli(['init']);
    expect(stdout).toContain('[OK] Docker: available');
    expect(exitCode).toBeUndefined();
  });
});

describe('init command — state file creation', () => {
  it('creates state file with correct structure', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.initialized).toBe(true);
    expect(state.stack).toBe('nodejs');
    expect(state.enforcement.frontend).toBe(true);
    expect(state.enforcement.database).toBe(true);
    expect(state.enforcement.api).toBe(true);
    expect(state.coverage.target).toBe(90);
    expect(state.coverage.tool).toBe('c8');
    expect(state.session_flags.logs_queried).toBe(false);
    expect(state.session_flags.tests_passed).toBe(false);
    expect(state.session_flags.coverage_met).toBe(false);
    expect(state.session_flags.verification_run).toBe(false);
    expect(state.verification_log).toEqual([]);
  });

  it('prints state file creation message', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[OK] State file: .claude/codeharness.local.md created');
  });

  it('sets harness_version from package.json', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.harness_version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('init command — AGENTS.md generation', () => {
  it('generates AGENTS.md when not present', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const agentsPath = join(testDir, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('Node.js');
    expect(content).toContain('npm');
  });

  it('AGENTS.md content is under 100 lines', () => {
    const content = generateAgentsMdContent('/tmp/test-project', 'nodejs');
    const lines = content.split('\n');
    expect(lines.length).toBeLessThanOrEqual(100);
  });

  it('does not overwrite existing AGENTS.md', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'AGENTS.md'), 'custom content');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(content).toBe('custom content');
  });
});

describe('init command — docs/ scaffold', () => {
  it('creates docs/ scaffold with correct structure', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    expect(existsSync(join(testDir, 'docs', 'index.md'))).toBe(true);
    expect(existsSync(join(testDir, 'docs', 'exec-plans', 'active', '.gitkeep'))).toBe(true);
    expect(existsSync(join(testDir, 'docs', 'exec-plans', 'completed', '.gitkeep'))).toBe(true);
    expect(existsSync(join(testDir, 'docs', 'quality', '.gitkeep'))).toBe(true);
    expect(existsSync(join(testDir, 'docs', 'generated', '.gitkeep'))).toBe(true);
  });

  it('docs/index.md references artifacts by relative path', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const indexContent = readFileSync(join(testDir, 'docs', 'index.md'), 'utf-8');
    expect(indexContent).toContain('../_bmad-output/planning-artifacts/prd.md');
    expect(indexContent).toContain('exec-plans/active/');
  });

  it('generated files include DO NOT EDIT header', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const qualityKeep = readFileSync(join(testDir, 'docs', 'quality', '.gitkeep'), 'utf-8');
    expect(qualityKeep).toContain('<!-- DO NOT EDIT MANUALLY -->');

    const generatedKeep = readFileSync(join(testDir, 'docs', 'generated', '.gitkeep'), 'utf-8');
    expect(generatedKeep).toContain('<!-- DO NOT EDIT MANUALLY -->');
  });

  it('does not overwrite existing docs/', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mkdirSync(join(testDir, 'docs'), { recursive: true });
    writeFileSync(join(testDir, 'docs', 'custom.md'), 'custom');

    await runCli(['init']);

    expect(readFileSync(join(testDir, 'docs', 'custom.md'), 'utf-8')).toBe('custom');
    expect(existsSync(join(testDir, 'docs', 'index.md'))).toBe(false);
  });

  it('prints documentation creation message', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[OK] Documentation: AGENTS.md + docs/ scaffold created');
  });
});

describe('init command — README.md generation', () => {
  it('creates README.md when not present', async () => {
    writeFileSync(join(testDir, 'package.json'), '{"name": "my-test-project"}');

    await runCli(['init']);

    const readmePath = join(testDir, 'README.md');
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('# my-test-project');
    expect(content).toContain('## Quick Start');
    expect(content).toContain('## Installation');
    expect(content).toContain('## Usage');
    expect(content).toContain('## CLI Reference');
  });

  it('does not overwrite existing README.md', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'README.md'), 'my custom readme');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'README.md'), 'utf-8');
    expect(content).toBe('my custom readme');
  });

  it('includes install command in Quick Start', async () => {
    writeFileSync(join(testDir, 'package.json'), '{"name": "test-pkg"}');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'README.md'), 'utf-8');
    expect(content).toContain('npm install -g codeharness');
    expect(content).toContain('codeharness init');
    expect(content).toContain('codeharness status');
  });

  it('uses directory basename when package.json has no name', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'README.md'), 'utf-8');
    // Project name should be the temp dir basename
    expect(content).toMatch(/^# .+/m);
  });

  it('JSON output includes readme status as created', async () => {
    writeFileSync(join(testDir, 'package.json'), '{"name": "test-proj"}');

    const { stdout } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.documentation.readme).toBe('created');
  });

  it('JSON output includes readme status as exists when README already present', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'README.md'), '# existing');

    // Need to do a fresh init (not re-run) for this test
    // The idempotent check would short-circuit, so we skip the state
    const { stdout } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.documentation.readme).toBe('exists');
  });
});

describe('init command — idempotent re-run', () => {
  it('preserves existing state on re-run', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run
    await runCli(['init']);

    // Modify state to verify it's preserved
    const state = readState(testDir);
    state.session_flags.tests_passed = true;
    writeState(state, testDir);

    // Second run
    const { stdout, exitCode } = await runCli(['init']);
    expect(stdout).toContain('[INFO] Harness already initialized — verifying configuration');
    expect(stdout).toContain('[OK] Configuration verified');
    expect(exitCode).toBeUndefined();

    // State preserved
    const afterState = readState(testDir);
    expect(afterState.session_flags.tests_passed).toBe(true);
  });

  it('reports per-dependency status on re-run', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run
    await runCli(['init']);

    // Second run — should show per-dependency status
    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('Showboat: already installed');
    expect(stdout).toContain('agent-browser: already installed');
    expect(stdout).toContain('beads: already installed');
  });

  it('includes dependencies in JSON re-run output', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run
    await runCli(['init']);

    // Second run with JSON
    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);

    expect(parsed.dependencies).toBeDefined();
    expect(parsed.dependencies).toHaveLength(3);
    expect(parsed.dependencies[0].status).toBe('already-installed');
  });

  it('does not regenerate docs on re-run', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    // Modify AGENTS.md
    writeFileSync(join(testDir, 'AGENTS.md'), 'modified');

    // Re-run
    await runCli(['init']);

    expect(readFileSync(join(testDir, 'AGENTS.md'), 'utf-8')).toBe('modified');
  });
});

describe('init command — JSON output', () => {
  it('produces valid JSON with required fields', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);

    expect(parsed.status).toBe('ok');
    expect(parsed.stack).toBe('nodejs');
    expect(parsed.enforcement).toBeDefined();
    expect(parsed.enforcement.frontend).toBe(true);
    expect(parsed.documentation).toBeDefined();
    expect(parsed.documentation.agents_md).toBe('created');
    expect(parsed.documentation.docs_scaffold).toBe('created');
    expect(parsed.documentation.readme).toBe('created');
  });

  it('JSON output succeeds with deferred observability when Docker unavailable', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { stdout, exitCode } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);

    // Init should succeed even without Docker
    expect(parsed.status).toBe('ok');
    expect(exitCode).toBeUndefined();
  });

  it('JSON re-run output shows exists status', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run (no JSON)
    await runCli(['init']);

    // Re-run with JSON
    const { stdout } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);

    expect(parsed.status).toBe('ok');
    expect(parsed.documentation.agents_md).toBe('exists');
    expect(parsed.documentation.docs_scaffold).toBe('exists');
    expect(parsed.documentation.readme).toBe('exists');
  });

  it('suppresses human output in JSON mode', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['--json', 'init']);

    expect(stdout).not.toContain('[INFO]');
    expect(stdout).not.toContain('[OK]');
    expect(stdout).not.toContain('[FAIL]');
  });
});

describe('init command — coverage tool selection', () => {
  it('selects c8 for nodejs', () => {
    expect(getCoverageTool('nodejs')).toBe('c8');
  });

  it('selects coverage.py for python', () => {
    expect(getCoverageTool('python')).toBe('coverage.py');
  });

  it('defaults to c8 for unknown stack', () => {
    expect(getCoverageTool(null)).toBe('c8');
  });

  it('stores coverage.py for python projects', async () => {
    writeFileSync(join(testDir, 'requirements.txt'), '');

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.coverage.tool).toBe('coverage.py');
  });
});

describe('init command — helper functions', () => {
  it('getStackLabel returns correct labels', () => {
    expect(getStackLabel('nodejs')).toBe('Node.js (package.json)');
    expect(getStackLabel('python')).toBe('Python');
    expect(getStackLabel(null)).toBe('Unknown');
  });

  it('generateDocsIndexContent references planning artifacts', () => {
    const content = generateDocsIndexContent();
    expect(content).toContain('Planning Artifacts');
    expect(content).toContain('exec-plans/active/');
    expect(content).toContain('quality/');
    expect(content).toContain('generated/');
  });

  it('generateAgentsMdContent for python project', () => {
    const content = generateAgentsMdContent('/tmp/my-project', 'python');
    expect(content).toContain('Python');
    expect(content).toContain('pip install');
    expect(content).toContain('pytest');
  });

  it('generateAgentsMdContent for unknown stack', () => {
    const content = generateAgentsMdContent('/tmp/my-project', null);
    expect(content).toContain('Unknown');
    expect(content).toContain('add build/test commands here');
  });
});

describe('init command — final output', () => {
  it('prints enforcement summary and next steps', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[OK] Enforcement:');
    expect(stdout).toContain('[INFO] Harness initialized. Run: codeharness bridge --epics <path>');
  });
});

describe('init command — dependency install', () => {
  it('calls installAllDependencies during init', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);
    expect(mockInstallAllDependencies).toHaveBeenCalledWith(
      expect.objectContaining({ json: false }),
    );
  });

  it('halts init when critical dependency fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockImplementation(() => {
      throw new CriticalDependencyError('beads', 'Install failed');
    });

    const { stdout, exitCode } = await runCli(['init']);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Critical dependency failed');
  });

  it('halts init with JSON output when critical dependency fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockImplementation(() => {
      throw new CriticalDependencyError('beads', 'Install failed');
    });

    const { stdout, exitCode } = await runCli(['--json', 'init']);
    expect(exitCode).toBe(1);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.status).toBe('fail');
    expect(parsed.error).toContain('beads');
  });

  it('continues init when non-critical dependency fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockReturnValue([
      { name: 'showboat', displayName: 'Showboat', status: 'failed', version: null, error: 'not found' },
      { name: 'agent-browser', displayName: 'agent-browser', status: 'already-installed', version: '1.0.0' },
      { name: 'beads', displayName: 'beads', status: 'already-installed', version: '2.0.0' },
    ]);

    const { exitCode } = await runCli(['init']);
    expect(exitCode).toBeUndefined();
    // State file should still be created
    const state = readState(testDir);
    expect(state.initialized).toBe(true);
  });

  it('JSON output includes dependency results', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.dependencies).toBeDefined();
    expect(Array.isArray(parsed.dependencies)).toBe(true);
  });

  it('passes json flag to installAllDependencies', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['--json', 'init']);
    expect(mockInstallAllDependencies).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
    );
  });

  it('re-throws non-CriticalDependencyError errors', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockImplementation(() => {
      throw new TypeError('unexpected type error');
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = createCli();
    await expect(
      program.parseAsync(['node', 'codeharness', 'init']),
    ).rejects.toThrow('unexpected type error');
    consoleSpy.mockRestore();

    // Restore mock for subsequent tests
    mockInstallAllDependencies.mockReturnValue([
      { name: 'showboat', displayName: 'Showboat', status: 'already-installed', version: '0.6.1' },
      { name: 'agent-browser', displayName: 'agent-browser', status: 'already-installed', version: '1.0.0' },
      { name: 'beads', displayName: 'beads', status: 'already-installed', version: '2.0.0' },
    ]);
  });
});

describe('init command — OTLP instrumentation', () => {
  it('calls instrumentProject when observability is ON', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstrumentProject.mockClear();

    await runCli(['init']);
    expect(mockInstrumentProject).toHaveBeenCalledTimes(1);
    const call = mockInstrumentProject.mock.calls[0];
    expect(call[1]).toBe('nodejs');
    expect(call[2]).toEqual(expect.objectContaining({ json: false }));
  });

  it('passes json flag to instrumentProject', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstrumentProject.mockClear();

    await runCli(['--json', 'init']);
    expect(mockInstrumentProject).toHaveBeenCalledTimes(1);
    const call = mockInstrumentProject.mock.calls[0];
    expect(call[1]).toBe('nodejs');
    expect(call[2]).toEqual(expect.objectContaining({ json: true }));
  });

  it('includes otlp result in JSON output', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.otlp).toBeDefined();
    expect(parsed.otlp.status).toBe('configured');
  });

  it('always includes otlp result (observability is mandatory)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.otlp).toBeDefined();
    expect(parsed.otlp.status).toBe('configured');
  });

  it('skips OTLP when --no-observability is set', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstrumentProject.mockClear();

    const { stdout, exitCode } = await runCli(['init', '--no-observability']);
    expect(exitCode).toBeUndefined();
    expect(mockInstrumentProject).not.toHaveBeenCalled();
    expect(stdout).toContain('OTLP: skipped (--no-observability)');
  });

  it('skips OTLP in JSON mode when --no-observability is set', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstrumentProject.mockClear();

    const { stdout } = await runCli(['--json', 'init', '--no-observability']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.otlp).toBeDefined();
    expect(parsed.otlp.status).toBe('skipped');
    expect(mockInstrumentProject).not.toHaveBeenCalled();
  });

  it('still installs dependencies when --no-observability is set', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockClear();

    await runCli(['init', '--no-observability']);
    expect(mockInstallAllDependencies).toHaveBeenCalledTimes(1);
  });
});

describe('init command — state file with otlp section', () => {
  it('state file always has otlp section (observability is mandatory)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const state = readState(testDir);
    // OTLP is always configured since observability is mandatory
    expect(state.otlp).toBeDefined();
    expect(state.otlp?.enabled).toBe(true);
  });
});

describe('init command — corrupted state recovery during re-run', () => {
  it('proceeds with fresh init when state is corrupted', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // Create a corrupted state file
    mkdirSync(join(testDir, '.claude'), { recursive: true });
    writeFileSync(join(testDir, '.claude', 'codeharness.local.md'), 'garbage content');

    const { stdout, exitCode } = await runCli(['init']);
    // Should proceed with fresh init (not crash)
    expect(stdout).toContain('[OK] State file');
    expect(exitCode).toBeUndefined();
  });
});

describe('init command — shared Docker stack setup', () => {
  it('starts shared stack when not running', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsSharedStackRunning.mockReturnValue(false);

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[OK] Observability stack: started (shared at');
    expect(mockStartSharedStack).toHaveBeenCalled();
  });

  it('detects already running shared stack and skips restart', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsSharedStackRunning.mockReturnValue(true);
    mockStartSharedStack.mockClear();

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[OK] Observability stack: already running (shared)');
    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });

  it('reports failure when shared stack fails to start', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsSharedStackRunning.mockReturnValue(false);
    mockStartSharedStack.mockReturnValue({
      started: false,
      services: [],
      error: 'Cannot connect to Docker daemon',
    });

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[FAIL] Observability stack: failed to start');
    expect(stdout).toContain('Cannot connect to Docker daemon');
  });

  it('updates state with shared docker section after successful start', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsSharedStackRunning.mockReturnValue(false);

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.docker).toBeDefined();
    expect(state.docker?.compose_file).toBe('/mock/.codeharness/stack/docker-compose.harness.yml');
    expect(state.docker?.stack_running).toBe(true);
    expect(state.docker?.ports.logs).toBe(9428);
    expect(state.docker?.ports.metrics).toBe(8428);
    expect(state.docker?.ports.traces).toBe(16686);
    expect(state.docker?.ports.otel_grpc).toBe(4317);
    expect(state.docker?.ports.otel_http).toBe(4318);
  });

  it('JSON output includes shared docker section', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsSharedStackRunning.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.docker).toBeDefined();
    expect(parsed.docker.compose_file).toBe('/mock/.codeharness/stack/docker-compose.harness.yml');
    expect(parsed.docker.stack_running).toBe(true);
    expect(parsed.docker.ports.logs).toBe(9428);
  });

});

describe('init command — beads initialization', () => {
  it('calls initBeads during init when .beads/ does not exist', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['init']);
    expect(mockInitBeads).toHaveBeenCalled();
    expect(stdout).toContain('[OK] Beads: initialized (.beads/ created)');
  });

  it('skips initBeads when .beads/ already exists', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(true);
    mockInitBeads.mockClear();

    const { stdout } = await runCli(['init']);
    expect(mockInitBeads).not.toHaveBeenCalled();
    expect(stdout).toContain('[INFO] Beads: .beads/ already exists');
  });

  it('halts init when bd init fails (beads is critical)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);
    mockInitBeads.mockImplementation(() => {
      throw new BeadsError('bd init', 'bd not found');
    });

    const { stdout, exitCode } = await runCli(['init']);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('[FAIL] Beads init failed');
  });

  it('JSON output includes beads initialization result', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.beads).toBeDefined();
    expect(parsed.beads.status).toBe('initialized');
    expect(parsed.beads.hooks_detected).toBe(false);
  });

  it('JSON output shows already-initialized for existing .beads/', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(true);

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.beads.status).toBe('already-initialized');
  });

  it('JSON output shows failed when bd init fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);
    mockInitBeads.mockImplementation(() => {
      throw new BeadsError('bd init', 'command not found');
    });

    const { stdout, exitCode } = await runCli(['--json', 'init']);
    expect(exitCode).toBe(1);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.beads.status).toBe('failed');
    expect(parsed.beads.error).toContain('Beads failed');
    expect(parsed.status).toBe('fail');
  });

  it('detects beads hooks and logs coexistence message', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);
    mockDetectBeadsHooks.mockReturnValue({ hasHooks: true, hookTypes: ['prepare-commit-msg', 'post-checkout'] });

    const { stdout } = await runCli(['init']);
    expect(mockConfigureHookCoexistence).toHaveBeenCalled();
    expect(stdout).toContain('[INFO] Beads hooks detected — coexistence configured');
  });

  it('JSON output includes hooks_detected=true when beads hooks found', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(true);
    mockDetectBeadsHooks.mockReturnValue({ hasHooks: true, hookTypes: ['prepare-commit-msg'] });

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.beads.hooks_detected).toBe(true);
  });

  it('re-throws non-BeadsError errors from beads init', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);
    mockInitBeads.mockImplementation(() => {
      throw new TypeError('unexpected error in beads');
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = createCli();
    await expect(
      program.parseAsync(['node', 'codeharness', 'init']),
    ).rejects.toThrow('unexpected error in beads');
    consoleSpy.mockRestore();

    // Restore mock for subsequent tests
    mockInitBeads.mockImplementation(() => {});
  });

  it('does not call configureHookCoexistence when no hooks detected', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBeadsInitialized.mockReturnValue(false);
    mockDetectBeadsHooks.mockReturnValue({ hasHooks: false, hookTypes: [] });
    mockConfigureHookCoexistence.mockClear();

    await runCli(['init']);
    expect(mockConfigureHookCoexistence).not.toHaveBeenCalled();
  });
});

describe('init command — BMAD installation', () => {
  it('runs installBmad when _bmad/ does not exist', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);

    const { stdout } = await runCli(['init']);
    expect(mockInstallBmad).toHaveBeenCalled();
    expect(stdout).toContain('[OK] BMAD: installed (v6.0.0), harness patches applied');
  });

  it('skips BMAD install when _bmad/ already exists', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(true);
    mockInstallBmad.mockClear();

    const { stdout } = await runCli(['init']);
    expect(mockInstallBmad).not.toHaveBeenCalled();
    expect(stdout).toContain('[INFO] BMAD: existing installation detected, patches applied');
  });

  it('applies patches after BMAD install', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);

    await runCli(['init']);
    expect(mockApplyAllPatches).toHaveBeenCalled();
  });

  it('continues when BMAD install fails (non-critical)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('npx bmad-method init', 'npx not found');
    });

    const { stdout, exitCode } = await runCli(['init']);
    expect(stdout).toContain('[FAIL] BMAD install failed');
    // Init should NOT halt — BMAD is non-critical
    expect(exitCode).toBeUndefined();
    // State file should still be created
    const state = readState(testDir);
    expect(state.initialized).toBe(true);

    // Restore mock
    mockInstallBmad.mockReturnValue({
      status: 'installed',
      version: '6.0.0',
      patches_applied: [],

    });
  });

  it('JSON output includes BMAD result on fresh install', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.bmad).toBeDefined();
    expect(parsed.bmad.status).toBe('installed');
    expect(parsed.bmad.version).toBe('6.0.0');
    expect(parsed.bmad.patches_applied).toBeDefined();
    expect(Array.isArray(parsed.bmad.patches_applied)).toBe(true);
  });

  it('JSON output includes already-installed when _bmad/ exists', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(true);

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.bmad.status).toBe('already-installed');
  });

  it('JSON output includes failed status when BMAD install fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('npx bmad-method init', 'timeout');
    });

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.bmad.status).toBe('failed');
    expect(parsed.bmad.error).toContain('BMAD failed');

    // Restore mock
    mockInstallBmad.mockReturnValue({
      status: 'installed',
      version: '6.0.0',
      patches_applied: [],

    });
  });

  it('re-throws non-BmadError errors from BMAD init', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockImplementation(() => {
      throw new TypeError('unexpected error in bmad');
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const program = createCli();
    await expect(
      program.parseAsync(['node', 'codeharness', 'init']),
    ).rejects.toThrow('unexpected error in bmad');
    consoleSpy.mockRestore();

    // Restore mock
    mockInstallBmad.mockReturnValue({
      status: 'installed',
      version: '6.0.0',
      patches_applied: [],

    });
  });

  it('prints version as unknown when not detectable', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockReturnValue({
      status: 'installed',
      version: null,
      patches_applied: [],

    });

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('BMAD: installed (vunknown)');

    // Restore mock
    mockInstallBmad.mockReturnValue({
      status: 'installed',
      version: '6.0.0',
      patches_applied: [],

    });
  });
});

// ─── Remote endpoint flags ─────────────────────────────────────────────────

describe('init --otel-endpoint (remote-direct)', () => {
  it('skips Docker and sets remote-direct mode with provided endpoint', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli(['init', '--otel-endpoint', 'https://otel.company.com:4318']);

    expect(stdout).toContain('OTLP: configured for remote endpoint https://otel.company.com:4318');
    expect(exitCode).toBeUndefined();

    const state = readState(testDir);
    expect(state.otlp?.mode).toBe('remote-direct');
    expect(state.otlp?.endpoint).toBe('https://otel.company.com:4318');
    expect(state.docker).toBeUndefined();
  });

  it('does not call startSharedStack for remote-direct mode', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockStartSharedStack.mockClear();

    await runCli(['init', '--otel-endpoint', 'https://otel.company.com:4318']);

    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });

  it('preserves otlp.enabled and otlp.service_name in remote-direct mode', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init', '--otel-endpoint', 'https://otel.company.com:4318']);

    const state = readState(testDir);
    expect(state.otlp?.enabled).toBe(true);
    expect(state.otlp?.service_name).toBeTruthy();
  });

  it('does not require Docker for remote-direct mode', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { exitCode } = await runCli(['init', '--otel-endpoint', 'https://otel.company.com:4318']);

    expect(exitCode).toBeUndefined();
  });
});

describe('init --logs-url/--metrics-url/--traces-url (remote-routed)', () => {
  it('starts collector-only and sets remote-routed mode', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli([
      'init',
      '--logs-url', 'https://logs.company.com',
      '--metrics-url', 'https://metrics.company.com',
      '--traces-url', 'https://traces.company.com',
    ]);

    expect(stdout).toContain('Observability: OTel Collector started (routing to remote backends)');
    expect(exitCode).toBeUndefined();

    const state = readState(testDir);
    expect(state.otlp?.mode).toBe('remote-routed');
    expect(state.docker?.remote_endpoints).toEqual({
      logs_url: 'https://logs.company.com',
      metrics_url: 'https://metrics.company.com',
      traces_url: 'https://traces.company.com',
    });
  });

  it('calls startCollectorOnly with the remote URLs', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockStartCollectorOnly.mockClear();

    await runCli([
      'init',
      '--logs-url', 'https://logs.company.com',
      '--metrics-url', 'https://metrics.company.com',
      '--traces-url', 'https://traces.company.com',
    ]);

    expect(mockStartCollectorOnly).toHaveBeenCalledWith(
      'https://logs.company.com',
      'https://metrics.company.com',
      'https://traces.company.com',
    );
  });
});

describe('init remote endpoint validation', () => {
  it('fails when --otel-endpoint and --logs-url are both set', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli([
      'init',
      '--otel-endpoint', 'https://otel.company.com:4318',
      '--logs-url', 'https://logs.company.com',
    ]);

    expect(stdout).toContain('Cannot combine --otel-endpoint with --logs-url/--metrics-url/--traces-url');
    expect(exitCode).toBe(1);
  });

  it('fails when --otel-endpoint and all three backend URLs are set', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli([
      'init',
      '--otel-endpoint', 'https://otel.company.com:4318',
      '--logs-url', 'https://logs.company.com',
      '--metrics-url', 'https://metrics.company.com',
      '--traces-url', 'https://traces.company.com',
    ]);

    expect(stdout).toContain('Cannot combine --otel-endpoint with --logs-url/--metrics-url/--traces-url');
    expect(exitCode).toBe(1);
  });

  it('fails when only --logs-url is provided (missing metrics and traces)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli(['init', '--logs-url', 'https://logs.company.com']);

    expect(stdout).toContain('When using remote backends, all three are required: --logs-url, --metrics-url, --traces-url');
    expect(exitCode).toBe(1);
  });

  it('fails when only two of three backend URLs are provided', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli([
      'init',
      '--logs-url', 'https://logs.company.com',
      '--metrics-url', 'https://metrics.company.com',
    ]);

    expect(stdout).toContain('When using remote backends, all three are required: --logs-url, --metrics-url, --traces-url');
    expect(exitCode).toBe(1);
  });

  it('JSON output for mutual exclusivity error', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli([
      '--json', 'init',
      '--otel-endpoint', 'https://otel.company.com:4318',
      '--logs-url', 'https://logs.company.com',
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.error).toContain('Cannot combine');
    expect(exitCode).toBe(1);
  });

  it('fails when --otel-endpoint is not a valid URL', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli(['init', '--otel-endpoint', 'foobar']);

    expect(stdout).toContain("Invalid URL: 'foobar'");
    expect(stdout).toContain('must start with http:// or https://');
    expect(exitCode).toBe(1);
  });

  it('fails when --logs-url is not a valid URL', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout, exitCode } = await runCli([
      'init',
      '--logs-url', 'not-a-url',
      '--metrics-url', 'https://metrics.co',
      '--traces-url', 'https://traces.co',
    ]);

    expect(stdout).toContain("Invalid URL: 'not-a-url'");
    expect(exitCode).toBe(1);
  });

  it('defaults to local-shared mode when no remote flags passed', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.otlp?.mode).toBe('local-shared');
  });
});

describe('init command — legacy state migration', () => {
  it('upgrades legacy state with observability: false', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // Create a legacy state with observability: false
    const legacyState = getDefaultState('nodejs');
    legacyState.initialized = true;
    (legacyState.enforcement as Record<string, unknown>).observability = false;
    writeState(legacyState, testDir);

    const { stdout, exitCode } = await runCli(['init']);
    expect(stdout).toContain('[INFO] Observability upgraded from disabled to enabled');
    // Should NOT say "already initialized"
    expect(stdout).not.toContain('Harness already initialized');
    expect(exitCode).toBeUndefined();
  });

  it('does not re-init when observability was already enabled', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First init
    await runCli(['init']);

    // Second run
    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('Harness already initialized');
    expect(stdout).not.toContain('Observability upgraded');
  });
});

describe('init command — Docker not available graceful degradation', () => {
  it('continues init when Docker is not available', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { exitCode } = await runCli(['init']);
    expect(exitCode).toBeUndefined();

    // State file should still be created
    const state = readState(testDir);
    expect(state.initialized).toBe(true);
  });

  it('creates state with OTLP configured even without Docker', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.otlp).toBeDefined();
    expect(state.otlp?.enabled).toBe(true);
  });
});

// ─── App type detection in init ────────────────────────────────────────────

describe('init command — app type detection', () => {
  it('sets app_type in state after init for generic Node.js project', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.app_type).toBeDefined();
    expect(state.app_type).toBe('generic');
  });

  it('sets app_type to server for Node.js project with start script', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { start: 'node server.js' } }),
    );

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.app_type).toBe('server');
  });

  it('sets app_type to web for Node.js project with react dep', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { react: '^18.0.0' } }),
    );

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.app_type).toBe('web');
  });

  it('sets app_type to agent for Node.js project with openai dep', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { openai: '^4.0.0' } }),
    );

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.app_type).toBe('agent');
  });

  it('sets app_type to cli for Node.js project with bin and no start', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', bin: { 'my-cli': './dist/cli.js' } }),
    );

    await runCli(['init']);

    const state = readState(testDir);
    expect(state.app_type).toBe('cli');
  });

  it('prints app type in non-JSON mode', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { start: 'node server.js' } }),
    );

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[INFO] App type: server');
  });

  it('includes app_type in JSON output', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { react: '^18.0.0' } }),
    );

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.app_type).toBe('web');
  });

  it('passes appType to instrumentProject', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { openai: '^4.0.0' } }),
    );

    await runCli(['init']);

    expect(mockInstrumentProject).toHaveBeenCalledWith(
      expect.any(String),
      'nodejs',
      expect.objectContaining({ appType: 'agent' }),
    );
  });

  it('prints CORS warning for web app when stack already running', async () => {
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test', dependencies: { react: '^18.0.0' } }),
    );
    mockIsSharedStackRunning.mockReturnValue(true);

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('Web app detected — verify OTel Collector has CORS enabled');

    mockIsSharedStackRunning.mockReturnValue(false);
  });

  it('prints generic info message when app type is generic', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[INFO] App type: generic');
  });
});
