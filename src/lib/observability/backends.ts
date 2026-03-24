/**
 * Observability backend abstraction.
 *
 * Provides a common interface for building backend-specific queries
 * (Victoria, ELK). Placeholder implementations — expand as needed.
 *
 * See architecture-v3.md Decision 5.
 */

export interface ObservabilityBackend {
  readonly name: string;
  buildLogsQuery(serviceName: string, timeRange?: string): string;
  buildMetricsQuery(serviceName: string, metricName?: string): string;
  buildTracesQuery(serviceName: string, traceId?: string): string;
}

export class VictoriaBackend implements ObservabilityBackend {
  readonly name = 'victoria';

  buildLogsQuery(serviceName: string, timeRange?: string): string {
    const range = timeRange ?? '1h';
    return `{service_name="${serviceName}"} | last ${range}`;
  }

  buildMetricsQuery(serviceName: string, metricName?: string): string {
    const metric = metricName ?? 'http_request_duration_seconds';
    return `${metric}{service_name="${serviceName}"}`;
  }

  buildTracesQuery(serviceName: string, traceId?: string): string {
    if (traceId) {
      return `/api/traces/${traceId}`;
    }
    return `/api/traces?service=${serviceName}&limit=20`;
  }
}

export class ElkBackend implements ObservabilityBackend {
  readonly name = 'elk';

  buildLogsQuery(serviceName: string, timeRange?: string): string {
    const range = timeRange ?? '1h';
    return `service.name: "${serviceName}" AND @timestamp:[now-${range} TO now]`;
  }

  buildMetricsQuery(serviceName: string, metricName?: string): string {
    const metric = metricName ?? 'http_request_duration_seconds';
    return `metricset.name: "${metric}" AND service.name: "${serviceName}"`;
  }

  buildTracesQuery(serviceName: string, traceId?: string): string {
    if (traceId) {
      return `trace.id: "${traceId}"`;
    }
    return `service.name: "${serviceName}" AND processor.event: "transaction"`;
  }
}
