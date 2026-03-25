/**
 * VictoriaBackend — ObservabilityBackend implementation for the Victoria stack.
 * Queries Victoria Logs, Victoria Metrics, and Jaeger via their HTTP APIs.
 * Uses Node.js built-in fetch (no external HTTP dependencies).
 */

import type {
  ObservabilityBackend,
  LogQuery,
  LogResult,
  LogEntry,
  MetricQuery,
  MetricResult,
  MetricSeries,
  MetricDataPoint,
  TraceQuery,
  TraceResult,
  TraceSpan,
  HealthStatus,
} from '../../types/observability.js';
import type { Result } from '../../types/result.js';
import { ok, fail } from '../../types/result.js';
import { DEFAULT_PORTS } from './types.js';

/** Configuration for VictoriaBackend service URLs */
export interface VictoriaConfig {
  logsUrl?: string;
  metricsUrl?: string;
  tracesUrl?: string;
}

const DEFAULT_LOGS_URL = `http://localhost:${DEFAULT_PORTS.logs}`;
const DEFAULT_METRICS_URL = `http://localhost:${DEFAULT_PORTS.metrics}`;
const DEFAULT_TRACES_URL = `http://localhost:${DEFAULT_PORTS.traces}`;

/** Default timeout for query requests (30s) */
const QUERY_TIMEOUT_MS = 30_000;
/** Default timeout for health check requests (5s) */
const HEALTH_TIMEOUT_MS = 5_000;

export class VictoriaBackend implements ObservabilityBackend {
  readonly type = 'victoria' as const;
  private readonly logsUrl: string;
  private readonly metricsUrl: string;
  private readonly tracesUrl: string;

  constructor(config?: VictoriaConfig) {
    this.logsUrl = config?.logsUrl ?? DEFAULT_LOGS_URL;
    this.metricsUrl = config?.metricsUrl ?? DEFAULT_METRICS_URL;
    this.tracesUrl = config?.tracesUrl ?? DEFAULT_TRACES_URL;
  }

  async queryLogs(params: LogQuery): Promise<Result<LogResult>> {
    const url = new URL('/select/logsql/query', this.logsUrl);
    url.searchParams.set('query', params.query);
    url.searchParams.set('start', params.timeRange.start);
    url.searchParams.set('end', params.timeRange.end);
    if (params.limit !== undefined) {
      url.searchParams.set('limit', String(params.limit));
    }

    const endpoint = url.toString();
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) });
      if (!response.ok) {
        return fail(`Victoria Logs returned ${response.status}`, {
          endpoint,
          statusCode: response.status,
        });
      }
      const text = await response.text();
      const entries = parseLogEntries(text);
      return ok({ entries, total: entries.length });
    } catch (err) {
      return fail(errorMessage(err), { endpoint });
    }
  }

  async queryMetrics(params: MetricQuery): Promise<Result<MetricResult>> {
    const url = new URL('/api/v1/query_range', this.metricsUrl);
    url.searchParams.set('query', params.query);
    url.searchParams.set('start', params.timeRange.start);
    url.searchParams.set('end', params.timeRange.end);
    if (params.step !== undefined) {
      url.searchParams.set('step', params.step);
    }

    const endpoint = url.toString();
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) });
      if (!response.ok) {
        return fail(`Victoria Metrics returned ${response.status}`, {
          endpoint,
          statusCode: response.status,
        });
      }
      const body = (await response.json()) as PrometheusResponse;
      const series = parseMetricSeries(body);
      return ok({ series });
    } catch (err) {
      return fail(errorMessage(err), { endpoint });
    }
  }

  async queryTraces(params: TraceQuery): Promise<Result<TraceResult>> {
    const url = new URL('/api/traces', this.tracesUrl);
    if (params.serviceName) {
      url.searchParams.set('service', params.serviceName);
    }
    if (params.operationName) {
      url.searchParams.set('operation', params.operationName);
    }
    url.searchParams.set('start', params.timeRange.start);
    url.searchParams.set('end', params.timeRange.end);
    if (params.limit !== undefined) {
      url.searchParams.set('limit', String(params.limit));
    }

    const endpoint = url.toString();
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) });
      if (!response.ok) {
        return fail(`Jaeger returned ${response.status}`, {
          endpoint,
          statusCode: response.status,
        });
      }
      const body = (await response.json()) as JaegerResponse;
      const spans = parseTraceSpans(body);
      return ok({ spans });
    } catch (err) {
      return fail(errorMessage(err), { endpoint });
    }
  }

  async healthCheck(): Promise<Result<HealthStatus>> {
    const start = Date.now();
    const checks = await Promise.allSettled([
      fetch(`${this.logsUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
      fetch(`${this.metricsUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
      fetch(`${this.tracesUrl}/`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
    ]);
    const latencyMs = Date.now() - start;

    const failures: string[] = [];
    const serviceNames = ['victoria-logs', 'victoria-metrics', 'jaeger'];

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      if (check.status === 'rejected') {
        failures.push(`${serviceNames[i]}: ${errorMessage(check.reason)}`);
      } else if (!check.value.ok) {
        failures.push(`${serviceNames[i]}: HTTP ${check.value.status}`);
      }
    }

    const healthy = failures.length === 0;
    const message = healthy
      ? 'All services healthy'
      : `Unhealthy: ${failures.join('; ')}`;

    return ok({ healthy, message, latencyMs });
  }
}

// --- Internal helpers & response types ---

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Parse newline-delimited JSON log entries from Victoria Logs */
function parseLogEntries(text: string): LogEntry[] {
  if (!text.trim()) return [];
  const lines = text.trim().split('\n');
  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      entries.push({
        timestamp: String(raw._time ?? raw.timestamp ?? ''),
        message: String(raw._msg ?? raw.message ?? ''),
        level: String(raw.level ?? raw._level ?? 'unknown'),
        labels: extractLabels(raw),
      });
    } catch {
      // IGNORE: skip malformed log lines
    }
  }
  return entries;
}

function extractLabels(raw: Record<string, unknown>): Record<string, string> {
  const labels: Record<string, string> = {};
  const skip = new Set(['_time', '_msg', 'timestamp', 'message', 'level', '_level']);
  for (const [k, v] of Object.entries(raw)) {
    if (!skip.has(k) && v != null && typeof v !== 'object') {
      labels[k] = String(v);
    }
  }
  return labels;
}

/** Prometheus-compatible response shape */
interface PrometheusResponse {
  data?: {
    resultType?: string;
    result?: Array<{
      metric?: Record<string, string>;
      values?: Array<[number, string]>;
    }>;
  };
}

function parseMetricSeries(body: PrometheusResponse): MetricSeries[] {
  const results = body.data?.result ?? [];
  return results.map((r) => ({
    labels: r.metric ?? {},
    dataPoints: (r.values ?? []).map(([ts, val]): MetricDataPoint => ({
      timestamp: String(ts),
      value: Number(val),
    })),
  }));
}

/** Jaeger API response shape */
interface JaegerResponse {
  data?: Array<{
    traceID?: string;
    spans?: Array<{
      traceID?: string;
      spanID?: string;
      references?: Array<{ refType?: string; spanID?: string }>;
      operationName?: string;
      process?: { serviceName?: string };
      startTime?: number;
      duration?: number;
      tags?: Array<{ key?: string; value?: unknown }>;
    }>;
  }>;
}

function parseTraceSpans(body: JaegerResponse): TraceSpan[] {
  const spans: TraceSpan[] = [];
  for (const trace of body.data ?? []) {
    for (const s of trace.spans ?? []) {
      const parentRef = s.references?.find((r) => r.refType === 'CHILD_OF');
      const tags: Record<string, string> = {};
      for (const t of s.tags ?? []) {
        if (t.key) tags[t.key] = String(t.value ?? '');
      }
      spans.push({
        traceId: s.traceID ?? trace.traceID ?? '',
        spanId: s.spanID ?? '',
        parentSpanId: parentRef?.spanID ?? null,
        operationName: s.operationName ?? '',
        serviceName: s.process?.serviceName ?? '',
        startTime: String(s.startTime ?? 0),
        duration: s.duration ?? 0,
        tags,
      });
    }
  }
  return spans;
}
