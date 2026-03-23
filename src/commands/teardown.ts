import { Command } from 'commander';
import { existsSync, unlinkSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ok, fail, info, warn, jsonOutput } from '../lib/output.js';
import { readState, getStatePath, StateFileNotFoundError } from '../lib/state.js';
import { getStackDir } from '../lib/stack-path.js';
import { PATCH_TARGETS } from '../lib/bmad.js';
import { removePatch } from '../lib/patch-engine.js';
import { NODE_REQUIRE_FLAG } from '../lib/otlp.js';
import type { HarnessState } from '../lib/state.js';

export interface TeardownResult {
  status: 'ok' | 'fail';
  removed: string[];
  preserved: string[];
  docker: { stopped: boolean; kept: boolean };
  patches_removed: number;
  otlp_cleaned: boolean;
  error?: string;
}

function buildDefaultResult(): TeardownResult {
  return {
    status: 'ok',
    removed: [],
    preserved: [],
    docker: { stopped: false, kept: false },
    patches_removed: 0,
    otlp_cleaned: false,
  };
}

export function registerTeardownCommand(program: Command): void {
  program
    .command('teardown')
    .description('Remove harness from a project')
    .option('--keep-docker', 'Leave Docker stack running and preserve compose files')
    .option('--keep-beads', 'Preserve beads data (this is the default)')
    .action(async (options: { keepDocker?: boolean; keepBeads?: boolean }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;
      const projectDir = process.cwd();

      const result = buildDefaultResult();

      // --- Read state (hard gate) ---
      let state: HarnessState;
      try {
        state = readState(projectDir);
      } catch (err) {
        if (err instanceof StateFileNotFoundError) {
          result.status = 'fail';
          result.error = 'Harness not initialized. Nothing to tear down.';
          if (isJson) {
            jsonOutput(result as unknown as Record<string, unknown>);
          } else {
            fail('Harness not initialized. Nothing to tear down.');
          }
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      // --- Docker teardown (mode-aware) ---
      const otlpMode = state.otlp?.mode ?? 'local-shared';
      const composeFile = state.docker?.compose_file ?? '';
      const stackDir = getStackDir();
      const isSharedStack = composeFile !== '' && composeFile.startsWith(stackDir);
      const isLegacyStack = composeFile !== '' && !isSharedStack;

      if (otlpMode === 'remote-direct') {
        // Remote-direct: no Docker containers to stop
        if (!isJson) {
          info('Docker: none (remote OTLP mode)');
        }
      } else if (otlpMode === 'remote-routed') {
        // Remote-routed: stop collector-only container
        if (!options.keepDocker) {
          try {
            const { stopCollectorOnly } = await import('../lib/docker.js');
            stopCollectorOnly();
            result.docker.stopped = true;
            if (!isJson) {
              ok('OTel Collector: stopped');
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!isJson) {
              warn(`OTel Collector: failed to stop (${message})`);
            }
          }
        } else {
          result.docker.kept = true;
          if (!isJson) {
            info('OTel Collector: kept (--keep-docker)');
          }
        }
      } else if (options.keepDocker) {
        result.docker.kept = true;
        if (!isJson) {
          if (isSharedStack) {
            info('Docker stack: shared (not managed per-project)');
          } else {
            info('Docker stack: kept (--keep-docker)');
          }
        }
      } else if (isSharedStack) {
        // Shared stack: never stop, just inform
        if (!isJson) {
          info('Shared stack: kept running (other projects may use it)');
        }
      } else if (isLegacyStack) {
        // Legacy per-project stack — stop and clean up
        const { isStackRunning, stopStack } = await import('../lib/docker.js');
        let stackRunning = false;
        try {
          stackRunning = isStackRunning(composeFile);
        } catch {
          stackRunning = false;
        }

        if (stackRunning) {
          try {
            stopStack(composeFile);
            result.docker.stopped = true;
            if (!isJson) {
              ok('Docker stack: stopped');
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!isJson) {
              warn(`Docker stack: failed to stop (${message})`);
            }
          }
        } else {
          if (!isJson) {
            info('Docker stack: not running, skipping');
          }
        }

        // Remove per-project docker-compose file
        const composeFilePath = join(projectDir, composeFile);
        if (existsSync(composeFilePath)) {
          unlinkSync(composeFilePath);
          result.removed.push(composeFile);
          if (!isJson) {
            ok(`Removed: ${composeFile}`);
          }
        }

        // Remove per-project otel config
        const otelConfigPath = join(projectDir, 'otel-collector-config.yaml');
        if (existsSync(otelConfigPath)) {
          unlinkSync(otelConfigPath);
          result.removed.push('otel-collector-config.yaml');
          if (!isJson) {
            ok(`Removed: otel-collector-config.yaml`);
          }
        }
      }

      // --- Task 3: Remove BMAD patches ---
      let patchesRemoved = 0;
      for (const [patchName, relativePath] of Object.entries(PATCH_TARGETS)) {
        const filePath = join(projectDir, '_bmad', relativePath);
        if (!existsSync(filePath)) {
          continue;
        }
        try {
          const removed = removePatch(filePath, patchName);
          if (removed) {
            patchesRemoved++;
          }
        } catch {
          // Skip silently on error
        }
      }
      result.patches_removed = patchesRemoved;

      if (!isJson) {
        if (patchesRemoved > 0) {
          ok(`BMAD patches: removed ${patchesRemoved} patches`);
        } else {
          info('BMAD patches: none found');
        }
      }

      // --- Task 4: Remove OTLP instrumentation ---
      if (state.otlp?.enabled && (state.stacks?.includes('nodejs') ?? state.stack === 'nodejs')) {
        const pkgPath = join(projectDir, 'package.json');
        if (existsSync(pkgPath)) {
          try {
            const raw = readFileSync(pkgPath, 'utf-8');
            const pkg = JSON.parse(raw) as Record<string, unknown>;
            const scripts = pkg['scripts'] as Record<string, string> | undefined;

            if (scripts) {
              const keysToRemove: string[] = [];
              for (const [key, value] of Object.entries(scripts)) {
                if (key.endsWith(':instrumented') && value.includes(NODE_REQUIRE_FLAG)) {
                  keysToRemove.push(key);
                }
              }

              if (keysToRemove.length > 0) {
                for (const key of keysToRemove) {
                  delete scripts[key];
                }
                writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
                result.otlp_cleaned = true;
                if (!isJson) {
                  ok('OTLP: removed instrumented scripts from package.json');
                }
              } else {
                if (!isJson) {
                  info('OTLP: no instrumented scripts found');
                }
              }
            } else {
              if (!isJson) {
                info('OTLP: no instrumented scripts found');
              }
            }
          } catch {
            if (!isJson) {
              info('OTLP: no instrumented scripts found');
            }
          }
        } else {
          if (!isJson) {
            info('OTLP: no instrumented scripts found');
          }
        }
      }

      // --- Remove .harness/ cache directory ---
      const harnessDir = join(projectDir, '.harness');
      if (existsSync(harnessDir)) {
        rmSync(harnessDir, { recursive: true, force: true });
        result.removed.push('.harness/');
        if (!isJson) {
          ok('Removed: .harness/');
        }
      }

      // --- Task 5: Remove state file (LAST) ---
      const statePath = getStatePath(projectDir);
      if (existsSync(statePath)) {
        unlinkSync(statePath);
        result.removed.push('.claude/codeharness.local.md');
        if (!isJson) {
          ok('Removed: .claude/codeharness.local.md');
        }
      }

      // --- Task 6: Summary ---
      result.preserved.push('.beads/ (task history)');
      result.preserved.push('_bmad/ (BMAD artifacts, patches removed)');
      result.preserved.push('docs/ (documentation)');

      if (isJson) {
        jsonOutput(result as unknown as Record<string, unknown>);
      } else {
        ok('Harness teardown complete');
        info('Preserved: .beads/ (task history)');
        info('Preserved: _bmad/ (BMAD artifacts, patches removed)');
        info('Preserved: docs/ (documentation)');
      }
    });
}
