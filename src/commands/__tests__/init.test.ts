import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerInitCommand, generateAgentFileContent, generateDocsIndexContent, getCoverageTool, getStackLabel, getProjectName } from '../init.js';
import { readState, writeState, getDefaultState } from '../../lib/state.js';

// Mock the stacks module (wrap real implementation for overridability)
vi.mock('../../lib/stacks/index.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../lib/stacks/index.js')>();
  return { ...orig, detectStack: vi.fn(orig.detectStack), detectStacks: vi.fn(orig.detectStacks), detectAppType: vi.fn(orig.detectAppType) };
});

// Mock the stack-path module
vi.mock('../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

// Mock the docker module
vi.mock('../../lib/docker/index.js', () => ({
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
  ]),
  checkInstalled: vi.fn(() => ({ installed: true, version: '1.0.0' })),
  filterDepsForStacks: vi.fn(() => [
    {
      name: 'showboat',
      displayName: 'Showboat',
      installCommands: [{ cmd: 'npm', args: ['install', '-g', 'showboat'] }],
      checkCommand: { cmd: 'showboat', args: ['--version'] },
      critical: false,
    },
    {
      name: 'agent-browser',
      displayName: 'agent-browser',
      installCommands: [{ cmd: 'npm', args: ['install', '-g', '@anthropic/agent-browser'] }],
      checkCommand: { cmd: 'agent-browser', args: ['--version'] },
      critical: false,
      stacks: ['nodejs', 'python'],
    },
  ]),
  DEPENDENCY_REGISTRY: [
    {
      name: 'showboat',
      displayName: 'Showboat',
      installCommands: [{ cmd: 'npm', args: ['install', '-g', 'showboat'] }],
      checkCommand: { cmd: 'showboat', args: ['--version'] },
      critical: false,
    },
    {
      name: 'agent-browser',
      displayName: 'agent-browser',
      installCommands: [{ cmd: 'npm', args: ['install', '-g', '@anthropic/agent-browser'] }],
      checkCommand: { cmd: 'agent-browser', args: ['--version'] },
      critical: false,
      stacks: ['nodejs', 'python'],
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

// Mock the otlp module
vi.mock('../../lib/observability/index.js', () => ({
  instrumentProject: vi.fn(() => ({
    status: 'configured',
    packages_installed: true,
    start_script_patched: true,
    env_vars_configured: true,
  })),
  configureOtlpEnvVars: vi.fn(),
}));

import { isDockerAvailable, isSharedStackRunning, startSharedStack, startCollectorOnly } from '../../lib/docker/index.js';
import { installAllDependencies, CriticalDependencyError, checkInstalled } from '../../lib/deps.js';
import { instrumentProject } from '../../lib/observability/index.js';
import { isBmadInstalled, installBmad, applyAllPatches, detectBmadVersion, detectBmalph, BmadError } from '../../lib/bmad.js';

const mockIsBmadInstalled = vi.mocked(isBmadInstalled);
const mockInstallBmad = vi.mocked(installBmad);
const mockApplyAllPatches = vi.mocked(applyAllPatches);
const mockDetectBmadVersion = vi.mocked(detectBmadVersion);
const mockDetectBmalph = vi.mocked(detectBmalph);

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockIsSharedStackRunning = vi.mocked(isSharedStackRunning);
const mockStartSharedStack = vi.mocked(startSharedStack);
const mockStartCollectorOnly = vi.mocked(startCollectorOnly);
const mockInstallAllDependencies = vi.mocked(installAllDependencies);
const mockCheckInstalled = vi.mocked(checkInstalled);
const mockInstrumentProject = vi.mocked(instrumentProject);

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-init-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  mockIsDockerAvailable.mockReturnValue(true);
  mockIsSharedStackRunning.mockReturnValue(false);
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
  mockDetectBmalph.mockReturnValue({ detected: false, files: [] });
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
  it('fails with exit code 1 when Docker not installed and observability ON', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { stdout, exitCode } = await runCli(['init']);
    expect(stdout).toContain('[FAIL] Docker not installed');
    expect(stdout).toContain('[INFO] → Install Docker: https://docs.docker.com/engine/install/');
    expect(stdout).toContain('[INFO] → Or skip observability: codeharness init --no-observability');
    expect(exitCode).toBe(1);
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

describe('init command — AGENTS.md / CLAUDE.md generation', () => {
  it('generates AGENTS.md and CLAUDE.md pointing at docs/index.md', async () => {
    writeFileSync(join(testDir, 'package.json'), '{"name": "my-proj"}');

    await runCli(['init']);

    const agentsPath = join(testDir, 'AGENTS.md');
    const claudePath = join(testDir, 'CLAUDE.md');
    expect(existsSync(agentsPath)).toBe(true);
    expect(existsSync(claudePath)).toBe(true);
    const agentsContent = readFileSync(agentsPath, 'utf-8');
    expect(agentsContent).toContain('my-proj');
    expect(agentsContent).toContain('docs/index.md');
    expect(agentsContent).toContain('/bmad-bmm-document-project');
    // Regression guards: no codeharness-internal bullets, no hardcoded src/ tree
    expect(agentsContent).not.toContain('## Harness Files');
    expect(agentsContent).not.toMatch(/├── src\//);
  });

  it('passes opencode runtime to BMAD install', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    await runCli(['init', '--opencode']);
    expect(mockInstallBmad).toHaveBeenLastCalledWith(process.cwd(), 'opencode');
  });

  it('AGENTS.md content is under 100 lines', () => {
    const content = generateAgentFileContent('test-project', 'Node.js');
    const lines = content.split('\n');
    expect(lines.length).toBeLessThanOrEqual(100);
  });

  it('preserves existing AGENTS.md body and appends docs reference', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'AGENTS.md'), 'custom content');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('custom content');
    expect(content).toContain('docs/index.md');
  });

  it('preserves existing CLAUDE.md body and appends docs reference', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'CLAUDE.md'), '# my claude rules\n\nno emojis.\n');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('my claude rules');
    expect(content).toContain('no emojis');
    expect(content).toContain('docs/index.md');
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

  it('docs/index.md is a placeholder recommending document-project', async () => {
    writeFileSync(join(testDir, 'package.json'), '{"name": "proj"}');

    await runCli(['init']);

    const indexContent = readFileSync(join(testDir, 'docs', 'index.md'), 'utf-8');
    expect(indexContent).toContain('proj Documentation Index');
    expect(indexContent).toContain('/bmad-bmm-document-project');
    expect(indexContent).toContain('_(To be generated)_');
  });

  it('generated files include DO NOT EDIT header', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    const qualityKeep = readFileSync(join(testDir, 'docs', 'quality', '.gitkeep'), 'utf-8');
    expect(qualityKeep).toContain('<!-- DO NOT EDIT MANUALLY -->');

    const generatedKeep = readFileSync(join(testDir, 'docs', 'generated', '.gitkeep'), 'utf-8');
    expect(generatedKeep).toContain('<!-- DO NOT EDIT MANUALLY -->');
  });

  it('preserves existing docs/ files and still writes index.md placeholder', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mkdirSync(join(testDir, 'docs'), { recursive: true });
    writeFileSync(join(testDir, 'docs', 'custom.md'), 'custom');

    await runCli(['init']);

    expect(readFileSync(join(testDir, 'docs', 'custom.md'), 'utf-8')).toBe('custom');
    // index.md is still written so BMAD document-project has a target
    expect(existsSync(join(testDir, 'docs', 'index.md'))).toBe(true);
  });

  it('prints documentation creation messages', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[OK] Documentation: docs/ scaffold');
    expect(stdout).toContain('AGENTS.md created');
    expect(stdout).toContain('CLAUDE.md created');
  });
});

describe('init command — README.md handling', () => {
  it('does NOT create README.md (delegated to BMAD document-project)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{"name": "my-test-project"}');

    await runCli(['init']);

    expect(existsSync(join(testDir, 'README.md'))).toBe(false);
  });

  it('does NOT touch existing README.md', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'README.md'), 'my custom readme');

    await runCli(['init']);

    const content = readFileSync(join(testDir, 'README.md'), 'utf-8');
    expect(content).toBe('my custom readme');
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
    expect(stdout).toContain('Showboat: already installed');
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
    expect(parsed.dependencies).toHaveLength(2);
    expect(parsed.dependencies[0].status).toBe('already-installed');
  });

  it('verifies BMAD patches on re-run (AC #12)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run
    await runCli(['init']);

    // Simulate BMAD being installed (as it would be after first init)
    mockIsBmadInstalled.mockReturnValue(true);

    // Second run — should verify BMAD patches
    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[INFO] BMAD: already installed, patches verified');
    expect(mockApplyAllPatches).toHaveBeenCalled();
  });

  it('includes BMAD result in JSON re-run output', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run
    await runCli(['init']);

    // Simulate BMAD being installed (as it would be after first init)
    mockIsBmadInstalled.mockReturnValue(true);

    // Second run with JSON
    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);

    expect(parsed.bmad).toBeDefined();
    expect(parsed.bmad.status).toBe('already-installed');
    expect(parsed.bmad.patches_applied).toBeDefined();
  });

  it('preserves user AGENTS.md content on re-run but heals missing docs reference', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    // User replaces AGENTS.md with their own content (no docs reference)
    writeFileSync(join(testDir, 'AGENTS.md'), '# custom instructions');

    // Re-run — non-destructive scaffold runs, original body preserved,
    // reference block appended because the marker was missing.
    await runCli(['init']);

    const content = readFileSync(join(testDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# custom instructions');
    expect(content).toContain('docs/index.md');
  });

  it('heals missing CLAUDE.md and docs/index.md on re-run', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    await runCli(['init']);

    // Simulate pre-fix state: delete CLAUDE.md and docs/index.md
    rmSync(join(testDir, 'CLAUDE.md'), { force: true });
    rmSync(join(testDir, 'docs', 'index.md'), { force: true });

    // Re-run should recreate them without touching other files
    await runCli(['init']);

    expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(testDir, 'docs', 'index.md'))).toBe(true);
    const indexContent = readFileSync(join(testDir, 'docs', 'index.md'), 'utf-8');
    expect(indexContent).toContain('/bmad-bmm-document-project');
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
    expect(parsed.documentation.claude_md).toBe('created');
    expect(parsed.documentation.docs_scaffold).toBe('created');
    expect(parsed.documentation.readme).toBeUndefined();
  });

  it('JSON output fails with docker object when Docker unavailable and observability ON', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { stdout, exitCode } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);

    // AC 6: Docker not installed + observability ON → fail
    expect(parsed.status).toBe('fail');
    expect(parsed.error).toBe('Docker not installed');
    // AC 7: docker object present even on failure
    expect(parsed.docker).toBeDefined();
    expect(parsed.docker.stack_running).toBe(false);
    expect(exitCode).toBe(1);
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
    expect(parsed.documentation.agents_md).toBe('unchanged');
    expect(parsed.documentation.claude_md).toBe('unchanged');
    expect(parsed.documentation.docs_scaffold).toBe('exists');
  });

  it('JSON re-run output includes docker object from existing state (AC 7)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');

    // First run creates state with docker info
    await runCli(['init']);

    // Re-run with JSON
    const { stdout } = await runCli(['--json', 'init']);

    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);

    // AC 7: docker object must be present in re-run JSON output
    expect(parsed.docker).toBeDefined();
    expect(parsed.docker.compose_file).toBe('/mock/.codeharness/stack/docker-compose.harness.yml');
    expect(parsed.docker.stack_running).toBe(true);
    expect(parsed.docker.ports).toBeDefined();
    expect(parsed.docker.ports.logs).toBe(9428);
    expect(parsed.docker.ports.metrics).toBe(8428);
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

  it('generateDocsIndexContent recommends document-project workflow', () => {
    const content = generateDocsIndexContent('my-project', 'Node.js');
    expect(content).toContain('my-project Documentation Index');
    expect(content).toContain('**Primary Language:** Node.js');
    expect(content).toContain('/bmad-bmm-document-project');
    expect(content).toContain('_(To be generated)_');
  });

  it('generateAgentFileContent references docs/index.md', () => {
    const content = generateAgentFileContent('my-project', 'Python');
    expect(content).toContain('my-project');
    expect(content).toContain('Python');
    expect(content).toContain('docs/index.md');
    expect(content).toContain('/bmad-bmm-document-project');
  });

  it('generateAgentFileContent handles unknown stack', () => {
    const content = generateAgentFileContent('my-project', 'Unknown');
    expect(content).toContain('Unknown');
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
      throw new CriticalDependencyError('showboat', 'Install failed');
    });

    const { stdout, exitCode } = await runCli(['init']);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('Critical dependency failed');
  });

  it('halts init with JSON output when critical dependency fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockImplementation(() => {
      throw new CriticalDependencyError('showboat', 'Install failed');
    });

    const { stdout, exitCode } = await runCli(['--json', 'init']);
    expect(exitCode).toBe(1);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.status).toBe('fail');
    expect(parsed.error).toContain('showboat');
    // When init aborts before reaching documentation scaffold, all doc outputs remain 'skipped'
    expect(parsed.documentation.agents_md).toBe('skipped');
    expect(parsed.documentation.claude_md).toBe('skipped');
    expect(parsed.documentation.docs_scaffold).toBe('skipped');
  });

  it('continues init when non-critical dependency fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockReturnValue([
      { name: 'showboat', displayName: 'Showboat', status: 'failed', version: null, error: 'not found' },
      { name: 'agent-browser', displayName: 'agent-browser', status: 'already-installed', version: '1.0.0' },
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

  it('catches non-CriticalDependencyError and sets exit code (never throws)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockInstallAllDependencies.mockImplementation(() => {
      throw new TypeError('unexpected type error');
    });

    const { exitCode } = await runCli(['init']);
    expect(exitCode).toBe(1);

    // Restore mock for subsequent tests
    mockInstallAllDependencies.mockReturnValue([
      { name: 'showboat', displayName: 'Showboat', status: 'already-installed', version: '0.6.1' },
      { name: 'agent-browser', displayName: 'agent-browser', status: 'already-installed', version: '1.0.0' },
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

// Beads initialization tests removed — beads integration removed (Epic 8 replacement pending)

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
    expect(stdout).toContain('[INFO] BMAD: already installed, patches verified');
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
      throw new BmadError('npx bmad-method install', 'npx not found');
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
      throw new BmadError('npx bmad-method install', 'timeout');
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

  it('catches non-BmadError and continues init (never throws)', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockImplementation(() => {
      throw new TypeError('unexpected error in bmad');
    });

    const { stdout, exitCode } = await runCli(['init']);
    // BMAD is non-critical, init should succeed
    expect(exitCode).toBeUndefined();
    expect(stdout).toContain('BMAD install failed');

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

describe('init command — bmalph detection', () => {
  it('prints warning when bmalph artifacts are detected', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['.ralph/.ralphrc'] });

    const { stdout } = await runCli(['init']);
    expect(stdout).toContain('[WARN] bmalph detected');
  });

  it('does not print warning when no bmalph artifacts found', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockDetectBmalph.mockReturnValue({ detected: false, files: [] });

    const { stdout } = await runCli(['init']);
    expect(stdout).not.toContain('bmalph');
  });

  it('JSON output includes bmalph_detected field', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['.ralph/.ralphrc'] });

    const { stdout } = await runCli(['init', '--json']);
    const parsed = JSON.parse(stdout);
    expect(parsed.bmad.bmalph_detected).toBe(true);
  });

  it('skips bmalph detection when BMAD install fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('npx bmad-method install', 'timeout');
    });
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['.ralph/.ralphrc'] });

    const { stdout } = await runCli(['init']);
    // BMAD failed — bmalph detection should be skipped
    expect(stdout).not.toContain('bmalph detected');
    // But BMAD failure message should be present
    expect(stdout).toContain('[FAIL] BMAD install failed');

    // Restore mocks
    mockInstallBmad.mockReturnValue({ status: 'installed', version: '6.0.0', patches_applied: [] });
  });

  it('JSON output has bmalph_detected: false when BMAD install fails', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsBmadInstalled.mockReturnValue(false);
    mockInstallBmad.mockImplementation(() => {
      throw new BmadError('npx bmad-method install', 'timeout');
    });
    mockDetectBmalph.mockReturnValue({ detected: true, files: ['.ralph/.ralphrc'] });

    const { stdout } = await runCli(['--json', 'init']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.bmad.bmalph_detected).toBe(false);
    expect(parsed.bmad.status).toBe('failed');

    // Restore mocks
    mockInstallBmad.mockReturnValue({ status: 'installed', version: '6.0.0', patches_applied: [] });
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

describe('init command — Docker not available behavior', () => {
  it('fails with exit code 1 when Docker is not available and observability ON', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { exitCode } = await runCli(['init']);
    expect(exitCode).toBe(1);
  });

  it('succeeds when Docker is not available and observability OFF', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    mockIsDockerAvailable.mockReturnValue(false);

    const { exitCode } = await runCli(['init', '--no-observability']);
    expect(exitCode).toBeUndefined();

    const state = readState(testDir);
    expect(state.initialized).toBe(true);
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

describe('init command — initProject fail() result handling', () => {
  it('sets exit code 1 when initProject returns fail()', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    // Make detectStacks throw a non-domain error that propagates to the top-level catch
    // After extraction, deps-install catches and returns fail(), which causes
    // initProject to return ok(failResult). To trigger the actual fail() path,
    // we need an error in the orchestrator's own logic. We can achieve this by
    // making detectStacks throw — it's called before any try/catch in initProjectInner.
    const { detectStacks } = await import('../../lib/stacks/index.js');
    const originalImpl = vi.mocked(detectStacks).getMockImplementation?.() ?? detectStacks;
    vi.mocked(detectStacks).mockImplementation(() => { throw new Error('boom'); });

    const { exitCode } = await runCli(['init']);
    expect(exitCode).toBe(1);

    // Restore
    if (originalImpl) vi.mocked(detectStacks).mockImplementation(originalImpl as () => import('../../lib/stacks/index.js').StackDetection[]);
  });

  it('outputs JSON error when initProject returns fail() in json mode', async () => {
    writeFileSync(join(testDir, 'package.json'), '{}');
    const { detectStacks } = await import('../../lib/stacks/index.js');
    const originalImpl = vi.mocked(detectStacks).getMockImplementation?.() ?? detectStacks;
    vi.mocked(detectStacks).mockImplementation(() => { throw new Error('boom'); });

    const { stdout, exitCode } = await runCli(['--json', 'init']);
    expect(exitCode).toBe(1);
    expect(stdout).toContain('"status":"fail"');

    // Restore
    if (originalImpl) vi.mocked(detectStacks).mockImplementation(originalImpl as () => import('../../lib/stacks/index.js').StackDetection[]);
  });
});
