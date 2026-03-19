import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VictoriaBackend } from '../victoria-backend.js';
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
  query: 'up{job="test"}',
  timeRange: { start: '1704067200', end: '1704153600' },
  step: '60s',
};

const traceQuery: TraceQuery = {
  serviceName: 'my-service',
  operationName: 'GET /api',
  timeRange: { start: '1704067200000000', end: '1704153600000000' },
  limit: 10,
};

describe('VictoriaBackend', () => {
  describe('constructor', () => {
    it('uses default URLs when no config provided', () => {
      const backend = new VictoriaBackend();
      expect(backend.type).toBe('victoria');
    });

    it('accepts custom URLs via config (AC#11)', () => {
      const backend = new VictoriaBackend({
        logsUrl: 'http://custom:1111',
        metricsUrl: 'http://custom:2222',
        tracesUrl: 'http://custom:3333',
      });
      expect(backend.type).toBe('victoria');
    });
  });

  describe('queryLogs', () => {
    it('sends correct request to Victoria Logs endpoint (AC#2)', async () => {
      const logLine = JSON.stringify({
        _time: '2026-01-01T01:00:00Z',
        _msg: 'something failed',
        level: 'error',
        host: 'server-1',
      });
      mockFetch.mockResolvedValueOnce(makeResponse(logLine));

      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://localhost:9428/select/logsql/query');
      expect(calledUrl).toContain('query=level%3Aerror');
      expect(calledUrl).toContain('start=2026-01-01T00%3A00%3A00Z');
      expect(calledUrl).toContain('end=2026-01-02T00%3A00%3A00Z');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toHaveLength(1);
        expect(result.data.entries[0].message).toBe('something failed');
        expect(result.data.entries[0].level).toBe('error');
        expect(result.data.entries[0].labels).toEqual({ host: 'server-1' });
        expect(result.data.total).toBe(1);
      }
    });

    it('includes limit parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(''));
      const backend = new VictoriaBackend();
      await backend.queryLogs({ ...logQuery, limit: 50 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=50');
    });

    it('parses multiple newline-delimited log entries', async () => {
      const lines = [
        JSON.stringify({ _time: 't1', _msg: 'msg1', level: 'info' }),
        JSON.stringify({ _time: 't2', _msg: 'msg2', level: 'warn' }),
      ].join('\n');
      mockFetch.mockResolvedValueOnce(makeResponse(lines));

      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toHaveLength(2);
        expect(result.data.total).toBe(2);
      }
    });

    it('returns empty entries for empty response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(''));
      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toEqual([]);
        expect(result.data.total).toBe(0);
      }
    });

    it('handles non-2xx response (AC#6)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('bad request', 400));
      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('400');
        expect(result.context).toHaveProperty('endpoint');
        expect(result.context).toHaveProperty('statusCode', 400);
      }
    });

    it('handles network error (AC#6)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ECONNREFUSED');
        expect(result.context).toHaveProperty('endpoint');
      }
    });

    it('uses custom logsUrl when configured', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(''));
      const backend = new VictoriaBackend({ logsUrl: 'http://custom:1111' });
      await backend.queryLogs(logQuery);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://custom:1111/select/logsql/query');
    });

    it('skips malformed JSON lines gracefully', async () => {
      const lines = [
        JSON.stringify({ _time: 't1', _msg: 'valid', level: 'info' }),
        'not-json{{{',
        JSON.stringify({ _time: 't2', _msg: 'also valid', level: 'warn' }),
      ].join('\n');
      mockFetch.mockResolvedValueOnce(makeResponse(lines));

      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries).toHaveLength(2);
      }
    });
  });

  describe('queryMetrics', () => {
    const promResponse = JSON.stringify({
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up', job: 'test' },
            values: [[1704067200, '1'], [1704067260, '0']],
          },
        ],
      },
    });

    it('sends correct request to Victoria Metrics endpoint (AC#3)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(promResponse));
      const backend = new VictoriaBackend();
      const result = await backend.queryMetrics(metricQuery);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://localhost:8428/api/v1/query_range');
      expect(calledUrl).toContain('query=up');
      expect(calledUrl).toContain('step=60s');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toHaveLength(1);
        expect(result.data.series[0].labels).toEqual({ __name__: 'up', job: 'test' });
        expect(result.data.series[0].dataPoints).toHaveLength(2);
        expect(result.data.series[0].dataPoints[0].value).toBe(1);
        expect(result.data.series[0].dataPoints[1].value).toBe(0);
      }
    });

    it('omits step when not provided', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ data: { result: [] } })));
      const backend = new VictoriaBackend();
      await backend.queryMetrics({ query: 'up', timeRange: { start: '0', end: '1' } });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('step=');
    });

    it('handles non-2xx response (AC#6)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('error', 500));
      const backend = new VictoriaBackend();
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('500');
        expect(result.context).toHaveProperty('statusCode', 500);
      }
    });

    it('handles network error (AC#6)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));
      const backend = new VictoriaBackend();
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('timeout');
      }
    });

    it('handles empty result set', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ data: { result: [] } })));
      const backend = new VictoriaBackend();
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toEqual([]);
      }
    });

    it('handles missing data field in response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({})));
      const backend = new VictoriaBackend();
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toEqual([]);
      }
    });

    it('uses custom metricsUrl', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ data: { result: [] } })));
      const backend = new VictoriaBackend({ metricsUrl: 'http://custom:2222' });
      await backend.queryMetrics(metricQuery);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://custom:2222/api/v1/query_range');
    });
  });

  describe('queryTraces', () => {
    const jaegerResponse = JSON.stringify({
      data: [
        {
          traceID: 'abc123',
          spans: [
            {
              traceID: 'abc123',
              spanID: 'span1',
              references: [{ refType: 'CHILD_OF', spanID: 'span0' }],
              operationName: 'GET /api',
              process: { serviceName: 'my-service' },
              startTime: 1704067200000000,
              duration: 1500,
              tags: [{ key: 'http.status_code', value: 200 }],
            },
            {
              traceID: 'abc123',
              spanID: 'span0',
              references: [],
              operationName: 'root',
              process: { serviceName: 'my-service' },
              startTime: 1704067200000000,
              duration: 2000,
              tags: [],
            },
          ],
        },
      ],
    });

    it('sends correct request to Jaeger endpoint (AC#4)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(jaegerResponse));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://localhost:16686/api/traces');
      expect(calledUrl).toContain('service=my-service');
      expect(calledUrl).toContain('operation=GET+%2Fapi');
      expect(calledUrl).toContain('limit=10');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toHaveLength(2);
        expect(result.data.spans[0].traceId).toBe('abc123');
        expect(result.data.spans[0].spanId).toBe('span1');
        expect(result.data.spans[0].parentSpanId).toBe('span0');
        expect(result.data.spans[0].operationName).toBe('GET /api');
        expect(result.data.spans[0].serviceName).toBe('my-service');
        expect(result.data.spans[0].tags).toEqual({ 'http.status_code': '200' });
        expect(result.data.spans[1].parentSpanId).toBeNull();
      }
    });

    it('omits optional params when not provided', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ data: [] })));
      const backend = new VictoriaBackend();
      await backend.queryTraces({
        timeRange: { start: '0', end: '1' },
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('service=');
      expect(calledUrl).not.toContain('operation=');
      expect(calledUrl).not.toContain('limit=');
    });

    it('handles non-2xx response (AC#6)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse('not found', 404));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('404');
        expect(result.context).toHaveProperty('statusCode', 404);
      }
    });

    it('handles network error (AC#6)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('ENOTFOUND');
      }
    });

    it('handles empty trace data', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ data: [] })));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toEqual([]);
      }
    });

    it('uses custom tracesUrl', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({ data: [] })));
      const backend = new VictoriaBackend({ tracesUrl: 'http://custom:3333' });
      await backend.queryTraces(traceQuery);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('http://custom:3333/api/traces');
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when all services respond (AC#5)', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'));

      const backend = new VictoriaBackend();
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(true);
        expect(result.data.message).toBe('All services healthy');
        expect(result.data.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns unhealthy when one service fails (AC#5)', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(makeResponse('ok'));

      const backend = new VictoriaBackend();
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toContain('victoria-metrics');
        expect(result.data.message).toContain('ECONNREFUSED');
      }
    });

    it('returns unhealthy when all services fail (AC#5)', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockRejectedValueOnce(new Error('fail3'));

      const backend = new VictoriaBackend();
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toContain('victoria-logs');
        expect(result.data.message).toContain('victoria-metrics');
        expect(result.data.message).toContain('jaeger');
      }
    });

    it('detects non-2xx as unhealthy', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('error', 503))
        .mockResolvedValueOnce(makeResponse('ok'));

      const backend = new VictoriaBackend();
      const result = await backend.healthCheck();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        expect(result.data.message).toContain('victoria-metrics');
        expect(result.data.message).toContain('503');
      }
    });

    it('checks correct endpoints', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'));

      const backend = new VictoriaBackend();
      await backend.healthCheck();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:9428/health');
      expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:8428/health');
      expect(mockFetch.mock.calls[2][0]).toBe('http://localhost:16686/');
    });

    it('uses custom URLs for health checks', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'));

      const backend = new VictoriaBackend({
        logsUrl: 'http://logs:1111',
        metricsUrl: 'http://metrics:2222',
        tracesUrl: 'http://traces:3333',
      });
      await backend.healthCheck();

      expect(mockFetch.mock.calls[0][0]).toBe('http://logs:1111/health');
      expect(mockFetch.mock.calls[1][0]).toBe('http://metrics:2222/health');
      expect(mockFetch.mock.calls[2][0]).toBe('http://traces:3333/');
    });
  });

  describe('parsing edge cases — missing optional fields', () => {
    it('handles metric result with missing metric labels and values', async () => {
      const response = JSON.stringify({
        data: {
          result: [
            { /* no metric, no values */ },
          ],
        },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new VictoriaBackend();
      const result = await backend.queryMetrics(metricQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.series).toHaveLength(1);
        expect(result.data.series[0].labels).toEqual({});
        expect(result.data.series[0].dataPoints).toEqual([]);
      }
    });

    it('handles trace spans with missing fields (fallback branches)', async () => {
      const response = JSON.stringify({
        data: [
          {
            // no traceID at trace level
            spans: [
              {
                // no traceID, no spanID, no references, no operationName, no process, no startTime, no duration, no tags
              },
            ],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toHaveLength(1);
        const span = result.data.spans[0];
        expect(span.traceId).toBe('');
        expect(span.spanId).toBe('');
        expect(span.parentSpanId).toBeNull();
        expect(span.operationName).toBe('');
        expect(span.serviceName).toBe('');
        expect(span.startTime).toBe('0');
        expect(span.duration).toBe(0);
        expect(span.tags).toEqual({});
      }
    });

    it('handles trace with missing spans array', async () => {
      const response = JSON.stringify({
        data: [{ traceID: 'abc' /* no spans */ }],
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toEqual([]);
      }
    });

    it('handles trace tags with missing key', async () => {
      const response = JSON.stringify({
        data: [
          {
            traceID: 'abc',
            spans: [
              {
                traceID: 'abc',
                spanID: 's1',
                operationName: 'op',
                process: { serviceName: 'svc' },
                startTime: 100,
                duration: 50,
                tags: [{ value: 'no-key' }, { key: 'valid', value: 'yes' }],
              },
            ],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        // tag with no key should be skipped
        expect(result.data.spans[0].tags).toEqual({ valid: 'yes' });
      }
    });

    it('handles tag value that is undefined', async () => {
      const response = JSON.stringify({
        data: [
          {
            traceID: 'abc',
            spans: [
              {
                traceID: 'abc',
                spanID: 's1',
                operationName: 'op',
                process: { serviceName: 'svc' },
                startTime: 100,
                duration: 50,
                tags: [{ key: 'k' }],
              },
            ],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans[0].tags).toEqual({ k: '' });
      }
    });

    it('handles missing data in Jaeger response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify({})));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.spans).toEqual([]);
      }
    });

    it('uses span traceID when trace-level traceID exists', async () => {
      const response = JSON.stringify({
        data: [
          {
            traceID: 'trace-level',
            spans: [
              {
                traceID: 'span-level',
                spanID: 's1',
                operationName: 'op',
                process: { serviceName: 'svc' },
                startTime: 0,
                duration: 0,
                tags: [],
              },
            ],
          },
        ],
      });
      mockFetch.mockResolvedValueOnce(makeResponse(response));
      const backend = new VictoriaBackend();
      const result = await backend.queryTraces(traceQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        // span-level traceID takes precedence
        expect(result.data.spans[0].traceId).toBe('span-level');
      }
    });
  });

  describe('fetch timeout', () => {
    it('passes AbortSignal.timeout to query fetch calls', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(''));
      const backend = new VictoriaBackend();
      await backend.queryLogs(logQuery);

      const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOptions).toHaveProperty('signal');
    });

    it('passes AbortSignal.timeout to health check fetch calls', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'))
        .mockResolvedValueOnce(makeResponse('ok'));

      const backend = new VictoriaBackend();
      await backend.healthCheck();

      for (let i = 0; i < 3; i++) {
        const fetchOptions = mockFetch.mock.calls[i][1] as RequestInit;
        expect(fetchOptions).toHaveProperty('signal');
      }
    });

    it('returns fail when fetch times out', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));
      const backend = new VictoriaBackend();
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
      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('string error');
      }
    });

    it('handles log entries with no known field names (all fallbacks)', async () => {
      const line = JSON.stringify({ someOtherField: 'value' });
      mockFetch.mockResolvedValueOnce(makeResponse(line));

      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0].timestamp).toBe('');
        expect(result.data.entries[0].message).toBe('');
        expect(result.data.entries[0].level).toBe('unknown');
      }
    });

    it('coerces numeric and boolean label values to strings', async () => {
      const line = JSON.stringify({
        _time: 't1',
        _msg: 'msg',
        level: 'info',
        port: 8080,
        enabled: true,
        nested: { foo: 'bar' },
      });
      mockFetch.mockResolvedValueOnce(makeResponse(line));

      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0].labels).toEqual({
          port: '8080',
          enabled: 'true',
          // nested object should be excluded
        });
      }
    });

    it('handles log entries with alternative field names', async () => {
      const line = JSON.stringify({
        timestamp: '2026-01-01T00:00:00Z',
        message: 'alt fields',
        _level: 'debug',
      });
      mockFetch.mockResolvedValueOnce(makeResponse(line));

      const backend = new VictoriaBackend();
      const result = await backend.queryLogs(logQuery);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entries[0].timestamp).toBe('2026-01-01T00:00:00Z');
        expect(result.data.entries[0].message).toBe('alt fields');
        expect(result.data.entries[0].level).toBe('debug');
      }
    });
  });
});
