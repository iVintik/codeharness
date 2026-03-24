/**
 * Status command — thin wrapper that delegates to src/modules/status/.
 * Handles only CLI arg parsing and dispatching; all logic lives in the module.
 */

import { Command } from 'commander';
import {
  handleFullStatus,
  handleDockerCheck,
  handleHealthCheck,
  handleStoryDrillDown,
} from '../modules/status/index.js';

// Re-export public types and utilities for backward compatibility
export {
  buildScopedEndpoints,
  resolveEndpoints,
  DEFAULT_ENDPOINTS,
} from '../modules/status/index.js';
export type { EndpointUrls, ScopedEndpointUrls } from '../modules/status/index.js';

interface StatusOptions {
  checkDocker?: boolean;
  check?: boolean;
  story?: string;
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current harness status and health')
    .option('--check-docker', 'Check Docker stack health')
    .option('--check', 'Run health checks with pass/fail exit code')
    .option('--story <id>', 'Show detailed status for a specific story')
    .action(async (options: StatusOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      if (options.story) {
        handleStoryDrillDown(options.story, isJson);
        return;
      }

      if (options.checkDocker) {
        await handleDockerCheck(isJson);
        return;
      }

      if (options.check) {
        await handleHealthCheck(isJson);
        return;
      }

      handleFullStatus(isJson);
    });
}
