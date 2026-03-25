/**
 * Standalone runtime validator — validates telemetry outside Docker verification.
 * Implements Story 2.3: run tests with OTLP, query backend, report module coverage.
 */

import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail } from '../../types/result.js';
import type { Result } from '../../types/result.js';
import type {
  RuntimeValidationConfig,
  RuntimeValidationResult,
  ModuleTelemetryEntry,
  TelemetryEvent,
} from './types.js';

const DEFAULT_CONFIG: RuntimeValidationConfig = {
  testCommand: 'npm test',
  otlpEndpoint: 'http://localhost:4318',
  queryEndpoint: 'http://localhost:9428',
  timeoutMs: 120_000,
};

const HEALTH_TIMEOUT_MS = 3_000;
const QUERY_TIMEOUT_MS = 30_000;
/** Run tests with OTLP enabled, query backend for events, compute module coverage. */
export async function validateRuntime(
  projectDir: string,
  config?: Partial<RuntimeValidationConfig>,
): Promise<Result<RuntimeValidationResult>> {
  if (!projectDir || typeof projectDir !== 'string') {
    return fail('projectDir is required and must be a non-empty string');
  }

  const cfg: RuntimeValidationConfig = { ...DEFAULT_CONFIG, ...config };

  // Reject test commands containing shell metacharacters to prevent injection
  if (/[;&|`$(){}!#]/.test(cfg.testCommand)) {
    return fail(`testCommand contains disallowed shell metacharacters: ${cfg.testCommand}`);
  }

  // Step 1: Check backend health
  const healthy = await checkBackendHealth(cfg.queryEndpoint);
  if (!healthy) {
    const modules = discoverModules(projectDir);
    const entries: ModuleTelemetryEntry[] = modules.map((m) => ({
      moduleName: m,
      telemetryDetected: false,
      eventCount: 0,
    }));
    return ok({
      entries,
      totalModules: modules.length,
      modulesWithTelemetry: 0,
      coveragePercent: 0,
      skipped: true,
      skipReason: 'runtime validation skipped -- observability stack not available',
    });
  }

  // Step 2: Record start time and run tests
  const startTime = new Date().toISOString();
  try {
    execSync(cfg.testCommand, {
      cwd: projectDir,
      timeout: cfg.timeoutMs,
      env: {
        ...process.env,
        OTEL_EXPORTER_OTLP_ENDPOINT: cfg.otlpEndpoint,
      },
      stdio: 'pipe',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Test command failed: ${msg}`);
  }
  const endTime = new Date().toISOString();

  // Step 3: Query telemetry events
  const eventsResult = await queryTelemetryEvents(cfg.queryEndpoint, startTime, endTime);
  if (!eventsResult.success) {
    return fail(eventsResult.error);
  }

  // Step 4: Map events to modules and compute coverage
  const modules = discoverModules(projectDir);
  const entries = mapEventsToModules(eventsResult.data, projectDir, modules);
  const modulesWithTelemetry = entries.filter((e) => e.telemetryDetected).length;
  const totalModules = entries.length;
  const coveragePercent = totalModules === 0 ? 0 : (modulesWithTelemetry / totalModules) * 100;

  return ok({
    entries,
    totalModules,
    modulesWithTelemetry,
    coveragePercent,
    skipped: false,
  });
}

/** Check if the observability backend is reachable (2xx within 3s). */
export async function checkBackendHealth(queryEndpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${queryEndpoint}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    // IGNORE: health check endpoint may be unreachable
    return false;
  }
}

/** Query VictoriaLogs for telemetry events within a time window. */
export async function queryTelemetryEvents(
  queryEndpoint: string,
  startTime: string,
  endTime: string,
): Promise<Result<TelemetryEvent[]>> {
  let url: URL;
  try {
    url = new URL('/select/logsql/query', queryEndpoint);
  } catch {
    // IGNORE: malformed URL, return error
    return fail(`Invalid queryEndpoint URL: ${queryEndpoint}`);
  }
  url.searchParams.set('query', '*');
  url.searchParams.set('start', startTime);
  url.searchParams.set('end', endTime);
  url.searchParams.set('limit', '1000');

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      return fail(`VictoriaLogs returned ${response.status}`);
    }
    const text = await response.text();
    const events = parseLogEvents(text);
    return ok(events);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to query telemetry events: ${msg}`);
  }
}

/** Map telemetry events to project modules by matching source paths. */
export function mapEventsToModules(
  events: TelemetryEvent[],
  projectDir: string,
  modules?: string[],
): ModuleTelemetryEntry[] {
  void projectDir; // Reserved for future source-path resolution
  const moduleList = modules ?? [];
  const moduleCounts = new Map<string, number>();
  for (const mod of moduleList) {
    moduleCounts.set(mod, 0);
  }

  for (const event of events) {
    for (const mod of moduleList) {
      if (event.source.includes(mod) || event.message.includes(mod)) {
        moduleCounts.set(mod, (moduleCounts.get(mod) ?? 0) + 1);
      }
    }
  }

  return moduleList.map((mod) => {
    const count = moduleCounts.get(mod) ?? 0;
    return {
      moduleName: mod,
      telemetryDetected: count > 0,
      eventCount: count,
    };
  });
}

/** Discover top-level module directories under src/ */
function discoverModules(projectDir: string): string[] {
  const srcDir = join(projectDir, 'src');
  try {
    return readdirSync(srcDir).filter((name) => {
      try {
        return statSync(join(srcDir, name)).isDirectory();
      } catch {
        // IGNORE: stat may fail on individual entry
        return false;
      }
    });
  } catch {
    // IGNORE: src/ directory may not exist
    return [];
  }
}

/** Parse newline-delimited JSON from VictoriaLogs into TelemetryEvent[] */
function parseLogEvents(text: string): TelemetryEvent[] {
  if (!text.trim()) return [];
  const lines = text.trim().split('\n');
  const events: TelemetryEvent[] = [];
  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      events.push({
        timestamp: String(raw._time ?? raw.timestamp ?? ''),
        message: String(raw._msg ?? raw.message ?? ''),
        source: String(raw.source ?? raw._source ?? raw.service ?? ''),
      });
    } catch {
      // IGNORE: skip malformed log lines
    }
  }
  return events;
}
