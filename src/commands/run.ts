import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { fail, info } from '../lib/output.js';
import { isDockerAvailable } from '../lib/docker/index.js';
import { cleanupContainers } from '../modules/infra/index.js';
import { readSprintStatusFromState, reconcileState } from '../modules/sprint/index.js';
import { countStories } from '../lib/run-helpers.js';

/** Resolves the plugin directory path (.claude/ in project root). */
export function resolvePluginDir(): string {
  return join(process.cwd(), '.claude');
}

// Re-export helpers that tests import from run.ts
export { countStories } from '../lib/run-helpers.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Execute the autonomous coding loop')
    .option('--max-iterations <n>', 'Maximum loop iterations', '50')
    .option('--timeout <seconds>', 'Total loop timeout in seconds', '43200')
    .option('--iteration-timeout <minutes>', 'Per-iteration timeout in minutes', '30')
    .option('--quiet', 'Suppress terminal output (background mode)', false)
    .option('--calls <n>', 'Max API calls per hour', '100')
    .option('--max-story-retries <n>', 'Max retries per story before flagging', '10')
    .option('--reset', 'Clear retry counters, flagged stories, and circuit breaker before starting', false)
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = !!globalOpts.json;
      const outputOpts = { json: isJson };

      // 1. Resolve plugin directory
      const pluginDir = resolvePluginDir();
      if (!existsSync(pluginDir)) {
        fail('Plugin directory not found — run codeharness init first', outputOpts);
        process.exitCode = 1;
        return;
      }

      // 1b. Reconcile state (best-effort — failures warn but don't abort)
      const reconciliation = reconcileState();
      if (reconciliation.success && reconciliation.data.corrections.length > 0) {
        for (const correction of reconciliation.data.corrections) {
          info(`[INFO] Reconciled: ${correction}`, outputOpts);
        }
      } else if (!reconciliation.success) {
        info(`[WARN] State reconciliation failed: ${reconciliation.error}`, outputOpts);
      }

      // 1c. Docker pre-flight: fail fast if Docker unavailable
      if (!isDockerAvailable()) {
        fail('[FAIL] Docker not available — install Docker or start the daemon', outputOpts);
        process.exitCode = 1;
        return;
      }
      // 1d. Orphan container cleanup (best-effort — failures warn but don't abort)
      const cleanup = cleanupContainers();
      if (cleanup.success && cleanup.data.containersRemoved > 0) {
        info(`[INFO] Cleaned up ${cleanup.data.containersRemoved} orphaned container(s): ${cleanup.data.names.join(', ')}`, outputOpts);
      } else if (!cleanup.success) {
        info(`[WARN] Container cleanup failed: ${cleanup.error}`, outputOpts);
      }
      // 2. Read sprint status for story count (from sprint-state.json)
      const statuses = readSprintStatusFromState();
      const counts = countStories(statuses);

      if (counts.total === 0) {
        fail('No stories found in sprint-state.json — nothing to execute', outputOpts);
        process.exitCode = 1;
        return;
      }

      info(`Starting autonomous execution — ${counts.ready} ready, ${counts.inProgress} in progress, ${counts.verified} verified, ${counts.done}/${counts.total} done`, outputOpts);
      // 3. Parse and validate numeric options
      const maxIterations = parseInt(options.maxIterations, 10);
      const timeout = parseInt(options.timeout, 10);
      const iterationTimeout = parseInt(options.iterationTimeout, 10);
      const calls = parseInt(options.calls, 10);
      const maxStoryRetries = parseInt(options.maxStoryRetries, 10);
      if (isNaN(maxIterations) || isNaN(timeout) || isNaN(iterationTimeout) || isNaN(calls) || isNaN(maxStoryRetries)) {
        fail('Invalid numeric option — --max-iterations, --timeout, --iteration-timeout, --calls, and --max-story-retries must be numbers', outputOpts);
        process.exitCode = 1;
        return;
      }

      // TODO: v2 workflow-engine (Epic 5) — rebuild run command to use workflow engine
      // Ralph prompt generation and driver spawn removed in Story 1.2.
      fail('The run command is temporarily unavailable — Ralph loop removed, workflow engine pending (Epic 5)', outputOpts);
      process.exitCode = 1;
    });
}
