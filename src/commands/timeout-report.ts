/**
 * CLI command: codeharness timeout-report
 * Thin wrapper — parses args and delegates to captureTimeoutReport().
 */

import { Command } from 'commander';
import { ok, fail, jsonOutput } from '../lib/output.js';
import { captureTimeoutReport } from '../modules/sprint/index.js';

interface TimeoutReportOptions {
  story: string;
  iteration: string;
  duration: string;
  outputFile: string;
  stateSnapshot: string;
}

export function registerTimeoutReportCommand(program: Command): void {
  program
    .command('timeout-report')
    .description('Capture diagnostic data from a timed-out iteration')
    .requiredOption('--story <key>', 'Story key')
    .requiredOption('--iteration <n>', 'Iteration number')
    .requiredOption('--duration <minutes>', 'Timeout duration in minutes')
    .requiredOption('--output-file <path>', 'Path to iteration output log')
    .requiredOption('--state-snapshot <path>', 'Path to pre-iteration state snapshot')
    .action((options: TimeoutReportOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      const iteration = parseInt(options.iteration, 10);
      const duration = parseInt(options.duration, 10);

      if (isNaN(iteration) || isNaN(duration)) {
        if (isJson) {
          jsonOutput({ status: 'fail', message: 'iteration and duration must be numbers' });
        } else {
          fail('iteration and duration must be numbers');
        }
        process.exitCode = 1;
        return;
      }

      const result = captureTimeoutReport({
        storyKey: options.story,
        iteration,
        durationMinutes: duration,
        outputFile: options.outputFile,
        stateSnapshotPath: options.stateSnapshot,
      });

      if (!result.success) {
        if (isJson) {
          jsonOutput({ status: 'fail', message: result.error });
        } else {
          fail(result.error);
        }
        process.exitCode = 1;
        return;
      }

      if (isJson) {
        jsonOutput({
          status: 'ok',
          reportPath: result.data.filePath,
          storyKey: result.data.capture.storyKey,
          iteration: result.data.capture.iteration,
        });
      } else {
        ok(`Timeout report written: ${result.data.filePath}`);
      }
    });
}
