/**
 * CLI command: `codeharness audit`
 *
 * Checks all compliance dimensions and reports project health.
 * Supports --json for machine-readable output.
 */

import { Command } from 'commander';
import { ok as okOutput, fail as failOutput, jsonOutput } from '../lib/output.js';
import { runPreconditions } from '../lib/onboard-checks.js';
import { runAudit } from '../modules/audit/index.js';
import { formatAuditHuman, formatAuditJson } from '../modules/audit/report.js';

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Check all compliance dimensions and report project health')
    .option('--json', 'Output in machine-readable JSON format')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = opts.json === true || globalOpts.json === true;

      // Precondition: harness must be initialized (AC #7)
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

      // Format output
      if (isJson) {
        jsonOutput(formatAuditJson(result.data));
      } else {
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
