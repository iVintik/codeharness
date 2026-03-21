/**
 * CLI command: `codeharness audit`
 *
 * Checks all compliance dimensions and reports project health.
 * Supports --json for machine-readable output.
 * Supports --fix to generate stories for audit gaps (FR15).
 */

import { Command } from 'commander';
import { executeAudit } from './audit-action.js';

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

      await executeAudit({ isJson, isFix });
    });
}
