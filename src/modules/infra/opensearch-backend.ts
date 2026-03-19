/**
 * OpenSearchBackend — ObservabilityBackend implementation for OpenSearch.
 * Queries logs, metrics, and traces via the OpenSearch/Elasticsearch _search API.
 * Uses Node.js built-in fetch (no external HTTP dependencies).
 */
import type {
  ObservabilityBackend, LogQuery, LogResult, LogEntry,
  MetricQuery, MetricResult, MetricSeries, MetricDataPoint,
  TraceQuery, TraceResult, TraceSpan, HealthStatus,
} from '../../types/observability.js';
import type { Result } from '../../types/result.js';
import { ok, fail } from '../../types/result.js';

/** Configuration for OpenSearchBackend */
export interface OpenSearchConfig {
  url: string;
  logsIndex?: string;
  metricsIndex?: string;
  tracesIndex?: string;
}

const QUERY_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;

export class OpenSearchBackend implements ObservabilityBackend {
  readonly type = 'opensearch' as const;
  private readonly url: string;
  private readonly logsIndex: string;
  private readonly metricsIndex: string;
  private readonly tracesIndex: string;

  constructor(config: OpenSearchConfig) {
    this.url = config.url.replace(/\/+$/, '');
    this.logsIndex = config.logsIndex ?? 'otel-logs-*';
    this.metricsIndex = config.metricsIndex ?? 'otel-metrics-*';
    this.tracesIndex = config.tracesIndex ?? 'otel-traces-*';
  }

  async queryLogs(params: LogQuery): Promise<Result<LogResult>> {
    const endpoint = `${this.url}/${this.logsIndex}/_search`;
    const body = {
      query: { bool: { must: [
        { query_string: { query: params.query } },
        rangeFilter(params.timeRange.start, params.timeRange.end),
      ] } },
      size: params.limit ?? 100,
    };
    return this.post(endpoint, body, (data: OpenSearchResponse) => {
      const entries = parseLogHits(data);
      return ok({ entries, total: entries.length });
    });
  }

  async queryMetrics(params: MetricQuery): Promise<Result<MetricResult>> {
    const endpoint = `${this.url}/${this.metricsIndex}/_search`;
    const body = {
      query: { bool: { must: [
        { query_string: { query: params.query } },
        rangeFilter(params.timeRange.start, params.timeRange.end),
      ] } },
      size: 0,
      aggs: {
        over_time: {
          date_histogram: { field: '@timestamp', fixed_interval: params.step ?? '60s' },
          aggs: { avg_value: { avg: { field: 'value' } } },
        },
      },
    };
    return this.post(endpoint, body, (data: OpenSearchAggResponse) => {
      const buckets = data.aggregations?.over_time?.buckets ?? [];
      if (buckets.length === 0) return ok({ series: [] });
      const dataPoints: MetricDataPoint[] = buckets.map((b) => ({
        timestamp: b.key_as_string ?? String(b.key ?? ''),
        value: b.avg_value?.value ?? 0,
      }));
      return ok({ series: [{ labels: {}, dataPoints }] as MetricSeries[] });
    });
  }

  async queryTraces(params: TraceQuery): Promise<Result<TraceResult>> {
    const endpoint = `${this.url}/${this.tracesIndex}/_search`;
    const must: Record<string, unknown>[] = [];
    if (params.serviceName) must.push({ term: { 'resource.service.name': params.serviceName } });
    if (params.operationName) must.push({ term: { name: params.operationName } });
    must.push(rangeFilter(params.timeRange.start, params.timeRange.end));
    const body = { query: { bool: { must } }, size: params.limit ?? 100 };
    return this.post(endpoint, body, (data: OpenSearchResponse) => {
      const spans = parseTraceHits(data);
      return ok({ spans });
    });
  }

  async healthCheck(): Promise<Result<HealthStatus>> {
    const endpoint = `${this.url}/_cluster/health`;
    const start = Date.now();
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      const latencyMs = Date.now() - start;
      if (!response.ok) return ok({ healthy: false, message: `OpenSearch returned HTTP ${response.status}`, latencyMs });
      const body = (await response.json()) as { status?: string };
      const status = body.status ?? 'unknown';
      const healthy = status === 'green' || status === 'yellow';
      return ok({ healthy, message: `Cluster status: ${status}`, latencyMs });
    } catch (err) {
      return ok({ healthy: false, message: errMsg(err), latencyMs: Date.now() - start });
    }
  }

  /** Shared POST helper — sends JSON body, parses response with provided parser */
  private async post<T, R>(endpoint: string, body: unknown, parse: (data: T) => Result<R>): Promise<Result<R>> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
      if (!response.ok) return fail(`OpenSearch returned ${response.status}`, { endpoint, statusCode: response.status });
      return parse((await response.json()) as T);
    } catch (err) {
      return fail(errMsg(err), { endpoint });
    }
  }
}

// --- Helpers & response types ---

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function rangeFilter(gte: string, lte: string): Record<string, unknown> {
  return { range: { '@timestamp': { gte, lte } } };
}

interface OpenSearchHit { _source?: Record<string, unknown> }
interface OpenSearchResponse { hits?: { hits?: OpenSearchHit[] } }
interface OpenSearchAggBucket { key_as_string?: string; key?: number; avg_value?: { value?: number | null } }
interface OpenSearchAggResponse { aggregations?: { over_time?: { buckets?: OpenSearchAggBucket[] } } }

const LOG_SKIP_FIELDS = new Set(['@timestamp', 'timestamp', 'body', 'message', 'severity', 'level', 'severityText']);

function parseLogHits(data: OpenSearchResponse): LogEntry[] {
  return (data.hits?.hits ?? []).map((hit) => {
    const src = hit._source ?? {};
    const labels: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!LOG_SKIP_FIELDS.has(k) && v != null && typeof v !== 'object') labels[k] = String(v);
    }
    return {
      timestamp: String(src['@timestamp'] ?? src['timestamp'] ?? ''),
      message: String(src['body'] ?? src['message'] ?? ''),
      level: String(src['severityText'] ?? src['severity'] ?? src['level'] ?? 'unknown'),
      labels,
    };
  });
}

function parseTraceHits(data: OpenSearchResponse): TraceSpan[] {
  return (data.hits?.hits ?? []).map((hit) => {
    const src = hit._source ?? {};
    const tags: Record<string, string> = {};
    const attrs = src['attributes'] as Record<string, unknown> | undefined;
    if (attrs && typeof attrs === 'object') {
      for (const [k, v] of Object.entries(attrs)) { if (v != null) tags[k] = String(v); }
    }
    const resource = src['resource'] as Record<string, unknown> | undefined;
    const serviceName = resource
      ? String((resource['service.name'] ?? (resource['service'] as Record<string, unknown> | undefined)?.['name']) ?? '')
      : '';
    return {
      traceId: String(src['traceId'] ?? src['trace_id'] ?? ''),
      spanId: String(src['spanId'] ?? src['span_id'] ?? ''),
      parentSpanId: (src['parentSpanId'] ?? src['parent_span_id'] ?? null) as string | null,
      operationName: String(src['name'] ?? ''),
      serviceName,
      startTime: String(src['startTime'] ?? src['@timestamp'] ?? ''),
      duration: Number(src['duration'] ?? 0),
      tags,
    };
  });
}
