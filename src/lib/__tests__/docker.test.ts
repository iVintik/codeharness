import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
  };
});

vi.mock('../stack-path.js', () => ({
  getComposeFilePath: vi.fn(() => '/mock/.codeharness/stack/docker-compose.harness.yml'),
  getOtelConfigPath: vi.fn(() => '/mock/.codeharness/stack/otel-collector-config.yaml'),
  ensureStackDir: vi.fn(),
}));

vi.mock('../../templates/docker-compose.js', () => ({
  dockerComposeTemplate: vi.fn(() => '# compose content'),
  dockerComposeCollectorOnlyTemplate: vi.fn(() => '# collector-only content'),
}));

vi.mock('../../templates/otel-config.js', () => ({
  otelCollectorConfigTemplate: vi.fn(() => '# otel content'),
  otelCollectorRemoteTemplate: vi.fn(() => '# remote otel content'),
}));

import {
  isDockerAvailable,
  isDockerComposeAvailable,
  isStackRunning,
  startStack,
  stopStack,
  getStackHealth,
  isSharedStackRunning,
  startSharedStack,
  stopSharedStack,
  startCollectorOnly,
  isCollectorRunning,
  stopCollectorOnly,
  getCollectorHealth,
  checkRemoteEndpoint,
} from '../docker.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { ensureStackDir } from '../stack-path.js';
const mockExecFileSync = vi.mocked(execFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockEnsureStackDir = vi.mocked(ensureStackDir);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isDockerAvailable', () => {
  it('returns true when docker command succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('Docker version 24.0.0'));
    expect(isDockerAvailable()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith('docker', ['--version'], { stdio: 'pipe', timeout: 10_000 });
  });

  it('returns false when docker command fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('command not found: docker');
    });
    expect(isDockerAvailable()).toBe(false);
  });
});

describe('isDockerComposeAvailable', () => {
  it('returns true when docker compose version succeeds', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('Docker Compose version v2.24.0'));
    expect(isDockerComposeAvailable()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith('docker', ['compose', 'version'], { stdio: 'pipe', timeout: 10_000 });
  });

  it('returns false when docker compose is not available', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('docker compose not found');
    });
    expect(isDockerComposeAvailable()).toBe(false);
  });
});

describe('isStackRunning', () => {
  it('returns true when all services are running', () => {
    const jsonOutput = [
      '{"Service":"victoria-logs","State":"running"}',
      '{"Service":"victoria-metrics","State":"running"}',
    ].join('\n');
    mockExecFileSync.mockReturnValue(Buffer.from(jsonOutput));
    expect(isStackRunning('docker-compose.harness.yml')).toBe(true);
  });

  it('returns false when some services are not running', () => {
    const jsonOutput = [
      '{"Service":"victoria-logs","State":"running"}',
      '{"Service":"victoria-metrics","State":"exited"}',
    ].join('\n');
    mockExecFileSync.mockReturnValue(Buffer.from(jsonOutput));
    expect(isStackRunning('docker-compose.harness.yml')).toBe(false);
  });

  it('returns false when output is empty', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    expect(isStackRunning('docker-compose.harness.yml')).toBe(false);
  });

  it('returns false when command fails (compose file missing)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('no such file');
    });
    expect(isStackRunning('nonexistent.yml')).toBe(false);
  });

  it('passes correct compose file to command', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    isStackRunning('custom-compose.yml');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'custom-compose.yml', 'ps', '--format', 'json'],
      expect.objectContaining({ stdio: 'pipe', timeout: 15_000 }),
    );
  });
});

describe('startStack', () => {
  it('returns started=true on success', () => {
    // First call: docker compose up -d
    // Second call: docker compose ps --format json (from getRunningServices)
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(''))
      .mockReturnValueOnce(Buffer.from(
        '{"Service":"victoria-logs","State":"running","Publishers":[{"PublishedPort":9428}]}\n' +
        '{"Service":"otel-collector","State":"running","Publishers":[{"PublishedPort":4317},{"PublishedPort":4318}]}'
      ));

    const result = startStack('docker-compose.harness.yml');
    expect(result.started).toBe(true);
    expect(result.services.length).toBe(2);
    expect(result.services[0].name).toBe('victoria-logs');
    expect(result.services[0].port).toBe('9428');
    expect(result.error).toBeUndefined();
  });

  it('returns started=false with error on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('Cannot connect to Docker daemon');
    });

    const result = startStack('docker-compose.harness.yml');
    expect(result.started).toBe(false);
    expect(result.services).toEqual([]);
    expect(result.error).toContain('Cannot connect to Docker daemon');
  });

  it('enforces 30s timeout', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('')).mockReturnValueOnce(Buffer.from(''));
    startStack('docker-compose.harness.yml');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'docker-compose.harness.yml', 'up', '-d'],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('handles getRunningServices failure gracefully', () => {
    // up -d succeeds, but ps fails
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(''))
      .mockImplementationOnce(() => { throw new Error('ps failed'); });

    const result = startStack('docker-compose.harness.yml');
    expect(result.started).toBe(true);
    expect(result.services).toEqual([]);
  });
});

describe('stopStack', () => {
  it('calls docker compose down -v', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    stopStack('docker-compose.harness.yml');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'docker-compose.harness.yml', 'down', '-v'],
      expect.objectContaining({ stdio: 'pipe', timeout: 30_000 }),
    );
  });

  it('throws when command fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('compose down failed');
    });
    expect(() => stopStack('docker-compose.harness.yml')).toThrow('compose down failed');
  });
});

describe('getStackHealth', () => {
  it('reports healthy when all expected services are running', () => {
    const jsonOutput = [
      '{"Service":"victoria-logs","State":"running"}',
      '{"Service":"victoria-metrics","State":"running"}',
      '{"Service":"victoria-traces","State":"running"}',
      '{"Service":"otel-collector","State":"running"}',
    ].join('\n');
    mockExecFileSync.mockReturnValue(Buffer.from(jsonOutput));

    const health = getStackHealth('docker-compose.harness.yml');
    expect(health.healthy).toBe(true);
    expect(health.services).toHaveLength(4);
    expect(health.services.every(s => s.running)).toBe(true);
    expect(health.remedy).toBeUndefined();
  });

  it('reports unhealthy when some services are down', () => {
    const jsonOutput = [
      '{"Service":"victoria-logs","State":"running"}',
      '{"Service":"victoria-metrics","State":"exited"}',
      '{"Service":"victoria-traces","State":"running"}',
      '{"Service":"otel-collector","State":"running"}',
    ].join('\n');
    mockExecFileSync.mockReturnValue(Buffer.from(jsonOutput));

    const health = getStackHealth('docker-compose.harness.yml');
    expect(health.healthy).toBe(false);
    const metricsService = health.services.find(s => s.name === 'victoria-metrics');
    expect(metricsService?.running).toBe(false);
    expect(health.remedy).toContain('docker compose -f docker-compose.harness.yml up -d');
  });

  it('reports all down when command fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('compose not running');
    });

    const health = getStackHealth('docker-compose.harness.yml');
    expect(health.healthy).toBe(false);
    expect(health.services).toHaveLength(4);
    expect(health.services.every(s => !s.running)).toBe(true);
    expect(health.remedy).toBeDefined();
  });

  it('reports unhealthy when no services found in output', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));

    const health = getStackHealth('docker-compose.harness.yml');
    expect(health.healthy).toBe(false);
    expect(health.services.every(s => !s.running)).toBe(true);
  });

  it('checks all four expected services', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const health = getStackHealth('docker-compose.harness.yml');
    const names = health.services.map(s => s.name);
    expect(names).toContain('victoria-logs');
    expect(names).toContain('victoria-metrics');
    expect(names).toContain('victoria-traces');
    expect(names).toContain('otel-collector');
  });

  it('uses -p flag when projectName is provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    getStackHealth('compose.yml', 'codeharness-shared');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-p', 'codeharness-shared', '-f', 'compose.yml', 'ps', '--format', 'json'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  it('includes project name in remedy when projectName is provided', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const health = getStackHealth('compose.yml', 'codeharness-shared');
    expect(health.remedy).toContain('-p codeharness-shared');
  });
});

describe('isSharedStackRunning', () => {
  it('returns true when all shared services are running', () => {
    const jsonOutput = [
      '{"Service":"victoria-logs","State":"running"}',
      '{"Service":"victoria-metrics","State":"running"}',
    ].join('\n');
    mockExecFileSync.mockReturnValue(Buffer.from(jsonOutput));
    expect(isSharedStackRunning()).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['-p', 'codeharness-shared']),
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  it('returns false when some services are not running', () => {
    const jsonOutput = [
      '{"Service":"victoria-logs","State":"running"}',
      '{"Service":"victoria-metrics","State":"exited"}',
    ].join('\n');
    mockExecFileSync.mockReturnValue(Buffer.from(jsonOutput));
    expect(isSharedStackRunning()).toBe(false);
  });

  it('returns false when output is empty', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    expect(isSharedStackRunning()).toBe(false);
  });

  it('returns false when command fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('no such file');
    });
    expect(isSharedStackRunning()).toBe(false);
  });
});

describe('startSharedStack', () => {
  it('calls ensureStackDir before writing files', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    startSharedStack();
    expect(mockEnsureStackDir).toHaveBeenCalled();
  });

  it('writes compose and otel config files', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    startSharedStack();
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/.codeharness/stack/docker-compose.harness.yml',
      expect.any(String),
      'utf-8',
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/.codeharness/stack/otel-collector-config.yaml',
      expect.any(String),
      'utf-8',
    );
  });

  it('calls docker compose up with -p codeharness-shared', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    startSharedStack();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-p', 'codeharness-shared', '-f', '/mock/.codeharness/stack/docker-compose.harness.yml', 'up', '-d'],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('returns started=true on success', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = startSharedStack();
    expect(result.started).toBe(true);
  });

  it('returns started=false with error on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('port already in use');
    });
    const result = startSharedStack();
    expect(result.started).toBe(false);
    expect(result.error).toContain('port already in use');
  });
});

describe('stopSharedStack', () => {
  it('calls docker compose down WITHOUT -v (preserves volumes)', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    stopSharedStack();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-p', 'codeharness-shared', '-f', '/mock/.codeharness/stack/docker-compose.harness.yml', 'down'],
      expect.objectContaining({ stdio: 'pipe', timeout: 30_000 }),
    );
  });

  it('does NOT use -v flag', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    stopSharedStack();
    const call = mockExecFileSync.mock.calls[0];
    const args = call[1] as string[];
    expect(args).not.toContain('-v');
  });

  it('throws when command fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('compose down failed');
    });
    expect(() => stopSharedStack()).toThrow('compose down failed');
  });
});

describe('startCollectorOnly', () => {
  it('writes compose and otel config files', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    startCollectorOnly('https://logs.co', 'https://metrics.co', 'https://traces.co');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/.codeharness/stack/docker-compose.harness.yml',
      expect.any(String),
      'utf-8',
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/mock/.codeharness/stack/otel-collector-config.yaml',
      expect.any(String),
      'utf-8',
    );
  });

  it('uses codeharness-collector project name', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    startCollectorOnly('https://logs.co', 'https://metrics.co', 'https://traces.co');
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-p', 'codeharness-collector', '-f', '/mock/.codeharness/stack/docker-compose.harness.yml', 'up', '-d'],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('returns started=true on success', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const result = startCollectorOnly('https://logs.co', 'https://metrics.co', 'https://traces.co');
    expect(result.started).toBe(true);
  });

  it('returns started=false with error on failure', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('port in use');
    });
    const result = startCollectorOnly('https://logs.co', 'https://metrics.co', 'https://traces.co');
    expect(result.started).toBe(false);
    expect(result.error).toContain('port in use');
  });
});

describe('isCollectorRunning', () => {
  it('returns true when collector is running', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"Service":"otel-collector","State":"running"}'));
    expect(isCollectorRunning()).toBe(true);
  });

  it('returns false when collector is not running', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"Service":"otel-collector","State":"exited"}'));
    expect(isCollectorRunning()).toBe(false);
  });

  it('returns false when command fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('fail'); });
    expect(isCollectorRunning()).toBe(false);
  });

  it('returns false when output is empty', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    expect(isCollectorRunning()).toBe(false);
  });
});

describe('stopCollectorOnly', () => {
  it('calls docker compose down with codeharness-collector project', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    stopCollectorOnly();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-p', 'codeharness-collector', '-f', '/mock/.codeharness/stack/docker-compose.harness.yml', 'down'],
      expect.objectContaining({ stdio: 'pipe', timeout: 30_000 }),
    );
  });

  it('throws when command fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('down failed'); });
    expect(() => stopCollectorOnly()).toThrow('down failed');
  });
});

describe('getCollectorHealth', () => {
  it('reports healthy when otel-collector is running', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('{"Service":"otel-collector","State":"running"}'));
    const health = getCollectorHealth('/mock/compose.yml');
    expect(health.healthy).toBe(true);
    expect(health.services).toHaveLength(1);
    expect(health.services[0].name).toBe('otel-collector');
    expect(health.services[0].running).toBe(true);
  });

  it('reports unhealthy when otel-collector is not running', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''));
    const health = getCollectorHealth('/mock/compose.yml');
    expect(health.healthy).toBe(false);
    expect(health.remedy).toContain('codeharness-collector');
  });

  it('reports unhealthy when command fails', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('fail'); });
    const health = getCollectorHealth('/mock/compose.yml');
    expect(health.healthy).toBe(false);
  });
});

describe('checkRemoteEndpoint', () => {
  it('returns reachable=true when fetch succeeds', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    const result = await checkRemoteEndpoint('https://example.com');
    expect(result.reachable).toBe(true);
    expect(result.error).toBeUndefined();
    globalThis.fetch = originalFetch;
  });

  it('returns reachable=false when fetch fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;
    const result = await checkRemoteEndpoint('https://unreachable.com');
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
    globalThis.fetch = originalFetch;
  });

  it('returns reachable=true even for non-2xx responses (connectivity check)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as typeof fetch;
    const result = await checkRemoteEndpoint('https://example.com/notfound');
    expect(result.reachable).toBe(true);
    globalThis.fetch = originalFetch;
  });
});
