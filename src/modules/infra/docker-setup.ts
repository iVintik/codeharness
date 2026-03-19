/**
 * Docker availability check, shared stack management, collector-only mode.
 */

import {
  isDockerAvailable,
  isSharedStackRunning,
  startSharedStack,
  startCollectorOnly,
} from '../../lib/docker.js';
import { getComposeFilePath } from '../../lib/stack-path.js';
import { ok as okOutput, fail as failOutput, info } from '../../lib/output.js';
import { readState, writeState } from '../../lib/state.js';
import type { HarnessState } from '../../lib/state.js';
import type { AppType } from '../../lib/stack-detect.js';
import type { Result } from '../../types/result.js';
import { ok, fail } from '../../types/result.js';
import type { InitDockerResult } from './types.js';
import { DEFAULT_PORTS } from './types.js';

interface DockerCheckOptions {
  readonly observability: boolean;
  readonly otelEndpoint?: string;
  readonly opensearchUrl?: string;
  readonly logsUrl?: string;
  readonly isJson: boolean;
}

export interface DockerCheckResult {
  readonly available: boolean;
  /** If observability is required but Docker is missing, this is a critical failure */
  readonly criticalFailure: boolean;
  readonly dockerResult?: InitDockerResult | null;
}

/**
 * Check Docker availability. Returns critical failure when observability
 * is on and Docker is needed but missing.
 */
export function checkDocker(opts: DockerCheckOptions): Result<DockerCheckResult> {
  // Skip Docker check for remote-direct mode or OpenSearch
  if (opts.otelEndpoint || opts.logsUrl || opts.opensearchUrl) {
    return ok({ available: true, criticalFailure: false });
  }

  if (!isDockerAvailable()) {
    if (opts.observability) {
      // Docker required when observability is ON
      const dockerResult: InitDockerResult = {
        compose_file: '',
        stack_running: false,
        services: [],
        ports: DEFAULT_PORTS,
      };
      return ok({ available: false, criticalFailure: true, dockerResult });
    }
    // Observability OFF — Docker absence is fine
    return ok({ available: false, criticalFailure: false });
  }

  if (!opts.isJson) {
    okOutput('Docker: available');
  }
  return ok({ available: true, criticalFailure: false });
}

interface DockerSetupOptions {
  readonly observability: boolean;
  readonly otelEndpoint?: string;
  readonly opensearchUrl?: string;
  readonly logsUrl?: string;
  readonly metricsUrl?: string;
  readonly tracesUrl?: string;
  readonly isJson: boolean;
  readonly dockerAvailable: boolean;
  readonly appType?: AppType;
  readonly state: HarnessState;
  readonly projectDir: string;
}

export interface DockerSetupResult {
  readonly docker: InitDockerResult | null;
  readonly state: HarnessState;
}

/**
 * Set up Docker stack based on the observability mode:
 * - no-observability: skip Docker entirely
 * - remote-direct: no Docker, direct OTLP export
 * - remote-routed: local OTel Collector only, remote backends
 * - local-shared: full local stack (default)
 */
export function setupDocker(opts: DockerSetupOptions): Result<DockerSetupResult> {
  try {
    let state = { ...opts.state };

    if (!opts.observability) {
      // Observability OFF — skip Docker entirely
      writeState(state, opts.projectDir);
      if (!opts.isJson) {
        info('Observability: disabled, skipping Docker stack');
      }
      return ok({ docker: null, state });
    }

    if (opts.opensearchUrl) {
      return handleOpenSearch(opts, state);
    }

    if (opts.otelEndpoint) {
      return handleRemoteDirect(opts, state);
    }

    if (opts.logsUrl && opts.metricsUrl && opts.tracesUrl) {
      return handleRemoteRouted(opts, state);
    }

    if (opts.dockerAvailable) {
      return handleLocalShared(opts, state);
    }

    // Docker not available — deferred observability
    const docker: InitDockerResult = {
      compose_file: '',
      stack_running: false,
      services: [],
      ports: DEFAULT_PORTS,
    };
    writeState(state, opts.projectDir);
    if (!opts.isJson) {
      info('Observability: deferred (configure Docker or remote endpoint to activate)');
    }
    return ok({ docker, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Docker setup failed: ${message}`);
  }
}

function handleOpenSearch(
  opts: DockerSetupOptions,
  state: HarnessState,
): Result<DockerSetupResult> {
  state = {
    ...state,
    otlp: {
      ...state.otlp!,
      mode: 'remote-direct' as const,
    },
    opensearch: {
      url: opts.opensearchUrl!,
    },
  };
  writeState(state, opts.projectDir);
  if (!opts.isJson) {
    okOutput(`Observability: OpenSearch backend at ${opts.opensearchUrl!}`);
  }
  return ok({ docker: null, state });
}

function handleRemoteDirect(
  opts: DockerSetupOptions,
  state: HarnessState,
): Result<DockerSetupResult> {
  state = {
    ...state,
    otlp: {
      ...state.otlp!,
      endpoint: opts.otelEndpoint!,
      mode: 'remote-direct' as const,
    },
  };
  writeState(state, opts.projectDir);
  if (!opts.isJson) {
    okOutput(`OTLP: configured for remote endpoint ${opts.otelEndpoint!}`);
  }
  return ok({ docker: null, state });
}

function handleRemoteRouted(
  opts: DockerSetupOptions,
  state: HarnessState,
): Result<DockerSetupResult> {
  const collectorResult = startCollectorOnly(opts.logsUrl!, opts.metricsUrl!, opts.tracesUrl!);
  const sharedComposeFile = getComposeFilePath();

  if (collectorResult.started) {
    state = {
      ...state,
      otlp: { ...state.otlp!, mode: 'remote-routed' as const },
      docker: {
        compose_file: sharedComposeFile,
        stack_running: true,
        remote_endpoints: {
          logs_url: opts.logsUrl!,
          metrics_url: opts.metricsUrl!,
          traces_url: opts.tracesUrl!,
        },
        ports: DEFAULT_PORTS,
      },
    };
    const docker: InitDockerResult = {
      compose_file: sharedComposeFile,
      stack_running: true,
      services: collectorResult.services,
      ports: DEFAULT_PORTS,
    };
    writeState(state, opts.projectDir);
    if (!opts.isJson) {
      okOutput('Observability: OTel Collector started (routing to remote backends)');
    }
    return ok({ docker, state });
  }

  if (!opts.isJson) {
    failOutput('OTel Collector: failed to start');
    if (collectorResult.error) {
      info(`Error: ${collectorResult.error}`);
    }
  }
  const docker: InitDockerResult = {
    compose_file: sharedComposeFile,
    stack_running: false,
    services: [],
    ports: DEFAULT_PORTS,
  };
  return ok({ docker, state });
}

function handleLocalShared(
  opts: DockerSetupOptions,
  state: HarnessState,
): Result<DockerSetupResult> {
  const sharedComposeFile = getComposeFilePath();

  if (isSharedStackRunning()) {
    if (!opts.isJson) {
      okOutput('Observability stack: already running (shared)');
      if (opts.appType === 'web') {
        info('Web app detected — verify OTel Collector has CORS enabled');
      }
    }
    const docker: InitDockerResult = {
      compose_file: sharedComposeFile,
      stack_running: true,
      services: [],
      ports: DEFAULT_PORTS,
    };
    state = {
      ...state,
      otlp: { ...state.otlp!, mode: 'local-shared' as const },
      docker: {
        compose_file: sharedComposeFile,
        stack_running: true,
        ports: DEFAULT_PORTS,
      },
    };
    writeState(state, opts.projectDir);
    return ok({ docker, state });
  }

  const startResult = startSharedStack();
  if (startResult.started) {
    if (!opts.isJson) {
      okOutput('Observability stack: started (shared at ~/.codeharness/stack/)');
    }
    const docker: InitDockerResult = {
      compose_file: sharedComposeFile,
      stack_running: true,
      services: startResult.services,
      ports: DEFAULT_PORTS,
    };
    state = {
      ...state,
      otlp: { ...state.otlp!, mode: 'local-shared' as const },
      docker: {
        compose_file: sharedComposeFile,
        stack_running: true,
        ports: DEFAULT_PORTS,
      },
    };
    writeState(state, opts.projectDir);
    return ok({ docker, state });
  }

  if (!opts.isJson) {
    failOutput('Observability stack: failed to start');
    if (startResult.error) {
      info(`Error: ${startResult.error}`);
    }
  }
  const docker: InitDockerResult = {
    compose_file: sharedComposeFile,
    stack_running: false,
    services: [],
    ports: DEFAULT_PORTS,
  };
  return ok({ docker, state });
}
