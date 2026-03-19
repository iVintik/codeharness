import { Command } from 'commander';
import { updateRunProgress, clearRunProgress } from '../modules/sprint/index.js';
import type { RunProgressUpdate } from '../modules/sprint/index.js';
import { ok as okOut, fail as failOut, jsonOutput } from '../lib/output.js';

export function registerProgressCommand(program: Command): void {
  program
    .command('progress')
    .description('Update live run progress in sprint-state.json')
    .option('--story <key>', 'Set run.currentStory')
    .option('--phase <phase>', 'Set run.currentPhase (create|dev|review|verify)')
    .option('--action <text>', 'Set run.lastAction')
    .option('--ac-progress <progress>', 'Set run.acProgress (e.g., "4/12")')
    .option('--clear', 'Clear all run progress fields to null')
    .action((opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.json as boolean | undefined;

      const validPhases = ['create', 'dev', 'review', 'verify'];

      if (opts.phase !== undefined && !validPhases.includes(opts.phase as string)) {
        failOut(`Invalid phase "${opts.phase}". Must be one of: ${validPhases.join(', ')}`, { json: isJson });
        process.exitCode = 1;
        return;
      }

      if (opts.clear) {
        const result = clearRunProgress();
        if (result.success) {
          if (isJson) {
            jsonOutput({ status: 'ok', cleared: true });
          } else {
            okOut('Run progress cleared');
          }
        } else {
          failOut(result.error, { json: isJson });
          process.exitCode = 1;
        }
        return;
      }

      const update: RunProgressUpdate = {
        ...(opts.story !== undefined && { currentStory: opts.story as string }),
        ...(opts.phase !== undefined && { currentPhase: opts.phase as RunProgressUpdate['currentPhase'] }),
        ...(opts.action !== undefined && { lastAction: opts.action as string }),
        ...(opts.acProgress !== undefined && { acProgress: opts.acProgress as string }),
      };

      if (Object.keys(update).length === 0) {
        failOut('No progress fields specified. Use --story, --phase, --action, --ac-progress, or --clear.', { json: isJson });
        process.exitCode = 1;
        return;
      }

      const result = updateRunProgress(update);
      if (result.success) {
        if (isJson) {
          jsonOutput({ status: 'ok', updated: update });
        } else {
          okOut('Run progress updated');
        }
      } else {
        failOut(result.error, { json: isJson });
        process.exitCode = 1;
      }
    });
}
