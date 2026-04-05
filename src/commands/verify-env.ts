import { Command } from 'commander';
import { ok, fail, info, jsonOutput } from '../lib/output.js';
import {
  buildVerifyImage,
  prepareVerifyWorkspace,
  checkVerifyEnv,
  cleanupVerifyEnv,
} from '../modules/verify/index.js';

export function registerVerifyEnvCommand(program: Command): void {
  const verifyEnv = program
    .command('verify-env')
    .description('Manage verification environment (Docker image + clean workspace)');

  // ─── build ──────────────────────────────────────────────────────────
  verifyEnv
    .command('build')
    .description('Build the verification Docker image from project artifacts')
    .action((_opts: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      try {
        const result = buildVerifyImage();

        if (isJson) {
          jsonOutput({
            status: 'ok',
            imageTag: result.imageTag,
            imageSize: result.imageSize,
            buildTimeMs: result.buildTimeMs,
            cached: result.cached,
          });
        } else {
          if (result.cached) {
            ok(`Image ${result.imageTag}: up to date (cached)`);
          } else {
            ok(`Image ${result.imageTag}: built in ${result.buildTimeMs}ms (${result.imageSize})`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isJson) {
          jsonOutput({ status: 'fail', message });
        } else {
          fail(message);
        }
        process.exitCode = 1;
      }
    });

  // ─── prepare ────────────────────────────────────────────────────────
  verifyEnv
    .command('prepare')
    .description('Create a clean temp workspace for verification')
    .requiredOption('--story <key>', 'Story key (e.g., 13-1-verification-dockerfile-generator)')
    .action((opts: { story: string }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      try {
        const workspace = prepareVerifyWorkspace(opts.story);

        if (isJson) {
          jsonOutput({ status: 'ok', workspace, storyKey: opts.story });
        } else {
          ok(`Workspace prepared: ${workspace}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isJson) {
          jsonOutput({ status: 'fail', message });
        } else {
          fail(message);
        }
        process.exitCode = 1;
      }
    });

  // ─── check ──────────────────────────────────────────────────────────
  verifyEnv
    .command('check')
    .description('Validate verification environment (image, CLI, observability)')
    .action((_opts: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      const result = checkVerifyEnv();
      const allPassed = result.imageExists && result.cliWorks && result.otelReachable;

      if (isJson) {
        const jsonResult: Record<string, unknown> = {
          status: allPassed ? 'ok' : 'fail',
          imageExists: result.imageExists,
          cliWorks: result.cliWorks,
          otelReachable: result.otelReachable,
        };
        if (result.imageExists && !result.cliWorks) {
          jsonResult.message = 'CLI does not work inside verification container — build or packaging is broken';
        }
        jsonOutput(jsonResult);
      } else {
        info(`Image exists: ${result.imageExists ? 'yes' : 'no'}`);
        info(`CLI works in container: ${result.cliWorks ? 'yes' : 'no'}`);
        info(`OTEL endpoints reachable: ${result.otelReachable ? 'yes' : 'no'}`);

        if (allPassed) {
          ok('Verification environment: ready');
        } else {
          fail('Verification environment: not ready');
          if (!result.imageExists) {
            info('Run: codeharness verify-env build');
          }
          if (result.imageExists && !result.cliWorks) {
            fail('CLI does not work inside verification container — build or packaging is broken');
          }
          if (!result.otelReachable) {
            info('Run: codeharness stack start');
          }
        }
      }

      if (!allPassed) {
        process.exitCode = 1;
      }
    });

  // ─── cleanup ────────────────────────────────────────────────────────
  verifyEnv
    .command('cleanup')
    .description('Remove temp workspace and stop/remove container for a story')
    .requiredOption('--story <key>', 'Story key (e.g., 13-1-verification-dockerfile-generator)')
    .action((opts: { story: string }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = globalOpts.json === true;

      try {
        cleanupVerifyEnv(opts.story);

        if (isJson) {
          jsonOutput({ status: 'ok', storyKey: opts.story, message: 'Cleanup complete' });
        } else {
          ok(`Cleanup complete for story: ${opts.story}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isJson) {
          jsonOutput({ status: 'fail', message });
        } else {
          fail(message);
        }
        process.exitCode = 1;
      }
    });
}
