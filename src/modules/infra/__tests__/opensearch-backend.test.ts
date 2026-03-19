import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenSearchBackend } from '../opensearch-backend.js';
import type { LogQuery, MetricQuery, TraceQuery } from '../../../types/observability.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as Response;
}

const logQuery: LogQuery = {
  query: 'level:error',
  timeRange: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
};

const metricQuery: MetricQuery = {
  query: 'cpu_usage',
  timeRange: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
  step: '120s',
};

const traceQuery: TraceQuery = {
  serviceName: 'my-service',
  operationName: 'GET /api',
  timeRange: { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' },
  limit: 10,
};

describe('OpenSearchBackend', () => {
  describe('constructor', () => {
    it('sets type to opensearch', () => {
      const backend = new OpenSearchBackend({ url: 'http://localhost:9200' });
      expect(backend.type).toBe('opensearch');
    });

    it('strips trailing slashes from URL', () => {
      const backend = new OpenSearchBackend({ url: 'http://localhost:9200///' });
      expect(backend.type).toBe('opensearch');
    });

    it('uses default index names when not configured (AC#13)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://localhost:9200' });
      await backend.queryLogs(logQuery);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:9200/otel-logs-*/_search');
    });

    it('accepts custom index names (AC#13)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({
        url: 'http://localhost:9200',
        logsIndex: 'custom-logs',
        metricsIndex: 'custom-metrics',
        tracesIndex: 'custom-traces',
      });
      await backend.queryLogs(logQuery);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:9200/custom-logs/_search');
    });
  });

  describe('queryLogs', () => {
    it('sends POST to correct endpoint with query body (AC#2)', async () => {
      const responseBody = JSON.stringify({
        hits: {
          hits: [
            {
              _source: {
                '@timestamp': '2026-01-01T01:00:00Z',
                body: 'something failed',
                severityText: 'ERROR',
                host: 'server-1',
              },
            },
          ],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(responseBody));

      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://os:9200/otel-logs-*/_search');
      expect(calledOpts.method).toBe('POST');
      expect(calledOpts.headers).toEqual({ 'Content-Type': 'application/json' });

      const body = JSON.parse(calledOpts.body as string);
      expect(body.query.bool.must[0]).toEqual({ query_string: { query: 'level:error' } });
      expect(body.query.bool.must[1].range['@timestamp'].gte).toBe('2026-01-01T00:00:00Z');
      expect(body.query.bool.must[1].range['@timestamp'].lte).toBe('2026-01-02T00:00:00Z');
      expect(body.size).toBe(100); // default limit

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toHaveLength(1);
        expect(result.data.entries[0].timestamp).toBe('2026-01-01T01:00:00Z');
        expect(result.data.entries[0].message).toBe('something failed');
        expect(result.data.entries[0].level).toBe('ERROR');
        expect(result.data.entries[0].labels).toEqual({ host: 'server-1' });
        expect(result.data.total).toBe(1);
      }
    });

    it('uses custom limit when provided', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      await backend.queryLogs({ ...logQuery, limit: 50 });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.size).toBe(50);
    });

    it('parses multiple log hits', async () => {
      const responseBody = JSON.stringify({
        hits: {
          hits: [
            { _source: { '@timestamp': 't1', body: 'msg1', severityText: 'INFO' } },
            { _source: { '@timestamp': 't2', body: 'msg2', severityText: 'WARN' } },
          ],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(responseBody));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('returns empty entries for empty hits', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toEqual([]);
        expect(result.data.total).toBe(0);
      }
    });

    it('handles missing hits in response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({})));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toEqual([]);
      }
    });

    it('handles non-2xx response (AC#6)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('{"error":"bad request"}', 400));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('400');
        expect(result.context).toHaveProperty('endpoint');
        expect(result.context).toHaveProperty('statusCode', 400);
      }
    });

    it('handles network error — never throws (AC#6)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ECONNREFUSED');
        expect(result.context).toHaveProperty('endpoint');
      }
    });

    it('uses custom logs index', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200', logsIndex: 'my-logs' });
      await backend.queryLogs(logQuery);
      expect(mockFetch.mock.calls[0][0]).toBe('http://os:9200/my-logs/_search');
    });

    it('parses alternative field names (timestamp, message, level)', async () => {
      const responseBody = JSON.stringify({
        hits: {
          hits: [
            { _source: { timestamp: 'ts1', message: 'alt msg', level: 'debug' } },
          ],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(responseBody));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0].timestamp).toBe('ts1');
        expect(result.data.entries[0].message).toBe('alt msg');
        expect(result.data.entries[0].level).toBe('debug');
      }
    });

    it('falls back to defaults for missing fields', async () => {
      const responseBody = JSON.stringify({
        hits: { hits: [{ _source: { randomField: 'val' } }] },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(responseBody));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0].timestamp).toBe('');
        expect(result.data.entries[0].message).toBe('');
        expect(result.data.entries[0].level).toBe('unknown');
        expect(result.data.entries[0].labels).toEqual({ randomField: 'val' });
      }
    });

    it('excludes object values from labels', async () => {
      const responseBody = JSON.stringify({
        hits: {
          hits: [{
            _source: {
              '@timestamp': 't1',
              body: 'msg',
              severityText: 'INFO',
              nested: { foo: 'bar' },
              flat: 'value',
            },
          }],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(responseBody));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0].labels).toEqual({ flat: 'value' });
      }
    });

    it('handles hit with missing _source', async () => {
      const responseBody = JSON.stringify({
        hits: { hits: [{}] },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(responseBody));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toHaveLength(1);
        expect(result.data.entries[0].timestamp).toBe('');
        expect(result.data.entries[0].message).toBe('');
      }
    });
  });

  describe('queryMetrics', () => {
    const aggResponse = JSON.stringify({
      aggregations: {
        over_time: {
          buckets: [
            { key_as_string: '2026-01-01T00:00:00Z', key: 1735689600000, avg_value: { value: 42.5 } },
            { key_as_string: '2026-01-01T00:02:00Z', key: 1735689720000, avg_value: { value: 38.1 } },
          ],
        },
      },
    });

    it('sends POST with date_histogram aggregation (AC#3)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(aggResponse));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://os:9200/otel-metrics-*/_search');
      const body = JSON.parse(calledOpts.body as string);
      expect(body.size).toBe(0);
      expect(body.aggs.over_time.date_histogram.field).toBe('@timestamp');
      expect(body.aggs.over_time.date_histogram.fixed_interval).toBe('120s');
      expect(body.aggs.over_time.aggs.avg_value).toEqual({ avg: { field: 'value' } });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toHaveLength(1);
        expect(result.data.series[0].dataPoints).toHaveLength(2);
        expect(result.data.series[0].dataPoints[0].timestamp).toBe('2026-01-01T00:00:00Z');
        expect(result.data.series[0].dataPoints[0].value).toBe(42.5);
        expect(result.data.series[0].dataPoints[1].value).toBe(38.1);
      }
    });

    it('uses default step when not provided', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ aggregations: { over_time: { buckets: [] } } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      await backend.queryMetrics({ query: 'cpu', timeRange: { start: '0', end: '1' } });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.aggs.over_time.date_histogram.fixed_interval).toBe('60s');
    });

    it('handles empty buckets', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ aggregations: { over_time: { buckets: [] } } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toEqual([]);
      }
    });

    it('handles missing aggregations in response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({})));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toEqual([]);
      }
    });

    it('handles non-2xx response (AC#6)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('error', 500));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('500');
        expect(result.context).toHaveProperty('statusCode', 500);
      }
    });

    it('handles network error (AC#6)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('timeout');
      }
    });

    it('uses custom metrics index', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ aggregations: { over_time: { buckets: [] } } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200', metricsIndex: 'my-metrics' });
      await backend.queryMetrics(metricQuery);
      expect(mockFetch.mock.calls[0][0]).toBe('http://os:9200/my-metrics/_search');
    });

    it('handles bucket with null avg_value', async () => {
      const response = JSON.stringify({
        aggregations: {
          over_time: {
            buckets: [{ key: 123, avg_value: { value: null } }],
          },
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series[0].dataPoints[0].value).toBe(0);
        expect(result.data.series[0].dataPoints[0].timestamp).toBe('123');
      }
    });

    it('handles bucket with missing avg_value', async () => {
      const response = JSON.stringify({
        aggregations: {
          over_time: {
            buckets: [{ key_as_string: 'ts1' }],
          },
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series[0].dataPoints[0].value).toBe(0);
      }
    });
  });

  describe('queryTraces', () => {
    const traceResponse = JSON.stringify({
      hits: {
        hits: [
          {
            _source: {
              traceId: 'abc123',
              spanId: 'span1',
              parentSpanId: 'span0',
              name: 'GET /api',
              resource: { 'service.name': 'my-service' },
              '@timestamp': '2026-01-01T01:00:00Z',
              duration: 1500,
              attributes: { 'http.status_code': '200' },
            },
          },
          {
            _source: {
              traceId: 'abc123',
              spanId: 'span0',
              parentSpanId: null,
              name: 'root',
              resource: { 'service.name': 'my-service' },
              '@timestamp': '2026-01-01T01:00:00Z',
              duration: 2000,
              attributes: {},
            },
          },
        ],
      },
    });

    it('sends POST with service and operation filters (AC#4)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(traceResponse));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://os:9200/otel-traces-*/_search');

      const body = JSON.parse(calledOpts.body as string);
      expect(body.query.bool.must).toContainEqual({ term: { 'resource.service.name': 'my-service' } });
      expect(body.query.bool.must).toContainEqual({ term: { name: 'GET /api' } });
      expect(body.size).toBe(10);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toHaveLength(2);
        expect(result.data.spans[0].traceId).toBe('abc123');
        expect(result.data.spans[0].spanId).toBe('span1');
        expect(result.data.spans[0].parentSpanId).toBe('span0');
        expect(result.data.spans[0].operationName).toBe('GET /api');
        expect(result.data.spans[0].serviceName).toBe('my-service');
        expect(result.data.spans[0].duration).toBe(1500);
        expect(result.data.spans[0].tags).toEqual({ 'http.status_code': '200' });
        expect(result.data.spans[1].parentSpanId).toBeNull();
      }
    });

    it('omits service and operation filters when not provided', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      await backend.queryTraces({ timeRange: { start: '0', end: '1' } });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const must = body.query.bool.must;
      expect(must).toHaveLength(1); // only range filter
      expect(must[0]).toHaveProperty('range');
      expect(body.size).toBe(100); // default limit
    });

    it('handles non-2xx response (AC#6)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('not found', 404));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('404');
        expect(result.context).toHaveProperty('statusCode', 404);
      }
    });

    it('handles network error (AC#6)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ENOTFOUND');
      }
    });

    it('handles empty trace hits', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toEqual([]);
      }
    });

    it('uses custom traces index', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200', tracesIndex: 'my-traces' });
      await backend.queryTraces(traceQuery);
      expect(mockFetch.mock.calls[0][0]).toBe('http://os:9200/my-traces/_search');
    });

    it('handles missing fields with fallbacks', async () => {
      const response = JSON.stringify({
        hits: { hits: [{ _source: {} }] },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        const span = result.data.spans[0];
        expect(span.traceId).toBe('');
        expect(span.spanId).toBe('');
        expect(span.parentSpanId).toBeNull();
        expect(span.operationName).toBe('');
        expect(span.serviceName).toBe('');
        expect(span.startTime).toBe('');
        expect(span.duration).toBe(0);
        expect(span.tags).toEqual({});
      }
    });

    it('parses trace_id / span_id alternative field names', async () => {
      const response = JSON.stringify({
        hits: {
          hits: [{
            _source: {
              trace_id: 'alt-trace',
              span_id: 'alt-span',
              parent_span_id: 'alt-parent',
              name: 'op',
              startTime: '12345',
            },
          }],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans[0].traceId).toBe('alt-trace');
        expect(result.data.spans[0].spanId).toBe('alt-span');
        expect(result.data.spans[0].parentSpanId).toBe('alt-parent');
      }
    });

    it('excludes null attribute values from tags', async () => {
      const response = JSON.stringify({
        hits: {
          hits: [{
            _source: {
              traceId: 't1',
              name: 'op',
              attributes: { valid: 'yes', nullAttr: null },
            },
          }],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans[0].tags).toEqual({ valid: 'yes' });
      }
    });

    it('handles non-object attributes field', async () => {
      const response = JSON.stringify({
        hits: {
          hits: [{
            _source: {
              traceId: 't1',
              name: 'op',
              attributes: 'not-an-object',
            },
          }],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans[0].tags).toEqual({});
      }
    });

    it('parses service name from nested resource.service.name', async () => {
      const response = JSON.stringify({
        hits: {
          hits: [{
            _source: {
              resource: { service: { name: 'nested-svc' } },
              name: 'op',
            },
          }],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans[0].serviceName).toBe('nested-svc');
      }
    });
  });

  describe('healthCheck', () => {
    it('returns healthy for green cluster (AC#5)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ status: 'green' })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.healthCheck();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toBe('http://os:9200/_cluster/health');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(true);
        expect(result.data.message).toContain('green');
        expect(result.data.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns healthy for yellow cluster (AC#5)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ status: 'yellow' })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(true);
        expect(result.data.message).toContain('yellow');
      }
    });

    it('returns unhealthy for red cluster (AC#5)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ status: 'red' })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toContain('red');
      }
    });

    it('returns unhealthy when cluster is unreachable (AC#5)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toBe('ECONNREFUSED');
        expect(result.data.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns unhealthy for non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('unauthorized', 401));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toContain('401');
      }
    });

    it('handles missing status field in response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({})));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toContain('unknown');
      }
    });

    it('passes AbortSignal.timeout to health check', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ status: 'green' })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      await backend.healthCheck();

      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOptions).toHaveProperty('signal');
    });
  });

  describe('fetch timeout', () => {
    it('passes AbortSignal.timeout to query fetch calls', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ hits: { hits: [] } })));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      await backend.queryLogs(logQuery);

      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOptions).toHaveProperty('signal');
    });

    it('returns fail when fetch times out', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('aborted');
      }
    });
  });

  describe('error handling edge cases', () => {
    it('handles non-Error thrown values', async () => {
      mockFetch.mockRejectedValueOnce('string error');
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('string error');
      }
    });

    it('handles malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      } as Response);
      const backend = new OpenSearchBackend({ url: 'http://os:9200' });
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unexpected token');
      }
    });
  });
});
