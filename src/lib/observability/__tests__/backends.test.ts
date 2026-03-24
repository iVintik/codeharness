import { describe, it, expect } from 'vitest';
import { VictoriaBackend, ElkBackend } from '../backends.js';
import type { ObservabilityBackend } from '../backends.js';

describe('VictoriaBackend', () => {
  const backend: ObservabilityBackend = new VictoriaBackend();

  it('has name "victoria"', () => {
    expect(backend.name).toBe('victoria');
  });

  describe('buildLogsQuery', () => {
    it('uses default time range when none specified', () => {
      const query = backend.buildLogsQuery('my-service');
      expect(query).toBe('{service_name="my-service"} | last 1h');
    });

    it('uses custom time range', () => {
      const query = backend.buildLogsQuery('my-service', '24h');
      expect(query).toBe('{service_name="my-service"} | last 24h');
    });
  });

  describe('buildMetricsQuery', () => {
    it('uses default metric name when none specified', () => {
      const query = backend.buildMetricsQuery('my-service');
      expect(query).toBe('http_request_duration_seconds{service_name="my-service"}');
    });

    it('uses custom metric name', () => {
      const query = backend.buildMetricsQuery('my-service', 'custom_metric');
      expect(query).toBe('custom_metric{service_name="my-service"}');
    });
  });

  describe('buildTracesQuery', () => {
    it('builds trace lookup by ID', () => {
      const query = backend.buildTracesQuery('my-service', 'abc123');
      expect(query).toBe('/api/traces/abc123');
    });

    it('builds service trace listing when no traceId', () => {
      const query = backend.buildTracesQuery('my-service');
      expect(query).toBe('/api/traces?service=my-service&limit=20');
    });
  });
});

describe('ElkBackend', () => {
  const backend: ObservabilityBackend = new ElkBackend();

  it('has name "elk"', () => {
    expect(backend.name).toBe('elk');
  });

  describe('buildLogsQuery', () => {
    it('uses default time range when none specified', () => {
      const query = backend.buildLogsQuery('my-service');
      expect(query).toBe('service.name: "my-service" AND @timestamp:[now-1h TO now]');
    });

    it('uses custom time range', () => {
      const query = backend.buildLogsQuery('my-service', '7d');
      expect(query).toBe('service.name: "my-service" AND @timestamp:[now-7d TO now]');
    });
  });

  describe('buildMetricsQuery', () => {
    it('uses default metric name when none specified', () => {
      const query = backend.buildMetricsQuery('my-service');
      expect(query).toBe('metricset.name: "http_request_duration_seconds" AND service.name: "my-service"');
    });

    it('uses custom metric name', () => {
      const query = backend.buildMetricsQuery('my-service', 'cpu_usage');
      expect(query).toBe('metricset.name: "cpu_usage" AND service.name: "my-service"');
    });
  });

  describe('buildTracesQuery', () => {
    it('builds trace lookup by ID', () => {
      const query = backend.buildTracesQuery('my-service', 'trace-xyz');
      expect(query).toBe('trace.id: "trace-xyz"');
    });

    it('builds service trace listing when no traceId', () => {
      const query = backend.buildTracesQuery('my-service');
      expect(query).toBe('service.name: "my-service" AND processor.event: "transaction"');
    });
  });
});

describe('ObservabilityBackend interface', () => {
  it('VictoriaBackend implements the interface', () => {
    const backend: ObservabilityBackend = new VictoriaBackend();
    expect(typeof backend.buildLogsQuery).toBe('function');
    expect(typeof backend.buildMetricsQuery).toBe('function');
    expect(typeof backend.buildTracesQuery).toBe('function');
    expect(typeof backend.name).toBe('string');
  });

  it('ElkBackend implements the interface', () => {
    const backend: ObservabilityBackend = new ElkBackend();
    expect(typeof backend.buildLogsQuery).toBe('function');
    expect(typeof backend.buildMetricsQuery).toBe('function');
    expect(typeof backend.buildTracesQuery).toBe('function');
    expect(typeof backend.name).toBe('string');
  });
});
