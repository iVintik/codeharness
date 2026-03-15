import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { dockerComposeTemplate, dockerComposeCollectorOnlyTemplate } from '../docker-compose.js';
import type { DockerComposeConfig } from '../docker-compose.js';

describe('dockerComposeTemplate', () => {
  const defaultConfig: DockerComposeConfig = {
    shared: true,
  };

  it('returns valid YAML', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as Record<string, unknown>;
    expect(parsed).toBeDefined();
    expect(parsed.services).toBeDefined();
  });

  it('includes all four required services', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, unknown> };
    expect(Object.keys(parsed.services)).toContain('victoria-logs');
    expect(Object.keys(parsed.services)).toContain('victoria-metrics');
    expect(Object.keys(parsed.services)).toContain('victoria-traces');
    expect(Object.keys(parsed.services)).toContain('otel-collector');
  });

  it('uses pinned image tags — no latest or missing tags', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { image: string }> };
    for (const [name, svc] of Object.entries(parsed.services)) {
      expect(svc.image, `${name} should have a pinned image tag`).toMatch(/:.+$/);
      expect(svc.image, `${name} should not use latest`).not.toContain(':latest');
    }
  });

  it('uses correct image for victoria-logs', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { image: string }> };
    expect(parsed.services['victoria-logs'].image).toBe('victoriametrics/victoria-logs:v1.15.0');
  });

  it('uses correct image for victoria-metrics', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { image: string }> };
    expect(parsed.services['victoria-metrics'].image).toBe('victoriametrics/victoria-metrics:v1.106.1');
  });

  it('uses correct image for victoria-traces', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { image: string }> };
    expect(parsed.services['victoria-traces'].image).toBe('jaegertracing/all-in-one:1.56');
  });

  it('uses correct image for otel-collector', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { image: string }> };
    expect(parsed.services['otel-collector'].image).toBe('otel/opentelemetry-collector-contrib:0.96.0');
  });

  it('maps correct ports for victoria-logs (9428)', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { ports: string[] }> };
    expect(parsed.services['victoria-logs'].ports).toContain('9428:9428');
  });

  it('maps correct ports for victoria-metrics (8428)', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { ports: string[] }> };
    expect(parsed.services['victoria-metrics'].ports).toContain('8428:8428');
  });

  it('maps correct ports for victoria-traces (14268, 16686)', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { ports: string[] }> };
    expect(parsed.services['victoria-traces'].ports).toContain('14268:14268');
    expect(parsed.services['victoria-traces'].ports).toContain('16686:16686');
  });

  it('maps correct ports for otel-collector (4317, 4318)', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { ports: string[] }> };
    expect(parsed.services['otel-collector'].ports).toContain('4317:4317');
    expect(parsed.services['otel-collector'].ports).toContain('4318:4318');
  });

  it('otel-collector depends on backend services', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { depends_on: string[] }> };
    const deps = parsed.services['otel-collector'].depends_on;
    expect(deps).toContain('victoria-logs');
    expect(deps).toContain('victoria-metrics');
    expect(deps).toContain('victoria-traces');
  });

  it('otel-collector mounts config volume', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { volumes: string[] }> };
    const volumes = parsed.services['otel-collector'].volumes;
    expect(volumes.some(v => v.includes('otel-collector-config.yaml'))).toBe(true);
  });

  it('includes named volumes for data persistence', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { volumes: Record<string, unknown> };
    expect(parsed.volumes).toHaveProperty('victoria-logs-data');
    expect(parsed.volumes).toHaveProperty('victoria-metrics-data');
  });

  it('uses fixed shared network name', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { networks: Record<string, { name: string }> };
    expect(parsed.networks.default.name).toBe('codeharness-shared-net');
  });

  it('uses fixed codeharness-shared project name', () => {
    const result = dockerComposeTemplate({ shared: true });
    const parsed = parse(result) as { name: string };
    expect(parsed.name).toBe('codeharness-shared');
  });

  it('all services have com.codeharness.stack=shared label', () => {
    const result = dockerComposeTemplate(defaultConfig);
    const parsed = parse(result) as { services: Record<string, { labels: Record<string, string> }> };
    for (const [name, svc] of Object.entries(parsed.services)) {
      expect(svc.labels, `${name} should have shared label`).toEqual({ 'com.codeharness.stack': 'shared' });
    }
  });
});

describe('dockerComposeCollectorOnlyTemplate', () => {
  it('returns valid YAML', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as Record<string, unknown>;
    expect(parsed).toBeDefined();
    expect(parsed.services).toBeDefined();
  });

  it('contains only otel-collector service', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { services: Record<string, unknown> };
    expect(Object.keys(parsed.services)).toEqual(['otel-collector']);
  });

  it('does NOT include victoria-logs, victoria-metrics, or victoria-traces', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { services: Record<string, unknown> };
    expect(parsed.services['victoria-logs']).toBeUndefined();
    expect(parsed.services['victoria-metrics']).toBeUndefined();
    expect(parsed.services['victoria-traces']).toBeUndefined();
  });

  it('uses codeharness-collector project name', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { name: string };
    expect(parsed.name).toBe('codeharness-collector');
  });

  it('uses codeharness-collector-net network name', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { networks: Record<string, { name: string }> };
    expect(parsed.networks.default.name).toBe('codeharness-collector-net');
  });

  it('maps correct ports for otel-collector (4317, 4318)', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { services: Record<string, { ports: string[] }> };
    expect(parsed.services['otel-collector'].ports).toContain('4317:4317');
    expect(parsed.services['otel-collector'].ports).toContain('4318:4318');
  });

  it('uses same otel-collector image as full template', () => {
    const collectorOnly = parse(dockerComposeCollectorOnlyTemplate()) as { services: Record<string, { image: string }> };
    const full = parse(dockerComposeTemplate({ shared: true })) as { services: Record<string, { image: string }> };
    expect(collectorOnly.services['otel-collector'].image).toBe(full.services['otel-collector'].image);
  });

  it('otel-collector has collector label', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { services: Record<string, { labels: Record<string, string> }> };
    expect(parsed.services['otel-collector'].labels['com.codeharness.stack']).toBe('collector');
  });

  it('does NOT have named volumes', () => {
    const result = dockerComposeCollectorOnlyTemplate();
    const parsed = parse(result) as { volumes?: Record<string, unknown> };
    expect(parsed.volumes).toBeUndefined();
  });
});
