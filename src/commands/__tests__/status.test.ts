import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// Mock the stack-path module
vi.mock('../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

// Mock the docker module
vi.mock('../../lib/docker/index.js', () => ({
  getStackHealth: vi.fn(() => ({
    healthy: true,
    services: [
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
      { name: 'otel-collector', running: true },
    ],
  })),
  getCollectorHealth: vi.fn(() => ({
    healthy: true,
    services: [{ name: 'otel-collector', running: true }],
  })),
  isSharedStackRunning: vi.fn(() => false),
  checkRemoteEndpoint: vi.fn(() => Promise.resolve({ reachable: true })),
}));

// Mock the beads module
vi.mock('../../lib/beads.js', () => ({
  isBeadsInitialized: vi.fn(() => false),
  listIssues: vi.fn(() => []),
}));

// Mock the onboard-checks module
vi.mock('../../lib/onboard-checks.js', () => ({
  getOnboardingProgress: vi.fn(() => null),
}));

// Mock the verify module
vi.mock('../../modules/verify/index.js', () => ({
  getValidationProgress: vi.fn(() => ({
    success: true,
    data: { total: 0, passed: 0, failed: 0, blocked: 0, remaining: 0, perAC: [] },
  })),
}));

// Mock the sprint module
vi.mock('../../modules/sprint/index.js', () => ({
  generateReport: vi.fn(() => ({
    success: true,
    data: {
      total: 0, done: 0, failed: 0, blocked: 0,
      inProgress: null, storyStatuses: [],
      epicsTotal: 0, epicsDone: 0, sprintPercent: 0,
      activeRun: null, lastRun: null,
      failedDetails: [], actionItemsLabeled: [],
    },
  })),
  getStoryDrillDown: vi.fn(() => ({
    success: false,
    error: "Story 'unknown' not found in sprint state",
  })),
}));

import { registerStatusCommand, DEFAULT_ENDPOINTS, buildScopedEndpoints } from '../status.js';
import { getStackHealth, getCollectorHealth, checkRemoteEndpoint } from '../../lib/docker/index.js';
import { isBeadsInitialized, listIssues } from '../../lib/beads.js';
import { getOnboardingProgress } from '../../lib/onboard-checks.js';
import { generateReport, getStoryDrillDown } from '../../modules/sprint/index.js';
import { writeState, getDefaultState } from '../../lib/state.js';
import type { HarnessState } from '../../lib/state.js';
import type { StatusReport } from '../../modules/sprint/index.js';

const mockGetStackHealth = vi.mocked(getStackHealth);
const mockGetCollectorHealth = vi.mocked(getCollectorHealth);
const mockCheckRemoteEndpoint = vi.mocked(checkRemoteEndpoint);
const mockIsBeadsInitialized = vi.mocked(isBeadsInitialized);
const mockListIssues = vi.mocked(listIssues);
const mockGenerateReport = vi.mocked(generateReport);
const mockGetStoryDrillDown = vi.mocked(getStoryDrillDown);

let testDir: string;
let originalCwd: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'ch-status-test-'));
  originalCwd = process.cwd();
  process.chdir(testDir);
  mockGetStackHealth.mockReturnValue({
    healthy: true,
    services: [
      { name: 'victoria-logs', running: true },
      { name: 'victoria-metrics', running: true },
      { name: 'victoria-traces', running: true },
      { name: 'otel-collector', running: true },
    ],
  });
  mockIsBeadsInitialized.mockReturnValue(false);
  mockListIssues.mockReturnValue([]);
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
  registerStatusCommand(program);
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

// ─── Existing --check-docker tests (preserved) ─────────────────────────────

describe('status --check-docker', () => {
  it('reports healthy stack', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.docker = {
      compose_file: 'docker-compose.harness.yml',
      stack_running: true,
      ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['status', '--check-docker']);
    expect(stdout).toContain('[OK] VictoriaMetrics stack: running');
  });

  it('reports unhealthy stack with remedy', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: true },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: true },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart: docker compose -f docker-compose.harness.yml up -d',
    });

    const { stdout } = await runCli(['status', '--check-docker']);
    expect(stdout).toContain('[FAIL] VictoriaMetrics stack: not running');
    expect(stdout).toContain('victoria-metrics: down');
    expect(stdout).toContain('otel-collector: down');
    expect(stdout).toContain('Restart: docker compose -f docker-compose.harness.yml up -d');
  });

  it('uses compose file from state', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.docker = {
      compose_file: 'custom-compose.yml',
      stack_running: true,
      ports: { logs: 9428, metrics: 8428, traces: 14268, otel_grpc: 4317, otel_http: 4318 },
    };
    writeState(state, testDir);

    await runCli(['status', '--check-docker']);
    expect(mockGetStackHealth).toHaveBeenCalledWith('custom-compose.yml', undefined);
  });

  it('falls back to default compose file when no state', async () => {
    await runCli(['status', '--check-docker']);
    expect(mockGetStackHealth).toHaveBeenCalledWith('docker-compose.harness.yml', undefined);
  });

  it('JSON output for healthy stack', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    const { stdout } = await runCli(['--json', 'status', '--check-docker']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.status).toBe('ok');
    expect(parsed.docker.healthy).toBe(true);
    expect(parsed.docker.services).toHaveLength(4);
  });

  it('JSON output for unhealthy stack', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: false },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: false },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart: docker compose -f docker-compose.harness.yml up -d',
    });

    const { stdout } = await runCli(['--json', 'status', '--check-docker']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.status).toBe('fail');
    expect(parsed.docker.healthy).toBe(false);
    expect(parsed.docker.remedy).toContain('Restart');
  });

  it('prints endpoint URLs when stack is healthy', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    const { stdout } = await runCli(['status', '--check-docker']);
    expect(stdout).toContain('Endpoints:');
    expect(stdout).toContain('logs=http://localhost:9428');
    expect(stdout).toContain('metrics=http://localhost:8428');
    expect(stdout).toContain('traces=http://localhost:16686');
  });

  it('does not print endpoint URLs when stack is unhealthy', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: false },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: false },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart: docker compose -f docker-compose.harness.yml up -d',
    });

    const { stdout } = await runCli(['status', '--check-docker']);
    expect(stdout).not.toContain('Endpoints:');
  });

  it('JSON output includes endpoints when stack is healthy', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    const { stdout } = await runCli(['--json', 'status', '--check-docker']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.endpoints).toEqual(DEFAULT_ENDPOINTS);
    expect(parsed.endpoints.logs).toBe('http://localhost:9428');
    expect(parsed.endpoints.metrics).toBe('http://localhost:8428');
    expect(parsed.endpoints.traces).toBe('http://localhost:16686');
    expect(parsed.endpoints.otel_http).toBe('http://localhost:4318');
  });

  it('JSON output omits endpoints when stack is unhealthy', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

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

    const { stdout } = await runCli(['--json', 'status', '--check-docker']);
    const jsonLine = stdout.split('\n').find(l => l.startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.endpoints).toBeUndefined();
  });
});

// ─── Full status display ────────────────────────────────────────────────────

describe('status (full display)', () => {
  it('displays version, stack, enforcement, session flags, and coverage', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.harness_version = '0.4.0';
    writeState(state, testDir);

    const { stdout, exitCode } = await runCli(['status']);
    expect(stdout).toContain('Harness: codeharness v0.4.0');
    expect(stdout).toContain('Stack: nodejs');
    expect(stdout).toContain('Enforcement: front:ON db:ON api:ON obs:ON');
    expect(stdout).toContain('Session: tests_passed=false coverage_met=false verification_run=false logs_queried=false');
    expect(stdout).toContain('Coverage:');
    expect(exitCode).toBeUndefined();
  });

  it('prints [FAIL] when state file is missing with exit code 1', async () => {
    // No state file in testDir
    const { stdout, exitCode } = await runCli(['status']);
    expect(stdout).toContain('[FAIL] Harness not initialized');
    expect(exitCode).toBe(1);
  });

  it('shows Stack: unknown when stack is null', async () => {
    const state = getDefaultState(null);
    state.initialized = true;
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Stack: unknown');
  });

  it('always shows Docker service health (observability is mandatory)', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStackHealth.mockReturnValue({
      healthy: true,
      services: [
        { name: 'victoria-logs', running: true },
        { name: 'victoria-metrics', running: true },
        { name: 'victoria-traces', running: true },
        { name: 'otel-collector', running: true },
      ],
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Docker:');
    expect(stdout).toContain('victoria-logs: running');
    expect(stdout).toContain('victoria-metrics: running');
    expect(stdout).toContain('otel-collector: running');
    expect(stdout).toContain('Endpoints:');
  });

  it('shows Docker stopped services without endpoints', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: true },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: true },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart',
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('victoria-metrics: stopped');
    expect(stdout).toContain('otel-collector: stopped');
    expect(stdout).not.toContain('Endpoints:');
  });

  it('shows coverage with current percentage', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.coverage.current = 85;
    state.coverage.target = 100;
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Coverage: 85% / 100% target');
  });

  it('shows coverage dash when current is null', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    state.coverage.current = null;
    state.coverage.target = 100;
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Coverage: \u2014 / 100% target');
  });
});

// ─── Beads summary ──────────────────────────────────────────────────────────

describe('status beads summary', () => {
  it('shows beads not initialized when .beads dir missing', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Beads: not initialized');
  });

  it('shows beads issue counts when initialized', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([
      { id: '1', title: 'Bug 1', status: 'ready', type: 'bug', priority: 1 },
      { id: '2', title: 'Bug 2', status: 'done', type: 'bug', priority: 1 },
      { id: '3', title: 'Task 1', status: 'in_progress', type: 'task', priority: 2 },
    ]);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Beads: 3 issues');
    expect(stdout).toContain('bug:2');
    expect(stdout).toContain('task:1');
    expect(stdout).toContain('ready:1');
    expect(stdout).toContain('in-progress:1');
    expect(stdout).toContain('done:1');
  });

  it('shows zero issues without empty parentheses when no issues exist', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([]);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Beads: 0 issues | ready:0 in-progress:0 done:0');
    expect(stdout).not.toContain('()');
  });

  it('handles listIssues failure gracefully', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockImplementation(() => {
      throw new Error('bd not found');
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Beads: unavailable (bd command failed)');
  });
});

// ─── Verification log ───────────────────────────────────────────────────────

describe('status verification log', () => {
  it('shows no entries when verification log is empty', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    state.verification_log = [];
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Verification: no entries');
  });

  it('displays verification log entries', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    state.verification_log = [
      '4-1-test: pass at 2026-03-10T14:30:00.000Z',
      '4-2-hooks: fail at 2026-03-11T10:00:00.000Z',
    ];
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Verification log:');
    expect(stdout).toContain('4-1-test: pass at 2026-03-10T14:30:00.000Z');
    expect(stdout).toContain('4-2-hooks: fail at 2026-03-11T10:00:00.000Z');
  });
});

// ─── --check health check ───────────────────────────────────────────────────

describe('status --check', () => {
  it('reports all checks passing with exit code 0', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([]);

    mockGetStackHealth.mockReturnValue({
      healthy: true,
      services: [
        { name: 'victoria-logs', running: true },
        { name: 'victoria-metrics', running: true },
        { name: 'victoria-traces', running: true },
        { name: 'otel-collector', running: true },
      ],
    });

    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[OK] State file: valid');
    expect(stdout).toContain('[OK] Docker: all services running');
    expect(stdout).toContain('[OK] Beads: available');
    expect(exitCode).toBe(0);
  });

  it('reports state file missing with exit code 1', async () => {
    // No state file
    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[FAIL] State file: not found');
    expect(exitCode).toBe(1);
  });

  it('reports docker unhealthy with exit code 1', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([]);

    mockGetStackHealth.mockReturnValue({
      healthy: false,
      services: [
        { name: 'victoria-logs', running: false },
        { name: 'victoria-metrics', running: false },
        { name: 'victoria-traces', running: false },
        { name: 'otel-collector', running: false },
      ],
      remedy: 'Restart: docker compose -f docker-compose.harness.yml up -d',
    });

    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[FAIL] Docker:');
    expect(exitCode).toBe(1);
  });

  it('reports beads not initialized with exit code 1', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[FAIL] Beads: not initialized');
    expect(exitCode).toBe(1);
  });

  it('reports beads bd command failure', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockImplementation(() => {
      throw new Error('bd not found');
    });

    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[FAIL] Beads: bd command failed');
    expect(exitCode).toBe(1);
  });
});

// ─── JSON output ────────────────────────────────────────────────────────────

describe('status --json', () => {
  it('outputs JSON with all expected fields for full status', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    state.harness_version = '0.4.0';

    state.coverage.current = 95;
    state.verification_log = ['4-1-test: pass at 2026-03-10T14:30:00.000Z'];
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBe('0.4.0');
    expect(parsed.stack).toBe('nodejs');
    expect(parsed.enforcement).toEqual({
      frontend: true,
      database: true,
      api: true,
    });
    expect(parsed.docker).toBeDefined();
    expect(parsed.beads).toEqual({ initialized: false });
    expect(parsed.session_flags).toBeDefined();
    expect(parsed.coverage).toBeDefined();
    expect(parsed.verification_log).toEqual(['4-1-test: pass at 2026-03-10T14:30:00.000Z']);
  });

  it('outputs JSON with docker health when observability is ON', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    mockGetStackHealth.mockReturnValue({
      healthy: true,
      services: [
        { name: 'victoria-logs', running: true },
        { name: 'victoria-metrics', running: true },
        { name: 'victoria-traces', running: true },
        { name: 'otel-collector', running: true },
      ],
    });

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.docker.healthy).toBe(true);
    expect(parsed.docker.services).toHaveLength(4);
    expect(parsed.docker.endpoints).toEqual(DEFAULT_ENDPOINTS);
  });

  it('outputs JSON with beads data when initialized', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([
      { id: '1', title: 'Bug', status: 'ready', type: 'bug', priority: 1 },
      { id: '2', title: 'Task', status: 'done', type: 'task', priority: 2 },
    ]);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.beads.initialized).toBe(true);
    expect(parsed.beads.total).toBe(2);
    expect(parsed.beads.issues_by_type).toEqual({ bug: 1, task: 1 });
    expect(parsed.beads.issues_by_status).toEqual({ ready: 1, done: 1 });
  });

  it('outputs JSON for --check with check results', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([]);

    const { stdout } = await runCli(['--json', 'status', '--check']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.checks.state_file.status).toBe('ok');
    expect(parsed.checks.docker.status).toBe('ok');
    expect(parsed.checks.beads.status).toBe('ok');
  });

  it('outputs JSON for --check with failures', async () => {
    // No state file
    const { stdout } = await runCli(['--json', 'status', '--check']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.checks.state_file.status).toBe('fail');
  });

  it('includes app_type in JSON output when set', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.app_type = 'cli';
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.app_type).toBe('cli');
  });

  it('omits app_type from JSON output when not set', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    // No app_type
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.app_type).toBeUndefined();
  });

  it('JSON output for state not initialized shows fail', async () => {
    const { stdout, exitCode } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('fail');
    expect(parsed.message).toContain('Harness not initialized');
    expect(exitCode).toBe(1);
  });
});

// ─── Onboarding progress in status ──────────────────────────────────────────

describe('status onboarding progress', () => {
  it('displays onboarding progress when gap-tagged issues exist', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    vi.mocked(getOnboardingProgress).mockReturnValue({
      total: 7,
      resolved: 3,
      remaining: 4,
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Onboarding: 3/7 gaps resolved (4 remaining)');
  });

  it('does not display onboarding progress when no gap-tagged issues', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    vi.mocked(getOnboardingProgress).mockReturnValue(null);

    const { stdout } = await runCli(['status']);
    expect(stdout).not.toContain('Onboarding:');
  });

  it('includes onboarding progress in JSON output', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);
    vi.mocked(getOnboardingProgress).mockReturnValue({
      total: 5,
      resolved: 2,
      remaining: 3,
    });

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.onboarding).toEqual({
      total: 5,
      resolved: 2,
      remaining: 3,
    });
  });

  it('omits onboarding key in JSON when no progress data', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;

    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);
    vi.mocked(getOnboardingProgress).mockReturnValue(null);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.onboarding).toBeUndefined();
  });
});

// ─── Remote mode status display ──────────────────────────────────────────────

describe('status remote-direct mode', () => {
  it('displays "Docker: none" for remote-direct mode', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'https://otel.company.com:4318',
      service_name: 'test',
      mode: 'remote-direct',
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Docker: none (remote OTLP at https://otel.company.com:4318)');
  });

  it('--check-docker checks remote endpoint for remote-direct', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'https://otel.company.com:4318',
      service_name: 'test',
      mode: 'remote-direct',
    };
    writeState(state, testDir);
    mockCheckRemoteEndpoint.mockResolvedValue({ reachable: true });

    const { stdout } = await runCli(['status', '--check-docker']);
    expect(stdout).toContain('Remote OTLP endpoint: reachable');
  });

  it('--check-docker reports unreachable remote endpoint', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'https://otel.company.com:4318',
      service_name: 'test',
      mode: 'remote-direct',
    };
    writeState(state, testDir);
    mockCheckRemoteEndpoint.mockResolvedValue({ reachable: false, error: 'ECONNREFUSED' });

    const { stdout } = await runCli(['status', '--check-docker']);
    expect(stdout).toContain('Remote OTLP endpoint: unreachable');
  });

  it('--check reports remote OTLP status for remote-direct', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'https://otel.company.com:4318',
      service_name: 'test',
      mode: 'remote-direct',
    };
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([]);
    mockCheckRemoteEndpoint.mockResolvedValue({ reachable: true });

    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[OK] Docker: remote OTLP reachable');
    expect(exitCode).toBe(0);
  });

  it('JSON full status includes mode and endpoints for remote-direct', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'https://otel.company.com:4318',
      service_name: 'test',
      mode: 'remote-direct',
    };
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.docker.mode).toBe('remote-direct');
    expect(parsed.docker.endpoint).toBe('https://otel.company.com:4318');
    expect(parsed.endpoints).toBeDefined();
    expect(parsed.endpoints.otel_http).toBe('https://otel.company.com:4318');
  });
});

describe('status remote-routed mode', () => {
  it('displays "Docker: OTel Collector only" for remote-routed mode', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'test',
      mode: 'remote-routed',
    };
    state.docker = {
      compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
      stack_running: true,
      remote_endpoints: {
        logs_url: 'https://logs.company.com',
        metrics_url: 'https://metrics.company.com',
        traces_url: 'https://traces.company.com',
      },
      ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Docker: OTel Collector only');
    expect(stdout).toContain('https://logs.company.com');
  });

  it('JSON full status includes mode and remote_endpoints for remote-routed', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'test',
      mode: 'remote-routed',
    };
    state.docker = {
      compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
      stack_running: true,
      remote_endpoints: {
        logs_url: 'https://logs.company.com',
        metrics_url: 'https://metrics.company.com',
        traces_url: 'https://traces.company.com',
      },
      ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
    };
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.docker.mode).toBe('remote-routed');
    expect(parsed.docker.remote_endpoints.logs_url).toBe('https://logs.company.com');
    expect(parsed.endpoints.logs).toBe('https://logs.company.com');
    expect(parsed.endpoints.otel_http).toBe('http://localhost:4318');
  });

  it('displays app type in full status output', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.app_type = 'agent';
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'test',
      mode: 'local-shared',
      agent_sdk: 'traceloop',
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('App type: agent');
    expect(stdout).toContain('Agent SDK: traceloop');
  });

  it('displays app type without agent SDK for non-agent types', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.app_type = 'web';
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('App type: web');
    expect(stdout).not.toContain('Agent SDK:');
  });

  it('does not display app type when not set in state', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    // No app_type set
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).not.toContain('App type:');
  });

  it('displays scoped endpoints when service_name is set', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-api',
      mode: 'local-shared',
    };
    writeState(state, testDir);

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Scoped:');
    expect(stdout).toContain('service_name%3Amy-api');
  });

  it('--check verifies collector and remote endpoints for remote-routed', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;

    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'test',
      mode: 'remote-routed',
    };
    state.docker = {
      compose_file: '/mock/.codeharness/stack/docker-compose.harness.yml',
      stack_running: true,
      remote_endpoints: {
        logs_url: 'https://logs.company.com',
        metrics_url: 'https://metrics.company.com',
        traces_url: 'https://traces.company.com',
      },
      ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
    };
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(true);
    mockListIssues.mockReturnValue([]);
    mockGetCollectorHealth.mockReturnValue({
      healthy: true,
      services: [{ name: 'otel-collector', running: true }],
    });
    mockCheckRemoteEndpoint.mockResolvedValue({ reachable: true });

    const { stdout, exitCode } = await runCli(['status', '--check']);
    expect(stdout).toContain('[OK] Docker: OTel Collector running');
    expect(stdout).toContain('[OK] Remote logs: reachable');
    expect(stdout).toContain('[OK] Remote metrics: reachable');
    expect(stdout).toContain('[OK] Remote traces: reachable');
    expect(exitCode).toBe(0);
  });
});

// ─── Scoped endpoints ────────────────────────────────────────────────────────

describe('buildScopedEndpoints', () => {
  it('builds scoped logs URL with service_name filter (URL-encoded)', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my-api');
    expect(scoped.logs).toBe('http://localhost:9428/select/logsql/query?query=service_name%3Amy-api');
  });

  it('builds scoped metrics URL with service_name label (URL-encoded)', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my-api');
    expect(scoped.metrics).toBe('http://localhost:8428/api/v1/query?query=%7Bservice_name%3D%22my-api%22%7D');
  });

  it('builds scoped traces URL with service parameter', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my-api');
    expect(scoped.traces).toBe('http://localhost:16686/api/traces?service=my-api&limit=20');
  });

  it('properly encodes service names with special characters', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my api&test');
    expect(scoped.traces).toBe('http://localhost:16686/api/traces?service=my%20api%26test&limit=20');
    expect(scoped.logs).toContain('my%20api%26test');
  });
});

describe('scoped endpoints in JSON output', () => {
  it('includes scoped_endpoints when service_name is set', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    state.otlp = {
      enabled: true,
      endpoint: 'http://localhost:4318',
      service_name: 'my-api',
      mode: 'local-shared',
    };
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.scoped_endpoints).toBeDefined();
    expect(parsed.scoped_endpoints.logs).toContain('my-api');
    expect(parsed.scoped_endpoints.metrics).toContain('my-api');
    expect(parsed.scoped_endpoints.traces).toContain('my-api');
  });

  it('omits scoped_endpoints when no service_name', async () => {
    const state = getDefaultState('nodejs') as HarnessState;
    state.initialized = true;
    // No otlp config
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.scoped_endpoints).toBeUndefined();
  });
});

// ─── Sprint state display ────────────────────────────────────────────────────

function makeReport(overrides?: Partial<StatusReport>): StatusReport {
  return {
    total: 0, done: 0, failed: 0, blocked: 0,
    inProgress: null, storyStatuses: [],
    epicsTotal: 0, epicsDone: 0, sprintPercent: 0,
    activeRun: null, lastRun: null,
    failedDetails: [], actionItemsLabeled: [],
    ...overrides,
  };
}

describe('status sprint state display', () => {
  it('displays Project State section with sprint progress', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({ total: 65, done: 17, epicsTotal: 16, epicsDone: 5, sprintPercent: 26 }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Project State');
    expect(stdout).toContain('Sprint: 17/65 done (26%) | 5/16 epics complete');
  });

  it('displays Active Run section when run is active', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({
        inProgress: '3-3-bmad-parser',
        activeRun: {
          duration: '2h14m', cost: 23.40, iterations: 7,
          completed: ['3-1', '3-2'], failed: [], blocked: [], skipped: [],
        },
      }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Active Run');
    expect(stdout).toContain('running (iteration 7, 2h14m elapsed)');
    expect(stdout).toContain('Current: 3-3-bmad-parser');
    expect(stdout).toContain('$23.40 spent');
  });

  it('displays Last Run Summary section for completed runs', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({
        lastRun: {
          duration: '2h14m', cost: 23.40, iterations: 7,
          completed: ['3-1', '3-2', '4-1', '4-2'], failed: ['2-3'],
          blocked: ['5-1', '5-2'], skipped: [],
        },
        failedDetails: [{
          key: '2-3', acNumber: 4, errorLine: 'status --check-docker exit 1',
          attempts: 3, maxAttempts: 10,
        }],
      }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Last Run Summary');
    expect(stdout).toContain('Duration: 2h14m | Cost: $23.40 | Iterations: 7');
    expect(stdout).toContain('Completed:  4 stories (3-1, 3-2, 4-1, 4-2)');
    expect(stdout).toContain('Failed:     1 story');
    expect(stdout).toContain('2-3: AC 4');
    expect(stdout).toContain('status --check-docker exit 1');
    expect(stdout).toContain('attempt 3/10');
    expect(stdout).toContain('Blocked:    2 stories (retry-exhausted)');
  });

  it('displays Action Items section with NEW/CARRIED labels', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({
        actionItemsLabeled: [
          { item: { id: 'ai-1', story: '1-1-a', description: 'Fix test', source: 'verification', resolved: false }, label: 'NEW' },
          { item: { id: 'ai-2', story: '0-1-old', description: 'Old item', source: 'manual', resolved: false }, label: 'CARRIED' },
        ],
      }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Action Items');
    expect(stdout).toContain('[NEW] 1-1-a: Fix test');
    expect(stdout).toContain('[CARRIED] 0-1-old: Old item');
  });

  it('shows "Sprint state: unavailable" when generateReport fails', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: false,
      error: 'Failed to generate report: kaboom',
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Sprint state: unavailable');
  });

  it('includes sprint data in JSON output', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({ total: 10, done: 5, epicsTotal: 3, epicsDone: 1, sprintPercent: 50 }),
    });

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.sprint).toBeDefined();
    expect(parsed.sprint.total).toBe(10);
    expect(parsed.sprint.done).toBe(5);
    expect(parsed.sprint.epicsTotal).toBe(3);
    expect(parsed.sprint.sprintPercent).toBe(50);
  });

  it('omits sprint from JSON when generateReport fails', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockIsBeadsInitialized.mockReturnValue(false);
    mockGenerateReport.mockReturnValue({
      success: false,
      error: 'broken',
    });

    const { stdout } = await runCli(['--json', 'status']);
    const parsed = JSON.parse(stdout);
    expect(parsed.sprint).toBeUndefined();
  });

  it('does not show Active Run or Last Run when no run data', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({ total: 5, done: 2, sprintPercent: 40 }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Project State');
    expect(stdout).not.toContain('Active Run');
    expect(stdout).not.toContain('Last Run Summary');
  });

  it('does not show Action Items section when array is empty', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({ actionItemsLabeled: [] }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).not.toContain('Action Items');
  });

  it('shows completed with no story list when empty', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({
        lastRun: {
          duration: '5m', cost: 1.00, iterations: 1,
          completed: [], failed: [], blocked: [], skipped: [],
        },
      }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Completed:  0 stories');
  });

  it('shows multiple failed stories correctly', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);
    mockGenerateReport.mockReturnValue({
      success: true,
      data: makeReport({
        lastRun: {
          duration: '1h', cost: 10, iterations: 5,
          completed: [], failed: ['1-1', '2-1'], blocked: [], skipped: [],
        },
        failedDetails: [
          { key: '1-1', acNumber: 2, errorLine: 'assertion failed', attempts: 3, maxAttempts: 10 },
          { key: '2-1', acNumber: null, errorLine: 'unknown error', attempts: 1, maxAttempts: 10 },
        ],
      }),
    });

    const { stdout } = await runCli(['status']);
    expect(stdout).toContain('Failed:     2 stories');
    expect(stdout).toContain('1-1: AC 2');
    expect(stdout).toContain('2-1: unknown AC');
  });
});

// ─── Story Drill-Down tests ────────────────────────────────────────────────

describe('status --story', () => {
  it('shows drill-down with all AC verdicts and FAIL detail', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '2-3-status',
        status: 'failed',
        epic: '2',
        attempts: 3,
        maxAttempts: 10,
        lastAttempt: '2026-03-18T03:42:15Z',
        acDetails: [
          { id: 'AC1', verdict: 'pass' },
          { id: 'AC2', verdict: 'fail', command: 'docker exec test', expected: 'exit 0', actual: 'exit 1', reason: 'container mismatch', suggestedFix: 'Fix names' },
          { id: 'AC3', verdict: 'escalate' },
          { id: 'AC4', verdict: 'pending' },
        ],
        attemptHistory: [
          { number: 1, outcome: 'details unavailable' },
          { number: 2, outcome: 'details unavailable' },
          { number: 3, outcome: 'verify failed', failingAc: 'AC2', timestamp: '2026-03-18T03:42:15Z' },
        ],
        proofSummary: { path: 'verification/2-3-proof.md', passCount: 1, failCount: 1, escalateCount: 1, pendingCount: 1 },
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['status', '--story', '2-3-status']);
    expect(stdout).toContain('Story: 2-3-status');
    expect(stdout).toContain('Status: failed (attempt 3/10)');
    expect(stdout).toContain('Epic: 2');
    expect(stdout).toContain('Last attempt: 2026-03-18T03:42:15Z');
    expect(stdout).toContain('AC1: [PASS]');
    expect(stdout).toContain('AC2: [FAIL]');
    expect(stdout).toContain('Command:  docker exec test');
    expect(stdout).toContain('Expected: exit 0');
    expect(stdout).toContain('Actual:   exit 1');
    expect(stdout).toContain('Reason:   container mismatch');
    expect(stdout).toContain('Suggest:  Fix names');
    expect(stdout).toContain('AC3: [ESCALATE]');
    expect(stdout).toContain('AC4: [PENDING]');
    expect(stdout).toContain('Attempt 1: details unavailable');
    expect(stdout).toContain('Attempt 3: verify failed (AC2)');
    expect(stdout).toContain('Proof: verification/2-3-proof.md (1/4 pass, 1 fail, 1 escalate)');
  });

  it('returns JSON output when --json --story combined', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '2-3-status',
        status: 'failed',
        epic: '2',
        attempts: 3,
        maxAttempts: 10,
        lastAttempt: '2026-03-18T03:42:15Z',
        acDetails: [{ id: 'AC1', verdict: 'pass' }],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['--json', 'status', '--story', '2-3-status']);
    const json = JSON.parse(stdout);
    expect(json.key).toBe('2-3-status');
    expect(json.status).toBe('failed');
    expect(json.epic).toBe('2');
    expect(json.attempts).toBe(3);
    expect(json.maxAttempts).toBe(10);
    expect(json.acResults).toHaveLength(1);
    expect(json.attemptHistory).toEqual([]);
    expect(json.proof).toBeNull();
  });

  it('prints FAIL and exits non-zero for nonexistent story', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: false,
      error: "Story 'nonexistent' not found in sprint state",
    });

    const { stdout, exitCode } = await runCli(['status', '--story', 'nonexistent']);
    expect(stdout).toContain("Story 'nonexistent' not found");
    expect(exitCode).toBe(1);
  });

  it('prints FAIL as JSON for nonexistent story with --json', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: false,
      error: "Story 'nonexistent' not found in sprint state",
    });

    const { stdout, exitCode } = await runCli(['--json', 'status', '--story', 'nonexistent']);
    const json = JSON.parse(stdout);
    expect(json.status).toBe('fail');
    expect(json.message).toContain('not found');
    expect(exitCode).toBe(1);
  });

  it('shows "No AC results recorded" when acDetails is empty', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '1-1-story',
        status: 'in-progress',
        epic: '1',
        attempts: 1,
        maxAttempts: 10,
        lastAttempt: null,
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['status', '--story', '1-1-story']);
    expect(stdout).toContain('No AC results recorded');
    expect(stdout).toContain('Last attempt: none');
  });

  it('omits history section when no attempt history', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '1-1-story',
        status: 'backlog',
        epic: '1',
        attempts: 0,
        maxAttempts: 10,
        lastAttempt: null,
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['status', '--story', '1-1-story']);
    expect(stdout).not.toContain('-- History');
  });

  it('omits proof section when no proof summary', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '1-1-story',
        status: 'backlog',
        epic: '1',
        attempts: 0,
        maxAttempts: 10,
        lastAttempt: null,
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['status', '--story', '1-1-story']);
    expect(stdout).not.toContain('Proof:');
  });

  it('shows timeout summary when timeoutSummary is present', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '3-1-timeout',
        status: 'in-progress',
        epic: '3',
        attempts: 5,
        maxAttempts: 10,
        lastAttempt: '2026-03-18T12:00:00Z',
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: {
          reportPath: '/project/ralph/logs/timeout-report-5-3-1-timeout.md',
          iteration: 5,
          durationMinutes: 30,
          filesChanged: 3,
        },
      },
    });

    const { stdout } = await runCli(['status', '--story', '3-1-timeout']);
    expect(stdout).toContain('Last timeout: iteration 5, 30m, 3 files changed');
    expect(stdout).toContain('Report: /project/ralph/logs/timeout-report-5-3-1-timeout.md');
  });

  it('omits timeout section when no timeoutSummary', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '1-1-story',
        status: 'backlog',
        epic: '1',
        attempts: 0,
        maxAttempts: 10,
        lastAttempt: null,
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['status', '--story', '1-1-story']);
    expect(stdout).not.toContain('Last timeout');
    expect(stdout).not.toContain('Report:');
  });

  it('includes timeout in JSON output when timeoutSummary is present', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '3-1-timeout',
        status: 'in-progress',
        epic: '3',
        attempts: 5,
        maxAttempts: 10,
        lastAttempt: '2026-03-18T12:00:00Z',
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: {
          reportPath: '/project/ralph/logs/timeout-report-5-3-1-timeout.md',
          iteration: 5,
          durationMinutes: 30,
          filesChanged: 3,
        },
      },
    });

    const { stdout } = await runCli(['--json', 'status', '--story', '3-1-timeout']);
    const json = JSON.parse(stdout);
    expect(json.timeout).toBeDefined();
    expect(json.timeout.iteration).toBe(5);
    expect(json.timeout.durationMinutes).toBe(30);
    expect(json.timeout.filesChanged).toBe(3);
    expect(json.timeout.reportPath).toContain('timeout-report-5-3-1-timeout.md');
  });

  it('omits timeout from JSON output when no timeoutSummary', async () => {
    const state = getDefaultState('nodejs');
    state.initialized = true;
    writeState(state, testDir);

    mockGetStoryDrillDown.mockReturnValue({
      success: true,
      data: {
        key: '1-1-story',
        status: 'backlog',
        epic: '1',
        attempts: 0,
        maxAttempts: 10,
        lastAttempt: null,
        acDetails: [],
        attemptHistory: [],
        proofSummary: null,
        timeoutSummary: null,
      },
    });

    const { stdout } = await runCli(['--json', 'status', '--story', '1-1-story']);
    const json = JSON.parse(stdout);
    expect(json.timeout).toBeUndefined();
  });
});
