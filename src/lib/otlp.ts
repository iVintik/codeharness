import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ok, info } from './output.js';
import { readState, writeState, readStateWithBody } from './state.js';
import type { HarnessState } from './state.js';
import type { AppType } from './stack-detect.js';

export interface OtlpResult {
  status: 'configured' | 'skipped' | 'failed';
  packages_installed: boolean;
  start_script_patched: boolean;
  env_vars_configured: boolean;
  error?: string;
}

const NODE_OTLP_PACKAGES = [
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/sdk-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/exporter-metrics-otlp-http',
];

const PYTHON_OTLP_PACKAGES = [
  'opentelemetry-distro',
  'opentelemetry-exporter-otlp',
];

export const WEB_OTLP_PACKAGES = [
  '@opentelemetry/sdk-trace-web',
  '@opentelemetry/instrumentation-fetch',
  '@opentelemetry/instrumentation-xml-http-request',
];

export const AGENT_OTLP_PACKAGES_NODE = ['@traceloop/node-server-sdk'];
export const AGENT_OTLP_PACKAGES_PYTHON = ['traceloop-sdk'];

export const NODE_REQUIRE_FLAG = '--require @opentelemetry/auto-instrumentations-node/register';

/** Truncate error messages from execFileSync that include full stderr output */
function truncateError(message: string, maxLength = 200): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + '... (truncated)';
}

export function installNodeOtlp(projectDir: string): OtlpResult {
  try {
    execFileSync('npm', ['install', ...NODE_OTLP_PACKAGES], { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
    return {
      status: 'configured',
      packages_installed: true,
      start_script_patched: false,
      env_vars_configured: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      status: 'failed',
      packages_installed: false,
      start_script_patched: false,
      env_vars_configured: false,
      error: `Failed to install Node.js OTLP packages: ${truncateError(message)}`,
    };
  }
}

export function patchNodeStartScript(projectDir: string): boolean {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return false;
  }

  let raw: string;
  let pkg: Record<string, unknown>;
  try {
    raw = readFileSync(pkgPath, 'utf-8');
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Malformed package.json — skip patching
    return false;
  }
  const scripts = pkg['scripts'] as Record<string, string> | undefined;

  if (!scripts) {
    return false;
  }

  const targetKey = scripts['start'] ? 'start' : scripts['dev'] ? 'dev' : null;
  if (!targetKey) {
    return false;
  }

  const instrumentedKey = `${targetKey}:instrumented`;

  // Check if already patched — the instrumented key already exists
  if (scripts[instrumentedKey]?.includes(NODE_REQUIRE_FLAG)) {
    return false;
  }
  scripts[instrumentedKey] = `NODE_OPTIONS='${NODE_REQUIRE_FLAG}' ${scripts[targetKey]}`;

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  return true;
}

export function installPythonOtlp(projectDir: string): OtlpResult {
  const installChains: { cmd: string; args: string[] }[][] = [
    // Primary: pip install both packages in one command
    [{ cmd: 'pip', args: ['install', ...PYTHON_OTLP_PACKAGES] }],
    // Fallback: pipx install each package individually (pipx only accepts one package at a time)
    PYTHON_OTLP_PACKAGES.map(pkg => ({ cmd: 'pipx', args: ['install', pkg] })),
  ];

  for (const chain of installChains) {
    try {
      for (const step of chain) {
        execFileSync(step.cmd, step.args, { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
      }
      return {
        status: 'configured',
        packages_installed: true,
        start_script_patched: false,
        env_vars_configured: false,
      };
    } catch {
      continue;
    }
  }

  return {
    status: 'failed',
    packages_installed: false,
    start_script_patched: false,
    env_vars_configured: false,
    error: 'Failed to install Python OTLP packages',
  };
}

export function configureCli(projectDir: string): void {
  const { state, body } = readStateWithBody(projectDir);

  if (!state.otlp) return;

  state.otlp.cli_env_vars = {
    OTEL_BSP_SCHEDULE_DELAY: '100',
    OTEL_TRACES_SAMPLER: 'always_on',
    OTEL_BLRP_SCHEDULE_DELAY: '100',
  };

  writeState(state, projectDir, body);
}

export function configureWeb(projectDir: string, stack: string | null): void {
  if (stack === 'nodejs') {
    try {
      execFileSync('npm', ['install', ...WEB_OTLP_PACKAGES], { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
    } catch {
      // Web packages are supplementary; failure is non-fatal
    }
  }

  // Read endpoint from state (may have been set by configureOtlpEnvVars)
  let endpoint = 'http://localhost:4318';
  try {
    const currentState = readState(projectDir);
    if (currentState.otlp?.endpoint) {
      endpoint = currentState.otlp.endpoint;
    }
  } catch {
    // State not readable — use default endpoint
  }

  // Generate otel-web-init.js snippet
  const snippet = `// OpenTelemetry Web SDK initialization — generated by codeharness
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

const exporter = new OTLPTraceExporter({
  url: '${endpoint}/v1/traces',
});

const provider = new WebTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation(),
    new XMLHttpRequestInstrumentation(),
  ],
});
`;

  const snippetPath = join(projectDir, 'otel-web-init.js');
  writeFileSync(snippetPath, snippet, 'utf-8');

  const { state, body } = readStateWithBody(projectDir);
  if (state.otlp) {
    state.otlp.web_snippet_path = 'otel-web-init.js';
  }
  writeState(state, projectDir, body);
}

export function configureAgent(projectDir: string, stack: string | null): void {
  if (stack === 'nodejs') {
    try {
      execFileSync('npm', ['install', ...AGENT_OTLP_PACKAGES_NODE], { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
    } catch {
      // Agent packages are supplementary; failure is non-fatal
    }
  } else if (stack === 'python') {
    try {
      execFileSync('pip', ['install', ...AGENT_OTLP_PACKAGES_PYTHON], { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
    } catch {
      // Try pipx fallback
      try {
        for (const pkg of AGENT_OTLP_PACKAGES_PYTHON) {
          execFileSync('pipx', ['install', pkg], { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
        }
      } catch {
        // Agent packages are supplementary; failure is non-fatal
      }
    }
  }

  const { state, body } = readStateWithBody(projectDir);
  if (state.otlp) {
    state.otlp.agent_sdk = 'traceloop';
  }
  writeState(state, projectDir, body);
}

export function ensureServiceNameEnvVar(projectDir: string, serviceName: string): void {
  const envFilePath = join(projectDir, '.env.codeharness');
  // Sanitize service name: replace characters unsafe for env values and URLs
  const sanitized = serviceName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const envLine = `OTEL_SERVICE_NAME=${sanitized}`;

  if (existsSync(envFilePath)) {
    const content = readFileSync(envFilePath, 'utf-8');
    // Split and remove trailing empty lines from the split result
    const lines = content.split('\n').filter((l, i, arr) => i < arr.length - 1 || l.trim() !== '');
    const idx = lines.findIndex(l => l.startsWith('OTEL_SERVICE_NAME='));
    if (idx !== -1) {
      lines[idx] = envLine;
    } else {
      lines.push(envLine);
    }
    writeFileSync(envFilePath, lines.join('\n') + '\n', 'utf-8');
  } else {
    writeFileSync(envFilePath, envLine + '\n', 'utf-8');
  }
}

export function configureOtlpEnvVars(projectDir: string, stack: string | null, opts?: { endpoint?: string; appType?: AppType }): void {
  const projectName = basename(projectDir);

  const { state, body } = readStateWithBody(projectDir);

  state.otlp = {
    enabled: true,
    endpoint: opts?.endpoint ?? 'http://localhost:4318',
    service_name: projectName,
    mode: state.otlp?.mode ?? 'local-shared',
    ...(stack === 'nodejs'
      ? { node_require: NODE_REQUIRE_FLAG }
      : {}),
    ...(stack === 'python'
      ? { python_wrapper: 'opentelemetry-instrument' }
      : {}),
  };

  // Resource attributes (Task 6)
  state.otlp.resource_attributes = 'service.instance.id=$(hostname)-$$';

  writeState(state, projectDir, body);

  // Write OTEL_SERVICE_NAME to .env.codeharness file
  ensureServiceNameEnvVar(projectDir, projectName);
}

export function instrumentProject(
  projectDir: string,
  stack: string | null,
  opts?: { json?: boolean; appType?: AppType },
): OtlpResult {
  const isJson = opts?.json === true;
  const appType = opts?.appType;

  let result: OtlpResult;

  if (stack === 'nodejs') {
    result = installNodeOtlp(projectDir);
    if (result.status === 'configured') {
      const patched = patchNodeStartScript(projectDir);
      result.start_script_patched = patched;
      if (!isJson) {
        ok('OTLP: Node.js packages installed');
        if (patched) {
          ok('OTLP: start script patched with --require flag');
        } else {
          info('OTLP: no start/dev script found or already patched');
        }
      }
    }
  } else if (stack === 'python') {
    result = installPythonOtlp(projectDir);
    if (result.status === 'configured' && !isJson) {
      ok('OTLP: Python packages installed');
      info('OTLP: wrap your command with: opentelemetry-instrument <command>');
    }
  } else {
    return {
      status: 'skipped',
      packages_installed: false,
      start_script_patched: false,
      env_vars_configured: false,
      error: 'Unsupported stack for OTLP instrumentation',
    };
  }

  // Always configure OTLP env vars and state, even when package install fails.
  // The env vars and python_wrapper/node_require fields are useful regardless
  // of whether the packages are installed (the user can install them manually).
  configureOtlpEnvVars(projectDir, stack, { appType });
  result.env_vars_configured = true;
  if (!isJson) {
    ok('OTLP: environment variables configured');
  }

  if (result.status === 'configured') {
    // Dispatch to app-type-specific configuration (Task 7)
    if (appType === 'cli') {
      configureCli(projectDir);
      if (!isJson) {
        ok('OTLP: CLI instrumentation configured (fast flush, always_on sampler)');
      }
    } else if (appType === 'web') {
      configureWeb(projectDir, stack);
      if (!isJson) {
        ok('OTLP: Web instrumentation configured (browser SDK + CORS)');
      }
    } else if (appType === 'agent') {
      configureAgent(projectDir, stack);
      if (!isJson) {
        ok('OTLP: Agent/LLM instrumentation configured (OpenLLMetry/Traceloop)');
      }
    } else if (appType === 'generic' && !isJson) {
      info('App type: generic (manual OTLP setup may be needed)');
    }
  } else if (!isJson && result.error) {
    info(`OTLP: ${result.error}`);
  }

  return result;
}
