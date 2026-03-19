/**
 * Project initialization orchestrator.
 * Composes sub-steps: stack detection, deps, Docker, BMAD, beads, state, docs, OTLP.
 */

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { ok as okOutput, fail as failOutput, info, jsonOutput } from '../../lib/output.js';
import { detectStack, detectAppType } from '../../lib/stack-detect.js';
import { readState, writeState, getDefaultState, getStatePath } from '../../lib/state.js';
import type { HarnessState } from '../../lib/state.js';
import { instrumentProject } from '../../lib/otlp.js';
import type { Result } from '../../types/result.js';
import { ok, fail, isOk } from '../../types/result.js';
import type { InitOptions, InitResult } from './types.js';
import { checkDocker, setupDocker } from './docker-setup.js';
import { installDeps, verifyDeps } from './deps-install.js';
import { setupBmad, verifyBmadOnRerun } from './bmad-setup.js';
import { initializeBeads } from './beads-init.js';
import { scaffoldDocs, getCoverageTool, getStackLabel } from './docs-scaffold.js';

declare const __PKG_VERSION__: string;
const HARNESS_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0-dev';

/** Helper: build a fail-status InitResult for early returns */
function failResult(opts: InitOptions, error: string): InitResult {
  return {
    status: 'fail', stack: null, error,
    enforcement: { frontend: opts.frontend, database: opts.database, api: opts.api },
    documentation: { agents_md: 'skipped', docs_scaffold: 'skipped', readme: 'skipped' },
  };
}

/** Output error and set exit code for validation/critical failures */
function emitError(error: string, isJson: boolean): void {
  if (isJson) { jsonOutput({ status: 'fail', error }); } else { failOutput(error); }
  process.exitCode = 1;
}

/** Main project initialization orchestrator. Never throws — returns fail() on unexpected errors. */
export async function initProject(opts: InitOptions): Promise<Result<InitResult>> {
  try {
    return await initProjectInner(opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Unexpected init error: ${message}`);
  }
}

async function initProjectInner(opts: InitOptions): Promise<Result<InitResult>> {
  const { projectDir, json: isJson = false } = opts;
  const result: InitResult = {
    status: 'ok', stack: null,
    enforcement: { frontend: opts.frontend, database: opts.database, api: opts.api },
    documentation: { agents_md: 'skipped', docs_scaffold: 'skipped', readme: 'skipped' },
  };

  // --- Idempotent re-run check ---
  const rerunResult = handleRerun(opts, result);
  if (rerunResult !== null) return rerunResult;

  // --- Remote endpoint URL validation ---
  const urlError = validateRemoteUrls(opts);
  if (urlError !== null) { emitError(urlError, isJson); return ok(failResult(opts, urlError)); }

  // --- Stack detection ---
  const stack = detectStack(projectDir);
  result.stack = stack;
  const appType = detectAppType(projectDir, stack);
  result.app_type = appType;
  if (!isJson) {
    if (stack) info(`Stack detected: ${getStackLabel(stack)}`);
    info(`App type: ${appType}`);
  }

  // --- Docker check ---
  const dockerCheck = checkDocker({ observability: opts.observability, otelEndpoint: opts.otelEndpoint, logsUrl: opts.logsUrl, opensearchUrl: opts.opensearchUrl, isJson });
  if (!isOk(dockerCheck)) return fail(dockerCheck.error);
  const { available: dockerAvailable, criticalFailure, dockerResult: criticalDockerResult } = dockerCheck.data;
  if (criticalFailure) {
    result.status = 'fail'; result.error = 'Docker not installed'; result.docker = criticalDockerResult;
    if (isJson) { jsonOutput(result as unknown as Record<string, unknown>); }
    else { failOutput('Docker not installed'); info('\u2192 Install Docker: https://docs.docker.com/engine/install/'); info('\u2192 Or skip observability: codeharness init --no-observability'); }
    process.exitCode = 1;
    return ok(result);
  }

  // --- Dependency install ---
  const depResult = installDeps({ isJson });
  if (!isOk(depResult)) {
    result.status = 'fail'; result.error = depResult.error;
    if (isJson) { jsonOutput(result as unknown as Record<string, unknown>); } else { info('Critical dependency failed — aborting init'); }
    process.exitCode = 1;
    return ok(result);
  }
  result.dependencies = depResult.data;

  // --- Beads initialization ---
  result.beads = initializeBeads(projectDir, isJson);

  // --- BMAD installation ---
  const bmadResult = setupBmad({ projectDir, isJson });
  if (isOk(bmadResult)) result.bmad = bmadResult.data;

  // --- State file creation ---
  let state: HarnessState = getDefaultState(stack);
  state.harness_version = HARNESS_VERSION;
  state.initialized = true;
  state.app_type = appType;
  state.enforcement = { frontend: opts.frontend, database: opts.database, api: opts.api };
  state.coverage.tool = getCoverageTool(stack);
  writeState(state, projectDir);
  if (!isJson) okOutput('State file: .claude/codeharness.local.md created');

  // --- Documentation scaffold ---
  const docsResult = await scaffoldDocs({ projectDir, stack, isJson });
  if (isOk(docsResult)) result.documentation = docsResult.data;

  // --- OTLP instrumentation ---
  if (!opts.observability) {
    result.otlp = { status: 'skipped', packages_installed: false, start_script_patched: false, env_vars_configured: false };
    if (!isJson) info('OTLP: skipped (--no-observability)');
  } else {
    result.otlp = instrumentProject(projectDir, stack, { json: isJson, appType });
  }

  // Re-read state to pick up otlp changes written by instrumentProject
  try { const u = readState(projectDir); if (u.otlp) state.otlp = u.otlp; } catch { /* ignore */ }
  if (!state.otlp) {
    state.otlp = { enabled: true, endpoint: 'http://localhost:4318', service_name: basename(projectDir), mode: 'local-shared' };
  }

  // --- Docker stack setup ---
  const dockerSetup = setupDocker({
    observability: opts.observability, otelEndpoint: opts.otelEndpoint,
    opensearchUrl: opts.opensearchUrl,
    logsUrl: opts.logsUrl, metricsUrl: opts.metricsUrl, tracesUrl: opts.tracesUrl,
    isJson, dockerAvailable, appType, state, projectDir,
  });
  if (isOk(dockerSetup)) result.docker = dockerSetup.data.docker;

  // --- Enforcement summary ---
  if (!isJson) {
    const e = state.enforcement;
    const fmt = (v: boolean): string => v ? 'ON' : 'OFF';
    okOutput(`Enforcement: frontend:${fmt(e.frontend)} database:${fmt(e.database)} api:${fmt(e.api)} observability:ON`);
    info('Harness initialized. Run: codeharness bridge --epics <path>');
  }
  if (isJson) jsonOutput(result as unknown as Record<string, unknown>);

  return ok(result);
}

function handleRerun(opts: InitOptions, result: InitResult): Result<InitResult> | null {
  const { projectDir, json: isJson = false } = opts;
  if (!existsSync(getStatePath(projectDir))) return null;

  try {
    const existingState = readState(projectDir);
    const legacyObsDisabled = (existingState.enforcement as Record<string, unknown>).observability === false;
    if (!existingState.initialized || legacyObsDisabled) {
      if (legacyObsDisabled && !isJson) info('Observability upgraded from disabled to enabled');
      return null;
    }
    result.stack = existingState.stack;
    result.enforcement = existingState.enforcement;
    result.documentation = { agents_md: 'exists', docs_scaffold: 'exists', readme: 'exists' };
    result.dependencies = verifyDeps(isJson);
    result.docker = existingState.docker
      ? { compose_file: existingState.docker.compose_file, stack_running: existingState.docker.stack_running, services: [], ports: existingState.docker.ports }
      : null;
    const bmadResult = verifyBmadOnRerun(projectDir, isJson);
    if (bmadResult) result.bmad = bmadResult;
    if (isJson) { jsonOutput(result as unknown as Record<string, unknown>); }
    else { info('Harness already initialized — verifying configuration'); okOutput('Configuration verified'); }
    return ok(result);
  } catch {
    return null;
  }
}

/** Returns error message string if validation fails, null if OK */
function validateRemoteUrls(opts: InitOptions): string | null {
  const remoteUrls = [opts.otelEndpoint, opts.opensearchUrl, opts.logsUrl, opts.metricsUrl, opts.tracesUrl].filter(Boolean) as string[];
  for (const url of remoteUrls) {
    if (!/^https?:\/\//i.test(url)) return `Invalid URL: '${url}' \u2014 must start with http:// or https://`;
  }
  if (opts.otelEndpoint && (opts.logsUrl || opts.metricsUrl || opts.tracesUrl)) {
    return 'Cannot combine --otel-endpoint with --logs-url/--metrics-url/--traces-url';
  }
  const hasAny = opts.logsUrl || opts.metricsUrl || opts.tracesUrl;
  if (hasAny && !(opts.logsUrl && opts.metricsUrl && opts.tracesUrl)) {
    return 'When using remote backends, all three are required: --logs-url, --metrics-url, --traces-url';
  }
  return null;
}
