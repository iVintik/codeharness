/**
 * CLI command: `codeharness audit`
 *
 * Checks all compliance dimensions and reports project health.
 * Supports --json for machine-readable output.
 * Supports --fix to generate stories for audit gaps (FR15).
 */

import { Command } from 'commander';
import { ok as okOutput, fail as failOutput, info, jsonOutput } from '../lib/output.js';
import { runPreconditions } from '../lib/onboard-checks.js';
import { runAudit, generateFixStories, addFixStoriesToState } from '../modules/audit/index.js';
import { formatAuditHuman, formatAuditJson } from '../modules/audit/report.js';
import type { Result } from '../types/result.js';
import type { FixGenerationResult } from '../modules/audit/index.js';

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Check all compliance dimensions and report project health')
    .option('--json', 'Output in machine-readable JSON format')
    .option('--fix', 'Generate fix stories for every gap found')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = opts.json === true || globalOpts.json === true;
      const isFix = opts.fix === true;

      // Precondition: harness must be initialized (AC #10)
      const preconditions = runPreconditions();
      if (!preconditions.canProceed) {
        if (isJson) {
          jsonOutput({
            status: 'fail',
            message: 'Harness not initialized -- run codeharness init first',
          });
        } else {
          failOutput('Harness not initialized -- run codeharness init first');
        }
        process.exitCode = 1;
        return;
      }

      // Run audit
      const result = await runAudit(process.cwd());

      if (!result.success) {
        if (isJson) {
          jsonOutput({ status: 'fail', message: result.error });
        } else {
          failOutput(result.error);
        }
        process.exitCode = 1;
        return;
      }

      // Handle --fix flag
      let fixStories: Result<FixGenerationResult> | undefined;
      let fixStateError: string | undefined;

      if (isFix) {
        // AC #4: No gaps found
        if (result.data.gapCount === 0) {
          if (!isJson) {
            okOutput('No gaps found -- nothing to fix');
          }
        } else {
          // Generate fix stories
          const fixResult = generateFixStories(result.data);
          fixStories = fixResult;

          if (fixResult.success) {
            // Add to sprint state (AC #2)
            const stateResult = addFixStoriesToState(fixResult.data.stories);
            if (!stateResult.success) {
              fixStateError = stateResult.error;
              if (!isJson) {
                failOutput(`Failed to update sprint state: ${stateResult.error}`);
              }
            }

            if (!isJson) {
              info(`Generated ${fixResult.data.created} fix stories (${fixResult.data.skipped} skipped)`);
            }
          } else if (!isJson) {
            failOutput(fixResult.error);
          }
        }
      }

      // Format output
      if (isJson) {
        const jsonData: Record<string, unknown> = formatAuditJson(result.data) as unknown as Record<string, unknown>;
        // AC #5: Include fixStories in JSON when --fix
        if (isFix) {
          if (result.data.gapCount === 0) {
            jsonData.fixStories = [];
          } else if (fixStories && fixStories.success) {
            jsonData.fixStories = fixStories.data.stories.map(s => ({
              key: s.key,
              filePath: s.filePath,
              gap: s.gap,
              ...(s.skipped ? { skipped: true } : {}),
            }));
            if (fixStateError) {
              jsonData.fixStateError = fixStateError;
            }
          } else if (fixStories && !fixStories.success) {
            jsonData.fixStories = [];
            jsonData.fixError = fixStories.error;
          }
        }
        jsonOutput(jsonData);
      } else if (!isFix || result.data.gapCount > 0) {
        // Print human audit output (skip if --fix with no gaps, already printed OK)
        const lines = formatAuditHuman(result.data);
        for (const line of lines) {
          console.log(line);
        }
      }

      // Set exit code based on overall status
      if (result.data.overallStatus === 'fail') {
        process.exitCode = 1;
      }
    });
}
