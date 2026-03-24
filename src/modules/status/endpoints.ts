/**
 * Status endpoints — URL builders for observability dashboards.
 * Pure functions; no filesystem or network access.
 */

import type { HarnessState } from '../../lib/state.js';

export interface EndpointUrls {
  logs: string;
  metrics: string;
  traces: string;
  otel_http: string;
}

export interface ScopedEndpointUrls {
  logs: string;
  metrics: string;
  traces: string;
}

export const DEFAULT_ENDPOINTS: EndpointUrls = {
  logs: 'http://localhost:9428',
  metrics: 'http://localhost:8428',
  traces: 'http://localhost:16686',
  otel_http: 'http://localhost:4318',
};

/**
 * Build service-scoped endpoint URLs for observability dashboards.
 * Produces URLs filtered by service_name for logs, metrics, and traces.
 */
export function buildScopedEndpoints(endpoints: EndpointUrls, serviceName: string): ScopedEndpointUrls {
  const encoded = encodeURIComponent(serviceName);
  return {
    logs: `${endpoints.logs}/select/logsql/query?query=${encodeURIComponent(`service_name:${serviceName}`)}`,
    metrics: `${endpoints.metrics}/api/v1/query?query=${encodeURIComponent(`{service_name="${serviceName}"}`)}`,
    traces: `${endpoints.traces}/api/traces?service=${encoded}&limit=20`,
  };
}

/**
 * Resolve the correct endpoint URLs based on OTLP mode.
 * - remote-direct: all endpoints point to the remote OTLP endpoint
 * - remote-routed: uses configured remote backend URLs, falls back to defaults
 * - local-shared (default): uses DEFAULT_ENDPOINTS
 */
export function resolveEndpoints(state: HarnessState): EndpointUrls {
  const mode = state.otlp?.mode ?? 'local-shared';
  if (mode === 'remote-direct') {
    const endpoint = state.otlp?.endpoint ?? 'http://localhost:4318';
    return {
      logs: endpoint,
      metrics: endpoint,
      traces: endpoint,
      otel_http: endpoint,
    };
  }
  if (mode === 'remote-routed') {
    const re = state.docker?.remote_endpoints;
    return {
      logs: re?.logs_url ?? DEFAULT_ENDPOINTS.logs,
      metrics: re?.metrics_url ?? DEFAULT_ENDPOINTS.metrics,
      traces: re?.traces_url ?? DEFAULT_ENDPOINTS.traces,
      otel_http: DEFAULT_ENDPOINTS.otel_http,
    };
  }
  return DEFAULT_ENDPOINTS;
}
