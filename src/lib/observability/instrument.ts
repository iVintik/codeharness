import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, info } from '../output.js';
import type { AppType } from '../stacks/index.js';
import {
  NODE_REQUIRE_FLAG,
  configureOtlpEnvVars,
  configureCli,
  configureWeb,
  configureAgent,
} from './config.js';

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

const RUST_OTLP_PACKAGES = [
  'opentelemetry',
  'opentelemetry-otlp',
  'tracing-opentelemetry',
  'tracing-subscriber',
];

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
    // IGNORE: package.json may not exist or be malformed
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

  if (scripts[instrumentedKey]?.includes(NODE_REQUIRE_FLAG)) {
    return false;
  }
  scripts[instrumentedKey] = `NODE_OPTIONS='${NODE_REQUIRE_FLAG}' ${scripts[targetKey]}`;

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  return true;
}

export function installPythonOtlp(projectDir: string): OtlpResult {
  const installChains: { cmd: string; args: string[] }[][] = [
    [{ cmd: 'pip', args: ['install', ...PYTHON_OTLP_PACKAGES] }],
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
      // IGNORE: install chain failed, try next method
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

export function installRustOtlp(projectDir: string): OtlpResult {
  try {
    execFileSync('cargo', ['add', ...RUST_OTLP_PACKAGES], { cwd: projectDir, stdio: 'pipe', timeout: 300_000 });
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
      error: `Failed to install Rust OTLP packages: ${truncateError(message)}`,
    };
  }
}

export function instrumentProject(
  projectDir: string,
  stack: string | null,
  opts?: { json?: boolean; appType?: AppType },
): OtlpResult {
  const isJson = opts?.json === true;
  const appType = opts?.appType;

  const stackInstallers: Record<string, () => OtlpResult> = {
    nodejs: () => {
      const r = installNodeOtlp(projectDir);
      if (r.status === 'configured') {
        const patched = patchNodeStartScript(projectDir);
        r.start_script_patched = patched;
        if (!isJson) {
          ok('OTLP: Node.js packages installed');
          if (patched) {
            ok('OTLP: start script patched with --require flag');
          } else {
            info('OTLP: no start/dev script found or already patched');
          }
        }
      }
      return r;
    },
    python: () => {
      const r = installPythonOtlp(projectDir);
      if (r.status === 'configured' && !isJson) {
        ok('OTLP: Python packages installed');
        info('OTLP: wrap your command with: opentelemetry-instrument <command>');
      }
      return r;
    },
    rust: () => {
      const r = installRustOtlp(projectDir);
      if (r.status === 'configured' && !isJson) {
        ok('OTLP: Rust packages installed');
      }
      return r;
    },
  };

  if (!stack || !stackInstallers[stack]) {
    return {
      status: 'skipped',
      packages_installed: false,
      start_script_patched: false,
      env_vars_configured: false,
      error: 'Unsupported stack for OTLP instrumentation',
    };
  }

  const result = stackInstallers[stack]();

  configureOtlpEnvVars(projectDir, stack, { appType });
  result.env_vars_configured = true;
  if (!isJson) {
    ok('OTLP: environment variables configured');
  }

  if (result.status === 'configured') {
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
