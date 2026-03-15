import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// Mock stack-path module
vi.mock('../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

// Mock state module
vi.mock('../../lib/state.js', () => ({
  readState: vi.fn(() => {
    throw new Error('No state file');
  }),
  StateFileNotFoundError: class extends Error {},
}));

// Mock docker module
vi.mock('../../lib/docker.js', () => ({
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
  stopSharedStack: vi.fn(),
  getStackHealth: vi.fn(() => ({
    healthy: true,
    services: [
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
      { name: 'otel-collector', running: true },
    ],
  })),
  isCollectorRunning: vi.fn(() => false),
  startCollectorOnly: vi.fn(() => ({
    started: true,
    services: [{ name: 'otel-collector', status: 'running', port: '4317,4318' }],
  })),
  stopCollectorOnly: vi.fn(),
  getCollectorHealth: vi.fn(() => ({
    healthy: true,
    services: [{ name: 'otel-collector', running: true }],
  })),
  checkRemoteEndpoint: vi.fn(() => Promise.resolve({ reachable: true })),
}));

import { registerStackCommand, STACK_ENDPOINTS } from '../stack.js';
import { isSharedStackRunning, startSharedStack, stopSharedStack, getStackHealth, isCollectorRunning, startCollectorOnly, stopCollectorOnly, getCollectorHealth, checkRemoteEndpoint } from '../../lib/docker.js';
import { readState } from '../../lib/state.js';

const mockIsSharedStackRunning = vi.mocked(isSharedStackRunning);
const mockStartSharedStack = vi.mocked(startSharedStack);
const mockStopSharedStack = vi.mocked(stopSharedStack);
const mockGetStackHealth = vi.mocked(getStackHealth);
const mockIsCollectorRunning = vi.mocked(isCollectorRunning);
const mockStartCollectorOnly = vi.mocked(startCollectorOnly);
const mockStopCollectorOnly = vi.mocked(stopCollectorOnly);
const mockGetCollectorHealth = vi.mocked(getCollectorHealth);
const mockCheckRemoteEndpoint = vi.mocked(checkRemoteEndpoint);
const mockReadState = vi.mocked(readState);

function createCli(): Command {
  const program = new Command();
  program.option('--json', 'JSON output');
  registerStackCommand(program);
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
  mockReadState.mockImplementation(() => { throw new Error('No state file'); });
  mockIsSharedStackRunning.mockReturnValue(false);
  mockStartSharedStack.mockReturnValue({
    started: true,
    services: [
      { name: 'victoria-logs', status: 'running', port: '9428' },
      { name: 'victoria-metrics', status: 'running', port: '8428' },
      { name: 'victoria-traces', status: 'running', port: '16686' },
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
    ],
  });
  mockStopSharedStack.mockImplementation(() => {});
  mockGetStackHealth.mockReturnValue({
    healthy: true,
    services: [
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
      { name: 'otel-collector', running: true },
    ],
  });
  mockIsCollectorRunning.mockReturnValue(false);
  mockStartCollectorOnly.mockReturnValue({
    started: true,
    services: [{ name: 'otel-collector', status: 'running', port: '4317,4318' }],
  });
  mockStopCollectorOnly.mockImplementation(() => {});
  mockGetCollectorHealth.mockReturnValue({
    healthy: true,
    services: [{ name: 'otel-collector', running: true }],
  });
  mockCheckRemoteEndpoint.mockResolvedValue({ reachable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('stack start', () => {
  it('starts shared stack when not running', async () => {
    mockIsSharedStackRunning.mockReturnValue(false);

    const { stdout } = await runCli(['stack', 'start']);

    expect(mockStartSharedStack).toHaveBeenCalled();
    expect(stdout).toContain('[OK] Shared stack: started');
    expect(stdout).toContain('Endpoints:');
  });

  it('reports already running when stack is up', async () => {
    mockIsSharedStackRunning.mockReturnValue(true);
    mockStartSharedStack.mockClear();

    const { stdout } = await runCli(['stack', 'start']);

    expect(mockStartSharedStack).not.toHaveBeenCalled();
    expect(stdout).toContain('[INFO] Shared stack: already running');
  });

  it('reports failure when start fails', async () => {
    mockIsSharedStackRunning.mockReturnValue(false);
    mockStartSharedStack.mockReturnValue({
      started: false,
      services: [],
      error: 'port 4317 already in use',
    });

    const { stdout, exitCode } = await runCli(['stack', 'start']);

    expect(stdout).toContain('[FAIL] Shared stack: failed to start');
    expect(stdout).toContain('port 4317 already in use');
    expect(exitCode).toBe(1);
  });

  it('JSON output on successful start', async () => {
    mockIsSharedStackRunning.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'stack', 'start']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.message).toBe('Shared stack: started');
    expect(parsed.endpoints).toBeDefined();
  });

  it('JSON output when already running', async () => {
    mockIsSharedStackRunning.mockReturnValue(true);

    const { stdout } = await runCli(['--json', 'stack', 'start']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.message).toBe('Shared stack: already running');
  });

  it('JSON output on failure', async () => {
    mockIsSharedStackRunning.mockReturnValue(false);
    mockStartSharedStack.mockReturnValue({
      started: false,
      services: [],
      error: 'daemon not running',
    });

    const { stdout, exitCode } = await runCli(['--json', 'stack', 'start']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.error).toBe('daemon not running');
    expect(exitCode).toBe(1);
  });
});

describe('stack stop', () => {
  it('stops shared stack with warning', async () => {
    const { stdout } = await runCli(['stack', 'stop']);

    expect(mockStopSharedStack).toHaveBeenCalled();
    expect(stdout).toContain('[WARN] Stopping shared stack');
    expect(stdout).toContain('[OK] Shared stack: stopped');
  });

  it('reports failure when stop fails', async () => {
    mockStopSharedStack.mockImplementation(() => {
      throw new Error('compose down failed');
    });

    const { stdout, exitCode } = await runCli(['stack', 'stop']);

    expect(stdout).toContain('failed to stop');
    expect(exitCode).toBe(1);
  });

  it('JSON output on successful stop', async () => {
    const { stdout } = await runCli(['--json', 'stack', 'stop']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.message).toBe('Shared stack: stopped');
  });

  it('JSON output on stop failure', async () => {
    mockStopSharedStack.mockImplementation(() => {
      throw new Error('timeout');
    });

    const { stdout, exitCode } = await runCli(['--json', 'stack', 'stop']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.error).toBe('timeout');
    expect(exitCode).toBe(1);
  });
});

describe('stack status', () => {
  it('shows running status with endpoints when healthy', async () => {
    const { stdout } = await runCli(['stack', 'status']);

    expect(stdout).toContain('[OK] Shared stack: running');
    expect(stdout).toContain('victoria-logs: running');
    expect(stdout).toContain('victoria-metrics: running');
    expect(stdout).toContain('otel-collector: running');
    expect(stdout).toContain('Endpoints:');
  });

  it('shows not running when unhealthy', async () => {
    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: false },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: false },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart: docker compose -p codeharness-shared up -d',
    });

    const { stdout } = await runCli(['stack', 'status']);

    expect(stdout).toContain('[INFO] Shared stack: not running');
    expect(stdout).toContain('victoria-logs: stopped');
    expect(stdout).not.toContain('Endpoints:');
  });

  it('calls getStackHealth with shared project name', async () => {
    await runCli(['stack', 'status']);

    expect(mockGetStackHealth).toHaveBeenCalledWith(
      '/mock/.codeharness/stack/docker-compose.harness.yml',
      'codeharness-shared',
    );
  });

  it('JSON output when healthy', async () => {
    const { stdout } = await runCli(['--json', 'stack', 'status']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.healthy).toBe(true);
    expect(parsed.services).toHaveLength(4);
    expect(parsed.endpoints).toBeDefined();
    expect(parsed.endpoints.logs).toBe(STACK_ENDPOINTS.logs);
  });

  it('JSON output when unhealthy', async () => {
    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: false },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: false },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart',
    });

    const { stdout } = await runCli(['--json', 'stack', 'status']);

    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.healthy).toBe(false);
    expect(parsed.endpoints).toBeUndefined();
    expect(parsed.remedy).toBe('Restart');
  });
});

// ─── Remote mode: stack commands ─────────────────────────────────────────────

describe('stack start (remote-direct)', () => {
  it('prints info message for remote-direct mode', async () => {
    mockStartSharedStack.mockClear();
    mockReadState.mockReturnValue({
      harness_version: '0.4.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'https://otel.co:4318', service_name: 'test', mode: 'remote-direct' },
    });

    const { stdout } = await runCli(['stack', 'start']);

    expect(stdout).toContain('No local stack needed');
    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });
});

describe('stack stop (remote-direct)', () => {
  it('prints info message for remote-direct mode', async () => {
    mockStopSharedStack.mockClear();
    mockReadState.mockReturnValue({
      harness_version: '0.4.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'https://otel.co:4318', service_name: 'test', mode: 'remote-direct' },
    });

    const { stdout } = await runCli(['stack', 'stop']);

    expect(stdout).toContain('No local stack to stop');
    expect(mockStopSharedStack).not.toHaveBeenCalled();
  });
});

describe('stack status (remote-direct)', () => {
  it('shows remote OTLP status and connectivity check', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.4.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'https://otel.co:4318', service_name: 'test', mode: 'remote-direct' },
    });
    mockCheckRemoteEndpoint.mockResolvedValue({ reachable: true });

    const { stdout } = await runCli(['stack', 'status']);

    expect(stdout).toContain('No local stack');
    expect(stdout).toContain('Remote OTLP: reachable');
  });
});

describe('stack start (remote-routed)', () => {
  it('starts only collector for remote-routed mode', async () => {
    mockStartSharedStack.mockClear();
    mockReadState.mockReturnValue({
      harness_version: '0.4.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'remote-routed' },
      docker: {
        compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
        stack_running: true,
        remote_endpoints: { logs_url: 'https://logs.co', metrics_url: 'https://metrics.co', traces_url: 'https://traces.co' },
        ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    });

    const { stdout } = await runCli(['stack', 'start']);

    expect(stdout).toContain('OTel Collector: started');
    expect(mockStartCollectorOnly).toHaveBeenCalledWith('https://logs.co', 'https://metrics.co', 'https://traces.co');
    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });
});

describe('stack stop (remote-routed)', () => {
  it('stops only collector for remote-routed mode', async () => {
    mockStopSharedStack.mockClear();
    mockReadState.mockReturnValue({
      harness_version: '0.4.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'remote-routed' },
    });

    const { stdout } = await runCli(['stack', 'stop']);

    expect(stdout).toContain('OTel Collector: stopped');
    expect(mockStopCollectorOnly).toHaveBeenCalled();
    expect(mockStopSharedStack).not.toHaveBeenCalled();
  });
});

describe('stack status (remote-routed)', () => {
  it('shows collector status and remote endpoints', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.4.0',
      initialized: true,
      stack: 'nodejs',
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'remote-routed' },
      docker: {
        compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
        stack_running: true,
        remote_endpoints: { logs_url: 'https://logs.co', metrics_url: 'https://metrics.co', traces_url: 'https://traces.co' },
        ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    });

    const { stdout } = await runCli(['stack', 'status']);

    expect(stdout).toContain('OTel Collector: running');
    expect(stdout).toContain('Remote backends:');
    expect(stdout).toContain('https://logs.co');
  });
});
