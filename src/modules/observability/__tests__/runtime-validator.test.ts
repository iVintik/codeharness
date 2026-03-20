import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import {
  validateRuntime,
  checkBackendHealth,
  queryTelemetryEvents,
  mapEventsToModules,
} from '../runtime-validator.js';
import {
  validateRuntime as barrelValidateRuntime,
  checkBackendHealth as barrelCheckBackendHealth,
  queryTelemetryEvents as barrelQueryTelemetryEvents,
  mapEventsToModules as barrelMapEventsToModules,
} from '../index.js';
import type {
  RuntimeValidationConfig,
  ModuleTelemetryEntry,
  RuntimeValidationResult,
  TelemetryEvent,
} from '../types.js';

const mockExecSync = vi.mocked(execSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: mock module discovery
function setupModuleDiscovery(modules: string[]) {
  mockReaddirSync.mockReturnValue(modules as unknown as ReturnType<typeof readdirSync>);
  mockStatSync.mockImplementation((_path) => ({
    isDirectory: () => true,
    isFile: () => false,
  }) as ReturnType<typeof statSync>);
}

// Helper: make a successful health response
function mockHealthy() {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
}

// Helper: make a failed health response
function mockUnhealthy() {
  mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
}

// Helper: make a successful query response with events
function mockQueryResponse(events: Array<{ source: string; message: string }>) {
  const ndjson = events
    .map((e) => JSON.stringify({ _time: '2026-03-20T10:00:00Z', _msg: e.message, source: e.source }))
    .join('\n');
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => ndjson,
  });
}

// ============================================================
// Module barrel exports
// ============================================================

describe('module barrel exports', () => {
  it('re-exports validateRuntime from index.ts', () => {
    expect(barrelValidateRuntime).toBe(validateRuntime);
  });

  it('re-exports checkBackendHealth from index.ts', () => {
    expect(barrelCheckBackendHealth).toBe(checkBackendHealth);
  });

  it('re-exports queryTelemetryEvents from index.ts', () => {
    expect(barrelQueryTelemetryEvents).toBe(queryTelemetryEvents);
  });

  it('re-exports mapEventsToModules from index.ts', () => {
    expect(barrelMapEventsToModules).toBe(mapEventsToModules);
  });
});

// ============================================================
// checkBackendHealth
// ============================================================

describe('checkBackendHealth', () => {
  it('returns true when health endpoint responds 200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await checkBackendHealth('http://localhost:9428');
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9428/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns false when health endpoint returns 503', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await checkBackendHealth('http://localhost:9428');
    expect(result).toBe(false);
  });

  it('returns false when fetch throws (ECONNREFUSED)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await checkBackendHealth('http://localhost:9428');
    expect(result).toBe(false);
  });
});

// ============================================================
// queryTelemetryEvents
// ============================================================

describe('queryTelemetryEvents', () => {
  it('returns parsed events from ndjson response', async () => {
    const ndjson = [
      JSON.stringify({ _time: '2026-03-20T10:00:00Z', _msg: 'hello', source: 'moduleA' }),
      JSON.stringify({ _time: '2026-03-20T10:00:01Z', _msg: 'world', source: 'moduleB' }),
    ].join('\n');
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => ndjson });

    const result = await queryTelemetryEvents('http://localhost:9428', '2026-03-20T09:00:00Z', '2026-03-20T11:00:00Z');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].source).toBe('moduleA');
      expect(result.data[1].message).toBe('world');
    }
  });

  it('returns empty array for empty response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '' });
    const result = await queryTelemetryEvents('http://localhost:9428', 'start', 'end');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('returns fail when backend returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await queryTelemetryEvents('http://localhost:9428', 'start', 'end');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('VictoriaLogs returned 500');
    }
  });

  it('returns fail when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    const result = await queryTelemetryEvents('http://localhost:9428', 'start', 'end');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to query telemetry events');
      expect(result.error).toContain('timeout');
    }
  });

  it('handles non-Error thrown by fetch', async () => {
    mockFetch.mockRejectedValueOnce('raw string');
    const result = await queryTelemetryEvents('http://localhost:9428', 'start', 'end');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('raw string');
    }
  });

  it('returns fail for invalid queryEndpoint URL', async () => {
    const result = await queryTelemetryEvents('not-a-valid-url', 'start', 'end');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid queryEndpoint URL');
    }
  });

  it('skips malformed JSON lines', async () => {
    const ndjson = [
      JSON.stringify({ _time: 't1', _msg: 'ok', source: 'a' }),
      'NOT VALID JSON',
      JSON.stringify({ _time: 't2', _msg: 'ok2', source: 'b' }),
    ].join('\n');
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => ndjson });
    const result = await queryTelemetryEvents('http://localhost:9428', 's', 'e');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });
});

// ============================================================
// mapEventsToModules
// ============================================================

describe('mapEventsToModules', () => {
  it('maps events to modules by source match', () => {
    const events: TelemetryEvent[] = [
      { timestamp: 't1', message: 'msg1', source: 'commands/run' },
      { timestamp: 't2', message: 'msg2', source: 'modules/verify' },
      { timestamp: 't3', message: 'msg3', source: 'commands/init' },
    ];
    const result = mapEventsToModules(events, '/project', ['commands', 'modules', 'types']);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ moduleName: 'commands', telemetryDetected: true, eventCount: 2 });
    expect(result[1]).toEqual({ moduleName: 'modules', telemetryDetected: true, eventCount: 1 });
    expect(result[2]).toEqual({ moduleName: 'types', telemetryDetected: false, eventCount: 0 });
  });

  it('maps events by message when source does not match', () => {
    const events: TelemetryEvent[] = [
      { timestamp: 't1', message: 'Processing lib data', source: '' },
    ];
    const result = mapEventsToModules(events, '/project', ['lib', 'utils']);
    expect(result[0]).toEqual({ moduleName: 'lib', telemetryDetected: true, eventCount: 1 });
    expect(result[1]).toEqual({ moduleName: 'utils', telemetryDetected: false, eventCount: 0 });
  });

  it('returns empty when no modules provided', () => {
    const events: TelemetryEvent[] = [
      { timestamp: 't1', message: 'msg', source: 'a' },
    ];
    const result = mapEventsToModules(events, '/project');
    expect(result).toHaveLength(0);
  });

  it('returns all zero when no events match', () => {
    const result = mapEventsToModules([], '/project', ['a', 'b', 'c']);
    expect(result).toHaveLength(3);
    expect(result.every((e) => !e.telemetryDetected)).toBe(true);
    expect(result.every((e) => e.eventCount === 0)).toBe(true);
  });
});

// ============================================================
// validateRuntime — skipped (backend unreachable)
// ============================================================

describe('validateRuntime — backend unreachable (AC #3)', () => {
  it('returns skipped result with correct message', async () => {
    mockUnhealthy();
    setupModuleDiscovery(['commands', 'modules', 'types']);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skipped).toBe(true);
      expect(result.data.skipReason).toBe(
        'runtime validation skipped -- observability stack not available',
      );
      expect(result.data.coveragePercent).toBe(0);
      expect(result.data.modulesWithTelemetry).toBe(0);
      expect(result.data.totalModules).toBe(3);
      expect(result.data.entries).toHaveLength(3);
      expect(result.data.entries.every((e) => !e.telemetryDetected)).toBe(true);
    }
  });

  it('does not run tests when backend is unreachable', async () => {
    mockUnhealthy();
    setupModuleDiscovery([]);
    await validateRuntime('/project');
    expect(mockExecSync).not.toHaveBeenCalled();
  });
});

// ============================================================
// validateRuntime — happy path (AC #1)
// ============================================================

describe('validateRuntime — healthy backend (AC #1)', () => {
  it('runs tests and queries backend', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery(['commands', 'modules']);

    // Query response
    mockQueryResponse([
      { source: 'commands/run', message: 'test' },
      { source: 'modules/verify', message: 'test' },
    ]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skipped).toBe(false);
      expect(result.data.totalModules).toBe(2);
      expect(result.data.modulesWithTelemetry).toBe(2);
      expect(result.data.coveragePercent).toBe(100);
    }
    expect(mockExecSync).toHaveBeenCalledOnce();
    expect(mockExecSync).toHaveBeenCalledWith(
      'npm test',
      expect.objectContaining({
        cwd: '/project',
        env: expect.objectContaining({
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
        }),
      }),
    );
  });
});

// ============================================================
// validateRuntime — coverage computation (AC #2)
// ============================================================

describe('validateRuntime — coverage computation (AC #2)', () => {
  it('computes 62.5% with 5/8 modules emitting telemetry', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);

    mockQueryResponse([
      { source: 'm1/file', message: '' },
      { source: 'm2/file', message: '' },
      { source: 'm3/file', message: '' },
      { source: 'm4/file', message: '' },
      { source: 'm5/file', message: '' },
    ]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalModules).toBe(8);
      expect(result.data.modulesWithTelemetry).toBe(5);
      expect(result.data.coveragePercent).toBe(62.5);
      // The 3 silent modules
      const silent = result.data.entries.filter((e) => !e.telemetryDetected);
      expect(silent).toHaveLength(3);
      expect(silent.map((s) => s.moduleName).sort()).toEqual(['m6', 'm7', 'm8']);
    }
  });

  it('computes 0% when no modules emit telemetry', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery(['a', 'b', 'c']);

    mockQueryResponse([]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coveragePercent).toBe(0);
      expect(result.data.modulesWithTelemetry).toBe(0);
      expect(result.data.totalModules).toBe(3);
    }
  });

  it('computes 100% when all modules emit telemetry', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery(['x', 'y']);

    mockQueryResponse([
      { source: 'x/file', message: '' },
      { source: 'y/file', message: '' },
    ]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coveragePercent).toBe(100);
      expect(result.data.modulesWithTelemetry).toBe(2);
    }
  });

  it('computes 0% when project has no modules', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery([]);

    mockQueryResponse([]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coveragePercent).toBe(0);
      expect(result.data.totalModules).toBe(0);
    }
  });
});

// ============================================================
// validateRuntime — custom config
// ============================================================

describe('validateRuntime — custom config overrides', () => {
  it('uses custom test command and endpoints', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery([]);
    mockQueryResponse([]);

    await validateRuntime('/project', {
      testCommand: 'pytest',
      otlpEndpoint: 'http://otel:4317',
      queryEndpoint: 'http://vlogs:9428',
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      'pytest',
      expect.objectContaining({
        env: expect.objectContaining({
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4317',
        }),
      }),
    );
    // Health check should have used the custom query endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      'http://vlogs:9428/health',
      expect.any(Object),
    );
  });
});

// ============================================================
// validateRuntime — error handling
// ============================================================

describe('validateRuntime — error handling', () => {
  it('rejects empty projectDir', async () => {
    const result = await validateRuntime('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('projectDir is required');
    }
  });

  it('rejects testCommand with shell metacharacters', async () => {
    const result = await validateRuntime('/project', { testCommand: 'npm test; rm -rf /' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('disallowed shell metacharacters');
    }
  });

  it('rejects testCommand with pipe operator', async () => {
    const result = await validateRuntime('/project', { testCommand: 'echo foo | cat' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('disallowed shell metacharacters');
    }
  });

  it('rejects testCommand with backtick', async () => {
    const result = await validateRuntime('/project', { testCommand: 'npm `whoami` test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('disallowed shell metacharacters');
    }
  });

  it('returns fail when test command fails', async () => {
    mockHealthy();
    mockExecSync.mockImplementation(() => {
      throw new Error('Command failed: npm test');
    });
    setupModuleDiscovery([]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Test command failed');
    }
  });

  it('returns fail when test command throws non-Error', async () => {
    mockHealthy();
    mockExecSync.mockImplementation(() => {
      throw 'exit code 1'; // eslint-disable-line no-throw-literal
    });
    setupModuleDiscovery([]);

    const result = await validateRuntime('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('exit code 1');
    }
  });

  it('returns fail when telemetry query fails', async () => {
    mockHealthy();
    mockExecSync.mockReturnValue(Buffer.from(''));
    setupModuleDiscovery([]);
    // Query endpoint fails
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const result = await validateRuntime('/project');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Failed to query telemetry events');
    }
  });

  it('handles missing src/ directory for module discovery', async () => {
    mockUnhealthy();
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalModules).toBe(0);
      expect(result.data.skipped).toBe(true);
    }
  });

  it('skips entries where statSync throws', async () => {
    mockUnhealthy();
    mockReaddirSync.mockReturnValue(['good', 'bad'] as unknown as ReturnType<typeof readdirSync>);
    let callCount = 0;
    mockStatSync.mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error('EACCES');
      return { isDirectory: () => true, isFile: () => false } as ReturnType<typeof statSync>;
    });

    const result = await validateRuntime('/project');
    expect(result.success).toBe(true);
    if (result.success) {
      // Only 'good' should be discovered, 'bad' filtered out
      expect(result.data.totalModules).toBe(1);
      expect(result.data.entries[0].moduleName).toBe('good');
    }
  });
});
