/**
 * Observability backend interface from architecture decision 4.
 * Backend-agnostic types usable by both Victoria and OpenSearch implementations.
 */

import type { Result } from './result.js';

/** Supported observability backend types */
export type ObservabilityBackendType = 'victoria' | 'opensearch';

/** Time range for queries */
export interface TimeRange {
  readonly start: string;
  readonly end: string;
}

/** Parameters for querying logs */
export interface LogQuery {
  readonly query: string;
  readonly timeRange: TimeRange;
  readonly limit?: number;
  readonly offset?: number;
  readonly filters?: Record<string, string>;
}

/** Parameters for querying metrics */
export interface MetricQuery {
  readonly query: string;
  readonly timeRange: TimeRange;
  readonly step?: string;
  readonly filters?: Record<string, string>;
}

/** Parameters for querying traces */
export interface TraceQuery {
  readonly traceId?: string;
  readonly serviceName?: string;
  readonly operationName?: string;
  readonly timeRange: TimeRange;
  readonly limit?: number;
  readonly filters?: Record<string, string>;
}

/** A single log entry returned from a query */
export interface LogEntry {
  readonly timestamp: string;
  readonly message: string;
  readonly level: string;
  readonly labels: Record<string, string>;
}

/** Result of a log query */
export interface LogResult {
  readonly entries: LogEntry[];
  readonly total: number;
}

/** A single data point in a metric time series */
export interface MetricDataPoint {
  readonly timestamp: string;
  readonly value: number;
}

/** A single metric time series */
export interface MetricSeries {
  readonly labels: Record<string, string>;
  readonly dataPoints: MetricDataPoint[];
}

/** Result of a metric query */
export interface MetricResult {
  readonly series: MetricSeries[];
}

/** A single span in a trace */
export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly operationName: string;
  readonly serviceName: string;
  readonly startTime: string;
  readonly duration: number;
  readonly tags: Record<string, string>;
}

/** Result of a trace query */
export interface TraceResult {
  readonly spans: TraceSpan[];
}

/** Health status of an observability backend */
export interface HealthStatus {
  readonly healthy: boolean;
  readonly message: string;
  readonly latencyMs: number;
}

/** Backend-agnostic observability interface */
export interface ObservabilityBackend {
  readonly type: ObservabilityBackendType;
  queryLogs(params: LogQuery): Promise<Result<LogResult>>;
  queryMetrics(params: MetricQuery): Promise<Result<MetricResult>>;
  queryTraces(params: TraceQuery): Promise<Result<TraceResult>>;
  healthCheck(): Promise<Result<HealthStatus>>;
}
