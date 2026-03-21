/**
 * CLI command: `codeharness onboard`
 *
 * Alias for `codeharness audit` (FR16).
 * The old onboard command (scan/coverage/audit/epic pipeline) has been
 * replaced by the audit coordinator. This thin alias ensures backward
 * compatibility for existing scripts and documentation.
 */

import { Command } from 'commander';
import { warn } from '../lib/output.js';
import { executeAudit } from './audit-action.js';

export function registerOnboardCommand(program: Command): void {
  const onboard = program
    .command('onboard')
    .description('Alias for audit \u2014 check all compliance dimensions')
    .option('--json', 'Output in machine-readable JSON format')
    .option('--fix', 'Generate fix stories for every gap found')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = opts.json === true || globalOpts.json === true;
      const isFix = opts.fix === true;

      await executeAudit({ isJson, isFix });
    });

  // Deprecated legacy subcommand: `onboard scan`
  onboard
    .command('scan')
    .description('(deprecated) Use "codeharness audit" instead')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const isJson = globalOpts.json === true;

      warn("'onboard scan' is deprecated \u2014 use 'codeharness audit' instead");

      await executeAudit({ isJson, isFix: false });
    });
}
