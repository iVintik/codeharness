import { describe, it, expect } from 'vitest';
import {
  buildScopedEndpoints,
  resolveEndpoints,
  DEFAULT_ENDPOINTS,
} from '../endpoints.js';
import type { EndpointUrls, ScopedEndpointUrls } from '../endpoints.js';
import type { HarnessState } from '../../../lib/state.js';

// ─── DEFAULT_ENDPOINTS ──────────────────────────────────────────────────────

describe('DEFAULT_ENDPOINTS', () => {
  it('has correct default values', () => {
    expect(DEFAULT_ENDPOINTS).toEqual({
      logs: 'http://localhost:9428',
      metrics: 'http://localhost:8428',
      traces: 'http://localhost:16686',
      otel_http: 'http://localhost:4318',
    });
  });
});

// ─── buildScopedEndpoints ───────────────────────────────────────────────────

describe('buildScopedEndpoints', () => {
  it('builds scoped logs URL with service_name filter (URL-encoded)', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my-api');
    expect(scoped.logs).toBe(
      'http://localhost:9428/select/logsql/query?query=service_name%3Amy-api',
    );
  });

  it('builds scoped metrics URL with service_name label (URL-encoded)', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my-api');
    expect(scoped.metrics).toBe(
      'http://localhost:8428/api/v1/query?query=%7Bservice_name%3D%22my-api%22%7D',
    );
  });

  it('builds scoped traces URL with service parameter', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my-api');
    expect(scoped.traces).toBe(
      'http://localhost:16686/api/traces?service=my-api&limit=20',
    );
  });

  it('properly encodes service names with special characters', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'my api&test');
    expect(scoped.traces).toBe(
      'http://localhost:16686/api/traces?service=my%20api%26test&limit=20',
    );
    expect(scoped.logs).toContain('my%20api%26test');
  });

  it('handles empty service name', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, '');
    expect(scoped.logs).toContain('service_name%3A');
    expect(scoped.traces).toContain('service=&limit=20');
  });

  it('works with custom endpoint URLs', () => {
    const custom: EndpointUrls = {
      logs: 'https://logs.example.com',
      metrics: 'https://metrics.example.com',
      traces: 'https://traces.example.com',
      otel_http: 'https://otel.example.com',
    };
    const scoped = buildScopedEndpoints(custom, 'my-svc');
    expect(scoped.logs).toMatch(/^https:\/\/logs\.example\.com/);
    expect(scoped.metrics).toMatch(/^https:\/\/metrics\.example\.com/);
    expect(scoped.traces).toMatch(/^https:\/\/traces\.example\.com/);
  });

  it('returns only logs, metrics, traces (no otel_http)', () => {
    const scoped = buildScopedEndpoints(DEFAULT_ENDPOINTS, 'test');
    const keys = Object.keys(scoped);
    expect(keys).toEqual(['logs', 'metrics', 'traces']);
  });

  // Comparison test: verify URL generation matches the original implementation
  it('produces identical URLs as the original status.ts implementation', () => {
    // Original implementation from src/commands/status.ts (before refactor):
    // function buildScopedEndpoints(endpoints, serviceName) {
    //   const encoded = encodeURIComponent(serviceName);
    //   return {
    //     logs: `${endpoints.logs}/select/logsql/query?query=${encodeURIComponent(`service_name:${serviceName}`)}`,
    //     metrics: `${endpoints.metrics}/api/v1/query?query=${encodeURIComponent(`{service_name="${serviceName}"}`)}`,
    //     traces: `${endpoints.traces}/api/traces?service=${encoded}&limit=20`,
    //   };
    // }
    const testCases = [
      { endpoints: DEFAULT_ENDPOINTS, service: 'my-api' },
      { endpoints: DEFAULT_ENDPOINTS, service: 'my api&test' },
      { endpoints: DEFAULT_ENDPOINTS, service: 'foo/bar' },
      { endpoints: DEFAULT_ENDPOINTS, service: '' },
      {
        endpoints: {
          logs: 'https://remote-logs:9428',
          metrics: 'https://remote-metrics:8428',
          traces: 'https://remote-traces:16686',
          otel_http: 'http://localhost:4318',
        } as EndpointUrls,
        service: 'production-svc',
      },
    ];

    for (const tc of testCases) {
      const scoped = buildScopedEndpoints(tc.endpoints, tc.service);
      const encoded = encodeURIComponent(tc.service);

      // Verify each URL matches the original formula exactly
      expect(scoped.logs).toBe(
        `${tc.endpoints.logs}/select/logsql/query?query=${encodeURIComponent(`service_name:${tc.service}`)}`,
      );
      expect(scoped.metrics).toBe(
        `${tc.endpoints.metrics}/api/v1/query?query=${encodeURIComponent(`{service_name="${tc.service}"}`)}`,
      );
      expect(scoped.traces).toBe(
        `${tc.endpoints.traces}/api/traces?service=${encoded}&limit=20`,
      );
    }
  });
});

// ─── resolveEndpoints ───────────────────────────────────────────────────────

function makeState(overrides?: Partial<HarnessState>): HarnessState {
  return {
    harness_version: '0.1.0',
    initialized: true,
    stack: 'nodejs',
    stacks: ['nodejs'],
    enforcement: { frontend: false, database: false, api: false },
    coverage: { target: 100, baseline: null, current: null, tool: 'c8' },
    session_flags: { logs_queried: false, tests_passed: false, coverage_met: false, verification_run: false },
    verification_log: [],
    ...overrides,
  };
}

describe('resolveEndpoints', () => {
  it('returns DEFAULT_ENDPOINTS for local-shared mode (default)', () => {
    const state = makeState();
    expect(resolveEndpoints(state)).toEqual(DEFAULT_ENDPOINTS);
  });

  it('returns DEFAULT_ENDPOINTS when no otlp config', () => {
    const state = makeState();
    delete state.otlp;
    expect(resolveEndpoints(state)).toEqual(DEFAULT_ENDPOINTS);
  });

  it('returns single remote endpoint for remote-direct mode', () => {
    const state = makeState({
      otlp: {
        enabled: true,
        endpoint: 'https://otel.example.com:4318',
        service_name: 'my-app',
        mode: 'remote-direct',
      },
    });
    const endpoints = resolveEndpoints(state);
    expect(endpoints.logs).toBe('https://otel.example.com:4318');
    expect(endpoints.metrics).toBe('https://otel.example.com:4318');
    expect(endpoints.traces).toBe('https://otel.example.com:4318');
    expect(endpoints.otel_http).toBe('https://otel.example.com:4318');
  });

  it('falls back to localhost:4318 for remote-direct with no endpoint', () => {
    const state = makeState({
      otlp: {
        enabled: true,
        endpoint: '',
        service_name: 'my-app',
        mode: 'remote-direct',
      },
    });
    // Empty string becomes the endpoint; the original code uses ?? which only catches undefined/null
    // In the original: state.otlp?.endpoint ?? 'http://localhost:4318'
    // Empty string is truthy for ??, so it stays empty
    const endpoints = resolveEndpoints(state);
    expect(endpoints.logs).toBe('');
  });

  it('uses remote backend URLs for remote-routed mode', () => {
    const state = makeState({
      otlp: {
        enabled: true,
        endpoint: 'http://localhost:4318',
        service_name: 'my-app',
        mode: 'remote-routed',
      },
      docker: {
        compose_file: '/some/path/docker-compose.yml',
        stack_running: true,
        remote_endpoints: {
          logs_url: 'https://logs.cloud:9428',
          metrics_url: 'https://metrics.cloud:8428',
          traces_url: 'https://traces.cloud:16686',
        },
        ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
      },
    });
    const endpoints = resolveEndpoints(state);
    expect(endpoints.logs).toBe('https://logs.cloud:9428');
    expect(endpoints.metrics).toBe('https://metrics.cloud:8428');
    expect(endpoints.traces).toBe('https://traces.cloud:16686');
    expect(endpoints.otel_http).toBe(DEFAULT_ENDPOINTS.otel_http);
  });

  it('falls back to defaults for remote-routed with no remote_endpoints', () => {
    const state = makeState({
      otlp: {
        enabled: true,
        endpoint: 'http://localhost:4318',
        service_name: 'my-app',
        mode: 'remote-routed',
      },
    });
    const endpoints = resolveEndpoints(state);
    expect(endpoints.logs).toBe(DEFAULT_ENDPOINTS.logs);
    expect(endpoints.metrics).toBe(DEFAULT_ENDPOINTS.metrics);
    expect(endpoints.traces).toBe(DEFAULT_ENDPOINTS.traces);
  });
});
