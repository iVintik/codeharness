import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock stack-path module
vi.mock('../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

// Mock docker module
vi.mock('../../lib/docker/index.js', () => ({
  isStackRunning: vi.fn(() => false),
  stopStack: vi.fn(),
  stopCollectorOnly: vi.fn(),
}));

// Mock patch-engine module
vi.mock('../../lib/patch-engine.js', () => ({
  removePatch: vi.fn(() => false),
}));

import { registerTeardownCommand } from '../teardown.js';
import { writeState, getDefaultState } from '../../lib/state.js';
import { isStackRunning, stopStack, stopCollectorOnly } from '../../lib/docker/index.js';
import { removePatch } from '../../lib/patch-engine.js';
import { PATCH_TARGETS } from '../../lib/bmad.js';

const mockIsStackRunning = vi.mocked(isStackRunning);
const mockStopStack = vi.mocked(stopStack);
const mockStopCollectorOnly = vi.mocked(stopCollectorOnly);
const mockRemovePatch = vi.mocked(removePatch);

let testDir: string;
let originalCwd: string;

function createInitializedProject(overrides?: Partial<ReturnType<typeof getDefaultState>>): void {
  const state = { ...getDefaultState('nodejs'), initialized: true, ...overrides };
  writeState(state, testDir);
}

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerTeardownCommand(program);
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
  return { stdout: logs.join('\n'), exitCode: process.exitCode };
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-teardown-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  mockIsStackRunning.mockReset();
  mockIsStackRunning.mockReturnValue(false);
  mockStopStack.mockReset();
  mockStopCollectorOnly.mockReset();
  mockRemovePatch.mockReset();
  mockRemovePatch.mockReturnValue(false);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(testDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('teardown command', () => {
  describe('state file not found', () => {
    it('prints error message and sets exit code 1', async () => {
      const { stdout, exitCode } = await runCli(['teardown']);

      expect(stdout).toContain('[FAIL] Harness not initialized. Nothing to tear down.');
      expect(exitCode).toBe(1);
    });

    it('outputs JSON error when --json flag is set', async () => {
      const { stdout, exitCode } = await runCli(['--json', 'teardown']);

      const parsed = JSON.parse(stdout);
      expect(parsed.status).toBe('fail');
      expect(parsed.error).toBe('Harness not initialized. Nothing to tear down.');
      expect(exitCode).toBe(1);
    });
  });

  describe('successful teardown', () => {
    it('removes state file', async () => {
      createInitializedProject();
      const statePath = join(testDir, '.claude', 'codeharness.local.md');
      expect(existsSync(statePath)).toBe(true);

      await runCli(['teardown']);

      expect(existsSync(statePath)).toBe(false);
    });

    it('prints success messages', async () => {
      createInitializedProject();

      const { stdout } = await runCli(['teardown']);

      expect(stdout).toContain('[OK] Removed: .claude/codeharness.local.md');
      expect(stdout).toContain('[OK] Harness teardown complete');
    });

    it('prints preserved items', async () => {
      createInitializedProject();

      const { stdout } = await runCli(['teardown']);

      expect(stdout).toContain('[INFO] Preserved: .beads/ (task history)');
      expect(stdout).toContain('[INFO] Preserved: _bmad/ (BMAD artifacts, patches removed)');
      expect(stdout).toContain('[INFO] Preserved: docs/ (documentation)');
    });
  });

  describe('shared stack teardown', () => {
    it('does NOT stop shared stack', async () => {
      createInitializedProject({
        docker: {
          compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
        },
      });

      const { stdout } = await runCli(['teardown']);

      expect(mockStopStack).not.toHaveBeenCalled();
      expect(stdout).toContain('[INFO] Shared stack: kept running (other projects may use it)');
    });

    it('--keep-docker is a no-op for shared stacks', async () => {
      createInitializedProject({
        docker: {
          compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
        },
      });

      const { stdout } = await runCli(['teardown', '--keep-docker']);

      expect(mockStopStack).not.toHaveBeenCalled();
      expect(stdout).toContain('[INFO] Docker stack: shared (not managed per-project)');
    });
  });

  describe('legacy per-project Docker teardown', () => {
    it('stops running legacy Docker stack', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      mockIsStackRunning.mockReturnValue(true);

      const { stdout } = await runCli(['teardown']);

      expect(mockStopStack).toHaveBeenCalledWith('docker-compose.harness.yml');
      expect(stdout).toContain('[OK] Docker stack: stopped');
    });

    it('removes legacy docker-compose and otel config files', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      const composePath = join(testDir, 'docker-compose.harness.yml');
      const otelPath = join(testDir, 'otel-collector-config.yaml');
      writeFileSync(composePath, 'version: "3"', 'utf-8');
      writeFileSync(otelPath, 'receivers:', 'utf-8');

      await runCli(['teardown']);

      expect(existsSync(composePath)).toBe(false);
      expect(existsSync(otelPath)).toBe(false);
    });

    it('prints info when legacy Docker not running', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: false,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      mockIsStackRunning.mockReturnValue(false);

      const { stdout } = await runCli(['teardown']);

      expect(stdout).toContain('[INFO] Docker stack: not running, skipping');
      expect(mockStopStack).not.toHaveBeenCalled();
    });

    it('prints warning when legacy Docker stop fails and continues', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      mockIsStackRunning.mockReturnValue(true);
      mockStopStack.mockImplementation(() => {
        throw new Error('connection refused');
      });

      const { stdout, exitCode } = await runCli(['teardown']);

      expect(stdout).toContain('[WARN] Docker stack: failed to stop (connection refused)');
      expect(stdout).toContain('[OK] Harness teardown complete');
      expect(exitCode).toBeUndefined();
    });

    it('--keep-docker preserves legacy compose files', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      const composePath = join(testDir, 'docker-compose.harness.yml');
      const otelPath = join(testDir, 'otel-collector-config.yaml');
      writeFileSync(composePath, 'version: "3"', 'utf-8');
      writeFileSync(otelPath, 'receivers:', 'utf-8');

      const { stdout } = await runCli(['teardown', '--keep-docker']);

      expect(stdout).toContain('[INFO] Docker stack: kept (--keep-docker)');
      expect(mockStopStack).not.toHaveBeenCalled();
      expect(mockIsStackRunning).not.toHaveBeenCalled();
      expect(existsSync(composePath)).toBe(true);
      expect(existsSync(otelPath)).toBe(true);
    });

    it('still removes state file when --keep-docker is set', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      const statePath = join(testDir, '.claude', 'codeharness.local.md');

      await runCli(['teardown', '--keep-docker']);

      expect(existsSync(statePath)).toBe(false);
    });
  });

  describe('--keep-beads flag', () => {
    it('is accepted without error (no-op, beads preserved by default)', async () => {
      createInitializedProject();

      const { stdout, exitCode } = await runCli(['teardown', '--keep-beads']);

      expect(stdout).toContain('[OK] Harness teardown complete');
      expect(exitCode).toBeUndefined();
    });
  });

  describe('BMAD patches', () => {
    it('removes patches from existing files', async () => {
      createInitializedProject();
      for (const [, relativePath] of Object.entries(PATCH_TARGETS)) {
        const filePath = join(testDir, '_bmad', relativePath);
        mkdirSync(join(filePath, '..'), { recursive: true });
        writeFileSync(filePath, '# some content', 'utf-8');
      }
      mockRemovePatch.mockReturnValue(true);

      const { stdout } = await runCli(['teardown']);

      const patchCount = Object.keys(PATCH_TARGETS).length;
      expect(mockRemovePatch).toHaveBeenCalledTimes(patchCount);
      expect(stdout).toContain(`[OK] BMAD patches: removed ${patchCount} patches`);
    });

    it('skips missing files silently', async () => {
      createInitializedProject();

      const { stdout } = await runCli(['teardown']);

      expect(mockRemovePatch).not.toHaveBeenCalled();
      expect(stdout).toContain('[INFO] BMAD patches: none found');
    });

    it('handles mix of present and missing patch targets', async () => {
      createInitializedProject();
      const entries = Object.entries(PATCH_TARGETS);
      const [, firstPath] = entries[0];
      const filePath = join(testDir, '_bmad', firstPath);
      mkdirSync(join(filePath, '..'), { recursive: true });
      writeFileSync(filePath, '# content', 'utf-8');
      mockRemovePatch.mockReturnValue(true);

      const { stdout } = await runCli(['teardown']);

      expect(mockRemovePatch).toHaveBeenCalledTimes(1);
      expect(stdout).toContain('[OK] BMAD patches: removed 1 patches');
    });
  });

  describe('OTLP cleanup', () => {
    it('removes instrumented scripts from package.json', async () => {
      createInitializedProject({
        stack: 'nodejs',
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
          node_require: '--require @opentelemetry/auto-instrumentations-node/register',
        },
      });

      const pkgPath = join(testDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test',
        scripts: {
          start: 'node index.js',
          'start:instrumented': "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node index.js",
          test: 'vitest',
        },
      }, null, 2) + '\n', 'utf-8');

      const { stdout } = await runCli(['teardown']);

      expect(stdout).toContain('[OK] OTLP: removed instrumented scripts from package.json');
    });

    it('verifies instrumented script key is removed from package.json', async () => {
      createInitializedProject({
        stack: 'nodejs',
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
          node_require: '--require @opentelemetry/auto-instrumentations-node/register',
        },
      });

      const pkgPath = join(testDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test',
        scripts: {
          start: 'node index.js',
          'start:instrumented': "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node index.js",
          test: 'vitest',
        },
      }, null, 2) + '\n', 'utf-8');

      await runCli(['teardown']);

      const updated = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const scripts = updated['scripts'] as Record<string, string>;
      expect(scripts['start']).toBe('node index.js');
      expect(scripts['start:instrumented']).toBeUndefined();
      expect(scripts['test']).toBe('vitest');
    });

    it('prints info when no instrumented scripts found', async () => {
      createInitializedProject({
        stack: 'nodejs',
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
        },
      });

      const pkgPath = join(testDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test',
        scripts: { start: 'node index.js' },
      }, null, 2), 'utf-8');

      const { stdout } = await runCli(['teardown']);

      expect(stdout).toContain('[INFO] OTLP: no instrumented scripts found');
    });

    it('does not touch OTLP when state has no otlp config', async () => {
      createInitializedProject({ stack: 'nodejs' });

      const pkgPath = join(testDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test',
        scripts: {
          start: 'node index.js',
          'start:instrumented': "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node index.js",
        },
      }, null, 2), 'utf-8');

      const { stdout } = await runCli(['teardown']);

      // OTLP not enabled in state, so instrumented script should remain untouched
      expect(stdout).not.toContain('OTLP');
      const updated = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const scripts = updated['scripts'] as Record<string, string>;
      expect(scripts['start:instrumented']).toBeDefined();
    });
  });

  describe('OTLP cleanup — multi-stack state', () => {
    it('triggers OTLP cleanup when stacks includes nodejs', async () => {
      createInitializedProject({
        stack: 'rust',
        stacks: ['nodejs', 'rust'],
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
          mode: 'local-shared' as const,
          node_require: '--require @opentelemetry/auto-instrumentations-node/register',
        },
      });

      const pkgPath = join(testDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test',
        scripts: {
          start: 'node index.js',
          'start:instrumented': "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node index.js",
        },
      }, null, 2) + '\n', 'utf-8');

      const { stdout } = await runCli(['teardown']);

      // Even though primary stack is rust, stacks includes nodejs so OTLP cleanup should trigger
      expect(stdout).toContain('[OK] OTLP: removed instrumented scripts from package.json');
    });
  });

  describe('beads preservation', () => {
    it('never touches .beads/ directory during teardown', async () => {
      createInitializedProject();
      const beadsDir = join(testDir, '.beads');
      mkdirSync(beadsDir, { recursive: true });
      writeFileSync(join(beadsDir, 'issues.json'), '[]', 'utf-8');

      await runCli(['teardown']);

      expect(existsSync(beadsDir)).toBe(true);
      expect(existsSync(join(beadsDir, 'issues.json'))).toBe(true);
    });
  });

  describe('JSON output', () => {
    it('produces correct JSON structure on success', async () => {
      createInitializedProject();

      const { stdout } = await runCli(['--json', 'teardown']);

      const parsed = JSON.parse(stdout);
      expect(parsed.status).toBe('ok');
      expect(parsed.removed).toContain('.claude/codeharness.local.md');
      expect(parsed.preserved).toContain('.beads/ (task history)');
      expect(parsed.preserved).toContain('_bmad/ (BMAD artifacts, patches removed)');
      expect(parsed.preserved).toContain('docs/ (documentation)');
      expect(typeof parsed.patches_removed).toBe('number');
      expect(typeof parsed.otlp_cleaned).toBe('boolean');
    });

    it('shows docker stopped in JSON when legacy stack was running', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });
      mockIsStackRunning.mockReturnValue(true);

      const { stdout } = await runCli(['--json', 'teardown']);

      const parsed = JSON.parse(stdout);
      expect(parsed.docker.stopped).toBe(true);
      expect(parsed.docker.kept).toBe(false);
    });

    it('shows docker kept in JSON with --keep-docker (legacy)', async () => {
      createInitializedProject({
        docker: {
          compose_file: 'docker-compose.harness.yml',
          stack_running: true,
          ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
        },
      });

      const { stdout } = await runCli(['--json', 'teardown', '--keep-docker']);

      const parsed = JSON.parse(stdout);
      expect(parsed.docker.kept).toBe(true);
      expect(parsed.docker.stopped).toBe(false);
    });

    it('includes patches_removed count', async () => {
      createInitializedProject();
      for (const [, relativePath] of Object.entries(PATCH_TARGETS)) {
        const filePath = join(testDir, '_bmad', relativePath);
        mkdirSync(join(filePath, '..'), { recursive: true });
        writeFileSync(filePath, '# content', 'utf-8');
      }
      mockRemovePatch.mockReturnValue(true);

      const { stdout } = await runCli(['--json', 'teardown']);

      const parsed = JSON.parse(stdout);
      expect(parsed.patches_removed).toBe(Object.keys(PATCH_TARGETS).length);
    });

    it('includes otlp_cleaned flag', async () => {
      createInitializedProject({
        stack: 'nodejs',
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
        },
      });

      const pkgPath = join(testDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({
        name: 'test',
        scripts: {
          start: 'node index.js',
          'start:instrumented': "NODE_OPTIONS='--require @opentelemetry/auto-instrumentations-node/register' node index.js",
        },
      }, null, 2), 'utf-8');

      const { stdout } = await runCli(['--json', 'teardown']);

      const parsed = JSON.parse(stdout);
      expect(parsed.otlp_cleaned).toBe(true);
    });
  });

  describe('.harness/ cleanup', () => {
    it('removes .harness/ directory during teardown', async () => {
      createInitializedProject();
      const harnessDir = join(testDir, '.harness');
      mkdirSync(harnessDir, { recursive: true });
      writeFileSync(join(harnessDir, 'last-onboard-scan.json'), '{}', 'utf-8');

      const { stdout } = await runCli(['teardown']);

      expect(existsSync(harnessDir)).toBe(false);
      expect(stdout).toContain('[OK] Removed: .harness/');
    });

    it('skips .harness/ silently when directory does not exist', async () => {
      createInitializedProject();

      const { stdout } = await runCli(['teardown']);

      expect(stdout).not.toContain('.harness/');
      expect(stdout).toContain('[OK] Harness teardown complete');
    });

    it('includes .harness/ in JSON removed list', async () => {
      createInitializedProject();
      const harnessDir = join(testDir, '.harness');
      mkdirSync(harnessDir, { recursive: true });
      writeFileSync(join(harnessDir, 'last-onboard-scan.json'), '{}', 'utf-8');

      const { stdout } = await runCli(['--json', 'teardown']);

      const parsed = JSON.parse(stdout);
      expect(parsed.removed).toContain('.harness/');
    });
  });

  describe('graceful handling of missing artifacts', () => {
    it('completes teardown when no compose file exists', async () => {
      createInitializedProject();

      const { stdout, exitCode } = await runCli(['teardown']);

      expect(stdout).toContain('[OK] Harness teardown complete');
      expect(exitCode).toBeUndefined();
    });
  });

  describe('remote-direct teardown', () => {
    it('skips Docker teardown for remote-direct mode', async () => {
      createInitializedProject({
        otlp: {
          enabled: true,
          endpoint: 'https://otel.company.com:4318',
          service_name: 'test',
          mode: 'remote-direct',
        },
      });

      const { stdout } = await runCli(['teardown']);

      expect(mockStopStack).not.toHaveBeenCalled();
      expect(mockStopCollectorOnly).not.toHaveBeenCalled();
      expect(stdout).toContain('[INFO] Docker: none (remote OTLP mode)');
      expect(stdout).toContain('[OK] Harness teardown complete');
    });

    it('removes state file for remote-direct mode', async () => {
      createInitializedProject({
        otlp: {
          enabled: true,
          endpoint: 'https://otel.company.com:4318',
          service_name: 'test',
          mode: 'remote-direct',
        },
      });

      await runCli(['teardown']);

      const statePath = join(testDir, '.claude', 'codeharness.local.md');
      expect(existsSync(statePath)).toBe(false);
    });
  });

  describe('remote-routed teardown', () => {
    it('stops collector-only container for remote-routed mode', async () => {
      createInitializedProject({
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
          mode: 'remote-routed',
        },
        docker: {
          compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
          stack_running: true,
          remote_endpoints: {
            logs_url: 'https://logs.company.com',
            metrics_url: 'https://metrics.company.com',
            traces_url: 'https://traces.company.com',
          },
          ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
        },
      });

      const { stdout } = await runCli(['teardown']);

      expect(mockStopCollectorOnly).toHaveBeenCalled();
      expect(mockStopStack).not.toHaveBeenCalled();
      expect(stdout).toContain('[OK] OTel Collector: stopped');
    });

    it('--keep-docker preserves collector for remote-routed mode', async () => {
      createInitializedProject({
        otlp: {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: 'test',
          mode: 'remote-routed',
        },
        docker: {
          compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
          stack_running: true,
          remote_endpoints: {
            logs_url: 'https://logs.company.com',
            metrics_url: 'https://metrics.company.com',
            traces_url: 'https://traces.company.com',
          },
          ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
        },
      });

      const { stdout } = await runCli(['teardown', '--keep-docker']);

      expect(mockStopCollectorOnly).not.toHaveBeenCalled();
      expect(stdout).toContain('[INFO] OTel Collector: kept (--keep-docker)');
    });
  });
});
