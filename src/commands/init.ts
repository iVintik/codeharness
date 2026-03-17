import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ok, fail, info, warn, jsonOutput } from '../lib/output.js';
import { detectStack, detectAppType } from '../lib/stack-detect.js';
import type { AppType } from '../lib/stack-detect.js';
import { readState, writeState, getDefaultState, getStatePath } from '../lib/state.js';
import { generateFile } from '../lib/templates.js';
import { isDockerAvailable, isSharedStackRunning, startSharedStack, startCollectorOnly } from '../lib/docker.js';
import { installAllDependencies, CriticalDependencyError, checkInstalled, DEPENDENCY_REGISTRY } from '../lib/deps.js';
import { instrumentProject, configureOtlpEnvVars } from '../lib/otlp.js';
import { initBeads, isBeadsInitialized, detectBeadsHooks, configureHookCoexistence, BeadsError } from '../lib/beads.js';
import { isBmadInstalled, installBmad, applyAllPatches, detectBmadVersion, detectBmalph, BmadError } from '../lib/bmad.js';
import { getComposeFilePath } from '../lib/stack-path.js';
import { readmeTemplate } from '../templates/readme.js';
import type { HarnessState } from '../lib/state.js';
import type { DependencyResult } from '../lib/deps.js';
import type { OtlpResult } from '../lib/otlp.js';
import type { DockerStartResult } from '../lib/docker.js';
import type { BmadInstallResult } from '../lib/bmad.js';

declare const __PKG_VERSION__: string;
const HARNESS_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.0.0-dev';

interface InitOptions {
  frontend: boolean;
  database: boolean;
  api: boolean;
  observability: boolean;
  otelEndpoint?: string;
  logsUrl?: string;
  metricsUrl?: string;
  tracesUrl?: string;
}

interface InitResult {
  status: 'ok' | 'fail';
  stack: string | null;
  app_type?: AppType;
  enforcement: {
    frontend: boolean;
    database: boolean;
    api: boolean;
  };
  documentation: {
    agents_md: 'created' | 'exists';
    docs_scaffold: 'created' | 'exists';
    readme: 'created' | 'exists';
  };
  dependencies?: DependencyResult[];
  beads?: {
    status: 'initialized' | 'already-initialized' | 'failed';
    hooks_detected: boolean;
    error?: string;
  };
  bmad?: {
    status: 'installed' | 'already-installed' | 'patched' | 'failed';
    version: string | null;
    patches_applied: string[];
    bmalph_detected: boolean;
    error?: string;
  };
  otlp?: OtlpResult;
  docker?: {
    compose_file: string;
    stack_running: boolean;
    services: DockerStartResult['services'];
    ports: { logs: number; metrics: number; traces: number; otel_grpc: number; otel_http: number };
  } | null;
  error?: string;
}

function getProjectName(projectDir: string): string {
  try {
    const pkgPath = join(projectDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name && typeof pkg.name === 'string') {
        return pkg.name;
      }
    }
  } catch {
    // Fall through to basename
  }
  return basename(projectDir);
}

function getStackLabel(stack: string | null): string {
  if (stack === 'nodejs') return 'Node.js (package.json)';
  if (stack === 'python') return 'Python';
  return 'Unknown';
}

function getCoverageTool(stack: string | null): string {
  if (stack === 'python') return 'coverage.py';
  return 'c8';
}

function generateAgentsMdContent(projectDir: string, stack: string | null): string {
  const projectName = basename(projectDir);
  const stackLabel = stack === 'nodejs' ? 'Node.js' : stack === 'python' ? 'Python' : 'Unknown';

  const lines = [
    `# ${projectName}`,
    '',
    '## Stack',
    '',
    `- **Language/Runtime:** ${stackLabel}`,
    '',
    '## Build & Test Commands',
    '',
  ];

  if (stack === 'nodejs') {
    lines.push(
      '```bash',
      'npm install    # Install dependencies',
      'npm run build  # Build the project',
      'npm test       # Run tests',
      '```',
    );
  } else if (stack === 'python') {
    lines.push(
      '```bash',
      'pip install -r requirements.txt  # Install dependencies',
      'python -m pytest                 # Run tests',
      '```',
    );
  } else {
    lines.push('```bash', '# No recognized stack — add build/test commands here', '```');
  }

  lines.push(
    '',
    '## Project Structure',
    '',
    '```',
    `${projectName}/`,
    '├── src/           # Source code',
    '├── tests/         # Test files',
    '├── docs/          # Documentation',
    '└── .claude/       # Codeharness state',
    '```',
    '',
    '## Conventions',
    '',
    '- All changes must pass tests before commit',
    '- Maintain test coverage targets',
    '- Follow existing code style and patterns',
    '',
  );

  return lines.join('\n');
}

function generateDocsIndexContent(): string {
  return [
    '# Project Documentation',
    '',
    '## Planning Artifacts',
    '- [Product Requirements](../_bmad-output/planning-artifacts/prd.md)',
    '- [Architecture](../_bmad-output/planning-artifacts/architecture.md)',
    '- [Epics & Stories](../_bmad-output/planning-artifacts/epics.md)',
    '',
    '## Execution',
    '- [Active Exec Plans](exec-plans/active/)',
    '- [Completed Exec Plans](exec-plans/completed/)',
    '',
    '## Quality',
    '- [Quality Reports](quality/)',
    '- [Generated Reports](generated/)',
    '',
  ].join('\n');
}

const DO_NOT_EDIT_HEADER = '<!-- DO NOT EDIT MANUALLY -->\n';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize the harness in a project')
    .option('--no-frontend', 'Disable frontend enforcement')
    .option('--no-database', 'Disable database enforcement')
    .option('--no-api', 'Disable API enforcement')
    .option('--no-observability', 'Skip OTLP package installation')
    .option('--otel-endpoint <url>', 'Remote OTLP endpoint (skips local Docker stack)')
    .option('--logs-url <url>', 'Remote VictoriaLogs URL')
    .option('--metrics-url <url>', 'Remote VictoriaMetrics URL')
    .option('--traces-url <url>', 'Remote Jaeger/VictoriaTraces URL')
    .action(async (options: InitOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;
      const projectDir = process.cwd();

      const result: InitResult = {
        status: 'ok',
        stack: null,
        enforcement: {
          frontend: options.frontend,
          database: options.database,
          api: options.api,
        },
        documentation: {
          agents_md: 'created',
          docs_scaffold: 'created',
          readme: 'created',
        },
      };

      // --- Idempotent re-run check ---
      const statePath = getStatePath(projectDir);
      if (existsSync(statePath)) {
        try {
          const existingState = readState(projectDir);
          // Legacy migration: if state has observability: false, re-init to upgrade
          const legacyObsDisabled = (existingState.enforcement as Record<string, unknown>).observability === false;
          if (existingState.initialized && !legacyObsDisabled) {
            result.stack = existingState.stack;
            result.enforcement = existingState.enforcement;
            result.documentation.agents_md = 'exists';
            result.documentation.docs_scaffold = 'exists';
            result.documentation.readme = 'exists';

            // Check each dependency individually and report status (AC 7)
            const depResults: DependencyResult[] = [];
            for (const spec of DEPENDENCY_REGISTRY) {
              const check = checkInstalled(spec);
              const depResult: DependencyResult = {
                name: spec.name,
                displayName: spec.displayName,
                status: check.installed ? 'already-installed' : 'failed',
                version: check.version,
              };
              depResults.push(depResult);
              if (!isJson) {
                if (check.installed) {
                  const versionStr = check.version ? ` (v${check.version})` : '';
                  ok(`${spec.displayName}: already installed${versionStr}`);
                } else {
                  fail(`${spec.displayName}: not found`);
                }
              }
            }
            result.dependencies = depResults;

            // --- BMAD patch verification on re-run (AC #12) ---
            if (isBmadInstalled(projectDir)) {
              try {
                const patchResults = applyAllPatches(projectDir);
                const patchNames = patchResults.filter(r => r.applied).map(r => r.patchName);
                const version = detectBmadVersion(projectDir);
                const bmalpHDetection = detectBmalph(projectDir);
                result.bmad = {
                  status: 'already-installed',
                  version,
                  patches_applied: patchNames,
                  bmalph_detected: bmalpHDetection.detected,
                };
                if (!isJson) {
                  info('BMAD: already installed, patches verified');
                  if (bmalpHDetection.detected) {
                    warn('bmalph detected — superseded files noted for cleanup');
                  }
                }
              } catch {
                // BMAD verification is non-critical during re-run
              }
            }

            if (isJson) {
              jsonOutput(result as unknown as Record<string, unknown>);
            } else {
              info('Harness already initialized — verifying configuration');
              ok('Configuration verified');
            }
            return;
          }
          if (legacyObsDisabled && !isJson) {
            info('Observability upgraded from disabled to enabled');
          }
        } catch {
          // State file corrupted or unreadable — proceed with fresh init
        }
      }

      // --- Remote endpoint URL validation ---
      const remoteUrls = [options.otelEndpoint, options.logsUrl, options.metricsUrl, options.tracesUrl].filter(Boolean) as string[];
      for (const url of remoteUrls) {
        if (!/^https?:\/\//i.test(url)) {
          if (isJson) {
            jsonOutput({ status: 'fail', error: `Invalid URL: '${url}' — must start with http:// or https://` });
          } else {
            fail(`Invalid URL: '${url}' — must start with http:// or https://`);
          }
          process.exitCode = 1;
          return;
        }
      }

      // --- Remote endpoint validation ---
      if (options.otelEndpoint && (options.logsUrl || options.metricsUrl || options.tracesUrl)) {
        if (isJson) {
          jsonOutput({ status: 'fail', error: 'Cannot combine --otel-endpoint with --logs-url/--metrics-url/--traces-url' });
        } else {
          fail('Cannot combine --otel-endpoint with --logs-url/--metrics-url/--traces-url');
        }
        process.exitCode = 1;
        return;
      }

      const hasAnyBackendUrl = options.logsUrl || options.metricsUrl || options.tracesUrl;
      if (hasAnyBackendUrl && !(options.logsUrl && options.metricsUrl && options.tracesUrl)) {
        if (isJson) {
          jsonOutput({ status: 'fail', error: 'When using remote backends, all three are required: --logs-url, --metrics-url, --traces-url' });
        } else {
          fail('When using remote backends, all three are required: --logs-url, --metrics-url, --traces-url');
        }
        process.exitCode = 1;
        return;
      }

      // --- Stack detection ---
      const stack = detectStack(projectDir);
      result.stack = stack;

      // --- App type detection (Task 8) ---
      const appType = detectAppType(projectDir, stack);
      result.app_type = appType;

      if (!isJson) {
        if (stack) {
          info(`Stack detected: ${getStackLabel(stack)}`);
        }
        // Note: detectStack() already calls warn() when no stack is detected
        info(`App type: ${appType}`);
      }

      // --- Docker check (skip for remote-direct mode) ---
      let dockerAvailable = true;
      if (!options.otelEndpoint) {
        if (!isDockerAvailable()) {
          dockerAvailable = false;
          if (!isJson) {
            warn('Docker not available — observability will use remote mode');
            info('→ Install Docker: https://docs.docker.com/engine/install/');
            info('→ Or use remote endpoints: codeharness init --otel-endpoint <url>');
          }
        } else {
          if (!isJson) {
            ok('Docker: available');
          }
        }
      }

      // --- Dependency install ---
      try {
        const depResults = installAllDependencies({ json: isJson });
        result.dependencies = depResults;
      } catch (err) {
        if (err instanceof CriticalDependencyError) {
          result.status = 'fail';
          result.error = err.message;
          if (isJson) {
            jsonOutput(result as unknown as Record<string, unknown>);
          } else {
            info(`Critical dependency failed — aborting init`);
          }
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      // --- Beads initialization ---
      try {
        if (isBeadsInitialized(projectDir)) {
          result.beads = { status: 'already-initialized', hooks_detected: false };
          if (!isJson) {
            info('Beads: .beads/ already exists');
          }
        } else {
          initBeads(projectDir);
          result.beads = { status: 'initialized', hooks_detected: false };
          if (!isJson) {
            ok('Beads: initialized (.beads/ created)');
          }
        }

        // Detect beads hooks
        const hookDetection = detectBeadsHooks(projectDir);
        if (result.beads) {
          result.beads.hooks_detected = hookDetection.hasHooks;
        }
        if (hookDetection.hasHooks) {
          configureHookCoexistence(projectDir);
          if (!isJson) {
            info('Beads hooks detected — coexistence configured');
          }
        }
      } catch (err) {
        if (err instanceof BeadsError) {
          result.status = 'fail';
          result.beads = { status: 'failed', hooks_detected: false, error: err.message };
          result.error = err.message;
          if (isJson) {
            jsonOutput(result as unknown as Record<string, unknown>);
          } else {
            fail(`Beads init failed: ${err.message}`);
          }
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      // --- BMAD installation and patching ---
      try {
        const bmadAlreadyInstalled = isBmadInstalled(projectDir);

        if (bmadAlreadyInstalled) {
          const version = detectBmadVersion(projectDir);
          const patchResults = applyAllPatches(projectDir);
          const patchNames = patchResults.filter(r => r.applied).map(r => r.patchName);

          result.bmad = {
            status: 'already-installed',
            version,
            patches_applied: patchNames,
            bmalph_detected: false,
          };

          if (!isJson) {
            info('BMAD: already installed, patches verified');
          }
        } else {
          const installResult = installBmad(projectDir);
          const patchResults = applyAllPatches(projectDir);
          const patchNames = patchResults.filter(r => r.applied).map(r => r.patchName);

          result.bmad = {
            status: installResult.status,
            version: installResult.version,
            patches_applied: patchNames,
            bmalph_detected: false,
          };

          if (!isJson) {
            ok(`BMAD: installed (v${installResult.version ?? 'unknown'}), harness patches applied`);
          }
        }

        // --- bmalph detection ---
        const bmalpHDetection = detectBmalph(projectDir);
        if (bmalpHDetection.detected && result.bmad) {
          result.bmad.bmalph_detected = true;
          if (!isJson) {
            warn('bmalph detected — superseded files noted for cleanup');
          }
        }

      } catch (err) {
        if (err instanceof BmadError) {
          result.bmad = {
            status: 'failed',
            version: null,
            patches_applied: [],
            bmalph_detected: false,
            error: err.message,
          };
          if (!isJson) {
            fail(`BMAD install failed: ${err.message}`);
          }
          // BMAD is NOT critical — continue without patches
        } else {
          throw err;
        }
      }

      // --- State file creation ---
      const state: HarnessState = getDefaultState(stack);
      state.harness_version = HARNESS_VERSION;
      state.initialized = true;
      state.app_type = appType;
      state.enforcement = {
        frontend: options.frontend,
        database: options.database,
        api: options.api,
      };
      state.coverage.tool = getCoverageTool(stack);

      writeState(state, projectDir);

      if (!isJson) {
        ok('State file: .claude/codeharness.local.md created');
      }

      // --- Documentation scaffold ---
      const agentsMdPath = join(projectDir, 'AGENTS.md');
      if (!existsSync(agentsMdPath)) {
        const agentsMdContent = generateAgentsMdContent(projectDir, stack);
        generateFile(agentsMdPath, agentsMdContent);
        result.documentation.agents_md = 'created';
      } else {
        result.documentation.agents_md = 'exists';
      }

      const docsDir = join(projectDir, 'docs');
      if (!existsSync(docsDir)) {
        generateFile(join(docsDir, 'index.md'), generateDocsIndexContent());
        generateFile(join(docsDir, 'exec-plans', 'active', '.gitkeep'), '');
        generateFile(join(docsDir, 'exec-plans', 'completed', '.gitkeep'), '');
        generateFile(join(docsDir, 'quality', '.gitkeep'), DO_NOT_EDIT_HEADER);
        generateFile(join(docsDir, 'generated', '.gitkeep'), DO_NOT_EDIT_HEADER);
        result.documentation.docs_scaffold = 'created';
      } else {
        result.documentation.docs_scaffold = 'exists';
      }

      // --- README.md generation ---
      const readmePath = join(projectDir, 'README.md');
      if (!existsSync(readmePath)) {
        let cliHelpOutput = '';
        try {
          const { execFileSync } = await import('node:child_process');
          cliHelpOutput = execFileSync(process.execPath, [process.argv[1], '--help'], {
            stdio: 'pipe',
            timeout: 10_000,
          }).toString();
        } catch {
          cliHelpOutput = 'Run: codeharness --help';
        }

        const readmeContent = readmeTemplate({
          projectName: getProjectName(projectDir),
          stack,
          cliHelpOutput,
        });
        generateFile(readmePath, readmeContent);
        result.documentation.readme = 'created';
      } else {
        result.documentation.readme = 'exists';
      }

      if (!isJson) {
        if (result.documentation.agents_md === 'created' || result.documentation.docs_scaffold === 'created') {
          ok('Documentation: AGENTS.md + docs/ scaffold created');
        }
        if (result.documentation.readme === 'created') {
          ok('Documentation: README.md created');
        }
      }

      // --- OTLP instrumentation (skip when --no-observability is set) ---
      let otlpResult: OtlpResult;
      if (!options.observability) {
        otlpResult = {
          status: 'skipped',
          packages_installed: false,
          start_script_patched: false,
          env_vars_configured: false,
        };
        if (!isJson) {
          info('OTLP: skipped (--no-observability)');
        }
      } else {
        otlpResult = instrumentProject(projectDir, stack, { json: isJson, appType });
      }
      result.otlp = otlpResult;

      // Sync in-memory state with what configureOtlpEnvVars() wrote to disk.
      // configureOtlpEnvVars() sets otlp.enabled, service_name, etc. on disk,
      // but our in-memory state.otlp is still undefined. Re-read to pick up
      // those fields so subsequent mode-specific spreads don't lose them.
      try {
        const updatedState = readState(projectDir);
        if (updatedState.otlp) {
          state.otlp = updatedState.otlp;
        }
      } catch {
        // Ignore read errors — fall through to defaults below
      }

      // Ensure state.otlp has baseline fields for the mode-specific spread below
      if (!state.otlp) {
        state.otlp = {
          enabled: true,
          endpoint: 'http://localhost:4318',
          service_name: basename(projectDir),
          mode: 'local-shared',
        };
      }

      // --- Docker stack setup (shared / remote-direct / remote-routed) ---
      {
        if (options.otelEndpoint) {
          // Remote-direct mode: no Docker, direct OTLP export
          state.otlp = {
            ...state.otlp!,
            endpoint: options.otelEndpoint,
            mode: 'remote-direct',
          };
          result.docker = null;
          writeState(state, projectDir);
          if (!isJson) {
            ok(`OTLP: configured for remote endpoint ${options.otelEndpoint}`);
          }
        } else if (options.logsUrl && options.metricsUrl && options.tracesUrl) {
          // Remote-routed mode: local OTel Collector only, backends remote
          const collectorResult = startCollectorOnly(options.logsUrl, options.metricsUrl, options.tracesUrl);
          const sharedComposeFile = getComposeFilePath();

          if (collectorResult.started) {
            state.otlp = {
              ...state.otlp!,
              mode: 'remote-routed',
            };
            state.docker = {
              compose_file: sharedComposeFile,
              stack_running: true,
              remote_endpoints: {
                logs_url: options.logsUrl,
                metrics_url: options.metricsUrl,
                traces_url: options.tracesUrl,
              },
              ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
            };
            result.docker = {
              compose_file: sharedComposeFile,
              stack_running: true,
              services: collectorResult.services,
              ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
            };
            writeState(state, projectDir);
            if (!isJson) {
              ok('Observability: OTel Collector started (routing to remote backends)');
            }
          } else {
            if (!isJson) {
              fail('OTel Collector: failed to start');
              if (collectorResult.error) {
                info(`Error: ${collectorResult.error}`);
              }
            }
            result.docker = {
              compose_file: sharedComposeFile,
              stack_running: false,
              services: [],
              ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
            };
          }
        } else if (dockerAvailable) {
          // Local-shared mode (default, Story 9.1)
          const sharedComposeFile = getComposeFilePath();

          if (isSharedStackRunning()) {
            if (!isJson) {
              ok('Observability stack: already running (shared)');
              if (appType === 'web') {
                info('Web app detected — verify OTel Collector has CORS enabled');
              }
            }
            result.docker = {
              compose_file: sharedComposeFile,
              stack_running: true,
              services: [],
              ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
            };

            state.otlp = {
              ...state.otlp!,
              mode: 'local-shared',
            };
            state.docker = {
              compose_file: sharedComposeFile,
              stack_running: true,
              ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
            };
            writeState(state, projectDir);
          } else {
            const startResult = startSharedStack();
            if (startResult.started) {
              if (!isJson) {
                ok(`Observability stack: started (shared at ~/.codeharness/stack/)`);
              }
              result.docker = {
                compose_file: sharedComposeFile,
                stack_running: true,
                services: startResult.services,
                ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
              };

              state.otlp = {
                ...state.otlp!,
                mode: 'local-shared',
              };
              state.docker = {
                compose_file: sharedComposeFile,
                stack_running: true,
                ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
              };
              writeState(state, projectDir);
            } else {
              if (!isJson) {
                fail(`Observability stack: failed to start`);
                if (startResult.error) {
                  info(`Error: ${startResult.error}`);
                }
              }
              result.docker = {
                compose_file: sharedComposeFile,
                stack_running: false,
                services: [],
                ports: { logs: 9428, metrics: 8428, traces: 16686, otel_grpc: 4317, otel_http: 4318 },
              };
            }
          }
        } else {
          // Docker not available — deferred observability
          writeState(state, projectDir);
          if (!isJson) {
            info('Observability: deferred (configure Docker or remote endpoint to activate)');
          }
        }
      }

      // --- Enforcement summary ---
      if (!isJson) {
        const e = state.enforcement;
        const fmt = (v: boolean): string => v ? 'ON' : 'OFF';
        ok(`Enforcement: frontend:${fmt(e.frontend)} database:${fmt(e.database)} api:${fmt(e.api)} observability:ON`);
        info('Harness initialized. Run: codeharness bridge --epics <path>');
      }

      // --- JSON output ---
      if (isJson) {
        jsonOutput(result as unknown as Record<string, unknown>);
      }
    });
}

// Exported for testing
export { generateAgentsMdContent, generateDocsIndexContent, getCoverageTool, getStackLabel, getProjectName };
