/**
 * Status formatters — human-readable and JSON formatting for status output.
 * Handles the full status display, docker check, and health check formatting.
 */

import { ok, fail, info, jsonOutput } from '../../lib/output.js';
import { readState, StateFileNotFoundError } from '../../lib/state.js';
import { getStackHealth, getCollectorHealth, checkRemoteEndpoint } from '../../lib/docker/index.js';
import { getOnboardingProgress } from '../../lib/onboard-checks.js';
import { getStackDir, getComposeFilePath, getElkComposeFilePath } from '../../lib/stack-path.js';
import { generateReport } from '../sprint/index.js';
import { getValidationProgress } from '../verify/index.js';
import { readWorkflowState } from '../../lib/workflow-state.js';
import { buildScopedEndpoints, resolveEndpoints, getDefaultEndpointsForBackend } from './endpoints.js';
import type { HarnessState } from '../../lib/state.js';
import type { StatusReport } from '../sprint/index.js';

/** Resolve the shared compose file path based on the backend type. */
function resolveSharedCompose(backend: string): string {
  return backend === 'elk' ? getElkComposeFilePath() : getComposeFilePath();
}

// ─── Full Status Display ────────────────────────────────────────────────────

export function handleFullStatus(isJson: boolean): void {
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

  // Workflow engine state
  printWorkflowState();

  // Sprint state sections (Project State, Run, Action Items)
  printSprintState();

  // Validation progress (if validation stories exist)
  printValidationProgress();

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

  // Docker (always shown — observability is mandatory unless backend is 'none')
  {
    const backend = state.otlp?.backend ?? 'victoria';
    const mode = state.otlp?.mode ?? 'local-shared';

    if (backend === 'none') {
      console.log('Docker: disabled (observability off)');
    } else if (mode === 'remote-direct') {
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

      const resolvedComposeFile = isShared ? resolveSharedCompose(backend) : composeFile;
      const projectName = isShared ? 'codeharness-shared' : undefined;
      const header = isShared ? 'Docker: shared stack at ~/.codeharness/stack/' : 'Docker:';

      console.log(header);
      const health = getStackHealth(resolvedComposeFile, projectName);
      for (const svc of health.services) {
        console.log(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
      }
      if (health.healthy) {
        const ep = getDefaultEndpointsForBackend(backend);
        console.log(
          `  Endpoints: logs=${ep.logs} metrics=${ep.metrics} traces=${ep.traces}`,
        );
      }
    }
  }

  // Service-scoped endpoints
  const serviceName = state.otlp?.service_name;
  if (serviceName) {
    const endpoints = resolveEndpoints(state);
    const scoped = buildScopedEndpoints(endpoints, serviceName, state.otlp?.backend);
    console.log(`  Scoped: logs=${scoped.logs} metrics=${scoped.metrics} traces=${scoped.traces}`);
  }

  // Beads — removed (Epic 8 replacement pending)

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

function handleFullStatusJson(state: HarnessState): void {
  // Docker (always present — observability is mandatory unless backend is 'none')
  let docker: Record<string, unknown>;
  {
    const backend = state.otlp?.backend ?? 'victoria';
    const mode = state.otlp?.mode ?? 'local-shared';

    if (backend === 'none') {
      docker = { mode: 'none', message: 'Observability disabled' };
    } else if (mode === 'remote-direct') {
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

      const ep = getDefaultEndpointsForBackend(backend);
      if (isShared) {
        const sharedComposeFile = resolveSharedCompose(backend);
        const health = getStackHealth(sharedComposeFile, 'codeharness-shared');
        docker = {
          shared: true,
          stack_dir: '~/.codeharness/stack/',
          healthy: health.healthy,
          services: health.services,
          ...(health.healthy ? { endpoints: ep } : {}),
        };
      } else {
        const health = getStackHealth(composeFile);
        docker = {
          healthy: health.healthy,
          services: health.services,
          ...(health.healthy ? { endpoints: ep } : {}),
        };
      }
    }
  }

  // Resolved endpoints
  const endpoints = resolveEndpoints(state);

  // Scoped endpoints
  const serviceName = state.otlp?.service_name;
  const scoped_endpoints = serviceName ? buildScopedEndpoints(endpoints, serviceName, state.otlp?.backend) : undefined;

  // Onboarding progress
  const onboarding = getOnboardingProgressData();

  // Sprint state
  const sprint = getSprintReportData();

  // Validation progress
  const validationResult = getValidationProgress();
  const validation = validationResult.success && validationResult.data.total > 0
    ? validationResult.data : undefined;

  // Workflow engine state
  const workflowState = getWorkflowStateData();

  jsonOutput({
    version: state.harness_version,
    stack: state.stack,
    ...(state.app_type ? { app_type: state.app_type } : {}),
    ...(sprint ? { sprint } : {}),
    ...(validation ? { validation } : {}),
    ...(workflowState ? { workflow: workflowState } : {}),
    enforcement: state.enforcement,
    docker,
    endpoints,
    ...(scoped_endpoints ? { scoped_endpoints } : {}),
    ...(onboarding ? { onboarding } : {}),
    session_flags: state.session_flags,
    coverage: state.coverage,
    verification_log: state.verification_log,
  });
}

// ─── Health Check Mode ──────────────────────────────────────────────────────

export async function handleHealthCheck(isJson: boolean): Promise<void> {
  const checks: { name: string; status: 'ok' | 'fail'; detail: string }[] = [];

  // 1. State file integrity
  let state: HarnessState | null = null;
  try {
    state = readState();
    checks.push({ name: 'state_file', status: 'ok', detail: 'valid' });
  } catch {
    // IGNORE: state file may not exist
    checks.push({ name: 'state_file', status: 'fail', detail: 'not found' });
  }

  // 2. Docker health (always checked — observability is mandatory unless backend is 'none')
  if (state) {
    const backend = state.otlp?.backend ?? 'victoria';
    const mode = state.otlp?.mode ?? 'local-shared';

    if (backend === 'none') {
      checks.push({ name: 'docker', status: 'ok', detail: 'observability disabled — skipped' });
    } else if (mode === 'remote-direct') {
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
      const healthComposeFile = isShared ? resolveSharedCompose(backend) : composeFile;
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

  // 3. Issue tracker — placeholder for Epic 8
  // Beads health check removed; Epic 8 will add issue-tracker health check here.

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

// ─── Docker Check ───────────────────────────────────────────────────────────

export async function handleDockerCheck(isJson: boolean): Promise<void> {
  let state: HarnessState | null = null;
  try {
    state = readState();
  } catch {
    // IGNORE: state file may not exist or be corrupted
  }

  const backend = state?.otlp?.backend ?? 'victoria';

  if (backend === 'none') {
    if (isJson) {
      jsonOutput({ status: 'ok', mode: 'none', message: 'Observability disabled — no Docker check needed' });
    } else {
      info('[INFO] Observability disabled — no Docker check needed');
    }
    return;
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
    composeFile = resolveSharedCompose(backend);
    projectName = 'codeharness-shared';
  }

  const health = getStackHealth(composeFile, projectName);

  if (isJson) {
    jsonOutput({
      status: health.healthy ? 'ok' : 'fail',
      backend,
      ...(projectName ? { project_name: projectName } : {}),
      docker: {
        healthy: health.healthy,
        services: health.services,
        remedy: health.remedy,
      },
      ...(health.healthy ? { endpoints: getDefaultEndpointsForBackend(backend) } : {}),
    });
    return;
  }

  const stackLabel = backend === 'elk' ? 'OpenSearch/ELK stack' : 'VictoriaMetrics stack';
  const ep = getDefaultEndpointsForBackend(backend);

  if (health.healthy) {
    ok(`${stackLabel}: running${projectName ? ` (project: ${projectName})` : ''}`);
    for (const svc of health.services) {
      info(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
    }
    info(`Endpoints: logs=${ep.logs} metrics=${ep.metrics} traces=${ep.traces}`);
  } else {
    fail(`${stackLabel}: not running${projectName ? ` (project: ${projectName})` : ''}`);
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

// ─── Workflow State Helpers ──────────────────────────────────────────────────

/**
 * Format elapsed milliseconds as human-readable duration.
 */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

function printWorkflowState(): void {
  const state = readWorkflowState();

  if (state.phase === 'idle' && state.started === '') {
    console.log('Workflow Engine: No active workflow run');
    return;
  }

  console.log('── Workflow Engine ──────────────────────────────────────────────');
  console.log(`  Phase: ${state.phase}`);
  console.log(`  Iteration: ${state.iteration}`);
  console.log(`  Tasks completed: ${state.tasks_completed.length}`);
  const workflowErrors = getWorkflowErrors(state);
  console.log(`  Workflow errors: ${workflowErrors.length}`);

  if (state.phase === 'executing' && state.started) {
    const elapsed = Date.now() - Date.parse(state.started);
    console.log(`  Elapsed: ${formatElapsed(elapsed)}`);
  }

  if (state.evaluator_scores.length > 0) {
    const latest = state.evaluator_scores[state.evaluator_scores.length - 1];
    console.log(`  Evaluator: ${latest.passed}/${latest.total} passed, ${latest.failed} failed, ${latest.unknown} unknown`);
  }

  console.log(`  Circuit breaker: ${state.circuit_breaker.triggered ? 'TRIGGERED' : 'no'}${state.circuit_breaker.triggered && state.circuit_breaker.reason ? ` — ${state.circuit_breaker.reason}` : ''}`);
  if (workflowErrors.length > 0) {
    console.log('  Errors:');
    for (const err of workflowErrors) {
      console.log(`    ${err.taskName}/${err.storyKey} [${err.code}]${err.message ? ` ${err.message}` : ''}`);
    }
  }
  console.log('');
}

function getWorkflowStateData(): Record<string, unknown> | null {
  const state = readWorkflowState();

  if (state.phase === 'idle' && state.started === '') {
    return null;
  }

  const data: Record<string, unknown> = {
    workflow_name: state.workflow_name,
    phase: state.phase,
    iteration: state.iteration,
    started: state.started,
    tasks_completed: state.tasks_completed.length,
    errors: getWorkflowErrors(state),
    evaluator_scores: state.evaluator_scores,
    circuit_breaker: state.circuit_breaker,
  };

  if (state.phase === 'executing' && state.started) {
    data.elapsed_ms = Date.now() - Date.parse(state.started);
    data.elapsed = formatElapsed(data.elapsed_ms as number);
  }

  return data;
}

function getWorkflowErrors(state: ReturnType<typeof readWorkflowState>): Array<{
  taskName: string;
  storyKey: string;
  code: string;
  message: string | null;
}> {
  return state.tasks_completed
    .filter((checkpoint) => checkpoint.error)
    .map((checkpoint) => ({
      taskName: checkpoint.task_name,
      storyKey: checkpoint.story_key,
      code: checkpoint.error_code ?? 'UNKNOWN',
      message: checkpoint.error_message ?? null,
    }));
}

// ─── Sprint State Helpers ────────────────────────────────────────────────────

function printSprintState(): void {
  const reportResult = generateReport();
  if (!reportResult.success) {
    console.log('Sprint state: unavailable');
    return;
  }

  const r = reportResult.data;
  console.log(`\u2500\u2500 Project State \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`Sprint: ${r.done}/${r.total} done (${r.sprintPercent}%) | ${r.epicsDone}/${r.epicsTotal} epics complete`);

  if (r.activeRun) {
    console.log('');
    console.log(`\u2500\u2500 Active Run \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    const currentStory = r.inProgress ?? 'none';
    console.log(`Status: running (iteration ${r.activeRun.iterations}, ${r.activeRun.duration} elapsed)`);
    console.log(`Current: ${currentStory}`);
    console.log(`Budget: $${r.activeRun.cost.toFixed(2)} spent`);
  } else if (r.lastRun) {
    console.log('');
    console.log(`\u2500\u2500 Last Run Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    console.log(`Duration: ${r.lastRun.duration} | Cost: $${r.lastRun.cost.toFixed(2)} | Iterations: ${r.lastRun.iterations}`);
    console.log(`Completed:  ${r.lastRun.completed.length} stories${r.lastRun.completed.length > 0 ? ` (${r.lastRun.completed.join(', ')})` : ''}`);
    if (r.failedDetails.length > 0) {
      console.log(`Failed:     ${r.failedDetails.length} stor${r.failedDetails.length === 1 ? 'y' : 'ies'}`);
      for (const fd of r.failedDetails) {
        const acPart = fd.acNumber !== null ? `AC ${fd.acNumber}` : 'unknown AC';
        console.log(`  \u2514 ${fd.key}: ${acPart} \u2014 ${fd.errorLine} (attempt ${fd.attempts}/${fd.maxAttempts})`);
      }
    }
    if (r.lastRun.blocked.length > 0) {
      console.log(`Blocked:    ${r.lastRun.blocked.length} stories (retry-exhausted)`);
    }
  }

  if (r.actionItemsLabeled.length > 0) {
    console.log('');
    console.log(`\u2500\u2500 Action Items \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    for (const la of r.actionItemsLabeled) {
      console.log(`  [${la.label}] ${la.item.story}: ${la.item.description}`);
    }
  }

  console.log('');
}

function printValidationProgress(): void {
  const result = getValidationProgress();
  if (!result.success) return;
  const p = result.data;
  if (p.total === 0) return;
  console.log(`Validation: ${p.passed}/${p.total} passed, ${p.failed} failed, ${p.blocked} blocked, ${p.remaining} remaining`);
}

function getSprintReportData(): StatusReport | null {
  const reportResult = generateReport();
  if (!reportResult.success) return null;
  return reportResult.data;
}

// ─── Beads Helpers (removed — Epic 8 replacement pending) ──────────────────

function printOnboardingProgress(): void {
  const progress = getOnboardingProgress();
  if (progress) {
    console.log(`Onboarding: ${progress.resolved}/${progress.total} gaps resolved (${progress.remaining} remaining)`);
  }
}

function getOnboardingProgressData(): Record<string, unknown> | null {
  const progress = getOnboardingProgress();
  if (!progress) {
    return null;
  }
  return {
    total: progress.total,
    resolved: progress.resolved,
    remaining: progress.remaining,
  };
}

// TODO: v2 issue tracker (Epic 8) — beads data removed, will be replaced by issue tracker
