import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { otelCollectorConfigTemplate, otelCollectorRemoteTemplate, otelCollectorConfigWithCors } from '../otel-config.js';

describe('otelCollectorConfigTemplate', () => {
  it('returns valid YAML', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result);
    expect(parsed).toBeDefined();
  });

  it('configures OTLP receiver with gRPC on port 4317', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { receivers: { otlp: { protocols: { grpc: { endpoint: string } } } } };
    expect(parsed.receivers.otlp.protocols.grpc.endpoint).toBe('0.0.0.0:4317');
  });

  it('configures OTLP receiver with HTTP on port 4318', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { receivers: { otlp: { protocols: { http: { endpoint: string } } } } };
    expect(parsed.receivers.otlp.protocols.http.endpoint).toBe('0.0.0.0:4318');
  });

  it('configures VictoriaLogs exporter', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { exporters: Record<string, { endpoint: string }> };
    const logsExporter = parsed.exporters['otlphttp/logs'];
    expect(logsExporter).toBeDefined();
    expect(logsExporter.endpoint).toBe('http://victoria-logs:9428/insert/opentelemetry');
  });

  it('configures VictoriaMetrics exporter via prometheusremotewrite', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { exporters: { prometheusremotewrite: { endpoint: string } } };
    expect(parsed.exporters.prometheusremotewrite.endpoint).toBe('http://victoria-metrics:8428/api/v1/write');
  });

  it('configures traces exporter to victoria-traces via OTLP HTTP', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { exporters: Record<string, { endpoint: string }> };
    const tracesExporter = parsed.exporters['otlphttp/traces'];
    expect(tracesExporter).toBeDefined();
    expect(tracesExporter.endpoint).toBe('http://victoria-traces:4318');
  });

  it('defines logs pipeline with otlp receiver and logs exporter', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: { logs: { receivers: string[]; exporters: string[] } } } };
    expect(parsed.service.pipelines.logs.receivers).toContain('otlp');
    expect(parsed.service.pipelines.logs.exporters).toContain('otlphttp/logs');
  });

  it('defines metrics pipeline with otlp receiver and prometheusremotewrite exporter', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: { metrics: { receivers: string[]; exporters: string[] } } } };
    expect(parsed.service.pipelines.metrics.receivers).toContain('otlp');
    expect(parsed.service.pipelines.metrics.exporters).toContain('prometheusremotewrite');
  });

  it('defines traces pipeline with otlp receiver and traces exporter', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: { traces: { receivers: string[]; exporters: string[] } } } };
    expect(parsed.service.pipelines.traces.receivers).toContain('otlp');
    expect(parsed.service.pipelines.traces.exporters).toContain('otlphttp/traces');
  });

  it('has exactly three pipelines', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: Record<string, unknown> } };
    expect(Object.keys(parsed.service.pipelines)).toEqual(['logs', 'metrics', 'traces']);
  });

  it('does NOT have CORS headers', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { receivers: { otlp: { protocols: { http: Record<string, unknown> } } } };
    expect(parsed.receivers.otlp.protocols.http.cors).toBeUndefined();
  });
});

describe('otelCollectorRemoteTemplate', () => {
  const remoteConfig = {
    logsUrl: 'https://logs.company.com',
    metricsUrl: 'https://metrics.company.com',
    tracesUrl: 'https://traces.company.com:4317',
  };

  it('returns valid YAML', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result);
    expect(parsed).toBeDefined();
  });

  it('configures OTLP receiver with gRPC on port 4317', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { receivers: { otlp: { protocols: { grpc: { endpoint: string } } } } };
    expect(parsed.receivers.otlp.protocols.grpc.endpoint).toBe('0.0.0.0:4317');
  });

  it('configures OTLP receiver with HTTP on port 4318', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { receivers: { otlp: { protocols: { http: { endpoint: string } } } } };
    expect(parsed.receivers.otlp.protocols.http.endpoint).toBe('0.0.0.0:4318');
  });

  it('routes logs exporter to remote logsUrl', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { exporters: Record<string, { endpoint: string }> };
    const logsExporter = parsed.exporters['otlphttp/logs'];
    expect(logsExporter).toBeDefined();
    expect(logsExporter.endpoint).toBe('https://logs.company.com/insert/opentelemetry');
  });

  it('routes metrics exporter to remote metricsUrl', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { exporters: { prometheusremotewrite: { endpoint: string } } };
    expect(parsed.exporters.prometheusremotewrite.endpoint).toBe('https://metrics.company.com/api/v1/write');
  });

  it('routes traces exporter to remote tracesUrl via OTLP HTTP', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { exporters: Record<string, { endpoint: string }> };
    const tracesExporter = parsed.exporters['otlphttp/traces'];
    expect(tracesExporter).toBeDefined();
    expect(tracesExporter.endpoint).toBe('https://traces.company.com:4317');
  });

  it('has exactly three pipelines', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { service: { pipelines: Record<string, unknown> } };
    expect(Object.keys(parsed.service.pipelines)).toEqual(['logs', 'metrics', 'traces']);
  });

  it('strips trailing slashes from URLs to avoid double-slash', () => {
    const configWithSlashes = {
      logsUrl: 'https://logs.company.com/',
      metricsUrl: 'https://metrics.company.com/',
      tracesUrl: 'https://traces.company.com:4317/',
    };
    const result = otelCollectorRemoteTemplate(configWithSlashes);
    const parsed = parse(result) as { exporters: Record<string, { endpoint: string }> };
    expect(parsed.exporters['otlphttp/logs'].endpoint).toBe('https://logs.company.com/insert/opentelemetry');
    expect(parsed.exporters.prometheusremotewrite.endpoint).toBe('https://metrics.company.com/api/v1/write');
    expect(parsed.exporters['otlphttp/traces'].endpoint).toBe('https://traces.company.com:4317');
  });

  it('uses different URLs than the local template', () => {
    const remote = parse(otelCollectorRemoteTemplate(remoteConfig)) as { exporters: Record<string, { endpoint: string }> };
    const local = parse(otelCollectorConfigTemplate()) as { exporters: Record<string, { endpoint: string }> };
    expect(remote.exporters['otlphttp/logs'].endpoint).not.toBe(local.exporters['otlphttp/logs'].endpoint);
    expect(remote.exporters.prometheusremotewrite.endpoint).not.toBe(local.exporters.prometheusremotewrite.endpoint);
  });
});

describe('otelCollectorConfigWithCors', () => {
  it('returns valid YAML', () => {
    const result = otelCollectorConfigWithCors();
    const parsed = parse(result);
    expect(parsed).toBeDefined();
  });

  it('includes CORS headers on HTTP receiver', () => {
    const result = otelCollectorConfigWithCors();
    const parsed = parse(result) as {
      receivers: { otlp: { protocols: { http: { cors: { allowed_origins: string[]; allowed_headers: string[] } } } } };
    };
    const cors = parsed.receivers.otlp.protocols.http.cors;
    expect(cors).toBeDefined();
    expect(cors.allowed_origins).toContain('http://localhost:*');
    expect(cors.allowed_origins).toContain('http://127.0.0.1:*');
    expect(cors.allowed_headers).toContain('*');
  });

  it('configures same gRPC endpoint as base template', () => {
    const result = otelCollectorConfigWithCors();
    const parsed = parse(result) as { receivers: { otlp: { protocols: { grpc: { endpoint: string } } } } };
    expect(parsed.receivers.otlp.protocols.grpc.endpoint).toBe('0.0.0.0:4317');
  });

  it('configures same HTTP endpoint as base template', () => {
    const result = otelCollectorConfigWithCors();
    const parsed = parse(result) as { receivers: { otlp: { protocols: { http: { endpoint: string } } } } };
    expect(parsed.receivers.otlp.protocols.http.endpoint).toBe('0.0.0.0:4318');
  });

  it('has same exporters as base template', () => {
    const corsResult = parse(otelCollectorConfigWithCors()) as { exporters: Record<string, unknown> };
    const baseResult = parse(otelCollectorConfigTemplate()) as { exporters: Record<string, unknown> };
    expect(Object.keys(corsResult.exporters).sort()).toEqual(Object.keys(baseResult.exporters).sort());
  });

  it('has same pipelines as base template', () => {
    const corsResult = parse(otelCollectorConfigWithCors()) as { service: { pipelines: Record<string, unknown> } };
    const baseResult = parse(otelCollectorConfigTemplate()) as { service: { pipelines: Record<string, unknown> } };
    expect(Object.keys(corsResult.service.pipelines)).toEqual(Object.keys(baseResult.service.pipelines));
  });

  it('base template does not have CORS while CORS template does', () => {
    const base = parse(otelCollectorConfigTemplate()) as {
      receivers: { otlp: { protocols: { http: Record<string, unknown> } } };
    };
    const cors = parse(otelCollectorConfigWithCors()) as {
      receivers: { otlp: { protocols: { http: Record<string, unknown> } } };
    };
    expect(base.receivers.otlp.protocols.http.cors).toBeUndefined();
    expect(cors.receivers.otlp.protocols.http.cors).toBeDefined();
  });

  it('inherits resource/default processor from base template', () => {
    const result = otelCollectorConfigWithCors();
    const parsed = parse(result) as { processors: Record<string, unknown>; service: { pipelines: Record<string, { processors?: string[] }> } };
    expect(parsed.processors['resource/default']).toBeDefined();
    expect(parsed.service.pipelines.logs.processors).toContain('resource/default');
    expect(parsed.service.pipelines.metrics.processors).toContain('resource/default');
    expect(parsed.service.pipelines.traces.processors).toContain('resource/default');
  });
});

// ─── Resource/default processor tests ────────────────────────────────────────

describe('resource/default processor in base template', () => {
  it('includes resource/default processor section', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { processors: Record<string, unknown> };
    expect(parsed.processors).toBeDefined();
    expect(parsed.processors['resource/default']).toBeDefined();
  });

  it('processor sets service.name to unknown with insert action (only when absent)', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { processors: { 'resource/default': { attributes: Array<{ key: string; value: string; action: string }> } } };
    const attrs = parsed.processors['resource/default'].attributes;
    expect(attrs).toHaveLength(1);
    expect(attrs[0].key).toBe('service.name');
    expect(attrs[0].value).toBe('unknown');
    expect(attrs[0].action).toBe('insert');
  });

  it('logs pipeline references resource/default processor', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: { logs: { processors: string[] } } } };
    expect(parsed.service.pipelines.logs.processors).toContain('resource/default');
  });

  it('metrics pipeline references resource/default processor', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: { metrics: { processors: string[] } } } };
    expect(parsed.service.pipelines.metrics.processors).toContain('resource/default');
  });

  it('traces pipeline references resource/default processor', () => {
    const result = otelCollectorConfigTemplate();
    const parsed = parse(result) as { service: { pipelines: { traces: { processors: string[] } } } };
    expect(parsed.service.pipelines.traces.processors).toContain('resource/default');
  });
});

describe('resource/default processor in remote template', () => {
  const remoteConfig = {
    logsUrl: 'https://logs.company.com',
    metricsUrl: 'https://metrics.company.com',
    tracesUrl: 'https://traces.company.com:4317',
  };

  it('includes resource/default processor section', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { processors: Record<string, unknown> };
    expect(parsed.processors).toBeDefined();
    expect(parsed.processors['resource/default']).toBeDefined();
  });

  it('all three pipelines reference resource/default processor', () => {
    const result = otelCollectorRemoteTemplate(remoteConfig);
    const parsed = parse(result) as { service: { pipelines: Record<string, { processors?: string[] }> } };
    expect(parsed.service.pipelines.logs.processors).toContain('resource/default');
    expect(parsed.service.pipelines.metrics.processors).toContain('resource/default');
    expect(parsed.service.pipelines.traces.processors).toContain('resource/default');
  });
});
