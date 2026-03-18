/**
 * CLI command: codeharness validate-state
 * Thin wrapper — validates sprint-state.json consistency against sprint-status.yaml.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import { ok, fail, jsonOutput } from '../lib/output.js';
import { validateStateConsistency } from '../modules/sprint/index.js';

interface ValidateStateOptions {
  state?: string;
  sprintStatus?: string;
}

export function registerValidateStateCommand(program: Command): void {
  program
    .command('validate-state')
    .description('Validate sprint-state.json consistency against sprint-status.yaml')
    .option('--state <path>', 'Path to sprint-state.json', 'sprint-state.json')
    .option('--sprint-status <path>', 'Path to sprint-status.yaml', 'sprint-status.yaml')
    .action((options: ValidateStateOptions, cmd: Command) => {
      const opts = cmd.optsWithGlobals() as { json?: boolean };
      const isJson = opts.json === true;

      const statePath = resolve(process.cwd(), options.state!);
      const sprintStatusPath = resolve(process.cwd(), options.sprintStatus!);

      const result = validateStateConsistency(statePath, sprintStatusPath);

      if (!result.success) {
        if (isJson) {
          jsonOutput({ status: 'fail', message: result.error });
        } else {
          fail(result.error);
        }
        process.exitCode = 1;
        return;
      }

      const report = result.data;

      if (isJson) {
        jsonOutput({
          status: report.invalidCount === 0 ? 'ok' : 'fail',
          totalStories: report.totalStories,
          validCount: report.validCount,
          invalidCount: report.invalidCount,
          missingKeys: report.missingKeys,
          issues: report.issues,
        });
      } else {
        console.log(`Total stories: ${report.totalStories}`);
        console.log(`Valid: ${report.validCount}`);
        console.log(`Invalid: ${report.invalidCount}`);

        if (report.missingKeys.length > 0) {
          console.log(`Missing keys: ${report.missingKeys.join(', ')}`);
        }

        for (const issue of report.issues) {
          console.log(`  [${issue.storyKey}] ${issue.field}: ${issue.message}`);
        }

        if (report.invalidCount === 0) {
          ok('All stories valid');
        } else {
          fail(`${report.invalidCount} story/stories have issues`);
        }
      }

      process.exitCode = report.invalidCount === 0 ? 0 : 1;
    });
}
