import { describe, it, expect } from 'vitest';
import { ok, fail } from '../result.js';
import type {
  ObservabilityBackend,
  LogQuery,
  MetricQuery,
  TraceQuery,
  LogResult,
  MetricResult,
  TraceResult,
  HealthStatus,
  TimeRange,
} from '../observability.js';

describe('ObservabilityBackend interface', () => {
  it('can be implemented with a mock (compilation check)', async () => {
    const mockBackend: ObservabilityBackend = {
      type: 'victoria',

      async queryLogs(params: LogQuery) {
        return ok<LogResult>({
          entries: [
            {
              timestamp: '2026-03-17T10:00:00Z',
              message: `log for ${params.query}`,
              level: 'info',
              labels: { service: 'test' },
            },
          ],
          total: 1,
        });
      },

      async queryMetrics(params: MetricQuery) {
        return ok<MetricResult>({
          series: [
            {
              labels: { __name__: params.query },
              dataPoints: [
                { timestamp: '2026-03-17T10:00:00Z', value: 42 },
              ],
            },
          ],
        });
      },

      async queryTraces(params: TraceQuery) {
        return ok<TraceResult>({
          spans: [
            {
              traceId: params.traceId ?? 'trace-1',
              spanId: 'span-1',
              parentSpanId: null,
              operationName: params.operationName ?? 'test-op',
              serviceName: params.serviceName ?? 'test-svc',
              startTime: params.timeRange.start,
              duration: 150,
              tags: {},
            },
          ],
        });
      },

      async healthCheck() {
        return ok<HealthStatus>({
          healthy: true,
          message: 'all good',
          latencyMs: 5,
        });
      },
    };

    // Verify the mock works at runtime
    const logResult = await mockBackend.queryLogs({
      query: 'error',
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
    });
    expect(logResult.success).toBe(true);
    if (logResult.success) {
      expect(logResult.data.entries).toHaveLength(1);
      expect(logResult.data.total).toBe(1);
    }

    const metricResult = await mockBackend.queryMetrics({
      query: 'cpu_usage',
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
      step: '1m',
    });
    expect(metricResult.success).toBe(true);

    const traceResult = await mockBackend.queryTraces({
      traceId: 'abc-123',
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
    });
    expect(traceResult.success).toBe(true);

    const health = await mockBackend.healthCheck();
    expect(health.success).toBe(true);
    if (health.success) {
      expect(health.data.healthy).toBe(true);
    }

    expect(mockBackend.type).toBe('victoria');
  });

  it('can return failure results', async () => {
    const failingBackend: ObservabilityBackend = {
      type: 'opensearch',
      async queryLogs() {
        return fail('connection refused', { host: 'localhost:9200' });
      },
      async queryMetrics() {
        return fail('timeout');
      },
      async queryTraces() {
        return fail('not found');
      },
      async healthCheck() {
        return fail('unhealthy');
      },
    };

    const result = await failingBackend.queryLogs({
      query: '*',
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('connection refused');
      expect(result.context).toEqual({ host: 'localhost:9200' });
    }
  });

  it('query types accept optional fields', () => {
    const logQuery: LogQuery = {
      query: 'error',
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
      limit: 100,
      offset: 0,
      filters: { level: 'error' },
    };
    expect(logQuery.limit).toBe(100);

    const metricQuery: MetricQuery = {
      query: 'cpu',
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
    };
    expect(metricQuery.step).toBeUndefined();

    const traceQuery: TraceQuery = {
      timeRange: { start: '2026-03-17T09:00:00Z', end: '2026-03-17T10:00:00Z' },
      serviceName: 'my-svc',
    };
    expect(traceQuery.traceId).toBeUndefined();

    const timeRange: TimeRange = {
      start: '2026-03-17T09:00:00Z',
      end: '2026-03-17T10:00:00Z',
    };
    expect(timeRange.start).toBeDefined();
  });
});
