import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/state.js', () => ({
  readState: vi.fn(),
  StateFileNotFoundError: class extends Error {
    constructor() { super('No state file found.'); this.name = 'StateFileNotFoundError'; }
  },
}));

vi.mock('../../../lib/docker/index.js', () => ({
  getStackHealth: vi.fn(() => ({ healthy: true, services: [], remedy: undefined })),
  getCollectorHealth: vi.fn(() => ({ healthy: true, services: [], remedy: undefined })),
  checkRemoteEndpoint: vi.fn(async () => ({ reachable: true })),
}));

vi.mock('../../../lib/stack-path.js', () => ({
  getStackDir: vi.fn(() => '/mock/.codeharness/stack'),
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getElkComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.elk.yml'),
}));

vi.mock('../../../lib/beads.js', () => ({
  isBeadsInitialized: vi.fn(() => false),
  listIssues: vi.fn(() => []),
}));

vi.mock('../../../lib/onboard-checks.js', () => ({
  getOnboardingProgress: vi.fn(() => null),
}));

vi.mock('../../sprint/index.js', () => ({
  generateReport: vi.fn(() => ({ success: false })),
}));

vi.mock('../../verify/index.js', () => ({
  getValidationProgress: vi.fn(() => ({ success: false })),
}));

import { readState } from '../../../lib/state.js';
import { getStackHealth } from '../../../lib/docker/index.js';
import { handleDockerCheck } from '../formatters.js';
import type { HarnessState } from '../../../lib/state.js';

const mockReadState = vi.mocked(readState);
const mockGetStackHealth = vi.mocked(getStackHealth);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('handleDockerCheck — backend awareness', () => {
  it('skips Docker check when backend is none', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.0.0-dev',
      initialized: true,
      stack: 'nodejs',
      stacks: ['nodejs'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: false, endpoint: '', service_name: 'test', mode: 'local-shared', backend: 'none' },
    } as HarnessState);

    await handleDockerCheck(false);

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    expect(logCalls.some((l: string) => l.includes('Observability disabled'))).toBe(true);
    expect(mockGetStackHealth).not.toHaveBeenCalled();
  });

  it('returns JSON with mode none when backend is none', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.0.0-dev',
      initialized: true,
      stack: 'nodejs',
      stacks: ['nodejs'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: false, endpoint: '', service_name: 'test', mode: 'local-shared', backend: 'none' },
    } as HarnessState);

    await handleDockerCheck(true);

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    const jsonCall = logCalls.find((l: string) => l.includes('"mode":"none"'));
    expect(jsonCall).toBeDefined();
  });

  it('shows OpenSearch/ELK label when backend is elk', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.0.0-dev',
      initialized: true,
      stack: 'nodejs',
      stacks: ['nodejs'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'local-shared', backend: 'elk' },
      docker: {
        compose_file: 'docker-compose.elk.yml',
        stack_running: true,
        ports: { logs: 9200, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    } as HarnessState);

    mockGetStackHealth.mockReturnValue({ healthy: true, services: [], remedy: undefined });

    await handleDockerCheck(false);

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    expect(logCalls.some((l: string) => l.includes('OpenSearch/ELK stack'))).toBe(true);
  });

  it('shows VictoriaMetrics label when backend is victoria (default)', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.0.0-dev',
      initialized: true,
      stack: 'nodejs',
      stacks: ['nodejs'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'local-shared', backend: 'victoria' },
      docker: {
        compose_file: 'docker-compose.harness.yml',
        stack_running: true,
        ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    } as HarnessState);

    mockGetStackHealth.mockReturnValue({ healthy: true, services: [], remedy: undefined });

    await handleDockerCheck(false);

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    expect(logCalls.some((l: string) => l.includes('VictoriaMetrics stack'))).toBe(true);
  });

  it('uses ELK compose file for shared stack when backend is elk', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.0.0-dev',
      initialized: true,
      stack: 'nodejs',
      stacks: ['nodejs'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'local-shared', backend: 'elk' },
      docker: {
        compose_file: '/mock/.codeharness/stack/docker-compose.elk.yml',
        stack_running: true,
        ports: { logs: 9200, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    } as HarnessState);

    mockGetStackHealth.mockReturnValue({ healthy: true, services: [], remedy: undefined });

    await handleDockerCheck(false);

    // Verify getStackHealth was called with the ELK compose file, not the Victoria one
    expect(mockGetStackHealth).toHaveBeenCalledWith(
      '/mock/.codeharness/stack/docker-compose.elk.yml',
      'codeharness-shared',
    );
  });

  it('shows ELK-specific endpoints when backend is elk and healthy', async () => {
    mockReadState.mockReturnValue({
      harness_version: '0.0.0-dev',
      initialized: true,
      stack: 'nodejs',
      stacks: ['nodejs'],
      enforcement: { frontend: true, database: true, api: true },
      coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
      session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
      verification_log: [],
      otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'local-shared', backend: 'elk' },
      docker: {
        compose_file: '/mock/.codeharness/stack/docker-compose.elk.yml',
        stack_running: true,
        ports: { logs: 9200, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    } as HarnessState);

    mockGetStackHealth.mockReturnValue({ healthy: true, services: [], remedy: undefined });

    await handleDockerCheck(false);

    const logCalls = (console.log as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => String(c[0]),
    );
    // Should show OpenSearch port 9200, not Victoria port 9428
    expect(logCalls.some((l: string) => l.includes('localhost:9200'))).toBe(true);
    expect(logCalls.some((l: string) => l.includes('localhost:9428'))).toBe(false);
  });
});
