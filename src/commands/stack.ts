import { Command } from 'commander';
import { ok, info, warn, fail, jsonOutput } from '../lib/output.js';
import { isSharedStackRunning, startSharedStack, stopSharedStack, getStackHealth, isCollectorRunning, startCollectorOnly, stopCollectorOnly, getCollectorHealth, checkRemoteEndpoint } from '../lib/docker.js';
import { readState } from '../lib/state.js';
import { getComposeFilePath } from '../lib/stack-path.js';

export const STACK_ENDPOINTS = {
  logs: 'http://localhost:9428',
  metrics: 'http://localhost:8428',
  traces: 'http://localhost:16686',
  otel_grpc: 'http://localhost:4317',
  otel_http: 'http://localhost:4318',
};

export function registerStackCommand(program: Command): void {
  const stack = program
    .command('stack')
    .description('Manage the shared observability stack');

  stack
    .command('start')
    .description('Start the shared observability stack')
    .action((_opts: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      // Check remote mode from state
      let mode: string | undefined;
      let remoteEndpoints: { logs_url?: string; metrics_url?: string; traces_url?: string } | undefined;
      try {
        const state = readState();
        mode = state.otlp?.mode;
        remoteEndpoints = state.docker?.remote_endpoints;
      } catch {
        // No state — default to local-shared
      }

      if (mode === 'remote-direct') {
        if (isJson) {
          jsonOutput({ status: 'ok', message: 'No local stack needed — remote OTLP configured' });
        } else {
          info('No local stack needed — remote OTLP configured');
        }
        return;
      }

      if (mode === 'remote-routed') {
        if (isCollectorRunning()) {
          if (isJson) {
            jsonOutput({ status: 'ok', message: 'OTel Collector: already running' });
          } else {
            info('OTel Collector: already running');
          }
          return;
        }

        if (remoteEndpoints?.logs_url && remoteEndpoints?.metrics_url && remoteEndpoints?.traces_url) {
          const result = startCollectorOnly(remoteEndpoints.logs_url, remoteEndpoints.metrics_url, remoteEndpoints.traces_url);
          if (result.started) {
            if (isJson) {
              jsonOutput({ status: 'ok', message: 'OTel Collector: started', services: result.services });
            } else {
              ok('OTel Collector: started');
            }
          } else {
            if (isJson) {
              jsonOutput({ status: 'fail', message: 'OTel Collector: failed to start', error: result.error });
            } else {
              fail('OTel Collector: failed to start');
              if (result.error) {
                info(`Error: ${result.error}`);
              }
            }
            process.exitCode = 1;
          }
        } else {
          if (isJson) {
            jsonOutput({ status: 'fail', message: 'Remote endpoints not configured in state' });
          } else {
            fail('Remote endpoints not configured in state');
          }
          process.exitCode = 1;
        }
        return;
      }

      // local-shared mode (default)
      if (isSharedStackRunning()) {
        if (isJson) {
          jsonOutput({ status: 'ok', message: 'Shared stack: already running', endpoints: STACK_ENDPOINTS });
        } else {
          info('Shared stack: already running');
        }
        return;
      }

      const result = startSharedStack();
      if (result.started) {
        if (isJson) {
          jsonOutput({
            status: 'ok',
            message: 'Shared stack: started',
            services: result.services,
            endpoints: STACK_ENDPOINTS,
          });
        } else {
          ok('Shared stack: started');
          info(`Endpoints: logs=${STACK_ENDPOINTS.logs} metrics=${STACK_ENDPOINTS.metrics} traces=${STACK_ENDPOINTS.traces}`);
        }
      } else {
        if (isJson) {
          jsonOutput({ status: 'fail', message: 'Shared stack: failed to start', error: result.error });
        } else {
          fail(`Shared stack: failed to start`);
          if (result.error) {
            info(`Error: ${result.error}`);
          }
        }
        process.exitCode = 1;
      }
    });

  stack
    .command('stop')
    .description('Stop the shared observability stack')
    .action((_opts: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      // Check remote mode from state
      let mode: string | undefined;
      try {
        const state = readState();
        mode = state.otlp?.mode;
      } catch {
        // No state — default to local-shared
      }

      if (mode === 'remote-direct') {
        if (isJson) {
          jsonOutput({ status: 'ok', message: 'No local stack to stop — remote OTLP configured' });
        } else {
          info('No local stack to stop — remote OTLP configured');
        }
        return;
      }

      if (mode === 'remote-routed') {
        try {
          stopCollectorOnly();
          if (isJson) {
            jsonOutput({ status: 'ok', message: 'OTel Collector: stopped' });
          } else {
            ok('OTel Collector: stopped');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (isJson) {
            jsonOutput({ status: 'fail', message: 'OTel Collector: failed to stop', error: message });
          } else {
            info(`OTel Collector: failed to stop (${message})`);
          }
          process.exitCode = 1;
        }
        return;
      }

      // local-shared mode (default)
      if (!isJson) {
        warn('Stopping shared stack \u2014 all harness projects will lose observability');
      }

      try {
        stopSharedStack();
        if (isJson) {
          jsonOutput({ status: 'ok', message: 'Shared stack: stopped' });
        } else {
          ok('Shared stack: stopped');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isJson) {
          jsonOutput({ status: 'fail', message: 'Shared stack: failed to stop', error: message });
        } else {
          info(`Shared stack: failed to stop (${message})`);
        }
        process.exitCode = 1;
      }
    });

  stack
    .command('status')
    .description('Show shared observability stack status')
    .action(async (_opts: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      // Check remote mode from state
      let mode: string | undefined;
      let remoteEndpoints: { logs_url?: string; metrics_url?: string; traces_url?: string } | undefined;
      let otlpEndpoint: string | undefined;
      try {
        const state = readState();
        mode = state.otlp?.mode;
        remoteEndpoints = state.docker?.remote_endpoints;
        otlpEndpoint = state.otlp?.endpoint;
      } catch {
        // No state — default to local-shared
      }

      if (mode === 'remote-direct') {
        const endpoint = otlpEndpoint ?? 'unknown';
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
          info('No local stack — using remote OTLP endpoint');
          if (result.reachable) {
            ok(`Remote OTLP: reachable (${endpoint})`);
          } else {
            fail(`Remote OTLP: unreachable (${endpoint})`);
          }
        }
        return;
      }

      if (mode === 'remote-routed') {
        const composeFile = getComposeFilePath();
        const health = getCollectorHealth(composeFile);

        if (isJson) {
          jsonOutput({
            status: health.healthy ? 'ok' : 'fail',
            mode: 'remote-routed',
            healthy: health.healthy,
            services: health.services,
            remote_endpoints: remoteEndpoints,
            ...(health.remedy ? { remedy: health.remedy } : {}),
          });
        } else {
          if (health.healthy) {
            ok('OTel Collector: running');
          } else {
            info('OTel Collector: not running');
          }
          for (const svc of health.services) {
            console.log(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
          }
          if (remoteEndpoints) {
            info(`Remote backends: logs=${remoteEndpoints.logs_url} metrics=${remoteEndpoints.metrics_url} traces=${remoteEndpoints.traces_url}`);
          }
        }
        return;
      }

      // local-shared mode (default)
      const composeFile = getComposeFilePath();
      const health = getStackHealth(composeFile, 'codeharness-shared');

      if (isJson) {
        jsonOutput({
          status: health.healthy ? 'ok' : 'fail',
          healthy: health.healthy,
          services: health.services,
          ...(health.healthy ? { endpoints: STACK_ENDPOINTS } : {}),
          ...(health.remedy ? { remedy: health.remedy } : {}),
        });
      } else {
        if (health.healthy) {
          ok('Shared stack: running');
        } else {
          info('Shared stack: not running');
        }
        for (const svc of health.services) {
          console.log(`  ${svc.name}: ${svc.running ? 'running' : 'stopped'}`);
        }
        if (health.healthy) {
          info(`Endpoints: logs=${STACK_ENDPOINTS.logs} metrics=${STACK_ENDPOINTS.metrics} traces=${STACK_ENDPOINTS.traces} otel_grpc=${STACK_ENDPOINTS.otel_grpc} otel_http=${STACK_ENDPOINTS.otel_http}`);
        }
      }
    });
}
