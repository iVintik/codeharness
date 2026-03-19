/**
 * Types for the infra module.
 */

import type { AppType } from '../../lib/stack-detect.js';
import type { DependencyResult } from '../../lib/deps.js';
import type { OtlpResult } from '../../lib/otlp.js';
import type { DockerStartResult } from '../../lib/docker.js';

/** Options for project initialization */
export interface InitOptions {
  readonly projectDir: string;
  readonly frontend: boolean;
  readonly database: boolean;
  readonly api: boolean;
  readonly observability: boolean;
  readonly otelEndpoint?: string;
  readonly opensearchUrl?: string;
  readonly logsUrl?: string;
  readonly metricsUrl?: string;
  readonly tracesUrl?: string;
  readonly json?: boolean;
}

/** Docker result shape within InitResult */
export interface InitDockerResult {
  readonly compose_file: string;
  readonly stack_running: boolean;
  readonly services: DockerStartResult['services'];
  readonly ports: {
    readonly logs: number;
    readonly metrics: number;
    readonly traces: number;
    readonly otel_grpc: number;
    readonly otel_http: number;
  };
}

/** Beads result shape within InitResult */
export interface InitBeadsResult {
  readonly status: 'initialized' | 'already-initialized' | 'failed';
  readonly hooks_detected: boolean;
  readonly error?: string;
}

/** BMAD result shape within InitResult */
export interface InitBmadResult {
  readonly status: 'installed' | 'already-installed' | 'patched' | 'failed';
  readonly version: string | null;
  readonly patches_applied: string[];
  readonly bmalph_detected: boolean;
  readonly error?: string;
}

/** Documentation scaffold result */
export interface InitDocumentationResult {
  readonly agents_md: 'created' | 'exists' | 'skipped';
  readonly docs_scaffold: 'created' | 'exists' | 'skipped';
  readonly readme: 'created' | 'exists' | 'skipped';
}

/** Result of project initialization */
export interface InitResult {
  status: 'ok' | 'fail';
  stack: string | null;
  app_type?: AppType;
  enforcement: {
    frontend: boolean;
    database: boolean;
    api: boolean;
  };
  documentation: InitDocumentationResult;
  dependencies?: DependencyResult[];
  beads?: InitBeadsResult;
  bmad?: InitBmadResult;
  otlp?: OtlpResult;
  docker?: InitDockerResult | null;
  error?: string;
}

/** Status of the infrastructure stack */
export interface StackStatus {
  readonly running: boolean;
  readonly composePath: string;
  readonly projectName: string;
  readonly services: ReadonlyArray<{
    readonly name: string;
    readonly healthy: boolean;
  }>;
}

/** Result of detecting a running shared stack */
export interface StackDetectionResult {
  readonly running: boolean;
  readonly projectName: string;
  readonly composePath: string;
  readonly services: ReadonlyArray<{
    readonly name: string;
    readonly running: boolean;
  }>;
}

/** Result of port conflict detection */
export interface PortConflictResult {
  readonly conflicts: ReadonlyArray<{
    readonly port: number;
    readonly pid: number;
    readonly processName: string;
  }>;
}

/** Result of stale container cleanup */
export interface CleanupResult {
  readonly containersRemoved: number;
  readonly names: readonly string[];
}

/** Default ports used by the observability stack */
export const DEFAULT_PORTS = {
  logs: 9428,
  metrics: 8428,
  traces: 16686,
  otel_grpc: 4317,
  otel_http: 4318,
} as const;

/** All default ports as an array for conflict detection */
export const ALL_STACK_PORTS = [
  DEFAULT_PORTS.otel_grpc,
  DEFAULT_PORTS.otel_http,
  DEFAULT_PORTS.metrics,
  DEFAULT_PORTS.logs,
  DEFAULT_PORTS.traces,
] as const;
