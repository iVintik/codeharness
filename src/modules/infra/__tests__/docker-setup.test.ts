import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/docker.js', () => ({
  isDockerAvailable: vi.fn(() => true),
  isSharedStackRunning: vi.fn(() => false),
  startSharedStack: vi.fn(() => ({
    started: true,
    services: [
      { name: 'victoria-logs', status: 'running', port: '9428' },
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

vi.mock('../../../lib/stack-path.js', () => ({
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  ensureStackDir: vi.fn(),
}));

vi.mock('../../../lib/state.js', () => ({
  writeState: vi.fn(),
  readState: vi.fn(() => ({})),
}));

import {
  isDockerAvailable,
  isSharedStackRunning,
  startSharedStack,
  startCollectorOnly,
} from '../../../lib/docker.js';
import { writeState } from '../../../lib/state.js';
import { checkDocker, setupDocker } from '../docker-setup.js';
import type { HarnessState } from '../../../lib/state.js';

const mockIsDockerAvailable = vi.mocked(isDockerAvailable);
const mockIsSharedStackRunning = vi.mocked(isSharedStackRunning);
const mockStartSharedStack = vi.mocked(startSharedStack);
const mockStartCollectorOnly = vi.mocked(startCollectorOnly);

const baseState: HarnessState = {
  harness_version: '0.0.0-dev',
  initialized: true,
  stack: 'nodejs',
  enforcement: { frontend: true, database: true, api: true },
  coverage: { target: 90, baseline: null, current: null, tool: 'c8' },
  session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
  verification_log: [],
  otlp: { enabled: true, endpoint: 'http://localhost:4318', service_name: 'test', mode: 'local-shared' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockIsDockerAvailable.mockReturnValue(true);
  mockIsSharedStackRunning.mockReturnValue(false);
  mockStartSharedStack.mockReturnValue({
    started: true,
    services: [
      { name: 'victoria-logs', status: 'running', port: '9428' },
      { name: 'otel-collector', status: 'running', port: '4317,4318' },
    ],
  });
  mockStartCollectorOnly.mockReturnValue({
    started: true,
    services: [{ name: 'otel-collector', status: 'running', port: '4317,4318' }],
  });
});

describe('checkDocker', () => {
  it('returns available=true when Docker is available', () => {
    const result = checkDocker({ observability: true, isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(true);
      expect(result.data.criticalFailure).toBe(false);
    }
  });

  it('returns critical failure when Docker missing and observability on', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    const result = checkDocker({ observability: true, isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(false);
      expect(result.data.criticalFailure).toBe(true);
      expect(result.data.dockerResult).toBeDefined();
    }
  });

  it('returns non-critical when Docker missing and observability off', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    const result = checkDocker({ observability: false, isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(false);
      expect(result.data.criticalFailure).toBe(false);
    }
  });

  it('skips Docker check for remote-direct mode', () => {
    mockIsDockerAvailable.mockReturnValue(false);
    const result = checkDocker({ observability: true, otelEndpoint: 'http://remote:4318', isJson: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.available).toBe(true);
      expect(result.data.criticalFailure).toBe(false);
    }
  });
});

describe('setupDocker', () => {
  it('skips Docker when observability off', () => {
    const result = setupDocker({
      observability: false,
      isJson: false,
      dockerAvailable: true,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker).toBeNull();
    }
  });

  it('configures remote-direct mode', () => {
    const result = setupDocker({
      observability: true,
      otelEndpoint: 'http://remote:4318',
      isJson: false,
      dockerAvailable: false,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker).toBeNull();
      expect(result.data.state.otlp!.mode).toBe('remote-direct');
      expect(result.data.state.otlp!.endpoint).toBe('http://remote:4318');
    }
  });

  it('configures remote-routed mode', () => {
    const result = setupDocker({
      observability: true,
      logsUrl: 'http://logs:9428',
      metricsUrl: 'http://metrics:8428',
      tracesUrl: 'http://traces:16686',
      isJson: false,
      dockerAvailable: true,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker!.stack_running).toBe(true);
      expect(result.data.state.otlp!.mode).toBe('remote-routed');
    }
    expect(mockStartCollectorOnly).toHaveBeenCalledWith(
      'http://logs:9428', 'http://metrics:8428', 'http://traces:16686',
    );
  });

  it('starts local-shared stack', () => {
    const result = setupDocker({
      observability: true,
      isJson: false,
      dockerAvailable: true,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker!.stack_running).toBe(true);
      expect(result.data.state.otlp!.mode).toBe('local-shared');
    }
    expect(mockStartSharedStack).toHaveBeenCalled();
  });

  it('detects already running shared stack', () => {
    mockIsSharedStackRunning.mockReturnValue(true);
    const result = setupDocker({
      observability: true,
      isJson: false,
      dockerAvailable: true,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker!.stack_running).toBe(true);
    }
    expect(mockStartSharedStack).not.toHaveBeenCalled();
  });

  it('reports failure when stack fails to start', () => {
    mockStartSharedStack.mockReturnValue({ started: false, services: [], error: 'timeout' });
    const result = setupDocker({
      observability: true,
      isJson: false,
      dockerAvailable: true,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker!.stack_running).toBe(false);
    }
  });

  it('handles Docker not available with deferred observability', () => {
    const result = setupDocker({
      observability: true,
      isJson: false,
      dockerAvailable: false,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docker!.stack_running).toBe(false);
    }
  });

  it('writes state to disk', () => {
    setupDocker({
      observability: true,
      isJson: false,
      dockerAvailable: true,
      state: { ...baseState },
      projectDir: '/tmp/test',
    });
    expect(writeState).toHaveBeenCalled();
  });
});
