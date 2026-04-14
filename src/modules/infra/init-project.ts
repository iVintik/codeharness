/**
 * Project initialization orchestrator.
 * Composes sub-steps: stack detection, deps, Docker, BMAD, beads, state, docs, OTLP.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ok as okOutput, fail as failOutput, info, warn, jsonOutput } from '../../lib/output.js';
import { detectStacks, detectAppType } from '../../lib/stacks/index.js';
import { readState, writeState, getDefaultState, getStatePath } from '../../lib/state.js';
import type { HarnessState } from '../../lib/state.js';
import { instrumentProject } from '../../lib/observability/index.js';
import type { Result } from '../../types/result.js';
import { ok, fail, isOk } from '../../types/result.js';
import type { InitOptions, InitResult } from './types.js';
import { checkDocker, setupDocker } from './docker-setup.js';
import { installDeps, verifyDeps } from './deps-install.js';
import { setupBmad, verifyBmadOnRerun } from './bmad-setup.js';
import { scaffoldDocs, getCoverageTool, getStackLabel } from './docs-scaffold.js';
import { generateDockerfileTemplate } from './dockerfile-template.js';
import { getPackageRoot } from '../../lib/templates.js';

declare const __PKG_VERSION__: string;
const HARNESS_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0-dev';

/** Helper: build a fail-status InitResult for early returns */
function failResult(opts: InitOptions, error: string): InitResult {
  return {
    status: 'fail', stack: null, stacks: [], error,
    enforcement: { frontend: opts.frontend, database: opts.database, api: opts.api },
    documentation: { agents_md: 'skipped', claude_md: 'skipped', docs_scaffold: 'skipped' },
  };
}

/** Default next-step recommendations surfaced to the user after a successful init. */
function defaultNextSteps(): InitResult['next_steps'] {
  return [
    {
      id: 'harness-docs',
      description: 'Populate docs/ and write README.md from the actual codebase (codeharness wraps BMAD tech-writer)',
      command: '/codeharness:harness-docs',
    },
    {
      id: 'harness-run',
      description: 'Start autonomous execution',
      command: '/codeharness:harness-run',
    },
  ];
}

/** Emit the Next Steps block to stdout in human mode. No-op in json mode. */
function emitNextSteps(result: InitResult, isJson: boolean): void {
  if (isJson) return;
  const steps = result.next_steps ?? [];
  if (steps.length === 0) return;
  info('');
  info('Next steps:');
  for (const step of steps) {
    info(`  → ${step.command}  — ${step.description}`);
  }
  info('');
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
  const agentRuntime = opts.agentRuntime ?? 'claude-code';
  const result: InitResult = {
    status: 'ok', stack: null, stacks: [],
    enforcement: { frontend: opts.frontend, database: opts.database, api: opts.api },
    documentation: { agents_md: 'skipped', claude_md: 'skipped', docs_scaffold: 'skipped' },
  };

  // --- Idempotent re-run check ---
  const rerunResult = await handleRerun(opts, result);
  if (rerunResult !== null) return rerunResult;

  // --- Observability backend validation ---
  const validBackends = ['victoria', 'elk', 'none'] as const;
  if (opts.observabilityBackend !== undefined && !validBackends.includes(opts.observabilityBackend)) {
    const msg = `Invalid --observability-backend '${opts.observabilityBackend}'. Must be one of: ${validBackends.join(', ')}`;
    emitError(msg, isJson); return ok(failResult(opts, msg));
  }

  // --- Remote endpoint URL validation ---
  const urlError = validateRemoteUrls(opts);
  if (urlError !== null) { emitError(urlError, isJson); return ok(failResult(opts, urlError)); }

  // --- Stack detection ---
  // Call detectStacks() once; derive primary root stack from it to avoid double filesystem scan
  const allStacks = detectStacks(projectDir);
  const rootDetection = allStacks.find(s => s.dir === '.');
  const stack = rootDetection ? rootDetection.stack : null;
  if (!stack && !isJson) warn('No recognized stack detected');
  result.stack = stack;
  result.stacks = [...new Set(allStacks.map(s => s.stack))];
  const appType = detectAppType(projectDir, stack);
  result.app_type = appType;
  if (!isJson) {
    if (result.stacks.length > 0) {
      info(`Stack detected: ${getStackLabel(result.stacks)}`);
    } else if (stack) {
      info(`Stack detected: ${getStackLabel(stack)}`);
    }
    info(`App type: ${appType}`);
  }

  // --- Workflow generation ---
  const workflowSrc = join(getPackageRoot(), 'templates/workflows/default.yaml');
  const workflowDest = join(projectDir, '.codeharness/workflows/default.yaml');
  const workflowRelPath = '.codeharness/workflows/default.yaml';
  if (existsSync(workflowDest) && !opts.force) {
    result.workflow = { status: 'exists', path: workflowRelPath };
    if (!isJson) info(`Workflow: ${workflowRelPath} already exists`);
  } else {
    const overwriting = existsSync(workflowDest);
    mkdirSync(dirname(workflowDest), { recursive: true });
    copyFileSync(workflowSrc, workflowDest);
    result.workflow = { status: overwriting ? 'overwritten' : 'created', path: workflowRelPath };
    if (!isJson) okOutput(`Workflow: ${workflowRelPath} ${overwriting ? 'overwritten' : 'created'}`);
  }

  // --- Dockerfile template generation ---
  const dfResult = generateDockerfileTemplate(projectDir, allStacks);
  if (isOk(dfResult)) {
    result.dockerfile = { generated: true, stack: dfResult.data.stack, stacks: dfResult.data.stacks };
    if (!isJson) info(`Generated Dockerfile for ${dfResult.data.stacks.join('+') || dfResult.data.stack} project.`);
  } else {
    if (!isJson) info('Dockerfile already exists -- skipping template generation.');
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
  const depResult = installDeps({ isJson, stacks: result.stacks });
  if (!isOk(depResult)) {
    result.status = 'fail'; result.error = depResult.error;
    if (isJson) { jsonOutput(result as unknown as Record<string, unknown>); } else { info('Critical dependency failed — aborting init'); }
    process.exitCode = 1;
    return ok(result);
  }
  result.dependencies = depResult.data;

  // --- Beads initialization — removed (Epic 8 replacement pending) ---
  // TODO: v2 issue tracker (Epic 8)
  result.beads = { status: 'skipped' as const, message: 'beads removed' };

  // --- BMAD installation ---
  const bmadResult = setupBmad({ projectDir, isJson, agentRuntime });
  if (isOk(bmadResult)) result.bmad = bmadResult.data;

  // --- State file creation ---
  const state: HarnessState = getDefaultState(stack);
  state.harness_version = HARNESS_VERSION;
  state.initialized = true;
  state.app_type = appType;
  state.enforcement = { frontend: opts.frontend, database: opts.database, api: opts.api };
  // Per-stack coverage detection: build tools map keyed by stack name, primary stack's tool for backward compat
  const coverageTools: Record<string, string> = {};
  for (const detection of allStacks) {
    coverageTools[detection.stack] = getCoverageTool(detection.stack);
  }
  state.coverage.tool = getCoverageTool(stack);
  state.coverage.tools = coverageTools;
  // Persist all detected stacks (not just the primary root stack)
  state.stacks = result.stacks as import('../../lib/stacks/index.js').StackName[];
  writeState(state, projectDir);
  if (!isJson) okOutput('State file: .claude/codeharness.local.md created');

  // --- Documentation scaffold ---
  const docsResult = await scaffoldDocs({ projectDir, stack, stacks: allStacks, isJson });
  if (isOk(docsResult)) result.documentation = docsResult.data;

  // --- Store observability backend choice ---
  const obsBackend = opts.observabilityBackend ?? 'victoria';
  if (obsBackend === 'none') {
    // 'none' backend: disable OTLP and skip Docker, similar to --no-observability but persisted
    state.otlp = { enabled: false, endpoint: '', service_name: basename(projectDir), mode: 'local-shared', backend: 'none' };
    writeState(state, projectDir);
    result.otlp = { status: 'skipped', packages_installed: false, start_script_patched: false, env_vars_configured: false };
    if (!isJson) info('Observability: disabled (--observability-backend none)');
    // Skip enforcement summary for 'none' — jump to end
    result.next_steps = defaultNextSteps();
    if (!isJson) {
      const e = state.enforcement;
      const fmt = (v: boolean): string => v ? 'ON' : 'OFF';
      okOutput(`Enforcement: frontend:${fmt(e.frontend)} database:${fmt(e.database)} api:${fmt(e.api)} observability:OFF`);
      info('Harness initialized. Run: codeharness bridge --epics <path>');
      emitNextSteps(result, isJson);
    }
    if (isJson) jsonOutput(result as unknown as Record<string, unknown>);
    return ok(result);
  }

  // --- OTLP instrumentation ---
  if (!opts.observability) {
    result.otlp = { status: 'skipped', packages_installed: false, start_script_patched: false, env_vars_configured: false };
    if (!isJson) info('OTLP: skipped (--no-observability)');
  } else {
    // Per-stack OTLP instrumentation: instrument each detected stack in its directory
    for (const detection of allStacks) {
      const stackDir = detection.dir === '.' ? projectDir : join(projectDir, detection.dir);
      const stackOtlp = instrumentProject(stackDir, detection.stack, { json: isJson, appType });
      // Primary (root) stack's result goes to result.otlp for backward compat
      if (detection.dir === '.' && detection.stack === stack) {
        result.otlp = stackOtlp;
      }
    }
    // Fallback: if primary stack wasn't in allStacks (shouldn't happen), use single-stack call
    if (!result.otlp) {
      result.otlp = instrumentProject(projectDir, stack, { json: isJson, appType });
    }
  }

  // Re-read state to pick up otlp changes written by instrumentProject
  try { const u = readState(projectDir); if (u.otlp) state.otlp = u.otlp; } catch { /* IGNORE: state re-read may fail during init */ }
  if (!state.otlp) {
    state.otlp = { enabled: true, endpoint: 'http://localhost:4318', service_name: basename(projectDir), mode: 'local-shared' };
  }
  state.otlp.backend = obsBackend;
  writeState(state, projectDir);

  // --- Docker stack setup ---
  const dockerSetup = setupDocker({
    observability: opts.observability, otelEndpoint: opts.otelEndpoint,
    opensearchUrl: opts.opensearchUrl,
    logsUrl: opts.logsUrl, metricsUrl: opts.metricsUrl, tracesUrl: opts.tracesUrl,
    isJson, dockerAvailable, appType, state, projectDir,
  });
  if (isOk(dockerSetup)) result.docker = dockerSetup.data.docker;

  // --- Enforcement summary + next steps ---
  result.next_steps = defaultNextSteps();
  if (!isJson) {
    const e = state.enforcement;
    const fmt = (v: boolean): string => v ? 'ON' : 'OFF';
    okOutput(`Enforcement: frontend:${fmt(e.frontend)} database:${fmt(e.database)} api:${fmt(e.api)} observability:ON`);
    info('Harness initialized. Run: codeharness bridge --epics <path>');
    emitNextSteps(result, isJson);
  }
  if (isJson) jsonOutput(result as unknown as Record<string, unknown>);

  return ok(result);
}

async function handleRerun(opts: InitOptions, result: InitResult): Promise<Result<InitResult> | null> {
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
    result.stacks = existingState.stacks ?? [];
    result.enforcement = existingState.enforcement;
    // Run docs scaffold — it's non-destructive and self-healing:
    // creates missing docs/index.md, missing AGENTS.md / CLAUDE.md, and appends
    // the docs-index reference block when absent. Existing content is preserved.
    const primaryStack = existingState.stack ?? null;
    const rerunDocsResult = await scaffoldDocs({ projectDir, stack: primaryStack, isJson });
    if (isOk(rerunDocsResult)) {
      result.documentation = rerunDocsResult.data;
    } else {
      result.documentation = { agents_md: 'unchanged', claude_md: 'unchanged', docs_scaffold: 'exists' };
    }
    // Check workflow file status on re-run (respect --force)
    const workflowRelPath = '.codeharness/workflows/default.yaml';
    const workflowPath = join(projectDir, workflowRelPath);
    if (existsSync(workflowPath) && !opts.force) {
      result.workflow = { status: 'exists', path: workflowRelPath };
    } else if (existsSync(workflowPath) && opts.force) {
      const workflowSrc = join(getPackageRoot(), 'templates/workflows/default.yaml');
      mkdirSync(dirname(workflowPath), { recursive: true });
      copyFileSync(workflowSrc, workflowPath);
      result.workflow = { status: 'overwritten', path: workflowRelPath };
      if (!isJson) okOutput(`Workflow: ${workflowRelPath} overwritten`);
    } else {
      // Workflow file missing on re-run — create it
      const workflowSrc = join(getPackageRoot(), 'templates/workflows/default.yaml');
      mkdirSync(dirname(workflowPath), { recursive: true });
      copyFileSync(workflowSrc, workflowPath);
      result.workflow = { status: 'created', path: workflowRelPath };
      if (!isJson) okOutput(`Workflow: ${workflowRelPath} created`);
    }
    result.dependencies = verifyDeps(isJson, result.stacks);
    result.docker = existingState.docker
      ? { compose_file: existingState.docker.compose_file, stack_running: existingState.docker.stack_running, services: [], ports: existingState.docker.ports }
      : null;
    const bmadResult = verifyBmadOnRerun(projectDir, isJson);
    if (bmadResult) result.bmad = bmadResult;
    result.next_steps = defaultNextSteps();
    if (isJson) {
      jsonOutput(result as unknown as Record<string, unknown>);
    } else {
      info('Harness already initialized — verifying configuration');
      okOutput('Configuration verified');
      emitNextSteps(result, isJson);
    }
    return ok(result);
  } catch {
    // IGNORE: re-init check may fail, non-fatal
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
