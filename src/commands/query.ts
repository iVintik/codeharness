import { Command } from 'commander';
import { fail, jsonOutput } from '../lib/output.js';
import { readState, StateFileNotFoundError } from '../lib/state.js';

interface QueryLogsOptions {
  start?: string;
  raw?: boolean;
  json?: boolean;
}

interface QueryMetricsOptions {
  raw?: boolean;
  json?: boolean;
}

interface QueryTracesOptions {
  limit?: string;
  operation?: string;
  minDuration?: string;
  json?: boolean;
}

function getServiceName(): { serviceName: string; endpoints: { logs: string; metrics: string; traces: string } } | null {
  try {
    const state = readState();
    const serviceName = state.otlp?.service_name;
    if (!serviceName) {
      fail('No service_name configured. Run "codeharness init" first.');
      process.exitCode = 1;
      return null;
    }

    // Resolve endpoints from state
    const mode = state.otlp?.mode ?? 'local-shared';
    let logs = 'http://localhost:9428';
    let metrics = 'http://localhost:8428';
    let traces = 'http://localhost:16686';

    if (mode === 'remote-routed') {
      const re = state.docker?.remote_endpoints;
      if (re?.logs_url) logs = re.logs_url;
      if (re?.metrics_url) metrics = re.metrics_url;
      if (re?.traces_url) traces = re.traces_url;
    } else if (mode === 'remote-direct') {
      const endpoint = state.otlp?.endpoint ?? 'http://localhost:4318';
      logs = endpoint;
      metrics = endpoint;
      traces = endpoint;
    }

    return { serviceName, endpoints: { logs, metrics, traces } };
  } catch (err) {
    if (err instanceof StateFileNotFoundError) {
      fail("Harness not initialized. Run 'codeharness init' first.");
      process.exitCode = 1;
      return null;
    }
    throw err;
  }
}

export function buildLogsQuery(filter: string, serviceName: string, raw: boolean): string {
  if (raw) return filter;
  return `${filter} AND service_name:${serviceName}`;
}

export function injectServiceNameIntoPromQL(promql: string, serviceName: string): string {
  // If already contains service_name, return as-is
  if (promql.includes('service_name')) return promql;

  // Match metric name followed by optional label selector and optional range
  // Cases:
  //   http_requests_total -> http_requests_total{service_name="X"}
  //   http_requests_total{status="200"} -> http_requests_total{status="200",service_name="X"}
  //   rate(http_requests_total[5m]) -> rate(http_requests_total{service_name="X"}[5m])
  //   rate(http_requests_total{status="200"}[5m]) -> rate(http_requests_total{status="200",service_name="X"}[5m])

  const label = `service_name="${serviceName}"`;

  // If there's an existing label selector, add to it
  const withExisting = promql.replace(/\{([^}]*)\}/g, `{$1,${label}}`);
  if (withExisting !== promql) return withExisting;

  // No label selector — add one after the metric name (before [ or end)
  // Metric name pattern: word chars possibly with colons
  return promql.replace(/([a-zA-Z_:][a-zA-Z0-9_:]*)(\[|$|\))/g, (match, metric: string, after: string) => {
    // Don't inject after function names like 'rate', 'sum', 'histogram_quantile' etc.
    const functions = ['rate', 'sum', 'avg', 'min', 'max', 'count', 'histogram_quantile', 'increase', 'irate', 'delta', 'deriv', 'predict_linear', 'absent', 'ceil', 'floor', 'round', 'sort', 'sort_desc', 'label_replace', 'label_join', 'topk', 'bottomk', 'quantile'];
    if (functions.includes(metric)) return match;
    return `${metric}{${label}}${after}`;
  });
}

async function fetchUrl(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, status: 0, text: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleQueryLogs(filter: string, options: QueryLogsOptions): Promise<void> {
  const isJson = options.json === true;
  const ctx = getServiceName();
  if (!ctx) return;

  const start = options.start ?? '5m';
  const query = buildLogsQuery(filter, ctx.serviceName, options.raw === true);
  const url = `${ctx.endpoints.logs}/select/logsql/query?query=${encodeURIComponent(query)}&start=${encodeURIComponent(start)}`;

  const result = await fetchUrl(url);

  if (isJson) {
    jsonOutput({ query, url, status: result.status, response: result.text });
  } else {
    if (!result.ok) {
      fail(`Query failed (HTTP ${result.status}): ${result.text}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.text);
  }
}

async function handleQueryMetrics(promql: string, options: QueryMetricsOptions): Promise<void> {
  const isJson = options.json === true;
  const ctx = getServiceName();
  if (!ctx) return;

  const query = options.raw === true ? promql : injectServiceNameIntoPromQL(promql, ctx.serviceName);
  const url = `${ctx.endpoints.metrics}/api/v1/query?query=${encodeURIComponent(query)}`;

  const result = await fetchUrl(url);

  if (isJson) {
    jsonOutput({ query, url, status: result.status, response: result.text });
  } else {
    if (!result.ok) {
      fail(`Query failed (HTTP ${result.status}): ${result.text}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.text);
  }
}

async function handleQueryTraces(options: QueryTracesOptions): Promise<void> {
  const isJson = options.json === true;
  const ctx = getServiceName();
  if (!ctx) return;

  const limit = options.limit ?? '20';
  let url = `${ctx.endpoints.traces}/api/traces?service=${encodeURIComponent(ctx.serviceName)}&limit=${limit}`;
  if (options.operation) {
    url += `&operation=${encodeURIComponent(options.operation)}`;
  }
  if (options.minDuration) {
    url += `&minDuration=${encodeURIComponent(options.minDuration)}`;
  }

  const result = await fetchUrl(url);

  if (isJson) {
    jsonOutput({ service: ctx.serviceName, url, status: result.status, response: result.text });
  } else {
    if (!result.ok) {
      fail(`Query failed (HTTP ${result.status}): ${result.text}`);
      process.exitCode = 1;
      return;
    }
    console.log(result.text);
  }
}

export function registerQueryCommand(program: Command): void {
  const query = program
    .command('query')
    .description('Query observability data (logs, metrics, traces) scoped to current project');

  query
    .command('logs <filter>')
    .description('Query logs with automatic service_name scoping')
    .option('--start <duration>', 'Time range (default: 5m)', '5m')
    .option('--raw', 'Skip automatic service_name filter')
    .action(async (filter: string, opts: QueryLogsOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      await handleQueryLogs(filter, { ...opts, json: globalOpts.json });
    });

  query
    .command('metrics <promql>')
    .description('Query metrics with automatic service_name label injection')
    .option('--raw', 'Skip automatic service_name injection')
    .action(async (promql: string, opts: QueryMetricsOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      await handleQueryMetrics(promql, { ...opts, json: globalOpts.json });
    });

  query
    .command('traces')
    .description('Query traces for current project service')
    .option('--limit <n>', 'Number of traces to return (default: 20)', '20')
    .option('--operation <name>', 'Filter by operation name')
    .option('--min-duration <duration>', 'Minimum trace duration (e.g., 1s)')
    .action(async (opts: QueryTracesOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      await handleQueryTraces({ ...opts, json: globalOpts.json });
    });
}
