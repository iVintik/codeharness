import { Command } from 'commander';
import { ok, fail, info, jsonOutput } from '../lib/output.js';
import { getStackHealth, getCollectorHealth, isSharedStackRunning, checkRemoteEndpoint } from '../lib/docker.js';
import { readState, StateFileNotFoundError } from '../lib/state.js';
import { listIssues, isBeadsInitialized } from '../lib/beads.js';
import { getOnboardingProgress } from '../lib/onboard-checks.js';
import { getStackDir, getComposeFilePath } from '../lib/stack-path.js';
import type { HarnessState } from '../lib/state.js';
import type { DockerHealthResult } from '../lib/docker.js';

interface StatusOptions {
  checkDocker?: boolean;
  check?: boolean;
}

export interface EndpointUrls {
  logs: string;
  metrics: string;
  traces: string;
  otel_http: string;
}

export interface ScopedEndpointUrls {
  logs: string;
  metrics: string;
  traces: string;
}

export function buildScopedEndpoints(endpoints: EndpointUrls, serviceName: string): ScopedEndpointUrls {
  const encoded = encodeURIComponent(serviceName);
  return {
    logs: `${endpoints.logs}/select/logsql/query?query=${encodeURIComponent(`service_name:${serviceName}`)}`,
    metrics: `${endpoints.metrics}/api/v1/query?query=${encodeURIComponent(`{service_name="${serviceName}"}`)}`,
    traces: `${endpoints.traces}/api/traces?service=${encoded}&limit=20`,
  };
}

export const DEFAULT_ENDPOINTS: EndpointUrls = {
  logs: 'http://localhost:9428',
  metrics: 'http://localhost:8428',
  traces: 'http://localhost:16686',
  otel_http: 'http://localhost:4318',
};

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current harness status and health')
    .option('--check-docker', 'Check Docker stack health')
    .option('--check', 'Run health checks with pass/fail exit code')
    .action(async (options: StatusOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      if (options.checkDocker) {
        await handleDockerCheck(isJson);
        return;
      }

      if (options.check) {
        await handleHealthCheck(isJson);
        return;
      }

      handleFullStatus(isJson);
    });
}

// ─── Full Status Display ────────────────────────────────────────────────────

function handleFullStatus(isJson: boolean): void {
  let state: HarnessState;
  try {
    state = readState();
  } catch (err) {
    if (err instanceof StateFileNotFoundError) {
      if (isJson) {
        jsonOutput({ status: 'fail', message: "Harness not initialized. Run 'codeharness init' first." });
      } else {
        fail("Harness not initialized. Run 'codeharness init' first.");
      }
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (isJson) {
    handleFullStatusJson(state);
    return;
  }

  // Version & Stack
  console.log(`Harness: codeharness v${state.harness_version}`);
  console.log(`Stack: ${state.stack ?? 'unknown'}`);
  if (state.app_type) {
    console.log(`App type: ${state.app_type}`);
    if (state.app_type === 'agent' && state.otlp?.agent_sdk) {
      console.log(`Agent SDK: ${state.otlp.agent_sdk}`);
    }
  }

  // Enforcement
  const e = state.enforcement;
  console.log(
    `Enforcement: front:${e.frontend ? 'ON' : 'OFF'} db:${e.database ? 'ON' : 'OFF'} api:${e.api ? 'ON' : 'OFF'} obs:ON`,
  );

  // Docker (always shown — observability is mandatory)
  {
    const mode = state.otlp?.mode ?? 'local-shared';

    if (mode === 'remote-direct') {
      const endpoint = state.otlp?.endpoint ?? 'unknown';
      console.log(`Docker: none (remote OTLP at ${endpoint})`);
    } else if (mode === 'remote-routed') {
      const re = state.docker?.remote_endpoints;
      console.log(`Docker: OTel Collector only (backends at ${re?.logs_url ?? 'unknown'}, ${re?.metrics_url ?? 'unknown'}, ${re?.traces_url ?? 'unknown'})`);
      const sharedComposeFile = getComposeFilePath();
      const health = getCollectorHealth(sharedComposeFile);
      for (const svc of health.services) {
        console.log(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
      }
    } else {
      const composeFile = state.docker?.compose_file ?? 'docker-compose.harness.yml';
      const stackDir = getStackDir();
      const isShared = composeFile.startsWith(stackDir);

      if (isShared) {
        console.log(`Docker: shared stack at ~/.codeharness/stack/`);
        const sharedComposeFile = getComposeFilePath();
        const health = getStackHealth(sharedComposeFile, 'codeharness-shared');
        for (const svc of health.services) {
          console.log(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
        }
        if (health.healthy) {
          console.log(
            `  Endpoints: logs=${DEFAULT_ENDPOINTS.logs} metrics=${DEFAULT_ENDPOINTS.metrics} traces=${DEFAULT_ENDPOINTS.traces}`,
          );
        }
      } else {
        const health = getStackHealth(composeFile);
        console.log('Docker:');
        for (const svc of health.services) {
          console.log(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
        }
        if (health.healthy) {
          console.log(
            `  Endpoints: logs=${DEFAULT_ENDPOINTS.logs} metrics=${DEFAULT_ENDPOINTS.metrics} traces=${DEFAULT_ENDPOINTS.traces}`,
          );
        }
      }
    }
  }

  // Service-scoped endpoints
  const serviceName = state.otlp?.service_name;
  if (serviceName) {
    const endpoints = resolveEndpoints(state);
    const scoped = buildScopedEndpoints(endpoints, serviceName);
    console.log(`  Scoped: logs=${scoped.logs} metrics=${scoped.metrics} traces=${scoped.traces}`);
  }

  // Beads
  printBeadsSummary();

  // Onboarding progress
  printOnboardingProgress();

  // Session flags
  const sf = state.session_flags;
  console.log(
    `Session: tests_passed=${sf.tests_passed} coverage_met=${sf.coverage_met} verification_run=${sf.verification_run} logs_queried=${sf.logs_queried}`,
  );

  // Coverage
  const currentCov = state.coverage.current !== null ? `${state.coverage.current}%` : '\u2014';
  console.log(`Coverage: ${currentCov} / ${state.coverage.target}% target`);

  // Verification log
  if (state.verification_log.length === 0) {
    console.log('Verification: no entries');
  } else {
    console.log('Verification log:');
    for (const entry of state.verification_log) {
      console.log(`  ${entry}`);
    }
  }
}

function resolveEndpoints(state: HarnessState): EndpointUrls {
  const mode = state.otlp?.mode ?? 'local-shared';
  if (mode === 'remote-direct') {
    const endpoint = state.otlp?.endpoint ?? 'http://localhost:4318';
    return {
      logs: endpoint,
      metrics: endpoint,
      traces: endpoint,
      otel_http: endpoint,
    };
  }
  if (mode === 'remote-routed') {
    const re = state.docker?.remote_endpoints;
    return {
      logs: re?.logs_url ?? DEFAULT_ENDPOINTS.logs,
      metrics: re?.metrics_url ?? DEFAULT_ENDPOINTS.metrics,
      traces: re?.traces_url ?? DEFAULT_ENDPOINTS.traces,
      otel_http: DEFAULT_ENDPOINTS.otel_http,
    };
  }
  return DEFAULT_ENDPOINTS;
}

function handleFullStatusJson(state: HarnessState): void {
  // Docker (always present — observability is mandatory)
  let docker: Record<string, unknown>;
  {
    const mode = state.otlp?.mode ?? 'local-shared';

    if (mode === 'remote-direct') {
      docker = {
        mode: 'remote-direct',
        endpoint: state.otlp?.endpoint,
      };
    } else if (mode === 'remote-routed') {
      const sharedComposeFile = getComposeFilePath();
      const health = getCollectorHealth(sharedComposeFile);
      docker = {
        mode: 'remote-routed',
        healthy: health.healthy,
        services: health.services,
        remote_endpoints: state.docker?.remote_endpoints,
      };
    } else {
      const composeFile = state.docker?.compose_file ?? 'docker-compose.harness.yml';
      const stackDir = getStackDir();
      const isShared = composeFile.startsWith(stackDir);

      if (isShared) {
        const sharedComposeFile = getComposeFilePath();
        const health = getStackHealth(sharedComposeFile, 'codeharness-shared');
        docker = {
          shared: true,
          stack_dir: '~/.codeharness/stack/',
          healthy: health.healthy,
          services: health.services,
          ...(health.healthy ? { endpoints: DEFAULT_ENDPOINTS } : {}),
        };
      } else {
        const health = getStackHealth(composeFile);
        docker = {
          healthy: health.healthy,
          services: health.services,
          ...(health.healthy ? { endpoints: DEFAULT_ENDPOINTS } : {}),
        };
      }
    }
  }

  // Resolved endpoints
  const endpoints = resolveEndpoints(state);

  // Scoped endpoints
  const serviceName = state.otlp?.service_name;
  const scoped_endpoints = serviceName ? buildScopedEndpoints(endpoints, serviceName) : undefined;

  // Beads
  const beads = getBeadsData();

  // Onboarding progress
  const onboarding = getOnboardingProgressData();

  jsonOutput({
    version: state.harness_version,
    stack: state.stack,
    ...(state.app_type ? { app_type: state.app_type } : {}),
    enforcement: state.enforcement,
    docker,
    endpoints,
    ...(scoped_endpoints ? { scoped_endpoints } : {}),
    beads,
    ...(onboarding ? { onboarding } : {}),
    session_flags: state.session_flags,
    coverage: state.coverage,
    verification_log: state.verification_log,
  });
}

// ─── Health Check Mode ──────────────────────────────────────────────────────

async function handleHealthCheck(isJson: boolean): Promise<void> {
  const checks: { name: string; status: 'ok' | 'fail'; detail: string }[] = [];

  // 1. State file integrity
  let state: HarnessState | null = null;
  try {
    state = readState();
    checks.push({ name: 'state_file', status: 'ok', detail: 'valid' });
  } catch {
    checks.push({ name: 'state_file', status: 'fail', detail: 'not found' });
  }

  // 2. Docker health (always checked — observability is mandatory)
  if (state) {
    const mode = state.otlp?.mode ?? 'local-shared';

    if (mode === 'remote-direct') {
      const endpoint = state.otlp?.endpoint ?? '';
      const result = await checkRemoteEndpoint(endpoint);
      checks.push({
        name: 'docker',
        status: result.reachable ? 'ok' : 'fail',
        detail: result.reachable ? `remote OTLP reachable (${endpoint})` : `remote OTLP unreachable (${result.error ?? 'unknown'})`,
      });
    } else if (mode === 'remote-routed') {
      const sharedComposeFile = getComposeFilePath();
      const health = getCollectorHealth(sharedComposeFile);
      checks.push({
        name: 'docker',
        status: health.healthy ? 'ok' : 'fail',
        detail: health.healthy ? 'OTel Collector running' : (health.remedy ?? 'collector down'),
      });

      // Check remote endpoints
      const re = state.docker?.remote_endpoints;
      if (re) {
        for (const [label, url] of [['logs', re.logs_url], ['metrics', re.metrics_url], ['traces', re.traces_url]] as const) {
          if (url) {
            const result = await checkRemoteEndpoint(url);
            checks.push({
              name: `remote_${label}`,
              status: result.reachable ? 'ok' : 'fail',
              detail: result.reachable ? `reachable (${url})` : `unreachable (${result.error ?? 'unknown'})`,
            });
          }
        }
      }
    } else {
      const composeFile = state.docker?.compose_file ?? 'docker-compose.harness.yml';
      const sDir = getStackDir();
      const isShared = composeFile.startsWith(sDir);
      const healthComposeFile = isShared ? getComposeFilePath() : composeFile;
      const healthProjectName = isShared ? 'codeharness-shared' : undefined;
      const health = getStackHealth(healthComposeFile, healthProjectName);
      checks.push({
        name: 'docker',
        status: health.healthy ? 'ok' : 'fail',
        detail: health.healthy ? 'all services running' : (health.remedy ?? 'services down'),
      });
    }
  } else {
    checks.push({ name: 'docker', status: 'fail', detail: 'cannot check (no state)' });
  }

  // 3. Beads availability
  try {
    if (isBeadsInitialized()) {
      listIssues();
      checks.push({ name: 'beads', status: 'ok', detail: 'available' });
    } else {
      checks.push({ name: 'beads', status: 'fail', detail: 'not initialized' });
    }
  } catch {
    checks.push({ name: 'beads', status: 'fail', detail: 'bd command failed' });
  }

  const allPassed = checks.every(c => c.status === 'ok');

  if (isJson) {
    const checksObj: Record<string, { status: string; detail: string }> = {};
    for (const c of checks) {
      checksObj[c.name] = { status: c.status, detail: c.detail };
    }
    jsonOutput({ status: allPassed ? 'ok' : 'fail', checks: checksObj });
  } else {
    for (const c of checks) {
      const prefix = c.status === 'ok' ? '[OK]' : '[FAIL]';
      const label = c.name.replace(/_/g, ' ');
      console.log(`${prefix} ${label[0].toUpperCase() + label.slice(1)}: ${c.detail}`);
    }
  }

  process.exitCode = allPassed ? 0 : 1;
}

// ─── Docker Check (existing) ────────────────────────────────────────────────

async function handleDockerCheck(isJson: boolean): Promise<void> {
  let state: HarnessState | null = null;
  try {
    state = readState();
  } catch {
    // No state file or corrupted
  }

  const mode = state?.otlp?.mode ?? 'local-shared';

  if (mode === 'remote-direct') {
    const endpoint = state?.otlp?.endpoint ?? '';
    const result = await checkRemoteEndpoint(endpoint);
    if (isJson) {
      jsonOutput({
        status: result.reachable ? 'ok' : 'fail',
        mode: 'remote-direct',
        endpoint,
        reachable: result.reachable,
        ...(result.error ? { error: result.error } : {}),
      });
    } else {
      if (result.reachable) {
        ok(`Remote OTLP endpoint: reachable (${endpoint})`);
      } else {
        fail(`Remote OTLP endpoint: unreachable (${endpoint})`);
        if (result.error) {
          info(`Error: ${result.error}`);
        }
      }
    }
    return;
  }

  if (mode === 'remote-routed') {
    const sharedComposeFile = getComposeFilePath();
    const health = getCollectorHealth(sharedComposeFile);

    if (isJson) {
      jsonOutput({
        status: health.healthy ? 'ok' : 'fail',
        mode: 'remote-routed',
        docker: {
          healthy: health.healthy,
          services: health.services,
          remedy: health.remedy,
        },
        remote_endpoints: state?.docker?.remote_endpoints,
      });
    } else {
      if (health.healthy) {
        ok('OTel Collector: running');
      } else {
        fail('OTel Collector: not running');
        if (health.remedy) {
          info(`-> ${health.remedy}`);
        }
      }
      const re = state?.docker?.remote_endpoints;
      if (re) {
        info(`Remote backends: logs=${re.logs_url} metrics=${re.metrics_url} traces=${re.traces_url}`);
      }
    }
    return;
  }

  // local-shared mode (default)
  let composeFile = 'docker-compose.harness.yml';
  let projectName: string | undefined;

  if (state?.docker?.compose_file) {
    composeFile = state.docker.compose_file;
  }

  const stackDir = getStackDir();
  if (composeFile.startsWith(stackDir)) {
    composeFile = getComposeFilePath();
    projectName = 'codeharness-shared';
  }

  const health = getStackHealth(composeFile, projectName);

  if (isJson) {
    jsonOutput({
      status: health.healthy ? 'ok' : 'fail',
      docker: {
        healthy: health.healthy,
        services: health.services,
        remedy: health.remedy,
      },
      ...(health.healthy ? { endpoints: DEFAULT_ENDPOINTS } : {}),
    });
    return;
  }

  if (health.healthy) {
    ok('VictoriaMetrics stack: running');
    info(`Endpoints: logs=${DEFAULT_ENDPOINTS.logs} metrics=${DEFAULT_ENDPOINTS.metrics} traces=${DEFAULT_ENDPOINTS.traces}`);
  } else {
    fail('VictoriaMetrics stack: not running');
    for (const svc of health.services) {
      if (!svc.running) {
        info(`  ${svc.name}: down`);
      }
    }
    if (health.remedy) {
      info(`-> ${health.remedy}`);
    }
  }
}

// ─── Beads Helpers ──────────────────────────────────────────────────────────

function printBeadsSummary(): void {
  if (!isBeadsInitialized()) {
    console.log('Beads: not initialized');
    return;
  }

  try {
    const issues = listIssues();
    const byType = new Map<string, number>();
    const byStatus = new Map<string, number>();

    for (const issue of issues) {
      byType.set(issue.type, (byType.get(issue.type) ?? 0) + 1);
      byStatus.set(issue.status, (byStatus.get(issue.status) ?? 0) + 1);
    }

    const typeParts = Array.from(byType.entries())
      .map(([t, n]) => `${t}:${n}`)
      .join(' ');
    const ready = byStatus.get('ready') ?? 0;
    const inProgress = byStatus.get('in_progress') ?? 0;
    const done = byStatus.get('done') ?? 0;

    const typeInfo = typeParts ? ` (${typeParts})` : '';
    console.log(
      `Beads: ${issues.length} issues${typeInfo} | ready:${ready} in-progress:${inProgress} done:${done}`,
    );
  } catch {
    console.log('Beads: unavailable (bd command failed)');
  }
}

function printOnboardingProgress(): void {
  const progress = getOnboardingProgress({ listIssues });
  if (progress) {
    console.log(`Onboarding: ${progress.resolved}/${progress.total} gaps resolved (${progress.remaining} remaining)`);
  }
}

function getOnboardingProgressData(): Record<string, unknown> | null {
  const progress = getOnboardingProgress({ listIssues });
  if (!progress) {
    return null;
  }
  return {
    total: progress.total,
    resolved: progress.resolved,
    remaining: progress.remaining,
  };
}

function getBeadsData(): Record<string, unknown> {
  if (!isBeadsInitialized()) {
    return { initialized: false };
  }

  try {
    const issues = listIssues();
    const issuesByType: Record<string, number> = {};
    const issuesByStatus: Record<string, number> = {};

    for (const issue of issues) {
      issuesByType[issue.type] = (issuesByType[issue.type] ?? 0) + 1;
      issuesByStatus[issue.status] = (issuesByStatus[issue.status] ?? 0) + 1;
    }

    return {
      initialized: true,
      total: issues.length,
      issues_by_type: issuesByType,
      issues_by_status: issuesByStatus,
    };
  } catch {
    return { initialized: true, error: 'bd command failed' };
  }
}
